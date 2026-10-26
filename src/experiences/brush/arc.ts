import { fieldLocked, nearMisses } from './contend.ts'
import { FINALS_SIZE, PLACEMENT_GAMES, type RoundMatch } from './pair.ts'
import { compareConservative } from './rank.ts'
import { activePool, rankingProgress } from './ranking.ts'
import type { BrushImage, ContestPhase } from './types.ts'

type ArcDeck = {
  phase: ContestPhase
  focus: 'bracket' | 'placement'
  rounds: RoundMatch[][]
  championId: string | null
  field?: string[]
  images: Rankable[]
  gauntlet?: { kind: 'swiss' | 'wildcard', pairs: number, index: number, round: number } | null
}

type Rankable = Pick<BrushImage, 'id' | 'name' | 'elo' | 'games'> & {
  sigma?: number
  trashed?: boolean
  archived?: boolean
  unreadable?: boolean
}

export function unplacedCount(images: Rankable[]) {
  return activePool(images).filter(image => image.games < PLACEMENT_GAMES).length
}

/** Conservative top 16. Fewer than 16 active pictures cannot fill the field. */
export function topIds(images: Rankable[]) {
  return [...activePool(images)].sort(compareConservative).slice(0, FINALS_SIZE).map(image => image.id)
}

/** Locked when the top 16 are confident and nobody outside them still has a way in. Near misses take the wildcard first. */
export function readyForKnockout(images: Rankable[]) {
  return fieldLocked(images) && nearMisses(images).length === 0
}

export function sameField(left: string[], right: string[]) {
  if (left.length !== right.length || !left.length) return false
  const ids = new Set(right)
  return left.every(id => ids.has(id))
}

/** A later knockout is offered only when a settled top 16 differs from the crowned field.
 *  Pictures still placing, or a newcomer who has not settled into that sixteen, do not offer one.
 *  Rating movement inside the same sixteen does not offer one, and nobody is re-settled from scratch. */
export function offerNewKnockout(deck: ArcDeck) {
  if (!deck.championId || deck.phase === 'finals') return false
  if (!deck.field?.length) return false
  if (!readyForKnockout(deck.images)) return false
  return !sameField(topIds(deck.images), deck.field)
}

export function stageKey(deck: ArcDeck) {
  if (deck.phase === 'champion') return 'champion'
  if (deck.phase === 'finals' && deck.focus !== 'placement') {
    const total = (deck.rounds[deck.rounds.length - 1] || []).length || 1
    return `knockout:${total}`
  }
  if (unplacedCount(deck.images) > 0) return 'placing'
  return 'ladder'
}

export function stageLabel(deck: ArcDeck) {
  if (deck.phase === 'finals' && deck.focus !== 'placement') {
    const round = deck.rounds[deck.rounds.length - 1] || []
    const total = round.length
    const done = round.filter(match => match.winnerId).length
    const current = Math.min(Math.max(total, 1), done + 1)
    if (total >= 8) return `Round of 16 · ${current} of ${total}`
    if (total === 4) return `Quarterfinal ${current} of 4`
    if (total === 2) return `Semifinal ${current} of 2`
    if (total === 1) return 'Final'
    if (total > 1) return `Knockout ${current} of ${total}`
    return 'Final'
  }
  if (deck.phase === 'qualifying' && deck.gauntlet && deck.gauntlet.pairs > 0) {
    const total = deck.gauntlet.pairs
    const current = Math.min(total, (deck.gauntlet.index || 0) + 1)
    if (deck.gauntlet.kind === 'wildcard') return `Wildcard Challenge · Match ${current} of ${total}`
    return `Round ${deck.gauntlet.round || 1} · Match ${current} of ${total}`
  }
  const active = activePool(deck.images)
  const fresh = active.filter(image => image.games < PLACEMENT_GAMES).length
  if (fresh > 0 && fresh === active.length) return 'Placement'
  if (fresh > 0) return `Placing ${fresh} new`
  return `Ladder · ${rankingProgress(deck.images).settled}% settled`
}

export function stageMoment(before: string, after: string) {
  if (!before || before === after) return null
  if (after === 'knockout:8') return 'Round of 16!'
  if (after === 'knockout:4') return 'Quarterfinals!'
  if (after === 'knockout:2') return 'Semifinals!'
  if (after === 'knockout:1') return 'Final!'
  if (after.startsWith('knockout:')) return 'Knockout!'
  const beforeKind = before.split(':')[0]
  const afterKind = after.split(':')[0]
  if (beforeKind === afterKind) return null
  if (afterKind === 'placing') return 'Placement!'
  if (afterKind === 'ladder') return 'Ladder!'
  return null
}
