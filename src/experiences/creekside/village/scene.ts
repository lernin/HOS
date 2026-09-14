import * as T from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { createGridNavigator, moveSafely, type NavigationSurface, type NavPoint } from '../../shared3d/navigation'
import {
  EYE_HEIGHT, PLAYER_RADIUS, WORLD_X, WORLD_Z, bridges, bridgeDeckY, canStand,
  doorLocalX, floorHeight, houses, insideHouse, localCoords, pathLines, riverCenter,
  riverWidth, spawn, terrainHeight, waterHeight, zoneName,
  type BridgeSpec, type HouseSpec, type Point,
} from './world'

export type VillageInput = { x:number; z:number; yaw:number; pitch:number; paused:boolean; speed:number; lookedAt:number; fast:boolean }
export type VillageState = { position:Point; zone:string; fps:number; moving:boolean; destination:string }
export type VillagePick = { kind:'floor' } | { kind:'door'; label:string; open:boolean; enterable:boolean }

type ModelMap = Record<string, T.Object3D>
type V3 = [number, number, number]
type DoorState = {
  id:string
  label:string
  enterable:boolean
  pivot:T.Group
  panels:T.Object3D[]
  angle:number
  target:number
}
type NaturePlacement = { x:number; z:number; kind:'tree'|'tree-b'|'pine'|'bush'|'fern'|'rock'; height:number; angle:number }

const names = [
  'Wall_Plaster_Door_Round','Wall_Plaster_Window_Wide_Round','Wall_Plaster_Window_Thin_Round','Wall_Plaster_Straight','Wall_Plaster_WoodGrid',
  'Wall_UnevenBrick_Door_Round','Wall_UnevenBrick_Window_Wide_Round','Wall_UnevenBrick_Window_Thin_Round','Wall_UnevenBrick_Straight',
  'Floor_WoodDark','Floor_UnevenBrick','Roof_RoundTiles_4x4','Roof_RoundTiles_4x6','Roof_RoundTiles_6x4','Roof_RoundTiles_6x6','Roof_Tower_RoundTiles',
  'Balcony_Cross_Straight','Balcony_Simple_Straight','Prop_Chimney','Prop_Chimney2','Prop_Crate','Prop_Wagon','Prop_Vine1','Prop_Vine2','Prop_WoodenFence_Single','Door_2_Round',
] as const
const STORY = 3.12
const UP = new T.Vector3(0,1,0)

function rng(seed:number){let n=seed>>>0;return()=>{n=Math.imul(n^(n>>>15),1|n);n^=n+Math.imul(n^(n>>>7),61|n);return((n^(n>>>14))>>>0)/4294967296}}

function ribbon(points:T.Vector3[], halfWidths:number[]){
  const vertices:number[]=[]
  const indices:number[]=[]
  for(let i=0;i<points.length;i++){
    const a=points[Math.max(0,i-1)], b=points[Math.min(points.length-1,i+1)]
    const dx=b.x-a.x, dz=b.z-a.z, length=Math.hypot(dx,dz)||1, nx=-dz/length, nz=dx/length, w=halfWidths[i]
    vertices.push(points[i].x+nx*w,points[i].y,points[i].z+nz*w, points[i].x-nx*w,points[i].y,points[i].z-nz*w)
    if(i<points.length-1){const k=i*2;indices.push(k,k+2,k+1,k+1,k+2,k+3)}
  }
  const geometry=new T.BufferGeometry()
  geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function samplePath(line:{x:number;z:number}[], steps=110){
  const curve=new T.CatmullRomCurve3(line.map(p=>new T.Vector3(p.x,0,p.z)),false,'catmullrom',.3)
  return curve.getPoints(steps).map(p=>new T.Vector3(p.x,floorHeight(p.x,p.z),p.z))
}

function segmentDistance(x:number,z:number,a:{x:number;z:number},b:{x:number;z:number}){
  const dx=b.x-a.x,dz=b.z-a.z,l2=dx*dx+dz*dz
  if(!l2)return Math.hypot(x-a.x,z-a.z)
  const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/l2))
  return Math.hypot(x-a.x-dx*t,z-a.z-dz*t)
}

