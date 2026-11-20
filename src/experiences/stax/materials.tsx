import { Glyph } from './SymbolCanvas'
import type { Kind } from './model'
import { staxShapeFill, staxShapeStroke, type StaxTheme } from './view-modes'

/**
 * Opt-in STAX material renderers. All visuals are derived from Glyph's canonical
 * geometry: never mutate positions, hit zones, drag semantics, or persisted atoms.
 *
 * Golden Pollen palette + particle concept are taken from Letterz original
 * magical_stroke_engine.js, material #10 (index 9): flowing warm grains and
 * normal-offset escape motes along a narrow illuminated line.
 * This uses small deterministic SVG subsets instead of 160 Canvas particles
 * per glyph per frame; avoids a perpetual redraw loop on Android.
 */
const materialModes=new Set<StaxTheme>(['golden-pollen','jelly-bloom','glassmorph','glass-beads'])
export const hasStaxMaterial=(theme:StaxTheme)=>materialModes.has(theme)

export function materialStroke(theme:StaxTheme,prefix:string,original:string):string {
 const ink:Partial<Record<StaxTheme,string>>={
  'golden-pollen':`url(#${prefix}-pollen)`,
  'jelly-bloom':`url(#${prefix}-jelly-edge)`,
  'glassmorph':`url(#${prefix}-frost-edge)`,
  'glass-beads':`url(#${prefix}-bead-edge)`,
 }
 return ink[theme]??staxShapeStroke(theme,original)
}
export function materialFill(theme:StaxTheme,prefix:string,original:string):string {
 const ink:Partial<Record<StaxTheme,string>>={
  'golden-pollen':'#f6b65b08',
  'jelly-bloom':`url(#${prefix}-jelly)`,
  'glassmorph':`url(#${prefix}-frost)`,
  'glass-beads':`url(#${prefix}-bead)`,
 }
 return ink[theme]??staxShapeFill(theme,original)
}

/** Define gradients just once for each independent SVG (main, palette, ghost). */
export function StaxMaterialDefs({prefix}:{prefix:string}){
 return <defs>
  <linearGradient id={`${prefix}-pollen`} x1="0" y1="0" x2="1" y2="1">
   <stop offset="0%" stopColor="#a6652c"/><stop offset="26%" stopColor="#ffc06b"/>
   <stop offset="49%" stopColor="#fff9d9"/><stop offset="72%" stopColor="#ffe29e"/>
   <stop offset="100%" stopColor="#ba6d34"/>
  </linearGradient>
  <radialGradient id={`${prefix}-jelly`} cx="28%" cy="18%" r="90%" fx="24%" fy="10%">
   <stop offset="0%" stopColor="#fff9f5" stopOpacity=".86"/>
   <stop offset="23%" stopColor="#ffb4dc" stopOpacity=".78"/>
   <stop offset="53%" stopColor="#f66dc5" stopOpacity=".63"/>
   <stop offset="80%" stopColor="#7e4fe1" stopOpacity=".74"/>
   <stop offset="100%" stopColor="#432285" stopOpacity=".9"/>
  </radialGradient>
  <linearGradient id={`${prefix}-jelly-edge`} x1="0" y1="0" x2=".8" y2="1">
   <stop offset="0" stopColor="#fffefa"/><stop offset=".26" stopColor="#ffc1e5"/>
   <stop offset=".62" stopColor="#e35df7"/><stop offset="1" stopColor="#ffe3f5"/>
  </linearGradient>
  <linearGradient id={`${prefix}-frost`} x1="0" y1="0" x2="1" y2="1">
   <stop offset="0" stopColor="#ffffff" stopOpacity=".5"/>
   <stop offset=".45" stopColor="#b9ebff" stopOpacity=".2"/>
   <stop offset="1" stopColor="#817aff" stopOpacity=".37"/>
  </linearGradient>
  <linearGradient id={`${prefix}-frost-edge`} x1="0" y1="0" x2="1" y2="1">
   <stop offset="0" stopColor="#ffffff"/>
   <stop offset=".32" stopColor="#b9fbff"/><stop offset=".76" stopColor="#918aff"/>
   <stop offset="1" stopColor="#e9d2ff"/>
  </linearGradient>
  <radialGradient id={`${prefix}-bead`} cx="28%" cy="17%" fx="19%" fy="10%" r="86%">
   <stop offset="0" stopColor="#ffffff" stopOpacity=".95"/>
   <stop offset=".14" stopColor="#e0fffb" stopOpacity=".77"/>
   <stop offset=".4" stopColor="#53d9e4" stopOpacity=".47"/>
   <stop offset=".73" stopColor="#1a5eaa" stopOpacity=".68"/>
   <stop offset="1" stopColor="#0b245c" stopOpacity=".98"/>
  </radialGradient>
  <linearGradient id={`${prefix}-bead-edge`} x1=".1" y1="0" x2=".85" y2="1">
   <stop offset="0" stopColor="#fff"/><stop offset=".4" stopColor="#b9f8ff"/>
   <stop offset=".76" stopColor="#4ac9ff"/><stop offset="1" stopColor="#fafaff"/>
  </linearGradient>
 </defs>
}

