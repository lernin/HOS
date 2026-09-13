import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { startRecordingSession, type RecordingSession } from '../lib/voiceCapture'
import './concept-interaction-review.css'

type ReviewComment = {
  id: string
  transcript: string
  source: 'voice' | 'text'
  created_at: string
}

type Row = {
  id: string
  ordinal: number
  code: string
  category: string
  label: string
  description: string
  example: string
  primary_support: 'MEANING' | 'SAYING' | 'WRITING'
  category_confidence: number
  example_confidence: number
  explanation_confidence: number
  classification_confidence: number
  review_note: string | null
  review_comments: ReviewComment[] | null
  updated_at: string
}

type ConfidenceField = 'category' | 'example' | 'explanation' | 'classification'
type ConfidenceKey = 'category_confidence' | 'example_confidence' | 'explanation_confidence' | 'classification_confidence'
type Props = { pin: string; onExit: () => void }

const confidenceKey: Record<ConfidenceField, ConfidenceKey> = {
  category: 'category_confidence',
  example: 'example_confidence',
  explanation: 'explanation_confidence',
  classification: 'classification_confidence',
}

function StarMeter({ value }: { value: number }) {
  return <span className="ci-stars" aria-label={`${value} of 3 confidence stars`}>
    {[1, 2, 3].map(star => <span className={star <= value ? 'filled' : ''} key={star}>★</span>)}
  </span>
}

function SupportPills({ active }: { active: Row['primary_support'] }) {
  return <div className="ci-support-pills">
    {(['MEANING', 'SAYING', 'WRITING'] as const).map(value => <span className={active === value ? 'active' : ''} key={value}>{value}</span>)}
  </div>
}

