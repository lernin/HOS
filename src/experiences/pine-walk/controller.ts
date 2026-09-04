export type Vec2 = { x: number; z: number }
export type Navigation = {
  version: 1
  minX: number; minZ: number; step: number; columns: number; rows: number
  heights: (number | null)[]
  obstacles: { x: number; z: number; radius: number }[]
  spawn: { x: number; z: number; yaw: number }
}
export type WalkInput = { x: number; z: number; yaw: number; pitch: number; sensitivity: number; paused: boolean }
export const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n))
export function joystick(dx: number, dy: number, radius = 48): Vec2 {
  const length = Math.hypot(dx, dy)
  if (length < radius * .12) return { x: 0, z: 0 }
  const amount = Math.min(1, (length / radius - .12) / .88)
  return { x: dx / length * amount, z: dy / length * amount }
}
export function look(input: WalkInput, dx: number, dy: number) {
  if (input.paused) return
  input.yaw -= dx * .003 * input.sensitivity
  input.pitch = clamp(input.pitch - dy * .003 * input.sensitivity, -1.25, 1.25)
}
export function relativeMotion(x: number, z: number, yaw: number): Vec2 {
  const divisor = Math.max(1, Math.hypot(x, z))
  return { x: (x * Math.cos(yaw) + z * Math.sin(yaw)) / divisor, z: (z * Math.cos(yaw) - x * Math.sin(yaw)) / divisor }
}
export function groundAt(nav: Navigation, x: number, z: number): number | null {
  const u = (x - nav.minX) / nav.step, v = (z - nav.minZ) / nav.step
  const ix = Math.floor(u), iz = Math.floor(v)
  if (!Number.isFinite(u + v) || ix < 0 || iz < 0 || ix >= nav.columns - 1 || iz >= nav.rows - 1) return null
  const h = [nav.heights[iz * nav.columns + ix], nav.heights[iz * nav.columns + ix + 1], nav.heights[(iz + 1) * nav.columns + ix], nav.heights[(iz + 1) * nav.columns + ix + 1]]
  if (h.some(y => y === null || !Number.isFinite(y))) return null
  const [a, b, c, d] = h as number[], fx = u - ix, fz = v - iz
  return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz
}
export function canStand(nav: Navigation, x: number, z: number, previousHeight: number): boolean {
  const radius = .3
  const heights = [[0, 0], [radius, 0], [-radius, 0], [0, radius], [0, -radius]].map(([dx, dz]) => groundAt(nav, x + dx, z + dz))
  if (heights.some(h => h === null || Math.abs(h - previousHeight) > .42)) return false
  return !nav.obstacles.some(o => Math.hypot(x - o.x, z - o.z) < radius + o.radius)
}
export function walk(nav: Navigation, position: Vec2, direction: Vec2, dt: number): Vec2 {
  // Substeps prevent tunnelling after a slow frame; each axis can slide along a trunk.
  const distance = Math.min(Math.max(dt, 0), .1) * 2.6, steps = Math.max(1, Math.ceil(distance / .08))
  let { x, z } = position
  for (let i = 0; i < steps; i++) {
    const h = groundAt(nav, x, z)
    if (h === null) return position
    const dx = direction.x * distance / steps, dz = direction.z * distance / steps
    if (canStand(nav, x + dx, z, h)) x += dx
    if (canStand(nav, x, z + dz, groundAt(nav, x, z) ?? h)) z += dz
  }
  return { x, z }
}
