import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { thekonymReader } from '../lib/supabase'
import { thekonymLiveSource } from '../lib/thekonymLiveSource'
import { ThekonymViewer } from './ThekonymViewer'

export function ThekonymReader({ onExit }: { onExit: () => void }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const { data: { subscription } } = thekonymReader.auth.onAuthStateChange((_event, next) => {
      if (active) { setSession(next); setReady(true) }
    })
    void thekonymReader.auth.getSession().then(({ data, error: authError }) => {
      if (!active) return
      setSession(data.session)
      setReady(true)
      if (authError) setError('Your reading session expired. Please sign in again.')
    }).catch(() => { if (active) { setReady(true); setError('Could not open your reading session. Please sign in again.') } })
    return () => { active = false; subscription.unsubscribe() }
  }, [])

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const { error: signInError } = await thekonymReader.auth.signInWithPassword({ email: email.trim(), password })
      if (signInError) setError(signInError.message)
      else setPassword('')
    } catch { setError('Could not connect. Check your connection and try again.') }
    finally { setBusy(false) }
  }

  async function signOut() {
    const { error: signOutError } = await thekonymReader.auth.signOut({ scope: 'local' })
    if (signOutError) setError('Could not sign out. Please try again.')
  }

  if (ready && session) return <ThekonymViewer key={session.user.id} source={thekonymLiveSource} onExit={onExit} onSignOut={() => void signOut()} />

  return <main className="tv-auth-shell">
    <nav><button onClick={onExit}>← The Lab</button><span>PROCEDIA</span></nav>
    <section className="tv-auth-card">
      <span className="tv-auth-monogram" aria-hidden="true">Th</span>
      <p className="tv-auth-eyebrow">THE COLLECTION</p>
      <h1>Thekonym viewer</h1>
      <p className="tv-auth-intro">A quiet place to read, consider, and connect ideas.</p>
      {!ready ? <p role="status">Opening your reading session…</p> : <form onSubmit={event => void signIn(event)}>
        <h2>Sign in to your collection</h2>
        <label htmlFor="reader-email">Email</label><input id="reader-email" name="email" type="email" autoComplete="username" autoCapitalize="none" required value={email} onChange={e => setEmail(e.target.value)} />
        <label htmlFor="reader-password">Password</label><input id="reader-password" name="password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
        {error && <p className="tv-auth-error" role="alert">{error}</p>}
        <button className="tv-auth-submit" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Open the collection →'}</button>
        <p className="tv-auth-caption">Use your existing verified account. Your reading session stays separate from the rest of The Lab.</p>
      </form>}
      <p className="tv-auth-footer">READ ONLY · FRESH FROM THE DATABASE</p>
    </section>
  </main>
}
