const ACCESS_PIN = '3476'
const SUPABASE_URL = 'https://jzaghifuhinkzzhiojre.supabase.co'
const SUPABASE_KEY = 'sb_publishable_rQDzA5bYlbzvaTjyo-uTXw_LiiIAddI'

const ALLOWED = new Set([
  'logiq_map_list',
  'logiq_map_save',
  'logiq_map_delete',
  'lab_thekonym_read',
])

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') return json({ message: 'Method not allowed.' }, 405)

    let payload: { name?: unknown; args?: unknown }
    try {
      const parsed: unknown = JSON.parse(await request.text())
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return json({ message: 'Invalid request.' }, 400)
      payload = parsed as { name?: unknown; args?: unknown }
    } catch (_error) {
      return json({ message: 'Invalid request.' }, 400)
    }

    const name = typeof payload?.name === 'string' ? payload.name : ''
    if (!ALLOWED.has(name)) return json({ message: 'Unknown request.' }, 400)

    const args = payload.args && typeof payload.args === 'object' && !Array.isArray(payload.args)
      ? { ...(payload.args as Record<string, unknown>) }
      : {}
    delete args.pin
    args.pin = ACCESS_PIN

    let response: Response
    try {
      response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(args),
        cache: 'no-store',
      })
    } catch (_error) {
      return json({ message: 'Network unavailable' }, 503)
    }

    const text = await response.text()
    return new Response(text, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/json',
        'Cache-Control': 'no-store',
      },
    })
  },
}
