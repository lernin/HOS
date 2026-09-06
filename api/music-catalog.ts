const ACCESS_PIN = '3476'

type Modality = 'Piano' | 'Orchestral' | 'Jazz' | 'Guitar' | 'Synth' | 'Ambient' | 'Game' | '8-bit'
type CatalogItem = {
  id: string
  title: string
  creator: string
  modality: Modality
  license: string
  audioUrl: string
  sourcePage: string
  source: string
}

const seeds: Array<{ query: string; modality: Modality }> = [
  { query:'ambient game music instrumental', modality:'Ambient' },
  { query:'cinematic orchestral instrumental', modality:'Orchestral' },
  { query:'synth electronic instrumental', modality:'Synth' },
  { query:'chiptune 8 bit game music', modality:'8-bit' },
  { query:'video game soundtrack instrumental', modality:'Game' },
  { query:'jazz instrumental', modality:'Jazz' },
  { query:'guitar instrumental', modality:'Guitar' },
  { query:'piano instrumental', modality:'Piano' },
]

const repositories = [
  { name:'Openverse', url:'https://openverse.org/', mode:'live', note:'Live API metasearch for openly licensed audio.' },
  { name:'Wikimedia', url:'https://commons.wikimedia.org/wiki/Category:Audio_files', mode:'live', note:'Live Commons API search with file/license metadata.' },
  { name:'Jamendo', url:'https://www.jamendo.com/', mode:'indexed', note:'Indexed in Openverse audio search.' },
  { name:'Freesound', url:'https://freesound.org/', mode:'indexed', note:'Indexed in Openverse; filtered toward longer music-like audio.' },
  { name:'ccMixter', url:'https://ccmixter.org/', mode:'portal', note:'Public Creative Commons music library with its own query API.' },
  { name:'Internet Archive', url:'https://archive.org/details/audio', mode:'portal', note:'Large audio archive; licensing varies by item.' },
  { name:'OpenGameArt', url:'https://opengameart.org/art-search-advanced?field_art_type_tid%5B%5D=12', mode:'portal', note:'Game-focused music with per-item licenses.' },
  { name:'Musopen', url:'https://musopen.org/music/', mode:'portal', note:'Classical composition/performance discovery; verify exact recording rights.' },
  { name:'Incompetech', url:'https://incompetech.com/music/royalty-free/music.html', mode:'portal', note:'Kevin MacLeod library; Creative Commons options available.' },
  { name:'Scott Buckley', url:'https://www.scottbuckley.com.au/library/', mode:'portal', note:'Cinematic/game-friendly CC BY 4.0 library.' },
] as const

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers:{ 'Cache-Control':'no-store' } })
}

function openverseLicense(value: string) {
  return ['cc0','pdm','by','by-sa'].includes(value.toLowerCase())
}

function licenseLabel(value: string, version?: string) {
  return value.toUpperCase() + (version && version !== 'N/A' ? ' ' + version : '')
}

async function openverseSearch(query: string, modality: Modality, page: number): Promise<CatalogItem[]> {
  const url = new URL('https://api.openverse.org/v1/audio/')
  url.searchParams.set('q', query)
  url.searchParams.set('page_size', '50')
  url.searchParams.set('page', String(page))
  const response = await fetch(url, { headers:{ 'User-Agent':'HOS-MusicDiscovery/1.0' } })
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
      provider?: string
      source?: string
      category?: string
      duration?: number
    }>
  }

  return (data.results || []).flatMap(item => {
    if (!item.id || !item.title || !item.url || !item.foreign_landing_url || !item.license || !openverseLicense(item.license)) return []
    if (item.category && item.category !== 'music') return []
    if (item.duration && item.duration < 45_000) return []
    return [{
      id:'openverse:' + item.id,
      title:item.title.trim(),
      creator:(item.creator || 'Unknown artist').trim(),
      modality,
      license:licenseLabel(item.license, item.license_version),
      audioUrl:item.url,
      sourcePage:item.foreign_landing_url,
      source:item.provider || item.source || 'Openverse',
    }]
  })
}

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') return json({ error:'Method not allowed.' }, 405)
    if (request.headers.get('x-review-pin') !== ACCESS_PIN) return json({ error:'Unauthorized.' }, 401)

    try {
      const body = await request.json().catch(() => ({})) as { interests?: string[]; request?: string; page?: number }
      const custom = String(body.request || '').trim()
      const page = Math.max(1, Math.min(8, Number(body.page) || 1))
      const interestList = (body.interests || []).filter(Boolean).slice(0, 4)

      const inferModality = (value: string): Modality => {
        const text = value.toLowerCase()
        if (text.includes('orchestr')) return 'Orchestral'
        if (text.includes('ambient')) return 'Ambient'
        if (text.includes('jazz')) return 'Jazz'
        if (text.includes('guitar')) return 'Guitar'
        if (text.includes('synth') || text.includes('electronic')) return 'Synth'
        if (text.includes('8-bit') || text.includes('chiptune')) return '8-bit'
        if (text.includes('piano')) return 'Piano'
        return 'Game'
      }

      const personalized = interestList.map(interest => ({ query:interest + ' instrumental music', modality:inferModality(interest) }))
      if (custom) personalized.unshift({ query:custom + ' instrumental music', modality:inferModality(custom) })

      const allSeeds = [...personalized, ...seeds]
      const dedupedSeeds = allSeeds.filter((seed, index, list) => list.findIndex(other => other.query.toLowerCase() === seed.query.toLowerCase()) === index).slice(0, 10)
      const batches = await Promise.all(dedupedSeeds.map(seed => openverseSearch(seed.query, seed.modality, page)))
      const seen = new Set<string>()
      const items = batches.flat().filter(item => {
        const key = item.sourcePage || item.audioUrl
        if (seen.has(key)) return false
        seen.add(key)
        return true
      }).slice(0, 220)

      return json({
        items,
        repositories,
        target:200,
        page,
        note:'Catalog results are for auditioning. Verify the exact source-page license before bundling a keeper into HOS.',
      })
    } catch (error) {
      console.error('Music catalog failed', error)
      return json({ error:error instanceof Error ? error.message : 'Could not gather music catalog.' }, 500)
    }
  },
}
