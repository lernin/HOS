import { readyForKnockout, topIds, unplacedCount } from './arc.ts'
import type { BrushImage, ContestState, Margin } from './types.ts'
import { glickoUpdate } from './rank.ts'
import { advanceBracket, extendQueue, MATCH_MEMORY, nextContender, pairKey, PLACEMENT_GAMES, qualifyingProgress, rankedActive, retainBuffer, sameGroup, seedBracket, type RoundMatch, type Slot } from './pair.ts'

export type Deck = {
  images: BrushImage[]
  queue: Slot[]
  recentKeys: string[]
  phase: ContestState['phase']
  focus: 'bracket' | 'placement'
  rounds: RoundMatch[][]
  championId: string | null
  /** Top 16 ids at the last crowning. Empty until a champion is kept. */
  field: string[]
  /** Abandoned or finished brackets, newest last, capped. */
  archive: RoundMatch[][][]
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

export function bootDeck(images: BrushImage[], contest: ContestState | null, rng: () => number = Math.random): Deck {
  const deck: Deck = {
    images,
    queue: [],
    recentKeys: (contest?.recentKeys || []).slice(-MATCH_MEMORY),
    phase: contest?.phase || 'qualifying',
    focus: 'bracket',
    rounds: contest?.rounds || [],
    championId: contest?.championId || null,
    field: contest?.field || [],
    archive: [],
  }
  const queued = deck.phase === 'qualifying' ? { ...deck, queue: extendQueue(images, [], deck.recentKeys, undefined, rng) } : deck
  return settleArc(queued, rng)
}

/** New pictures send an open knockout back to placement. Ratings and the reigning champion stay. */
export function placeNewcomers(deck: Deck, rng: () => number = Math.random): Deck {
  if (unplacedCount(deck.images) === 0) return deck
  if (deck.phase !== 'finals' && deck.phase !== 'champion') return deck
  const archive = deck.rounds.length ? [...deck.archive, deck.rounds].slice(-8) : deck.archive
  const next: Deck = { ...deck, phase: 'qualifying', focus: 'bracket', rounds: [], archive, queue: [] }
  return { ...next, queue: extendQueue(next.images, [], next.recentKeys, undefined, rng) }
}

export function settleArc(deck: Deck, rng: () => number = Math.random): Deck {
  const opened = placeNewcomers(deck, rng)
  if (opened.phase === 'qualifying' && !opened.championId && unplacedCount(opened.images) === 0 && readyForKnockout(opened.images)) {
    return startFinals(opened)
  }
  return opened
}

export function continueRanking(deck: Deck, rng: () => number = Math.random): Deck {
  const archive = deck.rounds.length ? [...deck.archive, deck.rounds].slice(-8) : deck.archive
  const next: Deck = {
    ...deck,
    phase: 'qualifying',
    focus: 'bracket',
    rounds: [],
    field: deck.field.length ? deck.field : topIds(deck.images),
    archive,
    queue: [],
  }
  return { ...next, queue: extendQueue(next.images, [], next.recentKeys, undefined, rng) }
}

export function dropUnreadable(deck: Deck, imageId: string, rng: () => number = Math.random): Deck {
  const before = currentMatch(deck)
  const images = deck.images.map(image => image.id === imageId ? { ...image, unreadable: true } : image)
  if (deck.phase === 'finals' && deck.focus !== 'placement') {
    const rounds = deck.rounds.map((round, index) => {
      if (index !== deck.rounds.length - 1) return round
      return round.map(match => {
        if (match.winnerId || (match.leftId !== imageId && match.rightId !== imageId)) return match
        const keepId = match.leftId === imageId ? match.rightId : match.leftId
        const contender = nextContender(images, keepId, { recentKeys: deck.recentKeys, rng })
        if (!contender) return match
        return match.leftId === imageId ? { ...match, leftId: contender.id } : { ...match, rightId: contender.id }
      })
    })
    return { ...deck, images, rounds }
  }
  const cleaned = deck.queue.filter(slot => slot.leftId !== imageId && slot.rightId !== imageId)
  const queue: Slot[] = []
  if (before && (before.left.id === imageId || before.right.id === imageId)) {
    const keepId = before.left.id === imageId ? before.right.id : before.left.id
    const head = deck.queue[0]
    const standby = head ? liveStandby(images, keepId, before.left.id === imageId ? head.standbyLeft : head.standbyRight) : null
    const contenderId = standby || nextContender(images, keepId, { recentKeys: deck.recentKeys, rng })?.id
    if (contenderId) {
      queue.push(before.left.id === imageId
        ? { leftId: contenderId, rightId: keepId }
        : { leftId: keepId, rightId: contenderId })
    }
    queue.push(...retainBuffer(cleaned, pairKey(before.left.id, before.right.id), images, deck.recentKeys))
  } else if (cleaned[0]) {
    const headKey = pairKey(cleaned[0].leftId, cleaned[0].rightId)
    queue.push(cleaned[0], ...retainBuffer(cleaned.slice(1), '', images, deck.recentKeys).filter(slot => pairKey(slot.leftId, slot.rightId) !== headKey))
  }
  return { ...deck, images, queue: extendQueue(images, queue, deck.recentKeys, undefined, rng) }
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
  if (!left || !right || left.trashed || right.trashed || left.archived || right.archived || left.unreadable || right.unreadable) return null
  return { left, right }
}

function rate(images: BrushImage[], decision: Decision) {
  const left = byId(images, decision.leftId)
  const right = byId(images, decision.rightId)
  if (!left || !right || !decision.winnerId) return images
  const rated = glickoUpdate(
    { rating: left.elo, rd: left.sigma, volatility: left.volatility },
    { rating: right.elo, rd: right.sigma, volatility: right.volatility },
    decision.winnerId === left.id,
    decision.margin,
  )
  return images.map(image => {
    if (image.id === left.id) {
      const won = decision.winnerId === left.id
      const close = decision.margin === 'close'
      return { ...image, elo: rated.eloA, sigma: rated.sigmaA, volatility: rated.volatilityA, games: image.games + 1, wins: image.wins + (won ? 1 : 0), losses: image.losses + (won ? 0 : 1), close_wins: (image.close_wins || 0) + (won && close ? 1 : 0), close_losses: (image.close_losses || 0) + (!won && close ? 1 : 0) }
    }
    if (image.id === right.id) {
      const won = decision.winnerId === right.id
      const close = decision.margin === 'close'
      return { ...image, elo: rated.eloB, sigma: rated.sigmaB, volatility: rated.volatilityB, games: image.games + 1, wins: image.wins + (won ? 1 : 0), losses: image.losses + (won ? 0 : 1), close_wins: (image.close_wins || 0) + (won && close ? 1 : 0), close_losses: (image.close_losses || 0) + (!won && close ? 1 : 0) }
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

function liveStandby(images: BrushImage[], keepId: string, candidate: string | null | undefined) {
  if (!candidate || candidate === keepId) return null
  const keep = byId(images, keepId)
  const next = byId(images, candidate)
  if (!keep || !next || next.trashed || next.archived || next.unreadable) return null
  if (sameGroup(keep, next)) return null
  return candidate
}

function sameSlot(slot: Slot | undefined, leftId: string, rightId: string) {
  return Boolean(slot && slot.leftId === leftId && slot.rightId === rightId)
}

/** The survivor stays on its original side even if the buffer would rather roll a fresh pair. */
function pinReplacement(queue: Slot[], slot: { leftId: string, rightId: string }, images: BrushImage[], recentKeys: string[], rng: () => number) {
  if (sameSlot(queue[0], slot.leftId, slot.rightId)) return queue
  const upcoming = [...recentKeys, pairKey(slot.leftId, slot.rightId)].slice(-MATCH_MEMORY)
  const tail = retainBuffer(queue.filter(item => !sameSlot(item, slot.leftId, slot.rightId)), pairKey(slot.leftId, slot.rightId), images, upcoming)
  const seeded = extendQueue(images, [slot], recentKeys, 1, rng)
  const head = sameSlot(seeded[0], slot.leftId, slot.rightId)
    ? seeded[0]
    : { leftId: slot.leftId, rightId: slot.rightId, standbyLeft: null, standbyRight: null }
  return [head, ...tail]
}

function replaceTrashed(deck: Deck, decision: Decision, rng: () => number): Deck | null {
  const images = trash(deck.images, decision)
  const keepId = decision.trashLeft ? decision.rightId : decision.leftId
  const recentKeys = [...deck.recentKeys, pairKey(decision.leftId, decision.rightId)].slice(-MATCH_MEMORY)
  const head = deck.queue[0]
  const standby = head && head.leftId === decision.leftId && head.rightId === decision.rightId
    ? liveStandby(images, keepId, decision.trashLeft ? head.standbyLeft : head.standbyRight)
    : null
  const contenderId = nextContender(images, keepId, { recentKeys, rng, preferId: standby })?.id
  if (!contenderId) return null
  const slot = decision.trashLeft
    ? { leftId: contenderId, rightId: keepId }
    : { leftId: keepId, rightId: contenderId }
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
  const playedKey = pairKey(decision.leftId, decision.rightId)
  const rest = retainBuffer(deck.queue.slice(1), playedKey, images, recentKeys)
  const queued = extendQueue(images, [slot, ...rest], recentKeys, undefined, rng)
  return { ...deck, images, recentKeys, queue: pinReplacement(queued, slot, images, recentKeys, rng) }
}

export function undoDecision(deck: Deck, prior: {
  leftId: string
  rightId: string
  left: Pick<BrushImage, 'elo' | 'sigma' | 'volatility' | 'games' | 'wins' | 'losses' | 'close_wins' | 'close_losses' | 'trash_count' | 'trashed'>
  right: Pick<BrushImage, 'elo' | 'sigma' | 'volatility' | 'games' | 'wins' | 'losses' | 'close_wins' | 'close_losses' | 'trash_count' | 'trashed'>
  queue: Slot[]
  recentKeys: string[]
  phase: Deck['phase']
  focus: Deck['focus']
  rounds: RoundMatch[][]
  championId: string | null
}): Deck {
  const images = deck.images.map(image => {
    if (image.id === prior.leftId) return { ...image, ...prior.left }
    if (image.id === prior.rightId) return { ...image, ...prior.right }
    return image
  })
  return {
    ...deck,
    images,
    queue: prior.queue,
    recentKeys: prior.recentKeys,
    phase: prior.phase,
    focus: prior.focus,
    rounds: prior.rounds,
    championId: prior.championId,
  }
}

export function applyDecision(deck: Deck, decision: Decision, rng: () => number = Math.random): Deck {
  const inBracket = deck.phase === 'finals' && deck.focus !== 'placement'
  if (decision.kind === 'trash' && decision.trashLeft !== decision.trashRight && !inBracket) {
    const replaced = replaceTrashed(deck, decision, rng)
    if (replaced) return settleArc(replaced, rng)
  }
  const images = decision.kind === 'pick' ? rate(deck.images, decision) : trash(deck.images, decision)
  const recentKeys = [...deck.recentKeys, pairKey(decision.leftId, decision.rightId)].slice(-MATCH_MEMORY)
  if (inBracket) {
    const winnerId = decision.kind === 'pick'
      ? decision.winnerId
      : decision.trashLeft && !decision.trashRight
        ? decision.rightId
        : decision.trashRight && !decision.trashLeft
          ? decision.leftId
          : null
    const advanced = advanceBracket(deck.rounds, winnerId)
    return settleArc({
      ...deck,
      images,
      recentKeys,
      queue: [],
      rounds: advanced.rounds,
      championId: advanced.championId || deck.championId,
      field: advanced.championId ? topIds(images) : deck.field,
      phase: advanced.championId ? 'champion' : 'finals',
    }, rng)
  }
  const kept = retainBuffer(deck.queue.slice(1), pairKey(decision.leftId, decision.rightId), images, recentKeys)
  return settleArc({ ...deck, images, recentKeys, queue: extendQueue(images, kept, recentKeys, undefined, rng) }, rng)
}

export function startFinals(deck: Deck): Deck {
  if (deck.phase === 'finals' && deck.focus !== 'placement' && currentMatch(deck)) return deck
  const ranked = rankedActive(deck.images)
  const round = seedBracket(ranked.map(image => image.id))
  if (!round.length) return deck
  return { ...deck, phase: 'finals', focus: 'bracket', rounds: [round], queue: [] }
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
      unreadable: current.unreadable || remoteImage.unreadable,
    }
    if (!ahead) return { ...remoteImage, ...face }
    return {
      ...remoteImage,
      elo: current.elo,
      sigma: current.sigma,
      volatility: current.volatility ?? remoteImage.volatility,
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
  const previous = new Set(deck.images.map(image => image.id))
  const arrivals = images.filter(image => !previous.has(image.id) && image.games < PLACEMENT_GAMES && !image.trashed && !image.archived && !image.unreadable)
  if (arrivals.length && (deck.phase === 'finals' || deck.phase === 'champion')) {
    return placeNewcomers({ ...deck, images }, rng)
  }
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
