import { rpc } from '../db.js'
import { cleanDetail, json, pins } from '../http.js'
import { scanUnscannedFaces } from '../face-scan.js'

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
    const token = process.env.FACE_BACKFILL_TOKEN?.trim() || ''
    if (!token || request.headers.get('x-face-token') !== token) return json({ error: 'Unknown Brush route.' }, 404)
    const { lab } = pins(request)
    const brush = process.env.BRUSH_PIN?.trim() || ''
    if (!lab || !brush) return json({ error: 'Brush is not configured.' }, 503)
    try {
      const gate = await rpc<{ ok: boolean }>('brush_gate', { lab_pin: lab, brush_pin: brush })
      if (!gate.ok) return json({ error: 'Wrong PIN.' }, 401)
      const started = Date.now()
      let scanned = 0
      let withBox = 0
      let remaining = true
      while (remaining && Date.now() - started < 45000) {
        const batch = await scanUnscannedFaces(lab, brush, null, 6, 20000)
        scanned += batch.scanned
        withBox += batch.withBox
        remaining = batch.remaining
        if (batch.scanned === 0) break
      }
      return json({ scanned, withBox, remaining })
    } catch (error) {
      const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : 500
      return json({ error: error instanceof Error ? error.message : cleanDetail(error) }, status || 500)
    }
  },
}
