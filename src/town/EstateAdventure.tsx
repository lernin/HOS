import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import EstateAdventureWorld, { ESTATE_STOPS } from './EstateAdventureWorld'

type Stop = { id: number; name: string; icon: string; x: number; y: number; prompts: string[] }
type Player = { id: number; name: string; color: string; at: number }
type Round = { name: string; location: string; roll: number; question: string; notes: string }
type Stage = 'ready' | 'rolling' | 'walking' | 'question'
type State = { players: Player[]; active: number; roll: [number, number] | null; stop: number; prompt: number; custom: string; round: number; stage: Stage; stageTime: number }
type Command =
  | { kind: 'add'; name: string }
  | { kind: 'roll' }
  | { kind: 'next' }
  | { kind: 'changePrompt' }
  | { kind: 'ask'; value: string }
  | { kind: 'select'; id: number }
  | { kind: 'reset' }
  | { kind: 'stage'; stage: Stage }
type EventPayload = { state?: State; command?: Command; key?: string }
type Recording = { id: number; filename: string; url: string; name: string }
const COLORS = ['#ff6266','#1ca4d9','#f5b84b','#a58eff','#62c870','#f086c3','#e5985c','#7a9dec']
const STOPS: Stop[] = ESTATE_STOPS.map(s => ({ ...s, x: 0, y: 0, prompts: [...s.prompts] }))
const blank = (): State => ({ players: [{ id: 1, name: 'Player 1', color: COLORS[0], at: 1 }], active: 1, roll: null, stop: 1, prompt: 0, custom: '', round: 0, stage: 'ready', stageTime: 0 })
const dice = (): number => {
  const a = new Uint32Array(1)
  crypto.getRandomValues(a)
  return (a[0] % 6) + 1
}
const roomCode = () => Array.from(crypto.getRandomValues(new Uint8Array(18))).map(v => v.toString(16).padStart(2, '0')).join('')
const safeName = (s: string): string => s.trim().replace(/[\n\r<>]/g, '').slice(0, 30)
const place = (id: number) => STOPS.find(s => s.id === id) ?? STOPS[0]
const copy = async (s: string) => { await navigator.clipboard.writeText(s) }
const save = (file: string, text: string) => {
  const uri = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  const el = document.createElement('a'); el.href = uri; el.download = file; el.click()
  setTimeout(() => URL.revokeObjectURL(uri), 1000)
}
function apply(state: State, action: Command): State {
  if (action.kind === 'reset') return blank()
  if (action.kind === 'stage') {
    if (!state.roll || (action.stage === 'walking' && state.stage !== 'rolling') || (action.stage === 'question' && state.stage !== 'walking')) return state
    return { ...state, stage: action.stage, stageTime: performance.now() }
  }
  if (action.kind === 'add') {
    const name = safeName(action.name)
    if (!name || state.players.length >= 8) return state
    // The first child replaces the demo slot instead of creating a ghost Player 1 turn.
    if (state.players.length === 1 && state.players[0].name === 'Player 1' && state.round === 0) {
      return { ...state, players: [{ ...state.players[0], name }] }
    }
    const nextId = Math.max(...state.players.map(p => p.id)) + 1
    return { ...state, players: [...state.players, { id: nextId, name, color: COLORS[(nextId - 1) % COLORS.length], at: 1 }] }
  }
  if (action.kind === 'select') return state.roll || !state.players.some(p => p.id === action.id) ? state : { ...state, active: action.id }
  if (action.kind === 'roll') {
    if (state.roll) return state
    const result: [number, number] = [dice(), dice()]
    const at = result[0] + result[1]
    return {
      ...state, roll: result, stop: at, prompt: dice() % place(at).prompts.length, custom: '', stage: 'rolling', stageTime: performance.now(),
      players: state.players.map(p => p.id === state.active ? { ...p, at } : p),
    }
  }
  if (action.kind === 'changePrompt') return state.roll ? { ...state, prompt: (state.prompt + 1) % place(state.stop).prompts.length, custom: '' } : state
  if (action.kind === 'ask') return state.roll ? { ...state, custom: action.value.slice(0, 300) } : state
  if (action.kind === 'next') {
    if (!state.roll) return state
    const idx = state.players.findIndex(p => p.id === state.active)
    return { ...state, roll: null, active: state.players[(idx + 1) % state.players.length].id, round: state.round + 1, custom: '', stage: 'ready', stageTime: 0 }
  }
  return state
}

