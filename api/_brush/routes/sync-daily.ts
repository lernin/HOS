import sync from './sync.js'
import { json } from '../http.js'

const BUDGET_MS = 45_000

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export default {
  async fetch(request: Request) {
    if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405)
    if (!authorized(request)) return json({ error: 'Not found.' }, 404)
    const brush = process.env.BRUSH_PIN?.trim() || ''
    const lab = process.env.ACCESS_PIN?.trim() || ''
    if (!brush || !lab) return json({ error: 'Brush sync is not configured.' }, 503)
    let runId: string | undefined
    let pending: { id: string, path: string, pageToken?: string }[] | undefined
    let prompts: Record<string, string> = {}
    const started = Date.now()
    let steps = 0
    let archived = 0
    while (Date.now() - started < BUDGET_MS && steps < 40) {
      const response = await sync.fetch(new Request('https://brush.local/api/brush-sync', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-lab-pin': lab,
          'x-brush-pin': brush,
        },
        body: JSON.stringify({ runId, pending, prompts }),
      }))
      const body = await response.json() as { error?: string, runId?: string, pending?: typeof pending, prompts?: Record<string, string>, done?: boolean, archived?: number }
      if (!response.ok) return json({ error: body.error || 'Sync failed.' }, response.status)
      runId = body.runId
      pending = body.pending
      prompts = body.prompts || {}
      steps += 1
      if (body.done) {
        archived = body.archived || 0
        return json({ done: true, steps, archived })
      }
    }
    return json({ done: false, steps, archived })
  },
}
