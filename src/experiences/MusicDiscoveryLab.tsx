import { useEffect, useMemo, useRef, useState } from 'react'
import './music-discovery-lab.css'

type Rating = 0 | 1 | 2 | 3
type Track = {
  id: string
  composer: string
  title: string
  family: 'Classical' | 'Orchestral' | 'Piano'
  mood: string
  license: string
  file: string
  sourcePage: string
}

const RATING_KEY = 'hos-music-discovery-ratings-v2'
const NOTE_KEY = 'hos-music-discovery-notes-v2'
const commonsAudio = (file: string) => 'https://commons.wikimedia.org/wiki/Special:Redirect/file/' + encodeURIComponent(file)

const tracks: Track[] = [
  { id:'satie-gym1', composer:'Erik Satie', title:'Gymnopédie No. 1', family:'Piano', mood:'still · tender · strange', license:'CC0', file:'Gymnopedie No. 1..ogg', sourcePage:'https://commons.wikimedia.org/wiki/File:Gymnopedie_No._1..ogg' },
  { id:'debussy-clair', composer:'Claude Debussy', title:'Clair de lune', family:'Piano', mood:'luminous · dreamlike · flowing', license:'CC BY 3.0', file:'Clair de lune (Claude Debussy) Suite bergamasque.ogg', sourcePage:'https://commons.wikimedia.org/wiki/File:Clair_de_lune_(Claude_Debussy)_Suite_bergamasque.ogg' },
  { id:'ravel-pavane', composer:'Maurice Ravel', title:'Pavane pour une infante défunte', family:'Piano', mood:'elegant · wistful · spacious', license:'Public domain', file:'Maurice Ravel - Pavane pour une infante défunte.ogg', sourcePage:'https://commons.wikimedia.org/wiki/File:Maurice_Ravel_-_Pavane_pour_une_infante_défunte.ogg' },
  { id:'grieg-morning', composer:'Edvard Grieg', title:'Peer Gynt — Morning Mood', family:'Orchestral', mood:'dawn · pastoral · open', license:'Public domain worldwide', file:'Musopen - Morning.ogg', sourcePage:'https://commons.wikimedia.org/wiki/File:Musopen_-_Morning.ogg' },
  { id:'grieg-aase', composer:'Edvard Grieg', title:"Peer Gynt — Aase's Death", family:'Orchestral', mood:'grief · dignity · stillness', license:'CC0', file:"Peer Gynt Suite No. 1, Op. 46 - II. Aase's Death.ogg", sourcePage:"https://commons.wikimedia.org/wiki/File:Peer_Gynt_Suite_No._1,_Op._46_-_II._Aase%27s_Death.ogg" },
  { id:'grieg-anitra', composer:'Edvard Grieg', title:"Peer Gynt — Anitra's Dance", family:'Orchestral', mood:'light · poised · dancing', license:'Commons reusable recording', file:"Grieg, Peer Gynt Suite No. 1, Op. 46 - III. Anitra's Dance.ogg", sourcePage:"https://commons.wikimedia.org/wiki/File:Grieg,_Peer_Gynt_Suite_No._1,_Op._46_-_III._Anitra%27s_Dance.ogg" },
  { id:'dvorak-largo', composer:'Antonín Dvořák', title:'New World Symphony — II. Largo', family:'Orchestral', mood:'vast · homesick · noble', license:'Musopen / Commons', file:"Antonin Dvorak - symphony no. 9 in e minor 'from the new world', op. 95 - ii. largo.ogg", sourcePage:"https://commons.wikimedia.org/wiki/File:Antonin_Dvorak_-_symphony_no._9_in_e_minor_%27from_the_new_world%27,_op._95_-_ii._largo.ogg" },
  { id:'saint-aquarium', composer:'Camille Saint-Saëns', title:'Carnival of the Animals — Aquarium', family:'Orchestral', mood:'shimmering · magical · underwater', license:'CC BY-SA 2.0', file:'Saint-Saens - The Carnival of the Animals - 07 Aquarium.ogg', sourcePage:'https://commons.wikimedia.org/wiki/File:Saint-Saens_-_The_Carnival_of_the_Animals_-_07_Aquarium.ogg' },
  { id:'tchaik-swan', composer:'Pyotr Ilyich Tchaikovsky', title:'Swan Lake — Scène, Op. 20 No. 10', family:'Orchestral', mood:'tragic · romantic · iconic', license:'Public-domain historical recording', file:'Tchaikovsky Swan Lake Op.20 No.10. Scène.ogg', sourcePage:'https://commons.wikimedia.org/wiki/File:Tchaikovsky_Swan_Lake_Op.20_No.10._Scène.ogg' },
  { id:'bach-air', composer:'J. S. Bach', title:'Air on the G String', family:'Classical', mood:'serene · clear · timeless', license:'Public-domain historical recording', file:'Air (Bach).ogg', sourcePage:'https://commons.wikimedia.org/wiki/File:Air_(Bach).ogg' },
]

