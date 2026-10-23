export function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

export function pins(request: Request) {
  return {
    lab: request.headers.get('x-lab-pin')?.trim() || '',
    brush: request.headers.get('x-brush-pin')?.trim() || '',
  }
}

export function cleanDetail(error: unknown) {
  return String(error instanceof Error ? error.message : error)
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/https:\/\/www\.googleapis\.com\/upload\/\S+/gi, '[upload-session]')
    .replace(/-----BEGIN[\s\S]*?-----END[^-]+-----/g, '[redacted]')
    .replace(/\s+/g, ' ')
    .slice(0, 500)
}

export function parseJson(text: string) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('Model did not return JSON.')
  return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>
}
