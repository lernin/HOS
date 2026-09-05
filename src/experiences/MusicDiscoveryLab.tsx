import { useEffect, useMemo, useRef, useState } from 'react'
import { startRecordingSession, type RecordingSession } from '../lib/voiceCapture'
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
  interests: string[]
}

const RATING_KEY = 'hos-music-discovery-ratings-v3'
const NOTE_KEY = 'hos-music-discovery-notes-v3'
const QUALITY_KEY = 'hos-music-discovery-quality-v1'
const VARIANT_KEY = 'hos-music-discovery-variants-v1'
const INTEREST_KEY = 'hos-music-discovery-interests-v1'
const REQUEST_KEY = 'hos-music-discovery-request-v1'
const commonsAudio = (file: string) => 'https://commons.wikimedia.org/wiki/Special:Redirect/file/' + encodeURIComponent(file)

const variantOptions = ['Orchestral','Guitar','Jazz','Ambient','Synth pads','8-bit / chiptune','Electronic / dubstep','Chamber','Piano']

const interestOptions = [
  'Beautiful orchestral','Ambient game','Jazz','Guitar','Synth pads',
  '8-bit / chiptune','Electronic / dubstep','Cinematic','Piano','Strange / experimental'
]

const tracks: Track[] = [
  { id:'satie-gym1', composer:'Erik Satie · Kevin MacLeod', title:'Gymnopédie No. 1', family:'Piano', mood:'still · tender · beautiful', license:'CC BY 3.0 · 320 kbps MP3', file:'Gymnopedie No. 1 (ISRC USUAN1100787).mp3', sourcePage:'https://commons.wikimedia.org/wiki/File:Gymnopedie_No._1_(ISRC_USUAN1100787).mp3', interests:['Piano','Beautiful orchestral'] },
  { id:'debussy-clair', composer:'Claude Debussy', title:'Clair de lune', family:'Piano', mood:'luminous · dreamlike · flowing', license:'CC BY 3.0', file:'Clair de lune (Claude Debussy) Suite bergamasque.ogg', sourcePage:'https://commons.wikimedia.org/wiki/File:Clair_de_lune_(Claude_Debussy)_Suite_bergamasque.ogg', interests:['Piano','Cinematic'] },
  { id:'ravel-pavane', composer:'Maurice Ravel', title:'Pavane pour une infante défunte', family:'Piano', mood:'elegant · wistful · spacious', license:'Public domain', file:'Maurice Ravel - Pavane pour une infante défunte.ogg', sourcePage:'https://commons.wikimedia.org/wiki/File:Maurice_Ravel_-_Pavane_pour_une_infante_défunte.ogg', interests:['Piano','Cinematic'] },
  { id:'grieg-morning', composer:'Edvard Grieg', title:'Peer Gynt — Morning Mood', family:'Orchestral', mood:'dawn · pastoral · open', license:'Public domain worldwide', file:'Musopen - Morning.ogg', sourcePage:'https://commons.wikimedia.org/wiki/File:Musopen_-_Morning.ogg', interests:['Beautiful orchestral','Ambient game','Cinematic'] },
  { id:'grieg-aase', composer:'Edvard Grieg', title:"Peer Gynt — Aase's Death", family:'Orchestral', mood:'grief · dignity · stillness', license:'CC0', file:"Peer Gynt Suite No. 1, Op. 46 - II. Aase's Death.ogg", sourcePage:"https://commons.wikimedia.org/wiki/File:Peer_Gynt_Suite_No._1,_Op._46_-_II._Aase%27s_Death.ogg", interests:['Beautiful orchestral','Cinematic'] },
  { id:'grieg-anitra', composer:'Edvard Grieg', title:"Peer Gynt — Anitra's Dance", family:'Orchestral', mood:'light · poised · dancing', license:'Commons reusable recording', file:"Grieg, Peer Gynt Suite No. 1, Op. 46 - III. Anitra's Dance.ogg", sourcePage:"https://commons.wikimedia.org/wiki/File:Grieg,_Peer_Gynt_Suite_No._1,_Op._46_-_III._Anitra%27s_Dance.ogg", interests:['Beautiful orchestral'] },
  { id:'dvorak-largo', composer:'Antonín Dvořák', title:'New World Symphony — II. Largo', family:'Orchestral', mood:'vast · homesick · noble', license:'Musopen / Commons', file:"Antonin Dvorak - symphony no. 9 in e minor 'from the new world', op. 95 - ii. largo.ogg", sourcePage:"https://commons.wikimedia.org/wiki/File:Antonin_Dvorak_-_symphony_no._9_in_e_minor_%27from_the_new_world%27,_op._95_-_ii._largo.ogg", interests:['Beautiful orchestral','Cinematic','Ambient game'] },
  { id:'saint-aquarium', composer:'Camille Saint-Saëns', title:'Carnival of the Animals — Aquarium', family:'Orchestral', mood:'shimmering · magical · underwater', license:'CC BY-SA 2.0', file:'Saint-Saens - The Carnival of the Animals - 07 Aquarium.ogg', sourcePage:'https://commons.wikimedia.org/wiki/File:Saint-Saens_-_The_Carnival_of_the_Animals_-_07_Aquarium.ogg', interests:['Beautiful orchestral','Ambient game','Cinematic'] },
  { id:'tchaik-swan', composer:'Pyotr Ilyich Tchaikovsky', title:'Swan Lake — Scène', family:'Orchestral', mood:'tragic · romantic · iconic', license:'Public-domain historical recording', file:'Tchaikovsky Swan Lake Op.20 No.10. Scène.ogg', sourcePage:'https://commons.wikimedia.org/wiki/File:Tchaikovsky_Swan_Lake_Op.20_No.10._Scène.ogg', interests:['Beautiful orchestral','Cinematic'] },
  { id:'bach-air', composer:'J. S. Bach', title:'Air on the G String', family:'Classical', mood:'serene · clear · timeless', license:'Public-domain historical recording', file:'Air (Bach).ogg', sourcePage:'https://commons.wikimedia.org/wiki/File:Air_(Bach).ogg', interests:['Beautiful orchestral','Ambient game'] },
]

