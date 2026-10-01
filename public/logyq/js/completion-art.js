/* Solved-card color regions extended into a viewport-sized composition. */
(() => {
  'use strict'
  // Clip a convex polygon to a*x+b*y <= c. All joins share identical lines.
  function clip(polygon, a, b, c) {
    const out = []
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i], q = polygon[(i + 1) % polygon.length]
      const dp = a * p[0] + b * p[1] - c
      const dq = a * q[0] + b * q[1] - c
      if (dp <= 1e-8) out.push(p)
      if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) {
        const t = dp / (dp - dq)
        out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])])
      }
    }
    return out
  }
  function area(polygon) {
    return Math.abs(polygon.reduce((sum, p, i) => {
      const q = polygon[(i + 1) % polygon.length]
      return sum + p[0] * q[1] - q[0] * p[1]
    }, 0)) / 2
  }
  function centroid(polygon) {
    let weight = 0, x = 0, y = 0
    polygon.forEach((p, i) => {
      const q = polygon[(i + 1) % polygon.length], cross = p[0] * q[1] - q[0] * p[1]
      weight += cross; x += (p[0] + q[0]) * cross; y += (p[1] + q[1]) * cross
    })
    return [x / (3 * weight), y / (3 * weight)]
  }
  function build(cards, width, height) {
    const grammar = window.LOGYQGameGrammar
    const valid = (cards || []).filter(card => grammar.parsePaint(card.paint) &&
      [card.x, card.y, card.width, card.height].every(Number.isFinite) && card.width > 0 && card.height > 0)
    if (!valid.length || !(width > 0) || !(height > 0)) return []
    const rectangle = [[0, 0], [width, 0], [width, height], [0, height]]
    const seeds = valid.map(card => {
      const parsed = grammar.parsePaint(card.paint), spec = grammar.paintSpec(card.paint)
      const cx = card.x + card.width / 2, cy = card.y + card.height / 2
      const a = (parsed.shape === 'DL' ? -1 : parsed.shape === 'DR' ? 1 : 0) * card.height / card.width
      return {card, parsed, spec, cx, cy, a, c:a * cx + cy}
    })
    // Partition by the pieces' actual split lines, extended all the way across
    // the viewport. No artificial card territories can interrupt a diagonal.
    let faces = [rectangle]
    for (const seed of seeds) {
      if (seed.parsed.shape === 'W') continue
      faces = faces.flatMap(face => [clip(face, seed.a, 1, seed.c),
        clip(face, -seed.a, -1, -seed.c)]).filter(face => area(face) > 1e-6)
    }
    // A layer card has a two-color side signature. Keep a full-height
    // divider beside it so its neighbor's colors cannot swallow a layer.
    // Diagonal siblings already supply their own intersecting boundaries.
    for (let i = 0; i < seeds.length; i++) for (let j = i + 1; j < seeds.length; j++) {
      if (seeds[i].parsed.shape !== 'L' && seeds[j].parsed.shape !== 'L') continue
      if (Math.abs(seeds[i].cy - seeds[j].cy) > 1 || Math.abs(seeds[i].cx - seeds[j].cx) < 1) continue
      const x = (seeds[i].cx + seeds[j].cx) / 2
      faces = faces.flatMap(face => [clip(face, 1, 0, x), clip(face, -1, 0, -x)])
        .filter(face => area(face) > 1e-6)
    }
    const result = valid.map(card => ({...card, regions:[]}))
    for (const face of faces) {
      const center = centroid(face)
      let owner = 0, bestArea = -1, bestDistance = Infinity
      seeds.forEach((seed, i) => {
        const card = seed.card
        // Regions crossing a card retain that card's colors. Empty space is
        // filled from the closest card; an entire face always has one color.
        let overlap = clip(face, -1, 0, -card.x)
        overlap = clip(overlap, 1, 0, card.x + card.width)
        overlap = clip(overlap, 0, -1, -card.y)
        overlap = clip(overlap, 0, 1, card.y + card.height)
        const coverage = area(overlap) / (card.width * card.height)
        const distance = ((center[0] - seed.cx) / card.width) ** 2 +
          ((center[1] - seed.cy) / card.height) ** 2
        if (coverage > bestArea + 1e-8 || (Math.abs(coverage - bestArea) <= 1e-8 && distance < bestDistance)) {
          owner = i; bestArea = coverage; bestDistance = distance
        }
      })
      const seed = seeds[owner]
      const color = seed.parsed.shape === 'W' ? seed.spec.solid :
        seed.spec.stops[seed.a * center[0] + center[1] <= seed.c ? 0 : 3][1]
      result[owner].regions.push({color, polygon:face})
    }
    return result
  }
  window.LOGYQCompletionArt = Object.freeze({build})
})()
