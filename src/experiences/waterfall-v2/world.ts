export type ConceptId = 'cascade' | 'terraces' | 'gorge'
export type Point = { x: number; y: number; z: number }
export type FlatPoint = { x: number; z: number }
export type Pad = { id: number; x: number; y: number; z: number; radius: number; role: string }
export type BridgeSpec = { name: string; z: number; centerX: number; halfLength: number; width: number; baseY: number; archHeight: number; primary: boolean }
export type Concept = { id: ConceptId; name: string; shortName: string; description: string; accent: string }

export const WORLD_HALF = 72
export const concepts: Concept[] = [
  { id: 'cascade', name: 'Cascading Valley', shortName: 'A', description: 'A soft river valley with long views, a high northern shelf, and a grand central crossing.', accent: '#d4aa6b' },
  { id: 'terraces', name: 'River Terraces', shortName: 'B', description: 'A stepped village landscape with broad benches, a winding river, and stronger level changes.', accent: '#b99163' },
  { id: 'gorge', name: 'Horseshoe Gorge', shortName: 'C', description: 'A more dramatic bowl of ridges and overlooks wrapped around a narrow river corridor.', accent: '#c48a62' },
]

export function conceptById(id: ConceptId) { return concepts.find(c => c.id === id) ?? concepts[0] }
export function smooth(a: number, b: number, x: number) { const t = Math.max(0, Math.min(1, (x - a) / (b - a || 1))); return t * t * (3 - 2 * t) }
const gauss = (x: number, z: number, cx: number, cz: number, sx: number, sz: number) => Math.exp(-(((x-cx)/sx)**2 + ((z-cz)/sz)**2))

export function riverCenter(id: ConceptId, z: number) {
  if (id === 'terraces') return 6 + Math.sin((z + 18) * .052) * 11 + Math.sin(z * .115) * 2
  if (id === 'gorge') return -7 + Math.sin((z - 6) * .043) * 13 + Math.sin((z + 22) * .09) * 2.5
  return -3 + Math.sin((z + 8) * .057) * 9 + Math.sin(z * .125) * 2.2
}

export function riverWidth(id: ConceptId, z: number) {
  const base = id === 'gorge' ? 6.2 : id === 'terraces' ? 7.6 : 7.1
  return base + 1.2 * Math.sin(z * .045 + (id === 'terraces' ? .8 : .1)) ** 2 + 2.3 * Math.exp(-((z - 55) / 16) ** 2)
}

export function waterHeight(id: ConceptId, z: number) {
  const offset = id === 'gorge' ? .35 : id === 'terraces' ? -.2 : 0
  return 6.25 - z * .055 + offset
}

function rawTerrainHeight(id: ConceptId, x: number, z: number) {
  const riverX = riverCenter(id, z), d = Math.abs(x - riverX), width = riverWidth(id, z)
  const valley = Math.exp(-((d / (width * 1.05)) ** 2))
  let y = 10.6 - z * .055

  if (id === 'cascade') {
    y += 4.9 * gauss(x,z,-34,-30,22,26) + 3.7 * gauss(x,z,37,-16,25,34)
    y += 2.4 * gauss(x,z,-42,35,20,25) + 1.5 * Math.sin(x*.055) * Math.cos(z*.04)
  } else if (id === 'terraces') {
    y += 3.8 * gauss(x,z,-39,-24,24,30) + 4.4 * gauss(x,z,39,8,25,38)
    y += 1.4 * Math.sin((x+z)*.045) + .8 * Math.sin(z*.095)
    const shelf = Math.floor((y - 5.5) / 2.35) * 2.35 + 5.5
    y += (shelf - y) * .34
  } else {
    y += 6.8 * gauss(Math.abs(x),z,45,-8,20,46) + 5.2 * gauss(x,z,-36,-42,28,22)
    y += 3.5 * gauss(x,z,31,38,24,26) + 1.25 * Math.sin(x*.06-z*.025)
  }

  y -= (4.15 + width * .08) * valley
  y -= 1.05 * Math.exp(-(((d - width * 1.35) / (width * .85)) ** 2))
  return Math.max(waterHeight(id,z) - .72, y)
}

