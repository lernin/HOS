import * as T from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { docks, houses, isWater, paths, riverCenter, spawn, terraces, tree, walkStep, placeName, type Path, type Point } from './world'

export type VillageInput = { x: number; z: number; yaw: number; pitch: number; paused: boolean; quality: number }
export type VillageState = { position: Point; boating: boolean; location: string; action: string; visited: string[]; fps: number }

export async function createVillage(canvas: HTMLCanvasElement, input: VillageInput, signal: AbortSignal, report: (s: VillageState) => void) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.35))
  renderer.outputColorSpace = T.SRGBColorSpace
  renderer.toneMapping = T.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.08
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = T.PCFSoftShadowMap

  const scene = new T.Scene()
  scene.background = new T.Color('#b8dce7')
  scene.fog = new T.Fog('#c6dce0', 105, 300)
  const camera = new T.PerspectiveCamera(65, 1, .08, 560)
  camera.rotation.order = 'YXZ'

  const sun = new T.DirectionalLight('#fff0cf', 2.8)
  sun.position.set(-55, 105, 55)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  Object.assign(sun.shadow.camera, { left: -72, right: 72, top: 72, bottom: -72, near: 10, far: 230 })
  sun.shadow.normalBias = .045
  scene.add(sun, new T.HemisphereLight('#e8f6ff', '#64724f', 2.25))

  const staticGroup = new T.Group(); scene.add(staticGroup)
  const dynamic = new T.Group(); scene.add(dynamic)
  const materials = new Map<string, T.MeshStandardMaterial>()
  const resources = new Set<T.BufferGeometry>(), extraMaterials = new Set<T.Material>(), textures = new Set<T.Texture>()
  const mat = (color: string, roughness = .86) => {
    const key = `${color}:${roughness}`
    if (!materials.has(key)) materials.set(key, new T.MeshStandardMaterial({ color, roughness }))
    return materials.get(key)!
  }
  const wood = '#684b35', paleWood = '#b98954', stone = '#7f8a83', cream = '#eadfbd', trail = '#c7b991', moss = '#708c53'
  const windowMaterial = new T.MeshStandardMaterial({ color: '#f6cf86', emissive: '#ed9d3c', emissiveIntensity: .7, roughness: .5 })
  extraMaterials.add(windowMaterial)

  const meshWith = (g: T.BufferGeometry, material: T.Material, x: number, y: number, z: number, group: T.Group = staticGroup) => {
    resources.add(g)
    const m = new T.Mesh(g, material); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; group.add(m); return m
  }
  const mesh = (g: T.BufferGeometry, color: string, x: number, y: number, z: number, group: T.Group = staticGroup) => meshWith(g, mat(color), x, y, z, group)
  const box = (x: number, y: number, z: number, w: number, h: number, d: number, color: string, group = staticGroup) => mesh(new T.BoxGeometry(w, h, d), color, x, y, z, group)
  const cylinder = (x: number, y: number, z: number, rt: number, rb: number, h: number, color: string, segments = 10, group = staticGroup) => mesh(new T.CylinderGeometry(rt, rb, h, segments), color, x, y, z, group)
  const v = (x: number, y: number, z: number) => new T.Vector3(x, y, z)
  const beam = (a: T.Vector3, b: T.Vector3, radius: number, color: string, group = staticGroup) => {
    const m = cylinder((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, radius, radius, a.distanceTo(b), color, 7, group)
    m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), b.clone().sub(a).normalize())
    return m
  }

  let seed = 7941
  const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
  const rock = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color = stone) => {
    const m = mesh(new T.DodecahedronGeometry(1, 0), color, x, y, z)
    m.scale.set(sx, sy, sz); m.rotation.set(rand() * .32, rand() * Math.PI * 2, rand() * .2)
    return m
  }

  let disposed = false, frame = 0, observer: ResizeObserver | undefined
  const dispose = () => {
    if (disposed) return
    disposed = true; cancelAnimationFrame(frame); observer?.disconnect()
    scene.traverse(o => {
      if (!(o instanceof T.Mesh)) return
      resources.add(o.geometry)
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        extraMaterials.add(m)
        for (const value of Object.values(m)) if (value instanceof T.Texture) textures.add(value)
      }
    })
    resources.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); extraMaterials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); sun.shadow.map?.dispose(); renderer.dispose()
  }
  signal.addEventListener('abort', dispose, { once: true })

  try {
    // A single softly rolling valley replaces the old giant flat slab.
    const valleyGeometry = new T.PlaneGeometry(430, 470, 28, 30)
    const vp = valleyGeometry.attributes.position
    for (let i = 0; i < vp.count; i++) {
      const x = vp.getX(i), y = vp.getY(i)
      const height = -4.4 + Math.sin(x * .027) * 1.35 + Math.sin(y * .022 + .8) * 1.1 + Math.sin((x + y) * .014) * .7
      vp.setZ(i, height)
    }
    valleyGeometry.computeVertexNormals(); valleyGeometry.rotateX(-Math.PI / 2)
    mesh(valleyGeometry, '#617d51', 0, 0, -55)

    // Organic-edged terraces: grassy tops with irregular rock skirts, never circular platform walls.
    function organicTerrace(cx: number, cy: number, cz: number, radius: number, phase: number) {
      const segments = 44
      const edge: { x: number; z: number }[] = []
      for (let i = 0; i < segments; i++) {
        const a = i / segments * Math.PI * 2
        const wobble = 1 + Math.sin(a * 3 + phase) * .045 + Math.sin(a * 7 - phase * .7) * .028
        edge.push({ x: Math.cos(a) * radius * wobble, z: Math.sin(a) * radius * wobble })
      }
      const topVertices = [cx, cy + .015, cz]
      for (const e of edge) topVertices.push(cx + e.x, cy + .015, cz + e.z)
      const topIndices: number[] = []
      for (let i = 0; i < segments; i++) topIndices.push(0, i + 1, (i + 1) % segments + 1)
      const top = new T.BufferGeometry(); top.setAttribute('position', new T.Float32BufferAttribute(topVertices, 3)); top.setIndex(topIndices); top.computeVertexNormals(); mesh(top, '#789552', 0, 0, 0)

      const skirtVertices: number[] = [], skirtIndices: number[] = []
      for (let i = 0; i < segments; i++) {
        const e = edge[i], a = i / segments * Math.PI * 2
        const outer = 1.10 + .035 * Math.sin(a * 5 + phase)
        skirtVertices.push(cx + e.x, cy, cz + e.z, cx + e.x * outer, cy - 6.4 - Math.sin(a * 4 + phase) * 1.1, cz + e.z * outer)
      }
      for (let i = 0; i < segments; i++) {
        const n = (i + 1) % segments, a = i * 2, b = n * 2
        skirtIndices.push(a, a + 1, b + 1, a, b + 1, b)
      }
      const skirt = new T.BufferGeometry(); skirt.setAttribute('position', new T.Float32BufferAttribute(skirtVertices, 3)); skirt.setIndex(skirtIndices); skirt.computeVertexNormals(); mesh(skirt, '#858e82', 0, 0, 0)
    }
    terraces.forEach((t, i) => organicTerrace(t.x, t.y, t.z, t.radius, i * 1.47 + .4))

    // Soft distant mountains are scenery only; there is no fake box-village on the horizon.
    for (let i = 0; i < 17; i++) {
      const x = (i - 8) * 34, z = -235 - rand() * 65, h = 36 + rand() * 60
      const mountain = mesh(new T.ConeGeometry(30 + rand() * 24, h, 7), i % 2 ? '#7f9da3' : '#91aaa9', x, h / 2 - 7, z)
      mountain.rotation.y = rand() * Math.PI
      if (h > 66) { const snow = mesh(new T.ConeGeometry(10, h * .22, 7), '#e4eeee', x, h * .87 - 7, z); snow.rotation.y = mountain.rotation.y }
    }

    // River and lake.
    const waterMaterial = new T.ShaderMaterial({
      uniforms: { time: { value: 0 }, deep: { value: new T.Color('#277d88') }, shallow: { value: new T.Color('#70c7bf') } },
      vertexShader: `varying vec3 world; uniform float time; void main(){vec3 p=position; p.y+=.055*sin(p.x*1.1+time)*sin(p.z*.7-time*.6); vec4 w=modelMatrix*vec4(p,1.); world=w.xyz; gl_Position=projectionMatrix*viewMatrix*w;}`,
      fragmentShader: `varying vec3 world; uniform float time; uniform vec3 deep; uniform vec3 shallow; void main(){float r=sin(world.x*1.5+world.z*.55+time*1.2)*sin(world.z*1.7-world.x*.25-time);float s=pow(max(0.,r),18.);float n=.5+.5*sin(world.x*.10+world.z*.075);vec3 c=mix(deep,shallow,n*.44+.24)+vec3(.42,.5,.45)*s*.38;gl_FragColor=vec4(c,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>}`,
      side: T.DoubleSide,
    })
    extraMaterials.add(waterMaterial)
    const riverVertices: number[] = [], riverIndices: number[] = []
    for (let i = 0; i <= 104; i++) {
      const z = 80 - i * 1.9, c = riverCenter(z), width = 9.5 + Math.sin(z * .035) * .7
      riverVertices.push(c - width, .06, z, c + width, .06, z)
      if (i < 104) { const k = i * 2; riverIndices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2) }
    }
    const riverGeometry = new T.BufferGeometry(); riverGeometry.setAttribute('position', new T.Float32BufferAttribute(riverVertices, 3)); riverGeometry.setIndex(riverIndices); riverGeometry.computeVertexNormals(); resources.add(riverGeometry)
    scene.add(new T.Mesh(riverGeometry, waterMaterial))
    const lakeGeometry = new T.CircleGeometry(46, 72); resources.add(lakeGeometry)
    const lake = new T.Mesh(lakeGeometry, waterMaterial); lake.rotation.x = -Math.PI / 2; lake.scale.x = 1.15; lake.position.set(3, .045, -130); scene.add(lake)

    // Rock-framed waterfalls with irregular silhouettes instead of rectangular PlaneGeometry sheets.
    const waterfallMaterial = new T.ShaderMaterial({
      uniforms: { time: { value: 0 } }, transparent: true, side: T.DoubleSide, depthWrite: false,
      vertexShader: `varying vec2 v; void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec2 v;uniform float time;void main(){float a=.5+.5*sin(v.x*55.+sin(v.y*9.-time*4.));float b=.5+.5*sin(v.y*66.-time*13.+v.x*11.);float edge=smoothstep(0.,.14,v.x)*smoothstep(0.,.14,1.-v.x);vec3 c=mix(vec3(.38,.74,.78),vec3(.93,.99,.96),a*.55+b*.18);gl_FragColor=vec4(c,.82*edge);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>}`,
    })
    extraMaterials.add(waterfallMaterial)
    const falls = [{ x: -12, z: -69, h: 24, w: 7 }, { x: 48, z: -62, h: 18, w: 5.5 }, { x: -53, z: -45, h: 14, w: 4.8 }]
    const foam: T.Mesh[] = []
    for (const f of falls) {
      for (let j = -3; j <= 3; j++) rock(f.x + j * 3.4, f.h / 2 - 2, f.z - 4.6, 4.2, f.h / 2 + 3.5, 6.5, '#7f8987')
      const segments = 18, verts: number[] = [], uvs: number[] = [], inds: number[] = []
      for (let i = 0; i <= segments; i++) {
        const t = i / segments, y = f.h * (1 - t) + .35
        const width = f.w * (.78 + .16 * Math.sin(t * 8 + f.x) + .07 * Math.sin(t * 21))
        const shift = Math.sin(t * 9 + f.z) * .35
        verts.push(f.x + shift - width / 2, y, f.z + 1.7, f.x + shift + width / 2, y, f.z + 1.7)
        uvs.push(0, t, 1, t)
        if (i < segments) { const k = i * 2; inds.push(k, k + 1, k + 2, k + 1, k + 3, k + 2) }
      }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(verts, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2)); g.setIndex(inds); resources.add(g)
      scene.add(new T.Mesh(g, waterfallMaterial))
      for (let i = 0; i < 8; i++) { const m = mesh(new T.SphereGeometry(.55, 7, 5), '#e7f4e9', f.x + (rand() - .5) * f.w, .45 + rand() * .7, f.z + 2 + rand() * 2, dynamic); m.scale.set(1.6, .35, 1); foam.push(m) }
    }

    // Solid continuous trail/bridge ribbons replace hundreds of visibly separate tiles.
    function deckGeometry(path: Path) {
      const pts = path.points, vertices: number[] = [], indices: number[] = []
      const thickness = path.kind === 'trail' ? .10 : .26
      for (let i = 0; i < pts.length; i++) {
        const before = pts[Math.max(0, i - 1)], after = pts[Math.min(pts.length - 1, i + 1)]
        const dx = after.x - before.x, dz = after.z - before.z, len = Math.hypot(dx, dz) || 1
        const nx = -dz / len, nz = dx / len, half = path.width / 2
        const q = pts[i], top = q.y + .015, bottom = q.y - thickness
        vertices.push(q.x + nx * half, top, q.z + nz * half, q.x - nx * half, top, q.z - nz * half, q.x + nx * half, bottom, q.z + nz * half, q.x - nx * half, bottom, q.z - nz * half)
      }
      for (let i = 0; i < pts.length - 1; i++) {
        const a = i * 4, b = (i + 1) * 4
        indices.push(a, a + 1, b + 1, a, b + 1, b)
        indices.push(a + 2, b + 2, b, a + 2, b, a)
        indices.push(a + 1, a + 3, b + 3, a + 1, b + 3, b + 1)
      }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(vertices, 3)); g.setIndex(indices); g.computeVertexNormals(); return g
    }
    function sidePoint(path: Path, index: number, side: number, rise: number) {
      const before = path.points[Math.max(0, index - 1)], after = path.points[Math.min(path.points.length - 1, index + 1)]
      const dx = after.x - before.x, dz = after.z - before.z, len = Math.hypot(dx, dz) || 1
      const q = path.points[index], nx = -dz / len, nz = dx / len
      return v(q.x + nx * path.width * .48 * side, q.y + rise, q.z + nz * path.width * .48 * side)
    }
    function addRails(path: Path) {
      if (!path.rails) return
      const step = path.points.length > 60 ? 12 : path.points.length > 18 ? 4 : 1
      const samples: number[] = []
      for (let i = 0; i < path.points.length; i += step) samples.push(i)
      if (samples.at(-1) !== path.points.length - 1) samples.push(path.points.length - 1)
      for (const side of [-1, 1]) {
        for (let s = 0; s < samples.length; s++) {
          const i = samples[s], post = sidePoint(path, i, side, .58)
          cylinder(post.x, post.y, post.z, .085, .105, 1.18, wood, 7)
          if (s > 0) beam(sidePoint(path, samples[s - 1], side, 1.08), sidePoint(path, i, side, 1.08), .06, paleWood)
        }
      }
    }
    for (const path of paths) {
      const color = path.kind === 'trail' ? trail : path.kind === 'bridge' ? '#a8794c' : paleWood
      mesh(deckGeometry(path), color, 0, 0, 0)
      addRails(path)
      if (path.kind === 'trail') {
        const step = Math.max(1, Math.floor(path.points.length / 5))
        for (let i = 1; i < path.points.length - 1; i += step) {
          const q = path.points[i]
          rock(q.x - path.width * .55, q.y + .08, q.z, .35, .25, .45, '#9a9b86')
          rock(q.x + path.width * .55, q.y + .06, q.z, .3, .22, .4, '#939886')
        }
      }
    }

    // Focal storybook willow and treehouse deck.
    cylinder(tree.x, 20, tree.z, 1.5, 2.65, 24, '#6a4b35', 12)
    for (let i = 0; i < 9; i++) {
      const a = i * Math.PI * 2 / 9
      beam(v(tree.x, 24, tree.z), v(tree.x + Math.cos(a) * (6.5 + rand() * 2), 28 + rand() * 4, tree.z + Math.sin(a) * (6.5 + rand() * 2)), .4, wood)
      beam(v(tree.x, 11, tree.z), v(tree.x + Math.cos(a) * 5.2, 9, tree.z + Math.sin(a) * 5.2), .45, wood)
    }
    const leafColors = ['#6f995b', '#7ea45d', '#5f8b58', '#8baa67']
    for (let i = 0; i < 24; i++) {
      const a = rand() * Math.PI * 2, r = 2 + rand() * 7, y = 27 + rand() * 7
      const crown = mesh(new T.IcosahedronGeometry(2.5 + rand() * 2.3, 1), leafColors[i % leafColors.length], tree.x + Math.cos(a) * r, y, tree.z + Math.sin(a) * r)
      crown.scale.y = .8 + rand() * .45
    }
    cylinder(-39, 18.78, -14, 7, 7.4, .34, paleWood, 12)
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2
      if (a < .85 || a > 5.45) continue
      const px = -39 + Math.cos(a) * 6.55, pz = -14 + Math.sin(a) * 6.55
      cylinder(px, 19.6, pz, .08, .1, 1.55, wood, 7)
    }

    function lantern(x: number, y: number, z: number) {
      cylinder(x, y + 1.0, z, .055, .075, 2, wood, 7)
      meshWith(new T.SphereGeometry(.19, 8, 6), windowMaterial, x, y + 1.95, z)
      cylinder(x, y + 2.18, z, 0, .22, .22, '#536463', 5)
    }
    function windowAt(x: number, y: number, z: number, rotationY = 0) {
      const g = new T.Group(); g.position.set(x, y, z); g.rotation.y = rotationY; staticGroup.add(g)
      box(0, 0, 0, 1.55, 1.72, .16, wood, g)
      meshWith(new T.BoxGeometry(1.28, 1.45, .18), windowMaterial, 0, 0, .045, g)
      box(0, 0, .16, .075, 1.45, .075, wood, g); box(0, 0, .16, 1.28, .075, .075, wood, g)
      box(0, -.98, .18, 1.72, .2, .42, paleWood, g)
    }
    function flowerBox(x: number, y: number, z: number) {
      box(x, y, z, 1.55, .28, .42, paleWood)
      for (let i = 0; i < 5; i++) {
        cylinder(x - .58 + i * .29, y + .27, z, .018, .025, .36, '#55753e', 4)
        mesh(new T.SphereGeometry(.09, 5, 3), ['#f1d88c', '#d9b2cb', '#ddd6a2'][i % 3], x - .58 + i * .29, y + .47, z)
      }
    }
    function gable(x: number, y: number, z: number) {
      const g = new T.BufferGeometry()
      g.setAttribute('position', new T.Float32BufferAttribute([-3.4, 0, 0, 3.4, 0, 0, 0, 2.25, 0], 3)); g.setIndex([0, 1, 2]); g.computeVertexNormals()
      mesh(g, cream, x, y, z)
    }
    function house(h: typeof houses[number]) {
      const { x, y, z } = h
      // Warm wood floor and four clean wall masses with a genuinely open front door.
      box(x, y - .07, z, 6.8, .16, 6.8, '#a77b4c')
      box(x - 3.4, y + 2.1, z, .26, 4.2, 6.8, cream); box(x + 3.4, y + 2.1, z, .26, 4.2, 6.8, cream)
      box(x, y + 2.1, z - 3.4, 6.8, 4.2, .26, cream)
      box(x - 2.25, y + 2.1, z + 3.4, 2.3, 4.2, .26, cream); box(x + 2.25, y + 2.1, z + 3.4, 2.3, 4.2, .26, cream)
      box(x, y + 3.75, z + 3.4, 2.2, .9, .26, cream)
      for (const dx of [-3.4, 3.4]) for (const dz of [-3.4, 3.4]) box(x + dx, y + 2.15, z + dz, .28, 4.35, .28, wood)
      for (const dz of [-3.4, 3.4]) box(x, y + 4.05, z + dz, 6.9, .24, .28, wood)
      // Two simple roof halves with generous overhang; no decorative roof-panel clutter.
      for (const side of [-1, 1]) { const roof = box(x + side * 1.95, y + 5.25, z, 4.65, .28, 7.7, h.roof); roof.rotation.z = side * -.52 }
      gable(x, y + 4.08, z - 3.41); gable(x, y + 4.08, z + 3.41)
      beam(v(x - 3.65, y + 4.05, z - 3.42), v(x, y + 6.35, z - 3.42), .11, wood)
      beam(v(x + 3.65, y + 4.05, z - 3.42), v(x, y + 6.35, z - 3.42), .11, wood)
      beam(v(x - 3.65, y + 4.05, z + 3.42), v(x, y + 6.35, z + 3.42), .11, wood)
      beam(v(x + 3.65, y + 4.05, z + 3.42), v(x, y + 6.35, z + 3.42), .11, wood)
      // Open doorway is framed, not filled.
      box(x - 1.12, y + 1.45, z + 3.54, .16, 2.9, .18, wood); box(x + 1.12, y + 1.45, z + 3.54, .16, 2.9, .18, wood); box(x, y + 2.88, z + 3.54, 2.4, .17, .18, wood)
      windowAt(x - 2.25, y + 2.25, z + 3.55); windowAt(x + 2.25, y + 2.25, z + 3.55)
      flowerBox(x - 2.25, y + 1.25, z + 3.72); flowerBox(x + 2.25, y + 1.25, z + 3.72)
      // Sparse furnishings leave the middle of every room obvious and walkable.
      box(x - 2.1, y + .38, z - .15, 1.45, .6, 2.25, wood); box(x - 2.1, y + .74, z - .15, 1.4, .18, 2.15, '#d8caaa')
      box(x, y + 1.12, z - 2.6, 2.2, .16, .9, paleWood); for (const side of [-1, 1]) box(x + side * .9, y + .52, z - 2.6, .11, 1.05, .65, wood)
      box(x + 2.75, y + 1.35, z - .9, .55, 2.7, 2.75, wood)
      for (let shelf = 0; shelf < 3; shelf++) box(x + 2.42, y + .38 + shelf * .74, z - .9, .12, .11, 2.6, paleWood)
      if (h.name === 'The Treetop Library') {
        for (let i = 0; i < 12; i++) box(x + 2.35, y + .68 + (i % 3) * .74, z - 1.9 + Math.floor(i / 3) * .48, .18, .38, .24, ['#718983', '#a66d50', '#c3a45d'][i % 3])
      }
      const light = new T.PointLight('#ffd998', 5.5, 8, 2); light.position.set(x, y + 3.2, z); scene.add(light)
      meshWith(new T.SphereGeometry(.2, 9, 7), windowMaterial, x, y + 3.45, z)
      // A small porch makes each entrance visually unmistakable.
      box(x, y + .02, z + 4.2, 3.2, .14, 1.6, paleWood)
      lantern(x + 2.25, y, z + 4.25)
    }
    houses.forEach(house)

    // Docks and a small rowboat.
    for (const d of docks) {
      box(d.x, d.y - .12, d.z, 5.8, .28, 8.8, paleWood)
      for (const dx of [-2.65, 2.65]) for (const dz of [-4, 4]) cylinder(d.x + dx, .7, d.z + dz, .15, .2, 3.2, wood, 7)
      lantern(d.x - 2.5, d.y, d.z + 3.6)
    }
    const boat = new T.Group(); dynamic.add(boat)
    const boatShape = new T.Shape(); boatShape.moveTo(0, -2.35); boatShape.bezierCurveTo(1.32, -1.25, 1.25, 1.25, .7, 2); boatShape.lineTo(-.7, 2); boatShape.bezierCurveTo(-1.25, 1.25, -1.32, -1.25, 0, -2.35)
    const hullGeo = new T.ExtrudeGeometry(boatShape, { depth: .4, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: .12, bevelThickness: .12 }); hullGeo.rotateX(Math.PI / 2)
    mesh(hullGeo, wood, 0, .31, 0, boat)
    for (const z of [-.85, .65, 1.55]) box(0, .55, z, 1.65, .13, .38, paleWood, boat)
    for (const side of [-1, 1]) beam(v(side * .65, .68, .2), v(side * 1.65, .34, 1.55), .05, paleWood, boat)
    boat.position.set(docks[0].x + 4.6, .25, docks[0].z)

    // Sparse flowers and lights guide the eye without covering the world in decorations.
    for (const t of terraces) for (let i = 0; i < 36; i++) {
      const a = rand() * Math.PI * 2, r = (.7 + rand() * .22) * t.radius, x = t.x + Math.cos(a) * r, z = t.z + Math.sin(a) * r
      if (houses.some(h => Math.hypot(x - h.x, z - h.z) < 6)) continue
      if (paths.some(path => path.points.some(q => Math.hypot(x - q.x, z - q.z) < 3.5))) continue
      cylinder(x, t.y + .16, z, .02, .028, .32, '#55733e', 4)
      const bloom = mesh(new T.SphereGeometry(.11, 5, 3), ['#efe0a7', '#c9aed7', '#e7c477'][i % 3], x, t.y + .36, z); bloom.scale.y = .55
    }
    const guideLights = [spawn, { x: -27, y: 4, z: 29 }, { x: -40, y: 9, z: -2 }, { x: 26, y: 8, z: -29.5 }, { x: 26, y: 1.5, z: -92 }]
    guideLights.forEach(q => lantern(q.x + 2.1, q.y, q.z))

    // Real tree assets remain as background foliage only, with clear space around paths and houses.
    const placements: { x: number; y: number; z: number; scale: number; kind: 'pine' | 'tree' }[] = []
    for (const t of terraces) for (let j = 0; j < 7; j++) {
      const a = j * Math.PI * 2 / 7, x = t.x + Math.cos(a) * (t.radius - 2.5), z = t.z + Math.sin(a) * (t.radius - 2.5)
      if (Math.hypot(x - tree.x, z - tree.z) < 11) continue
      if (paths.some(path => path.points.some(q => Math.hypot(x - q.x, z - q.z) < 4))) continue
      if (houses.some(h => Math.hypot(x - h.x, z - h.z) < 7)) continue
      placements.push({ x, y: t.y, z, scale: 6 + rand() * 4, kind: j % 3 ? 'pine' : 'tree' })
    }
    for (let j = 0; j < 82; j++) {
      const side = j % 2 ? -1 : 1, x = side * (48 + rand() * 56), z = 62 - rand() * 245
      if (isWater(x, z, -8)) continue
      placements.push({ x, y: -2.5, z, scale: 10 + rand() * 11, kind: j % 5 ? 'pine' : 'tree' })
    }
    const loader = new GLTFLoader()
    for (const kind of ['pine', 'tree'] as const) {
      const response = await fetch(`/woodland/${kind}.glb`, { signal })
      if (!response.ok) throw new Error('The trees could not load. Please try again.')
      const gltf = await loader.parseAsync(await response.arrayBuffer(), '')
      gltf.scene.traverse(o => { if (o instanceof T.Mesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) { extraMaterials.add(m); for (const val of Object.values(m)) if (val instanceof T.Texture) textures.add(val) } })
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      gltf.scene.updateMatrixWorld(true)
      const bounds = new T.Box3().setFromObject(gltf.scene), size = bounds.getSize(new T.Vector3()), center = bounds.getCenter(new T.Vector3())
      const items = placements.filter(p => p.kind === kind), matrix = new T.Matrix4(), transform = new T.Object3D()
      gltf.scene.traverse(o => {
        if (!(o instanceof T.Mesh)) return
        resources.add(o.geometry)
        const instances = new T.InstancedMesh(o.geometry, o.material, items.length)
        items.forEach((p, i) => {
          const s = p.scale / size.y
          transform.position.set(p.x - center.x * s, p.y - bounds.min.y * s, p.z - center.z * s); transform.scale.setScalar(s); transform.rotation.y = i * 2.39; transform.updateMatrix()
          matrix.multiplyMatrices(transform.matrix, o.matrixWorld); instances.setMatrixAt(i, matrix)
        })
        instances.castShadow = true; instances.receiveShadow = true; instances.computeBoundingSphere(); scene.add(instances)
      })
    }

    // Batch static architecture after layout is complete.
    staticGroup.updateMatrixWorld(true)
    const batches = new Map<T.Material, T.BufferGeometry[]>()
    staticGroup.traverse(o => {
      if (!(o instanceof T.Mesh) || Array.isArray(o.material)) return
      const transformed = o.geometry.clone().applyMatrix4(o.matrixWorld); resources.add(transformed)
      const g = transformed.index ? transformed.toNonIndexed() : transformed
      g.deleteAttribute('uv'); g.deleteAttribute('color'); resources.add(g)
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
      const d = nearbyDock(); if (!d) return
      if (boating) { boating = false; position = { ...d }; input.yaw = d === docks[0] ? .9 : Math.PI; velocity = 0 }
      else {
        if (Math.hypot(position.x - boat.position.x, position.z - boat.position.z) > 8) return
        boating = true; position = { x: boat.position.x, y: .2, z: boat.position.z }; boatYaw = input.yaw; velocity = 0
      }
    }
    const reset = () => { position = { ...spawn }; boating = false; velocity = 0; boat.position.set(docks[0].x + 4.6, .25, docks[0].z); boat.rotation.y = 0; input.yaw = spawn.yaw; input.pitch = 0; input.x = 0; input.z = 0; cameraPosition.set(position.x, position.y + 1.6, position.z) }
    const tick = (now: number) => {
      if (disposed) return
      const dt = Math.min(.04, (now - last) / 1000); last = now
      if (quality !== input.quality) { quality = input.quality; renderer.setPixelRatio(Math.min(devicePixelRatio, quality === 0 ? 1 : 1.45)); renderer.shadowMap.enabled = quality !== 0; resize() }
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
        foam.forEach((m, i) => { m.scale.y = .34 + Math.sin(now * .002 + i) * .1 })
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
