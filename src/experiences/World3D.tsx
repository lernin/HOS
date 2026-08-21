import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import './world3d.css'

type World3DProps = { onExit: () => void }
type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: 'landscape') => Promise<void>
  unlock?: () => void
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export function World3D({ onExit }: World3DProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const moveRef = useRef({ x: 0, y: 0 })
  const movePointerRef = useRef<number | null>(null)
  const lookPointerRef = useRef<number | null>(null)
  const lookStartRef = useRef({ x: 0, y: 0 })
  const knobRef = useRef<HTMLDivElement>(null)
  const [showHelp, setShowHelp] = useState(true)

  useEffect(() => {
    const timer = window.setTimeout(() => setShowHelp(false), 4200)
    const orientation = screen.orientation as LockableOrientation
    void orientation.lock?.('landscape').catch(() => undefined)
    return () => {
      window.clearTimeout(timer)
      orientation.unlock?.()
    }
  }, [])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x82b8d9)
    scene.fog = new THREE.FogExp2(0x9bc1d5, 0.012)

    const camera = new THREE.PerspectiveCamera(68, 1, 0.1, 260)
    camera.position.set(0, 1.7, 15)
    camera.rotation.order = 'YXZ'

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.outputColorSpace = THREE.SRGBColorSpace
    mount.appendChild(renderer.domElement)

    scene.add(new THREE.HemisphereLight(0xdff4ff, 0x51653a, 2.2))
    const sun = new THREE.DirectionalLight(0xfff1cf, 2.5)
    sun.position.set(-28, 42, 18)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    sun.shadow.camera.left = -55
    sun.shadow.camera.right = 55
    sun.shadow.camera.top = 55
    sun.shadow.camera.bottom = -55
    scene.add(sun)

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(180, 180),
      new THREE.MeshStandardMaterial({ color: 0x739759, roughness: 1 }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    scene.add(ground)

    const path = new THREE.Mesh(
      new THREE.PlaneGeometry(7, 120),
      new THREE.MeshStandardMaterial({ color: 0xb9a47f, roughness: 1 }),
    )
    path.rotation.x = -Math.PI / 2
    path.position.set(0, 0.012, -18)
    path.receiveShadow = true
    scene.add(path)

    const plaza = new THREE.Mesh(
      new THREE.CircleGeometry(15, 48),
      new THREE.MeshStandardMaterial({ color: 0xc8b995, roughness: 1 }),
    )
    plaza.rotation.x = -Math.PI / 2
    plaza.position.set(0, 0.018, -37)
    plaza.receiveShadow = true
    scene.add(plaza)

    const trunkGeometry = new THREE.CylinderGeometry(0.32, 0.45, 3.2, 8)
    const crownGeometry = new THREE.ConeGeometry(2.05, 5.4, 9)
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x725038, roughness: 1 })
    const crownMaterials = [0x315f3d, 0x3f7148, 0x557d42].map(color => new THREE.MeshStandardMaterial({ color, roughness: 1 }))
    const treePositions: Array<[number, number]> = [
      [-10, 7], [11, 4], [-15, -5], [14, -9], [-12, -18], [13, -22], [-19, -31], [20, -35],
      [-25, -48], [27, -51], [-15, -60], [17, -67], [-31, -16], [32, -8], [-35, -43], [36, -56],
    ]
    treePositions.forEach(([x, z], index) => {
      const tree = new THREE.Group()
      const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial)
      trunk.position.y = 1.6
      trunk.castShadow = true
      const crown = new THREE.Mesh(crownGeometry, crownMaterials[index % crownMaterials.length])
      crown.position.y = 5.25
      crown.castShadow = true
      tree.add(trunk, crown)
      tree.position.set(x, 0, z)
      const scale = 0.82 + (index % 4) * 0.08
      tree.scale.setScalar(scale)
      scene.add(tree)
    })

    const buildingMaterial = new THREE.MeshStandardMaterial({ color: 0xd9d1bd, roughness: 0.92 })
    const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x81594c, roughness: 0.9 })
    const addBuilding = (x: number, z: number, width: number, depth: number, height: number) => {
      const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), buildingMaterial)
      body.position.set(x, height / 2, z)
      body.castShadow = true
      body.receiveShadow = true
      scene.add(body)
      const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(width, depth) * 0.72, 2.2, 4), roofMaterial)
      roof.position.set(x, height + 1.05, z)
      roof.rotation.y = Math.PI / 4
      roof.castShadow = true
      scene.add(roof)
    }
    addBuilding(-18, -40, 9, 11, 6.5)
    addBuilding(18, -43, 10, 9, 8)
    addBuilding(-23, -67, 12, 10, 7.5)

    const monument = new THREE.Group()
    const stone = new THREE.MeshStandardMaterial({ color: 0x6f7b83, roughness: 0.78, metalness: 0.08 })
    for (let index = 0; index < 7; index += 1) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 7 + (index % 2) * 1.4, 1.2), stone)
      const angle = (index / 7) * Math.PI * 2
      pillar.position.set(Math.cos(angle) * 8, pillar.geometry.parameters.height / 2, -37 + Math.sin(angle) * 8)
      pillar.rotation.y = -angle
      pillar.castShadow = true
      monument.add(pillar)
    }
    scene.add(monument)

    const cloudMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.72 })
    for (let index = 0; index < 9; index += 1) {
      const cloud = new THREE.Mesh(new THREE.SphereGeometry(3 + (index % 3), 12, 8), cloudMaterial)
      cloud.scale.y = 0.42
      cloud.position.set(-45 + index * 12, 20 + (index % 2) * 4, -45 - (index % 4) * 16)
      scene.add(cloud)
    }

    const keys = new Set<string>()
    const keyDown = (event: KeyboardEvent) => keys.add(event.code)
    const keyUp = (event: KeyboardEvent) => keys.delete(event.code)
    window.addEventListener('keydown', keyDown)
    window.addEventListener('keyup', keyUp)

    let yaw = 0
    let pitch = -0.04
    const clock = new THREE.Clock()
    const forward = new THREE.Vector3()
    const side = new THREE.Vector3()

    const resize = () => {
      const width = Math.max(1, mount.clientWidth)
      const height = Math.max(1, mount.clientHeight)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(mount)
    resize()

    const render = () => {
      const dt = Math.min(clock.getDelta(), 0.05)
      const touch = moveRef.current
      const moveForward = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - touch.y
      const moveSide = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + touch.x
      const length = Math.hypot(moveForward, moveSide)
      if (length > 0.02) {
        forward.set(-Math.sin(yaw), 0, -Math.cos(yaw))
        side.set(Math.cos(yaw), 0, -Math.sin(yaw))
        const scale = (7.3 * dt) / Math.max(1, length)
        camera.position.addScaledVector(forward, moveForward * scale)
        camera.position.addScaledVector(side, moveSide * scale)
        camera.position.x = clamp(camera.position.x, -72, 72)
        camera.position.z = clamp(camera.position.z, -82, 72)
      }
      camera.position.y = 1.7
      camera.rotation.y = yaw
      camera.rotation.x = pitch
      renderer.render(scene, camera)
    }
    renderer.setAnimationLoop(render)

    const applyLook = (dx: number, dy: number) => {
      yaw -= dx * 0.0042
      pitch = clamp(pitch - dy * 0.0034, -1.12, 1.05)
    }
    mount.dataset.ready = 'true'
    ;(mount as HTMLDivElement & { applyLook?: (dx: number, dy: number) => void }).applyLook = applyLook

    return () => {
      renderer.setAnimationLoop(null)
      observer.disconnect()
      window.removeEventListener('keydown', keyDown)
      window.removeEventListener('keyup', keyUp)
      scene.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return
        object.geometry.dispose()
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach(material => material.dispose())
      })
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  const updateMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = clamp((event.clientX - (rect.left + rect.width / 2)) / (rect.width * 0.34), -1, 1)
    const y = clamp((event.clientY - (rect.top + rect.height / 2)) / (rect.height * 0.34), -1, 1)
    moveRef.current = { x, y }
    if (knobRef.current) knobRef.current.style.transform = `translate(${x * 30}px, ${y * 30}px)`
  }

  const stopMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (movePointerRef.current !== event.pointerId) return
    movePointerRef.current = null
    moveRef.current = { x: 0, y: 0 }
    if (knobRef.current) knobRef.current.style.transform = 'translate(0, 0)'
  }

  const lookMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (lookPointerRef.current !== event.pointerId || !mountRef.current) return
    const dx = event.clientX - lookStartRef.current.x
    const dy = event.clientY - lookStartRef.current.y
    lookStartRef.current = { x: event.clientX, y: event.clientY }
    const target = mountRef.current as HTMLDivElement & { applyLook?: (x: number, y: number) => void }
    target.applyLook?.(dx, dy)
  }

  return (
    <main className="world3d-shell">
      <div className="world3d-canvas" ref={mountRef} />
      <div className="world3d-shade" />
      <button className="world3d-hub" onClick={onExit}>← Hub</button>
      <div className="world3d-title"><strong>3D Environment</strong><span>Explore freely</span></div>
      <div className="world3d-crosshair" aria-hidden="true" />
      {showHelp && <div className="world3d-help"><strong>Left thumb: move</strong><span>Right thumb: look around</span></div>}
      <div
        className="world3d-joystick"
        aria-label="Movement control"
        onPointerDown={event => {
          movePointerRef.current = event.pointerId
          event.currentTarget.setPointerCapture(event.pointerId)
          updateMove(event)
          setShowHelp(false)
        }}
        onPointerMove={event => { if (movePointerRef.current === event.pointerId) updateMove(event) }}
        onPointerUp={stopMove}
        onPointerCancel={stopMove}
      >
        <div className="world3d-knob" ref={knobRef} />
      </div>
      <div
        className="world3d-look-zone"
        aria-label="Look control"
        onPointerDown={event => {
          lookPointerRef.current = event.pointerId
          lookStartRef.current = { x: event.clientX, y: event.clientY }
          event.currentTarget.setPointerCapture(event.pointerId)
          setShowHelp(false)
        }}
        onPointerMove={lookMove}
        onPointerUp={event => { if (lookPointerRef.current === event.pointerId) lookPointerRef.current = null }}
        onPointerCancel={event => { if (lookPointerRef.current === event.pointerId) lookPointerRef.current = null }}
      />
      <div className="world3d-rotate"><strong>Rotate your phone</strong><span>This experience uses landscape mode.</span></div>
    </main>
  )
}
