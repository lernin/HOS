import * as T from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import {
  BRIDGE_HALF_LENGTH, BRIDGE_HALF_WIDTH, BRIDGE_X, BRIDGE_Z,
  EYE_HEIGHT, WORLD_X, WORLD_Z, bridgeDeckY, canStand, floorHeight, houses,
  pathLines, riverCenter, riverWidth, spawn, terrainHeight, waterHeight, zoneName,
  type HouseSpec, type Point,
} from './world'

export type VillageInput = { x: number; z: number; yaw: number; pitch: number; paused: boolean; speed: number }
export type VillageState = { position: Point; zone: string; fps: number }

type ModelMap = Record<string, T.Object3D>

const assetNames = [
  'Wall_Plaster_Door_Round', 'Wall_Plaster_Window_Wide_Round', 'Wall_Plaster_Straight',
  'Floor_WoodDark', 'Roof_RoundTiles_4x4',
]

function ribbon(points: T.Vector3[], width: number) {
  const positions: number[] = []
  const indices: number[] = []
  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)]
    const next = points[Math.min(points.length - 1, i + 1)]
    const dx = next.x - prev.x
    const dz = next.z - prev.z
    const len = Math.hypot(dx, dz) || 1
    const nx = -dz / len
    const nz = dx / len
    positions.push(points[i].x + nx * width / 2, points[i].y, points[i].z + nz * width / 2)
    positions.push(points[i].x - nx * width / 2, points[i].y, points[i].z - nz * width / 2)
    if (i < points.length - 1) {
      const a = i * 2
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    }
  }
  const geometry = new T.BufferGeometry()
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function samplePath(points: { x: number; z: number }[]) {
  const curve = new T.CatmullRomCurve3(points.map(p => new T.Vector3(p.x, 0, p.z)), false, 'catmullrom', 0.35)
  return curve.getPoints(90).map(p => new T.Vector3(p.x, floorHeight(p.x, p.z) + 0.025, p.z))
}

function seeded(seed: number) {
  let n = seed >>> 0
  return () => {
    n = Math.imul(n ^ (n >>> 15), 1 | n)
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n)
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296
  }
}

function clearOfBuildings(x: number, z: number, margin = 4) {
  return houses.every(h => Math.abs(x - h.x) > h.w / 2 + margin || Math.abs(z - h.z) > h.d / 2 + margin)
}

function makeNature(scene: T.Scene) {
  const rng = seeded(81326)
  const trunkGeo = new T.CylinderGeometry(0.14, 0.2, 1.55, 7)
  const crownGeo = new T.DodecahedronGeometry(1, 0)
  const trunkMat = new T.MeshStandardMaterial({ color: '#70452b', roughness: 0.95 })
  const crownMat = new T.MeshStandardMaterial({ color: '#5c8d48', roughness: 0.95 })
  const trunks = new T.InstancedMesh(trunkGeo, trunkMat, 72)
  const crowns = new T.InstancedMesh(crownGeo, crownMat, 72)
  trunks.castShadow = trunks.receiveShadow = true
  crowns.castShadow = crowns.receiveShadow = true
  const matrix = new T.Matrix4()
  const q = new T.Quaternion()
  const scale = new T.Vector3()
  const position = new T.Vector3()
  let count = 0
  for (let tries = 0; tries < 600 && count < 72; tries++) {
    const x = (rng() * 2 - 1) * (WORLD_X - 3)
    const z = (rng() * 2 - 1) * (WORLD_Z - 3)
    const creek = Math.abs(x - riverCenter(z))
    if (creek < riverWidth(z) / 2 + 3.4 || !clearOfBuildings(x, z, 3.5)) continue
    const edgeBias = Math.max(Math.abs(x) / WORLD_X, Math.abs(z) / WORLD_Z)
    if (edgeBias < 0.47 && rng() < 0.58) continue
    const y = terrainHeight(x, z)
    const s = 0.78 + rng() * 0.72
    position.set(x, y + 0.77 * s, z)
    scale.set(s, s, s)
    matrix.compose(position, q, scale)
    trunks.setMatrixAt(count, matrix)
    position.set(x + (rng() - 0.5) * 0.18, y + 2.05 * s, z + (rng() - 0.5) * 0.18)
    scale.set(1.15 * s, 1.05 * s, 1.15 * s)
    matrix.compose(position, q, scale)
    crowns.setMatrixAt(count, matrix)
    count++
  }
  trunks.count = crowns.count = count
  trunks.instanceMatrix.needsUpdate = crowns.instanceMatrix.needsUpdate = true
  scene.add(trunks, crowns)

  const rockGeo = new T.DodecahedronGeometry(0.55, 0)
  const rockMat = new T.MeshStandardMaterial({ color: '#837c68', roughness: 1 })
  const rocks = new T.InstancedMesh(rockGeo, rockMat, 30)
  for (let i = 0; i < 30; i++) {
    let x = 0, z = 0
    for (let tries = 0; tries < 50; tries++) {
      z = (rng() * 2 - 1) * 33
      x = riverCenter(z) + (rng() < 0.5 ? -1 : 1) * (riverWidth(z) / 2 + 1.2 + rng() * 3.6)
      if (clearOfBuildings(x, z, 2.4)) break
    }
    const y = terrainHeight(x, z)
    const s = 0.45 + rng() * 0.8
    q.setFromEuler(new T.Euler(rng(), rng() * 2, rng()))
    scale.set(1.2 * s, 0.65 * s, s)
    position.set(x, y + 0.22 * s, z)
    matrix.compose(position, q, scale)
    rocks.setMatrixAt(i, matrix)
  }
  rocks.castShadow = rocks.receiveShadow = true
  rocks.instanceMatrix.needsUpdate = true
  scene.add(rocks)
}

