export type Point = { x: number; y: number; z: number }
export type HouseStyle = 'plaster' | 'brick' | 'timber'
export type RoofStyle = '4x4' | '4x6' | '6x4' | '6x6' | 'tower'
export type HouseSpec = {
  id: string
  label: string
  x: number
  z: number
  w: 4 | 6
  d: 4 | 6
  y: number
  rot: number
  stories: 1 | 2
  style: HouseStyle
  roof: RoofStyle
  enterable: boolean
  balcony?: boolean
  props?: 'workshop' | 'inn' | 'garden' | 'tower'
}
export type BridgeSpec = {
  id: string
  label: string
  z: number
  x: number
  halfLength: number
  halfWidth: number
  rise: number
  rails: boolean
}

export const WORLD_X = 48
export const WORLD_Z = 42
export const EYE_HEIGHT = 1.64
export const PLAYER_RADIUS = 0.28

export function riverCenter(z: number) {
  return 3.1 * Math.sin((z + 6) / 10.5) + 0.045 * z
}

export function riverWidth(z: number) {
  const pond = Math.exp(-((z + 24) ** 2) / 45)
  const meadowPool = Math.exp(-((z - 9) ** 2) / 85)
  return 3.25 + pond * 5.3 + meadowPool * 0.9
}

export function rawTerrainHeight(x: number, z: number) {
  const rolling = 0.42 * Math.sin((x + 8) * 0.095) + 0.36 * Math.cos((z - 5) * 0.085) + 0.18 * Math.sin((x + z) * 0.072)
  const dx = x - riverCenter(z)
  const creekValley = -1.42 * Math.exp(-(dx * dx) / 30)
  const edgeX = Math.max(0, Math.abs(x) - 26)
  const edgeZ = Math.max(0, Math.abs(z) - 26)
  const enclosingHills = edgeX * edgeX * 0.019 + edgeZ * edgeZ * 0.015
  const westHill = 2.5 * Math.exp(-(((x + 28) / 15) ** 2 + ((z + 14) / 15) ** 2))
  const eastHill = 1.8 * Math.exp(-(((x - 29) / 16) ** 2 + ((z - 18) / 17) ** 2))
  const southRise = 1.25 * Math.exp(-(((x + 18) / 20) ** 2 + ((z - 30) / 13) ** 2))
  return rolling + creekValley + enclosingHills + westHill + eastHill + southRise
}

const seeds: Omit<HouseSpec, 'y'>[] = [
  { id: 'creek-cottage', label: 'Creek Cottage', x: -11, z: 13, w: 4, d: 4, rot: 0.08, stories: 1, style: 'plaster', roof: '4x4', enterable: true, props: 'garden' },
  { id: 'riverside-workshop', label: 'Riverside Workshop', x: 11.5, z: 10, w: 6, d: 4, rot: -0.12, stories: 2, style: 'brick', roof: '6x4', enterable: false, balcony: true, props: 'workshop' },
  { id: 'bridge-inn', label: 'Bridge Inn', x: -14.5, z: 0.5, w: 6, d: 6, rot: 0.1, stories: 2, style: 'timber', roof: '6x6', enterable: false, balcony: true, props: 'inn' },
  { id: 'watch-tower', label: 'Old Watch Tower', x: 14.5, z: -2.5, w: 4, d: 4, rot: -0.05, stories: 2, style: 'brick', roof: 'tower', enterable: false, props: 'tower' },
  { id: 'hill-house', label: 'Hill House', x: -24, z: -15.5, w: 4, d: 6, rot: 0.12, stories: 1, style: 'plaster', roof: '4x6', enterable: false, props: 'garden' },
  { id: 'weaver-house', label: 'Weaver House', x: 21.5, z: -14, w: 6, d: 4, rot: -0.16, stories: 2, style: 'timber', roof: '6x4', enterable: false, balcony: true },
  { id: 'pond-cottage', label: 'Pond Cottage', x: -9, z: -27, w: 4, d: 4, rot: -0.08, stories: 1, style: 'plaster', roof: '4x4', enterable: false, props: 'garden' },
  { id: 'mill-house', label: 'Mill House', x: 11.5, z: -26, w: 4, d: 6, rot: 0.08, stories: 1, style: 'brick', roof: '4x6', enterable: false, props: 'workshop' },
]

export function localCoords(x: number, z: number, house: HouseSpec) {
  const dx = x - house.x
  const dz = z - house.z
  const c = Math.cos(-house.rot)
  const s = Math.sin(-house.rot)
  return { x: dx * c - dz * s, z: dx * s + dz * c }
}

export const houses: HouseSpec[] = seeds.map(seed => ({ ...seed, y: rawTerrainHeight(seed.x, seed.z) + (seed.id === 'watch-tower' ? 0.12 : 0) }))

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

export function terrainHeight(x: number, z: number) {
  let height = rawTerrainHeight(x, z)
  for (const house of houses) {
    const local = localCoords(x, z, house)
    const dx = Math.max(0, Math.abs(local.x) - house.w / 2)
    const dz = Math.max(0, Math.abs(local.z) - house.d / 2)
    const dist = Math.hypot(dx, dz)
    if (dist < 3.3) {
      const blend = 1 - smoothstep(0.1, 3.3, dist)
      height = height * (1 - blend) + house.y * blend
    }
  }
  return height
}

export function waterHeight(z: number) {
  return rawTerrainHeight(riverCenter(z), z) + 0.34
}

function bridgeAt(z: number, rise: number, rails: boolean, label: string, id: string): BridgeSpec {
  const x = riverCenter(z)
  const bank = riverWidth(z) / 2 + 1.35
  return { id, label, z, x, halfLength: bank, halfWidth: rails ? 1.42 : 1.28, rise, rails }
}

