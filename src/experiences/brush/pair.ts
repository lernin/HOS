import { countryFromPath, filenameAttributes, groupKeys, seriesFromName, type GroupSource } from './names.ts'
import { compareConservative } from './rank.ts'

export const QUALIFY_TARGET = 4
export const QUEUE_DEPTH = 5
export const FINALS_SIZE = 16
export const HASH_DISTANCE = 8
export const PLACEMENT_GAMES = 5
export const RECENT_WINDOW = 10
export const CLOSE_ELO = 150
export const WILDCARD_RATE = 0.2
/** At most one appearance in any four consecutive matches, for either picture. */
export const COOLDOWN_MATCHES = 3
/** Share of matches that stay on the ranked ladder while newcomers are still placing. */
export const ESTABLISHED_RATE = 0.22
/** Match keys kept so a placement series can refuse rematches across a visit. */
export const MATCH_MEMORY = 800

export type Pairable = GroupSource & {
  id: string
  elo: number
  games: number
  wins?: number
  losses?: number
  sigma?: number
  perceptual_hash?: string | null
  trashed?: boolean
  archived?: boolean
  unreadable?: boolean
  country?: string
  prompt_text?: string | null
}

const DRESS_COLORS = ['ivory', 'white', 'black', 'sage', 'emerald', 'green', 'olive', 'red', 'crimson', 'burgundy', 'maroon', 'pink', 'blush', 'rose', 'blue', 'navy', 'cobalt', 'gold', 'yellow', 'orange', 'purple', 'lilac', 'lavender', 'brown', 'beige', 'cream', 'silver', 'gray', 'grey', 'teal', 'coral']
const SETTINGS = ['studio', 'beach', 'street', 'garden', 'cafe', 'bedroom', 'night', 'city', 'park', 'rooftop', 'forest', 'alley', 'office', 'stage', 'balcony', 'temple', 'shrine', 'library', 'pool', 'outdoor', 'indoor', 'sunset', 'neon']

export type Look = { country: string, series: string, setting: string, dress: string }

function firstWord(text: string, words: string[]) {
  let best = ''
  let at = Number.POSITIVE_INFINITY
  for (const word of words) {
    const index = text.search(new RegExp(`\\b${word}\\b`, 'i'))
    if (index >= 0 && index < at) {
      at = index
      best = word.toLowerCase()
    }
  }
  return best === 'grey' ? 'gray' : best
}

function dressColor(text: string) {
  const labeled = text.match(/clothes\/dress colour\s*[:=]\s*([a-z][\w\s-]{0,24})/i)
  const source = labeled ? labeled[1] : text
  const before = source.match(new RegExp(`\\b(${DRESS_COLORS.join('|')})\\b(?:[\\w\\s-]{0,24})\\b(?:dress|gown|outfit|clothes|kimono|skirt|blouse)`, 'i'))
  const after = source.match(new RegExp(`\\b(?:dress|gown|outfit|clothes|kimono|skirt|blouse)\\b(?:[\\w\\s-]{0,16})\\b(${DRESS_COLORS.join('|')})\\b`, 'i'))
  const color = (before?.[1] || after?.[1] || (labeled ? firstWord(source, DRESS_COLORS) : '')).toLowerCase()
  return color === 'grey' ? 'gray' : color
}

export function lookOf(image: Pairable): Look {
  const text = `${image.name} ${image.prompt_text || ''} ${image.folder_path || ''}`.toLowerCase()
  const fromName = filenameAttributes(image.name).find(item => item.trait === 'setting/background')
  const labeledSetting = text.match(/setting\/background\s*[:=]\s*([a-z][\w\s-]{0,24})/i)
  return {
    country: (image.country || countryFromPath(image.folder_path || '')).trim().toLowerCase(),
    series: (image.series || seriesFromName(image.name) || '').trim().toLowerCase(),
    setting: (fromName?.value || (labeledSetting ? firstWord(labeledSetting[1], SETTINGS) || labeledSetting[1].trim().toLowerCase() : '') || firstWord(text, SETTINGS)),
    dress: dressColor(text),
  }
}

