import { generateText } from 'ai'

const ACCESS_PIN = '3476'

type Candidate = { atomonym_id: string; nemonym: string }

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

function parseJson(text: string) {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('Model did not return JSON.')
  return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
}

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
    if (request.headers.get('x-review-pin') !== ACCESS_PIN) return json({ error: 'Unauthorized.' }, 401)

    try {
      const body = await request.json() as { definition?: string; pos?: string | null; candidates?: Candidate[] }
      const definition = String(body.definition || '').trim()
      const candidates = (body.candidates || []).filter(c => c.atomonym_id && c.nemonym).slice(0, 12)
      if (!definition || !candidates.length) return json({ error: 'Missing definition or candidates.' }, 400)

      const prompt = `You are helping curate a child-friendly lexical database derived from WordNet.

Pleuronym definition: ${definition}
Part of speech: ${body.pos || 'unknown'}
Candidate Atomonyms:
${candidates.map(c => `- ${c.atomonym_id}: ${c.nemonym}`).join('\n')}

Return ONLY valid JSON in exactly this shape:
{
  "examples": [
    {"atomonym_id":"UUID","sentences":["sentence 1","sentence 2"]}
  ],
  "ai_status":"good|unclear|problematic|archaic|needs_investigation",
  "ai_note":"one or two short sentences"
}

Rules:
- Create exactly 2 short, natural example sentences for EACH candidate.
- Each sentence must demonstrate this exact definition/sense, not another sense of the spelling.
- Prefer ordinary contemporary English suitable for understanding the sense.
- If the WordNet definition is archaic, malformed, confusing, or does not fit the candidates, say so in ai_status/ai_note.
- Do not invent a new candidate or alter an atomonym_id.`

      const { text } = await generateText({ model: 'openai/gpt-5.6-sol', prompt })
      const parsed = parseJson(text)
      return json(parsed)
    } catch (error) {
      console.error('Ekpronym enrichment failed', error)
      return json({ error: 'Could not generate examples right now.' }, 500)
    }
  },
}
