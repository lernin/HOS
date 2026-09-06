import { useEffect, useMemo, useRef, useState } from 'react'
import { startRecordingSession, type RecordingSession } from '../lib/voiceCapture'
import './music-discovery-lab.css'

type Rating = 0 | 1 | 2 | 3
type Modality = 'Piano' | 'Orchestral' | 'Jazz' | 'Guitar' | 'Synth' | 'Ambient' | 'Game' | '8-bit'
type Emotion = 'Hearth' | 'Wonder' | 'Calling' | 'Adventure' | 'Guide' | 'Mystery' | 'Vastness' | 'Peril' | 'Homeward' | 'Triumph'
type ModalityStatus = 'unsearched' | 'requested' | 'notfound'
type Candidate = {
  id: string
  performer: string
  modality: Modality
  license: string
  file: string
  sourcePage: string
}
type Piece = {
  id: string
  composer: string
  title: string
  mood: string
  aiEmotions: Emotion[]
  candidates: Candidate[]
}

const modalities: Modality[] = ['Piano','Orchestral','Jazz','Guitar','Synth','Ambient','Game','8-bit']
const emotions: Emotion[] = ['Hearth','Wonder','Calling','Adventure','Guide','Mystery','Vastness','Peril','Homeward','Triumph']

const PIECE_RATING_KEY = 'hos-music-piece-ratings-v1'
const QUALITY_KEY = 'hos-music-quality-ratings-v2'
const PERFORMANCE_KEY = 'hos-music-performance-ratings-v2'
const NOTE_KEY = 'hos-music-notes-v4'
const REJECTED_KEY = 'hos-music-rejected-candidates-v1'
const MODALITY_STATUS_KEY = 'hos-music-modality-status-v1'
const CONFIRMED_EMOTION_KEY = 'hos-music-confirmed-emotions-v1'
const INTEREST_KEY = 'hos-music-discovery-interests-v1'
const REQUEST_KEY = 'hos-music-discovery-request-v1'

const commonsAudio = (file: string) => 'https://commons.wikimedia.org/wiki/Special:Redirect/file/' + encodeURIComponent(file)

