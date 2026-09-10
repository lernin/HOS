import * as T from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { groundHeight, houses, isWater, nearestPath, riverCenter, riverWidth, tree, villageTrees } from './world'
import { palette as c, random, type Kit } from './kit'

export async function addPlanting(scene:T.Scene,k:Kit,signal:AbortSignal,track:(o:T.Object3D)=>void) {
  const rand=random(60910)
  type Placement={x:number;y:number;z:number;h:number;kind:string;canopy?:boolean}
  const items:Placement[]=villageTrees.map(t=>({...t,y:groundHeight(t.x,t.z)}))
  // Leaf geometry from the existing CC0 trees crowns our original branching landmark.
  items.push({x:tree.x,y:tree.y+1.5,z:tree.z,h:22,kind:'tree',canopy:true})
  for(let i=0;i<5;i++){const a=i*2.4;items.push({x:tree.x+Math.cos(a)*4.5,y:tree.y+8+rand()*2,z:tree.z+Math.sin(a)*4.5,h:12+rand()*3,kind:i%2?'tree':'tree-b',canopy:true})}
  function clear(x:number,z:number,margin:number) {
    const p=nearestPath(x,z,true)
    return !isWater(x,z,-.32)&&p.distance>p.width/2+margin&&!houses.some(h=>Math.abs(x-h.x)<3.9+margin&&Math.abs(z-h.z)<4+margin)&&Math.hypot(x-tree.x,z-tree.z)>2.5
  }
  // Ecological clumps, with intentionally different spacing along sunny paths and damp banks.
  for(let cluster=0;cluster<160;cluster++) {
    const cx=(rand()-.5)*43,cz=(rand()-.5)*49
    const wet=Math.abs(cx-riverCenter(cz))-riverWidth(cz)<3
    for(let j=0;j<9;j++) {
      const a=rand()*6.28,r=Math.sqrt(rand())*1.8,x=cx+Math.cos(a)*r,z=cz+Math.sin(a)*r
      if(!clear(x,z,.28))continue
      const kind=wet?(j%3?'fern':'clover'):(j%6===0?'bush':j%3?'grass':'clover')
      const h=kind==='bush'?.65+rand()*.6:kind==='fern'?.4+rand()*.35:.17+rand()*.28
      items.push({x,y:groundHeight(x,z)-.015,z,h,kind})
    }
  }
  // Flower drifts follow path edges continuously; the aisle is always kept clear.
  for(let i=0;i<170;i++) {
    const cx=(rand()-.5)*39,cz=(rand()-.5)*46,p=nearestPath(cx,cz,true)
    if(p.distance>4.5||p.distance<p.width*.5+.4)continue
    for(let j=0;j<7;j++) {
      const x=cx+(rand()-.5)*1.3,z=cz+(rand()-.5)*1.3
      if(!clear(x,z,.18))continue
      const y=groundHeight(x,z),col=i%5===0?c.pink:i%3?c.cream:c.lavender
      k.flower(x,y,z,.8+rand()*.6,col)
      if(i%4===0)for(let t=1;t<4;t++)k.flower(x+.025*t,y+t*.1,z,.45,col)
    }
  }
  // Close eye-level cottage garden has extra carefully placed blooms and shrubs.
  for(const h of [houses[0],houses[2]])for(const side of [-1,1])for(let i=0;i<12;i++) {
    const x=h.x+side*(2.1+rand()*.65),z=h.z+4.8+rand()*.8
    if(!clear(x,z,.12))continue
    k.flower(x,groundHeight(x,z),z,1+rand()*.6,i%3?c.cream:c.lavender)
    if(i%3===0)items.push({x,y:groundHeight(x,z),z,h:.6,kind:'fern'})
  }
  // Forest wall and woodland slopes conceal the finite playable neighborhood organically.
  for(let i=0;i<105;i++) {
    const side=i%2?1:-1,x=side*(25+rand()*17),z=-38+rand()*77
    items.push({x,y:groundHeight(x,z),z,h:7+rand()*10,kind:i%5?'pine':i%2?'tree':'tree-b'})
  }
  for(let i=0;i<35;i++){
    const x=(rand()-.5)*62,z=-30-rand()*12;items.push({x,y:groundHeight(x,z),z,h:6+rand()*9,kind:'pine'})
  }
  const loader=new GLTFLoader(),loaded:T.Object3D[]=[]
  try {
    for(const kind of ['tree','tree-b','pine','bush','fern','grass','clover']) {
      const response=await fetch(`/woodland/${kind}.glb`,{signal});if(!response.ok)throw Error(`Could not load village ${kind}. Please reopen the village.`)
      const gltf=await loader.parseAsync(await response.arrayBuffer(),'');loaded.push(gltf.scene);track(gltf.scene)
      if(signal.aborted)throw new DOMException('Aborted','AbortError')
      gltf.scene.updateMatrixWorld(true)
      const bounds=new T.Box3().setFromObject(gltf.scene),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3())
      gltf.scene.traverse(o=>{
        if(!(o instanceof T.Mesh))return
        const mat=o.material as T.MeshStandardMaterial,leaves=mat.name.includes('Leaves')
        const placements=items.filter(p=>p.kind===kind&&(!p.canopy||leaves))
        if(!placements.length)return
        mat.roughness=.9;mat.metalness=0
        const instance=new T.InstancedMesh(o.geometry,mat,placements.length),transform=new T.Object3D(),matrix=new T.Matrix4(),tint=new T.Color()
        placements.forEach((p,i)=>{
          const s=p.h/size.y,angle=rand()*6.28,aspect=.88+rand()*.22
          transform.position.set(p.x-center.x*s,p.y-bounds.min.y*s,p.z-center.z*s);transform.rotation.set(0,angle,0);transform.scale.set(s*aspect,s,s/aspect);transform.updateMatrix()
          matrix.multiplyMatrices(transform.matrix,o.matrixWorld);instance.setMatrixAt(i,matrix)
          tint.setHSL(.2+rand()*.045,.08+rand()*.09,.8+rand()*.18);instance.setColorAt(i,tint)
        })
        instance.castShadow=['tree','tree-b','pine','bush'].includes(kind);instance.receiveShadow=true;instance.computeBoundingSphere();scene.add(instance)
      })
    }
  }catch(error){loaded.forEach(track);throw error}
  return {instances:items.length}
}
