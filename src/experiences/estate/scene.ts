import * as T from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { createEstateKit } from './kit'
import { architecture, landscape, waters, atmosphere, contactShadows, type LightPreset } from './environment'
import { furnish } from './furniture'
import { decorateArt, type EstateArtChoice, type EstateArtDisplay } from './art'
import { createNavigator, moveSafely, walkable } from './navigation'
import { destinations, EYE, FLOOR, floorAt, locationAt, spawn, type Point } from './plan'
export type EstateInput={yaw:number;pitch:number;x:number;z:number;paused:boolean;speed:number;quality:number;lighting:LightPreset;lookedAt:number;fast:boolean}
export type EstateState={location:string;moving:boolean;destination:string;fps:number;position:Point;touring:boolean}
export type EstatePick={kind:'floor'}|{kind:'art';art:EstateArtChoice}
type ArtPhase='entering'|'active'|'exiting'
type ArtInspect={
  display:EstateArtDisplay
  normal:T.Vector3
  stand:Point
  standCamera:T.Vector3
  target:T.Vector3
  closeDistance:number
  baseFov:number
  zoom:number
  panX:number
  panY:number
  phase:ArtPhase
  started:number
  fromPos:T.Vector3
  fromQuat:T.Quaternion
  fromFov:number
  exitFromPos?:T.Vector3
  exitFromQuat?:T.Quaternion
  exitFromFov?:number
}
const UP=new T.Vector3(0,1,0)
const ease=(t:number)=>t*t*(3-2*t)
function lookQuaternion(position:T.Vector3,target:T.Vector3){return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().lookAt(position,target,UP))}
export async function createEstate(canvas:HTMLCanvasElement,input:EstateInput,signal:AbortSignal,report:(s:EstateState)=>void,progress:(s:string)=>void){
  const renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.06
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(69,1,.07,3200);camera.rotation.order='YXZ'
  const sky=new T.Color('#a6c0c5');scene.background=sky;scene.fog=new T.FogExp2(sky,.0018)
  const hemi=new T.HemisphereLight('#c1d7eb','#8f7052',.75);scene.add(hemi)
  const sun=new T.DirectionalLight('#ffe0ad',3.1);sun.position.set(-45,38,-60);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-60,right:60,top:60,bottom:-60,near:1,far:180});sun.shadow.bias=-.00015;sun.shadow.normalBias=.045;scene.add(sun,sun.target)
  const fills=Array.from({length:3},()=>{const l=new T.PointLight('#ffd395',12,18,2);scene.add(l);return l})
  const kit=createEstateKit(scene);let water:ReturnType<typeof waters>|undefined,skyDome:ReturnType<typeof atmosphere>|undefined,contacts:ReturnType<typeof contactShadows>|undefined,env:T.WebGLRenderTarget|undefined,artInstallation:ReturnType<typeof decorateArt>|undefined,frame=0,disposed=false,observer:ResizeObserver|undefined
  const raycaster=new T.Raycaster(),plane=new T.Plane(new T.Vector3(0,1,0),-FLOOR),hit=new T.Vector3()
  const marker=new T.Mesh(new T.RingGeometry(.17,.24,36),new T.MeshBasicMaterial({color:'#e7d3a6',side:T.DoubleSide,transparent:true,opacity:.85,depthWrite:false}));marker.rotation.x=-Math.PI/2;marker.visible=false;scene.add(marker)
  let artInspect:ArtInspect|null=null,artExitResolve:(()=>void)|undefined
  function dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(frame);observer?.disconnect();artExitResolve?.();artInstallation?.dispose();kit.dispose();water?.dispose();skyDome?.dispose();contacts?.dispose();env?.dispose();marker.geometry.dispose();marker.material.dispose();sun.shadow.map?.dispose();renderer.dispose();signal.removeEventListener('abort',dispose)}
  signal.addEventListener('abort',dispose,{once:true})
  try{
    progress('Opening the house…');architecture(kit);furnish(kit);artInstallation=decorateArt(scene,kit)
    await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));if(signal.aborted)throw new DOMException('Aborted','AbortError')
    progress('Planting the coast…');landscape(kit);kit.finish();water=waters(scene);skyDome=atmosphere(scene);contacts=contactShadows(scene)
    const pmrem=new T.PMREMGenerator(renderer),room=new RoomEnvironment();env=pmrem.fromScene(room,.04);scene.environment=env.texture;scene.environmentIntensity=.42;room.dispose();pmrem.dispose()
    progress('Finding the garden paths…');const navigator=createNavigator()
    let position:Point={x:spawn.x,z:spawn.z},path:Point[]=[],destination='',yaw=spawn.yaw as number,pitch=-.025,vx=0,vz=0,tour=false,tourIndex=0,dwell=0,quality=-1,preset='',last=performance.now(),lastReport=last,frameCount=0,lastShadow={x:999,z:999},dirty=true
    let inspectView:{position:T.Vector3;target:T.Vector3}|null=null
    camera.position.set(position.x,(floorAt(position)??FLOOR)+EYE,position.z)
    const stop=()=>{path=[];destination='';tour=false;vx=0;vz=0;marker.visible=false}
    function go(point:Point,name='Your destination'){if(artInspect)return false;const route=navigator.path(position,point);if(!route)return false;path=route;destination=name;marker.position.set(point.x,(floorAt(point)??FLOOR)+.03,point.z);marker.visible=true;dirty=true;return true}
    function reset(){stop();artInspect=null;artExitResolve?.();artExitResolve=undefined;camera.fov=69;camera.updateProjectionMatrix();position={x:spawn.x,z:spawn.z};input.yaw=spawn.yaw;input.pitch=-.025;yaw=input.yaw;pitch=input.pitch;camera.position.set(position.x,(floorAt(position)??FLOOR)+EYE,position.z);dirty=true}
    function standFor(display:EstateArtDisplay,preferred:T.Vector3){
      const sides=[preferred.clone(),preferred.clone().negate()]
      for(const side of sides)for(const distance of [2.05,1.78,2.35]){
        const x=display.center.x+side.x*distance,z=display.center.z+side.z*distance,point={x,z},floor=floorAt(point)
        if(floor!==null)return {normal:side,stand:point,camera:new T.Vector3(x,floor+EYE,z)}
      }
      const floor=floorAt(position)??FLOOR
      return {normal:preferred,stand:{...position},camera:new T.Vector3(position.x,floor+EYE,position.z)}
    }
    function beginArt(display:EstateArtDisplay){
      stop();input.x=0;input.z=0;input.fast=false
      const preferred=display.normal.clone().multiplyScalar(camera.position.clone().sub(display.center).dot(display.normal)>=0?1:-1)
      const standing=standFor(display,preferred)
      position={...standing.stand}
      const baseFov=50,v=T.MathUtils.degToRad(baseFov),h=2*Math.atan(Math.tan(v/2)*Math.max(.55,camera.aspect))
      const closeDistance=Math.max(.72,display.height/(2*Math.tan(v/2)),display.width/(2*Math.tan(h/2)))*1.10
      artInspect={display,normal:standing.normal,stand:standing.stand,standCamera:standing.camera,target:display.center.clone(),closeDistance,baseFov,zoom:1,panX:0,panY:0,phase:'entering',started:performance.now(),fromPos:camera.position.clone(),fromQuat:camera.quaternion.clone(),fromFov:camera.fov}
      dirty=true
      return display.art
    }
    function pick(clientX:number,clientY:number):EstatePick|null{
      if(input.paused||artInspect)return null
      const r=canvas.getBoundingClientRect();raycaster.setFromCamera(new T.Vector2((clientX-r.left)/r.width*2-1,-(clientY-r.top)/r.height*2+1),camera)
      const displays=artInstallation?.displays??[],artHit=raycaster.intersectObjects(displays.map(d=>d.mesh),false)[0]
      if(artHit){const display=displays.find(d=>d.mesh===artHit.object);if(display)return {kind:'art',art:beginArt(display)}}
      if(!raycaster.ray.intersectPlane(plane,hit))return null
      let p={x:hit.x,z:hit.z};const y=floorAt(p);if(y===null)return null
      if(y!==FLOOR){if(!raycaster.ray.intersectPlane(new T.Plane(new T.Vector3(0,1,0),-y),hit))return null;p={x:hit.x,z:hit.z}}
      const distance=camera.position.distanceTo(hit);const blockers=raycaster.intersectObjects(scene.children,false).filter(o=>o.object!==marker&&(o.object as T.Mesh).material!==undefined);if(blockers[0]&&blockers[0].distance<distance-.45)return null
      tour=false;return go(p)?{kind:'floor'}:null
    }
    function artView(a:ArtInspect){
      const maxX=a.display.width*.42*(1-1/a.zoom),maxY=a.display.height*.42*(1-1/a.zoom)
      a.panX=T.MathUtils.clamp(a.panX,-maxX,maxX);a.panY=T.MathUtils.clamp(a.panY,-maxY,maxY)
      const offset=a.display.right.clone().multiplyScalar(a.panX).addScaledVector(UP,a.panY)
      const target=a.target.clone().add(offset),position=target.clone().addScaledVector(a.normal,a.closeDistance)
      return {target,position,quat:lookQuaternion(position,target),fov:a.baseFov/a.zoom}
    }
    function updateArtCamera(now:number){
      const a=artInspect;if(!a)return
      if(a.phase==='entering'){
        const view=artView(a),t=T.MathUtils.clamp((now-a.started)/820,0,1),e=ease(t)
        camera.position.lerpVectors(a.fromPos,view.position,e);camera.quaternion.slerpQuaternions(a.fromQuat,view.quat,e);camera.fov=T.MathUtils.lerp(a.fromFov,view.fov,e);camera.updateProjectionMatrix();dirty=true
        if(t>=1){a.phase='active';a.started=now}
      }else if(a.phase==='active'){
        const view=artView(a);camera.position.copy(view.position);camera.quaternion.copy(view.quat);if(Math.abs(camera.fov-view.fov)>.001){camera.fov=view.fov;camera.updateProjectionMatrix()}
      }else{
        const t=T.MathUtils.clamp((now-a.started)/620,0,1),e=ease(t),targetQuat=lookQuaternion(a.standCamera,a.target)
        camera.position.lerpVectors(a.exitFromPos??camera.position,a.standCamera,e);camera.quaternion.slerpQuaternions(a.exitFromQuat??camera.quaternion,targetQuat,e);camera.fov=T.MathUtils.lerp(a.exitFromFov??camera.fov,69,e);camera.updateProjectionMatrix();dirty=true
        if(t>=1){
          camera.position.copy(a.standCamera);camera.quaternion.copy(targetQuat);camera.fov=69;camera.updateProjectionMatrix();position={...a.stand}
          const dir=a.target.clone().sub(a.standCamera).normalize();yaw=Math.atan2(-dir.x,-dir.z);pitch=Math.asin(T.MathUtils.clamp(dir.y,-.98,.98));input.yaw=yaw;input.pitch=pitch;input.lookedAt=now
          artInspect=null;const resolve=artExitResolve;artExitResolve=undefined;resolve?.();dirty=true
        }
      }
    }
    function closeArt(){
      const a=artInspect;if(!a)return Promise.resolve()
      if(a.phase==='exiting')return new Promise<void>(resolve=>{const previous=artExitResolve;artExitResolve=()=>{previous?.();resolve()}})
      a.phase='exiting';a.started=performance.now();a.exitFromPos=camera.position.clone();a.exitFromQuat=camera.quaternion.clone();a.exitFromFov=camera.fov;dirty=true
      return new Promise<void>(resolve=>{artExitResolve=resolve})
    }
    function panArt(dx:number,dy:number){const a=artInspect;if(!a||a.phase==='exiting'||a.zoom<=1.001)return a?.zoom??1;a.panX-=dx/Math.max(1,canvas.clientWidth)*a.display.width*1.7/a.zoom;a.panY+=dy/Math.max(1,canvas.clientHeight)*a.display.height*1.7/a.zoom;dirty=true;return a.zoom}
    function zoomArt(factor:number){const a=artInspect;if(!a||a.phase==='exiting')return a?.zoom??1;a.zoom=T.MathUtils.clamp(a.zoom*factor,1,4);if(a.zoom<=1.01){a.zoom=1;a.panX=0;a.panY=0}dirty=true;return a.zoom}
    function resetArtView(){const a=artInspect;if(!a)return 1;a.zoom=1;a.panX=0;a.panY=0;dirty=true;return 1}
    const resize=()=>{const w=canvas.clientWidth,h=canvas.clientHeight;if(w&&h){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();dirty=true}}
    observer=new ResizeObserver(resize);observer.observe(canvas);resize()
    function lighting(){const evening=input.lighting==='evening',day=input.lighting==='daylight';sky.set(evening?'#293c51':day?'#b1ccd8':'#b7c5c4');(scene.fog as T.FogExp2).color.copy(sky);hemi.intensity=evening?.22:day?1:.75;sun.intensity=evening?.07:day?3:3.6;sun.color.set(day?'#fff1db':'#ffe0ad');renderer.toneMappingExposure=evening?1.12:1.06;scene.environmentIntensity=evening?.12:.3;skyDome?.preset(input.lighting);lastShadow={x:999,z:999};renderer.shadowMap.needsUpdate=true;dirty=true}
    function tick(now:number){if(disposed)return;frame=requestAnimationFrame(tick);const dt=Math.min(.04,(now-last)/1000);last=now
      if(quality!==input.quality){quality=input.quality;renderer.setPixelRatio(Math.min(devicePixelRatio,quality===0?1:quality===2?1.65:1.25));renderer.shadowMap.enabled=true;renderer.shadowMap.needsUpdate=true;resize()}
      if(preset!==input.lighting){preset=input.lighting;lighting()}
      if(!input.paused&&!inspectView&&!artInspect){
        let dx=0,dz=0;const manual=Math.hypot(input.x,input.z)>.01
        if(manual){path=[];tour=false;marker.visible=false;destination='';const norm=Math.max(1,Math.hypot(input.x,input.z));dx=(input.x*Math.cos(yaw)+input.z*Math.sin(yaw))/norm;dz=(-input.x*Math.sin(yaw)+input.z*Math.cos(yaw))/norm}
        else if(path.length){const p=path[0],d=Math.hypot(p.x-position.x,p.z-position.z);if(d<.16){path.shift();if(!path.length){marker.visible=false;dwell=now+2600}}
          else{dx=(p.x-position.x)/d;dz=(p.z-position.z)/d;const factor=path.length===1?Math.min(1,d/.95):1;dx*=factor;dz*=factor
            if(now-input.lookedAt>1600){const desired=Math.atan2(-dx,-dz),delta=Math.atan2(Math.sin(desired-input.yaw),Math.cos(desired-input.yaw));input.yaw+=delta*(1-Math.exp(-dt*.7))}
          }}
        if(tour&&!path.length&&now>dwell){const d=destinations[tourIndex%destinations.length];tourIndex++;if(!go(d,d.name)){tour=false}else dwell=Infinity}
        const speed=input.speed*(input.fast?1.45:1),damp=1-Math.exp(-dt*4.8);vx+=(dx*speed-vx)*damp;vz+=(dz*speed-vz)*damp
        const next=moveSafely(position,vx*dt,vz*dt);if(Math.hypot(next.x-position.x,next.z-position.z)<.00005&&!path.length){vx=0;vz=0}position=next
        yaw+=Math.atan2(Math.sin(input.yaw-yaw),Math.cos(input.yaw-yaw))*(1-Math.exp(-dt*16));pitch+=(input.pitch-pitch)*(1-Math.exp(-dt*16))
        const y=(floorAt(position)??FLOOR)+EYE;camera.position.set(position.x,T.MathUtils.damp(camera.position.y,y,10,dt),position.z);camera.rotation.set(pitch,yaw,0,'YXZ')
        dirty=true
      }else{vx=0;vz=0}
      if(Math.hypot(position.x-lastShadow.x,position.z-lastShadow.z)>12){lastShadow={...position};sun.position.set(-55,input.lighting==='daylight'?70:30,-80);sun.target.position.set(0,6,0);renderer.shadowMap.needsUpdate=true}
      const locations=[[-2,-2,3.4],[-17,7,3.1],[32,-4,3.2],[-32,30,2.8],[14,22,3.1],[-32,4,2.7],[27,22,2.8],[36,22,2.8]],lightView=inspectView?.position??artInspect?.stand??position
      locations.sort((a,b)=>Math.hypot(a[0]-lightView.x,a[1]-lightView.z)-Math.hypot(b[0]-lightView.x,b[1]-lightView.z))
      fills.forEach((l,i)=>{const p=locations[i];l.position.set(p[0],FLOOR+p[2],p[1]);l.intensity=input.lighting==='evening'?75:10})
      if(inspectView){camera.position.copy(inspectView.position);camera.lookAt(inspectView.target)}else if(artInspect)updateArtCamera(now)
      if(dirty){water?.update(now*.001,input.lighting);renderer.render(scene,camera);dirty=false;frameCount++}
      if(now-lastReport>500){report({location:locationAt(position),moving:!artInspect&&(path.length>0||Math.hypot(vx,vz)>.1),destination:!artInspect&&path.length?destination:'',fps:Math.round(frameCount/((now-lastReport)/1000)),position:{...position},touring:!artInspect&&tour});frameCount=0;lastReport=now}
    }
    renderer.render(scene,camera);frame=requestAnimationFrame(tick)
    return {dispose,stop,reset,pick,closeArt,panArt,zoomArt,resetArtView,go:(point:Point,name?:string)=>{tour=false;return go(point,name)},tour(){if(artInspect)return;stop();tour=true;tourIndex=1;dwell=0},getPosition:()=>({...position}),diagnostics:()=>({calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures}),inspect(view:{position:T.Vector3;target:T.Vector3}|null){inspectView=view;dirty=true},advance(dx:number,dz:number){if(artInspect)return {...position};position=moveSafely(position,dx,dz);dirty=true;return {...position}},walkable}
  }catch(e){dispose();throw e}
}
