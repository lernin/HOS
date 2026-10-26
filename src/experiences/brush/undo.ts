import type { Gauntlet, SearchTrail, ShowBanner } from './contend'
import type { ContestPhase, RoundMatch } from './types'

export type RatingSnap = {
  elo: number
  sigma: number
  volatility?: number
  games: number
  wins: number
  losses: number
  close_wins?: number
  close_losses?: number
  trash_count: number
  trashed: boolean
}

export type UndoSlot = {
  leftId: string
  rightId: string
  standbyLeft?: string | null
  standbyRight?: string | null
}

export type UndoFrame = {
  id: string
  category: string
  matchId: string | null
  leftId: string
  rightId: string
  left: RatingSnap
  right: RatingSnap
  queue: UndoSlot[]
  recentKeys: string[]
  phase: ContestPhase
  focus: 'bracket' | 'placement'
  rounds: RoundMatch[][]
  championId: string | null
  gauntlet?: Gauntlet | null
  banner?: ShowBanner | null
  trail?: SearchTrail | null
}

function key(preview: boolean) {
  return preview ? 'brush-undo-session-preview' : 'brush-undo-session'
}

export function readUndo(preview: boolean): UndoFrame[] {
  try {
    const raw = sessionStorage.getItem(key(preview))
    if (!raw) return []
    const parsed = JSON.parse(raw) as UndoFrame[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function writeUndo(preview: boolean, frames: UndoFrame[]) {
  try { sessionStorage.setItem(key(preview), JSON.stringify(frames)) } catch { /* private mode or a full quota */ }
}

export function pushUndo(frames: UndoFrame[], frame: UndoFrame) {
  return [...frames, frame]
}

export function attachUndoMatch(frames: UndoFrame[], id: string, matchId: string) {
  return frames.map(frame => frame.id === id ? { ...frame, matchId } : frame)
}

/** The newest decision in this category, leaving every other category's stack alone. */
export function popUndo(frames: UndoFrame[], category: string) {
  for (let index = frames.length - 1; index >= 0; index -= 1) {
    if (frames[index].category !== category) continue
    return { frame: frames[index], frames: frames.filter((_, item) => item !== index) }
  }
  return { frame: null, frames }
}
