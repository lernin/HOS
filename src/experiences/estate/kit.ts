import * as T from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { random, pebbleGeometry } from '../village/kit'
export { random }
export const v=(x:number,y:number,z:number)=>new T.Vector3(x,y,z)
const colors:Record<string,string>={limestone:'#d8cbb7',travertine:'#c9b69a',marble:'#e7e2d5',plaster:'#dfd9ca',oak:'#a58a63',oakFloor:'#a99a7e',walnut:'#644b36',bronze:'#5b4b37',basalt:'#3a4242',concrete:'#959488',linen:'#e5ddca',sage:'#8c9b86',clay:'#b19b86',indigo:'#465762',rug:'#b6a991',glass:'#c7e0dc',leaf:'#517352',leafLight:'#80935a',leafDark:'#314e43',bark:'#777365',soil:'#4c5140',white:'#f0ede3',black:'#222a29',gold:'#b29863',glow:'#ffe2af',ceramic:'#bba587',roof:'#72786c',waterTile:'#377e7f',pink:'#c79781'}
const noiseGLSL=`
float estateHash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float estateNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(estateHash(i),estateHash(i+vec3(1,0,0)),f.x),mix(estateHash(i+vec3(0,1,0)),estateHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(estateHash(i+vec3(0,0,1)),estateHash(i+vec3(1,0,1)),f.x),mix(estateHash(i+vec3(0,1,1)),estateHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
`
export function createEstateKit(scene:T.Scene){
  const root=new T.Group(),mats=new Map<string,T.MeshStandardMaterial>(),sources=new Set<T.BufferGeometry>(),outputs=new Set<T.BufferGeometry>()
  const cache=new Map<string,T.BufferGeometry>()
  function material(name:string){if(mats.has(name))return mats.get(name)!
    const metal=['bronze','gold','black'].includes(name),fabric=['linen','sage','clay','indigo','rug'].includes(name),wood=['oak','oakFloor','walnut','bark'].includes(name)
    const m=new T.MeshStandardMaterial({color:colors[name]||name,roughness:metal?.28:fabric?.94:wood?.63:name==='marble'?.4:.74,metalness:metal?.8:0})
    if(name==='glass'){m.transparent=true;m.opacity=.16;m.roughness=.13;m.metalness=.2;m.depthWrite=false}
    if(name==='glow'){m.emissive.set('#ffca79');m.emissiveIntensity=2;m.roughness=.55}
    if(name!=='glass'&&name!=='glow'){
      m.onBeforeCompile=s=>{
        s.vertexShader='varying vec3 estateP;\n'+s.vertexShader
        s.vertexShader=s.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nestateP=(modelMatrix*vec4(transformed,1.)).xyz;')
        s.fragmentShader='varying vec3 estateP;\n'+noiseGLSL+s.fragmentShader
        const pattern=name==='oakFloor'?`vec2 board=vec2(p.x/.24,(p.z+estateHash(vec3(floor(p.x/.24),0.,0.))*3.)/3.);vec2 edge=min(fract(board),1.-fract(board));vec2 aa=max(fwidth(board),vec2(.001));float joint=1.-min(smoothstep(0.,aa.x+.006,edge.x),smoothstep(0.,aa.y+.002,edge.y));float detail=(estateHash(vec3(floor(board),2.))-.5)*.45+sin(p.x*180.+estateNoise(p*vec3(2.,.2,.13))*14.)*.045-joint*.8;`
          :wood?`float grain=sin(p.${name==='oak'?'x':'z'}*135.+estateNoise(p*vec3(.5,1.8,.5))*18.);float detail=grain*.09+estateNoise(p*vec3(9.,.18,9.))*.25-.125;`
          :fabric?'float detail=sin(p.x*240.)*sin(p.z*240.)*.22+estateNoise(p*85.)-.5;'
          :name==='marble'?'float vein=abs(sin(p.x*.65+p.z*.8+p.y*.72+estateNoise(p*.8)*3.5+estateNoise(p*2.1)*.55));float detail=-(1.-smoothstep(.02,.13,vein))*.46+estateNoise(p*1.3)*.13-.03;'
          :name==='travertine'?'float detail=sin((p.y+p.z*.035)*22.+estateNoise(p*1.8)*9.)*.13+estateNoise(p*3.)*.6-.3;'
          :'float detail=estateNoise(p*.7)*.65+estateNoise(p*12.)*.2-.425;'
        s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>\nvec3 p=estateP;${pattern}\ndiffuseColor.rgb*=1.+detail*${name==='marble'?'.65':name==='oakFloor'?'.4':wood?'.22':fabric?'.10':'.20'};`)
        s.fragmentShader=s.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+detail*.10,.08,1.);')
        s.fragmentShader=s.fragmentShader.replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\nnormal=normalize(normal+vec3(dFdx(detail),dFdy(detail),0.)*.035);')
      };m.customProgramCacheKey=()=>`estate-${name}`
    }mats.set(name,m);return m
  }
  function mesh(g:T.BufferGeometry,mat:string,x=0,y=0,z=0,parent:T.Group=root){sources.add(g);const m=new T.Mesh(g,material(mat));m.position.set(x,y,z);parent.add(m);return m}
  function box(x:number,y:number,z:number,w:number,h:number,d:number,mat='plaster',parent:T.Group=root,round=0){
    const key=`${w},${h},${d},${round}`;if(!cache.has(key))cache.set(key,round?new RoundedBoxGeometry(w,h,d,2,Math.min(round,w*.25,h*.25,d*.25)):new T.BoxGeometry(w,h,d))
    return mesh(cache.get(key)!,mat,x,y,z,parent)
  }
  const cylinder=(x:number,y:number,z:number,r:number,h:number,mat:string,parent:T.Group=root,top=r,segments=16)=>mesh(new T.CylinderGeometry(top,r,h,segments),mat,x,y,z,parent)
  function beam(points:T.Vector3[],r:number,mat:string,parent:T.Group=root,segments=7){return mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points),Math.max(6,points.length*5),r,segments,false),mat,0,0,0,parent)}
  function ellipsoid(x:number,y:number,z:number,sx:number,sy:number,sz:number,mat:string,parent:T.Group=root,detail=12){const m=mesh(new T.SphereGeometry(1,detail,Math.max(5,detail/2)),mat,x,y,z,parent);m.scale.set(sx,sy,sz);return m}
  function lathe(points:[number,number][],mat:string,x:number,y:number,z:number,parent:T.Group=root){return mesh(new T.LatheGeometry(points.map(([a,b])=>new T.Vector2(a,b)),24),mat,x,y,z,parent)}
  function group(x:number,y:number,z:number,angle=0){const g=new T.Group();g.position.set(x,y,z);g.rotation.y=angle;root.add(g);return g}
  function finish(){root.updateMatrixWorld(true);const batches=new Map<string,{mat:T.Material,parts:T.BufferGeometry[]}>()
    root.traverse(o=>{if(!(o instanceof T.Mesh))return;const mat=o.material as T.Material
      let g=o.geometry.clone().applyMatrix4(o.matrixWorld);if(g.index){const old=g;g=g.toNonIndexed();old.dispose()}
      g.deleteAttribute('uv');g.deleteAttribute('color');g.deleteAttribute('tangent')
      const pos=new T.Vector3();o.getWorldPosition(pos);const key=mat.uuid+':'+Math.floor(pos.x/28)+':'+Math.floor(pos.z/28)
      if(!batches.has(key))batches.set(key,{mat,parts:[]});batches.get(key)!.parts.push(g)
    })
    for(const {mat,parts} of batches.values()){const g=mergeGeometries(parts);parts.forEach(p=>p.dispose());if(!g)continue;outputs.add(g);g.computeBoundingSphere();const m=new T.Mesh(g,mat);m.castShadow=mat!==material('glass')&&mat!==material('glow');m.receiveShadow=true;scene.add(m)}root.clear();sources.forEach(g=>g.dispose());sources.clear();cache.clear()
  }
  return {root,material,mesh,box,cylinder,beam,ellipsoid,lathe,group,finish,dispose(){sources.forEach(g=>g.dispose());outputs.forEach(g=>g.dispose());mats.forEach(m=>m.dispose())},rockGeometry:pebbleGeometry}
}
export type EstateKit=ReturnType<typeof createEstateKit>