export const bridges: BridgeSpec[] = [
  bridgeAt(2.2, 0.34, true, 'Market Bridge', 'market-bridge'),
  bridgeAt(-19.6, 0.12, false, 'Pond Footbridge', 'pond-footbridge'),
]

export function bridgeFor(x: number, z: number, inset = 0) {
  return bridges.find(bridge => Math.abs(z - bridge.z) <= Math.max(0.25, bridge.halfWidth - inset) && Math.abs(x - bridge.x) <= bridge.halfLength + 0.08)
}

export function bridgeDeckY(bridge: BridgeSpec, x: number) {
  const leftX = bridge.x - bridge.halfLength
  const rightX = bridge.x + bridge.halfLength
  const left = terrainHeight(leftX, bridge.z) + 0.08
  const right = terrainHeight(rightX, bridge.z) + 0.08
  const u = Math.max(0, Math.min(1, (x - leftX) / Math.max(0.001, rightX - leftX)))
  const baseline = left + (right - left) * u
  return baseline + bridge.rise * 4 * u * (1 - u)
}

function insideHouse(x: number, z: number, house: HouseSpec, margin = 0) {
  const local = localCoords(x, z, house)
  return Math.abs(local.x) < house.w / 2 + margin && Math.abs(local.z) < house.d / 2 + margin
}

function hitsEnterableWalls(x: number, z: number, house: HouseSpec, radius: number) {
  const local = localCoords(x, z, house)
  const wall = radius + 0.10
  const halfW = house.w / 2
  const halfD = house.d / 2
  const nearBack = Math.abs(local.z + halfD) < wall && Math.abs(local.x) < halfW + wall
  const nearLeft = Math.abs(local.x + halfW) < wall && Math.abs(local.z) < halfD + wall
  const nearRight = Math.abs(local.x - halfW) < wall && Math.abs(local.z) < halfD + wall
  const nearFront = Math.abs(local.z - halfD) < wall && Math.abs(local.x) < halfW + wall
  const doorCenter = house.w === 4 ? -1 : 0
  // Collision is deliberately more forgiving than the visible doorway so a thumb-controlled
  // player can pass through without pixel-perfect alignment.
  const doorOpening = Math.abs(local.x - doorCenter) < 1.06
  return nearBack || nearLeft || nearRight || (nearFront && !doorOpening)
}

export function canStand(x: number, z: number, radius = PLAYER_RADIUS) {
  if (Math.abs(x) > WORLD_X - 1.2 || Math.abs(z) > WORLD_Z - 1.2) return false
  const bridge = bridgeFor(x, z, radius * 0.08)
  const creekDistance = Math.abs(x - riverCenter(z))
  if (creekDistance < riverWidth(z) / 2 + radius * 0.55 && !bridge) return false
  for (const house of houses) {
    if (house.enterable) {
      if (hitsEnterableWalls(x, z, house, radius)) return false
    } else if (insideHouse(x, z, house, radius + 0.26)) return false
  }
  return true
}

export function floorHeight(x: number, z: number) {
  const bridge = bridgeFor(x, z)
  if (bridge) return bridgeDeckY(bridge, x)
  const cottage = houses.find(house => house.enterable)
  if (cottage && insideHouse(x, z, cottage, -0.04)) return cottage.y + 0.055
  return terrainHeight(x, z)
}

export const spawn: Point = { x: -18, y: 0, z: 21 }
spawn.y = floorHeight(spawn.x, spawn.z)

export function zoneName(x: number, z: number) {
  const cottage = houses.find(house => house.enterable)
  if (cottage && insideHouse(x, z, cottage, -0.04)) return 'Inside Creek Cottage'
  const bridge = bridgeFor(x, z)
  if (bridge) return bridge.label
  for (const house of houses) if (Math.hypot(x - house.x, z - house.z) < 6.7) return house.label
  if (Math.abs(x - riverCenter(z)) < 7.5) return z < -14 ? 'Willow Pond' : z > 8 ? 'South Creek' : 'Market Creek'
  if (z < -12) return 'Upper Meadow'
  if (z > 13) return 'Orchard Lane'
  return 'Village Green'
}

export const pathLines = [
  [
    { x: -20, z: 22 }, { x: -15, z: 17 }, { x: -11, z: 13 }, { x: -12, z: 8 }, { x: -14.5, z: 0.5 }, { x: bridges[0].x - 4.2, z: bridges[0].z },
  ],
  [
    { x: bridges[0].x + 4.2, z: bridges[0].z }, { x: 7, z: 5 }, { x: 11.5, z: 10 }, { x: 18, z: 13 },
  ],
  [
    { x: -14.5, z: 0.5 }, { x: -17, z: -6 }, { x: -21, z: -11 }, { x: -24, z: -15.5 }, { x: -19, z: -20 }, { x: bridges[1].x - 5, z: bridges[1].z },
  ],
  [
    { x: bridges[1].x + 5, z: bridges[1].z }, { x: 5, z: -18 }, { x: 13, z: -16 }, { x: 21.5, z: -14 },
  ],
  [
    { x: bridges[1].x - 4, z: bridges[1].z }, { x: -8, z: -23 }, { x: -9, z: -27 },
  ],
  [
    { x: bridges[1].x + 4, z: bridges[1].z }, { x: 7, z: -23 }, { x: 11.5, z: -26 },
  ],
  [
    { x: 7, z: 5 }, { x: 12, z: 1 }, { x: 14.5, z: -2.5 }, { x: 14, z: -9 }, { x: 13, z: -16 },
  ],
]
