import { FINALS_SIZE, pairKey, PLACEMENT_GAMES, sameGroup, type Pairable } from './pair.ts'
import { compareConservative, conservativeRating, rdOf } from './rank.ts'
import { activePool } from './ranking.ts'

/** Confident top 16: rating deviation at or below this can lock, or earn a round-1 bye. */
export const SETTLED_SIGMA = 120

export type Rec = { w: number, l: number }
export type ShowKind = 'title' | 'results' | 'reveal'
export type Contender = Pairable & { culled?: boolean }

export type Gauntlet = {
  kind: 'swiss' | 'wildcard'
  short: string
  title: string
  detail: string
  round: number
  pairs: number
  index: number
  records: Record<string, Rec>
  advanced: string[]
  eliminated: string[]
  contenders: string[]
  finalists: string[]
  challengers: string[]
  opening: number
  cuts: number[]
  recentOut: string[]
}

export type ShowBanner = {
  kind: ShowKind
  title: string
  detail: string
  thumbs: string[]
  then?: 'title' | 'reveal'
}

export type SearchTrail = {
  opening: number
  cuts: number[]
  recentOut: string[]
  records: Record<string, Rec>
  contenders: string[]
  eliminated: string[]
  advanced: string[]
  finalists: string[]
}

export type FunnelStop = { count: number, state: 'done' | 'current' | 'next', label: string }
export type SearchGroup = { label: string, ids: string[] }
export type SearchLeader = { id: string, record: string }

const RECORD_ORDER = ['2-0', '2-1', '1-0', '1-1', '0-0', '0-1']

export function trailFrom(gauntlet: Gauntlet): SearchTrail {
  return {
    opening: gauntlet.opening,
    cuts: gauntlet.cuts.slice(),
    recentOut: gauntlet.recentOut.slice(),
    records: { ...gauntlet.records },
    contenders: gauntlet.contenders.slice(),
    eliminated: gauntlet.eliminated.slice(),
    advanced: gauntlet.advanced.slice(),
    finalists: gauntlet.finalists.slice(),
  }
}

export function cutoffOf(images: Contender[]) {
  const active = [...activePool(images)].sort(compareConservative)
  if (active.length < FINALS_SIZE) return null
  const sixteenth = active[FINALS_SIZE - 1]
  return conservativeRating(sixteenth.elo, rdOf(sixteenth))
}

export function highConfidenceOut(image: Contender, cutoff: number | null) {
  if (cutoff == null || image.games < 2) return false
  return image.elo + 2 * rdOf(image) < cutoff
}

export function deservesBye(image: Contender, rank: number) {
  if (image.games < PLACEMENT_GAMES || rank > FINALS_SIZE) return false
  const margin = (image.wins ?? 0) - (image.losses ?? 0)
  return rdOf(image) <= SETTLED_SIGMA || margin >= 3
}

/** The top 16 are confident and nobody outside them can still play their way in. Near misses may still wildcard. */
export function fieldLocked(images: Contender[]) {
  const active = activePool(images)
  if (active.length < FINALS_SIZE) return false
  const top = [...active].sort(compareConservative).slice(0, FINALS_SIZE)
  if (!top.every(image => rdOf(image) <= SETTLED_SIGMA)) return false
  const ids = new Set(top.map(image => image.id))
  const cutoff = cutoffOf(active)
  return active.every(image => ids.has(image.id) || highConfidenceOut(image, cutoff))
}

export function nearMisses(images: Contender[]) {
  const active = [...activePool(images)].sort(compareConservative)
  return active.slice(FINALS_SIZE, FINALS_SIZE * 2)
}

export function shouldChase(images: Contender[]) {
  if (activePool(images).length < FINALS_SIZE) return false
  if (!fieldLocked(images)) return true
  return nearMisses(images).length > 0
}

export function swissTitle(round: number, alive: number) {
  const detail = `${alive} contenders`
  if (alive <= 32 && alive > 16) return { title: 'Top 32', short: 'Top 32', detail }
  if (round <= 1) return { title: 'Round 1: The Gauntlet', short: 'The Gauntlet', detail }
  return { title: `Round ${round}`, short: `Round ${round}`, detail }
}

