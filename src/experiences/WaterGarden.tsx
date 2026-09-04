import { useEffect, useRef, useState } from 'react'
import { GardenAudio, readSound, type SoundPrefs } from './water-garden/audio'
import { createGarden, type GardenScene } from './water-garden/scene'
import { lines, readStage, respond, stages, targets, tasks, type Stage, type Target } from './water-garden/model'
import './water-garden.css'

const STAGE_KEY = 'water-garden-progress-v1'
function initialStage() { try { return readStage(localStorage.getItem(STAGE_KEY)) } catch { return 'hello' as Stage } }
function Icon({ name }: { name: 'sound' | 'mute' | 'settings' | 'leaf' | 'expand' | 'back' | 'water' }) {
  const paths = {
    sound: <><path d="M11 5 6 9H3v6h3l5 4V5Z" /><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" /></>,
    mute: <><path d="M11 5 6 9H3v6h3l5 4V5Z" /><path d="m16 9 5 6m0-6-5 6" /></>,
    settings: <><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="8" cy="6" r="2" /><circle cx="16" cy="12" r="2" /><circle cx="10" cy="18" r="2" /></>,
    leaf: <><path d="M20 3C8 2 2 9 5 16c7 4 15-1 15-13Z" /><path d="m3 21 12-12" /></>,
    expand: <path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6" />,
    back: <path d="m14 5-7 7 7 7" />,
    water: <path d="M12 3C9 8 5 11 5 15a7 7 0 0 0 14 0c0-4-4-7-7-12Z" />,
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

export function WaterGarden({ onExit }: { onExit: () => void }) {
  const mount = useRef<HTMLDivElement>(null), root = useRef<HTMLElement>(null), dialog = useRef<HTMLDialogElement>(null)
  const scene = useRef<GardenScene | null>(null), audio = useRef<GardenAudio | null>(null)
  const [stage, setStage] = useState<Stage>(initialStage), [started, setStarted] = useState(false)
  const startingStage = useRef(stage)
  const [prefs, setPrefs] = useState<SoundPrefs>(readSound)
  const [nearby, setNearby] = useState<Target | null>(null), [talk, setTalk] = useState<Target | null>(null)
  const [settings, setSettings] = useState(false), [korean, setKorean] = useState(false)
  const [hint, setHint] = useState(''), [error, setError] = useState(''), [ready, setReady] = useState(false)
  const [feedback, setFeedback] = useState('')
  const task = tasks[stage], progress = stages.indexOf(stage)
  const modalOpen = !started || settings || talk !== null || Boolean(error)
  const callbacks = useRef({ arrive: (target: Target) => { setFeedback(''); setTalk(target) } })

  useEffect(() => {
    const host = mount.current
    if (!host) return
    audio.current = new GardenAudio()
    try {
      scene.current = createGarden(host, startingStage.current, {
        arrive: id => callbacks.current.arrive(id), nearby: setNearby, hint: setHint,
        step: wood => audio.current?.step(wood), position: (x, z) => audio.current?.position(x, z), failure: setError,
      })
      setReady(true)
    } catch { setError('This browser could not start the 3D garden. Try a recent browser with WebGL enabled.'); setReady(false) }
    const visibility = () => audio.current?.visibility(document.hidden)
    document.addEventListener('visibilitychange', visibility)
    const originalTitle = document.title; document.title = 'Water Garden · The Lab'
    return () => {
      scene.current?.dispose(); scene.current = null; audio.current?.dispose(); audio.current = null
      document.removeEventListener('visibilitychange', visibility); document.title = originalTitle
      if (document.fullscreenElement === root.current) void document.exitFullscreen().catch(() => undefined)
    }
  }, [])
  useEffect(() => {
    scene.current?.setStage(stage)
    try { localStorage.setItem(STAGE_KEY, stage) } catch { /* In-memory play still works. */ }
  }, [stage])
  useEffect(() => {
    audio.current?.update(prefs); scene.current?.setReduced(prefs.reduced)
    try { localStorage.setItem('water-garden-sound-v1', JSON.stringify(prefs)) } catch { /* Optional device preferences. */ }
  }, [prefs])
  useEffect(() => {
    scene.current?.setPaused(modalOpen)
    const element = dialog.current
    if (modalOpen && element && !element.open) element.showModal()
    else if (!modalOpen && element?.open) element.close()
  }, [modalOpen])
  useEffect(() => {
    if (!hint) return
    const timer = window.setTimeout(() => setHint(''), 5500)
    return () => window.clearTimeout(timer)
  }, [hint])
  useEffect(() => { if (talk) audio.current?.speak(tasks[stage].target === talk ? lines[talk].question : talk === 'yellow' ? lines.yellow.question : tasks[stage].en) }, [talk, stage])

  function enter(quiet = false) {
    const next = quiet ? { ...prefs, muted: true } : prefs
    setPrefs(next)
    void audio.current?.start(next).catch(() => setHint('Sound is unavailable. All instructions are shown on screen.'))
    setStarted(true)
  }
  function changePref<K extends keyof SoundPrefs>(key: K, value: SoundPrefs[K]) { setPrefs(p => ({ ...p, [key]: value })) }
  function answer(phrase: string) {
    if (!talk) return
    const result = respond(stage, talk, phrase)
    if (!result.ok) { setFeedback(result.message); audio.current?.speak(result.message); return }
    setTalk(null); setStage(result.stage); setHint(result.message); audio.current?.chime(); audio.current?.speak(result.message)
  }
  function dismiss() { if (started && !error) { setTalk(null); setSettings(false) } }
  function restart() { setStage('hello'); setSettings(false); setTalk(null); setHint('A new visit. Say hello to Mina!') }
  async function fullscreen() {
    try {
      if (document.fullscreenElement) { await document.exitFullscreen(); return }
      if (!root.current?.requestFullscreen) { setHint('Turn your phone sideways for a wider view.'); return }
      await root.current.requestFullscreen()
      const orientation = screen.orientation as ScreenOrientation & { lock?: (mode: string) => Promise<void> }
      await orientation.lock?.('landscape').catch(() => undefined)
    } catch { setHint('Turn your phone sideways for a wider view.') }
  }
  const correctTarget = talk && tasks[stage].target === talk && stage !== 'done'
  const prompt = talk ? correctTarget ? lines[talk].question : talk === 'yellow' ? lines.yellow.question : stage === 'done' ? tasks.done.en : task.en : ''

  return <main ref={root} className="wg" data-stage={stage}>
    <div ref={mount} className="wg-scene" />
    <div className="wg-vignette" aria-hidden="true" />
    <header className="wg-header">
      <div className="wg-brand"><button className="wg-icon" onClick={onExit} aria-label="Return to The Lab"><Icon name="back" /></button><div><span>THE LAB · EXPERIMENT</span><h1>Water Garden</h1></div></div>
      <nav className="wg-tools" aria-label="Garden controls">
        <button className="wg-icon" onClick={() => { const next = { ...prefs, muted: !prefs.muted }; setPrefs(next); if (!next.muted) void audio.current?.start(next).catch(() => undefined) }} aria-label={prefs.muted ? 'Turn sound on' : 'Mute all sound'} aria-pressed={!prefs.muted}><Icon name={prefs.muted ? 'mute' : 'sound'} /></button>
        <button className="wg-icon wg-fullscreen" onClick={() => void fullscreen()} aria-label="Toggle fullscreen"><Icon name="expand" /></button>
        <button className="wg-icon" onClick={() => setSettings(true)} aria-label="Garden settings"><Icon name="settings" /></button>
      </nav>
    </header>
    {started && <>
      <aside className="wg-mission" aria-label="Current task">
        <div className="wg-mission-heading"><span>{stage === 'done' ? 'GARDEN HELPER' : 'HELP A FLOWER BLOOM'}</span><span>{progress}/4</span></div>
        <div className="wg-progress" aria-label={`${progress} of 4 steps completed`}>{[0, 1, 2, 3].map(i => <i key={i} className={i < progress ? 'complete' : ''} />)}</div>
        <h2>{task.title}</h2><p>{task.en}</p>
        {korean && <p className="wg-korean" lang="ko">{task.ko}</p>}
        <div className="wg-mission-actions"><button onClick={() => audio.current?.speak(task.en)} aria-label="Listen to the instruction"><Icon name="sound" /> Listen</button><button onClick={() => setKorean(v => !v)} aria-pressed={korean}>한국어</button></div>
        {stage !== 'done' ? <button className="wg-guide" onClick={() => scene.current?.goTo(task.target)}>Walk to {targets[task.target].name} <span aria-hidden="true">↗</span></button> : <button className="wg-guide" onClick={restart}>Play again <span aria-hidden="true">↻</span></button>}
      </aside>
      <div className="wg-rotate">Turn sideways for a wider garden</div>
      <div className="wg-bottom">
        <div className="wg-direction" aria-label="Movement controls">{[{ label: 'Walk forward', x: 0, z: -1, arrow: '↑', cls: 'up' }, { label: 'Walk left', x: -1, z: 0, arrow: '←', cls: 'left' }, { label: 'Walk backward', x: 0, z: 1, arrow: '↓', cls: 'down' }, { label: 'Walk right', x: 1, z: 0, arrow: '→', cls: 'right' }].map(d => <button key={d.cls} className={d.cls} aria-label={d.label} onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); scene.current?.move(d.x, d.z) }} onPointerUp={() => scene.current?.move(0, 0)} onPointerCancel={() => scene.current?.move(0, 0)} onLostPointerCapture={() => scene.current?.move(0, 0)} onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); scene.current?.move(d.x, d.z) } }} onKeyUp={() => scene.current?.move(0, 0)} onBlur={() => scene.current?.move(0, 0)}>{d.arrow}</button>)}</div>
        <p className="wg-walk-hint">Tap a path to walk <span>WASD / arrow keys · E to interact</span></p>
        <div className="wg-action-wrap">{(stage === 'water' || stage === 'flower') && <span className="wg-inventory"><Icon name="water" /> {stage === 'flower' ? 'Can is full' : 'Empty watering can'}</span>}<button className="wg-interact" disabled={!nearby} onClick={() => { if (nearby) { setFeedback(''); setTalk(nearby) } }}>{nearby ? nearby === 'mina' ? 'Talk to Mina' : targets[nearby].name : 'Walk closer'}<span aria-hidden="true">↗</span></button></div>
      </div>
      <div className={`wg-toast ${hint ? 'visible' : ''}`} role="status">{hint}</div>
    </>}
    <dialog ref={dialog} className={`wg-dialog ${!started ? 'wg-intro' : ''}`} aria-labelledby="wg-dialog-title" onCancel={e => { e.preventDefault(); dismiss() }}>
      {error ? <><span className="wg-eyebrow">LET’S TRY AGAIN</span><h2 id="wg-dialog-title">The garden needs a moment</h2><p>{error}</p><button className="wg-primary" onClick={onExit}>Return to The Lab</button></> : !started ? <>
        <div className="wg-seal"><Icon name="leaf" /></div><span className="wg-eyebrow">A LITTLE ENGLISH. A LIVING WORLD.</span><h2 id="wg-dialog-title">Welcome to<br />Water Garden.</h2><p>Cross the stream. Meet Mina.<br />Help a thirsty flower bloom.</p>
        <div className="wg-intro-notes"><span>Tap a path to walk</span><span>Choose words to help</span><span>Take your time</span></div>
        <button className="wg-primary" disabled={!ready} onClick={() => enter()}>{ready ? stage === 'hello' ? 'Enter the garden' : 'Continue your visit' : 'Growing your garden…'} <span aria-hidden="true">↗</span></button>
        <button className="wg-quiet" disabled={!ready} onClick={() => enter(true)}>Enter without sound</button><small>No microphone. No recording. Just explore.</small>
      </> : settings ? <>
        <div className="wg-dialog-top"><span className="wg-eyebrow">MAKE YOURSELF COMFORTABLE</span><button className="wg-close" onClick={dismiss} aria-label="Close settings">×</button></div><h2 id="wg-dialog-title">Garden settings</h2>
        <label className="wg-setting">Nature & gentle tones <output>{Math.round(prefs.ambience * 100)}%</output><input aria-label="Nature and tones volume" type="range" min="0" max="1" step="0.05" value={prefs.ambience} onChange={e => changePref('ambience', Number(e.target.value))} /></label>
        <label className="wg-setting">English voice <output>{Math.round(prefs.voice * 100)}%</output><input aria-label="English voice volume" type="range" min="0" max="1" step="0.05" value={prefs.voice} onChange={e => changePref('voice', Number(e.target.value))} /></label>
        <label className="wg-check"><input type="checkbox" checked={prefs.muted} onChange={e => changePref('muted', e.target.checked)} /> Mute all sound</label>
        <label className="wg-check"><input type="checkbox" checked={prefs.reduced} onChange={e => changePref('reduced', e.target.checked)} /> Less animation</label>
        <p className="wg-small">Instructions always stay on screen. Voice availability depends on your device. This experiment does not record or assess speech.</p>
        <button className="wg-primary" onClick={dismiss}>Back to the garden</button><button className="wg-quiet" onClick={restart}>Start this four-step task again</button>
      </> : talk ? <>
        <div className="wg-dialog-top"><span className="wg-eyebrow">{talk === 'mina' ? 'MINA · THE GARDENER' : targets[talk].name.toUpperCase()}</span><button className="wg-close" onClick={dismiss} aria-label="Close conversation">×</button></div>
        <h2 id="wg-dialog-title">{prompt}</h2>{korean && <p className="wg-korean" lang="ko">{correctTarget ? lines[talk].ko : task.ko}</p>}
        <button className="wg-listen" onClick={() => audio.current?.speak(prompt)}><Icon name="sound" /> Listen again</button>
        {correctTarget ? <><p className="wg-small">Choose what you want to say.</p><div className="wg-choices">{lines[talk].choices.map(phrase => <button key={phrase} onClick={() => answer(phrase)}>{phrase}<span aria-hidden="true">↗</span></button>)}</div></> : <button className="wg-primary" onClick={dismiss}>Keep exploring</button>}
        <p className="wg-feedback" role="status">{feedback}</p>
      </> : null}
    </dialog>
  </main>
}
