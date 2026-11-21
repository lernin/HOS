import * as T from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { floorAt, FLOOR, type Point } from './plan'
import { createKunaNavigator, KUNA_HOME, KUNA_RADIUS, KUNA_KITCHEN_GOALS } from './npc-navigation'
import { createKunaBehavior, KUNA_MAX_SPEED, KUNA_FOLLOW_SPEED } from './npc-behavior'
import { createKunaRig } from '../../characters/kuna/rig'
import type { KunaVoicePhase } from '../../characters/kuna/expressions'
import { createKunaCompanionSession } from '../../characters/kuna/companion-session'

// The exact original Procedia avatar; no surrogate 3D character.
export const PROCEDIA_KUNA_MODEL='/models/fox-mascot.glb'
export const KUNA_HEIGHT=.78

function makeLabel(){
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=80
  const ctx=canvas.getContext('2d')
  if(ctx){
    ctx.fillStyle='rgba(22,42,30,.83)';ctx.beginPath();ctx.roundRect(17,8,222,62,18);ctx.fill()
    ctx.fillStyle='#fff4d5';ctx.font='600 37px Arial, sans-serif'
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('Kuna',128,40)
  }
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace
  const material=new T.SpriteMaterial({map:texture,transparent:true,depthWrite:false,depthTest:true})
  const sprite=new T.Sprite(material);sprite.scale.set(.84,.26,1);sprite.position.y=KUNA_HEIGHT+.22
  return {sprite,dispose(){texture.dispose();material.dispose()}}
}