export function knockoutTitle(size: number) {
  if (size === 4) return { title: 'Quarterfinals', short: 'Quarterfinals' }
  if (size === 2) return { title: 'Semifinals', short: 'Semifinals' }
  if (size === 1) return { title: 'The Final', short: 'The Final' }
  return null
}

function projectNext(count: number) {
  if (count <= 40) return 16
  if (count <= 140) return Math.max(16, Math.round(count * 0.34))
  return Math.max(16, Math.round(count * 0.377))
}

export function buildFunnel(opening: number, cuts: number[], live: number): FunnelStop[] {
  const past = [Math.max(opening, 0), ...cuts.filter(count => count > 0)]
  const stops: FunnelStop[] = []
  past.forEach((count, index) => {
    const last = index === past.length - 1
    stops.push({ count, state: last && count === live ? 'current' : 'done', label: '' })
  })
  if (stops[stops.length - 1]?.count !== live) {
    if (stops[stops.length - 1]?.state === 'current') stops[stops.length - 1].state = 'done'
    stops.push({ count: live, state: 'current', label: '' })
  }
  let cursor = live
  while (cursor > 16 && stops.length < 4) {
    const next = projectNext(cursor)
    if (next >= cursor) break
    stops.push({ count: next, state: 'next', label: '' })
    cursor = next
  }
  if ((stops[stops.length - 1]?.count ?? 0) !== 16 && live > 16) stops.push({ count: 16, state: 'next', label: '' })
  const compact: FunnelStop[] = []
  for (const stop of stops) {
    const previous = compact[compact.length - 1]
    if (previous && previous.count === stop.count) {
      previous.state = stop.state === 'current' ? 'current' : previous.state
      continue
    }
    compact.push(stop)
  }
  return compact.slice(0, 5).map((stop, index, all) => ({
    ...stop,
    label: stop.count === 16 && index === all.length - 1 ? 'Top 16' : index === 0 ? 'Field' : `Round ${index}`,
  }))
}

export function seedRound(images: Contender[]): Gauntlet {
  const active = images.filter(image => !image.trashed && !image.archived && !image.unreadable).sort(compareConservative)
  const cutoff = cutoffOf(active)
  const records: Record<string, Rec> = {}
  const eliminated: string[] = []
  const advanced: string[] = []
  const contenders: string[] = []
  const recentOut: string[] = []
  active.forEach((image, index) => {
    const rank = index + 1
    if (highConfidenceOut(image, cutoff)) {
      eliminated.push(image.id)
      recentOut.push(image.id)
      return
    }
    contenders.push(image.id)
    if (deservesBye(image, rank)) {
      records[image.id] = { w: 2, l: 0 }
      advanced.push(image.id)
      return
    }
    const wins = image.wins ?? 0
    const losses = image.losses ?? 0
    if (image.games >= 3 && rank <= 32 && wins >= losses) records[image.id] = { w: 1, l: 0 }
    else if (image.games >= 3 && rank > 48 && wins < losses) records[image.id] = { w: 0, l: 1 }
    else records[image.id] = { w: 0, l: 0 }
  })
  const titled = swissTitle(1, contenders.length)
  return {
    kind: 'swiss',
    ...titled,
    round: 1,
    pairs: 0,
    index: 0,
    records,
    advanced,
    eliminated,
    contenders,
    finalists: [],
    challengers: [],
    opening: active.length,
    cuts: [],
    recentOut: recentOut.slice(0, 24),
  }
}

export function playingIds(gauntlet: Gauntlet) {
  const out = new Set(gauntlet.eliminated)
  const advanced = new Set(gauntlet.advanced)
  return gauntlet.contenders.filter(id => !out.has(id) && !advanced.has(id))
}

export function isRoundOver(gauntlet: Gauntlet) {
  const playing = playingIds(gauntlet)
  if (!playing.length) return true
  const size = gauntlet.contenders.length
  if (size <= 16 || size > 32) return false
  const advanced = gauntlet.advanced.filter(id => !gauntlet.eliminated.includes(id)).length
  if (advanced >= 16) return true
  const outs = gauntlet.contenders.filter(id => gauntlet.eliminated.includes(id)).length
  return outs >= size - 16
}

