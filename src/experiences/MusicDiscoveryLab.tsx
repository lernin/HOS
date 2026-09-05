import { useMemo, useState } from 'react'
import './music-discovery-lab.css'

type Rating = 0 | 1 | 2 | 3
type Family = 'Classical' | 'Orchestral' | 'Ambient' | 'Jazz' | 'Piano' | 'Game'
type License = 'PD/CC0' | 'CC' | 'Verify track'
type Track = { id:string; composer:string; title:string; family:Family; mood:string; source:string; url:string; license:License; note?:string }
type Shelf = { name:string; best:string; license:string; url:string; tone:string }

const RATING_KEY = 'hos-music-discovery-ratings-v1'
const NOTE_KEY = 'hos-music-discovery-notes-v1'

const shelves: Shelf[] = [
  { name:'Musopen', best:'Classical performances', license:'Public domain / CC; verify exact recording', url:'https://musopen.org/music/', tone:'Large classical catalog' },
  { name:'Musopen Player', best:'Fast classical browsing', license:'Recording-specific', url:'https://player.musopen.org/', tone:'Top 100, playlists, composers' },
  { name:'Wikimedia Commons Music', best:'Reusable recordings', license:'Public domain / free license shown per file', url:'https://commons.wikimedia.org/wiki/Commons:Free_media_resources/Music', tone:'Strong licensing trail' },
  { name:'OpenGameArt — CC0 Fantasy', best:'Game ambience + orchestral', license:'CC0 collection', url:'https://opengameart.org/content/cc0-fantasy-music-sounds', tone:'Fantasy, forest, battle, atmospheric' },
  { name:'OpenGameArt — Orchestral & World', best:'Game-ready orchestral', license:'CC0', url:'https://opengameart.org/content/orchestral-and-world-music-pack', tone:'World/orchestral pack' },
  { name:'ccMixter', best:'Jazz, ambient, cinematic', license:'Creative Commons; check exact track', url:'https://ccmixter.org/', tone:'Large creator community' },
  { name:'dig.ccMixter', best:'Music for apps and games', license:'Creative Commons; attribution often required', url:'https://dig.ccmixter.org/', tone:'Search by style, BPM, instrument' },
  { name:'Free Music Archive', best:'Jazz, ambient, experimental', license:'Track-specific', url:'https://freemusicarchive.org/', tone:'Broad non-classical discovery' },
  { name:'Mutopia', best:'Scores + MIDI references', license:'Public-domain compositions / free editions', url:'https://www.mutopiaproject.org/', tone:'Useful later for structure' },
  { name:'Internet Archive Open Audio', best:'Deep digging', license:'Mixed — verify carefully', url:'https://archive.org/details/opensource_audio', tone:'Enormous but messy' },
]

const musopen = (q:string) => 'https://musopen.org/music/?q=' + encodeURIComponent(q)

