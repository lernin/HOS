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
  function build(cards, width, height) {
    const grammar = window.LOGYQGameGrammar
    const valid = (cards || []).filter(card => grammar.parsePaint(card.paint) &&
      [card.x, card.y, card.width, card.height].every(Number.isFinite) && card.width > 0 && card.height > 0)
    if (!valid.length || !(width > 0) || !(height > 0)) return []
    // Normalize distances by card dimensions, so a row's regions grow sideways
    // naturally while the root can fill the space above the tree.
    const wx = 1 / valid[0].width ** 2, wy = 1 / valid[0].height ** 2
    const centers = valid.map(card => [card.x + card.width / 2, card.y + card.height / 2])
    return valid.map((card, i) => {
      const [cx, cy] = centers[i]
      let cell = [[0, 0], [width, 0], [width, height], [0, height]]
      for (let j = 0; j < valid.length; j++) {
        if (i === j) continue
        const [x, y] = centers[j]
        cell = clip(cell, 2 * (x - cx) * wx, 2 * (y - cy) * wy,
          (x * x - cx * cx) * wx + (y * y - cy * cy) * wy)
      }
      const parsed = grammar.parsePaint(card.paint), spec = grammar.paintSpec(card.paint)
      let regions
      if (parsed.shape === 'W') regions = [{color:spec.solid, polygon:cell}]
      else {
        const slope = card.height / card.width
        const a = parsed.shape === 'DL' ? -slope : parsed.shape === 'DR' ? slope : 0
        const c = a * cx + cy
        regions = [
          {color:spec.stops[0][1], polygon:clip(cell, a, 1, c)},
          {color:spec.stops[3][1], polygon:clip(cell, -a, -1, -c)},
        ]
      }
      return {...card, regions:regions.filter(region => region.polygon.length >= 3)}
    })
  }
  window.LOGYQCompletionArt = Object.freeze({build})
})()
