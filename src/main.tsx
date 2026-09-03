import { StrictMode, Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { supabase } from './lib/supabase'
import { startRecordingSession, type RecordingSession } from './lib/voiceCapture'
import './experiences/thekonym-viewer.css'
import './thekonym.css'
import './thekonym-font-controls.css'
import './thekonym-interactions.css'

type Status = 'canonical' | 'provisional' | 'contested' | 'unclear' | 'retired' | 'superseded'
type DefinitionStatus = 'good' | 'needs_work'
type Filter = 'all' | 'unlabeled' | Status
type Theme = 'terminal-cream' | 'terminal-green' | 'ocean-blue' | 'cyberpunk' | 'holographic' | 'neural' | 'deep-space' | 'orbital'
type View = 'hub' | 'thekonym-viewer' | 'thekonym' | 'world3d' | 'roy' | 'ekpronym' | 'library' | 'scroller' | 'bookvocab'
type FontPrefs = { definition: number; thoughts: number; rail: number; judgment: number }
type SyncState = 'synced' | 'syncing' | 'offline'
type Term = {
  id: string
  term: string
  plain_definition: string | null
  status: Status | null
  former_names: string[]
  superseded_by: string | null
  technical_definition: string | null
  notes: string | null
  review_note: string | null
  definition_status: DefinitionStatus
}
type PendingChange =
  | { key: string; kind: 'status'; termId: string; value: Status; changedAt: number }
  | { key: string; kind: 'definition'; termId: string; value: DefinitionStatus; changedAt: number }
  | { key: string; kind: 'note'; termId: string; value: string; changedAt: number }

const statuses: { value: Status; label: string; hint: string }[] = [
  { value: 'canonical', label: 'Canonical', hint: 'Keep it' },
  { value: 'provisional', label: 'Provisional', hint: 'Probably good' },
  { value: 'contested', label: 'Contested', hint: 'Needs decision' },
  { value: 'unclear', label: 'Unclear', hint: 'Not clear yet' },
  { value: 'retired', label: 'Retired', hint: 'Do not use' },
  { value: 'superseded', label: 'Superseded', hint: 'Replaced' },
]

const themes: { value: Theme; label: string }[] = [
  { value: 'terminal-cream', label: 'Terminal Cream' },
  { value: 'terminal-green', label: 'Terminal Green' },
  { value: 'ocean-blue', label: 'Ocean Blue' },
  { value: 'cyberpunk', label: 'Night Mode' },
  { value: 'holographic', label: 'Holographic Glass' },
  { value: 'neural', label: 'Neural Wild' },
  { value: 'deep-space', label: 'Deep Space' },
  { value: 'orbital', label: 'Orbital Neon' },
]

const ACCESS_PIN = '3476'
const THEME_KEY = 'thekonym-theme'
const FONT_KEY = 'thekonym-font-prefs'
const TERMS_CACHE_KEY = 'thekonym-terms-cache-v1'
const OUTBOX_KEY = 'thekonym-sync-outbox-v1'
const DEFAULT_FONTS: FontPrefs = { definition: 16, thoughts: 17, rail: 15, judgment: 15 }
const World3D = lazy(() => import('./experiences/World3D').then(module => ({ default: module.World3D })))
const RoyVocab = lazy(() => import('./experiences/RoyVocab').then(module => ({ default: module.RoyVocab })))
const EkpronymReview = lazy(() => import('./experiences/EkpronymReview').then(module => ({ default: module.EkpronymReview })))
const Library = lazy(() => import('./experiences/Library').then(module => ({ default: module.Library })))
const Scroller = lazy(() => import('./experiences/Scroller').then(module => ({ default: module.Scroller })))
const BookVocab = lazy(() => import('./experiences/BookVocab').then(module => ({ default: module.BookVocab })))
const ThekonymReader = lazy(() => import('./experiences/ThekonymReader').then(module => ({ default: module.ThekonymReader })))

function readCachedTerms(): Term[] {
  try { return JSON.parse(localStorage.getItem(TERMS_CACHE_KEY) || '[]') as Term[] } catch { return [] }
}

function readOutbox(): PendingChange[] {
  try { return JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]') as PendingChange[] } catch { return [] }
}

function writeOutbox(changes: PendingChange[]) {
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(changes))
}

