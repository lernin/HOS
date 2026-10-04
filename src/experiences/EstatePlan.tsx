import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react'
import { floors, walls, glass, furnishings, footprint } from './estate/plan'
import { estateRailings } from './estate/railings'
import { auditOpenEdges, auditReviewRailings, estateEdges, estateSurfaces, patioSurfaces } from './estate/site-edges'
import type { EstateSurfaceKind } from './estate/site-edges'
import { architecturalPlanters, coastline, featurePalms, featureTrees } from './estate/site-layout'
import './estate/estate-plan.css'

type PlanView='main'|'arrival'|'site'
type Tool='pan'|'pen'|'arrow'|'area'|'note'
type Category='general'|'deck'|'railing'|'wall'|'remove'
type Pt={x:number;y:number}
type Box={x:number;y:number;w:number;h:number}
type Mark={
  id:string
  tool:Exclude<Tool,'pan'>
  category:Category
  points:Pt[]
  text?:string
}

const STORAGE='ocean-estate-plan-markups-v1'
const DEFAULT_BOX:Record<PlanView,Box>={
  main:{x:-48,y:-43,w:92,h:96},
  arrival:{x:-28,y:15,w:56,h:49},
  site:{x:-66,y:-63,w:132,h:132},
}
const categoryMeta:Record<Category,{label:string;color:string}>={
  general:{label:'General',color:'#d34f4f'},
  deck:{label:'Deck',color:'#2b78c5'},
  railing:{label:'Railing',color:'#b36a18'},
  wall:{label:'Wall',color:'#7951a8'},
  remove:{label:'Remove',color:'#b62f46'},
}
const surfaceFill:Record<EstateSurfaceKind,string>={
  interior:'#eee7d9',
  deck:'url(#ep-deck-hatch)',
  'covered-exterior':'url(#ep-covered-hatch)',
  arrival:'#c9c5bc',
  steps:'url(#ep-step-hatch)',
  garden:'#cbd8bb',
  water:'#99cfd4',
}
const edgeStroke={wall:'#45413a',glass:'#4b99a7',railing:'#6f5038',step:'#82735f',open:'#d04a53'} as const
const railMid=(points:readonly (readonly [number,number])[])=>{
  if(points.length<2)return{x:0,y:0}
  let best=0,index=0
  for(let i=0;i<points.length-1;i++){const d=Math.hypot(points[i+1][0]-points[i][0],points[i+1][1]-points[i][1]);if(d>best){best=d;index=i}}
  const a=points[index],b=points[index+1]
  return{x:(a[0]+b[0])/2,y:-(a[1]+b[1])/2}
}
const pointsString=(pts:Pt[])=>pts.map(q=>`${q.x},${q.y}`).join(' ')
const rotate180=(p:Pt):Pt=>({x:-p.x,y:-p.y})

function readMarks():Mark[]{
  try{
    const parsed=JSON.parse(localStorage.getItem(STORAGE)||'[]')
    return Array.isArray(parsed)?parsed:[]
  }catch{return[]}
}
function labelSize(name:string,w:number,d:number){
  if(w<4||d<3)return .85
  return name.length>18?1.0:1.15
}
function markBrief(mark:Mark){
  const coords=mark.points.map(q=>`(${q.x.toFixed(1)}, ${(-q.y).toFixed(1)})`).join(' → ')
  return `${mark.id} [${categoryMeta[mark.category].label}] ${mark.tool}${mark.text?`: ${mark.text}`:''} @ ${coords}`
}

