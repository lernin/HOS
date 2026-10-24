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
function textureHash(x:number,y:number,seed:number) {
  let n=Math.imul(x+seed,374761393)^Math.imul(y-seed,668265263)
  n=(n^(n>>>13))*1274126177
  return ((n^(n>>>16))>>>0)/4294967295
}
function makeSurfaceTexture(kind:Exclude<SurfaceKind,'plain'>) {
  const size=128,data=new Uint8Array(size*size*4)
  const seed=kind==='wood'?19:kind==='plaster'?43:kind==='stone'?71:97
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const px=x/size,py=y/size
    const grain=textureHash(x,y,seed),coarse=textureHash(Math.floor(x/8),Math.floor(y/8),seed+11)
    let value=.82
    if(kind==='wood') {
      const bend=8*Math.sin(py*9.0)+3*Math.sin(py*25.0)
      const lines=.5+.5*Math.sin((x+bend)*.48+Math.sin(y*.12)*2.2)
      const knots=Math.max(0,.22-Math.hypot((px-.28)%1,(py-.63)%1))*1.2
      value=.63+.22*lines+.11*coarse+.06*grain-.18*knots
    } else if(kind==='plaster') {
      const trowel=.5+.5*Math.sin(px*18+Math.sin(py*13)*1.8)
      value=.78+.10*coarse+.07*trowel+.05*grain
    } else if(kind==='stone') {
      const cell=textureHash(Math.floor(x/13+(Math.floor(y/11)%2)*.45),Math.floor(y/11),seed+23)
      const edgeX=Math.min((x%13)/13,1-(x%13)/13)
      const edgeY=Math.min((y%11)/11,1-(y%11)/11)
      const mortar=Math.min(edgeX,edgeY)<.055?-.16:0
      value=.60+.27*cell+.11*coarse+.06*grain+mortar
    } else {
      const row=Math.floor(y/13),shift=(row%2)*8
      const sx=(x+shift)%16,sy=y%13
      const seam=(sx<1.4||sy<1.4)?-.20:0
      const tile=textureHash(Math.floor((x+shift)/16),row,seed+31)
      value=.64+.24*tile+.10*grain+seam
    }
    const v=Math.round(Math.max(.28,Math.min(1,value))*255),i=(y*size+x)*4
    data[i]=v;data[i+1]=v;data[i+2]=v;data[i+3]=255
  }
  const tex=new T.DataTexture(data,size,size,T.RGBAFormat,T.UnsignedByteType)
  tex.wrapS=tex.wrapT=T.RepeatWrapping
  tex.magFilter=T.LinearFilter
  tex.minFilter=T.LinearMipmapLinearFilter
  tex.generateMipmaps=true
  tex.colorSpace=T.NoColorSpace
  tex.needsUpdate=true
  return tex
}
function textureMaterial(m:T.MeshStandardMaterial,kind:SurfaceKind,tex?:T.DataTexture) {
  if(kind==='plain'||!tex)return
  m.customProgramCacheKey=()=>`waterfall-surface-map-v3-${kind}`
  m.onBeforeCompile=shader=>{
    shader.uniforms.surfaceMap={value:tex}
    shader.vertexShader=shader.vertexShader
      .replace('#include <common>','#include <common>\nvarying vec3 vSurfacePosition;\nvarying vec3 vSurfaceNormal;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvSurfacePosition=(modelMatrix*vec4(position,1.0)).xyz;\nvSurfaceNormal=normalize(mat3(modelMatrix)*normal);')
    const functions=`
uniform sampler2D surfaceMap;
varying vec3 vSurfacePosition;
varying vec3 vSurfaceNormal;
float mappedSurface(vec3 p,vec3 n,float scale){
  vec3 w=abs(normalize(n))+.0001;w/=w.x+w.y+w.z;
  float sx=texture2D(surfaceMap,p.zy*scale).r;
  float sy=texture2D(surfaceMap,p.xz*scale).r;
  float sz=texture2D(surfaceMap,p.xy*scale).r;
  return sx*w.x+sy*w.y+sz*w.z;
}`
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>${functions}`)
    const scale=kind==='wood'?'.72':kind==='plaster'?'.46':kind==='stone'?'.62':'.78'
    const contrast=kind==='plaster'?'float surfaceTone=.82+surfaceValue*.30;':kind==='wood'?'float surfaceTone=.64+surfaceValue*.54;':kind==='stone'?'float surfaceTone=.62+surfaceValue*.56;':'float surfaceTone=.64+surfaceValue*.52;'
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>\nfloat surfaceValue=mappedSurface(vSurfacePosition,vSurfaceNormal,${scale});\n${contrast}\ndiffuseColor.rgb*=surfaceTone;`)
    const roughness=kind==='plaster'?'.14':kind==='stone'?'.19':kind==='shingle'?'.17':'.15'
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>\nfloat surfaceRough=mappedSurface(vSurfacePosition,vSurfaceNormal,${scale}*1.7);\nroughnessFactor=clamp(roughnessFactor+(.5-surfaceRough)*${roughness},.50,1.0);`)
  }
}
export type Kit=ReturnType<typeof createKit>
export function createKit(scene:T.Scene) {
  const root=new T.Group(),materials=new Map<string,T.MeshStandardMaterial>(),geometries=new Set<T.BufferGeometry>()
  const rand=random(),rocks=Array.from({length:7},(_,i)=>pebbleGeometry(i*73+3))
  const surfaceTextures=new Map<Exclude<SurfaceKind,'plain'>,T.DataTexture>([
    ['wood',makeSurfaceTexture('wood')],['plaster',makeSurfaceTexture('plaster')],['stone',makeSurfaceTexture('stone')],['shingle',makeSurfaceTexture('shingle')],
  ])
  rocks.forEach(g=>geometries.add(g))
  const material=(color:string) => {
    const key=color.toLowerCase()
    if(!materials.has(key)) {
      const m=new T.MeshStandardMaterial({color,roughness:.88})
      const kind=surfaceKind(key)
      textureMaterial(m,kind,kind==='plain'?undefined:surfaceTextures.get(kind))
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
  return {root,add,box,beam,rock,lantern,flower,fence,material,rand,finish,dispose:()=>{geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());surfaceTextures.forEach(t=>t.dispose())}}
}
