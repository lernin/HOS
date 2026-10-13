import * as T from 'three'
import { type Kit, surface } from './geometry'
import { terrainHeight, type WorldPoint } from './layout'

/** Editable spines of the continuous white shell. Coordinates are metres. */
type Section = WorldPoint & { width: number; depth: number }

export function sweptShell(sections: Section[], samples = 72): T.BufferGeometry {
  const spine = new T.CatmullRomCurve3(sections.map(p => new T.Vector3(p.x, p.y, p.z)), false, 'centripetal')
  const vertices: number[] = [], indices: number[] = []
  const sides = 12
  for (let i = 0; i <= samples; i++) {
    const t = i / samples, q = spine.getPoint(t), d = spine.getTangent(t)
    // The same lateral axis follows the curve even when a support rises nearly vertically.
    let hx = d.x, hz = d.z
    if (Math.hypot(hx, hz) < .045) {
      const first = sections[0], last = sections[sections.length - 1]
      hx = last.x - first.x; hz = last.z - first.z
    }
    const len = Math.hypot(hx, hz) || 1, nx = -hz / len, nz = hx / len
    const u = t * (sections.length - 1), j = Math.min(sections.length - 2, Math.floor(u)), f = u - j
    const width = T.MathUtils.lerp(sections[j].width, sections[j + 1].width, f)
    const depth = T.MathUtils.lerp(sections[j].depth, sections[j + 1].depth, f)
    for (let k = 0; k < sides; k++) {
      const a = 2 * Math.PI * k / sides
      // Oval cross-section: a proper underside, unlike a flat decorative ribbon.
      const across = Math.cos(a) * width / 2, rise = Math.sin(a) * depth / 2
      vertices.push(q.x + nx * across, q.y + rise, q.z + nz * across)
      if (i) {
        const prev = (i - 1) * sides + k, next = (i - 1) * sides + (k + 1) % sides
        const here = i * sides + k, after = i * sides + (k + 1) % sides
        indices.push(prev, here, next, next, here, after)
      }
    }
  }
  for (let k = 1; k < sides - 1; k++) {
    indices.push(0, k + 1, k)
    const end = samples * sides
    indices.push(end, end + k, end + k + 1)
  }
  return surface(vertices, indices)
}

const band = (p: number[][]): Section[] => p.map(([x, y, z, width, depth]) => ({ x, y, z, width, depth }))

/** Main gallery canopy, three asymmetrical floating wing edges, and Y-shaped spans. */
export function sculpturalShell(kit: Kit) {
  const canopies = [
    // Rising central crest and west roof, close to the continuous white canopy in the sheet.
    [[-44, 21.1, -14, 2.5, .55], [-36, 22.6, -27, 5.3, .65], [-22, 24.7, -31, 7.2, .72], [-10, 27.7, -27, 9.1, .86], [0, 28.9, -22, 9.4, .92], [12, 26.3, -26, 7.7, .73], [28, 22.6, -28, 5.2, .6], [42, 20.8, -17, 2.6, .48]],
    // A scalloped elevated fascia wraps each ocean wing without enclosing the gardens.
    [[-42, 20.5, -16, 2.2, .53], [-46, 21.3, -2, 3.7, .7], [-43, 22.1, 12, 4.2, .78], [-36, 23.2, 22, 4.4, .83], [-25, 22.8, 27, 2.5, .68]],
    [[38, 20.5, -19, 2.2, .53], [45, 21.8, -10, 3.5, .68], [47, 22.4, 4, 4.3, .8], [46, 23.6, 17, 4.5, .85], [39, 22.4, 24, 2.4, .55]],
  ]
  for (const canopy of canopies) kit.add(sweptShell(band(canopy)), 'shell')

  const forks: Array<{root: [number, number, number]; tips: Array<[number, number, number]>}> = [
    {root: [-30, 2, 11], tips: [[-44, 15, 19.7], [-21, 23, 20.5], [-42, -7, 20.1]]},
    {root: [29, 10, 11], tips: [[43, 17, 20.2], [19, 23, 20.1], [44, -5, 20.1]]},
    {root: [-18, -24, 12], tips: [[-37, -29, 20.3], [-11, -28, 20.1]]},
    {root: [18, -24, 12], tips: [[35, -29, 20.3], [9, -28, 20.1]]},
  ]
  for (const {root, tips} of forks) for (const [x, z, y] of tips) {
    const [rx, rz, ry] = root
    kit.add(sweptShell(band([
      [rx, ry, rz, 1.9, 1.25],
      [rx + (x - rx) * .17, ry + 2.2, rz + (z - rz) * .12, 1.3, 1.05],
      [rx + (x - rx) * .55, ry + 5.6, rz + (z - rz) * .55, 2.25, 1.0],
      [x, y - .1, z, 5.2, .76],
    ]), 38), 'shell')
  }
}

/** The southern cliff walk is a paved sculptural promenade with its own underside. */
export function cliffPromenade(kit: Kit, centerline: WorldPoint[]) {
  const sections: Section[] = centerline.map((p, i) => ({
    ...p, y: p.y - .08,
    width: i < 8 ? 3.3 : i > centerline.length - 9 ? 3.8 : 2.8 + .5 * Math.sin(i / centerline.length * Math.PI),
    depth: .42,
  }))
  kit.add(sweptShell(sections, Math.max(72, centerline.length)), 'shell')
  // Swept parapet is anchored to the outer side of the winding cliff path.
  const edge: WorldPoint[] = []
  for (let i = 1; i < centerline.length - 1; i += 3) {
    const p = centerline[i], a = centerline[i - 1], b = centerline[i + 1]
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1
    edge.push({x: p.x - dz / l * 1.5, y: p.y + .06, z: p.z + dx / l * 1.5})
  }
  if (edge.length > 2) kit.tube(edge, .09, 'shell', false, edge.length * 3, 8)
  // A few swept buttresses visibly tie the elevated walk to the rock instead of floating freely.
  for (let i = 18; i < centerline.length - 9; i += 21) {
    const p = centerline[i], foot = Math.min(p.y - 1.0, terrainHeight({x:p.x + 2,z:p.z}) - .45)
    if (foot < 1 || p.y - foot < .8) continue
    kit.add(sweptShell(band([
      [p.x + 2, foot, p.z, 1.4, .8],
      [p.x + 1.1, foot + (p.y - foot) * .65, p.z, 1.0, .55],
      [p.x, p.y - .3, p.z, 2.8, .65],
    ]), 20), 'shell')
  }
}