export function ConceptInteractionReview({ pin, onExit }: Props) {
  const [rows, setRows] = useState<Row[]>([])
  const [idx, setIdx] = useState(0)
  const [msg, setMsg] = useState('')
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const rec = useRef<RecordingSession | null>(null)
  const recordingInputId = useRef<string | null>(null)
  const cardRef = useRef<HTMLElement | null>(null)
  const touchX = useRef<number | null>(null)
  const touchDx = useRef(0)
  const motionBusy = useRef(false)

  useEffect(() => {
    let live = true
    supabase.rpc('lab_concept_input_type_read', { pin }).then(({ data, error }) => {
      if (!live) return
      if (error) setMsg(error.message)
      else setRows((data || []) as Row[])
    })
    return () => { live = false }
  }, [pin])

  useEffect(() => {
    if (idx >= rows.length) setIdx(Math.max(0, rows.length - 1))
  }, [idx, rows.length])

  const row = rows[idx]
  const fullyReviewed = useMemo(
    () => rows.filter(item => item.category_confidence > 0 && item.example_confidence > 0 && item.explanation_confidence > 0 && item.classification_confidence > 0).length,
    [rows]
  )

  function nextFrame() {
    return new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  }

  async function animateCard(delta: number, midpoint: () => void, startX = 0) {
    if (motionBusy.current || recording || transcribing) return
    const card = cardRef.current
    if (!card) { midpoint(); return }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { midpoint(); return }
    motionBusy.current = true
    card.style.pointerEvents = 'none'
    const edge = delta > 0 ? '-112%' : '112%'
    const start = `translateX(${startX}px) rotate(${startX * .008}deg)`
    const out = card.animate(
      [{ transform: start, opacity: 1 }, { transform: `translateX(${edge}) scale(.97)`, opacity: .22 }],
      { duration: startX ? 150 : 190, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' }
    )
    try {
      await out.finished
      midpoint()
      await nextFrame()
      const incoming = cardRef.current
      if (incoming) {
        const from = delta > 0 ? '112%' : '-112%'
        const enter = incoming.animate(
          [{ transform: `translateX(${from}) scale(.97)`, opacity: .22 }, { transform: 'translateX(0) scale(1)', opacity: 1 }],
          { duration: 230, easing: 'cubic-bezier(.2,.75,.2,1)', fill: 'forwards' }
        )
        out.cancel()
        await enter.finished
        enter.cancel()
      }
    } finally {
      motionBusy.current = false
      const active = cardRef.current
      if (active) {
        active.style.transform = ''
        active.style.opacity = ''
        active.style.pointerEvents = ''
      }
    }
  }

  function go(delta: number, startX = 0) {
    if (recording || transcribing || !rows.length) return
    const target = Math.max(0, Math.min(rows.length - 1, idx + delta))
    if (target === idx) {
      const card = cardRef.current
      if (card && startX) {
        const snap = card.animate([{ transform: `translateX(${startX}px)` }, { transform: 'translateX(0)' }], { duration: 150, easing: 'ease-out' })
        void snap.finished.finally(() => { card.style.transform = ''; card.style.opacity = '' })
      }
      return
    }
    setMsg('')
    void animateCard(delta, () => setIdx(target), startX)
  }

  async function cycleConfidence(field: ConfidenceField) {
    if (!row) return
    const key = confidenceKey[field]
    const prior = row[key]
    const next = (prior + 1) % 4
    const inputId = row.id
    setRows(all => all.map(item => item.id === inputId ? { ...item, [key]: next } : item))
    setMsg('Saving…')

    const { data, error } = await supabase.rpc('lab_concept_input_confidence_set', {
      pin,
      input_id: inputId,
      field_key: field,
      new_confidence: next,
    })
    if (error) {
      setRows(all => all.map(item => item.id === inputId ? { ...item, [key]: prior } : item))
      setMsg(error.message)
      return
    }
    const saved = (data as Array<Pick<Row, 'id' | ConfidenceKey>>) || []
    const update = saved[0] as Partial<Row> | undefined
    if (update) setRows(all => all.map(item => item.id === inputId ? { ...item, ...update } : item))
    setMsg(next ? `${field} · ${next} star${next === 1 ? '' : 's'} saved` : `${field} · confidence cleared`)
  }

  async function mic() {
    if (transcribing || !row) return
    if (recording) {
      const session = rec.current
      const inputId = recordingInputId.current
      if (!session || !inputId) return
      rec.current = null
      recordingInputId.current = null
      session.stop()
      setRecording(false)
      setTranscribing(true)
      setMsg('Transcribing…')
      try {
        const blob = await session.blobPromise
        const form = new FormData()
        const extension = blob.type.includes('mp4') ? 'm4a' : 'webm'
        form.append('audio', blob, `concept-input-comment.${extension}`)
        const response = await fetch('/api/transcribe', {
          method: 'POST',
          headers: { 'x-review-pin': pin },
          body: form,
        })
        const transcription = await response.json() as { text?: string; error?: string }
        if (!response.ok) throw new Error(transcription.error || 'Transcription failed.')
        const transcript = (transcription.text || '').replace(/\s+/g, ' ').trim()
        if (!transcript) throw new Error('I did not hear any words in that recording.')

        setMsg('Saving comment…')
        const { data, error } = await supabase.rpc('lab_concept_input_comment_add', {
          pin,
          input_id: inputId,
          new_transcript: transcript,
          comment_source: 'voice',
        })
        if (error) throw error
        const saved = ((data || []) as ReviewComment[])[0]
        if (!saved) throw new Error('The comment was not returned after saving.')
        setRows(all => all.map(item => item.id === inputId
          ? { ...item, review_comments: [...(item.review_comments || []), saved] }
          : item))
        setMsg('Voice comment saved')
      } catch (error) {
        setMsg(error instanceof Error ? error.message : 'Voice comment failed.')
      } finally {
        setTranscribing(false)
      }
      return
    }

    try {
      rec.current = await startRecordingSession()
      recordingInputId.current = row.id
      setRecording(true)
      setMsg('Recording — tap again to stop')
    } catch (error) {
      setMsg(error instanceof Error ? error.message : 'Microphone failed')
    }
  }

  if (!row) return <main className="ci">
    <header><button onClick={onExit}>‹ Lab</button><b>Concept Inputs</b><span>0/58</span></header>
    <div className="ci-empty">{msg || 'Loading the 58 canonical inputs…'}</div>
  </main>

  const comments = row.review_comments || []
  const reviewCard = (field: ConfidenceField, title: string, body: React.ReactNode) => {
    const value = row[confidenceKey[field]]
    return <button className="ci-review-card" onClick={() => void cycleConfidence(field)} aria-label={`${title}. Confidence ${value} of 3. Tap to cycle.`}>
      <span className="ci-review-head"><small>{title}</small><StarMeter value={value} /></span>
      <span className="ci-review-body">{body}</span>
      <span className="ci-tap-hint">Tap card: {value} → {(value + 1) % 4}</span>
    </button>
  }

  return <main className="ci">
    <header><button onClick={onExit}>‹ Lab</button><b>Concept Inputs</b><span>{row.ordinal}/58</span></header>

    <section
      ref={cardRef}
      className="ci-card ci-input-card"
      onTouchStart={event => {
        if ((event.target as HTMLElement).closest('button,input,textarea,select')) { touchX.current = null; return }
        touchX.current = event.changedTouches[0].clientX
        touchDx.current = 0
      }}
      onTouchMove={event => {
        if (touchX.current === null || motionBusy.current || recording || transcribing) return
        const delta = event.changedTouches[0].clientX - touchX.current
        touchDx.current = delta
        const card = cardRef.current
        if (card) {
          card.style.transform = `translateX(${delta}px) rotate(${delta * .01}deg)`
          card.style.opacity = String(Math.max(.72, 1 - Math.abs(delta) / 700))
        }
      }}
      onTouchEnd={() => {
        if (touchX.current === null) return
        const delta = touchDx.current
        touchX.current = null
        touchDx.current = 0
        if (Math.abs(delta) > 55) go(delta < 0 ? 1 : -1, delta)
        else {
          const card = cardRef.current
          if (card) {
            const snap = card.animate([{ transform: `translateX(${delta}px)`, opacity: card.style.opacity || '1' }, { transform: 'translateX(0)', opacity: 1 }], { duration: 150, easing: 'ease-out' })
            void snap.finished.finally(() => { card.style.transform = ''; card.style.opacity = '' })
          }
        }
      }}
    >
      <div className="ci-input-title">
        <span className="ci-number">#{row.ordinal}</span>
        <div><small>{row.code}</small><h1>{row.label}</h1></div>
      </div>

      <div className="ci-review-grid">
        {reviewCard('category', 'Category', row.category)}
        {reviewCard('example', 'Clear example', row.example)}
        {reviewCard('explanation', 'Explanation', row.description)}
        {reviewCard('classification', 'Meaning / Saying / Writing', <><SupportPills active={row.primary_support} /><span className="ci-classification-copy">Primary intrinsic support: <b>{row.primary_support}</b></span></>)}
      </div>

      <section className="ci-comments">
        <div className="ci-comments-head">
          <div><small>Your comments</small><strong>{comments.length ? `${comments.length} saved` : 'No comments yet'}</strong></div>
          <button className={recording ? 'ci-mic rec' : 'ci-mic'} onClick={() => void mic()} disabled={transcribing}>
            {recording ? '■ Stop' : transcribing ? '… Saving' : '🎙 Mic'}
          </button>
        </div>
        {comments.length > 0 && <div className="ci-comment-list">
          {[...comments].reverse().slice(0, 3).map(comment => <p key={comment.id}>{comment.transcript}</p>)}
        </div>}
        <div className={`ci-save-status${recording ? ' recording' : ''}`} role="status" aria-live="polite">{msg || 'Tap Mic, speak, then tap Stop. The transcript saves automatically.'}</div>
      </section>
    </section>

    <footer>
      <button onClick={() => go(-1)} disabled={idx === 0 || recording || transcribing}>‹</button>
      <span>{fullyReviewed}/58 all four reviewed · swipe ↔</span>
      <button onClick={() => go(1)} disabled={idx === rows.length - 1 || recording || transcribing}>›</button>
    </footer>
  </main>
}
