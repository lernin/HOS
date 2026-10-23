import { forwardUploadChunk } from './_brush/drive.ts'
import { cleanDetail, json, pins } from './_brush/http.ts'
import { rpc } from './_brush/db.ts'

export const maxDuration = 60

const MAX_CHUNK = 4 * 1024 * 1024
const ALIGN = 256 * 1024

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
    const { lab, brush } = pins(request)
    try {
      await rpc('brush_gate', { lab_pin: lab, brush_pin: brush })
      const declared = Number(request.headers.get('content-length') || 0)
      if (declared > MAX_CHUNK) return json({ error: 'Upload chunk is the wrong size.' }, 413)
      const uploadUrl = request.headers.get('x-upload-url') || ''
      const range = request.headers.get('x-content-range') || ''
      const mime = request.headers.get('x-upload-mime') || 'application/octet-stream'
      const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(range)
      if (!match) return json({ error: 'Upload range is not valid.' }, 400)
      const start = Number(match[1])
      const end = Number(match[2])
      const total = Number(match[3])
      const bytes = new Uint8Array(await request.arrayBuffer())
      if (bytes.byteLength < 1 || bytes.byteLength > MAX_CHUNK) return json({ error: 'Upload chunk is the wrong size.' }, 413)
      if (end < start || end - start + 1 !== bytes.byteLength || end >= total) return json({ error: 'Upload range does not match the chunk.' }, 400)
      if (start % ALIGN !== 0) return json({ error: 'Upload chunk is not aligned.' }, 400)
      if (end + 1 !== total && bytes.byteLength % ALIGN !== 0) return json({ error: 'Upload chunk is not aligned.' }, 400)
      const saved = await forwardUploadChunk(uploadUrl, bytes, range, mime)
      if (!saved.complete) return json({ complete: false, uploadUrl: saved.uploadUrl })
      return json({ complete: true, file: saved.file })
    } catch (error) {
      const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : 500
      return json({ error: error instanceof Error ? error.message : cleanDetail(error) }, status || 500)
    }
  },
}
