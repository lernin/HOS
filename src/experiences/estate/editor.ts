import * as T from 'three'
import { FLOOR } from './plan'
import './editor.css'

export type EditableRoomId = 'foyer' | 'great-room'
export type EditableSurface = 'floor' | 'walls'
export type EditorMaterial = { id:string; label:string; slug:string; surface:EditableSurface; use:string; meters:number }

const ph=(slug:string,map='diff')=>`https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/${slug}/${slug}_${map}_1k.jpg`

export const estateEditorMaterials:EditorMaterial[]=[
  {id:'marble01',label:'Cream Marble 01',slug:'marble_01',surface:'floor',use:'Large-format cream stone · staggered and naturally varied',meters:1.5},
  {id:'marbleTiles',label:'Beige Marble Tiles',slug:'marble_tiles',surface:'floor',use:'More visible tile rhythm',meters:1.35},
  {id:'oakPlanks',label:'Warm Oak Planks',slug:'oak_wood_planks',surface:'floor',use:'Warm private-room timber',meters:1.2},
  {id:'whitePlaster',label:'Soft White Plaster',slug:'white_plaster_02',surface:'walls',use:'Quiet matte architectural wall',meters:1.8},
  {id:'beigeWall',label:'Warm Beige Plaster',slug:'beige_wall_001',surface:'walls',use:'Warm mineral wall finish',meters:2.0},
  {id:'plaster02',label:'Mineral Plaster 02',slug:'plastered_wall_02',surface:'walls',use:'Tactile feature-grade plaster',meters:2.2},
]

