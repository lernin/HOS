import { useEffect, useId, useRef, useState } from 'react'
import type { Confidence, EditResult, ThekonymRecord, ViewerSource } from '../lib/thekonymViewer'
import { confidenceNames } from '../lib/thekonymViewer'
import { kidChoiceEdit, parseKidProposals } from '../lib/kidExplanationProposals'

export function KidExplanationChoice({ record, source, online, onSaved }: { record: ThekonymRecord; source: ViewerSource; online: boolean; onSaved: (result: EditResult) => void }) {
  const proposals = parseKidProposals(record.kid_explanation)
  const [selected, setSelected] = useState<number | null>(null)
  const [confidence, setConfidence] = useState<Confidence>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const active = useRef(true)
  const pending = useRef(false)
  const requestId = useRef('')
  const confidenceHeading = useRef<HTMLLegendElement>(null)
  const group = useId()
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  useEffect(() => {
    if (selected !== null) {
      confidenceHeading.current?.focus({ preventScroll: true })
      confidenceHeading.current?.scrollIntoView?.({ block: 'nearest' })
    }
  }, [selected])
  if (!proposals) return <p className="tv-kid-text">{record.kid_explanation || 'Not recorded'}</p>
  const editable = Boolean(source.edit) && online

  async function save() {
    if (!editable || pending.current) return
    try {
      const edit = kidChoiceEdit(record, selected, confidence)
      pending.current = true; setSaving(true); setError('')
      requestId.current ||= crypto.randomUUID()
      const result = await source.edit!(record.id, edit.changes, edit.expected, requestId.current, edit.summary)
      // The viewer reconciles the returned record even if the user navigated away.
      onSaved(result)
    } catch (e) {
      if (active.current) setError(e instanceof Error ? e.message : 'Could not save. Your choices are still here.')
    } finally {
      pending.current = false
      if (active.current) setSaving(false)
    }
  }

  return <form className="tv-kid-choice" onSubmit={e => { e.preventDefault(); void save() }}>
    <fieldset disabled={!editable || saving}>
      <legend>Choose an explanation</legend>
      <div className="tv-kid-options">{proposals.options.map((text, index) => <label key={index} className={`tv-kid-option${selected === index ? ' is-selected' : ''}`}>
        <input type="radio" name={`${group}-explanation`} value={index} checked={selected === index} onChange={() => { setSelected(index); setConfidence(null); setError(''); requestId.current = '' }} />
        <span><span className="tv-kid-option-label">Option {index + 1}{proposals.nomination === index + 1 && <small>AI nomination</small>}</span><span className="tv-kid-option-text">{text}</span></span>
      </label>)}</div>
    </fieldset>
    {proposals.reason && <details className="tv-kid-nomination"><summary>Why this nomination?</summary><p>{proposals.reason}</p></details>}
    {selected !== null && <div className="tv-kid-confirm">
      <fieldset disabled={!editable || saving}>
        <legend ref={confidenceHeading} tabIndex={-1}>What’s your confidence?</legend>
        <div className="tv-kid-scores">{([0, 1, 2, 3] as const).map(value => <label key={value} className={confidence === value ? 'is-selected' : ''}>
          <input type="radio" name={`${group}-confidence`} value={value} checked={confidence === value} onChange={() => { setConfidence(value); setError(''); requestId.current = '' }} />
          <span>{value}</span><small>{confidenceNames[value]}</small>
        </label>)}</div>
      </fieldset>
      <p>Enter keeps option {selected + 1} and its confidence.</p>
      <div className="tv-kid-actions"><button type="submit" disabled={!editable || saving || confidence === null}>{saving ? 'Saving…' : 'Enter'}</button><button type="button" disabled={saving} onClick={() => { setSelected(null); setConfidence(null); setError(''); requestId.current = '' }}>Cancel</button></div>
    </div>}
    {!online && <p role="status">Reconnect to save your choice.</p>}
    {!source.edit && <p role="status">Read-only preview.</p>}
    {error && <p className="tv-kid-error" role="alert">{error}</p>}
  </form>
}