// The original Letterz hash produces stable, irregular pollen placement.
const fract=(x:number)=>x-Math.floor(x)
const hash=(v:number)=>fract(Math.sin(v*127.1+78.233)*43758.5453)
type Point={x:number;y:number;nx:number;ny:number}
function edgeAt(kind:Kind,w:number,h:number,t:number):Point {
 if(kind==='circle'||kind==='oval'){
  const angle=t*Math.PI*2
  const x=w/2+Math.cos(angle)*w/2,y=h/2+Math.sin(angle)*h/2
  const tx=-Math.sin(angle)*w/2,ty=Math.cos(angle)*h/2
  const length=Math.hypot(tx,ty)||1
  return {x,y,nx:ty/length,ny:-tx/length}
 }
 const verts=kind==='triangle'?[[w/2,0],[w,h],[0,h]]:
  kind==='diamond'?[[w/2,0],[w,h/2],[w/2,h],[0,h/2]]:
  kind==='hexagon'?[[w*.22,0],[w*.78,0],[w,h/2],[w*.78,h],[w*.22,h],[0,h/2]]:
  [[0,0],[w,0],[w,h],[0,h]]
 const edges=verts.map((v,i)=>{const n=verts[(i+1)%verts.length];return Math.hypot(n[0]-v[0],n[1]-v[1])})
 const full=edges.reduce((a,b)=>a+b,0)
 let distance=t*full
 for(let i=0;i<edges.length;i++){
  if(distance>edges[i]&&i<edges.length-1){distance-=edges[i];continue}
  const a=verts[i],b=verts[(i+1)%verts.length],u=Math.min(1,distance/edges[i])
  const nx=(b[1]-a[1])/edges[i],ny=-(b[0]-a[0])/edges[i]
  return {x:a[0]+(b[0]-a[0])*u,y:a[1]+(b[1]-a[1])*u,nx,ny}
 }
 return {x:0,y:0,nx:0,ny:1}
}

export function StaxMaterialEffect({theme,kind,w,h,omitted=false,seed='',compact=false}:{
 theme:StaxTheme;kind:Kind;w:number;h:number;omitted?:boolean;seed?:string;compact?:boolean
}){
 if(!hasStaxMaterial(theme))return null
 // Omitted shapes stay dotted: no continuous material overlay may restore them.
 if(omitted)return null
 if(theme==='golden-pollen'){
  const n=compact?16:Math.min(42,Math.max(24,Math.round((w+h)/7)))
  const serial=[...seed].reduce((sum,ch)=>sum+ch.charCodeAt(0),0)
  const particles=Array.from({length:n},(_,i)=>{
   const u=hash(i*7.131+9*31.47+serial*.17)
   const p=edgeAt(kind,w,h,u)
   const off=(hash(i*3.47+serial)-.5)*7.4
   return {x:p.x+p.nx*off,y:p.y+p.ny*off,
    size:.7+hash(i*43+2)*1.35,
    group:i%3,
    alpha:.52+hash(i*11.9+serial)*.46,
    color:['#ffc06b','#ffe29e','#fff9d9'][i%3]}
  })
  return <g className="stax-material-pollen" aria-hidden="true" pointerEvents="none">
   <Glyph kind={kind} w={w} h={h} fill="none" stroke="#e6a053" strokeWidth={compact?6:8} opacity={.24}/>
   <Glyph kind={kind} w={w} h={h} fill="none" stroke="#fff5c2" strokeWidth={compact?1.1:1.7} opacity={.8}/>
   {[0,1,2].map(group=><g key={group} className={`stax-pollen-grain-layer stax-pollen-layer-${group}`}>
    {particles.filter(p=>p.group===group).map((p,i)=><circle key={i} cx={p.x} cy={p.y} r={p.size} fill={p.color} opacity={p.alpha}/>)}
   </g>)}
  </g>
 }
 if(theme==='jelly-bloom')return <g className="stax-material-jelly" aria-hidden="true" pointerEvents="none">
  <Glyph kind={kind} w={w} h={h} fill="none" stroke="#fff5fe" strokeWidth={1.6} opacity={.82}/>
  <Glyph kind={kind} w={Math.max(1,w-5)} h={Math.max(1,h-5)} fill="none" stroke="#fff4ff" strokeWidth={2} opacity={.33}/>
 </g>
 if(theme==='glassmorph')return <g className="stax-material-frost" aria-hidden="true" pointerEvents="none">
  <Glyph kind={kind} w={w} h={h} fill="none" stroke="#ffffff" strokeWidth={1.2} opacity={.7}/>
  <Glyph kind={kind} w={Math.max(1,w-4)} h={Math.max(1,h-4)} fill="none" stroke="#a0eaff" strokeWidth={.7} opacity={.65}/>
 </g>
 return <g className="stax-material-beads" aria-hidden="true" pointerEvents="none">
  <Glyph kind={kind} w={w} h={h} fill="none" stroke="#ffffff" strokeWidth={1.6} opacity={.8}/>
  <Glyph kind={kind} w={Math.max(1,w-7)} h={Math.max(1,h-7)} fill="none" stroke="#9af7ff" strokeWidth={1.8} opacity={.46}/>
 </g>
}
