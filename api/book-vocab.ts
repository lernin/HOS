import { gateway } from '@ai-sdk/gateway'
import { generateText } from 'ai'

const ACCESS_PIN = '3476'
const MAX_DATA_URL_LENGTH = 5_500_000

type Word = { word: string; korean: string }

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

function parseJson(text: string) {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('Model did not return JSON.')
  return JSON.parse(text.slice(start, end + 1)) as { words?: Word[] }
}

function decodeDataUrl(input: string) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/i.exec(input)
  if (!match) throw new Error('Unsupported image format.')
  return {
    mediaType: match[1] as 'image/jpeg' | 'image/png' | 'image/webp',
    data: new Uint8Array(Buffer.from(match[2], 'base64')),
  }
}

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
    if (request.headers.get('x-review-pin') !== ACCESS_PIN) return json({ error: 'Unauthorized.' }, 401)

    try {
      const body = await request.json() as { image?: string }
      const image = String(body.image || '')
      if (!image) return json({ error: 'No image was received.' }, 400)
      if (image.length > MAX_DATA_URL_LENGTH) return json({ error: 'That image is too large. Try another photo.' }, 413)

      const file = decodeDataUrl(image)
      const instructions = [
        'Read the English text visible in this photographed book page.',
        'Create a complete vocabulary list from the readable English words on the page.',
        '',
        'Return ONLY valid JSON with exactly this shape:',
        '{"words":[{"word":"example","korean":"예시"}]}',
        '',
        'Rules:',
        '- Include every distinct readable English lexical word in the actual page text. Do not omit easy or common words.',
        '- Ignore pure punctuation, page numbers, decorative marks, and obvious OCR garbage.',
        '- Clean punctuation from around words and deduplicate case-insensitively.',
        '- Keep contractions and meaningful hyphenated words intact.',
        '- Use a clean dictionary-style English form when the inflected form is clearly just a grammatical variant, but do not change proper nouns.',
        '- Translate each English entry into concise, natural Korean according to the sense used on this page.',
        '- If the same spelling is used with two clearly different senses, combine the short Korean meanings with " / " rather than duplicating the English word.',
        '- Sort the final entries alphabetically by English word.',
        '- Do not invent text that is not visibly supported by the image.',
      ].join('\n')

      const { text } = await generateText({
        model: gateway('openai/gpt-5.6-sol'),
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: instructions },
            { type: 'file', data: file.data, mediaType: file.mediaType },
          ],
        }],
      })

      const parsed = parseJson(text)
      const deduped = new Map<string, Word>()
      for (const entry of parsed.words || []) {
        const word = String(entry?.word || '').trim()
        const korean = String(entry?.korean || '').trim()
        if (!word || !korean) continue
        const key = word.toLocaleLowerCase('en')
        if (!deduped.has(key)) deduped.set(key, { word, korean })
      }

      const words = [...deduped.values()].sort((a, b) => a.word.localeCompare(b.word, 'en', { sensitivity: 'base' }))
      if (!words.length) return json({ error: 'No readable English vocabulary was found.' }, 422)
      return json({ words })
    } catch (error) {
      console.error('Book vocab scan failed', error)
      const detail = error instanceof Error ? error.message : String(error)
      const rateLimited = /rate.?limit/i.test(detail)
      return json({
        error: rateLimited ? 'The vision model is busy. Try again in a moment.' : 'Could not read that page. Try a clearer photo.',
      }, rateLimited ? 429 : 500)
    }
  },
}
