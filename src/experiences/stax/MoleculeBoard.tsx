import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Glyph, SCALE } from './SymbolCanvas'
import { SYMBOLS, type Kind } from './model'
import './molecule-board.css'

type Atom = { id: string; kind: Kind; x: number; y: number }
type Bond = { a: string; b: string; port: 'pink'|'purple'|'pair'|'next-left'|'next-right' }
type Draft = { atoms: Atom[]; bonds: Bond[] }
type Gesture = { id: string; pointerId: number; x: number; y: number; initial: Draft; moved: boolean }
const KEY = 'stax-free-molecules-v1'
const W = 960, H = 570
const ASPECT = W/H, MIN_WIDTH=300,MAX_WIDTH=3000, DROP_DISTANCE=66, TAP_DISTANCE=12, DOUBLE_TAP_MS=350
type View = {x:number;y:number;width:number;height:number}
const defaultView:View={x:0,y:0,width:W,height:H}
function bounds(doc:Draft) {
 if(!doc.atoms.length)return null
 return doc.atoms.reduce((r,a)=>({left:Math.min(r.left,a.x),top:Math.min(r.top,a.y),right:Math.max(r.right,a.x+w(a.kind)),bottom:Math.max(r.bottom,a.y+h(a.kind))}),{left:Infinity,top:Infinity,right:-Infinity,bottom:-Infinity})
}
function fit(doc:Draft):View {
 const b=bounds(doc);if(!b)return defaultView
 const width=Math.min(MAX_WIDTH,Math.max(MIN_WIDTH,b.right-b.left+140,(b.bottom-b.top+140)*ASPECT)),height=width/ASPECT
 return {x:(b.left+b.right-width)/2,y:(b.top+b.bottom-height)/2,width,height}
}
function center(doc:Draft,v:View):View {
 const b=bounds(doc);return b?{...v,x:(b.left+b.right-v.width)/2,y:(b.top+b.bottom-v.height)/2}:v
}
function zoom(v:View,factor:number):View {
 const width=Math.max(MIN_WIDTH,Math.min(MAX_WIDTH,v.width*factor)),height=width/ASPECT
 return {x:v.x+(v.width-width)/2,y:v.y+(v.height-height)/2,width,height}
}
/** Treat support bonds as head to child; sequence bonds as left family to right. */
function directed(doc:Draft,b:Bond):[string,string] {
 const a=doc.atoms.find(x=>x.id===b.a)!,z=doc.atoms.find(x=>x.id===b.b)!
 if(b.port==='pair')return a.kind==='square'?[a.id,z.id]:z.kind==='square'?[z.id,a.id]:[a.id,z.id]
 if(b.port==='pink'||b.port==='purple')return a.kind==='circle'?[a.id,z.id]:z.kind==='circle'?[z.id,a.id]:[a.id,z.id]
 return a.x<=z.x?[a.id,z.id]:[z.id,a.id]
}
function descendants(doc:Draft,id:string):Set<string> {
 const byParent=new Map<string,string[]>()
 for(const b of doc.bonds){const [parent,child]=directed(doc,b);byParent.set(parent,[...(byParent.get(parent)||[]),child])}
 const set=new Set([id]),queue=[id]
 for(let i=0;i<queue.length;i++)for(const next of byParent.get(queue[i])||[])if(!set.has(next)){set.add(next);queue.push(next)}
 return set
}
const w = (kind: Kind) => SYMBOLS[kind].w * SCALE
const h = (kind: Kind) => SYMBOLS[kind].h * SCALE
const blank = (): Draft => ({atoms:[],bonds:[]})
function load(): Draft {
 try {
  const raw = JSON.parse(localStorage.getItem(KEY)||'null') as Draft|null
  if(raw && Array.isArray(raw.atoms) && Array.isArray(raw.bonds) && raw.atoms.length<=60 &&
   raw.atoms.every(a=>typeof a.id==='string' && Object.hasOwn(SYMBOLS,a.kind) && Number.isFinite(a.x) && Number.isFinite(a.y)) &&
   raw.bonds.every(b=>raw.atoms.some(a=>a.id===b.a) && raw.atoms.some(a=>a.id===b.b) && ['pink','purple','pair','next-left','next-right'].includes(b.port))) return raw
 }catch{/* invalid local draft */}
 return blank()
}
function group(doc:Draft,id:string): Set<string> {
 const ids=new Set([id]);let changed=true
 while(changed){changed=false;for(const b of doc.bonds){
  if(ids.has(b.a)&&!ids.has(b.b)){ids.add(b.b);changed=true}
  if(ids.has(b.b)&&!ids.has(b.a)){ids.add(b.a);changed=true}
 }}
 return ids
}
function moveGroup(doc:Draft,ids:Set<string>,dx:number,dy:number):Draft {
 return {...doc,atoms:doc.atoms.map(a=>ids.has(a.id)?{...a,x:a.x+dx,y:a.y+dy}:a)}
}
function occupied(doc:Draft,id:string,port:Bond['port']):boolean {
 return doc.bonds.some(b=>{
  if(b.a!==id && b.b!==id)return false
  if(b.port==='next-right')return port===(b.a===id?'next-left':'next-right')
  if(b.port==='next-left')return port===(b.a===id?'next-right':'next-left')
  return b.port===port
 })
}
function hasSupport(doc:Draft,blue:string,kind:'square'|'rectangle'):boolean {
 const connected=group(doc,blue)
 return [...connected].some(id=>doc.atoms.some(a=>a.id===id && a.kind===kind))
}
function sameGroup(doc:Draft,a:string,b:string){return group(doc,a).has(b)}
function candidate(doc:Draft,moving:Set<string>,stationary:Set<string>) {
 type Choice={a:string;b:string;port:Bond['port'];x:number;y:number;score:number}
 const choices:Choice[]=[]
 const atoms=new Map(doc.atoms.map(a=>[a.id,a]))
 for(const aId of moving)for(const bId of stationary){
  const a=atoms.get(aId)!,b=atoms.get(bId)!
  let port:Bond['port']|null=null,x=0,y=0
  const blue=a.kind==='circle'?a:b.kind==='circle'?b:null
  const supporter=a.kind==='square'||a.kind==='rectangle'?a:b.kind==='square'||b.kind==='rectangle'?b:null
  if(blue&&supporter){
   const k=supporter.kind==='square'?'pink':'purple'
   // A component already owned by another circle cannot bridge two nouns.
   if([...group(doc,supporter.id)].some(id=>atoms.get(id)?.kind==='circle'))continue
   if(hasSupport(doc,blue.id,supporter.kind as 'square'|'rectangle') || occupied(doc,blue.id,k))continue
   // A single supporter ends at the blue centreline. A pair sits centred below.
   const otherKind=supporter.kind==='square'?'rectangle':'square'
   const paired=hasSupport(doc,blue.id,otherKind) || [...group(doc,supporter.id)].some(id=>atoms.get(id)?.kind===otherKind)
   const sx=paired?(supporter.kind==='square'?-w('square')-3:3):-w(supporter.kind)
   x=blue.x+w('circle')/2+sx
   y=blue.y+h('circle')+RULE_GAP
   if(a.id===supporter.id){port=k} else {port=k}
   // move a's component so the target supporter/blue reaches its assigned location
   if(a.id===supporter.id){x-=a.x;y-=a.y}
   else {x=b.x-(a.x+w('circle')/2+sx);y=b.y-(a.y+h('circle')+RULE_GAP)}
  }else if((a.kind==='square'&&b.kind==='rectangle')||(a.kind==='rectangle'&&b.kind==='square')){
   if(occupied(doc,a.id,'pair')||occupied(doc,b.id,'pair'))continue
   if(a.kind==='square'){x=b.x-w('square')-GAP-a.x;y=b.y-a.y}
   else{x=b.x+w('square')+GAP-a.x;y=b.y-a.y}
   port='pair'
  }else if((a.kind==='circle'||a.kind==='triangle')&&(b.kind==='circle'||b.kind==='triangle')){
   if(a.kind==='triangle'&&b.kind==='triangle')continue
   // Each family has a distinct left and right port. One use per port.
   const diagonal=(a.kind==='triangle'||b.kind==='triangle')?70:0
   const opts=[
    {x:b.x+w(b.kind)+25-a.x,y:b.y+diagonal-a.y,port:'next-right' as const},
    {x:b.x-w(a.kind)-25-a.x,y:b.y-diagonal-a.y,port:'next-left' as const},
   ].filter(p=>!occupied(doc,a.id,p.port==='next-right'?'next-left':'next-right') && !occupied(doc,b.id,p.port))
   if(!opts.length)continue
   const best=opts.sort((u,v)=>Math.hypot(u.x,u.y)-Math.hypot(v.x,v.y))[0]
   x=best.x;y=best.y;port=best.port
  }
  if(port){const score=Math.hypot(x,y);if(score<SNAP)choices.push({a:a.id,b:b.id,port,x,y,score})}
 }
 return choices.sort((a,b)=>a.score-b.score)[0]
}
const GAP=6,RULE_GAP=10,SNAP=56
function add(doc:Draft,kind:Kind):Draft {
 const n=doc.atoms.length
 const a:Atom={id:crypto.randomUUID(),kind,x:130+(n%5)*140,y:115+Math.floor(n/5)*120}
 return {...doc,atoms:[...doc.atoms,a]}
}
export function MoleculeBoard() {
 const [doc,setDoc]=useState<Draft>(load)
 const [selected,setSelected]=useState<string|null>(null)
 const [hint,setHint]=useState('Drag pieces freely. Bring compatible shapes close to snap; pull away to separate.')
 const [history,setHistory]=useState<Draft[]>([])
 const [view,setView]=useState<View>(defaultView)
 const [dropping,setDropping]=useState<Set<string>>(new Set())
 const svg=useRef<SVGSVGElement>(null)
 const gesture=useRef<Gesture|null>(null)
 const latest=useRef(doc)
 const lastTap=useRef<{id:string;at:number}|null>(null)
 const dropTimer=useRef<ReturnType<typeof setTimeout>|null>(null)
 useEffect(()=>()=>{if(dropTimer.current)clearTimeout(dropTimer.current)},[])
 useEffect(()=>{try{localStorage.setItem(KEY,JSON.stringify(doc))}catch{/* quota */}},[doc])
 function current(next:Draft){latest.current=next;setDoc(next)}
 function commit(next:Draft,previous=latest.current){setHistory(v=>[...v,previous].slice(-30));current(next)}
 function drop(id:string){
  const before=latest.current,ids=descendants(before,id)
  if(!before.bonds.some(b=>ids.has(b.a)!==ids.has(b.b))){
   setHint('No parent connection to release. You can still drag the whole molecule.');return
  }
  // Preserve every internal child bond, removing only edges into the dropped branch.
  const after=moveGroup({...before,bonds:before.bonds.filter(b=>ids.has(b.a)===ids.has(b.b))},ids,0,DROP_DISTANCE)
  if(dropTimer.current)clearTimeout(dropTimer.current)
  setDropping(new Set(ids));commit(after,before)
  dropTimer.current=setTimeout(()=>setDropping(new Set()),320)
  setHint(ids.size>1?'Branch dropped with all its descendants.':'Shape dropped and detached.')
 }
 function point(e:ReactPointerEvent<SVGSVGElement|SVGGElement>){
  const m=svg.current?.getScreenCTM()
  if(!m)return {x:0,y:0}
  const p=svg.current!.createSVGPoint();p.x=e.clientX;p.y=e.clientY
  return p.matrixTransform(m.inverse())
 }
 function down(e:ReactPointerEvent<SVGGElement>,id:string){
  if(e.pointerType==='mouse'&&e.button!==0)return
  const p=point(e)
  if(dropTimer.current)clearTimeout(dropTimer.current)
  setDropping(new Set())
  gesture.current={id,pointerId:e.pointerId,x:p.x,y:p.y,initial:latest.current,moved:false}
  e.currentTarget.setPointerCapture(e.pointerId);setSelected(id);e.stopPropagation()
 }
 function drag(e:ReactPointerEvent<SVGGElement>){
  const g=gesture.current;if(!g||g.pointerId!==e.pointerId)return
  const p=point(e),dx=p.x-g.x,dy=p.y-g.y
  if(Math.hypot(dx,dy)>TAP_DISTANCE)g.moved=true
  if(!g.moved)return
  // The entire connected component moves; dragging never detaches anything.
  current(moveGroup(g.initial,group(g.initial,g.id),dx,dy))
  e.stopPropagation()
 }
 function up(e:ReactPointerEvent<SVGGElement>){
  const g=gesture.current;if(!g||g.pointerId!==e.pointerId)return
  gesture.current=null
  const now=Date.now()
  if(!g.moved){
   if(lastTap.current?.id===g.id&&now-lastTap.current.at<=DOUBLE_TAP_MS){
    lastTap.current=null;drop(g.id)
   }else{lastTap.current={id:g.id,at:now};setHint('Double-tap to drop this branch, or drag to move its whole molecule.')}
   e.stopPropagation();return
  }
  lastTap.current=null
  const doc=latest.current,moving=group(doc,g.id)
  let best:ReturnType<typeof candidate>|undefined=undefined
  for(const atom of doc.atoms){
   if(moving.has(atom.id))continue
   const found=candidate(doc,moving,group(doc,atom.id))
   if(found&&(!best||found.score<best.score))best=found
  }
  if(best){
   const aligned=moveGroup(doc,moving,best.x,best.y)
   if(!sameGroup(aligned,best.a,best.b)){
    commit({...aligned,bonds:[...aligned.bonds,{a:best.a,b:best.b,port:best.port}]},g.initial)
    setHint('Snap! Drag the molecule as one, or double-tap a child to drop its branch.')
   }
  }else{
   setHistory(v=>[...v,g.initial].slice(-30))
   setHint('Released. The pieces stay exactly where you placed them.')
  }
  e.stopPropagation()
 }
  function remove(){
  if(!selected)return
  commit({atoms:doc.atoms.filter(a=>a.id!==selected),bonds:doc.bonds.filter(b=>b.a!==selected&&b.b!==selected)});setSelected(null)
 }
 return <div className="stax-molecule-ui">
  <div className="stax-molecule-tools"><strong>Free molecule board</strong><span>Experimental magnetic assembly · local-only save</span>
   <div className="stax-molecule-buttons"><button onClick={()=>{if(history.length){current(history[history.length-1]);setHistory(h=>h.slice(0,-1))}}} disabled={!history.length}>Undo</button><button onClick={remove} disabled={!selected}>Remove</button><button onClick={()=>{commit(blank());setSelected(null)}}>Clear</button></div>
  </div>
  <div className="stax-molecule-view-controls"><button onClick={()=>setView(v=>center(latest.current,v))}>Center</button><button onClick={()=>setView(fit(latest.current))}>Fit all</button><button aria-label="Zoom out" onClick={()=>setView(v=>zoom(v,1.25))}>−</button><span>{Math.round(100*W/view.width)}%</span><button aria-label="Zoom in" onClick={()=>setView(v=>zoom(v,.8))}>+</button></div>
  <div className="stax-molecule-canvas">
   <svg ref={svg} viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} aria-label="Freely movable grammar molecules" onClick={()=>setSelected(null)}>
    <rect width={W} height={H} fill="#faf9f6"/>
    {doc.bonds.map((b,i)=>{const a=doc.atoms.find(n=>n.id===b.a),z=doc.atoms.find(n=>n.id===b.b);if(!a||!z)return null;return <line key={i} x1={a.x+w(a.kind)/2} y1={a.y+h(a.kind)/2} x2={z.x+w(z.kind)/2} y2={z.y+h(z.kind)/2} stroke="#a8b5c0" strokeWidth="4" strokeLinecap="round"/>})}
    {doc.atoms.map(a=><g key={a.id} transform={`translate(${a.x} ${a.y})`} data-kind={a.kind} data-id={a.id} className={dropping.has(a.id)?'stax-molecule-dropping':undefined}
     onPointerDown={e=>down(e,a.id)} onPointerMove={drag} onPointerUp={up} onPointerCancel={()=>{gesture.current=null}}
     style={{touchAction:'none',cursor:'grab'}}>
     {selected===a.id&&<rect x="-10" y="-10" width={w(a.kind)+20} height={h(a.kind)+20} rx="7" fill="none" stroke="#34495c" strokeDasharray="5 5"/>}
     <Glyph kind={a.kind} w={w(a.kind)} h={h(a.kind)} fill={SYMBOLS[a.kind].color+'1c'} stroke={SYMBOLS[a.kind].color} strokeWidth={3}/>
    </g>)}
   </svg>
   {!doc.atoms.length&&<p className="stax-molecule-empty">Choose a shape below to begin assembling.</p>}
  </div>
  <div className="stax-molecule-palette">{(['circle','triangle','square','rectangle','diamond','hexagon','oval'] as Kind[]).map(kind=><button key={kind} onClick={()=>{commit(add(doc,kind));setHint('New atom added. Drag it near a compatible atom or molecule.')}} title={SYMBOLS[kind].role}>
   <svg viewBox={`-4 -4 ${w(kind)+8} ${h(kind)+8}`}><Glyph kind={kind} w={w(kind)} h={h(kind)} stroke={SYMBOLS[kind].color} fill={SYMBOLS[kind].color+'20'} strokeWidth={3}/></svg>
  </button>)}</div>
  <p className="stax-molecule-hint" role="status">{hint}</p>
  <p className="stax-molecule-note">Double-tap a child to drop its branch with descendants; drag moves connected pieces together. Prototype connections: pink–purple, blue–pink, blue–purple, blue–blue, blue–red and red–blue. Other connections remain unverified. One port per bond; no forced assembly.</p>
 </div>
}