export function closeRound(gauntlet: Gauntlet): Gauntlet {
  const eliminated = new Set(gauntlet.eliminated)
  let advanced = gauntlet.advanced.filter(id => !eliminated.has(id))
  const playing = gauntlet.contenders.filter(id => !eliminated.has(id) && !advanced.includes(id))
  let recentOut = gauntlet.recentOut.slice()
  const size = gauntlet.contenders.length
  if (size > 32 || size <= 16) return { ...gauntlet, advanced }
  if (advanced.length >= 16) {
    for (const id of playing) {
      if (eliminated.has(id)) continue
      eliminated.add(id)
      recentOut = [id, ...recentOut.filter(item => item !== id)].slice(0, 24)
    }
    return { ...gauntlet, advanced: advanced.slice(0, 16), eliminated: [...eliminated], recentOut }
  }
  if (advanced.length + playing.length <= 16) {
    advanced = [...advanced, ...playing]
  }
  return { ...gauntlet, advanced, eliminated: [...eliminated], recentOut }
}

function grantWin(gauntlet: Gauntlet, id: string): Gauntlet {
  const rec = gauntlet.records[id] || { w: 0, l: 0 }
  const records = { ...gauntlet.records, [id]: { w: rec.w + 1, l: rec.l } }
  const advanced = gauntlet.advanced.slice()
  if (rec.w + 1 >= 2 && !advanced.includes(id)) advanced.push(id)
  return { ...gauntlet, records, advanced }
}

function markOut(gauntlet: Gauntlet, id: string): Gauntlet {
  if (gauntlet.eliminated.includes(id)) return gauntlet
  return {
    ...gauntlet,
    advanced: gauntlet.advanced.filter(item => item !== id),
    eliminated: [...gauntlet.eliminated, id],
    recentOut: [id, ...gauntlet.recentOut.filter(item => item !== id)].slice(0, 24),
  }
}

export function withResult(gauntlet: Gauntlet, leftId: string, rightId: string, winnerId: string | null): Gauntlet {
  if (!winnerId) return { ...gauntlet, index: gauntlet.index + 1 }
  const records = { ...gauntlet.records }
  const bump = (id: string, win: boolean) => {
    const rec = records[id] || { w: 0, l: 0 }
    records[id] = win ? { w: rec.w + 1, l: rec.l } : { w: rec.w, l: rec.l + 1 }
  }
  bump(leftId, winnerId === leftId)
  bump(rightId, winnerId === rightId)
  let next: Gauntlet = { ...gauntlet, records, index: gauntlet.index + 1 }
  for (const id of [leftId, rightId]) {
    const rec = next.records[id]
    if (!rec) continue
    if (rec.w >= 2 && !next.advanced.includes(id)) next = { ...next, advanced: [...next.advanced, id] }
    if (rec.l >= 2) next = markOut(next, id)
  }
  return next
}

export function wildcardResult(gauntlet: Gauntlet, leftId: string, rightId: string, winnerId: string | null): Gauntlet {
  const challenger = gauntlet.challengers.includes(leftId) ? leftId : gauntlet.challengers.includes(rightId) ? rightId : null
  const defender = challenger === leftId ? rightId : challenger === rightId ? leftId : null
  let next: Gauntlet = { ...gauntlet, index: gauntlet.index + 1 }
  if (!challenger || !defender || !winnerId) return next
  if (winnerId === challenger) {
    next = {
      ...next,
      finalists: next.finalists.map(id => id === defender ? challenger : id),
      eliminated: next.eliminated.filter(id => id !== challenger),
      advanced: next.advanced.map(id => id === defender ? challenger : id),
    }
    return markOut(next, defender)
  }
  return markOut(next, challenger)
}

function orderAvoid(pairs: { leftId: string, rightId: string }[], avoid: string[]) {
  if (pairs.length < 2 || !avoid.length) return pairs
  const blocked = new Set(avoid)
  const clean = pairs.findIndex(pair => !blocked.has(pair.leftId) && !blocked.has(pair.rightId))
  if (clean <= 0) return pairs
  return [pairs[clean], ...pairs.slice(0, clean), ...pairs.slice(clean + 1)]
}

