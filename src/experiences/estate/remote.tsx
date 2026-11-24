import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import './remote.css'

// A separate broadcast topic with a 144-bit, per-session bearer code. No database writes.
const channelName = (room: string) => 'estate-remote:' + room
const validRoom = (room: string) => /^[a-f0-9]{36}$/.test(room)
const secret = (n = 18) => Array.from(crypto.getRandomValues(new Uint8Array(n)), v => v.toString(16).padStart(2, '0')).join('')
const validId = (id: unknown): id is string => typeof id === 'string' && /^[a-f0-9]{32}$/.test(id)
const finite = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= max
const axis = (v: number) => Math.abs(v) < .09 ? 0 : Math.max(-1, Math.min(1, v))
type Action = 'start' | 'menu' | 'select' | 'back'
export type EstateRemoteInput =
  | { kind: 'move'; x: number; z: number }
  | { kind: 'look'; dx: number; dy: number }
  | { kind: 'action'; action: Action }

type Packet = { id?: unknown; seq?: unknown; kind?: unknown; x?: unknown; z?: unknown; dx?: unknown; dy?: unknown; action?: unknown }
function parsePacket(p: Packet): EstateRemoteInput | null {
  if (p.kind === 'move' && finite(p.x, 1) && finite(p.z, 1)) return { kind: 'move', x: axis(p.x), z: axis(p.z) }
  if (p.kind === 'look' && finite(p.dx, 80) && finite(p.dy, 80)) return { kind: 'look', dx: p.dx, dy: p.dy }
  if (p.kind === 'action' && ['start', 'menu', 'select', 'back'].includes(String(p.action))) return { kind: 'action', action: p.action as Action }
  return null
}

export function useEstateTvRemote(enabled: boolean, onInput: (packet: EstateRemoteInput) => void) {
  const [room, setRoom] = useState(() => secret())
  const [status, setStatus] = useState('Open Connect Phone to pair')
  const [paired, setPaired] = useState(false)
  const callback = useRef(onInput)
  callback.current = onInput
  useEffect(() => {
    if (!enabled) return
    let active = true
    const ch = supabase.channel(channelName(room), { config: { broadcast: { self: false } } })
    let peer: string | null = null
    let lastInput = 0
    let lastSeq = -1
    let moving = false
    const emit = (event: string, payload: object) => { void ch.send({ type: 'broadcast', event, payload }).catch(() => {}) }
    const halt = () => { moving = false; callback.current({ kind: 'move', x: 0, z: 0 }) }
    ch.on('broadcast', { event: 'join' }, ({ payload }: { payload: Packet }) => {
      if (!active || !validId(payload?.id)) return
      if (peer && peer !== payload.id) { emit('busy', { id: payload.id }); return }
      peer = payload.id
      lastInput = Date.now()
      lastSeq = -1
      setPaired(true)
      setStatus('Phone connected')
      emit('accept', { id: peer })
    })
    ch.on('broadcast', { event: 'input' }, ({ payload }: { payload: Packet }) => {
      if (!active || !peer || payload?.id !== peer || !(typeof payload.seq === 'number' && Number.isSafeInteger(payload.seq)) || (payload.seq as number) <= lastSeq) return
      const parsed = parsePacket(payload)
      if (!parsed) return
      lastSeq = payload.seq as number
      lastInput = Date.now()
      if (parsed.kind === 'move') moving = parsed.x !== 0 || parsed.z !== 0
      callback.current(parsed)
    })
    ch.on('broadcast', { event: 'leave' }, ({ payload }: { payload: Packet }) => {
      if (payload?.id !== peer) return
      halt()
      peer = null
      setPaired(false)
      setStatus('Waiting for a phone')
    })
    ch.subscribe(s => {
      if (!active) return
      if (s === 'SUBSCRIBED') { setStatus('Waiting for a phone'); emit('ready', {}) }
      if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') {
        halt(); peer = null; setPaired(false); setStatus('Connection unavailable — retry pairing')
      }
    })
    const timer = window.setInterval(() => {
      if (!active) return
      if (peer) {
        const elapsed = Date.now() - lastInput
        if (elapsed > 450 && moving) halt()
        if (elapsed > 3500) {
          halt(); peer = null; setPaired(false); setStatus('Phone disconnected — scan again')
        } else emit('alive', { id: peer })
      }
    }, 250)
    return () => {
      active = false
      halt()
      if (peer) emit('closed', { id: peer })
      window.clearInterval(timer)
      void supabase.removeChannel(ch)
    }
  }, [enabled, room])
  return { room, status, paired, rotate: () => setRoom(secret()) }
}