type Navigator={path:(start:Point,end:Point)=>Point[]|null}
export function createKunaWanderer(scene:T.Scene,_playerNavigator:Navigator,signal?:AbortSignal){
  const nav=createKunaNavigator()
  const behavior=createKunaBehavior(nav,KUNA_HOME)
  const figure=new T.Group();figure.name='Kuna — Procedia fox, collision-safe kitchen walker'
  figure.userData.estateNPC=true;figure.visible=false;scene.add(figure)
  const label=makeLabel();figure.add(label.sprite)
  let model:T.Group|null=null,rig:ReturnType<typeof createKunaRig>|null=null
  const session=createKunaCompanionSession()
  let wasFollowing=false,phase:KunaVoicePhase='idle',energy=0,disposed=false,failed=false
  let followTarget:Point|null=null,followSide:1|-1=1
  let lastPlayer:Point={...KUNA_HOME},lastPlayerYaw=0
  const center=new T.Vector3(),toCenter=new T.Vector3()
  const homeY=floorAt(KUNA_HOME)??FLOOR
  figure.position.set(KUNA_HOME.x,homeY,KUNA_HOME.z)

  // Debug-only map: ?kunaDebug=1 renders the SAME footprints and waypoints
  // used by collision checks. Never render on the normal child-facing screen.
  const showDebug=typeof window!=='undefined'&&new URLSearchParams(window.location.search).get('kunaDebug')==='1'
  const debug=new T.Group(),debugResources:(T.BufferGeometry|T.Material)[]=[]
  if(showDebug){
    scene.add(debug)
    const obstacleMaterial=new T.LineBasicMaterial({color:0xee7777,depthTest:false}),goalMaterial=new T.MeshBasicMaterial({color:0x4bf2a8,depthTest:false})
    debugResources.push(obstacleMaterial,goalMaterial)
    for(const r of nav.debugObstacles){
      const y=homeY+.055,points=[
        new T.Vector3(r.x1,y,r.z1),new T.Vector3(r.x2,y,r.z1),
        new T.Vector3(r.x2,y,r.z2),new T.Vector3(r.x1,y,r.z2),
      ]
      const geometry=new T.BufferGeometry().setFromPoints(points)
      debugResources.push(geometry);debug.add(new T.LineLoop(geometry,obstacleMaterial))
    }
    for(const p of KUNA_KITCHEN_GOALS){
      const geometry=new T.SphereGeometry(.115,8,6);debugResources.push(geometry)
      const marker=new T.Mesh(geometry,goalMaterial);marker.position.set(p.x,homeY+.12,p.z)
      debug.add(marker)
    }
    const geometry=new T.RingGeometry(KUNA_RADIUS-.018,KUNA_RADIUS+.018,36)
    geometry.rotateX(-Math.PI/2);debugResources.push(geometry)
    const outline=new T.Mesh(geometry,new T.MeshBasicMaterial({color:0x7caaff,side:T.DoubleSide,depthTest:false}))
    debugResources.push(outline.material);outline.position.set(KUNA_HOME.x,homeY+.08,KUNA_HOME.z)
    outline.name='Kuna collision envelope';debug.add(outline)
    debug.userData.setPosition=(p:Point)=>outline.position.set(p.x,homeY+.08,p.z)
  }

  new GLTFLoader().load(PROCEDIA_KUNA_MODEL,gltf=>{
    if(disposed||signal?.aborted){
      gltf.scene.traverse(o=>{if((o as T.Mesh).isMesh){const m=o as T.Mesh;m.geometry?.dispose()
        const materials=Array.isArray(m.material)?m.material:[m.material];materials.forEach(v=>v?.dispose())}})
      return
    }
    model=gltf.scene;model.updateWorldMatrix(true,true)
    const bounds=new T.Box3().setFromObject(model),size=new T.Vector3()
    bounds.getSize(size)
    if(size.y>.001){
      model.scale.setScalar(KUNA_HEIGHT/size.y);model.updateWorldMatrix(true,true)
      bounds.setFromObject(model);const mid=bounds.getCenter(new T.Vector3())
      model.position.set(-mid.x,-bounds.min.y,-mid.z)
    }
    figure.add(model)
    rig=createKunaRig(model,gltf.animations)
    figure.visible=nav.goals.length>=2
    if(!rig.hasWalk)console.warn('Kuna Walk clip is missing; keeping Kuna stationary')
    if(!rig.hasSit)console.warn('Kuna Sit clip is missing; using an upright listening pose')
  },undefined,error=>{failed=true;console.warn('Unable to load Procedia Kuna model',error)})

  function update(dt:number,player:Point,playerYaw=lastPlayerYaw){
    const elapsed=Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0))
    const playerStep=Math.hypot(player.x-lastPlayer.x,player.z-lastPlayer.z)
    lastPlayer={...player};lastPlayerYaw=playerYaw
    if(!model||!figure.visible)return
    // A conversation is a *persistent engagement*, not just a TTS clip.
    // Finishing a spoken reply leaves Kuna sitting. Real player movement
    // ends sitting and starts an obstacle-aware companion walk.
    const mode=session.update(player)
    const engaged=mode==='engaged',following=mode==='following'
    if(following&&!wasFollowing){
      wasFollowing=true;followTarget=null
      const frame=behavior.snapshot()
      // Pick the side that requires less travel. Don't flip sides every turn.
      const right={x:player.x+Math.cos(playerYaw)*.85-Math.sin(playerYaw)*1.65,
                   z:player.z-Math.sin(playerYaw)*.85-Math.cos(playerYaw)*1.65}
      const left={x:player.x-Math.cos(playerYaw)*.85-Math.sin(playerYaw)*1.65,
                  z:player.z+Math.sin(playerYaw)*.85-Math.cos(playerYaw)*1.65}
      followSide=Math.hypot(frame.position.x-right.x,frame.position.z-right.z)<
                 Math.hypot(frame.position.x-left.x,frame.position.z-left.z)?1:-1
    }
    if(!following)wasFollowing=false
    if(following){
      // Prefer a point in view (ahead and to one side), not behind the camera.
      // Follow the child's direction of travel, not rapid head/camera turns.
      // Freeze the last safe anchor when the child stops to prevent orbiting.
      if(playerStep>.008||!followTarget){
        const ahead={x:-Math.sin(playerYaw),z:-Math.cos(playerYaw)}
        const right={x:Math.cos(playerYaw),z:-Math.sin(playerYaw)}
        const candidate=(side:1|-1):Point=>({
          x:player.x+ahead.x*1.65+right.x*side*.85,
          z:player.z+ahead.z*1.65+right.z*side*.85,
        })
        const preferred=candidate(followSide)
        if(nav.isSafe(preferred))followTarget=preferred
        else {
          const other=candidate(followSide===1?-1:1)
          if(nav.isSafe(other)){followTarget=other;followSide=followSide===1?-1:1}
          else followTarget=null // Never route through walls or teleport outside Kitchen
        }
      }
    }
    // Keep the collision body parked throughout Sit and reverse Stand.
    const holding=engaged||Boolean(rig?.isTransitioning())||(following&&!followTarget)
    const frame=rig?.hasWalk?
      behavior.update(elapsed,player,holding,following&&!holding?followTarget:null):
      behavior.update(elapsed,player,true)
    figure.position.set(frame.position.x,(floorAt(frame.position)??homeY)+.012,frame.position.z)
    figure.rotation.y=frame.yaw
    const turnSteps=frame.phase==='turn'&&!holding
    rig?.update(elapsed,{
      active:engaged,phase,
      speedFraction:rig.hasWalk?Math.min(1,frame.speed/(following?1.1:KUNA_MAX_SPEED)):0,
      runFraction:following?Math.max(0,Math.min(1,(frame.speed-1.15)/(KUNA_FOLLOW_SPEED-1.55))):0,
      turning:turnSteps,
      jaw:energy,
    })
    if(showDebug)debug.userData.setPosition?.(frame.position)
  }
  return {
    update,
    hit(ray:T.Ray){
      if(!figure.visible||!model)return false
      const p=behavior.snapshot().position
      center.set(p.x,(floorAt(p)??homeY)+KUNA_HEIGHT*.56,p.z)
      const along=toCenter.copy(center).sub(ray.origin).dot(ray.direction)
      return along>0&&along<8&&ray.distanceSqToPoint(center)<.52*.52
    },
    engage(player:Point){session.engage(player);wasFollowing=false;followTarget=null},
    disengage(){session.end();wasFollowing=false;followTarget=null;phase='idle';energy=0},
    mode:()=>session.mode(),
    setTalking(_active:boolean,jaw=0){energy=Math.max(0,Math.min(1,jaw))},
    setPhase(next:KunaVoicePhase){phase=next},
    status(){return failed?'error':model?'ready':'loading'},
    dispose(){
      disposed=true;scene.remove(figure);label.dispose()
      if(showDebug){scene.remove(debug);debugResources.forEach(v=>v.dispose())}
      rig?.dispose()
      model?.traverse(o=>{if((o as T.Mesh).isMesh){const m=o as T.Mesh;m.geometry?.dispose()
        const materials=Array.isArray(m.material)?m.material:[m.material];materials.forEach(v=>v?.dispose())}})
    },
  }
}
