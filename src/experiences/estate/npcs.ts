import * as T from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { floorAt, FLOOR, type Point } from './plan'
import { moveSafely, walkable } from './navigation'
import { advanceWalker } from './npc-motion'

type Navigator={path:(start:Point,end:Point)=>Point[]|null}
// Keep Kuna within the clear east-side kitchen aisle, directly in view of the
// saved Kitchen tour viewpoint. Reuse Estate navigation and collision boundaries.
export const KUNA_KITCHEN_STOPS:readonly Point[]=[
  {x:-13.35,z:8.15},{x:-13.3,z:7.2},{x:-13.1,z:8.85},
]

function foxModel(){
  const figure=new T.Group()
  figure.name='Kuna — kitchen fox'
  figure.userData.estateNPC=true
  const body=new T.Group();figure.add(body)
  const parts:T.BufferGeometry[]=[]
  function piece(geometry:T.BufferGeometry,color:number,x:number,y:number,z:number,sx:number,sy:number,sz:number){
    geometry.applyMatrix4(new T.Matrix4().compose(new T.Vector3(x,y,z),new T.Quaternion(),new T.Vector3(sx,sy,sz)))
    const tint=new T.Color(color),array=new Float32Array(geometry.getAttribute('position').count*3)
    for(let i=0;i<array.length;i+=3){array[i]=tint.r;array[i+1]=tint.g;array[i+2]=tint.b}
    geometry.setAttribute('color',new T.BufferAttribute(array,3))
    parts.push(geometry)
  }
  const ball=()=>new T.SphereGeometry(1,12,8)
  piece(ball(),0xc87539,0,.58,0,.28,.35,.37)            // coat
  piece(ball(),0xd58442,0,1.02,-.12,.26,.25,.26)        // head
  piece(ball(),0xfff0cc,0,.57,-.285,.185,.25,.12)       // chest
  piece(ball(),0xffecc9,0,.91,-.32,.20,.12,.14)         // muzzle
  piece(new T.ConeGeometry(1,1,6),0xd58442,-.17,1.29,-.12,.12,.29,.12)
  piece(new T.ConeGeometry(1,1,6),0xd58442,.17,1.29,-.12,.12,.29,.12)
  piece(new T.ConeGeometry(1,1,6),0x954e36,-.17,1.305,-.188,.065,.18,.035)
  piece(new T.ConeGeometry(1,1,6),0x954e36,.17,1.305,-.188,.065,.18,.035)
  piece(ball(),0x231d1b,-.105,1.04,-.327,.033,.044,.026)
  piece(ball(),0x231d1b,.105,1.04,-.327,.033,.044,.026)
  piece(ball(),0x2b211d,0,.88,-.457,.048,.039,.036)
  const merged=mergeGeometries(parts,false)
  parts.forEach(g=>g.dispose())
  if(!merged)throw new Error('Cannot assemble the Kuna model')
  const bodyMaterial=new T.MeshLambertMaterial({vertexColors:true})
  body.add(new T.Mesh(merged,bodyMaterial))

  const legGeometry=new T.BoxGeometry(.115,.35,.15),legMaterial=new T.MeshLambertMaterial({color:0x45342c})
  const legs:T.Group[]=[]
  for(const side of [-1,1])for(const front of [-1,1]){
    const joint=new T.Group();joint.position.set(side*.17,.40,front*.19)
    const paw=new T.Mesh(legGeometry,legMaterial);paw.position.y=-.175;joint.add(paw)
    figure.add(joint);legs.push(joint)
  }
  // A subtle world-space name tag makes the first character findable at child height.
  const nameCanvas=document.createElement('canvas')
  nameCanvas.width=256;nameCanvas.height=80
  const ctx=nameCanvas.getContext('2d')
  if(ctx){
    ctx.fillStyle='rgba(22,42,30,.83)'
    ctx.beginPath();ctx.roundRect(17,8,222,62,18);ctx.fill()
    ctx.fillStyle='#fff4d5';ctx.font='600 37px Arial, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle'
    ctx.fillText('Kuna',128,40)
  }
  const nameTexture=new T.CanvasTexture(nameCanvas)
  nameTexture.colorSpace=T.SRGBColorSpace
  const nameMaterial=new T.SpriteMaterial({map:nameTexture,transparent:true,depthWrite:false,depthTest:true})
  const nameTag=new T.Sprite(nameMaterial);nameTag.scale.set(1.04,.32,1);nameTag.position.y=1.68;figure.add(nameTag)
  const tail=new T.Group();tail.position.set(0,.69,.28);figure.add(tail)
  const tailGeometry=new T.SphereGeometry(1,10,8)
  const tailCoat=new T.MeshLambertMaterial({color:0xc87539})
  const tailTip=new T.MeshLambertMaterial({color:0xffedcf})
  const plume=new T.Mesh(tailGeometry,tailCoat);plume.position.set(0,.15,.28);plume.scale.set(.18,.21,.43);tail.add(plume)
  const tip=new T.Mesh(tailGeometry,tailTip);tip.position.set(0,.26,.57);tip.scale.set(.145,.15,.18);tail.add(tip)

  return {figure,body,legs,tail,dispose(){
    merged.dispose();bodyMaterial.dispose();legGeometry.dispose();legMaterial.dispose()
    tailGeometry.dispose();tailCoat.dispose();tailTip.dispose();nameMaterial.dispose();nameTexture.dispose()
  }}
}