declare global {
  interface Window {
    QRCode?: new (el: HTMLElement, opts: { text: string; width: number; height: number; colorDark: string; colorLight: string; correctLevel?: number }) => unknown
  }
}
function QR({ value }: { value: string }) {
  const slot = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState('Generating QR…')
  useEffect(() => {
    if (!slot.current) return
    const render = () => {
      if (!slot.current || !window.QRCode) return
      slot.current.innerHTML = ''
      new window.QRCode(slot.current, { text: value, width: 188, height: 188, colorDark: '#13253c', colorLight: '#ffffff' })
      setStatus('')
    }
    if (window.QRCode) { render(); return }
    const script = document.createElement('script')
    script.src = '/town/vendor/qrcode.min.js'
    script.async = true
    script.onload = render
    script.onerror = () => setStatus('QR library unavailable. Use the link below.')
    document.head.append(script)
    return () => { script.onload = null; script.onerror = null }
  }, [value])
  return <div className="town-qr"><div ref={slot} /><small>{status}</small></div>
}

export default function Town() {
  const isPhone = new URLSearchParams(location.search).has('controller')
  const [room] = useState(() => isPhone ? new URLSearchParams(location.search).get('controller') ?? '' : (() => {
    const existing = sessionStorage.getItem('estate-adventure-room')
    if (existing && /^[a-f0-9]{36}$/.test(existing)) return existing
    const id = roomCode(); sessionStorage.setItem('estate-adventure-room', id); return id
  })())
  const [state, setState] = useState<State>(blank)
  const stateRef = useRef(state)
  const [connection, setConnection] = useState('Connecting…')
  const [paired, setPaired] = useState(false)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const [message, setMessage] = useState('')
  const [newPlayer, setNewPlayer] = useState('')
  const [notes, setNotes] = useState('')
  const [rounds, setRounds] = useState<Round[]>([])
  const [clips, setClips] = useState<Recording[]>([])
  const audioUrls = useRef<string[]>([])
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [recording, setRecording] = useState(false)
  const [liveDraft, setLiveDraft] = useState('')
  const recognitionRef = useRef<{ stop: () => void } | null>(null)
  const [consent, setConsent] = useState(false)
  const pairUrl = location.origin + '/estate-adventure?controller=' + room
  const activePlayer = state.players.find(p => p.id === state.active) ?? state.players[0]
  const stop = place(state.stop)
  const question = state.custom.trim() || stop.prompts[state.prompt % stop.prompts.length]
  const total = state.roll ? state.roll[0] + state.roll[1] : null

  const send = useCallback((event: string, data: EventPayload = {}) => {
    const chan = channelRef.current
    if (!chan) return
    void chan.send({ type: 'broadcast', event, payload: data }).catch(() => setConnection('Connection interrupted. Reopen this page.'))
  }, [])

  const run = useCallback((cmd: Command) => {
    if (isPhone) { send('command', { command: cmd }); return }
    const result = apply(stateRef.current, cmd)
    stateRef.current = result
    setState(result)
    send('state', { state: result })
  }, [isPhone, send])

  useEffect(() => {
    if (!/^[a-f0-9]{36}$/.test(room)) { setConnection('Invalid pairing code. Scan the TV again.'); return }
    const channel = supabase.channel('estate-adventure:' + room, { config: { broadcast: { self: false }, presence: { key: isPhone ? 'phone' : 'tv' } } })
    channelRef.current = channel
    channel.on('broadcast', { event: 'request' }, () => {
      if (!isPhone) { setPaired(true); send('state', { state: stateRef.current }); send('ready') }
    })
    channel.on('broadcast', { event: 'ready' }, () => { if (isPhone) { setPaired(true); setConnection('Paired with estate TV'); send('request') } })
    channel.on('broadcast', { event: 'state' }, ({ payload }: { payload: EventPayload }) => {
      if (!isPhone || !payload.state) return
      stateRef.current = payload.state
      setState(payload.state)
      setConnection('Paired with estate TV')
      setPaired(true)
    })
    channel.on('broadcast', { event: 'command' }, ({ payload }: { payload: EventPayload }) => {
      if (isPhone || !payload.command) return
      const result = apply(stateRef.current, payload.command)
      stateRef.current = result
      setState(result)
      void channel.send({ type: 'broadcast', event: 'state', payload: { state: result } })
    })
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        setConnection(isPhone ? 'Waiting for the TV…' : 'Waiting for phone to scan…')
        void channel.send({ type: 'broadcast', event: isPhone ? 'request' : 'ready', payload: {} })
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setConnection('Connection lost — check internet and reload.')
        setPaired(false)
      }
    })
    return () => { channelRef.current = null; void supabase.removeChannel(channel) }
  }, [room, isPhone, send])

  useEffect(() => () => {
    recognitionRef.current?.stop()
    recorderRef.current?.state === 'recording' && recorderRef.current.stop()
    streamRef.current?.getTracks().forEach(t => t.stop())
    audioUrls.current.forEach(u => URL.revokeObjectURL(u))
  }, [])

  useEffect(() => {
    if (isPhone || !state.roll) return
    if (state.stage === 'rolling') {
      const timer = window.setTimeout(() => run({ kind: 'stage', stage: 'walking' }), 2150)
      return () => window.clearTimeout(timer)
    }
    // Arrival is emitted only by the real Ocean Estate navigator, never by a timer.
  }, [isPhone, state.stage, state.stageTime, state.roll, run])

  const speak = () => {
    if (!window.speechSynthesis) { setMessage('Speech playback is unavailable on this device.'); return }
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(question)
    utterance.lang = 'en-US'; utterance.rate = 0.88
    window.speechSynthesis.speak(utterance)
  }
  const record = async () => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop()
      recognitionRef.current?.stop()
      recognitionRef.current = null
      setLiveDraft('')
      setRecording(false)
      return
    }
    if (!consent) { setMessage('Confirm consent before recording.'); return }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setMessage('Recording needs an HTTPS page and a browser with microphone support.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(t => MediaRecorder.isTypeSupported(t))
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      const chunks: BlobPart[] = []
      const person = activePlayer.name, destination = stop.name
      rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop()); streamRef.current = null
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' })
        if (blob.size > 0) {
          const url = URL.createObjectURL(blob)
          audioUrls.current.push(url)
          setClips(old => [...old, { id: Date.now(), url, filename: 'town-' + person.replace(/[^a-z0-9-]/gi, '_') + '-' + Date.now() + (rec.mimeType.includes('mp4') ? '.m4a' : '.webm'), name: person + ' · ' + destination }])
          setMessage('Audio saved in this phone session. Download it before closing the tab.')
        } else setMessage('No audio captured.')
        setRecording(false)
      }
      rec.start(400)
      recorderRef.current = rec
      setRecording(true)
      setLiveDraft('')
      // SpeechRecognition is only available in some browsers; it may use the
      // browser provider's online speech service. Our app receives text only.
      type RecognitionEvent = { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }
      type RecognitionInstance = { lang: string; continuous: boolean; interimResults: boolean; onresult: ((event: RecognitionEvent) => void) | null; onerror: (() => void) | null; start: () => void; stop: () => void }
      const browser = window as Window & { SpeechRecognition?: new () => RecognitionInstance; webkitSpeechRecognition?: new () => RecognitionInstance }
      const Recognition = browser.SpeechRecognition ?? browser.webkitSpeechRecognition
      if (Recognition) {
        try {
          const live = new Recognition()
          live.lang = 'en-US'; live.continuous = true; live.interimResults = true
          live.onresult = (event) => {
            const finalized: string[] = []; const interim: string[] = []
            for (let i=event.resultIndex;i<event.results.length;i++) {
              const text = event.results[i][0]?.transcript.trim()
              if (!text) continue
              if (event.results[i].isFinal) finalized.push(text)
              else interim.push(text)
            }
            if (finalized.length) setNotes(old => (old.trim() + ' ' + finalized.join(' ')).trim())
            setLiveDraft(interim.join(' '))
          }
          live.onerror = () => setMessage('Automatic transcription was interrupted. Your audio recording is still being saved.')
          live.start()
          recognitionRef.current = live
          setMessage('Recording and transcribing on this phone (browser speech service).')
        } catch {
          setMessage('Recording audio. Automatic transcription is unavailable; enter notes or download audio.')
        }
      } else setMessage('Recording audio. This browser has no automatic speech recognition; download audio for transcription.')

    } catch { setMessage('Microphone permission not granted.'); setRecording(false) }
  }

  const finish = () => {
    if (recording || !state.roll || state.stage !== 'question') return
    setRounds(old => [...old, { name: activePlayer.name, location: stop.name, roll: total!, question, notes: notes.trim() || '(No written response)' }])
    setNotes('')
    run({ kind: 'next' })
  }
  const transcript = () => [
    'ESTATE ADVENTURE — SPEAKING LESSON', new Date().toLocaleString(), '',
    ...rounds.map((r, i) => 'Turn ' + (i + 1) + ': ' + r.name + ' — ' + r.location + ' — Dice ' + r.roll + '\nQuestion: ' + r.question + '\nResponse / notes: ' + r.notes + '\n'),
    '\nAudio files are downloaded separately. No automatic transcription was performed.',
  ].join('\n')
  const prompt = () => [
    'You are an English teacher. The following is a child-centered speaking lesson transcript.',
    'Do not invent anything a child said. Distinguish teacher prompts from child responses.',
    'Produce: (1) a brief summary by learner, (2) useful vocabulary with English definitions and Korean glosses,',
    '(3) grounded grammar corrections with before/after examples, (4) five funny follow-up speaking prompts,',
    '(5) a differentiated practice worksheet and separate answer key. Keep only first names.',
    '', transcript(),
  ].join('\n')

  if (isPhone) return (
    <div className="town town-phone">
      <header className="town-phone-head">
        <div><small>THE LAB · REMOTE CONTROL</small><h1>ESTATE <span>🎲</span></h1></div>
        <span className={'town-link-status' + (paired ? ' on' : '')}>{paired ? '● Connected' : '○ ' + connection}</span>
      </header>
      <div className="town-phone-scroll">
        {!paired ? <section className="town-card town-wait"><h2>Connect to the TV</h2><p>Leave Town open on the computer. Pairing will happen automatically when both devices are online.</p><p className="town-muted">{connection}</p><button type="button" onClick={() => send('request')}>Try pairing again</button></section> : <>
          <section className="town-card">
            <h2>Players <small>{state.players.length} / 8</small></h2>
            <div className="town-roster">{state.players.map(p => (
              <button className={'town-person' + (p.id === state.active ? ' chosen' : '')} key={p.id} disabled={Boolean(state.roll) || recording} onClick={() => run({ kind: 'select', id: p.id })}>
                <b style={{ background: p.color }}>{p.name[0].toUpperCase()}</b>{p.name}{p.id === state.active && <strong>TURN</strong>}
              </button>
            ))}</div>
            <form className="town-add" onSubmit={e => { e.preventDefault(); run({ kind: 'add', name: newPlayer }); setNewPlayer('') }}>
              <input maxLength={30} aria-label="Add child name" placeholder="Child's first name" value={newPlayer} onChange={e => setNewPlayer(e.target.value)} disabled={state.players.length >= 8} />
              <button type="submit" disabled={!newPlayer.trim() || state.players.length >= 8}>+ Add</button>
            </form>
          </section>
          <section className="town-card town-roll-card">
            <small>WHOSE TURN?</small><h2>{activePlayer.name}</h2>
            <div className="town-big-dice"><span>{state.roll?.[0] ?? '⚀'}</span><span>{state.roll?.[1] ?? '⚀'}</span><strong>{total === null ? 'Ready!' : '→ ' + total}</strong></div>
            <button type="button" className="town-primary" disabled={Boolean(state.roll) || recording} onClick={() => run({ kind: 'roll' })}>{state.stage === 'rolling' ? 'Dice rolling on TV…' : state.stage === 'walking' ? 'Walking through the estate…' : state.roll ? 'Answer the question below' : '🎲 ROLL TWO DICE'}</button>
          </section>
          {state.roll && state.stage === 'question' && <section className="town-card town-prompt-card">
            <small>DESTINATION {total}</small><h2>{stop.icon} {stop.name}</h2>
            <p className="town-prompt">{question}</p>
            <div className="town-phone-actions"><button type="button" onClick={speak}>▶ Play question</button><button type="button" onClick={() => run({ kind: 'changePrompt' })}>↻ New question</button></div>
            <input value={state.custom} onChange={e => run({ kind: 'ask', value: e.target.value })} maxLength={300} aria-label="Teacher custom question" placeholder="Or write your own question…" />
            <label className="town-consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /> I have permission to record this child's voice and use the browser's speech recognition (which may process audio through its provider).</label>
            <button type="button" className={'town-rec-btn' + (recording ? ' recording' : '')} onClick={() => void record()}>{recording ? '■ STOP RECORDING' : '● Record spoken answer'}</button>
            {liveDraft && <p className="town-live-draft">Hearing: {liveDraft}</p>}
            <textarea aria-label="Child transcript or teacher notes" value={notes} onChange={e => setNotes(e.target.value)} rows={4} placeholder="Automatic transcript appears here on supported browsers. You can correct it or add notes." />
            <button type="button" className="town-next" onClick={finish} disabled={recording}>✓ Complete turn · Next player</button>
          </section>}
          <section className="town-card town-foot-card">
            <h2>Lesson evidence <small>{rounds.length} completed turns</small></h2>
            {clips.map(c => <a className="town-download" key={c.id} href={c.url} download={c.filename}>↓ Download audio · {c.name}</a>)}
            <div className="town-phone-actions"><button type="button" onClick={() => save('estate-adventure-lesson.txt', transcript())}>↓ Export notes</button><button type="button" onClick={() => void copy(prompt()).then(() => setMessage('ChatGPT learning prompt copied.')).catch(() => save('estate-adventure-chatgpt-prompt.txt', prompt()))}>Copy ChatGPT prompt</button></div>
            <p>Audio stays in this phone browser until downloaded. The browser may use its speech service for transcription; we do not upload audio to the Lab backend. Check transcripts before exporting.</p>
            <button type="button" className="town-reset" onClick={() => { if (window.confirm('Reset the game? Download audio and notes first.')) { run({ kind: 'reset' }); setRounds([]); setNotes('') } }}>Reset game</button>
          </section>
        </>}
        {message && <p className="town-toast" role="status">{message}</p>}
      </div>
    </div>
  )

  return (
    <div className="town town-tv">
      <EstateAdventureWorld target={state.stop} stage={state.stage} stageTime={state.stageTime} onArrival={() => run({kind:'stage',stage:'question'})} onRouteError={setMessage} />
      <div className="town-tv-vignette" />
      <header className="town-tv-header">
        <div className="town-brand"><small>THE LAB · OCEAN ESTATE GAME MODE</small><h1>ESTATE ADVENTURE</h1><span>THE HOUSE IS YOUR ADVENTURE</span></div>
        <div className="town-tv-top-actions">
          <span className={'town-link-status' + (paired ? ' on' : '')}>{paired ? '● Phone paired' : '○ Waiting for phone'}</span>
          <button type="button" onClick={() => document.documentElement.requestFullscreen?.()} aria-label="Enter fullscreen">⛶ Full screen</button>
        </div>
      </header>

      <div className="town-explore-tip">REAL OCEAN ESTATE · GUIDED ROUTES · DRAG TO LOOK · WASD TO EXPLORE</div>
      {state.stage === 'rolling' && <div className="town-dice-event" aria-live="polite"><div className="town-confetti">✦ ✧ ★ ✦ ✧</div><div className="town-dice-spinners"><span>⚄</span><span>⚅</span></div><h2>{activePlayer.name} rolls the dice!</h2></div>}
      {state.stage === 'walking' && <div className="town-walking-event" role="status"><strong>Off we go!</strong><span>{activePlayer.name} is walking to {stop.name}…</span></div>}
      {state.stage === 'question' && <section className="town-tv-question" aria-label="Speaking challenge"><span>MISSION {total} · {stop.icon} {stop.name}</span><p>{question}</p><small>Answer and record on the phone</small></section>}

      <section className="town-tv-bottom">
        <div className="town-current-turn"><small>NOW PLAYING</small><strong>{activePlayer.name}</strong><div>{state.roll ? 'Arrived at ' + stop.name : 'Ready to roll!'}</div></div>
        <div className="town-tv-dice"><span>{state.roll?.[0] ?? '⚀'}</span><span>{state.roll?.[1] ?? '⚀'}</span><b>{total ?? '—'}</b></div>
        <div className="town-turn-hint">{state.roll ? stop.icon + '  ' + stop.name : 'Scan the QR code, then roll from your phone.'}</div>
      </section>

      <aside className={'town-pair-card' + (paired ? ' paired' : '')}>
        {paired ? <><strong>Phone controller connected</strong><p>Roll the dice and ask questions from your phone.</p><button type="button" onClick={() => setPaired(false)}>Show QR again</button></> : <>
          <strong>SCAN TO PLAY</strong><QR value={pairUrl} /><span>Scan to control the estate adventure from your phone.</span><button type="button" onClick={() => void copy(pairUrl).then(() => setMessage('Controller link copied'))}>Copy phone link</button>
          <small>{connection}</small>
        </>}
      </aside>
      <a href="/" className="town-leave">‹ Back to Lab</a>
      {message && <div className="town-tv-message" role="status">{message}</div>}
    </div>
  )
}
