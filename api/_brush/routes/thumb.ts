import { rpc } from '../db.js'
import { cleanDetail, json, pins } from '../http.js'
import { getThumb } from '../storage.js'

export default {
  async fetch(request: Request) {
    if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405)
    const { lab, brush } = pins(request)
    const imageId = new URL(request.url).searchParams.get('id') || ''
    if (!/^[0-9a-f-]{36}$/i.test(imageId)) return json({ error: 'Image id is not valid.' }, 400)
    try {
      const found = await rpc<{ path: string }>('brush_thumbnail_path', {
        lab_pin: lab,
        brush_pin: brush,
        image_id: imageId,
      })
      const bytes = await getThumb(found.path)
      return new Response(bytes, {
        headers: { 'content-type': 'image/webp', 'cache-control': 'private, max-age=86400' },
      })
    } catch (error) {
      const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : 500
      return json({ error: error instanceof Error ? error.message : cleanDetail(error) }, status || 500)
    }
  },
}
