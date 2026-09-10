// Shared world geometry and navigation. All distances are metres.
export type Point = { x: number; y: number; z: number }
export type PathKind = 'trail' | 'boardwalk' | 'stair' | 'bridge'
export type Path = { name: string; points: Point[]; width: number; kind: PathKind; rails?: boolean }

export const spawn = { x: -23, y: 4, z: 42, yaw: -.12 }
export const tree = { x: -32, y: 9, z: -12 }
export const docks = [{ x: -7, y: 1.5, z: 42 }, { x: 17, y: 1.5, z: -101 }]
export const houses = [
  { x: -27, y: 4, z: 24, name: 'Willow Cottage', roof: '#536b73' },
  { x: -39, y: 19, z: -14, name: 'The Treetop Library', roof: '#476b65' },
  { x: 26, y: 8, z: -34, name: 'Fern Cottage', roof: '#a4634d' },
]
export const terraces = [
  { x: -26, z: 31, y: 4, radius: 17 },
  { x: -32, z: -12, y: 9, radius: 18 },
  { x: 28, z: -34, y: 8, radius: 17 },
  { x: 26, z: -94, y: 1.5, radius: 10 },
]

const p = (x: number, y: number, z: number): Point => ({ x, y, z })

// The climb is intentionally a broad, gentle spiral rather than a stack of steep steps.
export const stairPoints = Array.from({ length: 145 }, (_, i) => {
  const t = i / 144
  const a = Math.PI / 2 + t * Math.PI * 4
  return p(tree.x + Math.cos(a) * 7.6, 9 + t * 10, tree.z + Math.sin(a) * 7.6)
})

// One continuous village route. Every route hands directly into the next one.
export const paths: Path[] = [
  {
    name: 'entrance-to-willow',
    points: [p(-23, 4, 42), p(-25, 4, 36), p(-27, 4, 30), p(-27, 4, 28.2)],
    width: 3.6,
    kind: 'trail',
  },
  {
    name: 'entrance-to-river-dock',
    points: [
      p(-23, 4, 42), p(-18, 4, 39), p(-12, 4, 40), p(-9, 4, 40.5),
      p(-8.5, 3.5, 41), p(-8, 3, 41.5), p(-7.5, 2.5, 42), p(-7, 2, 42), p(-7, 1.5, 42),
    ],
    width: 3.2,
    kind: 'boardwalk',
    rails: true,
  },
  {
    name: 'willow-to-tree',
    points: [
      p(-27, 4, 28.2), p(-31.5, 4, 28), p(-34, 4, 25.5), p(-34, 4, 22),
      p(-39, 5.5, 13), p(-42, 7.3, 4), p(-40, 9, -2), p(-32, 9, -4.4),
    ],
    width: 3.8,
    kind: 'trail',
  },
  {
    name: 'winding-tree-walk',
    points: stairPoints,
    width: 2.8,
    kind: 'stair',
    rails: true,
  },
  {
    name: 'tree-to-library',
    points: [p(-32, 19, -4.4), p(-35, 19, -5.8), p(-38.5, 19, -8.8), p(-39, 19, -10.2)],
    width: 3.1,
    kind: 'boardwalk',
    rails: true,
  },
  {
    name: 'library-to-fern',
    points: [
      p(-39, 19, -10.2), p(-35, 19, -10.2), p(-31, 19, -11.5), p(-27, 18.5, -13),
      p(-21, 17.5, -16), p(-13, 16, -20), p(-4, 14.5, -23.5), p(6, 12.5, -26),
      p(15, 10.5, -28), p(22, 9, -29), p(26, 8, -29.8),
    ],
    width: 3.5,
    kind: 'bridge',
    rails: true,
  },
  {
    name: 'fern-to-lake',
    points: [
      p(26, 8, -29.8), p(30.2, 8, -29.8), p(30.5, 8, -34), p(32, 8, -41), p(35, 8, -50),
      p(36, 7.5, -53), p(37, 7, -56), p(37, 6.5, -59), p(36.5, 6, -62), p(36, 5.5, -65),
      p(35, 5, -69), p(34, 4.5, -73), p(32, 4, -78), p(30, 3.5, -83), p(28, 3, -87),
      p(26, 2.5, -91), p(24, 2, -94), p(21, 1.5, -97), p(17, 1.5, -101),
    ],
    width: 3.6,
    kind: 'trail',
  },
]

