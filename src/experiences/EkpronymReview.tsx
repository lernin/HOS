import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import './ekpronym-review.css'

type EkpronymReviewProps = { onExit: () => void; pin: string }
type Confidence = 'unset' | 'weak' | 'scored'
type Candidate = { nemonym: string; commonality_score: number | null }
type Item = {
  id: string
  definition: string
  pos: string | null
  ekpronym: string | null
  confidence: Confidence
  candidates: Candidate[]
}
type Filter = 'all' | Confidence

const filters: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unset', label: 'No pick yet' },
  { value: 'weak', label: 'Weak pick' },
  { value: 'scored', label: 'Scored pick' },
]

const posLabels: Record<string, string> = { n: 'noun', v: 'verb', a: 'adjective', s: 'adjective', r: 'adverb' }

export function EkpronymReview({ onExit, pin }: EkpronymReviewProps) {
  const [items, setItems] = useState<Item[]>([])
  const [index, setIndex] = useState(0)
  const [filter, setFilter] = useState<Filter>('weak')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)

  useEffect(() => { void load() }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.rpc('ekpronym_review_list', { pin })
    if (error) {
      setMessage(error.message)
    } else {
      setItems((data as Item[]) || [])
      setMessage('')
    }
    setLoading(false)
  }

  function filterItems(source: Item[]) {
    const q = search.trim().toLowerCase()
    return source.filter(item => {
      const matchesFilter = filter === 'all' || item.confidence === filter
      const matchesSearch = !q || item.definition.toLowerCase().includes(q) || item.candidates.some(c => c.nemonym.toLowerCase().includes(q))
      return matchesFilter && matchesSearch
    })
  }

  const visible = useMemo(() => filterItems(items), [items, filter, search])
  useEffect(() => { if (index >= visible.length) setIndex(Math.max(0, visible.length - 1)) }, [visible.length, index])
  const current = visible[index]

  async function choose(nemonym: string) {
    if (!current) return
    setSavingId(current.id)
    const { error } = await supabase.rpc('ekpronym_review_set_choice', { pin, pleuronym_id: current.id, chosen_nemonym: nemonym })
    setSavingId(null)
    if (error) {
      setMessage(error.message)
      return
    }
    setItems(all => all.map(item => item.id === current.id ? { ...item, ekpronym: nemonym, confidence: 'scored' } : item))
    setMessage(`Saved: ${nemonym}`)
    // Auto-advance so scrolling through a list feels continuous.
    window.setTimeout(() => {
      setIndex(i => {
        const stillHere = filterItems(items.map(item => item.id === current.id ? { ...item, ekpronym: nemonym, confidence: 'scored' } : item))
        return Math.min(i, Math.max(0, stillHere.length - 1))
      })
    }, 120)
  }

  function go(delta: number) {
    setIndex(i => Math.max(0, Math.min(visible.length - 1, i + delta)))
  }

  return (
    <main className="ek-shell">
      <header className="ek-top">
        <div>
          <div className="ek-eyebrow">Procedia · Ekpronym</div>
          <h1>Pick the term</h1>
        </div>
        <div className="ek-top-actions">
          <button className="ek-hub-button" onClick={onExit}>Hub</button>
          <div className="ek-counter">{visible.length ? index + 1 : 0}<span>/</span>{visible.length}</div>
        </div>
      </header>

      <div className="ek-tools">
        <input value={search} onChange={e => { setSearch(e.target.value); setIndex(0) }} placeholder="Find a definition or word…" />
        <select value={filter} onChange={e => { setFilter(e.target.value as Filter); setIndex(0) }}>
          {filters.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        <button className="ek-refresh" onClick={() => void load()} disabled={loading} aria-label="Refresh list">↻</button>
      </div>

      {message && <div className="ek-toast">{message}</div>}

      {loading ? (
        <div className="ek-center">Loading…</div>
      ) : current ? (
        <section className="ek-workspace">
          <div className="ek-definition-row">
            {current.pos && <span className="ek-pos">{posLabels[current.pos] || current.pos}</span>}
            <div className="ek-definition">{current.definition}</div>
            {current.ekpronym && <div className="ek-current">Current pick: <strong>{current.ekpronym}</strong></div>}
          </div>

          <div className="ek-question">Which word is the most common way to say this?</div>
          <div className="ek-candidate-list">
            {current.candidates.map(c => (
              <button
                key={c.nemonym}
                className={`ek-candidate${current.ekpronym === c.nemonym ? ' selected' : ''}`}
                disabled={savingId === current.id}
                onClick={() => void choose(c.nemonym)}
              >
                <strong>{c.nemonym.replace(/_/g, ' ')}</strong>
                {c.commonality_score != null && <span className="ek-score">score {c.commonality_score}</span>}
              </button>
            ))}
          </div>

          <div className="ek-nav">
            <button onClick={() => go(-1)} disabled={index === 0}>← Back</button>
            <button onClick={() => go(1)} disabled={index >= visible.length - 1}>Next →</button>
          </div>
        </section>
      ) : (
        <div className="ek-center">Nothing matches this filter.</div>
      )}
    </main>
  )
}
