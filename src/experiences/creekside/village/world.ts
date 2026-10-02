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
  scale: number
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

// Rebuild 04 deliberately moves from a tiny demo plot to a Woodland-Walk-sized
// valley. The surface is ~11x the area of Rebuild 03, while keeping a bounded
// mobile-friendly scene and a single connected walking space.
export const WORLD_X = 160
export const WORLD_Z = 140
export const EYE_HEIGHT = 1.68
export const PLAYER_RADIUS = 0.32

export function riverCenter(z: number) {
  return 10.5 * Math.sin((z + 18) / 36) + 3.5 * Math.sin((z - 7) / 17) + 0.026 * z
}

export function riverWidth(z: number) {
  const northPool = Math.exp(-((z - 73) ** 2) / 430)
  const millPool = Math.exp(-((z + 72) ** 2) / 360)
  const marketBend = Math.exp(-((z - 8) ** 2) / 700)
  return 6.6 + northPool * 3.4 + millPool * 4.1 + marketBend * 1.2
}

export function rawTerrainHeight(x: number, z: number) {
  const broad = 1.35 * Math.sin((x + 25) * 0.018) * Math.cos((z - 8) * 0.021)
  const rolling = 0.72 * Math.sin((x + z) * 0.031) + 0.55 * Math.cos((z - x * 0.35) * 0.027)
  const dx = x - riverCenter(z)
  const creekValley = -2.35 * Math.exp(-(dx * dx) / 165)
  const westRise = 3.4 * Math.exp(-(((x + 118) / 54) ** 2 + ((z + 18) / 68) ** 2))
  const eastRise = 3.0 * Math.exp(-(((x - 120) / 56) ** 2 + ((z - 6) / 72) ** 2))
  const northRidge = 2.2 * Math.exp(-(((x + 8) / 105) ** 2 + ((z - 121) / 28) ** 2))
  const southRidge = 2.6 * Math.exp(-(((x - 18) / 98) ** 2 + ((z + 122) / 30) ** 2))
  return broad + rolling + creekValley + westRise + eastRise + northRidge + southRidge
}

const seeds: Omit<HouseSpec, 'y'>[] = [
  { id: 'creek-cottage', label: 'Creek Cottage', x: -62, z: 82, w: 4, d: 4, rot: 0.12, stories: 1, style: 'plaster', roof: '4x4', scale: 1.85, enterable: true, props: 'garden' },
  { id: 'orchard-house', label: 'Orchard House', x: -111, z: 98, w: 6, d: 4, rot: -0.18, stories: 1, style: 'plaster', roof: '6x4', scale: 1.72, enterable: false, props: 'garden' },
  { id: 'south-inn', label: 'South Inn', x: -96, z: 63, w: 6, d: 6, rot: 0.17, stories: 2, style: 'timber', roof: '6x6', scale: 1.66, enterable: true, balcony: true, props: 'inn' },
  { id: 'cooper-house', label: 'Cooper House', x: -46, z: 55, w: 6, d: 4, rot: -0.1, stories: 2, style: 'brick', roof: '6x4', scale: 1.7, enterable: false, balcony: true, props: 'workshop' },
  { id: 'east-farmhouse', label: 'East Farmhouse', x: 70, z: 83, w: 6, d: 4, rot: 0.2, stories: 1, style: 'plaster', roof: '6x4', scale: 1.78, enterable: false, props: 'garden' },
  { id: 'riverside-workshop', label: 'Riverside Workshop', x: 49, z: 49, w: 6, d: 4, rot: -0.14, stories: 2, style: 'brick', roof: '6x4', scale: 1.72, enterable: false, balcony: true, props: 'workshop' },

  { id: 'market-hall', label: 'Market Hall', x: -58, z: 20, w: 6, d: 6, rot: 0.08, stories: 2, style: 'timber', roof: '6x6', scale: 1.72, enterable: true, balcony: true, props: 'inn' },
  { id: 'bell-tower', label: 'Bell Tower', x: -94, z: 2, w: 4, d: 4, rot: -0.05, stories: 2, style: 'brick', roof: 'tower', scale: 1.68, enterable: false, props: 'tower' },
  { id: 'baker-house', label: 'Baker House', x: -28, z: 10, w: 4, d: 6, rot: 0.15, stories: 1, style: 'plaster', roof: '4x6', scale: 1.82, enterable: false, props: 'garden' },
  { id: 'bridge-inn', label: 'Bridge Inn', x: 55, z: 16, w: 6, d: 6, rot: -0.11, stories: 2, style: 'timber', roof: '6x6', scale: 1.7, enterable: true, balcony: true, props: 'inn' },
  { id: 'weaver-house', label: 'Weaver House', x: 95, z: 34, w: 6, d: 4, rot: 0.16, stories: 2, style: 'timber', roof: '6x4', scale: 1.68, enterable: false, balcony: true },
  { id: 'east-cottage', label: 'East Cottage', x: 111, z: -17, w: 4, d: 6, rot: -0.22, stories: 1, style: 'plaster', roof: '4x6', scale: 1.8, enterable: false, props: 'garden' },

  { id: 'woodland-lodge', label: 'Woodland Lodge', x: -113, z: -44, w: 6, d: 6, rot: 0.12, stories: 1, style: 'timber', roof: '6x6', scale: 1.76, enterable: false, props: 'inn' },
  { id: 'hill-house', label: 'Hill House', x: -76, z: -74, w: 4, d: 6, rot: -0.2, stories: 1, style: 'plaster', roof: '4x6', scale: 1.84, enterable: false, props: 'garden' },
  { id: 'forest-inn', label: 'Forest Inn', x: -35, z: -86, w: 6, d: 6, rot: 0.1, stories: 2, style: 'timber', roof: '6x6', scale: 1.72, enterable: true, balcony: true, props: 'inn' },
  { id: 'mill-house', label: 'Old Mill House', x: 40, z: -78, w: 6, d: 6, rot: -0.12, stories: 2, style: 'brick', roof: '6x6', scale: 1.78, enterable: true, balcony: true, props: 'workshop' },
  { id: 'pond-cottage', label: 'Pond Cottage', x: 79, z: -101, w: 4, d: 4, rot: 0.16, stories: 1, style: 'plaster', roof: '4x4', scale: 1.88, enterable: false, props: 'garden' },
  { id: 'old-tower', label: 'Old Watch Tower', x: 116, z: -59, w: 4, d: 4, rot: -0.09, stories: 2, style: 'brick', roof: 'tower', scale: 1.68, enterable: false, props: 'tower' },
]

