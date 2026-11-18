import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { loadPackShapes, type AssetShape } from './assetGeometry'

export const LOCATIONS = [
  { x: 0, z: 5 },
  { x: -42, z: -25 },
  { x: -20, z: -38 },
  { x: 5, z: -39 },
  { x: 37, z: -37 },
  { x: 55, z: -13 },
  { x: 55, z: 23 },
  { x: 32, z: 46 },
  { x: 0, z: 50 },
  { x: -34, z: 39 },
  { x: -53, z: 17 },
  { x: -29, z: 6 },
]
type Actor = { id: number; color: string; at: number; name: string }
type Props = {
  players: Actor[]
  active: number
  target: number
  stage: 'ready' | 'rolling' | 'walking' | 'question'
  stageTime: number
}
function shapeGeometry(shape: AssetShape) {
  const geo = new THREE.BufferGeometry()
  const positions = Float32Array.from(shape.v, v => v / 10)
  const color = new Float32Array(shape.c.length * 3)
  shape.c.forEach((index, i) => {
    const rgb = shape.p[index] ?? [220, 225, 225]
    color[i * 3] = rgb[0] / 255; color[i * 3 + 1] = rgb[1] / 255; color[i * 3 + 2] = rgb[2] / 255
  })
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(color, 3))
  geo.setIndex(shape.f)
  geo.computeVertexNormals()
  return geo
}
function box(scene: THREE.Group | THREE.Scene, size: [number, number, number], xyz: [number, number, number], color: string, bevel = 0) {
  const object = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({ color, roughness: .84, metalness: .01 }))
  object.position.set(...xyz)
  object.castShadow = bevel > 0
  object.receiveShadow = true
  scene.add(object)
  return object
}
function sign(text: string, color = '#ffffff') {
  const canvas = document.createElement('canvas')
  canvas.width = 384; canvas.height = 128
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = 'rgba(10,31,51,.88)'
  ctx.beginPath(); ctx.roundRect(3, 3, 378, 122, 22); ctx.fill()
  ctx.strokeStyle = '#a5e9db'; ctx.lineWidth = 5; ctx.stroke()
  ctx.fillStyle = color; ctx.font = '800 32px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(text, 190, 63, 354)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const result = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: true }))
  result.scale.set(15, 5, 1)
  return result
}
function tree(parent: THREE.Scene, x: number, z: number, height = 7) {
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.42, .6, height * .53, 7), new THREE.MeshStandardMaterial({ color: '#9d6648' }))
  trunk.position.set(x, height * .27, z); parent.add(trunk)
  const canopy = new THREE.Mesh(new THREE.IcosahedronGeometry(height * .31, 1), new THREE.MeshStandardMaterial({ color: '#49aa72', flatShading: true }))
  canopy.position.set(x, height * .68, z)
  parent.add(canopy)
}
function makePerson(parent: THREE.Group | THREE.Scene, color: string, label: string) {
  const actor = new THREE.Group()
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.3, 2.1, 4, 8), new THREE.MeshStandardMaterial({ color }))
  body.position.y = 3.1; body.castShadow = true; actor.add(body)
  const head = new THREE.Mesh(new THREE.SphereGeometry(1.13, 16, 12), new THREE.MeshStandardMaterial({ color: '#ffe3b6' }))
  head.position.y = 6; head.castShadow = true; actor.add(head)
  const cap = new THREE.Mesh(new THREE.SphereGeometry(1.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 1.9), new THREE.MeshStandardMaterial({ color }))
  cap.position.y = 6.3; actor.add(cap)
  const name = sign(label)
  name.position.y = 10
  name.scale.set(12, 4, 1)
  actor.add(name)
  parent.add(actor)
  return actor
}