function addBridge(scene: T.Scene) {
  const wood = new T.MeshStandardMaterial({ color: '#7d4f2d', roughness: 0.92 })
  const dark = new T.MeshStandardMaterial({ color: '#51321e', roughness: 0.94 })
  const group = new T.Group()
  group.name = 'Little Creek Bridge'
  const steps = 18
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1)
    const x = BRIDGE_X - BRIDGE_HALF_LENGTH + t * BRIDGE_HALF_LENGTH * 2
    const y = bridgeDeckY(x)
    const plank = new T.Mesh(new T.BoxGeometry(BRIDGE_HALF_LENGTH * 2 / steps * 1.08, 0.15, BRIDGE_HALF_WIDTH * 2), wood)
    plank.position.set(x, y, BRIDGE_Z)
    plank.castShadow = plank.receiveShadow = true
    group.add(plank)
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i <= 6; i++) {
      const t = i / 6
      const x = BRIDGE_X - BRIDGE_HALF_LENGTH + t * BRIDGE_HALF_LENGTH * 2
      const y = bridgeDeckY(x)
      const post = new T.Mesh(new T.BoxGeometry(0.12, 1.0, 0.12), dark)
      post.position.set(x, y + 0.48, BRIDGE_Z + side * (BRIDGE_HALF_WIDTH - 0.08))
      post.castShadow = true
      group.add(post)
    }
    const railCurve = new T.CatmullRomCurve3(Array.from({ length: 13 }, (_, i) => {
      const t = i / 12
      const x = BRIDGE_X - BRIDGE_HALF_LENGTH + t * BRIDGE_HALF_LENGTH * 2
      return new T.Vector3(x, bridgeDeckY(x) + 0.86, BRIDGE_Z + side * (BRIDGE_HALF_WIDTH - 0.08))
    }))
    const rail = new T.Mesh(new T.TubeGeometry(railCurve, 32, 0.065, 6, false), dark)
    rail.castShadow = true
    group.add(rail)
  }
  scene.add(group)
}

function addAsset(group: T.Group, models: ModelMap, name: string, x: number, y: number, z: number, rotY = 0, scale = 1) {
  const source = models[name]
  if (!source) return
  const model = source.clone(true)
  model.position.set(x, y, z)
  model.rotation.y = rotY
  model.scale.setScalar(scale)
  model.traverse(child => {
    if (child instanceof T.Mesh) {
      child.castShadow = true
      child.receiveShadow = true
    }
  })
  group.add(model)
}

