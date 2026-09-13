import { useEffect, useRef, useState } from 'react'
import { createVillage, type VillageInput, type VillageState } from './village/scene'
import { spawn } from './village/world'
import './village/village.css'

type MoveMode='explore'|'walk'

export function Village({ onBack }: { onBack: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const world = useRef<Awaited<ReturnType<typeof createVillage>> | null>(null)
  const input = useRef<VillageInput>({ x: 0, z: 0, yaw: -0.48, pitch: -0.035, paused: true, speed: 2.8, lookedAt: 0, fast: false })
  const keys = useRef(new Set<string>())
  const stick = useRef<{ id: number; x: number; y: number } | null>(null)
  const pointer = useRef<{ id:number; x:number; y:number; startX:number; startY:number; dragged:boolean; walking:boolean } | null>(null)
  const nub = useRef<HTMLSpanElement>(null)
  const startedRef = useRef(false)
  const [started, setStarted] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('Opening the valley…')
  const [mode, setMode] = useState<MoveMode>('explore')
  const [notice, setNotice] = useState('')
  const [state, setState] = useState<VillageState>({ position: spawn, zone: 'Orchard Lane', fps: 0, moving: false, destination: '' })

  const releaseStick = () => {
    input.current.x = 0
    input.current.z = 0
    input.current.fast = false
    stick.current = null
    if (nub.current) nub.current.style.transform = ''
  }
  const stopInput = () => {
    keys.current.clear()
    releaseStick()
    pointer.current = null
  }

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
  useEffect(() => { if(!notice)return;const timer=window.setTimeout(()=>setNotice(''),1800);return()=>window.clearTimeout(timer) }, [notice])
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const k = event.key.toLowerCase()
      if (!['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'escape', 'shift'].includes(k)) return
      event.preventDefault()
      if (k === 'escape' && event.type === 'keydown') { world.current?.stop(); stopInput(); input.current.paused = true; setStarted(false); return }
      if (input.current.paused) return
      if (event.type === 'keydown') keys.current.add(k); else keys.current.delete(k)
      input.current.x = Number(keys.current.has('d') || keys.current.has('arrowright')) - Number(keys.current.has('a') || keys.current.has('arrowleft'))
      input.current.z = Number(keys.current.has('s') || keys.current.has('arrowdown')) - Number(keys.current.has('w') || keys.current.has('arrowup'))
      input.current.fast = keys.current.has('shift')
      if(Math.hypot(input.current.x,input.current.z)>.01)world.current?.stop()
    }
    const blur = () => { world.current?.stop(); stopInput(); input.current.paused = true }
    window.addEventListener('keydown', key); window.addEventListener('keyup', key); window.addEventListener('blur', blur)
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('keyup', key); window.removeEventListener('blur', blur) }
  }, [])

  function begin() { stopInput(); startedRef.current = true; setStarted(true); input.current.paused = false; input.current.lookedAt=performance.now() }
  function reset() { stopInput(); world.current?.reset(); input.current.paused = false }
  function back() { world.current?.stop(); stopInput(); input.current.paused = true; onBack() }
  function toggleMode(){world.current?.stop();stopInput();setMode(current=>current==='explore'?'walk':'explore');setNotice(mode==='explore'?'Walk mode: hold the lower view to move.':'Explore mode: tap the ground to travel.')}

  return <main className="vg-root" aria-label="Village experiment">
    <canvas ref={canvas} className="vg-canvas" aria-label="Walkable medieval village" onContextMenu={event => event.preventDefault()}
      onPointerDown={event=>{
        if(input.current.paused||pointer.current)return
        event.currentTarget.setPointerCapture(event.pointerId)
        const walking=mode==='walk'&&event.clientY>innerHeight*.55
        pointer.current={id:event.pointerId,x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,dragged:false,walking}
        if(walking){world.current?.stop();input.current.z=-1}
      }}
      onPointerMove={event=>{
        const p=pointer.current
        if(!p||p.id!==event.pointerId||input.current.paused)return
        const dx=event.clientX-p.x,dy=event.clientY-p.y
        if(Math.hypot(event.clientX-p.startX,event.clientY-p.startY)>8)p.dragged=true
        if(p.dragged){input.current.yaw-=dx*.0032;input.current.pitch=Math.max(-1.0,Math.min(.9,input.current.pitch-dy*.0032));input.current.lookedAt=performance.now()}
        p.x=event.clientX;p.y=event.clientY
      }}
      onPointerUp={event=>{
        const p=pointer.current
        if(!p||p.id!==event.pointerId)return
        if(mode==='explore'&&!p.dragged&&!input.current.paused){if(!world.current?.goTo(event.clientX,event.clientY))setNotice('Tap a clear patch of ground.')}
        pointer.current=null;input.current.z=0
      }}
      onPointerCancel={()=>{pointer.current=null;input.current.z=0}}
      onLostPointerCapture={()=>{pointer.current=null;input.current.z=0}} />

    {started && ready && !error && <>
      <header className="vg-hud">
        <button className="vg-pill" onClick={back}>← The Lab</button>
        <div className="vg-title"><span>CREEKSIDE VILLAGE · REBUILD 03</span><strong>{state.zone}</strong></div>
        <div className="vg-actions"><button className={`vg-pill vg-mode ${mode==='walk'?'active':''}`} onClick={toggleMode}>{mode==='explore'?'Explore':'Walk'}</button><button className="vg-pill" onClick={reset}>Reset</button></div>
      </header>

      <div className="vg-bottom">
        <div className="vg-stick-wrap"><div className="vg-stick"
          onPointerDown={event => { if (input.current.paused || stick.current) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); world.current?.stop(); stick.current = { id: event.pointerId, x: event.clientX, y: event.clientY } }}
          onPointerMove={event => { const start = stick.current; if (!start || start.id !== event.pointerId || input.current.paused) return; const dx = event.clientX - start.x; const dz = event.clientY - start.y; const length = Math.hypot(dx, dz); const distance = Math.min(46, length); const gain = length > 6 ? (distance - 6) / 40 / (length || 1) : 0; input.current.x = dx * gain; input.current.z = dz * gain; if (nub.current) nub.current.style.transform = `translate(${dx / (length || 1) * distance}px,${dz / (length || 1) * distance}px)` }}
          onPointerUp={releaseStick} onPointerCancel={releaseStick}><span className="vg-ring"/><span ref={nub} className="vg-nub"/></div><span>WALK</span></div>
        <div className="vg-note"><strong>{state.destination?'Walking there…':mode==='explore'?'Tap anywhere to wander.':'Hold low on the screen to walk.'}</strong><span>{mode==='explore'?'Tap ground · drag to look · joystick whenever you want':'Hold lower view · drag to steer · joystick whenever you want'}</span></div>
        <div className="vg-look-label"><span>✦</span> DRAG TO LOOK</div>
      </div>
      {notice&&<div className="vg-toast">{notice}</div>}
      <div className="vg-fps">{state.fps || '—'} fps</div>
    </>}

    {(!started || !ready || error) && <div className="vg-overlay"><section>
      <div className="vg-kicker">THE LAB · ENVIRONMENT REBUILD 03</div><h1>Creekside<br/>Village</h1><p>{error || progress}</p>
      {!error && <p className="vg-subcopy">Rebuilt roofs and bridges, easier doors, shared pathfinding, tap-to-walk, smooth collision and wind-animated meadow grass.</p>}
      {error ? <button className="vg-primary" onClick={() => location.reload()}>Reload village</button> : ready ? <button className="vg-primary" onClick={begin}>Walk into the village →</button> : <div className="vg-loading">{progress}</div>}
      <button className="vg-backlink" onClick={back}>← Back to The Lab</button>
    </section></div>}
    <div className="vg-portrait"><strong>Turn your phone sideways</strong><span>The village is designed for landscape play.</span></div>
  </main>
}