const padSeeds: Record<ConceptId, Array<Omit<Pad,'y'>>> = {
  cascade: [
    {id:1,x:-44,z:48,radius:5.2,role:'riverside'}, {id:2,x:-31,z:37,radius:5.0,role:'garden'}, {id:3,x:-43,z:20,radius:5.1,role:'lower terrace'},
    {id:4,x:-35,z:2,radius:5.4,role:'bridge square'}, {id:5,x:-49,z:-18,radius:5.0,role:'west rise'}, {id:6,x:-36,z:-37,radius:5.2,role:'upper west'},
    {id:7,x:-17,z:-51,radius:5.0,role:'ridge'}, {id:8,x:19,z:-47,radius:5.3,role:'upper east'}, {id:9,x:38,z:-34,radius:5.2,role:'overlook'},
    {id:10,x:45,z:-13,radius:5.0,role:'east terrace'}, {id:11,x:36,z:7,radius:5.4,role:'bridge square'}, {id:12,x:45,z:27,radius:5.0,role:'orchard'},
    {id:13,x:35,z:45,radius:5.1,role:'lower east'}, {id:14,x:18,z:57,radius:5.0,role:'waterfront'}, {id:15,x:-15,z:59,radius:5.2,role:'waterfront'},
  ],
  terraces: [
    {id:1,x:-45,z:51,radius:5.3,role:'lower quay'}, {id:2,x:-31,z:42,radius:5.0,role:'south bench'}, {id:3,x:-47,z:25,radius:5.4,role:'west terrace'},
    {id:4,x:-35,z:7,radius:5.1,role:'bridge approach'}, {id:5,x:-48,z:-12,radius:5.2,role:'middle bench'}, {id:6,x:-38,z:-31,radius:5.4,role:'upper bench'},
    {id:7,x:-19,z:-48,radius:5.0,role:'high garden'}, {id:8,x:17,z:-50,radius:5.1,role:'high garden'}, {id:9,x:36,z:-39,radius:5.2,role:'east upper'},
    {id:10,x:48,z:-20,radius:5.0,role:'east terrace'}, {id:11,x:40,z:-2,radius:5.2,role:'bridge approach'}, {id:12,x:48,z:18,radius:5.0,role:'middle bench'},
    {id:13,x:39,z:37,radius:5.3,role:'south bench'}, {id:14,x:24,z:54,radius:5.0,role:'lower quay'}, {id:15,x:-10,z:59,radius:5.2,role:'river mouth'},
  ],
  gorge: [
    {id:1,x:-48,z:49,radius:5.0,role:'lower bowl'}, {id:2,x:-34,z:39,radius:5.2,role:'west shelf'}, {id:3,x:-50,z:20,radius:5.0,role:'west cliff'},
    {id:4,x:-38,z:1,radius:5.3,role:'bridge approach'}, {id:5,x:-51,z:-18,radius:5.0,role:'gorge shelf'}, {id:6,x:-42,z:-36,radius:5.2,role:'high west'},
    {id:7,x:-22,z:-51,radius:5.0,role:'headwater'}, {id:8,x:14,z:-52,radius:5.0,role:'headwater'}, {id:9,x:35,z:-42,radius:5.2,role:'high east'},
    {id:10,x:49,z:-24,radius:5.0,role:'east cliff'}, {id:11,x:40,z:-4,radius:5.3,role:'bridge approach'}, {id:12,x:51,z:16,radius:5.0,role:'east shelf'},
    {id:13,x:42,z:35,radius:5.2,role:'lower bowl'}, {id:14,x:25,z:53,radius:5.0,role:'river mouth'}, {id:15,x:-12,z:58,radius:5.2,role:'river mouth'},
  ],
}

export function getPads(id: ConceptId): Pad[] {
  return padSeeds[id].map(p => ({ ...p, y: rawTerrainHeight(id,p.x,p.z) }))
}

