import { rpc } from './_brush/db.ts'
import { cleanDetail, json, pins } from './_brush/http.ts'

type Source = 'admin' | 'scout'

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
    const { lab, brush } = pins(request)
    try {
      const body = await request.json() as { category?: string, label?: string, source?: Source }
      const source = body.source === 'scout' ? 'scout' : 'admin'
      const saved = await rpc<{ id: string, status: string, created: boolean }>('brush_suggest_tag', {
        lab_pin: lab,
        brush_pin: brush,
        category: body.category || '',
        label: body.label || '',
        tag_source: source,
      })
      return json(saved)
    } catch (error) {
      const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : 500
      return json({ error: error instanceof Error ? error.message : cleanDetail(error) }, status || 500)
    }
  },
}