const tracks: Track[] = [
  { id:'satie-gym1', composer:'Erik Satie', title:'Gymnopédie No. 1', family:'Piano', mood:'still · tender · strange', source:'Musopen', url:musopen('Erik Satie Gymnopedie No. 1'), license:'Verify track' },
  { id:'satie-gym3', composer:'Erik Satie', title:'Gymnopédie No. 3', family:'Piano', mood:'quiet · suspended · solemn', source:'Musopen', url:musopen('Erik Satie Gymnopedie No. 3'), license:'Verify track' },
  { id:'satie-gn1', composer:'Erik Satie', title:'Gnossienne No. 1', family:'Piano', mood:'mysterious · ancient · suspended', source:'Musopen', url:musopen('Erik Satie Gnossienne No. 1'), license:'Verify track' },
  { id:'debussy-clair', composer:'Claude Debussy', title:'Clair de lune', family:'Piano', mood:'luminous · dreamlike · flowing', source:'Musopen', url:musopen('Debussy Clair de lune'), license:'Verify track' },
  { id:'debussy-faun', composer:'Claude Debussy', title:"Prélude à l'après-midi d'un faune", family:'Orchestral', mood:'woodland · sensual · suspended', source:'Musopen', url:musopen('Debussy Prelude Faun'), license:'Verify track' },
  { id:'ravel-fairy', composer:'Maurice Ravel', title:"Ma mère l'Oye — Le jardin féerique", family:'Orchestral', mood:'wonder · radiance · enchanted', source:'Musopen', url:musopen('Ravel Mother Goose Fairy Garden'), license:'Verify track' },
  { id:'ravel-pavane', composer:'Maurice Ravel', title:'Pavane pour une infante défunte', family:'Orchestral', mood:'elegant · wistful · spacious', source:'Musopen', url:musopen('Ravel Pavane'), license:'Verify track' },
  { id:'faure-pavane', composer:'Gabriel Fauré', title:'Pavane, Op. 50', family:'Orchestral', mood:'poised · melancholic · elegant', source:'Musopen', url:musopen('Faure Pavane'), license:'Verify track' },
  { id:'faure-sicilienne', composer:'Gabriel Fauré', title:'Sicilienne, Op. 78', family:'Classical', mood:'gentle · nostalgic · flowing', source:'Musopen', url:musopen('Faure Sicilienne'), license:'Verify track' },
  { id:'grieg-morning', composer:'Edvard Grieg', title:'Peer Gynt — Morning Mood', family:'Orchestral', mood:'dawn · pastoral · open', source:'Musopen', url:musopen('Grieg Morning Mood'), license:'Verify track' },
  { id:'grieg-aase', composer:'Edvard Grieg', title:"Peer Gynt — Aase's Death", family:'Orchestral', mood:'grief · dignity · stillness', source:'Musopen', url:musopen('Grieg Aase Death'), license:'Verify track' },
  { id:'dvorak-largo', composer:'Antonín Dvořák', title:'New World Symphony — Largo', family:'Orchestral', mood:'vast · homesick · noble', source:'Musopen', url:musopen('Dvorak New World Largo'), license:'Verify track' },
  { id:'dvorak-serenade', composer:'Antonín Dvořák', title:'Serenade for Strings — Larghetto', family:'Orchestral', mood:'warm · affectionate · flowing', source:'Musopen', url:musopen('Dvorak Serenade Strings Larghetto'), license:'Verify track' },
  { id:'tchaik-nutcracker', composer:'Pyotr Ilyich Tchaikovsky', title:'The Nutcracker — Pas de deux', family:'Orchestral', mood:'grandeur · yearning · release', source:'Musopen', url:musopen('Tchaikovsky Nutcracker Pas de deux'), license:'Verify track' },
  { id:'tchaik-swan', composer:'Pyotr Ilyich Tchaikovsky', title:'Swan Lake — Scène', family:'Orchestral', mood:'tragic · romantic · iconic', source:'Musopen', url:musopen('Tchaikovsky Swan Lake Scene'), license:'Verify track' },
  { id:'saint-aquarium', composer:'Camille Saint-Saëns', title:'Carnival of the Animals — Aquarium', family:'Orchestral', mood:'shimmering · magical · underwater', source:'Musopen', url:musopen('Saint-Saens Aquarium'), license:'Verify track' },
  { id:'saint-swan', composer:'Camille Saint-Saëns', title:'Carnival of the Animals — The Swan', family:'Classical', mood:'grace · longing · lyrical', source:'Musopen', url:musopen('Saint-Saens Swan'), license:'Verify track' },
  { id:'bach-air', composer:'J. S. Bach', title:'Air on the G String', family:'Classical', mood:'serene · clear · timeless', source:'Musopen', url:musopen('Bach Air G String'), license:'Verify track' },
  { id:'bach-sheep', composer:'J. S. Bach', title:'Sheep May Safely Graze', family:'Classical', mood:'pastoral · safe · warm', source:'Musopen', url:musopen('Bach Sheep May Safely Graze'), license:'Verify track' },
  { id:'vivaldi-winter', composer:'Antonio Vivaldi', title:'Winter — II. Largo', family:'Classical', mood:'shelter · stillness · warmth', source:'Musopen', url:musopen('Vivaldi Winter Largo'), license:'Verify track' },
  { id:'mozart-clarinet', composer:'W. A. Mozart', title:'Clarinet Concerto — II. Adagio', family:'Orchestral', mood:'human · tender · clear', source:'Musopen', url:musopen('Mozart Clarinet Concerto Adagio'), license:'Verify track' },
  { id:'beethoven-pastoral', composer:'L. van Beethoven', title:'Symphony No. 6 — Scene by the Brook', family:'Orchestral', mood:'nature · ease · flowing', source:'Musopen', url:musopen('Beethoven Pastoral Scene Brook'), license:'Verify track' },
  { id:'mendelssohn-nocturne', composer:'Felix Mendelssohn', title:"A Midsummer Night's Dream — Nocturne", family:'Orchestral', mood:'night · horn · enchanted', source:'Musopen', url:musopen('Mendelssohn Midsummer Nocturne'), license:'Verify track' },
  { id:'brahms-s3', composer:'Johannes Brahms', title:'Symphony No. 3 — III. Poco allegretto', family:'Orchestral', mood:'autumn · longing · restraint', source:'Musopen', url:musopen('Brahms Symphony 3 Poco allegretto'), license:'Verify track' },
  { id:'smetana-moldau', composer:'Bedřich Smetana', title:'Má vlast — Vltava (The Moldau)', family:'Orchestral', mood:'river · journey · homeland', source:'Musopen', url:musopen('Smetana Moldau'), license:'Verify track' },
  { id:'rimsky-sea', composer:'Nikolai Rimsky-Korsakov', title:"Scheherazade — The Sea and Sinbad's Ship", family:'Orchestral', mood:'ocean · adventure · scale', source:'Musopen', url:musopen('Rimsky Korsakov Scheherazade Sea'), license:'Verify track' },
  { id:'sibelius-valse', composer:'Jean Sibelius', title:'Valse triste', family:'Orchestral', mood:'ghostly · elegant · fading', source:'Musopen', url:musopen('Sibelius Valse Triste'), license:'Verify track' },
  { id:'mahler-adagietto', composer:'Gustav Mahler', title:'Symphony No. 5 — Adagietto', family:'Orchestral', mood:'love · suspension · vastness', source:'Musopen', url:musopen('Mahler Adagietto'), license:'Verify track' },
  { id:'elgar-nimrod', composer:'Edward Elgar', title:'Enigma Variations — Nimrod', family:'Orchestral', mood:'dignity · friendship · ascent', source:'Musopen', url:musopen('Elgar Nimrod'), license:'Verify track' },
  { id:'oga-fantasy', composer:'OpenGameArt collection', title:'CC0 Fantasy Music & Sounds', family:'Game', mood:'forest · fantasy · battle · ambience', source:'OpenGameArt', url:'https://opengameart.org/content/cc0-fantasy-music-sounds', license:'PD/CC0', note:'Whole CC0 collection with fantasy and forest material.' },
  { id:'oga-world', composer:'Ragnar Random', title:'Orchestral and World Music Pack', family:'Game', mood:'orchestral · world · exploration', source:'OpenGameArt', url:'https://opengameart.org/content/orchestral-and-world-music-pack', license:'PD/CC0', note:'CC0 pack explicitly offered for reuse.' },
  { id:'ccmixter-ambient', composer:'ccMixter', title:'Ambient / cinematic hunt', family:'Ambient', mood:'atmosphere · texture · cinematic', source:'ccMixter', url:'https://dig.ccmixter.org/', license:'CC', note:'Search by style, BPM, and instrument. Check exact license.' },
  { id:'ccmixter-jazz', composer:'ccMixter', title:'Jazz / instrumental hunt', family:'Jazz', mood:'cool · human · groove', source:'ccMixter', url:'https://dig.ccmixter.org/', license:'CC', note:'Creative Commons hunting shelf for non-classical music.' },
  { id:'fma-jazz', composer:'Free Music Archive', title:'Jazz discovery shelf', family:'Jazz', mood:'jazz · lounge · acoustic · experimental', source:'FMA', url:'https://freemusicarchive.org/genre/Jazz/', license:'Verify track', note:'Large catalog. License varies by track.' },
  { id:'fma-ambient', composer:'Free Music Archive', title:'Ambient discovery shelf', family:'Ambient', mood:'ambient · drone · calm · cinematic', source:'FMA', url:'https://freemusicarchive.org/genre/Ambient_Electronic/', license:'Verify track', note:'Useful background textures; verify exact track before reuse.' },
]

