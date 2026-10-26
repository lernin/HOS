import type { Margin } from './types'

export type OutboxItem = {
  id: string
  leftId: string
  rightId: string
  decision: 'pick' | 'trash'
  winnerId: string | null
  trashLeft: boolean
  trashRight: boolean
  margin: Margin
  tagIds: string[]
  decidedMs: number | null
  matchId: string | null
  attempts: number
  category?: string
}

const memory = new Map<string, OutboxItem[]>()
const sent = new Map<string, string>()
const cancelled = new Set<string>()
let chain = Promise.resolve()

export function cancelPending(preview: boolean, id: string) {
  cancelled.add(id)
  writeOutbox(preview, readOutbox(preview).filter(item => item.id !== id))
}

function takeCancelled(id: string) {
  const marked = cancelled.has(id)
  if (marked) cancelled.delete(id)
  return marked
}

export function sentMatch(id: string) {
  return sent.get(id) || null
}

export function outboxKey(preview: boolean) {
  return preview ? 'brush-pending-results-preview' : 'brush-pending-results'
}

export function readOutbox(preview: boolean): OutboxItem[] {
  try {
    const raw = localStorage.getItem(outboxKey(preview))
    if (raw) return JSON.parse(raw) as OutboxItem[]
  } catch { /* private mode or a bad snapshot */ }
  return memory.get(outboxKey(preview)) || []
}

export function writeOutbox(preview: boolean, items: OutboxItem[]) {
  memory.set(outboxKey(preview), items)
  try { localStorage.setItem(outboxKey(preview), JSON.stringify(items)) } catch { /* ignore quota */ }
}

export function enqueueResult(preview: boolean, item: OutboxItem) {
  writeOutbox(preview, [...readOutbox(preview), item])
}

export function tagOutbox(preview: boolean, id: string, tagIds: string[]) {
  writeOutbox(preview, readOutbox(preview).map(item => item.id === id ? { ...item, tagIds } : item))
}

function wait(ms: number) {
  return new Promise(resolve => { setTimeout(resolve, ms) })
}

export function flushOutbox(
  preview: boolean,
  send: (item: OutboxItem) => Promise<{ match_id: string | null }>,
  annotate: (matchId: string, tagIds: string[]) => Promise<void>,
  revert?: (matchId: string) => Promise<void>,
) {
  const run = async () => {
    for (let guard = 0; guard < 30; guard += 1) {
      const pending = readOutbox(preview).find(item => !item.matchId && item.attempts < 5)
      const tagged = readOutbox(preview).find(item => item.matchId && item.tagIds.length && item.attempts < 5)
      const item = pending || tagged
      if (!item) return
      try {
        let matchId = item.matchId
        if (!matchId) {
          const result = await send(item)
          matchId = result.match_id
          if (matchId) sent.set(item.id, matchId)
          if (takeCancelled(item.id)) {
            writeOutbox(preview, readOutbox(preview).filter(entry => entry.id !== item.id))
            if (matchId && revert) await revert(matchId)
            continue
          }
          writeOutbox(preview, readOutbox(preview).map(entry => entry.id === item.id ? { ...entry, matchId } : entry))
        }
        const current = readOutbox(preview).find(entry => entry.id === item.id)
        if (current?.tagIds.length && matchId) await annotate(matchId, current.tagIds)
        writeOutbox(preview, readOutbox(preview).filter(entry => entry.id !== item.id))
      } catch {
        const attempts = item.attempts + 1
        writeOutbox(preview, readOutbox(preview).map(entry => entry.id === item.id ? { ...entry, attempts } : entry))
        if (attempts >= 5) return
        await wait(Math.min(30000, 1000 * 3 ** (attempts - 1)))
      }
    }
  }
  chain = chain.then(run, run)
  return chain
}