export function TownWorld({ players, active, target, stage, stageTime }: Props) {
  const mount = useRef<HTMLDivElement>(null)
  const data = useRef({ players, active, target, stage, stageTime })
  data.current = { players, active, target, stage, stageTime }

  useEffect(() => {
    const host = mount.current
    if (!host) return
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#9ed6e8')
    scene.fog = new THREE.Fog('#9ed6e8', 150, 310)
    const camera = new THREE.PerspectiveCamera(51, 1, .2, 800)
    camera.position.set(35, 68, 137)
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.3
    renderer.shadowMap.enabled = false
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.domElement.style.display = 'block'
    host.appendChild(renderer.domElement)
    scene.add(new THREE.HemisphereLight('#ffffff', '#628c65', 2.25))
    const sun = new THREE.DirectionalLight('#fff4dc', 3.15)
    sun.position.set(-65, 140, 65); scene.add(sun)
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(450, 450), new THREE.MeshStandardMaterial({ color: '#80bc9f', roughness: 1 }))
    ground.rotation.x = -Math.PI / 2; ground.position.y = -.5; scene.add(ground)

    // Walkable continuous streets connect every destination. Buildings are outside the path.
    const ring = LOCATIONS.slice(1).map(p => new THREE.Vector3(p.x, .02, p.z))
    ring.push(ring[0].clone())
    const roadMat = new THREE.MeshStandardMaterial({ color: '#4c606b', roughness: .95 })
    const pavementMat = new THREE.MeshStandardMaterial({ color: '#d9e4df' })
    for (let i = 0; i < LOCATIONS.length - 1; i++) {
      const p = LOCATIONS[i], q = LOCATIONS[i + 1]
      const distance = Math.hypot(q.x - p.x, q.z - p.z)
      const midpoint = new THREE.Vector3((p.x + q.x) / 2, 0, (p.z + q.z) / 2)
      const angle = Math.atan2(q.z - p.z, q.x - p.x)
      const border = new THREE.Mesh(new THREE.BoxGeometry(distance + 9, .2, 12), pavementMat)
      border.rotation.y = -angle; border.position.copy(midpoint); scene.add(border)
      const road = new THREE.Mesh(new THREE.BoxGeometry(distance + 6, .24, 8), roadMat)
      road.rotation.y = -angle; road.position.copy(midpoint); road.position.y += .15; scene.add(road)
      for (let t = 5; t < distance - 3; t += 8) {
        const mark = new THREE.Mesh(new THREE.BoxGeometry(3, .04, .22), new THREE.MeshBasicMaterial({ color: '#f8ebbb' }))
        mark.position.set(p.x + (q.x - p.x) * t / distance, .31, p.z + (q.z - p.z) * t / distance)
        mark.rotation.y = -angle; scene.add(mark)
      }
    }
    // Square promenade joins the centre to the roads.
    const plaza = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, .35, 24), new THREE.MeshStandardMaterial({ color: '#e3cba9' }))
    plaza.position.set(0, .15, 5); scene.add(plaza)
    const fountain = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 1.2, 22), new THREE.MeshStandardMaterial({ color: '#e3e9f0' }))
    fountain.position.set(0, .9, 5); scene.add(fountain)
    const water = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.7, .08, 22), new THREE.MeshStandardMaterial({ color: '#2ba6c7', roughness: .2, metalness: .1 }))
    water.position.set(0, 1.56, 5); scene.add(water)

    // Immediate environment while pack geometry decodes asynchronously.
    const assets = new THREE.Group()
    scene.add(assets)
    const iconNames = ['TOWN SQUARE','BAKERY','LIBRARY','FIRE STATION','HOSPITAL','PET SHOP','SCHOOL','POLICE','CINEMA','MUSEUM','RESTAURANT','TOY SHOP']
    LOCATIONS.forEach((p, i) => {
      const board = sign((i + 1) + ' · ' + iconNames[i])
      board.position.set(p.x, 10, p.z)
      scene.add(board)
      if (i > 0) {
        const pad = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, .3, 18), new THREE.MeshStandardMaterial({ color: '#f9d57c' }))
        pad.position.set(p.x, .4, p.z); scene.add(pad)
      }
    })
    // Added foliage and furnished areas (all three-dimensional, no wallpaper).
    for (let i = 0; i < 65; i++) {
      const theta = i * 2.399
      const radius = 63 + ((i * 11) % 36)
      tree(scene, Math.cos(theta) * radius, Math.sin(theta) * radius, 5 + (i % 5))
    }
    const seats: [number, number][] = [[8, 12],[-8, 9],[9, -2],[-9, -4]]
    seats.forEach(([x,z]) => {
      box(scene,[5,.35,1.2],[x,.9,z],'#aa664b')
      box(scene,[5,1.4,.3],[x,1.6,z-0.8],'#a56850')
      for(let side of [-1,1]) box(scene,[.35,1,.35],[x+side*1.9,.4,z],'#77513c')
    })

    let disposed = false
    // Source geometry extracted from the uploaded Cartoon City GLB, not an image.
    void loadPackShapes().then(shapes => {
      if (disposed) return
      const models: [string, number, number, number][] = [
        ['Cube.165', -53, -54, -.15],['Cube.125', 12, -64, .3],['Cube.018', 52, -61, .5],
        ['Cube.165', -81, -2, .45],['Cube.125', 69, 28, -.65],['Cube.018', 5, 76, -.3],
        ['Cube.165', -57, 73, -1],['Cube.125', 82, 77, -.3],['Cube.018', -90, 69, .65],
      ]
      models.forEach(([key,x,z,yaw]) => {
        const spec = shapes[key]
        if (!spec) return
        const mesh = new THREE.Mesh(shapeGeometry(spec), new THREE.MeshStandardMaterial({ vertexColors:true, flatShading: true, side: THREE.DoubleSide, roughness: .88 }))
        mesh.position.set(x,0,z); mesh.rotation.y = yaw; assets.add(mesh)
      })
    }).catch(() => { /* Procedural structures still provide a walkable 3D town. */ })

    const people = new Map<number, THREE.Group>()
    const stageStart = { value: performance.now(), stage: 'ready', target: 1, actor: 1 }
    const destinationPos = new Map<number, THREE.Vector3>()
    let yaw = -.3, tilt = .72, zoom = 72, explore = false
    let mouseDown = false, lastX = 0, lastY = 0
    const focus = new THREE.Vector3(0,5,0)
    const keys = new Set<string>()
    const onKeyDown = (e: KeyboardEvent) => { if (['w','a','s','d','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) { keys.add(e.key); explore=true; e.preventDefault() } }
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key)
    const onDown = (e: PointerEvent) => { mouseDown=true; lastX=e.clientX;lastY=e.clientY; renderer.domElement.setPointerCapture(e.pointerId) }
    const onUp = () => { mouseDown=false }
    const onMove = (e: PointerEvent) => {
      if (!mouseDown) return
      yaw += (e.clientX - lastX) * .005
      tilt = Math.max(.18,Math.min(1.35,tilt + (e.clientY-lastY)*.004))
      lastX=e.clientX;lastY=e.clientY
    }
    const onWheel = (e: WheelEvent) => { zoom=Math.max(18,Math.min(160,zoom+e.deltaY*.045)); e.preventDefault() }
    renderer.domElement.addEventListener('pointerdown',onDown)
    renderer.domElement.addEventListener('pointerup',onUp)
    renderer.domElement.addEventListener('pointermove',onMove)
    renderer.domElement.addEventListener('wheel',onWheel,{passive:false})
    window.addEventListener('keydown',onKeyDown); window.addEventListener('keyup',onKeyUp)

    const observer = new ResizeObserver(() => {
      if(!host) return
      camera.aspect=Math.max(1,host.clientWidth)/Math.max(1,host.clientHeight)
      camera.updateProjectionMatrix()
      renderer.setSize(host.clientWidth,host.clientHeight,false)
    })
    observer.observe(host)
    let raf=0, last=performance.now()
    const tick=(now:number)=>{
      const dt=Math.min(.05,(now-last)/1000);last=now
      const current=data.current
      current.players.forEach(p=>{
        if(!people.has(p.id)) {
          const actor=makePerson(scene,p.color,p.name)
          people.set(p.id,actor)
          const pt=LOCATIONS[p.at-1] ?? LOCATIONS[0]
          actor.position.set(pt.x,0,pt.z)
          destinationPos.set(p.id,actor.position.clone())
        }
      })
      for(const [id,group] of people) if(!current.players.some(p=>p.id===id)) {scene.remove(group);people.delete(id);destinationPos.delete(id)}
      if(stageStart.stage !== current.stage || stageStart.target !== current.target || stageStart.actor !== current.active || stageStart.value !== current.stageTime) {
        stageStart.stage=current.stage
        stageStart.target=current.target
        stageStart.actor=current.active
        stageStart.value=current.stageTime
      }
      for(const p of current.players) {
        const actor=people.get(p.id)!
        const point=LOCATIONS[p.at-1] ?? LOCATIONS[0]
        if(current.stage==='rolling' && p.id===current.active) continue
        if(current.stage==='walking' && p.id===current.active) {
          const duration=6200
          const elapsed=Math.max(0,now-current.stageTime)
          const t=Math.min(1,elapsed/duration)
          let start=destinationPos.get(p.id) ?? new THREE.Vector3(point.x,0,point.z)
          if(elapsed<60) {
            start=actor.position.clone()
            destinationPos.set(p.id,start)
          }
          const x=start.x + (point.x-start.x)*t
          const z=start.z + (point.z-start.z)*t
          actor.position.set(x,Math.abs(Math.sin(t*19*Math.PI))*.25,z)
          actor.rotation.y=Math.atan2(point.x-start.x,point.z-start.z)
        } else {
          actor.position.lerp(new THREE.Vector3(point.x,0,point.z), Math.min(1,dt*3.3))
          destinationPos.set(p.id,actor.position.clone())
        }
      }
      const hero=people.get(current.active)
      if(!explore && hero && current.stage!=='ready') {
        focus.lerp(new THREE.Vector3(hero.position.x,6,hero.position.z),Math.min(1,dt*.9))
        zoom += (55-zoom)*dt*.55
      } else if(!explore && current.stage==='ready') {
        focus.lerp(new THREE.Vector3(0,12,0),Math.min(1,dt*.8))
        zoom+=(116-zoom)*dt*.8
      }
      const speed=23*dt
      if(keys.has('ArrowUp')||keys.has('w')) {focus.x-=Math.sin(yaw)*speed; focus.z-=Math.cos(yaw)*speed}
      if(keys.has('ArrowDown')||keys.has('s')) {focus.x+=Math.sin(yaw)*speed; focus.z+=Math.cos(yaw)*speed}
      if(keys.has('ArrowLeft')||keys.has('a')) {focus.x-=Math.cos(yaw)*speed; focus.z+=Math.sin(yaw)*speed}
      if(keys.has('ArrowRight')||keys.has('d')) {focus.x+=Math.cos(yaw)*speed; focus.z-=Math.sin(yaw)*speed}
      focus.x=Math.max(-110,Math.min(110,focus.x)); focus.z=Math.max(-105,Math.min(105,focus.z))
      const cos=Math.cos(tilt)
      const desired=new THREE.Vector3(focus.x + Math.sin(yaw)*zoom*cos, focus.y+Math.sin(tilt)*zoom, focus.z+Math.cos(yaw)*zoom*cos)
      camera.position.lerp(desired,Math.min(1,dt*2.6));camera.lookAt(focus)
      renderer.render(scene,camera)
      raf=requestAnimationFrame(tick)
    }
    raf=requestAnimationFrame(tick)
    return ()=>{
      disposed=true
      cancelAnimationFrame(raf)
      observer.disconnect()
      window.removeEventListener('keydown',onKeyDown)
      window.removeEventListener('keyup',onKeyUp)
      renderer.domElement.removeEventListener('pointerdown',onDown)
      renderer.domElement.removeEventListener('pointerup',onUp)
      renderer.domElement.removeEventListener('pointermove',onMove)
      renderer.domElement.removeEventListener('wheel',onWheel)
      if(renderer.domElement.parentElement===host)host.removeChild(renderer.domElement)
      scene.traverse(item=>{
        if(item instanceof THREE.Mesh) {
          item.geometry.dispose()
          const mats=Array.isArray(item.material)?item.material:[item.material]
          mats.forEach(m=>m.dispose())
        }
        if(item instanceof THREE.Sprite){
          item.material.map?.dispose();item.material.dispose()
        }
      })
      renderer.dispose()
    }
  }, [])
  return <div className="town-world" ref={mount} aria-label="Interactive 3D town. Drag to rotate the camera, scroll to zoom, or press WASD to explore."/>
}
