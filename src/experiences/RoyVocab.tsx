import { useEffect, useRef, useState } from 'react'
import { releaseRecordingStream, startRecordingSession, type RecordingSession } from '../lib/voiceCapture'
import { clearRoyAudioJobs, deleteRoyAudioJob, listRoyAudioJobs, saveRoyAudioJob, type RoyAudioJob } from '../lib/royQueue'
import './roy-vocab.css'
import './roy-errors.css'

type RoyVocabProps = { onExit: () => void; pin: string }
type Result = 'correct' | 'incorrect'
type VocabItem = { word: string; answers: string[] }
type TranscriptionMode = 'android' | 'openai-mini' | 'openai-full'
type RecognitionResultLike = { length: number; [index: number]: { transcript: string } }
type RecognitionEventLike = { results: { length: number; [index: number]: RecognitionResultLike } }
type RecognitionErrorLike = { error: string }
type KoreanRecognizer = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: RecognitionEventLike) => void) | null
  onerror: ((event: RecognitionErrorLike) => void) | null
  onend: (() => void) | null
}

const ROY_TRANSCRIPTION_MODE_KEY = 'roy-transcription-mode-v1'
const TRANSCRIPTION_LABELS: Record<TranscriptionMode, string> = {
  android: 'Android',
  'openai-mini': 'OpenAI Mini',
  'openai-full': 'OpenAI Full',
}

function getKoreanRecognizer() {
  const speechWindow = window as typeof window & {
    SpeechRecognition?: new () => KoreanRecognizer
    webkitSpeechRecognition?: new () => KoreanRecognizer
  }
  return speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition
}

function loadSavedTranscriptionMode(): TranscriptionMode {
  const saved = localStorage.getItem(ROY_TRANSCRIPTION_MODE_KEY)
  return saved === 'android' || saved === 'openai-full' || saved === 'openai-mini' ? saved : 'openai-mini'
}

