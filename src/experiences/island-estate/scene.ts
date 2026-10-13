import * as T from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { createKit,vec } from './geometry'
import { architecture } from './architecture'
import { landscape } from './landscape'
import { createEnvironment,type Lighting } from './environment'
import { destinations,viewpoints,EYE_HEIGHT,supportedHeight,clamp,type WorldPoint } from './layout'
import { isWalkable,moveSafely,advanceRoute } from './navigation'

export type Mode='overview'|'walk'
export type Input={x:number;z:number;yaw:number;pitch:number;paused:boolean;fast:boolean;lookedAt:number}
export type IslandState={mode:Mode;position:WorldPoint;location:string;floor:string;moving:boolean;destination:string;navReady:boolean;fps:number;drawCalls:number;triangles:number}
export function createIslandScene(canvas:HTMLCanvasElement,input:Input,onState:(s:IslandState)=>void,onNotice:(s:string)=>void) {
  const renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance',alpha:false})
  renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap
  const mobile=matchMedia('(pointer:coarse)').matches
  renderer.setPixelRatio(Math.min(devicePixelRatio,mobile?1.35:1.75))
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(43,1,.12,700)
  const kit=createKit(scene),environment=createEnvironment(scene,renderer)
  const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.dampingFactor=.08;controls.minDistance=18;controls.maxDistance=280;controls.maxPolarAngle=Math.PI*.485;controls.target.copy(vec(viewpoints[0].target));camera.position.copy(vec(viewpoints[0].position))
  architecture(kit);landscape(kit);kit.finish()
  const raycaster=new T.Raycaster(),cursor=new T.Vector2()
  const targetGeo=new T.RingGeometry(.2,.3,32),targetMat=new T.MeshBasicMaterial({color:'#fff6d8',transparent:true,opacity:.85,side:T.DoubleSide,depthWrite:false})
  const target=new T.Mesh(targetGeo,targetMat);target.rotation.x=-Math.PI/2;target.visible=false;scene.add(target)
  let mode:Mode='overview',position={...destinations[0].position},route:WorldPoint[]=[],routeName='',disposed=false,navReady=false,navFailed=false,pendingId=0,requestId=0
  let lastFrame=performance.now(),lastState=0,frameId=0,frames=0,fps=0,lastFps=performance.now(),moving=false,lastRouteDistance=Infinity,stuckTime=0
  let width=1,height=1
  const pending=new Map<number,(p:WorldPoint[]|null)=>void>()
  const worker=new Worker(new URL('./navigation-worker.ts',import.meta.url),{type:'module'})
  worker.onmessage=(e:MessageEvent)=>{
    if(disposed)return
    if(e.data.type==='ready'){navReady=true;report()}
    if(e.data.type==='path'){pending.get(e.data.id)?.(e.data.route);pending.delete(e.data.id)}
  }
  worker.onerror=()=>{navFailed=true;navReady=false;stop();for(const done of pending.values())done(null);pending.clear();onNotice('Walking routes could not load. The joystick and keyboard still work.')}
  function resize() {
    if(disposed)return
    const rect=canvas.parentElement!.getBoundingClientRect();width=Math.max(1,rect.width);height=Math.max(1,rect.height)
    renderer.setSize(width,height,false);camera.aspect=width/height
    const base=mode==='walk'?60:43
    camera.fov=Math.min(88,T.MathUtils.radToDeg(2*Math.atan(Math.tan(T.MathUtils.degToRad(base/2))/Math.min(1,camera.aspect))))
    camera.updateProjectionMatrix()
  }
  const observer=new ResizeObserver(resize);observer.observe(canvas.parentElement!);resize()
  function report() {
    const nearest=destinations.reduce((best,d)=>Math.hypot(d.position.x-position.x,d.position.z-position.z,(d.position.y-position.y)*3)<Math.hypot(best.position.x-position.x,best.position.z-position.z,(best.position.y-position.y)*3)?d:best,destinations[0])
    const close=Math.hypot(nearest.position.x-position.x,nearest.position.z-position.z,(nearest.position.y-position.y)*3)<8
    const floor=position.y>17?'Rooftop · +12 m':position.y>11?'First floor · +6 m':position.y<5?'Island & shoreline':'Ground floor · ±0 m'
    onState({mode,position:{...position},location:mode==='overview'?'A private island, a world of its own':close?nearest.label:'Island Estate',floor,moving,destination:routeName,navReady,fps,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles})
  }
  function stop(clearInput=true) {pendingId++;route=[];routeName='';target.visible=false;moving=false;if(clearInput){input.x=0;input.z=0;input.fast=false}stuckTime=0;lastRouteDistance=Infinity;report()}
  function setMode(next:Mode) {
    stop();mode=next;controls.enabled=next==='overview'
    if(next==='overview'){camera.position.copy(vec(viewpoints[0].position));controls.target.copy(vec(viewpoints[0].target));controls.minDistance=18;controls.maxPolarAngle=Math.PI*.485;controls.update()}
    else {input.yaw=0;input.pitch=.07;camera.position.set(position.x,position.y+EYE_HEIGHT,position.z)}
    resize();report()
  }
  function setViewpoint(id:string) {
    const view=viewpoints.find(v=>v.id===id)||viewpoints[0]
    stop();mode='overview';controls.enabled=true;controls.minDistance=id==='atrium'?2:18;controls.maxPolarAngle=id==='atrium'?Math.PI*.86:Math.PI*.485
    camera.position.copy(vec(view.position));controls.target.copy(vec(view.target));controls.update();resize();report()
  }
  async function walkTo(end:WorldPoint,label='Your selected spot'):Promise<boolean> {
    if(navFailed){onNotice('Walking routes are unavailable. Explore with the joystick or keyboard.');return false}
    if(!isWalkable(end)){onNotice('Choose a clear floor or path. Water, gardens and edges stay protected.');return false}
    if(mode!=='walk')setMode('walk')
    stop();const generation=++pendingId,id=++requestId
    routeName=label;report()
    const result=await new Promise<WorldPoint[]|null>(resolve=>{pending.set(id,resolve);worker.postMessage({id,start:position,end})})
    if(disposed||generation!==pendingId)return false
    if(!result){routeName='';onNotice('There is no clear walking route to that spot.');report();return false}
    route=result;routeName=label;lastRouteDistance=Infinity;stuckTime=0;target.position.set(end.x,end.y+.045,end.z);target.visible=true;report();return true
  }
  async function goTo(id:string){const d=destinations.find(d=>d.id===id);return d?walkTo(d.position,d.label):false}
  async function pick(x:number,y:number) {
    if(mode!=='walk')return false
    const rect=canvas.getBoundingClientRect();cursor.set((x-rect.left)/rect.width*2-1,-(y-rect.top)/rect.height*2+1)
    raycaster.setFromCamera(cursor,camera)
    const hits=raycaster.intersectObjects(kit.navMeshes,false)
    const hit=hits[0];if(!hit)return false
    const p={x:hit.point.x,y:hit.point.y,z:hit.point.z},h=supportedHeight(p,p.y)
    if(h===null||!isWalkable({...p,y:h})){onNotice('Tap a clear part of the floor or path.');return false}
    return walkTo({...p,y:h})
  }
  function reset(){position={...destinations[0].position};input.yaw=0;input.pitch=.07;setMode(mode)}
  function frame(now:number) {
    if(disposed)return
    frameId=requestAnimationFrame(frame)
    const dt=Math.min((now-lastFrame)/1000,.1);lastFrame=now
    if(document.hidden)return
    if(!input.paused&&mode==='walk') {
      const magnitude=Math.hypot(input.x,input.z)
      moving=false
      if(magnitude>.02) {
        if(route.length||pending.size)stop(false)
        const scale=2.35*(input.fast?1.65:1)*dt/Math.max(1,magnitude)
        const dx=(Math.sin(input.yaw)*input.z+Math.cos(input.yaw)*input.x)*scale,dz=(-Math.cos(input.yaw)*input.z+Math.sin(input.yaw)*input.x)*scale
        const next=moveSafely(position,dx,dz);moving=Math.hypot(next.x-position.x,next.z-position.z)>.001;position=next
      } else if(route.length) {
        const goal=route[0],dx=goal.x-position.x,dz=goal.z-position.z,length=Math.hypot(dx,dz)
        if(length<.0001&&Math.abs(goal.y-position.y)<.22) {route.shift();if(!route.length){routeName='';target.visible=false}}
        else {
          const advanced=advanceRoute(position,route,2.6*dt),next=advanced.position
          moving=advanced.moving
          const remaining=Math.hypot(goal.x-next.x,goal.z-next.z)
          if(remaining>=lastRouteDistance-.0001)stuckTime+=dt;else stuckTime=0
          lastRouteDistance=remaining;position=next
          if(!route.length){routeName='';target.visible=false}
          if(now-input.lookedAt>4500) {
            const desired=Math.atan2(dx,-dz),delta=Math.atan2(Math.sin(desired-input.yaw),Math.cos(desired-input.yaw))
            input.yaw+=clamp(delta,-dt*.6,dt*.6)
          }
          if(stuckTime>2){stop();onNotice('Walk stopped at an obstacle. Choose another clear spot.')}
        }
      }
      camera.position.set(position.x,position.y+EYE_HEIGHT,position.z)
      camera.rotation.set(input.pitch,-input.yaw,0,'YXZ')
    } else if(mode==='overview')controls.update()
    environment.update(now/1000);renderer.render(scene,camera)
    frames++
    if(now-lastFps>1000){fps=Math.round(frames*1000/(now-lastFps));frames=0;lastFps=now}
    if(now-lastState>220){report();lastState=now}
  }
  frameId=requestAnimationFrame(frame);report()
  function dispose() {
    if(disposed)return;disposed=true;cancelAnimationFrame(frameId);observer.disconnect();worker.terminate();for(const done of pending.values())done(null);pending.clear()
    controls.dispose();environment.dispose();kit.dispose();targetGeo.dispose();targetMat.dispose();renderer.dispose();renderer.forceContextLoss()
  }
  return {setMode,setViewpoint,goTo,pick,stop,reset,setLighting:(v:Lighting)=>environment.setLighting(v),dispose,
    capture:()=>{renderer.render(scene,camera);return canvas.toDataURL('image/png')},
    stats:()=>({calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures}),
  }
}
export type IslandEngine=ReturnType<typeof createIslandScene>
