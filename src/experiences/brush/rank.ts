export type Margin = 'clear' | 'close'

function kFor(games: number, margin: Margin) {
  const base = games < 8 ? 48 : 24
  return margin === 'close' ? base / 3 : base
}

/** Same step as private.brush_rate. Each image uses its own K: 48 before 8 games, then 24. A close call uses one third of that image's K. */
export function eloUpdate(eloA: number, eloB: number, gamesA: number, gamesB: number, aWon: boolean, margin: Margin = 'clear') {
  const kA = kFor(gamesA, margin)
  const kB = kFor(gamesB, margin)
  const expectedA = 1 / (1 + 10 ** ((eloB - eloA) / 400))
  const scoreA = aWon ? 1 : 0
  const scoreB = aWon ? 0 : 1
  return {
    k: kA,
    kA,
    kB,
    expectedA,
    eloA: eloA + kA * (scoreA - expectedA),
    eloB: eloB + kB * (scoreB - (1 - expectedA)),
  }
}

export function nextSigma(sigma: number) {
  return Math.max(60, sigma * 0.94)
}