function loadObject<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || '') as T } catch { return fallback }
}
function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  return Math.floor(seconds / 60) + ':' + Math.floor(seconds % 60).toString().padStart(2, '0')
}

export function MusicDiscoveryLab({ onExit, pin }: { onExit: () => void; pin: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const recordingRef = useRef<RecordingSession | null>(null)
  const recordingTrackRef = useRef<string | null>(null)
  const [ratings, setRatings] = useState<Record<string, Rating>>(() => loadObject(RATING_KEY, {}))
  const [notes, setNotes] = useState<Record<string, string>>(() => loadObject(NOTE_KEY, {}))
  const [qualityRatings, setQualityRatings] = useState<Record<string, Rating>>(() => loadObject(QUALITY_KEY, {}))
  const [wantedVariants, setWantedVariants] = useState<Record<string, string[]>>(() => loadObject(VARIANT_KEY, {}))
  const [interests, setInterests] = useState<string[]>(() => loadObject(INTEREST_KEY, ['Beautiful orchestral','Ambient game','Piano']))
  const [request, setRequest] = useState(() => localStorage.getItem(REQUEST_KEY) || 'Beautiful, high-quality music for games')
  const [mode, setMode] = useState<'listen'|'hunt'>('listen')
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [message, setMessage] = useState('')

  const queue = useMemo(() => {
    if (!interests.length) return tracks
    const matches = tracks.filter(track => track.interests.some(tag => interests.includes(tag)))
    return matches.length ? matches : tracks
  }, [interests])
  const selected = queue[Math.min(index, queue.length - 1)] || tracks[0]

  useEffect(() => { if (index >= queue.length) setIndex(0) }, [queue.length, index])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const time = () => setCurrentTime(audio.currentTime || 0)
    const meta = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0)
    const ended = () => setPlaying(false)
    const error = () => { setPlaying(false); setMessage('That recording failed to load. I need to replace its stream.') }
    audio.addEventListener('timeupdate', time)
    audio.addEventListener('loadedmetadata', meta)
    audio.addEventListener('durationchange', meta)
    audio.addEventListener('ended', ended)
    audio.addEventListener('error', error)
    return () => {
      audio.removeEventListener('timeupdate', time); audio.removeEventListener('loadedmetadata', meta)
      audio.removeEventListener('durationchange', meta); audio.removeEventListener('ended', ended); audio.removeEventListener('error', error)
    }
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.pause()
    audio.src = commonsAudio(selected.file)
    audio.load()
    setPlaying(false); setCurrentTime(0); setDuration(0); setMessage('')
  }, [selected.id])

  function toggleInterest(value: string) {
    const next = interests.includes(value) ? interests.filter(x => x !== value) : [...interests, value]
    setInterests(next); localStorage.setItem(INTEREST_KEY, JSON.stringify(next)); setIndex(0)
  }
  function saveRequest(value: string) {
    setRequest(value); localStorage.setItem(REQUEST_KEY, value)
  }
  async function togglePlay() {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      try { await audio.play(); setPlaying(true); setMessage('') } catch { setMessage('Tap Play again to allow audio.') }
    } else { audio.pause(); setPlaying(false) }
  }
  function stop() {
    const audio = audioRef.current
    if (!audio) return
    audio.pause(); audio.currentTime = 0; setPlaying(false); setCurrentTime(0)
  }
  function seek(value: number) {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = value; setCurrentTime(value)
  }
  function step(delta: number) {
    setIndex(i => (i + delta + queue.length) % queue.length)
  }
  function ratePiece(value: Rating) {
    const next = { ...ratings, [selected.id]: value }
    setRatings(next); localStorage.setItem(RATING_KEY, JSON.stringify(next))
  }
  function rateQuality(value: Rating) {
    const next = { ...qualityRatings, [selected.id]: value }
    setQualityRatings(next); localStorage.setItem(QUALITY_KEY, JSON.stringify(next))
  }
  function toggleVariant(value: string) {
    const current = wantedVariants[selected.id] || []
    const list = current.includes(value) ? current.filter(item => item !== value) : [...current, value]
    const next = { ...wantedVariants, [selected.id]: list }
    setWantedVariants(next); localStorage.setItem(VARIANT_KEY, JSON.stringify(next))
  }
  function saveNote(value: string) {
    const next = { ...notes, [selected.id]: value }
    setNotes(next); localStorage.setItem(NOTE_KEY, JSON.stringify(next))
  }

  async function toggleRecording() {
    if (transcribing) return
    if (!recording) {
      try {
        recordingTrackRef.current = selected.id
        recordingRef.current = await startRecordingSession()
        setRecording(true); setMessage('Recording note… tap the mic again when finished.')
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Could not start microphone.')
      }
      return
    }
    const session = recordingRef.current
    const trackId = recordingTrackRef.current
    if (!session || !trackId) return
    recordingRef.current = null; recordingTrackRef.current = null
    setRecording(false); setTranscribing(true); setMessage('Transcribing…')
    session.stop()
    try {
      const blob = await session.blobPromise
      const form = new FormData()
      const extension = blob.type.includes('mp4') ? 'm4a' : 'webm'
      form.append('audio', blob, 'music-note.' + extension)
      const response = await fetch('/api/transcribe', { method:'POST', headers:{ 'x-review-pin': pin }, body:form })
      const result = await response.json() as { text?: string; error?: string }
      if (!response.ok) throw new Error(result.error || 'Transcription failed.')
      const transcript = (result.text || '').replace(/\s+/g,' ').trim()
      if (!transcript) throw new Error('I did not hear any words.')
      const existing = notes[trackId] || ''
      const nextText = [existing, transcript].filter(Boolean).join(' ')
      const next = { ...notes, [trackId]: nextText }
      setNotes(next); localStorage.setItem(NOTE_KEY, JSON.stringify(next))
      setMessage('Voice note added.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Transcription failed.')
    } finally { setTranscribing(false) }
  }

  return <main className="music-discovery">
    <audio ref={audioRef} preload="metadata" />
    <header className="md-top">
      <button onClick={onExit}>← Lab</button>
      <strong>Music Discovery</strong>
      <span>{index + 1}/{queue.length}</span>
    </header>

    <nav className="md-tabs">
      <button className={mode === 'listen' ? 'active' : ''} onClick={() => setMode('listen')}>LISTEN</button>
      <button className={mode === 'hunt' ? 'active' : ''} onClick={() => setMode('hunt')}>HUNT</button>
    </nav>

    {mode === 'listen' ? <section className="md-listen">
      <div className="md-title">
        <small>{selected.composer}</small>
        <h1>{selected.title}</h1>
        <p>{selected.mood}</p>
      </div>

      <div className="md-transport">
        <button onClick={() => step(-1)}>‹</button>
        <button className="primary" onClick={togglePlay}>{playing ? '❚❚ Pause' : '▶ Play'}</button>
        <button onClick={stop}>■ Stop</button>
        <button onClick={() => step(1)}>›</button>
      </div>

      <div className="md-scrub">
        <span>{formatTime(currentTime)}</span>
        <input type="range" min="0" max={Math.max(duration,0)} step="0.1" value={Math.min(currentTime,Math.max(duration,0))} onChange={e => seek(Number(e.target.value))}/>
        <span>{formatTime(duration)}</span>
      </div>

      <div className="md-judgments">
        <div className="md-judgment-row">
          <small>PIECE</small>
          <div className="md-rating">{[[0,'Hate'],[1,'Mild'],[2,'Good'],[3,'Love']].map(([value,label]) => <button key={value} className={ratings[selected.id] === value ? 'selected' : ''} onClick={() => ratePiece(value as Rating)}><b>{value}</b><span>{label}</span></button>)}</div>
        </div>
        <div className="md-judgment-row">
          <small>SOUND QUALITY</small>
          <div className="md-rating">{[[0,'Awful'],[1,'Weak'],[2,'Good'],[3,'Great']].map(([value,label]) => <button key={value} className={qualityRatings[selected.id] === value ? 'selected' : ''} onClick={() => rateQuality(value as Rating)}><b>{value}</b><span>{label}</span></button>)}</div>
        </div>
        <div className="md-variants">
          <small>FIND ANOTHER VERSION</small>
          <div>{variantOptions.map(item => <button key={item} className={(wantedVariants[selected.id] || []).includes(item) ? 'active' : ''} onClick={() => toggleVariant(item)}>{item}</button>)}</div>
        </div>
      </div>

      <div className="md-note">
        <button className={recording ? 'recording' : ''} onClick={toggleRecording} disabled={transcribing}>{recording ? '■' : '🎙'}</button>
        <textarea value={notes[selected.id] || ''} onChange={e => saveNote(e.target.value)} placeholder="Type or record what you think…"/>
      </div>

      <div className="md-bottom">
        <div className="md-queue">
          {queue.slice(Math.max(0,index-1),Math.min(queue.length,index+2)).map(track =>
            <button key={track.id} className={track.id === selected.id ? 'active' : ''} onClick={() => setIndex(queue.findIndex(x => x.id === track.id))}>{track.title}</button>
          )}
        </div>
        <a href={selected.sourcePage} target="_blank" rel="noreferrer">{selected.license} ↗</a>
      </div>
      {message && <div className="md-message">{message}</div>}
    </section> : <section className="md-hunt">
      <div>
        <small>WHAT SHOULD I HUNT FOR?</small>
        <h1>Choose your interests.</h1>
      </div>
      <div className="md-chips">
        {interestOptions.map(item => <button key={item} className={interests.includes(item) ? 'active' : ''} onClick={() => toggleInterest(item)}>{item}</button>)}
      </div>
      <label>
        <span>Anything else?</span>
        <textarea value={request} onChange={e => saveRequest(e.target.value)} placeholder="e.g. Beautiful high-quality game music, warm strings, no cheesy trailer drums…"/>
      </label>
      <div className="md-hunt-summary">
        <b>{queue.length}</b>
        <span>current nominations matching your interests</span>
        <button onClick={() => { setIndex(0); setMode('listen') }}>Start nominations →</button>
      </div>
      <p className="md-hunt-note">This screen saves the hunt profile on your phone. I can use it to keep expanding the nomination catalog with verified reusable recordings.</p>
    </section>}
  </main>
}
