import { useEffect, useRef, useState } from 'react'
import { createVillage, type VillageInput, type VillageState } from './village/scene'
import { villageAudio } from './village/audio'
import { spawn } from './village/world'
import './village/village.css'

type Prefs = { sensitivity: number; volume: number; quality: number }
function readPrefs(): Prefs {
  const defaults = { sensitivity: 1, volume: .5, quality: 1 }
  try {
    const p = JSON.parse(localStorage.getItem('waterfall-village-settings-v1') || '{}')
    return { sensitivity: Number.isFinite(p.sensitivity) ? Math.max(.3, Math.min(2, p.sensitivity)) : defaults.sensitivity, volume: Number.isFinite(p.volume) ? Math.max(0, Math.min(1, p.volume)) : defaults.volume, quality: p.quality === 0 ? 0 : 1 }
  } catch { return defaults }
}
export function WaterfallVillage({ onBack }: { onBack: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const input = useRef<VillageInput>({ x: 0, z: 0, yaw: spawn.yaw, pitch: -.04, paused: true, quality: 1 })
  const world = useRef<Awaited<ReturnType<typeof createVillage>> | null>(null)
  const sound = useRef<ReturnType<typeof villageAudio> | null>(null)
  const keys = useRef(new Set<string>())
  const stick = useRef<{ id: number; x: number; y: number } | null>(null)
  const look = useRef<{ id: number; x: number; y: number } | null>(null)
  const nub = useRef<HTMLSpanElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const [prefs, setPrefs] = useState(readPrefs)
  const [ready, setReady] = useState(false), [error, setError] = useState(''), [attempt, setAttempt] = useState(0)
  const [started, setStarted] = useState(false), [paused, setPaused] = useState(false), [soundOn, setSoundOn] = useState(false), [soundError, setSoundError] = useState(false)
  const [state, setState] = useState<VillageState>({ position: spawn, boating: false, location: 'Waterfall Village', action: '', visited: [], fps: 0 })
  const stopInput = () => { keys.current.clear(); input.current.x = 0; input.current.z = 0; stick.current = null; look.current = null; if (nub.current) nub.current.style.transform = '' }
  useEffect(() => {
    const controller = new AbortController(); setReady(false); setError('')
    void createVillage(canvas.current!, input.current, controller.signal, setState).then(value => {
      if (controller.signal.aborted) value.dispose(); else { world.current = value; setReady(true) }
    }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'This device could not open the village.') })
    return () => { controller.abort(); world.current?.dispose(); world.current = null }
  }, [attempt])
  useEffect(() => () => { sound.current?.dispose() }, [])
  useEffect(() => {
    const target = canvas.current
    const lost = (event: Event) => { event.preventDefault(); stopInput(); input.current.paused = true; sound.current?.pause(); setReady(false); setError('The graphics connection paused. Reopen the village to continue.') }
    target?.addEventListener('webglcontextlost', lost)
    return () => target?.removeEventListener('webglcontextlost', lost)
  }, [])
  useEffect(() => {
    input.current.quality = prefs.quality; sound.current?.volume(prefs.volume)
    try { localStorage.setItem('waterfall-village-settings-v1', JSON.stringify(prefs)) } catch { /* Continue in memory. */ }
  }, [prefs])
  useEffect(() => {
    sound.current?.update(state.position.x, state.position.z, state.location.includes('Cottage') || state.location.includes('Library'), !input.current.paused && Math.hypot(input.current.x, input.current.z) > .15, state.boating)
  }, [state])
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (input.current.paused || (e.target instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName))) return
      const k = e.key.toLowerCase()
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'e', 'escape'].includes(k)) e.preventDefault()
      if (k === 'escape' && e.type === 'keydown') { stopInput(); input.current.paused = true; sound.current?.pause(); setPaused(true); return }
      if (k === 'e' && e.type === 'keydown' && !e.repeat) world.current?.interact()
      if (e.type === 'keydown') keys.current.add(k); else keys.current.delete(k)
      input.current.x = Number(keys.current.has('d') || keys.current.has('arrowright')) - Number(keys.current.has('a') || keys.current.has('arrowleft'))
      input.current.z = Number(keys.current.has('s') || keys.current.has('arrowdown')) - Number(keys.current.has('w') || keys.current.has('arrowup'))
    }
    const pause = () => { stopInput(); input.current.paused = true; sound.current?.pause(); setPaused(true) }
    const visibility = () => { if (document.hidden) pause() }
    window.addEventListener('keydown', key); window.addEventListener('keyup', key); window.addEventListener('blur', pause); document.addEventListener('visibilitychange', visibility)
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('keyup', key); window.removeEventListener('blur', pause); document.removeEventListener('visibilitychange', visibility) }
  }, [])
  async function startAudio() {
    try { if (!sound.current) sound.current = villageAudio(); sound.current.volume(prefs.volume); await sound.current.play(); setSoundError(false) }
    catch { setSoundError(true); setSoundOn(false) }
  }
  function begin(withSound: boolean) {
    stopInput(); input.current.paused = false; setStarted(true); setPaused(false); setSoundOn(withSound)
    if (withSound) void startAudio()
  }
  function settings() { stopInput(); input.current.paused = true; sound.current?.pause(); dialog.current?.showModal() }
  function closeSettings() { stopInput(); if (started && !paused) { input.current.paused = false; if (soundOn) void startAudio() } }
  function back() { stopInput(); input.current.paused = true; sound.current?.pause(); onBack() }
  return <main className="wv-root" aria-label="Waterfall Village">
    <canvas ref={canvas} className="wv-canvas" aria-label="Interactive 3D waterfall village" onContextMenu={e => e.preventDefault()} />
    {started && !error && <>
      <div className="wv-look" aria-label="Drag to look around" onPointerDown={e => { if (input.current.paused || look.current) return; e.currentTarget.setPointerCapture(e.pointerId); look.current = { id: e.pointerId, x: e.clientX, y: e.clientY } }} onPointerMove={e => {
        const p = look.current; if (!p || p.id !== e.pointerId || input.current.paused) return
        input.current.yaw -= (e.clientX - p.x) * .003 * prefs.sensitivity
        input.current.pitch = Math.max(-1.1, Math.min(1.1, input.current.pitch - (e.clientY - p.y) * .003 * prefs.sensitivity))
        p.x = e.clientX; p.y = e.clientY
      }} onPointerUp={e => { if (look.current?.id === e.pointerId) look.current = null }} onPointerCancel={() => { look.current = null }} onLostPointerCapture={() => { look.current = null }} />
      <header className="wv-hud">
        <div><button className="wv-back" onClick={back}>← The Lab</button><div className="wv-location">{state.location}</div><div className="wv-caption">{state.boating ? 'A little farther, a little wonder' : 'Take the scenic way'}</div></div>
        <button className="wv-round" aria-label="Village settings" onClick={settings}>⚙</button>
      </header>
      <div className="wv-crosshair" aria-hidden="true" />
      <div className="wv-bottom">
        <div className="wv-stick-wrap"><div className="wv-stick" role="group" aria-label={state.boating ? 'Boat throttle and steering' : 'Movement joystick'} onPointerDown={e => {
          if (input.current.paused || stick.current) return
          e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); stick.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
        }} onPointerMove={e => {
          const s = stick.current; if (!s || s.id !== e.pointerId || input.current.paused) return
          const dx = e.clientX - s.x, dz = e.clientY - s.y, length = Math.hypot(dx, dz), d = Math.min(46, length), gain = length > 6 ? (d - 6) / 40 / length : 0
          input.current.x = dx * gain; input.current.z = dz * gain
          if (nub.current) nub.current.style.transform = `translate(${dx / (length || 1) * d}px,${dz / (length || 1) * d}px)`
        }} onPointerUp={stopInput} onPointerCancel={stopInput} onLostPointerCapture={e => { if (stick.current?.id === e.pointerId) stopInput() }}><span className="wv-stick-ring" /><span ref={nub} className="wv-nub" /></div><span>{state.boating ? 'STEER · ROW' : 'WALK'}</span></div>
        <div className="wv-action-area">{state.action ? <button className="wv-action" onClick={() => { world.current?.interact(); if (document.activeElement instanceof HTMLElement) document.activeElement.blur() }}>{state.action}<span>E</span></button> : <div className="wv-hint">{state.boating ? 'Follow the river north to the lake' : state.location === 'The winding stair' ? 'Follow the stairs around the trunk' : 'Follow paths · Walk through open doors'}</div>}<small>{state.visited.length > 0 ? `${state.visited.length} of 4 places discovered` : 'Your own little world to explore'}</small></div>
        <div className="wv-look-label"><span>✧</span>LOOK</div>
      </div>
    </>}
    {(!started || error || paused) && <div className="wv-overlay">
      <section className="wv-welcome">
        <div className="wv-kicker">THE LAB · A PLACE TO WANDER</div>
        <h1>{paused && started ? 'Stay a little longer.' : 'Waterfall\nVillage'}</h1>
        <p>{error || (paused && started ? 'The village will wait for you.' : 'Through the trees. Across the bridges.\nAll the way to the lake.')}</p>
        {error ? <button className="wv-primary" onClick={() => { setStarted(false); setPaused(false); setAttempt(n => n + 1) }}>Reopen village</button> : ready ? <>
          <button className="wv-primary" onClick={() => begin(paused && started ? soundOn : true)}>{paused && started ? 'Continue exploring' : 'Step inside'} <span>→</span></button>
          {!started && <button className="wv-quiet" onClick={() => begin(false)}>Explore without sound</button>}
        </> : <div className="wv-loading" role="status"><span />Growing your village…</div>}
        <div className="wv-controls-note">Left thumb to move · Right thumb to look<br />On a computer: WASD or arrows · Drag to look · E to board</div>
        <button className="wv-quiet" onClick={back}>← Back to The Lab</button>
      </section>
    </div>}
    <dialog ref={dialog} className="wv-settings" onClose={closeSettings}>
      <form method="dialog"><header><h2>Make yourself at home</h2><button aria-label="Close settings">×</button></header></form>
      <label>Look sensitivity <output>{prefs.sensitivity.toFixed(1)}×</output><input type="range" min="0.3" max="2" step="0.1" value={prefs.sensitivity} onChange={e => setPrefs(p => ({ ...p, sensitivity: +e.target.value }))} /></label>
      <label>Nature volume <output>{Math.round(prefs.volume * 100)}%</output><input type="range" min="0" max="1" step="0.05" value={prefs.volume} onChange={e => setPrefs(p => ({ ...p, volume: +e.target.value }))} /></label>
      <label className="wv-check"><input type="checkbox" checked={soundOn} onChange={e => setSoundOn(e.target.checked)} /> Nature sounds</label>
      {soundError && <p role="status">Sound could not start. You can keep exploring quietly.</p>}
      <label>Graphics<select value={prefs.quality} onChange={e => setPrefs(p => ({ ...p, quality: +e.target.value }))}><option value={1}>Beautiful · soft shadows</option><option value={0}>Lighter · smoother on phones</option></select></label>
      <p className="wv-settings-note">Find the cottage, climb to the treetop library, cross to Fern Cottage, and row to the lake. Music and learning activities will come later.</p>
      <button className="wv-reset" onClick={() => { stopInput(); world.current?.reset(); dialog.current?.close() }}>Return to the village entrance</button>
      <form method="dialog"><button className="wv-primary">Back to exploring</button></form>
    </dialog>
  </main>
}
