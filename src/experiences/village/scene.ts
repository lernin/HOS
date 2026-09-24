import * as T from 'three'
import { boatStart, docks, houses, isWater, spawn, walkStep, placeName, waterHeight, waterLevel, type Point } from './world'
import { assistedWalkStep, type PathGuideState } from './locomotion'
import { createKit, vec } from './kit'
import { addArchitecture } from './architecture'
import { addLandscape, addWater } from './landscape'
import { addPlanting } from './planting'
export type VillageInput = { x: number; z: number; yaw: number; pitch: number; paused: boolean; quality: number }
export type VillageState = { position: Point; boating: boolean; location: string; action: string; visited: string[]; fps: number }
export type VillageView = { position: Point; target: Point }

export async function createVillage(canvas: HTMLCanvasElement, input: VillageInput, signal: AbortSignal, report: (s: VillageState) => void) {
  const renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'})
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.35));renderer.outputColorSpace=T.SRGBColorSpace
  renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true
  const scene=new T.Scene();scene.background=new T.Color('#b4dbe8');scene.fog=new T.Fog('#bad9dd',43,170)
  const camera=new T.PerspectiveCamera(62,1,.08,300);camera.rotation.order='YXZ'
  const sun=new T.DirectionalLight('#ffedcb',2.9);sun.position.set(-30,60,32);sun.castShadow=true
  sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-32,right:32,top:32,bottom:-32,near:1,far:135})
  sun.shadow.bias=-.00016;sun.shadow.normalBias=.035
  scene.add(sun,new T.HemisphereLight('#d9eeff','#7b8250',1.55))
  const kit=createKit(scene),resources=new Set<T.BufferGeometry>(),materials=new Set<T.Material>(),textures=new Set<T.Texture>()
  let disposed=false,frame=0,renderDirty=true,observer:ResizeObserver|undefined
  function track(root:T.Object3D){root.traverse(o=>{if(!(o instanceof T.Mesh))return;resources.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const val of Object.values(m))if(val instanceof T.Texture)textures.add(val)}})}
  const dispose=()=>{if(disposed)return;disposed=true;cancelAnimationFrame(frame);observer?.disconnect();track(scene);resources.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());kit.dispose();sun.shadow.map?.dispose();renderer.dispose()}
  signal.addEventListener('abort',dispose,{once:true})
  try{
    addLandscape(scene,kit)
    const waterMaterial=addWater(scene)
    addArchitecture(kit)
    await addPlanting(scene,kit,signal,track)
    if(signal.aborted)throw new DOMException('Aborted','AbortError')
    const boat=new T.Group();scene.add(boat)
    const shape=new T.Shape();shape.moveTo(0,-1.45);shape.bezierCurveTo(.85,-.9,.8,.85,.45,1.25);shape.lineTo(-.45,1.25);shape.bezierCurveTo(-.8,.85,-.85,-.9,0,-1.45)
    const hull=new T.ExtrudeGeometry(shape,{depth:.24,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.07,bevelThickness:.08});hull.rotateX(Math.PI/2)
    kit.add(hull,'#845730',0,.24,0,boat)
    for(const z of [-.7,.4,.92])kit.box(0,.37,z,1.05,.1,.27,'#be955e',boat)
    const rim=[vec(0,.42,-1.45),vec(.69,.38,-.5),vec(.64,.38,.7),vec(.4,.38,1.23),vec(-.4,.38,1.23),vec(-.64,.38,.7),vec(-.69,.38,-.5),vec(0,.42,-1.45)]
    kit.beam(rim,.065,'#ba915b',boat)
    boat.position.set(boatStart.x,boatStart.y,boatStart.z)
    kit.finish()
    for(const h of houses){const glow=new T.PointLight('#ffcd83',3.5,6.2,2);glow.position.set(h.x,h.y+2.65,h.z);scene.add(glow)}
    const v=vec
    const resize = () => { const w = canvas.clientWidth, h = canvas.clientHeight; if (w && h) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); renderDirty=true } }
    observer = new ResizeObserver(resize); observer.observe(canvas); resize()

    let position: Point = { ...spawn }, boating = false, boatYaw = 0, velocity = 0, last = performance.now(), lastReport = 0, frames = 0, frameTime = 0, quality = -1
    let guide: PathGuideState | null = null, inspection: VillageView | null = null
    const visited = new Set<string>(), cameraPosition = v(spawn.x, spawn.y + 1.6, spawn.z)
    const nearbyDock = () => docks.find(d => Math.hypot(position.x - d.x, position.z - d.z) < (boating ? 4.8 : 3.2))
    const interact = () => {
      if (input.paused) return
      const d = nearbyDock(); if (!d) return
      if (boating) { boating = false; position = { ...d }; input.yaw = d === docks[0] ? .9 : Math.PI; velocity = 0; guide = null }
      else {
        if (Math.hypot(position.x - boat.position.x, position.z - boat.position.z) > 5) return
        boating = true; position = { x: boat.position.x, y: waterLevel+.1, z: boat.position.z }; boatYaw = input.yaw; velocity = 0; guide = null
      }
    }
    const reset = () => { position = { ...spawn }; boating = false; velocity = 0; guide = null; boat.position.set(boatStart.x, boatStart.y, boatStart.z); boat.rotation.y = 0; input.yaw = spawn.yaw; input.pitch = 0; input.x = 0; input.z = 0; cameraPosition.set(position.x, position.y + 1.6, position.z) }
    const tick = (now: number) => {
      if (disposed) return
      const dt = Math.min(.04, (now - last) / 1000); last = now
      if (quality !== input.quality) { quality = input.quality; renderer.setPixelRatio(Math.min(devicePixelRatio, quality === 0 ? 1 : 1.45)); renderer.shadowMap.enabled = quality !== 0; renderer.shadowMap.needsUpdate=true; resize() }
      if (!input.paused) {
        const norm = Math.max(1, Math.hypot(input.x, input.z)), x = input.x / norm, z = input.z / norm
        if (boating) {
          guide = null
          boatYaw -= x * dt * .9; input.yaw -= x * dt * .9
          velocity += (-z * 6.5 - velocity) * Math.min(1, dt * 2)
          const nx = position.x - Math.sin(boatYaw) * velocity * dt, nz = position.z - Math.cos(boatYaw) * velocity * dt
          if (isWater(nx, nz, 1.55) && waterHeight(nz) < waterLevel+.12) position = { x: nx, y: waterLevel+.1, z: nz }; else velocity *= .2
          boat.position.set(position.x, waterLevel+.1 + Math.sin(now * .0016) * .035, position.z); boat.rotation.set(Math.sin(now * .0014) * .012, boatYaw, Math.sin(now * .0011) * .015)
        } else {
          const dx = (x * Math.cos(input.yaw) + z * Math.sin(input.yaw)) * dt * 3.5
          const dz = (-x * Math.sin(input.yaw) + z * Math.cos(input.yaw)) * dt * 3.5
          const move = assistedWalkStep(position, dx, dz, -z, x, guide)
          position = move.position; guide = move.guide
          boat.position.y = waterLevel+.1 + Math.sin(now * .0016) * .035
        }
        waterMaterial.uniforms.time.value = now * .001;
      }
      const eye = boating ? 1.2 : 1.62
      cameraPosition.lerp(v(position.x, position.y + eye, position.z), 1 - Math.exp(-dt * 14))
      camera.position.copy(cameraPosition); camera.rotation.set(input.pitch, input.yaw, 0, 'YXZ')
      if(inspection){camera.position.set(inspection.position.x,inspection.position.y,inspection.position.z);camera.lookAt(inspection.target.x,inspection.target.y,inspection.target.z)}
      if(renderDirty || (!input.paused && !inspection)){renderer.render(scene, camera);renderDirty=false}
      frames++; frameTime = Math.max(.001, (now - (lastReport || now - 16)) / 1000)
      if (now - lastReport > 180) {
        const location = placeName(position, boating)
        if (houses.some(h => h.name === location) || location === 'The open lake') visited.add(location)
        const dock = nearbyDock(), nearBoat = Math.hypot(position.x - boat.position.x, position.z - boat.position.z) < 5
        report({ position: { ...position }, boating, location, action: dock && (boating || nearBoat) ? boating ? 'Leave boat' : 'Board boat' : '', visited: [...visited], fps: Math.round(frames / frameTime) })
        lastReport = now; frames = 0; frameTime = 0
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return { dispose, interact, reset, getPosition: () => ({ ...position }), inspect: (view: VillageView | null) => { inspection=view;renderDirty=true }, diagnostics: () => ({ calls: renderer.info.render.calls, triangles:renderer.info.render.triangles, geometries:renderer.info.memory.geometries, textures:renderer.info.memory.textures }), advance: (dx:number,dz:number) => { position=walkStep(position,dx,dz);return {...position} } }
  } catch (e) { dispose(); throw e }
}