function pathDistance(x:number,z:number){
  let distance=Infinity
  for(const line of pathLines)for(let i=1;i<line.length;i++)distance=Math.min(distance,segmentDistance(x,z,line[i-1],line[i]))
  return distance
}

function place(parent:T.Group,models:ModelMap,name:string,pos:V3,rot=0,scale:number|V3=1){
  const source=models[name]
  if(!source)return null
  const object=source.clone(true)
  object.position.set(...pos)
  object.rotation.y=rot
  Array.isArray(scale)?object.scale.set(...scale):object.scale.setScalar(scale)
  object.traverse(child=>{if(child instanceof T.Mesh){child.castShadow=true;child.receiveShadow=true}})
  parent.add(object)
  return object
}

function wall(style:HouseSpec['style'],part:'door'|'wide'|'thin'|'straight',upper=false){
  if(upper&&style==='timber'&&part==='straight')return 'Wall_Plaster_WoodGrid'
  const prefix=style==='brick'?'Wall_UnevenBrick':'Wall_Plaster'
  if(part==='door')return `${prefix}_Door_Round`
  if(part==='wide')return `${prefix}_Window_Wide_Round`
  if(part==='thin')return `${prefix}_Window_Thin_Round`
  return `${prefix}_Straight`
}

async function villageModels(signal:AbortSignal):Promise<ModelMap>{
  const urls=Array.from({length:6},(_,i)=>`/assets/village/village-kit-v2-${i}.part`)
  const chunks=await Promise.all(urls.map(async url=>{
    const response=await fetch(url,{signal})
    if(!response.ok)throw new Error(`Village art could not load (${response.status}).`)
    return new Uint8Array(await response.arrayBuffer())
  }))
  const length=chunks.reduce((sum,chunk)=>sum+chunk.byteLength,0)
  const packed=new Uint8Array(length)
  let offset=0
  for(const chunk of chunks){packed.set(chunk,offset);offset+=chunk.byteLength}
  if(typeof DecompressionStream==='undefined')throw new Error('This browser cannot unpack the village art yet.')
  const stream=new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'))
  const buffer=await new Response(stream).arrayBuffer()
  const loader=new GLTFLoader()
  const gltf=await new Promise<GLTF>((resolve,reject)=>loader.parse(buffer,'',resolve,reject))
  gltf.scene.updateMatrixWorld(true)

  const map:ModelMap={}
  for(const name of names){
    const found:T.Mesh[]=[]
    gltf.scene.traverse(object=>{
      if(!(object instanceof T.Mesh))return
      if(object.name.startsWith(`${name}__`)||object.parent?.name.startsWith(`${name}__`))found.push(object)
    })
    const group=new T.Group();group.name=name
    if(found.length){
      const parts:{geometry:T.BufferGeometry;material:T.Material|T.Material[]}[]=[]
      const bounds=new T.Box3()
      for(const mesh of found){
        const geometry=mesh.geometry.clone()
        geometry.applyMatrix4(mesh.matrixWorld)
        geometry.computeBoundingBox()
        if(geometry.boundingBox)bounds.union(geometry.boundingBox)
        parts.push({geometry,material:mesh.material})
      }
      const center=bounds.getCenter(new T.Vector3())
      for(const part of parts){
        part.geometry.translate(-center.x,-bounds.min.y,-center.z)
        const mesh=new T.Mesh(part.geometry,part.material)
        mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh)
      }
    }
    map[name]=group
  }
  return map
}

