import { gateway } from '@ai-sdk/gateway'
import { generateText } from 'ai'
import { rpc } from './_brush/db.ts'
import { cleanDetail, json, pins } from './_brush/http.ts'

export const maxDuration = 60

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
    const { lab, brush } = pins(request)
    try {
      const body = await request.json() as { draft?: string }
      const draft = String(body.draft || '').trim()
      if (!draft) return json({ error: 'There is no draft recipe to phrase.' }, 400)
      await rpc('brush_gate', { lab_pin: lab, brush_pin: brush })
      const { text } = await generateText({
        model: gateway('openai/gpt-4o-mini'),
        prompt: [
          'Rewrite this portrait prompt recipe so it is concrete and usable by an image model.',
          'Return only the recipe text. Do not generate an image. Do not add a preamble.',
          'Keep it a suggestion for a person to review.',
          '',
          draft,
        ].join('\n'),
      })
      const phrased = text.trim()
      await rpc('brush_save_recipe', { lab_pin: lab, brush_pin: brush, body: phrased, basis: { kind: 'phrased-suggestion' } })
      return json({ body: phrased })
    } catch (error) {
      const detail = cleanDetail(error)
      const status = /rate.?limit|429/i.test(detail) ? 429 : 500
      return json({ error: status === 429 ? 'The model is busy. The draft recipe is still here.' : 'Could not phrase the recipe. The draft is unchanged.' }, status)
    }
  },
}
