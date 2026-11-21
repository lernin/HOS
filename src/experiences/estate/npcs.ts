import * as T from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { floorAt, FLOOR, type Point } from './plan'
import { moveSafely, walkable } from './navigation'
import { advanceWalker } from './npc-motion'

type Navigator={path:(start:Point,end:Point)=>Point[]|null}
// Match Procedia's deployed SpeakingAvatar GLB exactly. The Vercel rewrite below
// retrieves this same asset from Procedia; no lookalike meshes are constructed.
export const PROCEDIA_KUNA_MODEL='/models/fox-mascot.glb'
export const KUNA_KITCHEN_STOPS:readonly Point[]=[
  {x:-13.35,z:8.15},{x:-13.3,z:7.2},{x:-13.1,z:8.85},
]
function makeLabel(){
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=80
  const ctx=canvas.getContext('2d')
  if(ctx){ctx.fillStyle='rgba(22,42,30,.83)';ctx.beginPath();ctx.roundRect(17,8,222,62,18);ctx.fill();ctx.fillStyle='#fff4d5';ctx.font='600 37px Arial, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('Kuna',128,40)}
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace
  const material=new T.SpriteMaterial({map:texture,transparent:true,depthWrite:false,depthTest:true})
  const sprite=new T.Sprite(material);sprite.scale.set(1.04,.32,1);sprite.position.y=1.71
  return {sprite,dispose(){texture.dispose();material.dispose()}}
}
export function createKunaWanderer(scene:T.Scene,navigator:Navigator,signal?:AbortSignal){
  const stops=KUNA_KITCHEN_STOPS.filter(p=>walkable(p,.48))
  const figure=new T.Group();figure.name='Kuna — Procedia speaking fox';figure.userData.estateNPC=true;figure.visible=false
  scene.add(figure)
  const label=makeLabel();figure.add(label.sprite)
  let model:T.Group|null=null,mixer:T.AnimationMixer|null=null
  let idle:T.AnimationAction|null=null,walk:T.AnimationAction|null=null
  let chin:T.Object3D|null=null,chinBase:T.Quaternion|null=null
  let position:Point=stops.length?{...stops[0]}:{x:-13.35,z:8.15}
  let route:Point[]=[],nextStop=1,dwell=1.2,focus=false,speaking=false,energy=0,disposed=false,failed=false,now=0,isWalking=false
  const center=new T.Vector3(),target=new T.Vector3()
  figure.position.set(position.x,floorAt(position)??FLOOR,position.z)
  const loader=new GLTFLoader()
  loader.load(PROCEDIA_KUNA_MODEL,gltf=>{
    if(disposed||signal?.aborted){gltf.scene.traverse(o=>{if((o as T.Mesh).isMesh){const m=o as T.Mesh;m.geometry?.dispose();const materials=Array.isArray(m.material)?m.material:[m.material];materials.forEach(t=>t?.dispose())}});return}
    model=gltf.scene
    // Procedia's SpeakingAvatar normalizes this exact GLB to 1.29 world units.
    model.updateWorldMatrix(true,true)
    const bounds=new T.Box3().setFromObject(model),size=new T.Vector3()
    bounds.getSize(size)
    if(size.y>.001){model.scale.setScalar(1.29/size.y);model.updateWorldMatrix(true,true);bounds.setFromObject(model);const mid=bounds.getCenter(new T.Vector3());model.position.set(-mid.x,-bounds.min.y,-mid.z)}
    figure.add(model)
    chin=model.getObjectByName('Chin')??null
    const clips=gltf.animations.map(c=>{
      if(!/idle/i.test(c.name))return c
      const clean=c.clone()
      clean.tracks=clean.tracks.filter(t=>!(/^(Chin|Chin_Tip)\.rotation$/.test(t.name)))
      return clean
    })
    mixer=new T.AnimationMixer(model)
    const idleClip=clips.find(c=>c.name==='Idle')??clips.find(c=>/idle/i.test(c.name))??clips.find(c=>/survey/i.test(c.name))??clips[0]
    const walkClip=clips.find(c=>/^walk$/i.test(c.name))??clips.find(c=>/walk/i.test(c.name))
    if(idleClip){idle=mixer.clipAction(idleClip);idle.setLoop(T.LoopRepeat,Infinity);idle.timeScale=.64;idle.play()}
    if(walkClip){walk=mixer.clipAction(walkClip);walk.setLoop(T.LoopRepeat,Infinity)}
    figure.visible=Boolean(stops.length)
  },undefined,err=>{failed=true;console.warn('Unable to load Procedia Kuna model',err)})
  function routeToNextStop(){
    for(let i=0;i<stops.length;i++){
      const goal=stops[nextStop++%stops.length],planned=navigator.path(position,goal)
      if(planned?.length){route=planned;return}
    }
    route=[];dwell=3
  }
  function update(dt:number,player:Point){
    const elapsed=Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0))
    if(!model||!figure.visible)return
    now+=elapsed
    const nearPlayer=Math.hypot(player.x-position.x,player.z-position.z)<1.3
    let moving=false
    if(!focus&&!nearPlayer&&walk){
      if(dwell>0)dwell=Math.max(0,dwell-elapsed)
      else {
        if(!route.length)routeToNextStop()
        if(route.length){
          const step=advanceWalker(position,route,.72,elapsed)
          const next=moveSafely(position,step.point.x-position.x,step.point.z-position.z)
          const dx=next.x-position.x,dz=next.z-position.z
          if(Math.hypot(dx,dz)>.001){
            position=next;route=step.remaining;moving=true
            const heading=Math.atan2(dx,dz)
            const delta=Math.atan2(Math.sin(heading-figure.rotation.y),Math.cos(heading-figure.rotation.y))
            figure.rotation.y+=delta*(1-Math.exp(-elapsed*4))
            if(!route.length)dwell=1.35
          }else if(step.moved>.001){route=[];dwell=2}
        }
      }
    }
    if(moving!==isWalking){
      isWalking=moving
      if(moving){idle?.fadeOut(.3);walk?.reset().fadeIn(.3).play()}
      else {walk?.fadeOut(.3);idle?.reset().fadeIn(.3).play()}
    }
    if(focus&&!moving){
      const yaw=Math.atan2(player.x-position.x,player.z-position.z)
      const diff=Math.atan2(Math.sin(yaw-figure.rotation.y),Math.cos(yaw-figure.rotation.y))
      figure.rotation.y+=diff*(1-Math.exp(-elapsed*3))
    }
    mixer?.update(elapsed)
    if(chin){
      if(!chinBase)chinBase=chin.quaternion.clone()
      const open=speaking?Math.max(.03,energy):0
      const jaw=new T.Quaternion().setFromEuler(new T.Euler(.381*open,0,0))
      chin.quaternion.copy(chinBase).multiply(jaw)
    }
    figure.position.set(position.x,(floorAt(position)??FLOOR)+.012,position.z)
  }
  return {
    update,
    hit(ray:T.Ray){
      if(!figure.visible||!model)return false
      center.set(position.x,(floorAt(position)??FLOOR)+.81,position.z)
      target.copy(center).sub(ray.origin)
      const along=target.dot(ray.direction)
      return along>0&&along<8&&ray.distanceSqToPoint(center)<.68*.68
    },
    setTalking(active:boolean,jaw=0){focus=active;speaking=active&&jaw>0;energy=Math.max(0,Math.min(1,jaw));if(active){route=[];dwell=1.5}},
    status(){return failed?'error':model?'ready':'loading'},
    dispose(){
      disposed=true;scene.remove(figure);label.dispose();mixer?.stopAllAction();mixer?.uncacheRoot(model!)
      model?.traverse(o=>{if((o as T.Mesh).isMesh){const m=o as T.Mesh;m.geometry?.dispose();const materials=Array.isArray(m.material)?m.material:[m.material];materials.forEach(t=>t?.dispose())}})
    },
  }
}
