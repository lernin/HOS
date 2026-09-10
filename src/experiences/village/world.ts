// Shared world geometry and navigation. All distances are metres.
export type Point = { x: number; y: number; z: number }
export type Path = { points: Point[]; width: number; wood?: boolean; rails?: boolean }
export const spawn = { x: -23, y: 4, z: 42, yaw: -.12 }
export const tree = { x: -32, y: 9, z: -12 }
export const docks = [{ x: -7, y: 1.5, z: 42 }, { x: 17, y: 1.5, z: -101 }]
export const houses = [
  { x: -27, y: 4, z: 24, name: 'Willow Cottage', roof: '#425a70' },
  { x: -39, y: 19, z: -14, name: 'The Treetop Library', roof: '#466675' },
  { x: 26, y: 8, z: -34, name: 'Fern Cottage', roof: '#a36046' },
]
export const terraces = [
  { x: -26, z: 31, y: 4, radius: 17 },
  { x: -32, z: -12, y: 9, radius: 18 },
  { x: 28, z: -34, y: 8, radius: 17 },
  { x: 26, z: -94, y: 1.5, radius: 10 },
]
const p = (x: number, y: number, z: number): Point => ({ x, y, z })
export const stairPoints = Array.from({ length: 193 }, (_, i) => {
  const t = i / 192, a = Math.PI / 2 + t * Math.PI * 4
  return p(tree.x + Math.cos(a) * 7.4, 9 + t * 10, tree.z + Math.sin(a) * 7.4)
})
export const paths: Path[] = [
  { points: [p(-23, 4, 42), p(-19, 4, 35), p(-10, 4, 40), p(-7, 1.5, 42)], width: 3.4, wood: true, rails: true },
  { points: [p(-27, 4, 30), p(-34, 4, 22), p(-42, 6.5, 11), p(-41, 9, -3), p(-32, 9, -4.6)], width: 3.6, rails: true },
  { points: stairPoints, width: 2.6, wood: true, rails: true },
  { points: [p(-32, 19, -4.6), p(-39, 19, -4.6), p(-39, 19, -9)], width: 3, wood: true, rails: true },
  { points: [p(-19, 9, -19), p(-10, 10, -24), p(2, 11, -28), p(14, 9, -31), p(27, 8, -29)], width: 3.6, wood: true, rails: true },
  { points: [p(30, 8, -43), p(34, 8, -50), p(38, 6, -57), p(35, 3, -73), p(26, 1.5, -92), p(17, 1.5, -101)], width: 3.4, rails: true },
]
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
    if (hit.distance < path.width / 2 - .22) pathHits.push(hit)
  }
  pathHits.sort((a, b) => a.distance - b.distance)
  heights.push(...pathHits.map(hit => hit.y))
  for (const t of terraces) if (Math.hypot(x - t.x, z - t.z) < t.radius - .45) heights.push(t.y)
  if (x > -44 && x < -34 && z > -18.5 && z < -7) heights.push(19)
  for (const d of docks) if (Math.abs(x - d.x) < 3 && Math.abs(z - d.z) < 4.5) heights.push(d.y)
  return heights
}
export function blocked(x: number, y: number, z: number) {
  if (y < 24 && Math.hypot(x - tree.x, z - tree.z) < 2.2) return true
  for (const h of houses) {
    if (Math.abs(y - h.y) > 1) continue
    const dx = x - h.x, dz = z - h.z, edge = .45
    // Houses are 7 x 7 with a 2m open doorway on the south side.
    if (Math.abs(dx) < 3.5 + edge && Math.abs(dz) < 3.5 + edge) {
      if (Math.abs(dx) > 3.5 - edge || dz < -3.5 + edge) return true
      if (dz > 3.5 - edge && Math.abs(dx) > .78) return true
      // Furnishings: bed at left, reading desk at back, bookshelf right.
      if (dx > -2.9 && dx < -1.15 && dz > -1.8 && dz < 1.25) return true
      if (dx > 1.95 && dz < 1.25) return true
      if (Math.abs(dx) < 1.4 && dz < -1.9) return true
    }
  }
  return false
}
export function walkStep(position: Point, dx: number, dz: number): Point {
  const tryStep = (x: number, z: number) => {
    const candidates = floorCandidates(x, z).filter(y => Math.abs(y - position.y) < .55)
    const y = candidates[0]
    return y !== undefined && !blocked(x, y, z) ? { x, y, z } : null
  }
  return tryStep(position.x + dx, position.z + dz) || tryStep(position.x + dx, position.z) || tryStep(position.x, position.z + dz) || position
}
export function placeName(pos: Point, boating: boolean) {
  if (boating) return pos.z < -92 ? 'The open lake' : 'Willow River'
  for (const h of houses) if (Math.abs(pos.y - h.y) < 1 && Math.abs(pos.x - h.x) < 3.4 && Math.abs(pos.z - h.z) < 3.4) return h.name
  if (pos.y > 17) return 'Above the canopy'
  if (Math.hypot(pos.x - tree.x, pos.z - tree.z) < 10) return 'The winding stair'
  if (pos.x > -13 && pos.x < 17 && pos.z < -20 && pos.z > -35) return 'Skybridge'
  if (pos.z < -80) return 'Lakeside landing'
  return 'Waterfall Village'
}
