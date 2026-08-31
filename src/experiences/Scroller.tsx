import { useEffect, useMemo, useRef, useState } from 'react'
import './scroller.css'

type ScrollerProps = { onExit: () => void }

const TEXT_KEY = 'lab-scroller-text'
const VOICE_KEY = 'lab-scroller-voice'
const RATE_KEY = 'lab-scroller-rate'
const PITCH_KEY = 'lab-scroller-pitch'

const FEMININE_VOICE_HINTS = [
  'female', 'woman', 'girl',
  'samantha', 'victoria', 'karen', 'moira', 'tessa', 'fiona', 'serena',
  'ava', 'allison', 'susan', 'zira', 'hazel', 'aria', 'jenny', 'sonia',
  'natasha', 'emma', 'olivia', 'joanna', 'kendra', 'kimberly', 'salli',
  'ivy', 'amy', 'nicole', 'raveena', 'veena', 'lekha', 'sangeeta',
  'heera', 'catherine', 'ellen', 'luciana', 'mariska', 'paulina',
  'helena', 'laura', 'alice', 'elsa', 'cosima', 'katrin', 'anna',
  'amelie', 'claire', 'audrey', 'julie', 'google us english',
]

function looksFeminine(voice: SpeechSynthesisVoice) {
  const haystack = `${voice.name} ${voice.voiceURI}`.toLowerCase()
  return FEMININE_VOICE_HINTS.some(hint => haystack.includes(hint))
}

function splitForSpeech(text: string, maxChars = 260) {
  const chunks: { text: string; start: number; end: number }[] = []
  let cursor = 0

  while (cursor < text.length) {
    while (cursor < text.length && /\s/.test(text[cursor])) cursor++
    if (cursor >= text.length) break

    let end = Math.min(text.length, cursor + maxChars)
    if (end < text.length) {
      const slice = text.slice(cursor, end)
      const sentenceBreak = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('? '), slice.lastIndexOf('! '))
      const whitespaceBreak = slice.lastIndexOf(' ')
      const preferred = sentenceBreak >= Math.floor(maxChars * 0.45) ? sentenceBreak + 1 : whitespaceBreak
      if (preferred > 0) end = cursor + preferred
    }

    const spoken = text.slice(cursor, end).trim()
    if (spoken) chunks.push({ text: spoken, start: cursor, end })
    cursor = end
  }

  return chunks
}

function estimateDurationMs(text: string, rate: number) {
  const words = Math.max(1, text.trim().split(/\s+/).length)
  const wordsPerMinute = 175 * rate
  return Math.max(650, (words / wordsPerMinute) * 60_000)
}

