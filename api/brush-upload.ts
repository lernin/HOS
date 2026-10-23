import { json } from './_brush/http.ts'

export const maxDuration = 15

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
    return json({ error: 'Use the upload queue. Full-size originals are sent to Drive in chunks.' }, 410)
  },
}