export function pathNamed(name: string) {
  const path = paths.find(path => path.name === name)
  if (!path) throw new Error(`Unknown village path: ${name}`)
  return path
}

export function riverCenter(z: number) { return 2 + Math.sin(z * .044) * 3 }

export function isWater(x: number, z: number, margin = 0) {
  const wet = (z > -115 && z < 79 && Math.abs(x - riverCenter(z)) < 10 - margin)
    || Math.hypot((x - 3) / 1.15, z + 130) < 46 - margin
  return wet && !terraces.some(t => Math.hypot(x - t.x, z - t.z) < t.radius + Math.max(0, margin))
}

export function projectSegment(x: number, z: number, a: Point, b: Point) {
  const dx = b.x - a.x, dz = b.z - a.z
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)))
  return { distance: Math.hypot(x - a.x - t * dx, z - a.z - t * dz), y: a.y + (b.y - a.y) * t }
}

export function floorCandidates(x: number, z: number): number[] {
  const heights: number[] = []
  const pathHits: { distance: number; y: number }[] = []
  for (const path of paths) for (let i = 1; i < path.points.length; i++) {
    const hit = projectSegment(x, z, path.points[i - 1], path.points[i])
    if (hit.distance < path.width / 2 - .2) pathHits.push(hit)
  }
  pathHits.sort((a, b) => a.distance - b.distance)
  heights.push(...pathHits.map(hit => hit.y))
  for (const t of terraces) if (Math.hypot(x - t.x, z - t.z) < t.radius - .4) heights.push(t.y)
  if (x > -44.5 && x < -31.5 && z > -19 && z < -5.5) heights.push(19)
  for (const d of docks) if (Math.abs(x - d.x) < 3 && Math.abs(z - d.z) < 4.5) heights.push(d.y)
  return heights
}

export function blocked(x: number, y: number, z: number) {
  if (y < 24 && Math.hypot(x - tree.x, z - tree.z) < 2.25) return true
  for (const h of houses) {
    if (Math.abs(y - h.y) > 1) continue
    const dx = x - h.x, dz = z - h.z, edge = .42
    if (Math.abs(dx) < 3.4 + edge && Math.abs(dz) < 3.4 + edge) {
      if (Math.abs(dx) > 3.4 - edge || dz < -3.4 + edge) return true
      if (dz > 3.4 - edge && Math.abs(dx) > 1.02) return true
      if (dx > -2.8 && dx < -1.35 && dz > -1.25 && dz < 1.05) return true
      if (dx > 2.15 && dz < .8) return true
      if (Math.abs(dx) < 1.3 && dz < -2.05) return true
    }
  }
  return false
}

export function walkStep(position: Point, dx: number, dz: number): Point {
  const tryStep = (x: number, z: number) => {
    const candidates = floorCandidates(x, z)
      .filter(y => Math.abs(y - position.y) < .55)
      .sort((a, b) => Math.abs(a - position.y) - Math.abs(b - position.y))
    const y = candidates[0]
    return y !== undefined && !blocked(x, y, z) ? { x, y, z } : null
  }
  return tryStep(position.x + dx, position.z + dz)
    || tryStep(position.x + dx, position.z)
    || tryStep(position.x, position.z + dz)
    || position
}

export function placeName(pos: Point, boating: boolean) {
  if (boating) return pos.z < -92 ? 'The open lake' : 'Willow River'
  for (const h of houses) if (Math.abs(pos.y - h.y) < 1 && Math.abs(pos.x - h.x) < 3.25 && Math.abs(pos.z - h.z) < 3.25) return h.name
  if (pos.y > 17 && pos.x < -25) return 'Treetop Walk'
  if (Math.hypot(pos.x - tree.x, pos.z - tree.z) < 10) return 'The winding tree walk'
  if (pos.y > 9.5 && pos.x > -32 && pos.x < 22 && pos.z < -12 && pos.z > -31) return 'Skybridge'
  if (pos.z < -82) return 'Lakeside landing'
  return 'Waterfall Village'
}