const pieces: Piece[] = [
  {
    id:'satie-gym1',
    composer:'Erik Satie',
    title:'Gymnopédie No. 1',
    mood:'still · tender · beautiful',
    aiEmotions:['Hearth','Wonder','Homeward'],
    candidates:[
      { id:'satie-gym1-piano-macleod', performer:'Kevin MacLeod', modality:'Piano', license:'CC BY 3.0 · 320 kbps MP3', file:'Gymnopedie No. 1 (ISRC USUAN1100787).mp3', sourcePage:'https://commons.wikimedia.org/wiki/File:Gymnopedie_No._1_(ISRC_USUAN1100787).mp3' }
    ],
  },
  {
    id:'debussy-clair',
    composer:'Claude Debussy',
    title:'Clair de lune',
    mood:'luminous · dreamlike · flowing',
    aiEmotions:['Wonder','Mystery','Homeward'],
    candidates:[
      { id:'debussy-clair-piano', performer:'Commons recording', modality:'Piano', license:'CC BY 3.0', file:'Clair de lune (Claude Debussy) Suite bergamasque.ogg', sourcePage:'https://commons.wikimedia.org/wiki/File:Clair_de_lune_(Claude_Debussy)_Suite_bergamasque.ogg' }
    ],
  },
  {
    id:'ravel-pavane',
    composer:'Maurice Ravel',
    title:'Pavane pour une infante défunte',
    mood:'elegant · wistful · spacious',
    aiEmotions:['Hearth','Mystery','Homeward'],
    candidates:[
      { id:'ravel-pavane-piano', performer:'Commons recording', modality:'Piano', license:'Public domain', file:'Maurice Ravel - Pavane pour une infante défunte.ogg', sourcePage:'https://commons.wikimedia.org/wiki/File:Maurice_Ravel_-_Pavane_pour_une_infante_défunte.ogg' }
    ],
  },
  {
    id:'grieg-morning',
    composer:'Edvard Grieg',
    title:'Peer Gynt — Morning Mood',
    mood:'dawn · pastoral · open',
    aiEmotions:['Hearth','Wonder','Adventure'],
    candidates:[
      { id:'grieg-morning-orch', performer:'Musopen recording', modality:'Orchestral', license:'Public domain worldwide', file:'Musopen - Morning.ogg', sourcePage:'https://commons.wikimedia.org/wiki/File:Musopen_-_Morning.ogg' }
    ],
  },
  {
    id:'grieg-aase',
    composer:'Edvard Grieg',
    title:"Peer Gynt — Aase's Death",
    mood:'grief · dignity · stillness',
    aiEmotions:['Hearth','Peril','Homeward'],
    candidates:[
      { id:'grieg-aase-orch', performer:'Commons recording', modality:'Orchestral', license:'CC0', file:"Peer Gynt Suite No. 1, Op. 46 - II. Aase's Death.ogg", sourcePage:"https://commons.wikimedia.org/wiki/File:Peer_Gynt_Suite_No._1,_Op._46_-_II._Aase%27s_Death.ogg" }
    ],
  },
  {
    id:'dvorak-largo',
    composer:'Antonín Dvořák',
    title:'New World Symphony — II. Largo',
    mood:'vast · homesick · noble',
    aiEmotions:['Vastness','Adventure','Homeward'],
    candidates:[
      { id:'dvorak-largo-orch', performer:'Musopen recording', modality:'Orchestral', license:'Musopen / Commons', file:"Antonin Dvorak - symphony no. 9 in e minor 'from the new world', op. 95 - ii. largo.ogg", sourcePage:"https://commons.wikimedia.org/wiki/File:Antonin_Dvorak_-_symphony_no._9_in_e_minor_%27from_the_new_world%27,_op._95_-_ii._largo.ogg" }
    ],
  },
  {
    id:'saint-aquarium',
    composer:'Camille Saint-Saëns',
    title:'Carnival of the Animals — Aquarium',
    mood:'shimmering · magical · underwater',
    aiEmotions:['Wonder','Mystery','Vastness'],
    candidates:[
      { id:'saint-aquarium-orch', performer:'Commons recording', modality:'Orchestral', license:'CC BY-SA 2.0', file:'Saint-Saens - The Carnival of the Animals - 07 Aquarium.ogg', sourcePage:'https://commons.wikimedia.org/wiki/File:Saint-Saens_-_The_Carnival_of_the_Animals_-_07_Aquarium.ogg' }
    ],
  },
]

function loadObject<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || '') as T } catch { return fallback }
}
function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  return Math.floor(seconds / 60) + ':' + Math.floor(seconds % 60).toString().padStart(2, '0')
}
function modalityKey(pieceId: string, modality: Modality) {
  return pieceId + '::' + modality
}

