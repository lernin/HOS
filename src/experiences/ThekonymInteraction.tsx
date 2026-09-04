import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from 'react'
import type { ChatMessage, ChatResult, Confidence, ConfidenceField, ContentField, EditResult, ThekonymRecord, ViewerSource } from '../lib/thekonymViewer'
import { confidencePresentation } from '../lib/thekonymViewer'

export const fieldLabels: Record<ContentField, string> = { definition: 'Definition', technical_definition: 'Technical Definition', kid_explanation: 'Kid explanation', example: 'Examples', greek_root_meaning: 'Root meaning', notes: 'Notes', term_pronunciation: 'Pronunciation' }
export const fieldConfidence: Partial<Record<ContentField, ConfidenceField>> = { definition: 'definition_confidence', technical_definition: 'technical_definition_confidence', kid_explanation: 'kid_explanation_confidence', example: 'example_confidence', greek_root_meaning: 'greek_root_meaning_confidence' }
export const EditingContext = createContext<{ record: ThekonymRecord | null; source: ViewerSource; online: boolean; onSaved: (result: EditResult) => void; discuss: (field: ContentField) => void } | null>(null)

export function useDoubleTap(action: () => void) {
  const last = useRef(0)
  const permitted = (target: EventTarget) => !(target as HTMLElement).closest('button, a, input, textarea, summary, form')
  return {
    onDoubleClick: (e: ReactMouseEvent) => { if (permitted(e.target)) action() },
    onPointerUp: (e: ReactPointerEvent) => {
      if (e.pointerType !== 'touch' || !permitted(e.target)) return
      const now = Date.now(); if (now - last.current < 330) { last.current = 0; e.preventDefault(); action() } else last.current = now
    },
  }
}

