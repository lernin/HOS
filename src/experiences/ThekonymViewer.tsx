import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { alphabetLetter, calculatedPriority, checkedAgo, confidencePresentation, examples, fluencyNames, freshCopy, maturityNames, paperUrl, priorityExplanation, pronunciation, score, searchCatalogue, writeClipboard } from '../lib/thekonymViewer'
import type { CatalogueTerm, Confidence, ConfidenceField, ContentField, EditResult, ThekonymRecord, ViewerSource } from '../lib/thekonymViewer'
import { Crosses, DiscussionPanel, EditableConfidence, EditingContext, fieldConfidence, useDoubleTap } from './ThekonymInteraction'
import './thekonym-viewer.css'

function Icon({ name }: { name: 'back' | 'search' | 'copy' | 'refresh' | 'close' | 'book' | 'arrow' }) {
  const paths = {
    back: <path d="m14 6-6 6 6 6M8 12h12" />,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
    copy: <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3" /></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5M5.2 7a8 8 0 0 1 13-2L20 8M4 16l1.8 3A8 8 0 0 0 19 17" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    book: <><path d="M12 5C8 2 4 3 2 4v15c3-1 6-1 10 1 4-2 7-2 10-1V4c-2-1-6-2-10 1Zm0 0v15" /></>,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function ConfidenceMark({ value, field }: { value: Confidence | undefined; field?: ConfidenceField }) {
  const context = useContext(EditingContext)
  return field && context?.record ? <EditableConfidence key={`${context.record.id}:${field}`} value={value ?? null} field={field} /> : <Crosses value={value} />
}

function Section({ title, confidence, complete = true, children, className = '' }: { title: string; confidence?: Confidence; complete?: boolean; children: ReactNode; className?: string }) {
  const context = useContext(EditingContext)
  const fields: Record<string, ContentField> = { Definition: 'definition', 'Technical Definition': 'technical_definition', Examples: 'example' }
  const field = fields[title]
  const canDiscuss = field && context?.source.chat
  const gestures = useDoubleTap(() => { if (canDiscuss) context.discuss(field) })
  const state = confidence === undefined ? '' : confidencePresentation(confidence, complete).state
  return <section {...(canDiscuss ? gestures : {})} className={`tv-section ${canDiscuss ? 'tv-discussable' : ''} ${['Definition', 'Technical Definition', 'Examples', 'Confidence & Readiness', 'Priority'].includes(title) ? 'tv-section-centered' : ''} ${state ? `tv-${state}` : ''} ${className}`}><h2>{title}{confidence !== undefined && <ConfidenceMark value={complete ? confidence : null} field={field && complete ? fieldConfidence[field] : undefined} />}{canDiscuss && <button className="tv-discuss-button" aria-label={`Discuss ${title}`} title="Discuss this passage" onClick={() => context.discuss(field)}>↗</button>}</h2>{children}</section>
}

const readingMemoryKey = 'procedia-thekonym-reading-v1'
function readMemory(): { current?: string; previous?: string } {
  try {
    const value = JSON.parse(localStorage.getItem(readingMemoryKey) || '{}')
    return { current: typeof value?.current === 'string' ? value.current : undefined, previous: typeof value?.previous === 'string' ? value.previous : undefined }
  } catch { return {} }
}

function Missing({ text = 'Not recorded' }: { text?: string }) { return <span className="tv-missing">{text}</span> }
function Value({ children }: { children: ReactNode }) { return children == null || children === '' ? <Missing /> : <>{children}</> }
function Fact({ label, confidence, children }: { label: string; confidence?: Confidence; children: ReactNode }) { return <div className={`tv-fact ${confidence === undefined ? '' : `tv-${confidencePresentation(confidence).state}`}`}><dt>{label}{confidence !== undefined && <ConfidenceMark value={confidence} />}</dt><dd>{children}</dd></div> }
function BooleanValue({ value }: { value: boolean | null }) { return <span className={value == null ? 'tv-missing' : ''}>{value == null ? 'Unassessed' : value ? 'Yes' : 'No'}</span> }
function dateLabel(value: string | null | undefined): string { return value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Not recorded' }

export type ViewerInitialData = { catalogue: CatalogueTerm[]; record: ThekonymRecord }

export function ThekonymViewer({ source, onExit, initialData, onSignOut }: { source: ViewerSource; onExit: () => void; initialData?: ViewerInitialData; onSignOut?: () => void }) {
  const [catalogue, setCatalogue] = useState<CatalogueTerm[]>(initialData?.catalogue || [])
  const [selectedId, setSelectedId] = useState(initialData?.record.id || '')
  const [record, setRecord] = useState<ThekonymRecord | null>(initialData?.record || null)
  const [checkedAt, setCheckedAt] = useState<string | null>(initialData ? source.capturedAt || null : null)
  const [clock, setClock] = useState(Date.now())
  useEffect(() => { const timer = window.setInterval(() => setClock(Date.now()), 15000); return () => window.clearInterval(timer) }, [])
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [activeResult, setActiveResult] = useState(0)
  const [alphabetOpen, setAlphabetOpen] = useState(false)
  const [letter, setLetter] = useState('')
  const indexDialog = useRef<HTMLDialogElement>(null)
  const [discussion, setDiscussion] = useState<{ record: ThekonymRecord; field: ContentField } | null>(null)
  useEffect(() => { if (alphabetOpen) indexDialog.current?.showModal() }, [alphabetOpen])
  const [initialMemory] = useState(readMemory)
  const [previousId, setPreviousId] = useState(initialMemory.previous || '')
  const memoryRef = useRef(initialMemory)
  const [trail, setTrail] = useState(() => ({ ids: [initialMemory.previous, initialMemory.current].filter((id): id is string => Boolean(id)), index: initialMemory.current ? (initialMemory.previous ? 1 : 0) : -1 }))
  const historyTarget = useRef<number | null>(null)
  const catalogueRef = useRef<HTMLElement>(null)
  const [busy, setBusy] = useState(!initialData)
  const [copying, setCopying] = useState(false)
  const [error, setError] = useState('')
  const [announcement, setAnnouncement] = useState('')
  const [fallbackCopy, setFallbackCopy] = useState('')
  const [online, setOnline] = useState(typeof navigator === 'undefined' || navigator.onLine !== false)
  const requestRef = useRef<AbortController | null>(null)
  const generation = useRef(0)
  const selectedRef = useRef(initialData?.record.id || '')
  const alive = useRef(true)
  const searchRef = useRef<HTMLInputElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const recordHeading = useRef<HTMLHeadingElement>(null)

  const results = useMemo(() => searchCatalogue(catalogue, query).filter(t => !letter || alphabetLetter(t.term) === letter), [catalogue, query, letter])
  const letters = useMemo(() => new Set(catalogue.map(t => alphabetLetter(t.term))), [catalogue])
  const names = useMemo(() => new Map(catalogue.map(t => [t.id, t.term])), [catalogue])

  const loadRecord = useCallback(async (id: string, scroll = false) => {
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    const version = ++generation.current
    setBusy(true)
    setError('')
    try {
      const fresh = await source.loadRecord(id, controller.signal)
      if (controller.signal.aborted || version !== generation.current || !alive.current) return
      setRecord(fresh)
      const target = historyTarget.current
      historyTarget.current = null
      setTrail(previous => {
        if (target != null && previous.ids[target] === id) return { ...previous, index: target }
        if (previous.ids[previous.index] === id) return previous
        const ids = [...previous.ids.slice(0, previous.index + 1), id].slice(-60)
        return { ids, index: ids.length - 1 }
      })
      if (memoryRef.current.current !== id) {
        const previous = memoryRef.current.current || memoryRef.current.previous
        memoryRef.current = { current: id, previous }
        setPreviousId(previous || '')
        try { localStorage.setItem(readingMemoryKey, JSON.stringify(memoryRef.current)) } catch { /* Reading still works when storage is unavailable. */ }
      }
      setCheckedAt(source.mode === 'snapshot' ? source.capturedAt || null : new Date().toISOString())
      if (scroll) scroller.current?.scrollTo({ top: 0, behavior: 'instant' })
    } catch (e) {
      if (!controller.signal.aborted && alive.current) setError(e instanceof Error ? e.message : 'The record could not be refreshed.')
    } finally {
      if (version === generation.current && alive.current) setBusy(false)
    }
  }, [source])

  const loadCatalogue = useCallback(async (signal: AbortSignal) => {
    const terms = await source.loadCatalogue(signal)
    if (signal.aborted || !alive.current) return
    if (!terms.length) throw new Error('The collection is empty or temporarily unavailable. Please try again.')
    terms.sort((a, b) => a.term.localeCompare(b.term))
    setCatalogue(terms)
    const requested = new URLSearchParams(window.location.search).get('term')
    const target = terms.find(t => t.id === selectedRef.current) || terms.find(t => t.id === requested || t.term.toLowerCase() === requested?.toLowerCase()) || terms.find(t => t.id === memoryRef.current.current) || terms.find(t => t.term === 'Techmonym') || terms[0]
    selectedRef.current = target.id
    setSelectedId(target.id)
    await loadRecord(target.id)
  }, [loadRecord, source])

  useEffect(() => {
    alive.current = true
    const controller = new AbortController()
    void loadCatalogue(controller.signal).catch(e => {
      if (!controller.signal.aborted) { setError(e instanceof Error ? e.message : 'Could not read the catalogue.'); setBusy(false) }
    })
    return () => { alive.current = false; controller.abort(); requestRef.current?.abort(); generation.current++ }
  }, [loadCatalogue])

  useEffect(() => {
    if (source.mode !== 'live') return
    const catalogueController = new AbortController()
    let running = false
    const refresh = async () => {
      setOnline(navigator.onLine)
      if (!navigator.onLine || document.visibilityState !== 'visible' || running) return
      running = true
      try { await loadCatalogue(catalogueController.signal) }
      catch (e) { if (!catalogueController.signal.aborted) setError(e instanceof Error ? e.message : 'Refresh failed.') }
      finally { running = false }
    }
    const offline = () => setOnline(false)
    window.addEventListener('online', refresh)
    window.addEventListener('offline', offline)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    const interval = window.setInterval(refresh, 30000)
    return () => { catalogueController.abort(); window.clearInterval(interval); window.removeEventListener('online', refresh); window.removeEventListener('offline', offline); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [loadCatalogue, source.mode])

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchRef.current?.focus(); setSearchOpen(true) } }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [])

  useEffect(() => {
    if (!searchOpen) return
    const dismiss = (event: PointerEvent) => { if (!catalogueRef.current?.contains(event.target as Node)) { setSearchOpen(false); setAlphabetOpen(false) } }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setSearchOpen(false); setAlphabetOpen(false); searchRef.current?.focus() } }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape) }
  }, [searchOpen])

  function choose(id: string, historyIndex: number | null = null) {
    historyTarget.current = historyIndex
    if (selectedRef.current !== id) setCheckedAt(null)
    selectedRef.current = id
    setSelectedId(id)
    setSearchOpen(false)
    setAlphabetOpen(false)
    setLetter('')
    setQuery('')
    setFallbackCopy('')
    setAnnouncement('')
    try {
      const url = new URL(window.location.href)
      url.searchParams.set('term', id)
      window.history.replaceState(window.history.state, '', url)
    } catch { /* A downloaded or sandboxed HTML preview may disallow history writes. */ }
    void loadRecord(id, true).then(() => recordHeading.current?.focus({ preventScroll: true }))
  }

  async function copy() {
    if (!record || copying) return
    const id = selectedId
    const version = generation.current
    const controller = new AbortController()
    setCopying(true)
    setAnnouncement('')
    setFallbackCopy('')
    try {
      // A copy is a separate fresh read. A failed refresh never copies the old screen.
      const { record: fresh, capturedAt: time, text } = await freshCopy(source, id, controller.signal)
      if (!alive.current || id !== selectedRef.current) return
      if (version === generation.current) { setRecord(fresh); setCheckedAt(time); setError('') }
      try { await writeClipboard(text); setAnnouncement(source.mode === 'live' ? 'Fresh record copied for ChatGPT.' : 'Preview snapshot copied for ChatGPT.') }
      catch { setFallbackCopy(text); setAnnouncement('Select the text below and copy it.') }
    } catch (e) {
      if (alive.current) setAnnouncement(`Nothing copied. ${e instanceof Error ? e.message : 'Could not verify the latest record.'}`)
    } finally { if (alive.current) setCopying(false) }
  }

  const current = record?.id === selectedId ? record : null
  const children = catalogue.filter(t => t.is_child_of === current?.id)
  const freshLabel = source.mode === 'snapshot' ? `Snapshot · ${dateLabel(source.capturedAt)}` : checkedAt ? checkedAgo(checkedAt, clock) : busy ? 'Reading…' : 'Not read yet'
  const stale = !online || Boolean(error) || !checkedAt || clock - Date.parse(checkedAt) >= 300000
  const resolveTerm = (value: string) => catalogue.find(t => t.id === value || t.term.toLowerCase() === value.toLowerCase())
  const parents = current?.is_child_of ? [current.is_child_of] : []
  const termTag = (value: string) => {
    const term = resolveTerm(value)
    return term ? <button key={value} className={`tv-term-tag ${term.status === 'canonical' ? 'tv-tag-canonical' : ''}`} onClick={() => choose(term.id)}>{term.term}<Icon name="arrow" /></button> : <span key={value} className="tv-term-tag tv-unlinked">{names.get(value) || (/^[0-9a-f-]{36}$/i.test(value) ? 'Unresolved reference' : value)}</span>
  }
  const relation = (id: string) => names.has(id) ? <button className="tv-related" onClick={() => choose(id)}>{names.get(id)}<Icon name="arrow" /></button> : <span className="tv-missing">Unresolved reference</span>
  const paper = paperUrl(current?.canonical_paper_path || null)
  const notes = current ? [
    ['Notes', current.notes], ['Review note', current.review_note], ['Concept rationale', current.concept_rationale],
    ['Structure note', current.structure_note], ['Greek root explanation', current.greek_root_explanation],
    ['GitHub review note', current.github_review_note], ['Google Docs review note', current.google_docs_review_note],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]?.trim())) : []

  function onSaved(result: EditResult) {
    if (result.record.id === selectedRef.current) { setRecord(result.record); setCheckedAt(new Date().toISOString()); setError('') }
    setCatalogue(terms => terms.map(t => t.id === result.record.id ? { ...t, ...result.record } : t))
    setAnnouncement('Saved.')
  }
  function closeIndex() { setAlphabetOpen(false); setSearchOpen(false); setLetter('') }
  const resultList = <div id="tv-search-results" role="listbox" aria-label="Thekonyms" className={`tv-results${searchOpen ? ' tv-results-open' : ''}`}>
    <div className="tv-results-summary">{letter ? `${letter} · ${results.length} terms` : query ? `${results.length} matching terms` : 'THE COLLECTION'}</div>
    {results.map((t, i) => <button type="button" key={t.id} id={`tv-result-${t.id}`} role="option" aria-selected={selectedId === t.id} className={`tv-result${selectedId === t.id ? ' selected' : ''}${searchOpen && activeResult === i ? ' active' : ''}`} onClick={() => choose(t.id)}><span>{t.term}</span><small>{t.greek_root_meaning || 'Meaning not recorded'}</small>{selectedId === t.id && <span className="tv-result-dot" />}</button>)}
    {!results.length && <p className="tv-search-empty">No matching terms.</p>}
  </div>

  return <EditingContext.Provider value={{ record: current, source, online, onSaved, discuss: field => { if (current) setDiscussion({ record: current, field }) } }}><div className="tv-shell">
    <header className="tv-topbar"><button className="tv-back" onClick={onExit}><Icon name="back" /><span>The Lab</span></button><button className="tv-wordmark" onClick={() => { const target = catalogue.some(t => t.id === previousId) ? previousId : selectedId; if (target) choose(target) }} title={names.has(previousId) ? `Return to ${names.get(previousId)}` : 'Return to your reading'} aria-label={names.has(previousId) ? `PROCEDIA: return to ${names.get(previousId)}` : 'PROCEDIA: return to your reading'}>PROCEDIA</button>{onSignOut && <button className="tv-sign-out" onClick={onSignOut}>Sign out</button>}<button className="tv-copy" onClick={() => void copy()} disabled={!current || copying || (source.mode === 'live' && !online)}><Icon name="copy" /><span>{copying ? 'Checking…' : 'Copy'}</span></button></header>
    <div className="tv-reading-tools"><nav className="tv-history" aria-label="Reading history"><button disabled={trail.index <= 0 || busy} aria-label="Previous term" onClick={() => choose(trail.ids[trail.index - 1], trail.index - 1)}>←</button><button disabled={trail.index >= trail.ids.length - 1 || busy} aria-label="Next term" onClick={() => choose(trail.ids[trail.index + 1], trail.index + 1)}>→</button></nav><div className={`tv-freshness ${stale ? 'tv-caution' : ''}`} title={!online ? 'Offline. Showing the last successful read.' : error || 'Time since the last successful database read'}><span className="tv-status-dot" aria-label={stale ? 'Connection or freshness needs attention' : 'Connected and current'} /><span>{freshLabel}</span>{source.mode === 'live' && <button onClick={() => { const c = new AbortController(); void loadCatalogue(c.signal).catch(e => { setError(String(e)); setBusy(false) }) }} aria-label="Refresh from production" disabled={busy}><Icon name="refresh" /></button>}</div></div>
    <div className="tv-layout">
      <aside className="tv-catalogue" ref={catalogueRef}>
        <div className="tv-catalogue-title"><Icon name="book" /><span>Thekonyms</span><span className="tv-count">{catalogue.length || '—'}</span></div>
        <div className="tv-search-wrap"><Icon name="search" /><input ref={searchRef} aria-label="Find a Thekonym" placeholder="Find a Thekonym…" role="combobox" aria-expanded={searchOpen} aria-controls="tv-search-results" aria-autocomplete="list" aria-activedescendant={searchOpen && results[activeResult] ? `tv-result-${results[activeResult].id}` : undefined} value={query} onChange={e => { setQuery(e.target.value); setLetter(''); setAlphabetOpen(false); setActiveResult(0); setSearchOpen(true) }} onKeyDown={e => {
          if (e.key === 'Escape') { setSearchOpen(false); searchRef.current?.blur() }
          if (e.key === 'ArrowDown') { e.preventDefault(); setSearchOpen(true); setActiveResult(i => Math.max(0, Math.min(results.length - 1, i + 1))) }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActiveResult(i => Math.max(0, i - 1)) }
          if (e.key === 'Enter' && searchOpen && results[activeResult]) { e.preventDefault(); choose(results[activeResult].id) }
        }} />{(query || searchOpen) && <button className="tv-search-dismiss" onClick={() => { setSearchOpen(false); setAlphabetOpen(false); setLetter(''); setQuery('') }} aria-label="Close search"><Icon name="close" /></button>}<button className="tv-az" aria-expanded={alphabetOpen} aria-controls="tv-alphabet" onClick={() => { const open = !alphabetOpen; setAlphabetOpen(open); setSearchOpen(open); setQuery(''); setLetter(''); setActiveResult(0) }}>A–Z</button></div>
        {alphabetOpen ? <dialog ref={indexDialog} className="tv-index-dialog" aria-labelledby="tv-index-title" onCancel={closeIndex}>
          <header><h2 id="tv-index-title">The collection <span>A–Z</span></h2><button onClick={closeIndex} aria-label="Close alphabet browser"><Icon name="close" /></button></header>
          <div id="tv-alphabet" className="tv-alphabet" aria-label="Browse by initial letter">{'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').concat(letters.has('#') ? ['#'] : []).map(l => <button key={l} disabled={!letters.has(l)} aria-pressed={letter === l} onClick={() => { setLetter(l); setActiveResult(0) }}>{l}</button>)}</div>
          {resultList}
        </dialog> : <div className={`tv-browse${searchOpen ? ' tv-browse-open' : ''}`}>{resultList}</div>}
      </aside>
      <div className="tv-reading" ref={scroller}>

        {error && !current && <div className="tv-alert" role="alert"><strong>{current ? 'The displayed record may be out of date.' : 'Live access needs to be connected.'}</strong><p>{error}</p>{current && <p>Copy will try a fresh read before putting anything on your clipboard.</p>}</div>}
        {announcement && <div className="tv-toast" role="status">{announcement}</div>}
        {fallbackCopy && <div className="tv-copy-fallback"><button onClick={e => { const area = e.currentTarget.nextElementSibling as HTMLTextAreaElement; area.focus(); area.select() }}>Select text</button><textarea aria-label="Record to copy for ChatGPT" readOnly value={fallbackCopy} /></div>}
        {!current && <div className="tv-empty"><Icon name="book" /><h1>{busy ? 'Opening the collection…' : 'Your collection, clearly.'}</h1><p>{busy ? 'Reading the latest record.' : 'Search or browse A–Z to open a term.'}</p></div>}
        {current && <article className="tv-page" aria-busy={busy}>
          <div className="tv-identity">
            {parents.length > 0 && <div className="tv-constellation-top"><nav className="tv-parent-tags" aria-label="Parent"><span className="tv-tag-label">Parent</span>{parents.map(termTag)}</nav></div>}
            <div className="tv-title-group"><h1 ref={recordHeading} tabIndex={-1} className={current.status === 'canonical' ? 'tv-canonical' : 'tv-draft'} title={current.status || 'Status unassessed'}>{current.term}<span className="tv-sr-only"> — {current.status || 'status unassessed'}</span></h1><div className="tv-pronunciation" aria-label="Pronunciation">{pronunciation(current.term_pronunciation)}</div>
            <div className={`tv-greek-meaning tv-${confidencePresentation(current.greek_root_meaning_confidence, Boolean(current.greek_root_meaning?.trim())).state}`} aria-label="Root meaning"><span><Value>{current.greek_root_meaning}</Value><ConfidenceMark value={current.greek_root_meaning?.trim() ? current.greek_root_meaning_confidence : null} field="greek_root_meaning_confidence" />{source.chat && <button className="tv-discuss-button" aria-label="Discuss root meaning" onClick={() => setDiscussion({ record: current, field: 'greek_root_meaning' })}>↗</button>}</span></div></div>
          </div>
          <Section title="Definition" confidence={current.definition_confidence} complete={Boolean(current.definition?.trim())} className="tv-definition"><p><Value>{current.definition}</Value></p></Section>
          <Section title="Technical Definition" confidence={current.technical_definition_confidence} complete={Boolean(current.technical_definition?.trim())}><p><Value>{current.technical_definition}</Value></p></Section>
          <Section title="Examples" confidence={current.example_confidence} complete={Boolean(current.example?.trim())}>{examples(current.example).length ? <ul className="tv-examples">{examples(current.example).map((e, i) => <li key={i}><p>{e}</p></li>)}</ul> : <p><Missing /></p>}</Section>
          <Section title="Confidence & Readiness" className="tv-assessment"><div className="tv-assessment-grid"><div><span className="tv-mini-label">COMBINED CONFIDENCE</span><div className="tv-big-score">{score(current.confidence_score)}<small>/ 27</small></div><p>{score(current.definition_confidence)} × {score(current.technical_definition_confidence)} × {score(current.example_confidence)}</p></div><div><span className="tv-mini-label">ASHLEY’S FLUENCY</span><div className="tv-big-score"><ConfidenceMark value={current.ashleys_fluency} field="ashleys_fluency" /></div><p>{current.ashleys_fluency == null ? 'Unassessed' : fluencyNames[current.ashleys_fluency]}</p></div></div><details className="tv-details"><summary>How to read these scores</summary><p>Red crosses show what remains: three for confidence 0, two for 1, one for 2. At 3, the heading turns green and the crosses disappear. A question mark means unassessed. Missing content never appears confirmed. The main name is green only when its status is canonical.</p><p>Combined confidence multiplies the definition, technical definition, and examples scores. Greek meaning is assessed separately. This is a review score, not a probability.</p></details><dl className="tv-facts"><Fact label="Concept maturity">{current.maturity == null ? <Missing text="Unassessed" /> : `${current.maturity} / 5 · ${maturityNames[current.maturity] || ''}`}</Fact></dl></Section>
          <Section title="Priority"><dl className="tv-facts"><Fact label="Calculated priority"><strong>{Number(calculatedPriority(current).toFixed(2))}</strong></Fact><Fact label="Target phase"><Value>{current.target_phase}</Value></Fact><Fact label="Application priority"><Value>{current.application_priority}</Value></Fact></dl><div className="tv-formula">{priorityExplanation(current)}</div><details className="tv-details"><summary>How priority is calculated</summary><p>(table weight + application priority) ÷ target phase.</p><p>Table weight: 5 if a table, otherwise 1. Missing required inputs give a displayed priority of 0. Confidence does not enter this formula.</p></details></Section>
          <Section title="Implementation"><dl className="tv-facts"><Fact label="Is a table"><BooleanValue value={current.is_table} /></Fact><Fact label="Emergent"><BooleanValue value={current.is_emergent} /></Fact><Fact label="Derivable"><BooleanValue value={current.is_derivable} /></Fact><Fact label="Is a Physonym"><BooleanValue value={current.is_physonym} /></Fact></dl></Section>
          <Section title="Relationships"><dl className="tv-facts"><Fact label="Parent" confidence={current.anonym_confidence}>{current.is_child_of ? relation(current.is_child_of) : <Missing text="No parent recorded" />}</Fact><Fact label="Children">{children.length ? children.map(t => <span key={t.id}>{relation(t.id)}</span>) : <Missing text="No children recorded" />}</Fact><Fact label="Member of">{current.is_member_of?.length ? current.is_member_of.map(termTag) : <Missing text="No memberships recorded" />}</Fact><Fact label="Related terms">{current.is_related_to?.length ? current.is_related_to.map(id => <span key={id}>{relation(id)}</span>) : <Missing text="No links recorded" />}</Fact>{current.sibling_order != null && <Fact label="Sibling order" confidence={current.sibling_order_confidence}>{current.sibling_order}</Fact>}{(current.superseded_by_thekonym_id || current.superseded_by) && <Fact label="Superseded by" confidence={current.supersession_confidence}>{current.superseded_by_thekonym_id ? relation(current.superseded_by_thekonym_id) : current.superseded_by}</Fact>}{!!current.former_names?.length && <Fact label="Former names">{current.former_names.join(', ')}</Fact>}</dl></Section>
          <Section title="Reference & review"><dl className="tv-facts">{paper && <Fact label="Canonical paper"><a className="tv-paper-link" href={paper} target="_blank" rel="noreferrer">Read on GitHub ↗</a></Fact>}<Fact label="Status"><Value>{current.status}</Value></Fact><Fact label="Suggested status"><Value>{current.suggested_status}</Value></Fact><Fact label="GitHub quality" confidence={current.github_quality_score}>{current.github_quality?.replaceAll('_', ' ') || 'Unassessed'}</Fact><Fact label="Google Docs quality" confidence={current.google_docs_quality_score}>{current.google_docs_quality?.replaceAll('_', ' ') || 'Unassessed'}</Fact><Fact label="Docs migration">[{score(current.google_docs_migration_level)}] · {current.google_docs_migration_status?.replaceAll('_', ' ') || 'Unassessed'}</Fact></dl><details className="tv-details"><summary>Remaining assessments & record details</summary><dl className="tv-facts"><Fact label="Parent confidence">[{score(current.anonym_confidence)}]</Fact><Fact label="Sibling order confidence">[{score(current.sibling_order_confidence)}]</Fact><Fact label="Supersession confidence">[{score(current.supersession_confidence)}]</Fact><Fact label="Legacy significance"><Value>{current.significance}</Value></Fact><Fact label="Created">{dateLabel(current.created_at)}</Fact><Fact label="Recorded update time">{dateLabel(current.updated_at)}</Fact><Fact label="Record ID"><code>{current.id}</code></Fact></dl><p>The checked time above shows when this viewer retrieved the record. A stored update time is separate.</p></details></Section>
          <Section title="Notes" className="tv-notes">{source.chat && <button className="tv-discuss-notes" onClick={() => setDiscussion({ record: current, field: 'notes' })}>Discuss notes ↗</button>}{notes.length ? notes.map(([label, text]) => <div className="tv-note" key={label}>{label !== 'Notes' && <h3>{label}</h3>}<p>{text}</p></div>) : <p><Missing text="No notes recorded" /></p>}</Section>
          <footer className="tv-page-footer"><Icon name="book" /><span>PROCEDIA · THEKONYM COLLECTION</span><span>{source.mode === 'snapshot' ? 'Preview snapshot' : 'Double-tap a passage to discuss'}</span></footer>
        </article>}
      </div>
    </div>
    {discussion && <DiscussionPanel key={`${discussion.record.id}:${discussion.field}`} record={discussion.record} field={discussion.field} source={source} onSaved={onSaved} onClose={() => setDiscussion(null)} />}
  </div></EditingContext.Provider>
}
