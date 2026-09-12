import * as T from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { createEstateKit } from './kit'
import { architecture, landscape, waters, atmosphere, contactShadows, type LightPreset } from './environment'
import { furnish } from './furniture'
import { decorateArt } from './art'
import { createNavigator, moveSafely, walkable } from './navigation'
import { destinations, EYE, FLOOR, floorAt, locationAt, spawn, type Point } from './plan'
import { createEstateEditor, type EditableRoomId, type EditableSurface } from './editor'
export type EstateInput={yaw:number;pitch:number;x:number;z:number;paused:boolean;speed:number;quality:number;lighting:LightPreset;lookedAt:number;fast:boolean}
export type EstateState={location:string;moving:boolean;destination:string;fps:number;position:Point;touring:boolean}
export async function createEstate(canvas:HTMLCanvasElement,input:EstateInput,signal:AbortSignal,report:(s:EstateState)=>void,progress:(s:string)=>void){
  const renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.06
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(69,1,.07,3200);camera.rotation.order='YXZ'
  const sky=new T.Color('#a6c0c5');scene.background=sky;scene.fog=new T.FogExp2(sky,.0018)
  const hemi=new T.HemisphereLight('#c1d7eb','#8f7052',.75);scene.add(hemi)
  const sun=new T.DirectionalLight('#ffe0ad',3.1);sun.position.set(-45,38,-60);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-60,right:60,top:60,bottom:-60,near:1,far:180});sun.shadow.bias=-.00015;sun.shadow.normalBias=.045;scene.add(sun,sun.target)
  const fills=Array.from({length:3},()=>{const l=new T.PointLight('#ffd395',12,18,2);scene.add(l);return l})
  const kit=createEstateKit(scene);let water:ReturnType<typeof waters>|undefined,skyDome:ReturnType<typeof atmosphere>|undefined,contacts:ReturnType<typeof contactShadows>|undefined,env:T.WebGLRenderTarget|undefined,disposeArt:(()=>void)|undefined,editor:ReturnType<typeof createEstateEditor>|undefined,frame=0,disposed=false,observer:ResizeObserver|undefined
  const raycaster=new T.Raycaster(),plane=new T.Plane(new T.Vector3(0,1,0),-FLOOR),hit=new T.Vector3()
  const marker=new T.Mesh(new T.RingGeometry(.17,.24,36),new T.MeshBasicMaterial({color:'#e7d3a6',side:T.DoubleSide,transparent:true,opacity:.85,depthWrite:false}));marker.rotation.x=-Math.PI/2;marker.visible=false;scene.add(marker)
  function dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(frame);observer?.disconnect();editor?.dispose();disposeArt?.();kit.dispose();water?.dispose();skyDome?.dispose();contacts?.dispose();env?.dispose();marker.geometry.dispose();marker.material.dispose();sun.shadow.map?.dispose();renderer.dispose();signal.removeEventListener('abort',dispose)}
  signal.addEventListener('abort',dispose,{once:true})
  try{
    progress('Opening the house…');architecture(kit);furnish(kit);disposeArt=decorateArt(scene,kit)
    await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));if(signal.aborted)throw new DOMException('Aborted','AbortError')
    progress('Planting the coast…');landscape(kit);kit.finish();editor=createEstateEditor(scene,renderer,camera,canvas);water=waters(scene);skyDome=atmosphere(scene);contacts=contactShadows(scene)
    const pmrem=new T.PMREMGenerator(renderer),room=new RoomEnvironment();env=pmrem.fromScene(room,.04);scene.environment=env.texture;scene.environmentIntensity=.42;room.dispose();pmrem.dispose()
    progress('Finding the garden paths…');const navigator=createNavigator()
    let position:Point={x:spawn.x,z:spawn.z},path:Point[]=[],destination='',yaw=spawn.yaw as number,pitch=-.025,vx=0,vz=0,tour=false,tourIndex=0,dwell=0,quality=-1,preset='',last=performance.now(),lastReport=last,frameCount=0,lastShadow={x:999,z:999},dirty=true
    let inspectView:{position:T.Vector3;target:T.Vector3}|null=null
    camera.position.set(position.x,(floorAt(position)??FLOOR)+EYE,position.z)
    const stop=()=>{path=[];destination='';tour=false;vx=0;vz=0;marker.visible=false}
    function go(point:Point,name='Your destination'){const route=navigator.path(position,point);if(!route)return false;path=route;destination=name;marker.position.set(point.x,(floorAt(point)??FLOOR)+.03,point.z);marker.visible=true;dirty=true;return true}
    function reset(){stop();position={x:spawn.x,z:spawn.z};input.yaw=spawn.yaw;input.pitch=-.025;yaw=input.yaw;pitch=input.pitch;camera.position.set(position.x,(floorAt(position)??FLOOR)+EYE,position.z);dirty=true}
    function pick(clientX:number,clientY:number){if(input.paused)return false;const r=canvas.getBoundingClientRect();raycaster.setFromCamera(new T.Vector2((clientX-r.left)/r.width*2-1,-(clientY-r.top)/r.height*2+1),camera)
      if(!raycaster.ray.intersectPlane(plane,hit))return false
      let p={x:hit.x,z:hit.z};const y=floorAt(p);if(y===null)return false
      if(y!==FLOOR){if(!raycaster.ray.intersectPlane(new T.Plane(new T.Vector3(0,1,0),-y),hit))return false;p={x:hit.x,z:hit.z}}
      const distance=camera.position.distanceTo(hit);const blockers=raycaster.intersectObjects(scene.children,false).filter(o=>o.object!==marker&&!o.object.userData.estateEditorSurface&&(o.object as T.Mesh).material!==undefined);if(blockers[0]&&blockers[0].distance<distance-.45)return false
      tour=false;return go(p)
    }
    const resize=()=>{const w=canvas.clientWidth,h=canvas.clientHeight;if(w&&h){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();dirty=true}}
    observer=new ResizeObserver(resize);observer.observe(canvas);resize()
    function lighting(){const evening=input.lighting==='evening',day=input.lighting==='daylight';sky.set(evening?'#293c51':day?'#b1ccd8':'#b7c5c4');(scene.fog as T.FogExp2).color.copy(sky);hemi.intensity=evening?.22:day?1:.75;sun.intensity=evening?.07:day?3:3.6;sun.color.set(day?'#fff1db':'#ffe0ad');renderer.toneMappingExposure=evening?1.12:1.06;scene.environmentIntensity=evening?.12:.3;skyDome?.preset(input.lighting);lastShadow={x:999,z:999};renderer.shadowMap.needsUpdate=true;dirty=true}
    function tick(now:number){if(disposed)return;frame=requestAnimationFrame(tick);const dt=Math.min(.04,(now-last)/1000);last=now
      if(quality!==input.quality){quality=input.quality;renderer.setPixelRatio(Math.min(devicePixelRatio,quality===0?1:quality===2?1.65:1.25));renderer.shadowMap.enabled=true;renderer.shadowMap.needsUpdate=true;resize()}
      if(preset!==input.lighting){preset=input.lighting;lighting()}
      if(!input.paused&&!inspectView){
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
      const locations=[[-2,-2,3.4],[-17,7,3.1],[32,-4,3.2],[-32,30,2.8],[14,22,3.1],[-32,4,2.7],[27,22,2.8],[36,22,2.8]],lightView=inspectView?.position??position
      locations.sort((a,b)=>Math.hypot(a[0]-lightView.x,a[1]-lightView.z)-Math.hypot(b[0]-lightView.x,b[1]-lightView.z))
      fills.forEach((l,i)=>{const p=locations[i];l.position.set(p[0],FLOOR+p[2],p[1]);l.intensity=input.lighting==='evening'?75:10})
      if(inspectView){camera.position.copy(inspectView.position);camera.lookAt(inspectView.target)}
      if(dirty){water?.update(now*.001,input.lighting);renderer.render(scene,camera);dirty=false;frameCount++}
      if(now-lastReport>500){report({location:locationAt(position),moving:path.length>0||Math.hypot(vx,vz)>.1,destination:path.length?destination:'',fps:Math.round(frameCount/((now-lastReport)/1000)),position:{...position},touring:tour});frameCount=0;lastReport=now}
    }
    renderer.render(scene,camera);frame=requestAnimationFrame(tick)
    return {dispose,stop,reset,pick,go:(point:Point,name?:string)=>{tour=false;return go(point,name)},tour(){stop();tour=true;tourIndex=1;dwell=0},getPosition:()=>({...position}),diagnostics:()=>({calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures}),inspect(view:{position:T.Vector3;target:T.Vector3}|null){inspectView=view;dirty=true},advance(dx:number,dz:number){position=moveSafely(position,dx,dz);dirty=true;return {...position}},walkable,
      setRoomMaterial(room:EditableRoomId,surface:EditableSurface,id:string|null){editor?.setMaterial(room,surface,id);dirty=true},
      setEditSelection(room:EditableRoomId|null,surface:EditableSurface|null){editor?.select(room&&surface?{room,surface}:null);dirty=true},
      pickEditSurface(clientX:number,clientY:number){return editor?.pick(clientX,clientY)??null},
      projectEditMarker(room:EditableRoomId,surface:EditableSurface){return editor?.project(room,surface)??{x:0,y:0,visible:false}}
    }
  }catch(e){dispose();throw e}
}