function houseAsset(part: 'door' | 'window' | 'straight') {
  const prefix = 'Wall_Plaster'
  return `${prefix}_${part === 'door' ? 'Door_Round' : part === 'window' ? 'Window_Wide_Round' : 'Straight'}`
}

function addHouse(scene: T.Scene, models: ModelMap, house: HouseSpec) {
  const group = new T.Group()
  group.name = house.label
  group.position.set(house.x, house.y + 0.035, house.z)
  const floorName = 'Floor_WoodDark'
  for (let x = -house.w / 2 + 1; x <= house.w / 2 - 1; x += 2) {
    for (let z = -1; z <= 1; z += 2) addAsset(group, models, floorName, x, 0, z)
  }
  const frontXs = [-1, 1]
  frontXs.forEach((x, index) => {
    const part = house.enterable && index === 0 ? 'door' : 'window'
    addAsset(group, models, houseAsset(part), x, 0, house.d / 2, 0)
    addAsset(group, models, houseAsset(index % 2 ? 'window' : 'straight'), -x, 0, -house.d / 2, Math.PI)
  })
  for (const side of [-1, 1]) {
    for (const z of [-1, 1]) {
      addAsset(group, models, houseAsset(z > 0 ? 'window' : 'straight'), side * house.w / 2, 0, z, side > 0 ? -Math.PI / 2 : Math.PI / 2)
    }
  }
  addAsset(group, models, 'Roof_RoundTiles_4x4', 0, 3.08, 0)
  scene.add(group)
}

async function loadModels(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  const response = await fetch('/assets/village/village-kit.glb.gz', { signal })
  if (!response.ok) throw new Error(`Village kit could not load (${response.status}).`)
  const packed = await response.arrayBuffer()
  const stream = new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'))
  const buffer = await new Response(stream).arrayBuffer()
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  const loader = new GLTFLoader()
  const gltf = await new Promise<GLTF>((resolve, reject) => loader.parse(buffer, '', resolve, reject))
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  const models: ModelMap = {}
  for (const name of assetNames) {
    const group = new T.Group()
    group.name = name
    gltf.scene.traverse(child => {
      if (child instanceof T.Mesh && child.name.startsWith(`${name}__`)) group.add(child.clone())
    })
    models[name] = group
  }
  return models
}