function readRatings(): Record<string, Rating> {
  try { return JSON.parse(localStorage.getItem(RATING_KEY) || '{}') as Record<string, Rating> } catch { return {} }
}
function readNotes(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(NOTE_KEY) || '{}') as Record<string, string> } catch { return {} }
}
function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const minutes = Math.floor(seconds / 60)
  const rest = Math.floor(seconds % 60).toString().padStart(2, '0')
  return minutes + ':' + rest
}

export function MusicDiscoveryLab({ onExit }: { onExit: () => void }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [ratings, setRatings] = useState<Record<string, Rating>>(readRatings)
  const [notes, setNotes] = useState<Record<string, string>>(readNotes)
  const [selectedId, setSelectedId] = useState(tracks[0].id)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'All' | 'Orchestral' | 'Piano' | 'Classical' | 'Loved' | 'Unrated'>('All')
  const [message, setMessage] = useState('')

  const selectedIndex = tracks.findIndex(track => track.id === selectedId)
  const selected = tracks[selectedIndex] || tracks[0]

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return tracks
      .filter(track => !q || [track.composer, track.title, track.mood, track.family].join(' ').toLowerCase().includes(q))
      .filter(track => {
        if (filter === 'All') return true
        if (filter === 'Loved') return ratings[track.id] === 3
        if (filter === 'Unrated') return ratings[track.id] === undefined
        return track.family === filter
      })
      .sort((a, b) => (ratings[b.id] ?? -1) - (ratings[a.id] ?? -1))
  }, [query, filter, ratings])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const update = () => setCurrentTime(audio.currentTime || 0)
    const metadata = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0)
    const ended = () => setPlaying(false)
    const error = () => {
      setPlaying(false)
      setMessage('This recording did not load. Open Source / license and I can replace the stream if needed.')
    }
    audio.addEventListener('timeupdate', update)
    audio.addEventListener('loadedmetadata', metadata)
    audio.addEventListener('durationchange', metadata)
    audio.addEventListener('ended', ended)
    audio.addEventListener('error', error)
    return () => {
      audio.removeEventListener('timeupdate', update)
      audio.removeEventListener('loadedmetadata', metadata)
      audio.removeEventListener('durationchange', metadata)
      audio.removeEventListener('ended', ended)
      audio.removeEventListener('error', error)
    }
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.pause()
    audio.src = commonsAudio(selected.file)
    audio.load()
    setPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    setMessage('')
  }, [selected.id])

  async function togglePlay() {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      try {
        await audio.play()
        setPlaying(true)
        setMessage('')
      } catch {
        setMessage('Playback was blocked. Tap Play again.')
      }
    } else {
      audio.pause()
      setPlaying(false)
    }
  }

  function stop() {
    const audio = audioRef.current
    if (!audio) return
    audio.pause()
    audio.currentTime = 0
    setPlaying(false)
    setCurrentTime(0)
  }

  function seek(value: number) {
    const audio = audioRef.current
    if (!audio || !Number.isFinite(value)) return
    audio.currentTime = value
    setCurrentTime(value)
  }

  function step(delta: number) {
    const next = Math.max(0, Math.min(tracks.length - 1, selectedIndex + delta))
    setSelectedId(tracks[next].id)
  }

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

  const ratedCount = tracks.filter(track => ratings[track.id] !== undefined).length
  const loveCount = tracks.filter(track => ratings[track.id] === 3).length

  return <main className="music-discovery">
    <audio ref={audioRef} preload="metadata" />

    <header className="md-top">
      <button className="md-back" onClick={onExit}>← Lab</button>
      <div><span>HOS · EXPERIMENT</span><strong>Music Discovery Lab</strong></div>
      <div className="md-count">{ratedCount}/{tracks.length}</div>
    </header>

    <section className="md-hero">
      <div className="md-kicker">REAL RECORDINGS · RATE AS YOU LISTEN</div>
      <h1>Play it here. Judge it here.</h1>
      <p>No hunting around in another website. Choose a recording, play or pause it, scrub anywhere in the piece, then give it 0–3.</p>
    </section>

    <section className="md-player">
      <div className="md-now">
        <div>
          <span>{selected.composer}</span>
          <h2>{selected.title}</h2>
          <p>{selected.mood}</p>
        </div>
        <a href={selected.sourcePage} target="_blank" rel="noreferrer">Source / license ↗</a>
      </div>

      <div className="md-transport">
        <button onClick={() => step(-1)} disabled={selectedIndex === 0}>‹</button>
        <button className="md-play" onClick={togglePlay}>{playing ? '❚❚ Pause' : '▶ Play'}</button>
        <button onClick={stop}>■ Stop</button>
        <button onClick={() => step(1)} disabled={selectedIndex === tracks.length - 1}>›</button>
      </div>

      <div className="md-scrub">
        <span>{formatTime(currentTime)}</span>
        <input type="range" min="0" max={Math.max(duration, 0)} step="0.1" value={Math.min(currentTime, Math.max(duration, 0))} onChange={event => seek(Number(event.target.value))} />
        <span>{formatTime(duration)}</span>
      </div>

      <div className="md-license">{selected.license}</div>

      <div className="md-big-rating">
        <button className={ratings[selected.id] === 0 ? 'selected' : ''} onClick={() => rate(selected.id, 0)}><b>0</b><span>Hate it</span></button>
        <button className={ratings[selected.id] === 1 ? 'selected' : ''} onClick={() => rate(selected.id, 1)}><b>1</b><span>Mildly</span></button>
        <button className={ratings[selected.id] === 2 ? 'selected' : ''} onClick={() => rate(selected.id, 2)}><b>2</b><span>Good</span></button>
        <button className={ratings[selected.id] === 3 ? 'selected' : ''} onClick={() => rate(selected.id, 3)}><b>3</b><span>Love it</span></button>
      </div>

      <textarea value={notes[selected.id] || ''} onChange={event => saveNote(selected.id, event.target.value)} placeholder="What did you like or hate? Melody, strings, harmony, mood, pacing…" />
      {message && <div className="md-message">{message}</div>}
    </section>

    <section className="md-toolbar">
      <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search…" />
      <select value={filter} onChange={event => setFilter(event.target.value as typeof filter)}>
        {['All','Orchestral','Piano','Classical','Loved','Unrated'].map(item => <option key={item}>{item}</option>)}
      </select>
    </section>

    <section className="md-list">
      {visible.map(track => {
        const rating = ratings[track.id]
        return <button key={track.id} className={'md-track' + (selected.id === track.id ? ' active' : '') + (rating === 3 ? ' loved' : '')} onClick={() => setSelectedId(track.id)}>
          <span className="md-track-index">{tracks.findIndex(item => item.id === track.id) + 1}</span>
          <span className="md-track-copy"><small>{track.composer} · {track.family}</small><strong>{track.title}</strong><em>{track.mood}</em></span>
          <span className="md-track-rating">{rating === undefined ? '—' : rating === 0 ? '0' : '★'.repeat(rating)}</span>
        </button>
      })}
    </section>

    <section className="md-about">
      <strong>Current playable catalog</strong>
      <p>{tracks.length} direct recordings streamed from Wikimedia Commons. I can keep adding verified classical, game-ambient, and jazz recordings to this queue.</p>
      <div><b>{loveCount}</b> tracks currently marked Love it.</div>
    </section>
  </main>
}