export function Crosses({ value }: { value: Confidence | undefined }) {
  const mark = confidencePresentation(value)
  return <span className={`tv-confidence tv-confidence-${mark.state}`} aria-label={mark.label} title={mark.label}>{mark.crosses ? <span aria-hidden="true">{Array.from({ length: mark.crosses }, (_, i) => <svg key={i} viewBox="0 0 16 20" fill="none"><path d="M3 3 12 17M13 2 2 18" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" /></svg>)}</span> : mark.state === 'unassessed' ? '?' : <span className="tv-sr-only">Confirmed</span>}</span>
}

export function EditableConfidence({ value, field }: { value: Confidence; field: ConfidenceField }) {
  const context = useContext(EditingContext)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Confidence>(value)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const before = useRef(value)
  const lastTap = useRef(0)
  const requestId = useRef('')
  if (!context?.source.edit || !context.record) return <Crosses value={value} />
  const { source, record, online, onSaved } = context
  function unlock() { if (!online || saving) return; before.current = value; setDraft(value); setOpen(true); setError(''); requestId.current = crypto.randomUUID() }
  async function save() {
    if (draft === before.current) { setOpen(false); return }
    setSaving(true); setError('')
    try {
      const result = await source.edit!(record!.id, { [field]: draft }, { [field]: before.current }, requestId.current, 'Ashley changed confidence directly in the viewer.')
      onSaved(result); setOpen(false)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save. Try again.') }
    finally { setSaving(false) }
  }
  return <span className={`tv-confidence-editor${open ? ' is-unlocked' : ''}`} onDoubleClick={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()}>
    <button type="button" className="tv-confidence-box" disabled={!online || saving} title={open ? 'Cycle confidence' : 'Double-tap to edit confidence'} aria-label={open ? `Confidence ${draft ?? 'unassessed'}. Tap to cycle.` : `Confidence ${value ?? 'unassessed'}. Double-tap or press Enter to unlock.`}
      onClick={e => {
        e.stopPropagation()
        if (open) { setDraft(v => v == null ? 3 : v === 0 ? 3 : (v - 1) as Confidence); requestId.current = crypto.randomUUID(); return }
        const now = Date.now(); if (e.detail === 0 || now - lastTap.current < 350) { unlock(); lastTap.current = 0 } else lastTap.current = now
      }}><Crosses value={open ? draft : value} />{(open ? draft : value) === 3 && <span className="tv-blank-confidence" aria-hidden="true" />}</button>
    {open && <span className="tv-confidence-actions"><button disabled={saving || !online} onClick={() => void save()}>{saving ? 'Saving…' : 'Lock & save'}</button><button disabled={saving} onClick={() => { setOpen(false); setError('') }}>Cancel</button></span>}
    {error && <span className="tv-edit-error" role="status">{error}</span>}
  </span>
}

export function DiscussionPanel({ record, field, source, onClose, onSaved }: { record: ThekonymRecord; field: ContentField; source: ViewerSource; onClose: () => void; onSaved: (result: EditResult) => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [reply, setReply] = useState<ChatResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [recording, setRecording] = useState(false)
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const controller = useRef<AbortController | null>(null)
  const active = useRef(true)
  const requestId = useRef('')
  const input = useRef<HTMLTextAreaElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const bottom = useRef<HTMLDivElement>(null)
  useEffect(() => { active.current = true; dialog.current?.showModal(); return () => { active.current = false; controller.current?.abort(); if (recorder.current?.state === 'recording') recorder.current.stop(); stream.current?.getTracks().forEach(t => t.stop()) } }, [])
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'nearest' }) }, [messages, reply, busy])
  async function send() {
    if (!draft.trim() || busy || !source.chat) return
    const next: ChatMessage[] = [...messages, { role: 'user', content: draft.trim() }]
    setBusy(true); setNotice(''); setReply(null)
    const c = new AbortController(); controller.current = c
    try {
      const result = await source.chat(record.id, field, next, c.signal)
      if (!active.current) return
      setMessages([...next, { role: 'assistant', content: result.text }]); setDraft(''); setReply(result); requestId.current = crypto.randomUUID()
    } catch (e) { if (active.current) setNotice(e instanceof Error ? e.message : 'Could not finish the reply. Your message is preserved.') }
    finally { if (active.current) setBusy(false) }
  }
  async function apply() {
    if (!reply?.proposal || !source.edit || saving) return
    setSaving(true); setNotice('')
    try {
      const p = reply.proposal
      const result = await source.edit(record.id, p.changes, p.expected, requestId.current, `Ashley accepted AI proposal: ${p.summary}`)
      if (!active.current) return
      onSaved(result); setReply({ ...reply, proposal: null }); setNotice(result.log.status === 'synced' ? 'Saved in Supabase and logged to GitHub.' : result.log.message || 'Saved in Supabase. GitHub log pending.')
    } catch (e) { if (active.current) setNotice(e instanceof Error ? e.message : 'Could not save.') }
    finally { if (active.current) setSaving(false) }
  }
  async function microphone() {
    if (recording) { recorder.current?.stop(); return }
    if (!source.transcribe || busy) return
    setNotice('')
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!active.current) { media.getTracks().forEach(t => t.stop()); return }
      stream.current = media
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(t => MediaRecorder.isTypeSupported(t))
      const rec = new MediaRecorder(media, mimeType ? { mimeType } : undefined); recorder.current = rec
      const chunks: Blob[] = []
      rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
      rec.onstop = async () => {
        media.getTracks().forEach(t => t.stop()); if (!active.current) return
        setRecording(false); setBusy(true)
        const c = new AbortController(); controller.current = c
        try { const text = await source.transcribe!(new Blob(chunks, { type: rec.mimeType }), c.signal); if (active.current) { setDraft(v => `${v}${v ? '\n' : ''}${text}`); input.current?.focus() } }
        catch (e) { if (active.current) setNotice(e instanceof Error ? e.message : 'Could not transcribe.') }
        finally { if (active.current) setBusy(false) }
      }
      rec.start(); setRecording(true)
    } catch { stream.current?.getTracks().forEach(t => t.stop()); setNotice('Microphone unavailable. You can type your message below.') }
  }
  return <dialog className="tv-discussion" ref={dialog} onCancel={e => { if (saving) e.preventDefault(); else onClose() }} aria-labelledby="tv-discussion-title">
    <header><div><small>{record.term}</small><h2 id="tv-discussion-title">Discuss {fieldLabels[field]}</h2></div><button onClick={onClose} disabled={saving} aria-label="Close discussion">×</button></header>
    <div className="tv-conversation"><details><summary>Selected passage</summary><p>{String(record[field] || 'Not recorded')}</p></details>
      {!messages.length && <p className="tv-chat-intro">Ask a question or describe a change. You’ll review any proposed edit before saving.</p>}
      {messages.map((m, i) => <div key={i} className={`tv-chat-message tv-chat-${m.role}`}><small>{m.role === 'user' ? 'You' : 'Procedia'}</small><p>{m.content}</p></div>)}
      {busy && <p className="tv-chat-working" role="status">{recording ? 'Listening…' : 'Working…'}</p>}
      {reply?.sources && <details className="tv-chat-sources"><summary>Sources checked</summary>{reply.sources.map((s, i) => <p key={i}>{s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.label}</a> : s.label}</p>)}{!reply.github && <p>GitHub is not connected to this app.</p>}</details>}
      {reply?.proposal && <div className="tv-proposal"><h3>Proposed change</h3><p>{reply.proposal.summary}</p>{Object.entries(reply.proposal.changes).map(([key, value]) => <div key={key}><small>{key.replaceAll('_', ' ')}</small><p>{String(value)}</p></div>)}<details><summary>Current value</summary>{Object.entries(reply.proposal.expected).map(([key, value]) => <p key={key}>{key.replaceAll('_', ' ')}: {String(value ?? 'Unassessed')}</p>)}</details><button disabled={saving || busy} onClick={() => void apply()}>{saving ? 'Saving…' : 'Apply change'}</button><button disabled={saving} onClick={() => setReply({ ...reply, proposal: null })}>Dismiss</button></div>}
      {notice && <p className="tv-chat-notice" role="status">{notice}</p>}<div ref={bottom} />
    </div>
    <form onSubmit={e => { e.preventDefault(); void send() }}><textarea ref={input} value={draft} onChange={e => setDraft(e.target.value)} placeholder="What would you like to discuss?" aria-label="Message" disabled={busy || saving} rows={3} /><div><button type="button" onClick={() => void microphone()} disabled={busy || saving} className={recording ? 'is-recording' : ''} aria-label={recording ? 'Stop recording' : 'Record voice message'}>{recording ? '■ Stop' : <><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" /></svg> Speak</>}</button><button type="submit" disabled={!draft.trim() || busy || saving || recording}>Send</button></div></form>
    <footer><button disabled={busy || saving} onClick={async () => { if (!source.syncLogs) return; setNotice('Checking pending logs…'); try { const r = await source.syncLogs(record.id); setNotice(r.results.some(x => x.status === 'pending') ? 'Database edits are saved. Follow-up notes are in your AI work list.' : 'GitHub logs are up to date.') } catch { setNotice('Could not check logs. Try again later.') } }}>Sync pending GitHub logs</button></footer>
  </dialog>
}
