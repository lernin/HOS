import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { supabase } from './lib/supabase'
import { EngagementLab } from './experiences/EngagementLab'
import './thekonym.css'

function EngagementLabEntry() {
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem('engagement-lab-unlocked') === '1')
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  async function unlock(event: React.FormEvent) {
    event.preventDefault()
    const candidate = pin.trim()
    if (candidate.length !== 4) return
    setLoading(true)
    setMessage('')
    const { data, error } = await supabase.rpc('lab_thekonym_read', { pin: candidate })
    setLoading(false)
    if (error || !data?.length) {
      setMessage(error?.code === '28000' || !data?.length ? 'Wrong PIN.' : 'Could not connect. Please try again.')
      return
    }
    sessionStorage.setItem('engagement-lab-unlocked', '1')
    setUnlocked(true)
    setPin('')
  }

  if (unlocked) return <EngagementLab onExit={() => { window.location.href = '/' }} />

  return (
    <main className="shell pin-shell" data-theme="terminal-cream">
      <section className="pin-card">
        <div className="eyebrow">Ashley’s private workspace</div>
        <h1>Engagement Matrix</h1>
        <p>Unlock The Lab to try the learning matrix.</p>
        <form onSubmit={unlock} className="pin-form">
          <input autoFocus inputMode="numeric" maxLength={4} value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, ''))} placeholder="PIN" />
          <button disabled={loading || pin.length !== 4}>{loading ? 'Opening…' : 'Open'}</button>
        </form>
        {message && <div className="notice">{message}</div>}
      </section>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><EngagementLabEntry /></StrictMode>)
