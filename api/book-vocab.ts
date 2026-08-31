import { gateway } from '@ai-sdk/gateway'
import { generateText } from 'ai'

const ACCESS_PIN = '3476'
const MAX_IMAGE_BYTES = 2_500_000
const MODEL = 'openai/gpt-5.6-sol'
const ENDPOINT_VERSION = 'book-vocab-reporting-v2'

type Word = { word: string; korean: string }
type Stage = 'receive' | 'ocr' | 'vocab' | 'parse'

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

function cleanDetail(error: unknown) {
  const detail = error instanceof Error ? error.message : String(error)
  return detail
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [redacted]')
    .replace(/\bsk-[A-Za-z0-9_-]{10,}\b/g, '[redacted-key]')
    .replace(/(api[_-]?key["'=:\s]+)[^\s,;}]+/gi, '$1[redacted]')
    .replace(/\s+/g, ' ')
    .slice(0, 700)
}

function log(scanId: string, stage: Stage, event: string, detail?: Record<string, unknown>) {
  console.log(JSON.stringify({
    source: 'book-vocab',
    version: ENDPOINT_VERSION,
    scanId,
    stage,
    event,
    ...detail,
  }))
}

function fail(
  scanId: string,
  stage: Stage,
  code: string,
  message: string,
  status: number,
  startedAt: number,
  error?: unknown,
) {
  const detail = error ? cleanDetail(error) : undefined
  const elapsedMs = Date.now() - startedAt

  console.error(JSON.stringify({
    source: 'book-vocab',
    version: ENDPOINT_VERSION,
    scanId,
    stage,
    event: 'failed',
    code,
    status,
    model: MODEL,
    elapsedMs,
    detail,
  }))

  return json({
    error: message,
    diagnostic: {
      scanId,
      stage,
      code,
      detail,
      model: MODEL,
      elapsedMs,
      endpointVersion: ENDPOINT_VERSION,
    },
  }, status)
}

function parseWords(text: string) {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('Vocabulary model did not return a JSON object.')
  const parsed = JSON.parse(text.slice(start, end + 1)) as { words?: Word[] }
  if (!Array.isArray(parsed.words)) throw new Error('Vocabulary JSON did not contain a words array.')
  return parsed.words
}

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
    if (request.headers.get('x-review-pin') !== ACCESS_PIN) return json({ error: 'Unauthorized.' }, 401)

    const startedAt = Date.now()
    let scanId = crypto.randomUUID().slice(0, 8)
    let stage: Stage = 'receive'

    try {
      const form = await request.formData()
      const image = form.get('image')
      const submittedScanId = String(form.get('scan_id') || '').trim()
      if (/^[a-zA-Z0-9-]{4,40}$/.test(submittedScanId)) scanId = submittedScanId

      if (!(image instanceof File) || image.size === 0) {
        return fail(scanId, stage, 'NO_IMAGE', 'No image reached the scanner.', 400, startedAt)
      }
      if (!/^image\/(jpeg|png|webp)$/i.test(image.type)) {
        return fail(scanId, stage, 'UNSUPPORTED_IMAGE', 'That image format is not supported.', 415, startedAt)
      }
      if (image.size > MAX_IMAGE_BYTES) {
        return fail(scanId, stage, 'IMAGE_TOO_LARGE', 'The prepared photo is still too large to scan.', 413, startedAt)
      }

      log(scanId, stage, 'received', {
        bytes: image.size,
        mediaType: image.type,
      })

      const imageBytes = new Uint8Array(await image.arrayBuffer())

      stage = 'ocr'
      log(scanId, stage, 'started', { model: MODEL })
      let pageText = ''
      try {
        const ocrResult = await generateText({
          model: gateway(MODEL),
          messages: [{
            role: 'user',
            content: [
              {
                type: 'text',
                text: [
                  'Act as a careful OCR reader for a photographed English book page.',
                  'Transcribe all readable English text from the main page content as faithfully as possible.',
                  'Preserve the words and sentence order. Do not translate, summarize, explain, or output JSON.',
                  'Ignore only page numbers and purely decorative marks.',
                  'If a word is genuinely unreadable, skip that word rather than inventing it.',
                  'Return only the transcription.',
                ].join('\n'),
              },
              {
                type: 'file',
                data: imageBytes,
                mediaType: image.type as 'image/jpeg' | 'image/png' | 'image/webp',
              },
            ],
          }],
        })
        pageText = ocrResult.text.trim()
      } catch (error) {
        const detail = cleanDetail(error)
        const rateLimited = /rate.?limit|429/i.test(detail)
        return fail(
          scanId,
          stage,
          rateLimited ? 'VISION_RATE_LIMIT' : 'VISION_REQUEST_FAILED',
          rateLimited ? 'OpenAI vision is busy. Try the scan again in a moment.' : 'OpenAI could not process the photo.',
          rateLimited ? 429 : 502,
          startedAt,
          error,
        )
      }

      if (!pageText || !/[A-Za-z]/.test(pageText)) {
        return fail(scanId, stage, 'NO_ENGLISH_TEXT', 'OpenAI did not detect readable English text in that photo.', 422, startedAt)
      }

      log(scanId, stage, 'completed', {
        characters: pageText.length,
        elapsedMs: Date.now() - startedAt,
      })

      stage = 'vocab'
      log(scanId, stage, 'started', { characters: pageText.length, model: MODEL })
      let vocabText = ''
      try {
        const vocabResult = await generateText({
          model: gateway(MODEL),
          prompt: [
            'Turn this OCR transcription from an English book page into a complete vocabulary list with Korean translations.',
            '',
            'Return ONLY valid JSON in exactly this shape:',
            '{"words":[{"word":"example","korean":"예시"}]}',
            '',
            'Rules:',
            '- Include every distinct English lexical word found in the transcription, including common function words.',
            '- Remove punctuation-only noise and deduplicate case-insensitively.',
            '- Keep contractions and meaningful hyphenated words intact.',
            '- Use a clean dictionary-style base form when an inflected form is clearly only grammatical, but do not alter proper nouns.',
            '- Translate each entry into concise, natural Korean according to how it is used in this page context.',
            '- If one spelling has two clearly different senses on the page, combine the Korean meanings with " / ".',
            '- Sort alphabetically by English word.',
            '- Never add a word that is not supported by the transcription.',
            '',
            'PAGE TRANSCRIPTION:',
            pageText,
          ].join('\n'),
        })
        vocabText = vocabResult.text
      } catch (error) {
        const detail = cleanDetail(error)
        const rateLimited = /rate.?limit|429/i.test(detail)
        return fail(
          scanId,
          stage,
          rateLimited ? 'VOCAB_RATE_LIMIT' : 'VOCAB_REQUEST_FAILED',
          rateLimited ? 'OpenAI translation is busy. Try again in a moment.' : 'The page was read, but the vocabulary translation step failed.',
          rateLimited ? 429 : 502,
          startedAt,
          error,
        )
      }

      stage = 'parse'
      let rawWords: Word[]
      try {
        rawWords = parseWords(vocabText)
      } catch (error) {
        log(scanId, stage, 'parse_failed', { preview: vocabText.slice(0, 220) })
        return fail(scanId, stage, 'INVALID_VOCAB_JSON', 'The page was read, but the vocabulary result was malformed.', 502, startedAt, error)
      }

      const deduped = new Map<string, Word>()
      for (const entry of rawWords) {
        const word = String(entry?.word || '').trim()
        const korean = String(entry?.korean || '').trim()
        if (!word || !korean) continue
        const key = word.toLocaleLowerCase('en')
        if (!deduped.has(key)) deduped.set(key, { word, korean })
      }

      const words = [...deduped.values()].sort((a, b) => a.word.localeCompare(b.word, 'en', { sensitivity: 'base' }))
      if (!words.length) {
        return fail(scanId, stage, 'EMPTY_VOCAB', 'The page was read, but no vocabulary entries were produced.', 422, startedAt)
      }

      log(scanId, stage, 'completed', {
        words: words.length,
        transcriptionCharacters: pageText.length,
        elapsedMs: Date.now() - startedAt,
      })

      return json({
        words,
        diagnostic: {
          scanId,
          stage: 'complete',
          code: 'OK',
          model: MODEL,
          elapsedMs: Date.now() - startedAt,
          endpointVersion: ENDPOINT_VERSION,
          words: words.length,
          transcriptionCharacters: pageText.length,
        },
      })
    } catch (error) {
      return fail(scanId, stage, 'UNEXPECTED_SERVER_ERROR', 'The scanner hit an unexpected server error.', 500, startedAt, error)
    }
  },
}
