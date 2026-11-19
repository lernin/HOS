import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Glyph, SCALE } from './SymbolCanvas'
import { SYMBOLS, type Kind } from './model'
import './molecule-board.css'

/**
 * Free-form STAX assembly. No grid, global autolayout, or implicit attachment on creation.
 * Bonds are the ONLY source of molecule membership. Coordinates are always world-space.
 */
type Atom = { id:string; kind:Kind; x:number; y:number; word?:string; variant?:'small'|'large' }
type Relation = 'pair'|'support'|'sequence'
type Bond = { parent:string; child:string; relation:Relation }
type Draft = { atoms:Atom[]; bonds:Bond[] }
type View = { x:number;y:number;width:number;height:number }
type Drag = { id:string;pointer:number;sx:number;sy:number;before:Draft;moved:boolean;fingerLift:number }
type Pan = { pointer:number;startX:number;startY:number;before:View;moved:boolean }
type TouchPoint = {x:number;y:number}
type Pinch = {pointers:[number,number];startDistance:number;startView:View;anchor:{x:number;y:number}}
type Snap = { parent:string;child:string;relation:Relation;dx:number;dy:number;distance:number }
type PaletteHover = { kind:Kind;variant?:'small'|'large';screenX:number;screenY:number;worldX:number;worldY:number;snap:Snap|null }
// Distances from the STAX Blueprint's .07-unit design grid; only snap geometry is quantised.
const UNIT=SCALE*.07, GAP=4*UNIT, VERTICAL=4*UNIT, BLUE_RED_GAP=7*UNIT, RED_BLUE_GAP=29*UNIT
const W=960,H=570,ASPECT=W/H, SNAP_RADIUS=76, DROP_DISTANCE=66, TAP=9, DOUBLE_MS=350, FINGER_LIFT=42
const KEY='stax-free-molecules-v2'
const kinds:Kind[]=['circle','triangle','square','rectangle','diamond','hexagon','oval']
type Choice={kind:Kind;variant?:'small'|'large';label:string}
const choices:Choice[]=[{kind:'circle',label:'Noun'},{kind:'triangle',label:'Verb'},{kind:'square',label:'Preposition'},{kind:'rectangle',label:'Determiner'},{kind:'diamond',label:'Conjunction'},{kind:'hexagon',variant:'large',label:'Orange · large'},{kind:'hexagon',variant:'small',label:'Orange · small'},{kind:'oval',variant:'large',label:'Green · complement'},{kind:'oval',variant:'small',label:'Green · modifier'}]
const width=(k:Kind)=>SYMBOLS[k].w*SCALE
const height=(k:Kind)=>SYMBOLS[k].h*SCALE
const variantFactor=(kind:Kind,variant?:Atom['variant'])=>variant==='small'&&(kind==='oval'||kind==='hexagon')?(kind==='oval'?.86:.9):1
const atomWidth=(a:Atom)=>width(a.kind)*variantFactor(a.kind,a.variant)
const atomHeight=(a:Atom)=>height(a.kind)*variantFactor(a.kind,a.variant)
const empty=():Draft=>({atoms:[],bonds:[]})
const defaultView:View={x:0,y:0,width:W,height:H}
const byId=(d:Draft,id:string)=>d.atoms.find(a=>a.id===id)!
const supports=(k:Kind)=>k==='square'||k==='rectangle'
function load():Draft {
 try {
  const d=JSON.parse(localStorage.getItem(KEY)||'null') as Draft|null
  if(d&&Array.isArray(d.atoms)&&Array.isArray(d.bonds)&&d.atoms.length<=80&&d.atoms.every(a=>a&&typeof a.id==='string'&&kinds.includes(a.kind)&&Number.isFinite(a.x)&&Number.isFinite(a.y)&&(a.variant===undefined||a.variant==='small'||a.variant==='large')&&(a.word===undefined||(typeof a.word==='string'&&a.word.length<=36)))&&d.bonds.every(b=>b&&['pair','support','sequence'].includes(b.relation)&&d.atoms.some(a=>a.id===b.parent)&&d.atoms.some(a=>a.id===b.child)))return d
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
 return d.atoms.reduce((r,a)=>({l:Math.min(r.l,a.x),t:Math.min(r.t,a.y),r:Math.max(r.r,a.x+atomWidth(a)),b:Math.max(r.b,a.y+atomHeight(a))}),{l:Infinity,t:Infinity,r:-Infinity,b:-Infinity})
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
/** Reposition only a blue head's immediate supporters. Sequence heads are NEVER reflowed. */
function alignSupporters(doc:Draft,blueId:string):Draft {
 const blue=byId(doc,blueId),supportIds=new Set(doc.bonds.filter(b=>b.relation==='support'&&b.parent===blueId).map(b=>b.child))
 // A pink-purple pair may use only one support bond; recover its sibling.
 for(const id of [...supportIds]){const other=otherInPair(doc,id);if(other)supportIds.add(other)}
 const pink=[...supportIds].map(id=>byId(doc,id)).find(a=>a.kind==='square')
 const purple=[...supportIds].map(id=>byId(doc,id)).find(a=>a.kind==='rectangle')
 if(!pink&&!purple)return doc
 const both=!!pink&&!!purple,cx=blue.x+width('circle')/2
 const rowWidth=both?width('square')+GAP+width('rectangle'):width((pink||purple)!.kind)
 const startX=both?cx-rowWidth/2:cx-rowWidth
 const y=blue.y+height('circle')+VERTICAL
 const pinkPos=pink?{x:startX,y}:null
 const purplePos=purple?{x:both?startX+width('square')+GAP:startX,y:both?y+(height('square')-height('rectangle'))/2:y}:null
 return {...doc,atoms:doc.atoms.map(a=>a.id===pink?.id?{...a,...pinkPos}:a.id===purple?.id?{...a,...purplePos}:a)}
}
function supportPosition(blue:Atom,support:Atom,d:Draft) {
 const otherId=otherInPair(d,support.id)
 const other=otherId?byId(d,otherId):null
 const cx=blue.x+width('circle')/2
 if(other){
  const left=cx-(width('square')+GAP+width('rectangle'))/2
  return {x:support.kind==='square'?left:left+width('square')+GAP,y:blue.y+height('circle')+VERTICAL+(support.kind==='rectangle'?(height('square')-height('rectangle'))/2:0)}
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
   // Sequence ports accept noun ↔ conjunction in either order.
   // Yellow diamonds share the blue head's row; they are not noun supporters.
   const structural=a.kind==='circle'||a.kind==='triangle'
   const otherStructural=b.kind==='circle'||b.kind==='triangle'
   const blueYellow=(a.kind==='circle'&&b.kind==='diamond')||(a.kind==='diamond'&&b.kind==='circle')
   if(((structural&&otherStructural)&&!(a.kind==='triangle'&&b.kind==='triangle'))||blueYellow){
    const left=a.x<=b.x?a:b,right=left.id===a.id?b:a
    const occupiedRight=d.bonds.some(z=>z.relation==='sequence'&&z.parent===left.id)
    const occupiedLeft=d.bonds.some(z=>z.relation==='sequence'&&z.child===right.id)
    if(!occupiedRight&&!occupiedLeft) {
     // Conjunctions sit horizontally beside blue; blue/red retain their Blueprint staircase.
     const conjunction=left.kind==='diamond'||right.kind==='diamond'
     const diagonal=conjunction||left.kind===right.kind?0:height(left.kind)+(left.kind==='circle'?4:7)*UNIT
     const gap=conjunction?BLUE_RED_GAP:left.kind==='triangle'&&right.kind==='circle'?RED_BLUE_GAP:BLUE_RED_GAP
     const desired={x:left.x+width(left.kind)+gap,y:left.y+diagonal}
     // Only the moving component shifts; orientation is from spatial order.
     const delta=a.id===right.id?{x:desired.x-a.x,y:desired.y-a.y}:{x:b.x-width(a.kind)-gap-a.x,y:b.y-diagonal-a.y}
     offered({parent:left.id,child:right.id,relation:'sequence',dx:delta.x,dy:delta.y,distance:Math.hypot(delta.x,delta.y)})
    }
   }
  }
 }
 return best
}
/** STAX POS source grid codes are directional, not generic shape-to-shape bonds:
 * n = a NEW family follows (owner-confirmed); o is retained as a source code,
 * not presumed to mean a supporter. These representative entries are source values.
 */
const STAX_POS_SAMPLES = {
 'circle>rectangle':'n',
 'rectangle>circle':'o',
 'circle>diamond':'n',
 'diamond>circle':'n',
 'circle>triangle':'n',
 'triangle>circle':'n',
} as const
function newFamilyAfterBlue(d:Draft,moving:Set<string>):boolean {
 // A rectangle explicitly to the RIGHT of a blue captain at its head level
 // is starting a different family (the source circle→rectangle n rule).
 // Never magnetically pull it underneath the earlier noun.
 return d.atoms.some(a=>moving.has(a.id)&&a.kind==='rectangle'&&
   d.atoms.some(b=>!moving.has(b.id)&&b.kind==='circle'&&
     a.x>=b.x+atomWidth(b)*.7&&a.y>=b.y-atomHeight(b)*.4&&a.y<=b.y+atomHeight(b)*.7))
}
/**
 * Reconstructs an editable *illustrative* molecule scene from the exact
 * sentence on STAX Blueprint slide 13 (Level 21). Source slide does not
 * encode the lexical identity of every colored shape, so assignments of
 * individual word roles and bond orientations below are proposals.
 */
function quest21():Draft {
 type Spec=[id:string,kind:Kind,word:string,x:number,y:number,variant?:Atom['variant']]
 const specs:Spec[]=[
  ['she','circle','She',65,55],['aux','hexagon',"'s",220,420,'large'],
  ['buy','triangle','buying',223,205],['a','rectangle','a',580,635],
  ['present','circle','present',522,365],
  ['for','square','for',748,875],['herfriend','rectangle','her',824,880],
  ['best','oval','best',940,880,'small'],['friend','circle','friend',814,720],
  ['because','diamond','because',967,369],
  ['herbirthday','rectangle','her',1170,645],
  ['birthday','circle','birthday',1190,371],
  ['is','triangle','is',1425,555],
  ['tomorrow','hexagon','tomorrow',1628,766,'small'],
 ]
 const atoms=specs.map(([id,kind,word,x,y,variant]):Atom=>({id:'q21-'+id,kind,word,x,y,variant}))
 const bond=(parent:string,child:string,relation:Relation):Bond=>({parent:'q21-'+parent,child:'q21-'+child,relation})
 const bonds:Bond[]=[
  bond('she','buy','sequence'),bond('buy','present','sequence'),
  bond('present','because','sequence'),bond('because','birthday','sequence'),
  bond('birthday','is','sequence'),
  bond('buy','aux','support'),bond('present','a','support'),
  bond('present','friend','support'),
  bond('friend','for','support'),bond('friend','herfriend','support'),bond('friend','best','support'),
  bond('birthday','herbirthday','support'),bond('is','tomorrow','support')
 ]
 return {atoms,bonds}
}
export function MoleculeBoard(){
 const [doc,setDoc]=useState<Draft>(load)
 const [view,setView]=useState<View>(defaultView)
 const [history,setHistory]=useState<Draft[]>([])
 const [questActive,setQuestActive]=useState(false)
 const [selected,setSelected]=useState<string|null>(null)
 const [hint,setHint]=useState('Drag any shape anywhere. Only compatible pieces brought close together will snap.')
 const [fall,setFall]=useState<Set<string>>(new Set())
 const [preview,setPreview]=useState<Snap|null>(null)
 const [paletteHover,setPaletteHover]=useState<PaletteHover|null>(null)
 const svg=useRef<SVGSVGElement>(null),currentDoc=useRef(doc),currentView=useRef(view)
 const dragging=useRef<Drag|null>(null),panning=useRef<Pan|null>(null)
 const lastTap=useRef<{id:string;time:number}|null>(null)
 const fallTimer=useRef<ReturnType<typeof setTimeout>|null>(null)
 const paletteDrag=useRef<{kind:Kind;variant?:'small'|'large';pointer:number;startX:number;startY:number}|null>(null)
 const activeTouches=useRef<Map<number,TouchPoint>>(new Map())
 const pinch=useRef<Pinch|null>(null)
 const blockRelease=useRef<Set<number>>(new Set())
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
 // Root capture handlers track all touches, including those beginning directly on a shape.
 // A second touch cancels drag and starts a camera-only pinch. Model coordinates never scale.
 function downTouch(e:ReactPointerEvent<SVGSVGElement>){
  if(e.pointerType!=='touch')return
  activeTouches.current.set(e.pointerId,{x:e.clientX,y:e.clientY})
  blockRelease.current.delete(e.pointerId)
  if(activeTouches.current.size!==2)return
  const ids=[...activeTouches.current.keys()] as [number,number]
  const a=activeTouches.current.get(ids[0])!,b=activeTouches.current.get(ids[1])!
  if(dragging.current){update(dragging.current.before);dragging.current=null;setPreview(null)}
  panning.current=null;lastTap.current=null
  blockRelease.current.add(ids[0]);blockRelease.current.add(ids[1])
  const midX=(a.x+b.x)/2,midY=(a.y+b.y)/2
  const world=fromClient(midX,midY)
  if(!world)return
  pinch.current={pointers:ids,startDistance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),startView:currentView.current,anchor:world}
  setHint('Pinch to zoom. Shapes keep their positions and connections.')
 }
 function moveTouch(e:ReactPointerEvent<SVGSVGElement>){
  if(e.pointerType!=='touch'||!activeTouches.current.has(e.pointerId))return
  activeTouches.current.set(e.pointerId,{x:e.clientX,y:e.clientY})
  const p=pinch.current;if(!p)return
  const a=activeTouches.current.get(p.pointers[0]),b=activeTouches.current.get(p.pointers[1])
  if(!a||!b)return
  const distance=Math.max(1,Math.hypot(a.x-b.x,a.y-b.y))
  const w=Math.max(300,Math.min(4000,p.startView.width*p.startDistance/distance)),h=w/ASPECT
  const midX=(a.x+b.x)/2,midY=(a.y+b.y)/2
  const rect=svg.current?.getBoundingClientRect()
  if(!rect||!rect.width||!rect.height)return
  // Pinch midpoint anchors the same world-space point while fingers spread and move.
  const x=p.anchor.x-(midX-rect.left)*w/rect.width
  const y=p.anchor.y-(midY-rect.top)*h/rect.height
  setCamera({x,y,width:w,height:h})
 }
 function endTouch(e:ReactPointerEvent<SVGSVGElement>){
  if(e.pointerType!=='touch')return
  activeTouches.current.delete(e.pointerId)
  if(pinch.current?.pointers.includes(e.pointerId)){
   pinch.current=null
   panning.current=null
  }
 }
 function onShapeDown(e:ReactPointerEvent<SVGGElement>,id:string){
  if(e.pointerType==='mouse'&&e.button!==0)return
  if(pinch.current)return
  e.stopPropagation();const p=pointer(e)
  if(fallTimer.current)clearTimeout(fallTimer.current)
  setFall(new Set())
  dragging.current={id,pointer:e.pointerId,sx:p.x,sy:p.y,before:currentDoc.current,moved:false,fingerLift:e.pointerType==='touch'?FINGER_LIFT:0}
  e.currentTarget.setPointerCapture(e.pointerId)
  setSelected(id)
 }
 function onShapeMove(e:ReactPointerEvent<SVGGElement>){
  if(pinch.current)return
  const d=dragging.current;if(!d||d.pointer!==e.pointerId)return
  const pt=pointer(e),dx=pt.x-d.sx,dy=pt.y-d.sy
  if(Math.hypot(dx,dy)>TAP)d.moved=true
  if(d.moved){
   const raised=d.fingerLift?fromClient(e.clientX,e.clientY-d.fingerLift):null
   const finger=d.fingerLift?fromClient(e.clientX,e.clientY):null
   const lift=raised&&finger?raised.y-finger.y:0
   const proposed=translate(d.before,molecule(d.before,d.id),dx,dy+lift)
   update(proposed)
   setPreview(bestSnap(proposed,molecule(proposed,d.id)))
  }
  e.stopPropagation()
 }
 function releaseShape(e:ReactPointerEvent<SVGGElement>){
  if(blockRelease.current.has(e.pointerId)){blockRelease.current.delete(e.pointerId);dragging.current=null;setPreview(null);return}
  const d=dragging.current;if(!d||d.pointer!==e.pointerId)return
  dragging.current=null;setPreview(null);e.stopPropagation()
  if(!d.moved){
   const t=Date.now()
   if(lastTap.current?.id===d.id&&t-lastTap.current.time<DOUBLE_MS){
    lastTap.current=null
    const old=currentDoc.current,ids=descendants(old,d.id)
    // Root molecules and standalone atoms also fall; only external parent bonds detach.
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
  const actual=currentDoc.current,moving=molecule(actual,d.id)
  // POS-grid n indicates a follower begins another family. A rectangle to the
  // right of blue stays loose instead of being misread as its subordinate.
  const snap=newFamilyAfterBlue(actual,moving)?null:bestSnap(actual,moving)
  if(snap){
   const adjusted=translate(actual,moving,snap.dx,snap.dy)
   const bonded={...adjusted,bonds:[...adjusted.bonds,{parent:snap.parent,child:snap.child,relation:snap.relation}]}
   // Adding a determiner/preposition to a sequence is a local supporter layout change,
   // not a change to any of the red/blue sequence coordinates.
   const result=snap.relation==='support'?alignSupporters(bonded,snap.parent):bonded
   save(result,d.before)
   setHint(snap.relation==='support'?'Support attached beneath its blue head. The red/blue sequence stayed intact.':'Magnetic snap! Connected pieces now move together.')
  }else{
   setHistory(h=>[...h,d.before].slice(-40))
   setHint(newFamilyAfterBlue(actual,moving)?'New family: circle → rectangle is marked n in STAX POS. It stays loose until attached appropriately.':'Free placement. The shape stays exactly where you released it.')
  }
 }
 function downBackground(e:ReactPointerEvent<SVGSVGElement>){
  if(pinch.current)return
  if(e.target!==e.currentTarget&&!(e.target as Element).hasAttribute('data-board-background'))return
  if(e.pointerType==='mouse'&&e.button!==0)return
  panning.current={pointer:e.pointerId,startX:e.clientX,startY:e.clientY,before:currentView.current,moved:false}
  e.currentTarget.setPointerCapture(e.pointerId)
  setSelected(null)
 }
 function moveBackground(e:ReactPointerEvent<SVGSVGElement>){
  if(pinch.current)return
  const p=panning.current;if(!p||p.pointer!==e.pointerId)return
  const start=p.before,deltaX=(e.clientX-p.startX)*start.width/(svg.current?.getBoundingClientRect().width||1)
  const deltaY=(e.clientY-p.startY)*start.height/(svg.current?.getBoundingClientRect().height||1)
  if(Math.hypot(e.clientX-p.startX,e.clientY-p.startY)>4)p.moved=true
  if(p.moved)setCamera({...start,x:start.x-deltaX,y:start.y-deltaY})
 }
 function upBackground(e:ReactPointerEvent<SVGSVGElement>){if(panning.current?.pointer===e.pointerId)panning.current=null}
 function addAt(kind:Kind,client?:{x:number;y:number},variant?:Atom['variant']){
  if(currentDoc.current.atoms.length>=80){setHint('Maximum 80 shapes in this experiment.');return}
  const p=client?fromClient(client.x,client.y):null,camera=currentView.current
  let x=(p?.x??camera.x+camera.width/2)-width(kind)*variantFactor(kind,variant)/2
  let y=(p?.y??camera.y+camera.height/2)-height(kind)*variantFactor(kind,variant)/2
  if(!client){
   // Palette taps park freely in a vacant spot; no hidden attachment.
   const occupied=(xx:number,yy:number)=>currentDoc.current.atoms.some(a=>xx<a.x+width(a.kind)+14&&xx+width(kind)+14>a.x&&yy<a.y+height(a.kind)+14&&yy+height(kind)+14>a.y)
   const step=Math.max(width(kind),height(kind))+24
   for(let n=0;n<30&&occupied(x,y);n++){
    const ring=Math.floor(n/8)+1,dir=n%8
    const xx=x+Math.cos(dir*Math.PI/4)*step*ring,yy=y+Math.sin(dir*Math.PI/4)*step*ring
    if(!occupied(xx,yy)){x=xx;y=yy;break}
   }
  }
  const previous=currentDoc.current,id=crypto.randomUUID()
  const next:Draft={...previous,atoms:[...previous.atoms,{id,kind,x,y,variant}]}
  // A deliberate palette DRAG can join on release, while a TAP remains loose.
  const snap=client&&!newFamilyAfterBlue(next,new Set([id]))?bestSnap(next,new Set([id])):null
  if(snap){
   const adjusted=translate(next,new Set([id]),snap.dx,snap.dy)
   const joined={...adjusted,bonds:[...adjusted.bonds,{parent:snap.parent,child:snap.child,relation:snap.relation}]}
   save(snap.relation==='support'?alignSupporters(joined,snap.parent):joined,previous)
   setHint('Magnet connected: this shape is now part of the molecule.')
  }else{
   save(next,previous)
   setHint('Placed freely. The shape stays there until you move it.')
  }
 }
 function palettePosition(kind:Kind,clientX:number,clientY:number,variant?:Atom['variant']):PaletteHover {
  const screenX=clientX,screenY=clientY-FINGER_LIFT
  const rect=svg.current?.getBoundingClientRect()
  const inside=!!rect&&screenX>=rect.left&&screenX<=rect.right&&screenY>=rect.top&&screenY<=rect.bottom
  const p=inside?fromClient(screenX,screenY):null
  const worldX=(p?.x??0)-width(kind)*variantFactor(kind,variant)/2,worldY=(p?.y??0)-height(kind)*variantFactor(kind,variant)/2
  let snap:Snap|null=null
  if(p&&currentDoc.current.atoms.length<80){
   const ghost:Atom={id:'__palette_preview__',kind,x:worldX,y:worldY,variant}
   const trial={...currentDoc.current,atoms:[...currentDoc.current.atoms,ghost]}
   snap=newFamilyAfterBlue(trial,new Set([ghost.id]))?null:bestSnap(trial,new Set([ghost.id]))
  }
  return {kind,variant,screenX,screenY,worldX,worldY,snap}
 }
 function paletteDown(e:ReactPointerEvent<HTMLButtonElement>,kind:Kind,variant?:Atom['variant']){
  if(e.pointerType==='mouse'&&e.button!==0)return
  paletteDrag.current={kind,variant,pointer:e.pointerId,startX:e.clientX,startY:e.clientY}
  e.currentTarget.setPointerCapture(e.pointerId)
  setPaletteHover(palettePosition(kind,e.clientX,e.clientY,variant))
 }
 function paletteMove(e:ReactPointerEvent<HTMLButtonElement>){
  const p=paletteDrag.current;if(!p||p.pointer!==e.pointerId)return
  setPaletteHover(palettePosition(p.kind,e.clientX,e.clientY,p.variant))
 }
 function paletteUp(e:ReactPointerEvent<HTMLButtonElement>){
  const p=paletteDrag.current;if(!p||p.pointer!==e.pointerId)return
  paletteDrag.current=null;setPaletteHover(null)
  const moved=Math.hypot(e.clientX-p.startX,e.clientY-p.startY)>10
  const liftedY=e.clientY-FINGER_LIFT,rect=svg.current?.getBoundingClientRect()
  const inside=!!rect&&e.clientX>=rect.left&&e.clientX<=rect.right&&liftedY>=rect.top&&liftedY<=rect.bottom
  if(moved&&!inside){setHint('Drop the lifted shape inside the workspace.');return}
  addAt(p.kind,moved?{x:e.clientX,y:liftedY}:undefined,p.variant)
 }
 function paletteCancel(){paletteDrag.current=null;setPaletteHover(null)}
  function loadQuest(){
  const next=quest21();save(next);setCamera(fit(next));setSelected(null);setQuestActive(true)
  setHint('Blueprint Level 21 loaded as a movable demonstration. Word roles are provisional; all shapes and bonds remain editable.')
 }
 function undo(){const prev=history.at(-1);if(prev){update(prev);setHistory(v=>v.slice(0,-1));setHint('Undone.')}}
 function remove(){if(!selected)return;save({atoms:doc.atoms.filter(a=>a.id!==selected),bonds:doc.bonds.filter(b=>b.parent!==selected&&b.child!==selected)});setSelected(null)}
 return <div className="stax-molecule-ui">
  <div className="stax-molecule-tools"><strong>Free magnetic workspace</strong><span>Move independently · snap only near compatible pieces</span>
   <div className="stax-molecule-buttons"><button onClick={loadQuest} title="Load the 14-shape Level 21 source sentence" >Load Quest 21</button><button onClick={undo} disabled={!history.length}>Undo</button><button onClick={remove} disabled={!selected}>Remove</button><button onClick={()=>{save(empty());setSelected(null);setQuestActive(false)}}>Clear</button></div>
  </div>
  {questActive&&<p className="stax-molecule-example">STAX QUEST · Level 21 — She’s buying a present for her best friend because her birthday is tomorrow. <small>Illustrative mapping; original slide does not label each shape with its individual word.</small></p>}
  <div className="stax-molecule-view-controls"><button onClick={()=>setCamera(centre(currentDoc.current,currentView.current))}>Center</button><button onClick={()=>setCamera(fit(currentDoc.current))}>Fit all</button><button aria-label="Zoom out" onClick={()=>setCamera(zoom(currentView.current,1.25))}>−</button><span>{Math.round(100*W/view.width)}%</span><button aria-label="Zoom in" onClick={()=>setCamera(zoom(currentView.current,.8))}>+</button></div>
  <div className="stax-molecule-canvas">
   <svg ref={svg} viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} aria-label="STAX freely movable magnetic workspace" onPointerDownCapture={downTouch} onPointerMoveCapture={moveTouch} onPointerUpCapture={endTouch} onPointerCancelCapture={endTouch} onPointerDown={downBackground} onPointerMove={moveBackground} onPointerUp={upBackground} onPointerCancel={upBackground}>
    <rect data-board-background="true" x={view.x} y={view.y} width={view.width} height={view.height} fill="#faf9f6"/>
    {paletteHover?.snap&&<g className="stax-resonance-ghost" aria-hidden="true" pointerEvents="none">
      <g transform={`translate(${paletteHover.worldX+paletteHover.snap.dx} ${paletteHover.worldY+paletteHover.snap.dy})`}>
       <Glyph kind={paletteHover.kind} w={width(paletteHover.kind)*variantFactor(paletteHover.kind,paletteHover.variant)} h={height(paletteHover.kind)*variantFactor(paletteHover.kind,paletteHover.variant)} fill="none" stroke="#13af8b" strokeWidth={4} strokeDasharray="8 5"/>
      </g>
     </g>}
    {preview&&<g className="stax-resonance-ghost" aria-hidden="true" pointerEvents="none">
      {doc.atoms.filter(a=>dragging.current&&molecule(doc,dragging.current.id).has(a.id)).map(a=><g key={a.id} transform={`translate(${a.x+preview.dx} ${a.y+preview.dy})`}>
       <Glyph kind={a.kind} w={atomWidth(a)} h={atomHeight(a)} fill="none" stroke="#2ca39a" strokeDasharray="8 5" strokeWidth={3}/>
      </g>)}
     </g>}
    {doc.atoms.map(a=><g key={a.id} transform={`translate(${a.x} ${a.y})`} data-kind={a.kind} data-id={a.id} className={[
       fall.has(a.id)?'stax-molecule-dropping':'',
       (paletteHover?.snap&&(paletteHover.snap.parent===a.id||paletteHover.snap.child===a.id))||
       (preview&&dragging.current&&!molecule(doc,dragging.current.id).has(a.id)&&(preview.parent===a.id||preview.child===a.id))?'stax-resonant-target':''
      ].filter(Boolean).join(' ')}
      onPointerDown={e=>onShapeDown(e,a.id)} onPointerMove={onShapeMove} onPointerUp={releaseShape} onPointerCancel={()=>{dragging.current=null}} style={{touchAction:'none',cursor:'grab'}}>
      {selected===a.id&&<rect x="-7" y="-7" width={atomWidth(a)+14} height={atomHeight(a)+14} rx="5" fill="none" stroke="#7b8795" strokeDasharray="4 5" pointerEvents="none"/>}
      <Glyph kind={a.kind} w={atomWidth(a)} h={atomHeight(a)} fill={SYMBOLS[a.kind].color+'14'} stroke={SYMBOLS[a.kind].color} strokeWidth={3}/>
      {a.word&&<text x={atomWidth(a)/2} y={atomHeight(a)/2+5} fontSize={Math.min(18,Math.max(11,atomWidth(a)/Math.max(a.word.length,3)*1.4))} fill="#253c55" fontWeight="600" textAnchor="middle" pointerEvents="none">{a.word}</text>}
    </g>)}
   </svg>
   {!doc.atoms.length&&<p className="stax-molecule-empty">Tap a shape below, or drag one into the workspace.</p>}
  </div>
  <div className="stax-molecule-palette">{choices.map(({kind,variant,label})=><button key={`${kind}-${variant||'default'}`} title={label} aria-label={`Add ${label}`}
   onPointerDown={e=>paletteDown(e,kind,variant)} onPointerMove={paletteMove} onPointerUp={paletteUp} onPointerCancel={paletteCancel}>
   <svg viewBox={`-4 -4 ${width(kind)*variantFactor(kind,variant)+8} ${height(kind)*variantFactor(kind,variant)+8}`} aria-hidden="true"><Glyph kind={kind} w={width(kind)*variantFactor(kind,variant)} h={height(kind)*variantFactor(kind,variant)} stroke={SYMBOLS[kind].color} fill={SYMBOLS[kind].color+'14'} strokeWidth={3}/></svg>
  </button>)}</div>
  {paletteHover&&<div className={`stax-lifted-ghost${paletteHover.snap?' is-eligible':''}`} style={{left:paletteHover.screenX,top:paletteHover.screenY}} aria-hidden="true">
    <svg width={Math.max(40,Math.min(130,width(paletteHover.kind)*variantFactor(paletteHover.kind,paletteHover.variant)*(svg.current?.getBoundingClientRect().width||960)/view.width))}
      height={Math.max(28,Math.min(130,height(paletteHover.kind)*variantFactor(paletteHover.kind,paletteHover.variant)*(svg.current?.getBoundingClientRect().width||960)/view.width))}
      viewBox={`0 0 ${width(paletteHover.kind)*variantFactor(paletteHover.kind,paletteHover.variant)} ${height(paletteHover.kind)*variantFactor(paletteHover.kind,paletteHover.variant)}`}>
     <Glyph kind={paletteHover.kind} w={width(paletteHover.kind)*variantFactor(paletteHover.kind,paletteHover.variant)} h={height(paletteHover.kind)*variantFactor(paletteHover.kind,paletteHover.variant)}
       fill={SYMBOLS[paletteHover.kind].color+'18'} stroke={paletteHover.snap?'#12a981':SYMBOLS[paletteHover.kind].color} strokeWidth={4}/>
    </svg>
   </div>}
  <p className="stax-molecule-hint" role="status">{hint}</p>
  <p className="stax-molecule-note">Shapes lift above your finger during touch-drag; eligible magnets glow. Each new shape starts loose, wherever placed. One finger moves atoms or pans; pinch with two fingers to zoom. Drag the background to pan. Nearby compatible shapes snap on release; remote shapes never move. Double-tap a child to detach and drop its branch. Saved locally. Pink/purple support blue; blue/yellow connect horizontally in either order; red/blue keep the staircase.</p>
 </div>
}
