import * as T from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { docks, houses, isWater, paths, riverCenter, spawn, terraces, tree, walkStep, placeName, type Point } from './world'

export type VillageInput = { x: number; z: number; yaw: number; pitch: number; paused: boolean; quality: number }
export type VillageState = { position: Point; boating: boolean; location: string; action: string; visited: string[]; fps: number }

export async function createVillage(canvas: HTMLCanvasElement, input: VillageInput, signal: AbortSignal, report: (s: VillageState) => void) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.4))
  renderer.outputColorSpace = T.SRGBColorSpace
  renderer.toneMapping = T.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.15
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = T.PCFSoftShadowMap
  const scene = new T.Scene()
  scene.background = new T.Color('#a4d7ed')
  scene.fog = new T.Fog('#b4d6dd', 100, 330)
  const camera = new T.PerspectiveCamera(66, 1, .08, 650)
  camera.rotation.order = 'YXZ'
  const light = new T.DirectionalLight('#ffedc6', 3.3)
  light.position.set(-60, 110, 45)
  light.castShadow = true
  light.shadow.mapSize.set(2048, 2048)
  Object.assign(light.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 10, far: 240 })
  light.shadow.normalBias = .045
  light.shadow.bias = -.0001
  scene.add(light, new T.HemisphereLight('#dcf5ff', '#68754b', 2))
  const staticGroup = new T.Group(); scene.add(staticGroup)
  const dynamic = new T.Group(); scene.add(dynamic)
  const materials = new Map<string, T.MeshStandardMaterial>()
  const resources = new Set<T.BufferGeometry>(), textures = new Set<T.Texture>()
  const mat = (color: string, roughness = .86) => {
    const key = color + roughness
    if (!materials.has(key)) materials.set(key, new T.MeshStandardMaterial({ color, roughness }))
    return materials.get(key)!
  }
  const wood = '#795335', paleWood = '#bc9058', stone = '#92968d', cream = '#e4d6ac', slate = '#486174'
  const mesh = (g: T.BufferGeometry, color: string, x: number, y: number, z: number, group: T.Group = staticGroup) => {
    resources.add(g)
    const m = new T.Mesh(g, mat(color)); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; group.add(m); return m
  }
  const box = (x: number, y: number, z: number, w: number, h: number, d: number, color: string, group = staticGroup) => mesh(new T.BoxGeometry(w, h, d), color, x, y, z, group)
  const cylinder = (x: number, y: number, z: number, rt: number, rb: number, h: number, color: string, segments = 10, group = staticGroup) => mesh(new T.CylinderGeometry(rt, rb, h, segments), color, x, y, z, group)
  const beam = (a: T.Vector3, b: T.Vector3, radius: number, color: string, group = staticGroup) => {
    const m = cylinder((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, radius, radius, a.distanceTo(b), color, 7, group)
    m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), b.clone().sub(a).normalize()); return m
  }
  const v = (x: number, y: number, z: number) => new T.Vector3(x, y, z)
  let seed = 7941
  const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
  const rock = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color = stone) => {
    const m = mesh(new T.DodecahedronGeometry(1, 0), color, x, y, z); m.scale.set(sx, sy, sz); m.rotation.set(rand() * .4, rand() * 6.28, rand() * .3); return m
  }
  let disposed = false, frame = 0, observer: ResizeObserver | undefined
  const extraMaterials = new Set<T.Material>()
  const dispose = () => {
    if (disposed) return; disposed = true; cancelAnimationFrame(frame); observer?.disconnect()
    scene.traverse(o => { if (o instanceof T.Mesh) { resources.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) { extraMaterials.add(m); for (const value of Object.values(m)) if (value instanceof T.Texture) textures.add(value) } } })
    resources.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); extraMaterials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); light.shadow.map?.dispose(); renderer.dispose()
  }
  signal.addEventListener('abort', dispose, { once: true })
  try {
    // Riverbed, grassy banks, distinct rock terraces and distant alpine silhouettes.
    box(0, -4, -30, 440, 4, 460, '#497666')
    for (const side of [-1, 1]) {
      for (let i = 0; i < 17; i++) {
        const z = 65 - i * 10, x = riverCenter(z) + side * (27 + rand() * 7), y = 2 + rand() * 3
        if (z < -90) continue
        rock(x, y - 5, z, 16, 7, 12, '#849487')
        cylinder(x, y - .7, z, 13, 14, 1, '#688742', 12)
      }
    }
    for (const t of terraces) {
      cylinder(t.x, t.y - 4.5, t.z, t.radius, t.radius + 1.7, 8.7, '#8c958b', 15)
      cylinder(t.x, t.y - .22, t.z, t.radius, t.radius, .4, '#83a44d', 48)
      for (let i = 0; i < 22; i++) {
        const a = i / 22 * Math.PI * 2, x = t.x + Math.cos(a) * (t.radius - .3), z = t.z + Math.sin(a) * (t.radius - .3)
        rock(x, t.y - 2.5, z, 1.5 + rand() * 1.5, 3, 2)
      }
    }
    for (let i = 0; i < 24; i++) {
      const x = (i - 12) * 25, z = -230 - rand() * 75, h = 35 + rand() * 68
      const mountain = mesh(new T.ConeGeometry(30 + rand() * 20, h, 5), i % 2 ? '#7395a5' : '#8eaeb9', x, h / 2 - 3, z)
      mountain.rotation.y = rand() * 3
      const snow = mesh(new T.ConeGeometry(10, h * .29, 5), '#e1f0ee', x, h * .85 - 3, z)
      snow.rotation.y = mountain.rotation.y
    }
    // High waterfall cliffs frame the navigable river instead of blocking it.
    const falls = [{ x: -12, z: -69, h: 25, w: 7 }, { x: 48, z: -62, h: 20, w: 5 }, { x: -53, z: -45, h: 15, w: 5 }]
    for (const f of falls) {
      for (let j = -2; j <= 2; j++) rock(f.x + j * 4, f.h / 2 - 2, f.z - 4, 5, f.h / 2 + 3, 8, '#849397')
      cylinder(f.x, f.h, f.z - 5, 9, 10, .8, '#75944b', 12)
    }
    const waterMaterial = new T.ShaderMaterial({
      uniforms: { time: { value: 0 }, deep: { value: new T.Color('#187e91') }, shallow: { value: new T.Color('#65d2d2') } },
      vertexShader: `varying vec3 world; uniform float time; void main(){vec3 p=position; p.z+=.065*sin(p.x*1.3+time)*sin(p.y*.8-time*.7); vec4 w=modelMatrix*vec4(p,1.); world=w.xyz; gl_Position=projectionMatrix*viewMatrix*w;}`,
      fragmentShader: `varying vec3 world; uniform float time; uniform vec3 deep; uniform vec3 shallow; void main(){float r=sin(world.x*1.7+world.z*.65+time*1.4)*sin(world.z*2.1-world.x*.3-time);float s=pow(max(0.,r),16.);float n=.5+.5*sin(world.x*.12+world.z*.08); vec3 c=mix(deep,shallow,n*.48+.22)+vec3(.45,.55,.5)*s*.5; gl_FragColor=vec4(c,1.);
#include <tonemapping_fragment>\n#include <colorspace_fragment> }`,
      side: T.DoubleSide,
    })
    extraMaterials.add(waterMaterial)
    const riverVertices: number[] = [], riverIndices: number[] = []
    for (let i = 0; i <= 100; i++) { const z = 80 - i * 2; riverVertices.push(riverCenter(z) - 10, z, 0, riverCenter(z) + 10, z, 0); if (i < 100) { const k = i * 2; riverIndices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2) } }
    const riverGeometry = new T.BufferGeometry(); riverGeometry.setAttribute('position', new T.Float32BufferAttribute(riverVertices, 3)); riverGeometry.setIndex(riverIndices); resources.add(riverGeometry)
    const river = new T.Mesh(riverGeometry, waterMaterial); river.rotation.x = Math.PI / 2; river.position.y = .05; scene.add(river)
    const lakeGeometry = new T.CircleGeometry(46, 80); resources.add(lakeGeometry)
    const lake = new T.Mesh(lakeGeometry, waterMaterial); lake.rotation.x = -Math.PI / 2; lake.scale.x = 1.15; lake.position.set(3, .03, -130); scene.add(lake)
    const waterfallMaterial = new T.ShaderMaterial({ uniforms: { time: { value: 0 } }, transparent: true, side: T.DoubleSide,
      vertexShader: `varying vec2 v; void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec2 v;uniform float time;void main(){float a=sin(v.x*80.+sin(v.y*12.-time*5.))*0.5+0.5;float b=sin(v.y*75.-time*15.+v.x*13.);gl_FragColor=vec4(mix(vec3(.32,.72,.8),vec3(.94,1.,1.),a*.7+b*.12),.88);
#include <tonemapping_fragment>\n#include <colorspace_fragment> }` })
    extraMaterials.add(waterfallMaterial)
    const foam: T.Mesh[] = []
    for (const f of falls) {
      const g = new T.PlaneGeometry(f.w, f.h); resources.add(g)
      const m = new T.Mesh(g, waterfallMaterial); m.position.set(f.x, f.h / 2, f.z + 2); scene.add(m)
      for (let i = 0; i < 10; i++) { const m = mesh(new T.SphereGeometry(.6, 7, 5), '#e0f6ec', f.x + (rand() - .5) * f.w * 1.2, .5 + rand(), f.z + 2 + rand() * 2, dynamic); m.scale.set(1.5, .4, 1); foam.push(m) }
    }
    // Continuous paths have matching physical surfaces. The stair is genuinely climbable.
    for (const path of paths) {
      for (let i = 1; i < path.points.length; i++) {
        const a = path.points[i - 1], b = path.points[i], dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz)
        const segments = Math.max(1, Math.ceil(length / (path.wood ? .45 : 1.1)))
        for (let j = 0; j < segments; j++) {
          const t = (j + .5) / segments
          const tile = box(a.x + dx * t, a.y + (b.y - a.y) * t - .12, a.z + dz * t, path.width, .23, length / segments + .025, path.wood ? (j % 3 ? paleWood : '#ae814d') : (j % 2 ? '#d0c29c' : '#bfb492'))
          tile.rotation.y = Math.atan2(dx, dz)
          tile.rotation.x = -Math.atan2(b.y - a.y, length)
        }
        if (path.rails && (path.points.length < 40 || i % 6 === 0)) {
          const start = path.points.length < 40 ? a : path.points[Math.max(0, i - 6)]
          for (const side of [-1, 1]) {
            const ox = dz / length * path.width * .48 * side, oz = -dx / length * path.width * .48 * side
            cylinder(b.x + ox, b.y + .63, b.z + oz, .09, .11, 1.5, wood, 7)
            for (const rise of [.6, 1.18]) beam(v(start.x + ox, start.y + rise, start.z + oz), v(b.x + ox, b.y + rise, b.z + oz), .055, '#ac915f')
          }
        }
      }
    }
    // Great willow, roots, branch supports, and a generous balcony.
    cylinder(tree.x, 20, tree.z, 1.4, 2.6, 24, '#705136', 12)
    for (let i = 0; i < 9; i++) {
      const a = i * Math.PI * 2 / 9
      beam(v(tree.x, 24, tree.z), v(tree.x + Math.cos(a) * 8, 29 + rand() * 3, tree.z + Math.sin(a) * 8), .48, wood)
      beam(v(tree.x, 11, tree.z), v(tree.x + Math.cos(a) * 5, 9, tree.z + Math.sin(a) * 5), .5, wood)
    }
    box(-39, 18.83, -12.75, 10, .34, 11.5, paleWood)
    for (let i = 0; i < 15; i++) box(-43.9 + i * .7, 19.01, -12.75, .025, .02, 11.4, wood)
    for (const z of [-18.5, -7]) for (let x = -43.9; x < -33.9; x += 1.1) {
      if (z === -7 && x > -41 && x < -37) continue
      cylinder(x, 19.65, z, .08, .1, 1.4, wood, 7)
      box(x + .45, 20.2, z, 1.05, .12, .12, paleWood)
    }
    for (const x of [-43.9, -34]) { box(x, 20.2, -12.75, .12, .12, 11.5, paleWood); for (let z = -18.5; z <= -7; z += 1.1) cylinder(x, 19.65, z, .08, .1, 1.4, wood, 7) }
    for (const z of [-17, -9]) beam(v(tree.x, 13, tree.z), v(-40, 18.6, z), .23, wood)
    const glow = mat('#ffd381'); glow.emissive.set('#ffb744'); glow.emissiveIntensity = .6
    function lantern(x: number, y: number, z: number) {
      cylinder(x, y + 1.25, z, .065, .1, 2.5, wood)
      box(x, y + 2.4, z, .38, .55, .38, '#ffd381')
      cylinder(x, y + 2.76, z, 0, .36, .25, slate, 4)
    }
    function windowAt(x: number, y: number, z: number, sideways = false) {
      const frame = box(x, y, z, 1.55, 1.7, .16, wood); const pane = box(x, y, z + .035, 1.3, 1.44, .18, '#ffd381')
      if (sideways) { frame.rotation.y = Math.PI / 2; pane.rotation.y = Math.PI / 2 }
      else { box(x, y, z + .15, .09, 1.5, .09, wood); box(x, y, z + .15, 1.4, .09, .09, wood); box(x, y - 1.13, z + .25, 1.85, .32, .5, paleWood) }
    }
    function house(h: typeof houses[number]) {
      const { x, y, z } = h
      box(x, y - .04, z, 7, .1, 7, '#b28b5c')
      for (let j = 0; j < 12; j++) box(x - 3.3 + j * .58, y + .017, z, .017, .018, 7, wood)
      box(x - 3.5, y + 2.15, z, .25, 4.3, 7, cream); box(x + 3.5, y + 2.15, z, .25, 4.3, 7, cream)
      box(x, y + 2.15, z - 3.5, 7, 4.3, .25, cream)
      for (const side of [-1, 1]) box(x + side * 2.27, y + 2.15, z + 3.5, 2.46, 4.3, .25, cream)
      box(x, y + 3.85, z + 3.5, 2, .9, .25, wood)
      for (const dx of [-3.5, 3.5]) for (const dz of [-3.5, 3.5]) box(x + dx, y + 2.2, z + dz, .3, 4.4, .3, wood)
      for (const dz of [-3.5, 3.5]) { if (dz < 0) box(x, y + .35, z + dz, 7, .3, .3, wood); else for (const side of [-1, 1]) box(x + side * 2.27, y + .35, z + dz, 2.46, .3, .3, wood); box(x, y + 4.1, z + dz, 7, .25, .3, wood) }
      // Pitched roof, individual slate courses, triangular gables.
      for (const side of [-1, 1]) {
        const roof = box(x + side * 2, y + 5.25, z, 4.7, .25, 8.3, h.roof); roof.rotation.z = side * -.51
        for (let j = 0; j < 7; j++) { const course = box(x + side * (j * .56 + .24), y + 6.3 - (j * .56 + .24) * .56, z, .07, .09, 8.4, '#6d8490'); course.rotation.z = side * -.51 }
      }
      for (const dz of [-3.51, 3.51]) {
        const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute([-3.5, 4.2, 0, 3.5, 4.2, 0, 0, 6.25, 0, 0, 6.25, 0, 3.5, 4.2, 0, -3.5, 4.2, 0], 3)); g.computeVertexNormals(); mesh(g, cream, x, y, z + dz)
        beam(v(x - 3.8, y + 4.12, z + dz), v(x, y + 6.5, z + dz), .12, wood); beam(v(x + 3.8, y + 4.12, z + dz), v(x, y + 6.5, z + dz), .12, wood)
      }
      box(x + 2.3, y + 5.9, z - 1.5, .9, 2.4, .95, '#aba696'); box(x + 2.3, y + 7.13, z - 1.5, 1.2, .23, 1.25, stone)
      windowAt(x - 2.3, y + 2.35, z + 3.66); windowAt(x + 2.3, y + 2.35, z + 3.66)
      // The doorway stays open: no teleport, loading screen, or invisible closed wall.
      box(x, y + .035, z + .4, 2.2, .04, 3.4, '#748e77')
      for (const s of [-1, 1]) box(x + s * 1.02, y + .06, z + .4, .065, .03, 3.3, '#dbb76b')
      box(x - 2.1, y + .4, z - .3, 1.55, .65, 2.8, wood)
      box(x - 2.1, y + .81, z - .3, 1.5, .25, 2.7, '#d2c6a5')
      box(x - 2.1, y + .98, z + .2, 1.52, .12, 1.65, '#7e9c8c')
      box(x - 2.1, y + 1, z - 1.2, 1.05, .22, .55, '#fff0ce')
      box(x, y + 1.2, z - 2.6, 2.4, .18, 1.1, paleWood)
      for (const side of [-1, 1]) box(x + side, y + .55, z - 2.6, .12, 1.1, .7, wood)
      box(x + 2.85, y + 1.55, z - 1.1, .8, 3.1, 3.4, wood)
      for (let shelf = 0; shelf < 4; shelf++) {
        box(x + 2.37, y + .32 + shelf * .72, z - 1.1, .12, .12, 3.3, paleWood)
        for (let b = 0; b < 10; b++) box(x + 2.35, y + .63 + shelf * .72, z - 2.45 + b * .28, .22, .4 + rand() * .16, .17, ['#738e89', '#a66d4a', '#ceae65', '#5b768c'][b % 4])
      }
      box(x, y + 1.32, z - 2.55, .65, .07, .44, '#e9dcbb')
      const insideLight = new T.PointLight('#ffe2a0', 7, 8, 2); insideLight.position.set(x, y + 3.3, z); scene.add(insideLight)
      const globe = mesh(new T.SphereGeometry(.24, 10, 8), '#ffd381', x, y + 3.55, z); globe.castShadow = false
      lantern(x + 4.1, y, z + 4)
    }
    houses.forEach(house)
    // A working waterwheel and tiny distant village silhouettes.
    const wheel = new T.Group(); wheel.position.set(14, 3.2, 6); wheel.rotation.y = Math.PI / 2; dynamic.add(wheel)
    for (const z of [-.65, .65]) {
      const ring = mesh(new T.TorusGeometry(2.6, .15, 6, 28), wood, 0, 0, z, wheel)
      ring.castShadow = false
      for (let j = 0; j < 10; j++) { const a = j * Math.PI / 5; beam(v(0, 0, z), v(Math.cos(a) * 2.6, Math.sin(a) * 2.6, z), .07, paleWood, wheel) }
    }
    for (let j = 0; j < 16; j++) { const a = j * Math.PI / 8; const paddle = box(Math.cos(a) * 2.55, Math.sin(a) * 2.55, 0, .55, .12, 1.7, paleWood, wheel); paddle.rotation.z = a }
    box(19, 3, 6, 6, 6, 6, cream); cylinder(19, 7.7, 6, 0, 5.1, 3.6, slate, 4)
    windowAt(19, 4, 9.1)
    for (let i = 0; i < 7; i++) {
      const x = -72 + i * 21, z = -93 - rand() * 12, y = 12 + rand() * 14
      rock(x, y / 2 - 3, z, 11, y / 2 + 4, 12)
      cylinder(x, y, z, 8, 9, .7, '#81a354', 12)
      box(x, y + 2, z, 4.4, 4, 5, cream); cylinder(x, y + 5.3, z, 0, 4, 3, slate, 4)
      box(x, y + 2, z + 2.55, 1.1, 1.5, .1, '#ffd381')
    }
    // Docks and boat; the bow points toward negative Z.
    for (const d of docks) {
      for (let j = 0; j < 18; j++) box(d.x, d.y - .15, d.z - 4.5 + j * .5, 6, .3, .47, j % 2 ? paleWood : '#b1834b')
      for (const dx of [-2.8, 2.8]) for (const dz of [-4.1, 4.1]) { cylinder(d.x + dx, .7, d.z + dz, .18, .23, 3.4, wood); if (dx < 0) lantern(d.x + dx, d.y, d.z + dz) }
    }
    const boat = new T.Group(); dynamic.add(boat)
    const boatShape = new T.Shape(); boatShape.moveTo(0, -2.4); boatShape.bezierCurveTo(1.4, -1.3, 1.3, 1.3, .7, 2); boatShape.lineTo(-.7, 2); boatShape.bezierCurveTo(-1.3, 1.3, -1.4, -1.3, 0, -2.4)
    const hullGeo = new T.ExtrudeGeometry(boatShape, { depth: .42, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: .12, bevelThickness: .12 }); hullGeo.rotateX(Math.PI / 2)
    mesh(hullGeo, wood, 0, .33, 0, boat)
    const curve = new T.CatmullRomCurve3([v(0, .64, -2.4), v(1.03, .58, -1), v(1.03, .58, 1), v(.65, .58, 2), v(-.65, .58, 2), v(-1.03, .58, 1), v(-1.03, .58, -1), v(0, .64, -2.4)])
    mesh(new T.TubeGeometry(curve, 40, .12, 6, false), paleWood, 0, 0, 0, boat)
    for (const z of [-.9, .7, 1.6]) box(0, .55, z, 1.7, .14, .42, paleWood, boat)
    for (const side of [-1, 1]) { beam(v(side * .65, .7, .2), v(side * 1.7, .35, 1.65), .055, paleWood, boat); box(side * 1.6, .35, 1.5, .25, .09, .7, paleWood, boat).rotation.y = side * -.5 }
    boat.position.set(docks[0].x + 4.6, .25, docks[0].z)
    // Flowers, path-side lanterns and foliage. Small objects are merged by material.
    for (const path of paths.filter(p => p.points.length < 40)) for (const p of path.points) lantern(p.x - 2, p.y, p.z)
    for (const t of terraces) for (let i = 0; i < 100; i++) {
      const a = rand() * Math.PI * 2, r = (0.65 + rand() * .3) * t.radius
      const x = t.x + Math.cos(a) * r, z = t.z + Math.sin(a) * r
      if (houses.some(h => Math.abs(x - h.x) < 5 && Math.abs(z - h.z) < 5)) continue
      const color = ['#f4e9b7', '#b39bd4', '#f4ca63', '#e8c7d9'][i % 4]
      cylinder(x, t.y + .18, z, .025, .035, .35, '#567b36', 4)
      const flower = mesh(new T.SphereGeometry(.13, 5, 3), color, x, t.y + .4, z); flower.scale.y = .5
    }
    const placements: { x: number; y: number; z: number; scale: number; kind: string }[] = [{ x: tree.x, y: tree.y, z: tree.z, scale: 32, kind: 'tree' }]
    for (const t of terraces) for (let j = 0; j < 7; j++) {
      const a = j * Math.PI * 2 / 7, x = t.x + Math.cos(a) * (t.radius - 3), z = t.z + Math.sin(a) * (t.radius - 3)
      if (paths.some(path => path.points.some(p => Math.hypot(x - p.x, z - p.z) < 4))) continue
      if (houses.some(h => Math.hypot(x - h.x, z - h.z) < 7)) continue
      placements.push({ x, y: t.y, z, scale: 6 + rand() * 4, kind: j % 3 ? 'pine' : 'tree' })
    }
    for (let j = 0; j < 130; j++) {
      const side = j % 2 ? -1 : 1, x = side * (48 + rand() * 55), z = 63 - rand() * 250
      if (isWater(x, z, -8)) continue
      placements.push({ x, y: -1, z, scale: 10 + rand() * 12, kind: j % 5 ? 'pine' : 'tree' })
    }
    const loader = new GLTFLoader()
    for (const kind of ['pine', 'tree']) {
      const response = await fetch(`/woodland/${kind}.glb`, { signal }); if (!response.ok) throw new Error('The trees could not load. Please try again.')
      const gltf = await loader.parseAsync(await response.arrayBuffer(), '')
      // Track parsed resources even if an abort arrives during decoding.
      gltf.scene.traverse(o => { if (o instanceof T.Mesh) { resources.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) { extraMaterials.add(m); for (const val of Object.values(m)) if (val instanceof T.Texture) textures.add(val) } } })
      if (signal.aborted) { resources.forEach(g => g.dispose()); extraMaterials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); throw new DOMException('Aborted', 'AbortError') }
      gltf.scene.updateMatrixWorld(true)
      const bounds = new T.Box3().setFromObject(gltf.scene), size = bounds.getSize(new T.Vector3()), center = bounds.getCenter(new T.Vector3())
      const items = placements.filter(p => p.kind === kind), matrix = new T.Matrix4(), transform = new T.Object3D()
      gltf.scene.traverse(o => {
        if (!(o instanceof T.Mesh)) return
        const instances = new T.InstancedMesh(o.geometry, o.material, items.length)
        items.forEach((p, i) => {
          const s = p.scale / size.y
          transform.position.set(p.x - center.x * s, p.y - bounds.min.y * s, p.z - center.z * s); transform.scale.setScalar(s); transform.rotation.y = i * 2.39; transform.updateMatrix()
          matrix.multiplyMatrices(transform.matrix, o.matrixWorld); instances.setMatrixAt(i, matrix)
        })
        instances.castShadow = true; instances.receiveShadow = true; instances.computeBoundingSphere(); scene.add(instances)
      })
    }
    // Batch original architecture: one draw call per color, not one per plank/flower.
    staticGroup.updateMatrixWorld(true)
    const batches = new Map<T.Material, T.BufferGeometry[]>()
    staticGroup.traverse(o => {
      if (!(o instanceof T.Mesh) || Array.isArray(o.material)) return
      const transformed = o.geometry.clone().applyMatrix4(o.matrixWorld); resources.add(transformed); const g = transformed.index ? transformed.toNonIndexed() : transformed; g.deleteAttribute('uv'); g.deleteAttribute('color'); resources.add(g)
      if (!batches.has(o.material)) batches.set(o.material, [])
      batches.get(o.material)!.push(g)
    })
    for (const [material, geometries] of batches) {
      const g = mergeGeometries(geometries); if (!g) continue
      resources.add(g); const m = new T.Mesh(g, material); m.castShadow = true; m.receiveShadow = true; scene.add(m)
    }
    scene.remove(staticGroup)
    const resize = () => { const w = canvas.clientWidth, h = canvas.clientHeight; if (w && h) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix() } }
    observer = new ResizeObserver(resize); observer.observe(canvas); resize()
    let position: Point = { ...spawn }, boating = false, boatYaw = 0, velocity = 0, last = performance.now(), lastReport = 0, frames = 0, frameTime = 0, quality = -1
    const visited = new Set<string>(), cameraPosition = v(spawn.x, spawn.y + 1.6, spawn.z)
    const nearbyDock = () => docks.find(d => Math.hypot(position.x - d.x, position.z - d.z) < (boating ? 8 : 5.5))
    const interact = () => {
      if (input.paused) return
      const d = nearbyDock()
      if (!d) return
      if (boating) { boating = false; position = { ...d }; input.yaw = d === docks[0] ? .9 : Math.PI; velocity = 0 }
      else {
        // Board only the actual boat, which remains at the dock where it was left.
        if (Math.hypot(position.x - boat.position.x, position.z - boat.position.z) > 8) return
        boating = true; position = { x: boat.position.x, y: .2, z: boat.position.z }; boatYaw = input.yaw; velocity = 0
      }
    }
    const reset = () => { position = { ...spawn }; boating = false; velocity = 0; boat.position.set(docks[0].x + 4.6, .25, docks[0].z); boat.rotation.y = 0; input.yaw = spawn.yaw; input.pitch = 0; input.x = 0; input.z = 0; cameraPosition.set(position.x, position.y + 1.6, position.z) }
    const tick = (now: number) => {
      if (disposed) return
      const dt = Math.min(.04, (now - last) / 1000); last = now
      if (quality !== input.quality) { quality = input.quality; renderer.setPixelRatio(Math.min(devicePixelRatio, quality === 0 ? 1 : 1.5)); renderer.shadowMap.enabled = quality !== 0; resize() }
      if (!input.paused) {
        const norm = Math.max(1, Math.hypot(input.x, input.z)), x = input.x / norm, z = input.z / norm
        if (boating) {
          boatYaw -= x * dt * .9; input.yaw -= x * dt * .9
          velocity += (-z * 6.5 - velocity) * Math.min(1, dt * 2)
          const nx = position.x - Math.sin(boatYaw) * velocity * dt, nz = position.z - Math.cos(boatYaw) * velocity * dt
          if (isWater(nx, nz, 2.5)) position = { x: nx, y: .2, z: nz }; else velocity *= .2
          boat.position.set(position.x, .25 + Math.sin(now * .0016) * .035, position.z); boat.rotation.set(Math.sin(now * .0014) * .012, boatYaw, Math.sin(now * .0011) * .015)
        } else {
          const dx = (x * Math.cos(input.yaw) + z * Math.sin(input.yaw)) * dt * 3.5
          const dz = (-x * Math.sin(input.yaw) + z * Math.cos(input.yaw)) * dt * 3.5
          position = walkStep(position, dx, dz)
          boat.position.y = .25 + Math.sin(now * .0016) * .035
        }
        waterMaterial.uniforms.time.value = now * .001; waterfallMaterial.uniforms.time.value = now * .001
        wheel.rotation.z -= dt * .22
        foam.forEach((m, i) => { m.scale.y = .35 + Math.sin(now * .002 + i) * .12 })
      }
      const eye = boating ? 1.2 : 1.62
      cameraPosition.lerp(v(position.x, position.y + eye, position.z), 1 - Math.exp(-dt * 14))
      camera.position.copy(cameraPosition); camera.rotation.set(input.pitch, input.yaw, 0, 'YXZ')
      renderer.render(scene, camera)
      frames++; frameTime = Math.max(.001, (now - (lastReport || now - 16)) / 1000)
      if (now - lastReport > 180) {
        const location = placeName(position, boating)
        if (houses.some(h => h.name === location) || location === 'The open lake') visited.add(location)
        const dock = nearbyDock(), nearBoat = Math.hypot(position.x - boat.position.x, position.z - boat.position.z) < 8
        report({ position: { ...position }, boating, location, action: dock && (boating || nearBoat) ? boating ? 'Leave boat' : 'Board boat' : '', visited: [...visited], fps: Math.round(frames / frameTime) })
        lastReport = now; frames = 0; frameTime = 0
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return { dispose, interact, reset, getPosition: () => ({ ...position }) }
  } catch (e) { dispose(); throw e }
}