const items: VocabItem[] = [
  { word: 'further', answers: ['더 멀리', '더 나아가', '추가의', '더욱'] },
  { word: 'cause', answers: ['원인', '야기하다', '일으키다', '초래하다'] },
  { word: 'safeguard', answers: ['보호하다', '지키다', '보호 장치', '안전장치'] },
  { word: 'professional', answers: ['전문적인', '전문가', '직업적인'] },
  { word: 'dietary', answers: ['식이의', '음식의', '식사의'] },
  { word: 'disclosure', answers: ['공개', '폭로', '공시'] },
  { word: 'suspicion', answers: ['의심', '혐의'] },
  { word: 'fund (verb)', answers: ['자금을 대다', '자금을 제공하다', '자금 지원하다', '지원하다'] },
  { word: 'decade', answers: ['십 년', '10년', '십년'] },
  { word: 'expert', answers: ['전문가', '숙련된', '전문적인'] },
  { word: 'generation', answers: ['세대', '발생', '생성'] },
  { word: 'trust', answers: ['신뢰', '믿다', '신뢰하다', '믿음'] },
  { word: 'compulsory', answers: ['의무적인', '강제적인', '필수의', '필수적인'] },
  { word: 'influential', answers: ['영향력 있는', '영향력이 있는'] },
  { word: 'pattern', answers: ['패턴', '양식', '무늬', '유형'] },
  { word: 'diabetes', answers: ['당뇨병', '당뇨'] },
  { word: 'article', answers: ['기사', '물품', '관사', '조항'] },
  { word: 'industry', answers: ['산업', '공업'] },
  { word: 'fuel (verb)', answers: ['연료를 공급하다', '부채질하다', '악화시키다', '불을 붙이다'] },
  { word: 'nation', answers: ['국가', '나라', '국민'] },
  { word: 'process', answers: ['과정', '절차', '처리하다', '가공하다'] },
  { word: 'appeal', answers: ['호소하다', '항소하다', '매력', '호소', '항소'] },
  { word: 'rise', answers: ['오르다', '상승하다', '증가하다'] },
  { word: 'source', answers: ['원천', '출처', '근원'] },
  { word: 'essential', answers: ['필수적인', '본질적인', '필수의', '핵심적인'] },
  { word: 'author', answers: ['작가', '저자', '지은이'] },
  { word: 'discourage', answers: ['낙담시키다', '막다', '단념시키다', '의욕을 꺾다'] },
  { word: 'scientific', answers: ['과학적인', '과학의'] },
  { word: 'obesity', answers: ['비만'] },
  { word: 'peer', answers: ['또래', '동료', '동년배'] },
  { word: 'implicate', answers: ['연루시키다', '관련시키다', '관련되게 하다'] },
  { word: 'perceive', answers: ['인식하다', '알아차리다', '지각하다'] },
  { word: 'widely', answers: ['널리', '폭넓게'] },
  { word: 'submit', answers: ['제출하다', '굴복하다', '복종하다'] },
  { word: 'fully', answers: ['완전히', '충분히', '전적으로'] },
  { word: 'shape', answers: ['모양', '형태', '형성하다'] },
  { word: 'reveal', answers: ['드러내다', '밝히다', '공개하다'] },
  { word: 'standard', answers: ['기준', '표준', '수준'] },
  { word: 'conduct', answers: ['수행하다', '행동', '지휘하다', '실시하다'] },
  { word: 'researcher', answers: ['연구원', '연구자'] },
  { word: 'in spite of', answers: ['에도 불구하고', '그럼에도 불구하고'] },
  { word: 'review', answers: ['검토', '복습', '검토하다', '평가', '평가하다'] },
  { word: 'critical', answers: ['비판적인', '중요한', '위기의', '결정적인'] },
  { word: 'funding', answers: ['자금', '자금 지원', '재정 지원'] },
  { word: 'claim', answers: ['주장하다', '주장', '청구하다', '요구하다'] },
  { word: 'scrutiny', answers: ['정밀 조사', '면밀한 검토', '정밀한 조사'] },
  { word: 'skepticism', answers: ['회의론', '회의주의', '의심'] },
  { word: 'biased', answers: ['편향된', '치우친', '편견이 있는'] },
  { word: 'objectivity', answers: ['객관성'] },
  { word: 'evaluate', answers: ['평가하다', '판단하다'] },
]

const normalize = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
const MicIcon = () => <svg className="roy-mic-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3Zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5Zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2Z"/></svg>
const ROY_ANSWERS_KEY = 'roy-vocabulary-answers-v1'
const loadSavedAnswers = () => {
  try { return JSON.parse(localStorage.getItem(ROY_ANSWERS_KEY) || '{}') as Record<number, string> } catch { return {} }
}
const isAccepted = (spoken: string, accepted: string[]) => {
  const heard = normalize(spoken)
  return heard.length > 1 && accepted.some(answer => {
    const expected = normalize(answer)
    return heard === expected || heard.includes(expected) || expected.includes(heard)
  })
}

