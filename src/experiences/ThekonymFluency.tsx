import { useCallback, useEffect, useMemo, useState } from 'react'
import { thekonymReader } from '../lib/supabase'

/**
 * Ashley's Fluency — every Thekonym as a coloured block, A to Z.
 *
 * Tap a block to cycle how well you know that term. Each tap saves straight
 * away through lab_thekonym_set_fluency, which touches only ashleys_fluency
 * and queues nothing for publication.
 *
 * Scale (public.thekonym_score_keys, metric 'ashleys_fluency'):
 *   –  not yet rated
 *   0  No fluency      — you don't yet know what it means
 *   1  Vague awareness — partial recognition, can't use it confidently
 *   2  Understood      — you understand it, not yet fluent
 *   3  Fluent          — you can use and discuss it freely
 */

type Term = {
  id: string
  term: string
  definition: string | null
  status: string | null
  ashleys_fluency: number | null
}

type Level = { score: number | null; label: string; className: string }

const LEVELS: Level[] = [
  { score: null, label: 'Not yet rated', className: 'fluency-unrated' },
  { score: 0, label: 'No fluency', className: 'fluency-0' },
  { score: 1, label: 'Vague awareness', className: 'fluency-1' },
  { score: 2, label: 'Understood', className: 'fluency-2' },
  { score: 3, label: 'Fluent', className: 'fluency-3' },
]

function classFor(score: number | null) {
  return (LEVELS.find((l) => l.score === score) ?? LEVELS[0]).className
}

/** – → 0 → 1 → 2 → 3 → 0 … */
function nextScore(current: number | null): number {
  if (current === null || current === undefined) return 0
  return current >= 3 ? 0 : current + 1
}

export default function ThekonymFluency({ pin, onExit }: { pin: string; onExit: () => void }) {
  const [terms, setTerms] = useState<Term[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [failed, setFailed] = useState<Record<string, true>>({})
  const [pending, setPending] = useState<Record<string, true>>({})
  const [unratedOnly, setUnratedOnly] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let live = true
    const controller = new AbortController()
    async function load() {
      const { data, error: readError } = await thekonymReader
        .rpc('lab_thekonym_read', { pin, term_id: null })
        .abortSignal(AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]))
      if (!live) return
      if (readError) setError(readError.message)
      else setTerms(((data as Term[]) ?? []).filter((t) => t && t.term))
      setLoading(false)
    }
    load()
    return () => {
      live = false
      controller.abort()
    }
  }, [pin])

  const cycle = useCallback(
    async (term: Term) => {
      const target = nextScore(term.ashleys_fluency)
      const previous = term.ashleys_fluency

      // Optimistic: this screen is for moving quickly through 181 terms.
      setTerms((all) => all.map((t) => (t.id === term.id ? { ...t, ashleys_fluency: target } : t)))
      setPending((p) => ({ ...p, [term.id]: true }))
      setFailed((f) => {
        if (!(term.id in f)) return f
        const next = { ...f }
        delete next[term.id]
        return next
      })

      const { error: saveError } = await thekonymReader.rpc('lab_thekonym_set_fluency', {
        pin,
        term_id: term.id,
        value: target,
      })

      setPending((p) => {
        const next = { ...p }
        delete next[term.id]
        return next
      })

      if (saveError) {
        // Never leave a colour on screen that the database did not accept.
        setTerms((all) =>
          all.map((t) => (t.id === term.id ? { ...t, ashleys_fluency: previous } : t)),
        )
        setFailed((f) => ({ ...f, [term.id]: true }))
      }
    },
    [pin],
  )

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return terms.filter((t) => {
      if (unratedOnly && t.ashleys_fluency !== null && t.ashleys_fluency !== undefined) return false
      if (!needle) return true
      return (
        t.term.toLowerCase().includes(needle) ||
        (t.definition ?? '').toLowerCase().includes(needle)
      )
    })
  }, [terms, unratedOnly, query])

  const tally = useMemo(() => {
    const counts = [0, 0, 0, 0]
    let rated = 0
    for (const t of terms) {
      const v = t.ashleys_fluency
      if (v === null || v === undefined) continue
      rated += 1
      if (v >= 0 && v <= 3) counts[v] += 1
    }
    return { rated, total: terms.length, counts }
  }, [terms])

  return (
    <main className="shell fluency-shell">
      <header className="fluency-top">
        <div>
          <div className="eyebrow">Ashley’s private workspace</div>
          <h1>Ashley’s Fluency</h1>
        </div>
        <button className="fluency-exit" onClick={onExit}>
          Back
        </button>
      </header>

      {loading && <div className="center">Loading the registry…</div>}
      {error && <div className="notice">Could not load: {error}</div>}

      {!loading && !error && (
        <>
          <p className="fluency-intro">
            Every Thekonym, A to Z. Tap a block to cycle how well you know it —
            <strong> 0 → 1 → 2 → 3 </strong>and back to 0. Each tap saves immediately.
          </p>

          <div className="fluency-legend">
            {LEVELS.map((l) => (
              <span className="fluency-legend-item" key={String(l.score)}>
                <span className={`fluency-swatch ${l.className}`} />
                <span>
                  {l.score === null ? '–' : l.score} {l.label}
                </span>
              </span>
            ))}
          </div>

          <div className="fluency-progress">
            <strong>
              {tally.rated} of {tally.total}
            </strong>{' '}
            rated · fluent {tally.counts[3]} · understood {tally.counts[2]} · vague{' '}
            {tally.counts[1]} · none {tally.counts[0]}
          </div>

          <div className="fluency-controls">
            <input
              className="fluency-search"
              type="search"
              value={query}
              placeholder="Find a term…"
              onChange={(e) => setQuery(e.target.value)}
            />
            <label className="fluency-toggle">
              <input
                type="checkbox"
                checked={unratedOnly}
                onChange={(e) => setUnratedOnly(e.target.checked)}
              />
              Unrated only
            </label>
          </div>

          <div className="fluency-grid">
            {visible.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => cycle(t)}
                title={t.definition ?? undefined}
                aria-label={`${t.term}. ${
                  t.ashleys_fluency === null || t.ashleys_fluency === undefined
                    ? 'Not yet rated'
                    : `Fluency ${t.ashleys_fluency}`
                }. Tap to change.`}
                className={[
                  'fluency-tile',
                  classFor(t.ashleys_fluency ?? null),
                  pending[t.id] ? 'is-saving' : '',
                  failed[t.id] ? 'is-failed' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <span className="fluency-score">
                  {t.ashleys_fluency === null || t.ashleys_fluency === undefined
                    ? '–'
                    : t.ashleys_fluency}
                </span>
                <span className="fluency-term">{t.term}</span>
                {t.definition && <span className="fluency-def">{t.definition}</span>}
                {failed[t.id] && <span className="fluency-failed">not saved</span>}
              </button>
            ))}
          </div>

          {visible.length === 0 && (
            <div className="notice">
              {unratedOnly ? 'Everything is rated.' : 'No terms match that search.'}
            </div>
          )}
        </>
      )}
    </main>
  )
}