export const estateEditorPreview=(id:string)=>{const m=estateEditorMaterials.find(x=>x.id===id);return m?ph(m.slug):''}

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
  const loader=new T.TextureLoader(),textures=new Map<string,T.Texture>(),materials=new Set<T.MeshStandardMaterial>(),geometries=new Set<T.BufferGeometry>()
  const surfaces:Record<EditableRoomId,Record<EditableSurface,T.Mesh[]>>={foyer:{floor:[],walls:[]},'great-room':{floor:[],walls:[]}}
  function texture(url:string,color=false){
    let t=textures.get(url)
    if(!t){t=loader.load(url,()=>renderer.render(scene,camera));t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());if(color)t.colorSpace=T.SRGBColorSpace;textures.set(url,t)}
    return t
  }
  function luxuryStoneMaterial(def:EditorMaterial){
    const diff=texture(ph(def.slug),true),rough=texture(ph(def.slug,'rough')),normalTex=texture(ph(def.slug,'nor_gl'))
    const m=new T.MeshStandardMaterial({color:'#fffaf0',roughness:.6,metalness:0})
    m.onBeforeCompile=s=>{
      s.uniforms.oeDiff={value:diff};s.uniforms.oeRough={value:rough};s.uniforms.oeNormal={value:normalTex}
      s.vertexShader='varying vec3 oeWorld;\n'+s.vertexShader
      s.vertexShader=s.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\noeWorld=(modelMatrix*vec4(transformed,1.)).xyz;')
      s.fragmentShader=`varying vec3 oeWorld;\nuniform sampler2D oeDiff;\nuniform sampler2D oeRough;\nuniform sampler2D oeNormal;\nfloat oeHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}\n`+s.fragmentShader
      s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        vec2 oeQ=oeWorld.xz;
        const float oeTileW=1.20;
        const float oeTileH=.60;
        float oeRow=floor((oeQ.y+37.13)/oeTileH);
        float oeStagger=mod(oeRow,2.)*.5;
        vec2 oeTC=vec2((oeQ.x+53.7)/oeTileW+oeStagger,(oeQ.y+37.13)/oeTileH);
        vec2 oeCell=floor(oeTC);
        vec2 oeF=fract(oeTC);
        float oeR=oeHash(oeCell);
        vec2 oeU=oeF;
        if(oeR<.25) oeU=oeF;
        else if(oeR<.5) oeU=vec2(oeF.y,1.-oeF.x);
        else if(oeR<.75) oeU=1.-oeF;
        else oeU=vec2(1.-oeF.y,oeF.x);
        vec2 oeOffset=(vec2(oeHash(oeCell+vec2(13.2,7.1)),oeHash(oeCell+vec2(3.7,19.4)))-.5)*.16;
        vec2 oeStoneUv=clamp(vec2(.28)+oeU*.44+oeOffset,.04,.96);
        vec3 oeStone=texture2D(oeDiff,oeStoneUv).rgb;
        float oeTileTone=.94+oeHash(oeCell+vec2(41.3,2.7))*.11;
        float oeMacro=sin(oeQ.x*.19+oeQ.y*.11)*.012+sin(oeQ.x*.071-oeQ.y*.083)*.009;
        float oeEdge=min(min(oeF.x,1.-oeF.x)*oeTileW,min(oeF.y,1.-oeF.y)*oeTileH);
        float oeGrout=smoothstep(.006,.014,oeEdge);
        vec3 oeGroutColor=vec3(.755,.725,.665);
        diffuseColor.rgb=mix(oeGroutColor,oeStone*(oeTileTone+oeMacro)*1.055,oeGrout);
      `)
      s.fragmentShader=s.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
        float oeSurfaceR=texture2D(oeRough,oeStoneUv).r;
        roughnessFactor=clamp(mix(.44,.76,oeSurfaceR)+(oeHash(oeCell+vec2(9.1,27.2))-.5)*.055,.40,.82);
      `)
      s.fragmentShader=s.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
        vec3 oeN=texture2D(oeNormal,oeStoneUv).xyz*2.-1.;
        normal=normalize(normal+vec3(oeN.x,oeN.y,0.)*.035);
      `)
    }
    m.customProgramCacheKey=()=>`oe-luxury-stone-${def.id}-v2`
    materials.add(m);return m
  }
  function materialFor(id:string,repeatX:number,repeatY:number){
    const def=estateEditorMaterials.find(m=>m.id===id);if(!def)return null
    if(def.surface==='floor'&&def.id==='marble01')return luxuryStoneMaterial(def)
    const map=texture(ph(def.slug),true).clone(),rough=texture(ph(def.slug,'rough')).clone(),normal=texture(ph(def.slug,'nor_gl')).clone()
    for(const t of [map,rough,normal]){t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(Math.max(.5,repeatX/def.meters),Math.max(.5,repeatY/def.meters));t.needsUpdate=true}
    map.colorSpace=T.SRGBColorSpace
    const m=new T.MeshStandardMaterial({color:'#ffffff',map,roughnessMap:rough,normalMap:normal,roughness:def.surface==='floor'?.58:.82,metalness:0,normalScale:new T.Vector2(.45,.45)})
    materials.add(m);return m
  }
  function addMesh(room:EditableRoomId,surface:EditableSurface,g:T.BufferGeometry,x:number,y:number,z:number){
    geometries.add(g);const m=new T.Mesh(g,new T.MeshStandardMaterial({transparent:true,opacity:0,depthWrite:false}));materials.add(m.material as T.MeshStandardMaterial);m.position.set(x,y,z);m.visible=false;m.receiveShadow=true;m.renderOrder=3;scene.add(m);surfaces[room][surface].push(m)
  }
  for(const room of ['foyer','great-room'] as EditableRoomId[]){
    const f=floorRects[room];addMesh(room,'floor',new T.BoxGeometry(f.w,.025,f.d),f.x,FLOOR+.018,f.z)
    for(const p of wallPanels[room])addMesh(room,'walls',new T.BoxGeometry(p.w,p.h,p.d),p.x,FLOOR+p.h/2,p.z)
  }
  function setMaterial(room:EditableRoomId,surface:EditableSurface,id:string|null){
    for(const mesh of surfaces[room][surface]){
      const old=mesh.material as T.MeshStandardMaterial
      if(id){const size=mesh.geometry.boundingBox||(()=>{mesh.geometry.computeBoundingBox();return mesh.geometry.boundingBox!})(),w=Math.max(.1,size.max.x-size.min.x,size.max.z-size.min.z),h=Math.max(.1,size.max.y-size.min.y,size.max.z-size.min.z);const next=materialFor(id,w,h);if(next){mesh.material=next;mesh.visible=true}}
      else mesh.visible=false
      if(old&&materials.has(old)){old.map?.dispose();old.roughnessMap?.dispose();old.normalMap?.dispose();old.dispose();materials.delete(old)}
    }
    renderer.render(scene,camera)
  }
  function project(room:EditableRoomId,surface:EditableSurface){
    const world=roomAnchors[room][surface],to=world.clone().sub(camera.position),forward=new T.Vector3();camera.getWorldDirection(forward)
    if(forward.dot(to)<=0)return {x:0,y:0,visible:false}
    const p=world.clone().project(camera),r=canvas.getBoundingClientRect(),visible=p.z>-1&&p.z<1&&p.x>-1.05&&p.x<1.05&&p.y>-1.05&&p.y<1.05
    return {x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2,visible}
  }
  return {setMaterial,project,dispose(){for(const room of Object.values(surfaces))for(const list of Object.values(room))for(const m of list){scene.remove(m);m.geometry.dispose();(m.material as T.Material).dispose()}textures.forEach(t=>t.dispose());materials.forEach(m=>{m.map?.dispose();m.roughnessMap?.dispose();m.normalMap?.dispose();m.dispose()});geometries.forEach(g=>g.dispose())}}
}
