import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

type Stop = { id: number; name: string; icon: string; x: number; y: number; prompts: string[] }
type Player = { id: number; name: string; color: string; at: number }
type Round = { name: string; location: string; roll: number; question: string; notes: string }
type State = { players: Player[]; active: number; roll: [number, number] | null; stop: number; prompt: number; custom: string; round: number }
type Command =
  | { kind: 'add'; name: string }
  | { kind: 'roll' }
  | { kind: 'next' }
  | { kind: 'changePrompt' }
  | { kind: 'ask'; value: string }
  | { kind: 'select'; id: number }
  | { kind: 'reset' }
type EventPayload = { state?: State; command?: Command; key?: string }
type Recording = { id: number; filename: string; url: string; name: string }
const COLORS = ['#ff6266','#1ca4d9','#f5b84b','#a58eff','#62c870','#f086c3','#e5985c','#7a9dec']
const STOPS: Stop[] = [
  { id: 1, name: 'Town Square', icon: '⛲', x: 49, y: 73, prompts: ['Tell the mayor your name and two interesting things about yourself.'] },
  { id: 2, name: 'Bakery', icon: '🥐', x: 13, y: 46, prompts: ['The baker made a cake bigger than a car. What should happen next?', 'Order three things politely at the bakery.', 'A piece of bread has started talking. Ask it three questions.'] },
  { id: 3, name: 'Library', icon: '📚', x: 26, y: 37, prompts: ['A library book says it is tired of being read. Convince it to stay.', 'Describe a book that a dinosaur would love.', 'Use mysterious, discover, and whisper in a funny story.'] },
  { id: 4, name: 'Fire Station', icon: '🚒', x: 37, y: 53, prompts: ['A dragon sneezed and toasted all the marshmallows. Explain what happened.', 'You are a firefighter. Give three safety instructions.', 'Explain how to rescue a kitten from a tall tree.'] },
  { id: 5, name: 'Hospital', icon: '🏥', x: 47, y: 37, prompts: ['A robot has the hiccups. Ask it three medical questions.', 'Give a talking penguin some advice about a cold.', 'Explain what happened to a patient using first, next, and finally.'] },
  { id: 6, name: 'Pet Shop', icon: '🐕', x: 62, y: 46, prompts: ['A goldfish wants to walk a dog. Make a plan.', 'Describe your imaginary pet using five adjectives.', 'Your pet has learned to drive a bus. What could go wrong?'] },
  { id: 7, name: 'School', icon: '🏫', x: 77, y: 39, prompts: ['Your teacher has turned into a penguin. What should the class do?', 'Invent the funniest subject anyone could study.', 'Explain three school rules to an alien student.'] },
  { id: 8, name: 'Police Station', icon: '👮', x: 87, y: 56, prompts: ['Someone stole all the town’s left shoes. Interview a suspect.', 'A detective found a banana, a key, and a feather. Solve the mystery.', 'Give directions to a visitor who is lost.'] },
  { id: 9, name: 'Cinema', icon: '🎬', x: 74, y: 64, prompts: ['Describe a movie called Attack of the Giant Sandwich.', 'Convince your friend to watch a ridiculous new movie.', 'Tell us about the funniest movie you can imagine.'] },
  { id: 10, name: 'Museum', icon: '🏛️', x: 58, y: 62, prompts: ['A dinosaur skeleton came alive and began dancing. What happens?', 'Describe three very strange things in a museum.', 'Explain why one unusual object should be valuable.'] },
  { id: 11, name: 'Restaurant', icon: '🍜', x: 33, y: 67, prompts: ['The chef only serves invisible spaghetti. Complain politely.', 'Order dinner for a very picky monster.', 'The waiter is a robot that misunderstands everything. What do you say?'] },
  { id: 12, name: 'Toy Shop', icon: '🧸', x: 19, y: 67, prompts: ['All the toys wake up at midnight. Tell their story.', 'Invent a toy that teaches children English.', 'Choose one magical toy and explain what it does.'] },
]
const blank = (): State => ({ players: [{ id: 1, name: 'Player 1', color: COLORS[0], at: 1 }], active: 1, roll: null, stop: 1, prompt: 0, custom: '', round: 0 })
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
      ...state, roll: result, stop: at, prompt: dice() % place(at).prompts.length, custom: '',
      players: state.players.map(p => p.id === state.active ? { ...p, at } : p),
    }
  }
  if (action.kind === 'changePrompt') return state.roll ? { ...state, prompt: (state.prompt + 1) % place(state.stop).prompts.length, custom: '' } : state
  if (action.kind === 'ask') return state.roll ? { ...state, custom: action.value.slice(0, 300) } : state
  if (action.kind === 'next') {
    if (!state.roll) return state
    const idx = state.players.findIndex(p => p.id === state.active)
    return { ...state, roll: null, active: state.players[(idx + 1) % state.players.length].id, round: state.round + 1, custom: '' }
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
    const existing = sessionStorage.getItem('town-lab-room')
    if (existing && /^[a-f0-9]{36}$/.test(existing)) return existing
    const id = roomCode(); sessionStorage.setItem('town-lab-room', id); return id
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
  const [consent, setConsent] = useState(false)
  const pairUrl = location.origin + '/town?controller=' + room
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
    const channel = supabase.channel('town-lab:' + room, { config: { broadcast: { self: false }, presence: { key: isPhone ? 'phone' : 'tv' } } })
    channelRef.current = channel
    channel.on('broadcast', { event: 'request' }, () => {
      if (!isPhone) { setPaired(true); send('state', { state: stateRef.current }); send('ready') }
    })
    channel.on('broadcast', { event: 'ready' }, () => { if (isPhone) { setPaired(true); setConnection('Paired with Town TV'); send('request') } })
    channel.on('broadcast', { event: 'state' }, ({ payload }: { payload: EventPayload }) => {
      if (!isPhone || !payload.state) return
      stateRef.current = payload.state
      setState(payload.state)
      setConnection('Paired with Town TV')
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
    recorderRef.current?.state === 'recording' && recorderRef.current.stop()
    streamRef.current?.getTracks().forEach(t => t.stop())
    audioUrls.current.forEach(u => URL.revokeObjectURL(u))
  }, [])

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
      setMessage('Recording on this phone only.')
    } catch { setMessage('Microphone permission not granted.'); setRecording(false) }
  }

  const finish = () => {
    if (recording || !state.roll) return
    setRounds(old => [...old, { name: activePlayer.name, location: stop.name, roll: total!, question, notes: notes.trim() || '(No written response)' }])
    setNotes('')
    run({ kind: 'next' })
  }
  const transcript = () => [
    'TOWN — SPEAKING LESSON', new Date().toLocaleString(), '',
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
        <div><small>THE LAB · REMOTE CONTROL</small><h1>TOWN <span>🎲</span></h1></div>
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
            <button type="button" className="town-primary" disabled={Boolean(state.roll) || recording} onClick={() => run({ kind: 'roll' })}>{state.roll ? 'Dice rolled — answer below' : '🎲 ROLL TWO DICE'}</button>
          </section>
          {state.roll && <section className="town-card town-prompt-card">
            <small>DESTINATION {total}</small><h2>{stop.icon} {stop.name}</h2>
            <p className="town-prompt">{question}</p>
            <div className="town-phone-actions"><button type="button" onClick={speak}>▶ Play question</button><button type="button" onClick={() => run({ kind: 'changePrompt' })}>↻ New question</button></div>
            <input value={state.custom} onChange={e => run({ kind: 'ask', value: e.target.value })} maxLength={300} aria-label="Teacher custom question" placeholder="Or write your own question…" />
            <label className="town-consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /> I have permission to record this child's voice.</label>
            <button type="button" className={'town-rec-btn' + (recording ? ' recording' : '')} onClick={() => void record()}>{recording ? '■ STOP RECORDING' : '● Record spoken answer'}</button>
            <textarea aria-label="Child transcript or teacher notes" value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Optional: type the child's response or teacher notes here." />
            <button type="button" className="town-next" onClick={finish} disabled={recording}>✓ Complete turn · Next player</button>
          </section>}
          <section className="town-card town-foot-card">
            <h2>Lesson notes <small>{rounds.length} turns</small></h2>
            {clips.map(c => <a className="town-download" key={c.id} href={c.url} download={c.filename}>↓ Download audio · {c.name}</a>)}
            <div className="town-phone-actions"><button type="button" onClick={() => save('town-lesson.txt', transcript())}>↓ Export notes</button><button type="button" onClick={() => void copy(prompt()).then(() => setMessage('ChatGPT learning prompt copied.')).catch(() => save('town-chatgpt-prompt.txt', prompt()))}>Copy ChatGPT prompt</button></div>
            <p>Voice recordings remain only in this phone browser until downloaded. No automatic transcription or cloud audio upload.</p>
            <button type="button" className="town-reset" onClick={() => { if (window.confirm('Reset the game? Download audio and notes first.')) { run({ kind: 'reset' }); setRounds([]); setNotes('') } }}>Reset game</button>
          </section>
        </>}
        {message && <p className="town-toast" role="status">{message}</p>}
      </div>
    </div>
  )

  return (
    <div className="town town-tv">
      <div className="town-city-visual" aria-hidden="true" />
      <div className="town-tv-vignette" />
      <header className="town-tv-header">
        <div className="town-brand"><small>THE LAB · CLASSROOM ADVENTURE</small><h1>TOWN</h1><span>THE WHOLE CITY IS YOUR CLASSROOM</span></div>
        <div className="town-tv-top-actions">
          <span className={'town-link-status' + (paired ? ' on' : '')}>{paired ? '● Phone paired' : '○ Waiting for phone'}</span>
          <button type="button" onClick={() => document.documentElement.requestFullscreen?.()} aria-label="Enter fullscreen">⛶ Full screen</button>
        </div>
      </header>

      <div className="town-tv-locations">
        {STOPS.slice(1).map(s => (
          <div key={s.id} className={'town-pin' + (state.roll && state.stop === s.id ? ' selected' : '')}
            style={{ left: s.x + '%', top: s.y + '%' }} title={s.name}>
            <span>{s.icon}</span><b>{s.name}</b>
          </div>
        ))}
        {state.players.map((p, i) => {
          const site = place(p.at)
          const x = site.x + ((i % 3) - 1) * 1.25
          const y = site.y + 6 + Math.floor(i / 3) * 4
          return <div key={p.id} className={'town-avatar' + (p.id === state.active ? ' current' : '')} style={{ left: x + '%', top: y + '%', background: p.color }} title={p.name}>{p.name[0].toUpperCase()}</div>
        })}
      </div>

      <section className="town-tv-bottom">
        <div className="town-current-turn"><small>NOW PLAYING</small><strong>{activePlayer.name}</strong><div>{state.roll ? 'Arrived at ' + stop.name : 'Ready to roll!'}</div></div>
        <div className="town-tv-dice"><span>{state.roll?.[0] ?? '⚀'}</span><span>{state.roll?.[1] ?? '⚀'}</span><b>{total ?? '—'}</b></div>
        <div className="town-turn-hint">{state.roll ? stop.icon + '  ' + stop.name : 'Scan the QR code, then roll from your phone.'}</div>
      </section>

      <aside className={'town-pair-card' + (paired ? ' paired' : '')}>
        {paired ? <><strong>Phone controller connected</strong><p>Roll the dice and ask questions from your phone.</p><button type="button" onClick={() => setPaired(false)}>Show QR again</button></> : <>
          <strong>SCAN TO PLAY</strong><QR value={pairUrl} /><span>Open your phone camera and scan this code.</span><button type="button" onClick={() => void copy(pairUrl).then(() => setMessage('Controller link copied'))}>Copy phone link</button>
          <small>{connection}</small>
        </>}
      </aside>
      <a href="/" className="town-leave">‹ Back to Lab</a>
      {message && <div className="town-tv-message" role="status">{message}</div>}
    </div>
  )
}
