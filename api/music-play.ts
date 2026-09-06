const ALLOWED_HOSTS = new Set([
  'www.scottbuckley.com.au',
  'scottbuckley.com.au',
  'incompetech.com',
  'www.incompetech.com',
  'commons.wikimedia.org',
])

function text(body: string, status: number) {
  return new Response(body, { status, headers:{ 'Content-Type':'text/plain; charset=utf-8', 'Cache-Control':'no-store' } })
}

function decodeHtml(value: string) {
  return value.replace(/&amp;/g, '&').replace(/&#038;/g, '&').replace(/&#x26;/gi, '&')
}

async function resolveScott(source: URL) {
  const response = await fetch(source, { headers:{ 'User-Agent':'HOS-MusicDiscovery/1.2' } })
  if (!response.ok) throw new Error('Could not read the official track page.')
  const html = await response.text()
  const matches = [...html.matchAll(/href=["']([^"']+\.mp3(?:\?[^"']*)?)["']/gi)]
  if (!matches.length) throw new Error('No MP3 was published on the official track page.')
  return new URL(decodeHtml(matches[0][1]), source).toString()
}

async function resolveIncompetech(source: URL) {
  const isrc = source.searchParams.get('isrc')
  if (!isrc) throw new Error('The Incompetech track is missing its ISRC.')
  const response = await fetch('https://incompetech.com/music/royalty-free/pieces.json', {
    headers:{ 'User-Agent':'HOS-MusicDiscovery/1.2' },
  })
  if (!response.ok) throw new Error('Could not read the Incompetech catalog.')
  const pieces = await response.json() as Array<{ isrc?:string; filename?:string }>
  const piece = pieces.find(item => item.isrc === isrc)
  if (!piece?.filename) throw new Error('That Incompetech recording was not found.')
  return new URL(encodeURIComponent(piece.filename).replace(/%2F/gi, '/'), 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/').toString()
}

function resolveCommons(source: URL) {
  const prefix = '/wiki/File:'
  if (!source.pathname.startsWith(prefix)) throw new Error('That Commons page is not an audio file page.')
  const filename = decodeURIComponent(source.pathname.slice(prefix.length))
  return 'https://commons.wikimedia.org/wiki/Special:Redirect/file/' + encodeURIComponent(filename)
}

export default {
  async fetch(request: Request) {
    if (request.method !== 'GET') return text('Method not allowed.', 405)
    try {
      const requestUrl = new URL(request.url)
      const raw = requestUrl.searchParams.get('source')
      if (!raw) return text('Missing source.', 400)
      const source = new URL(raw)
      if (source.protocol !== 'https:' || !ALLOWED_HOSTS.has(source.hostname)) return text('Unsupported music source.', 400)

      let audioUrl = ''
      if (source.hostname.endsWith('scottbuckley.com.au')) audioUrl = await resolveScott(source)
      else if (source.hostname.endsWith('incompetech.com')) audioUrl = await resolveIncompetech(source)
      else if (source.hostname === 'commons.wikimedia.org') audioUrl = resolveCommons(source)
      else return text('This source does not have an in-app resolver yet.', 404)

      return new Response(null, {
        status:302,
        headers:{
          Location:audioUrl,
          'Cache-Control':'public, max-age=86400',
        },
      })
    } catch (error) {
      return text(error instanceof Error ? error.message : 'Could not resolve this recording.', 502)
    }
  },
}
