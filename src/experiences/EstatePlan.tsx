import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react'
import { floors, walls, glass, furnishings, footprint } from './estate/plan'
import { estateRailings } from './estate/railings'
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
  main:{x:-44,y:-53,w:92,h:96},
  arrival:{x:-28,y:-64,w:56,h:49},
  site:{x:-66,y:-69,w:132,h:132},
}
const categoryMeta:Record<Category,{label:string;color:string}>={
  general:{label:'General',color:'#d34f4f'},
  deck:{label:'Deck',color:'#2b78c5'},
  railing:{label:'Railing',color:'#b36a18'},
  wall:{label:'Wall',color:'#7951a8'},
  remove:{label:'Remove',color:'#b62f46'},
}
const floorColor:Record<string,string>={
  limestone:'#efe7d7',travertine:'#e6dccb',oak:'#d5c2a0',walnut:'#a98b68',concrete:'#d5d3cc',basalt:'#6d7473',
}
const pointsString=(pts:Pt[])=>pts.map(q=>`${q.x},${q.y}`).join(' ')

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
  const [clean,setClean]=useState(false)
  const [layers,setLayers]=useState({labels:true,furniture:true,railings:true,markups:true})
  const [status,setStatus]=useState('')

  useEffect(()=>{localStorage.setItem(STORAGE,JSON.stringify(marks))},[marks])
  useEffect(()=>{setBox(DEFAULT_BOX[view])},[view])

  const nextId=useMemo(()=>{
    const max=marks.reduce((n,m)=>Math.max(n,Number(m.id.replace(/\D/g,''))||0),0)
    return `A${max+1}`
  },[marks])

  function toPlan(clientX:number,clientY:number):Pt{
    const svg=svgRef.current
    if(!svg)return{x:0,y:0}
    const p=svg.createSVGPoint();p.x=clientX;p.y=clientY
    const matrix=svg.getScreenCTM()?.inverse()
    if(!matrix)return{x:0,y:0}
    const out=p.matrixTransform(matrix)
    return{x:out.x,y:out.y}
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
      const p=toPlan(screen.x,screen.y);cx=p.x;cy=p.y
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
  const roomLabels=layers.labels?viewFloors.filter(f=>f.name!=='Arrival court'&&f.name!=='Arrival steps'):[]

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
          {(Object.keys(categoryMeta) as Category[]).map(k=><marker key={k} id={`ep-arrow-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill={categoryMeta[k].color}/></marker>)}
        </defs>
        <rect x={box.x-20} y={box.y-20} width={box.w+40} height={box.h+40} fill="#f7f3e8"/>
        <rect x={box.x-20} y={box.y-20} width={box.w+40} height={box.h+40} fill="url(#ep-grid)"/>
        {view==='site'&&<ellipse cx="0" cy="-7" rx="58" ry="61" fill="#e8ece1" stroke="#aeb6a7" strokeWidth=".35"/>}
        <rect x="-70" y="12" width="140" height="65" fill="#dceff2" opacity={view==='arrival'?.18:.72}/>
        <text x="0" y="34" textAnchor="middle" fontSize="2.3" letterSpacing=".35" fill="#6f9ea8" opacity=".72">OCEAN</text>

        {viewFloors.map((f,i)=>{
          const lower=f.name==='Arrival court'||f.name==='Arrival steps'
          const opacity=view==='site'?.9:view==='arrival'?(lower?1:.16):(lower?.13:1)
          if(f.name==='Arrival court')return <circle key={`floor-${i}`} cx="1" cy="-41" r="19" fill={floorColor[f.material]||'#e8e1d3'} opacity={opacity} stroke="#918d85" strokeWidth=".18"/>
          return <rect key={`floor-${i}`} x={f.x1} y={-f.z2} width={f.x2-f.x1} height={f.z2-f.z1} rx=".08" fill={floorColor[f.material]||'#e8e1d3'} opacity={opacity} stroke="#a59e91" strokeWidth=".14"/>
        })}
        <rect x="-10.9" y="24.2" width="22.8" height="11.8" rx=".18" fill="#8fcfd2" stroke="#4f9ca4" strokeWidth=".22"/>
        <text x=".5" y="30.5" textAnchor="middle" fontSize="1.15" fill="#326f78">Infinity pool</text>
        <rect x="-20" y="-27" width="8" height="9" rx=".3" fill="#aab69a" stroke="#75856c" strokeWidth=".18"/>
        <circle cx="1" cy="-41" r="4" fill="#92c8cb" stroke="#6f8e89" strokeWidth=".18"/>
        <circle cx="1" cy="-41" r="3.45" fill="#b9e0e1" opacity=".75"/>

        {walls.map((w,i)=><rect key={`wall-${i}`} x={w.x1} y={-w.z2} width={Math.max(.12,w.x2-w.x1)} height={Math.max(.12,w.z2-w.z1)} fill="#403d38" opacity={view==='arrival'?.72:.9}/>)}
        {glass.map((w,i)=><rect key={`glass-${i}`} x={w.x1} y={-w.z2} width={Math.max(.11,w.x2-w.x1)} height={Math.max(.11,w.z2-w.z1)} fill="#5aa4b0" opacity=".88"/>)}

        {layers.furniture&&view!=='arrival'&&furnishings.map((f,i)=>{const r=footprint(f);return <rect key={`furn-${i}`} x={r.x1} y={-r.z2} width={r.x2-r.x1} height={r.z2-r.z1} rx=".18" fill="#887d6c" opacity=".26" stroke="#6c6254" strokeWidth=".08"/>})}

        {layers.railings&&estateRailings.map(r=><polyline key={r.id} points={r.points.map(([x,z])=>`${x},${-z}`).join(' ')} fill="none" stroke={r.family==='garden'?'#7b5f48':'#593f2d'} strokeWidth={r.family==='garden'?.25:.34} strokeDasharray={r.family==='garden'?'.55 .22':undefined} strokeLinecap="round" strokeLinejoin="round"/>)}

        {roomLabels.map((f,i)=>{const w=f.x2-f.x1,d=f.z2-f.z1;return <text key={`label-${i}`} x={(f.x1+f.x2)/2} y={-(f.z1+f.z2)/2} textAnchor="middle" dominantBaseline="middle" fontSize={labelSize(f.name,w,d)} fill="#48433b" opacity=".82">{f.name}</text>})}

        {layers.markups&&marks.map(mark=>{
          const color=categoryMeta[mark.category].color
          if(mark.tool==='area')return <polygon key={mark.id} points={pointsString(mark.points)} fill={color} fillOpacity=".17" stroke={color} strokeWidth=".38" strokeLinejoin="round"/>
          if(mark.tool==='pen')return <polyline key={mark.id} points={pointsString(mark.points)} fill="none" stroke={color} strokeWidth=".5" strokeLinecap="round" strokeLinejoin="round"/>
          if(mark.tool==='arrow'){const a=mark.points[0],b=mark.points[mark.points.length-1];return <line key={mark.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth=".5" strokeLinecap="round" markerEnd={`url(#ep-arrow-${mark.category})`}/>}
          const p=mark.points[0]
          return <g key={mark.id}><circle cx={p.x} cy={p.y} r=".88" fill={color}/><text x={p.x} y={p.y+.05} textAnchor="middle" dominantBaseline="middle" fontSize=".68" fontWeight="700" fill="white">{mark.id}</text>{mark.text&&<text x={p.x+1.2} y={p.y+.12} fontSize=".92" fontWeight="600" fill={color} paintOrder="stroke" stroke="#f7f3e8" strokeWidth=".25">{mark.text}</text>}</g>
        })}
        {draft.length>1&&(tool==='pen'?<polyline points={pointsString(draft)} fill="none" stroke={categoryMeta[category].color} strokeWidth=".5" strokeDasharray=".5 .24"/>:tool==='area'?<polygon points={pointsString(draft)} fill={categoryMeta[category].color} fillOpacity=".12" stroke={categoryMeta[category].color} strokeWidth=".35" strokeDasharray=".5 .24"/>:<line x1={draft[0].x} y1={draft[0].y} x2={draft[draft.length-1].x} y2={draft[draft.length-1].y} stroke={categoryMeta[category].color} strokeWidth=".5" strokeDasharray=".5 .24"/>)}

        <g transform={`translate(${box.x+3} ${box.y+box.h-3})`}><line x1="0" y1="0" x2="10" y2="0" stroke="#4b4842" strokeWidth=".22"/><line x1="0" y1="-.45" x2="0" y2=".45" stroke="#4b4842" strokeWidth=".18"/><line x1="10" y1="-.45" x2="10" y2=".45" stroke="#4b4842" strokeWidth=".18"/><text x="5" y="-1" textAnchor="middle" fontSize=".9" fill="#4b4842">10 m</text></g>
        <g transform={`translate(${box.x+box.w-4} ${box.y+4})`}><path d="M0 2 L0 -2 M0 -2 L-1 -0.5 M0 -2 L1 -0.5" fill="none" stroke="#4b4842" strokeWidth=".22"/><text x="0" y="3.4" textAnchor="middle" fontSize=".9" fill="#4b4842">N</text></g>
      </svg>

      {!clean&&<div className="ep-zoom"><button onClick={()=>zoom(.82)}>＋</button><button onClick={()=>zoom(1.22)}>−</button><button onClick={()=>setBox(DEFAULT_BOX[view])}>Fit</button></div>}
      {clean&&<button className="ep-clean-exit" onClick={()=>setClean(false)}>Exit clean view</button>}
    </section>

    {!clean&&<aside className="ep-layer-panel">
      <strong>Layers</strong>
      {Object.entries(layers).map(([key,value])=><label key={key}><input type="checkbox" checked={value} onChange={()=>setLayers(x=>({...x,[key]:!x[key as keyof typeof x]}))}/>{key}</label>)}
    </aside>}

    {!clean&&<footer className="ep-tools">
      <div className="ep-tools-scroll">
        {([['pan','Pan'],['pen','Draw'],['arrow','Arrow'],['area','Area'],['note','Note']] as [Tool,string][]).map(([id,label])=><button key={id} className={tool===id?'active':''} onClick={()=>setTool(id)}><span>{id==='pan'?'✥':id==='pen'?'✎':id==='arrow'?'→':id==='area'?'▱':'A1'}</span>{label}</button>)}
      </div>
      <select className="ep-category" value={category} onChange={e=>setCategory(e.target.value as Category)} aria-label="Markup category">
        {(Object.keys(categoryMeta) as Category[]).map(k=><option key={k} value={k}>{categoryMeta[k].label}</option>)}
      </select>
      <div className="ep-history"><button onClick={undo} disabled={!marks.length} aria-label="Undo">↶</button><button onClick={redoOne} disabled={!redo.length} aria-label="Redo">↷</button></div>
      <button className="ep-more" onClick={()=>setNotesOpen(true)}>Marks {marks.length}</button>
      <button className="ep-more" onClick={()=>setClean(true)}>Clean</button>
      <button className="ep-more" onClick={exportPng}>Export</button>
    </footer>}

    {!clean&&marks.length===0&&<div className="ep-hint">Use <strong>Area</strong> for deck extensions, <strong>Arrow</strong> for railings, and <strong>Note</strong> for callouts. Your marks save automatically on this device.</div>}
    {!clean&&status&&<div className="ep-status">{status}</div>}

    {noteDraft&&<div className="ep-modal" onClick={()=>setNoteDraft(null)}><section onClick={e=>e.stopPropagation()}><small>{nextId} · {categoryMeta[category].label}</small><h2>Add a note</h2><textarea autoFocus value={noteDraft.text} onChange={e=>setNoteDraft({...noteDraft,text:e.target.value})} placeholder="e.g. Extend the deck to this line"/><div><button onClick={()=>setNoteDraft(null)}>Cancel</button><button className="primary" onClick={addNote}>Add {nextId}</button></div></section></div>}

    {notesOpen&&<div className="ep-drawer-backdrop" onClick={()=>setNotesOpen(false)}><aside className="ep-drawer" onClick={e=>e.stopPropagation()}>
      <header><div><small>PLAN MARKUPS</small><h2>Change list</h2></div><button onClick={()=>setNotesOpen(false)}>×</button></header>
      <div className="ep-mark-list">{marks.length?marks.map(m=><article key={m.id}><b style={{background:categoryMeta[m.category].color}}>{m.id}</b><span><strong>{categoryMeta[m.category].label} · {m.tool}</strong><small>{m.text||`${m.points.length} point${m.points.length===1?'':'s'}`}</small></span><button onClick={()=>removeMark(m.id)}>×</button></article>):<p>No markups yet.</p>}</div>
      <div className="ep-drawer-actions"><button onClick={copyBrief} disabled={!marks.length}>Copy change brief</button><button onClick={()=>{if(window.confirm('Clear every Estate Plan markup?')){setMarks([]);setRedo([])}}} disabled={!marks.length}>Clear all</button></div>
    </aside></div>}
  </main>
}
