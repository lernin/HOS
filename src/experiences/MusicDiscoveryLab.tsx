import { useEffect, useMemo, useRef, useState } from 'react'
import { startRecordingSession, type RecordingSession } from '../lib/voiceCapture'
import { supabase } from '../lib/supabase'
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
  file?: string
  audioUrl?: string
  sourcePage: string
  source?: string
  matchConfidence?: 'confirmed' | 'possible'
}
type Piece = {
  id: string
  composer: string
  title: string
  mood: string
  aiEmotions: Emotion[]
  candidates: Candidate[]
}
type CatalogItem = {
  id: string
  title: string
  creator: string
  modality: Modality
  license: string
  audioUrl: string
  sourcePage: string
  source: string
  description?: string
  rightsVerified?: boolean
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
const DISCOVERED_KEY = 'hos-music-discovered-candidates-v1'
const INTEREST_KEY = 'hos-music-discovery-interests-v1'
const REQUEST_KEY = 'hos-music-discovery-request-v1'

const commonsAudio = (file: string) => 'https://commons.wikimedia.org/wiki/Special:Redirect/file/' + encodeURIComponent(file)
const candidateAudio = (candidate: Candidate) => candidate.audioUrl || (candidate.file ? commonsAudio(candidate.file) : '')

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
  const [catalogPieces, setCatalogPieces] = useState<Piece[]>([])
  const [candidateId, setCandidateId] = useState(pieces[0].candidates[0].id)
  const [pieceRatings, setPieceRatings] = useState<Record<string, Rating>>(() => loadObject(PIECE_RATING_KEY, {}))
  const [qualityRatings, setQualityRatings] = useState<Record<string, Rating>>(() => loadObject(QUALITY_KEY, {}))
  const [performanceRatings, setPerformanceRatings] = useState<Record<string, Rating>>(() => loadObject(PERFORMANCE_KEY, {}))
  const [notes, setNotes] = useState<Record<string, string>>(() => loadObject(NOTE_KEY, {}))
  const [rejected, setRejected] = useState<Record<string, boolean>>(() => loadObject(REJECTED_KEY, {}))
  const [modalityStatus, setModalityStatus] = useState<Record<string, ModalityStatus>>(() => loadObject(MODALITY_STATUS_KEY, {}))
  const [confirmedEmotions, setConfirmedEmotions] = useState<Record<string, Emotion[]>>(() => loadObject(CONFIRMED_EMOTION_KEY, {}))
  const [discovered, setDiscovered] = useState<Record<string, Candidate[]>>(() => loadObject(DISCOVERED_KEY, {}))
  const [interests, setInterests] = useState<string[]>(() => loadObject(INTEREST_KEY, ['Beautiful orchestral','Ambient game','Piano']))
  const [request, setRequest] = useState(() => localStorage.getItem(REQUEST_KEY) || 'Beautiful, high-quality music for games')
  const [mode, setMode] = useState<'listen'|'browse'|'hunt'>('listen')
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogSearch, setCatalogSearch] = useState('')
  const [catalogModality, setCatalogModality] = useState<'All' | Modality>('All')
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [message, setMessage] = useState('')

  const pieceList = useMemo(() => [...pieces, ...catalogPieces], [catalogPieces])
  const piece = pieceList[Math.min(pieceIndex, pieceList.length - 1)] || pieces[0]
  const allCandidates = useMemo(() => [...piece.candidates, ...(discovered[piece.id] || [])], [piece, discovered])
  const viableCandidates = useMemo(() => allCandidates.filter(candidate => !rejected[candidate.id]), [allCandidates, rejected])
  const current = viableCandidates.find(candidate => candidate.id === candidateId) || viableCandidates[0] || allCandidates[0]
  const currentModality = current.modality

  useEffect(() => {
    const nextPiece = pieceList[Math.min(pieceIndex, pieceList.length - 1)] || pieces[0]
    const candidates = [...nextPiece.candidates, ...(discovered[nextPiece.id] || [])]
    const next = candidates.find(candidate => !rejected[candidate.id]) || candidates[0]
    if (next) setCandidateId(next.id)
  }, [pieceIndex, pieceList, discovered, rejected])

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
    audio.src = candidateAudio(current)
    audio.load()
    setPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    setMessage('')
  }, [current.id])

  function saveLocal<T>(key: string, value: T) {
    localStorage.setItem(key, JSON.stringify(value))
  }

  function inferredEmotions(modality: Modality): Emotion[] {
    if (modality === 'Ambient') return ['Wonder','Mystery','Vastness']
    if (modality === 'Game' || modality === '8-bit') return ['Calling','Adventure','Triumph']
    if (modality === 'Orchestral') return ['Adventure','Vastness','Triumph']
    if (modality === 'Jazz') return ['Guide','Adventure']
    if (modality === 'Piano' || modality === 'Guitar') return ['Hearth','Homeward']
    return ['Wonder','Calling']
  }

  function inferCatalogModality(notes = ''): Modality {
    const text = notes.toLowerCase()
    if (text.includes('8-bit') || text.includes('chiptune')) return '8-bit'
    if (text.includes('piano')) return 'Piano'
    if (text.includes('orchestral') || text.includes('cinematic') || text.includes('epic')) return 'Orchestral'
    if (text.includes('jazz') || text.includes('swing') || text.includes('funky') || text.includes('groovy')) return 'Jazz'
    if (text.includes('guitar') || text.includes('acoustic') || text.includes('folk')) return 'Guitar'
    if (text.includes('ambient') || text.includes('atmospheric') || text.includes('soundscape')) return 'Ambient'
    if (text.includes('synth') || text.includes('electronic') || text.includes('techno') || text.includes('dubstep')) return 'Synth'
    return 'Game'
  }

  async function loadCatalog(force = false, reset = false) {
    if (catalogLoading || (catalog.length && !force && !reset)) return
    setCatalogLoading(true)
    try {
      const { data, error } = await supabase.rpc('lab_music_library_read', { pin })
      if (error) throw error
      const rows = (Array.isArray(data) ? data : []) as Array<{
        id:string; composer:string; work_title:string; movement_title?:string | null; performer?:string | null;
        source_name?:string | null; source_url:string; recording_url?:string | null; license?:string | null;
        rights_verified?:boolean; taste_notes?:string | null
      }>
      const incoming: CatalogItem[] = rows.map(row => ({
        id:row.id,
        title:[row.work_title, row.movement_title].filter(Boolean).join(' — '),
        creator:row.performer || row.composer || 'Unknown artist',
        modality:inferCatalogModality(row.taste_notes || ''),
        license:row.license || (row.rights_verified ? 'Rights verified' : 'Rights review pending'),
        audioUrl:row.recording_url || '',
        sourcePage:row.source_url,
        source:row.source_name || 'Curated library',
        description:row.taste_notes || '',
        rightsVerified:Boolean(row.rights_verified),
      }))
      setCatalog(incoming)
      setMessage(incoming.length ? 'Loaded ' + incoming.length + ' curated tracks from the production library.' : 'The curated library is empty.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load curated music library.')
    } finally {
      setCatalogLoading(false)
    }
  }

  async function searchNow() {
    setCatalogSearch('')
    setCatalogModality('All')
    await loadCatalog(true, true)
    setMode('browse')
  }

  function adoptCatalogItem(item: CatalogItem) {
    if (!item.audioUrl) {
      window.open(item.sourcePage, '_blank', 'noopener,noreferrer')
      setMessage('Opened the official track page. Direct in-app audio has not been pinned for this track yet.')
      return
    }
    const pieceId = 'catalog:' + item.id
    const existingIndex = pieceList.findIndex(candidatePiece => candidatePiece.id === pieceId)
    const candidate: Candidate = {
      id:'catalog-candidate:' + item.id,
      performer:item.creator || 'Unknown artist',
      modality:item.modality,
      license:item.license,
      audioUrl:item.audioUrl,
      sourcePage:item.sourcePage,
      source:item.source,
      matchConfidence:'confirmed',
    }
    if (existingIndex >= 0) {
      setPieceIndex(existingIndex)
      setCandidateId(candidate.id)
      setMode('listen')
      return
    }
    const newPiece: Piece = {
      id:pieceId,
      composer:item.creator || 'Unknown artist',
      title:item.title,
      mood:item.modality + ' · ' + item.source,
      aiEmotions:inferredEmotions(item.modality),
      candidates:[candidate],
    }
    const newIndex = pieces.length + catalogPieces.length
    setCatalogPieces(currentPieces => [...currentPieces, newPiece])
    setPieceIndex(newIndex)
    setCandidateId(candidate.id)
    setMode('listen')
  }

  function candidateListFor(modality: Modality) {
    return allCandidates.filter(candidate => candidate.modality === modality && !rejected[candidate.id])
  }

  function modalityVisualStatus(modality: Modality) {
    const available = candidateListFor(modality)
    if (available.length) return 'available'
    return modalityStatus[modalityKey(piece.id, modality)] || 'unsearched'
  }

  function bestCandidate(list: Candidate[]) {
    return [...list].sort((a, b) => (performanceRatings[b.id] ?? -1) - (performanceRatings[a.id] ?? -1) || (qualityRatings[b.id] ?? -1) - (qualityRatings[a.id] ?? -1))[0]
  }

  async function runHunt(modality: Modality) {
    const key = modalityKey(piece.id, modality)
    if (modalityStatus[key] === 'requested') return
    const requestedStatus = { ...modalityStatus, [key]: 'requested' as ModalityStatus }
    setModalityStatus(requestedStatus)
    saveLocal(MODALITY_STATUS_KEY, requestedStatus)
    setMessage('Hunting for a reusable ' + modality.toLowerCase() + ' version…')

    try {
      const response = await fetch('/api/music-hunt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-review-pin': pin },
        body: JSON.stringify({
          title: piece.title,
          composer: piece.composer,
          modality,
          exclude: allCandidates.map(candidate => candidate.sourcePage),
        }),
      })
      const result = await response.json() as { candidates?: Array<{ id: string; performer: string; license: string; audioUrl: string; sourcePage: string; source: string; confidence?: 'confirmed' | 'possible' }>; error?: string }
      if (!response.ok) throw new Error(result.error || 'Music search failed.')

      const known = new Set(allCandidates.map(candidate => candidate.sourcePage))
      const fresh = (result.candidates || []).filter(candidate => candidate.audioUrl && candidate.sourcePage && !known.has(candidate.sourcePage))
      if (!fresh.length) {
        const notFound = { ...requestedStatus, [key]: 'notfound' as ModalityStatus }
        setModalityStatus(notFound)
        saveLocal(MODALITY_STATUS_KEY, notFound)
        setMessage('No suitable reusable ' + modality.toLowerCase() + ' version found this time.')
        return
      }

      const newCandidates: Candidate[] = fresh.slice(0, 5).map(candidate => ({
        id: candidate.id,
        performer: candidate.performer || 'Unknown performer',
        modality,
        license: candidate.license,
        audioUrl: candidate.audioUrl,
        sourcePage: candidate.sourcePage,
        source: candidate.source,
        matchConfidence: candidate.confidence || 'confirmed',
      }))
      const nextDiscovered = { ...discovered, [piece.id]: [...(discovered[piece.id] || []), ...newCandidates] }
      setDiscovered(nextDiscovered)
      saveLocal(DISCOVERED_KEY, nextDiscovered)
      const cleared = { ...requestedStatus }
      delete cleared[key]
      setModalityStatus(cleared)
      saveLocal(MODALITY_STATUS_KEY, cleared)
      setCandidateId(newCandidates[0].id)
      setMessage('Found ' + newCandidates.length + ' new ' + modality.toLowerCase() + (newCandidates.length === 1 ? ' candidate.' : ' candidates.'))
    } catch (error) {
      const reset = { ...requestedStatus }
      delete reset[key]
      setModalityStatus(reset)
      saveLocal(MODALITY_STATUS_KEY, reset)
      setMessage(error instanceof Error ? error.message : 'Music search failed.')
    }
  }

  function chooseModality(modality: Modality) {
    const list = candidateListFor(modality)
    if (!list.length) {
      void runHunt(modality)
      return
    }
    const best = bestCandidate(list)
    if (best) setCandidateId(best.id)
    setMessage(list.length > 1 ? 'Choose a numbered ' + modality.toLowerCase() + ' version below.' : '')
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
    setPieceIndex(index => (index + delta + pieceList.length) % pieceList.length)
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

      const remaining = allCandidates.filter(candidate =>
        candidate.modality === current.modality &&
        candidate.id !== current.id &&
        !nextRejected[candidate.id]
      )
      const replacement = bestCandidate(remaining)
      if (replacement) setCandidateId(replacement.id)
      setMessage('Rejected this performance. Hunting for another ' + current.modality.toLowerCase() + ' version…')
      void runHunt(current.modality)
      return
    }

    if (value === 2) {
      setMessage('Kept this version. Hunting for another ' + current.modality.toLowerCase() + ' version to compare…')
      void runHunt(current.modality)
      return
    }

    setMessage('Preferred version saved.')
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
  const currentVersions = candidateListFor(currentModality)
  const filteredCatalog = catalog.filter(item => {
    const text = (item.title + ' ' + item.creator + ' ' + item.source + ' ' + (item.description || '')).toLowerCase()
    const matchesSearch = !catalogSearch.trim() || text.includes(catalogSearch.trim().toLowerCase())
    const matchesModality = catalogModality === 'All' || item.modality === catalogModality
    return matchesSearch && matchesModality
  })

  useEffect(() => {
    if (mode === 'browse' && !catalog.length && !catalogLoading) void loadCatalog()
  }, [mode])

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
      <span>{pieceIndex + 1}/{pieceList.length}</span>
    </header>

    <nav className="md-tabs">
      <button className={mode === 'listen' ? 'active' : ''} onClick={() => setMode('listen')}>LISTEN</button>
      <button className={mode === 'browse' ? 'active' : ''} onClick={() => setMode('browse')}>BROWSE</button>
      <button className={mode === 'hunt' ? 'active' : ''} onClick={() => setMode('hunt')}>HUNT</button>
    </nav>

    {mode === 'listen' ? <section className="md-listen">
      <div className="md-modalities">
        {modalities.map(modality => {
          const list = candidateListFor(modality)
          const status = modalityVisualStatus(modality)
          const active = currentModality === modality && list.some(candidate => candidate.id === current.id)
          return <div key={modality} className={'md-modality-cell status-' + status + (active ? ' active' : '')}>
            <button className="md-modality-main" onClick={() => chooseModality(modality)} disabled={status === 'requested'}>
              <strong>{modality}</strong>
              <span>{status === 'available' ? (list.length > 1 ? list.length + ' versions' : 'ready') : status === 'requested' ? 'hunting…' : status === 'notfound' ? 'not found' : 'tap to hunt'}</span>
            </button>
            {status === 'available' && <button className="md-modality-hunt" onClick={() => void runHunt(modality)} aria-label={'Find another ' + modality + ' version'} title={'Find another ' + modality + ' version'}>＋</button>}
          </div>
        })}
      </div>

      {currentVersions.length > 1 && <div className="md-version-picker">
        <small>{currentModality} versions</small>
        <div>
          {currentVersions.map((candidate, versionIndex) => {
            const score = performanceRatings[candidate.id]
            const state = score === 3 ? 'best' : score === 2 ? 'keep' : 'unrated'
            return <button key={candidate.id} className={'version-' + state + (candidate.id === current.id ? ' active' : '')} onClick={() => setCandidateId(candidate.id)}>
              <b>{versionIndex + 1}</b>
              <span>{score === 3 ? 'Best' : score === 2 ? 'Keep' : 'Unrated'}</span>
            </button>
          })}
        </div>
      </div>}

      <div className="md-title">
        <small>{piece.composer} · {current.modality}{current.matchConfidence === 'possible' ? '?' : ''} · {current.performer}{current.source ? ' · ' + current.source : ''}</small>
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
    </section> : mode === 'browse' ? <section className="md-browse">
      <div className="md-browse-head">
        <div>
          <small>CURATED PRODUCTION LIBRARY</small>
          <h1>{catalogLoading ? 'Gathering music…' : (filteredCatalog.length || catalog.length) + ' to try'}</h1>
        </div>
        <button onClick={() => void loadCatalog(true, true)} disabled={catalogLoading}>{catalogLoading ? '…' : '↻'}</button>
      </div>
      <div className="md-browse-search">
        <input value={catalogSearch} onChange={event => setCatalogSearch(event.target.value)} placeholder="Search title, artist, source…"/>
      </div>
      <div className="md-browse-filters">
        {(['All', ...modalities] as Array<'All' | Modality>).map(value => <button key={value} className={catalogModality === value ? 'active' : ''} onClick={() => setCatalogModality(value)}>{value}</button>)}
      </div>
      <div className="md-catalog-list">
        {filteredCatalog.map(item => <button key={item.id} className="md-catalog-item" onClick={() => adoptCatalogItem(item)}>
          <span className="md-catalog-play">{item.audioUrl ? '▶' : '↗'}</span>
          <span className="md-catalog-copy"><strong>{item.title}</strong><small>{item.creator || 'Unknown artist'} · {item.modality}{item.rightsVerified ? ' · ✓ rights' : ' · rights review'}</small></span>
          <span className="md-catalog-source">{item.source}</span>
        </button>)}
        {!catalogLoading && !filteredCatalog.length && <p className="md-empty">No matches in this batch. Change the filter or refresh.</p>}
      </div>
      <div className="md-repositories">
        <span>CURATED</span>
        <div><span className="md-library-note">ChatGPT-curated production library · tap ▶ to listen in-app · ↗ opens official source</span></div>
      </div>
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
        <button className="md-search-now" onClick={() => void searchNow()} disabled={catalogLoading}>{catalogLoading ? 'SEARCHING…' : 'SEARCH NOW →'}</button>
      </div>
      {message && <div className="md-message">{message}</div>}
      <p className="md-hunt-note">Search Now now opens the curated production library. Tell ChatGPT what you want and it can add new researched candidates there for you.</p>
    </section>}
  </main>
}
