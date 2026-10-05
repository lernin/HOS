import * as T from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { contains, FLOOR } from './plan'
import { random } from './kit'
import { coastZ, outdoorStairs } from './site-layout'

type RockPlacement={
  x:number
  y:number
  z:number
  scale:number
  yaw:number
  tilt:number
  roll:number
  variant:number
}

const ROCK_URL='/assets/estate/rock-moss-set-01.glb'

function makePlacements(){
  const rand=random(518731)
  const placements:RockPlacement[]=[]
  const add=(x:number,y:number,z:number,scale:number,variant:number,tilt=0,roll=0,yaw=rand()*Math.PI*2)=>placements.push({x,y,z,scale,yaw,tilt,roll,variant})

  // Replace the old 150-piece procedural cliff-rock ring with textured mossy
  // boulders, varied in scale/rotation and kept below the estate walking deck.
  for(let i=0;i<150;i++){
    const a=i/150*Math.PI*2,r=.9+rand()*.09,x=Math.cos(a)*58*r,z=coastZ(a,r)
    const y=(Math.abs(x)<22&&z<0?-3.8:-.8)+rand()*.8
    add(x,y,z,1.15+rand()*1.65,i,rand()*.18-.09,rand()*.14-.07)
  }

  // Replace the complete round-arrival-court boulder band. Keep the original
  // stair opening clear while mixing both larger anchor stones and smaller
  // secondary stones.
  for(let i=0;i<92;i++){
    const a=i/92*Math.PI*2
    if(Math.abs(Math.atan2(Math.sin(a+Math.PI/2),Math.cos(a+Math.PI/2)))<.44)continue
    const wobble=.18*Math.sin(i*2.37)+.07*Math.sin(i*.83),r=19.46+wobble
    const x=1+Math.cos(a)*r,z=41+Math.sin(a)*r
    if(outdoorStairs.some(stair=>contains(stair,{x,z},1.2)))continue
    add(x,4.42+((i%5)-2)*.018,z,.58+(i%5)*.105,200+i,rand()*.12-.06,rand()*.08-.04)
    if(i%4===0){
      const aa=a+Math.PI/92,rr=19.72+.1*Math.sin(i*1.71)
      add(1+Math.cos(aa)*rr,4.4,41+Math.sin(aa)*rr,.42+(i%3)*.09,400+i,rand()*.1-.05,rand()*.08-.04)
    }
  }

  // Garden stones: visible, natural anchors among the much richer planting.
  const beds=[
    {cx:-8.5,cz:11,rx:1.65,rz:2.05,count:8,y:FLOOR-.02},
    {cx:10.5,cz:11.5,rx:1.55,rz:2.35,count:8,y:FLOOR-.02},
    {cx:-21,cz:40,rx:2.6,rz:4.1,count:14,y:4.42},
    {cx:22.5,cz:46.5,rx:2.0,rz:2.2,count:10,y:4.42},
    {cx:-16.2,cz:22.5,rx:2.7,rz:3.3,count:12,y:FLOOR+.39},
  ]
  let seed=600
  for(const bed of beds)for(let i=0;i<bed.count;i++){
    const a=rand()*Math.PI*2,r=Math.sqrt(rand())*.86
    add(bed.cx+Math.cos(a)*bed.rx*r,bed.y,bed.cz+Math.sin(a)*bed.rz*r,.26+rand()*.46,seed++,rand()*.16-.08,rand()*.12-.06)
  }

  return placements
}

const placements=makePlacements()

function disposeMaterial(material:T.Material){
  const record=material as unknown as Record<string,unknown>
  for(const value of Object.values(record))if(value instanceof T.Texture)value.dispose()
  material.dispose()
}

export async function addMossRockSet(scene:T.Scene,signal:AbortSignal){
  const loader=new GLTFLoader()
  loader.setMeshoptDecoder(MeshoptDecoder)
  const gltf=await loader.loadAsync(ROCK_URL)

  const sources:T.Mesh[]=[]
  gltf.scene.updateMatrixWorld(true)
  gltf.scene.traverse(object=>{if(object instanceof T.Mesh)sources.push(object)})
  if(!sources.length)throw new Error('Rock Moss Set 01 loaded without meshes')

  if(signal.aborted){
    const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>()
    sources.forEach(source=>{geometries.add(source.geometry);(Array.isArray(source.material)?source.material:[source.material]).forEach(material=>materials.add(material))})
    geometries.forEach(geometry=>geometry.dispose());materials.forEach(disposeMaterial)
    throw new DOMException('Aborted','AbortError')
  }

  const group=new T.Group()
  group.name='ocean-estate-moss-rocks'
  scene.add(group)

  const dummy=new T.Object3D()
  const instances:T.InstancedMesh[]=[]
  for(let sourceIndex=0;sourceIndex<sources.length;sourceIndex++){
    const source=sources[sourceIndex]
    const selected=placements.filter(p=>p.variant%sources.length===sourceIndex)
    if(!selected.length)continue
    const mesh=new T.InstancedMesh(source.geometry,source.material,selected.length)
    mesh.name=`estate-moss-rock-variant-${sourceIndex+1}`
    mesh.castShadow=true
    mesh.receiveShadow=true
    mesh.instanceMatrix.setUsage(T.StaticDrawUsage)
    selected.forEach((placement,index)=>{
      dummy.position.set(placement.x,placement.y,placement.z)
      dummy.rotation.set(source.rotation.x+placement.tilt,source.rotation.y+placement.yaw,source.rotation.z+placement.roll)
      dummy.scale.set(
        source.scale.x*placement.scale,
        source.scale.y*placement.scale*(.82+(placement.variant%5)*.045),
        source.scale.z*placement.scale*(.9+(placement.variant%3)*.06),
      )
      dummy.updateMatrix()
      mesh.setMatrixAt(index,dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate=true
    mesh.computeBoundingSphere()
    group.add(mesh)
    instances.push(mesh)
  }

  const geometries=new Set<T.BufferGeometry>()
  const materials=new Set<T.Material>()
  sources.forEach(source=>{
    geometries.add(source.geometry)
    const sourceMaterials=Array.isArray(source.material)?source.material:[source.material]
    sourceMaterials.forEach(material=>materials.add(material))
  })

  return {
    count:placements.length,
    dispose(){
      scene.remove(group)
      group.clear()
      instances.forEach(instance=>instance.dispose())
      geometries.forEach(geometry=>geometry.dispose())
      materials.forEach(disposeMaterial)
    },
  }
}
