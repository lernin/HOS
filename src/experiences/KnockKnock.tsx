import { useEffect, useState } from 'react'
import {
  captureLegacyMusicBrowserState,
  readLegacyMusicCloudReceipt,
  uploadLegacyMusicInitialCapture,
  type LegacyMusicCapture,
  type LegacyMusicCloudReceipt,
} from './musicLegacyImport'

type State =
  | { kind:'working'; capture:LegacyMusicCapture | null }
  | { kind:'done'; capture:LegacyMusicCapture; receipt:LegacyMusicCloudReceipt }
  | { kind:'empty' }
  | { kind:'error'; capture:LegacyMusicCapture | null; message:string }

export function KnockKnock({ pin, onExit }: { pin:string; onExit:() => void }) {
  const [state, setState] = useState<State>(() => {
    const captured = captureLegacyMusicBrowserState()
    if (!captured.initial || captured.initial.summary.keyCount <= 0) return { kind:'empty' }
    const receipt = readLegacyMusicCloudReceipt()
    if (receipt?.capturedAt === captured.initial.capturedAt) {
      return { kind:'done', capture:captured.initial, receipt }
    }
    return { kind:'working', capture:captured.initial }
  })

  useEffect(() => {
    if (state.kind !== 'working' || !state.capture) return
    let cancelled = false

    const run = async () => {
      try {
        const receipt = await uploadLegacyMusicInitialCapture(pin, state.capture!)
        if (!cancelled && receipt) setState({ kind:'done', capture:state.capture!, receipt })
      } catch (error) {
        if (!cancelled) {
          setState({
            kind:'error',
            capture:state.capture,
            message:error instanceof Error ? error.message : 'Cloud backup failed.',
          })
        }
      }
    }

    void run()
    return () => { cancelled = true }
  }, [pin, state])

  const capture = state.kind === 'done' || state.kind === 'working' || state.kind === 'error' ? state.capture : null
  const summary = capture?.summary

  return (
    <main className="shell">
      <section className="pin-card" style={{maxWidth:520,margin:'48px auto'}}>
        <div className="eyebrow">One-time browser rescue</div>
        <h1>Knock Knock</h1>

        {state.kind === 'working' && <>
          <p>Copying this browser's old Music Discovery data into the production database…</p>
          <div className="notice">Do not close this page yet.</div>
        </>}

        {state.kind === 'done' && <>
          <p><strong>Cloud copy saved ✓</strong></p>
          <p>The original browser data is still intact.</p>
          <div className="notice">
            {summary?.pieceRatings || 0} Piece ratings · {summary?.soundRatings || 0} Sound ratings · {summary?.performanceRatings || 0} Performance ratings · {summary?.discoveredRecordings || 0} discovered recordings
          </div>
          <p style={{fontSize:12,opacity:.7}}>Snapshot {state.receipt.snapshotId.slice(0,8)}…</p>
        </>}

        {state.kind === 'empty' && <>
          <p>No legacy Music Discovery browser data was found on this browser.</p>
          <div className="notice">Use the same browser/profile where the old ratings were made.</div>
        </>}

        {state.kind === 'error' && <>
          <p><strong>Cloud copy did not complete.</strong></p>
          <div className="notice">{state.message}</div>
          <p>Your original browser data is still preserved. Reopen Knock Knock to retry.</p>
        </>}

        <button onClick={onExit} style={{marginTop:18}}>Back to The Lab</button>
      </section>
    </main>
  )
}
