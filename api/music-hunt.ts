const ACCESS_PIN = '3476'

type Modality = 'Piano' | 'Orchestral' | 'Jazz' | 'Guitar' | 'Synth' | 'Ambient' | 'Game' | '8-bit'

type HuntCandidate = {
  id: string
  performer: string
  license: string
  audioUrl: string
  sourcePage: string
  source: string
  evidence: string
  confidence: 'confirmed' | 'possible'
}

const modalityTerms: Record<Modality, string[]> = {
  Piano: ['piano', 'pianist'],
  Orchestral: ['orchestral', 'orchestra', 'symphonic'],
  Jazz: ['jazz'],
  Guitar: ['guitar', 'acoustic guitar'],
  Synth: ['synth', 'synthesizer', 'electronic'],
  Ambient: ['ambient', 'atmospheric'],
  Game: ['game soundtrack', 'video game', 'videogame'],
  '8-bit': ['8-bit', '8 bit', 'chiptune'],
}

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim()
}

function normalize(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function pieceTokens(title: string) {
  const stop = new Set(['the','a','an','of','in','on','for','and','op','no','number','suite','symphony'])
  return normalize(title).split(' ').filter(token => token.length > 1 && !stop.has(token))
}

function isPieceMatch(title: string, evidence: string, pieceTitle: string) {
  const target = pieceTokens(pieceTitle)
  if (!target.length) return true
  const haystack = normalize(title + ' ' + evidence)
  const hits = target.filter(token => haystack.includes(token)).length
  return hits >= Math.min(2, target.length)
}

function hasModalityEvidence(evidence: string, modality: Modality) {
  const haystack = normalize(evidence)
  return modalityTerms[modality].some(term => haystack.includes(normalize(term)))
}

function openLicense(value: string) {
  const normalized = value.toLowerCase()
  if (/\b(nc|nd)\b|noncommercial|no derivatives/.test(normalized)) return false
  return /public domain|cc0|creative commons attribution|cc by|attribution-sharealike|attribution share alike/.test(normalized)
}

function openverseLicense(value: string) {
  return ['cc0','pdm','by','by-sa'].includes(value.toLowerCase())
}

async function searchCommons(query: string, pieceTitle: string, modality: Modality): Promise<HuntCandidate[]> {
  const url = new URL('https://commons.wikimedia.org/w/api.php')
  url.searchParams.set('action', 'query')
  url.searchParams.set('format', 'json')
  url.searchParams.set('formatversion', '2')
  url.searchParams.set('generator', 'search')
  url.searchParams.set('gsrsearch', query)
  url.searchParams.set('gsrnamespace', '6')
  url.searchParams.set('gsrlimit', '25')
  url.searchParams.set('prop', 'imageinfo|categories')
  url.searchParams.set('iiprop', 'url|mime|mediatype|extmetadata')
  url.searchParams.set('iiextmetadatafilter', 'LicenseShortName|Artist|Credit|ObjectName')
  url.searchParams.set('cllimit', '20')

  const response = await fetch(url, { headers: { 'User-Agent': 'HOS-MusicDiscovery/1.0 (public-domain music research)' } })
  if (!response.ok) return []
  const data = await response.json() as {
    query?: { pages?: Array<{
      pageid?: number
      title?: string
      categories?: Array<{ title?: string }>
      imageinfo?: Array<{
        url?: string
        mime?: string
        mediatype?: string
        descriptionurl?: string
        extmetadata?: Record<string, { value?: string }>
      }>
    }> }
  }

  return (data.query?.pages || []).flatMap(page => {
    const info = page.imageinfo?.[0]
    if (!info?.url || !(info.mime || '').startsWith('audio/')) return []
    const license = stripHtml(info.extmetadata?.LicenseShortName?.value || '')
    if (!license || !openLicense(license)) return []
    const categories = (page.categories || []).map(category => category.title || '').join(' ')
    const artist = stripHtml(info.extmetadata?.Artist?.value || info.extmetadata?.Credit?.value || '')
    const evidence = [page.title || '', categories, artist, stripHtml(info.extmetadata?.ObjectName?.value || '')].join(' ')
    if (!isPieceMatch(page.title || '', evidence, pieceTitle)) return []
    const confidence = hasModalityEvidence(evidence, modality) ? 'confirmed' as const : 'possible' as const
    return [{
      id: 'commons:' + String(page.pageid || normalize(page.title || info.url)),
      performer: artist || 'Wikimedia Commons contributor',
      license,
      audioUrl: info.url,
      sourcePage: info.descriptionurl || 'https://commons.wikimedia.org/wiki/' + encodeURIComponent(page.title || ''),
      source: 'Wikimedia Commons',
      evidence,
      confidence,
    }]
  })
}

async function searchOpenverse(query: string, pieceTitle: string, modality: Modality): Promise<HuntCandidate[]> {
  const url = new URL('https://api.openverse.org/v1/audio/')
  url.searchParams.set('q', query)
  url.searchParams.set('page_size', '20')

  const response = await fetch(url, { headers: { 'User-Agent': 'HOS-MusicDiscovery/1.0' } })
  if (!response.ok) return []
  const data = await response.json() as {
    results?: Array<{
      id?: string
      title?: string
      creator?: string
      license?: string
      license_version?: string
      url?: string
      foreign_landing_url?: string
      genres?: string[]
      tags?: Array<{ name?: string }>
      source?: string
      provider?: string
    }>
  }

  return (data.results || []).flatMap(item => {
    if (!item.url || !item.foreign_landing_url || !item.license || !openverseLicense(item.license)) return []
    const evidence = [item.title || '', item.creator || '', ...(item.genres || []), ...(item.tags || []).map(tag => tag.name || '')].join(' ')
    if (!isPieceMatch(item.title || '', evidence, pieceTitle)) return []
    const confidence = hasModalityEvidence(evidence, modality) ? 'confirmed' as const : 'possible' as const
    const license = item.license.toUpperCase() + (item.license_version && item.license_version !== 'N/A' ? ' ' + item.license_version : '')
    return [{
      id: 'openverse:' + String(item.id || normalize(item.foreign_landing_url)),
      performer: item.creator || 'Unknown performer',
      license,
      audioUrl: item.url,
      sourcePage: item.foreign_landing_url,
      source: item.provider || item.source || 'Openverse',
      evidence,
      confidence,
    }]
  })
}

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
    if (request.headers.get('x-review-pin') !== ACCESS_PIN) return json({ error: 'Unauthorized.' }, 401)

    try {
      const body = await request.json() as { title?: string; composer?: string; modality?: Modality; exclude?: string[] }
      const title = String(body.title || '').trim()
      const composer = String(body.composer || '').trim()
      const modality = body.modality
      if (!title || !modality || !modalityTerms[modality]) return json({ error: 'Missing piece title or modality.' }, 400)

      const terms = modalityTerms[modality].slice(0, 2)
      const base = '"' + title + '" ' + (composer ? composer : '')
      const queries = [base, ...terms.map(term => base + ' ' + term)]
      const searches = await Promise.all(queries.flatMap(query => [
        searchCommons(query, title, modality),
        searchOpenverse(query, title, modality),
      ]))
      const excluded = new Set((body.exclude || []).map(String))
      const seen = new Set<string>()
      const candidates = searches.flat().filter(candidate => {
        if (excluded.has(candidate.sourcePage)) return false
        const key = candidate.sourcePage || candidate.audioUrl
        if (seen.has(key)) return false
        seen.add(key)
        return true
      }).sort((a, b) => (a.confidence === 'confirmed' ? -1 : 1) - (b.confidence === 'confirmed' ? -1 : 1)).slice(0, 12)

      return json({
        candidates,
        searched: ['Wikimedia Commons', 'Openverse'],
        queryCount: queries.length,
        note: 'License metadata is discovery evidence only; verify the exact source page before public bundling.',
      })
    } catch (error) {
      console.error('Music hunt failed', error)
      return json({ error: error instanceof Error ? error.message : 'Music search failed.' }, 500)
    }
  },
}
