import { useEffect, useMemo, useRef, useState, type TouchEvent } from 'react'
import { startRecordingSession, type RecordingSession } from '../lib/voiceCapture'
import { supabase } from '../lib/supabase'
import { captureLegacyMusicBrowserState, readLegacyMusicCloudReceipt, refreshLegacyMusicCapture, uploadLegacyMusicInitialCapture } from './musicLegacyImport'
import './music-discovery-lab.css'

type Rating = 0 | 1 | 2 | 3
type Modality = 'Piano' | 'Orchestral' | 'Jazz' | 'Guitar' | 'Synth' | 'Ambient' | 'Game' | '8-bit'
type Emotion = 'Hearth' | 'Wonder' | 'Calling' | 'Adventure' | 'Guide' | 'Mystery' | 'Vastness' | 'Peril' | 'Homeward' | 'Triumph'
type Candidate = {
  id: string
  performer: string
  modality: Modality
  license: string
  file?: string
  audioUrl?: string
  sourcePage: string
  source?: string
  externalOnly?: boolean
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
  composer: string
  workTitle: string
  movementTitle: string
  title: string
  creator: string
  modality: Modality
  license: string
  audioUrl: string
  sourcePage: string
  source: string
  description?: string
  rightsVerified?: boolean
  externalOnly: boolean
  rating: Rating | null
  soundRating: Rating | null
  performanceRating: Rating | null
  reviewNote: string
  confirmedEmotions: Emotion[]
  suppressedEmotions: Emotion[]
  reviewRejected: boolean
  reviewUpdatedAt: string | null
}
type ReviewSyncEntry = {
  sourcePage: string
  musicId?: string
  pieceRating: Rating | null
  soundRating: Rating | null
  performanceRating: Rating | null
  note: string
  confirmedEmotions: Emotion[]
  rejected: boolean
  dirtyFields?: ReviewField[]
  updatedAt: number
}
type ReviewOverrides = {
  pieceRating?: Rating | null
  soundRating?: Rating | null
  performanceRating?: Rating | null
  note?: string
  confirmedEmotions?: Emotion[]
  rejected?: boolean
}
type ReviewField = keyof ReviewOverrides
type CatalogReviewFilter = 'All' | 'New' | 'Loved'
type SuppressionSyncEntry = {
  musicId: string
  sourcePage: string
  suppressedEmotions: Emotion[]
  updatedAt: number
}
type TrashSyncEntry = {
  musicId: string
  sourcePage: string
  updatedAt: number
}
const modalities: Modality[] = ['Piano','Orchestral','Jazz','Guitar','Synth','Ambient','Game','8-bit']
const emotions: Emotion[] = ['Hearth','Wonder','Calling','Adventure','Guide','Mystery','Vastness','Peril','Homeward','Triumph']