declare global {
  interface Window {
    QRCode?: new (el: HTMLElement, options: { text: string; width: number; height: number; colorDark: string; colorLight: string }) => unknown
  }
}
export function EstateRemoteQR({ value }: { value: string }) {
  const holder = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    const draw = () => {
      if (!alive || !holder.current || !window.QRCode) return
      holder.current.replaceChildren()
      new window.QRCode(holder.current, { text: value, width: 190, height: 190, colorDark: '#14231e', colorLight: '#ffffff' })
      setError('')
    }
    if (window.QRCode) { draw(); return () => { alive = false } }
    const script = document.createElement('script')
    script.src = '/estate-remote/qrcode.min.js'
    script.async = true
    script.onload = draw
    script.onerror = () => { if (alive) setError('QR unavailable — use the link below') }
    document.head.appendChild(script)
    return () => { alive = false; script.onload = null; script.onerror = null }
  }, [value])
  return <div className="oe-remote-qr"><div ref={holder} />{error && <small role="status">{error}</small>}</div>
}

// The phone runs a light remote-only page. It never mounts the Three.js estate.
export function EstatePhoneRemote() {
  const [room] = useState(() => location.hash.slice(1))
  const [clientId] = useState(() => secret(16))
  const [status, setStatus] = useState('Connecting to the TV…')
  const [paired, setPaired] = useState(false)
  const pairedRef = useRef(false)
  const channel = useRef<RealtimeChannel | null>(null)
  const seq = useRef(0)
  const lastTv = useRef(0)
  const move = useRef({ x: 0, z: 0 })
  const moveTouch = useRef<{ id: number; x: number; y: number } | null>(null)
  const lookTouch = useRef<{ id: number; x: number; y: number } | null>(null)
  const lastLook = useRef(0)
  const send = (event: string, payload: object) => {
    if (!channel.current) return
    void channel.current.send({ type: 'broadcast', event, payload }).catch(() => {
      pairedRef.current = false; setPaired(false); setStatus('Connection interrupted')
    })
  }
  const command = (packet: EstateRemoteInput) => {
    if (pairedRef.current && document.visibilityState === 'visible') send('input', { id: clientId, seq: ++seq.current, ...packet })
  }
  useEffect(() => {
    if (!validRoom(room)) { setStatus('Invalid pairing link. Scan the TV QR code again.'); return }
    let active = true
    const ch = supabase.channel(channelName(room), { config: { broadcast: { self: false } } })
    channel.current = ch
    const emit = (event: string, payload: object) => { void ch.send({ type: 'broadcast', event, payload }).catch(() => {}) }
    const join = () => emit('join', { id: clientId })
    const disconnected = (message: string) => {
      move.current = { x: 0, z: 0 }
      pairedRef.current = false
      setPaired(false); setStatus(message)
    }
    ch.on('broadcast', { event: 'ready' }, join)
    ch.on('broadcast', { event: 'accept' }, ({ payload }: { payload: Packet }) => {
      if (payload?.id !== clientId || !active) return
      pairedRef.current = true
      lastTv.current = Date.now()
      setPaired(true); setStatus('Connected to Ocean Estate')
    })
    ch.on('broadcast', { event: 'busy' }, ({ payload }: { payload: Packet }) => {
      if (payload?.id === clientId) setStatus('Another phone controls this TV')
    })
    ch.on('broadcast', { event: 'closed' }, ({ payload }: { payload: Packet }) => {
      if (payload?.id === clientId) disconnected('TV ended this pairing. Scan the new code.')
    })
    ch.on('broadcast', { event: 'alive' }, ({ payload }: { payload: Packet }) => {
      if (payload?.id === clientId) lastTv.current = Date.now()
    })
    ch.subscribe(s => {
      if (!active) return
      if (s === 'SUBSCRIBED') { setStatus('Waiting for Ocean Estate…'); join() }
      if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') disconnected('Connection lost — check internet')
    })
    const tick = window.setInterval(() => {
      if (!active || document.hidden) return
      if (!pairedRef.current) join()
      else if (Date.now() - lastTv.current > 4000) disconnected('TV connection lost — reconnecting')
      else emit('input', { id: clientId, seq: ++seq.current, kind: 'move', ...move.current })
    }, 140)
    const visibility = () => {
      if (!document.hidden) return
      move.current = { x: 0, z: 0 }
      emit('input', { id: clientId, seq: ++seq.current, kind: 'move', x: 0, z: 0 })
      emit('leave', { id: clientId })
      disconnected('Remote paused')
    }
    document.addEventListener('visibilitychange', visibility)
    return () => {
      active = false; window.clearInterval(tick)
      document.removeEventListener('visibilitychange', visibility)
      emit('leave', { id: clientId })
      channel.current = null
      void supabase.removeChannel(ch)
    }
  }, [room, clientId])
  const beginPad = (e: ReactPointerEvent<HTMLDivElement>, side: 'move' | 'look') => {
    if (!paired) return
    e.currentTarget.setPointerCapture(e.pointerId)
    if (side === 'move') moveTouch.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
    else lookTouch.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
  }
  const movePad = (e: ReactPointerEvent<HTMLDivElement>, side: 'move' | 'look') => {
    const t = side === 'move' ? moveTouch.current : lookTouch.current
    if (!t || t.id !== e.pointerId) return
    if (side === 'move') {
      move.current = { x: axis((e.clientX - t.x) / 58), z: axis((e.clientY - t.y) / 58) }
      command({ kind: 'move', ...move.current })
    } else {
      const dx = e.clientX - t.x, dy = e.clientY - t.y
      t.x = e.clientX; t.y = e.clientY
      if (performance.now() - lastLook.current > 25) {
        lastLook.current = performance.now()
        command({ kind: 'look', dx: Math.max(-80, Math.min(80, dx)), dy: Math.max(-80, Math.min(80, dy)) })
      }
    }
  }
  const endPad = (e: ReactPointerEvent<HTMLDivElement>, side: 'move' | 'look') => {
    const t = side === 'move' ? moveTouch.current : lookTouch.current
    if (!t || t.id !== e.pointerId) return
    if (side === 'move') {
      moveTouch.current = null; move.current = { x: 0, z: 0 }
      command({ kind: 'move', x: 0, z: 0 })
    } else lookTouch.current = null
  }
  return <main className="oe-phone" aria-label="Ocean Estate phone remote">
    <header className="oe-phone-header"><span>OCEAN ESTATE · REMOTE</span><strong className={paired ? 'connected' : ''} role="status">{paired ? '● Connected' : '○ ' + status}</strong></header>
    <div className="oe-phone-pads">
      <div className="oe-phone-pad" aria-label="Drag to walk" onPointerDown={e => beginPad(e, 'move')} onPointerMove={e => movePad(e, 'move')} onPointerUp={e => endPad(e, 'move')} onPointerCancel={e => endPad(e, 'move')}><span>MOVE</span><small>Drag to walk</small><i>✦</i></div>
      <div className="oe-phone-pad" aria-label="Drag to look around" onPointerDown={e => beginPad(e, 'look')} onPointerMove={e => movePad(e, 'look')} onPointerUp={e => endPad(e, 'look')} onPointerCancel={e => endPad(e, 'look')}><span>LOOK</span><small>Drag to turn</small><i>✦</i></div>
    </div>
    <nav className="oe-phone-actions" aria-label="TV actions">
      <button type="button" disabled={!paired} onClick={() => command({ kind: 'action', action: 'back' })}>Back</button>
      <button type="button" disabled={!paired} onClick={() => command({ kind: 'action', action: 'select' })}>Select</button>
      <button type="button" disabled={!paired} onClick={() => command({ kind: 'action', action: 'start' })}>Start</button>
      <button type="button" disabled={!paired} onClick={() => command({ kind: 'action', action: 'menu' })}>Menu</button>
    </nav>
    <p className="oe-phone-note">{paired ? 'Look at the TV. The phone only controls movement and actions.' : 'Open Ocean Estate on the TV, choose Menu → Connect Phone, and scan the QR code.'}</p>
  </main>
}