export function localCoords(x: number, z: number, house: HouseSpec) {
  const dx = x - house.x
  const dz = z - house.z
  const c = Math.cos(-house.rot)
  const s = Math.sin(-house.rot)
  return {
    x: (dx * c - dz * s) / house.scale,
    z: (dx * s + dz * c) / house.scale,
  }
}

export const houses: HouseSpec[] = seeds.map(seed => ({ ...seed, y: rawTerrainHeight(seed.x, seed.z) }))

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
    const distance = Math.hypot(dx, dz) * house.scale
    if (distance < 8.5) {
      const blend = 1 - smoothstep(0.15, 8.5, distance)
      height = height * (1 - blend) + house.y * blend
    }
  }
  return height
}

export function waterHeight(z: number) {
  return rawTerrainHeight(riverCenter(z), z) + 0.58
}

function bridgeAt(z: number, rise: number, rails: boolean, label: string, id: string): BridgeSpec {
  const x = riverCenter(z)
  const bank = riverWidth(z) / 2 + 2.0
  return { id, label, z, x, halfLength: bank, halfWidth: rails ? 2.05 : 1.8, rise, rails }
}

export const bridges: BridgeSpec[] = [
  bridgeAt(72, 0.48, true, 'Orchard Bridge', 'orchard-bridge'),
  bridgeAt(12, 0.4, true, 'Market Bridge', 'market-bridge'),
  bridgeAt(-63, 0.28, false, 'Mill Footbridge', 'mill-footbridge'),
]

export function bridgeFor(x: number, z: number, inset = 0) {
  return bridges.find(bridge => Math.abs(z - bridge.z) <= Math.max(0.4, bridge.halfWidth - inset) && Math.abs(x - bridge.x) <= bridge.halfLength + 0.12)
}

export function bridgeDeckY(bridge: BridgeSpec, x: number) {
  const leftX = bridge.x - bridge.halfLength
  const rightX = bridge.x + bridge.halfLength
  const left = terrainHeight(leftX, bridge.z) + 0.12
  const right = terrainHeight(rightX, bridge.z) + 0.12
  const u = Math.max(0, Math.min(1, (x - leftX) / Math.max(0.001, rightX - leftX)))
  return left + (right - left) * u + bridge.rise * 4 * u * (1 - u)
}

export function insideHouse(x: number, z: number, house: HouseSpec, marginWorld = 0) {
  const local = localCoords(x, z, house)
  const margin = marginWorld / house.scale
  return Math.abs(local.x) < house.w / 2 + margin && Math.abs(local.z) < house.d / 2 + margin
}

export function doorLocalX(house: HouseSpec) {
  return house.w === 4 ? -1 : 0
}

