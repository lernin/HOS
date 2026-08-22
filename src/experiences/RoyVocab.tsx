import { useEffect, useRef, useState } from 'react'
import { startRecordingSession, type RecordingSession } from '../lib/voiceCapture'
import './roy-vocab.css'

type RoyVocabProps = { onExit: () => void; pin: string }
type Result = 'correct' | 'incorrect'
type VocabItem = { word: string; answers: string[] }

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
const isAccepted = (spoken: string, accepted: string[]) => {
  const heard = normalize(spoken)
  return heard.length > 1 && accepted.some(answer => {
    const expected = normalize(answer)
    return heard === expected || heard.includes(expected) || expected.includes(heard)
  })
}

export function RoyVocab({ onExit, pin }: RoyVocabProps) {
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [results, setResults] = useState<Record<number, Result>>({})
  const [rowMessage, setRowMessage] = useState<Record<number, string>>({})
  const [recordingIndex, setRecordingIndex] = useState<number | null>(null)
  const [processingIndex, setProcessingIndex] = useState<number | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const sessionRef = useRef<RecordingSession | null>(null)
  const pressingRef = useRef(false)
  const activeIndexRef = useRef<number | null>(null)
  const startedAtRef = useRef(0)

  const answeredCount = Object.values(answers).filter(answer => answer.trim()).length
  const correctCount = Object.values(results).filter(result => result === 'correct').length

  useEffect(() => () => {
    pressingRef.current = false
    sessionRef.current?.stop()
  }, [])

  function editAnswer(index: number, value: string) {
    setAnswers(previous => ({ ...previous, [index]: value }))
    setRowMessage(previous => ({ ...previous, [index]: '' }))
    if (submitted) setResults(previous => {
      const next = { ...previous }
      delete next[index]
      return next
    })
  }

  async function startAnswer(event: React.PointerEvent<HTMLButtonElement>, index: number) {
    event.preventDefault()
    if (recordingIndex !== null || processingIndex !== null) return
    event.currentTarget.setPointerCapture(event.pointerId)
    pressingRef.current = true
    activeIndexRef.current = index
    setRecordingIndex(index)
    setRowMessage(previous => ({ ...previous, [index]: '듣고 있어요…' }))
    try {
      const session = await startRecordingSession()
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
    const session = sessionRef.current
    sessionRef.current = null
    setRecordingIndex(null)
    if (!session) return
    const duration = performance.now() - startedAtRef.current
    session.stop()
    if (duration < 280) {
      await session.blobPromise
      setRowMessage(previous => ({ ...previous, [index]: '조금 더 길게 누르고 말하세요.' }))
      return
    }
    setProcessingIndex(index)
    setRowMessage(previous => ({ ...previous, [index]: '말한 내용을 글자로 바꾸고 있어요…' }))
    try {
      const blob = await session.blobPromise
      const extension = blob.type.includes('mp4') ? 'm4a' : 'webm'
      const form = new FormData()
      form.append('audio', blob, `roy-answer.${extension}`)
      const response = await fetch('/api/transcribe', { method: 'POST', headers: { 'x-review-pin': pin }, body: form })
      const data = await response.json() as { text?: string; error?: string }
      if (!response.ok) throw new Error(data.error || '대답을 확인하지 못했어요.')
      const transcript = (data.text || '').trim()
      if (!transcript) throw new Error('말을 듣지 못했어요. 다시 해보세요.')
      setAnswers(previous => ({ ...previous, [index]: transcript }))
      setRowMessage(previous => ({ ...previous, [index]: '필요하면 글자를 눌러 고치세요.' }))
    } catch (error) {
      setRowMessage(previous => ({ ...previous, [index]: error instanceof Error ? error.message : '대답을 확인하지 못했어요.' }))
    } finally {
      setProcessingIndex(null)
    }
  }

  function submit() {
    const next: Record<number, Result> = {}
    items.forEach((item, index) => { next[index] = isAccepted(answers[index] || '', item.answers) ? 'correct' : 'incorrect' })
    setResults(next)
    setSubmitted(true)
    document.querySelector('.roy-list')?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function reset() {
    setAnswers({})
    setResults({})
    setRowMessage({})
    setSubmitted(false)
    document.querySelector('.roy-list')?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return <main className="roy-shell">
    <header className="roy-top">
      <button onClick={onExit}>← Hub</button>
      <div><span>EXPERIMENT 03</span><strong>Roy</strong></div>
      <div className="roy-count">{answeredCount}<small> / {items.length}</small></div>
    </header>
    <section className="roy-intro">
      <div><span>English → Korean</span><strong>{submitted ? `${correctCount} correct` : 'Hold. Say it. Release.'}</strong></div>
      <p>{submitted ? 'Tap any answer to correct it, then check again.' : 'Hold the mic, say the Korean meaning, then let go.'}</p>
    </section>
    <section className="roy-list">
      {items.map((item, index) => {
        const result = results[index]
        const active = recordingIndex === index
        const processing = processingIndex === index
        return <article key={item.word} className={`roy-word-card${result ? ` result-${result}` : ''}${active ? ' is-recording' : ''}${processing ? ' is-processing' : ''}`}>
          <span className="roy-number">{String(index + 1).padStart(2, '0')}</span>
          <div className="roy-word-copy">
            <label htmlFor={`roy-answer-${index}`}>{item.word}</label>
            <input id={`roy-answer-${index}`} value={answers[index] || ''} onChange={event => editAnswer(index, event.target.value)} placeholder={processing ? 'The text will appear here when ready…' : '한국어 뜻'} readOnly={processing}/>
            {rowMessage[index] && <small>{rowMessage[index]}</small>}
            {result === 'incorrect' && <em>예: {item.answers.slice(0, 3).join(' · ')}</em>}
          </div>
          <button className="roy-card-mic" onPointerDown={event => void startAnswer(event, index)} onPointerUp={event => void finishAnswer(event, index)} onPointerCancel={event => void finishAnswer(event, index)} disabled={(recordingIndex !== null && !active) || processingIndex !== null} aria-label={`Hold to answer ${item.word}`}>
            {processing ? <span className="roy-spinner"/> : <span>{active ? '●' : '🎙'}</span>}
            <small>{processing ? 'WAIT' : active ? 'TALK' : 'HOLD'}</small>
          </button>
          {result && <span className="roy-result-mark">{result === 'correct' ? '✓' : '!'}</span>}
        </article>
      })}
      <div className="roy-list-end">That’s all {items.length} words.</div>
    </section>
    <footer className="roy-submit-bar">
      <div><strong>{submitted ? `${correctCount} / ${items.length}` : `${answeredCount} answered`}</strong><small>{submitted ? 'correct' : `${items.length - answeredCount} remaining`}</small></div>
      {submitted && <button className="roy-reset" onClick={reset}>Reset</button>}
      <button className="roy-submit" onClick={submit} disabled={recordingIndex !== null || processingIndex !== null}>{submitted ? 'Check again' : 'Submit'}</button>
    </footer>
  </main>
}