const PIECE_RATING_KEY = 'hos-music-piece-ratings-v1'
const QUALITY_KEY = 'hos-music-quality-ratings-v2'
const PERFORMANCE_KEY = 'hos-music-performance-ratings-v2'
const NOTE_KEY = 'hos-music-notes-v4'
const REJECTED_KEY = 'hos-music-rejected-candidates-v1'
const CONFIRMED_EMOTION_KEY = 'hos-music-confirmed-emotions-v1'
const SUPPRESSED_EMOTION_KEY = 'hos-music-suppressed-emotions-v1'
const DISCOVERED_KEY = 'hos-music-discovered-candidates-v1'
const INTEREST_KEY = 'hos-music-discovery-interests-v1'
const REQUEST_KEY = 'hos-music-discovery-request-v1'
const REVIEW_SYNC_QUEUE_KEY = 'hos-music-review-sync-queue-v1'
const SUPPRESSION_SYNC_QUEUE_KEY = 'hos-music-emotion-suppression-sync-v1'
const TRASH_SYNC_QUEUE_KEY = 'hos-music-trash-sync-v1'

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
export function MusicDiscoveryLab({ onExit, pin }: { onExit: () => void; pin: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const recordingRef = useRef<RecordingSession | null>(null)
  const recordingCandidateRef = useRef<string | null>(null)
  const recordingPieceRef = useRef<string | null>(null)
  const recordingSourcePageRef = useRef<string | null>(null)
  const resolvingCatalogRef = useRef<Map<string, Promise<string | null>>>(new Map())
  const alternateSearchRef = useRef<Set<string>>(new Set())
  const reviewSyncingRef = useRef(false)
  const reviewSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const listenCardRef = useRef<HTMLElement | null>(null)
  const swipeStartRef = useRef<{ x: number; y: number; interactive: boolean } | null>(null)
  const swipeDxRef = useRef(0)
  const swipeMotionBusyRef = useRef(false)
  const playIntentRef = useRef(false)
  const playRequestRef = useRef(0)
  const [legacyCapture] = useState(() => captureLegacyMusicBrowserState())
  const [legacyCloudSaved, setLegacyCloudSaved] = useState(() =>
    readLegacyMusicCloudReceipt()?.capturedAt === legacyCapture.initial?.capturedAt
  )

  const [pieceIndex, setPieceIndex] = useState(0)
  const [catalogPieces, setCatalogPieces] = useState<Piece[]>([])
  const [candidateId, setCandidateId] = useState(pieces[0].candidates[0].id)
  const [pieceRatings, setPieceRatings] = useState<Record<string, Rating>>(() => loadObject(PIECE_RATING_KEY, {}))
  const [qualityRatings, setQualityRatings] = useState<Record<string, Rating>>(() => loadObject(QUALITY_KEY, {}))
  const [performanceRatings, setPerformanceRatings] = useState<Record<string, Rating>>(() => loadObject(PERFORMANCE_KEY, {}))
  const [notes, setNotes] = useState<Record<string, string>>(() => loadObject(NOTE_KEY, {}))
  const [rejected, setRejected] = useState<Record<string, boolean>>(() => loadObject(REJECTED_KEY, {}))
  const [confirmedEmotions, setConfirmedEmotions] = useState<Record<string, Emotion[]>>(() => loadObject(CONFIRMED_EMOTION_KEY, {}))
  const [suppressedEmotions, setSuppressedEmotions] = useState<Record<string, Emotion[]>>(() => loadObject(SUPPRESSED_EMOTION_KEY, {}))
  const [discovered, setDiscovered] = useState<Record<string, Candidate[]>>(() => loadObject(DISCOVERED_KEY, {}))
  const [interests, setInterests] = useState<string[]>(() => loadObject(INTEREST_KEY, ['Beautiful orchestral','Ambient game','Piano']))
  const [request, setRequest] = useState(() => localStorage.getItem(REQUEST_KEY) || 'Beautiful, high-quality music for games')
  const [mode, setMode] = useState<'listen'|'browse'|'hunt'>('listen')
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogSearch, setCatalogSearch] = useState('')
  const [catalogReviewFilter, setCatalogReviewFilter] = useState<CatalogReviewFilter>('New')
  const [catalogModality, setCatalogModality] = useState<'All' | Modality>('All')
  const [trashedCatalogIds, setTrashedCatalogIds] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(Object.keys(loadObject<Record<string, TrashSyncEntry>>(TRASH_SYNC_QUEUE_KEY, {})).map(id => [id, true]))
  )
  const [playing, setPlaying] = useState(false)
  const [playPending, setPlayPending] = useState(false)
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
    const initial = legacyCapture.initial
    if (!initial || initial.summary.keyCount <= 0 || legacyCloudSaved) return

    let cancelled = false
    const upload = async () => {
      try {
        const receipt = await uploadLegacyMusicInitialCapture(pin, initial)
        if (receipt && !cancelled) setLegacyCloudSaved(true)
      } catch {
        // Keep the immutable local copy and retry on the next load or reconnect.
      }
    }

    void upload()
    const onOnline = () => void upload()
    window.addEventListener('online', onOnline)
    return () => {
      cancelled = true
      window.removeEventListener('online', onOnline)
    }
  }, [legacyCapture.initial, legacyCloudSaved, pin])

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
    const ended = () => {
      playIntentRef.current = false
      setPlaying(false)
      setPlayPending(false)
    }
    const playingNow = () => {
      if (!playIntentRef.current) return
      setPlaying(true)
      setPlayPending(false)
      setMessage('')
    }
    const waiting = () => {
      if (!playIntentRef.current) return
      setPlayPending(true)
      setMessage('Buffering…')
    }
    const error = () => {
      playIntentRef.current = false
      setPlaying(false)
      setPlayPending(false)
      setMessage('That recording failed to load.')
    }
    audio.addEventListener('timeupdate', time)
    audio.addEventListener('loadedmetadata', meta)
    audio.addEventListener('durationchange', meta)
    audio.addEventListener('ended', ended)
    audio.addEventListener('playing', playingNow)
    audio.addEventListener('waiting', waiting)
    audio.addEventListener('error', error)
    return () => {
      audio.removeEventListener('timeupdate', time)
      audio.removeEventListener('loadedmetadata', meta)
      audio.removeEventListener('durationchange', meta)
      audio.removeEventListener('ended', ended)
      audio.removeEventListener('playing', playingNow)
      audio.removeEventListener('waiting', waiting)
      audio.removeEventListener('error', error)
    }
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !current) return
    const source = candidateAudio(current)
    playRequestRef.current += 1
    playIntentRef.current = false
    audio.pause()
    setPlaying(false)
    setPlayPending(false)
    setCurrentTime(0)
    setDuration(0)
    if (!source && piece.id.startsWith('catalog:')) {
      audio.removeAttribute('src')
      audio.load()
      if (current.externalOnly) {
        setMessage('This copyrighted recording is available from its official source.')
        return
      }
      setMessage('Preparing recording…')
      void resolveCatalogAudio(piece.id.slice('catalog:'.length))
      return
    }
    audio.src = source
    audio.load()
    setMessage('')
  }, [current.id, piece.id])

  function saveLocal<T>(key: string, value: T) {
    localStorage.setItem(key, JSON.stringify(value))
    refreshLegacyMusicCapture()
  }

  function reviewQueue() {
    return loadObject<Record<string, ReviewSyncEntry>>(REVIEW_SYNC_QUEUE_KEY, {})
  }
  function suppressionQueue() {
    return loadObject<Record<string, SuppressionSyncEntry>>(SUPPRESSION_SYNC_QUEUE_KEY, {})
  }

  function trashQueue() {
    return loadObject<Record<string, TrashSyncEntry>>(TRASH_SYNC_QUEUE_KEY, {})
  }

  function catalogIdForReview(pieceId: string, sourcePage: string) {
    return catalogIdForPiece(pieceId) || catalog.find(item => item.sourcePage === sourcePage)?.id || null
  }

  function queueSuppressionSync(pieceId: string, sourcePage: string, values: Emotion[]) {
    const musicId = catalogIdForReview(pieceId, sourcePage)
    if (!musicId) return
    const queue = suppressionQueue()
    queue[musicId] = { musicId, sourcePage, suppressedEmotions:values, updatedAt:Date.now() }
    saveLocal(SUPPRESSION_SYNC_QUEUE_KEY, queue)
    void flushSuppressionQueue()
  }

  async function flushSuppressionQueue() {
    const queued = suppressionQueue()
    for (const [musicId, entry] of Object.entries(queued)) {
      const { error } = await supabase.rpc('lab_music_library_emotion_suppression_write', {
        pin,
        music_id:musicId,
        suppressed_emotions_value:entry.suppressedEmotions,
      })
      if (error) return
      const latest = suppressionQueue()
      if (latest[musicId]?.updatedAt === entry.updatedAt) {
        delete latest[musicId]
        saveLocal(SUPPRESSION_SYNC_QUEUE_KEY, latest)
      }
    }
  }

  function queueTrashSync(musicId: string, sourcePage: string) {
    const queue = trashQueue()
    queue[musicId] = { musicId, sourcePage, updatedAt:Date.now() }
    saveLocal(TRASH_SYNC_QUEUE_KEY, queue)
    setTrashedCatalogIds(current => ({ ...current, [musicId]:true }))
    void flushTrashQueue()
  }

  async function flushTrashQueue() {
    const queued = trashQueue()
    for (const [musicId, entry] of Object.entries(queued)) {
      const { error } = await supabase.rpc('lab_music_library_trash', { pin, music_id:musicId })
      if (error) return
      const latest = trashQueue()
      if (latest[musicId]?.updatedAt === entry.updatedAt) {
        delete latest[musicId]
        saveLocal(TRASH_SYNC_QUEUE_KEY, latest)
      }
    }
  }


  function reviewSnapshot(pieceId: string, candidateId: string, sourcePage: string, overrides: ReviewOverrides = {}): ReviewSyncEntry {
    const has = (key: keyof ReviewOverrides) => Object.prototype.hasOwnProperty.call(overrides, key)
    return {
      sourcePage,
      pieceRating:has('pieceRating') ? overrides.pieceRating ?? null : pieceRatings[pieceId] ?? null,
      soundRating:has('soundRating') ? overrides.soundRating ?? null : qualityRatings[candidateId] ?? null,
      performanceRating:has('performanceRating') ? overrides.performanceRating ?? null : performanceRatings[candidateId] ?? null,
      note:has('note') ? overrides.note ?? '' : notes[candidateId] || '',
      confirmedEmotions:has('confirmedEmotions') ? overrides.confirmedEmotions || [] : confirmedEmotions[pieceId] || [],
      rejected:has('rejected') ? Boolean(overrides.rejected) : Boolean(rejected[candidateId]),
      updatedAt:Date.now(),
    }
  }

  function queueReviewSync(pieceId: string, candidateId: string, sourcePage: string, overrides: ReviewOverrides = {}, delayMs = 0) {
    if (!sourcePage) return
    const queue = reviewQueue()
    const musicId = catalogIdForPiece(pieceId) || undefined
    const queueKey = musicId ? 'catalog:' + musicId : sourcePage
    const existing = queue[queueKey]
    const overrideFields = Object.keys(overrides) as ReviewField[]
    const dirtyFields = Array.from(new Set<ReviewField>([
      ...(existing?.dirtyFields || []),
      ...overrideFields,
    ]))
    const snapshot = reviewSnapshot(pieceId, candidateId, sourcePage, overrides)
    const hasOverride = (field: ReviewField) => overrideFields.includes(field)
    queue[queueKey] = {
      ...snapshot,
      musicId,
      pieceRating:existing?.dirtyFields?.includes('pieceRating') && !hasOverride('pieceRating') ? existing.pieceRating : snapshot.pieceRating,
      soundRating:existing?.dirtyFields?.includes('soundRating') && !hasOverride('soundRating') ? existing.soundRating : snapshot.soundRating,
      performanceRating:existing?.dirtyFields?.includes('performanceRating') && !hasOverride('performanceRating') ? existing.performanceRating : snapshot.performanceRating,
      note:existing?.dirtyFields?.includes('note') && !hasOverride('note') ? existing.note : snapshot.note,
      confirmedEmotions:existing?.dirtyFields?.includes('confirmedEmotions') && !hasOverride('confirmedEmotions') ? existing.confirmedEmotions : snapshot.confirmedEmotions,
      rejected:existing?.dirtyFields?.includes('rejected') && !hasOverride('rejected') ? existing.rejected : snapshot.rejected,
      dirtyFields,
    }
    saveLocal(REVIEW_SYNC_QUEUE_KEY, queue)
    if (reviewSyncTimerRef.current) clearTimeout(reviewSyncTimerRef.current)
    reviewSyncTimerRef.current = setTimeout(() => void flushReviewSyncQueue(), delayMs)
  }

  async function flushReviewSyncQueue(items: CatalogItem[] = catalog) {
    if (reviewSyncingRef.current) return
    const queued = reviewQueue()
    if (!Object.keys(queued).length) return
    reviewSyncingRef.current = true
    try {
      for (const [queueKey, entry] of Object.entries(queued)) {
        const item = entry.musicId
          ? items.find(candidate => candidate.id === entry.musicId)
          : items.find(candidate => candidate.sourcePage === entry.sourcePage)
        if (!item) continue
        const dirty = new Set<ReviewField>(entry.dirtyFields || ['pieceRating','soundRating','performanceRating','note','confirmedEmotions','rejected'])
        const synced = {
          pieceRating:dirty.has('pieceRating') ? entry.pieceRating : item.rating,
          soundRating:dirty.has('soundRating') ? entry.soundRating : item.soundRating,
          performanceRating:dirty.has('performanceRating') ? entry.performanceRating : item.performanceRating,
          note:dirty.has('note') ? entry.note : item.reviewNote,
          confirmedEmotions:dirty.has('confirmedEmotions') ? entry.confirmedEmotions : item.confirmedEmotions,
          rejected:dirty.has('rejected') ? entry.rejected : item.reviewRejected,
        }
        const { error } = await supabase.rpc('lab_music_library_review_write', {
          pin,
          music_id:item.id,
          piece_rating:synced.pieceRating,
          sound_rating_value:synced.soundRating,
          performance_rating_value:synced.performanceRating,
          note_value:synced.note,
          confirmed_emotions_value:synced.confirmedEmotions,
          rejected_value:synced.rejected,
        })
        if (error) throw error
        const latest = reviewQueue()
        if (latest[queueKey]?.updatedAt === entry.updatedAt) {
          delete latest[queueKey]
          saveLocal(REVIEW_SYNC_QUEUE_KEY, latest)
        }
        setCatalog(currentItems => currentItems.map(currentItem => currentItem.id === item.id ? {
          ...currentItem,
          rating:synced.pieceRating,
          soundRating:synced.soundRating,
          performanceRating:synced.performanceRating,
          reviewNote:synced.note,
          confirmedEmotions:synced.confirmedEmotions,
          reviewRejected:synced.rejected,
          reviewUpdatedAt:new Date().toISOString(),
        } : currentItem))
      }
      void flushTrashQueue()
    } catch {
      setMessage('Saved locally · database sync pending.')
    } finally {
      reviewSyncingRef.current = false
      const remaining = reviewQueue()
      if (Object.keys(remaining).length) {
        if (reviewSyncTimerRef.current) clearTimeout(reviewSyncTimerRef.current)
        reviewSyncTimerRef.current = setTimeout(() => void flushReviewSyncQueue(), 5000)
      }
    }
  }

  function hydrateAndBackfillReviews(incoming: CatalogItem[]) {
    const pending = reviewQueue()
    const nextPieceRatings = { ...pieceRatings }
    const nextQualityRatings = { ...qualityRatings }
    const nextPerformanceRatings = { ...performanceRatings }
    const nextNotes = { ...notes }
    const nextEmotions = { ...confirmedEmotions }
    const nextRejected = { ...rejected }
    let changed = false

    for (const item of incoming) {
      const catalogPieceKey = 'catalog:' + item.id
      const catalogCandidateKey = 'catalog-candidate:' + item.id
      const legacyPiece = pieces.find(candidatePiece => candidatePiece.candidates.some(candidate => candidate.sourcePage === item.sourcePage))
      const legacyCandidate = legacyPiece?.candidates.find(candidate => candidate.sourcePage === item.sourcePage)
      const hasPending = Boolean(pending['catalog:' + item.id] || pending[item.sourcePage])

      if (hasPending) continue

      if (item.reviewUpdatedAt) {
        if (item.rating !== null) {
          nextPieceRatings[catalogPieceKey] = item.rating
          if (legacyPiece) nextPieceRatings[legacyPiece.id] = item.rating
        }
        if (item.soundRating !== null) {
          nextQualityRatings[catalogCandidateKey] = item.soundRating
          if (legacyCandidate) nextQualityRatings[legacyCandidate.id] = item.soundRating
        }
        if (item.performanceRating !== null) {
          nextPerformanceRatings[catalogCandidateKey] = item.performanceRating
          if (legacyCandidate) nextPerformanceRatings[legacyCandidate.id] = item.performanceRating
        }
        nextNotes[catalogCandidateKey] = item.reviewNote
        if (legacyCandidate) nextNotes[legacyCandidate.id] = item.reviewNote
        nextEmotions[catalogPieceKey] = item.confirmedEmotions
        if (legacyPiece) nextEmotions[legacyPiece.id] = item.confirmedEmotions
        if (item.reviewRejected) {
          nextRejected[catalogCandidateKey] = true
          if (legacyCandidate) nextRejected[legacyCandidate.id] = true
        } else {
          delete nextRejected[catalogCandidateKey]
          if (legacyCandidate) delete nextRejected[legacyCandidate.id]
        }
        changed = true
        continue
      }

      const localPieceRating = legacyPiece ? pieceRatings[legacyPiece.id] : pieceRatings[catalogPieceKey]
      const localSoundRating = legacyCandidate ? qualityRatings[legacyCandidate.id] : qualityRatings[catalogCandidateKey]
      const localPerformanceRating = legacyCandidate ? performanceRatings[legacyCandidate.id] : performanceRatings[catalogCandidateKey]
      const localNote = legacyCandidate ? notes[legacyCandidate.id] : notes[catalogCandidateKey]
      const localEmotions = legacyPiece ? confirmedEmotions[legacyPiece.id] : confirmedEmotions[catalogPieceKey]
      const localRejected = legacyCandidate ? rejected[legacyCandidate.id] : rejected[catalogCandidateKey]

      if (item.rating !== null) {
        nextPieceRatings[catalogPieceKey] = item.rating
        if (legacyPiece && localPieceRating === undefined) nextPieceRatings[legacyPiece.id] = item.rating
      } else if (localPieceRating !== undefined) {
        nextPieceRatings[catalogPieceKey] = localPieceRating
      }
      if (item.soundRating !== null) {
        nextQualityRatings[catalogCandidateKey] = item.soundRating
        if (legacyCandidate && localSoundRating === undefined) nextQualityRatings[legacyCandidate.id] = item.soundRating
      } else if (localSoundRating !== undefined) {
        nextQualityRatings[catalogCandidateKey] = localSoundRating
      }
      if (item.performanceRating !== null) {
        nextPerformanceRatings[catalogCandidateKey] = item.performanceRating
        if (legacyCandidate && localPerformanceRating === undefined) nextPerformanceRatings[legacyCandidate.id] = item.performanceRating
      } else if (localPerformanceRating !== undefined) {
        nextPerformanceRatings[catalogCandidateKey] = localPerformanceRating
      }
      if (item.reviewNote) {
        nextNotes[catalogCandidateKey] = item.reviewNote
        if (legacyCandidate && !localNote) nextNotes[legacyCandidate.id] = item.reviewNote
      } else if (localNote) {
        nextNotes[catalogCandidateKey] = localNote
      }
      if (item.confirmedEmotions.length) {
        nextEmotions[catalogPieceKey] = item.confirmedEmotions
        if (legacyPiece && !(localEmotions || []).length) nextEmotions[legacyPiece.id] = item.confirmedEmotions
      } else if ((localEmotions || []).length) {
        nextEmotions[catalogPieceKey] = localEmotions || []
      }
      if (item.reviewRejected) {
        nextRejected[catalogCandidateKey] = true
        if (legacyCandidate && !localRejected) nextRejected[legacyCandidate.id] = true
      } else if (localRejected) {
        nextRejected[catalogCandidateKey] = true
      }

      const hasLegacyReview = localPieceRating !== undefined
        || localSoundRating !== undefined
        || localPerformanceRating !== undefined
        || Boolean(localNote)
        || Boolean((localEmotions || []).length)
        || Boolean(localRejected)

      if (hasLegacyReview) {
        const dirtyFields: ReviewField[] = []
        if (item.rating === null && localPieceRating !== undefined) dirtyFields.push('pieceRating')
        if (item.soundRating === null && localSoundRating !== undefined) dirtyFields.push('soundRating')
        if (item.performanceRating === null && localPerformanceRating !== undefined) dirtyFields.push('performanceRating')
        if (!item.reviewNote && localNote) dirtyFields.push('note')
        if (!item.confirmedEmotions.length && (localEmotions || []).length) dirtyFields.push('confirmedEmotions')
        if (!item.reviewRejected && localRejected) dirtyFields.push('rejected')
        if (dirtyFields.length) {
          const queue = reviewQueue()
          queue['catalog:' + item.id] = {
            sourcePage:item.sourcePage,
            musicId:item.id,
            pieceRating:item.rating ?? localPieceRating ?? null,
            soundRating:item.soundRating ?? localSoundRating ?? null,
            performanceRating:item.performanceRating ?? localPerformanceRating ?? null,
            note:item.reviewNote || localNote || '',
            confirmedEmotions:item.confirmedEmotions.length ? item.confirmedEmotions : localEmotions || [],
            rejected:item.reviewRejected || Boolean(localRejected),
            dirtyFields,
            updatedAt:Date.now(),
          }
          saveLocal(REVIEW_SYNC_QUEUE_KEY, queue)
        }
      }
      changed = true
    }

    if (changed) {
      setPieceRatings(nextPieceRatings)
      setQualityRatings(nextQualityRatings)
      setPerformanceRatings(nextPerformanceRatings)
      setNotes(nextNotes)
      setConfirmedEmotions(nextEmotions)
      setRejected(nextRejected)
      saveLocal(PIECE_RATING_KEY, nextPieceRatings)
      saveLocal(QUALITY_KEY, nextQualityRatings)
      saveLocal(PERFORMANCE_KEY, nextPerformanceRatings)
      saveLocal(NOTE_KEY, nextNotes)
      saveLocal(CONFIRMED_EMOTION_KEY, nextEmotions)
      saveLocal(REJECTED_KEY, nextRejected)
    }
  }

  function hydrateSuppressedEmotions(incoming: CatalogItem[]) {
    const pending = suppressionQueue()
    const queued = suppressionQueue()
    const next = { ...suppressedEmotions }
    let changed = false
    let queueChanged = false

    for (const item of incoming) {
      if (pending[item.id]) continue
      const catalogPieceKey = 'catalog:' + item.id
      const legacyPiece = pieces.find(candidatePiece => candidatePiece.candidates.some(candidate => candidate.sourcePage === item.sourcePage))
      const localValues = legacyPiece ? suppressedEmotions[legacyPiece.id] : suppressedEmotions[catalogPieceKey]

      if (item.suppressedEmotions.length) {
        next[catalogPieceKey] = item.suppressedEmotions
        if (legacyPiece) next[legacyPiece.id] = item.suppressedEmotions
        changed = true
        continue
      }

      if ((localValues || []).length) {
        next[catalogPieceKey] = localValues || []
        if (legacyPiece) next[legacyPiece.id] = localValues || []
        queued[item.id] = {
          musicId:item.id,
          sourcePage:item.sourcePage,
          suppressedEmotions:localValues || [],
          updatedAt:Date.now(),
        }
        changed = true
        queueChanged = true
      }
    }

    if (changed) {
      setSuppressedEmotions(next)
      saveLocal(SUPPRESSED_EMOTION_KEY, next)
    }
    if (queueChanged) saveLocal(SUPPRESSION_SYNC_QUEUE_KEY, queued)
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
        rights_verified?:boolean; rating?:number | null; sound_rating?:number | null; performance_rating?:number | null;
        review_note?:string | null; confirmed_emotions?:string[] | null; suppressed_emotions?:string[] | null; review_rejected?:boolean | null;
        review_updated_at?:string | null; taste_notes?:string | null
      }>
      const incoming: CatalogItem[] = rows.map(row => ({
        id:row.id,
        composer:row.composer || 'Unknown composer',
        workTitle:row.work_title || 'Untitled',
        movementTitle:row.movement_title || '',
        title:[row.work_title, row.movement_title].filter(Boolean).join(' — '),
        creator:row.performer || row.composer || 'Unknown artist',
        modality:inferCatalogModality(row.taste_notes || ''),
        license:row.license || (row.rights_verified ? 'Rights verified' : 'Rights review pending'),
        audioUrl:row.recording_url || '',
        sourcePage:row.source_url,
        source:row.source_name || 'Curated library',
        description:row.taste_notes || '',
        rightsVerified:Boolean(row.rights_verified),
        externalOnly:!row.recording_url && /official stream|official source/i.test(row.license || ''),
        rating:typeof row.rating === 'number' && row.rating >= 0 && row.rating <= 3 ? row.rating as Rating : null,
        soundRating:typeof row.sound_rating === 'number' && row.sound_rating >= 0 && row.sound_rating <= 3 ? row.sound_rating as Rating : null,
        performanceRating:typeof row.performance_rating === 'number' && row.performance_rating >= 0 && row.performance_rating <= 3 ? row.performance_rating as Rating : null,
        reviewNote:row.review_note || '',
        confirmedEmotions:Array.isArray(row.confirmed_emotions) ? row.confirmed_emotions.filter((emotion): emotion is Emotion => emotions.includes(emotion as Emotion)) : [],
        suppressedEmotions:Array.isArray(row.suppressed_emotions) ? row.suppressed_emotions.filter((emotion): emotion is Emotion => emotions.includes(emotion as Emotion)) : [],
        reviewRejected:Boolean(row.review_rejected),
        reviewUpdatedAt:row.review_updated_at || null,
      }))
      setCatalog(incoming)
      hydrateAndBackfillReviews(incoming)
      hydrateSuppressedEmotions(incoming)
      void flushReviewSyncQueue(incoming)
      void flushSuppressionQueue()
      void flushTrashQueue()
      setMessage(incoming.length ? 'Loaded ' + incoming.length + ' curated tracks from the production library.' : 'The curated library is empty.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load curated music library.')
    } finally {
      setCatalogLoading(false)
    }
  }

  async function searchNow() {
    setCatalogSearch('')
    setCatalogReviewFilter('New')
    setCatalogModality('All')
    await loadCatalog(true, true)
    setMode('browse')
  }

  function catalogPieceFor(item: CatalogItem): Piece {
    return {
      id:'catalog:' + item.id,
      composer:item.creator || 'Unknown artist',
      title:item.title,
      mood:item.modality + ' · ' + item.source,
      aiEmotions:inferredEmotions(item.modality),
      candidates:[{
        id:'catalog-candidate:' + item.id,
        performer:item.creator || 'Unknown artist',
        modality:item.modality,
        license:item.license,
        audioUrl:item.audioUrl,
        sourcePage:item.sourcePage,
        source:item.source,
        externalOnly:item.externalOnly,
        matchConfidence:'confirmed',
      }],
    }
  }

  async function resolveCatalogAudio(catalogId: string): Promise<string | null> {
    const inFlight = resolvingCatalogRef.current.get(catalogId)
    if (inFlight) return inFlight

    const item = catalog.find(row => row.id === catalogId)
    if (!item || item.externalOnly) return null
    if (item.audioUrl) return item.audioUrl

    const request = (async () => {
      setMessage('Preparing recording…')
      try {
        const response = await fetch('/api/music-resolve', {
          method:'POST',
          headers:{ 'Content-Type':'application/json', 'x-review-pin':pin },
          body:JSON.stringify({ sourceUrl:item.sourcePage, sourceName:item.source, title:item.title }),
        })
        const result = await response.json() as { audioUrl?:string; error?:string }
        if (!response.ok || !result.audioUrl) throw new Error(result.error || 'Could not load this recording.')
        const audioUrl = result.audioUrl
        setCatalog(currentItems => currentItems.map(row => row.id === catalogId ? { ...row, audioUrl } : row))
        setCatalogPieces(currentPieces => currentPieces.map(currentPiece => {
          if (currentPiece.id !== 'catalog:' + catalogId) return currentPiece
          return {
            ...currentPiece,
            candidates:currentPiece.candidates.map(candidate =>
              candidate.id === 'catalog-candidate:' + catalogId ? { ...candidate, audioUrl } : candidate
            ),
          }
        }))
        return audioUrl
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Could not load this recording.')
        return null
      } finally {
        resolvingCatalogRef.current.delete(catalogId)
      }
    })()

    resolvingCatalogRef.current.set(catalogId, request)
    return request
  }

  function adoptCatalogItem(item: CatalogItem) {
    const queue = (filteredCatalog.length ? filteredCatalog : catalog)
    const queueItems = queue.some(row => row.id === item.id) ? queue : [item, ...queue]
    const queuePieces = queueItems.map(catalogPieceFor)
    const selectedIndex = Math.max(0, queueItems.findIndex(row => row.id === item.id))
    setCatalogPieces(queuePieces)
    setPieceIndex(pieces.length + selectedIndex)
    setCandidateId('catalog-candidate:' + item.id)
    setMode('listen')
  }

  function candidateListFor(modality: Modality) {
    return allCandidates.filter(candidate => candidate.modality === modality && !rejected[candidate.id])
  }

  async function findAlternateVersion() {
    const modality = current.modality
    const key = piece.id + '::' + modality
    if (alternateSearchRef.current.has(key)) return
    alternateSearchRef.current.add(key)
    setMessage('Loved piece · finding another ' + modality.toLowerCase() + ' version…')

    try {
      const response = await fetch('/api/music-hunt', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'x-review-pin':pin },
        body:JSON.stringify({
          title:piece.title,
          composer:piece.composer,
          modality,
          exclude:allCandidates.map(candidate => candidate.sourcePage),
        }),
      })
      const result = await response.json() as {
        candidates?: Array<{
          id:string
          performer:string
          license:string
          audioUrl:string
          sourcePage:string
          source:string
          confidence?:'confirmed' | 'possible'
        }>
        error?:string
      }
      if (!response.ok) throw new Error(result.error || 'Music search failed.')

      const known = new Set(allCandidates.map(candidate => candidate.sourcePage))
      const fresh = (result.candidates || []).filter(candidate =>
        candidate.audioUrl && candidate.sourcePage && !known.has(candidate.sourcePage)
      )
      if (!fresh.length) {
        setMessage('No better reusable ' + modality.toLowerCase() + ' version found this time.')
        return
      }

      const newCandidates: Candidate[] = fresh.slice(0,5).map(candidate => ({
        id:candidate.id,
        performer:candidate.performer || 'Unknown performer',
        modality,
        license:candidate.license,
        audioUrl:candidate.audioUrl,
        sourcePage:candidate.sourcePage,
        source:candidate.source,
        matchConfidence:candidate.confidence || 'confirmed',
      }))
      const nextDiscovered = {
        ...discovered,
        [piece.id]:[...(discovered[piece.id] || []), ...newCandidates],
      }
      setDiscovered(nextDiscovered)
      saveLocal(DISCOVERED_KEY, nextDiscovered)
      setMessage('Found ' + newCandidates.length + ' alternate ' + modality.toLowerCase() + (newCandidates.length === 1 ? ' version.' : ' versions.') + ' Choose one above.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Music search failed.')
    } finally {
      alternateSearchRef.current.delete(key)
    }
  }

  function maybeFindLovedAlternate(pieceScore: Rating | undefined, soundScore: Rating | undefined, performanceScore: Rating | undefined) {
    if (pieceScore !== 3) return false
    if ((soundScore !== undefined && soundScore <= 1) || (performanceScore !== undefined && performanceScore <= 1)) {
      void findAlternateVersion()
      return true
    }
    return false
  }

  async function togglePlay() {
    if (current.externalOnly) {
      window.open(current.sourcePage, '_blank', 'noopener,noreferrer')
      setMessage('Opened the official source in a new tab.')
      return
    }

    const audio = audioRef.current
    if (!audio) return

    if (playing || playPending || playIntentRef.current) {
      playRequestRef.current += 1
      playIntentRef.current = false
      audio.pause()
      setPlaying(false)
      setPlayPending(false)
      setMessage(playPending ? 'Playback cancelled.' : 'Paused.')
      return
    }

    const requestId = ++playRequestRef.current
    playIntentRef.current = true
    setPlayPending(true)
    setMessage('Loading…')

    try {
      let source = candidateAudio(current)
      if (!source && piece.id.startsWith('catalog:')) {
        source = await resolveCatalogAudio(piece.id.slice('catalog:'.length)) || ''
      }
      if (!source) throw new Error('Could not load this recording.')
      if (!playIntentRef.current || requestId !== playRequestRef.current) return

      if (audio.src !== source) {
        audio.src = source
        audio.load()
      }
      await audio.play()
      if (!playIntentRef.current || requestId !== playRequestRef.current) {
        audio.pause()
        return
      }
      setPlaying(true)
      setPlayPending(false)
      setMessage('')
    } catch (error) {
      if (requestId !== playRequestRef.current) return
      playIntentRef.current = false
      setPlaying(false)
      setPlayPending(false)
      setMessage(error instanceof Error ? error.message : 'Could not start playback.')
    }
  }

  function stop() {
    const audio = audioRef.current
    if (!audio) return
    playRequestRef.current += 1
    playIntentRef.current = false
    audio.pause()
    audio.currentTime = 0
    setPlaying(false)
    setPlayPending(false)
    setCurrentTime(0)
    setMessage('')
  }

  function nextSwipeFrame() {
    return new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  }

  function changePiece(delta: number) {
    if (catalogPieces.length && piece.id.startsWith('catalog:')) {
      setPieceIndex(index => {
        const currentOffset = Math.max(0, index - pieces.length)
        const nextOffset = (currentOffset + delta + catalogPieces.length) % catalogPieces.length
        return pieces.length + nextOffset
      })
      return
    }
    setPieceIndex(index => (index + delta + pieceList.length) % pieceList.length)
  }

  async function animatePieceCard(delta: number, startX = 0) {
    if (swipeMotionBusyRef.current) return
    const card = listenCardRef.current
    if (!card || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      changePiece(delta)
      return
    }

    swipeMotionBusyRef.current = true
    card.style.pointerEvents = 'none'
    const edge = delta > 0 ? '-112%' : '112%'
    const start = `translateX(${startX}px) scale(${1 - Math.min(Math.abs(startX) / 2400, .02)})`
    const outgoing = card.animate(
      [{ transform:start, opacity:1 }, { transform:`translateX(${edge}) scale(.97)`, opacity:.28 }],
      { duration:startX ? 150 : 190, easing:'cubic-bezier(.4,0,.2,1)', fill:'forwards' }
    )

    try {
      await outgoing.finished
      changePiece(delta)
      await nextSwipeFrame()
      const incoming = listenCardRef.current
      if (incoming) {
        const from = delta > 0 ? '112%' : '-112%'
        const entering = incoming.animate(
          [{ transform:`translateX(${from}) scale(.97)`, opacity:.28 }, { transform:'translateX(0) scale(1)', opacity:1 }],
          { duration:230, easing:'cubic-bezier(.2,.75,.2,1)', fill:'forwards' }
        )
        outgoing.cancel()
        await entering.finished
        entering.cancel()
      }
    } finally {
      swipeMotionBusyRef.current = false
      const active = listenCardRef.current
      if (active) {
        active.style.transform = ''
        active.style.opacity = ''
        active.style.pointerEvents = ''
      }
    }
  }

  function stepPiece(delta: number, startX = 0) {
    void animatePieceCard(delta, startX)
  }

  function snapPieceCardBack(startX: number) {
    const card = listenCardRef.current
    if (!card) return
    const snap = card.animate(
      [{ transform:`translateX(${startX}px)`, opacity:card.style.opacity || '1' }, { transform:'translateX(0)', opacity:1 }],
      { duration:150, easing:'ease-out' }
    )
    void snap.finished.finally(() => {
      card.style.transform = ''
      card.style.opacity = ''
    })
  }

  function catalogIdForPiece(pieceId: string) {
    return pieceId.startsWith('catalog:') ? pieceId.slice('catalog:'.length) : null
  }

  function ratePiece(value: Rating) {
    const next = { ...pieceRatings, [piece.id]: value }
    setPieceRatings(next)
    saveLocal(PIECE_RATING_KEY, next)

    const catalogId = catalogIdForPiece(piece.id)
    if (catalogId) setCatalog(items => items.map(item => item.id === catalogId ? { ...item, rating:value } : item))
    queueReviewSync(piece.id, current.id, current.sourcePage, { pieceRating:value })
    if (!maybeFindLovedAlternate(value, qualityRatings[current.id], performanceRatings[current.id])) {
      setMessage('Piece rating saved.')
    }
  }

  function onListenTouchStart(event: TouchEvent<HTMLElement>) {
    const touch = event.touches[0]
    if (!touch) return
    const target = event.target as HTMLElement
    swipeStartRef.current = {
      x:touch.clientX,
      y:touch.clientY,
      interactive:Boolean(target.closest('button,input,textarea,a')),
    }
    swipeDxRef.current = 0
  }

  function onListenTouchMove(event: TouchEvent<HTMLElement>) {
    const start = swipeStartRef.current
    if (!start || start.interactive || swipeMotionBusyRef.current) return
    const touch = event.touches[0]
    if (!touch) return
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (Math.abs(dx) < Math.abs(dy) * 1.1) return
    swipeDxRef.current = dx
    const card = listenCardRef.current
    if (card) {
      card.style.transform = `translateX(${dx}px) rotate(${dx * .012}deg)`
      card.style.opacity = String(Math.max(.72, 1 - Math.abs(dx) / 700))
    }
  }

  function onListenTouchEnd(event: TouchEvent<HTMLElement>) {
    const start = swipeStartRef.current
    swipeStartRef.current = null
    if (!start || start.interactive) return
    const touch = event.changedTouches[0]
    if (!touch) return
    const dx = swipeDxRef.current || touch.clientX - start.x
    const dy = touch.clientY - start.y
    swipeDxRef.current = 0
    if (Math.abs(dx) >= 52 && Math.abs(dx) >= Math.abs(dy) * 1.25) {
      stepPiece(dx < 0 ? 1 : -1, dx)
      return
    }
    snapPieceCardBack(dx)
  }

  function onListenTouchCancel() {
    const dx = swipeDxRef.current
    swipeStartRef.current = null
    swipeDxRef.current = 0
    snapPieceCardBack(dx)
  }

  function rateQuality(value: Rating) {
    const next = { ...qualityRatings, [current.id]: value }
    setQualityRatings(next)
    saveLocal(QUALITY_KEY, next)
    queueReviewSync(piece.id, current.id, current.sourcePage, { soundRating:value })
    if (!maybeFindLovedAlternate(pieceRatings[piece.id], value, performanceRatings[current.id])) {
      setMessage('Sound rating saved.')
    }
  }

  function ratePerformance(value: Rating) {
    const nextRatings = { ...performanceRatings, [current.id]: value }
    setPerformanceRatings(nextRatings)
    saveLocal(PERFORMANCE_KEY, nextRatings)
    queueReviewSync(piece.id, current.id, current.sourcePage, { performanceRating:value })

    if (!maybeFindLovedAlternate(pieceRatings[piece.id], qualityRatings[current.id], value)) {
      setMessage(value === 3 ? 'Preferred performance saved.' : 'Performance rating saved.')
    }
  }

  function toggleEmotion(emotion: Emotion) {
    const currentConfirmed = confirmedEmotions[piece.id] || []
    const currentSuppressed = suppressedEmotions[piece.id] || []
    const aiSuggested = piece.aiEmotions.includes(emotion)

    if (currentConfirmed.includes(emotion)) {
      const nextConfirmedList = currentConfirmed.filter(item => item !== emotion)
      const nextSuppressedList = aiSuggested
        ? [...new Set([...currentSuppressed, emotion])]
        : currentSuppressed
      const nextConfirmed = { ...confirmedEmotions, [piece.id]:nextConfirmedList }
      const nextSuppressed = { ...suppressedEmotions, [piece.id]:nextSuppressedList }
      setConfirmedEmotions(nextConfirmed)
      setSuppressedEmotions(nextSuppressed)
      saveLocal(CONFIRMED_EMOTION_KEY, nextConfirmed)
      saveLocal(SUPPRESSED_EMOTION_KEY, nextSuppressed)
      queueReviewSync(piece.id, current.id, current.sourcePage, { confirmedEmotions:nextConfirmedList })
      queueSuppressionSync(piece.id, current.sourcePage, nextSuppressedList)
      return
    }

    if (currentSuppressed.includes(emotion)) {
      const nextSuppressedList = currentSuppressed.filter(item => item !== emotion)
      const nextSuppressed = { ...suppressedEmotions, [piece.id]:nextSuppressedList }
      setSuppressedEmotions(nextSuppressed)
      saveLocal(SUPPRESSED_EMOTION_KEY, nextSuppressed)
      queueSuppressionSync(piece.id, current.sourcePage, nextSuppressedList)
      return
    }

    const nextConfirmedList = [...currentConfirmed, emotion]
    const nextConfirmed = { ...confirmedEmotions, [piece.id]:nextConfirmedList }
    setConfirmedEmotions(nextConfirmed)
    saveLocal(CONFIRMED_EMOTION_KEY, nextConfirmed)
    queueReviewSync(piece.id, current.id, current.sourcePage, { confirmedEmotions:nextConfirmedList })
  }

  function trashCurrent() {
    const musicId = catalogIdForPiece(piece.id)
    const hasZero = pieceRatings[piece.id] === 0 || qualityRatings[current.id] === 0 || performanceRatings[current.id] === 0
    if (!musicId || !hasZero) return
    queueTrashSync(musicId, current.sourcePage)
    setCatalog(items => items.filter(item => item.id !== musicId))
    setCatalogPieces(items => items.filter(item => item.id !== piece.id))
    setMessage('Moved to recoverable trash.')
    setMode('browse')
  }

  function saveNote(value: string) {
    const next = { ...notes, [current.id]: value }
    setNotes(next)
    saveLocal(NOTE_KEY, next)
    queueReviewSync(piece.id, current.id, current.sourcePage, { note:value }, 700)
  }

  async function toggleRecording() {
    if (transcribing) return
    if (!recording) {
      try {
        recordingCandidateRef.current = current.id
        recordingPieceRef.current = piece.id
        recordingSourcePageRef.current = current.sourcePage
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
    const targetPieceId = recordingPieceRef.current
    const targetSourcePage = recordingSourcePageRef.current
    if (!session || !targetId || !targetPieceId || !targetSourcePage) return
    recordingRef.current = null
    recordingCandidateRef.current = null
    recordingPieceRef.current = null
    recordingSourcePageRef.current = null
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
      queueReviewSync(targetPieceId, targetId, targetSourcePage, { note:nextText })
      setMessage('Voice note added.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Transcription failed.')
    } finally {
      setTranscribing(false)
    }
  }

  const interestOptions = ['Beautiful orchestral','Ambient game','Jazz','Guitar','Synth pads','8-bit / chiptune','Electronic / dubstep','Cinematic','Piano','Strange / experimental']
  const currentVersions = candidateListFor(currentModality)
  const activeCatalogId = current.id.startsWith('catalog-candidate:') ? current.id.slice('catalog-candidate:'.length) : null
  const activeCatalogItem = activeCatalogId ? catalog.find(item => item.id === activeCatalogId) || null : null
  const catalogVersions = activeCatalogItem
    ? catalog.filter(item => sameCatalogComposition(item, activeCatalogItem) && !trashedCatalogIds[item.id])
    : []

  function normalizeVersionText(value: string) {
    return value.trim().toLowerCase().replace(/\s+/g, ' ')
  }

  function sameCatalogComposition(a: CatalogItem, b: CatalogItem) {
    return normalizeVersionText(a.composer) === normalizeVersionText(b.composer)
      && normalizeVersionText(a.workTitle) === normalizeVersionText(b.workTitle)
      && normalizeVersionText(a.movementTitle) === normalizeVersionText(b.movementTitle)
  }

  function catalogVersionScore(item: CatalogItem) {
    const values = catalogReviewValues(item)
    const parts = [values.piece, values.sound, values.performance]
    return parts.every(value => value !== undefined)
      ? parts.join('/')
      : parts.some(value => value !== undefined)
        ? parts.map(value => value ?? '–').join('/')
        : 'Unrated'
  }

  function switchCatalogVersion(item: CatalogItem) {
    const pieceId = 'catalog:' + item.id
    const existingIndex = catalogPieces.findIndex(candidatePiece => candidatePiece.id === pieceId)
    if (existingIndex >= 0) {
      setPieceIndex(pieces.length + existingIndex)
      setCandidateId('catalog-candidate:' + item.id)
      setMessage('Switched version.')
      return
    }

    setCatalogPieces(currentPieces => {
      const nextPieces = [...currentPieces, catalogPieceFor(item)]
      setPieceIndex(pieces.length + nextPieces.length - 1)
      return nextPieces
    })
    setCandidateId('catalog-candidate:' + item.id)
    setMessage('Added this version to the listening queue.')
  }

  function catalogReviewValues(item: CatalogItem) {
    const pieceKey = 'catalog:' + item.id
    const candidateKey = 'catalog-candidate:' + item.id
    const legacyPiece = pieces.find(candidatePiece => candidatePiece.candidates.some(candidate => candidate.sourcePage === item.sourcePage))
    const legacyCandidate = legacyPiece?.candidates.find(candidate => candidate.sourcePage === item.sourcePage)
    return {
      piece:pieceRatings[pieceKey] ?? (legacyPiece ? pieceRatings[legacyPiece.id] : undefined) ?? item.rating ?? undefined,
      sound:qualityRatings[candidateKey] ?? (legacyCandidate ? qualityRatings[legacyCandidate.id] : undefined) ?? item.soundRating ?? undefined,
      performance:performanceRatings[candidateKey] ?? (legacyCandidate ? performanceRatings[legacyCandidate.id] : undefined) ?? item.performanceRating ?? undefined,
    }
  }

  function catalogTouched(item: CatalogItem) {
    const values = catalogReviewValues(item)
    return values.piece !== undefined || values.sound !== undefined || values.performance !== undefined
  }

  function catalogLoved(item: CatalogItem) {
    const values = catalogReviewValues(item)
    return values.piece === 3 && values.sound === 3 && values.performance === 3
  }

  const filteredCatalog = catalog.filter(item => {
    if (trashedCatalogIds[item.id]) return false
    const text = (item.title + ' ' + item.creator + ' ' + item.source + ' ' + (item.description || '')).toLowerCase()
    const matchesSearch = !catalogSearch.trim() || text.includes(catalogSearch.trim().toLowerCase())
    const matchesModality = catalogModality === 'All' || item.modality === catalogModality
    const touched = catalogTouched(item)
    const matchesReview = catalogReviewFilter === 'All'
      || (catalogReviewFilter === 'New' && !touched)
      || (catalogReviewFilter === 'Loved' && catalogLoved(item))
    return matchesSearch && matchesModality && matchesReview
  })

  useEffect(() => {
    if (mode === 'browse' && !catalog.length && !catalogLoading) void loadCatalog()
  }, [mode])

  useEffect(() => {
    void loadCatalog()
    const syncWhenOnline = () => {
      void flushReviewSyncQueue()
      void flushSuppressionQueue()
      void flushTrashQueue()
    }
    window.addEventListener('online', syncWhenOnline)
    return () => {
      window.removeEventListener('online', syncWhenOnline)
      if (reviewSyncTimerRef.current) clearTimeout(reviewSyncTimerRef.current)
    }
  }, [])

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

    {mode === 'listen' ? <section ref={listenCardRef} className="md-listen" onTouchStart={onListenTouchStart} onTouchMove={onListenTouchMove} onTouchEnd={onListenTouchEnd} onTouchCancel={onListenTouchCancel}>
      {catalogVersions.length > 1 ? <div className="md-version-picker">
        <small>{catalogVersions.length} versions</small>
        <div>
          {catalogVersions.map((item, versionIndex) => {
            const values = catalogReviewValues(item)
            const loved = values.piece === 3 && values.sound === 3 && values.performance === 3
            const touched = values.piece !== undefined || values.sound !== undefined || values.performance !== undefined
            const active = item.id === activeCatalogId
            return <button key={item.id} className={(loved ? 'version-best' : touched ? 'version-keep' : 'version-unrated') + (active ? ' active' : '')} onClick={() => switchCatalogVersion(item)}>
              <b>{versionIndex + 1}</b>
              <span>{catalogVersionScore(item)}</span>
            </button>
          })}
        </div>
      </div> : currentVersions.length > 1 && <div className="md-version-picker">
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
        <button className={'primary' + (playing || playPending ? ' active-play' : '') + (playPending ? ' pending-play' : '')} onClick={togglePlay} aria-pressed={playing || playPending}>{current.externalOnly ? '↗ Official' : playPending ? '❚❚ Loading…' : playing ? '❚❚ Pause' : '▶ Play'}</button>
        <button onClick={stop}>■ Stop</button>
        <button onClick={() => stepPiece(1)}>›</button>
      </div>
      <small className="md-swipe-hint">Swipe the card left or right outside the controls to move between tracks.</small>
      <div className="md-message" aria-live="polite">{message || '\u00a0'}</div>

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
            const suppressed = (suppressedEmotions[piece.id] || []).includes(emotion)
            const suggested = piece.aiEmotions.includes(emotion) && !suppressed
            const confirmed = (confirmedEmotions[piece.id] || []).includes(emotion)
            return <button key={emotion} className={(suggested ? 'suggested ' : '') + (confirmed ? 'confirmed' : '')} onClick={() => toggleEmotion(emotion)} aria-pressed={confirmed}>{emotion}</button>
          })}
        </div>
      </div>

      <div className="md-note">
        <button className={recording ? 'recording' : ''} onClick={toggleRecording} disabled={transcribing}>{recording ? '■' : '🎙'}</button>
        <textarea value={notes[current.id] || ''} onChange={event => saveNote(event.target.value)} placeholder="Type or record what you think…"/>
      </div>

      <div className="md-footer-row">
        <span>{current.license}</span>
        <div>
          {catalogIdForPiece(piece.id) && (pieceRatings[piece.id] === 0 || qualityRatings[current.id] === 0 || performanceRatings[current.id] === 0)
            && <button className="md-trash" onClick={trashCurrent}>🗑 Trash</button>}
          <a href={current.sourcePage} target="_blank" rel="noreferrer">Source ↗</a>
        </div>
      </div>
    </section> : mode === 'browse' ? <section className="md-browse">
      <div className="md-browse-head">
        <div>
          <small>CURATED PRODUCTION LIBRARY</small>
          <h1>{catalogLoading ? 'Gathering music…' : filteredCatalog.length + (catalogReviewFilter === 'Loved' ? ' loved' : catalogReviewFilter === 'New' ? ' new' : ' to try')}</h1>
        </div>
        <button onClick={() => void loadCatalog(true, true)} disabled={catalogLoading}>{catalogLoading ? '…' : '↻'}</button>
      </div>
      <div className="md-browse-search">
        <input value={catalogSearch} onChange={event => setCatalogSearch(event.target.value)} placeholder="Search title, artist, source…"/>
      </div>
      <div className="md-review-filters">
        {(['All','New','Loved'] as CatalogReviewFilter[]).map(value => <button key={value} className={(catalogReviewFilter === value ? 'active ' : '') + (value === 'New' ? 'new-filter ' : '') + (value === 'Loved' ? 'loved-filter' : '')} onClick={() => setCatalogReviewFilter(value)}>{value === 'Loved' ? '♥ LOVED' : value.toUpperCase()}</button>)}
      </div>
      <div className="md-browse-filters">
        {(['All', ...modalities] as Array<'All' | Modality>).map(value => <button key={value} className={catalogModality === value ? 'active' : ''} onClick={() => setCatalogModality(value)}>{value === 'All' ? 'ALL TYPES' : value}</button>)}
      </div>
      <div className="md-catalog-list">
        {filteredCatalog.map(item => {
          const touched = catalogTouched(item)
          const loved = catalogLoved(item)
          return <button key={item.id} className={'md-catalog-item' + (touched ? ' touched' : '') + (loved ? ' loved' : '')} onClick={() => void adoptCatalogItem(item)}>
            <span className="md-catalog-play">{item.externalOnly ? '↗' : '▶'}</span>
            <span className="md-catalog-copy"><strong>{item.title}</strong><small>{item.creator || 'Unknown artist'} · {item.modality}{item.externalOnly ? ' · official stream' : item.rightsVerified ? ' · ✓ rights' : ' · rights review'}</small></span>
            <span className="md-catalog-source">{loved ? '♥ loved' : item.source}</span>
          </button>
        })}
        {!catalogLoading && !filteredCatalog.length && <p className="md-empty">No matches in this batch. Change the filter or refresh.</p>}
      </div>
      <div className="md-repositories">
        <span>CURATED</span>
        <div>
          <span className="md-library-note">Curated production library · ▶ plays reusable/direct audio in-app · ↗ opens copyrighted music at its official source</span>
          {legacyCapture.latest && legacyCapture.latest.summary.keyCount > 0 && <span className="md-legacy-status">Browser backup ✓ · {legacyCloudSaved ? 'Cloud copy ✓' : 'Cloud copy pending…'} · {legacyCapture.latest.summary.pieceRatings + legacyCapture.latest.summary.soundRatings + legacyCapture.latest.summary.performanceRatings} ratings · {legacyCapture.latest.summary.discoveredRecordings} discovered recordings preserved</span>}
        </div>
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
