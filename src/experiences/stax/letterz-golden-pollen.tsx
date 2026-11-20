import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import type { RefObject } from 'react'
import type { Kind } from './model'

/**
 * Uses Letterz's ORIGINAL material registry/engine (#10), unmodified and
 * loaded only while Golden Pollen is selected. Geometry and camera mapping
 * are the only STAX-specific pieces. All 160 moving grains + 28 escaping
 * grains are painted by the original Scene.draw code on a single shared canvas.
 *
 * The canvas is pointer-events:none; SVG retains all touch and snap semantics.
 */
export type PollenAtom = {
 id:string;kind:Kind;x:number;y:number;w:number;h:number;omitted?:boolean
}
export type PollenView = {x:number;y:number;width:number;height:number}
type Point = {x:number;y:number;tx:number;ty:number;nx:number;ny:number}
type Part = {pts:Point[];path:Path2D}
type LetterzScene = {
 canvas:HTMLCanvasElement;c:CanvasRenderingContext2D;
 i:number;t:number;gameplay:boolean;materialScale:number;coreScale:number;
 liveParts:Part[];
 setGameplayTransform:(c:CanvasRenderingContext2D)=>void;
 draw:(dt:number)=>void;
}
type LetterzRegistry = {has:(id:number)=>boolean;instantiate:(id:number,host:LetterzScene)=>LetterzScene}
type LetterzWindow = Window&{
 LetterzStrokeEngine?:{sourceVersion:string};
 LetterzMaterialRegistry?:LetterzRegistry
}
const ENGINE_URL='/stax-letterz-original/magical_stroke_engine.js'
const REGISTRY_URL='/stax-letterz-original/stroke_material_registry.js'
const GOLDEN_POLLEN_ID=10

/** Cache the original scripts so reopening the theme does not reload 75 pens. */
let loading:Promise<LetterzRegistry>|null=null
function loadOriginalLetterz():Promise<LetterzRegistry>{
 if(typeof window==='undefined')return Promise.reject(Error('Browser required'))
 const host=window as LetterzWindow
 if(host.LetterzMaterialRegistry?.has(GOLDEN_POLLEN_ID))return Promise.resolve(host.LetterzMaterialRegistry)
 if(loading)return loading
 const script=(src:string)=>new Promise<void>((resolve,reject)=>{
  const node=document.createElement('script')
  node.src=src
  node.async=false
  node.onload=()=>resolve()
  node.onerror=()=>reject(Error('Cannot load original Letterz material: '+src))
  document.head.appendChild(node)
 })
 loading=(async()=>{
  if(!host.LetterzStrokeEngine)await script(ENGINE_URL)
  if(!host.LetterzMaterialRegistry)await script(REGISTRY_URL)
  const registry=host.LetterzMaterialRegistry
  if(!registry?.has(GOLDEN_POLLEN_ID)||host.LetterzStrokeEngine?.sourceVersion!=='original-75-shared-v1')
   throw Error('Letterz original Golden Pollen #10 unavailable')
  return registry
 })().catch(e=>{loading=null;throw e})
 return loading
}

/** The seven canonical STAX geometries, expressed as SVG paths for Letterz. */
export function staxLetterzPath(kind:Kind,w:number,h:number):string{
 const polygon=(points:[number,number][])=>'M '+points.map(([x,y])=>x+' '+y).join(' L ')+' Z'
 if(kind==='circle'||kind==='oval'){
  const rx=w/2,ry=h/2,cy=h/2
  return `M ${w} ${cy} A ${rx} ${ry} 0 1 0 0 ${cy} A ${rx} ${ry} 0 1 0 ${w} ${cy} Z`
 }
 if(kind==='square'||kind==='rectangle')return `M 0 0 H ${w} V ${h} H 0 Z`
 if(kind==='triangle')return polygon([[w/2,0],[w,h],[0,h]])
 if(kind==='diamond')return polygon([[w/2,0],[w,h/2],[w/2,h],[0,h/2]])
 if(kind==='hexagon')return polygon([[w*.22,0],[w*.78,0],[w,h/2],[w*.78,h],[w*.22,h],[0,h/2]])
 throw Error('Unsupported STAX kind: '+kind)
}

/** Letterz's exact path-length and normal/tangent sampling from
 * magical_lab_renderer.js; the adapter only supplies different paths.
 */
function sampleOriginalStroke(sampler:SVGSVGElement,d:string):Part{
 const path=document.createElementNS('http://www.w3.org/2000/svg','path')
 path.setAttribute('d',d)
 path.setAttribute('visibility','hidden')
 sampler.appendChild(path)
 try{
  const length=path.getTotalLength()
  if(!Number.isFinite(length)||length<=0)throw Error('Invalid STAX edge for Letterz')
  const count=Math.min(1200,Math.max(110,Math.ceil(length*1.8))),pts:Point[]=[]
  for(let i=0;i<=count;i++){
   const dist=length*i/count,p=path.getPointAtLength(dist)
   const a=path.getPointAtLength(Math.max(0,dist-.7))
   const b=path.getPointAtLength(Math.min(length,dist+.7))
   const dx=b.x-a.x,dy=b.y-a.y,m=Math.hypot(dx,dy)||1
   pts.push({x:p.x,y:p.y,tx:dx/m,ty:dy/m,nx:-dy/m,ny:dx/m})
  }
  return {pts,path:new Path2D(d)}
 }finally{path.remove()}
}

