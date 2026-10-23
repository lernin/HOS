import { rpc } from '../db.ts'
import { uploadsFile } from '../drive.ts'
import { cleanDetail, json, pins } from '../http.ts'
import { putThumb } from '../storage.ts'

const MAX_THUMB = 2 * 1024 * 1024

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
    const { lab, brush } = pins(request)
    try {
      const form = await request.formData()
      const driveFileId = String(form.get('driveFileId') || '')
      const name = String(form.get('name') || '')
      const hash = String(form.get('hash') || '').toLowerCase()
      const mime = String(form.get('mime') || 'image/jpeg')
      const bytes = Number(form.get('bytes') || 0)
      if (!/^[0-9a-f]{64}$/.test(hash)) return json({ error: 'Photo hash is not valid.' }, 400)
      const file = await uploadsFile(driveFileId)
      const thumbnail = form.get('thumbnail')
      let thumbnailPath: string | null = null
      if (thumbnail instanceof File && thumbnail.size > 0 && thumbnail.size <= MAX_THUMB && thumbnail.type === 'image/webp') {
        const stored = await putThumb(hash, new Uint8Array(await thumbnail.arrayBuffer()))
        if (stored) thumbnailPath = `${hash}.webp`
      }
      const registered = await rpc<{ duplicate?: boolean, id?: string }>('brush_register_upload', {
        lab_pin: lab,
        brush_pin: brush,
        drive_file_id: file.id,
        name: file.name || name,
        content_hash: hash,
        mime_type: file.mimeType || mime,
        byte_size: bytes,
        thumbnail_path: thumbnailPath,
      })
      return json({ duplicate: Boolean(registered.duplicate), id: registered.id || null, thumbnail: Boolean(thumbnailPath) })
    } catch (error) {
      const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : 500
      return json({ error: error instanceof Error ? error.message : cleanDetail(error) }, status || 500)
    }
  },
}
