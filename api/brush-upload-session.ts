import { rpc } from './_brush/db.ts'
import { beginResumableUpload } from './_brush/drive.ts'
import { cleanDetail, json, pins } from './_brush/http.ts'

export const maxDuration = 30

const MAX_BYTES = 200 * 1024 * 1024
const IMAGE = /^image\/(jpeg|png|webp|gif|heic|heif)$/i

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
    const { lab, brush } = pins(request)
    try {
      const body = await request.json() as { name?: string, hash?: string, mime?: string, bytes?: number }
      const hash = String(body.hash || '').toLowerCase()
      const mime = String(body.mime || '')
      const bytes = Number(body.bytes || 0)
      const name = String(body.name || 'photo')
      if (!/^[0-9a-f]{64}$/.test(hash)) return json({ error: 'Photo hash is not valid.' }, 400)
      if (!IMAGE.test(mime)) return json({ error: 'Choose a photo. That file type is not supported.' }, 400)
      if (!Number.isFinite(bytes) || bytes < 1) return json({ error: 'That photo is empty.' }, 400)
      if (bytes > MAX_BYTES) return json({ error: 'That photo is over 200 MB.' }, 413)
      const claim = await rpc<{ duplicate: boolean, name?: string }>('brush_upload_claim', {
        lab_pin: lab,
        brush_pin: brush,
        content_hash: hash,
      })
      if (claim.duplicate) return json({ duplicate: true, name: claim.name || '' })
      const uploadUrl = await beginResumableUpload(name, mime, bytes, hash)
      return json({ duplicate: false, uploadUrl })
    } catch (error) {
      const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : 500
      return json({ error: error instanceof Error ? error.message : cleanDetail(error) }, status || 500)
    }
  },
}