export function LetterzGoldenPollenCanvas({atoms,view,svgRef,onReady}:{
 atoms:PollenAtom[];view:PollenView;svgRef:RefObject<SVGSVGElement|null>;
 onReady:Dispatch<SetStateAction<boolean>>
}){
 const canvasRef=useRef<HTMLCanvasElement>(null)
 const latest=useRef({atoms,view})
 latest.current={atoms,view}
 useEffect(()=>{
  let active=true,frameId=0,last=0,firstPaint=false
  const canvas=canvasRef.current
  const svg=svgRef.current
  if(!canvas||!svg)return
  const ctx=canvas.getContext('2d',{alpha:true})
  if(!ctx)return
  const sampler=document.createElementNS('http://www.w3.org/2000/svg','svg')
  sampler.setAttribute('width','0')
  sampler.setAttribute('height','0')
  sampler.style.cssText='position:absolute;overflow:hidden;left:-9999px;top:-9999px;pointer-events:none'
  document.body.appendChild(sampler)
  const geometry=new Map<string,Part>()
  const scenes=new Map<string,LetterzScene>()
  const motion=window.matchMedia?.('(prefers-reduced-motion: reduce)')
  const draw=(registry:LetterzRegistry,now:number)=>{
   if(!active)return
   frameId=requestAnimationFrame(time=>draw(registry,time))
   if(document.hidden)return
   const reduced=!!motion?.matches
   if(last&&now-last<(reduced?250:32))return
   const dt=last?Math.min(.05,(now-last)/1000):0
   last=now
   const rect=canvas.getBoundingClientRect()
   if(rect.width<1||rect.height<1)return
   const pixelRatio=Math.min(window.devicePixelRatio||1,1.6)
   const pixelW=Math.max(1,Math.round(rect.width*pixelRatio))
   const pixelH=Math.max(1,Math.round(rect.height*pixelRatio))
   if(canvas.width!==pixelW)canvas.width=pixelW
   if(canvas.height!==pixelH)canvas.height=pixelH
   ctx.setTransform(1,0,0,1,0,0)
   ctx.globalCompositeOperation='source-over'
   ctx.clearRect(0,0,pixelW,pixelH)
   const {atoms:current,view:camera}=latest.current
   const scale=Math.min(pixelW/camera.width,pixelH/camera.height)
   const offsetX=(pixelW-camera.width*scale)/2-camera.x*scale
   const offsetY=(pixelH-camera.height*scale)/2-camera.y*scale
   const currentIds=new Set<string>()
   let drawn=0
   for(const atom of current){
    if(atom.omitted)continue // STAX omit brush remains a dotted SVG shape
    if(atom.x+atom.w<camera.x||atom.x>camera.x+camera.width||
       atom.y+atom.h<camera.y||atom.y>camera.y+camera.height)continue
    currentIds.add(atom.id)
    const sig=`${atom.kind}:${atom.w.toFixed(4)}:${atom.h.toFixed(4)}`
    let part=geometry.get(sig)
    if(!part){
     try{part=sampleOriginalStroke(sampler,staxLetterzPath(atom.kind,atom.w,atom.h))}
     catch(e){console.warn('[STAX Letterz original stroke]',e);continue}
     geometry.set(sig,part)
    }
    let scene=scenes.get(atom.id)
    if(!scene||scene.liveParts[0]!==part){
     const seed=[...atom.id].reduce((n,ch)=>n+ch.charCodeAt(0),0)
     const host={
      canvas,c:ctx,i:9,t:(seed%83)/10,gameplay:true,
      materialScale:1,coreScale:1,liveParts:[part],
      setGameplayTransform:(_c:CanvasRenderingContext2D)=>{},
      draw:(_dt:number)=>{}
     } as LetterzScene
     scene=registry.instantiate(GOLDEN_POLLEN_ID,host)
     scenes.set(atom.id,scene)
    }
    // Exactly one Letterz scene per shape, but all use one shared canvas.
    // Reusing one transparent bitmap is what avoids an Android canvas-per-stroke freeze.
    scene.setGameplayTransform=c=>c.setTransform(scale,0,0,scale,
     offsetX+atom.x*scale,offsetY+atom.y*scale)
    ctx.save()
    try{scene.draw(dt);drawn++}
    catch(e){console.warn('[STAX Letterz Golden Pollen renderer]',e)}
    finally{ctx.restore()}
   }
   for(const id of scenes.keys())if(!currentIds.has(id))scenes.delete(id)
   if(drawn&&!firstPaint){firstPaint=true;onReady(true)}
  }
  loadOriginalLetterz().then(registry=>{
   if(!active)return
   frameId=requestAnimationFrame(now=>draw(registry,now))
  }).catch(e=>{
   if(active)console.error('[STAX Golden Pollen original unavailable; retaining SVG fallback]',e)
  })
  return ()=>{
   active=false
   cancelAnimationFrame(frameId)
   sampler.remove()
   onReady(false)
  }
 // The renderer reads the latest camera and positions through a ref; it must
 // not reinitialize original material particles on every drag or pan update.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[])
 return <canvas className="stax-letterz-original-pollen-canvas" ref={canvasRef}
  aria-label="Original Letterz Golden Pollen animation" aria-hidden="true"
  style={{pointerEvents:'none'}}/>
}
