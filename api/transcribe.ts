import { gateway } from '@ai-sdk/gateway'
import { transcribe } from 'ai'

const ACCESS_PIN = '3476'
const MAX_AUDIO_BYTES = 25 * 1024 * 1024

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
    if (request.headers.get('x-review-pin') !== ACCESS_PIN) return json({ error: 'Unauthorized.' }, 401)

    try {
      const form = await request.formData()
      const audio = form.get('audio')
      if (!(audio instanceof File) || audio.size === 0) return json({ error: 'No audio was received.' }, 400)
      if (audio.size > MAX_AUDIO_BYTES) return json({ error: 'That recording is too long to transcribe.' }, 413)

      const result = await transcribe({
        model: gateway.transcriptionModel('openai/whisper-1'),
        audio: new Uint8Array(await audio.arrayBuffer()),
      })

      return json({ text: result.text.trim() })
    } catch (error) {
      console.error('Transcription failed', error)
      const detail = error instanceof Error ? error.message : String(error)
      return json({ error: 'Transcription failed. Your existing note was not changed.', detail }, 500)
    }
  },
}