function loadRatings(): Record<string, Rating> {
  try { return JSON.parse(localStorage.getItem(RATING_KEY) || '{}') as Record<string, Rating> } catch { return {} }
}
function loadNotes(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(NOTE_KEY) || '{}') as Record<string, string> } catch { return {} }
}

export function MusicDiscoveryLab({ onExit }: { onExit: () => void }) {
  const [ratings, setRatings] = useState<Record<string, Rating>>(loadRatings)
  const [notes, setNotes] = useState<Record<string, string>>(loadNotes)
  const [query, setQuery] = useState('')
  const [family, setFamily] = useState('All')
  const [license, setLicense] = useState('All')
  const [sort, setSort] = useState<'taste' | 'composer'>('taste')
  const [showSources, setShowSources] = useState(true)

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return tracks
      .filter(track => !q || [track.composer, track.title, track.family, track.mood, track.source].join(' ').toLowerCase().includes(q))
      .filter(track => family === 'All' || track.family === family)
      .filter(track => license === 'All' || track.license === license)
      .sort((a, b) => sort === 'composer'
        ? a.composer.localeCompare(b.composer) || a.title.localeCompare(b.title)
        : (ratings[b.id] ?? -1) - (ratings[a.id] ?? -1) || a.composer.localeCompare(b.composer))
  }, [query, family, license, sort, ratings])

  function rate(id: string, value: Rating) {
    const next = { ...ratings, [id]: value }
    setRatings(next)
    localStorage.setItem(RATING_KEY, JSON.stringify(next))
  }

  function saveNote(id: string, value: string) {
    const next = { ...notes, [id]: value }
    setNotes(next)
    localStorage.setItem(NOTE_KEY, JSON.stringify(next))
  }

  function exportTaste() {
    const payload = tracks
      .filter(track => ratings[track.id] !== undefined || notes[track.id])
      .map(track => ({ ...track, rating: ratings[track.id] ?? null, note: notes[track.id] ?? '' }))
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), tracks: payload }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'hos-music-taste.json'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const rated = tracks.filter(track => ratings[track.id] !== undefined).length
  const loved = tracks.filter(track => ratings[track.id] === 3).length

  return <main className="music-discovery">
    <header className="md-top">
      <button className="md-back" onClick={onExit}>← Lab</button>
      <div><span>HOS · EXPERIMENT</span><strong>Music Discovery Lab</strong></div>
      <button className="md-export" onClick={exportTaste}>Export</button>
    </header>

    <section className="md-hero">
      <div className="md-kicker">REAL MUSIC · GLOBAL HUNT</div>
      <h1>Find music worth keeping.</h1>
      <p>Listen on the original source, then tell me what you hate, tolerate, like, or love. We are learning your ear before composing anything.</p>
      <div className="md-stats"><span><b>{tracks.length}</b> hunt cards</span><span><b>{rated}</b> rated</span><span><b>{loved}</b> ★★★ loves</span></div>
    </section>

    <section className="md-license-note"><strong>License rule:</strong> PD/CC0 is easiest for a game. CC can be usable with attribution or other conditions. Verify track means we inspect that exact recording before putting it into HOS.</section>

    <section className="md-controls">
      <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search Satie, forest, jazz, wonder…" />
      <select value={family} onChange={e => setFamily(e.target.value)}>{['All','Classical','Orchestral','Ambient','Jazz','Piano','Game'].map(x => <option key={x}>{x}</option>)}</select>
      <select value={license} onChange={e => setLicense(e.target.value)}>{['All','PD/CC0','CC','Verify track'].map(x => <option key={x}>{x}</option>)}</select>
      <button onClick={() => setSort(sort === 'taste' ? 'composer' : 'taste')}>{sort === 'taste' ? 'Best first' : 'A–Z'}</button>
    </section>

    <section className="md-source-section">
      <button className="md-section-toggle" onClick={() => setShowSources(!showSources)}>
        <span><small>PLACES TO HUNT</small><strong>Open music repositories</strong></span><b>{showSources ? '−' : '+'}</b>
      </button>
      {showSources && <div className="md-source-grid">{shelves.map(source =>
        <a key={source.name} href={source.url} target="_blank" rel="noreferrer" className="md-source-card">
          <span>{source.best}</span><strong>{source.name}</strong><p>{source.tone}</p><small>{source.license}</small>
        </a>
      )}</div>}
    </section>

    <section className="md-list">
      {visible.map(track => {
        const current = ratings[track.id]
        return <article className={'md-track' + (current === 3 ? ' is-loved' : '')} key={track.id}>
          <div className="md-track-head">
            <div><span>{track.composer}</span><h2>{track.title}</h2></div>
            <a href={track.url} target="_blank" rel="noreferrer" className="md-listen">Listen ↗</a>
          </div>
          <div className="md-tags"><span>{track.family}</span><span>{track.mood}</span><span>{track.license}</span><span>{track.source}</span></div>
          {track.note && <p className="md-track-note">{track.note}</p>}
          <div className="md-rating"><small>YOUR VERDICT</small>{[0,1,2,3].map(value =>
            <button key={value} className={current === value ? 'selected' : ''} onClick={() => rate(track.id, value as Rating)}>{value === 0 ? 'No' : '★'.repeat(value)}</button>
          )}</div>
          <textarea value={notes[track.id] || ''} onChange={e => saveNote(track.id, e.target.value)} placeholder="Why? Beautiful strings, too cheesy, love the melody…" />
        </article>
      })}
      {!visible.length && <div className="md-empty">No matching music.</div>}
    </section>
  </main>
}
