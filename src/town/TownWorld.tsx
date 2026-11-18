import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

export const LOCATIONS: readonly [number, number][] = [
  [-30, 0], [-30, -30], [-12, -30], [7, -30], [30, -30], [30, -12],
  [30, 9], [30, 30], [11, 30], [-9, 30], [-30, 30], [-30, 12],
]
export type TownWorldProps = {
  destination: number
  moveNumber: number
  onArrive?: () => void
}

const palette = ['#f6d49c', '#d8ecde', '#91c8e6', '#ffac80', '#b8b5e1', '#67b8a2']
function solid(color: string, roughness = .82) {
  return new THREE.MeshStandardMaterial({ color, roughness })
}
function block(w: number, h: number, d: number, material: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}
function createTown() {
  const city = new THREE.Group()
  city.name = 'Town scene'
  const grass = solid('#93bc99')
  const asphalt = solid('#6f8496')
  const walk = solid('#d6cbb1')
  const marking = solid('#ecf1d7')
  const lawn = block(104, .1, 108, grass)
  lawn.position.y = -.15
  city.add(lawn)
  const roadPaths: [number, number, number, number][] = [
    [-30, 0, 10, 83], [30, 0, 10, 83],
    [0, -30, 83, 10], [0, 30, 83, 10],
    [0, 0, 10, 75], [0, 0, 75, 10],
  ]
  roadPaths.forEach(([x,z,w,h]) => {
    const m = block(w, .06, h, asphalt)
    m.position.set(x, -.055, z)
    city.add(m)
    const sidewalk = block(w+3,.03,h+3,walk)
    sidewalk.position.set(x,-.115,z)
    city.add(sidewalk)
  })
  for(let i=-34;i<=34;i+=9) {
    for (const x of [-30,0,30]) {
      const mark=block(.35,.02,3,marking)
      mark.position.set(x,.004,i)
      city.add(mark)
    }
    for(const z of [-30,0,30]) {
      const mark=block(3,.02,.35,marking)
      mark.position.set(i,.005,z)
      city.add(mark)
    }
  }

  // Existing Cartoon City geometry remains user-supplied. This functional preview
  // uses a low-poly town until an actual .glb is selected with Load Cartoon City.
  const placed: [number, number, number, number][] = [
    [-16,-17,10,0], [15,-16,13,2],[-15,16,12,1],[16,15,15,3],
    [-47,-45,15,3],[-44,-16,12,2],[-46,17,11,0],[-43,45,16,4],
    [44,-44,14,2],[44,-16,18,5],[44,15,13,3],[45,44,16,1],
    [-13,-45,15,4],[14,-44,12,5],[-12,44,14,0],[15,44,13,3],
  ]
  placed.forEach(([x,z,height,color],i) => {
    const g=new THREE.Group()
    g.position.set(x,0,z)
    const w=i%3===0?12:9, d=i%4===0?11:10
    const body=block(w,height,d,solid(palette[color]))
    body.position.y=height/2
    g.add(body)
    const cap=block(w+1, .6,d+1,solid(i%2===0?'#eef3e8':'#667e8f'))
    cap.position.y=height+.3
    g.add(cap)
    const glass=solid('#397fa0',.26)
    for(let floor=2;floor<height-1;floor+=3) {
      for(let col=-1;col<=1;col++) {
        const pane=block(1.8,1.5,.07,glass)
        pane.position.set(col*2.7,floor,d/2+.05)
        g.add(pane)
      }
    }
    city.add(g)
  })
  const treeTrunk=solid('#775e44'), foliage=solid('#3f997a')
  for(let i=0;i<54;i++) {
    const x=-48+(i%14)*7.3
    const z=i<27?-50:50
    const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.27,.45,2,7),treeTrunk)
    trunk.position.set(x,1,z)
    const leaves=new THREE.Mesh(new THREE.ConeGeometry(2.1,5.6,8),foliage)
    leaves.position.set(x,5,z)
    city.add(trunk,leaves)
  }
  const signColor=solid('#eff2e9'), trim=solid('#284d61')
  LOCATIONS.forEach(([x,z],index) => {
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,2.2,8),trim)
    pole.position.set(x,1.1,z)
    const top=new THREE.Mesh(new THREE.SphereGeometry(.7,12,8),signColor)
    top.position.set(x,2.5,z)
    city.add(pole,top)
    const ring=new THREE.Mesh(new THREE.TorusGeometry(1.1,.13,6,22),solid(index===0?'#f0b44a':'#f0faf6'))
    ring.position.set(x,.09,z)
    ring.rotation.x=-Math.PI/2
    city.add(ring)
  })
  return city
}

