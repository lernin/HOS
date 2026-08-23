import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type Hypernym = { depth: number; definition: string | null; ekpronym: string | null; words: string[] }

export function EkpronymContext({ pin, pleuronymId }: { pin: string; pleuronymId: string }) {
  const [rows, setRows] = useState<Hypernym[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    void supabase.rpc('ekpronym_review_ancestry', { pin, target_pleuronym_id: pleuronymId }).then(({ data, error: rpcError }) => {
      if (!alive) return
      if (rpcError) { setRows([]); setError(rpcError.message) }
      else setRows((data as Hypernym[]) || [])
      setLoading(false)
    })
    return () => { alive = false }
  }, [pin, pleuronymId])

  if (loading) return <div className="ek-subtle">Loading semantic context…</div>
  if (error) return <div className="ek-subtle">Semantic context unavailable: {error}</div>
  if (!rows.length) return <div className="ek-subtle">No hypernym ancestry is linked for this sense.</div>

  return <section className="ek-context">
    <div className="ek-context-title">Meaning ancestry · hypernyms</div>
    <div className="ek-context-chain">{rows.map((row, i) => {
      const label = row.ekpronym || row.words?.slice(0, 4).join(' · ') || 'Unnamed concept'
      return <div className="ek-context-row" key={`${row.depth}-${i}`}>
        <span className="ek-context-depth">{i ? '↑' : 'Parent'}</span>
        <div><strong>{label.replace(/_/g, ' ')}</strong>{row.definition && <p>{row.definition}</p>}{row.ekpronym && row.words?.length > 1 && <small>{row.words.slice(0, 6).map(w => w.replace(/_/g, ' ')).join(' · ')}</small>}</div>
      </div>
    })}</div>
  </section>
}