function applyPendingChanges(source: Term[], changes = readOutbox()) {
  const byId = new Map(source.map(term => [term.id, { ...term }]))
  for (const change of changes) {
    const term = byId.get(change.termId)
    if (!term) continue
    if (change.kind === 'status') term.status = change.value
    if (change.kind === 'definition') term.definition_status = change.value
    if (change.kind === 'note') term.review_note = change.value.trim() || null
  }
  return [...byId.values()]
}

function App() {
  const [view, setView] = useState<View>(() => window.location.pathname === '/thekonym-viewer' ? 'thekonym-viewer' : 'hub')
  const [pin, setPin] = useState('')
  const [pinInput, setPinInput] = useState('')
  const [terms, setTerms] = useState<Term[]>([])
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(Boolean(pin))
  const [message, setMessage] = useState('')
  const [syncState, setSyncState] = useState<SyncState>(() => navigator.onLine ? 'synced' : 'offline')
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [note, setNote] = useState('')
  const [recording, setRecording] = useState(false)
  const [transcribingTermIds, setTranscribingTermIds] = useState<string[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem(THEME_KEY) as Theme) || 'terminal-cream')
  const [fontPrefs, setFontPrefs] = useState<FontPrefs>(() => {
    try { return { ...DEFAULT_FONTS, ...JSON.parse(localStorage.getItem(FONT_KEY) || '{}') } } catch { return DEFAULT_FONTS }
  })
  const [navigationAnchorId, setNavigationAnchorId] = useState<string | null>(null)

  const noteTimerRef = useRef<number | null>(null)
  const recordingSessionRef = useRef<RecordingSession | null>(null)
  const recordingTermIdRef = useRef<string | null>(null)
  const recordingBaseNoteRef = useRef('')
  const currentTermIdRef = useRef<string | null>(null)
  const flushingRef = useRef(false)

  useEffect(() => {
    if (window.location.pathname !== '/thekonym-viewer') window.history.replaceState({}, '', '/')
    const syncView = () => setView(window.location.pathname === '/thekonym-viewer' ? 'thekonym-viewer' : window.location.pathname === '/thekonym' ? 'thekonym' : window.location.pathname === '/world-3d' ? 'world3d' : window.location.pathname === '/roy' ? 'roy' : window.location.pathname === '/ekpronym' ? 'ekpronym' : window.location.pathname === '/library' ? 'library' : window.location.pathname === '/scroller' ? 'scroller' : window.location.pathname === '/book-vocab' ? 'bookvocab' : 'hub')
    window.addEventListener('popstate', syncView)
    return () => window.removeEventListener('popstate', syncView)
  }, [])

  function navigate(next: View) {
    const path = next === 'thekonym-viewer' ? '/thekonym-viewer' : next === 'thekonym' ? '/thekonym' : next === 'world3d' ? '/world-3d' : next === 'roy' ? '/roy' : next === 'ekpronym' ? '/ekpronym' : next === 'library' ? '/library' : next === 'scroller' ? '/scroller' : next === 'bookvocab' ? '/book-vocab' : '/'
    window.history.pushState({}, '', path)
    setView(next)
    window.scrollTo(0, 0)
  }

  function saveFontPrefs(next: FontPrefs) {
    setFontPrefs(next)
    localStorage.setItem(FONT_KEY, JSON.stringify(next))
  }

  useEffect(() => {
    if (terms.length) localStorage.setItem(TERMS_CACHE_KEY, JSON.stringify(terms))
  }, [terms])

  function enqueueChange(change: Omit<PendingChange, 'key' | 'changedAt'>) {
    const item = { ...change, key: `${change.kind}:${change.termId}`, changedAt: Date.now() } as PendingChange
    const next = readOutbox().filter(existing => existing.key !== item.key)
    next.push(item)
    writeOutbox(next)
    setSyncState(navigator.onLine ? 'syncing' : 'offline')
    void flushOutbox()
  }

  async function flushOutbox(reviewPin = pin) {
    if (!reviewPin || flushingRef.current) return
    if (!navigator.onLine) { setSyncState('offline'); return }
    flushingRef.current = true
    setSyncState('syncing')
    try {
      while (true) {
        const change = readOutbox()[0]
        if (!change) break
        const response = change.kind === 'status'
          ? await supabase.rpc('thekonym_review_set_status', { pin: reviewPin, term_id: change.termId, new_status: change.value })
          : change.kind === 'definition'
            ? await supabase.rpc('thekonym_review_set_definition_status', { pin: reviewPin, term_id: change.termId, new_status: change.value })
            : await supabase.rpc('thekonym_review_set_note', { pin: reviewPin, term_id: change.termId, new_note: change.value })
        if (response.error) throw response.error
        const latest = readOutbox()
        writeOutbox(latest.filter(item => item.key !== change.key || item.changedAt !== change.changedAt))
      }
      setSyncState('synced')
    } catch (error) {
      setSyncState('offline')
      if (navigator.onLine) setMessage(error instanceof Error ? error.message : 'Changes are waiting to sync.')
    } finally {
      flushingRef.current = false
    }
  }

  async function load(reviewPin = pin, silent = false) {
    if (!reviewPin) return
    if (!silent) setLoading(true)
    const { data, error } = await supabase.rpc('thekonym_review_list', { pin: reviewPin })
    if (error) {
      const cached = readCachedTerms()
      if (cached.length) {
        setTerms(applyPendingChanges(cached))
        setSyncState('offline')
        setMessage('Offline — changes will sync automatically.')
      } else {
        setPin('')
        setMessage('Could not open while offline.')
      }
    } else if (!data?.length) {
      setPin('')
      setMessage('Wrong PIN.')
    } else {
      const loaded = applyPendingChanges(data as Term[])
      setTerms(loaded)
      setSyncState(readOutbox().length ? 'syncing' : 'synced')
      setMessage('')
      void flushOutbox(reviewPin)
    }
    if (!silent) setLoading(false)
  }

  useEffect(() => { if (pin) void load(pin) }, [])

  useEffect(() => {
    if (view === 'thekonym-viewer') return
    const sync = () => { if (pin) void load(pin, true) }
    const offline = () => setSyncState('offline')
    const visible = () => { if (document.visibilityState === 'visible' && pin && navigator.onLine) void load(pin, true) }
    window.addEventListener('online', sync)
    window.addEventListener('offline', offline)
    document.addEventListener('visibilitychange', visible)
    return () => {
      window.removeEventListener('online', sync)
      window.removeEventListener('offline', offline)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [pin, view])

  async function unlock(e: React.FormEvent) {
    e.preventDefault()
    const candidate = pinInput.trim()
    if (!candidate) return
    if (candidate !== ACCESS_PIN) {
      setMessage('Wrong PIN.')
      return
    }
    setLoading(true)
    const { data, error } = await supabase.rpc('thekonym_review_list', { pin: candidate })
    if (error) {
      const cached = readCachedTerms()
      if (cached.length) {
        setPin(candidate)
        setTerms(applyPendingChanges(cached))
        setSyncState('offline')
        setPinInput('')
        setMessage('Offline — changes will sync automatically.')
      } else setMessage('Could not open while offline.')
      setLoading(false)
      return
    }
    if (!data?.length) {
      setMessage('Wrong PIN.')
      setLoading(false)
      return
    }
    setPin(candidate)
    const loaded = applyPendingChanges(data as Term[])
    setTerms(loaded)
    setSyncState(readOutbox().length ? 'syncing' : 'synced')
    setPinInput('')
    setMessage('')
    setLoading(false)
    void flushOutbox(candidate)
  }

  function filterTerms(source: Term[], anchorId: string | null) {
    const q = search.trim().toLowerCase()
    return source.filter(t => {
      const statusOk = t.id === anchorId || filter === 'all' || (filter === 'unlabeled' ? t.status === null : t.status === filter)
      return statusOk && (!q || t.term.toLowerCase().includes(q) || (t.plain_definition ?? '').toLowerCase().includes(q))
    })
  }

  const visible = useMemo(() => filterTerms(terms, navigationAnchorId), [terms, filter, search, navigationAnchorId])

  useEffect(() => { if (index >= visible.length) setIndex(Math.max(0, visible.length - 1)) }, [visible.length, index])
  const current = visible[index]
  const transcribing = Boolean(current && transcribingTermIds.includes(current.id))
  useEffect(() => { currentTermIdRef.current = current?.id ?? null }, [current?.id])
  useEffect(() => { if (!recording) setNote(current?.review_note ?? '') }, [current?.id])

  function persistNote(termId: string, text: string, toast = false) {
    if (!pin) return
    setTerms(all => all.map(t => t.id === termId ? { ...t, review_note: text.trim() || null } : t))
    enqueueChange({ kind: 'note', termId, value: text })
    if (toast) setMessage(navigator.onLine ? 'Syncing…' : 'Saved on phone')
  }

  function editNote(value: string) {
    if (!current) return
    setNote(value)
    setTerms(all => all.map(t => t.id === current.id ? { ...t, review_note: value || null } : t))
    if (noteTimerRef.current) clearTimeout(noteTimerRef.current)
    noteTimerRef.current = window.setTimeout(() => void persistNote(current.id, value), 500)
  }

  async function startRecording() {
    if (!current || recording || transcribing) return
    if (noteTimerRef.current) clearTimeout(noteTimerRef.current)
    noteTimerRef.current = null
    try {
      recordingSessionRef.current = await startRecordingSession()
      recordingTermIdRef.current = current.id
      recordingBaseNoteRef.current = note.trim()
      setMessage('Recording — tap the mic again when you are done.')
      setRecording(true)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not start the microphone.')
    }
  }

  async function stopRecording() {
    const session = recordingSessionRef.current
    const termId = recordingTermIdRef.current
    if (!session || !termId) return
    const baseNote = recordingBaseNoteRef.current
    recordingSessionRef.current = null
    recordingTermIdRef.current = null
    recordingBaseNoteRef.current = ''
    setRecording(false)
    setTranscribingTermIds(ids => ids.includes(termId) ? ids : [...ids, termId])
    setMessage('The text will appear here when the transcription is ready.')
    session.stop()
    try {
      const blob = await session.blobPromise
      const form = new FormData()
      const extension = blob.type.includes('mp4') ? 'm4a' : 'webm'
      form.append('audio', blob, `thekonym-note.${extension}`)
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'x-review-pin': pin },
        body: form,
      })
      const result = await response.json() as { text?: string; error?: string }
      if (!response.ok) throw new Error(result.error || 'Transcription failed.')
      const transcript = (result.text || '').replace(/\s+/g, ' ').trim()
      if (!transcript) throw new Error('I did not hear any words in that recording.')
      const text = [baseNote, transcript].filter(Boolean).join(' ')
      if (currentTermIdRef.current === termId) setNote(text)
      persistNote(termId, text, true)
      setMessage(`Transcript added to ${terms.find(term => term.id === termId)?.term || 'the term'}.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Transcription failed. Your existing note was not changed.')
    } finally {
      setTranscribingTermIds(ids => ids.filter(id => id !== termId))
    }
  }

  function toggleRecording(event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault()
    if (recording) void stopRecording()
    else void startRecording()
  }

  function queueStatusSave(termId: string, status: Status) {
    enqueueChange({ kind: 'status', termId, value: status })
  }

  function queueDefinitionSave(termId: string, status: DefinitionStatus) {
    enqueueChange({ kind: 'definition', termId, value: status })
  }

  function choose(status: Status) {
    if (!current || !pin) return
    const id = current.id
    const nextTerms = terms.map(t => t.id === id ? { ...t, status } : t)
    const nextVisible = filterTerms(nextTerms, id)
    const nextIndex = nextVisible.findIndex(t => t.id === id)
    setNavigationAnchorId(id)
    if (nextIndex >= 0) setIndex(nextIndex)
    setTerms(nextTerms)
    setMessage(navigator.onLine ? 'Syncing…' : 'Saved on phone')
    queueStatusSave(id, status)
  }

  function toggleDefinition() {
    if (!current || !pin) return
    const id = current.id
    const next: DefinitionStatus = current.definition_status === 'good' ? 'needs_work' : 'good'
    setTerms(all => all.map(t => t.id === id ? { ...t, definition_status: next } : t))
    queueDefinitionSave(id, next)
  }

  function go(delta: number) {
    if (recording) return
    if (current && noteTimerRef.current) {
      clearTimeout(noteTimerRef.current)
      noteTimerRef.current = null
      void persistNote(current.id, note)
    }
    if (delta > 0 && current) {
      const nextVisible = filterTerms(terms, current.id)
      const currentIndex = nextVisible.findIndex(t => t.id === current.id)
      setNavigationAnchorId(current.id)
      if (currentIndex >= 0) setIndex(Math.min(nextVisible.length - 1, currentIndex + 1))
      return
    }
    setIndex(i => Math.max(0, Math.min(visible.length - 1, i + delta)))
  }

  function chooseTheme(next: Theme) {
    setTheme(next)
    localStorage.setItem(THEME_KEY, next)
  }

  function jumpToFirstUnlabeled() {
    if (recording) return
    const firstIndex = terms.findIndex(term => term.status === null)
    if (firstIndex < 0) {
      setMessage('Everything has a label.')
      return
    }
    if (current && noteTimerRef.current) {
      clearTimeout(noteTimerRef.current)
      noteTimerRef.current = null
      void persistNote(current.id, note)
    }
    setSearch('')
    setFilter('all')
    setNavigationAnchorId(null)
    setIndex(firstIndex)
    setMessage('First unlabeled term')
  }

  const styleVars = {
    '--definition-size': `${fontPrefs.definition}px`,
    '--thoughts-size': `${fontPrefs.thoughts}px`,
    '--rail-size': `${fontPrefs.rail}px`,
    '--judgment-size': `${fontPrefs.judgment}px`,
  } as React.CSSProperties

  if (view === 'thekonym-viewer') return <Suspense fallback={<main className="shell"><div className="center">Opening Thekonym viewer…</div></main>}><ThekonymReader onExit={() => navigate('hub')} /></Suspense>

  if (!pin) return (
    <main className="shell pin-shell" data-theme={theme} style={styleVars}>
      <section className="pin-card">
        <div className="eyebrow">Ashley’s private workspace</div><h1>The Lab</h1>
        <button className="tv-lab-entry" onClick={() => navigate('thekonym-viewer')}>Thekonym viewer<small>Read the collection · search · copy for ChatGPT</small></button>
        <form onSubmit={unlock} className="pin-form">
          <input autoFocus inputMode="numeric" maxLength={4} value={pinInput} onChange={e => setPinInput(e.target.value.replace(/\D/g, ''))} placeholder="PIN" />
          <button disabled={loading || pinInput.length !== 4}>{loading ? 'Opening…' : 'Open'}</button>
        </form>
        {message && <div className="notice">{message}</div>}
      </section>
    </main>
  )

  if (loading) return <main className="shell" data-theme={theme} style={styleVars}><div className="center">Loading…</div></main>

  if (view === 'hub') return (
    <main className="shell hub-shell" data-theme={theme} style={styleVars}>
      <header className="hub-top">
        <div><div className="eyebrow">Ashley’s private workspace</div><h1>The Lab</h1></div>
      </header>
      <section className="hub-intro">
        <strong>Your experiments</strong>
        <span>Choose an experience, then tap Go.</span>
      </section>
      <section className="experience-grid">
        <article className="experience-card">
          <span className="experience-icon">Th</span>
          <span className="experience-copy"><strong>Thekonym viewer</strong><small>Read current definitions, confidence, fields, and notes. Copy a fresh record for ChatGPT.</small></span>
          <button className="experience-go" onClick={() => navigate('thekonym-viewer')}>Go</button>
        </article>
        <article className="experience-card">
          <span className="experience-icon">T</span>
          <span className="experience-copy"><strong>Thekonym</strong><small>Review and organize Procedia terminology.</small></span>
          <button className="experience-go" onClick={() => navigate('thekonym')}>Go</button>
        </article>
        <article className="experience-card">
          <span className="experience-icon">Ek</span>
          <span className="experience-copy"><strong>Ekpronym</strong><small>Pick the most common term for each pleuronym.</small></span>
          <button className="experience-go" onClick={() => navigate('ekpronym')}>Go</button>
        </article>
        <article className="experience-card">
          <span className="experience-icon">3D</span>
          <span className="experience-copy"><strong>3D Environment</strong><small>A simple landscape-mode space to move around and explore.</small></span>
          <button className="experience-go" onClick={() => navigate('world3d')}>Go</button>
        </article>
        <article className="experience-card">
          <span className="experience-icon">R</span>
          <span className="experience-copy"><strong>Roy</strong><small>A hold-to-talk Korean vocabulary test.</small></span>
          <button className="experience-go" onClick={() => navigate('roy')}>Go</button>
        </article>
        <article className="experience-card">
          <span className="experience-icon">L</span>
          <span className="experience-copy"><strong>Library</strong><small>Browse and read the 163-tab Procedia Documentation set.</small></span>
          <button className="experience-go" onClick={() => navigate('library')}>Go</button>
        </article>
        <article className="experience-card">
          <span className="experience-icon">S</span>
          <span className="experience-copy"><strong>Scroller</strong><small>Paste text, hear it read aloud, and loop it in a seamless continuous scroll.</small></span>
          <button className="experience-go" onClick={() => navigate('scroller')}>Go</button>
        </article>
        <article className="experience-card">
          <span className="experience-icon">Aa</span>
          <span className="experience-copy"><strong>Book Vocab</strong><small>Photograph a book page, extract the words, and translate them into Korean A–Z.</small></span>
          <button className="experience-go" onClick={() => navigate('bookvocab')}>Go</button>
        </article>
      </section>
      <div className="hub-footer">One app · many experiments</div>
    </main>
  )

  if (view === 'world3d') return <Suspense fallback={<main className="shell"><div className="center">Opening 3D world…</div></main>}><World3D onExit={() => navigate('hub')} /></Suspense>
  if (view === 'roy') return <Suspense fallback={<main className="shell"><div className="center">Opening Roy…</div></main>}><RoyVocab onExit={() => navigate('hub')} pin={pin} /></Suspense>
  if (view === 'ekpronym') return <Suspense fallback={<main className="shell"><div className="center">Opening Ekpronym…</div></main>}><EkpronymReview onExit={() => navigate('hub')} pin={pin} /></Suspense>
  if (view === 'library') return <Suspense fallback={<main className="shell"><div className="center">Opening Library…</div></main>}><Library onExit={() => navigate('hub')} /></Suspense>
  if (view === 'scroller') return <Suspense fallback={<main className="shell"><div className="center">Opening Scroller…</div></main>}><Scroller onExit={() => navigate('hub')} /></Suspense>
  if (view === 'bookvocab') return <Suspense fallback={<main className="shell"><div className="center">Opening Book Vocab…</div></main>}><BookVocab onExit={() => navigate('hub')} pin={pin} /></Suspense>

  return (
    <main className={`shell app-shell${recording ? ' is-recording' : ''}`} data-theme={theme} style={styleVars}>
      <header className="top">
        <div><div className="eyebrow">Procedia · Thekonym</div><h1>{current?.term ?? 'Thekonym'}</h1></div>
        <div className="top-actions"><button className="hub-button" onClick={() => navigate('hub')}>Hub</button><div className={`sync-indicator sync-${syncState}`} role="status" aria-label={syncState === 'synced' ? 'All changes synced' : syncState === 'syncing' ? 'Syncing changes' : 'Offline changes waiting'} title={syncState === 'synced' ? 'Synced' : syncState === 'syncing' ? 'Syncing' : 'Offline'} /><button className="settings-button" onClick={() => setSettingsOpen(true)} aria-label="Appearance settings">⚙</button><div className="counter">{visible.length ? index + 1 : 0}<span>/</span>{visible.length}</div></div>
      </header>

      <div className="definition-row"><div className="definition hero-definition">{current?.plain_definition || 'No plain-language definition yet.'}</div></div>

      <div className="tools">
        <input value={search} onChange={e => { setSearch(e.target.value); setIndex(0) }} placeholder="Find a term…" />
        <select value={filter} onChange={e => { setFilter(e.target.value as Filter); setNavigationAnchorId(null); setIndex(0) }}>
          <option value="all">All</option><option value="unlabeled">No label yet</option>{statuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <button className="jump-unlabeled" onClick={jumpToFirstUnlabeled} disabled={recording} aria-label="Jump to first unlabeled term" title="First unlabeled term">→?</button>
      </div>

      {message && <div className="toast">{message}</div>}

      {current ? <section className="workspace">
        <div className="work-row">
          <div className="action-rail">
            <button className={`rail-button mic-button${recording ? ' recording' : ''}`} onPointerDown={toggleRecording} disabled={transcribing} aria-label={recording ? 'Stop recording' : transcribing ? 'Transcribing' : 'Start recording'}>
              <span className="mic-glyph" aria-hidden="true">{recording ? '■' : '🎙'}</span>
            </button>
            <button className={`rail-button definition-toggle ${current.definition_status}`} onPointerDown={event => { event.preventDefault(); toggleDefinition() }}>
              <span>{current.definition_status === 'good' ? '✓' : '✎'}</span><strong>{current.definition_status === 'good' ? 'Definition good' : 'Needs work'}</strong>
            </button>
            <button className="rail-button next-rail" onPointerDown={event => { event.preventDefault(); go(1) }} disabled={index >= visible.length - 1 || recording}><span>→</span><strong>Next</strong></button>
            <button className="rail-button back-rail" onPointerDown={event => { event.preventDefault(); go(-1) }} disabled={index === 0 || recording}><span>←</span><strong>Back</strong></button>
          </div>
          <div className={`note-panel${transcribing ? ' is-transcribing' : ''}`}>
            <div className="note-title">Your thoughts</div>
            <div className="note-editor">
              <textarea value={note} onChange={e => editNote(e.target.value)} placeholder="Tap the mic or type…" readOnly={transcribing} />
              {transcribing && <div className="transcription-status" role="status" aria-live="polite"><strong>The text will appear here when the transcription is ready.</strong></div>}
            </div>
          </div>
        </div>
        <div className="question">Your judgment</div>
        <div className="status-grid">{statuses.map(s => <button key={s.value} className={`status-button ${current.status === s.value ? 'selected' : ''}`} onPointerDown={event => { event.preventDefault(); choose(s.value) }}><strong>{s.label}</strong><span>{s.hint}</span></button>)}</div>
      </section> : <section className="empty">No matches.</section>}

      {settingsOpen && <div className="settings-overlay" onClick={() => setSettingsOpen(false)}>
        <section className="settings-panel" onClick={e => e.stopPropagation()}>
          <div className="settings-head"><strong>Appearance</strong><button onClick={() => setSettingsOpen(false)}>×</button></div>
          <div className="theme-grid">{themes.map(t => <button key={t.value} className={`theme-choice theme-${t.value}${theme === t.value ? ' active' : ''}`} onPointerDown={event => { event.preventDefault(); chooseTheme(t.value) }}><span className="theme-swatch"/><strong>{t.label}</strong></button>)}</div>
          <div className="font-settings">
            <div className="font-setting"><label>Definition text <span className="sample-definition">A sibling concept</span></label><input type="range" min="12" max="26" value={fontPrefs.definition} onChange={e => saveFontPrefs({ ...fontPrefs, definition: +e.target.value })}/></div>
            <div className="font-setting"><label>Your thoughts <span className="sample-thoughts">My note looks like this</span></label><input type="range" min="12" max="28" value={fontPrefs.thoughts} onChange={e => saveFontPrefs({ ...fontPrefs, thoughts: +e.target.value })}/></div>
            <div className="font-setting"><label>Action buttons <span className="sample-rail">Mic · Next</span></label><input type="range" min="11" max="24" value={fontPrefs.rail} onChange={e => saveFontPrefs({ ...fontPrefs, rail: +e.target.value })}/></div>
            <div className="font-setting"><label>Judgment buttons <span className="sample-judgment">Canonical</span></label><input type="range" min="11" max="24" value={fontPrefs.judgment} onChange={e => saveFontPrefs({ ...fontPrefs, judgment: +e.target.value })}/></div>
          </div>
        </section>
      </div>}
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
