import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import './marble-sanctuary.css'

type PointKind = 'npc' | 'object'
type Point = { id: string; kind: PointKind; name: string; x: number; y: number; z: number; question: string; answer: string }
type Runtime = {
  load: (file: File) => Promise<void>
  sync: (points: Point[]) => void
  groundAt: (x: number, y: number) => [number, number, number] | null
  dispose: () => void
}
const STORAGE = 'lab-marble-sanctuary-points-v1'
const starter: Point[] = [
  { id: 'mina', kind: 'npc', name: 'Mina, the garden guide', x: 0, y: 0, z: -3, question: 'What is one thing that helps a garden grow?', answer: 'water' },
]
function readPoints(): Point[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE) || 'null') as unknown
    if (Array.isArray(raw) && raw.every(p => p && typeof p === 'object' && typeof p.id === 'string')) return raw as Point[]
  } catch { /* The local experiment still works without saved settings. */ }
  return starter
}
function glowTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createRadialGradient(64, 64, 2, 64, 64, 62)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(.2, 'rgba(255,249,221,.95)')
  gradient.addColorStop(.47, 'rgba(245,236,170,.35)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(canvas)
}

export function MarbleSanctuary({ onBack }: { onBack: () => void }) {
  const host = useRef<HTMLDivElement>(null)
  const runtime = useRef<Runtime | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const look = useRef({ yaw: 0, pitch: 0 })
  const movement = useRef({ x: 0, z: 0 })
  const playing = useRef(false)
  const placement = useRef<PointKind | null>(null)
  const pointsRef = useRef<Point[]>(starter)
  const nearRef = useRef<string | null>(null)
  const [points, setPoints] = useState<Point[]>(readPoints)
  const [world, setWorld] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [near, setNear] = useState<string | null>(null)
  const [edit, setEdit] = useState(false)
  const [place, setPlace] = useState<PointKind | null>(null)
  const [active, setActive] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [feedback, setFeedback] = useState('')
  const [walking, setWalking] = useState(false)
  pointsRef.current = points
  placement.current = place
  const current = points.find(p => p.id === active) || null
  const nearby = points.find(p => p.id === near) || null

  useEffect(() => {
    try { localStorage.setItem(STORAGE, JSON.stringify(points)) } catch { /* Local-only data. */ }
    runtime.current?.sync(points)
  }, [points])

  useEffect(() => {
    const parent = host.current
    if (!parent) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    } catch {
      setError('This device cannot open WebGL. Try an updated Chrome browser.')
      return
    }
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#dcece1')
    scene.fog = new THREE.FogExp2('#dcece1', .006)
    const camera = new THREE.PerspectiveCamera(66, 1, .08, 450)
    camera.rotation.order = 'YXZ'
    camera.position.set(0, 1.65, 5.5)
    scene.add(new THREE.HemisphereLight(0xe6f5ff, 0x687a55, 2.4))
    const sunlight = new THREE.DirectionalLight(0xffe8ba, 2.25)
    sunlight.position.set(-16, 33, -7)
    scene.add(sunlight)
    const stage = new THREE.Group()
    scene.add(stage)
    const lights = new THREE.Group()
    scene.add(lights)
    const raycaster = new THREE.Raycaster()
    const downward = new THREE.Vector3(0, -1, 0)
    const glow = glowTexture()
    const spriteMaterial = new THREE.SpriteMaterial({ map: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.13
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
    parent.appendChild(renderer.domElement)
    const canvas = renderer.domElement
    canvas.setAttribute('aria-label', 'Walkable 3D sanctuary. Drag to look around.')
    canvas.style.touchAction = 'none'
    const bounds = new THREE.Box3()
    let hasModel = false
    let animation = 0
    let last = performance.now()
    let pointer: { id: number; x: number; y: number } | null = null
    const keys = new Set<string>()
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    const resize = () => {
      const width = Math.max(1, parent.clientWidth), height = Math.max(1, parent.clientHeight)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(parent)
    resize()

    function floorHeight(x: number, z: number, currentY: number) {
      if (!hasModel) return 0
      raycaster.set(new THREE.Vector3(x, currentY + 2.4, z), downward)
      raycaster.far = 5
      const hits = raycaster.intersectObjects(stage.children, true)
      for (const hit of hits) {
        const normal = hit.face?.normal.clone().transformDirection(hit.object.matrixWorld)
        if (normal && normal.y > .5 && Math.abs(hit.point.y - currentY) < 1.05) return hit.point.y
      }
      return null
    }
    function sync(all: Point[]) {
      lights.clear()
      for (const item of all) {
        const icon = new THREE.Sprite(spriteMaterial)
        icon.position.set(item.x, item.y + 1.5, item.z)
        icon.scale.set(1.65, 1.65, 1)
        icon.userData.pointId = item.id
        lights.add(icon)
      }
    }
    function groundAt(clientX: number, clientY: number): [number, number, number] | null {
      if (!hasModel) return null
      const rect = canvas.getBoundingClientRect()
      const mouse = new THREE.Vector2(2 * (clientX - rect.left) / rect.width - 1, 1 - 2 * (clientY - rect.top) / rect.height)
      raycaster.setFromCamera(mouse, camera)
      const hits = raycaster.intersectObjects(stage.children, true)
      for (const hit of hits) {
        const normal = hit.face?.normal.clone().transformDirection(hit.object.matrixWorld)
        if (normal && normal.y > .58) return [hit.point.x, hit.point.y, hit.point.z]
      }
      const point = new THREE.Vector3()
      return raycaster.ray.intersectPlane(ground, point) ? [point.x, 0, point.z] : null
    }
    async function load(file: File) {
      if (!file.name.toLowerCase().endsWith('.glb')) throw new Error('Use a textured GLB export. SPZ/splats need a separate Spark renderer.')
      if (file.size > 180 * 1024 * 1024) throw new Error('This GLB exceeds the 180 MB phone-test limit. Export a smaller mesh.')
      const url = URL.createObjectURL(file)
      try {
        const gltf = await new GLTFLoader().loadAsync(url)
        const box = new THREE.Box3().setFromObject(gltf.scene)
        if (box.isEmpty()) throw new Error('This GLB contains no visible geometry.')
        const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3())
        const factor = Math.min(1, 80 / Math.max(size.x, size.z, 1))
        stage.clear()
        gltf.scene.position.set(-center.x * factor, -box.min.y * factor, -center.z * factor)
        gltf.scene.scale.setScalar(factor)
        gltf.scene.traverse(node => {
          if (node instanceof THREE.Mesh) {
            node.frustumCulled = true
            node.castShadow = false
            node.receiveShadow = false
          }
        })
        stage.add(gltf.scene)
        stage.updateMatrixWorld(true)
        bounds.setFromObject(stage)
        hasModel = true
        look.current = { yaw: 0, pitch: 0 }
        camera.position.set(0, 1.65, Math.min(5.5, size.z * factor * .18))
        const floor = floorHeight(camera.position.x, camera.position.z, 0)
        camera.position.y = (floor ?? 0) + 1.65
        sync(pointsRef.current)
      } finally { URL.revokeObjectURL(url) }
    }
    const key = (event: KeyboardEvent) => {
      const k = event.key.toLowerCase()
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k) && playing.current) {
        event.preventDefault()
        if (event.type === 'keydown') keys.add(k)
        else keys.delete(k)
      }
      if (event.type === 'keydown' && k === 'e' && playing.current) {
        const id = nearRef.current
        if (id) { setReply(''); setFeedback(''); setActive(id); playing.current = false; setWalking(false) }
      }
    }
    const onDown = (event: PointerEvent) => {
      if (!playing.current && !placement.current) return
      if (placement.current) {
        const point = groundAt(event.clientX, event.clientY)
        if (point) {
          const kind = placement.current
          const id = String(Date.now())
          setPoints(all => [...all, { id, kind, name: kind === 'npc' ? 'New friend' : 'Discovery object', x: point[0], y: point[1], z: point[2], question: 'What did you discover?', answer: 'wonder' }])
          setActive(id); setEdit(true); setPlace(null)
        }
        return
      }
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY }
      canvas.setPointerCapture(event.pointerId)
    }
    const onMove = (event: PointerEvent) => {
      if (!pointer || pointer.id !== event.pointerId || !playing.current) return
      const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y
      pointer.x = event.clientX
      pointer.y = event.clientY
      look.current.yaw -= dx * .004
      look.current.pitch = THREE.MathUtils.clamp(look.current.pitch - dy * .0036, -1.1, 1.1)
    }
    const onUp = (event: PointerEvent) => {
      if (pointer?.id === event.pointerId) pointer = null
    }
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)
    window.addEventListener('keydown', key)
    window.addEventListener('keyup', key)
    const frame = (now: number) => {
      animation = requestAnimationFrame(frame)
      const dt = Math.min(.04, (now - last) / 1000)
      last = now
      camera.rotation.set(look.current.pitch, look.current.yaw, 0)
      if (playing.current && !document.hidden && hasModel) {
        const strafe = movement.current.x + Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'))
        const forward = -movement.current.z + Number(keys.has('w') || keys.has('arrowup')) - Number(keys.has('s') || keys.has('arrowdown'))
        const length = Math.hypot(strafe, forward)
        if (length > .1) {
          const speed = 3.2 * dt / Math.max(1, length)
          const yaw = look.current.yaw
          const nextX = camera.position.x + (Math.cos(yaw) * strafe - Math.sin(yaw) * forward) * speed
          const nextZ = camera.position.z + (-Math.sin(yaw) * strafe - Math.cos(yaw) * forward) * speed
          const candidate = new THREE.Vector3(nextX, camera.position.y, nextZ)
          if (bounds.containsPoint(new THREE.Vector3(candidate.x, bounds.min.y + .1, candidate.z))) {
            const currentFloor = camera.position.y - 1.65
            const nextFloor = floorHeight(nextX, nextZ, currentFloor)
            if (nextFloor !== null) camera.position.set(nextX, nextFloor + 1.65, nextZ)
          }
        }
        let closest: string | null = null, distance = 3.1
        for (const p of pointsRef.current) {
          const d = Math.hypot(p.x - camera.position.x, p.z - camera.position.z)
          if (d < distance) { closest = p.id; distance = d }
        }
        if (closest !== nearRef.current) { nearRef.current = closest; setNear(closest) }
      }
      for (const sprite of lights.children) sprite.position.y += Math.sin(now * .0014 + sprite.position.x) * .0008
      renderer.render(scene, camera)
    }
    animation = requestAnimationFrame(frame)
    runtime.current = { load, sync, groundAt, dispose: () => {
      cancelAnimationFrame(animation)
      observer.disconnect()
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      window.removeEventListener('keydown', key)
      window.removeEventListener('keyup', key)
      glow.dispose()
      spriteMaterial.dispose()
      renderer.dispose()
      canvas.remove()
    } }
    sync(pointsRef.current)
    return () => { runtime.current?.dispose(); runtime.current = null }
  }, [])

  async function loadFile(file?: File) {
    if (!file || !runtime.current) return
    setBusy(true); setError(''); setWalking(false); playing.current = false
    try { await runtime.current.load(file); setWorld(file.name); setEdit(false) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'World could not be loaded.') }
    finally { setBusy(false); if (fileInput.current) fileInput.current.value = '' }
  }
  function begin() { if (!world) return; setWalking(true); setEdit(false); setActive(null); playing.current = true }
  function pause() { playing.current = false; movement.current = { x: 0, z: 0 }; setWalking(false) }
  function updatePoint(patch: Partial<Point>) {
    if (active) setPoints(all => all.map(p => p.id === active ? { ...p, ...patch } : p))
  }
  function interact() { if (!nearby) return; pause(); setActive(nearby.id); setFeedback(''); setReply('') }
  function check() {
    if (!current || !reply.trim()) return
    const exact = reply.trim().toLowerCase() === current.answer.trim().toLowerCase()
    setFeedback(exact ? 'Correct. Thank you for helping!' : 'Good try. Talk about it with your teacher.')
  }
  return <main className="ms" aria-label="Enchanted Matrix Sanctuary Lab experiment">
    <div className="ms-canvas" ref={host} />
    <div className="ms-sky" aria-hidden="true" />
    <header className="ms-header">
      <button onClick={onBack} aria-label="Back to the Lab">← Lab</button>
      <div><span>THE LAB · PRIVATE EXPERIMENT</span><strong>Enchanted Matrix Sanctuary</strong></div>
      <button onClick={() => { pause(); setEdit(v => !v) }} disabled={!world}> {edit ? 'Close editor' : 'Create'} </button>
    </header>
    {!world && <section className="ms-welcome">
      <div className="ms-kicker">A PLACE TO WANDER, WONDER & LEARN</div>
      <h1>Bring a beautiful world to life.</h1>
      <p>Import a high-resolution, textured <strong>GLB</strong> world from World Labs Marble or a professional 3D artist. Explore it freely, then add friends and objects with learning interactions.</p>
      <label className="ms-primary">{busy ? 'Loading world…' : 'Choose a 3D world'}<input ref={fileInput} type="file" accept=".glb,model/gltf-binary" disabled={busy} onChange={e => void loadFile(e.target.files?.[0])} /></label>
      <a href="https://marble.worldlabs.ai/" target="_blank" rel="noopener noreferrer">Create or export in Marble ↗</a>
      <small>Visual quality comes from the imported asset. This experiment does not generate or upload a world, and it does not use learner data.</small>
    </section>}
    {!!world && <>
      <div className="ms-topnote"><span>{world}</span><button onClick={() => { pause(); fileInput.current?.click() }}>Change world</button><input ref={fileInput} hidden type="file" accept=".glb,model/gltf-binary" onChange={e => void loadFile(e.target.files?.[0])}/></div>
      {!walking && !edit && !active && <section className="ms-start"><h2>Welcome to the sanctuary</h2><p>Walk anywhere you like. Find a glowing friend or create something new.</p><button className="ms-primary" onClick={begin}>Enter the world</button><button onClick={() => setEdit(true)}>Create interactions</button></section>}
      {walking && !edit && <div className="ms-controls">
        <div className="ms-help">WASD · drag to look · E to talk<br/>On phone, drag on the right and move with the left pad.</div>
        {nearby && <button className="ms-talk" onClick={interact}>Talk to {nearby.name} ✦</button>}
        <div className="ms-pad" aria-label="Movement joystick" onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); movement.current = { x: 0, z: -1 } }} onPointerMove={e => { if (!e.currentTarget.hasPointerCapture(e.pointerId)) return; const r = e.currentTarget.getBoundingClientRect(); movement.current = { x: THREE.MathUtils.clamp((e.clientX - r.left - r.width / 2) / (r.width / 2), -1, 1), z: THREE.MathUtils.clamp((e.clientY - r.top - r.height / 2) / (r.height / 2), -1, 1) } }} onPointerUp={() => { movement.current = { x: 0, z: 0 } }} onPointerCancel={() => { movement.current = { x: 0, z: 0 } }}><span>✦</span></div>
        <button className="ms-pause" onClick={pause}>Pause</button>
      </div>}
      {edit && <aside className="ms-editor"><h2>Make this place yours</h2><p>Choose what to place, then tap the ground in the 3D world.</p>
        <div className="ms-row"><button onClick={() => setPlace('npc')} aria-pressed={place === 'npc'}>Place friend</button><button onClick={() => setPlace('object')} aria-pressed={place === 'object'}>Place object</button></div>
        {place && <p className="ms-hint">Now tap a walkable spot to place your {place === 'npc' ? 'friend' : 'object'}.</p>}
        <h3>Interactions</h3>
        <div className="ms-entries">{points.map(p => <button key={p.id} onClick={() => { setActive(p.id); setPlace(null) }} className={active === p.id ? 'chosen' : ''}>{p.kind === 'npc' ? '◉ ' : '✧ '}{p.name}</button>)}</div>
        {current && <div className="ms-fields"><label>Name<input maxLength={70} value={current.name} onChange={e => updatePoint({ name: e.target.value })}/></label><label>Question / invitation<textarea rows={2} value={current.question} onChange={e => updatePoint({ question: e.target.value })}/></label><label>Sample exact answer (prototype only)<input value={current.answer} onChange={e => updatePoint({ answer: e.target.value })}/></label><button onClick={() => { setPoints(all => all.filter(p => p.id !== current.id)); setActive(null) }}>Remove this interaction</button></div>}
        <p className="ms-notice">Local editing only. This prototype does not write Historionyms or sync children's responses to Procedia.</p>
        <button className="ms-primary" onClick={begin}>Play this world</button>
      </aside>}
      {active && !edit && <section className="ms-dialog"><span>{current?.kind === 'npc' ? 'A FRIEND IN THE SANCTUARY' : 'A MOMENT OF DISCOVERY'}</span><h2>{current?.name}</h2><p>{current?.question}</p><label>Your answer<input autoFocus value={reply} onChange={e => setReply(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') check() }}/></label><button className="ms-primary" onClick={check}>Answer</button>{feedback && <p>{feedback}</p>}<button onClick={() => { setActive(null); begin() }}>Keep exploring</button></section>}
    </>}
    {error && <div role="alert" className="ms-error">{error}<button onClick={() => setError('')}>Dismiss</button></div>}
  </main>
}