export type Slot = { leftId: string, rightId: string, standbyLeft?: string | null, standbyRight?: string | null }

export function pairKey(leftId: string, rightId: string) {
  return [leftId, rightId].sort().join(':')
}

export function hashDistance(left: string, right: string) {
  if (!/^[0-9a-f]{16}$/.test(left) || !/^[0-9a-f]{16}$/.test(right)) return 64
  let bits = 0
  for (let index = 0; index < 16; index += 1) {
    let mixed = Number.parseInt(left[index], 16) ^ Number.parseInt(right[index], 16)
    while (mixed) {
      bits += mixed & 1
      mixed >>= 1
    }
  }
  return bits
}

export function averageHashFromPixels(data: Uint8ClampedArray) {
  const grays: number[] = []
  const cells = Math.min(64, Math.floor(data.length / 4))
  for (let index = 0; index < cells; index += 1) {
    const offset = index * 4
    grays.push(0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2])
  }
  while (grays.length < 64) grays.push(0)
  const average = grays.reduce((sum, value) => sum + value, 0) / 64
  let hex = ''
  for (let index = 0; index < 64; index += 4) {
    const nibble = (grays[index] >= average ? 8 : 0)
      + (grays[index + 1] >= average ? 4 : 0)
      + (grays[index + 2] >= average ? 2 : 0)
      + (grays[index + 3] >= average ? 1 : 0)
    hex += nibble.toString(16)
  }
  return hex
}

export function hashImage(image: CanvasImageSource) {
  const canvas = document.createElement('canvas')
  canvas.width = 8
  canvas.height = 8
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return Promise.resolve('')
  context.drawImage(image, 0, 0, 8, 8)
  return Promise.resolve(averageHashFromPixels(context.getImageData(0, 0, 8, 8).data))
}

export function sameGroup(left: Pairable, right: Pairable) {
  const keys = new Set(groupKeys(left))
  if (groupKeys(right).some(key => keys.has(key))) return true
  if (left.perceptual_hash && right.perceptual_hash && hashDistance(left.perceptual_hash, right.perceptual_hash) <= HASH_DISTANCE) return true
  return false
}

function active(pool: Pairable[]) {
  return pool.filter(image => !image.trashed && !image.archived && !image.unreadable)
}

export function challengerCount(pool: Pairable[]) {
  return active(pool).filter(image => image.games < PLACEMENT_GAMES).length
}

export function rankedActive(pool: Pairable[]) {
  return active(pool).sort(compareConservative)
}

export function newEntrants(before: Pairable[], after: Pairable[]) {
  const field = active(after)
  if (field.length <= FINALS_SIZE) return []
  const previous = new Set(rankedActive(before).slice(0, FINALS_SIZE).map(image => image.id))
  const prior = new Map(before.map(image => [image.id, image]))
  return rankedActive(after).slice(0, FINALS_SIZE).filter(image => {
    const was = prior.get(image.id)
    return was && was.games < PLACEMENT_GAMES && !previous.has(image.id)
  })
}

function winsOf(image: Pairable) {
  return image.wins ?? 0
}

function lossesOf(image: Pairable) {
  return image.losses ?? Math.max(0, image.games - winsOf(image))
}

function recentOpponents(id: string, keys: string[]) {
  const found = new Set<string>()
  for (const key of keys) {
    const [left, right] = key.split(':')
    if (left === id) found.add(right)
    else if (right === id) found.add(left)
  }
  return found
}

function coolingIds(keys: string[], avoidIds: string[] = []) {
  const ids = new Set(avoidIds)
  for (const key of keys.slice(-COOLDOWN_MATCHES)) {
    const [left, right] = key.split(':')
    if (left) ids.add(left)
    if (right) ids.add(right)
  }
  return ids
}

function lastIds(keys: string[]) {
  const ids = new Set<string>()
  const key = keys[keys.length - 1]
  if (!key) return ids
  const [left, right] = key.split(':')
  if (left) ids.add(left)
  if (right) ids.add(right)
  return ids
}

