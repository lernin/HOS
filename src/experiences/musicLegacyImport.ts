export type LegacyMusicCaptureSummary = {
  keyCount: number
  pieceRatings: number
  soundRatings: number
  performanceRatings: number
  notes: number
  confirmedEmotionPieces: number
  rejectedRecordings: number
  discoveredRecordings: number
  queuedReviewWrites: number
}

export type LegacyMusicCapture = {
  version: 1
  capturedAt: string
  origin: string
  keys: Record<string, string>
  summary: LegacyMusicCaptureSummary
}

const MUSIC_PREFIX = 'hos-music-'
const IMPORT_PREFIX = 'hos-music-legacy-import-'
export const LEGACY_MUSIC_INITIAL_KEY = IMPORT_PREFIX + 'initial-v1'
export const LEGACY_MUSIC_LATEST_KEY = IMPORT_PREFIX + 'latest-v1'

function safeObject(raw: string | null): Record<string, unknown> {
  if (!raw) return {}
  try {
    const value = JSON.parse(raw)
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function objectCount(raw: string | null) {
  return Object.keys(safeObject(raw)).length
}

function discoveredCount(raw: string | null) {
  const value = safeObject(raw)
  return Object.values(value).reduce((total, candidates) => total + (Array.isArray(candidates) ? candidates.length : 0), 0)
}

function collectMusicKeys(storage: Storage) {
  const keys: Record<string, string> = {}
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (!key || !key.startsWith(MUSIC_PREFIX) || key.startsWith(IMPORT_PREFIX)) continue
    const value = storage.getItem(key)
    if (value !== null) keys[key] = value
  }
  return keys
}

function summarize(keys: Record<string, string>): LegacyMusicCaptureSummary {
  return {
    keyCount:Object.keys(keys).length,
    pieceRatings:objectCount(keys['hos-music-piece-ratings-v1'] || null),
    soundRatings:objectCount(keys['hos-music-quality-ratings-v2'] || keys['hos-music-quality-ratings-v1'] || null),
    performanceRatings:objectCount(keys['hos-music-performance-ratings-v2'] || keys['hos-music-performance-ratings-v1'] || null),
    notes:objectCount(keys['hos-music-notes-v4'] || keys['hos-music-notes-v3'] || keys['hos-music-notes-v2'] || keys['hos-music-notes-v1'] || null),
    confirmedEmotionPieces:objectCount(keys['hos-music-confirmed-emotions-v1'] || null),
    rejectedRecordings:objectCount(keys['hos-music-rejected-candidates-v1'] || null),
    discoveredRecordings:discoveredCount(keys['hos-music-discovered-candidates-v1'] || null),
    queuedReviewWrites:objectCount(keys['hos-music-review-sync-queue-v1'] || null),
  }
}

function parseCapture(raw: string | null): LegacyMusicCapture | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as LegacyMusicCapture
    return value?.version === 1 && value.keys && value.summary ? value : null
  } catch {
    return null
  }
}

export function captureLegacyMusicBrowserState(): {
  initial: LegacyMusicCapture | null
  latest: LegacyMusicCapture | null
  wroteInitial: boolean
} {
  if (typeof window === 'undefined') return { initial:null, latest:null, wroteInitial:false }

  try {
    const storage = window.localStorage
    const existingInitial = parseCapture(storage.getItem(LEGACY_MUSIC_INITIAL_KEY))
    const keys = collectMusicKeys(storage)
    const capture: LegacyMusicCapture = {
      version:1,
      capturedAt:new Date().toISOString(),
      origin:window.location.origin,
      keys,
      summary:summarize(keys),
    }

    let initial = existingInitial
    let wroteInitial = false
    if (!initial) {
      storage.setItem(LEGACY_MUSIC_INITIAL_KEY, JSON.stringify(capture))
      initial = capture
      wroteInitial = true
    }

    storage.setItem(LEGACY_MUSIC_LATEST_KEY, JSON.stringify(capture))
    return { initial, latest:capture, wroteInitial }
  } catch {
    return { initial:null, latest:null, wroteInitial:false }
  }
}

export function readLegacyMusicCapture() {
  if (typeof window === 'undefined') return null
  try {
    return parseCapture(window.localStorage.getItem(LEGACY_MUSIC_LATEST_KEY))
      || parseCapture(window.localStorage.getItem(LEGACY_MUSIC_INITIAL_KEY))
  } catch {
    return null
  }
}

export function refreshLegacyMusicCapture() {
  return captureLegacyMusicBrowserState().latest
}
