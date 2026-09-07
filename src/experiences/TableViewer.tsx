import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import './table-viewer.css'

type CatalogEntry = {
  table_name: string
  columns: string[]
  rls_enabled: boolean
  anon_select: boolean
}

type Props = {
  pin: string
  onExit: () => void
}

const PAGE_SIZE = 50
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
const VISUAL_PREVIEW = import.meta.env.VITE_TABLE_VIEWER_VISUAL_PREVIEW === '1'
const PREVIEW_TABLE: CatalogEntry = {
  table_name: 'word_inputs_brainstorm',
  columns: ['id', 'input_name', 'code', 'category', 'supports', 'example', 'notes'],
  rls_enabled: true,
  anon_select: false,
}
const PREVIEW_CATALOG: CatalogEntry[] = [
  PREVIEW_TABLE,
  { table_name: 'thekonyms', columns: ['id', 'term', 'definition', 'status'], rls_enabled: true, anon_select: false },
  { table_name: 'schemonyms', columns: ['id', 'name', 'description', 'type'], rls_enabled: true, anon_select: false },
  { table_name: 'semonyms', columns: ['id', 'semonym', 'schemonym_id'], rls_enabled: true, anon_select: false },
  { table_name: 'concept_interactions', columns: ['id', 'interaction_code', 'source_coordinate', 'target_coordinate'], rls_enabled: true, anon_select: false },
]
const PREVIEW_ROWS: Record<string, unknown>[] = [
  { id: 1, input_name: 'Real object directly perceived', code: 'C', category: 'Concept / nonverbal', supports: 'MEANING', example: 'A real cat in front of the learner', notes: 'Reality itself is the input.' },
  { id: 2, input_name: 'Picture / visual representation', code: 'C', category: 'Concept / nonverbal', supports: 'MEANING', example: 'A photo or drawing of a cat', notes: 'A representation of the concept.' },
  { id: 3, input_name: 'Written base-language term', code: 'W1', category: 'Bare form', supports: 'WRITING', example: '고양이', notes: null },
  { id: 4, input_name: 'Written target-language term', code: 'W2', category: 'Bare form', supports: 'WRITING', example: 'cat', notes: null },
  { id: 5, input_name: 'Spoken target-language term', code: 'S2', category: 'Pronunciation / sound', supports: 'SAYING', example: 'Audio of cat', notes: 'Auditory linguistic form.' },
]

