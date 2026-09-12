import * as T from 'three'
import { FLOOR } from './plan'
import './editor.css'

export type EditableRoomId = 'foyer' | 'great-room'
export type EditableSurface = 'floor' | 'walls'
export type EditorSurfaceHit = { room: EditableRoomId; surface: EditableSurface }
export type EditorMaterial = {
  id:string
  label:string
  slug:string
  use:string
  meters:number
  category?:string
  previewUrl?:string
  diffuseUrl?:string
  roughnessUrl?:string|null
  normalUrl?:string|null
}

const ph=(slug:string,map='diff')=>`https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/${slug}/${slug}_${map}_1k.jpg`

export const estateEditorMaterials:EditorMaterial[]=[
  {id:'marble01',label:'Cream Marble 01',slug:'marble_01',use:'Calm cream stone · subtly varied',meters:1.5,category:'Stone'},
  {id:'marbleTiles',label:'Beige Marble Tiles',slug:'marble_tiles',use:'More visible tile rhythm',meters:1.35,category:'Stone'},
  {id:'oakPlanks',label:'Warm Oak Planks',slug:'oak_wood_planks',use:'Warm private-room timber',meters:1.2,category:'Wood floor'},
  {id:'whitePlaster',label:'Soft White Plaster',slug:'white_plaster_02',use:'Quiet matte architectural wall',meters:1.8,category:'Wall'},
  {id:'beigeWall',label:'Warm Beige Plaster',slug:'beige_wall_001',use:'Warm mineral wall finish',meters:2.0,category:'Wall'},
  {id:'plaster02',label:'Mineral Plaster 02',slug:'plastered_wall_02',use:'Tactile feature-grade plaster',meters:2.2,category:'Feature wall'},
]

export const estateEditorPreview=(material:EditorMaterial)=>material.previewUrl||material.diffuseUrl||ph(material.slug)

const roomAnchors:Record<EditableRoomId,Record<EditableSurface,T.Vector3>>={
  foyer:{floor:new T.Vector3(1,FLOOR+.07,16),walls:new T.Vector3(-5.72,FLOOR+2.15,17.3)},
  'great-room':{floor:new T.Vector3(1,FLOOR+.07,-2),walls:new T.Vector3(12.72,FLOOR+2.5,-2.5)},
}

type Panel={x:number;z:number;w:number;d:number;h:number}
const wallPanels:Record<EditableRoomId,Panel[]>={
  foyer:[
    {x:-5.80,z:11.5,w:.03,d:7,h:4.25},{x:-5.80,z:22,w:.03,d:4,h:4.25},
    {x:7.80,z:9,w:.03,d:2,h:4.25},{x:7.80,z:16.5,w:.03,d:5,h:4.25},{x:7.80,z:23.5,w:.03,d:1,h:4.25},
    {x:-3.6,z:23.80,w:4.8,d:.03,h:4.25},{x:5.6,z:23.80,w:4.8,d:.03,h:4.25},
    {x:-5,z:8.20,w:2,d:.03,h:4.25},{x:6.5,z:8.20,w:3,d:.03,h:4.25},
  ],
  'great-room':[
    {x:-10.80,z:-10,w:.03,d:4,h:5.2},{x:-10.80,z:.5,w:.03,d:5,h:5.2},{x:-10.80,z:7.5,w:.03,d:1,h:5.2},
    {x:12.80,z:-10,w:.03,d:4,h:5.2},{x:12.80,z:.5,w:.03,d:5,h:5.2},{x:12.80,z:7.5,w:.03,d:1,h:5.2},
    {x:-7.5,z:7.80,w:7,d:.03,h:5.2},{x:9,z:7.80,w:8,d:.03,h:5.2},
  ],
}

const floorRects:Record<EditableRoomId,{x:number;z:number;w:number;d:number}>={
  foyer:{x:1,z:16,w:14,d:16},
  'great-room':{x:1,z:-2,w:24,d:20},
}

