import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import './library.css'

type LibraryProps = { onExit: () => void }
type Entry = { num: number; title: string; source: 'master' | 'appendix' }
type LibraryView = 'list' | 'reader'

const FONT_KEY = 'library-font-size'
const MIN_FONT = 13
const MAX_FONT = 26
const DEFAULT_FONT = 17

function unescapeMd(text: string): string {
  return text.replace(/\\([\\`*_{}[\]()#+\-.!>~|])/g, '$1')
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern = /(\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]+)\]\(([^)]+)\))/g
  let lastIndex = 0
  let key = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) nodes.push(unescapeMd(text.slice(lastIndex, match.index)))
    if (match[2] !== undefined) nodes.push(<strong key={`${keyPrefix}-${key++}`}>{unescapeMd(match[2])}</strong>)
    else if (match[3] !== undefined) nodes.push(<em key={`${keyPrefix}-${key++}`}>{unescapeMd(match[3])}</em>)
    else if (match[4] !== undefined) nodes.push(<a key={`${keyPrefix}-${key++}`} href={match[5]} target="_blank" rel="noreferrer">{unescapeMd(match[4])}</a>)
    lastIndex = pattern.lastIndex
  }
  if (lastIndex < text.length) nodes.push(unescapeMd(text.slice(lastIndex)))
  return nodes
}

function headingTag(level: number, key: number, content: ReactNode[]) {
  switch (Math.min(level, 6)) {
    case 1: return <h1 key={key}>{content}</h1>
    case 2: return <h2 key={key}>{content}</h2>
    case 3: return <h3 key={key}>{content}</h3>
    case 4: return <h4 key={key}>{content}</h4>
    case 5: return <h5 key={key}>{content}</h5>
    default: return <h6 key={key}>{content}</h6>
  }
}

function renderMarkdown(source: string): ReactNode[] {
  const lines = source.split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  let key = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { i++; continue }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      blocks.push(headingTag(heading[1].length, key++, renderInline(heading[2].trim(), `h${key}`)))
      i++
      continue
    }

    if (/^-{3,}$/.test(line.trim())) { blocks.push(<hr key={key++} />); i++; continue }

    const image = /^!\[[^\]]*\]\(([^)]+)\)$/.exec(line.trim())
    if (image) {
      blocks.push(<img key={key++} src={`/library/tabs/${image[1]}`} alt="" className="doc-image" />)
      i++
      continue
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ''))
        i++
      }
      blocks.push(<ul key={key++}>{items.map((item, idx) => <li key={idx}>{renderInline(item, `li${key}-${idx}`)}</li>)}</ul>)
      continue
    }

    if (line.replace(/[*\\\s]/g, '')) blocks.push(<p key={key++}>{renderInline(line, `p${key}`)}</p>)
    i++
  }
  return blocks
}

export function Library({ onExit }: LibraryProps) {
  const [view, setView] = useState<LibraryView>('list')
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [current, setCurrent] = useState<Entry | null>(null)
  const [content, setContent] = useState('')
  const [contentLoading, setContentLoading] = useState(false)
  const [fontSize, setFontSize] = useState(() => {
    const saved = Number(localStorage.getItem(FONT_KEY))
    return saved >= MIN_FONT && saved <= MAX_FONT ? saved : DEFAULT_FONT
  })
  const readerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    fetch('/library/manifest.json')
      .then(res => { if (!res.ok) throw new Error('Could not load the document list.'); return res.json() })
      .then((data: Entry[]) => { setEntries(data); setLoading(false) })
      .catch((err: Error) => { setError(err.message); setLoading(false) })
  }, [])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return entries
    return entries.filter(e => e.title.toLowerCase().includes(q))
  }, [entries, search])

  function saveFontSize(next: number) {
    const clamped = Math.max(MIN_FONT, Math.min(MAX_FONT, next))
    setFontSize(clamped)
    localStorage.setItem(FONT_KEY, String(clamped))
  }

  function openEntry(entry: Entry) {
    setCurrent(entry)
    setView('reader')
    setContentLoading(true)
    setContent('')
    fetch(`/library/tabs/${entry.num}.md`)
      .then(res => { if (!res.ok) throw new Error('Could not load this document.'); return res.text() })
      .then(text => { setContent(text); setContentLoading(false) })
      .catch((err: Error) => { setError(err.message); setContentLoading(false) })
    readerRef.current?.scrollTo(0, 0)
  }

  function step(delta: number) {
    if (!current) return
    const idx = entries.findIndex(e => e.num === current.num)
    const next = entries[idx + delta]
    if (next) openEntry(next)
  }

  return (
    <main className="shell library-shell">
      {view === 'list' ? (
        <>
          <header className="library-top">
            <div><div className="eyebrow">The Lab · Library</div><h1>Procedia Documentation</h1></div>
            <button className="hub-button" onClick={onExit}>Hub</button>
          </header>
          <div className="library-tools">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a tab…" />
            <div className="library-count">{visible.length} / {entries.length}</div>
          </div>
          {loading && <div className="center">Loading…</div>}
          {error && <div className="notice">{error}</div>}
          {!loading && !error && (
            <ul className="library-list">
              {visible.map(entry => (
                <li key={entry.num}>
                  <button className="library-item" onClick={() => openEntry(entry)}>
                    <span className="library-item-num">{String(entry.num).padStart(3, '0')}</span>
                    <span className="library-item-title">{entry.title}</span>
                    <span className={`library-item-source library-item-source-${entry.source}`}>{entry.source}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          <header className="library-top">
            <div>
              <div className="eyebrow">{current ? `${String(current.num).padStart(3, '0')} · ${current.source}` : ''}</div>
              <h1 className="library-reader-title">{current?.title ?? ''}</h1>
            </div>
            <div className="library-reader-actions">
              <button className="library-font-button" onClick={() => saveFontSize(fontSize - 1)} aria-label="Smaller text">A−</button>
              <button className="library-font-button" onClick={() => saveFontSize(fontSize + 1)} aria-label="Bigger text">A+</button>
              <button className="hub-button" onClick={() => setView('list')}>List</button>
              <button className="hub-button" onClick={onExit}>Hub</button>
            </div>
          </header>
          <div className="library-reader" ref={readerRef} style={{ fontSize: `${fontSize}px` }}>
            {contentLoading && <div className="center">Loading…</div>}
            {!contentLoading && current && renderMarkdown(content)}
          </div>
          <div className="library-nav">
            <button onClick={() => step(-1)} disabled={!current || entries.findIndex(e => e.num === current.num) <= 0}>← Prev</button>
            <button onClick={() => step(1)} disabled={!current || entries.findIndex(e => e.num === current.num) >= entries.length - 1}>Next →</button>
          </div>
        </>
      )}
    </main>
  )
}