function hitsEnterableWalls(x: number, z: number, house: HouseSpec, radius: number, doorOpen: boolean) {
  const local = localCoords(x, z, house)
  const r = radius / house.scale
  const wall = r + 0.09
  const halfW = house.w / 2
  const halfD = house.d / 2
  const nearBack = Math.abs(local.z + halfD) < wall && Math.abs(local.x) < halfW + wall
  const nearLeft = Math.abs(local.x + halfW) < wall && Math.abs(local.z) < halfD + wall
  const nearRight = Math.abs(local.x - halfW) < wall && Math.abs(local.z) < halfD + wall
  const nearFront = Math.abs(local.z - halfD) < wall && Math.abs(local.x) < halfW + wall
  const doorOpening = Math.abs(local.x - doorLocalX(house)) < 0.72 + r
  return nearBack || nearLeft || nearRight || (nearFront && (!doorOpen || !doorOpening))
}

export function canStand(x: number, z: number, radius = PLAYER_RADIUS, openDoors: ReadonlySet<string> = new Set()) {
  if (Math.abs(x) > WORLD_X - 2 || Math.abs(z) > WORLD_Z - 2) return false
  const bridge = bridgeFor(x, z, radius * 0.08)
  const creekDistance = Math.abs(x - riverCenter(z))
  if (creekDistance < riverWidth(z) / 2 + radius * 0.65 && !bridge) return false
  for (const house of houses) {
    if (house.enterable) {
      if (hitsEnterableWalls(x, z, house, radius, openDoors.has(house.id))) return false
    } else if (insideHouse(x, z, house, radius + 0.42)) return false
  }
  return true
}

export function floorHeight(x: number, z: number) {
  const bridge = bridgeFor(x, z)
  if (bridge) return bridgeDeckY(bridge, x)
  for (const house of houses) if (house.enterable && insideHouse(x, z, house, -0.08)) return house.y + 0.08
  return terrainHeight(x, z)
}

export const spawn: Point = { x: -126, y: 0, z: 110 }
spawn.y = floorHeight(spawn.x, spawn.z)

export function zoneName(x: number, z: number) {
  for (const house of houses) if (house.enterable && insideHouse(x, z, house, -0.08)) return `Inside ${house.label}`
  const bridge = bridgeFor(x, z)
  if (bridge) return bridge.label
  let nearest: HouseSpec | null = null
  let distance = Infinity
  for (const house of houses) {
    const d = Math.hypot(x - house.x, z - house.z)
    if (d < distance) { distance = d; nearest = house }
  }
  if (nearest && distance < 14) return nearest.label
  if (z > 58) return x < -18 ? 'Orchard Country' : 'North Meadow'
  if (z > -18) return x < -35 ? 'Market Fields' : x > 42 ? 'East Hamlet' : 'Long Village Green'
  if (z > -72) return x < -45 ? 'Woodland Road' : x > 54 ? 'Watch Hill' : 'River Woods'
  return x < 0 ? 'South Forest' : 'Mill Country'
}

// Long looping roads and cross-country branches borrow Woodland Walk's spatial
// rhythm: destinations are separated by real walking distance, with multiple
// ways to cross the valley instead of one tiny central loop.
export const pathLines = [
  [
    { x: -134, z: 112 }, { x: -111, z: 98 }, { x: -83, z: 90 }, { x: -62, z: 82 },
    { x: bridges[0].x - 8, z: bridges[0].z }, { x: bridges[0].x + 8, z: bridges[0].z },
    { x: 45, z: 78 }, { x: 70, z: 83 }, { x: 112, z: 101 }, { x: 137, z: 82 },
  ],
  [
    { x: -111, z: 98 }, { x: -96, z: 63 }, { x: -70, z: 42 }, { x: -58, z: 20 },
    { x: bridges[1].x - 8, z: bridges[1].z }, { x: bridges[1].x + 8, z: bridges[1].z },
    { x: 55, z: 16 }, { x: 95, z: 34 }, { x: 126, z: 24 }, { x: 141, z: -4 },
  ],
  [
    { x: -96, z: 63 }, { x: -46, z: 55 }, { x: -28, z: 10 }, { x: -18, z: -28 },
    { x: -35, z: -86 }, { x: -76, z: -74 }, { x: -113, z: -44 }, { x: -136, z: -10 },
  ],
  [
    { x: 49, z: 49 }, { x: 55, z: 16 }, { x: 69, z: -14 }, { x: bridges[2].x + 8, z: bridges[2].z },
    { x: 40, z: -78 }, { x: 79, z: -101 }, { x: 116, z: -59 }, { x: 132, z: -31 }, { x: 111, z: -17 },
  ],
  [
    { x: -35, z: -86 }, { x: -10, z: -69 }, { x: bridges[2].x - 8, z: bridges[2].z },
    { x: bridges[2].x + 8, z: bridges[2].z }, { x: 40, z: -78 },
  ],
  [
    { x: -58, z: 20 }, { x: -20, z: 38 }, { x: 12, z: 43 }, { x: 49, z: 49 },
  ],
]
