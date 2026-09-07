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

type DisplayMode = 'auto' | 'compact' | 'wrap'
type Density = 'compact' | 'comfortable'

const PAGE_SIZE = 50
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
const VISUAL_PREVIEW = import.meta.env.VITE_TABLE_VIEWER_VISUAL_PREVIEW === '1'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const UUID_FIND_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/ig

const PREVIEW_TABLE: CatalogEntry = {
  table_name: 'atomonyms',
  columns: ['id', 'nemonym_id', 'pleuronym_id', 'label', 'notes', 'created_at'],
  rls_enabled: true,
  anon_select: true,
}

const PREVIEW_CATALOG: CatalogEntry[] = [
  PREVIEW_TABLE,
  { table_name: 'thekonyms', columns: ['id', 'term', 'definition', 'status'], rls_enabled: true, anon_select: false },
  { table_name: 'schemonyms', columns: ['id', 'name', 'description', 'type'], rls_enabled: true, anon_select: false },
  { table_name: 'semonyms', columns: ['id', 'semonym', 'schemonym_id'], rls_enabled: true, anon_select: false },
  { table_name: 'concept_interactions', columns: ['id', 'interaction_code', 'source_coordinate', 'target_coordinate'], rls_enabled: true, anon_select: false },
]

const PREVIEW_ROWS: Record<string, unknown>[] = [
  { id: '3c7387b2-8460-4d4d-8ad7-3b83f33870cc', nemonym_id: '5b9d165e-e6ee-4abd-a4cb-12fb1266be6b', pleuronym_id: 'e9d8b813-e5fd-4a08-bd32-cde4e3132e21', label: 'cat', notes: 'A human-readable value gets room to breathe while technical identifiers stay compact.', created_at: '2026-09-08T05:15:00Z' },
  { id: '746e594f-d516-48ae-9200-9208315ac44b', nemonym_id: '94535420-4a27-4a31-9a71-000000000001', pleuronym_id: '0aa9fabe-65fd-4826-8923-000000000002', label: 'dog', notes: 'Long prose wraps automatically in Auto mode instead of forcing huge columns.', created_at: '2026-09-08T05:16:00Z' },
  { id: 'c6624299-1415-41c2-856f-33b5f4763842', nemonym_id: '18dcb6f1-b0e6-47e0-a854-000000000003', pleuronym_id: '87f581de-6610-4be2-8797-000000000004', label: 'frog', notes: null, created_at: '2026-09-08T05:17:00Z' },
]

