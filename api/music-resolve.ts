const ACCESS_PIN = '3476'

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers:{ 'Cache-Control':'no-store' } })
}

function decodeHtml(value: string) {
  return value.replace(/&amp;/g,'&').replace(/&#038;/g,'&').replace(/&#x2F;/g,'/').replace(/&#47;/g,'/')
}

function firstMp3(html: string, base: string) {
  const decoded = decodeHtml(html).replace(/\\\//g,'/')
  const matches = [
    ...decoded.matchAll(/(?:href|src)=["']([^"']+\.mp3(?:\?[^"']*)?)["']/gi),
    ...decoded.matchAll(/(https?:\/\/[^"'\s<>]+\.mp3(?:\?[^"'\s<>]*)?)/gi),
  ]
  for (const match of matches) {
    const value = match[1]
    if (!value) continue
    try { return new URL(value, base).toString() } catch {}
  }
  return ''
}

async function resolveScott(sourceUrl: string) {
  const response = await fetch(sourceUrl, { headers:{ 'User-Agent':'HOS-MusicDiscovery/1.0' } })
  if (!response.ok) return ''
  return firstMp3(await response.text(), sourceUrl)
}

async function resolveFreesound(sourceUrl: string) {
  try {
    const response = await fetch(sourceUrl, { headers:{ 'User-Agent':'HOS-MusicDiscovery/1.0' } })
    if (!response.ok) return ''
    const audioUrl = firstMp3(await response.text(), sourceUrl)
    return /cdn\.freesound\.org\/previews\//i.test(audioUrl) ? audioUrl : ''
  } catch { return '' }
}

async function resolveIncompetech(title: string, sourceUrl: string) {
  const cleanTitle = title.replace(/\s*\([^)]*version[^)]*\)\s*$/i,'').trim()
  const direct = 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/' + encodeURIComponent(cleanTitle) + '.mp3'
  try {
    const head = await fetch(direct, { method:'HEAD', redirect:'follow', headers:{ 'User-Agent':'HOS-MusicDiscovery/1.0' } })
    if (head.ok) return direct
  } catch {}
  try {
    const page = await fetch(sourceUrl, { headers:{ 'User-Agent':'HOS-MusicDiscovery/1.0' } })
    if (!page.ok) return ''
    return firstMp3(await page.text(), sourceUrl)
  } catch { return '' }
}

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') return json({ error:'Method not allowed.' }, 405)
    if (request.headers.get('x-review-pin') !== ACCESS_PIN) return json({ error:'Unauthorized.' }, 401)
    try {
      const body = await request.json().catch(() => ({})) as { sourceUrl?:string; sourceName?:string; title?:string }
      const sourceUrl = String(body.sourceUrl || '').trim()
      const sourceName = String(body.sourceName || '').trim()
      const title = String(body.title || '').trim()
      if (!sourceUrl) return json({ error:'Missing source URL.' }, 400)

      let audioUrl = ''
      if (/scott buckley/i.test(sourceName) || /scottbuckley\.com\.au/i.test(sourceUrl)) {
        audioUrl = await resolveScott(sourceUrl)
      } else if (/incompetech/i.test(sourceName) || /incompetech\.com/i.test(sourceUrl)) {
        audioUrl = await resolveIncompetech(title, sourceUrl)
      } else if (/freesound/i.test(sourceName) || /freesound\.org/i.test(sourceUrl)) {
        audioUrl = await resolveFreesound(sourceUrl)
      }

      if (!audioUrl) return json({ error:'Could not find a playable file for this track yet.' }, 404)
      return json({ audioUrl })
    } catch (error) {
      return json({ error:error instanceof Error ? error.message : 'Could not resolve recording.' }, 500)
    }
  },
}