export async function createVillage(
  canvas: HTMLCanvasElement,
  input: VillageInput,
  signal: AbortSignal,
  report: (state: VillageState) => void,
  progress: (message: string) => void,
) {
  progress('Shaping the valley…')
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.35))
  renderer.outputColorSpace = T.SRGBColorSpace
  renderer.toneMapping = T.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = T.PCFSoftShadowMap

  const scene = new T.Scene()
  scene.background = new T.Color('#b9d8e7')
  scene.fog = new T.Fog('#c7dde2', 56, 150)
  const camera = new T.PerspectiveCamera(67, 1, 0.08, 210)
  camera.rotation.order = 'YXZ'
  const hemi = new T.HemisphereLight('#f1fbff', '#52623f', 1.8)
  const sun = new T.DirectionalLight('#fff1c9', 2.55)
  sun.position.set(-32, 52, 34)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 140 })
  sun.shadow.bias = -0.00025
  sun.shadow.normalBias = 0.035
  scene.add(hemi, sun)

  const terrainGeo = new T.PlaneGeometry(WORLD_X * 2, WORLD_Z * 2, 104, 90)
  terrainGeo.rotateX(-Math.PI / 2)
  const terrainPos = terrainGeo.attributes.position as T.BufferAttribute
  for (let i = 0; i < terrainPos.count; i++) terrainPos.setY(i, terrainHeight(terrainPos.getX(i), terrainPos.getZ(i)))
  terrainPos.needsUpdate = true
  terrainGeo.computeVertexNormals()
  const terrain = new T.Mesh(terrainGeo, new T.MeshStandardMaterial({ color: '#7ea65b', roughness: 0.98 }))
  terrain.receiveShadow = true
  scene.add(terrain)

  progress('Running the creek…')
  const riverPoints: T.Vector3[] = []
  for (let z = -WORLD_Z + 2; z <= WORLD_Z - 2; z += 0.8) riverPoints.push(new T.Vector3(riverCenter(z), waterHeight(z), z))
  const waterMat = new T.MeshStandardMaterial({ color: '#4ba7bb', roughness: 0.24, metalness: 0.04, transparent: true, opacity: 0.78 })
  const creek = new T.Mesh(ribbon(riverPoints, 3.35), waterMat)
  creek.receiveShadow = true
  scene.add(creek)
  const pond = new T.Mesh(new T.CircleGeometry(4.8, 40), waterMat.clone())
  pond.rotation.x = -Math.PI / 2
  const pondZ = -21
  pond.position.set(riverCenter(pondZ), waterHeight(pondZ) + 0.012, pondZ)
  scene.add(pond)

  const pathMat = new T.MeshStandardMaterial({ color: '#b99a68', roughness: 1 })
  for (const line of pathLines) {
    const path = new T.Mesh(ribbon(samplePath(line), 1.55), pathMat)
    path.receiveShadow = true
    scene.add(path)
  }
  addBridge(scene)
  makeNature(scene)

  progress('Building the cottages…')
  const models = await loadModels(signal)
  for (const house of houses) addHouse(scene, models, house)
  for (const house of houses) {
    const glow = new T.PointLight('#ffd08a', 0.42, 7, 2)
    glow.position.set(house.x, house.y + 2.15, house.z + house.d / 2 + 0.45)
    scene.add(glow)
  }

  const position = new T.Vector3(spawn.x, spawn.y, spawn.z)
  input.yaw = -0.55
  input.pitch = -0.04
  let raf = 0
  let last = performance.now()
  let frames = 0
  let reportAt = last
  let fps = 0

  function resize() {
    const width = canvas.clientWidth || innerWidth
    const height = canvas.clientHeight || innerHeight
    if (canvas.width !== Math.floor(width * renderer.getPixelRatio()) || canvas.height !== Math.floor(height * renderer.getPixelRatio())) renderer.setSize(width, height, false)
    camera.aspect = width / Math.max(1, height)
    camera.updateProjectionMatrix()
  }

  function tick(now: number) {
    if (signal.aborted) return
    const dt = Math.min(0.035, Math.max(0.001, (now - last) / 1000))
    last = now
    frames++
    if (now - reportAt >= 500) {
      fps = Math.round(frames * 1000 / (now - reportAt))
      frames = 0
      reportAt = now
    }
    if (!input.paused) {
      const length = Math.hypot(input.x, input.z)
      if (length > 0.02) {
        const ix = input.x / Math.max(1, length)
        const iz = input.z / Math.max(1, length)
        const c = Math.cos(input.yaw)
        const s = Math.sin(input.yaw)
        const vx = ix * c - iz * s
        const vz = ix * s + iz * c
        const distance = input.speed * dt
        const nx = position.x + vx * distance
        const nz = position.z + vz * distance
        if (canStand(nx, position.z)) position.x = nx
        if (canStand(position.x, nz)) position.z = nz
      }
    }
    position.y += (floorHeight(position.x, position.z) - position.y) * Math.min(1, dt * 12)
    camera.position.set(position.x, position.y + EYE_HEIGHT, position.z)
    camera.rotation.set(input.pitch, input.yaw, 0)
    resize()
    ;(creek.material as T.MeshStandardMaterial).opacity = 0.75 + Math.sin(now * 0.0014) * 0.035
    pond.position.y = waterHeight(pondZ) + 0.015 + Math.sin(now * 0.0011) * 0.012
    renderer.render(scene, camera)
    if (now - reportAt < 40) report({ position: { x: position.x, y: position.y, z: position.z }, zone: zoneName(position.x, position.z), fps })
    raf = requestAnimationFrame(tick)
  }
  progress('Ready to wander.')
  raf = requestAnimationFrame(tick)

  return {
    reset() {
      position.set(spawn.x, spawn.y, spawn.z)
      input.yaw = -0.55
      input.pitch = -0.04
    },
    dispose() {
      cancelAnimationFrame(raf)
      scene.traverse(object => {
        if (!(object instanceof T.Mesh || object instanceof T.InstancedMesh)) return
        object.geometry?.dispose()
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach(material => material?.dispose())
      })
      renderer.dispose()
    },
  }
}