function fullValue(value: unknown) {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function isTechnicalColumn(column: string) {
  return column === 'id' || /_id$/.test(column) || /(^|_)(uuid|key|hash)$/.test(column)
}

function compactUuidText(text: string) {
  if (UUID_RE.test(text)) return text.slice(0, 5) + '…'
  return text.replace(UUID_FIND_RE, match => match.slice(0, 5) + '…')
}

function displayedValue(column: string, value: unknown, mode: DisplayMode) {
  const text = fullValue(value)
  if (text === 'NULL') return text
  if (mode !== 'wrap' && (isTechnicalColumn(column) || UUID_RE.test(text))) return compactUuidText(text)
  return mode === 'auto' ? compactUuidText(text) : text
}

function columnKind(column: string, rows: Record<string, unknown>[]) {
  if (isTechnicalColumn(column)) return 'technical'
  const values = rows.slice(0, 12).map(row => row[column]).filter(value => value !== null && value !== undefined)
  if (values.length && values.every(value => typeof value === 'boolean')) return 'boolean'
  const longest = values.reduce<number>((max, value) => Math.max(max, fullValue(value).length), 0)
  return longest > 60 ? 'prose' : 'normal'
}

export function TableViewer({ pin, onExit }: Props) {
  const [catalog, setCatalog] = useState<CatalogEntry[]>([])
  const [letter, setLetter] = useState('ALL')
  const [search, setSearch] = useState('')
  const previewTableOpen = VISUAL_PREVIEW && new URLSearchParams(window.location.search).get('visual') === 'table'
  const previewSettingsOpen = VISUAL_PREVIEW && new URLSearchParams(window.location.search).get('settings') === '1'
  const [selected, setSelected] = useState<CatalogEntry | null>(previewTableOpen ? PREVIEW_TABLE : null)
  const [rows, setRows] = useState<Record<string, unknown>[]>(previewTableOpen ? PREVIEW_ROWS : [])
  const [loadingCatalog, setLoadingCatalog] = useState(true)
  const [loadingRows, setLoadingRows] = useState(false)
  const [rowError, setRowError] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [freezeFirst, setFreezeFirst] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(previewSettingsOpen)
  const [displayMode, setDisplayMode] = useState<DisplayMode>('auto')
  const [density, setDensity] = useState<Density>('compact')

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
    const { data, error } = await supabase.from(entry.table_name).select('*').range(start, end)

    if (error) {
      if (reset) setRows([])
      setHasMore(false)
      setRowError(error.code === '42501'
        ? 'Rows are protected by this table’s current Supabase access rules.'
        : error.message)
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
      <main className={'tv-shell density-' + density}>
        <header className="tv-compact-topbar">
          <button className="tv-icon-button tv-back-compact" onClick={() => { setSelected(null); setRows([]); setRowError(''); setSettingsOpen(false) }}>‹</button>
          <strong className="tv-compact-title" title={selected.table_name}>{selected.table_name}</strong>
          <button className={'tv-icon-button' + (settingsOpen ? ' active' : '')} onClick={() => setSettingsOpen(value => !value)} aria-label="Table settings">⚙</button>
        </header>

        {settingsOpen && (
          <aside className="tv-settings" aria-label="Table viewer settings">
            <div className="tv-settings-head">
              <strong>View settings</strong>
              <button onClick={() => setSettingsOpen(false)}>Done</button>
            </div>

            <label className="tv-setting-row">
              <span><strong>Freeze first data column</strong><small>Row numbers and headers always stay frozen.</small></span>
              <input type="checkbox" checked={freezeFirst} onChange={event => setFreezeFirst(event.target.checked)} />
            </label>

            <div className="tv-setting-block">
              <strong>Cell display</strong>
              <div className="tv-segmented">
                {(['auto', 'compact', 'wrap'] as DisplayMode[]).map(mode => (
                  <button key={mode} className={displayMode === mode ? 'active' : ''} onClick={() => setDisplayMode(mode)}>
                    {mode[0].toUpperCase() + mode.slice(1)}
                  </button>
                ))}
              </div>
              <small>Auto shortens UUIDs, keeps small values tight, and wraps useful prose.</small>
            </div>

            <div className="tv-setting-block">
              <strong>Row density</strong>
              <div className="tv-segmented">
                {(['compact', 'comfortable'] as Density[]).map(item => (
                  <button key={item} className={density === item ? 'active' : ''} onClick={() => setDensity(item)}>
                    {item[0].toUpperCase() + item.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="tv-settings-meta">
              <span>{columns.length} columns</span>
              <span>{rows.length} rows loaded</span>
              <span>{selected.rls_enabled ? 'RLS on' : 'RLS off'}</span>
              <span>Read only</span>
            </div>
          </aside>
        )}

        {rowError && <div className="tv-notice">{rowError}</div>}

        <section className="tv-grid-wrap tv-grid-wrap-compact" aria-label={selected.table_name + ' data'}>
          <table className={'tv-grid mode-' + displayMode + (freezeFirst ? ' freeze-first' : '')}>
            <thead>
              <tr>
                <th className="tv-row-number">#</th>
                {columns.map(column => <th key={column} className={'col-' + columnKind(column, rows)}>{column}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  <th className="tv-row-number">{rowIndex + 1}</th>
                  {columns.map(column => {
                    const raw = fullValue(row[column])
                    const kind = columnKind(column, rows)
                    return (
                      <td key={column} className={(row[column] == null ? 'is-null ' : '') + 'col-' + kind} title={raw === 'NULL' ? undefined : raw}>
                        {displayedValue(column, row[column], displayMode)}
                      </td>
                    )
                  })}
                </tr>
              ))}
              {!loadingRows && !rowError && rows.length === 0 && (
                <tr><td colSpan={Math.max(2, columns.length + 1)} className="tv-empty">No visible rows.</td></tr>
              )}
            </tbody>
          </table>
        </section>

        <footer className="tv-footer tv-footer-compact">
          {loadingRows ? <span>Loading…</span> : hasMore ? <button onClick={() => void loadRows(selected, false)}>Load 50 more</button> : rows.length ? <span>End</span> : null}
        </footer>
      </main>
    )
  }

  return (
    <main className="tv-shell">
      <header className="tv-index-header">
        <button className="tv-icon-button" onClick={onExit}>‹</button>
        <strong>Tables</strong>
      </header>

      <section className="tv-controls">
        <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Find a table…" aria-label="Find a table" />
        <div className="tv-letters" aria-label="Filter tables by first letter">
          <button className={letter === 'ALL' ? 'active' : ''} onClick={() => setLetter('ALL')}>ALL</button>
          {LETTERS.map(item => (
            <button key={item} className={letter === item ? 'active' : ''} onClick={() => setLetter(item)} disabled={!catalog.some(entry => entry.table_name.toUpperCase().startsWith(item))}>{item}</button>
          ))}
        </div>
      </section>

      {loadingCatalog ? <div className="tv-center">Loading tables…</div> : (
        <section className="tv-table-list">
          <div className="tv-list-head"><strong>{letter === 'ALL' ? 'All tables' : letter + ' tables'}</strong><span>{visibleTables.length}</span></div>
          {visibleTables.map(entry => (
            <button className="tv-table-card" key={entry.table_name} onClick={() => chooseTable(entry)}>
              <span><strong>{entry.table_name}</strong><small>{entry.columns.length} columns · {entry.anon_select ? 'rows readable' : 'protected rows'}</small></span>
              <b>›</b>
            </button>
          ))}
          {!visibleTables.length && <div className="tv-empty-list">No tables here.</div>}
        </section>
      )}
    </main>
  )
}
