import { newEntrants, PLACEMENT_GAMES } from './pair.ts'
import type { BrushImage } from './types.ts'

export const LEVEL_ORIGIN = 1500
export const LEVEL_SPAN = 100

export type Standing = { rank: number, total: number }

export type BrushMoment = {
  text: string
  kind: 'level' | 'placement' | 'top16'
  imageId?: string
}

type Rankable = Pick<BrushImage, 'id' | 'name' | 'elo' | 'games'> & { trashed?: boolean, archived?: boolean, country?: string }

export function levelOf(elo: number) {
  return Math.max(1, 1 + Math.floor((elo - LEVEL_ORIGIN) / LEVEL_SPAN))
}

export function levelProgress(elo: number) {
  const start = LEVEL_ORIGIN + (levelOf(elo) - 1) * LEVEL_SPAN
  return Math.min(1, Math.max(0, (elo - start) / LEVEL_SPAN))
}

export function levelTier(level: number) {
  if (level >= 10) return 'ivory'
  if (level >= 7) return 'amber'
  if (level >= 4) return 'gold'
  if (level >= 2) return 'sand'
  return 'stone'
}

export function standingOf(images: Rankable[], id: string): Standing | null {
  const ranked = images
    .filter(image => !image.trashed && !image.archived && image.games >= PLACEMENT_GAMES)
    .sort((a, b) => b.elo - a.elo || b.games - a.games || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  const index = ranked.findIndex(image => image.id === id)
  if (index < 0) return null
  return { rank: index + 1, total: ranked.length }
}

export function matchMoments(before: BrushImage[], after: BrushImage[]): BrushMoment[] {
  const prior = new Map(before.map(image => [image.id, image]))
  const notes: BrushMoment[] = []
  for (const image of after) {
    const was = prior.get(image.id)
    if (!was || image.trashed || image.archived || was.games === image.games) continue
    const label = image.country || image.name || 'A picture'
    if (was.games < PLACEMENT_GAMES && image.games >= PLACEMENT_GAMES) {
      const standing = standingOf(after, image.id)
      const level = levelOf(image.elo)
      notes.push({
        kind: 'placement',
        imageId: image.id,
        text: standing
          ? `Placement complete: ${label} debuts at Level ${level}, #${standing.rank}`
          : `Placement complete: ${label} debuts at Level ${level}`,
      })
      continue
    }
    const nextLevel = levelOf(image.elo)
    if (was.games >= PLACEMENT_GAMES && nextLevel > levelOf(was.elo)) {
      notes.push({ kind: 'level', imageId: image.id, text: `Level up! ${label} · Level ${nextLevel}` })
    }
  }
  const arrival = newEntrants(before, after)[0]
  if (arrival) notes.push({ kind: 'top16', imageId: arrival.id, text: `${arrival.name} entered the top 16!` })
  return notes
}
