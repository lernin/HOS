const ACCESS_PIN = '3476'

type Modality = 'Piano' | 'Orchestral' | 'Jazz' | 'Guitar' | 'Synth' | 'Ambient' | 'Game' | '8-bit'
type Emotion = 'Hearth' | 'Wonder' | 'Calling' | 'Adventure' | 'Guide' | 'Mystery' | 'Vastness' | 'Peril' | 'Homeward' | 'Triumph'
type DiscoveryStyle = 'Orchestral / Cinematic' | 'Piano / Minimal' | 'Jazz / Swing' | 'Guitar / Acoustic' | 'Ambient / Atmospheric' | 'Synth / Electronic' | 'Techno / Driving' | 'Dubstep / Heavy' | '8-bit / Chiptune' | 'Retro Game' | 'Funky / Groovy' | 'Playful / Whimsical' | 'Dark / Suspense' | 'Epic / Heroic' | 'World / Folk' | 'Soundscape / Texture'

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

type SearchRecipe = {
  style: DiscoveryStyle
  modality: Modality
  phrases: string[]
}

const styleRecipes: SearchRecipe[] = [
  { style:'Orchestral / Cinematic', modality:'Orchestral', phrases:['cinematic orchestral instrumental','beautiful symphonic film score','emotional orchestral soundtrack'] },
  { style:'Piano / Minimal', modality:'Piano', phrases:['minimal piano instrumental','gentle solo piano','modern neoclassical piano'] },
  { style:'Jazz / Swing', modality:'Jazz', phrases:['instrumental jazz','light swing jazz','atmospheric jazz instrumental'] },
  { style:'Guitar / Acoustic', modality:'Guitar', phrases:['acoustic guitar instrumental','fingerstyle guitar','warm guitar soundtrack'] },
  { style:'Ambient / Atmospheric', modality:'Ambient', phrases:['ambient atmospheric instrumental','cinematic ambient soundscape','dreamy background music'] },
  { style:'Synth / Electronic', modality:'Synth', phrases:['synth electronic instrumental','emotional synthesizer soundtrack','electronic ambient instrumental'] },
  { style:'Techno / Driving', modality:'Synth', phrases:['driving techno instrumental','melodic techno','energetic electronic game music'] },
  { style:'Dubstep / Heavy', modality:'Synth', phrases:['dubstep instrumental','cinematic bass electronic','heavy electronic game music'] },
  { style:'8-bit / Chiptune', modality:'8-bit', phrases:['8 bit chiptune game music','chiptune instrumental','retro pixel game soundtrack'] },
  { style:'Retro Game', modality:'Game', phrases:['retro video game music','arcade game soundtrack','classic game style instrumental'] },
  { style:'Funky / Groovy', modality:'Jazz', phrases:['funky groove instrumental','funk instrumental','groovy game music'] },
  { style:'Playful / Whimsical', modality:'Game', phrases:['playful whimsical instrumental','quirky game music','lighthearted adventure soundtrack'] },
  { style:'Dark / Suspense', modality:'Game', phrases:['dark suspense instrumental','mysterious tension soundtrack','stealth game ambient'] },
  { style:'Epic / Heroic', modality:'Orchestral', phrases:['epic heroic instrumental','victory orchestral soundtrack','cinematic adventure music'] },
  { style:'World / Folk', modality:'Game', phrases:['world folk instrumental','traditional acoustic adventure music','folk game soundtrack'] },
  { style:'Soundscape / Texture', modality:'Ambient', phrases:['cinematic soundscape texture','ambient drone atmosphere','environmental texture audio'] },
]

const emotionTerms: Record<Emotion, string[]> = {
  Hearth:['warm','intimate','gentle','home'],
  Wonder:['magical','luminous','awe','curious'],
  Calling:['awakening','anticipation','destiny','invitation'],
  Adventure:['exploration','journey','bold','moving'],
  Guide:['wise','calm','supportive','steady'],
  Mystery:['enigmatic','shadowy','curious','atmospheric'],
  Vastness:['spacious','cosmic','oceanic','expansive'],
  Peril:['tension','danger','urgent','suspense'],
  Homeward:['nostalgic','tender','returning','comforting'],
  Triumph:['victorious','uplifting','heroic','celebration'],
}

