import { rpc } from './_brush/db.ts'
import { UPLOADS_FOLDER_NAME, uploadJpeg } from './_brush/drive.ts'
import { cleanDetail, json, pins } from './_brush/http.ts'

export const maxDuration = 60

const MAX_BYTES = 3_500_000

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
    const { lab, brush } = pins(request)
    try {
      await rpc('brush_gate', { lab_pin: lab, brush_pin: brush })
      const form = await request.formData()
      const image = form.get('image')
      if (!(image instanceof File) || image.size === 0) return json({ error: 'Choose a photo to upload.' }, 400)
      if (image.size > MAX_BYTES) return json({ error: 'That photo is still too large after resizing. Try another one.' }, 413)
      const name = (image.name || 'upload.jpg').replace(/[^\w.\- ]+/g, '').slice(0, 180) || 'upload.jpg'
      const saved = await uploadJpeg(name, new Uint8Array(await image.arrayBuffer()))
      await rpc('brush_upsert_images', {
        lab_pin: lab,
        brush_pin: brush,
        images: [{
          drive_file_id: saved.id,
          name: saved.name || name,
          folder_path: UPLOADS_FOLDER_NAME,
          country: 'Uploads',
          mime_type: 'image/jpeg',
          source: 'upload',
        }],
      })
      return json({ drive_file_id: saved.id, name: saved.name || name })
    } catch (error) {
      const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : 500
      return json({ error: error instanceof Error ? error.message : cleanDetail(error) }, status || 500)
    }
  },
}