export function createEstateEditor(scene:T.Scene,renderer:T.WebGLRenderer,camera:T.Camera,canvas:HTMLCanvasElement){
  const loader=new T.TextureLoader(),textures=new Map<string,T.Texture>(),materials=new Set<T.Material>(),geometries=new Set<T.BufferGeometry>()
  const definitions=new Map<string,EditorMaterial>(estateEditorMaterials.map(m=>[m.id,m]))
  const surfaces:Record<EditableRoomId,Record<EditableSurface,T.Mesh[]>>={foyer:{floor:[],walls:[]},'great-room':{floor:[],walls:[]}}
  const targets:Record<EditableRoomId,Record<EditableSurface,T.Mesh[]>>={foyer:{floor:[],walls:[]},'great-room':{floor:[],walls:[]}}
  const pickables:T.Mesh[]=[]
  const raycaster=new T.Raycaster()
  function texture(url:string,color=false){
    let t=textures.get(url)
    if(!t){t=loader.load(url,()=>renderer.render(scene,camera));t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());if(color)t.colorSpace=T.SRGBColorSpace;textures.set(url,t)}
    return t
  }
  function urls(def:EditorMaterial){return {diff:def.diffuseUrl||ph(def.slug),rough:def.roughnessUrl||ph(def.slug,'rough'),normal:def.normalUrl||ph(def.slug,'nor_gl')}}
  function permutedStoneMaterial(def:EditorMaterial){
    const u=urls(def),diff=texture(u.diff,true),rough=texture(u.rough),normalTex=texture(u.normal)
    const m=new T.MeshStandardMaterial({color:'#ffffff',roughness:.58,metalness:0})
    m.onBeforeCompile=s=>{
      s.uniforms.oeDiff={value:diff};s.uniforms.oeRough={value:rough};s.uniforms.oeNormal={value:normalTex}
      s.vertexShader='varying vec3 oeWorld;\n'+s.vertexShader
      s.vertexShader=s.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\noeWorld=(modelMatrix*vec4(transformed,1.)).xyz;')
      s.fragmentShader=`varying vec3 oeWorld;\nuniform sampler2D oeDiff;\nuniform sampler2D oeRough;\nuniform sampler2D oeNormal;\nfloat oeHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}\n`+s.fragmentShader
      s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>\n        const float oeCellSize=1.50;\n        vec2 oeTC=(oeWorld.xz+vec2(53.7,37.13))/oeCellSize;\n        vec2 oeCell=floor(oeTC);\n        vec2 oeF=fract(oeTC);\n        float oeR=oeHash(oeCell);\n        vec2 oeStoneUv=oeF;\n        if(oeR<.25) oeStoneUv=oeF;\n        else if(oeR<.5) oeStoneUv=vec2(oeF.y,1.-oeF.x);\n        else if(oeR<.75) oeStoneUv=1.-oeF;\n        else oeStoneUv=vec2(1.-oeF.y,oeF.x);\n        vec3 oeStone=texture2D(oeDiff,oeStoneUv).rgb;\n        float oeTone=.985+oeHash(oeCell+vec2(41.3,2.7))*.03;\n        diffuseColor.rgb=oeStone*oeTone;\n      `)
      s.fragmentShader=s.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>\n        float oeSurfaceR=texture2D(oeRough,oeStoneUv).r;\n        roughnessFactor=clamp(oeSurfaceR+(oeHash(oeCell+vec2(9.1,27.2))-.5)*.03,.38,.88);\n      `)
      s.fragmentShader=s.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>\n        vec3 oeN=texture2D(oeNormal,oeStoneUv).xyz*2.-1.;\n        normal=normalize(normal+vec3(oeN.x,oeN.y,0.)*.03);\n      `)
    }
    m.customProgramCacheKey=()=>`oe-permuted-stone-${def.id}-v3`
    materials.add(m);return m
  }
  function materialFor(id:string,repeatX:number,repeatY:number,surface:EditableSurface){
    const def=definitions.get(id);if(!def)return null
    if(def.id==='marble01'&&surface==='floor')return permutedStoneMaterial(def)
    const u=urls(def),map=texture(u.diff,true).clone(),rough=texture(u.rough).clone(),normal=texture(u.normal).clone()
    for(const t of [map,rough,normal]){t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(Math.max(.5,repeatX/def.meters),Math.max(.5,repeatY/def.meters));t.needsUpdate=true}
    map.colorSpace=T.SRGBColorSpace
    const m=new T.MeshStandardMaterial({color:'#ffffff',map,roughnessMap:rough,normalMap:normal,roughness:surface==='floor'?.58:.82,metalness:0,normalScale:new T.Vector2(.45,.45)})
    materials.add(m);return m
  }
  function addMesh(room:EditableRoomId,surface:EditableSurface,g:T.BufferGeometry,x:number,y:number,z:number){
    geometries.add(g)
    const base=new T.MeshStandardMaterial({transparent:true,opacity:0,depthWrite:false});materials.add(base)
    const finish=new T.Mesh(g,base);finish.position.set(x,y,z);finish.visible=false;finish.receiveShadow=true;finish.renderOrder=3;finish.userData.estateEditorSurface=true;scene.add(finish);surfaces[room][surface].push(finish)
    const hitMat=new T.MeshBasicMaterial({color:'#f0cf8d',transparent:true,opacity:0,depthWrite:false,colorWrite:false,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});materials.add(hitMat)
    const target=new T.Mesh(g,hitMat);target.position.set(x,y,z);target.renderOrder=8;target.userData.estateEditorSurface=true;target.userData.estateEditorHit={room,surface} satisfies EditorSurfaceHit;scene.add(target);targets[room][surface].push(target);pickables.push(target)
  }
  for(const room of ['foyer','great-room'] as EditableRoomId[]){
    const f=floorRects[room];addMesh(room,'floor',new T.BoxGeometry(f.w,.025,f.d),f.x,FLOOR+.018,f.z)
    for(const p of wallPanels[room])addMesh(room,'walls',new T.BoxGeometry(p.w,p.h,p.d),p.x,FLOOR+p.h/2,p.z)
  }
  function setMaterial(room:EditableRoomId,surface:EditableSurface,id:string|null){
    for(const mesh of surfaces[room][surface]){
      const old=mesh.material as T.MeshStandardMaterial
      if(id){mesh.geometry.computeBoundingBox();const size=mesh.geometry.boundingBox!,w=Math.max(.1,size.max.x-size.min.x,size.max.z-size.min.z),h=Math.max(.1,size.max.y-size.min.y,size.max.z-size.min.z);const next=materialFor(id,w,h,surface);if(next){mesh.material=next;mesh.visible=true}}
      else mesh.visible=false
      if(old&&materials.has(old)){old.map?.dispose();old.roughnessMap?.dispose();old.normalMap?.dispose();old.dispose();materials.delete(old)}
    }
    renderer.render(scene,camera)
  }
  function select(hit:EditorSurfaceHit|null){
    for(const room of ['foyer','great-room'] as EditableRoomId[])for(const surface of ['floor','walls'] as EditableSurface[])for(const mesh of targets[room][surface]){
      const m=mesh.material as T.MeshBasicMaterial,selected=hit?.room===room&&hit.surface===surface
      m.opacity=selected?.18:0;m.colorWrite=!!selected;m.needsUpdate=true
    }
    renderer.render(scene,camera)
  }
  function pick(clientX:number,clientY:number):EditorSurfaceHit|null{
    const r=canvas.getBoundingClientRect();if(!r.width||!r.height)return null
    raycaster.setFromCamera(new T.Vector2((clientX-r.left)/r.width*2-1,-(clientY-r.top)/r.height*2+1),camera)
    const hit=raycaster.intersectObjects(pickables,false)[0]
    return hit?.object.userData.estateEditorHit??null
  }
  function project(room:EditableRoomId,surface:EditableSurface){
    const world=roomAnchors[room][surface],to=world.clone().sub(camera.position),forward=new T.Vector3();camera.getWorldDirection(forward)
    if(forward.dot(to)<=0)return {x:0,y:0,visible:false}
    const p=world.clone().project(camera),r=canvas.getBoundingClientRect(),visible=p.z>-1&&p.z<1&&p.x>-1.05&&p.x<1.05&&p.y>-1.05&&p.y<1.05
    return {x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2,visible}
  }
  return {setMaterial,select,pick,project,registerMaterials(items:EditorMaterial[]){for(const item of items)definitions.set(item.id,item)},dispose(){for(const room of ['foyer','great-room'] as EditableRoomId[])for(const surface of ['floor','walls'] as EditableSurface[]){for(const m of surfaces[room][surface])scene.remove(m);for(const m of targets[room][surface])scene.remove(m)}textures.forEach(t=>t.dispose());materials.forEach(m=>{if(m instanceof T.MeshStandardMaterial){m.map?.dispose();m.roughnessMap?.dispose();m.normalMap?.dispose()}m.dispose()});geometries.forEach(g=>g.dispose())}}
}
