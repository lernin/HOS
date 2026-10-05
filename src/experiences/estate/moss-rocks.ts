import * as T from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { FLOOR } from './plan'

type RockPlacement={
  x:number
  y:number
  z:number
  scale:number
  yaw:number
  tilt?:number
}

const ROCK_URL='/assets/estate/rock-moss-set-01.glb'

// A deliberately small first pass: real moss-textured stones in the planted
// foyer and arrival pockets, where they enrich the landscape without changing
// navigation or blocking the new perimeter circulation.
const placements:RockPlacement[]=[
  {x:-9.55,y:FLOOR-.035,z:10.25,scale:.42,yaw:.35,tilt:-.03},
  {x:11.15,y:FLOOR-.035,z:12.45,scale:.36,yaw:2.15,tilt:.025},
  {x:-22.35,y:4.46,z:38.65,scale:.62,yaw:.8,tilt:-.04},
  {x:-19.45,y:4.45,z:42.55,scale:.48,yaw:2.75,tilt:.02},
  {x:21.55,y:4.45,z:45.55,scale:.52,yaw:1.45,tilt:-.025},
  {x:24.05,y:4.44,z:47.75,scale:.40,yaw:3.65,tilt:.035},
]

function disposeMaterial(material:T.Material){
  const record=material as unknown as Record<string,unknown>
  for(const value of Object.values(record))if(value instanceof T.Texture)value.dispose()
  material.dispose()
}

export async function addMossRockSet(scene:T.Scene,signal:AbortSignal){
  const loader=new GLTFLoader()
  loader.setMeshoptDecoder(MeshoptDecoder)
  const gltf=await loader.loadAsync(ROCK_URL)

  if(signal.aborted){
    gltf.scene.traverse(object=>{
      if(!(object instanceof T.Mesh))return
      object.geometry.dispose()
      const materials=Array.isArray(object.material)?object.material:[object.material]
      materials.forEach(disposeMaterial)
    })
    throw new DOMException('Aborted','AbortError')
  }

  const sources:T.Mesh[]=[]
  gltf.scene.traverse(object=>{
    if(object instanceof T.Mesh)sources.push(object)
  })
  if(!sources.length)throw new Error('Rock Moss Set 01 loaded without meshes')

  const group=new T.Group()
  group.name='ocean-estate-moss-rocks'
  scene.add(group)

  placements.forEach((placement,index)=>{
    const source=sources[index%sources.length]
    const rock=source.clone()
    rock.name=`estate-moss-rock-${index+1}`
    rock.position.set(placement.x,placement.y,placement.z)
    rock.rotation.set(placement.tilt??0,placement.yaw,(index%2?1:-1)*.018)
    rock.scale.setScalar(placement.scale)
    rock.castShadow=true
    rock.receiveShadow=true
    group.add(rock)
  })

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
      geometries.forEach(geometry=>geometry.dispose())
      materials.forEach(disposeMaterial)
    },
  }
}
