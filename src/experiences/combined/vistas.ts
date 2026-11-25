import * as T from 'three'
import { heightAt } from '../woodland/world'

// These are deliberately low-poly scenic stand-ins, NOT second game worlds.
// Only the active scene's WebGLRenderer exists in memory. Both are removed
// when that scene is disposed.
function groupWithDispose(scene:T.Scene){
  const root=new T.Group(),geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>()
  scene.add(root)
  function add(geometry:T.BufferGeometry,material:T.Material,x:number,y:number,z:number){
    const m=new T.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=false;m.receiveShadow=true
    geometries.add(geometry);materials.add(material);root.add(m);return m
  }
  return {root,add,dispose(){
    scene.remove(root);for(const g of geometries)g.dispose();for(const m of materials)m.dispose()
  }}
}

// Standing at the circular driveway and facing north, the child sees a
// grounded winding trail and a dense forest silhouette rather than ocean.
export function addEstateForestVista(scene:T.Scene){
  const {root,add,dispose}=groupWithDispose(scene)
  const green=new T.MeshStandardMaterial({color:'#4c7055',roughness:1})
  const earth=new T.MeshStandardMaterial({color:'#8b826d',roughness:1})
  const bark=new T.MeshStandardMaterial({color:'#635242',roughness:1})
  const needles=new T.MeshStandardMaterial({color:'#234b37',roughness:1,flatShading:true})
  add(new T.CylinderGeometry(33,35,.6,24),green,1,4.35,94).scale.set(1,1,1.15)
  add(new T.BoxGeometry(6,.16,46),earth,1,4.78,79)
  const trunk=new T.CylinderGeometry(.22,.30,2.2,6),crown=new T.ConeGeometry(2.6,10,7),dummy=new T.Object3D()
  const trunks=new T.InstancedMesh(trunk,bark,44),crowns=new T.InstancedMesh(crown,needles,44)
  let count=0
  for(let row=0;row<7;row++)for(const side of [-1,1])for(let depth=0;depth<4;depth++){
    if(count>=44)break
    const z=65+row*7+depth*1.6
    const x=1+side*(7.8+depth*4.4)+Math.sin(row*2+depth)*1.8
    const h=7+((row*7+depth*11)%7)
    dummy.position.set(x,5.7,z);dummy.scale.set(1,1,1);dummy.updateMatrix();trunks.setMatrixAt(count,dummy.matrix)
    dummy.position.set(x,9.1,z);dummy.scale.set(.75+h*.037,.75+h*.09,.75+h*.037);dummy.updateMatrix();crowns.setMatrixAt(count,dummy.matrix)
    count++
  }
  trunks.count=crowns.count=count
  trunks.castShadow=crowns.castShadow=false
  root.add(trunks,crowns)
  return {dispose:()=>{dispose();trunks.dispose();crowns.dispose();trunk.dispose();crown.dispose();bark.dispose();needles.dispose()}}
}

// Woodland Walk is still the full existing forest. Only this small estate
// facade + driveway is represented, so no Estate meshes or lights run here.
export function addWoodlandEstateVista(scene:T.Scene){
  const {add,dispose}=groupWithDispose(scene)
  const centerX=-8,centerZ=129,base=heightAt(centerX,centerZ)
  const stone=new T.MeshStandardMaterial({color:'#c8bba6',roughness:.83})
  const roof=new T.MeshStandardMaterial({color:'#686d64',roughness:.95})
  const windowGlass=new T.MeshStandardMaterial({color:'#719ba2',roughness:.33,metalness:.17})
  const cobble=new T.MeshStandardMaterial({color:'#ad9c81',roughness:1})
  add(new T.CylinderGeometry(11,11,.22,32),cobble,centerX,base+.14,118)
  add(new T.BoxGeometry(6,.16,19),cobble,centerX,base+.23,111)
  add(new T.BoxGeometry(27,7,11),stone,centerX,base+3.6,centerZ)
  add(new T.BoxGeometry(30,.75,13),roof,centerX,base+7.5,centerZ)
  for(const x of [-18,-12,-5,1]){
    add(new T.BoxGeometry(3,3,.15),windowGlass,x,base+4.2,centerZ-5.62)
  }
  for(const x of [-14.5,-1.5]){
    add(new T.BoxGeometry(.7,6,.8),stone,x,base+3,centerZ-7.6)
  }
  add(new T.BoxGeometry(16,.5,2),roof,centerX,base+6.5,centerZ-7.6)
  const door=new T.MeshStandardMaterial({color:'#514f43',roughness:.8})
  add(new T.BoxGeometry(3.5,4,.18),door,centerX,base+2.1,centerZ-5.66)
  return {dispose}
}