const classicalSeeds: Array<{ title:string; composer:string; styles:DiscoveryStyle[]; emotions:Emotion[] }> = [
  { title:'Gymnopédie No. 1', composer:'Erik Satie', styles:['Piano / Minimal','Ambient / Atmospheric'], emotions:['Hearth','Wonder','Homeward'] },
  { title:'Clair de lune', composer:'Claude Debussy', styles:['Piano / Minimal','Orchestral / Cinematic'], emotions:['Wonder','Mystery','Homeward'] },
  { title:'Pavane pour une infante défunte', composer:'Maurice Ravel', styles:['Piano / Minimal','Orchestral / Cinematic'], emotions:['Hearth','Mystery','Homeward'] },
  { title:'Morning Mood', composer:'Edvard Grieg', styles:['Orchestral / Cinematic'], emotions:['Hearth','Wonder','Calling'] },
  { title:'New World Symphony Largo', composer:'Antonín Dvořák', styles:['Orchestral / Cinematic'], emotions:['Vastness','Homeward','Adventure'] },
  { title:'Aquarium', composer:'Camille Saint-Saëns', styles:['Orchestral / Cinematic','Ambient / Atmospheric'], emotions:['Wonder','Mystery','Vastness'] },
  { title:'Air on the G String', composer:'J. S. Bach', styles:['Orchestral / Cinematic'], emotions:['Hearth','Guide','Homeward'] },
  { title:'Moonlight Sonata', composer:'Ludwig van Beethoven', styles:['Piano / Minimal'], emotions:['Mystery','Homeward','Peril'] },
  { title:'Nocturne Op. 9 No. 2', composer:'Frédéric Chopin', styles:['Piano / Minimal'], emotions:['Hearth','Wonder','Homeward'] },
  { title:'Liebestraum No. 3', composer:'Franz Liszt', styles:['Piano / Minimal'], emotions:['Wonder','Homeward','Triumph'] },
  { title:'Pavane', composer:'Gabriel Fauré', styles:['Orchestral / Cinematic'], emotions:['Hearth','Mystery','Homeward'] },
  { title:'Jupiter', composer:'Gustav Holst', styles:['Orchestral / Cinematic','Epic / Heroic'], emotions:['Vastness','Triumph','Adventure'] },
  { title:'Night on Bald Mountain', composer:'Modest Mussorgsky', styles:['Orchestral / Cinematic','Dark / Suspense'], emotions:['Peril','Mystery','Adventure'] },
  { title:'Scheherazade', composer:'Nikolai Rimsky-Korsakov', styles:['Orchestral / Cinematic'], emotions:['Adventure','Wonder','Mystery'] },
  { title:'Winter Largo', composer:'Antonio Vivaldi', styles:['Orchestral / Cinematic'], emotions:['Hearth','Homeward','Wonder'] },
  { title:'The Hebrides Overture', composer:'Felix Mendelssohn', styles:['Orchestral / Cinematic'], emotions:['Vastness','Adventure','Mystery'] },
  { title:'Canon in D', composer:'Johann Pachelbel', styles:['Orchestral / Cinematic'], emotions:['Hearth','Homeward','Triumph'] },
  { title:'Carmen Intermezzo', composer:'Georges Bizet', styles:['Orchestral / Cinematic'], emotions:['Hearth','Wonder','Homeward'] },
  { title:'Danse Macabre', composer:'Camille Saint-Saëns', styles:['Orchestral / Cinematic','Dark / Suspense'], emotions:['Mystery','Peril','Adventure'] },
  { title:'Peer Gynt Anitra’s Dance', composer:'Edvard Grieg', styles:['Orchestral / Cinematic','Playful / Whimsical'], emotions:['Adventure','Wonder','Calling'] },
]

