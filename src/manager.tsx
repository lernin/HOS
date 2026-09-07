import { StrictMode, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { supabase } from './lib/supabase'
import './manager.css'

type ArtifactState = 'ready' | 'working' | 'blocked' | 'deployed' | 'pending' | 'unknown'

type Artifact = {
  kind: string
  label: string
  repository?: string | null
  url?: string | null
  state: ArtifactState
  detail?: string | null
}

type ManagerItem = {
  id: string
  title: string
  status: string
  implementation_status: string
  priority_score: number
  next_actor: string | null
  current_state: string | null
  marker: string | null
  artifacts: Artifact[]
}

type ManagerSnapshot = {
  generated_at: string
  items: ManagerItem[]
}

type Lane = 'all' | 'ready' | 'working' | 'blocked' | 'waiting' | 'deployed'

const VISUAL_PREVIEW = import.meta.env.VITE_MANAGER_VISUAL_PREVIEW === '1'

const PREVIEW: ManagerSnapshot = {
  generated_at: '2026-09-08T05:28:00+09:00',
  items: [
    {
      id: '01a07d77-8dde-71b7-a246-d6d8d8fbc2a8',
      title: 'HOS Table Viewer',
      status: 'in_progress',
      implementation_status: 'completed',
      priority_score: 64,
      next_actor: 'ashley',
      current_state: 'Read-only Table Viewer is implemented and waiting for release review.',
      marker: 'CHATGPT{HOS Table Viewer}<01a07d77-8dde-71b7-a246-d6d8d8fbc2a8>',
      artifacts: [
        { kind: 'pull_request', repository: 'lernin/HOS', label: 'PR #62', state: 'ready', detail: 'Build + visual preview passed' },
        { kind: 'pull_request', repository: 'lernin/Procedia', label: 'PR #122', state: 'ready', detail: 'Records production metadata RPC' },
        { kind: 'preview', label: 'GitHub visual preview', state: 'ready', detail: 'Phone screenshots available' },
      ],
    },
    {
      id: '01a079bb-8f93-70a9-acf6-c8fe30856aab',
      title: 'Semantic controlled choice cutover',
      status: 'in_progress',
      implementation_status: 'in_progress',
      priority_score: 6,
      next_actor: 'ai',
      current_state: 'Database bridge is live; application cutover remains unfinished.',
      marker: 'CHATGPT{semantic choice sets}<01a079bb-8f93-70a9-acf6-c8fe30856aab>',
      artifacts: [
        { kind: 'pull_request', repository: 'lernin/Procedia', label: 'PR #121', state: 'working', detail: 'Do not remove legacy paths yet' },
      ],
    },
    {
      id: '01a07632-b115-7ff5-9b0d-4c5c26d726ea',
      title: 'Music Discovery follow-up',
      status: 'waiting_on_ashley',
      implementation_status: 'in_progress',
      priority_score: 56,
      next_actor: 'ashley',
      current_state: 'Frontend changes are staged and waiting for Ashley review.',
      marker: 'CHATGPT{music discovery follow-up}<01a07632-b115-7ff5-9b0d-4c5c26d726ea>',
      artifacts: [
        { kind: 'pull_request', repository: 'lernin/HOS', label: 'PR #57', state: 'pending', detail: 'Waiting for review' },
      ],
    },
    {
      id: '01a07881-5c7f-7923-955c-7cd008928dcf',
      title: 'Pause Procedia staging',
      status: 'open',
      implementation_status: 'pending',
      priority_score: 81,
      next_actor: 'ai',
      current_state: 'Approved direction exists, but the operational pause remains unverified.',
      marker: 'CHATGPT{pause staging}<01a07881-5c7f-7923-955c-7cd008928dcf>',
      artifacts: [
        { kind: 'operation', label: 'Supabase staging', state: 'blocked', detail: 'Separate operational action required' },
      ],
    },
    {
      id: 'demo-deployed',
      title: 'Structured Work publication system',
      status: 'implemented',
      implementation_status: 'completed',
      priority_score: 80,
      next_actor: null,
      current_state: 'Integrated and published.',
      marker: null,
      artifacts: [
        { kind: 'pull_request', repository: 'lernin/Procedia', label: 'PR #88', state: 'deployed', detail: 'Published' },
      ],
    },
  ],
}

function laneFor(item: ManagerItem): Exclude<Lane, 'all'> {
  if (item.artifacts.some(a => a.state === 'blocked')) return 'blocked'
  if (item.artifacts.length && item.artifacts.every(a => a.state === 'deployed')) return 'deployed'
  if (item.status.includes('waiting')) return 'waiting'
  if (item.implementation_status === 'completed' && item.artifacts.length && item.artifacts.every(a => ['ready', 'deployed'].includes(a.state))) return 'ready'
  return 'working'
}

function ManagerApp() {
  const [pin, setPin] = useState('')
  const [pinInput, setPinInput] = useState('')
  const [snapshot, setSnapshot] = useState<ManagerSnapshot | null>(VISUAL_PREVIEW ? PREVIEW : null)
  const [lane, setLane] = useState<Lane>('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(VISUAL_PREVIEW ? 'Visual preview data' : '')

  async function unlock(event: React.FormEvent) {
    event.preventDefault()
    const candidate = pinInput.trim()
    if (!candidate) return
    setLoading(true)
    setMessage('')
    const { data, error } = await supabase.rpc('lab_manager_snapshot', { pin: candidate })
    if (error) {
      setMessage(
        error.code === 'PGRST202'
          ? 'Manager UI is ready. Secure live-data bridge still needs approval.'
          : error.code === '28000'
            ? 'Wrong PIN.'
            : error.message,
      )
      setLoading(false)
      return
    }
    setPin(candidate)
    setSnapshot(data as ManagerSnapshot)
    setPinInput('')
    setLoading(false)
  }

  async function refresh() {
    if (!pin) return
    setLoading(true)
    const { data, error } = await supabase.rpc('lab_manager_snapshot', { pin })
    if (error) setMessage(error.message)
    else {
      setSnapshot(data as ManagerSnapshot)
      setMessage('')
    }
    setLoading(false)
  }

  const visible = useMemo(() => {
    if (!snapshot) return []
    const q = search.trim().toLowerCase()
    return snapshot.items
      .filter(item => lane === 'all' || laneFor(item) === lane)
      .filter(item => !q || item.title.toLowerCase().includes(q) || item.current_state?.toLowerCase().includes(q) || item.marker?.toLowerCase().includes(q))
      .sort((a, b) => b.priority_score - a.priority_score)
  }, [snapshot, lane, search])

  const counts = useMemo(() => {
    const base: Record<Exclude<Lane, 'all'>, number> = { ready: 0, working: 0, blocked: 0, waiting: 0, deployed: 0 }
    snapshot?.items.forEach(item => { base[laneFor(item)] += 1 })
    return base
  }, [snapshot])

  if (!snapshot) {
    return (
      <main className="mgr-shell mgr-login">
        <section className="mgr-login-card">
          <div className="mgr-kicker">Ashley’s private workspace</div>
          <h1>Procedia Manager</h1>
          <p>One place for work, PRs, previews, conflicts, and release readiness.</p>
          <form onSubmit={unlock}>
            <input
              autoFocus
              inputMode="numeric"
              maxLength={4}
              value={pinInput}
              onChange={event => setPinInput(event.target.value.replace(/\D/g, ''))}
              placeholder="PIN"
              aria-label="Lab PIN"
            />
            <button disabled={loading || pinInput.length !== 4}>{loading ? 'Opening…' : 'Open Manager'}</button>
          </form>
          {message && <div className="mgr-notice">{message}</div>}
        </section>
      </main>
    )
  }

  return (
    <main className="mgr-shell">
      <header className="mgr-header">
        <div>
          <div className="mgr-kicker">Procedia control room</div>
          <h1>Manager</h1>
          <p>What is moving, what is blocked, and what can ship together.</p>
        </div>
        <button className="mgr-refresh" onClick={() => void refresh()} disabled={!pin || loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
      </header>

      <section className="mgr-summary">
        <button className={lane === 'ready' ? 'active' : ''} onClick={() => setLane('ready')}><strong>{counts.ready}</strong><span>Ready</span></button>
        <button className={lane === 'working' ? 'active' : ''} onClick={() => setLane('working')}><strong>{counts.working}</strong><span>Working</span></button>
        <button className={lane === 'blocked' ? 'active' : ''} onClick={() => setLane('blocked')}><strong>{counts.blocked}</strong><span>Blocked</span></button>
        <button className={lane === 'waiting' ? 'active' : ''} onClick={() => setLane('waiting')}><strong>{counts.waiting}</strong><span>Waiting</span></button>
        <button className={lane === 'deployed' ? 'active' : ''} onClick={() => setLane('deployed')}><strong>{counts.deployed}</strong><span>Deployed</span></button>
      </section>

      <section className="mgr-toolbar">
        <button className={lane === 'all' ? 'active' : ''} onClick={() => setLane('all')}>All</button>
        <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Find work or room marker…" />
      </section>

      {message && <div className="mgr-notice">{message}</div>}

      <section className="mgr-list">
        {visible.map(item => {
          const itemLane = laneFor(item)
          return (
            <article className="mgr-card" key={item.id}>
              <div className="mgr-card-top">
                <span className={`mgr-state state-${itemLane}`}>{itemLane}</span>
                <span className="mgr-score">P{item.priority_score}</span>
              </div>
              <h2>{item.title}</h2>
              <p>{item.current_state || 'No current-state summary.'}</p>
              <div className="mgr-meta">
                <span>{item.implementation_status.replaceAll('_', ' ')}</span>
                {item.next_actor && <span>Next: {item.next_actor}</span>}
              </div>
              <div className="mgr-artifacts">
                {item.artifacts.length ? item.artifacts.map((artifact, index) => (
                  <a
                    key={`${artifact.kind}-${index}`}
                    className={`mgr-artifact artifact-${artifact.state}`}
                    href={artifact.url || undefined}
                    target={artifact.url ? '_blank' : undefined}
                    rel={artifact.url ? 'noreferrer' : undefined}
                  >
                    <span><b>{artifact.label}</b>{artifact.repository && <small>{artifact.repository}</small>}</span>
                    <em>{artifact.state}</em>
                  </a>
                )) : <div className="mgr-empty-artifact">No delivery artifact linked yet.</div>}
              </div>
              {item.marker && <button className="mgr-marker" onClick={() => void navigator.clipboard?.writeText(item.marker || '')}>{item.marker}</button>}
            </article>
          )
        })}
        {!visible.length && <div className="mgr-empty">Nothing in this lane.</div>}
      </section>

      <footer className="mgr-footer">
        Snapshot {new Date(snapshot.generated_at).toLocaleString()}
      </footer>
    </main>
  )
}

createRoot(document.getElementById('manager-root')!).render(
  <StrictMode>
    <ManagerApp />
  </StrictMode>,
)