function candidateFields(images: Pairable[], keys: string[], avoidIds: string[]) {
  const cooling = coolingIds(keys, avoidIds)
  const last = lastIds(keys)
  const tiers = [
    images.filter(image => !cooling.has(image.id)),
    images.filter(image => !last.has(image.id)),
    images,
  ]
  const fields: Pairable[][] = []
  const seen = new Set<string>()
  for (const field of tiers) {
    if (field.length < 2) continue
    const mark = field.map(image => image.id).sort().join(',')
    if (seen.has(mark)) continue
    seen.add(mark)
    fields.push(field)
  }
  return fields
}

function restingOpponents(others: Pairable[], keys: string[]) {
  const cooling = coolingIds(keys)
  const outside = others.filter(image => !cooling.has(image.id))
  if (outside.length) return outside
  const last = lastIds(keys)
  const notLast = others.filter(image => !last.has(image.id))
  if (notLast.length) return notLast
  return others
}

function lookTraits(image: Pairable | undefined) {
  if (!image) return []
  const look = lookOf(image)
  const traits: string[] = []
  if (look.setting) traits.push(`setting:${look.setting}`)
  if (look.dress) traits.push(`dress:${look.dress}`)
  if (look.country) traits.push(`country:${look.country}`)
  return traits
}

function traitsOf(ids: Iterable<string>, byId: Map<string, Pairable>) {
  const traits = new Set<string>()
  for (const id of ids) lookTraits(byId.get(id)).forEach(trait => traits.add(trait))
  return traits
}

type Scored = { image: Pairable, hard: boolean, diversity: number, gap: number }

function scoreOpponent(anchor: Pairable, image: Pairable, target: number, keys: string[], byId: Map<string, Pairable>): Scored {
  const hard = sameGroup(anchor, image)
  const gap = Math.abs(image.elo - target)
  if (hard) return { image, hard, diversity: 0, gap }
  const recent = keys.slice(-RECENT_WINDOW)
  const older = keys.slice(0, -RECENT_WINDOW)
  const anchorLook = lookOf(anchor)
  const look = lookOf(image)
  const faced = recentOpponents(anchor.id, recent)
  const facedEarlier = recentOpponents(anchor.id, older)
  const recentLooks = traitsOf(faced, byId)
  const candidateLooks = traitsOf(recentOpponents(image.id, recent), byId)
  let diversity = appearances(image.id, keys.slice(-RECENT_WINDOW)) * 220
  if (faced.has(image.id)) diversity += 1600
  else if (facedEarlier.has(image.id)) diversity += 400
  if (anchorLook.country && look.country && anchorLook.country === look.country) diversity += 240
  if (anchorLook.series && look.series && anchorLook.series === look.series) diversity += 280
  if (anchorLook.setting && look.setting && anchorLook.setting === look.setting) diversity += 200
  if (anchorLook.dress && look.dress && anchorLook.dress === look.dress) diversity += 200
  for (const trait of lookTraits(image)) {
    if (recentLooks.has(trait) && !lookTraits(anchor).includes(trait)) diversity += 120
  }
  for (const trait of lookTraits(anchor)) {
    if (candidateLooks.has(trait) && !lookTraits(image).includes(trait)) diversity += 120
  }
  return { image, hard, diversity, gap }
}

function pickFrom(items: Scored[], rng: () => number) {
  if (!items.length) return null
  const index = Math.min(items.length - 1, Math.floor(rng() * items.length))
  return items[index].image
}

function fewest(images: Pairable[]) {
  const minGames = Math.min(...images.map(image => image.games))
  return images.filter(image => image.games === minGames).sort((a, b) => a.id.localeCompare(b.id))
}

function appearances(id: string, keys: string[]) {
  let count = 0
  for (const key of keys) {
    const [left, right] = key.split(':')
    if (left === id || right === id) count += 1
  }
  return count
}

function pickAnchor(candidates: Pairable[], keys: string[], rng: () => number) {
  const recent = keys.slice(-RECENT_WINDOW)
  const load = (image: Pairable) => appearances(image.id, recent)
  const minLoad = Math.min(...candidates.map(load))
  const quiet = candidates.filter(image => load(image) === minLoad).sort((a, b) => a.id.localeCompare(b.id))
  const index = Math.min(quiet.length - 1, Math.floor(rng() * quiet.length))
  return quiet[index]
}