export function MusicDiscoveryLab({ onExit, pin }: { onExit: () => void; pin: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const recordingRef = useRef<RecordingSession | null>(null)
  const recordingCandidateRef = useRef<string | null>(null)

  const [pieceIndex, setPieceIndex] = useState(0)
  const [candidateId, setCandidateId] = useState(pieces[0].candidates[0].id)
  const [pieceRatings, setPieceRatings] = useState<Record<string, Rating>>(() => loadObject(PIECE_RATING_KEY, {}))
  const [qualityRatings, setQualityRatings] = useState<Record<string, Rating>>(() => loadObject(QUALITY_KEY, {}))
  const [performanceRatings, setPerformanceRatings] = useState<Record<string, Rating>>(() => loadObject(PERFORMANCE_KEY, {}))
  const [notes, setNotes] = useState<Record<string, string>>(() => loadObject(NOTE_KEY, {}))
  const [rejected, setRejected] = useState<Record<string, boolean>>(() => loadObject(REJECTED_KEY, {}))
  const [modalityStatus, setModalityStatus] = useState<Record<string, ModalityStatus>>(() => loadObject(MODALITY_STATUS_KEY, {}))
  const [confirmedEmotions, setConfirmedEmotions] = useState<Record<string, Emotion[]>>(() => loadObject(CONFIRMED_EMOTION_KEY, {}))
  const [interests, setInterests] = useState<string[]>(() => loadObject(INTEREST_KEY, ['Beautiful orchestral','Ambient game','Piano']))
  const [request, setRequest] = useState(() => localStorage.getItem(REQUEST_KEY) || 'Beautiful, high-quality music for games')
  const [mode, setMode] = useState<'listen'|'hunt'>('listen')
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [message, setMessage] = useState('')

  const piece = pieces[pieceIndex]
  const viableCandidates = useMemo(() => piece.candidates.filter(candidate => !rejected[candidate.id]), [piece, rejected])
  const current = viableCandidates.find(candidate => candidate.id === candidateId) || viableCandidates[0] || piece.candidates[0]
  const currentModality = current.modality

  useEffect(() => {
    const next = pieces[pieceIndex].candidates.find(candidate => !rejected[candidate.id]) || pieces[pieceIndex].candidates[0]
    setCandidateId(next.id)
  }, [pieceIndex])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const time = () => setCurrentTime(audio.currentTime || 0)
    const meta = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0)
    const ended = () => setPlaying(false)
    const error = () => { setPlaying(false); setMessage('That recording failed to load.') }
    audio.addEventListener('timeupdate', time)
    audio.addEventListener('loadedmetadata', meta)
    audio.addEventListener('durationchange', meta)
    audio.addEventListener('ended', ended)
    audio.addEventListener('error', error)
    return () => {
      audio.removeEventListener('timeupdate', time)
      audio.removeEventListener('loadedmetadata', meta)
      audio.removeEventListener('durationchange', meta)
      audio.removeEventListener('ended', ended)
      audio.removeEventListener('error', error)
    }
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !current) return
    audio.pause()
    audio.src = commonsAudio(current.file)
    audio.load()
    setPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    setMessage('')
  }, [current.id])

  function saveLocal<T>(key: string, value: T) {
    localStorage.setItem(key, JSON.stringify(value))
  }

  function candidateListFor(modality: Modality) {
    return piece.candidates.filter(candidate => candidate.modality === modality && !rejected[candidate.id])
  }

  function modalityVisualStatus(modality: Modality) {
    const available = candidateListFor(modality)
    if (available.length) return 'available'
    return modalityStatus[modalityKey(piece.id, modality)] || 'unsearched'
  }

  function chooseModality(modality: Modality) {
    const list = candidateListFor(modality)
    if (list.length) {
      const currentIndex = list.findIndex(candidate => candidate.id === current.id)
      const next = list[(currentIndex + 1 + list.length) % list.length]
      setCandidateId(next.id)
      setMessage(list.length > 1 ? 'Switched to another retained ' + modality.toLowerCase() + ' version.' : '')
      return
    }
    const key = modalityKey(piece.id, modality)
    const next = { ...modalityStatus, [key]: 'requested' as ModalityStatus }
    setModalityStatus(next)
    saveLocal(MODALITY_STATUS_KEY, next)
    setMessage(modality + ' hunt requested. No result will be shown until a real candidate is found.')
  }

  async function togglePlay() {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      try { await audio.play(); setPlaying(true); setMessage('') } catch { setMessage('Tap Play again to allow audio.') }
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

  function stepPiece(delta: number) {
    setPieceIndex(index => (index + delta + pieces.length) % pieces.length)
  }

  function ratePiece(value: Rating) {
    const next = { ...pieceRatings, [piece.id]: value }
    setPieceRatings(next)
    saveLocal(PIECE_RATING_KEY, next)
  }

  function rateQuality(value: Rating) {
    const next = { ...qualityRatings, [current.id]: value }
    setQualityRatings(next)
    saveLocal(QUALITY_KEY, next)
  }

  function ratePerformance(value: Rating) {
    const nextRatings = { ...performanceRatings, [current.id]: value }
    setPerformanceRatings(nextRatings)
    saveLocal(PERFORMANCE_KEY, nextRatings)

    if (value <= 1) {
      const nextRejected = { ...rejected, [current.id]: true }
      setRejected(nextRejected)
      saveLocal(REJECTED_KEY, nextRejected)

      const remaining = piece.candidates.filter(candidate =>
        candidate.modality === current.modality &&
        candidate.id !== current.id &&
        !nextRejected[candidate.id]
      )
      if (remaining.length) {
        setCandidateId(remaining[0].id)
        setMessage('Rejected this performance. Showing another retained ' + current.modality.toLowerCase() + ' version.')
      } else {
        if (pieceRatings[piece.id] === 3) {
          const key = modalityKey(piece.id, current.modality)
          const nextStatus = { ...modalityStatus, [key]: 'requested' as ModalityStatus }
          setModalityStatus(nextStatus)
          saveLocal(MODALITY_STATUS_KEY, nextStatus)
          setMessage('Rejected this performance. Replacement ' + current.modality.toLowerCase() + ' hunt requested.')
        } else {
          setMessage('Rejected this performance. Tap ' + current.modality + ' to request a replacement.')
        }
      }
    }
  }

  function toggleEmotion(emotion: Emotion) {
    const currentConfirmed = confirmedEmotions[piece.id] || []
    const nextList = currentConfirmed.includes(emotion)
      ? currentConfirmed.filter(item => item !== emotion)
      : [...currentConfirmed, emotion]
    const next = { ...confirmedEmotions, [piece.id]: nextList }
    setConfirmedEmotions(next)
    saveLocal(CONFIRMED_EMOTION_KEY, next)
  }

  function saveNote(value: string) {
    const next = { ...notes, [current.id]: value }
    setNotes(next)
    saveLocal(NOTE_KEY, next)
  }

  async function toggleRecording() {
    if (transcribing) return
    if (!recording) {
      try {
        recordingCandidateRef.current = current.id
        recordingRef.current = await startRecordingSession()
        setRecording(true)
        setMessage('Recording note… tap again when finished.')
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Could not start microphone.')
      }
      return
    }

    const session = recordingRef.current
    const targetId = recordingCandidateRef.current
    if (!session || !targetId) return
    recordingRef.current = null
    recordingCandidateRef.current = null
    setRecording(false)
    setTranscribing(true)
    setMessage('Transcribing…')
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
      const nextText = [notes[targetId] || '', transcript].filter(Boolean).join(' ')
      const next = { ...notes, [targetId]: nextText }
      setNotes(next)
      saveLocal(NOTE_KEY, next)
      setMessage('Voice note added.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Transcription failed.')
    } finally {
      setTranscribing(false)
    }
  }

  const interestOptions = ['Beautiful orchestral','Ambient game','Jazz','Guitar','Synth pads','8-bit / chiptune','Electronic / dubstep','Cinematic','Piano','Strange / experimental']

  function toggleInterest(value: string) {
    const next = interests.includes(value) ? interests.filter(item => item !== value) : [...interests, value]
    setInterests(next)
    saveLocal(INTEREST_KEY, next)
  }

  return <main className="music-discovery">
    <audio ref={audioRef} preload="metadata" />

    <header className="md-top">
      <button onClick={onExit}>← Lab</button>
      <strong>Music Discovery</strong>
      <span>{pieceIndex + 1}/{pieces.length}</span>
    </header>

    <nav className="md-tabs">
      <button className={mode === 'listen' ? 'active' : ''} onClick={() => setMode('listen')}>LISTEN</button>
      <button className={mode === 'hunt' ? 'active' : ''} onClick={() => setMode('hunt')}>HUNT</button>
    </nav>

    {mode === 'listen' ? <section className="md-listen">
      <div className="md-modalities">
        {modalities.map(modality => {
          const list = candidateListFor(modality)
          const status = modalityVisualStatus(modality)
          const active = currentModality === modality && list.some(candidate => candidate.id === current.id)
          return <button
            key={modality}
            className={'status-' + status + (active ? ' active' : '')}
            onClick={() => chooseModality(modality)}
          >
            <strong>{modality}</strong>
            <span>{status === 'available' ? (list.length > 1 ? list.length + ' versions' : 'ready') : status === 'requested' ? 'queued' : status === 'notfound' ? 'not found' : 'tap to hunt'}</span>
          </button>
        })}
      </div>

      <div className="md-title">
        <small>{piece.composer} · {current.modality} · {current.performer}</small>
        <h1>{piece.title}</h1>
        <p>{piece.mood}</p>
      </div>

      <div className="md-transport">
        <button onClick={() => stepPiece(-1)}>‹</button>
        <button className="primary" onClick={togglePlay}>{playing ? '❚❚ Pause' : '▶ Play'}</button>
        <button onClick={stop}>■ Stop</button>
        <button onClick={() => stepPiece(1)}>›</button>
      </div>

      <div className="md-scrub">
        <span>{formatTime(currentTime)}</span>
        <input type="range" min="0" max={Math.max(duration,0)} step="0.1" value={Math.min(currentTime,Math.max(duration,0))} onChange={event => { const audio = audioRef.current; if (audio) { audio.currentTime = Number(event.target.value); setCurrentTime(Number(event.target.value)) } }}/>
        <span>{formatTime(duration)}</span>
      </div>

      <div className="md-judgments">
        <div className="md-judgment-row">
          <small>PIECE</small>
          <div className="md-rating">{[[0,'Hate'],[1,'Mild'],[2,'Good'],[3,'Love']].map(([value,label]) => <button key={value} className={pieceRatings[piece.id] === value ? 'selected' : ''} onClick={() => ratePiece(value as Rating)}><b>{value}</b><span>{label}</span></button>)}</div>
        </div>
        <div className="md-judgment-row">
          <small>SOUND</small>
          <div className="md-rating">{[[0,'Awful'],[1,'Weak'],[2,'Good'],[3,'Great']].map(([value,label]) => <button key={value} className={qualityRatings[current.id] === value ? 'selected' : ''} onClick={() => rateQuality(value as Rating)}><b>{value}</b><span>{label}</span></button>)}</div>
        </div>
        <div className="md-judgment-row">
          <small>PERFORMANCE</small>
          <div className="md-rating">{[[0,'Reject'],[1,'Reject'],[2,'Keep'],[3,'Best']].map(([value,label]) => <button key={value} className={performanceRatings[current.id] === value ? 'selected' : ''} onClick={() => ratePerformance(value as Rating)}><b>{value}</b><span>{label}</span></button>)}</div>
        </div>
      </div>

      <div className="md-emotions">
        <small>EMOTIONAL QUALITY</small>
        <div>
          {emotions.map(emotion => {
            const suggested = piece.aiEmotions.includes(emotion)
            const confirmed = (confirmedEmotions[piece.id] || []).includes(emotion)
            return <button key={emotion} className={(suggested ? 'suggested ' : '') + (confirmed ? 'confirmed' : '')} onClick={() => toggleEmotion(emotion)}>{emotion}</button>
          })}
        </div>
      </div>

      <div className="md-note">
        <button className={recording ? 'recording' : ''} onClick={toggleRecording} disabled={transcribing}>{recording ? '■' : '🎙'}</button>
        <textarea value={notes[current.id] || ''} onChange={event => saveNote(event.target.value)} placeholder="Type or record what you think…"/>
      </div>

      <div className="md-footer-row">
        <span>{current.license}</span>
        <a href={current.sourcePage} target="_blank" rel="noreferrer">Source ↗</a>
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
        <textarea value={request} onChange={event => { setRequest(event.target.value); localStorage.setItem(REQUEST_KEY, event.target.value) }} placeholder="e.g. Beautiful high-quality game music, warm strings, no cheesy trailer drums…"/>
      </label>
      <div className="md-hunt-summary">
        <b>{interests.length}</b>
        <span>active discovery interests</span>
        <button onClick={() => setMode('listen')}>Back to nominations →</button>
      </div>
      <p className="md-hunt-note">These preferences guide future nominations. Modality-specific hunts are requested directly from the top row on the Listen screen.</p>
    </section>}
  </main>
}