export function terrainHeight(id: ConceptId, x: number, z: number) {
  let y = rawTerrainHeight(id,x,z)
  for (const pad of getPads(id)) {
    const d = Math.hypot(x-pad.x,z-pad.z), influence = 1 - smooth(pad.radius*.72,pad.radius+3,d)
    y += (pad.y-y) * influence * .94
  }
  return y
}

const primaryZ: Record<ConceptId,number> = { cascade: 1, terraces: -5, gorge: 3 }
const secondaryZ: Record<ConceptId,number> = { cascade: 48, terraces: 50, gorge: 47 }

function makeBridge(id: ConceptId, z: number, primary: boolean): BridgeSpec {
  const centerX = riverCenter(id,z), width = primary ? 4.4 : 2.8, halfLength = primary ? 13 : 10
  const left = rawTerrainHeight(id,centerX-halfLength,z), right = rawTerrainHeight(id,centerX+halfLength,z)
  return { name: primary ? 'Grand Arch' : 'Lower Crossing', z, centerX, halfLength, width, baseY: Math.max(left,right)+.28, archHeight: primary ? 3.25 : .8, primary }
}

export function getBridges(id: ConceptId) { return [makeBridge(id,primaryZ[id],true), makeBridge(id,secondaryZ[id],false)] }
export function bridgeHeight(bridge: BridgeSpec, x: number) { const t = Math.max(-1,Math.min(1,(x-bridge.centerX)/bridge.halfLength)); return bridge.baseY + bridge.archHeight * (1-t*t) }
export function bridgeAt(id: ConceptId, x: number, z: number) { return getBridges(id).find(b => Math.abs(z-b.z) <= b.width*.52 && Math.abs(x-b.centerX) <= b.halfLength+.35) }
export function isRiver(id: ConceptId, x: number, z: number, margin=0) { return Math.abs(x-riverCenter(id,z)) < riverWidth(id,z)*.5 + margin }
export function floorHeight(id: ConceptId, x: number, z: number) { const b=bridgeAt(id,x,z); return b ? bridgeHeight(b,x) : terrainHeight(id,x,z) }
export function canStand(id: ConceptId, x: number, z: number) { return Math.abs(x) < WORLD_HALF-1.5 && Math.abs(z) < WORLD_HALF-1.5 && (!isRiver(id,x,z,.15) || Boolean(bridgeAt(id,x,z))) }

export function mainLoop(id: ConceptId): FlatPoint[] {
  const [arch, lower] = getBridges(id)
  return [
    {x:lower.centerX-lower.halfLength,z:lower.z}, {x:-38,z:42}, {x:-48,z:20}, {x:-40,z:-5}, {x:-36,z:-30}, {x:-20,z:-50},
    {x:arch.centerX-arch.halfLength,z:arch.z}, {x:arch.centerX+arch.halfLength,z:arch.z}, {x:28,z:-46}, {x:43,z:-28}, {x:47,z:-4},
    {x:43,z:24}, {x:35,z:43}, {x:lower.centerX+lower.halfLength,z:lower.z}, {x:lower.centerX-lower.halfLength,z:lower.z},
  ]
}

export function spawnFor(id: ConceptId): Point {
  const lower = getBridges(id)[1], x = lower.centerX-lower.halfLength-4, z = lower.z+4
  return { x, z, y: floorHeight(id,x,z) }
}

export function zoneName(id: ConceptId, p: Point) {
  const bridge = bridgeAt(id,p.x,p.z)
  if (bridge) return bridge.name
  const nearest = getPads(id).reduce((best,pad) => Math.hypot(p.x-pad.x,p.z-pad.z) < Math.hypot(p.x-best.x,p.z-best.z) ? pad : best)
  if (Math.hypot(p.x-nearest.x,p.z-nearest.z) < nearest.radius+3) return `Future Site ${nearest.id} · ${nearest.role}`
  if (p.z < -34) return 'Upper Village Shelf'
  if (p.z > 42) return 'Lower River Walk'
  return p.x < riverCenter(id,p.z) ? 'West Bank' : 'East Bank'
}
