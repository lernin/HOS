import * as T from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { canWalk, distance, findPath, riverX, targets, tasks, type Point, type Stage, type Target } from './model'

type Hooks = {
  arrive: (target: Target) => void
  nearby: (target: Target | null) => void
  hint: (text: string) => void
  step: (wood: boolean) => void
  position: (x: number, z: number) => void
  failure: (text: string) => void
}
export type GardenScene = {
  setStage: (stage: Stage) => void
  setPaused: (paused: boolean) => void
  setReduced: (reduced: boolean) => void
  move: (x: number, z: number) => void
  goTo: (target: Target) => void
  dispose: () => void
}

function leafGeometry() {
  const vertices: number[] = [], indices: number[] = []
  for (let i = 0; i <= 10; i++) {
    const t = i / 10, width = Math.sin(t * Math.PI) * 0.38
    vertices.push(-width, Math.sin(t * Math.PI) * 0.12, t, 0, Math.sin(t * Math.PI) * 0.2, t, width, Math.sin(t * Math.PI) * 0.12, t)
    if (i < 10) { const j = i * 3; indices.push(j, j + 3, j + 1, j + 1, j + 3, j + 4, j + 1, j + 4, j + 2, j + 2, j + 4, j + 5) }
  }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(vertices, 3)); g.setIndex(indices); g.computeVertexNormals(); return g
}
function ribbon(points: T.Vector3[], width: number) {
  const curve = new T.CatmullRomCurve3(points), vertices: number[] = [], uv: number[] = [], indices: number[] = []
  for (let i = 0; i <= 100; i++) {
    const p = curve.getPoint(i / 100), direction = curve.getTangent(i / 100), side = new T.Vector3(-direction.z, 0, direction.x).normalize().multiplyScalar(width / 2)
    vertices.push(p.x + side.x, p.y, p.z + side.z, p.x - side.x, p.y, p.z - side.z); uv.push(0, i / 100, 1, i / 100)
    if (i < 100) { const j = i * 2; indices.push(j, j + 1, j + 2, j + 1, j + 3, j + 2) }
  }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(vertices, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(indices); g.computeVertexNormals(); return g
}

export function createGarden(mount: HTMLDivElement, initial: Stage, hooks: Hooks): GardenScene {
  const renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'low-power', alpha: false })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65))
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap
  renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12
  renderer.domElement.setAttribute('aria-label', 'Interactive tropical garden. Tap a path to walk, or use arrow keys. Use the task button to find the next object.')
  mount.appendChild(renderer.domElement)
  const scene = new T.Scene(); scene.background = new T.Color('#9bcbc1'); scene.fog = new T.Fog('#9bcbc1', 65, 120)
  const camera = new T.OrthographicCamera(-20, 20, 14, -14, 0.1, 160)
  const cameraAim = new T.Vector3(-2, 0, 0), cameraOffset = new T.Vector3(5, 25, 25)
  camera.position.copy(cameraAim).add(cameraOffset); camera.lookAt(cameraAim)
  scene.add(new T.HemisphereLight('#e4f8e9', '#588251', 2.2))
  const sun = new T.DirectionalLight('#fff0c9', 3.1); sun.position.set(-13, 30, 13); sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25, near: 1, far: 70 }); sun.shadow.bias = -0.0007; sun.shadow.normalBias = 0.035; scene.add(sun)

  const materials = new Map<string, T.MeshStandardMaterial>()
  const mat = (color: string) => {
    if (!materials.has(color)) materials.set(color, new T.MeshStandardMaterial({ color, roughness: 0.86, side: T.DoubleSide }))
    return materials.get(color)!
  }
  const shapes = {
    sphere: new T.SphereGeometry(1, 12, 8), rock: new T.IcosahedronGeometry(1, 1), box: new T.BoxGeometry(1, 1, 1),
    cylinder: new T.CylinderGeometry(1, 1, 1, 12), cone: new T.ConeGeometry(1, 1, 10),
    leaf: leafGeometry(), torus: new T.TorusGeometry(1, 0.075, 7, 24),
  }
  const extraGeometries: T.BufferGeometry[] = []
  const world = new T.Group(); scene.add(world)
  function part(parent: T.Object3D, shape: keyof typeof shapes, color: string, position: number[], scale: number[], rotation: number[] = [0, 0, 0]) {
    const m = new T.Mesh(shapes[shape], mat(color)); m.position.set(position[0], position[1], position[2]); m.scale.set(scale[0], scale[1], scale[2]); m.rotation.set(rotation[0], rotation[1], rotation[2]); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m
  }
  function custom(parent: T.Object3D, geometry: T.BufferGeometry, color: string) {
    extraGeometries.push(geometry); const mesh = new T.Mesh(geometry, mat(color)); mesh.receiveShadow = true; parent.add(mesh); return mesh
  }
  // A modelled island with visible earthen sides, a meadow, and a sand-edged stream.
  part(world, 'cylinder', '#8a7250', [0, -0.6, 0], [18, 1.2, 14.4])
  part(world, 'cylinder', '#75aa58', [0, 0.015, 0], [17.9, 0.12, 14.3])
  part(world, 'cylinder', '#8db766', [-7, 0.085, 3], [7.5, 0.035, 6.2])
  const streamPoints = Array.from({ length: 25 }, (_, i) => new T.Vector3(riverX(i * 1.2 - 14.4), 0.17, i * 1.2 - 14.4))
  custom(world, ribbon(streamPoints.map(p => new T.Vector3(p.x, 0.14, p.z)), 4.4), '#dfcc9e')
  const flow = new T.ShaderMaterial({
    uniforms: { time: { value: 0 }, deep: { value: new T.Color('#258e95') }, light: { value: new T.Color('#7edbd0') }, falling: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'varying vec2 vUv; uniform float time; uniform vec3 deep; uniform vec3 light; uniform float falling; void main(){float ripple=sin(vUv.y*180.0-time*3.0+sin(vUv.x*30.0)*1.4); float sparkle=pow(max(0.0,sin(vUv.y*91.0-time*1.7)*sin(vUv.x*42.0+time*0.3)),16.0); float bank=pow(abs(vUv.x-0.5)*2.0,5.0); vec3 color=mix(deep,light,0.25+ripple*0.055+bank*0.35+falling*0.38);color+=vec3(0.45,0.64,0.58)*sparkle*0.45;gl_FragColor=vec4(color,1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
    side: T.DoubleSide,
  })
  const waterGeometry = ribbon(streamPoints, 3.4); extraGeometries.push(waterGeometry)
  const water = new T.Mesh(waterGeometry, flow); scene.add(water)
  const ocean = new T.Mesh(new T.PlaneGeometry(220, 220), mat('#82bdb2')); ocean.rotation.x = -Math.PI / 2; ocean.position.y = -1.3; scene.add(ocean); extraGeometries.push(ocean.geometry)
  const paths = [
    [[-8, 7], [-7, 4], [-7, 1], [-9, -2], [-9, -5]],
    [[-7, 1], [-4, 0], [0.7, 0], [4, 0], [7, -2], [9, -4]],
    [[-9, -2], [-6, -4], [-3.5, -5]],
    [[4, 0], [7, 3], [9, 6]],
  ]
  paths.forEach(points => custom(world, ribbon(points.map(([x, z]) => new T.Vector3(x, 0.125, z)), 1.5), '#d7bf8f'))
  // A gently arched footbridge. Navigation has a matching safe crossing.
  for (let i = 0; i <= 19; i++) {
    const x = -2.5 + i * 0.32, y = 0.3 + Math.sin(i / 19 * Math.PI) * 0.3
    part(world, 'box', i % 3 === 0 ? '#b87948' : '#c89359', [x, y, 0], [0.3, 0.16, 2.45])
    if (i % 4 === 0) for (const z of [-1.2, 1.2]) part(world, 'cylinder', '#846340', [x, y + 0.6, z], [0.075, 1.2, 0.075])
  }
  for (const z of [-1.2, 1.2]) {
    const points = Array.from({ length: 12 }, (_, i) => new T.Vector3(-2.5 + i * 6.1 / 11, 1.35 + Math.sin(i / 11 * Math.PI) * 0.25, z))
    custom(world, new T.TubeGeometry(new T.CatmullRomCurve3(points), 24, 0.045, 5, false), '#b9aa79')
  }
  let seed = 612
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }
  const greens = ['#245d43', '#36814f', '#479453', '#71af59', '#87bd60']
  function plant(x: number, z: number, size: number) {
    const color = greens[Math.floor(random() * greens.length)]
    for (let j = 0; j < 5; j++) {
      const angle = j * Math.PI * 2 / 5 + random() * 0.3
      part(world, 'leaf', color, [x, 0.13, z], [size, size, size * 1.5], [-0.9 - random() * 0.3, angle, 0])
    }
  }
  function flower(parent: T.Object3D, x: number, z: number, size: number, color: string) {
    const group = new T.Group(); group.position.set(x, 0.13, z); group.scale.setScalar(size); parent.add(group)
    part(group, 'cylinder', '#36814f', [0, 0.5, 0], [0.045, 1, 0.045])
    part(group, 'leaf', '#479453', [0, 0.3, 0], [0.5, 0.5, 0.65], [-0.45, 1.4, 0])
    for (let j = 0; j < 5; j++) { const a = j * Math.PI * 2 / 5; part(group, 'sphere', color, [Math.cos(a) * 0.27, 0.92, Math.sin(a) * 0.27], [0.27, 0.1, 0.19], [0.2, -a, 0]) }
    part(group, 'sphere', '#ffcd62', [0, 1.02, 0], [0.15, 0.1, 0.15]); return group
  }
  function palm(x: number, z: number, height: number, angle: number) {
    const crown = new T.Vector3(x + 0.6, height, z)
    custom(world, new T.TubeGeometry(new T.CatmullRomCurve3([new T.Vector3(x, 0.1, z), new T.Vector3(x - 0.15, height * 0.5, z), crown]), 12, 0.21, 7, false), '#a78559')
    for (let i = 1; i < 9; i++) part(world, 'torus', '#92714e', [x + i / 9 * 0.6, height * i / 9, z], [0.21, 0.21, 0.21], [Math.PI / 2, 0, 0])
    for (let j = 0; j < 8; j++) {
      const a = j * Math.PI / 4 + angle, g = new T.Group(); g.position.copy(crown); g.rotation.y = a; world.add(g)
      const frond = new T.CatmullRomCurve3([new T.Vector3(), new T.Vector3(0, 0.6, 1.2), new T.Vector3(0, 0.15, 2.5), new T.Vector3(0, -0.7, 3.4)])
      custom(g, new T.TubeGeometry(frond, 12, 0.035, 4, false), '#74a958')
      for (let k = 1; k <= 7; k++) for (const side of [-1, 1]) {
        const p = frond.getPoint(k / 9)
        part(g, 'leaf', greens[(j + k) % 4], [p.x, p.y, p.z], [0.65, 0.7, 1.1 - k * 0.055], [-0.2, side * 0.9, side * -0.3])
      }
    }
    part(world, 'sphere', '#897446', [crown.x, crown.y - 0.1, crown.z], [0.33, 0.35, 0.33])
  }
  ;[[-12, 5, 5.2], [-12, -7, 6.1], [-5, -9, 5], [7, -8, 6.5], [13, 3, 6], [5, 8, 5.5]].forEach(([x, z, h], i) => palm(x, z, h, i))
  for (let i = 0; i < 110; i++) {
    const a = random() * Math.PI * 2, r = 0.75 + random() * 0.21, x = Math.cos(a) * 17 * r, z = Math.sin(a) * 13.5 * r
    if (Math.abs(x - riverX(z)) < 2.5) continue
    plant(x, z, 0.7 + random() * 1.1)
    if (i % 3 === 0) flower(world, x + 0.4, z, 0.55 + random() * 0.5, ['#ee8b99', '#d65f87', '#ffc65b'][i % 3])
  }
  for (let i = 0; i < 40; i++) {
    const z = random() * 26 - 13, x = riverX(z) + (i % 2 ? 1 : -1) * (2.25 + random() * 0.45)
    if (Math.abs(z) < 2 || distance({ x, z }, targets.water.approach) < 1.2) continue
    const size = random() * 0.4 + 0.25
    part(world, 'rock', ['#899b80', '#6f8a7c', '#b0b89b'][i % 3], [x, 0.2, z], [size * 1.3, size * 0.8, size], [0, random() * 6, 0])
    if (i % 4 === 0) plant(x + 0.4, z, 0.6)
  }
  // Basalt waterfall behind the garden, with moving water and foam rings.
  for (let i = 0; i < 14; i++) {
    const a = i * 2.4, r = 1 + random() * 1.7, h = 2 + random() * 3
    part(world, 'rock', ['#58766b', '#728676', '#698976'][i % 3], [Math.cos(a) * r, h / 2, -11.4 + Math.sin(a) * 0.8], [1.3, h, 0.95], [0, a, 0])
  }
  const fallMat = flow.clone(); fallMat.uniforms.falling.value = 1; fallMat.uniforms.deep.value = new T.Color('#80c7ca'); fallMat.uniforms.light.value = new T.Color('#d3eeeb')
  const fallGeo = new T.PlaneGeometry(1.55, 5.4, 8, 12); extraGeometries.push(fallGeo)
  const fall = new T.Mesh(fallGeo, fallMat); fall.position.set(0.35, 2.85, -10.3); scene.add(fall)
  const foam: T.Mesh[] = []
  for (let i = 0; i < 6; i++) {
    const m = part(scene, 'torus', '#c2eee0', [0.4, 0.23, -9.8 + i * 0.7], [0.25, 0.25, 0.25], [Math.PI / 2, 0, 0]); foam.push(m)
  }
  // A small potting shelter; no interiors or extra game systems.
  part(world, 'box', '#b88b56', [-9.5, 0.6, -7.5], [2.9, 0.18, 2])
  for (const x of [-10.8, -8.2]) for (const z of [-8.3, -6.7]) part(world, 'cylinder', '#b38e58', [x, 1.6, z], [0.09, 3.2, 0.09])
  part(world, 'cone', '#caa767', [-9.5, 3.5, -7.5], [2.45, 1.2, 1.8], [0, Math.PI / 4, 0])
  for (const x of [-10.2, -9.3, -8.6]) { part(world, 'cylinder', '#c87858', [x, 0.88, -7.5], [0.24, 0.38, 0.24]); plant(x, -7.5, 0.3) }

  function person(color: string) {
    const group = new T.Group(), body = new T.Group(); group.add(body)
    part(body, 'sphere', color, [0, 0.85, 0], [0.34, 0.48, 0.24])
    part(body, 'sphere', '#d4a179', [0, 1.44, 0], [0.29, 0.31, 0.27])
    part(body, 'cylinder', '#e8c983', [0, 1.68, 0], [0.49, 0.06, 0.49])
    part(body, 'sphere', '#edd39b', [0, 1.72, 0], [0.29, 0.18, 0.29])
    const legs: T.Mesh[] = []
    for (const side of [-1, 1]) {
      legs.push(part(body, 'sphere', '#f4e5bb', [side * 0.15, 0.3, 0], [0.12, 0.28, 0.14]))
      part(body, 'sphere', '#604e3c', [side * 0.15, 0.08, 0.055], [0.13, 0.095, 0.22])
      part(body, 'sphere', '#d4a179', [side * 0.35, 0.82, 0], [0.105, 0.3, 0.11], [0, 0, side * -0.2])
      part(body, 'sphere', '#473c36', [side * 0.105, 1.47, 0.245], [0.025, 0.034, 0.016])
    }
    return { group, body, legs }
  }
  const mina = person('#428977'); mina.group.position.set(-7, 0.15, 2); scene.add(mina.group)
  const player = person('#e79c55'); player.group.position.set(-8, 0.15, 6); scene.add(player.group)
  const can = new T.Group(); can.position.set(-10, 0.25, -3); scene.add(can)
  part(can, 'cylinder', '#f0b656', [0, 0.34, 0], [0.32, 0.6, 0.32])
  part(can, 'torus', '#f0b656', [-0.33, 0.48, 0], [0.32, 0.4, 0.32])
  part(can, 'cylinder', '#e5a543', [0.4, 0.4, 0], [0.09, 0.64, 0.09], [0, 0, -1])
  part(can, 'sphere', '#ffe5a2', [0.68, 0.55, 0], [0.16, 0.11, 0.18])
  const filled = part(can, 'cylinder', '#6bcccd', [0, 0.61, 0], [0.25, 0.025, 0.25])
  const red = flower(scene, 7, -4, 1.5, '#e7554e')
  flower(scene, 10, -1, 1.1, '#ffd361')
  part(world, 'cylinder', '#9c8158', [7, 0.15, -4], [1.15, 0.16, 1.15])
  const butterflies: T.Group[] = []
  for (let i = 0; i < 5; i++) {
    const g = new T.Group(); scene.add(g); butterflies.push(g)
    for (const side of [-1, 1]) part(g, 'sphere', i % 2 ? '#ffe2a4' : '#f29baf', [side * 0.15, 0, 0], [0.18, 0.035, 0.23])
    part(g, 'sphere', '#5e5945', [0, 0, 0], [0.026, 0.04, 0.16])
  }
  // Merge only static meshes, preserving real geometry while keeping draw calls low.
  world.updateMatrixWorld(true)
  const batches = new Map<T.Material, T.BufferGeometry[]>()
  world.traverse(object => {
    if (!(object instanceof T.Mesh)) return
    let g = object.geometry.clone(); if (g.index) { const old = g; g = old.toNonIndexed(); old.dispose() }
    g.deleteAttribute('uv'); g.applyMatrix4(object.matrixWorld)
    const material = object.material as T.Material
    if (!batches.has(material)) batches.set(material, [])
    batches.get(material)!.push(g)
  })
  world.clear()
  batches.forEach((geometries, material) => {
    const combined = mergeGeometries(geometries, false)
    geometries.forEach(g => g.dispose())
    if (combined) { extraGeometries.push(combined); const m = new T.Mesh(combined, material); m.castShadow = true; m.receiveShadow = true; world.add(m) }
  })
  const marker = new T.Group(); scene.add(marker)
  const markerRing = part(marker, 'torus', '#ffefb0', [0, 0.21, 0], [0.8, 0.8, 0.8], [Math.PI / 2, 0, 0]); markerRing.castShadow = false
  const diamond = part(marker, 'rock', '#fff0b5', [0, 2.55, 0], [0.14, 0.23, 0.14])
  const targetRing = part(scene, 'torus', '#fff2c5', [0, 0.25, 0], [0.25, 0.25, 0.25], [Math.PI / 2, 0, 0]); targetRing.visible = false; targetRing.castShadow = false
  const clickObjects: T.Mesh[] = []
  Object.entries(targets).forEach(([id, item]) => {
    const mesh = new T.Mesh(new T.SphereGeometry(id === 'water' ? 0.95 : 0.8, 8, 6), new T.MeshBasicMaterial({ visible: false }))
    mesh.position.set(item.point.x, id === 'water' ? 0.2 : 0.9, item.point.z); mesh.userData.target = id; scene.add(mesh); clickObjects.push(mesh)
  })
  let stage = initial, paused = true, reduced = false, disposed = false, hidden = document.hidden
  let path: Point[] = [], destination: Target | null = null, near: Target | null = null, stepTimer = 0, last = 0, elapsed = 0
  const movement = { x: 0, z: 0 }, keys = new Set<string>()
  const raycaster = new T.Raycaster(), mouse = new T.Vector2(), plane = new T.Plane(new T.Vector3(0, 1, 0), -0.15), hit = new T.Vector3()
  function setStage(next: Stage) {
    stage = next
    can.visible = next !== 'hello' && next !== 'done'
    if (next === 'hello' || next === 'can') { can.visible = true; scene.attach(can); can.position.set(-10, 0.25, -3); can.scale.setScalar(1) }
    else if (next === 'water' || next === 'flower') { player.group.attach(can); can.position.set(0.6, 0.58, 0.2); can.scale.setScalar(0.66) }
    filled.visible = next === 'flower'
    const t = targets[tasks[next].target]; marker.position.set(t.point.x, 0, t.point.z); marker.visible = next !== 'done'
  }
  setStage(initial)
  function stop() { path = []; destination = null; keys.clear(); movement.x = 0; movement.z = 0; targetRing.visible = false }
  function goTo(target: Target) {
    if (paused) return
    path = findPath(player.group.position, targets[target].approach)
    destination = path.length ? target : null
    if (path.length) { targetRing.position.set(targets[target].approach.x, 0.23, targets[target].approach.z); targetRing.visible = true }
    else if (distance(player.group.position, targets[target].approach) < 0.9) hooks.arrive(target)
  }
  let pointerDown: { x: number; y: number; id: number } | null = null
  function down(e: PointerEvent) { pointerDown = { x: e.clientX, y: e.clientY, id: e.pointerId } }
  function up(e: PointerEvent) {
    if (paused || !pointerDown || pointerDown.id !== e.pointerId || Math.hypot(e.clientX - pointerDown.x, e.clientY - pointerDown.y) > 16) { pointerDown = null; return }
    pointerDown = null
    const rect = renderer.domElement.getBoundingClientRect(); mouse.set((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1); raycaster.setFromCamera(mouse, camera)
    const objects = raycaster.intersectObjects(clickObjects, false)
    if (objects[0]) { goTo(objects[0].object.userData.target); return }
    if (!raycaster.ray.intersectPlane(plane, hit)) return
    destination = null; path = findPath(player.group.position, hit)
    if (!path.length) { hooks.hint('Tap a path or meadow. Use the wooden bridge to cross the stream.'); return }
    targetRing.position.set(hit.x, 0.23, hit.z); targetRing.visible = true
  }
  function keyDown(e: KeyboardEvent) {
    if (paused || e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return
    if (e.target instanceof HTMLButtonElement && (e.key === 'Enter' || e.key === ' ')) return
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].includes(e.key)) { e.preventDefault(); keys.add(e.key); path = []; destination = null }
    if ((e.key === 'e' || e.key === 'Enter') && near) { e.preventDefault(); hooks.arrive(near) }
  }
  function keyUp(e: KeyboardEvent) { keys.delete(e.key) }
  function visibility() { hidden = document.hidden; stop(); last = performance.now() }
  function contextLost(e: Event) { e.preventDefault(); paused = true; hooks.failure('The garden lost its 3D connection. Return to The Lab and open it again.') }
  renderer.domElement.addEventListener('pointerdown', down); renderer.domElement.addEventListener('pointerup', up)
  renderer.domElement.addEventListener('webglcontextlost', contextLost)
  window.addEventListener('keydown', keyDown); window.addEventListener('keyup', keyUp); window.addEventListener('blur', stop); document.addEventListener('visibilitychange', visibility)
  function resize() {
    const w = mount.clientWidth || innerWidth, h = mount.clientHeight || innerHeight, aspect = w / h
    const viewHeight = aspect < 1 ? 34 : 25
    camera.left = -viewHeight * aspect / 2; camera.right = viewHeight * aspect / 2; camera.top = viewHeight / 2; camera.bottom = -viewHeight / 2; camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  }
  const observer = new ResizeObserver(resize); observer.observe(mount); resize()
  renderer.setAnimationLoop((time: number) => {
    if (disposed || hidden) { last = time; return }
    const dt = Math.min((time - (last || time)) / 1000, 0.05); last = time; elapsed += dt
    const p = player.group.position
    let moving = false
    if (!paused) {
      let dx = movement.x + Number(keys.has('ArrowRight') || keys.has('d')) - Number(keys.has('ArrowLeft') || keys.has('a'))
      let dz = movement.z + Number(keys.has('ArrowDown') || keys.has('s')) - Number(keys.has('ArrowUp') || keys.has('w'))
      if (Math.hypot(dx, dz) > 0.01) { path = []; destination = null; const length = Math.hypot(dx, dz); dx /= length; dz /= length }
      else if (path.length) {
        const t = path[0], d = distance(p, t)
        if (d < 0.13) path.shift()
        else { dx = (t.x - p.x) / d; dz = (t.z - p.z) / d }
      }
      const speed = 3.5 * dt
      if (dx || dz) {
        const next = { x: p.x + dx * speed, z: p.z + dz * speed }
        if (canWalk(next)) { p.x = next.x; p.z = next.z; moving = true }
        else { if (canWalk({ x: next.x, z: p.z })) { p.x = next.x; moving = true } if (canWalk({ x: p.x, z: next.z })) { p.z = next.z; moving = true } }
        if (moving) player.body.rotation.y = Math.atan2(dx, dz)
      }
      if (!path.length && destination) { const arrived = destination; destination = null; targetRing.visible = false; hooks.arrive(arrived) }
      if (!path.length) targetRing.visible = false
      let nearest: Target | null = null, closest = 2.15
      Object.entries(targets).forEach(([id, target]) => { const d = distance(p, target.point); if (d < closest) { closest = d; nearest = id as Target } })
      if (near !== nearest) { near = nearest; hooks.nearby(near) }
      if (moving) { stepTimer += dt; if (stepTimer > 0.38) { hooks.step(Math.abs(p.z) < 1.2 && Math.abs(p.x) < 3.5); stepTimer = 0 } }
    }
    const onBridge = Math.abs(p.z) < 1.15 && p.x > -2.8 && p.x < 3.9
    p.y = onBridge ? 0.4 + Math.sin(T.MathUtils.clamp((p.x + 2.5) / 6.1, 0, 1) * Math.PI) * 0.3 : 0.15
    player.body.position.y = moving && !reduced ? Math.sin(elapsed * 12) * 0.045 : 0
    player.legs.forEach((leg, i) => { leg.rotation.x = moving && !reduced ? Math.sin(elapsed * 12 + i * Math.PI) * 0.4 : 0 })
    const desired = new T.Vector3(p.x * 0.58, 0, p.z * 0.48 - 1.5)
    if (paused && stage === 'hello') desired.set(-1.5, 0, -1.5)
    cameraAim.lerp(desired, 1 - Math.exp(-dt * 1.8)); camera.position.copy(cameraAim).add(cameraOffset); camera.lookAt(cameraAim)
    const t = reduced ? 0 : elapsed
    flow.uniforms.time.value = t; fallMat.uniforms.time.value = t * 2.8
    foam.forEach((m, i) => { const f = (t * 0.45 + i / foam.length) % 1; m.scale.set(0.3 + f * 0.9, 0.3 + f * 0.9, 0.3 + f * 0.9); m.position.z = -9.9 + f * 1.5 })
    diamond.position.y = 2.55 + Math.sin(t * 2) * 0.1; diamond.rotation.y = t * 0.4
    butterflies.forEach((b, i) => {
      b.visible = !reduced
      b.position.set(6 + Math.sin(t * 0.4 + i * 1.4) * 4, 1.8 + Math.sin(t + i) * 0.5, -4 + Math.cos(t * 0.3 + i * 1.4) * 3)
      b.rotation.y = -t * 0.4 - i * 1.4; b.children.forEach((wing, j) => { if (j < 2) wing.rotation.z = Math.sin(t * 15 + i) * (j ? 1 : -1) * 0.6 })
    })
    const bloomSize = stage === 'done' ? 2.15 : 1.05
    red.scale.lerp(new T.Vector3(bloomSize, bloomSize, bloomSize), reduced ? 1 : 1 - Math.exp(-dt * 1.5))
    if (stage !== 'done') red.rotation.z = -0.13; else red.rotation.z *= 0.95
    hooks.position(p.x, p.z)
    renderer.render(scene, camera)
  })
  return {
    setStage,
    setPaused(value) { paused = value; if (value) stop() },
    setReduced(value) { reduced = value },
    move(x, z) { movement.x = x; movement.z = z; if (x || z) { path = []; destination = null } },
    goTo,
    dispose() {
      disposed = true; renderer.setAnimationLoop(null); observer.disconnect()
      renderer.domElement.removeEventListener('pointerdown', down); renderer.domElement.removeEventListener('pointerup', up); renderer.domElement.removeEventListener('webglcontextlost', contextLost)
      window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); window.removeEventListener('blur', stop); document.removeEventListener('visibilitychange', visibility)
      Object.values(shapes).forEach(g => g.dispose()); extraGeometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); flow.dispose(); fallMat.dispose()
      clickObjects.forEach(m => { m.geometry.dispose(); (m.material as T.Material).dispose() }); renderer.dispose(); renderer.domElement.remove(); scene.clear()
    },
  }
}
