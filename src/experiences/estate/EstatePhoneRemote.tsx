import { useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { joystickAxes, newRemoteCode, validRoom, type RemoteInput } from './tvRemoteProtocol'
import './tv-remote.css'

// Resolve once: React StrictMode may render twice. Remove the bearer secret from browser history.
const scannedCode = new URLSearchParams(window.location.hash.slice(1)).get('pair') ?? ''
const pairingRoom = validRoom(scannedCode) ? scannedCode : ''
if (pairingRoom) window.history.replaceState(null, '', '/estate-remote')

type PadPoint = { id: number; x: number; y: number }

export function EstatePhoneRemote() {
  const [clientId] = useState(() => newRemoteCode(12))
  const [paired, setPaired] = useState(false)
  const [connection, setConnection] = useState(pairingRoom ? 'Connecting to the TV…' : 'Scan the QR code on the estate TV.')
  const [closed, setClosed] = useState(false)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const nextSequence = useRef(0)
  const motion = useRef({ x: 0, z: 0, dx: 0, dy: 0 })
  const movePointer = useRef<PadPoint | null>(null)
  const lookPointer = useRef<PadPoint | null>(null)
  const pairedRef = useRef(false)

  function send(event: string, payload: Record<string, unknown>) {
    const ch = channelRef.current
    if (ch) void ch.send({ type: 'broadcast', event, payload }).catch(() => setConnection('Connection interrupted'))
  }
  function dispatch(input: RemoteInput) {
    if (!pairedRef.current) return
    send('input', { id: clientId, seq: ++nextSequence.current, input })
  }
  function releaseMovement() {
    motion.current.x = 0
    motion.current.z = 0
    motion.current.dx = 0
    motion.current.dy = 0
  }

  useEffect(() => {
    if (!pairingRoom || closed) return
    const channel = supabase.channel('estate-tv-remote:' + pairingRoom, {
      config: { broadcast: { self: false } },
    })
    channelRef.current = channel
    let alive = true
    const signal = (event: string, payload: Record<string, unknown>) => {
      if (alive) void channel.send({ type: 'broadcast', event, payload }).catch(() => {
        if (alive) setConnection('Network interrupted')
      })
    }
    channel.on('broadcast', { event: 'accepted' }, ({ payload }: { payload: unknown }) => {
      if (payload && typeof payload === 'object' &&
          (payload as { id?: unknown }).id === clientId && alive) {
        pairedRef.current = true
        setPaired(true)
        setConnection('Connected to Ocean Estate')
      }
    })
    channel.on('broadcast', { event: 'busy' }, ({ payload }: { payload: unknown }) => {
      if (payload && typeof payload === 'object' &&
          (payload as { id?: unknown }).id === clientId && alive)
        setConnection('This TV is already connected to another phone.')
    })
    channel.on('broadcast', { event: 'ended' }, ({ payload }: { payload: unknown }) => {
      if (payload && typeof payload === 'object' &&
          (payload as { id?: unknown }).id === clientId && alive) {
        pairedRef.current = false
        setPaired(false)
        releaseMovement()
        setConnection('TV disconnected. Scan a fresh QR code.')
      }
    })
    channel.subscribe(status => {
      if (!alive) return
      if (status === 'SUBSCRIBED') signal('hello', { id: clientId })
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        pairedRef.current = false
        setPaired(false)
        releaseMovement()
        setConnection('Connection interrupted. Reconnect to the TV.')
      }
    })
    const helloTimer = window.setInterval(() => {
      if (!pairedRef.current) signal('hello', { id: clientId })
    }, 900)
    const inputTimer = window.setInterval(() => {
      if (!pairedRef.current || document.hidden) return
      const m = motion.current
      signal('input', {
        id: clientId, seq: ++nextSequence.current,
        input: { kind: 'motion', x: m.x, z: m.z, dx: m.dx, dy: m.dy },
      })
      m.dx = 0; m.dy = 0
    }, 75)
    const hidden = () => {
      if (!document.hidden) return
      releaseMovement()
      if (pairedRef.current) signal('input', {
        id: clientId, seq: ++nextSequence.current, input: { kind: 'stop' },
      })
    }
    const leaving = () => {
      if (pairedRef.current) signal('bye', { id: clientId })
    }
    document.addEventListener('visibilitychange', hidden)
    window.addEventListener('pagehide', leaving)
    return () => {
      alive = false
      window.clearInterval(helloTimer)
      window.clearInterval(inputTimer)
      document.removeEventListener('visibilitychange', hidden)
      window.removeEventListener('pagehide', leaving)
      if (pairedRef.current) void channel.send({
        type: 'broadcast', event: 'bye', payload: { id: clientId },
      }).catch(() => {})
      pairedRef.current = false
      channelRef.current = null
      void supabase.removeChannel(channel)
    }
  }, [clientId, closed])

  function moveDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!paired || movePointer.current) return
    event.currentTarget.setPointerCapture(event.pointerId)
    movePointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
  }
  function moveMove(event: React.PointerEvent<HTMLDivElement>) {
    const p = movePointer.current
    if (!p || p.id !== event.pointerId) return
    const axes = joystickAxes(event.clientX - p.x, event.clientY - p.y)
    motion.current.x = axes.x; motion.current.z = axes.z
  }
  function moveEnd(event: React.PointerEvent<HTMLDivElement>) {
    if (movePointer.current?.id !== event.pointerId) return
    movePointer.current = null
    motion.current.x = 0; motion.current.z = 0
    dispatch({ kind: 'motion', x: 0, z: 0, dx: 0, dy: 0 })
  }
  function lookDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!paired || lookPointer.current) return
    event.currentTarget.setPointerCapture(event.pointerId)
    lookPointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
  }
  function lookMove(event: React.PointerEvent<HTMLDivElement>) {
    const p = lookPointer.current
    if (!p || p.id !== event.pointerId) return
    motion.current.dx += event.clientX - p.x
    motion.current.dy += event.clientY - p.y
    p.x = event.clientX; p.y = event.clientY
  }
  function lookEnd(event: React.PointerEvent<HTMLDivElement>) {
    if (lookPointer.current?.id === event.pointerId) lookPointer.current = null
  }
  function stop() {
    releaseMovement()
    dispatch({ kind: 'stop' })
  }
  function disconnect() {
    stop()
    send('bye', { id: clientId })
    pairedRef.current = false
    setPaired(false)
    setClosed(true)
    setConnection('Disconnected. Close this tab to return to your camera.')
  }

  return <main className="oe-phone-remote" aria-label="Ocean Estate phone controller">
    <header className="oe-phone-top">
      <div><strong>OCEAN ESTATE</strong><small>PHONE CONTROLLER</small></div>
      <span role="status" className={paired ? 'connected' : ''}>{paired ? '● Connected' : '○ Disconnected'}</span>
    </header>
    {!paired ? <section className="oe-phone-wait">
      <h1>{closed ? 'Disconnected' : pairingRoom ? 'Connecting…' : 'Pair your phone'}</h1>
      <p>{connection}</p>
      {!pairingRoom && <p>On the TV, open Estate Menu → Connect Phone, then scan the QR code.</p>}
      {!closed && pairingRoom && <button type="button" onClick={() => send('hello', { id: clientId })}>Try again</button>}
    </section> : <>
      <section className="oe-phone-pads" aria-label="Touch controls">
        <div className="oe-phone-pad" role="group" aria-label="Move joystick" onPointerDown={moveDown}
          onPointerMove={moveMove} onPointerUp={moveEnd} onPointerCancel={moveEnd}
          onLostPointerCapture={moveEnd}>
          <div className="oe-phone-pad-ring"><span>↑</span><span>MOVE</span><span>↓</span></div>
        </div>
        <div className="oe-phone-pad" role="group" aria-label="Look around" onPointerDown={lookDown}
          onPointerMove={lookMove} onPointerUp={lookEnd} onPointerCancel={lookEnd}
          onLostPointerCapture={lookEnd}>
          <div className="oe-phone-pad-ring"><span>↔</span><span>LOOK</span><span>↕</span></div>
        </div>
      </section>
      <nav className="oe-phone-actions" aria-label="Remote actions">
        <button type="button" onClick={() => dispatch({ kind: 'tap' })}>Tap ahead</button>
        <button type="button" onClick={stop}>Stop</button>
        <button type="button" onClick={disconnect}>Disconnect</button>
      </nav>
      <p className="oe-phone-caption">Left: walk and sidestep. Right: look around. The picture stays on your TV.</p>
    </>}
  </main>
}
