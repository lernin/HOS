import type { CSSProperties, RefObject } from 'react'
import { SYMBOLS, type Kind, type PlacedNode, type Scene, type Dimension, type DropSide } from './model'

export const SCALE = 32
export function Glyph({kind,w,h,...props}: {kind:Kind;w:number;h:number;fill?:string;stroke?:string;strokeWidth?:number;strokeDasharray?:string;opacity?:number}) {
  if(kind==='circle'||kind==='oval') return <ellipse cx={w/2} cy={h/2} rx={w/2} ry={h/2} {...props}/>
  if(kind==='square'||kind==='rectangle') return <rect width={w} height={h} {...props}/>
  const points=kind==='triangle'?`${w/2},0 ${w},${h} 0,${h}`:kind==='diamond'?`${w/2},0 ${w},${h/2} ${w/2},${h} 0,${h/2}`:`${w*.22},0 ${w*.78},0 ${w},${h/2} ${w*.78},${h} ${w*.22},${h} 0,${h/2}`
  return <polygon points={points} strokeLinejoin="round" {...props}/>
}
export function SymbolIcon({kind}: {kind:Kind}) {
 const s=SYMBOLS[kind]
 return <svg width="48" height="40" viewBox="-5 -5 158 122" aria-hidden="true"><Glyph kind={kind} w={s.w*SCALE} h={s.h*SCALE} stroke={s.color} fill={s.color+'20'} strokeWidth={3}/></svg>
}
function Measurement({d}: {d:Dimension}) {
 const a={x:d.a.x*SCALE,y:d.a.y*SCALE},b={x:d.b.x*SCALE,y:d.b.y*SCALE},at=d.at*SCALE
 const horizontal=d.axis==='x', mid=horizontal?(a.x+b.x)/2:(a.y+b.y)/2
 const label=d.value.toFixed(2), tiny=d.value<1.1
 const style:CSSProperties={fontSize:11,fontFamily:'ui-monospace, SFMono-Regular, monospace',fill:'#b9d6e6'}
 return <g className="stax-measure" data-measure={label} data-axis={d.axis}>
  <path d={horizontal?`M ${a.x} ${a.y} V ${at-5} M ${b.x} ${b.y} V ${at-5}`:`M ${a.x} ${a.y} H ${at-5} M ${b.x} ${b.y} H ${at-5}`} fill="none" stroke="#7aabc1" strokeOpacity=".45" strokeWidth=".8"/>
  <path d={horizontal?`M ${a.x} ${at} H ${b.x} M ${a.x} ${at-4} v 8 M ${b.x} ${at-4} v 8`:`M ${at} ${a.y} V ${b.y} M ${at-4} ${a.y} h 8 M ${at-4} ${b.y} h 8`} fill="none" stroke="#9fc5d5" strokeWidth="1"/>
  <text x={horizontal?mid:at-7} y={horizontal?at-(tiny?9:6):mid+4} textAnchor={horizontal?'middle':'end'} style={style} stroke="#113c58" strokeWidth="4" paintOrder="stroke">{label}</text>
 </g>
}
export function SymbolCanvas({scene,blueprint,selected,onSelect,onDropSymbol,svgRef,construction=false,zoom=1}: {
 scene:Scene;blueprint:boolean;selected:string|null;onSelect:(id:string|null)=>void;onDropSymbol:(kind:Kind,id:string|null,side?:DropSide)=>void;
 svgRef:RefObject<SVGSVGElement|null>;construction?:boolean;zoom?:number
}) {
 const active=scene.nodes.find(n=>n.id===selected)
 const sizeMeasures:Dimension[]=active?[
  {axis:'x',a:{x:active.x,y:active.y},b:{x:active.x+active.w,y:active.y},at:active.y-.65,value:active.w,rule:'width'},
  {axis:'y',a:{x:active.x+active.w,y:active.y},b:{x:active.x+active.w,y:active.y+active.h},at:active.x+active.w+.8,value:active.h,rule:'height'},
 ]:[]
 function drop(event:React.DragEvent<SVGElement>,id:string|null) {
  event.preventDefault();event.stopPropagation()
  const kind=event.dataTransfer.getData('application/x-stax-symbol') as Kind
  if(!Object.hasOwn(SYMBOLS,kind))return
  // Resolve pointer coordinates in design units, independent of SVG scaling and zoom.
  const svg=svgRef.current, matrix=svg?.getScreenCTM()
  if(scene.nodes.length===1 && svg && matrix) {
   const existing=scene.nodes[0]
   if((existing.kind==='circle' && kind==='triangle') || (existing.kind==='triangle' && kind==='circle')) {
    const point=svg.createSVGPoint();point.x=event.clientX;point.y=event.clientY
    const location=point.matrixTransform(matrix.inverse())
    const x=location.x/SCALE, y=location.y/SCALE
    const centreX=existing.x+existing.w/2, centreY=existing.y+existing.h/2
    if(Math.abs(x-centreX)<existing.w/2+5 && Math.abs(y-centreY)<existing.h/2+5) {
     onDropSymbol(kind,existing.id,x<centreX?'left':'right')
     return
    }
   }
  }
  onDropSymbol(kind,id)
 }
 function shape(n:PlacedNode) {
  const s=SYMBOLS[n.kind], chosen=selected===n.id, color=blueprint?'#e0edf4':s.color
  return <g key={n.id} transform={`translate(${n.x*SCALE} ${n.y*SCALE})`} role="button" tabIndex={0}
   aria-label={`${s.label} ${n.id}${n.omitted?', omitted':''}`} aria-pressed={chosen} data-symbol={n.kind} data-id={n.id} data-omitted={n.omitted}
   onClick={e=>{e.stopPropagation();onSelect(n.id)}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(n.id)}}}
   onDragOver={e=>e.preventDefault()} onDrop={e=>drop(e,n.id)} style={{cursor:'pointer'}}>
   <title>{s.label} · {s.role} · {s.w.toFixed(2)} × {s.h.toFixed(2)}</title>
   {chosen&&<rect className="stax-selection" x="-7" y="-7" width={n.w*SCALE+14} height={n.h*SCALE+14} rx="5" fill="none" stroke={blueprint?'#b5dcec':'#1f354b'} strokeWidth="1" strokeDasharray="3 5"/>}
   <Glyph kind={n.kind} w={n.w*SCALE} h={n.h*SCALE} fill={n.omitted||construction?'none':blueprint?'#ffffff0a':s.color+'17'} stroke={color} strokeWidth={construction?1.3:2.1} strokeDasharray={n.omitted?'7 5':undefined} opacity={n.omitted?.65:construction?.8:1}/>
  </g>
 }
 return <svg ref={svgRef} className="stax-canvas-svg" xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${scene.width*SCALE} ${scene.height*SCALE}`}
  style={{width:`${zoom*100}%`,minWidth:`${zoom*100}%`,maxHeight:zoom===1?'100%':undefined}}
  aria-label="STAX shape composition" onClick={()=>onSelect(null)} onDragOver={e=>e.preventDefault()} onDrop={e=>drop(e,null)}>
  <rect data-background="true" width="100%" height="100%" fill={blueprint?'#113c58':'#faf9f6'}/>
  {blueprint&&<g aria-hidden="true" data-guides="true">
   <defs><pattern id="stax-grid" width={.98*SCALE} height={.98*SCALE} patternUnits="userSpaceOnUse"><path d={`M ${.98*SCALE} 0 H 0 V ${.98*SCALE}`} fill="none" stroke="#bad5e4" strokeWidth=".5" opacity=".1"/></pattern></defs>
   <rect width="100%" height="100%" fill="url(#stax-grid)"/>
   {construction&&<path d={`M ${8*SCALE} ${.7*SCALE} V ${7.7*SCALE} M ${3.5*SCALE} ${5.8*SCALE} H ${12.5*SCALE}`} fill="none" stroke="#7aabc1" strokeDasharray="4 5"/>}
   {scene.dimensions.map((d,i)=><Measurement key={i} d={d}/>)}
   {sizeMeasures.map((d,i)=><Measurement key={`size-${i}`} d={d}/>)}
  </g>}
  {scene.nodes.map(shape)}
 </svg>
}