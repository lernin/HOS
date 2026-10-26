import { FINALS_SIZE, PLACEMENT_GAMES } from './pair.ts'
import { compareConservative, INITIAL_RD, INITIAL_RATING, INITIAL_VOLATILITY, rdOf } from './rank.ts'
import type { BrushImage } from './types.ts'

export const OVERALL_CATEGORY = 'overall'

/** Rating deviation at or below this counts as settled. New pictures start at 350. */
export const SETTLED_RD = 100

export type BrushCategory = {
  id: string
  label: string
  sort: number
}

export const DEFAULT_CATEGORIES: BrushCategory[] = [
  { id: 'overall', label: 'Overall', sort: 0 },
  { id: 'face', label: 'Face', sort: 1 },
  { id: 'hair', label: 'Hair', sort: 2 },
]

export type CategoryRating = {
  imageId: string
  category: string
  elo: number
  sigma: number
  volatility: number
  games: number
  wins: number
  losses: number
  close_wins: number
  close_losses: number
}

export type RankingProgress = {
  placed: number
  active: number
  settled: number
}

type Rankable = Pick<BrushImage, 'id' | 'name' | 'elo' | 'games'> & {
  sigma?: number
  trashed?: boolean
  archived?: boolean
  unreadable?: boolean
}

export function freshRating(category: string, imageId: string): CategoryRating {
  return {
    imageId,
    category,
    elo: INITIAL_RATING,
    sigma: INITIAL_RD,
    volatility: INITIAL_VOLATILITY,
    games: 0,
    wins: 0,
    losses: 0,
    close_wins: 0,
    close_losses: 0,
  }
}

export function ratingFromImage(image: BrushImage, category: string): CategoryRating {
  return {
    imageId: image.id,
    category,
    elo: image.elo,
    sigma: image.sigma,
    volatility: image.volatility ?? INITIAL_VOLATILITY,
    games: image.games,
    wins: image.wins,
    losses: image.losses,
    close_wins: image.close_wins || 0,
    close_losses: image.close_losses || 0,
  }
}

export function paintRating(image: BrushImage, rating: CategoryRating): BrushImage {
  return {
    ...image,
    elo: rating.elo,
    sigma: rating.sigma,
    volatility: rating.volatility,
    games: rating.games,
    wins: rating.wins,
    losses: rating.losses,
    close_wins: rating.close_wins,
    close_losses: rating.close_losses,
  }
}

export function scopeImages(images: BrushImage[], category: string, rows: CategoryRating[]): BrushImage[] {
  const byId = new Map(rows.filter(row => row.category === category).map(row => [row.imageId, row]))
  return images.map(image => {
    const row = byId.get(image.id)
    if (row) return paintRating(image, row)
    if (category === OVERALL_CATEGORY) return { ...image }
    return paintRating(image, freshRating(category, image.id))
  })
}

export function rememberRatings(rows: CategoryRating[], category: string, images: BrushImage[]): CategoryRating[] {
  const next = rows.filter(row => row.category !== category)
  for (const image of images) next.push(ratingFromImage(image, category))
  return next
}

/** Keep a local row when it has played more games than the server copy. */
export function preferLocalRatings(local: CategoryRating[], remote: CategoryRating[]): CategoryRating[] {
  const localByKey = new Map(local.map(row => [`${row.category}:${row.imageId}`, row]))
  const used = new Set<string>()
  const merged = remote.map(row => {
    const key = `${row.category}:${row.imageId}`
    used.add(key)
    const kept = localByKey.get(key)
    return kept && kept.games > row.games ? kept : row
  })
  for (const row of local) {
    const key = `${row.category}:${row.imageId}`
    if (!used.has(key)) merged.push(row)
  }
  return merged
}

export function activePool(images: Rankable[]) {
  return images.filter(image => !image.trashed && !image.archived && !image.unreadable)
}

export function rankingProgress(images: Rankable[]): RankingProgress {
  const pool = activePool(images)
  const placed = pool.filter(image => image.games >= PLACEMENT_GAMES).length
  const top = [...pool].sort(compareConservative).slice(0, FINALS_SIZE)
  const settledCount = top.filter(image => rdOf(image) <= SETTLED_RD).length
  return {
    placed,
    active: pool.length,
    settled: Math.round((100 * settledCount) / FINALS_SIZE),
  }
}

export function rankingLine(progress: RankingProgress) {
  return `Top 16: ${progress.settled}% settled · ${progress.placed} of ${progress.active} placed`
}

export function readPlayingCategory() {
  try {
    const stored = localStorage.getItem('brush-playing-for')
    if (stored && /^[a-z][a-z0-9_-]{0,30}$/.test(stored)) return stored
  } catch { /* private mode */ }
  return OVERALL_CATEGORY
}

export function writePlayingCategory(category: string) {
  try { localStorage.setItem('brush-playing-for', category) } catch { /* ignore quota */ }
}