function addHouseSide(group:T.Group,models:ModelMap,house:HouseSpec,which:'front'|'back'|'left'|'right',y:number,story:number){
  const horizontal=which==='front'||which==='back', length=horizontal?house.w:house.d, count=length/2, front=which==='front'
  for(let i=0;i<count;i++){
    const d=-length/2+1+i*2
    const x=horizontal?d:which==='right'?house.w/2:-house.w/2
    const z=horizontal?(front?house.d/2:-house.d/2):d
    const rotation=which==='front'?0:which==='back'?Math.PI:which==='right'?-Math.PI/2:Math.PI/2
    let part:'door'|'wide'|'thin'|'straight'=i%2?'wide':'straight'
    if(story===0&&front&&i===Math.floor((count-1)/2))part='door'
    else if(story===0&&!front&&i%2===0)part='thin'
    if(story>0)part=(i+story)%2?'wide':'straight'
    place(group,models,wall(house.style,part,story>0),[x,y,z],rotation)
  }
}

function addDoor(group:T.Group,models:ModelMap,house:HouseSpec,doors:Map<string,DoorState>){
  const x=doorLocalX(house), z=house.d/2+.07, hinge=x-.5
  const pivot=new T.Group();pivot.position.set(hinge,0,z);pivot.name=`${house.label} door hinge`
  let panel:T.Object3D
  const source=models.Door_2_Round
  if(source&&source.children.length){panel=source.clone(true);panel.position.set(.5,0,0)}
  else{
    const mesh=new T.Mesh(new T.BoxGeometry(1,2.05,.1),new T.MeshStandardMaterial({color:'#694129',roughness:.9}))
    mesh.position.set(.5,1.025,0);panel=mesh
  }
  const panels:T.Object3D[]=[]
  panel.traverse(object=>{
    if(object instanceof T.Mesh){object.castShadow=true;object.receiveShadow=true;object.userData.villageDoor=house.id;panels.push(object)}
  })
  pivot.add(panel);group.add(pivot)
  doors.set(house.id,{id:house.id,label:house.label,enterable:house.enterable,pivot,panels,angle:0,target:0})
}

function house(scene:T.Scene,models:ModelMap,spec:HouseSpec,doors:Map<string,DoorState>){
  const group=new T.Group();group.position.set(spec.x,spec.y+.035,spec.z);group.rotation.y=spec.rot;group.scale.setScalar(spec.scale);group.name=spec.label
  const floor=spec.style==='brick'?'Floor_UnevenBrick':'Floor_WoodDark'
  for(let x=-spec.w/2+1;x<=spec.w/2-1;x+=2)for(let z=-spec.d/2+1;z<=spec.d/2-1;z+=2)place(group,models,floor,[x,0,z])
  for(let story=0;story<spec.stories;story++){
    const y=story*STORY
    addHouseSide(group,models,spec,'front',y,story);addHouseSide(group,models,spec,'back',y,story);addHouseSide(group,models,spec,'left',y,story);addHouseSide(group,models,spec,'right',y,story)
  }
  const roof=spec.roof==='tower'?'Roof_Tower_RoundTiles':`Roof_RoundTiles_${spec.roof}`
  place(group,models,roof,[0,spec.stories*STORY-.025,0])
  if(spec.balcony)for(let x=-spec.w/2+1;x<=spec.w/2-1;x+=2)place(group,models,spec.style==='timber'?'Balcony_Cross_Straight':'Balcony_Simple_Straight',[x,STORY+.04,spec.d/2])
  place(group,models,spec.id.includes('workshop')||spec.id==='mill-house'?'Prop_Chimney2':'Prop_Chimney',[spec.w/2-1,spec.stories*STORY+.16,-.45])
  if(spec.props==='workshop'){place(group,models,'Prop_Crate',[-spec.w/2-.7,0,spec.d/2+.85],-.15);place(group,models,'Prop_Wagon',[spec.w/2+1.5,0,.35],-1.1)}
  if(spec.props==='garden'){place(group,models,'Prop_Vine1',[-spec.w/2+.2,.12,spec.d/2+.04]);for(let i=-2;i<=2;i+=2)place(group,models,'Prop_WoodenFence_Single',[i,0,spec.d/2+3.2],0)}
  if(spec.props==='inn'){place(group,models,'Prop_Crate',[spec.w/2+.9,0,spec.d/2+.65]);place(group,models,'Prop_Vine2',[spec.w/2-.15,.08,spec.d/2+.04])}
  addDoor(group,models,spec,doors)
  scene.add(group)
}

