import { groupKeys, type GroupSource } from './names.ts'

export const QUALIFY_TARGET = 4
export const QUEUE_DEPTH = 5
export const FINALS_SIZE = 16
export const HASH_DISTANCE = 8

export type Pairable = GroupSource & {
  id: string
  elo: number
  games: number
  perceptual_hash?: string | null
  trashed?: boolean
  archived?: boolean
}

export type Slot = { leftId: string, rightId: string }

export function pairKey(leftId: string, rightId: string) {
  return [leftId, rightId].sort().join(':')
}

export function hashDistance(left: string, right: string) {
  if (!/^[0-9a-f]{16}$/.test(left) || !/^[0-9a-f]{16}$/.test(right)) return 64
  let bits = 0
  for (let index = 0; index < 16; index += 1) {
    let mixed = Number.parseInt(left[index], 16) ^ Number.parseInt(right[index], 16)
    while (mixed) {
      bits += mixed & 1
      mixed >>= 1
    }
  }
  return bits
}

export function averageHashFromPixels(data: Uint8ClampedArray) {
  const grays: number[] = []
  const cells = Math.min(64, Math.floor(data.length / 4))
  for (let index = 0; index < cells; index += 1) {
    const offset = index * 4
    grays.push(0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2])
  }
  while (grays.length < 64) grays.push(0)
  const average = grays.reduce((sum, value) => sum + value, 0) / 64
  let hex = ''
  for (let index = 0; index < 64; index += 4) {
    const nibble = (grays[index] >= average ? 8 : 0)
      + (grays[index + 1] >= average ? 4 : 0)
      + (grays[index + 2] >= average ? 2 : 0)
      + (grays[index + 3] >= average ? 1 : 0)
    hex += nibble.toString(16)
  }
  return hex
}

export function hashImage(image: CanvasImageSource) {
  const canvas = document.createElement('canvas')
  canvas.width = 8
  canvas.height = 8
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return Promise.resolve('')
  context.drawImage(image, 0, 0, 8, 8)
  return Promise.resolve(averageHashFromPixels(context.getImageData(0, 0, 8, 8).data))
}

export function sameGroup(left: Pairable, right: Pairable) {
  const keys = new Set(groupKeys(left))
  if (groupKeys(right).some(key => keys.has(key))) return true
  if (left.perceptual_hash && right.perceptual_hash && hashDistance(left.perceptual_hash, right.perceptual_hash) <= HASH_DISTANCE) return true
  return false
}

function active(pool: Pairable[]) {
  return pool.filter(image => !image.trashed && !image.archived)
}

export function nextQualifyingPair(pool: Pairable[], options: { avoidIds?: string[], recentKeys?: string[], rng?: () => number } = {}) {
  const rng = options.rng || Math.random
  const avoidIds = options.avoidIds || []
  const recentKeys = new Set(options.recentKeys || [])
  const images = active(pool)
  if (images.length < 2) return null
  const minGames = Math.min(...images.map(image => image.games))
  const fresh = images.filter(image => image.games === minGames)
  let anchorPool = rng() < 0.7 ? fresh : images
  const unseen = anchorPool.filter(image => !avoidIds.includes(image.id))
  if (unseen.length) anchorPool = unseen
  else {
    const anyUnseen = images.filter(image => !avoidIds.includes(image.id))
    if (anyUnseen.length) anchorPool = anyUnseen
  }
  const anchor = anchorPool[Math.floor(rng() * anchorPool.length)]
  const ranked = images
    .filter(image => image.id !== anchor.id)
    .map(image => {
      const key = pairKey(anchor.id, image.id)
      const keys = new Set(groupKeys(anchor))
      const seriesClash = groupKeys(image).some(item => keys.has(item))
      const lookalike = Boolean(anchor.perceptual_hash && image.perceptual_hash && hashDistance(anchor.perceptual_hash, image.perceptual_hash) <= HASH_DISTANCE)
      const score = (seriesClash ? 10000 : 0)
        + (lookalike ? 10000 : 0)
        + (avoidIds.includes(image.id) ? 3000 : 0)
        + (recentKeys.has(key) ? 1500 : 0)
        + image.games * 20
        + Math.abs(image.elo - anchor.elo) * 0.15
        + rng() * 80
      return { image, score }
    })
  const different = ranked.filter(item => item.score < 10000)
  const bandSource = different.length ? different : ranked
  bandSource.sort((a, b) => a.score - b.score)
  const band = bandSource.filter(item => item.score <= bandSource[0].score + 80)
  const opponent = band[Math.floor(rng() * band.length)].image
  return { left: anchor, right: opponent }
}

