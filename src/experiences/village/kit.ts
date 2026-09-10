import * as T from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
export const palette = {
  timber:'#67452d',honey:'#b2844d',wood:'#936737',plaster:'#e9dbb5',trim:'#dcc18b',
  stone:'#838e8d',moss:'#73894a',soil:'#827449',path:'#b9aa85',slate:'#446477',
  leaf:'#577b35',grass:'#77934c',cream:'#f3e6b9',lavender:'#9d82b8',pink:'#d69aaa',gold:'#dbb456',
}
export function random(seed=7941) { return () => {seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296} }
export const vec = (x:number,y:number,z:number) => new T.Vector3(x,y,z)
export function geometry(vertices:number[],indices:number[],uvs?:number[],colors?:number[]) {
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setIndex(indices)
  if(uvs)g.setAttribute('uv',new T.Float32BufferAttribute(uvs,2))
  if(colors)g.setAttribute('color',new T.Float32BufferAttribute(colors,3))
  g.computeVertexNormals();return g
}
export function pebbleGeometry(seed:number) {
  const rand=random(seed),g=new T.IcosahedronGeometry(1,2),p=g.attributes.position
  // Continuous deformation avoids per-triangle cracks and identical polyhedra.
  const phase=rand()*10
  for(let i=0;i<p.count;i++) {
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i)
    const k=1+.1*Math.sin(x*7+phase)*Math.cos(z*5)+.09*Math.sin(y*5+z*4+phase)
    p.setXYZ(i,x*k,y*k,z*k)
  }
  g.computeVertexNormals();return g
}
export function bevelBox(w:number,h:number,d:number,bevel=.06) {
  const s=new T.Shape();s.moveTo(-w/2,-h/2);s.lineTo(w/2,-h/2);s.lineTo(w/2,h/2);s.lineTo(-w/2,h/2);s.closePath()
  const g=new T.ExtrudeGeometry(s,{depth:d,bevelEnabled:true,bevelSize:bevel,bevelThickness:bevel,bevelSegments:1,steps:1});g.translate(0,0,-d/2);return g
}
type SurfaceKind='wood'|'plaster'|'stone'|'shingle'|'plain'
const woodColors=new Set([palette.timber,palette.honey,palette.wood,palette.trim,'#5f806f','#6e7454','#8a684d','#55796b','#5b7c69','#76927b','#845730','#be955e','#ba915b'])
const stoneColors=new Set([palette.stone,'#838e8d','#949b89','#8f978e','#a1a397','#a4a795','#91988d','#a8aa98'])
const shingleColors=new Set([palette.slate,'#456578','#496b61','#a56748','#587487','#688391'])
function surfaceKind(color:string):SurfaceKind {
  const v=color.toLowerCase()
  if(v===palette.plaster)return 'plaster'
  if(woodColors.has(v))return 'wood'
  if(stoneColors.has(v))return 'stone'
  if(shingleColors.has(v))return 'shingle'
  return 'plain'
}
function textureMaterial(m:T.MeshStandardMaterial,kind:SurfaceKind) {
  if(kind==='plain')return
  m.customProgramCacheKey=()=>`procedia-surface-v1-${kind}`
  m.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader
      .replace('#include <common>','#include <common>\nvarying vec3 vSurfacePosition;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvSurfacePosition=(modelMatrix*vec4(position,1.0)).xyz;')
    const functions=`
varying vec3 vSurfacePosition;
float surfaceHash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float surfaceNoise(vec3 p){
  vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(mix(surfaceHash(i),surfaceHash(i+vec3(1,0,0)),f.x),mix(surfaceHash(i+vec3(0,1,0)),surfaceHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(surfaceHash(i+vec3(0,0,1)),surfaceHash(i+vec3(1,0,1)),f.x),mix(surfaceHash(i+vec3(0,1,1)),surfaceHash(i+vec3(1,1,1)),f.x),f.y),f.z);
}`
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>${functions}`)
    const p='vSurfacePosition'
    const expression=kind==='wood'
      ? `float sn=surfaceNoise(${p}*2.7);float grain=.5+.5*sin((${p}.x+${p}.z)*24.0+${p}.y*3.5+sn*5.0);float surfaceTone=.84+.18*sn+.08*grain;`
      : kind==='plaster'
        ? `float sn=surfaceNoise(${p}*1.65);float fine=surfaceNoise(${p}*7.5);float surfaceTone=.91+.12*sn+.055*fine;`
        : kind==='stone'
          ? `float sn=surfaceNoise(${p}*4.6);float fine=surfaceNoise(${p}*13.0);float surfaceTone=.82+.24*sn+.08*fine;`
          : `float sn=surfaceNoise(${p}*5.2);float fleck=surfaceNoise(${p}*15.0);float rib=.5+.5*sin((${p}.x-${p}.z)*34.0);float surfaceTone=.86+.16*sn+.055*fleck+.035*rib;`
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>\n${expression}\ndiffuseColor.rgb*=surfaceTone;`)
    const roughness=kind==='plaster'?'.05':kind==='stone'?'.075':kind==='shingle'?'.06':'.045'
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+(surfaceNoise(vSurfacePosition*8.0)-.5)*${roughness},.55,1.0);`)
  }
}
export type Kit=ReturnType<typeof createKit>
export function createKit(scene:T.Scene) {
  const root=new T.Group(),materials=new Map<string,T.MeshStandardMaterial>(),geometries=new Set<T.BufferGeometry>()
  const rand=random(),rocks=Array.from({length:7},(_,i)=>pebbleGeometry(i*73+3))
  rocks.forEach(g=>geometries.add(g))
  const material=(color:string) => {
    const key=color.toLowerCase()
    if(!materials.has(key)) {
      const m=new T.MeshStandardMaterial({color,roughness:.88})
      textureMaterial(m,surfaceKind(key))
      materials.set(key,m)
    }
    return materials.get(key)!
  }
  const glow=material('#ffd58a');glow.emissive.set('#ffb447');glow.emissiveIntensity=.9
  const add=(g:T.BufferGeometry,color:string|T.Material,x=0,y=0,z=0,group:T.Group=root) => {
    geometries.add(g);const m=new T.Mesh(g,typeof color==='string'?material(color):color);m.position.set(x,y,z);group.add(m);return m
  }
  const box=(x:number,y:number,z:number,w:number,h:number,d:number,color=palette.timber,group=root,soft=false)=>add(soft?bevelBox(w,h,d,.025):new T.BoxGeometry(w,h,d),color,x,y,z,group)
  const beam=(points:T.Vector3[],radius:number,color=palette.timber,group=root) => add(new T.TubeGeometry(new T.CatmullRomCurve3(points),Math.max(4,points.length*4),radius,7,false),color,0,0,0,group)
  const rock=(x:number,y:number,z:number,sx:number,sy:number,sz:number,color=palette.stone,group=root) => {
    const m=add(rocks[Math.floor(rand()*rocks.length)],color,x,y,z,group);m.scale.set(sx,sy,sz);m.rotation.set(rand()*.25,rand()*6.28,rand()*.2);return m
  }
  function lantern(x:number,y:number,z:number,group=root,post=true) {
    if(post)beam([vec(x,y,z),vec(x-.025,y+1,z),vec(x+.04,y+1.9,z)],.06,palette.timber,group)
    const h=post?1.8:0
    box(x,y+h,z,.22,.34,.22,'#ffd58a',group)
    for(const a of [-1,1])for(const b of [-1,1])box(x+a*.14,y+h,z+b*.14,.035,.41,.035,palette.timber,group)
    const roof=add(new T.ConeGeometry(.26,.19,4),palette.slate,x,y+h+.29,z,group);roof.rotation.y=Math.PI/4
    box(x,y+h-.23,z,.34,.07,.34,palette.timber,group,true)
  }
  function flower(x:number,y:number,z:number,scale=1,color=palette.cream,group=root) {
    const h=.3*scale
    beam([vec(x,y,z),vec(x+.045*scale,y+h*.6,z),vec(x,y+h,z)],.012*scale,palette.leaf,group)
    const center=vec(x,y+h,z)
    for(let i=0;i<5;i++) {
      const a=i*6.283/5
      const petal=add(new T.SphereGeometry(.064*scale,5,3),color,center.x+Math.cos(a)*.071*scale,center.y+.005,center.z+Math.sin(a)*.071*scale,group)
      petal.scale.set(1,.35,1.45);petal.rotation.y=-a
    }
    const pollen=add(new T.SphereGeometry(.038*scale,6,4),palette.gold,x,y+h+.026*scale,z,group);pollen.scale.y=.55
  }
  function fence(points:T.Vector3[],group=root) {
    for(const q of points) {
      beam([q.clone().add(vec(0,-.1,0)),q.clone().add(vec(.018,1.02,0))],.068,palette.timber,group)
      const cap=add(new T.SphereGeometry(.09,7,5),palette.honey,q.x,q.y+1.01,q.z,group);cap.scale.y=.5
    }
    for(let i=1;i<points.length;i++)for(const h of [.46,.85]) {
      const a=points[i-1].clone().add(vec(0,h,0)),b=points[i].clone().add(vec(0,h,0)),middle=a.clone().lerp(b,.5);middle.y-=.045
      beam([a,middle,b],.037,palette.honey,group)
    }
  }
  function finish() {
    root.updateMatrixWorld(true)
    const batches=new Map<T.Material,T.BufferGeometry[]>()
    root.traverse(o=>{
      if(!(o instanceof T.Mesh)||Array.isArray(o.material))return
      let g=o.geometry.clone().applyMatrix4(o.matrixWorld);if(g.index){const old=g;g=g.toNonIndexed();old.dispose()}
      g.deleteAttribute('uv');g.deleteAttribute('color');g.deleteAttribute('tangent')
      if(!batches.has(o.material))batches.set(o.material,[]);batches.get(o.material)!.push(g)
    })
    for(const [mat,parts]of batches){const g=mergeGeometries(parts);parts.forEach(v=>v.dispose());if(!g)continue;geometries.add(g);const mesh=new T.Mesh(g,mat);mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh)}
    // Temporary object forest is released after batching.
    root.clear()
  }
  return {root,add,box,beam,rock,lantern,flower,fence,material,rand,finish,dispose:()=>{geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose())}}
}