function beamBetween(a:T.Vector3,b:T.Vector3,thickness:number,material:T.Material){
  const delta=b.clone().sub(a),length=delta.length()
  const mesh=new T.Mesh(new T.BoxGeometry(length,thickness,thickness),material)
  mesh.position.copy(a).add(b).multiplyScalar(.5)
  mesh.quaternion.setFromUnitVectors(new T.Vector3(1,0,0),delta.normalize())
  mesh.castShadow=true;mesh.receiveShadow=true
  return mesh
}

function bridge(scene:T.Scene,spec:BridgeSpec){
  const group=new T.Group();group.name=spec.label
  const wood=new T.MeshStandardMaterial({color:spec.id==='market-bridge'?'#765038':'#835b38',roughness:.94})
  const dark=new T.MeshStandardMaterial({color:'#4a3223',roughness:.98})
  const length=spec.halfLength*2,steps=Math.max(18,Math.ceil(length/.48)),step=length/steps
  for(let i=0;i<steps;i++){
    const x=spec.x-spec.halfLength+(i+.5)*step,y=bridgeDeckY(spec,x),left=bridgeDeckY(spec,x-step*.35),right=bridgeDeckY(spec,x+step*.35)
    const plank=new T.Mesh(new T.BoxGeometry(step*.96,.14,spec.halfWidth*2),wood)
    plank.position.set(x,y,spec.z);plank.rotation.z=Math.atan2(right-left,step*.7);plank.castShadow=true;plank.receiveShadow=true;group.add(plank)
  }
  if(spec.rails)for(const side of[-1,1]){
    const points:T.Vector3[]=[];const count=Math.max(7,Math.ceil(length/1.45))
    for(let i=0;i<=count;i++){
      const u=i/count,x=spec.x-spec.halfLength+length*u,y=bridgeDeckY(spec,x),z=spec.z+side*(spec.halfWidth-.16)
      const post=new T.Mesh(new T.BoxGeometry(.13,1.05,.13),dark);post.position.set(x,y+.52,z);post.castShadow=true;group.add(post);points.push(new T.Vector3(x,y+.9,z))
    }
    for(let i=1;i<points.length;i++)group.add(beamBetween(points[i-1],points[i],.12,dark))
  }
  for(const u of[.25,.5,.75]){
    const x=spec.x-spec.halfLength+length*u,deck=bridgeDeckY(spec,x),ground=terrainHeight(x,spec.z),height=Math.max(.5,deck-ground)
    for(const side of[-.72,.72]){const post=new T.Mesh(new T.BoxGeometry(.18,height,.18),dark);post.position.set(x,ground+height/2,spec.z+side);post.castShadow=true;group.add(post)}
  }
  scene.add(group)
}

function terrain(scene:T.Scene){
  const geometry=new T.PlaneGeometry(WORLD_X*2,WORLD_Z*2,180,160);geometry.rotateX(-Math.PI/2)
  const position=geometry.attributes.position as T.BufferAttribute,colors:number[]=[],color=new T.Color()
  for(let i=0;i<position.count;i++){
    const x=position.getX(i),z=position.getZ(i),y=terrainHeight(x,z);position.setY(i,y)
    const creek=Math.abs(x-riverCenter(z)),edge=Math.max(Math.abs(x)/WORLD_X,Math.abs(z)/WORLD_Z)
    const light=.31+.035*Math.sin(x*.027+z*.019)+.025*Math.cos(z*.041)+(creek<18?.025:0)-(edge>.78?.025:0)
    color.setHSL(.245,.35,light+Math.max(-.025,Math.min(.035,y*.006)));colors.push(color.r,color.g,color.b)
  }
  position.needsUpdate=true;geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));geometry.computeVertexNormals()
  const mesh=new T.Mesh(geometry,new T.MeshStandardMaterial({vertexColors:true,roughness:1}));mesh.receiveShadow=true;mesh.name='Village terrain';scene.add(mesh)
  return mesh
}

