import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Glyph, SCALE } from './SymbolCanvas'
import { SYMBOLS, type Kind } from './model'
import './molecule-board.css'

/**
 * Free-form STAX assembly. No grid, global autolayout, or implicit attachment on creation.
 * Bonds are the ONLY source of molecule membership. Coordinates are always world-space.
 */
type Atom = { id:string; kind:Kind; x:number; y:number }
type Relation = 'pair'|'support'|'sequence'
type Bond = { parent:string; child:string; relation:Relation }
type Draft = { atoms:Atom[]; bonds:Bond[] }
type View = { x:number;y:number;width:number;height:number }
type Drag = { id:string;pointer:number;sx:number;sy:number;before:Draft;moved:boolean }
type Pan = { pointer:number;startX:number;startY:number;before:View;moved:boolean }
type Snap = { parent:string;child:string;relation:Relation;dx:number;dy:number;distance:number }
const W=960,H=570,ASPECT=W/H, GAP=8, VERTICAL=12, SNAP_RADIUS=62, DROP_DISTANCE=66, TAP=9, DOUBLE_MS=350
const KEY='stax-free-molecules-v2'
const kinds:Kind[]=['circle','triangle','square','rectangle','diamond','hexagon','oval']
const width=(k:Kind)=>SYMBOLS[k].w*SCALE
const height=(k:Kind)=>SYMBOLS[k].h*SCALE
const empty=():Draft=>({atoms:[],bonds:[]})
const defaultView:View={x:0,y:0,width:W,height:H}
const byId=(d:Draft,id:string)=>d.atoms.find(a=>a.id===id)!
const supports=(k:Kind)=>k==='square'||k==='rectangle'
function load():Draft {
 try {
  const d=JSON.parse(localStorage.getItem(KEY)||'null') as Draft|null
  if(d&&Array.isArray(d.atoms)&&Array.isArray(d.bonds)&&d.atoms.length<=80&&d.atoms.every(a=>a&&typeof a.id==='string'&&kinds.includes(a.kind)&&Number.isFinite(a.x)&&Number.isFinite(a.y))&&d.bonds.every(b=>b&&['pair','support','sequence'].includes(b.relation)&&d.atoms.some(a=>a.id===b.parent)&&d.atoms.some(a=>a.id===b.child)))return d
 }catch{/* invalid or unavailable local storage */}
 return empty()
}
function molecule(d:Draft,id:string) {
 const ids=new Set<string>([id]);let change=true
 while(change){change=false;for(const b of d.bonds){
  if(ids.has(b.parent)&&!ids.has(b.child)){ids.add(b.child);change=true}
  if(ids.has(b.child)&&!ids.has(b.parent)){ids.add(b.parent);change=true}
 }}return ids
}
function descendants(d:Draft,id:string) {
 const ids=new Set<string>([id]),pending=[id]
 for(let i=0;i<pending.length;i++)for(const b of d.bonds)if(b.parent===pending[i]&&!ids.has(b.child)){ids.add(b.child);pending.push(b.child)}
 return ids
}
function translate(d:Draft,ids:Set<string>,dx:number,dy:number):Draft {
 return {...d,atoms:d.atoms.map(a=>ids.has(a.id)?{...a,x:a.x+dx,y:a.y+dy}:a)}
}
function box(d:Draft) {
 if(!d.atoms.length)return null
 return d.atoms.reduce((r,a)=>({l:Math.min(r.l,a.x),t:Math.min(r.t,a.y),r:Math.max(r.r,a.x+width(a.kind)),b:Math.max(r.b,a.y+height(a.kind))}),{l:Infinity,t:Infinity,r:-Infinity,b:-Infinity})
}
function fit(d:Draft):View {
 const b=box(d);if(!b)return defaultView
 const w=Math.max(300,Math.min(4000,Math.max(b.r-b.l+180,(b.b-b.t+180)*ASPECT))),h=w/ASPECT
 return {x:(b.l+b.r-w)/2,y:(b.t+b.b-h)/2,width:w,height:h}
}
function centre(d:Draft,v:View):View {
 const b=box(d);return b?{...v,x:(b.l+b.r-v.width)/2,y:(b.t+b.b-v.height)/2}:v
}
function zoom(v:View,factor:number):View {
 const w=Math.max(300,Math.min(4000,v.width*factor)),h=w/ASPECT
 return {x:v.x+(v.width-w)/2,y:v.y+(v.height-h)/2,width:w,height:h}
}
function linked(d:Draft,id:string,relation:Relation) {
 return d.bonds.some(b=>(b.parent===id||b.child===id)&&b.relation===relation)
}
function parentOfSupport(d:Draft,id:string){
 return d.bonds.find(b=>b.relation==='support'&&b.child===id)?.parent
}
function otherInPair(d:Draft,id:string){
 const pair=d.bonds.find(b=>b.relation==='pair'&&(b.parent===id||b.child===id))
 return pair?pair.parent===id?pair.child:pair.parent:null
}
function supportPosition(blue:Atom,support:Atom,d:Draft) {
 const otherId=otherInPair(d,support.id)
 const other=otherId?byId(d,otherId):null
 const cx=blue.x+width('circle')/2
 if(other){
  const left=cx-(width('square')+GAP+width('rectangle'))/2
  return {x:support.kind==='square'?left:left+width('square')+GAP,y:blue.y+height('circle')+VERTICAL}
 }
 const sibling=d.bonds.find(b=>b.relation==='support'&&b.parent===blue.id&&b.child!==support.id)
 if(sibling){
  const otherSupport=byId(d,sibling.child)
  if(support.kind==='rectangle'&&otherSupport.kind==='square')return{x:otherSupport.x+width('square')+GAP,y:otherSupport.y+(height('square')-height('rectangle'))/2}
  if(support.kind==='square'&&otherSupport.kind==='rectangle')return{x:otherSupport.x-width('square')-GAP,y:otherSupport.y-(height('square')-height('rectangle'))/2}
 }
 return {x:cx-width(support.kind),y:blue.y+height('circle')+VERTICAL}
}
/** Returns only plausible near-drop join geometry; does NOT move anything itself. */
function bestSnap(d:Draft,moving:Set<string>):Snap|null {
 let best:Snap|null=null
 const offered=(s:Snap)=>{if(s.distance<=SNAP_RADIUS&&(!best||s.distance<best.distance))best=s}
 for(const a of d.atoms) {
  if(!moving.has(a.id))continue
  for(const b of d.atoms) {
   if(moving.has(b.id))continue
   // Pink + purple can bond while freely floating, before either meets blue.
   if(supports(a.kind)&&supports(b.kind)&&a.kind!==b.kind&&!linked(d,a.id,'pair')&&!linked(d,b.id,'pair')&&!parentOfSupport(d,a.id)&&!parentOfSupport(d,b.id)){
    const parent=a.kind==='square'?a:b,child=a.kind==='rectangle'?a:b
    const target=a.kind==='square'?{x:b.x-width('square')-GAP,y:b.y-(height('square')-height('rectangle'))/2}:{x:b.x+width('square')+GAP,y:b.y+(height('square')-height('rectangle'))/2}
    // The moving atom's target is in world coordinates.
    const dx=target.x-a.x,dy=target.y-a.y
    offered({parent:parent.id,child:child.id,relation:'pair',dx,dy,distance:Math.hypot(dx,dy)})
   }
   // A support (or bonded pair) attaches under blue. Never attach it to a second blue.
   const blue=a.kind==='circle'?a:b.kind==='circle'?b:null
   const sup=supports(a.kind)?a:supports(b.kind)?b:null
   if(blue&&sup&&!parentOfSupport(d,sup.id)){
    const supGroup=molecule(d,sup.id)
    if(![...supGroup].some(id=>byId(d,id).kind==='circle')){
     const duplicate=d.bonds.some(edge=>edge.relation==='support'&&edge.parent===blue.id&&byId(d,edge.child).kind===sup.kind)
     if(!duplicate) {
      const desired=supportPosition(blue,sup,d)
      const dx=a.id===sup.id?desired.x-sup.x:sup.x-desired.x
      const dy=a.id===sup.id?desired.y-sup.y:sup.y-desired.y
      offered({parent:blue.id,child:sup.id,relation:'support',dx,dy,distance:Math.hypot(dx,dy)})
     }
    }
   }
   // Whole headed families connect by a horizontal or diagonal step.
   if((a.kind==='circle'||a.kind==='triangle')&&(b.kind==='circle'||b.kind==='triangle')&&!(a.kind==='triangle'&&b.kind==='triangle')){
    const left=a.x<=b.x?a:b,right=left.id===a.id?b:a
    const occupiedRight=d.bonds.some(z=>z.relation==='sequence'&&z.parent===left.id)
    const occupiedLeft=d.bonds.some(z=>z.relation==='sequence'&&z.child===right.id)
    if(!occupiedRight&&!occupiedLeft) {
     const diagonal=(left.kind==='triangle'||right.kind==='triangle')?65:0
     const desired={x:left.x+width(left.kind)+GAP*3,y:left.y+diagonal}
     // Only the moving component shifts; orientation is from spatial order.
     const delta=a.id===right.id?{x:desired.x-a.x,y:desired.y-a.y}:{x:b.x-width(a.kind)-GAP*3-a.x,y:b.y-diagonal-a.y}
     offered({parent:left.id,child:right.id,relation:'sequence',dx:delta.x,dy:delta.y,distance:Math.hypot(delta.x,delta.y)})
    }
   }
  }
 }
 return best
}
function spawn(d:Draft,kind:Kind,x:number,y:number):Draft {
 return {...d,atoms:[...d.atoms,{id:crypto.randomUUID(),kind,x,y}]}
}
export function MoleculeBoard(){
 const [doc,setDoc]=useState<Draft>(load)
 const [view,setView]=useState<View>(defaultView)
 const [history,setHistory]=useState<Draft[]>([])
 const [selected,setSelected]=useState<string|null>(null)
 const [hint,setHint]=useState('Drag any shape anywhere. Only compatible pieces brought close together will snap.')
 const [fall,setFall]=useState<Set<string>>(new Set())
 const svg=useRef<SVGSVGElement>(null),currentDoc=useRef(doc),currentView=useRef(view)
 const dragging=useRef<Drag|null>(null),panning=useRef<Pan|null>(null)
 const lastTap=useRef<{id:string;time:number}|null>(null)
 const fallTimer=useRef<ReturnType<typeof setTimeout>|null>(null)
 const paletteDrag=useRef<{kind:Kind;pointer:number;startX:number;startY:number}|null>(null)
 useEffect(()=>{try{localStorage.setItem(KEY,JSON.stringify(doc))}catch{/* local save unavailable */}},[doc])
 useEffect(()=>()=>{if(fallTimer.current)clearTimeout(fallTimer.current)},[])
 function update(d:Draft){currentDoc.current=d;setDoc(d)}
 function save(d:Draft,prev=currentDoc.current){setHistory(v=>[...v,prev].slice(-40));update(d)}
 function setCamera(v:View){currentView.current=v;setView(v)}
 function pointer(e:ReactPointerEvent<SVGSVGElement|SVGGElement>){
  const matrix=svg.current?.getScreenCTM();if(!matrix)return {x:0,y:0}
  const pt=svg.current!.createSVGPoint();pt.x=e.clientX;pt.y=e.clientY
  return pt.matrixTransform(matrix.inverse())
 }
 function fromClient(x:number,y:number){
  const matrix=svg.current?.getScreenCTM();if(!matrix)return null
  const pt=svg.current!.createSVGPoint();pt.x=x;pt.y=y
  return pt.matrixTransform(matrix.inverse())
 }
 function onShapeDown(e:ReactPointerEvent<SVGGElement>,id:string){
  if(e.pointerType==='mouse'&&e.button!==0)return
  e.stopPropagation();const p=pointer(e)
  if(fallTimer.current)clearTimeout(fallTimer.current)
  setFall(new Set())
  dragging.current={id,pointer:e.pointerId,sx:p.x,sy:p.y,before:currentDoc.current,moved:false}
  e.currentTarget.setPointerCapture(e.pointerId)
  setSelected(id)
 }
 function onShapeMove(e:ReactPointerEvent<SVGGElement>){
  const d=dragging.current;if(!d||d.pointer!==e.pointerId)return
  const pt=pointer(e),dx=pt.x-d.sx,dy=pt.y-d.sy
  if(Math.hypot(dx,dy)>TAP)d.moved=true
  if(d.moved)update(translate(d.before,molecule(d.before,d.id),dx,dy))
  e.stopPropagation()
 }
 function releaseShape(e:ReactPointerEvent<SVGGElement>){
  const d=dragging.current;if(!d||d.pointer!==e.pointerId)return
  dragging.current=null;e.stopPropagation()
  if(!d.moved){
   const t=Date.now()
   if(lastTap.current?.id===d.id&&t-lastTap.current.time<DOUBLE_MS){
    lastTap.current=null
    const old=currentDoc.current,ids=descendants(old,d.id)
    if(!old.bonds.some(b=>ids.has(b.parent)!==ids.has(b.child))){setHint('No parent to detach. Drag this free molecule.');return}
    const stripped={...old,bonds:old.bonds.filter(b=>ids.has(b.parent)===ids.has(b.child))}
    const moved=translate(stripped,ids,0,DROP_DISTANCE)
    if(fallTimer.current)clearTimeout(fallTimer.current)
    setFall(new Set(ids));save(moved,old)
    fallTimer.current=setTimeout(()=>setFall(new Set()),300)
    setHint('Branch dropped with its descendants; the rest stayed where it was.')
   }else lastTap.current={id:d.id,time:t}
   return
  }
  lastTap.current=null
  const actual=currentDoc.current,moving=molecule(actual,d.id),snap=bestSnap(actual,moving)
  if(snap){
   const adjusted=translate(actual,moving,snap.dx,snap.dy)
   save({...adjusted,bonds:[...adjusted.bonds,{parent:snap.parent,child:snap.child,relation:snap.relation}]},d.before)
   setHint('Magnetic snap! Connected pieces now drag together. Double-tap a child to drop its branch.')
  }else{
   setHistory(h=>[...h,d.before].slice(-40))
   setHint('Free placement. The shape stays exactly where you released it.')
  }
 }
 function downBackground(e:ReactPointerEvent<SVGSVGElement>){
  if(e.target!==e.currentTarget&&!(e.target as Element).hasAttribute('data-board-background'))return
  if(e.pointerType==='mouse'&&e.button!==0)return
  panning.current={pointer:e.pointerId,startX:e.clientX,startY:e.clientY,before:currentView.current,moved:false}
  e.currentTarget.setPointerCapture(e.pointerId)
  setSelected(null)
 }
 function moveBackground(e:ReactPointerEvent<SVGSVGElement>){
  const p=panning.current;if(!p||p.pointer!==e.pointerId)return
  const start=p.before,deltaX=(e.clientX-p.startX)*start.width/(svg.current?.getBoundingClientRect().width||1)
  const deltaY=(e.clientY-p.startY)*start.height/(svg.current?.getBoundingClientRect().height||1)
  if(Math.hypot(e.clientX-p.startX,e.clientY-p.startY)>4)p.moved=true
  if(p.moved)setCamera({...start,x:start.x-deltaX,y:start.y-deltaY})
 }
 function upBackground(e:ReactPointerEvent<SVGSVGElement>){if(panning.current?.pointer===e.pointerId)panning.current=null}
 function addAt(kind:Kind,client?:{x:number;y:number}){
  if(currentDoc.current.atoms.length>=80){setHint('Maximum 80 shapes in this experiment.');return}
  const p=client?fromClient(client.x,client.y):null
  const camera=currentView.current
  let x=(p?.x??camera.x+camera.width/2)-width(kind)/2
  let y=(p?.y??camera.y+camera.height/2)-height(kind)/2
  // Palette taps find an empty parking spot, but never connect or move existing pieces.
  if(!p){
   const occupied=(xx:number,yy:number)=>currentDoc.current.atoms.some(a=>xx<a.x+width(a.kind)+14&&xx+width(kind)+14>a.x&&yy<a.y+height(a.kind)+14&&yy+height(kind)+14>a.y)
   const step=Math.max(width(kind),height(kind))+24
   for(let n=0;n<30&&occupied(x,y);n++){
    const ring=Math.floor(n/8)+1,dir=n%8
    const xx=x+Math.cos(dir*Math.PI/4)*step*ring,yy=y+Math.sin(dir*Math.PI/4)*step*ring
    if(!occupied(xx,yy)){x=xx;y=yy;break}
   }
  }
  save(spawn(currentDoc.current,kind,x,y));setHint('New shape is FREE. Drag it around; it will only snap when close to a matching attachment.')
 }
 function paletteDown(e:ReactPointerEvent<HTMLButtonElement>,kind:Kind){
  if(e.pointerType==='mouse'&&e.button!==0)return
  paletteDrag.current={kind,pointer:e.pointerId,startX:e.clientX,startY:e.clientY}
  e.currentTarget.setPointerCapture(e.pointerId)
 }
 function paletteUp(e:ReactPointerEvent<HTMLButtonElement>){
  const p=paletteDrag.current;if(!p||p.pointer!==e.pointerId)return
  paletteDrag.current=null
  const moved=Math.hypot(e.clientX-p.startX,e.clientY-p.startY)>10
  addAt(p.kind,moved?{x:e.clientX,y:e.clientY}:undefined)
 }
 function undo(){const prev=history.at(-1);if(prev){update(prev);setHistory(v=>v.slice(0,-1));setHint('Undone.')}}
 function remove(){if(!selected)return;save({atoms:doc.atoms.filter(a=>a.id!==selected),bonds:doc.bonds.filter(b=>b.parent!==selected&&b.child!==selected)});setSelected(null)}
 return <div className="stax-molecule-ui">
  <div className="stax-molecule-tools"><strong>Free magnetic workspace</strong><span>Move independently · snap only near compatible pieces</span>
   <div className="stax-molecule-buttons"><button onClick={undo} disabled={!history.length}>Undo</button><button onClick={remove} disabled={!selected}>Remove</button><button onClick={()=>{save(empty());setSelected(null)}}>Clear</button></div>
  </div>
  <div className="stax-molecule-view-controls"><button onClick={()=>setCamera(centre(currentDoc.current,currentView.current))}>Center</button><button onClick={()=>setCamera(fit(currentDoc.current))}>Fit all</button><button aria-label="Zoom out" onClick={()=>setCamera(zoom(currentView.current,1.25))}>−</button><span>{Math.round(100*W/view.width)}%</span><button aria-label="Zoom in" onClick={()=>setCamera(zoom(currentView.current,.8))}>+</button></div>
  <div className="stax-molecule-canvas">
   <svg ref={svg} viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} aria-label="STAX freely movable magnetic workspace" onPointerDown={downBackground} onPointerMove={moveBackground} onPointerUp={upBackground} onPointerCancel={upBackground}>
    <rect data-board-background="true" x={view.x} y={view.y} width={view.width} height={view.height} fill="#faf9f6"/>
    {doc.atoms.map(a=><g key={a.id} transform={`translate(${a.x} ${a.y})`} data-kind={a.kind} data-id={a.id} className={fall.has(a.id)?'stax-molecule-dropping':undefined}
      onPointerDown={e=>onShapeDown(e,a.id)} onPointerMove={onShapeMove} onPointerUp={releaseShape} onPointerCancel={()=>{dragging.current=null}} style={{touchAction:'none',cursor:'grab'}}>
      {selected===a.id&&<rect x="-7" y="-7" width={width(a.kind)+14} height={height(a.kind)+14} rx="5" fill="none" stroke="#7b8795" strokeDasharray="4 5" pointerEvents="none"/>}
      <Glyph kind={a.kind} w={width(a.kind)} h={height(a.kind)} fill={SYMBOLS[a.kind].color+'14'} stroke={SYMBOLS[a.kind].color} strokeWidth={3}/>
    </g>)}
   </svg>
   {!doc.atoms.length&&<p className="stax-molecule-empty">Tap a shape below, or drag one into the workspace.</p>}
  </div>
  <div className="stax-molecule-palette">{kinds.map(kind=><button key={kind} title={SYMBOLS[kind].role} aria-label={`Add ${SYMBOLS[kind].label}`}
   onPointerDown={e=>paletteDown(e,kind)} onPointerUp={paletteUp} onPointerCancel={()=>{paletteDrag.current=null}}>
   <svg viewBox={`-4 -4 ${width(kind)+8} ${height(kind)+8}`} aria-hidden="true"><Glyph kind={kind} w={width(kind)} h={height(kind)} stroke={SYMBOLS[kind].color} fill={SYMBOLS[kind].color+'14'} strokeWidth={3}/></svg>
  </button>)}</div>
  <p className="stax-molecule-hint" role="status">{hint}</p>
  <p className="stax-molecule-note">Each new shape starts loose, wherever placed. Drag the background to pan. Nearby compatible shapes snap on release; remote shapes never move. Double-tap a child to detach and drop its branch. Saved locally. Only known pink/purple/blue and blue/red relationships are provisionally magnetic.</p>
 </div>
}