function recordDistance(left: Pairable, right: Pairable) {
  return Math.abs(winsOf(left) - winsOf(right)) + Math.abs(lossesOf(left) - lossesOf(right))
}

function closestRecord(anchor: Pairable, pool: Pairable[]) {
  const best = Math.min(...pool.map(image => recordDistance(anchor, image)))
  return pool.filter(image => recordDistance(anchor, image) === best)
}

function avoidImmediate(anchor: Pairable, scored: Scored[], keys: string[]) {
  const last = keys[keys.length - 1]
  if (!last) return scored
  const next = scored.filter(item => pairKey(anchor.id, item.image.id) !== last)
  return next.length ? next : scored
}

function pickByVariety(anchor: Pairable, candidates: Pairable[], context: Pairable[], keys: string[], rng: () => number) {
  const byId = new Map(context.map(image => [image.id, image]))
  const scored = avoidImmediate(anchor, candidates.map(image => scoreOpponent(anchor, image, anchor.elo, keys, byId)), keys)
    .filter(item => !item.hard)
  if (!scored.length) return null
  scored.sort((a, b) => a.diversity - b.diversity || a.image.id.localeCompare(b.image.id))
  const best = scored[0].diversity
  return pickFrom(scored.filter(item => item.diversity <= best + 40), rng)
}

function pickNear(anchor: Pairable, candidates: Pairable[], context: Pairable[], keys: string[], rng: () => number) {
  const byId = new Map(context.map(image => [image.id, image]))
  const faced = recentOpponents(anchor.id, keys.slice(-RECENT_WINDOW))
  const fresh = candidates.filter(image => !faced.has(image.id))
  const pool = fresh.length ? fresh : candidates
  const scored = avoidImmediate(anchor, pool.map(image => scoreOpponent(anchor, image, anchor.elo, keys, byId)), keys)
    .filter(item => !item.hard)
  if (!scored.length) return null
  if (scored.length > 1 && rng() < WILDCARD_RATE) return pickFrom(scored, rng)
  const widths = [CLOSE_ELO, CLOSE_ELO * 2, CLOSE_ELO * 4, Number.POSITIVE_INFINITY]
  let band = scored
  for (const width of widths) {
    const within = scored.filter(item => item.gap <= width)
    if (within.length) {
      band = within
      break
    }
  }
  band.sort((a, b) => a.diversity - b.diversity || a.gap - b.gap || a.image.id.localeCompare(b.image.id))
  const varied = band.filter(item => item.diversity <= band[0].diversity + 30)
  varied.sort((a, b) => a.gap - b.gap || a.image.id.localeCompare(b.image.id))
  const tight = varied.filter(item => item.gap <= varied[0].gap + 40)
  return pickFrom(tight, rng)
}

function swissMatch(placing: Pairable[], keys: string[], rng: () => number) {
  const anchor = pickAnchor(fewest(placing), keys, rng)
  const others = placing.filter(image => image.id !== anchor.id && !sameGroup(anchor, image))
  if (!others.length) return null
  const faced = recentOpponents(anchor.id, keys)
  const fresh = others.filter(image => !faced.has(image.id))
  const pool = fresh.length ? fresh : others
  const same = pool.filter(image => winsOf(image) === winsOf(anchor) && lossesOf(image) === lossesOf(anchor))
  const band = same.length ? same : closestRecord(anchor, pool)
  const minGames = Math.min(...band.map(image => image.games))
  const opponent = pickByVariety(anchor, band.filter(image => image.games === minGames), placing, keys, rng)
  return opponent ? { left: anchor, right: opponent } : null
}

function debutMatch(anchor: Pairable, established: Pairable[], keys: string[], rng: () => number) {
  const opponents = established.filter(image => !sameGroup(anchor, image))
  const faced = recentOpponents(anchor.id, keys)
  const fresh = opponents.filter(image => !faced.has(image.id))
  const pool = fresh.length ? fresh : opponents
  const opponent = pickNear(anchor, pool, established, keys, rng)
  return opponent ? { left: anchor, right: opponent } : null
}