const repositories = [
  { name:'Openverse', url:'https://openverse.org/', mode:'live', note:'Live API metasearch for openly licensed audio.' },
  { name:'Wikimedia', url:'https://commons.wikimedia.org/wiki/Category:Audio_files', mode:'indexed', note:'Openverse indexes Wikimedia Commons audio.' },
  { name:'Jamendo', url:'https://www.jamendo.com/', mode:'indexed', note:'Openverse indexes Jamendo audio.' },
  { name:'Freesound', url:'https://freesound.org/', mode:'indexed', note:'Openverse indexes Freesound audio.' },
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
  url.searchParams.set('page_size', '40')
  url.searchParams.set('page', String(page))
  const response = await fetch(url, { headers:{ 'User-Agent':'HOS-MusicDiscovery/1.1' } })
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

function pickSurprise(page: number) {
  const start = ((page - 1) * 5) % styleRecipes.length
  return Array.from({ length:8 }, (_, offset) => styleRecipes[(start + offset * 3) % styleRecipes.length])
}

function buildSearchPlan(styles: DiscoveryStyle[], emotions: Emotion[], custom: string, surprise: boolean, page: number) {
  const chosenRecipes = surprise || !styles.length
    ? pickSurprise(page)
    : styleRecipes.filter(recipe => styles.includes(recipe.style))
  const chosenEmotions = surprise || !emotions.length
    ? (['Hearth','Wonder','Adventure','Mystery','Vastness','Peril','Homeward','Triumph'] as Emotion[])
    : emotions

  const plan: Array<{ query:string; modality:Modality }> = []
  for (let index = 0; index < chosenRecipes.length; index++) {
    const recipe = chosenRecipes[index]
    const emotion = chosenEmotions[index % chosenEmotions.length]
    const phrase = recipe.phrases[(page + index) % recipe.phrases.length]
    const emotionalWord = emotionTerms[emotion][(page + index) % emotionTerms[emotion].length]
    plan.push({ query:[emotionalWord, phrase, 'instrumental'].join(' '), modality:recipe.modality })
  }

  const classicalMatches = classicalSeeds.filter(seed =>
    (surprise || !styles.length || seed.styles.some(style => styles.includes(style))) &&
    (surprise || !emotions.length || seed.emotions.some(emotion => emotions.includes(emotion)))
  ).slice(0, 4)
  for (const seed of classicalMatches) {
    const style = seed.styles.find(value => styles.includes(value)) || seed.styles[0]
    const recipe = styleRecipes.find(item => item.style === style) || styleRecipes[0]
    plan.push({ query:'"' + seed.title + '" ' + seed.composer, modality:recipe.modality })
  }

  if (custom) {
    const recipe = chosenRecipes[0] || styleRecipes[0]
    plan.unshift({ query:custom + ' instrumental music', modality:recipe.modality })
  }

  const seen = new Set<string>()
  return plan.filter(item => {
    const key = item.query.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 12)
}

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') return json({ error:'Method not allowed.' }, 405)
    if (request.headers.get('x-review-pin') !== ACCESS_PIN) return json({ error:'Unauthorized.' }, 401)

    try {
      const body = await request.json().catch(() => ({})) as { styles?: DiscoveryStyle[]; emotions?: Emotion[]; request?: string; page?: number; surprise?: boolean }
      const styles = (body.styles || []).filter(style => styleRecipes.some(recipe => recipe.style === style)).slice(0, 8)
      const emotions = (body.emotions || []).filter(emotion => emotion in emotionTerms).slice(0, 8)
      const custom = String(body.request || '').trim()
      const page = Math.max(1, Math.min(8, Number(body.page) || 1))
      const surprise = Boolean(body.surprise)

      const searchPlan = buildSearchPlan(styles, emotions, custom, surprise, page)
      const batches = await Promise.all(searchPlan.map(item => openverseSearch(item.query, item.modality, page)))
      const seen = new Set<string>()
      const items = batches.flat().filter(item => {
        const key = item.sourcePage || item.audioUrl
        if (seen.has(key)) return false
        seen.add(key)
        return true
      }).slice(0, 240)

      return json({
        items,
        repositories,
        queryPlan:searchPlan.map(item => item.query),
        styles,
        emotions,
        surprise,
        page,
        target:200,
        note:'The HOS search map is curated in code; Openverse supplies fresh playable candidates. Verify exact license metadata before bundling a keeper.',
      })
    } catch (error) {
      console.error('Music catalog failed', error)
      return json({ error:error instanceof Error ? error.message : 'Could not gather music catalog.' }, 500)
    }
  },
}
