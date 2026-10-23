import { rpc } from './_brush/db.ts'
import { downloadPreview } from './_brush/drive.ts'
import { cleanDetail, json, pins } from './_brush/http.ts'

export const maxDuration = 30

export default {
  async fetch(request: Request) {
    if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405)
    const { lab, brush } = pins(request)
    const driveId = new URL(request.url).searchParams.get('id') || ''
    try {
      await rpc('brush_image_lookup', { lab_pin: lab, brush_pin: brush, drive_file_id: driveId })
      const image = await downloadPreview(driveId)
      return new Response(image.bytes, {
        headers: {
          'content-type': image.mediaType.split(';')[0] || 'image/jpeg',
          'cache-control': 'private, max-age=300',
        },
      })
    } catch (error) {
      const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : 500
      return json({ error: error instanceof Error ? error.message : cleanDetail(error) }, status || 500)
    }
  },
}