export function RoyVocab({ onExit, pin }: RoyVocabProps) {
  const [answers, setAnswers] = useState<Record<number, string>>(loadSavedAnswers)
  const [results, setResults] = useState<Record<number, Result>>({})
  const [rowMessage, setRowMessage] = useState<Record<number, string>>({})
  const [errorIndices, setErrorIndices] = useState<number[]>([])
  const [recordingIndex, setRecordingIndex] = useState<number | null>(null)
  const [processingIndices, setProcessingIndices] = useState<number[]>([])
  const [activeProcessingIndex, setActiveProcessingIndex] = useState<number | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [transcriptionMode, setTranscriptionMode] = useState<TranscriptionMode>(loadSavedTranscriptionMode)
  const sessionRef = useRef<RecordingSession | null>(null)
  const pressingRef = useRef(false)
  const activeIndexRef = useRef<number | null>(null)
  const startedAtRef = useRef(0)
  const lastTranscriptionStartedRef = useRef(0)
  const queueRunningRef = useRef(false)
  const mountedRef = useRef(true)
  const recognizerRef = useRef<KoreanRecognizer | null>(null)
  const recognizedTextRef = useRef('')
  const recognitionIndexRef = useRef<number | null>(null)
  const recognitionErrorRef = useRef(false)
  const recognitionStartedAtRef = useRef(0)

  const answeredCount = Object.values(answers).filter(answer => answer.trim()).length
  const capturedCount = new Set([...Object.keys(answers).filter(key => answers[Number(key)]?.trim()).map(Number), ...processingIndices]).size
  const correctCount = Object.values(results).filter(result => result === 'correct').length
  const androidAvailable = Boolean(getKoreanRecognizer())

  useEffect(() => {
    mountedRef.current = true
    void listRoyAudioJobs().then(jobs => {
      if (!mountedRef.current) return
      const pending = [...new Set(jobs.map(job => job.itemIndex))]
      setProcessingIndices(pending)
      setRowMessage(previous => ({ ...previous, ...Object.fromEntries(pending.map(index => [index, 'Saved on phone · waiting to transcribe…'])) }))
      void processQueue()
    })
    const resume = () => void processQueue()
    window.addEventListener('online', resume)
    return () => {
      mountedRef.current = false
      pressingRef.current = false
      recognizerRef.current?.abort()
      sessionRef.current?.stop()
      releaseRecordingStream()
      window.removeEventListener('online', resume)
    }
  }, [])

  useEffect(() => { localStorage.setItem(ROY_ANSWERS_KEY, JSON.stringify(answers)) }, [answers])
  useEffect(() => { localStorage.setItem(ROY_TRANSCRIPTION_MODE_KEY, transcriptionMode) }, [transcriptionMode])

  async function processQueue() {
    if (queueRunningRef.current || !navigator.onLine) return
    queueRunningRef.current = true
    try {
      while (navigator.onLine) {
        const [job] = await listRoyAudioJobs()
        if (!job) break
        if (!mountedRef.current) break
        setProcessingIndices(indices => indices.includes(job.itemIndex) ? indices : [...indices, job.itemIndex])
        const queueDelay = Math.max(0, 6500 - (Date.now() - lastTranscriptionStartedRef.current))
        if (queueDelay) await new Promise(resolve => window.setTimeout(resolve, queueDelay))
        lastTranscriptionStartedRef.current = Date.now()
        const jobMode = job.transcriptionMode || 'openai-mini'
        const modelLabel = TRANSCRIPTION_LABELS[jobMode]
        const transcriptionStartedAt = performance.now()
        setActiveProcessingIndex(job.itemIndex)
        setRowMessage(previous => ({ ...previous, [job.itemIndex]: `${modelLabel} · 말한 내용을 글자로 바꾸고 있어요…` }))
        try {
          const extension = job.blob.type.includes('mp4') ? 'm4a' : 'webm'
          const form = new FormData()
          form.append('audio', job.blob, `roy-${job.id}.${extension}`)
          const controller = new AbortController()
          const timeout = window.setTimeout(() => controller.abort(), 20000)
          const response = await fetch('/api/transcribe', {
            method: 'POST',
            headers: { 'x-review-pin': pin, 'x-transcription-language': 'ko', 'x-transcription-model': jobMode },
            body: form,
            signal: controller.signal,
          }).finally(() => window.clearTimeout(timeout))
          const data = await response.json() as { text?: string; error?: string }
          if (response.ok) {
            const transcript = (data.text || '').trim()
            if (!transcript) throw new Error('no-speech')
            const newerJobExists = (await listRoyAudioJobs()).some(candidate => candidate.itemIndex === job.itemIndex && candidate.id !== job.id)
            await deleteRoyAudioJob(job.id)
            if (!newerJobExists && mountedRef.current) {
              const seconds = ((performance.now() - transcriptionStartedAt) / 1000).toFixed(1)
              setAnswers(previous => ({ ...previous, [job.itemIndex]: transcript }))
              setErrorIndices(indices => indices.filter(value => value !== job.itemIndex))
              setRowMessage(previous => ({ ...previous, [job.itemIndex]: `${modelLabel} · ${seconds}s · 필요하면 글자를 눌러 고치세요.` }))
              setProcessingIndices(indices => indices.filter(value => value !== job.itemIndex))
            }
            setActiveProcessingIndex(null)
            continue
          }
          if (response.status === 422) {
            await deleteRoyAudioJob(job.id)
            if (mountedRef.current) {
              setErrorIndices(indices => indices.includes(job.itemIndex) ? indices : [...indices, job.itemIndex])
              setRowMessage(previous => ({ ...previous, [job.itemIndex]: "Sorry, I didn't understand. Please try again." }))
              setProcessingIndices(indices => indices.filter(value => value !== job.itemIndex))
            }
            setActiveProcessingIndex(null)
            continue
          }
          await deleteRoyAudioJob(job.id)
          if (mountedRef.current) {
            setErrorIndices(indices => indices.includes(job.itemIndex) ? indices : [...indices, job.itemIndex])
            setRowMessage(previous => ({ ...previous, [job.itemIndex]: 'Transcription failed. Please record it again.' }))
            setProcessingIndices(indices => indices.filter(value => value !== job.itemIndex))
          }
          setActiveProcessingIndex(null)
          continue
        } catch {
          if (!navigator.onLine) {
            if (mountedRef.current) setRowMessage(previous => ({ ...previous, [job.itemIndex]: 'Saved on phone · waiting for connection…' }))
            break
          }
          await deleteRoyAudioJob(job.id)
          if (mountedRef.current) {
            setErrorIndices(indices => indices.includes(job.itemIndex) ? indices : [...indices, job.itemIndex])
            setRowMessage(previous => ({ ...previous, [job.itemIndex]: 'Transcription failed. Please record it again.' }))
            setProcessingIndices(indices => indices.filter(value => value !== job.itemIndex))
          }
          setActiveProcessingIndex(null)
          continue
        }
      }
    } finally {
      queueRunningRef.current = false
      if (mountedRef.current) setActiveProcessingIndex(null)
    }
  }

  function editAnswer(index: number, value: string) {
    setAnswers(previous => ({ ...previous, [index]: value }))
    setRowMessage(previous => ({ ...previous, [index]: '' }))
    setErrorIndices(indices => indices.filter(value => value !== index))
    if (submitted) setResults(previous => {
      const next = { ...previous }
      delete next[index]
      return next
    })
  }

  async function startAnswer(event: React.PointerEvent<HTMLButtonElement>, index: number) {
    event.preventDefault()
    if (pressingRef.current || recordingIndex !== null || processingIndices.includes(index)) return
    if (transcriptionMode === 'android' && recognizerRef.current) {
      setRowMessage(previous => ({ ...previous, [index]: 'Android가 이전 단어를 마무리하고 있어요…' }))
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    pressingRef.current = true
    activeIndexRef.current = index
    setErrorIndices(indices => indices.filter(value => value !== index))
    setRecordingIndex(index)
    setRowMessage(previous => ({ ...previous, [index]: '듣고 있어요…' }))
    if (transcriptionMode === 'android') {
      const Recognizer = getKoreanRecognizer()
      if (!Recognizer) {
        pressingRef.current = false
        activeIndexRef.current = null
        setRecordingIndex(null)
        setErrorIndices(indices => indices.includes(index) ? indices : [...indices, index])
        setRowMessage(previous => ({ ...previous, [index]: '이 브라우저에서는 Android 음성 인식을 사용할 수 없어요.' }))
        return
      }
      releaseRecordingStream()
      const recognizer = new Recognizer()
      recognizer.lang = 'ko-KR'
      recognizer.continuous = false
      recognizer.interimResults = true
      recognizer.maxAlternatives = 1
      recognizerRef.current = recognizer
      recognitionIndexRef.current = index
      recognizedTextRef.current = ''
      recognitionErrorRef.current = false
      recognitionStartedAtRef.current = performance.now()
      recognizer.onresult = resultEvent => {
        let text = ''
        for (let resultIndex = 0; resultIndex < resultEvent.results.length; resultIndex += 1) {
          text += `${resultEvent.results[resultIndex][0]?.transcript || ''} `
        }
        recognizedTextRef.current = text.trim()
      }
      recognizer.onerror = errorEvent => {
        if (errorEvent.error === 'aborted') return
        recognitionErrorRef.current = true
        setErrorIndices(indices => indices.includes(index) ? indices : [...indices, index])
        setRowMessage(previous => ({ ...previous, [index]: errorEvent.error === 'no-speech' ? 'Android · 말을 듣지 못했어요. 다시 해보세요.' : 'Android 음성 인식을 다시 시도해 주세요.' }))
      }
      recognizer.onend = () => {
        const targetIndex = recognitionIndexRef.current
        const hangul = recognizedTextRef.current.replace(/[A-Za-z]+/g, '').replace(/\s+/g, ' ').trim()
        const seconds = ((performance.now() - recognitionStartedAtRef.current) / 1000).toFixed(1)
        recognizerRef.current = null
        recognitionIndexRef.current = null
        pressingRef.current = false
        activeIndexRef.current = null
        if (!mountedRef.current || targetIndex === null) return
        setRecordingIndex(null)
        setProcessingIndices(indices => indices.filter(value => value !== targetIndex))
        if (hangul && /[가-힣]/.test(hangul)) {
          setAnswers(previous => ({ ...previous, [targetIndex]: hangul }))
          setErrorIndices(indices => indices.filter(value => value !== targetIndex))
          setRowMessage(previous => ({ ...previous, [targetIndex]: `Android · ${seconds}s · 필요하면 글자를 눌러 고치세요.` }))
        } else if (!recognitionErrorRef.current) {
          setErrorIndices(indices => indices.includes(targetIndex) ? indices : [...indices, targetIndex])
          setRowMessage(previous => ({ ...previous, [targetIndex]: 'Android · 한글을 듣지 못했어요. 다시 말해 보세요.' }))
        }
      }
      try {
        recognizer.start()
      } catch {
        recognizerRef.current = null
        recognitionIndexRef.current = null
        pressingRef.current = false
        activeIndexRef.current = null
        setRecordingIndex(null)
        setErrorIndices(indices => indices.includes(index) ? indices : [...indices, index])
        setRowMessage(previous => ({ ...previous, [index]: 'Android 음성 인식을 시작하지 못했어요.' }))
      }
      return
    }
    try {
      const session = await startRecordingSession({ keepStreamAlive: true })
      if (!pressingRef.current || activeIndexRef.current !== index) {
        session.stop()
        await session.blobPromise
        setRecordingIndex(null)
        setRowMessage(previous => ({ ...previous, [index]: '조금 더 길게 누르고 말하세요.' }))
        return
      }
      sessionRef.current = session
      startedAtRef.current = performance.now()
    } catch (error) {
      pressingRef.current = false
      activeIndexRef.current = null
      setRecordingIndex(null)
      setRowMessage(previous => ({ ...previous, [index]: error instanceof Error ? error.message : '마이크를 열 수 없어요.' }))
    }
  }

  async function finishAnswer(event: React.PointerEvent<HTMLButtonElement>, index: number) {
    event.preventDefault()
    if (!pressingRef.current || activeIndexRef.current !== index) return
    pressingRef.current = false
    activeIndexRef.current = null
    const recognizer = recognizerRef.current
    if (recognizer && recognitionIndexRef.current === index) {
      setProcessingIndices(indices => indices.includes(index) ? indices : [...indices, index])
      setRowMessage(previous => ({ ...previous, [index]: 'Android · 마지막 소리까지 듣는 중…' }))
      window.setTimeout(() => {
        if (recognizerRef.current !== recognizer) return
        try { recognizer.stop() } catch { recognizer.abort() }
      }, 300)
      return
    }
    const session = sessionRef.current
    sessionRef.current = null
    if (!session) {
      setRecordingIndex(null)
      return
    }
    const duration = performance.now() - startedAtRef.current
    if (duration < 280) {
      session.stop()
      await session.blobPromise
      setRecordingIndex(null)
      setRowMessage(previous => ({ ...previous, [index]: '조금 더 길게 누르고 말하세요.' }))
      return
    }
    setProcessingIndices(indices => indices.includes(index) ? indices : [...indices, index])
    setRowMessage(previous => ({ ...previous, [index]: '마지막 소리까지 듣는 중… 다음 단어를 녹음해도 돼요.' }))
    await new Promise(resolve => window.setTimeout(resolve, 500))
    session.stop()
    setRecordingIndex(null)
    const blob = await session.blobPromise
    const job: RoyAudioJob = {
      id: crypto.randomUUID?.() || `${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
      itemIndex: index,
      createdAt: Date.now(),
      attempts: 0,
      transcriptionMode: transcriptionMode === 'openai-full' ? 'openai-full' : 'openai-mini',
      blob,
    }
    try {
      await saveRoyAudioJob(job)
      setRowMessage(previous => ({ ...previous, [index]: 'Saved on phone · waiting to transcribe…' }))
      void processQueue()
    } catch {
      setProcessingIndices(indices => indices.filter(value => value !== index))
      setErrorIndices(indices => indices.includes(index) ? indices : [...indices, index])
      setRowMessage(previous => ({ ...previous, [index]: 'Could not save this recording. Please retry.' }))
    }
  }

  function submit() {
    const next: Record<number, Result> = {}
    items.forEach((item, index) => { next[index] = isAccepted(answers[index] || '', item.answers) ? 'correct' : 'incorrect' })
    setResults(next)
    setSubmitted(true)
    document.querySelector('.roy-list')?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function reset() {
    await clearRoyAudioJobs()
    localStorage.removeItem(ROY_ANSWERS_KEY)
    setAnswers({})
    setResults({})
    setRowMessage({})
    setErrorIndices([])
    setActiveProcessingIndex(null)
    setSubmitted(false)
    document.querySelector('.roy-list')?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return <main className="roy-shell">
    <header className="roy-top">
      <button onClick={onExit}>← Hub</button>
      <div><span>EXPERIMENT 03</span><strong>Roy</strong></div>
      <div className="roy-top-actions">
        <button className="roy-settings-button" onClick={() => setSettingsOpen(true)} disabled={recordingIndex !== null} aria-label="Speech settings">⚙</button>
        <div className="roy-count">{capturedCount}<small> / {items.length}</small></div>
      </div>
    </header>
    <section className="roy-intro">
      <div><span>English → Korean</span><strong>{submitted ? `${correctCount} correct` : 'Hold. Say it. Release.'}</strong></div>
      <p>{submitted ? 'Tap any answer to correct it, then check again.' : `${TRANSCRIPTION_LABELS[transcriptionMode]} · Hold the mic, say the Korean meaning, then let go.`}</p>
    </section>
    <section className="roy-list">
      {items.map((item, index) => {
        const result = results[index]
        const active = recordingIndex === index
        const processing = activeProcessingIndex === index
        const queued = processingIndices.includes(index) && !processing
        const hasError = errorIndices.includes(index)
        return <article key={item.word} className={`roy-word-card${result ? ` result-${result}` : ''}${active ? ' is-recording' : ''}${processing ? ' is-processing' : ''}${queued ? ' is-queued' : ''}${hasError ? ' has-error' : ''}`}>
          <span className="roy-number">{String(index + 1).padStart(2, '0')}</span>
          <div className="roy-word-copy">
            <label htmlFor={`roy-answer-${index}`}>{item.word}</label>
            <input id={`roy-answer-${index}`} value={answers[index] || ''} onChange={event => editAnswer(index, event.target.value)} placeholder={processing ? 'The text will appear here when ready…' : queued ? 'Safely queued on this phone…' : '한국어 뜻'} readOnly={processing || queued}/>
            {rowMessage[index] && <small>{rowMessage[index]}</small>}
            {result === 'incorrect' && <em>예: {item.answers.slice(0, 3).join(' · ')}</em>}
          </div>
          <button className="roy-card-mic" onPointerDown={event => void startAnswer(event, index)} onPointerUp={event => void finishAnswer(event, index)} onPointerCancel={event => void finishAnswer(event, index)} disabled={(recordingIndex !== null && !active) || processing || queued} aria-label={`Hold to answer ${item.word}`}>
            <span className={processing ? 'roy-processing-icon' : 'roy-mic-icon-wrap'}><MicIcon/></span>
          </button>
          {result && <span className="roy-result-mark">{result === 'correct' ? '✓' : '!'}</span>}
        </article>
      })}
      <div className="roy-list-end">That’s all {items.length} words.</div>
    </section>
    <footer className="roy-submit-bar">
      <div><strong>{submitted ? `${correctCount} / ${items.length}` : `${capturedCount} captured`}</strong><small>{submitted ? 'correct' : processingIndices.length ? `${processingIndices.length} safely queued` : `${items.length - answeredCount} remaining`}</small></div>
      {submitted && <button className="roy-reset" onClick={reset}>Reset</button>}
      <button className="roy-submit" onClick={submit} disabled={recordingIndex !== null || processingIndices.length > 0}>{processingIndices.length ? `${processingIndices.length} processing` : submitted ? 'Check again' : 'Submit'}</button>
    </footer>
    {settingsOpen && <div className="roy-settings-overlay" onPointerDown={() => setSettingsOpen(false)}>
      <section className="roy-settings-panel" role="dialog" aria-modal="true" aria-labelledby="roy-settings-title" onPointerDown={event => event.stopPropagation()}>
        <header>
          <div><small>Speech settings</small><strong id="roy-settings-title">Recognition method</strong></div>
          <button onClick={() => setSettingsOpen(false)} aria-label="Close settings">×</button>
        </header>
        <div className="roy-mode-list">
          <button className={transcriptionMode === 'android' ? 'active' : ''} onClick={() => setTranscriptionMode('android')} disabled={!androidAvailable} aria-pressed={transcriptionMode === 'android'}>
            <span>Android</span><small>{androidAvailable ? 'Live recognition on this device' : 'Not available in this browser'}</small>
          </button>
          <button className={transcriptionMode === 'openai-mini' ? 'active' : ''} onClick={() => setTranscriptionMode('openai-mini')} aria-pressed={transcriptionMode === 'openai-mini'}>
            <span>OpenAI Mini</span><small>Recorded audio · faster and cheaper</small>
          </button>
          <button className={transcriptionMode === 'openai-full' ? 'active' : ''} onClick={() => setTranscriptionMode('openai-full')} aria-pressed={transcriptionMode === 'openai-full'}>
            <span>OpenAI Full</span><small>Recorded audio · highest accuracy</small>
          </button>
        </div>
        <p>New recordings use this choice. Recordings already waiting keep their original model.</p>
        <button className="roy-settings-done" onClick={() => setSettingsOpen(false)}>Done</button>
      </section>
    </div>}
  </main>
}
