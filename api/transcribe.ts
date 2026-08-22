import { gateway } from '@ai-sdk/gateway'
import { transcribe } from 'ai'

const ACCESS_PIN = '3476'
const MAX_AUDIO_BYTES = 25 * 1024 * 1024
const KOREAN_TRANSCRIPTION_MODELS = {
  'openai-mini': 'openai/gpt-4o-mini-transcribe',
  'openai-full': 'openai/gpt-4o-transcribe',
} as const

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
      const koreanOnly = request.headers.get('x-transcription-language') === 'ko'
      const requestedModel = request.headers.get('x-transcription-model')
      const koreanModel = requestedModel === 'openai-full' ? 'openai-full' : 'openai-mini'

      const result = await transcribe({
        model: gateway.transcriptionModel(koreanOnly ? KOREAN_TRANSCRIPTION_MODELS[koreanModel] : 'openai/whisper-1'),
        audio: new Uint8Array(await audio.arrayBuffer()),
        providerOptions: koreanOnly ? {
          openai: {
            language: 'ko',
            prompt: '한국어 음성을 한글로만 받아쓰세요. 로마자로 표기하거나 영어로 번역하지 마세요.',
          },
        } : undefined,
      })

      const text = koreanOnly
        ? result.text.replace(/[A-Za-z]+/g, '').replace(/\s+/g, ' ').trim()
        : result.text.trim()
      if (koreanOnly && !/[가-힣]/.test(text)) return json({ error: '한글을 듣지 못했어요. 다시 말해 보세요.' }, 422)
      return json({ text, model: koreanOnly ? koreanModel : 'whisper' })
    } catch (error) {
      console.error('Transcription failed', error)
      const detail = error instanceof Error ? error.message : String(error)
      const rateLimited = /rate.?limit/i.test(detail)
      return json({
        error: rateLimited ? 'Transcription is busy. Waiting to try again…' : 'Transcription failed. Please try again.',
      }, rateLimited ? 429 : 500)
    }
  },
}