export function TownWorld({destination,moveNumber,onArrive}:TownWorldProps) {
  const mount=useRef<HTMLDivElement>(null)
  const sceneRef=useRef<THREE.Scene|null>(null)
  const rendererRef=useRef<THREE.WebGLRenderer|null>(null)
  const importedRef=useRef<THREE.Group|null>(null)
  const actorRef=useRef<THREE.Group|null>(null)
  const cameraRef=useRef<THREE.PerspectiveCamera|null>(null)
  const running=useRef(true)
  const orbit=useRef({yaw:.54,pitch:.46,distance:19})
  const route=useRef<THREE.Vector3[]>([])
  const routeTarget=useRef<number|null>(null)
  const arrivalCallback=useRef(onArrive)
  const keys=useRef(new Set<string>())
  const [modelLoaded,setModelLoaded]=useState(false)
  const [modelError,setModelError]=useState('')
  const importedUrl=useRef<string|null>(null)
  useEffect(()=>{ arrivalCallback.current=onArrive },[onArrive])
  useEffect(()=>{
    if(!mount.current)return
    const host=mount.current
    const scene=new THREE.Scene()
    scene.background=new THREE.Color('#b9e1ec')
    scene.fog=new THREE.Fog('#b9e1ec',70,185)
    const camera=new THREE.PerspectiveCamera(61,1,.1,600)
    const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'})
    renderer.outputColorSpace=THREE.SRGBColorSpace
    renderer.setPixelRatio(Math.min(2,window.devicePixelRatio||1))
    renderer.shadowMap.enabled=false
    host.append(renderer.domElement)
    scene.add(new THREE.HemisphereLight('#fffefa','#8ca4a5',2.15))
    const sun=new THREE.DirectionalLight('#fff2ce',2.7)
    sun.position.set(-27,75,45)
    scene.add(sun)
    const environment=createTown()
    scene.add(environment)
    const actor=new THREE.Group()
    actor.position.set(...[LOCATIONS[0][0],0,LOCATIONS[0][1]] as [number,number,number])
    const body=new THREE.Mesh(new THREE.CapsuleGeometry(.58,1.25,5,10),solid('#ff5b6e'))
    body.position.y=1.32
    const head=new THREE.Mesh(new THREE.SphereGeometry(.56,18,12),solid('#ffdfac'))
    head.position.y=2.53
    const nose=new THREE.Mesh(new THREE.ConeGeometry(.14,.45,8),solid('#514d50'))
    nose.position.set(0,2.58,.57);nose.rotation.x=Math.PI/2
    actor.add(body,head,nose)
    scene.add(actor)
    const resize=()=>{
      const width=host.clientWidth||window.innerWidth,height=host.clientHeight||window.innerHeight
      renderer.setSize(width,height,false)
      camera.aspect=width/Math.max(1,height)
      camera.updateProjectionMatrix()
    }
    const observer=new ResizeObserver(resize)
    observer.observe(host)
    resize()
    let dragging=false,lastX=0,lastY=0
    const down=(e:PointerEvent)=>{if(e.button!==0)return;dragging=true;lastX=e.clientX;lastY=e.clientY;renderer.domElement.setPointerCapture(e.pointerId)}
    const move=(e:PointerEvent)=>{
      if(!dragging)return
      orbit.current.yaw-=(e.clientX-lastX)*.005
      orbit.current.pitch=THREE.MathUtils.clamp(orbit.current.pitch+(e.clientY-lastY)*.004,.18,.98)
      lastX=e.clientX;lastY=e.clientY
    }
    const up=()=>{dragging=false}
    const wheel=(e:WheelEvent)=>{e.preventDefault();orbit.current.distance=THREE.MathUtils.clamp(orbit.current.distance+Math.sign(e.deltaY)*2,8,43)}
    const keyDown=(e:KeyboardEvent)=>{
      if(e.target instanceof HTMLElement&&['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))return
      if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(e.key.toLowerCase())){keys.current.add(e.key.toLowerCase());e.preventDefault()}
    }
    const keyUp=(e:KeyboardEvent)=>keys.current.delete(e.key.toLowerCase())
    renderer.domElement.addEventListener('pointerdown',down)
    renderer.domElement.addEventListener('pointermove',move)
    renderer.domElement.addEventListener('pointerup',up)
    renderer.domElement.addEventListener('pointercancel',up)
    renderer.domElement.addEventListener('wheel',wheel,{passive:false})
    window.addEventListener('keydown',keyDown)
    window.addEventListener('keyup',keyUp)
    window.addEventListener('blur',()=>keys.current.clear())
    sceneRef.current=scene
    rendererRef.current=renderer
    cameraRef.current=camera
    actorRef.current=actor
    const clock=new THREE.Clock()
    let frame=0
    running.current=true
    const tick=()=>{
      if(!running.current)return
      frame=requestAnimationFrame(tick)
      const dt=Math.min(clock.getDelta(),.06)
      if(route.current.length){
        const next=route.current[0]
        const delta=next.clone().sub(actor.position)
        const remaining=delta.length()
        const step=Math.min(remaining,5.8*dt)
        if(remaining>.003){
          actor.position.addScaledVector(delta.normalize(),step)
          actor.rotation.y=THREE.MathUtils.lerp(actor.rotation.y,Math.atan2(delta.x,delta.z),Math.min(1,dt*5))
          body.rotation.z=Math.sin(clock.elapsedTime*10)*.055
        }
        if(remaining<=step+.01){
          actor.position.copy(next)
          route.current.shift()
          if(route.current.length===0){
            body.rotation.z=0
            routeTarget.current=null
            arrivalCallback.current?.()
          }
        }
      } else {
        const dx=Number(keys.current.has('d')||keys.current.has('arrowright'))-Number(keys.current.has('a')||keys.current.has('arrowleft'))
        const dz=Number(keys.current.has('s')||keys.current.has('arrowdown'))-Number(keys.current.has('w')||keys.current.has('arrowup'))
        if(dx||dz){
          const length=Math.hypot(dx,dz)
          actor.position.x=THREE.MathUtils.clamp(actor.position.x+dx/length*7*dt,-48,48)
          actor.position.z=THREE.MathUtils.clamp(actor.position.z+dz/length*7*dt,-48,48)
          actor.rotation.y=Math.atan2(dx,dz)
          body.rotation.z=Math.sin(clock.elapsedTime*10)*.04
        } else body.rotation.z=0
      }
      const {yaw,pitch,distance}=orbit.current
      const target=actor.position.clone().add(new THREE.Vector3(0,2,0))
      const behind=new THREE.Vector3(Math.sin(yaw)*distance*Math.cos(pitch),Math.sin(pitch)*distance+5,Math.cos(yaw)*distance*Math.cos(pitch))
      const desired=target.clone().add(behind)
      camera.position.lerp(desired,Math.min(1,dt*3.5))
      camera.lookAt(target)
      renderer.render(scene,camera)
    }
    tick()
    return ()=>{
      running.current=false;cancelAnimationFrame(frame)
      observer.disconnect()
      renderer.domElement.removeEventListener('pointerdown',down)
      renderer.domElement.removeEventListener('pointermove',move)
      renderer.domElement.removeEventListener('pointerup',up)
      renderer.domElement.removeEventListener('pointercancel',up)
      renderer.domElement.removeEventListener('wheel',wheel)
      window.removeEventListener('keydown',keyDown)
      window.removeEventListener('keyup',keyUp)
      renderer.dispose()
      renderer.domElement.remove()
      importedUrl.current&&URL.revokeObjectURL(importedUrl.current)
      scene.clear()
    }
  },[])

  useEffect(()=>{
    if(!moveNumber||!actorRef.current)return
    const actor=actorRef.current
    const end=LOCATIONS[destination-1]
    if(!end)return
    routeTarget.current=destination
    // Navigate along paved street grid rather than cutting through buildings.
    // First join the nearest north/south avenue, then walk the road to the location.
    const start=actor.position.clone()
    const via= new THREE.Vector3(start.x,0,end[1])
    const finish=new THREE.Vector3(end[0],0,end[1])
    const path=[via,finish].filter((p,i)=>i===1||p.distanceTo(start)>.1)
    route.current=path.filter((p,i)=>i===0||p.distanceTo(path[i-1])>.1)
    if(!route.current.length)arrivalCallback.current?.()
  },[destination,moveNumber])

  const loadOriginal=async (file:File)=>{
    if(!file.name.toLowerCase().endsWith('.glb')){setModelError('Select an extracted .glb file, not the ZIP.');return}
    const scene=sceneRef.current
    if(!scene)return
    setModelError('Opening the original city model…')
    const url=URL.createObjectURL(file)
    try{
      const gltf=await new GLTFLoader().loadAsync(url)
      if(importedRef.current){scene.remove(importedRef.current);importedRef.current=null}
      const group=new THREE.Group()
      const original=gltf.scene
      const bounds=new THREE.Box3().setFromObject(original)
      const center=bounds.getCenter(new THREE.Vector3())
      const size=bounds.getSize(new THREE.Vector3())
      // Fit the original 120 × 150m city inside the existing 100m play space.
      const fit=92/Math.max(size.x,size.z)
      original.scale.setScalar(fit)
      original.position.set(-center.x*fit,-bounds.min.y*fit,-center.z*fit)
      group.add(original)
      group.traverse(o=>{if(o instanceof THREE.Mesh){o.frustumCulled=true;o.castShadow=false}})
      scene.add(group)
      importedRef.current=group
      setModelLoaded(true)
      setModelError('Original GLB loaded. Walk with WASD, drag to look, scroll to zoom.')
    }catch{
      setModelError('Could not open this GLB. Use Cartoon_City_Free.glb from the ZIP.')
    }finally{URL.revokeObjectURL(url)}
  }

  return <div className="town-3d-host" ref={mount}>
    <div className="town-3d-help">
      <strong>WASD / Arrows</strong> walk freely · <strong>Drag</strong> turn camera · <strong>Scroll</strong> zoom
    </div>
    <label className="town-3d-import">
      {modelLoaded?'✓ Original Cartoon City loaded':'Load original Cartoon City GLB'}
      <input type="file" accept=".glb" onChange={e=>{const file=e.currentTarget.files?.[0];if(file)void loadOriginal(file)}} />
    </label>
    {modelError&&<p className="town-3d-status">{modelError}</p>}
  </div>
}
