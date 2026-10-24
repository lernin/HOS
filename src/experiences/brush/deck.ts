import type { BrushImage, ContestState, Margin } from './types.ts'
import { eloUpdate, nextSigma } from './rank.ts'
import { advanceBracket, extendQueue, pairKey, qualifyingProgress, seedBracket, type RoundMatch, type Slot } from './pair.ts'

export type Deck = {
  images: BrushImage[]
  queue: Slot[]
  recentKeys: string[]
  phase: ContestState['phase']
  rounds: RoundMatch[][]
  championId: string | null
}

export type Decision = {
  leftId: string
  rightId: string
  kind: 'pick' | 'trash'
  winnerId: string | null
  trashLeft: boolean
  trashRight: boolean
  margin: Margin
}

function byId(images: BrushImage[], id: string) {
  return images.find(image => image.id === id) || null
}

function active(images: BrushImage[]) {
  return images.filter(image => !image.trashed && !image.archived)
}

export function bootDeck(images: BrushImage[], contest: ContestState | null, rng: () => number = Math.random): Deck {
  const deck: Deck = {
    images,
    queue: [],
    recentKeys: [],
    phase: contest?.phase || 'qualifying',
    rounds: contest?.rounds || [],
    championId: contest?.championId || null,
  }
  if (deck.phase !== 'qualifying') return deck
  return { ...deck, queue: extendQueue(images, [], [], undefined, rng) }
}

export function currentMatch(deck: Deck) {
  if (deck.phase === 'champion') return null
  if (deck.phase === 'finals') {
    const round = deck.rounds[deck.rounds.length - 1] || []
    const slot = round.find(match => !match.winnerId)
    if (!slot) return null
    const left = byId(deck.images, slot.leftId)
    const right = byId(deck.images, slot.rightId)
    if (!left || !right) return null
    return { left, right }
  }
  const slot = deck.queue[0]
  if (!slot) return null
  const left = byId(deck.images, slot.leftId)
  const right = byId(deck.images, slot.rightId)
  if (!left || !right || left.trashed || right.trashed || left.archived || right.archived) return null
  return { left, right }
}

function rate(images: BrushImage[], decision: Decision) {
  const left = byId(images, decision.leftId)
  const right = byId(images, decision.rightId)
  if (!left || !right || !decision.winnerId) return images
  const rated = eloUpdate(left.elo, right.elo, left.games, right.games, decision.winnerId === left.id, decision.margin)
  return images.map(image => {
    if (image.id === left.id) {
      const won = decision.winnerId === left.id
      return { ...image, elo: rated.eloA, sigma: nextSigma(image.sigma), games: image.games + 1, wins: image.wins + (won ? 1 : 0), losses: image.losses + (won ? 0 : 1) }
    }
    if (image.id === right.id) {
      const won = decision.winnerId === right.id
      return { ...image, elo: rated.eloB, sigma: nextSigma(image.sigma), games: image.games + 1, wins: image.wins + (won ? 1 : 0), losses: image.losses + (won ? 0 : 1) }
    }
    return image
  })
}

function trash(images: BrushImage[], decision: Decision) {
  return images.map(image => {
    if (decision.trashLeft && image.id === decision.leftId) return { ...image, trashed: true, trash_count: image.trash_count + 1 }
    if (decision.trashRight && image.id === decision.rightId) return { ...image, trashed: true, trash_count: image.trash_count + 1 }
    return image
  })
}

export function applyDecision(deck: Deck, decision: Decision, rng: () => number = Math.random): Deck {
  const images = decision.kind === 'pick' ? rate(deck.images, decision) : trash(deck.images, decision)
  const recentKeys = [...deck.recentKeys, pairKey(decision.leftId, decision.rightId)].slice(-40)
  if (deck.phase === 'finals') {
    const winnerId = decision.kind === 'pick'
      ? decision.winnerId
      : decision.trashLeft && !decision.trashRight
        ? decision.rightId
        : decision.trashRight && !decision.trashLeft
          ? decision.leftId
          : null
    const advanced = advanceBracket(deck.rounds, winnerId)
    return {
      ...deck,
      images,
      recentKeys,
      queue: [],
      rounds: advanced.rounds,
      championId: advanced.championId,
      phase: advanced.championId ? 'champion' : 'finals',
    }
  }
  const queue = deck.queue.filter(slot => pairKey(slot.leftId, slot.rightId) !== pairKey(decision.leftId, decision.rightId))
  return { ...deck, images, recentKeys, queue: extendQueue(images, queue, recentKeys, undefined, rng) }
}

export function startFinals(deck: Deck): Deck {
  const ranked = active(deck.images).sort((a, b) => b.elo - a.elo || b.games - a.games || a.name.localeCompare(b.name))
  const round = seedBracket(ranked.map(image => image.id))
  if (!round.length) return deck
  return { ...deck, phase: 'finals', rounds: [round], championId: null, queue: [] }
}

export function resumeQualifying(deck: Deck, rng: () => number = Math.random): Deck {
  return { ...deck, phase: 'qualifying', queue: extendQueue(deck.images, [], deck.recentKeys, undefined, rng) }
}

export function mergeLibrary(deck: Deck, remote: BrushImage[], rng: () => number = Math.random): Deck {
  const localById = new Map(deck.images.map(image => [image.id, image]))
  const images = remote.map(remoteImage => {
    const current = localById.get(remoteImage.id)
    if (!current) return remoteImage
    const ahead = current.games > remoteImage.games || current.trash_count > remoteImage.trash_count
    if (!ahead) {
      return { ...remoteImage, perceptual_hash: current.perceptual_hash || remoteImage.perceptual_hash, preview_url: remoteImage.preview_url || current.preview_url }
    }
    return {
      ...remoteImage,
      elo: current.elo,
      sigma: current.sigma,
      games: current.games,
      wins: current.wins,
      losses: current.losses,
      trashed: current.trashed || remoteImage.trashed,
      trash_count: Math.max(current.trash_count, remoteImage.trash_count),
      perceptual_hash: current.perceptual_hash || remoteImage.perceptual_hash,
      preview_url: remoteImage.preview_url || current.preview_url,
    }
  })
  if (deck.phase !== 'qualifying') return { ...deck, images }
  const head = deck.queue[0] ? [deck.queue[0]] : []
  return { ...deck, images, queue: extendQueue(images, head, deck.recentKeys, undefined, rng) }
}

export function rememberHash(deck: Deck, imageId: string, hash: string): Deck {
  return { ...deck, images: deck.images.map(image => image.id === imageId ? { ...image, perceptual_hash: hash } : image) }
}

export function progressOf(deck: Deck) {
  return qualifyingProgress(deck.images)
}