function ladderMatch(established: Pairable[], keys: string[], rng: () => number) {
  const minGames = Math.min(...established.map(image => image.games))
  const anchor = pickAnchor(established.filter(image => image.games <= minGames + 1), keys, rng)
  const opponents = established.filter(image => image.id !== anchor.id && !sameGroup(anchor, image))
  const opponent = pickNear(anchor, opponents, established, keys, rng)
  return opponent ? { left: anchor, right: opponent } : null
}

function selectPair(field: Pairable[], keys: string[], rng: () => number) {
  const placing = field.filter(image => image.games < PLACEMENT_GAMES)
  const established = field.filter(image => image.games >= PLACEMENT_GAMES)
  const swissPossible = placing.length >= 2
  const debutPossible = placing.length === 1 && established.length >= 1
  const ladderPossible = established.length >= 2
  const wantLadder = ladderPossible && (swissPossible || debutPossible) && rng() < ESTABLISHED_RATE
  if (!wantLadder && swissPossible) {
    const paired = swissMatch(placing, keys, rng)
    if (paired) return paired
  }
  if (!wantLadder && debutPossible) {
    const paired = debutMatch(placing[0], established, keys, rng)
    if (paired) return paired
  }
  if (ladderPossible) {
    const paired = ladderMatch(established, keys, rng)
    if (paired) return paired
  }
  if (swissPossible) return swissMatch(placing, keys, rng)
  if (debutPossible) return debutMatch(placing[0], established, keys, rng)
  if (field.length >= 2) return ladderMatch(field, keys, rng)
  return null
}

export function nextQualifyingPair(pool: Pairable[], options: { avoidIds?: string[], recentKeys?: string[], rng?: () => number } = {}) {
  const rng = options.rng || Math.random
  const keys = options.recentKeys || []
  const images = active(pool)
  if (images.length < 2) return null
  for (const field of candidateFields(images, keys, options.avoidIds || [])) {
    const pair = selectPair(field, keys, rng)
    if (pair && !sameGroup(pair.left, pair.right)) return pair
  }
  return null
}

function preferred(candidates: Pairable[], preferId?: string | null) {
  if (!preferId) return null
  return candidates.find(image => image.id === preferId) || null
}

function preferredFresh(anchor: Pairable, candidates: Pairable[], keys: string[], preferId?: string | null) {
  const faced = recentOpponents(anchor.id, keys.slice(-RECENT_WINDOW))
  const fresh = candidates.filter(image => !faced.has(image.id))
  return preferred(fresh.length ? fresh : candidates, preferId)
}

export function nextContender(pool: Pairable[], keepId: string, options: { recentKeys?: string[], rng?: () => number, preferId?: string | null } = {}) {
  const rng = options.rng || Math.random
  const keys = options.recentKeys || []
  const preferId = options.preferId
  const images = active(pool)
  const keep = images.find(image => image.id === keepId)
  if (!keep) return null
  const available = restingOpponents(images.filter(image => image.id !== keep.id), keys)
  if (keep.games >= PLACEMENT_GAMES) {
    const newcomers = available.filter(image => image.games < PLACEMENT_GAMES && !sameGroup(keep, image))
    if (newcomers.length) {
      const minGames = Math.min(...newcomers.map(image => image.games))
      const starved = newcomers.filter(image => image.games === minGames)
      const faced = recentOpponents(keep.id, keys)
      const fresh = starved.filter(image => !faced.has(image.id))
      return preferred(fresh.length ? fresh : starved, preferId) || pickByVariety(keep, starved, images, keys, rng)
    }
  } else {
    const peers = available.filter(image => image.games < PLACEMENT_GAMES && !sameGroup(keep, image))
    const faced = recentOpponents(keep.id, keys)
    const fresh = peers.filter(image => !faced.has(image.id))
    const poolPeers = fresh.length ? fresh : peers
    if (poolPeers.length) {
      const same = poolPeers.filter(image => winsOf(image) === winsOf(keep) && lossesOf(image) === lossesOf(keep))
      const band = same.length ? same : closestRecord(keep, poolPeers)
      const minGames = Math.min(...band.map(image => image.games))
      const fewest = band.filter(image => image.games === minGames)
      return preferred(fewest, preferId) || pickByVariety(keep, fewest, images, keys, rng)
    }
    const established = available.filter(image => image.games >= PLACEMENT_GAMES && !sameGroup(keep, image))
    if (established.length) return preferredFresh(keep, established, keys, preferId) || pickNear(keep, established, images, keys, rng)
  }
  const legal = available.filter(image => !sameGroup(keep, image))
  return preferredFresh(keep, legal, keys, preferId) || pickNear(keep, legal.length ? legal : available, images, keys, rng)
}

