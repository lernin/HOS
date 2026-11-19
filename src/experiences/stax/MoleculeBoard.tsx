import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Glyph, SCALE } from './SymbolCanvas'
import { SYMBOLS, type Kind } from './model'
import './molecule-board.css'

type Atom = { id: string; kind: Kind; x: number; y: number }
type Bond = { a: string; b: string; port: 'pink'|'purple'|'pair'|'next' }
type Draft = { atoms: Atom[]; bonds: Bond[] }
type Gesture = { id: string; pointerId: number; x: number; y: number; originX: number; originY: number; initial: Draft; detached: boolean }
const KEY = 'stax-free-molecules-v1'
const W = 960, H = 570
const w = (kind: Kind) => SYMBOLS[kind].w * SCALE
const h = (kind: Kind) => SYMBOLS[kind].h * SCALE
const blank = (): Draft => ({atoms:[],bonds:[]})
function load(): Draft {
 try {
  const raw = JSON.parse(localStorage.getItem(KEY)||'null') as Draft|null
  if(raw && Array.isArray(raw.atoms) && Array.isArray(raw.bonds) && raw.atoms.length<=60 &&
   raw.atoms.every(a=>typeof a.id==='string' && Object.hasOwn(SYMBOLS,a.kind) && Number.isFinite(a.x) && Number.isFinite(a.y)) &&
   raw.bonds.every(b=>raw.atoms.some(a=>a.id===b.a) && raw.atoms.some(a=>a.id===b.b) && ['pink','purple','pair','next'].includes(b.port))) return raw
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
 return doc.bonds.some(b=>b.a===id&&b.port===port || b.b===id&&b.port===port && port==='pair')
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
   if(hasSupport(doc,blue.id,supporter.kind) || occupied(doc,blue.id,k))continue
   // A single supporter ends at the blue centreline. A pair sits centred below.
   const otherKind=supporter.kind==='square'?'rectangle':'square'
   const paired=hasSupport(doc,blue.id,otherKind) || [...group(doc,supporter.id)].some(id=>atoms.get(id)?.kind===otherKind)
   const sx=paired?(supporter.kind==='square'?-w('square')-3:3):-w(supporter.kind)
   x=blue.x+w('circle')/2+sx
   y=blue.y+h('circle')+RULE_GAP
   if(a.id===supporter.id){port=k} else {port=k}
   // move a's component so the target supporter/blue reaches its assigned location
   if(a.id===supporter.id){x-=a.x;y-=a.y}
   else {x=a.x-(b.x+w('circle')/2+sx);y=a.y-(b.y+h('circle')+RULE_GAP)}
  }else if((a.kind==='square'&&b.kind==='rectangle')||(a.kind==='rectangle'&&b.kind==='square')){
   if(occupied(doc,a.id,'pair')||occupied(doc,b.id,'pair'))continue
   if(a.kind==='square'){x=b.x-w('square')-GAP-a.x;y=b.y-a.y}
   else{x=b.x+w('square')+GAP-a.x;y=b.y-a.y}
   port='pair'
  }else if((a.kind==='circle'||a.kind==='triangle')&&(b.kind==='circle'||b.kind==='triangle')){
   if(a.kind==='triangle'&&b.kind==='triangle')continue
   if(occupied(doc,a.id,'next')||occupied(doc,b.id,'next'))continue
   // Family-to-family: blue/blue horizontal, any red connection diagonal.
   const step=(a.kind==='triangle'||b.kind==='triangle')?70:0
   const right=b.x+w(b.kind)+25, left=b.x-w(a.kind)-25
   const possibilities=[{x:right-a.x,y:b.y+step-a.y},{x:left-a.x,y:b.y-step-a.y}]
   const best=possibilities.sort((u,v)=>Math.hypot(u.x,u.y)-Math.hypot(v.x,v.y))[0]
   x=best.x;y=best.y;port='next'
  }
  if(port){const score=Math.hypot(x,y);if(score<SNAP)choices.push({a:a.id,b:b.id,port,x,y,score})}
 }
 return choices.sort((a,b)=>a.score-b.score)[0]
}
const GAP=6,RULE_GAP=10,SNAP=56,DETACH=48
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
 const svg=useRef<SVGSVGElement>(null)
 const gesture=useRef<Gesture|null>(null)
 useEffect(()=>{try{localStorage.setItem(KEY,JSON.stringify(doc))}catch{/* quota */}},[doc])
 function commit(next:Draft){setHistory(v=>[...v,doc].slice(-30));setDoc(next)}
 function point(e:ReactPointerEvent<SVGSVGElement|SVGGElement>){
  const m=svg.current?.getScreenCTM()
  if(!m)return {x:0,y:0}
  const p=svg.current!.createSVGPoint();p.x=e.clientX;p.y=e.clientY
  return p.matrixTransform(m.inverse())
 }
 function down(e:ReactPointerEvent<SVGGElement>,id:string){
  if(e.pointerType==='mouse'&&e.button!==0)return
  const p=point(e),a=doc.atoms.find(a=>a.id===id)!
  gesture.current={id,pointerId:e.pointerId,x:p.x,y:p.y,originX:a.x,originY:a.y,initial:doc,detached:false}
  e.currentTarget.setPointerCapture(e.pointerId);setSelected(id);e.stopPropagation()
 }
 function drag(e:ReactPointerEvent<SVGGElement>){
  const g=gesture.current;if(!g||g.pointerId!==e.pointerId)return
  const p=point(e),dx=p.x-g.x,dy=p.y-g.y
  const raw=g.initial,dist=Math.hypot(dx,dy)
  let base=raw
  if(dist>DETACH && !g.detached && raw.bonds.some(b=>b.a===g.id||b.b===g.id)){
   // A member may be pulled free. Detach only its own immediate bonds;
   // all remaining bonded atoms retain their relative arrangement.
   base={...raw,bonds:raw.bonds.filter(b=>b.a!==g.id&&b.b!==g.id)}
   g.detached=true;g.initial=base;g.x=p.x;g.y=p.y
  }
  const ids=group(g.initial,g.id)
  setDoc(moveGroup(g.initial,ids,p.x-g.x,p.y-g.y))
  e.stopPropagation()
 }
 function up(e:ReactPointerEvent<SVGGElement>){
  const g=gesture.current;if(!g||g.pointerId!==e.pointerId)return
  gesture.current=null
  const moving=group(doc,g.id)
  let best:ReturnType<typeof candidate>=undefined
  const others=doc.atoms.filter(a=>!moving.has(a.id))
  for(const a of others){
   const station=group(doc,a.id)
   const found=candidate(doc,moving,station)
   if(found&&(!best||found.score<best.score))best=found
  }
  if(best){
   const next=moveGroup(doc,moving,best.x,best.y)
   // The port is exclusive, and a bond never joins atoms already connected.
   if(!sameGroup(next,best.a,best.b)){
    const edge:Bond={a:best.a,b:best.b,port:best.port}
    commit({...next,bonds:[...next.bonds,edge]})
    setHint('Snap! The molecule now moves as one. Pull a member away to separate it.')
   }
  }else{
   setHistory(v=>[...v,g.initial].slice(-30))
   setHint('Released. The piece stays where you dropped it.')
  }
  e.stopPropagation()
 }
 function remove(){
  if(!selected)return
  commit({atoms:doc.atoms.filter(a=>a.id!==selected),bonds:doc.bonds.filter(b=>b.a!==selected&&b.b!==selected)});setSelected(null)
 }
 return <div className="stax-molecule-ui">
  <div className="stax-molecule-tools"><strong>Free molecule board</strong><span>Experimental magnetic assembly · local-only save</span>
   <div className="stax-molecule-buttons"><button onClick={()=>{if(history.length){setDoc(history[history.length-1]);setHistory(h=>h.slice(0,-1))}}} disabled={!history.length}>Undo</button><button onClick={remove} disabled={!selected}>Remove</button><button onClick={()=>{commit(blank());setSelected(null)}}>Clear</button></div>
  </div>
  <div className="stax-molecule-canvas">
   <svg ref={svg} viewBox={`0 0 ${W} ${H}`} aria-label="Freely movable grammar molecules" onClick={()=>setSelected(null)}>
    <rect width={W} height={H} fill="#faf9f6"/>
    {doc.bonds.map((b,i)=>{const a=doc.atoms.find(n=>n.id===b.a),z=doc.atoms.find(n=>n.id===b.b);if(!a||!z)return null;return <line key={i} x1={a.x+w(a.kind)/2} y1={a.y+h(a.kind)/2} x2={z.x+w(z.kind)/2} y2={z.y+h(z.kind)/2} stroke="#a8b5c0" strokeWidth="4" strokeLinecap="round"/>})}
    {doc.atoms.map(a=><g key={a.id} transform={`translate(${a.x} ${a.y})`} data-kind={a.kind} data-id={a.id}
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
  <p className="stax-molecule-note">Prototype connections: pink–purple, blue–pink, blue–purple, blue–blue, blue–red and red–blue. Other connections remain unverified. One port per bond; no forced assembly.</p>
 </div>
}
