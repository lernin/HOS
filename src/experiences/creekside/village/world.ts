export type Point = { x: number; y: number; z: number }
export type HouseStyle = 'plaster' | 'brick'
export type HouseSpec = {
  id: string
  label: string
  x: number
  z: number
  w: 4
  d: 4
  y: number
  style: HouseStyle
  enterable: boolean
}

export const WORLD_X = 46
export const WORLD_Z = 40
export const EYE_HEIGHT = 1.64
export const PLAYER_RADIUS = 0.34
export const BRIDGE_Z = 1.5

export function riverCenter(z: number) {
  return 2.8 * Math.sin((z + 5) / 10.5) + z * 0.035
}

export function riverWidth(z: number) {
  const pond = Math.exp(-((z + 21) ** 2) / 55)
  return 3.5 + pond * 4.2
}

export function rawTerrainHeight(x: number, z: number) {
  const rolling = 0.52 * Math.sin((x + 8) * 0.11) + 0.42 * Math.cos((z - 4) * 0.095) + 0.22 * Math.sin((x + z) * 0.08)
  const dx = x - riverCenter(z)
  const creekValley = -1.25 * Math.exp(-(dx * dx) / 32)
  const edgeX = Math.max(0, Math.abs(x) - 27)
  const edgeZ = Math.max(0, Math.abs(z) - 26)
  const enclosingHills = edgeX * edgeX * 0.016 + edgeZ * edgeZ * 0.012
  const northwestHill = 2.1 * Math.exp(-(((x + 25) / 14) ** 2 + ((z + 18) / 13) ** 2))
  const southeastHill = 1.55 * Math.exp(-(((x - 28) / 15) ** 2 + ((z - 20) / 16) ** 2))
  return rolling + creekValley + enclosingHills + northwestHill + southeastHill
}

const houseSeeds: Omit<HouseSpec, 'y'>[] = [
  { id: 'creek-cottage', label: 'Creek Cottage', x: -10, z: 10, w: 4, d: 4, style: 'plaster', enterable: true },
  { id: 'workshop', label: 'Riverside Workshop', x: 12, z: 7, w: 4, d: 4, style: 'plaster', enterable: false },
  { id: 'hill-house', label: 'Hill House', x: -19, z: -10, w: 4, d: 4, style: 'plaster', enterable: false },
]

export const houses: HouseSpec[] = houseSeeds.map(house => ({ ...house, y: rawTerrainHeight(house.x, house.z) }))

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

export function terrainHeight(x: number, z: number) {
  let height = rawTerrainHeight(x, z)
  for (const house of houses) {
    const dx = Math.max(0, Math.abs(x - house.x) - house.w / 2)
    const dz = Math.max(0, Math.abs(z - house.z) - house.d / 2)
    const dist = Math.hypot(dx, dz)
    if (dist < 2.8) {
      const blend = 1 - smoothstep(0.2, 2.8, dist)
      height = height * (1 - blend) + house.y * blend
    }
  }
  return height
}

export function waterHeight(z: number) {
  return rawTerrainHeight(riverCenter(z), z) + 0.36
}

export const BRIDGE_X = riverCenter(BRIDGE_Z)
const bank = riverWidth(BRIDGE_Z) / 2 + 1.35
export const BRIDGE_HALF_LENGTH = bank
export const BRIDGE_HALF_WIDTH = 1.15
export const BRIDGE_BASE_Y = Math.max(
  terrainHeight(BRIDGE_X - bank, BRIDGE_Z),
  terrainHeight(BRIDGE_X + bank, BRIDGE_Z),
) + 0.16

export function onBridge(x: number, z: number) {
  return Math.abs(z - BRIDGE_Z) <= BRIDGE_HALF_WIDTH && Math.abs(x - BRIDGE_X) <= BRIDGE_HALF_LENGTH
}

export function bridgeDeckY(x: number) {
  const t = Math.max(-1, Math.min(1, (x - BRIDGE_X) / BRIDGE_HALF_LENGTH))
  return BRIDGE_BASE_Y + 0.58 * (1 - t * t)
}

function insideHouse(x: number, z: number, house: HouseSpec, margin = 0) {
  return Math.abs(x - house.x) < house.w / 2 + margin && Math.abs(z - house.z) < house.d / 2 + margin
}

function hitsEnterableWalls(x: number, z: number, house: HouseSpec) {
  const lx = x - house.x
  const lz = z - house.z
  const wall = PLAYER_RADIUS + 0.18
  const halfW = house.w / 2
  const halfD = house.d / 2
  const nearBack = Math.abs(lz + halfD) < wall && Math.abs(lx) < halfW + wall
  const nearLeft = Math.abs(lx + halfW) < wall && Math.abs(lz) < halfD + wall
  const nearRight = Math.abs(lx - halfW) < wall && Math.abs(lz) < halfD + wall
  const nearFront = Math.abs(lz - halfD) < wall && Math.abs(lx) < halfW + wall
  const doorOpening = lx > -1.62 && lx < -0.38
  return nearBack || nearLeft || nearRight || (nearFront && !doorOpening)
}

export function canStand(x: number, z: number) {
  if (Math.abs(x) > WORLD_X - 1.1 || Math.abs(z) > WORLD_Z - 1.1) return false
  const creekDistance = Math.abs(x - riverCenter(z))
  if (creekDistance < riverWidth(z) / 2 + PLAYER_RADIUS * 0.45 && !onBridge(x, z)) return false
  for (const house of houses) {
    if (house.enterable) {
      if (hitsEnterableWalls(x, z, house)) return false
    } else if (insideHouse(x, z, house, PLAYER_RADIUS + 0.35)) {
      return false
    }
  }
  return true
}

export function floorHeight(x: number, z: number) {
  if (onBridge(x, z)) return bridgeDeckY(x)
  const cottage = houses.find(h => h.enterable)
  if (cottage && insideHouse(x, z, cottage, -0.05)) return cottage.y + 0.055
  return terrainHeight(x, z)
}

export const spawn: Point = { x: -15.5, y: 0, z: 18.2 }
spawn.y = floorHeight(spawn.x, spawn.z)

export function zoneName(x: number, z: number) {
  const cottage = houses[0]
  if (cottage.enterable && insideHouse(x, z, cottage, -0.05)) return 'Inside Creek Cottage'
  if (onBridge(x, z)) return 'Little Creek Bridge'
  for (const house of houses) {
    if (Math.hypot(x - house.x, z - house.z) < 6) return house.label
  }
  if (Math.abs(x - riverCenter(z)) < 7) return z < -12 ? 'Willow Pond' : 'Creek Path'
  if (z < -10) return 'Upper Meadow'
  return 'Village Meadow'
}

export const pathLines = [
  [
    { x: -16, z: 19 }, { x: -11, z: 13 }, { x: -7, z: 7 }, { x: BRIDGE_X - 3.2, z: BRIDGE_Z },
  ],
  [
    { x: BRIDGE_X + 3.2, z: BRIDGE_Z }, { x: 7, z: 4 }, { x: 12, z: 7 }, { x: 18, z: 10 },
  ],
  [
    { x: -7, z: 7 }, { x: -11, z: 1 }, { x: -15, z: -5 }, { x: -19, z: -10 }, { x: -20, z: -17 },
  ],
]