function displayValue(value: unknown) {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function TableViewer({ pin, onExit }: Props) {
  const [catalog, setCatalog] = useState<CatalogEntry[]>([])
  const [letter, setLetter] = useState('ALL')
  const [search, setSearch] = useState('')
  const previewTableOpen = VISUAL_PREVIEW && new URLSearchParams(window.location.search).get('visual') === 'table'
  const [selected, setSelected] = useState<CatalogEntry | null>(previewTableOpen ? PREVIEW_TABLE : null)
  const [rows, setRows] = useState<Record<string, unknown>[]>(previewTableOpen ? PREVIEW_ROWS : [])
  const [loadingCatalog, setLoadingCatalog] = useState(true)
  const [loadingRows, setLoadingRows] = useState(false)
  const [rowError, setRowError] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [freezeFirst, setFreezeFirst] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function loadCatalog() {
      setLoadingCatalog(true)
      if (VISUAL_PREVIEW) {
        setCatalog(PREVIEW_CATALOG)
        setLoadingCatalog(false)
        return
      }
      const { data, error } = await supabase.rpc('lab_table_viewer_catalog', { pin })
      if (cancelled) return
      if (error) {
        setCatalog([])
        setRowError(error.code === '28000' ? 'Wrong Lab PIN.' : error.message)
      } else {
        setCatalog((data || []) as CatalogEntry[])
      }
      setLoadingCatalog(false)
    }
    void loadCatalog()
    return () => { cancelled = true }
  }, [pin])

  const visibleTables = useMemo(() => {
    const q = search.trim().toLowerCase()
    return catalog.filter(entry => {
      const letterOk = letter === 'ALL' || entry.table_name.toUpperCase().startsWith(letter)
      const searchOk = !q || entry.table_name.toLowerCase().includes(q)
      return letterOk && searchOk
    })
  }, [catalog, letter, search])

  async function loadRows(entry: CatalogEntry, reset = true) {
    setSelected(entry)
    setLoadingRows(true)
    if (VISUAL_PREVIEW) {
      setRows(PREVIEW_ROWS)
      setHasMore(false)
      setRowError('')
      setLoadingRows(false)
      return
    }
    setRowError('')
    const start = reset ? 0 : rows.length
    const end = start + PAGE_SIZE - 1
    const { data, error } = await supabase
      .from(entry.table_name)
      .select('*')
      .range(start, end)

    if (error) {
      if (reset) setRows([])
      setHasMore(false)
      setRowError(
        error.code === '42501'
          ? 'This table is protected by its current Supabase access rules.'
          : error.message,
      )
    } else {
      const next = (data || []) as Record<string, unknown>[]
      setRows(reset ? next : [...rows, ...next])
      setHasMore(next.length === PAGE_SIZE)
    }
    setLoadingRows(false)
  }

  function chooseTable(entry: CatalogEntry) {
    setRows([])
    setHasMore(false)
    void loadRows(entry, true)
  }

  const columns = selected?.columns || []

  if (selected) {
    return (
      <main className="tv-shell">
        <header className="tv-topbar">
          <button className="tv-back" onClick={() => { setSelected(null); setRows([]); setRowError('') }}>← Tables</button>
          <div className="tv-title-block">
            <span>Table Viewer</span>
            <h1>{selected.table_name}</h1>
          </div>
          <button
            className={`tv-freeze-toggle${freezeFirst ? ' active' : ''}`}
            onClick={() => setFreezeFirst(value => !value)}
            title="Freeze or release the first data column"
          >
            <span aria-hidden="true">{freezeFirst ? '●' : '○'}</span>
            First column
          </button>
        </header>

        <div className="tv-table-meta">
          <span>{columns.length} columns</span>
          <span>{rows.length} rows loaded</span>
          <span>{selected.rls_enabled ? 'RLS on' : 'RLS off'}</span>
        </div>

        {rowError && <div className="tv-notice">{rowError}</div>}

        <section className="tv-grid-wrap" aria-label={`${selected.table_name} data`}>
          <table className={`tv-grid${freezeFirst ? ' freeze-first' : ''}`}>
            <thead>
              <tr>
                <th className="tv-row-number">#</th>
                {columns.map(column => <th key={column}>{column}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  <th className="tv-row-number">{rowIndex + 1}</th>
                  {columns.map(column => (
                    <td key={column} className={row[column] == null ? 'is-null' : ''}>
                      {displayValue(row[column])}
                    </td>
                  ))}
                </tr>
              ))}
              {!loadingRows && !rowError && rows.length === 0 && (
                <tr><td colSpan={Math.max(2, columns.length + 1)} className="tv-empty">No visible rows.</td></tr>
              )}
            </tbody>
          </table>
        </section>

        <footer className="tv-footer">
          {loadingRows
            ? <span>Loading…</span>
            : hasMore
              ? <button onClick={() => void loadRows(selected, false)}>Load 50 more</button>
              : <span>{rows.length ? 'End of visible rows' : 'Read-only viewer'}</span>}
        </footer>
      </main>
    )
  }

  return (
    <main className="tv-shell">
      <header className="tv-topbar tv-index-topbar">
        <button className="tv-back" onClick={onExit}>← The Lab</button>
        <div className="tv-title-block">
          <span>Ashley’s private workspace</span>
          <h1>Table Viewer</h1>
        </div>
      </header>

      <section className="tv-controls">
        <input
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="Find a table…"
          aria-label="Find a table"
        />
        <div className="tv-letters" aria-label="Filter tables by first letter">
          <button className={letter === 'ALL' ? 'active' : ''} onClick={() => setLetter('ALL')}>ALL</button>
          {LETTERS.map(item => (
            <button
              key={item}
              className={letter === item ? 'active' : ''}
              onClick={() => setLetter(item)}
              disabled={!catalog.some(entry => entry.table_name.toUpperCase().startsWith(item))}
            >
              {item}
            </button>
          ))}
        </div>
      </section>

      {loadingCatalog ? <div className="tv-center">Loading tables…</div> : (
        <section className="tv-table-list">
          <div className="tv-list-head">
            <strong>{letter === 'ALL' ? 'All tables' : `${letter} tables`}</strong>
            <span>{visibleTables.length}</span>
          </div>
          {visibleTables.map(entry => (
            <button className="tv-table-card" key={entry.table_name} onClick={() => chooseTable(entry)}>
              <span>
                <strong>{entry.table_name}</strong>
                <small>{entry.columns.length} columns · {entry.anon_select ? 'rows readable with current client access' : 'protected rows'}</small>
              </span>
              <b>›</b>
            </button>
          ))}
          {!visibleTables.length && <div className="tv-empty-list">No tables here.</div>}
        </section>
      )}
    </main>
  )
}
