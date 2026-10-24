import { countryFromPath, filenameAttributes, groupKeys, seriesFromName, type GroupSource } from './names.ts'
import { compareConservative, glickoInformation, rdOf } from './rank.ts'

export const QUALIFY_TARGET = 4
export const QUEUE_DEPTH = 5
export const FINALS_SIZE = 16
export const HASH_DISTANCE = 8
export const PLACEMENT_GAMES = 5
export const PLACEMENT_QUANTILES = [0.5, 0.8, 0.2, 0.65, 0.35]
export const RECENT_WINDOW = 10
export const CLOSE_ELO = 150
export const WILDCARD_RATE = 0.2

export type Pairable = GroupSource & {
  id: string
  elo: number
  games: number
  sigma?: number
  perceptual_hash?: string | null
  trashed?: boolean
  archived?: boolean
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

export type Slot = { leftId: string, rightId: string }

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
  return pool.filter(image => !image.trashed && !image.archived)
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

function placementTarget(games: number, established: Pairable[]) {
  const sorted = [...established].sort((a, b) => a.elo - b.elo || a.id.localeCompare(b.id))
  const quantile = PLACEMENT_QUANTILES[Math.min(Math.max(games, 0), PLACEMENT_QUANTILES.length - 1)]
  const index = Math.round(quantile * (sorted.length - 1))
  return sorted[Math.min(sorted.length - 1, Math.max(0, index))].elo
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

type Scored = { image: Pairable, hard: boolean, diversity: number, gap: number, info: number }

/** Inside a placement band, this much information offsets a small variety penalty. It does not override a recent repeat. */
const INFO_WEIGHT = 400

function scoreOpponent(anchor: Pairable, image: Pairable, target: number, keys: string[], avoidIds: string[], byId: Map<string, Pairable>): Scored {
  const hard = sameGroup(anchor, image)
  const gap = Math.abs(image.elo - target)
  const info = glickoInformation(anchor.elo, image.elo, rdOf(image))
  if (hard) return { image, hard, diversity: 0, gap, info: 0 }
  const recent = keys.slice(-RECENT_WINDOW)
  const older = keys.slice(0, -RECENT_WINDOW)
  const anchorLook = lookOf(anchor)
  const look = lookOf(image)
  const faced = recentOpponents(anchor.id, recent)
  const facedEarlier = recentOpponents(anchor.id, older)
  const recentLooks = traitsOf(faced, byId)
  const candidateLooks = traitsOf(recentOpponents(image.id, recent), byId)
  let diversity = avoidIds.includes(image.id) ? 3000 : 0
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
  return { image, hard, diversity, gap, info }
}

function pickFrom(items: Scored[], rng: () => number) {
  return items[Math.floor(rng() * items.length)].image
}

function pickOpponent(anchor: Pairable, images: Pairable[], target: number, placingAnchor: boolean, keys: string[], avoidIds: string[], rng: () => number) {
  const byId = new Map(images.map(image => [image.id, image]))
  const scored = images
    .filter(image => image.id !== anchor.id)
    .map(image => scoreOpponent(anchor, image, target, keys, avoidIds, byId))
  const legal = scored.filter(item => !item.hard)
  const source = legal.length ? legal : scored
  if (!source.length) return null
  const established = source.filter(item => item.image.games >= PLACEMENT_GAMES)
  const wildcard = rng() < WILDCARD_RATE
  if (placingAnchor) {
    const field = established.length ? established : source
    if (wildcard) return pickFrom(field, rng)
    const widths = [CLOSE_ELO, CLOSE_ELO * 2, CLOSE_ELO * 4, Number.POSITIVE_INFINITY]
    let near = field
    for (const width of widths) {
      const within = field.filter(item => item.gap <= width)
      if (within.length) {
        near = within
        break
      }
    }
    const value = (item: Scored) => item.diversity - item.info * INFO_WEIGHT
    const ranked = [...near].sort((a, b) => value(a) - value(b) || a.gap - b.gap || a.image.id.localeCompare(b.image.id))
    const best = value(ranked[0])
    const band = ranked.filter(item => value(item) <= best + 40)
    return pickFrom(band, rng)
  }
  if (anchor.games >= PLACEMENT_GAMES) {
    const field = established.length ? established : source
    if (wildcard) return pickFrom(field, rng)
    const widths = [CLOSE_ELO, CLOSE_ELO * 2, CLOSE_ELO * 4, Number.POSITIVE_INFINITY]
    let band = field
    for (const width of widths) {
      const within = field.filter(item => item.gap <= width)
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
  if (wildcard) return pickFrom(source, rng)
  const ordered = [...source].sort((a, b) => a.diversity - b.diversity || a.gap - b.gap || a.image.id.localeCompare(b.image.id))
  const varied = ordered.filter(item => item.diversity <= ordered[0].diversity + 40)
  return pickFrom(varied, rng)
}

export function nextQualifyingPair(pool: Pairable[], options: { avoidIds?: string[], recentKeys?: string[], rng?: () => number } = {}) {
  const rng = options.rng || Math.random
  const avoidIds = options.avoidIds || []
  const recentKeys = options.recentKeys || []
  const images = active(pool)
  if (images.length < 2) return null
  const placing = images.filter(image => image.games < PLACEMENT_GAMES)
  const established = images.filter(image => image.games >= PLACEMENT_GAMES)
  let anchorPool: Pairable[]
  if (placing.length) {
    const minGames = Math.min(...placing.map(image => image.games))
    anchorPool = placing.filter(image => image.games === minGames)
  } else {
    const minGames = Math.min(...images.map(image => image.games))
    const fresh = images.filter(image => image.games === minGames)
    anchorPool = rng() < 0.7 ? fresh : images
  }
  const unseen = anchorPool.filter(image => !avoidIds.includes(image.id))
  if (unseen.length) anchorPool = unseen
  else if (!placing.length) {
    const anyUnseen = images.filter(image => !avoidIds.includes(image.id))
    if (anyUnseen.length) anchorPool = anyUnseen
  }
  const anchor = anchorPool[Math.floor(rng() * anchorPool.length)]
  const placingAnchor = anchor.games < PLACEMENT_GAMES && established.some(image => image.id !== anchor.id)
  const target = placingAnchor ? placementTarget(anchor.games, established.filter(image => image.id !== anchor.id)) : anchor.elo
  const opponent = pickOpponent(anchor, images, target, placingAnchor, recentKeys, avoidIds, rng)
  if (!opponent) return null
  return { left: anchor, right: opponent }
}

function starvedNewcomer(keep: Pairable, images: Pairable[], keys: string[], rng: () => number) {
  const newcomers = images.filter(image => image.id !== keep.id && image.games < PLACEMENT_GAMES && !sameGroup(keep, image))
  if (!newcomers.length) return null
  const minGames = Math.min(...newcomers.map(image => image.games))
  const starved = newcomers.filter(image => image.games === minGames)
  const byId = new Map(images.map(image => [image.id, image]))
  const scored = starved.map(image => ({ ...scoreOpponent(image, keep, image.elo, keys, [], byId), image }))
  const value = (item: Scored) => item.diversity - item.info * INFO_WEIGHT
  scored.sort((a, b) => value(a) - value(b) || a.image.id.localeCompare(b.image.id))
  const best = value(scored[0])
  const band = scored.filter(item => value(item) <= best + 40)
  return pickFrom(band, rng)
}

export function nextContender(pool: Pairable[], keepId: string, options: { recentKeys?: string[], rng?: () => number } = {}) {
  const rng = options.rng || Math.random
  const images = active(pool)
  const keep = images.find(image => image.id === keepId)
  if (!keep) return null
  if (keep.games >= PLACEMENT_GAMES) {
    const challenger = starvedNewcomer(keep, images, options.recentKeys || [], rng)
    if (challenger) return challenger
  }
  const established = images.filter(image => image.games >= PLACEMENT_GAMES && image.id !== keep.id)
  const placingAnchor = keep.games < PLACEMENT_GAMES && established.length > 0
  const target = placingAnchor ? placementTarget(keep.games, established) : keep.elo
  return pickOpponent(keep, images, target, placingAnchor, options.recentKeys || [], [], rng)
}

export function extendQueue(pool: Pairable[], queue: Slot[], recentKeys: string[], depth = QUEUE_DEPTH, rng: () => number = Math.random) {
  const shadow = pool.map(image => ({ ...image }))
  const next = queue.filter(slot => {
    const left = shadow.find(image => image.id === slot.leftId)
    const right = shadow.find(image => image.id === slot.rightId)
    return left && right && !left.trashed && !right.trashed && !left.archived && !right.archived
  })
  const keys = [...recentKeys]
  for (const slot of next) {
    keys.push(pairKey(slot.leftId, slot.rightId))
    const left = shadow.find(image => image.id === slot.leftId)
    const right = shadow.find(image => image.id === slot.rightId)
    if (left) left.games += 1
    if (right) right.games += 1
  }
  while (next.length < depth) {
    const avoidIds = next.length ? [next[next.length - 1].leftId, next[next.length - 1].rightId] : []
    const pair = nextQualifyingPair(shadow, { avoidIds, recentKeys: keys, rng })
    if (!pair) break
    const key = pairKey(pair.left.id, pair.right.id)
    if (next.length && pairKey(next[next.length - 1].leftId, next[next.length - 1].rightId) === key) break
    const leftId = rng() < 0.5 ? pair.left.id : pair.right.id
    const rightId = leftId === pair.left.id ? pair.right.id : pair.left.id
    next.push({ leftId, rightId })
    keys.push(key)
    pair.left.games += 1
    pair.right.games += 1
  }
  return next
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