export function createKunaWanderer(scene:T.Scene,navigator:Navigator){
  const stops=KUNA_KITCHEN_STOPS.filter(p=>walkable(p,.48))
  const model=foxModel()
  scene.add(model.figure)
  if(!stops.length){model.figure.visible=false;return {update(){},dispose(){scene.remove(model.figure);model.dispose()}}}
  let position:Point={...stops[0]},route:Point[]=[],nextStop=1,dwell=1.2,age=0
  model.figure.position.set(position.x,floorAt(position)??FLOOR,position.z)
  function routeToNextStop(){
    for(let i=0;i<stops.length;i++){
      const goal=stops[nextStop++%stops.length]
      const planned=navigator.path(position,goal)
      if(planned?.length){route=planned;return}
    }
    route=[];dwell=3
  }
  function update(dt:number,player:Point){
    const elapsed=Math.max(0,Math.min(.1,dt))
    age+=elapsed
    let walking=false
    const nearPlayer=Math.hypot(player.x-position.x,player.z-position.z)<1.3
    if(!nearPlayer){
      if(dwell>0)dwell=Math.max(0,dwell-elapsed)
      else{
        if(!route.length)routeToNextStop()
        if(route.length){
          const result=advanceWalker(position,route,.82,elapsed)
          const actual=moveSafely(position,result.point.x-position.x,result.point.z-position.z)
          const dx=actual.x-position.x,dz=actual.z-position.z
          if(Math.hypot(dx,dz)>.001){
            position=actual;route=result.remaining;walking=true
            const heading=Math.atan2(-dx,-dz),turn=Math.atan2(Math.sin(heading-model.figure.rotation.y),Math.cos(heading-model.figure.rotation.y))
            model.figure.rotation.y+=turn*(1-Math.exp(-elapsed*5))
            if(!route.length)dwell=1.5
          }else if(result.moved>.001){route=[];dwell=2}
        }
      }
    }
    const gait=walking?1:0
    model.legs.forEach((leg,i)=>{const target=Math.sin(age*9+((i===0||i===3)?0:Math.PI))*.32*gait;leg.rotation.x+=(target-leg.rotation.x)*Math.min(1,elapsed*12)})
    model.body.position.y=(walking?Math.sin(age*18)*.016:Math.sin(age*2)*.008)
    model.tail.rotation.y=Math.sin(age*2.8)*.25
    model.tail.rotation.x=.18+Math.sin(age*2.2)*.075
    model.figure.position.set(position.x,(floorAt(position)??FLOOR)+.012,position.z)
  }
  return {update,dispose(){scene.remove(model.figure);model.dispose()}}
}