export function Scroller({ onExit }: ScrollerProps) {
  const [text, setText] = useState(() => localStorage.getItem(TEXT_KEY) || '')
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [selectedVoiceName, setSelectedVoiceName] = useState(() => localStorage.getItem(VOICE_KEY) || '')
  const [rate, setRate] = useState(() => Number(localStorage.getItem(RATE_KEY) || '0.95'))
  const [pitch, setPitch] = useState(() => Number(localStorage.getItem(PITCH_KEY) || '1.25'))
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [message, setMessage] = useState('')
  const firstCopyRef = useRef<HTMLDivElement>(null)
  const [copyHeight, setCopyHeight] = useState(1)
  const generationRef = useRef(0)
  const animationRef = useRef<number | null>(null)

  const feminineVoices = useMemo(
    () => voices
      .filter(looksFeminine)
      .sort((a, b) => {
        const aEnglish = a.lang.toLowerCase().startsWith('en') ? 0 : 1
        const bEnglish = b.lang.toLowerCase().startsWith('en') ? 0 : 1
        return aEnglish - bEnglish || a.name.localeCompare(b.name)
      }),
    [voices],
  )

  const selectedVoice = useMemo(
    () => feminineVoices.find(voice => voice.name === selectedVoiceName) || feminineVoices[0],
    [feminineVoices, selectedVoiceName],
  )

  useEffect(() => {
    if (!('speechSynthesis' in window)) {
      setMessage('This browser does not provide text-to-speech.')
      return
    }

    const loadVoices = () => setVoices(window.speechSynthesis.getVoices())
    loadVoices()
    window.speechSynthesis.addEventListener?.('voiceschanged', loadVoices)
    return () => window.speechSynthesis.removeEventListener?.('voiceschanged', loadVoices)
  }, [])

  useEffect(() => {
    if (!selectedVoiceName && feminineVoices[0]) {
      setSelectedVoiceName(feminineVoices[0].name)
    }
  }, [feminineVoices, selectedVoiceName])

  useEffect(() => {
    const node = firstCopyRef.current
    if (!node) return

    const update = () => setCopyHeight(Math.max(1, node.getBoundingClientRect().height))
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [text])

  useEffect(() => {
    return () => {
      generationRef.current += 1
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current)
      window.speechSynthesis?.cancel()
    }
  }, [])

  function saveText(value: string) {
    setText(value)
    localStorage.setItem(TEXT_KEY, value)
  }

  function saveVoice(name: string) {
    setSelectedVoiceName(name)
    localStorage.setItem(VOICE_KEY, name)
  }

  function saveRate(value: number) {
    setRate(value)
    localStorage.setItem(RATE_KEY, String(value))
  }

  function savePitch(value: number) {
    setPitch(value)
    localStorage.setItem(PITCH_KEY, String(value))
  }

  function stop() {
    generationRef.current += 1
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }
    window.speechSynthesis.cancel()
    setRunning(false)
    setMessage('')
  }

  function animateChunk(from: number, to: number, durationMs: number, generation: number) {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current)
    const started = performance.now()

    const tick = (now: number) => {
      if (generation !== generationRef.current) return
      const fraction = Math.min(1, (now - started) / durationMs)
      setProgress(from + (to - from) * fraction)
      if (fraction < 1) animationRef.current = requestAnimationFrame(tick)
    }

    animationRef.current = requestAnimationFrame(tick)
  }

  function start() {
    const cleanText = text.trim()
    if (!cleanText) {
      setMessage('Paste some text first.')
      return
    }
    if (!selectedVoice) {
      setMessage('No clearly feminine voice was identified on this device.')
      return
    }

    window.speechSynthesis.cancel()
    generationRef.current += 1
    const generation = generationRef.current
    const chunks = splitForSpeech(cleanText)
    if (!chunks.length) return

    setRunning(true)
    setMessage('')
    setProgress(0)

    const speakChunk = (index: number) => {
      if (generation !== generationRef.current) return
      const chunk = chunks[index]
      const utterance = new SpeechSynthesisUtterance(chunk.text)
      utterance.voice = selectedVoice
      utterance.rate = rate
      utterance.pitch = pitch

      const from = chunk.start / cleanText.length
      const to = chunk.end / cleanText.length
      utterance.onstart = () => animateChunk(from, to, estimateDurationMs(chunk.text, rate), generation)
      utterance.onboundary = event => {
        if (generation !== generationRef.current || typeof event.charIndex !== 'number') return
        const exact = Math.min(1, (chunk.start + event.charIndex) / cleanText.length)
        setProgress(exact)
      }
      utterance.onerror = event => {
        if (generation !== generationRef.current) return
        setRunning(false)
        setMessage(`Speech stopped: ${event.error || 'voice error'}.`)
      }
      utterance.onend = () => {
        if (generation !== generationRef.current) return
        if (animationRef.current !== null) cancelAnimationFrame(animationRef.current)
        setProgress(to)

        const nextIndex = index + 1
        if (nextIndex < chunks.length) {
          speakChunk(nextIndex)
          return
        }

        // The second text copy is now in exactly the same visual position as
        // the first copy was at progress 0, so resetting is visually seamless.
        setProgress(0)
        requestAnimationFrame(() => {
          if (generation === generationRef.current) speakChunk(0)
        })
      }

      window.speechSynthesis.speak(utterance)
    }

    speakChunk(0)
  }

  function tryVoice(voice: SpeechSynthesisVoice) {
    if (running) stop()
    saveVoice(voice.name)
    window.speechSynthesis.cancel()
    const sample = new SpeechSynthesisUtterance('Hi Ashley. This is Scroller. I can read this for you.')
    sample.voice = voice
    sample.rate = rate
    sample.pitch = pitch
    window.speechSynthesis.speak(sample)
  }

  const ready = Boolean(text.trim() && selectedVoice)

  return (
    <main className="scroller-shell">
      <header className="scroller-header">
        <button className="scroller-back" onClick={() => { stop(); onExit() }}>← Lab</button>
        <div>
          <div className="scroller-eyebrow">The Lab</div>
          <h1>Scroller</h1>
        </div>
        <button className={`scroller-run ${running ? 'is-stop' : ''}`} onClick={running ? stop : start} disabled={!running && !ready}>
          {running ? 'Stop' : 'Start'}
        </button>
      </header>

      <section className="scroller-controls">
        <label className="scroller-paste">
          <span>Text</span>
          <textarea
            value={text}
            onChange={event => saveText(event.target.value)}
            placeholder="Paste text here…"
            disabled={running}
          />
        </label>

        <div className="scroller-settings-row">
          <label>
            <span>Speed <strong>{rate.toFixed(2)}×</strong></span>
            <input type="range" min="0.7" max="1.35" step="0.05" value={rate} onChange={event => saveRate(Number(event.target.value))} disabled={running} />
          </label>
          <label>
            <span>Pitch <strong>{pitch.toFixed(2)}</strong></span>
            <input type="range" min="0.9" max="1.6" step="0.05" value={pitch} onChange={event => savePitch(Number(event.target.value))} disabled={running} />
          </label>
        </div>

        <div className="scroller-voices">
          <div className="scroller-section-title">
            <strong>Voice</strong>
            <span>Only voices identifiable as feminine are shown.</span>
          </div>
          {feminineVoices.length ? (
            <div className="scroller-voice-list">
              {feminineVoices.map(voice => (
                <button
                  key={voice.voiceURI || voice.name}
                  className={selectedVoice?.name === voice.name ? 'selected' : ''}
                  onClick={() => tryVoice(voice)}
                  disabled={running}
                >
                  <strong>{voice.name}</strong>
                  <small>{voice.lang} · Try</small>
                </button>
              ))}
            </div>
          ) : (
            <div className="scroller-no-voices">
              No clearly feminine browser voice was identified. Android/browser voice names do not reliably report gender, so Scroller will not guess.
            </div>
          )}
        </div>

        {message && <div className="scroller-message" role="status">{message}</div>}
      </section>

      <section className={`scroller-stage ${running ? 'is-running' : ''}`} aria-label="Scrolling text">
        {text.trim() ? (
          <div
            className="scroller-track"
            style={{ transform: `translate3d(0, -${progress * copyHeight}px, 0)` }}
          >
            <div ref={firstCopyRef} className="scroller-copy">{text.trim()}</div>
            <div className="scroller-copy" aria-hidden="true">{text.trim()}</div>
          </div>
        ) : (
          <div className="scroller-empty">Paste text above to begin.</div>
        )}
      </section>
    </main>
  )
}