function trails(scene:T.Scene){
  const shoulder=new T.MeshStandardMaterial({color:'#816f4e',roughness:1}),center=new T.MeshStandardMaterial({color:'#c2aa7b',roughness:.98})
  for(const line of pathLines){
    const points=samplePath(line)
    for(const [halfWidth,lift,material] of [[3.2,.035,shoulder],[2.35,.055,center]] as const){
      const raised=points.map(p=>new T.Vector3(p.x,p.y+lift,p.z)),mesh=new T.Mesh(ribbon(raised,raised.map(()=>halfWidth)),material);mesh.receiveShadow=true;scene.add(mesh)
    }
  }
}

function creek(scene:T.Scene){
  const points:T.Vector3[]=[],widths:number[]=[]
  for(let z=-WORLD_Z+3;z<=WORLD_Z-3;z+=1.6){points.push(new T.Vector3(riverCenter(z),waterHeight(z),z));widths.push(riverWidth(z)/2)}
  const uniforms={time:{value:0}}
  const material=new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms,vertexShader:`varying vec3 vWorld;void main(){vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,fragmentShader:`uniform float time;varying vec3 vWorld;void main(){float wave=.5+.5*sin(vWorld.z*.52+time*.85)+.2*sin(vWorld.x*.88-time*.55);vec3 a=vec3(.10,.43,.54),b=vec3(.27,.68,.70);gl_FragColor=vec4(mix(a,b,clamp(.25+wave*.5,0.,1.)),.8);}`})
  const mesh=new T.Mesh(ribbon(points,widths),material);mesh.renderOrder=2;scene.add(mesh)
  return {uniforms}
}

function generateNature(){
  const random=rng(94521),placements:NaturePlacement[]=[]
  const blocked=(x:number,z:number,margin:number)=>{
    if(Math.abs(x-riverCenter(z))<riverWidth(z)/2+margin)return true
    if(pathDistance(x,z)<margin+3.5)return true
    if(houses.some(h=>insideHouse(x,z,h,margin+5)))return true
    return false
  }
  let trees=0
  for(let tries=0;tries<15000&&trees<820;tries++){
    const x=(random()*2-1)*(WORLD_X-5),z=(random()*2-1)*(WORLD_Z-5),edge=Math.max(Math.abs(x)/WORLD_X,Math.abs(z)/WORLD_Z)
    if(blocked(x,z,4.8))continue
    if(edge<.3&&random()<.78)continue
    if(edge<.52&&random()<.35)continue
    const roll=random(),kind:NaturePlacement['kind']=roll<.34?'pine':roll<.67?'tree':'tree-b'
    placements.push({x,z,kind,height:8.5+random()*9.5,angle:random()*Math.PI*2});trees++
  }
  let low=0
  for(let tries=0;tries<9000&&low<420;tries++){
    const x=(random()*2-1)*(WORLD_X-4),z=(random()*2-1)*(WORLD_Z-4)
    if(blocked(x,z,2.6))continue
    placements.push({x,z,kind:random()<.55?'bush':'fern',height:.7+random()*1.1,angle:random()*Math.PI*2});low++
  }
  let rocks=0
  for(let tries=0;tries<5000&&rocks<150;tries++){
    const x=(random()*2-1)*(WORLD_X-4),z=(random()*2-1)*(WORLD_Z-4)
    if(blocked(x,z,2.2))continue
    placements.push({x,z,kind:'rock',height:.7+random()*1.7,angle:random()*Math.PI*2});rocks++
  }
  return placements
}

async function woodlandNature(scene:T.Scene,signal:AbortSignal,progress:(message:string)=>void){
  const placements=generateNature(),kinds=['tree','tree-b','pine','bush','fern','rock'] as const,loader=new GLTFLoader()
  for(let index=0;index<kinds.length;index++){
    const kind=kinds[index],response=await fetch(`/woodland/${kind}.glb`,{signal})
    if(!response.ok)throw new Error(`Woodland scenery could not load (${kind}).`)
    const gltf=await loader.parseAsync(await response.arrayBuffer(),'');gltf.scene.updateMatrixWorld(true)
    const box=new T.Box3().setFromObject(gltf.scene),size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3()),list=placements.filter(p=>p.kind===kind)
    gltf.scene.traverse(object=>{
      if(!(object instanceof T.Mesh))return
      const geometry=object.geometry.clone();geometry.applyMatrix4(object.matrixWorld);geometry.translate(-center.x,-box.min.y,-center.z);geometry.scale(1/Math.max(.001,size.y),1/Math.max(.001,size.y),1/Math.max(.001,size.y))
      const mesh=new T.InstancedMesh(geometry,object.material,list.length),dummy=new T.Object3D()
      list.forEach((placement,i)=>{dummy.position.set(placement.x,terrainHeight(placement.x,placement.z)-.03,placement.z);dummy.rotation.y=placement.angle;dummy.scale.setScalar(placement.height);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix)})
      mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();mesh.castShadow=kind==='tree'||kind==='tree-b'||kind==='pine'||kind==='rock';mesh.receiveShadow=true;scene.add(mesh)
    })
    progress(`Planting the woodland… ${index+1}/${kinds.length}`)
  }
}

export async function createVillage(canvas:HTMLCanvasElement,input:VillageInput,signal:AbortSignal,report:(state:VillageState)=>void,progress:(message:string)=>void){
  progress('Shaping the larger valley…')
  const renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.3));renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap
  const scene=new T.Scene();scene.background=new T.Color('#b9d8e3');scene.fog=new T.Fog('#bfd7d8',150,390)
  const camera=new T.PerspectiveCamera(67,1,.08,540);camera.rotation.order='YXZ'
  const hemi=new T.HemisphereLight('#f4fbff','#557044',1.75),sun=new T.DirectionalLight('#fff0ca',2.7);sun.castShadow=true;sun.shadow.mapSize.set(1536,1536);Object.assign(sun.shadow.camera,{left:-48,right:48,top:48,bottom:-48,near:1,far:160});sun.shadow.bias=-.0002;sun.shadow.normalBias=.04;scene.add(hemi,sun,sun.target)
  const ground=terrain(scene);trails(scene);progress('Running the river…');const water=creek(scene);bridges.forEach(spec=>bridge(scene,spec))

  progress('Opening the Quaternius workshop…');const models=await villageModels(signal)
  const doors=new Map<string,DoorState>();houses.forEach(spec=>house(scene,models,spec,doors))
  progress('Planting the woodland…');await woodlandNature(scene,signal,progress)
  houses.forEach(spec=>{const light=new T.PointLight('#ffd092',spec.stories===2?.68:.46,13,2),front={x:Math.sin(spec.rot)*(spec.d*spec.scale/2+1.2),z:Math.cos(spec.rot)*(spec.d*spec.scale/2+1.2)};light.position.set(spec.x+front.x,spec.y+2.2*spec.scale,spec.z+front.z);scene.add(light)})

  const openDoors=new Set<string>()
  const surface:NavigationSurface={minX:-WORLD_X+2,maxX:WORLD_X-2,minZ:-WORLD_Z+2,maxZ:WORLD_Z-2,cell:1.6,radius:PLAYER_RADIUS,maxGrade:1.1,walkable:(point,radius)=>canStand(point.x,point.z,radius,openDoors),heightAt:point=>Math.abs(point.x)>=WORLD_X||Math.abs(point.z)>=WORLD_Z?null:floorHeight(point.x,point.z)}
  let navigator=createGridNavigator(surface)
  const rebuildNavigator=()=>{navigator=createGridNavigator(surface)}
  const raycaster=new T.Raycaster(),mouse=new T.Vector2(),marker=new T.Mesh(new T.RingGeometry(.55,.72,36),new T.MeshBasicMaterial({color:'#f4d591',transparent:true,opacity:.9,side:T.DoubleSide,depthWrite:false}));marker.rotation.x=-Math.PI/2;marker.visible=false;marker.renderOrder=7;scene.add(marker)

  const position:{x:number;z:number}={x:spawn.x,z:spawn.z};let groundY=spawn.y,path:NavPoint[]=[],destination='',vx=0,vz=0,yaw=-.44,pitch=-.03,raf=0,disposed=false,previous=performance.now(),frames=0,sampleAt=previous,fps=0,lastReport=0,lastShadow={x:999,z:999}
  input.yaw=yaw;input.pitch=pitch

  const setRay=(clientX:number,clientY:number)=>{const rect=canvas.getBoundingClientRect();mouse.set((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(mouse,camera)}
  const stop=()=>{path=[];destination='';vx=0;vz=0;marker.visible=false}
  const reachableTarget=(point:NavPoint)=>{
    if(surface.walkable(point,PLAYER_RADIUS))return point
    for(let radius=.8;radius<=5;radius+=.8){const steps=Math.ceil(radius*10);for(let i=0;i<steps;i++){const angle=i/steps*Math.PI*2,candidate={x:point.x+Math.cos(angle)*radius,z:point.z+Math.sin(angle)*radius};if(surface.walkable(candidate,PLAYER_RADIUS))return candidate}}
    return null
  }
  const go=(target:NavPoint,name='Walking there')=>{const safe=reachableTarget(target);if(!safe)return false;const route=navigator.path(position,safe);if(!route)return false;path=route;destination=name;marker.position.set(safe.x,floorHeight(safe.x,safe.z)+.05,safe.z);marker.visible=true;return true}

  function toggleDoor(state:DoorState){
    const opening=state.target===0
    state.target=opening?-1.35:0
    if(state.enterable){if(opening)openDoors.add(state.id);else openDoors.delete(state.id);rebuildNavigator()}
    return opening
  }

  function pick(clientX:number,clientY:number):VillagePick|null{
    if(input.paused)return null
    setRay(clientX,clientY)
    const doorMeshes=[...doors.values()].flatMap(state=>state.panels)
    const doorHit=raycaster.intersectObjects(doorMeshes,false)[0]
    if(doorHit&&doorHit.distance<18){
      const id=doorHit.object.userData.villageDoor as string|undefined,state=id?doors.get(id):undefined
      if(state){stop();return{kind:'door',label:state.label,open:toggleDoor(state),enterable:state.enterable}}
    }
    const hit=raycaster.intersectObject(ground,false)[0]
    if(!hit)return null
    return go({x:hit.point.x,z:hit.point.z},'Your destination')?{kind:'floor'}:null
  }

  const resize=()=>{const width=canvas.clientWidth||innerWidth,height=canvas.clientHeight||innerHeight,ratio=renderer.getPixelRatio();if(canvas.width!==Math.floor(width*ratio)||canvas.height!==Math.floor(height*ratio))renderer.setSize(width,height,false);camera.aspect=width/Math.max(1,height);camera.updateProjectionMatrix()}
  const observer=new ResizeObserver(resize);observer.observe(canvas);resize()

  function dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(raf);observer.disconnect();const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>();scene.traverse(object=>{if(object instanceof T.Mesh||object instanceof T.InstancedMesh){geometries.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material)}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());sun.shadow.map?.dispose();renderer.dispose()}
  signal.addEventListener('abort',dispose,{once:true})

  function tick(now:number){
    if(disposed)return
    const dt=Math.min(.04,Math.max(.001,(now-previous)/1000));previous=now;frames++
    if(now-sampleAt>=500){fps=Math.round(frames*1000/(now-sampleAt));frames=0;sampleAt=now}
    for(const state of doors.values()){state.angle=T.MathUtils.damp(state.angle,state.target,9,dt);state.pivot.rotation.y=state.angle}
    if(!input.paused){
      let dx=0,dz=0
      const manual=Math.hypot(input.x,input.z)>.01
      if(manual){
        path=[];destination='';marker.visible=false
        const length=Math.max(1,Math.hypot(input.x,input.z)),ix=input.x/length,iz=input.z/length,c=Math.cos(yaw),s=Math.sin(yaw)
        dx=ix*c+iz*s;dz=-ix*s+iz*c
      }else if(path.length){
        const next=path[0],distance=Math.hypot(next.x-position.x,next.z-position.z)
        if(distance<.34){path.shift();if(!path.length){destination='';marker.visible=false}}
        else{dx=(next.x-position.x)/distance;dz=(next.z-position.z)/distance;const slow=path.length===1?Math.min(1,distance/1.4):1;dx*=slow;dz*=slow;if(now-input.lookedAt>1400){const desired=Math.atan2(-dx,-dz),delta=Math.atan2(Math.sin(desired-input.yaw),Math.cos(desired-input.yaw));input.yaw+=delta*(1-Math.exp(-dt*.75))}}
      }
      const speed=input.speed*(input.fast?1.55:1),damp=1-Math.exp(-dt*5.3);vx+=(dx*speed-vx)*damp;vz+=(dz*speed-vz)*damp
      const moved=moveSafely(surface,position,vx*dt,vz*dt,PLAYER_RADIUS)
      if(Math.hypot(moved.x-position.x,moved.z-position.z)<.00005&&manual){vx=0;vz=0}
      position.x=moved.x;position.z=moved.z
      yaw+=Math.atan2(Math.sin(input.yaw-yaw),Math.cos(input.yaw-yaw))*(1-Math.exp(-dt*16));pitch+=(input.pitch-pitch)*(1-Math.exp(-dt*16))
      groundY=T.MathUtils.damp(groundY,floorHeight(position.x,position.z),10,dt)
    }else{vx=0;vz=0}

    camera.position.set(position.x,groundY+EYE_HEIGHT,position.z);camera.rotation.set(pitch,yaw,0,'YXZ')
    if(Math.hypot(position.x-lastShadow.x,position.z-lastShadow.z)>18){lastShadow={...position};sun.position.set(position.x-42,groundY+62,position.z+38);sun.target.position.set(position.x,groundY,position.z);renderer.shadowMap.needsUpdate=true}
    water.uniforms.time.value=now*.001;resize();renderer.render(scene,camera)
    if(now-lastReport>300){lastReport=now;report({position:{x:position.x,y:groundY,z:position.z},zone:zoneName(position.x,position.z),fps,moving:path.length>0||Math.hypot(vx,vz)>.12,destination:path.length?destination:''})}
    raf=requestAnimationFrame(tick)
  }

  progress('Ready to wander.');raf=requestAnimationFrame(tick)
  return {
    reset(){stop();position.x=spawn.x;position.z=spawn.z;groundY=spawn.y;input.yaw=-.44;input.pitch=-.03;yaw=input.yaw;pitch=input.pitch},
    stop,
    pick,
    goTo(clientX:number,clientY:number){const result=pick(clientX,clientY);return result?.kind==='floor'},
    dispose,
  }
}
