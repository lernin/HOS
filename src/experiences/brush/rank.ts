export type Margin = 'clear' | 'close'

/** Same step as private.brush_rate. K is 48 until both images have 8 games, then 24. A close call uses one third of that. */
export function eloUpdate(eloA: number, eloB: number, gamesA: number, gamesB: number, aWon: boolean, margin: Margin = 'clear') {
  const base = Math.min(gamesA, gamesB) < 8 ? 48 : 24
  const k = margin === 'close' ? base / 3 : base
  const expectedA = 1 / (1 + 10 ** ((eloB - eloA) / 400))
  const scoreA = aWon ? 1 : 0
  const scoreB = aWon ? 0 : 1
  return {
    k,
    expectedA,
    eloA: eloA + k * (scoreA - expectedA),
    eloB: eloB + k * (scoreB - (1 - expectedA)),
  }
}

export function nextSigma(sigma: number) {
  return Math.max(60, sigma * 0.94)
}
