import sharp from 'sharp'
import { rpc } from '../db.js'
import { downloadPreview } from '../drive.js'
import { cleanDetail, json, pins } from '../http.js'
import { detectFaceBoxFromBytes } from '../face-detect.js'
import { scanUnscannedFaces } from '../face-scan.js'

async function samplePhotos(driveIds: string[]) {
  const samples: { driveId: string, box: { x: number, y: number, w: number, h: number } | null, jpeg: string }[] = []
  for (const driveId of driveIds.slice(0, 2)) {
    if (!/^[\w-]{10,}$/.test(driveId)) continue
    const image = await downloadPreview(driveId)
    const jpeg = await sharp(Buffer.from(image.bytes), { failOn: 'none' }).rotate().resize(540, 960, { fit: 'inside' }).jpeg({ quality: 72 }).toBuffer()
    const box = await detectFaceBoxFromBytes(image.bytes)
    samples.push({ driveId, box, jpeg: jpeg.toString('base64') })
  }
  return samples
}

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
    const token = process.env.FACE_BACKFILL_TOKEN?.trim() || ''
    if (!token || request.headers.get('x-face-token') !== token) return json({ error: 'Unknown Brush route.' }, 404)
    const { lab } = pins(request)
    const brush = process.env.BRUSH_PIN?.trim() || ''
    if (!lab || !brush) return json({ error: 'Brush is not configured.' }, 503)
    try {
      if (request.headers.get('x-face-sample') === '1') {
        const body = await request.json() as { driveIds?: string[] }
        const gate = await rpc<{ ok: boolean }>('brush_gate', { lab_pin: lab, brush_pin: brush })
        if (!gate.ok) return json({ error: 'Wrong PIN.' }, 401)
        return json({ samples: await samplePhotos(Array.isArray(body.driveIds) ? body.driveIds : []) })
      }
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
