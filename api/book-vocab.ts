import { gateway } from '@ai-sdk/gateway'
import { generateText } from 'ai'

const ACCESS_PIN = '3476'
const MAX_IMAGE_BYTES = 2_500_000
const MODEL = 'openai/gpt-4o-mini'
const ENDPOINT_VERSION = 'book-vocab-scrub-v2'
const VOCAB_BATCH_SIZE = 90

type Word = { word: string; korean: string }
type RawWord = { source?: string; word?: string; korean?: string; skip?: boolean }
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
  const parsed = JSON.parse(text.slice(start, end + 1)) as { words?: RawWord[] }
  if (!Array.isArray(parsed.words)) throw new Error('Vocabulary JSON did not contain a words array.')
  return parsed.words
}

function extractCandidateWords(pageText: string) {
  const normalized = pageText
    .normalize('NFKC')
    .replace(/[’‘‛]/g, "'")
    .replace(/[‐‑‒–—]/g, '-')
    .replace(/\u00ad/g, '')

  const matches = normalized.match(/[A-Za-z]+(?:['-][A-Za-z]+)*/g) || []
  const deduped = new Map<string, string>()

  for (const match of matches) {
    const word = match
      .replace(/^['-]+|['-]+$/g, '')
      .replace(/-{2,}/g, '-')
      .trim()

    if (!word) continue
    if (word.length === 1 && !/^[aAiI]$/.test(word)) continue
    if (word.length > 45) continue
    if (!/[A-Za-z]/.test(word)) continue

    const key = word.toLocaleLowerCase('en')
    const existing = deduped.get(key)

    // Prefer lowercase for ordinary words if OCR saw both sentence-initial and lowercase forms.
    if (!existing || (existing[0] === existing[0]?.toUpperCase() && word[0] === word[0]?.toLowerCase())) {
      deduped.set(key, word)
    }
  }

  return [...deduped.values()].sort((a, b) =>
    a.localeCompare(b, 'en', { sensitivity: 'base' }),
  )
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = []
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size))
  return result
}

function cleanHeadword(value: string) {
  return value
    .normalize('NFKC')
    .replace(/[’‘‛]/g, "'")
    .replace(/[‐‑‒–—]/g, '-')
    .replace(/^['-]+|['-]+$/g, '')
    .trim()
}

async function runVocabBatch(pageText: string, candidates: string[], repair = false) {
  const { text } = await generateText({
    model: gateway(MODEL),
    prompt: [
      repair
        ? 'Repair an incomplete vocabulary scrub. Process EVERY source candidate below exactly once.'
        : 'Scrub this OCR page into a rigorous English vocabulary list with Korean translations.',
      '',
      'Return ONLY valid JSON in exactly this shape:',
      '{"words":[{"source":"walked","word":"walk","korean":"걷다","skip":false}]}',
      '',
      'Critical rules:',
      '- The candidate list was extracted deterministically from the OCR. Handle EVERY candidate exactly once.',
      '- source must exactly match one supplied candidate.',
      '- Set skip=true ONLY for genuine OCR corruption or a non-English fragment. Do not skip proper nouns or easy/common words.',
      '- word is the clean dictionary headword appropriate to the usage on this page.',
      '- Normalize ordinary inflections: plural nouns to singular, conjugated verbs to base form, regular comparative/superlative adjectives to base form.',
      '- Remove possessive endings when they are possessive, but do not damage contractions.',
      '- Preserve meaningful contractions and hyphenated lexical words.',
      '- Lowercase ordinary dictionary words; preserve normal capitalization for proper nouns.',
      '- korean must be concise, natural Korean for the meaning actually used on this page.',
      '- Do not invent vocabulary that is absent from the candidates.',
      '- Do not silently omit a candidate. If it is OCR garbage, return it with skip=true.',
      '',
      'SOURCE CANDIDATES:',
      JSON.stringify(candidates),
      '',
      'PAGE CONTEXT:',
      pageText,
    ].join('\n'),
  })

  return parseWords(text)
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
        const modelAccessDenied = /free tier users do not have access|upgrade to paid credits|model.*access/i.test(detail)
        return fail(
          scanId,
          stage,
          rateLimited ? 'VISION_RATE_LIMIT' : modelAccessDenied ? 'VISION_MODEL_ACCESS_DENIED' : 'VISION_REQUEST_FAILED',
          rateLimited
            ? 'OpenAI vision is busy. Try the scan again in a moment.'
            : modelAccessDenied
              ? 'This OpenAI vision model is not available on the current Vercel AI Gateway tier.'
              : 'OpenAI could not process the photo.',
          rateLimited ? 429 : modelAccessDenied ? 403 : 502,
          startedAt,
          error,
        )
      }

      if (!pageText || !/[A-Za-z]/.test(pageText)) {
        return fail(scanId, stage, 'NO_ENGLISH_TEXT', 'OpenAI did not detect readable English text in that photo.', 422, startedAt)
      }

      const candidates = extractCandidateWords(pageText)
      if (!candidates.length) {
        return fail(scanId, stage, 'NO_VOCAB_CANDIDATES', 'The page was read, but no clean English word candidates were found.', 422, startedAt)
      }

      log(scanId, stage, 'completed', {
        characters: pageText.length,
        candidates: candidates.length,
        elapsedMs: Date.now() - startedAt,
      })

      stage = 'vocab'
      log(scanId, stage, 'started', {
        candidates: candidates.length,
        batches: Math.ceil(candidates.length / VOCAB_BATCH_SIZE),
        model: MODEL,
      })

      const rawWords: RawWord[] = []
      try {
        for (const batch of chunks(candidates, VOCAB_BATCH_SIZE)) {
          const firstPass = await runVocabBatch(pageText, batch)
          rawWords.push(...firstPass)

          const handled = new Set(
            firstPass
              .map(item => String(item.source || '').toLocaleLowerCase('en'))
              .filter(Boolean),
          )
          const missing = batch.filter(candidate => !handled.has(candidate.toLocaleLowerCase('en')))

          if (missing.length) {
            log(scanId, stage, 'repair_batch', { missing: missing.length })
            const repaired = await runVocabBatch(pageText, missing, true)
            rawWords.push(...repaired)
          }
        }
      } catch (error) {
        const detail = cleanDetail(error)
        const rateLimited = /rate.?limit|429/i.test(detail)
        const modelAccessDenied = /free tier users do not have access|upgrade to paid credits|model.*access/i.test(detail)
        return fail(
          scanId,
          stage,
          rateLimited ? 'VOCAB_RATE_LIMIT' : modelAccessDenied ? 'VOCAB_MODEL_ACCESS_DENIED' : 'VOCAB_REQUEST_FAILED',
          rateLimited
            ? 'OpenAI translation is busy. Try again in a moment.'
            : modelAccessDenied
              ? 'This OpenAI model is not available on the current Vercel AI Gateway tier.'
              : 'The page was read, but the vocabulary scrub/translation step failed.',
          rateLimited ? 429 : modelAccessDenied ? 403 : 502,
          startedAt,
          error,
        )
      }

      stage = 'parse'
      const candidateKeys = new Set(candidates.map(item => item.toLocaleLowerCase('en')))
      const handledSources = new Set<string>()
      const merged = new Map<string, { word: string; meanings: Set<string> }>()
      let skipped = 0

      for (const entry of rawWords) {
        const source = String(entry.source || '').trim()
        const sourceKey = source.toLocaleLowerCase('en')
        if (!source || !candidateKeys.has(sourceKey)) continue
        handledSources.add(sourceKey)

        if (entry.skip) {
          skipped += 1
          continue
        }

        const word = cleanHeadword(String(entry.word || ''))
        const korean = String(entry.korean || '').trim()
        if (!word || !korean) continue
        if (!/^[A-Za-z]+(?:['-][A-Za-z]+)*$/.test(word)) continue

        const key = word.toLocaleLowerCase('en')
        const existing = merged.get(key)
        if (existing) {
          existing.meanings.add(korean)
        } else {
          merged.set(key, { word, meanings: new Set([korean]) })
        }
      }

      const unhandled = candidates.filter(candidate => !handledSources.has(candidate.toLocaleLowerCase('en')))
      if (unhandled.length) {
        log(scanId, stage, 'unhandled_candidates', {
          count: unhandled.length,
          examples: unhandled.slice(0, 12),
        })
      }

      const words: Word[] = [...merged.values()]
        .map(item => ({
          word: item.word,
          korean: [...item.meanings].join(' / '),
        }))
        .sort((a, b) => a.word.localeCompare(b.word, 'en', { sensitivity: 'base' }))

      if (!words.length) {
        return fail(scanId, stage, 'EMPTY_VOCAB', 'The page was read, but no vocabulary entries survived scrubbing.', 422, startedAt)
      }

      log(scanId, stage, 'completed', {
        candidates: candidates.length,
        handledCandidates: handledSources.size,
        skipped,
        unhandled: unhandled.length,
        finalWords: words.length,
        transcriptionCharacters: pageText.length,
        elapsedMs: Date.now() - startedAt,
      })

      return json({
        words,
        diagnostic: {
          scanId,
          stage: 'complete',
          code: unhandled.length ? 'OK_WITH_GAPS' : 'OK',
          model: MODEL,
          elapsedMs: Date.now() - startedAt,
          endpointVersion: ENDPOINT_VERSION,
          candidates: candidates.length,
          handledCandidates: handledSources.size,
          skipped,
          unhandled: unhandled.length,
          words: words.length,
          transcriptionCharacters: pageText.length,
        },
      })
    } catch (error) {
      return fail(scanId, stage, 'UNEXPECTED_SERVER_ERROR', 'The scanner hit an unexpected server error.', 500, startedAt, error)
    }
  },
}