function pairGroups(images: Contender[], gauntlet: Gauntlet, recentKeys: string[], rng: () => number) {
  const byId = new Map(images.map(image => [image.id, image]))
  const usedKeys = new Set(recentKeys)
  const playing = playingIds(gauntlet)
  const groups = new Map<string, string[]>()
  for (const id of playing) {
    const rec = gauntlet.records[id] || { w: 0, l: 0 }
    const key = `${rec.w}-${rec.l}`
    const list = groups.get(key) || []
    list.push(id)
    groups.set(key, list)
  }
  const order = ['0-1', '1-1', '0-0', '1-0', '2-1', '2-0']
  const keys = [...groups.keys()].sort((left, right) => {
    const leftAt = order.indexOf(left)
    const rightAt = order.indexOf(right)
    return (leftAt < 0 ? 9 : leftAt) - (rightAt < 0 ? 9 : rightAt)
  })
  const pairs: { leftId: string, rightId: string }[] = []
  const paired = new Set<string>()
  for (const key of keys) {
    const remaining = (groups.get(key) || [])
      .filter(id => byId.has(id))
      .sort((left, right) => compareConservative(byId.get(left)!, byId.get(right)!))
    while (remaining.length >= 2) {
      const anchor = remaining.shift()!
      const anchorImage = byId.get(anchor)!
      const pickAt = remaining.findIndex(id => {
        const other = byId.get(id)!
        return !sameGroup(anchorImage, other) && !usedKeys.has(pairKey(anchor, id))
      })
      if (pickAt < 0) continue
      const otherId = remaining.splice(pickAt, 1)[0]
      paired.add(anchor)
      paired.add(otherId)
      usedKeys.add(pairKey(anchor, otherId))
      const swap = rng() < 0.5
      pairs.push(swap ? { leftId: otherId, rightId: anchor } : { leftId: anchor, rightId: otherId })
    }
  }
  const unpaired = playing.filter(id => !paired.has(id))
  return { pairs, unpaired }
}

export function prepareWave(images: Contender[], gauntlet: Gauntlet, recentKeys: string[], avoid: string[], rng: () => number = Math.random) {
  let next = gauntlet
  for (let guard = 0; guard < 4; guard += 1) {
    if (isRoundOver(next)) return { gauntlet: closeRound(next), pairs: [] as { leftId: string, rightId: string }[] }
    const wave = pairGroups(images, next, recentKeys, rng)
    let cursor = next
    for (const id of wave.unpaired) cursor = grantWin(cursor, id)
    const pairs = orderAvoid(wave.pairs, avoid)
    if (isRoundOver(cursor)) return { gauntlet: closeRound(cursor), pairs: [] }
    if (pairs.length) return { gauntlet: cursor, pairs }
    if (!wave.unpaired.length) break
    next = cursor
  }
  return { gauntlet: closeRound(next), pairs: [] as { leftId: string, rightId: string }[] }
}

export function nextSwiss(previous: Gauntlet, advanced: string[]): Gauntlet {
  const records: Record<string, Rec> = {}
  for (const id of advanced) records[id] = { w: 0, l: 0 }
  const round = previous.round + 1
  const titled = swissTitle(round, advanced.length)
  const cuts = previous.cuts[previous.cuts.length - 1] === advanced.length ? previous.cuts : [...previous.cuts, advanced.length]
  return {
    ...previous,
    kind: 'swiss',
    ...titled,
    round,
    pairs: 0,
    index: 0,
    records,
    advanced: [],
    contenders: advanced.slice(),
    finalists: [],
    challengers: [],
    cuts,
  }
}

