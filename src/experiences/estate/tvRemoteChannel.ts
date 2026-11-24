import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { dropPairAfter, sanitizeInput, stopMotionAfter, validClient, validRoom, type RemoteInput } from './tvRemoteProtocol'

type Handlers = {
  onInput: (input: RemoteInput) => void
  onPaired: () => void
  onDisconnected: () => void
  onStatus: (status: string) => void
}

// A QR is a short-lived, high-entropy bearer invitation; no database writes or accounts.
// One phone is accepted at a time. Every packet is checked and motion stops on silence.
export function startEstateTvRemote(room: string, handlers: Handlers): () => void {
  if (!validRoom(room)) throw new Error('Invalid pairing room')
  const channel: RealtimeChannel = supabase.channel('estate-tv-remote:' + room, {
    config: { broadcast: { self: false } },
  })
  let owner: string | null = null
  let lastSeen = 0
  let lastSequence = -1
  let stopped = false
  let disposed = false

  const send = (event: string, payload: Record<string, unknown>) => {
    void channel.send({ type: 'broadcast', event, payload }).catch(() => {
      if (!disposed) handlers.onStatus('Connection interrupted')
    })
  }
  const release = () => {
    if (!owner) return
    const oldOwner = owner
    owner = null
    handlers.onInput({ kind: 'stop' })
    handlers.onDisconnected()
    send('ended', { id: oldOwner })
  }

  channel.on('broadcast', { event: 'hello' }, ({ payload }: { payload: unknown }) => {
    if (disposed || !payload || typeof payload !== 'object') return
    const id = (payload as { id?: unknown }).id
    if (!validClient(id)) return
    if (owner && owner !== id) { send('busy', { id }); return }
    if (!owner) {
      owner = id
      lastSequence = -1
      stopped = false
      handlers.onPaired()
    }
    lastSeen = Date.now()
    send('accepted', { id })
  })

  channel.on('broadcast', { event: 'input' }, ({ payload }: { payload: unknown }) => {
    if (disposed || !owner || !payload || typeof payload !== 'object') return
    const data = payload as { id?: unknown; seq?: unknown; input?: unknown }
    if (data.id !== owner || typeof data.seq !== 'number' ||
        !Number.isSafeInteger(data.seq) || data.seq <= lastSequence) return
    const next = sanitizeInput(data.input)
    if (!next) return
    lastSequence = data.seq
    lastSeen = Date.now()
    stopped = next.kind === 'stop'
    handlers.onInput(next)
  })

  channel.on('broadcast', { event: 'bye' }, ({ payload }: { payload: unknown }) => {
    if (owner && payload && typeof payload === 'object' &&
        (payload as { id?: unknown }).id === owner) release()
  })

  channel.subscribe(status => {
    if (disposed) return
    if (status === 'SUBSCRIBED') handlers.onStatus('Waiting for a phone')
    else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED')
      handlers.onStatus('Connection interrupted')
  })

  const watchdog = window.setInterval(() => {
    if (!owner) return
    const now = Date.now()
    if (dropPairAfter(now, lastSeen)) release()
    else if (!stopped && stopMotionAfter(now, lastSeen)) {
      stopped = true
      handlers.onInput({ kind: 'stop' })
    }
  }, 150)

  return () => {
    disposed = true
    window.clearInterval(watchdog)
    if (owner) {
      handlers.onInput({ kind: 'stop' })
      void channel.send({ type: 'broadcast', event: 'ended', payload: { id: owner } }).catch(() => {})
    }
    void supabase.removeChannel(channel)
  }
}
