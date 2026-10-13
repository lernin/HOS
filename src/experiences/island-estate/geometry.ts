import * as T from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { type PointXZ, type WorldPoint } from './layout'

export const vec=(p:WorldPoint)=>new T.Vector3(p.x,p.y,p.z)
export function shape(outline:PointXZ[], holes:PointXZ[][]=[]) {
  const s=new T.Shape(outline.map(p=>new T.Vector2(p.x,-p.z)))
  s.closePath()
  for(const h of holes){const path=new T.Path(h.map(p=>new T.Vector2(p.x,-p.z)));path.closePath();s.holes.push(path)}
  return s
}
export function flatGeometry(outline:PointXZ[],holes:PointXZ[][]=[]) {
  const g=new T.ShapeGeometry(shape(outline,holes));g.rotateX(-Math.PI/2);return g
}
export function slabGeometry(outline:PointXZ[], holes:PointXZ[][], depth:number, bevel=.1) {
  const g=new T.ExtrudeGeometry(shape(outline,holes),{depth,bevelEnabled:bevel>0,bevelSegments:3,steps:1,bevelSize:bevel,bevelThickness:bevel,curveSegments:1})
  g.rotateX(-Math.PI/2);return g
}
const colors:Record<string,string>={
  shell:'#f2f0e7',stone:'#dcd3bd',stoneDark:'#b4a486',wood:'#986e46',teak:'#b99466',
  linen:'#f1e7d0',sand:'#c2a57d',clay:'#ba8164',sage:'#929c7b',bronze:'#69543b',
  metal:'#404640',glass:'#c0eee4',glow:'#fff2cb',soil:'#413c29',grass:'#66784b',
  leaf:'#426439',leafLight:'#6d8a44',leafDark:'#233d2b',bark:'#746047',rock:'#746e5f',
  rockLight:'#9d9885',rockDark:'#464e48',ceramic:'#e5dec5',paper:'#ebe3c8',waterTile:'#417d79',
}
export function createKit(scene:T.Scene) {
  const mats=new Map<string,T.MeshStandardMaterial>(),batches=new Map<string,T.BufferGeometry[]>(),geometries=new Set<T.BufferGeometry>(),textures=new Set<T.Texture>()
  const root=new T.Group();root.name='The Island Estate';scene.add(root)
  const navMeshes:T.Mesh[]=[],meshes:T.Mesh[]=[]
  function material(name:string):T.MeshStandardMaterial {
    if(mats.has(name))return mats.get(name)!
    const color=colors[name]||name
    let m:T.MeshStandardMaterial
    if(name==='glass')m=new T.MeshPhysicalMaterial({color,transparent:true,opacity:.15,roughness:.045,metalness:.25,clearcoat:1,side:T.DoubleSide,depthWrite:false})
    else if(name==='shell')m=new T.MeshPhysicalMaterial({color,roughness:.36,metalness:.01,clearcoat:.38,clearcoatRoughness:.28})
    else m=new T.MeshStandardMaterial({color,roughness:['bronze','metal'].includes(name)?.32:.78,metalness:['bronze','metal'].includes(name)?.75:0})
    if(name==='glow'){m.emissive=new T.Color('#ffdfa5');m.emissiveIntensity=1.8;m.toneMapped=false}
    if(name!=='glass'&&name!=='glow') {
      const wood=name==='wood'||name==='teak'||name==='bark'
      const scale=name==='shell'?28:wood?12:4
      m.onBeforeCompile=s=>{
        s.vertexShader='varying vec3 ieWorld;\n'+s.vertexShader
        s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nieWorld=(modelMatrix*vec4(transformed,1.)).xyz;')
        s.fragmentShader='varying vec3 ieWorld;\n'+s.fragmentShader
        const detail=wood?'sin(ieWorld.x*42.+sin(ieWorld.z*1.4)*3.)*.015+sin(ieWorld.x*8.+ieWorld.z*.2)*.05':`sin(ieWorld.x*${scale.toFixed(3)}+sin(ieWorld.z*${(scale*.6).toFixed(3)})*2.)*${name==='shell'?'.006':'.025'}+sin(ieWorld.z*${(scale*.72).toFixed(3)}+ieWorld.y*8.)*.012`
        s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>\ndiffuseColor.rgb*=1.+${detail};`)
      }
      m.customProgramCacheKey=()=>`ie-${name}`
    }
    mats.set(name,m);return m
  }
  function keep(g:T.BufferGeometry){geometries.add(g);return g}
  function add(g:T.BufferGeometry,name:string,p:WorldPoint={x:0,y:0,z:0},rotation:T.Euler=new T.Euler(),navigation=false) {
    keep(g)
    if(navigation) {
      const m=new T.Mesh(g,material(name));m.position.copy(vec(p));m.rotation.copy(rotation);m.receiveShadow=true;m.castShadow=true;m.userData.walkSurface=true
      navMeshes.push(m);meshes.push(m);root.add(m);return m
    }
    const matrix=new T.Matrix4().compose(vec(p),new T.Quaternion().setFromEuler(rotation),new T.Vector3(1,1,1))
    let copy=g.index?g.toNonIndexed():g.clone();copy.applyMatrix4(matrix)
    if(!copy.hasAttribute('normal'))copy.computeVertexNormals()
    if(!copy.hasAttribute('uv'))copy.setAttribute('uv',new T.Float32BufferAttribute(new Float32Array(copy.getAttribute('position').count*2),2))
    for(const k of Object.keys(copy.attributes))if(!['position','normal','uv'].includes(k))copy.deleteAttribute(k)
    const bucket=batches.get(name)||[];bucket.push(copy);batches.set(name,bucket)
    return null
  }
  function box(p:WorldPoint,w:number,h:number,d:number,name:string,yaw=0,round=0) {
    const g=round?new RoundedBoxGeometry(w,h,d,2,Math.min(round,w/3,h/3,d/3)):new T.BoxGeometry(w,h,d)
    return add(g,name,p,new T.Euler(0,yaw,0))
  }
  function sphere(p:WorldPoint,rx:number,ry:number,rz:number,name:string,segments=12) {
    const g=new T.SphereGeometry(1,segments,Math.max(5,Math.floor(segments*.6)));g.scale(rx,ry,rz);add(g,name,p)
  }
  function tube(points:WorldPoint[],radius:number,name:string,closed=false,segments=0,sides=5) {
    if(points.length<2)return
    const c=new T.CatmullRomCurve3(points.map(vec),closed,'centripetal')
    add(new T.TubeGeometry(c,segments||Math.max(8,points.length*3),radius,sides,closed),name)
  }
  function cylinder(a:WorldPoint,b:WorldPoint,r1:number,r2:number,name:string,segments=8) {
    const start=vec(a),end=vec(b),diff=end.clone().sub(start),g=new T.CylinderGeometry(r2,r1,diff.length(),segments)
    g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),diff.normalize()))
    add(g,name,{x:(a.x+b.x)/2,y:(a.y+b.y)/2,z:(a.z+b.z)/2})
  }
  function floor(outline:PointXZ[],holes:PointXZ[][],y:number,depth:number,name='stone') {
    return add(slabGeometry(outline,holes,depth,0),name,{x:0,y:y-depth,z:0},new T.Euler(),true)!
  }
  function wall(a:PointXZ,b:PointXZ,y:number,height:number,name='glass',width=.032) {
    box({x:(a.x+b.x)/2,y:y+height/2,z:(a.z+b.z)/2},Math.hypot(b.x-a.x,b.z-a.z),height,width,name,-Math.atan2(b.z-a.z,b.x-a.x))
  }
  function finish() {
    for(const [name,parts] of batches) {
      if(!parts.length)continue
      const merged=mergeGeometries(parts,false)
      parts.forEach(g=>g.dispose());if(!merged)throw new Error(`Could not assemble ${name} geometry`)
      keep(merged)
      const m=new T.Mesh(merged,material(name));m.name=name;m.castShadow=name!=='glass'&&name!=='glow';m.receiveShadow=name!=='glass';root.add(m);meshes.push(m)
    }
    batches.clear();root.updateMatrixWorld(true)
  }
  function dispose() {
    for(const g of geometries)g.dispose();for(const m of mats.values())m.dispose();for(const t of textures)t.dispose()
    for(const parts of batches.values())parts.forEach(g=>g.dispose());batches.clear();root.removeFromParent()
  }
  return {root,navMeshes,meshes,material,add,box,sphere,tube,cylinder,floor,wall,finish,dispose,keep}
}
export type Kit=ReturnType<typeof createKit>

export function surface(vertices:number[],indices:number[]) {
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();return g
}
export function ribbon(points:WorldPoint[],width:number):T.BufferGeometry {
  const vertices:number[]=[],indices:number[]=[]
  for(let i=0;i<points.length;i++) {
    const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],p=points[i]
    const dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz)||1
    vertices.push(p.x-dz/length*width/2,p.y,p.z+dx/length*width/2,p.x+dz/length*width/2,p.y,p.z-dx/length*width/2)
    if(i){const k=i*2;indices.push(k-2,k-1,k,k-1,k+1,k)}
  }
  return surface(vertices,indices)
}