export function buildWildcard(gauntlet: Gauntlet, images: Contender[], recentKeys: string[], rng: () => number = Math.random) {
  const byId = new Map(images.map(image => [image.id, image]))
  const alive = gauntlet.advanced.filter(id => !gauntlet.eliminated.includes(id) && byId.has(id))
  const field = [...alive].sort((left, right) => compareConservative(byId.get(left)!, byId.get(right)!)).slice(0, FINALS_SIZE)
  const fieldSet = new Set(field)
  const challengers = [...activePool(images)].filter(image => !fieldSet.has(image.id)).sort(compareConservative).slice(0, FINALS_SIZE)
  const bubble = [...field].reverse()
  const used = new Set<string>()
  const seen = new Set(recentKeys)
  const pairs: { leftId: string, rightId: string }[] = []
  const challengerIds: string[] = []
  for (const challenger of challengers) {
    const defenderId = bubble.find(id => {
      if (used.has(id)) return false
      const defender = byId.get(id)
      if (!defender || sameGroup(challenger, defender)) return false
      return !seen.has(pairKey(challenger.id, id))
    })
    if (!defenderId) continue
    used.add(defenderId)
    seen.add(pairKey(challenger.id, defenderId))
    challengerIds.push(challenger.id)
    const swap = rng() < 0.5
    pairs.push(swap ? { leftId: defenderId, rightId: challenger.id } : { leftId: challenger.id, rightId: defenderId })
  }
  const cuts = gauntlet.cuts[gauntlet.cuts.length - 1] === field.length ? gauntlet.cuts : [...gauntlet.cuts, field.length]
  return {
    pairs: orderAvoid(pairs, []),
    gauntlet: {
      ...gauntlet,
      kind: 'wildcard' as const,
      title: 'Wildcard Challenge',
      short: 'Wildcard Challenge',
      detail: `${field.length} contenders`,
      pairs: pairs.length,
      index: 0,
      finalists: field,
      challengers: challengerIds,
      contenders: field,
      cuts,
    },
  }
}

export function aliveCount(gauntlet: Gauntlet | null, trail: SearchTrail | null) {
  const source = gauntlet || trail
  if (!source) return 0
  if (gauntlet?.kind === 'wildcard') return gauntlet.finalists.length || gauntlet.contenders.length
  const eliminated = new Set(source.eliminated)
  if (source.contenders.length) return source.contenders.filter(id => !eliminated.has(id)).length
  return source.finalists.length || source.opening
}

export function searchGroups(records: Record<string, Rec>, contenders: string[], eliminated: string[]) {
  const out = new Set(eliminated)
  const buckets = new Map<string, string[]>()
  for (const id of contenders) {
    if (out.has(id)) continue
    const rec = records[id] || { w: 0, l: 0 }
    const label = `${rec.w}-${rec.l}`
    const list = buckets.get(label) || []
    list.push(id)
    buckets.set(label, list)
  }
  return RECORD_ORDER.filter(label => buckets.has(label)).map(label => ({ label, ids: buckets.get(label) || [] }))
}

export function viewSearch(images: Contender[], gauntlet: Gauntlet | null, trail: SearchTrail | null) {
  const source = gauntlet || trail
  if (!source) return null
  const contention = gauntlet?.kind === 'wildcard' ? (gauntlet.finalists.length || aliveCount(gauntlet, trail)) : aliveCount(gauntlet, trail)
  const gone = new Set(source.eliminated)
  const living = images.filter(image => !gone.has(image.id))
  const preferred = gauntlet?.kind === 'wildcard'
    ? gauntlet.finalists
    : gauntlet == null && trail?.finalists.length
      ? trail.finalists
      : []
  const leaders = searchLeaders(living, source.records, preferred)
  return {
    funnel: buildFunnel(source.opening || contention, source.cuts, contention),
    contention,
    groups: gauntlet?.kind === 'wildcard' ? searchGroups(source.records, gauntlet.finalists, []) : searchGroups(source.records, gauntlet?.contenders || trail?.contenders || [], source.eliminated),
    leaders,
    eliminated: (gauntlet?.recentOut || trail?.recentOut || []).slice(0, 16),
  }
}

export function searchLeaders(images: Contender[], records: Record<string, Rec>, prefer: string[]) {
  const byId = new Map(images.map(image => [image.id, image]))
  const chosen = prefer.length
    ? prefer.filter(id => byId.has(id)).slice(0, FINALS_SIZE)
    : [...activePool(images)].sort(compareConservative).slice(0, FINALS_SIZE).map(image => image.id)
  return chosen.map(id => {
    const rec = records[id]
    return { id, record: rec ? `${rec.w}-${rec.l}` : '—' }
  })
}