export function extendQueue(pool: Pairable[], queue: Slot[], recentKeys: string[], depth = QUEUE_DEPTH, rng: () => number = Math.random) {
  const shadow = pool.map(image => ({ ...image }))
  const next = queue.filter(slot => {
    const left = shadow.find(image => image.id === slot.leftId)
    const right = shadow.find(image => image.id === slot.rightId)
    return left && right && !left.trashed && !right.trashed && !left.archived && !right.archived
  })
  const keys = [...recentKeys]
  for (const slot of next) {
    keys.push(pairKey(slot.leftId, slot.rightId))
    const left = shadow.find(image => image.id === slot.leftId)
    const right = shadow.find(image => image.id === slot.rightId)
    if (left) left.games += 1
    if (right) right.games += 1
  }
  while (next.length < depth) {
    const avoidIds = next.length ? [next[next.length - 1].leftId, next[next.length - 1].rightId] : []
    const pair = nextQualifyingPair(shadow, { avoidIds, recentKeys: keys, rng })
    if (!pair) break
    const key = pairKey(pair.left.id, pair.right.id)
    if (next.length && pairKey(next[next.length - 1].leftId, next[next.length - 1].rightId) === key) break
    const leftId = rng() < 0.5 ? pair.left.id : pair.right.id
    const rightId = leftId === pair.left.id ? pair.right.id : pair.left.id
    next.push({ leftId, rightId })
    keys.push(key)
    pair.left.games += 1
    pair.right.games += 1
  }
  return next
}

export function qualifyingProgress(pool: Pairable[]) {
  const images = active(pool)
  const done = images.filter(image => image.games >= QUALIFY_TARGET).length
  const total = images.length
  return {
    done,
    total,
    percent: total ? Math.round((100 * done) / total) : 0,
    ready: total >= 2 && done === total,
  }
}

export function finalsFieldSize(count: number) {
  if (count < 2) return 0
  let size = 2
  while (size * 2 <= Math.min(FINALS_SIZE, count)) size *= 2
  return size
}

export function seedOrder(size: number): number[] {
  if (size <= 2) return [0, 1].slice(0, size)
  const half = seedOrder(size / 2)
  const order: number[] = []
  for (const seed of half) order.push(seed, size - 1 - seed)
  return order
}

export type RoundMatch = { leftId: string, rightId: string, winnerId: string | null }

export function seedBracket(rankedIds: string[]): RoundMatch[] {
  const size = finalsFieldSize(rankedIds.length)
  if (!size) return []
  const seeds = rankedIds.slice(0, size)
  const order = seedOrder(size)
  const round: RoundMatch[] = []
  for (let index = 0; index < order.length; index += 2) {
    round.push({ leftId: seeds[order[index]], rightId: seeds[order[index + 1]], winnerId: null })
  }
  return round
}

export function advanceBracket(rounds: RoundMatch[][], winnerId: string | null) {
  if (!winnerId) return { rounds, championId: null as string | null }
  const next = rounds.map(round => round.map(match => ({ ...match })))
  const round = next[next.length - 1] || []
  const index = round.findIndex(match => !match.winnerId && (match.leftId === winnerId || match.rightId === winnerId))
  if (index < 0) return { rounds: next, championId: null }
  round[index] = { ...round[index], winnerId }
  if (round.some(match => !match.winnerId)) return { rounds: next, championId: null }
  const winners = round.map(match => match.winnerId).filter((id): id is string => Boolean(id))
  if (winners.length <= 1) return { rounds: next, championId: winners[0] || null }
  const pairs: RoundMatch[] = []
  for (let index = 0; index < winners.length; index += 2) {
    pairs.push({ leftId: winners[index], rightId: winners[index + 1], winnerId: null })
  }
  next.push(pairs)
  return { rounds: next, championId: null }
}