function recordFair(anchor: Pairable, other: Pairable, unranked: Pairable[], keys: string[]) {
  const distance = recordDistance(anchor, other)
  const faced = recentOpponents(anchor.id, keys)
  const legal = unranked.filter(image => image.id !== anchor.id && !sameGroup(anchor, image) && !faced.has(image.id))
  const openPool = legal.length ? legal : unranked.filter(image => image.id !== anchor.id && !sameGroup(anchor, image))
  if (!openPool.some(image => image.id === other.id)) return false
  const cooling = coolingIds(keys)
  const open = openPool.filter(image => !cooling.has(image.id))
  const considered = open.length ? open : openPool
  const same = considered.some(image => winsOf(image) === winsOf(anchor) && lossesOf(image) === lossesOf(anchor))
  if (same) return distance === 0
  const best = Math.min(...considered.map(image => recordDistance(anchor, image)))
  return distance === best
}

function placementStillFair(left: Pairable, right: Pairable, pool: Pairable[], keys: string[]) {
  const placing = active(pool).filter(image => image.games < PLACEMENT_GAMES)
  const bothPlacing = left.games < PLACEMENT_GAMES && right.games < PLACEMENT_GAMES
  const bothRanked = left.games >= PLACEMENT_GAMES && right.games >= PLACEMENT_GAMES
  if (placing.length < 2) return true
  if (!bothPlacing && !bothRanked) return false
  if (!bothPlacing) return true
  return recordFair(left, right, placing, keys) || recordFair(right, left, placing, keys)
}

/** Keep buffered slots that are still a legal next match after a result. */
export function retainBuffer(queue: Slot[], playedKey: string, pool: Pairable[], recentKeys: string[]) {
  const byId = new Map(pool.map(image => [image.id, image]))
  const keys = [...recentKeys]
  const kept: Slot[] = []
  const playedIds = new Set(playedKey.split(':').filter(Boolean))
  for (const slot of queue) {
    const key = pairKey(slot.leftId, slot.rightId)
    if (playedKey && key === playedKey) continue
    const left = byId.get(slot.leftId)
    const right = byId.get(slot.rightId)
    if (!left || !right || left.trashed || right.trashed || left.archived || right.archived || left.unreadable || right.unreadable) continue
    if (playedIds.has(left.id) || playedIds.has(right.id)) continue
    if (keys.includes(key)) continue
    if (sameGroup(left, right)) continue
    const cooling = coolingIds(keys)
    if (cooling.has(left.id) || cooling.has(right.id)) continue
    if (!placementStillFair(left, right, pool, keys)) continue
    kept.push({ leftId: slot.leftId, rightId: slot.rightId })
    keys.push(key)
  }
  return kept
}

function standbyPick(pool: Pairable[], keepId: string, dropId: string, recentKeys: string[]) {
  const marked = pool.map(image => image.id === dropId ? { ...image, trashed: true } : image)
  return nextContender(marked, keepId, { recentKeys, rng: () => 0 })
}

function withStandbys(pool: Pairable[], slots: Slot[], recentKeys: string[]) {
  const keys = [...recentKeys]
  return slots.map(slot => {
    const key = pairKey(slot.leftId, slot.rightId)
    const recent = [...keys, key]
    const standbyLeft = standbyPick(pool, slot.rightId, slot.leftId, recent)?.id ?? null
    const standbyRight = standbyPick(pool, slot.leftId, slot.rightId, recent)?.id ?? null
    keys.push(key)
    return { leftId: slot.leftId, rightId: slot.rightId, standbyLeft, standbyRight }
  })
}

