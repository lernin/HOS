import type { BrushImage, ContestState, Margin } from './types.ts'
import { eloUpdate, nextSigma } from './rank.ts'
import { advanceBracket, extendQueue, nextContender, pairKey, qualifyingProgress, seedBracket, type RoundMatch, type Slot } from './pair.ts'

export type Deck = {
  images: BrushImage[]
  queue: Slot[]
  recentKeys: string[]
  phase: ContestState['phase']
  focus: 'bracket' | 'placement'
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
    recentKeys: (contest?.recentKeys || []).slice(-40),
    phase: contest?.phase || 'qualifying',
    focus: 'bracket',
    rounds: contest?.rounds || [],
    championId: contest?.championId || null,
  }
  if (deck.phase !== 'qualifying') return deck
  return { ...deck, queue: extendQueue(images, [], deck.recentKeys, undefined, rng) }
}

export function currentMatch(deck: Deck) {
  if (deck.phase === 'champion') return null
  if (deck.phase === 'finals' && deck.focus !== 'placement') {
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
      const close = decision.margin === 'close'
      return { ...image, elo: rated.eloA, sigma: nextSigma(image.sigma), games: image.games + 1, wins: image.wins + (won ? 1 : 0), losses: image.losses + (won ? 0 : 1), close_wins: (image.close_wins || 0) + (won && close ? 1 : 0), close_losses: (image.close_losses || 0) + (!won && close ? 1 : 0) }
    }
    if (image.id === right.id) {
      const won = decision.winnerId === right.id
      const close = decision.margin === 'close'
      return { ...image, elo: rated.eloB, sigma: nextSigma(image.sigma), games: image.games + 1, wins: image.wins + (won ? 1 : 0), losses: image.losses + (won ? 0 : 1), close_wins: (image.close_wins || 0) + (won && close ? 1 : 0), close_losses: (image.close_losses || 0) + (!won && close ? 1 : 0) }
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

function replaceTrashed(deck: Deck, decision: Decision, rng: () => number): Deck | null {
  const images = trash(deck.images, decision)
  const keepId = decision.trashLeft ? decision.rightId : decision.leftId
  const recentKeys = [...deck.recentKeys, pairKey(decision.leftId, decision.rightId)].slice(-40)
  const contender = nextContender(images, keepId, { recentKeys, rng })
  if (!contender) return null
  const slot = decision.trashLeft
    ? { leftId: contender.id, rightId: keepId }
    : { leftId: keepId, rightId: contender.id }
  if (deck.phase === 'finals' && deck.focus !== 'placement') {
    const rounds = deck.rounds.map((round, index) => {
      if (index !== deck.rounds.length - 1) return round
      return round.map(match => {
        if (match.winnerId || match.leftId !== decision.leftId || match.rightId !== decision.rightId) return match
        return { ...match, leftId: slot.leftId, rightId: slot.rightId }
      })
    })
    return { ...deck, images, recentKeys, rounds }
  }
  const rest = deck.queue.slice(1)
  return { ...deck, images, recentKeys, queue: extendQueue(images, [slot, ...rest], recentKeys, undefined, rng) }
}

export function applyDecision(deck: Deck, decision: Decision, rng: () => number = Math.random): Deck {
  if (decision.kind === 'trash' && decision.trashLeft !== decision.trashRight) {
    const replaced = replaceTrashed(deck, decision, rng)
    if (replaced) return replaced
  }
  const images = decision.kind === 'pick' ? rate(deck.images, decision) : trash(deck.images, decision)
  const recentKeys = [...deck.recentKeys, pairKey(decision.leftId, decision.rightId)].slice(-40)
  if (deck.phase === 'finals' && deck.focus === 'placement') {
    const queue = deck.queue.filter(slot => pairKey(slot.leftId, slot.rightId) !== pairKey(decision.leftId, decision.rightId))
    return { ...deck, images, recentKeys, queue: extendQueue(images, queue, recentKeys, undefined, rng) }
  }
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
  if (deck.phase === 'finals' && deck.focus !== 'placement' && currentMatch(deck)) return deck
  const ranked = active(deck.images).sort((a, b) => b.elo - a.elo || b.games - a.games || a.name.localeCompare(b.name))
  const round = seedBracket(ranked.map(image => image.id))
  if (!round.length) return deck
  return { ...deck, phase: 'finals', focus: 'bracket', rounds: [round], championId: null, queue: [] }
}

export function openPlacement(deck: Deck, rng: () => number = Math.random): Deck {
  return { ...deck, focus: 'placement', queue: extendQueue(deck.images, [], deck.recentKeys, undefined, rng) }
}

export function returnToBracket(deck: Deck): Deck {
  return { ...deck, focus: 'bracket', queue: [] }
}

export type PendingResult = {
  leftId: string
  rightId: string
  decision: 'pick' | 'trash'
  winnerId: string | null
  trashLeft: boolean
  trashRight: boolean
  margin: Margin
  matchId: string | null
}

export function replayPending(deck: Deck, pending: PendingResult[], rng: () => number = Math.random): Deck {
  let next = deck
  for (const item of pending) {
    if (item.matchId) continue
    const decision: Decision = {
      leftId: item.leftId,
      rightId: item.rightId,
      kind: item.decision,
      winnerId: item.winnerId,
      trashLeft: item.trashLeft,
      trashRight: item.trashRight,
      margin: item.margin,
    }
    if (next.phase === 'finals' && next.focus !== 'placement') {
      const live = currentMatch(next)
      const same = Boolean(live && pairKey(live.left.id, live.right.id) === pairKey(item.leftId, item.rightId))
      if (!same) {
        next = { ...next, images: decision.kind === 'pick' ? rate(next.images, decision) : trash(next.images, decision) }
        continue
      }
    }
    next = applyDecision(next, decision, rng)
  }
  return next
}

export function resumeQualifying(deck: Deck, rng: () => number = Math.random): Deck {
  return { ...deck, phase: 'qualifying', focus: 'bracket', queue: extendQueue(deck.images, [], deck.recentKeys, undefined, rng) }
}

export function mergeLibrary(deck: Deck, remote: BrushImage[], rng: () => number = Math.random): Deck {
  const localById = new Map(deck.images.map(image => [image.id, image]))
  const images = remote.map(remoteImage => {
    const current = localById.get(remoteImage.id)
    if (!current) return remoteImage
    const ahead = current.games > remoteImage.games || current.trash_count > remoteImage.trash_count
    const face = {
      face_box: remoteImage.face_box || current.face_box,
      face_scanned: remoteImage.face_scanned || current.face_scanned,
      perceptual_hash: current.perceptual_hash || remoteImage.perceptual_hash,
      preview_url: remoteImage.preview_url || current.preview_url,
    }
    if (!ahead) return { ...remoteImage, ...face }
    return {
      ...remoteImage,
      elo: current.elo,
      sigma: current.sigma,
      games: current.games,
      wins: current.wins,
      losses: current.losses,
      close_wins: current.close_wins,
      close_losses: current.close_losses,
      trashed: current.trashed || remoteImage.trashed,
      trash_count: Math.max(current.trash_count, remoteImage.trash_count),
      ...face,
    }
  })
  if (deck.phase !== 'qualifying') return { ...deck, images }
  const head = deck.queue[0] ? [deck.queue[0]] : []
  return { ...deck, images, queue: extendQueue(images, head, deck.recentKeys, undefined, rng) }
}

export function rememberHash(deck: Deck, imageId: string, hash: string): Deck {
  return { ...deck, images: deck.images.map(image => image.id === imageId ? { ...image, perceptual_hash: hash } : image) }
}

export function rememberFace(deck: Deck, imageId: string, faceBox: BrushImage['face_box']): Deck {
  return { ...deck, images: deck.images.map(image => image.id === imageId ? { ...image, face_box: faceBox, face_scanned: true } : image) }
}

export function progressOf(deck: Deck) {
  return qualifyingProgress(deck.images)
}
