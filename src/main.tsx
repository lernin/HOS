import { StrictMode, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { supabase } from './lib/supabase'
import './thekonym.css'
import './thekonym-font-controls.css'

type Status = 'canonical' | 'provisional' | 'contested' | 'unclear' | 'retired' | 'superseded'
type DefinitionStatus = 'good' | 'needs_work'
type Filter = 'all' | 'unlabeled' | Status
type Theme = 'terminal-cream' | 'terminal-green' | 'ocean-blue' | 'cyberpunk' | 'holographic' | 'neural'
type View = 'hub' | 'thekonym'
type FontPrefs = { definition: number; thoughts: number; rail: number; judgment: number }
type Term = {
  id: string
  term: string
  plain_definition: string | null
  status: Status
  former_names: string[]
  superseded_by: string | null
  technical_definition: string | null
  notes: string | null
  review_note: string | null
  definition_status: DefinitionStatus
}

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
  { value: 'cyberpunk', label: 'Cyberpunk Neon' },
  { value: 'holographic', label: 'Holographic Glass' },
  { value: 'neural', label: 'Neural Wild' },
]

const PIN_KEY = 'thekonym-review-pin'
const REVIEWED_KEY = 'thekonym-reviewed-status-ids'
const THEME_KEY = 'thekonym-theme'
const FONT_KEY = 'thekonym-font-prefs'
const DEFAULT_FONTS: FontPrefs = { definition: 16, thoughts: 17, rail: 15, judgment: 15 }

