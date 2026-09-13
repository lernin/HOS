import { useEffect, useRef, useState } from 'react'
import { createVillage, type VillageInput, type VillageState } from './village/scene'
import { spawn } from './village/world'
import './village/village.css'

export function Village({ onBack }: { onBack: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const world = useRef<Awaited<ReturnType<typeof createVillage>> | null>(null)
  const input = useRef<VillageInput>({ x: 0, z: 0, yaw: -0.48, pitch: -0.035, paused: true, speed: 3.0 })
  const keys = useRef(new Set<string>())
  const stick = useRef<{ id: number; x: number; y: number } | null>(null)
  const look = useRef<{ id: number; x: number; y: number } | null>(null)
  const nub = useRef<HTMLSpanElement>(null)
  const startedRef = useRef(false)
  const [started, setStarted] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('Opening the valley…')
  const [state, setState] = useState<VillageState>({ position: spawn, zone: 'Orchard Lane', fps: 0 })

  const releaseStick = () => {
    input.current.x = 0
    input.current.z = 0
    stick.current = null
    if (nub.current) nub.current.style.transform = ''
  }
  const stopInput = () => { keys.current.clear(); releaseStick(); look.current = null }

  useEffect(() => {
    const controller = new AbortController()
    setReady(false); setError(''); stopInput(); input.current.paused = true
    void createVillage(canvas.current!, input.current, controller.signal, setState, setProgress)
      .then(instance => {
        if (controller.signal.aborted) instance.dispose()
        else { world.current = instance; setReady(true); input.current.paused = !startedRef.current }
      })
      .catch(err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Could not open the village.') })
    return () => { controller.abort(); world.current?.dispose(); world.current = null }
  }, [])

  useEffect(() => { startedRef.current = started }, [started])
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const k = event.key.toLowerCase()
      if (!['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'escape', 'shift'].includes(k)) return
      event.preventDefault()
      if (k === 'escape' && event.type === 'keydown') { stopInput(); input.current.paused = true; setStarted(false); return }
      if (input.current.paused) return
      if (event.type === 'keydown') keys.current.add(k); else keys.current.delete(k)
      input.current.x = Number(keys.current.has('d') || keys.current.has('arrowright')) - Number(keys.current.has('a') || keys.current.has('arrowleft'))
      input.current.z = Number(keys.current.has('s') || keys.current.has('arrowdown')) - Number(keys.current.has('w') || keys.current.has('arrowup'))
      input.current.speed = keys.current.has('shift') ? 4.8 : 3.0
    }
    const blur = () => { stopInput(); input.current.paused = true }
    window.addEventListener('keydown', key); window.addEventListener('keyup', key); window.addEventListener('blur', blur)
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('keyup', key); window.removeEventListener('blur', blur) }
  }, [])

  function begin() { stopInput(); startedRef.current = true; setStarted(true); input.current.paused = false }
  function reset() { stopInput(); world.current?.reset(); input.current.paused = false }
  function back() { stopInput(); input.current.paused = true; onBack() }

  return <main className="vg-root" aria-label="Village experiment">
    <canvas ref={canvas} className="vg-canvas" aria-label="Walkable medieval village" onContextMenu={event => event.preventDefault()} />
    {started && ready && !error && <>
      <div className="vg-look"
        onPointerDown={event => { if (input.current.paused || look.current) return; event.currentTarget.setPointerCapture(event.pointerId); look.current = { id: event.pointerId, x: event.clientX, y: event.clientY } }}
        onPointerMove={event => { const pointer = look.current; if (!pointer || pointer.id !== event.pointerId || input.current.paused) return; input.current.yaw -= (event.clientX - pointer.x) * 0.0032; input.current.pitch = Math.max(-1.0, Math.min(0.9, input.current.pitch - (event.clientY - pointer.y) * 0.0032)); pointer.x = event.clientX; pointer.y = event.clientY }}
        onPointerUp={event => { if (look.current?.id === event.pointerId) look.current = null }} onPointerCancel={() => { look.current = null }} />
      <header className="vg-hud"><button className="vg-pill" onClick={back}>← The Lab</button><div className="vg-title"><span>CREEKSIDE VILLAGE · REBUILD 02</span><strong>{state.zone}</strong></div><button className="vg-pill" onClick={reset}>Reset</button></header>
      <div className="vg-bottom">
        <div className="vg-stick-wrap"><div className="vg-stick"
          onPointerDown={event => { if (input.current.paused || stick.current) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); stick.current = { id: event.pointerId, x: event.clientX, y: event.clientY } }}
          onPointerMove={event => { const start = stick.current; if (!start || start.id !== event.pointerId || input.current.paused) return; const dx = event.clientX - start.x; const dz = event.clientY - start.y; const length = Math.hypot(dx, dz); const distance = Math.min(46, length); const gain = length > 6 ? (distance - 6) / 40 / (length || 1) : 0; input.current.x = dx * gain; input.current.z = dz * gain; if (nub.current) nub.current.style.transform = `translate(${dx / (length || 1) * distance}px,${dz / (length || 1) * distance}px)` }}
          onPointerUp={releaseStick} onPointerCancel={releaseStick}><span className="vg-ring"/><span ref={nub} className="vg-nub"/></div><span>WALK</span></div>
        <div className="vg-note"><strong>Follow the creek.</strong><span>Cross both bridges, explore the village green, and walk through the open cottage.</span></div>
        <div className="vg-look-label"><span>✦</span> DRAG TO LOOK</div>
      </div>
      <div className="vg-fps">{state.fps || '—'} fps</div>
    </>}
    {(!started || !ready || error) && <div className="vg-overlay"><section>
      <div className="vg-kicker">THE LAB · ENVIRONMENT REBUILD 02</div><h1>Creekside<br/>Village</h1><p>{error || progress}</p>
      {!error && <p className="vg-subcopy">Eight hand-assembled Quaternius buildings, two creek crossings, a village green, pond, dense planting and one genuinely enterable cottage.</p>}
      {error ? <button className="vg-primary" onClick={() => location.reload()}>Reload village</button> : ready ? <button className="vg-primary" onClick={begin}>Walk into the village →</button> : <div className="vg-loading">{progress}</div>}
      <button className="vg-backlink" onClick={back}>← Back to The Lab</button>
    </section></div>}
    <div className="vg-portrait"><strong>Turn your phone sideways</strong><span>The village is designed for landscape play.</span></div>
  </main>
}