export function extendQueue(pool: Pairable[], queue: Slot[], recentKeys: string[], depth = QUEUE_DEPTH, rng: () => number = Math.random) {
  const shadow = pool.map(image => ({ ...image }))
  const byId = new Map(shadow.map(image => [image.id, image]))
  const keys = [...recentKeys]
  const next: Slot[] = []
  for (const slot of queue) {
    const left = byId.get(slot.leftId)
    const right = byId.get(slot.rightId)
    if (!left || !right || left.trashed || right.trashed || left.archived || right.archived || left.unreadable || right.unreadable) continue
    const cooling = coolingIds(keys)
    if (next.length > 0 && (cooling.has(left.id) || cooling.has(right.id))) continue
    const key = pairKey(left.id, right.id)
    if (next.length > 0 && keys[keys.length - 1] === key) continue
    next.push({ leftId: slot.leftId, rightId: slot.rightId })
    keys.push(key)
    left.games += 1
    right.games += 1
  }
  while (next.length < depth) {
    const pair = nextQualifyingPair(shadow, { recentKeys: keys, rng })
    if (!pair) break
    const key = pairKey(pair.left.id, pair.right.id)
    if (keys.length && keys[keys.length - 1] === key) break
    const leftId = rng() < 0.5 ? pair.left.id : pair.right.id
    const rightId = leftId === pair.left.id ? pair.right.id : pair.left.id
    next.push({ leftId, rightId })
    keys.push(key)
    pair.left.games += 1
    pair.right.games += 1
  }
  return withStandbys(pool, next, recentKeys)
}

export function qualifyingProgress(pool: Pairable[]) {
  const images = active(pool)
  const done = images.filter(image => image.games >= QUALIFY_TARGET).length
  const total = images.length
  return {
    done,
    total,
    percent: total ? Math.round((100 * done) / total) : 0,
    ready: total >= 2 && done === total,
  }
}

export function finalsFieldSize(count: number) {
  if (count < 2) return 0
  let size = 2
  while (size * 2 <= Math.min(FINALS_SIZE, count)) size *= 2
  return size
}

export function seedOrder(size: number): number[] {
  if (size <= 2) return [0, 1].slice(0, size)
  const half = seedOrder(size / 2)
  const order: number[] = []
  for (const seed of half) order.push(seed, size - 1 - seed)
  return order
}

export type RoundMatch = { leftId: string, rightId: string, winnerId: string | null }

export function seedBracket(rankedIds: string[]): RoundMatch[] {
  const size = finalsFieldSize(rankedIds.length)
  if (!size) return []
  const seeds = rankedIds.slice(0, size)
  const order = seedOrder(size)
  const round: RoundMatch[] = []
  for (let index = 0; index < order.length; index += 2) {
    round.push({ leftId: seeds[order[index]], rightId: seeds[order[index + 1]], winnerId: null })
  }
  return round
}

export function advanceBracket(rounds: RoundMatch[][], winnerId: string | null) {
  if (!winnerId) return { rounds, championId: null as string | null }
  const next = rounds.map(round => round.map(match => ({ ...match })))
  const round = next[next.length - 1] || []
  const index = round.findIndex(match => !match.winnerId && (match.leftId === winnerId || match.rightId === winnerId))
  if (index < 0) return { rounds: next, championId: null }
  round[index] = { ...round[index], winnerId }
  if (round.some(match => !match.winnerId)) return { rounds: next, championId: null }
  const winners = round.map(match => match.winnerId).filter((id): id is string => Boolean(id))
  if (winners.length <= 1) return { rounds: next, championId: winners[0] || null }
  const pairs: RoundMatch[] = []
  for (let index = 0; index < winners.length; index += 2) {
    pairs.push({ leftId: winners[index], rightId: winners[index + 1], winnerId: null })
  }
  next.push(pairs)
  return { rounds: next, championId: null }
}