function App() {
  const [view, setView] = useState<View>(() => window.location.pathname === '/thekonym' ? 'thekonym' : 'hub')
  const [pin, setPin] = useState(() => sessionStorage.getItem(PIN_KEY) ?? '')
  const [pinInput, setPinInput] = useState('')
  const [terms, setTerms] = useState<Term[]>([])
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(Boolean(pin))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [note, setNote] = useState('')
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem(THEME_KEY) as Theme) || 'terminal-cream')
  const [fontPrefs, setFontPrefs] = useState<FontPrefs>(() => {
    try { return { ...DEFAULT_FONTS, ...JSON.parse(localStorage.getItem(FONT_KEY) || '{}') } } catch { return DEFAULT_FONTS }
  })
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(REVIEWED_KEY) || '[]')) } catch { return new Set() }
  })

  const recognitionRef = useRef<any>(null)
  const chunksRef = useRef<string[]>([])
  const noteTimerRef = useRef<number | null>(null)
  const isFingerDownRef = useRef(false)
  const endingRef = useRef(false)
  const recordingTermIdRef = useRef<string | null>(null)
  const pointerStartRef = useRef({ x: 0, y: 0 })
  const releaseTimerRef = useRef<number | null>(null)
  const defHoldTimerRef = useRef<number | null>(null)
  const defHoldActivatedRef = useRef(false)

  useEffect(() => {
    const syncView = () => setView(window.location.pathname === '/thekonym' ? 'thekonym' : 'hub')
    window.addEventListener('popstate', syncView)
    return () => window.removeEventListener('popstate', syncView)
  }, [])

  function navigate(next: View) {
    const path = next === 'thekonym' ? '/thekonym' : '/'
    window.history.pushState({}, '', path)
    setView(next)
    window.scrollTo(0, 0)
  }

  function markReviewed(id: string) {
    setReviewedIds(prev => {
      const next = new Set(prev)
      next.add(id)
      localStorage.setItem(REVIEWED_KEY, JSON.stringify([...next]))
      return next
    })
  }

  function saveFontPrefs(next: FontPrefs) {
    setFontPrefs(next)
    localStorage.setItem(FONT_KEY, JSON.stringify(next))
  }

  async function load(reviewPin = pin) {
    if (!reviewPin) return
    setLoading(true)
    const { data, error } = await supabase.rpc('thekonym_review_list', { pin: reviewPin })
    if (error || !data?.length) {
      sessionStorage.removeItem(PIN_KEY)
      setPin('')
      setMessage('Wrong PIN.')
    } else {
      const loaded = data as Term[]
      setTerms(loaded)
      setReviewedIds(prev => {
        const next = new Set(prev)
        loaded.filter(t => t.review_note).forEach(t => next.add(t.id))
        localStorage.setItem(REVIEWED_KEY, JSON.stringify([...next]))
        return next
      })
      setMessage('')
    }
    setLoading(false)
  }

  useEffect(() => { if (pin) void load(pin) }, [])

  async function unlock(e: React.FormEvent) {
    e.preventDefault()
    const candidate = pinInput.trim()
    if (!candidate) return
    setLoading(true)
    const { data, error } = await supabase.rpc('thekonym_review_list', { pin: candidate })
    if (error || !data?.length) {
      setMessage('Wrong PIN.')
      setLoading(false)
      return
    }
    sessionStorage.setItem(PIN_KEY, candidate)
    setPin(candidate)
    const loaded = data as Term[]
    setTerms(loaded)
    setReviewedIds(prev => {
      const next = new Set(prev)
      loaded.filter(t => t.review_note).forEach(t => next.add(t.id))
      localStorage.setItem(REVIEWED_KEY, JSON.stringify([...next]))
      return next
    })
    setPinInput('')
    setMessage('')
    setLoading(false)
  }

  const visible = useMemo(() => terms.filter(t => {
    const statusOk = filter === 'all' || (filter === 'unlabeled' ? !reviewedIds.has(t.id) : t.status === filter)
    const q = search.trim().toLowerCase()
    return statusOk && (!q || t.term.toLowerCase().includes(q) || (t.plain_definition ?? '').toLowerCase().includes(q))
  }), [terms, filter, search, reviewedIds])

  useEffect(() => { if (index >= visible.length) setIndex(Math.max(0, visible.length - 1)) }, [visible.length, index])
  const current = visible[index]
  useEffect(() => { if (!recording) setNote(current?.review_note ?? '') }, [current?.id])

  async function persistNote(termId: string, text: string, toast = false) {
    if (!pin) return
    setSaving(true)
    const { error } = await supabase.rpc('thekonym_review_set_note', { pin, term_id: termId, new_note: text })
    if (error) setMessage(error.message)
    else {
      setTerms(all => all.map(t => t.id === termId ? { ...t, review_note: text.trim() || null } : t))
      if (toast) setMessage('Saved')
    }
    setSaving(false)
  }

  function editNote(value: string) {
    if (!current) return
    setNote(value)
    setTerms(all => all.map(t => t.id === current.id ? { ...t, review_note: value || null } : t))
    if (noteTimerRef.current) clearTimeout(noteTimerRef.current)
    noteTimerRef.current = window.setTimeout(() => void persistNote(current.id, value), 500)
  }

  function addChunk(value: string) {
    const clean = value.replace(/\s+/g, ' ').trim()
    if (!clean) return
    if (chunksRef.current.at(-1)?.toLowerCase() === clean.toLowerCase()) return
    chunksRef.current.push(clean)
    setNote(chunksRef.current.join(' '))
  }

  function listen(termId: string) {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition || !isFingerDownRef.current || endingRef.current) return
    const recognition = new SpeechRecognition()
    recognition.lang = 'en-US'
    recognition.continuous = false
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onresult = (event: any) => addChunk((event.results?.[event.resultIndex] ?? event.results?.[event.results.length - 1])?.[0]?.transcript ?? '')
    recognition.onerror = (event: any) => { if (!['aborted', 'no-speech'].includes(event.error)) setMessage('Mic: ' + event.error) }
    recognition.onend = () => {
      recognitionRef.current = null
      if (isFingerDownRef.current && !endingRef.current) setTimeout(() => listen(termId), 70)
      else if (endingRef.current) void finishRecording(termId)
    }
    recognitionRef.current = recognition
    try { recognition.start() } catch { setTimeout(() => listen(termId), 130) }
  }

  async function finishRecording(termId: string) {
    if (!endingRef.current) return
    endingRef.current = false
    isFingerDownRef.current = false
    setRecording(false)
    setTranscribing(true)
    setOffset({ x: 0, y: 0 })
    const text = chunksRef.current.join(' ').replace(/\s+/g, ' ').trim()
    setNote(text)
    setTerms(all => all.map(t => t.id === termId ? { ...t, review_note: text || null } : t))
    await persistNote(termId, text, true)
    setTranscribing(false)
    recordingTermIdRef.current = null
    setIndex(i => Math.min(visible.length - 1, i + 1))
  }

  function beginRecording(event: React.PointerEvent<HTMLButtonElement>) {
    if (!current || recording || transcribing) return
    event.preventDefault()
    if (releaseTimerRef.current) clearTimeout(releaseTimerRef.current)
    if (noteTimerRef.current) clearTimeout(noteTimerRef.current)
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) { setMessage('Voice transcription needs Chrome on your phone.'); return }
    isFingerDownRef.current = true
    endingRef.current = false
    recordingTermIdRef.current = current.id
    pointerStartRef.current = { x: event.clientX, y: event.clientY }
    chunksRef.current = []
    setNote('')
    setTerms(all => all.map(t => t.id === current.id ? { ...t, review_note: null } : t))
    setMessage('')
    setRecording(true)
    listen(current.id)
  }

  async function setDefinitionNeedsWork(id: string) {
    setTerms(all => all.map(t => t.id === id ? { ...t, definition_status: 'needs_work' } : t))
    const { error } = await supabase.rpc('thekonym_review_set_definition_status', { pin, term_id: id, new_status: 'needs_work' })
    if (error) setMessage(error.message)
  }

  function definitionPointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (!current || recording || transcribing) return
    event.preventDefault()
    defHoldActivatedRef.current = false
    const id = current.id
    const clonedEvent = event
    defHoldTimerRef.current = window.setTimeout(() => {
      defHoldActivatedRef.current = true
      void setDefinitionNeedsWork(id)
      beginRecording(clonedEvent)
    }, 360)
  }

  function definitionPointerUp() {
    if (defHoldTimerRef.current) {
      clearTimeout(defHoldTimerRef.current)
      defHoldTimerRef.current = null
    }
    if (!defHoldActivatedRef.current) void toggleDefinition()
  }

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!isFingerDownRef.current) return
      setOffset({
        x: Math.max(-70, Math.min(70, event.clientX - pointerStartRef.current.x)),
        y: Math.max(-34, Math.min(34, event.clientY - pointerStartRef.current.y)),
      })
    }
    const release = () => {
      if (!isFingerDownRef.current || endingRef.current) return
      if (releaseTimerRef.current) clearTimeout(releaseTimerRef.current)
      releaseTimerRef.current = window.setTimeout(() => {
        endingRef.current = true
        isFingerDownRef.current = false
        setOffset({ x: 0, y: 0 })
        try { recognitionRef.current?.stop() } catch {}
        if (!recognitionRef.current && recordingTermIdRef.current) void finishRecording(recordingTermIdRef.current)
      }, 450)
    }
    window.addEventListener('pointermove', move, { passive: true })
    window.addEventListener('pointerup', release, { passive: true })
    window.addEventListener('pointercancel', release, { passive: true })
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', release)
      window.removeEventListener('pointercancel', release)
    }
  }, [visible.length])

  async function choose(status: Status) {
    if (!current || saving || recording || transcribing || !pin) return
    const id = current.id
    setTerms(all => all.map(t => t.id === id ? { ...t, status } : t))
    markReviewed(id)
    setMessage('Saved')
    setSaving(true)
    const { error } = await supabase.rpc('thekonym_review_set_status', { pin, term_id: id, new_status: status })
    if (error) setMessage(error.message)
    setSaving(false)
  }

  async function toggleDefinition() {
    if (!current || saving || recording || transcribing || !pin) return
    const id = current.id
    const next: DefinitionStatus = current.definition_status === 'good' ? 'needs_work' : 'good'
    setTerms(all => all.map(t => t.id === id ? { ...t, definition_status: next } : t))
    setSaving(true)
    const { error } = await supabase.rpc('thekonym_review_set_definition_status', { pin, term_id: id, new_status: next })
    if (error) setMessage(error.message)
    setSaving(false)
  }

  function go(delta: number) {
    if (recording) return
    if (current && noteTimerRef.current) {
      clearTimeout(noteTimerRef.current)
      noteTimerRef.current = null
      void persistNote(current.id, note)
    }
    setIndex(i => Math.max(0, Math.min(visible.length - 1, i + delta)))
  }

  function chooseTheme(next: Theme) {
    setTheme(next)
    localStorage.setItem(THEME_KEY, next)
  }

  const styleVars = {
    '--definition-size': `${fontPrefs.definition}px`,
    '--thoughts-size': `${fontPrefs.thoughts}px`,
    '--rail-size': `${fontPrefs.rail}px`,
    '--judgment-size': `${fontPrefs.judgment}px`,
  } as React.CSSProperties

  if (!pin) return (
    <main className="shell pin-shell" data-theme={theme} style={styleVars}>
      <section className="pin-card">
        <div className="eyebrow">Ashley’s private workspace</div><h1>Experiment Hub</h1>
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
        <div><div className="eyebrow">Ashley’s private workspace</div><h1>Experiment Hub</h1></div>
      </header>
      <section className="hub-intro">
        <strong>Your experiences</strong>
        <span>Open an existing tool or add another experiment here later.</span>
      </section>
      <section className="experience-grid">
        <button className="experience-card" onClick={() => navigate('thekonym')}>
          <span className="experience-icon">T</span>
          <span className="experience-copy">
            <strong>Thekonym</strong>
            <small>Review and organize Procedia terminology.</small>
          </span>
          <span className="experience-arrow">→</span>
        </button>
      </section>
      <div className="hub-footer">One app · many experiments</div>
    </main>
  )

  return (
    <main className={`shell app-shell${recording ? ' is-recording' : ''}`} data-theme={theme} style={styleVars}>
      <header className="top">
        <div><div className="eyebrow">Procedia · Thekonym</div><h1>{current?.term ?? 'Thekonym'}</h1></div>
        <div className="top-actions"><button className="hub-button" onClick={() => navigate('hub')}>Hub</button><button className="settings-button" onClick={() => setSettingsOpen(true)} aria-label="Appearance settings">⚙</button><div className="counter">{visible.length ? index + 1 : 0}<span>/</span>{visible.length}</div></div>
      </header>

      <div className="definition-row"><div className="definition hero-definition">{current?.plain_definition || 'No plain-language definition yet.'}</div></div>

      <div className="tools">
        <input value={search} onChange={e => { setSearch(e.target.value); setIndex(0) }} placeholder="Find a term…" />
        <select value={filter} onChange={e => { setFilter(e.target.value as Filter); setIndex(0) }}>
          <option value="all">All</option><option value="unlabeled">No label yet</option>{statuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      {message && <div className="toast">{message}</div>}

      {current ? <section className="workspace">
        <div className="work-row">
          <div className="action-rail">
            <button className={`rail-button mic-button${recording ? ' recording' : ''}`} style={{ transform: `translate(${offset.x}px,${offset.y}px)` }} onPointerDown={beginRecording} disabled={transcribing}>
              <span>🎙</span><strong>{recording ? 'Recording' : 'Hold to talk'}</strong>
            </button>
            <button className={`rail-button definition-toggle ${current.definition_status}`} onPointerDown={definitionPointerDown} onPointerUp={definitionPointerUp} onPointerCancel={definitionPointerUp}>
              <span>{current.definition_status === 'good' ? '✓' : '✎'}</span><strong>{current.definition_status === 'good' ? 'Definition good' : 'Needs work'}</strong>
            </button>
            <button className="rail-button next-rail" onClick={() => go(1)} disabled={index >= visible.length - 1 || recording}><span>→</span><strong>Next</strong></button>
            <button className="rail-button back-rail" onClick={() => go(-1)} disabled={index === 0 || recording}><span>←</span><strong>Back</strong></button>
          </div>
          <div className="note-panel"><div className="note-title">Your thoughts</div><textarea value={note} onChange={e => editNote(e.target.value)} placeholder="Hold to talk or type…" /></div>
        </div>
        <div className="question">Your judgment</div>
        <div className="status-grid">{statuses.map(s => <button key={s.value} disabled={saving || recording || transcribing} className={`status-button ${current.status === s.value ? 'selected' : ''}`} onClick={() => void choose(s.value)}><strong>{s.label}</strong><span>{s.hint}</span></button>)}</div>
      </section> : <section className="empty">No matches.</section>}

      {settingsOpen && <div className="settings-overlay" onClick={() => setSettingsOpen(false)}>
        <section className="settings-panel" onClick={e => e.stopPropagation()}>
          <div className="settings-head"><strong>Appearance</strong><button onClick={() => setSettingsOpen(false)}>×</button></div>
          <div className="theme-grid">{themes.map(t => <button key={t.value} className={`theme-choice theme-${t.value}${theme === t.value ? ' active' : ''}`} onClick={() => chooseTheme(t.value)}><span className="theme-swatch"/><strong>{t.label}</strong></button>)}</div>
          <div className="font-settings">
            <div className="font-setting"><label>Definition text <span className="sample-definition">A sibling concept</span></label><input type="range" min="12" max="26" value={fontPrefs.definition} onChange={e => saveFontPrefs({ ...fontPrefs, definition: +e.target.value })}/></div>
            <div className="font-setting"><label>Your thoughts <span className="sample-thoughts">My note looks like this</span></label><input type="range" min="12" max="28" value={fontPrefs.thoughts} onChange={e => saveFontPrefs({ ...fontPrefs, thoughts: +e.target.value })}/></div>
            <div className="font-setting"><label>Action buttons <span className="sample-rail">Hold to talk · Next</span></label><input type="range" min="11" max="24" value={fontPrefs.rail} onChange={e => saveFontPrefs({ ...fontPrefs, rail: +e.target.value })}/></div>
            <div className="font-setting"><label>Judgment buttons <span className="sample-judgment">Canonical</span></label><input type="range" min="11" max="24" value={fontPrefs.judgment} onChange={e => saveFontPrefs({ ...fontPrefs, judgment: +e.target.value })}/></div>
          </div>
        </section>
      </div>}
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