export function EstatePlan({onBack,onEstate}:{onBack:()=>void;onEstate:()=>void}){
  const svgRef=useRef<SVGSVGElement>(null)
  const [view,setView]=useState<PlanView>('main')
  const [box,setBox]=useState<Box>(DEFAULT_BOX.main)
  const [tool,setTool]=useState<Tool>('pan')
  const [category,setCategory]=useState<Category>('general')
  const [marks,setMarks]=useState<Mark[]>(readMarks)
  const [redo,setRedo]=useState<Mark[]>([])
  const [draft,setDraft]=useState<Pt[]>([])
  const draftRef=useRef<Pt[]>([])
  const drawingPointer=useRef<number|null>(null)
  const panRef=useRef<{id:number;sx:number;sy:number;box:Box}|null>(null)
  const pointers=useRef(new Map<number,{x:number;y:number}>())
  const pinchRef=useRef<{distance:number;box:Box;mid:{x:number;y:number};rect:DOMRect}|null>(null)
  const [noteDraft,setNoteDraft]=useState<{point:Pt;text:string}|null>(null)
  const [notesOpen,setNotesOpen]=useState(false)
  const [layersOpen,setLayersOpen]=useState(false)
  const [clean,setClean]=useState(false)
  const [auditMode,setAuditMode]=useState(false)
  const [selectedRail,setSelectedRail]=useState<string|null>(null)
  const [selectedSurface,setSelectedSurface]=useState<string|null>(null)
  const [layers,setLayers]=useState({surfaces:true,edges:true,labels:true,furniture:true,railings:true,markups:true})
  const [status,setStatus]=useState('')

  useEffect(()=>{localStorage.setItem(STORAGE,JSON.stringify(marks))},[marks])
  useEffect(()=>{setBox(DEFAULT_BOX[view])},[view])

  const nextId=useMemo(()=>{
    const max=marks.reduce((n,m)=>Math.max(n,Number(m.id.replace(/\D/g,''))||0),0)
    return `A${max+1}`
  },[marks])

  function toView(clientX:number,clientY:number):Pt{
    const svg=svgRef.current
    if(!svg)return{x:0,y:0}
    const p=svg.createSVGPoint();p.x=clientX;p.y=clientY
    const matrix=svg.getScreenCTM()?.inverse()
    if(!matrix)return{x:0,y:0}
    const out=p.matrixTransform(matrix)
    return{x:out.x,y:out.y}
  }
  function toPlan(clientX:number,clientY:number):Pt{
    return rotate180(toView(clientX,clientY))
  }
  function commit(mark:Omit<Mark,'id'>){
    setMarks(prev=>[...prev,{...mark,id:nextId}])
    setRedo([])
    setStatus(`${nextId} added`)
  }
  function undo(){
    const last=marks[marks.length-1]
    if(!last)return
    setMarks(marks.slice(0,-1));setRedo([last,...redo]);setStatus(`${last.id} undone`)
  }
  function redoOne(){
    const first=redo[0]
    if(!first)return
    setMarks([...marks,first]);setRedo(redo.slice(1));setStatus(`${first.id} restored`)
  }
  function finishDrawing(){
    const pts=draftRef.current
    if(tool==='pen'&&pts.length>1)commit({tool:'pen',category,points:pts})
    if(tool==='arrow'&&pts.length>1)commit({tool:'arrow',category,points:[pts[0],pts[pts.length-1]]})
    if(tool==='area'&&pts.length>2)commit({tool:'area',category,points:pts})
    draftRef.current=[];setDraft([]);drawingPointer.current=null
  }
  function startPinch(){
    const vals=[...pointers.current.values()]
    if(vals.length!==2||!svgRef.current)return
    const distance=Math.hypot(vals[0].x-vals[1].x,vals[0].y-vals[1].y)
    const mid={x:(vals[0].x+vals[1].x)/2,y:(vals[0].y+vals[1].y)/2}
    pinchRef.current={distance,box:{...box},mid,rect:svgRef.current.getBoundingClientRect()}
    draftRef.current=[];setDraft([]);drawingPointer.current=null;panRef.current=null
  }
  function onPointerDown(e:ReactPointerEvent<SVGSVGElement>){
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY})
    if(e.pointerType==='touch'&&pointers.current.size===2){startPinch();return}
    if(tool==='pan'){
      panRef.current={id:e.pointerId,sx:e.clientX,sy:e.clientY,box:{...box}}
      return
    }
    const p=toPlan(e.clientX,e.clientY)
    if(tool==='note'){setNoteDraft({point:p,text:''});return}
    draftRef.current=[p];setDraft([p]);drawingPointer.current=e.pointerId
  }
  function onPointerMove(e:ReactPointerEvent<SVGSVGElement>){
    if(pointers.current.has(e.pointerId))pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY})
    if(pointers.current.size===2&&pinchRef.current){
      const vals=[...pointers.current.values()],start=pinchRef.current
      const dist=Math.max(20,Math.hypot(vals[0].x-vals[1].x,vals[0].y-vals[1].y))
      const mid={x:(vals[0].x+vals[1].x)/2,y:(vals[0].y+vals[1].y)/2}
      const scale=Math.max(.35,Math.min(3,start.distance/dist))
      const w=start.box.w*scale,h=start.box.h*scale
      const sx=(start.mid.x-start.rect.left)/start.rect.width,sy=(start.mid.y-start.rect.top)/start.rect.height
      const cx=start.box.x+sx*start.box.w,cy=start.box.y+sy*start.box.h
      const mx=(mid.x-start.rect.left)/start.rect.width,my=(mid.y-start.rect.top)/start.rect.height
      setBox({x:cx-mx*w,y:cy-my*h,w,h})
      return
    }
    const pan=panRef.current
    if(pan&&pan.id===e.pointerId&&svgRef.current){
      const rect=svgRef.current.getBoundingClientRect()
      const dx=(e.clientX-pan.sx)/rect.width*pan.box.w,dy=(e.clientY-pan.sy)/rect.height*pan.box.h
      setBox({...pan.box,x:pan.box.x-dx,y:pan.box.y-dy});return
    }
    if(drawingPointer.current!==e.pointerId)return
    const p=toPlan(e.clientX,e.clientY),pts=draftRef.current
    if(tool==='arrow'){const next=[pts[0],p];draftRef.current=next;setDraft(next);return}
    const last=pts[pts.length-1]
    if(!last||Math.hypot(p.x-last.x,p.y-last.y)>.28){const next=[...pts,p];draftRef.current=next;setDraft(next)}
  }
  function onPointerUp(e:ReactPointerEvent<SVGSVGElement>){
    const wasPinching=Boolean(pinchRef.current)
    pointers.current.delete(e.pointerId)
    if(wasPinching){
      if(pointers.current.size<2)pinchRef.current=null
      panRef.current=null
      return
    }
    if(panRef.current?.id===e.pointerId){panRef.current=null;return}
    if(drawingPointer.current===e.pointerId)finishDrawing()
  }
  function onWheel(e:ReactWheelEvent<SVGSVGElement>){
    e.preventDefault()
    zoom(e.deltaY>0?1.12:.88,{x:e.clientX,y:e.clientY})
  }
  function zoom(factor:number,screen?:{x:number;y:number}){
    const svg=svgRef.current
    const nw=Math.max(18,Math.min(180,box.w*factor)),nh=nw*(box.h/box.w)
    let cx=box.x+box.w/2,cy=box.y+box.h/2
    if(screen&&svg){
      const p=toView(screen.x,screen.y);cx=p.x;cy=p.y
    }
    const rx=(cx-box.x)/box.w,ry=(cy-box.y)/box.h
    setBox({x:cx-rx*nw,y:cy-ry*nh,w:nw,h:nh})
  }
  function addNote(){
    if(!noteDraft)return
    const text=noteDraft.text.trim()
    if(text)commit({tool:'note',category,points:[noteDraft.point],text})
    setNoteDraft(null)
  }
  function removeMark(id:string){setMarks(m=>m.filter(x=>x.id!==id));setRedo([])}
  async function copyBrief(){
    const text=['OCEAN ESTATE PLAN MARKUP',`View: ${view}`,...marks.map(markBrief)].join('\n')
    try{await navigator.clipboard.writeText(text);setStatus('Change brief copied')}catch{setStatus('Could not copy change brief')}
  }
  async function exportPng(){
    const svg=svgRef.current
    if(!svg)return
    const clone=svg.cloneNode(true) as SVGSVGElement
    clone.setAttribute('xmlns','http://www.w3.org/2000/svg')
    clone.setAttribute('width','2200')
    clone.setAttribute('height',String(Math.round(2200*box.h/box.w)))
    const data=new XMLSerializer().serializeToString(clone)
    const blob=new Blob([data],{type:'image/svg+xml;charset=utf-8'})
    const url=URL.createObjectURL(blob),img=new Image()
    img.onload=()=>{
      const canvas=document.createElement('canvas');canvas.width=2200;canvas.height=Math.round(2200*box.h/box.w)
      const ctx=canvas.getContext('2d');if(!ctx){URL.revokeObjectURL(url);return}
      ctx.fillStyle='#f7f3e8';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height)
      canvas.toBlob(out=>{if(out){const a=document.createElement('a');a.href=URL.createObjectURL(out);a.download=`ocean-estate-plan-${view}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}},'image/png')
      URL.revokeObjectURL(url);setStatus('Plan image exported')
    }
    img.src=url
  }

  const viewFloors=floors
  const roomLabels=layers.labels?viewFloors.filter(f=>f.use==='interior'):[]
  const selectedRailData=estateRailings.find(r=>r.id===selectedRail)??null
  const selectedSurfaceData=patioSurfaces.find(s=>s.id===selectedSurface)??null
  const auditCount=auditOpenEdges.length+auditReviewRailings.length

  return <main className={`ep-root${clean?' ep-clean':''}`}>
    {!clean&&<header className="ep-top">
      <button className="ep-round" onClick={onBack} aria-label="Back to the Lab">←</button>
      <div className="ep-heading"><small>OCEAN ESTATE</small><strong>Estate Plan</strong></div>
      <div className="ep-views" role="group" aria-label="Plan view">
        {(['main','arrival','site'] as PlanView[]).map(v=><button key={v} className={view===v?'active':''} onClick={()=>setView(v)}>{v==='main'?'Main floor':v==='arrival'?'Arrival':'Whole site'}</button>)}
      </div>
      <button className="ep-estate" onClick={onEstate}>3D house <span>→</span></button>
    </header>}

    <section className="ep-stage">
      <svg ref={svgRef} className="ep-plan" viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} preserveAspectRatio="xMidYMid meet"
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={onWheel}>
        <defs>
          <pattern id="ep-grid" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M 5 0 L 0 0 0 5" fill="none" stroke="#d8d4c9" strokeWidth=".08"/></pattern>
          <pattern id="ep-deck-hatch" width="1.2" height="1.2" patternUnits="userSpaceOnUse"><rect width="1.2" height="1.2" fill="#e5d7c2"/><path d="M0 1.2L1.2 0" stroke="#c9b89f" strokeWidth=".08" opacity=".75"/></pattern>
          <pattern id="ep-covered-hatch" width="1.4" height="1.4" patternUnits="userSpaceOnUse"><rect width="1.4" height="1.4" fill="#ded6c5"/><path d="M0 .3H1.4M0 1H1.4" stroke="#bbb19f" strokeWidth=".08" opacity=".72"/></pattern>
          <pattern id="ep-step-hatch" width=".8" height=".8" patternUnits="userSpaceOnUse"><rect width=".8" height=".8" fill="#d9cec0"/><path d="M0 .4H.8" stroke="#aa9a87" strokeWidth=".1"/></pattern>
          {(Object.keys(categoryMeta) as Category[]).map(k=><marker key={k} id={`ep-arrow-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill={categoryMeta[k].color}/></marker>)}
        </defs>
        <rect x={box.x-20} y={box.y-20} width={box.w+40} height={box.h+40} fill="#f7f3e8"/>
        <rect x={box.x-20} y={box.y-20} width={box.w+40} height={box.h+40} fill="url(#ep-grid)"/>
        <g transform="rotate(180)">
          <rect x="-90" y="-90" width="180" height="180" fill="#dceff2" opacity={view==='arrival'?.18:.78}/>
          <polygon points={coastline.map(([x,z])=>`${x},${-z}`).join(' ')} fill="#e8e5d9" stroke="#aaa99e" strokeWidth=".22" opacity={view==='arrival'?.34:.96}/>

          {layers.surfaces&&estateSurfaces.map(s=>{
            const lower=s.kind==='arrival'||s.kind==='steps',patio=s.kind==='deck'||s.kind==='covered-exterior',selected=selectedSurface===s.id
            const opacity=view==='site'?.92:view==='arrival'?(lower?1:.16):(lower?.14:1)
            if(s.shape==='circle')return <circle key={s.id} cx={s.x} cy={-s.z} r={s.r} fill={surfaceFill[s.kind]} opacity={opacity} stroke="#8f897e" strokeWidth=".16"/>
            return <rect key={s.id} x={s.x1} y={-s.z2} width={s.x2-s.x1} height={s.z2-s.z1} rx=".08" fill={surfaceFill[s.kind]} opacity={opacity} stroke={selected?'#175f91':patio?'#8b7055':'#9c9385'} strokeWidth={selected?.5:patio?.24:.13} pointerEvents={patio&&tool==='pan'?'all':'none'} onPointerDown={patio?e=>{e.stopPropagation();setSelectedSurface(s.id);setSelectedRail(null)}:undefined}/>
          })}

          {layers.edges&&estateEdges.map(e=>{
            const review=auditMode&&e.audit==='review'
            return <line key={e.id} x1={e.a[0]} y1={-e.a[1]} x2={e.b[0]} y2={-e.b[1]} stroke={review?'#d62f45':edgeStroke[e.kind]} strokeWidth={review?.48:e.kind==='wall'?.34:.26} strokeDasharray={e.kind==='open'?'.55 .34':e.kind==='step'?'.28 .2':undefined} opacity={view==='arrival'?.82:.92}/>
          })}

          {walls.map((w,i)=><rect key={`wall-${i}`} x={w.x1} y={-w.z2} width={Math.max(.12,w.x2-w.x1)} height={Math.max(.12,w.z2-w.z1)} fill="#403d38" opacity={view==='arrival'?.72:.9}/>)}
          {glass.map((w,i)=><rect key={`glass-${i}`} x={w.x1} y={-w.z2} width={Math.max(.11,w.x2-w.x1)} height={Math.max(.11,w.z2-w.z1)} fill="#5aa4b0" opacity=".88"/>)}

          {layers.furniture&&view!=='arrival'&&furnishings.map((f,i)=>{const r=footprint(f);return <rect key={`furn-${i}`} x={r.x1} y={-r.z2} width={r.x2-r.x1} height={r.z2-r.z1} rx=".18" fill="#887d6c" opacity=".26" stroke="#6c6254" strokeWidth=".08"/>})}

          {layers.surfaces&&featureTrees.map(t=><g key={t.id} opacity=".9"><circle cx={t.x} cy={-t.z} r="1.15" fill="#9bad88" fillOpacity=".28" stroke="#718464" strokeWidth=".16"/><circle cx={t.x} cy={-t.z} r=".18" fill="#69533f"/></g>)}
          {layers.surfaces&&featurePalms.map(p=><g key={p.id} opacity=".92"><circle cx={p.x} cy={-p.z} r=".9" fill="#adc093" fillOpacity=".24" stroke="#788d67" strokeWidth=".15" strokeDasharray=".25 .16"/><circle cx={p.x} cy={-p.z} r=".14" fill="#70563e"/></g>)}
          {layers.surfaces&&architecturalPlanters.map(([x,z],i)=><circle key={`planter-${i}`} cx={x} cy={-z} r=".32" fill="#a9b58f" stroke="#756a58" strokeWidth=".1"/>)}

          {layers.railings&&estateRailings.map(r=>{
            const selected=selectedRail===r.id,review=auditMode&&r.audit==='review',pts=r.points.map(([x,z])=>`${x},${-z}`).join(' ')
            return <g key={r.id}>
              <polyline points={pts} fill="none" stroke="transparent" strokeWidth="2.2" pointerEvents={tool==='pan'?'stroke':'none'} onPointerDown={e=>{e.stopPropagation();setSelectedRail(r.id);setSelectedSurface(null)}}/>
              <polyline points={pts} fill="none" stroke={selected?'#175f91':review?'#df7a19':r.family==='garden'?'#7b5f48':'#593f2d'} strokeWidth={selected?.58:review?.5:r.family==='garden'?.28:.36} strokeDasharray={r.family==='garden'?'.55 .22':undefined} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none"/>
            </g>
          })}

          {layers.markups&&marks.map(mark=>{
            const color=categoryMeta[mark.category].color
            if(mark.tool==='area')return <polygon key={mark.id} points={pointsString(mark.points)} fill={color} fillOpacity=".17" stroke={color} strokeWidth=".38" strokeLinejoin="round"/>
            if(mark.tool==='pen')return <polyline key={mark.id} points={pointsString(mark.points)} fill="none" stroke={color} strokeWidth=".5" strokeLinecap="round" strokeLinejoin="round"/>
            if(mark.tool==='arrow'){const a=mark.points[0],b=mark.points[mark.points.length-1];return <line key={mark.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth=".5" strokeLinecap="round" markerEnd={`url(#ep-arrow-${mark.category})`}/>}
            const p=mark.points[0]
            return <circle key={mark.id} cx={p.x} cy={p.y} r=".88" fill={color}/>
          })}
          {draft.length>1&&(tool==='pen'?<polyline points={pointsString(draft)} fill="none" stroke={categoryMeta[category].color} strokeWidth=".5" strokeDasharray=".5 .24"/>:tool==='area'?<polygon points={pointsString(draft)} fill={categoryMeta[category].color} fillOpacity=".12" stroke={categoryMeta[category].color} strokeWidth=".35" strokeDasharray=".5 .24"/>:<line x1={draft[0].x} y1={draft[0].y} x2={draft[draft.length-1].x} y2={draft[draft.length-1].y} stroke={categoryMeta[category].color} strokeWidth=".5" strokeDasharray=".5 .24"/>)}
        </g>

        <text x="0" y="-34" textAnchor="middle" fontSize="2.3" letterSpacing=".35" fill="#6f9ea8" opacity=".72">OCEAN</text>
        <text x="-.5" y="-30.5" textAnchor="middle" fontSize="1.15" fill="#326f78">Infinity pool</text>

        {roomLabels.map((f,i)=>{
          const w=f.x2-f.x1,d=f.z2-f.z1,p=rotate180({x:(f.x1+f.x2)/2,y:-(f.z1+f.z2)/2})
          return <text key={`label-${i}`} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" fontSize={labelSize(f.name,w,d)} fill="#48433b" opacity=".82">{f.name}</text>
        })}

        {layers.labels&&patioSurfaces.filter(s=>s.shape==='rect').map(s=>{
          const p=rotate180({x:(s.x1+s.x2)/2,y:-(s.z1+s.z2)/2}),selected=selectedSurface===s.id
          return <g key={`patio-label-${s.id}`} pointerEvents="none"><circle cx={p.x} cy={p.y} r={selected?1.0:.78} fill={selected?'#175f91':'#8b7055'} stroke="#fffaf0" strokeWidth=".16"/><text x={p.x} y={p.y+.04} textAnchor="middle" dominantBaseline="middle" fontSize={selected?.6:.48} fontWeight="800" fill="white">{s.code}</text><text x={p.x+1.05} y={p.y+.08} fontSize=".68" fontWeight="650" fill="#65594b" paintOrder="stroke" stroke="#f7f3e8" strokeWidth=".18">{s.label}</text></g>
        })}

        {layers.railings&&estateRailings.filter(r=>auditMode||selectedRail===r.id).map(r=>{
          const m=rotate180(railMid(r.points)),selected=selectedRail===r.id
          return <g key={`rail-label-${r.id}`} className="ep-rail-label"><circle cx={m.x} cy={m.y} r={selected?1.05:.86} fill={selected?'#175f91':r.audit==='review'?'#df7a19':'#5f4837'} stroke="#fffaf0" strokeWidth=".18"/><text x={m.x} y={m.y+.05} textAnchor="middle" dominantBaseline="middle" fontSize={selected?.62:.54} fontWeight="800" fill="white">{r.code}</text></g>
        })}

        {auditMode&&layers.edges&&auditOpenEdges.map(e=>{
          const p=rotate180({x:(e.a[0]+e.b[0])/2,y:-(e.a[1]+e.b[1])/2})
          return <g key={`edge-label-${e.id}`}><rect x={p.x-.72} y={p.y-.42} width="1.44" height=".84" rx=".26" fill="#d62f45"/><text x={p.x} y={p.y+.03} textAnchor="middle" dominantBaseline="middle" fontSize=".48" fontWeight="800" fill="white">{e.code}</text></g>
        })}

        {layers.markups&&marks.filter(mark=>mark.tool==='note').map(mark=>{
          const p=rotate180(mark.points[0]),color=categoryMeta[mark.category].color
          return <g key={`note-label-${mark.id}`}><text x={p.x} y={p.y+.05} textAnchor="middle" dominantBaseline="middle" fontSize=".68" fontWeight="700" fill="white">{mark.id}</text>{mark.text&&<text x={p.x+1.2} y={p.y+.12} fontSize=".92" fontWeight="600" fill={color} paintOrder="stroke" stroke="#f7f3e8" strokeWidth=".25">{mark.text}</text>}</g>
        })}

        <g transform={`translate(${box.x+3} ${box.y+box.h-3})`}><line x1="0" y1="0" x2="10" y2="0" stroke="#4b4842" strokeWidth=".22"/><line x1="0" y1="-.45" x2="0" y2=".45" stroke="#4b4842" strokeWidth=".18"/><line x1="10" y1="-.45" x2="10" y2=".45" stroke="#4b4842" strokeWidth=".18"/><text x="5" y="-1" textAnchor="middle" fontSize=".9" fill="#4b4842">10 m</text></g>
        <g transform={`translate(${box.x+box.w-4} ${box.y+4})`}><path d="M0 -2 L0 2 M0 2 L-1 .5 M0 2 L1 .5" fill="none" stroke="#4b4842" strokeWidth=".22"/><text x="0" y="3.6" textAnchor="middle" fontSize=".9" fill="#4b4842">N</text></g>
      </svg>

      {!clean&&<div className="ep-zoom"><button onClick={()=>zoom(.82)}>＋</button><button onClick={()=>zoom(1.22)}>−</button><button onClick={()=>setBox(DEFAULT_BOX[view])}>Fit</button></div>}
      {clean&&<button className="ep-clean-exit" onClick={()=>setClean(false)}>Exit clean view</button>}
    </section>

    {!clean&&<aside className={`ep-layer-panel${layersOpen?' open':''}`}>
      <button className={`ep-audit-toggle${auditMode?' active':''}`} onClick={()=>{const next=!auditMode;setAuditMode(next);if(next)setLayers(x=>({...x,surfaces:true,edges:true,railings:true}))}}>
        <span>Edge audit</span><b>{auditCount}</b>
      </button>
      <strong>Layers</strong>
      {Object.entries(layers).map(([key,value])=><label key={key}><input type="checkbox" checked={value} onChange={()=>setLayers(x=>({...x,[key]:!x[key as keyof typeof x]}))}/>{key}</label>)}
      <div className="ep-mini-legend"><i className="deck"/>patio/deck · exact 3D slab <i className="open"/>open edge <i className="rail"/>railing</div>
    </aside>}

    {!clean&&<footer className="ep-tools">
      <div className="ep-tools-scroll">
        {([['pan','Pan'],['pen','Draw'],['arrow','Arrow'],['area','Area'],['note','Note']] as [Tool,string][]).map(([id,label])=><button key={id} className={tool===id?'active':''} onClick={()=>setTool(id)}><span>{id==='pan'?'✥':id==='pen'?'✎':id==='arrow'?'→':id==='area'?'▱':'A1'}</span><em>{label}</em></button>)}
      </div>
      <select className="ep-category" value={category} onChange={e=>setCategory(e.target.value as Category)} aria-label="Markup category">
        {(Object.keys(categoryMeta) as Category[]).map(k=><option key={k} value={k}>{categoryMeta[k].label}</option>)}
      </select>
      <div className="ep-history"><button onClick={undo} disabled={!marks.length} aria-label="Undo">↶</button><button onClick={redoOne} disabled={!redo.length} aria-label="Redo">↷</button></div>
      <button className={`ep-more ep-audit-action${auditMode?' active':''}`} onClick={()=>{const next=!auditMode;setAuditMode(next);if(next)setLayers(x=>({...x,surfaces:true,edges:true,railings:true}))}}>Audit {auditCount}</button>
      <button className="ep-more ep-marks-action" onClick={()=>setNotesOpen(true)}>Marks {marks.length}</button>
      <button className="ep-more ep-clean-action" onClick={()=>setClean(true)}>Clean</button>
      <button className="ep-more ep-export-action" onClick={exportPng}>Export</button>
    </footer>}

    {!clean&&<nav className="ep-landscape-utils" aria-label="Plan utilities">
      <button className={auditMode?'active':''} onClick={()=>{const next=!auditMode;setAuditMode(next);if(next)setLayers(x=>({...x,surfaces:true,edges:true,railings:true}))}} aria-label="Toggle edge audit"><span>◎</span><em>Audit</em><b>{auditCount}</b></button>
      <button className={layersOpen?'active':''} onClick={()=>setLayersOpen(v=>!v)} aria-label="Toggle layers"><span>☷</span><em>Layers</em></button>
      <button onClick={()=>setNotesOpen(true)} aria-label="Open marks"><span>◇</span><em>Marks</em>{marks.length>0&&<b>{marks.length}</b>}</button>
      <button onClick={()=>zoom(.82)} aria-label="Zoom in"><span>＋</span><em>Zoom</em></button>
      <button onClick={()=>zoom(1.22)} aria-label="Zoom out"><span>−</span><em>Zoom</em></button>
      <button onClick={()=>setBox(DEFAULT_BOX[view])} aria-label="Fit plan"><span>⌗</span><em>Fit</em></button>
      <button onClick={exportPng} aria-label="Export plan"><span>⇩</span><em>Export</em></button>
      <button onClick={()=>setClean(true)} aria-label="Clean view"><span>□</span><em>Clean</em></button>
    </nav>}

    {!clean&&marks.length===0&&!selectedRailData&&!selectedSurfaceData&&<div className="ep-hint">Patios <strong>P1–P7</strong> are exact 3D slabs. Tap one to inspect it; use <strong>Area</strong> to propose an extension.</div>}
    {!clean&&selectedRailData&&<div className="ep-selection-card">
      <b>{selectedRailData.code}</b>
      <span><strong>{selectedRailData.label}</strong><small>{selectedRailData.family==='guard'?'Full-height guard rail':'Low garden rail'}{selectedRailData.audit==='review'?' · review candidate':''}</small></span>
      <button onClick={()=>setSelectedRail(null)} aria-label="Clear railing selection">×</button>
    </div>}
    {!clean&&selectedSurfaceData&&selectedSurfaceData.shape==='rect'&&<div className="ep-selection-card ep-surface-card">
      <b>{selectedSurfaceData.code}</b>
      <span><strong>{selectedSurfaceData.label}</strong><small>Exact 3D slab · {(selectedSurfaceData.x2-selectedSurfaceData.x1).toFixed(1)} × {(selectedSurfaceData.z2-selectedSurfaceData.z1).toFixed(1)} m · {((selectedSurfaceData.x2-selectedSurfaceData.x1)*(selectedSurfaceData.z2-selectedSurfaceData.z1)).toFixed(0)} m²</small></span>
      <button onClick={()=>setSelectedSurface(null)} aria-label="Clear patio selection">×</button>
    </div>}
        {!clean&&status&&<div className="ep-status">{status}</div>}

    {noteDraft&&<div className="ep-modal" onClick={()=>setNoteDraft(null)}><section onClick={e=>e.stopPropagation()}><small>{nextId} · {categoryMeta[category].label}</small><h2>Add a note</h2><textarea autoFocus value={noteDraft.text} onChange={e=>setNoteDraft({...noteDraft,text:e.target.value})} placeholder="e.g. Extend the deck to this line"/><div><button onClick={()=>setNoteDraft(null)}>Cancel</button><button className="primary" onClick={addNote}>Add {nextId}</button></div></section></div>}

    {notesOpen&&<div className="ep-drawer-backdrop" onClick={()=>setNotesOpen(false)}><aside className="ep-drawer" onClick={e=>e.stopPropagation()}>
      <header><div><small>PLAN MARKUPS</small><h2>Change list</h2></div><button onClick={()=>setNotesOpen(false)}>×</button></header>
      <div className="ep-mark-list">{marks.length?marks.map(m=><article key={m.id}><b style={{background:categoryMeta[m.category].color}}>{m.id}</b><span><strong>{categoryMeta[m.category].label} · {m.tool}</strong><small>{m.text||`${m.points.length} point${m.points.length===1?'':'s'}`}</small></span><button onClick={()=>removeMark(m.id)}>×</button></article>):<p>No markups yet.</p>}</div>
      <div className="ep-drawer-actions"><button onClick={copyBrief} disabled={!marks.length}>Copy change brief</button><button onClick={()=>{if(window.confirm('Clear every Estate Plan markup?')){setMarks([]);setRedo([])}}} disabled={!marks.length}>Clear all</button></div>
    </aside></div>}
  </main>
}
