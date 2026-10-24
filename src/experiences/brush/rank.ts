export type Margin = 'clear' | 'close'

/** Glicko-2 scale factor from Mark Glickman's paper. */
export const GLICKO_SCALE = 173.7178
/** System constant. 0.5 is the usual default and keeps volatility from jumping. */
export const GLICKO_TAU = 0.5
export const INITIAL_RATING = 1500
export const INITIAL_RD = 350
export const MIN_RD = 50
export const MAX_RD = 350
export const INITIAL_VOLATILITY = 0.06

/**
 * Glicko-2, one rating period per match.
 *
 * `elo` is the rating. `sigma` is the rating deviation (RD). `volatility`
 * is how erratic that picture's results have been.
 *
 * A clear win scores 1 against 0. A close call scores 2/3 against 1/3, the
 * same reduced-margin win the contest already used. Both pictures are updated
 * from the ratings they had before the match.
 *
 * Rank and top-16 seeding use a conservative rating, `rating - 2 * RD`, so one
 * lucky win cannot lift an untested picture to #1. Levels still use the raw
 * rating: 1 + floor((rating - 1500) / 100), minimum 1, with no cap.
 *
 * A picture with no stored RD is treated as rdForGames(games), which is how
 * existing pictures were backfilled: max(50, 350 / sqrt(games + 1)).
 */
export function rdForGames(games: number) {
  const played = Number.isFinite(games) ? Math.max(0, games) : 0
  return Math.max(MIN_RD, INITIAL_RD / Math.sqrt(played + 1))
}

export function conservativeRating(rating: number, rd: number) {
  return rating - 2 * (Number.isFinite(rd) ? rd : INITIAL_RD)
}

export function rdOf(image: { sigma?: number, games: number }) {
  return Number.isFinite(image.sigma) ? image.sigma as number : rdForGames(image.games)
}

export function compareConservative<T extends { elo: number, sigma?: number, games: number, name: string, id: string }>(a: T, b: T) {
  const diff = conservativeRating(b.elo, rdOf(b)) - conservativeRating(a.elo, rdOf(a))
  return diff || b.games - a.games || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
}

export type GlickoSide = { rating: number, rd: number, volatility?: number }
export type GlickoGame = { rating: number, rd: number, score: number }

function saneVolatility(volatility: number | undefined) {
  return Number.isFinite(volatility) && (volatility as number) > 0 ? volatility as number : INITIAL_VOLATILITY
}

function gPhi(phi: number) {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI))
}

function expectedScore(mu: number, muOpp: number, gOpp: number) {
  return 1 / (1 + Math.exp(-gOpp * (mu - muOpp)))
}

/** How much one opponent would teach the current estimate. Higher is more informative. Opponent RD matters; the picture's own RD does not. */
export function glickoInformation(rating: number, oppRating: number, oppRd: number) {
  const mu = (rating - INITIAL_RATING) / GLICKO_SCALE
  const muOpp = (oppRating - INITIAL_RATING) / GLICKO_SCALE
  const gOpp = gPhi(oppRd / GLICKO_SCALE)
  const expected = expectedScore(mu, muOpp, gOpp)
  const value = gOpp * gOpp * expected * (1 - expected)
  return Number.isFinite(value) ? value : 0
}

function volatilityStep(phi: number, v: number, delta: number, volatility: number) {
  const a = Math.log(volatility * volatility)
  const tau2 = GLICKO_TAU * GLICKO_TAU
  const phi2 = phi * phi
  const f = (x: number) => {
    const ex = Math.exp(x)
    return (ex * (delta * delta - phi2 - v - ex)) / (2 * (phi2 + v + ex) ** 2) - (x - a) / tau2
  }
  let A = a
  let B: number
  if (delta * delta > phi2 + v) B = Math.log(delta * delta - phi2 - v)
  else {
    let k = 1
    while (f(a - k * GLICKO_TAU) < 0) k += 1
    B = a - k * GLICKO_TAU
  }
  let fA = f(A)
  let fB = f(B)
  for (let guard = 0; Math.abs(B - A) > 1e-6 && guard < 100; guard += 1) {
    const C = A + ((A - B) * fA) / (fB - fA)
    const fC = f(C)
    if (fC * fB < 0) {
      A = B
      fA = fB
    } else fA /= 2
    B = C
    fB = fC
  }
  return Math.exp(A / 2)
}

function clampRd(rd: number) {
  return Math.min(MAX_RD, Math.max(MIN_RD, rd))
}

/** One rating period against every listed result. An empty list leaves the picture unchanged. */
export function glickoPeriod(player: GlickoSide, games: GlickoGame[]) {
  const volatility = saneVolatility(player.volatility)
  const mu = (player.rating - INITIAL_RATING) / GLICKO_SCALE
  const phi = player.rd / GLICKO_SCALE
  if (!games.length) return { rating: player.rating, rd: clampRd(player.rd), volatility }
  let varianceSum = 0
  let outcomeSum = 0
  for (const game of games) {
    const muOpp = (game.rating - INITIAL_RATING) / GLICKO_SCALE
    const gOpp = gPhi(game.rd / GLICKO_SCALE)
    const expected = expectedScore(mu, muOpp, gOpp)
    varianceSum += gOpp * gOpp * expected * (1 - expected)
    outcomeSum += gOpp * (game.score - expected)
  }
  const v = 1 / varianceSum
  const delta = v * outcomeSum
  const nextVolatility = volatilityStep(phi, v, delta, volatility)
  const phiStar = Math.sqrt(phi * phi + nextVolatility * nextVolatility)
  const phiNext = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v)
  return {
    rating: GLICKO_SCALE * (mu + phiNext * phiNext * outcomeSum) + INITIAL_RATING,
    rd: clampRd(GLICKO_SCALE * phiNext),
    volatility: nextVolatility,
  }
}

function marginScores(aWon: boolean, margin: Margin): [number, number] {
  if (margin === 'close') return aWon ? [2 / 3, 1 / 3] : [1 / 3, 2 / 3]
  return aWon ? [1, 0] : [0, 1]
}

/** Update both pictures from their pre-match rating, RD, and volatility. */
export function glickoUpdate(a: GlickoSide, b: GlickoSide, aWon: boolean, margin: Margin = 'clear') {
  const [scoreA, scoreB] = marginScores(aWon, margin)
  const nextA = glickoPeriod(a, [{ rating: b.rating, rd: b.rd, score: scoreA }])
  const nextB = glickoPeriod(b, [{ rating: a.rating, rd: a.rd, score: scoreB }])
  const gOpp = gPhi(b.rd / GLICKO_SCALE)
  const expectedA = expectedScore((a.rating - INITIAL_RATING) / GLICKO_SCALE, (b.rating - INITIAL_RATING) / GLICKO_SCALE, gOpp)
  return {
    eloA: nextA.rating,
    eloB: nextB.rating,
    sigmaA: nextA.rd,
    sigmaB: nextB.rd,
    volatilityA: nextA.volatility,
    volatilityB: nextB.volatility,
    expectedA,
  }
}
