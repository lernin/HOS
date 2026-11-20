import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Glyph, SCALE } from './SymbolCanvas'
import { SYMBOLS, type Kind } from './model'
import { STAX_SPACING, positionChildren, horizontalFollower, positionRedRightNestedOrange, requiredFamilyFollowerShift, type FamilyChild } from './geometry'
import { canAttachOrangeUnderObjectBlue, canAttachAdverbUnderPreposition, canExtendSupportChain, canFollowBlueOrange, canNestPossessive, eligibleOrangeTierSlot, orangeRootedInRed, largestAssembledFamily, normalizeBlueSiblingOrder, rootedSupportChain, supportChildOfKind, withRedCompanion } from './family-links'
import { STAX_THEMES, nextStaxTheme, staxBoardColor, staxOmissionDash, staxThemeName, type StaxTheme } from './view-modes'
import { StaxMaterialDefs, StaxMaterialEffect, hasStaxMaterial, materialFill, materialStroke } from './materials'
import { LetterzGoldenPollenCanvas } from './letterz-golden-pollen'
import { PearlescentGlass } from './pearlescent-atlas'
import { PearlescentAirglass } from './pearlescent-airglass'
import { FoamChip } from './foam-chips'
import './molecule-board.css'

/**
 * Free-form STAX assembly. No grid, global autolayout, or implicit attachment on creation.
 * Bonds are the ONLY source of molecule membership. Coordinates are always world-space.
 */
type Atom = { id:string; kind:Kind; x:number; y:number; word?:string; variant?:'small'|'large'; omitted?:boolean }
type Relation = 'pair'|'support'|'sequence'
type Bond = { parent:string; child:string; relation:Relation }
type Draft = { atoms:Atom[]; bonds:Bond[] }
type View = { x:number;y:number;width:number;height:number }
type Drag = { id:string;pointer:number;sx:number;sy:number;before:Draft;moved:boolean;fingerLift:number }
type Pan = { pointer:number;startX:number;startY:number;before:View;moved:boolean }
type TouchPoint = {x:number;y:number}
type Pinch = {pointers:[number,number];startDistance:number;startView:View;anchor:{x:number;y:number}}
type Snap = { parent:string;child:string;relation:Relation;dx:number;dy:number;distance:number;insertBefore?:string }
type PaletteHover = { kind:Kind;variant?:'small'|'large';screenX:number;screenY:number;worldX:number;worldY:number;snap:Snap|null }
// Distances from the STAX Blueprint's .07-unit design grid; only snap geometry is quantised.
const UNIT=SCALE*STAX_SPACING.unit
const GAP=SCALE*STAX_SPACING.attachment, VERTICAL=SCALE*STAX_SPACING.attachment
const BLUE_RED_GAP=SCALE*STAX_SPACING.group, RED_BLUE_GAP=SCALE*STAX_SPACING.row
const CONNECTOR_GAP=SCALE*STAX_SPACING.connector
const W=960,H=570,ASPECT=W/H, SNAP_RADIUS=76, DROP_DISTANCE=124, TAP=9, DOUBLE_MS=350, FINGER_LIFT=42
const KEY='stax-free-molecules-v2', THEME_KEY='stax-molecule-theme-v1'
const kinds:Kind[]=['circle','triangle','square','rectangle','diamond','hexagon','oval']
type Choice={kind:Kind;variant?:'small'|'large';label:string}
const choices:Choice[]=[{kind:'circle',label:'Noun / pronoun'},{kind:'triangle',label:'Verb'},{kind:'square',label:'Preposition'},{kind:'rectangle',label:'Determiner'},{kind:'diamond',label:'Conjunction'},{kind:'hexagon',label:'Orange'},{kind:'oval',label:'Green'}]
const width=(k:Kind)=>SYMBOLS[k].w*SCALE
const height=(k:Kind)=>SYMBOLS[k].h*SCALE
/** Small Blueprint variants use different x/y ratios, not uniform scaling. */
const variantWidthFactor=(kind:Kind,variant?:Atom['variant'])=>variant==='small'
 ?kind==='oval'?0.4056/0.4716:kind==='hexagon'?3787.2/4147.2:1:1
const variantHeightFactor=(kind:Kind,variant?:Atom['variant'])=>variant==='small'
 ?kind==='oval'?0.2196/0.258:kind==='hexagon'?2332.8/2340.864:1:1
const atomWidth=(a:Atom)=>width(a.kind)*variantWidthFactor(a.kind,a.variant)
const atomHeight=(a:Atom)=>height(a.kind)*variantHeightFactor(a.kind,a.variant)
const empty=():Draft=>({atoms:[],bonds:[]})
const defaultView:View={x:0,y:0,width:W,height:H}
const byId=(d:Draft,id:string)=>d.atoms.find(a=>a.id===id)!
const supports=(k:Kind)=>k==='square'||k==='rectangle'
const nounSupport=(a:Atom)=>supports(a.kind)||a.kind==='oval'
/**
 * Explicit geometrical ports. The original STAX POS sheet is directional
 * succession data, NOT a magnet topology table: n = new family, o unresolved.
 * Implement only under-head and sequence relationships with known coordinates.
 * A red triangle may take an orange adverb/gate below it; this support port is
 * distinct from red -> orange in reading order.
 */
const MAGNET_PORTS = {
 blueSupport:['square','rectangle','oval','hexagon'],
 redBelow:['hexagon'],
 peerPair:['square','rectangle'],
 blueYellow:['circle','diamond'],
 complementAfter:['circle','triangle'],
} as const
const SMALL_GREEN_X=0.4056/0.4716,SMALL_GREEN_Y=0.2196/0.258
const SMALL_ORANGE_X=3787.2/4147.2,SMALL_ORANGE_Y=2332.8/2340.864
/** Global single-child under-port: child's RIGHT edge meets parent's midpoint. */
const underSingleX=(parentX:number,parentWidth:number,childWidth:number)=>parentX+parentWidth/2-childWidth

const smallWidth=(kind:Kind)=>width(kind)*(kind==='oval'?SMALL_GREEN_X:kind==='hexagon'?SMALL_ORANGE_X:1)
/** Orange pair directly under red is large; additional orange tiers trigger
 * the Blueprint compact form for that connected red-rooted orange family. */
function redOrangeFamilySize(d:Draft,redId:string):number{
 const seen=new Set<string>(),pending=[redId]
 for(let i=0;i<pending.length;i++)for(const edge of d.bonds){
  if(edge.relation!=='support'||edge.parent!==pending[i]||seen.has(edge.child))continue
  const child=byId(d,edge.child)
  if(child?.kind!=='hexagon')continue
  seen.add(child.id);pending.push(child.id)
 }
 return seen.size
}
function orangeRedRoot(d:Draft,orangeId:string):string|undefined{
 const seen=new Set<string>();let current=orangeId
 while(!seen.has(current)){
  seen.add(current)
  const parentId=parentOfSupport(d,current)
  if(!parentId)return undefined
  const parent=byId(d,parentId)
  if(parent?.kind==='triangle')return parentId
  if(parent?.kind!=='hexagon')return undefined
  current=parentId
 }
 return undefined
}
function orangeChildren(doc:Draft,redId:string){
 return doc.bonds.filter(b=>b.relation==='support'&&b.parent===redId).map(b=>byId(doc,b.child)).filter(a=>a.kind==='hexagon')
}
function redOrangePosition(red:Atom,doc:Draft){
 const existing=orangeChildren(doc,red.id)
 const compact=redOrangeFamilySize(doc,red.id)>2
 const childW=compact?smallWidth('hexagon'):width('hexagon')
 const childH=compact?height('hexagon')*SMALL_ORANGE_Y:height('hexagon')
 const items:FamilyChild[]=[
  ...existing.map(a=>({id:a.id,width:childW,height:childH})),
  {id:'__incoming_orange',width:childW,height:childH},
 ]
 return positionChildren(
  {x:red.x,y:red.y,width:width('triangle'),height:height('triangle')},
  items,{gap:GAP,belowGap:VERTICAL}
 ).get('__incoming_orange')!
}
function alignRedSupporters(doc:Draft,redId:string):Draft {
 const red=byId(doc,redId),orange=orangeChildren(doc,redId)
 if(!red||orange.length<1)return doc
 const positions=positionChildren(
  {x:red.x,y:red.y,width:width('triangle'),height:height('triangle')},
  orange.map(a=>({id:a.id,width:atomWidth(a),height:atomHeight(a)})),
  {gap:GAP,belowGap:VERTICAL}
 )
 let next=doc
 for(const child of orange){
  const a=byId(next,child.id),target=positions.get(child.id)!
  next=translate(next,descendants(next,a.id),target.x-a.x,target.y-a.y)
 }
 // Red's paired oranges can each own descendants and additional bridge tiers.
 for(const child of orange)next=alignOrangeTierChildren(next,child.id)
 return next
}
/** Visual size follows its current structural position, not the palette choice. */
function contextualVariant(d:Draft,a:Atom):Atom['variant'] {
 if(a.kind!=='oval'&&a.kind!=='hexagon')return undefined
 const owner=d.bonds.find(b=>b.relation==='support'&&b.child===a.id)
 if(a.kind==='oval')return owner&&byId(d,owner.parent)?.kind==='circle'?'small':'large'
 // The two oranges directly below red are large; once a third orange
 // joins the red-rooted tier, all its oranges adopt the compact form.
 const redRoot=orangeRedRoot(d,a.id)
 if(redRoot)return redOrangeFamilySize(d,redRoot)>2?'small':'large'
 const previous=d.bonds.find(b=>b.relation==='sequence'&&b.child===a.id)
 return (owner&&['circle','oval','hexagon'].includes(byId(d,owner.parent)?.kind))||(previous&&byId(d,previous.parent)?.kind==='triangle')?'small':'large'
}
function normalizeRoles(d:Draft):Draft {
 return {...d,atoms:d.atoms.map(a=>a.kind==='oval'||a.kind==='hexagon'?{...a,variant:contextualVariant(d,a)}:a)}
}
function load():Draft {
 try {
  const d=JSON.parse(localStorage.getItem(KEY)||'null') as Draft|null
  if(d&&Array.isArray(d.atoms)&&Array.isArray(d.bonds)&&d.atoms.length<=80&&d.atoms.every(a=>a&&typeof a.id==='string'&&kinds.includes(a.kind)&&Number.isFinite(a.x)&&Number.isFinite(a.y)&&(a.variant===undefined||a.variant==='small'||a.variant==='large')&&(a.word===undefined||(typeof a.word==='string'&&a.word.length<=36))&&(a.omitted===undefined||typeof a.omitted==='boolean'))&&d.bonds.every(b=>b&&['pair','support','sequence'].includes(b.relation)&&d.atoms.some(a=>a.id===b.parent)&&d.atoms.some(a=>a.id===b.child)))return d
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
/** A sentence FAMILY is a head and everything attached through support/pair,
 * excluding ordered sequence followers. Never measure just the head polygon:
 * a rectangle or adverb can project outside it in either direction. */
function supportFootprint(d:Draft,headId:string):{x:number;y:number;width:number;height:number}[]{
 const ids=new Set<string>([headId]),queue=[headId]
 for(let i=0;i<queue.length;i++)for(const edge of d.bonds){
  const candidate=edge.relation==='support'&&edge.parent===queue[i]?edge.child:
   edge.relation==='pair'&&edge.parent===queue[i]?edge.child:
   edge.relation==='pair'&&edge.child===queue[i]?edge.parent:null
  if(candidate&&!ids.has(candidate)){ids.add(candidate);queue.push(candidate)}
 }
 return [...ids].map(id=>byId(d,id)).filter(Boolean).map(a=>({
  x:a.x,y:a.y,width:atomWidth(a),height:atomHeight(a)
 }))
}
/** The source distinguishes head-to-head row spacing (2.03), staircase
 * transitions (.49), and connector spacing (.98). Same-blue family heads use
 * 2.03, never the .49 staircase rule. */
function sequenceHeadGap(left:Atom,right:Atom):number {
 if(left.kind==='diamond'||right.kind==='diamond')return CONNECTOR_GAP
 if(left.kind==='circle'&&right.kind==='triangle')return BLUE_RED_GAP
 if(left.kind==='triangle'&&right.kind==='circle')return RED_BLUE_GAP
 return RED_BLUE_GAP
}
/** Expand following family branches to honor both the head port and the
 * silhouettes of children at intersecting heights. Never change supporter
 * geometry or the relative coordinates within a family. */
function alignSequenceFamilyClearance(doc:Draft):Draft {
 let next=doc
 const edges=doc.bonds.filter(b=>b.relation==='sequence')
 for(let pass=0;pass<edges.length;pass++){
  let changed=false
  for(const edge of edges){
   const left=byId(next,edge.parent),right=byId(next,edge.child)
   if(!left||!right)continue
   const a=supportFootprint(next,left.id),b=supportFootprint(next,right.id)
   const shift=requiredFamilyFollowerShift(
    {x:left.x,y:left.y,width:atomWidth(left),height:atomHeight(left)},
    {x:right.x,y:right.y,width:atomWidth(right),height:atomHeight(right)},
    a,b,sequenceHeadGap(left,right),CONNECTOR_GAP)
   if(shift>.01){
    next=translate(next,descendants(next,right.id),shift,0)
    changed=true
   }
  }
  if(!changed)break
 }
 return next
}
function box(d:Draft) {
 if(!d.atoms.length)return null
 return d.atoms.reduce((r,a)=>({l:Math.min(r.l,a.x),t:Math.min(r.t,a.y),r:Math.max(r.r,a.x+atomWidth(a)),b:Math.max(r.b,a.y+atomHeight(a))}),{l:Infinity,t:Infinity,r:-Infinity,b:-Infinity})
}
function fit(d:Draft,aspect=ASPECT):View {
 const b=box(d);if(!b)return defaultView
 const w=Math.max(300,Math.min(4000,Math.max(b.r-b.l+180,(b.b-b.t+180)*aspect))),h=w/aspect
 return {x:(b.l+b.r-w)/2,y:(b.t+b.b-h)/2,width:w,height:h}
}
function centre(d:Draft,v:View):View {
 const b=box(d);return b?{...v,x:(b.l+b.r-v.width)/2,y:(b.t+b.b-v.height)/2}:v
}
function zoom(v:View,factor:number):View {
 const w=Math.max(300,Math.min(4000,v.width*factor)),h=w*(v.height/v.width)
 return {x:v.x+(v.width-w)/2,y:v.y+(v.height-h)/2,width:w,height:h}
}
function parentOfSupport(d:Draft,id:string){
 return d.bonds.find(b=>b.relation==='support'&&b.child===id)?.parent
}
function otherInPair(d:Draft,id:string){
 const pair=d.bonds.find(b=>b.relation==='pair'&&(b.parent===id||b.child===id))
 return pair?pair.parent===id?pair.child:pair.parent:null
}
/** Reposition only a blue head's immediate supporters. Sequence heads are NEVER reflowed. */
/**
 * A blue noun/pronoun owns one horizontal supporter row. Members retain their
 * actual attachment order. This lets orange precede pink, purple, or green.
 * A paired support can still travel with its partner; every member is optional.
 */
const BLUE_SUPPORT_KINDS:Kind[]=['square','rectangle','oval','hexagon']
function blueSupportAtoms(doc:Draft,blueId:string):Atom[] {
 const ids=new Set(doc.bonds.filter(b=>b.relation==='support'&&b.parent===blueId).map(b=>b.child))
 for(const id of [...ids]){const other=otherInPair(doc,id);if(other)ids.add(other)}
 return normalizeBlueSiblingOrder([...ids].map(id=>byId(doc,id)).filter(a=>BLUE_SUPPORT_KINDS.includes(a.kind)))
}
function blueHeadOfAdjective(doc:Draft,greenId:string):string|undefined {
 const parent=parentOfSupport(doc,greenId)
 return parent&&byId(doc,parent)?.kind==='circle'?parent:undefined
}
function greenSiblings(doc:Draft,blueId:string):Atom[] {
 return blueSupportAtoms(doc,blueId).filter(a=>a.kind==='oval')
}
function eligibleAdverbHost(doc:Draft,greenId:string):boolean {
 const blueId=blueHeadOfAdjective(doc,greenId)
 if(!blueId)return false
 // A single green modifier such as "big" can parent an orange ("very").
 // The preceding determiner and any other adjectives are NOT the adverb's parent.
 return !doc.bonds.some(b=>b.parent===greenId&&b.relation==='support'&&byId(doc,b.child).kind==='hexagon')
}
/** Descendant orange chains can project left of a green modifier.
 * Compute their structural extent from the source-derived single-child rule.
 * A chain changes family bounds, never the word-order predecessor bond.
 */
function nestedFamilyLeftExtent(doc:Draft,rootId:string,rootWidth:number):number {
 let currentId=rootId,parentWidth=rootWidth,offset=0,leftmost=0
 const seen=new Set<string>()
 while(!seen.has(currentId)){
  seen.add(currentId)
  const current=byId(doc,currentId)
  // Purple supports purple; green and orange support orange.
  const childKind=current.kind==='rectangle'?'rectangle':'hexagon'
  const childId=supportChildOfKind(doc,currentId,childKind)
  if(!childId)break
  const child=byId(doc,childId)
  const childWidth=child.kind==='hexagon'?smallWidth('hexagon'):atomWidth(child)
  offset+=parentWidth/2-childWidth
  leftmost=Math.min(leftmost,offset)
  currentId=childId
  parentWidth=childWidth
 }
 return leftmost
}
/** Direct noun supporters stay side by side; nested adverbs are NEVER row members. */
function blueSupportPositions(doc:Draft,blueId:string):Map<string,{x:number;y:number}> {
 const blue=byId(doc,blueId),items=blueSupportAtoms(doc,blueId)
 if(!blue||!items.length)return new Map()
 const specs:FamilyChild[]=items.map(a=>{
  const w=a.kind==='oval'?smallWidth('oval'):a.kind==='hexagon'?smallWidth('hexagon'):width(a.kind)
  const h=a.kind==='oval'?height('oval')*SMALL_GREEN_Y:a.kind==='hexagon'?height('hexagon')*SMALL_ORANGE_Y:height(a.kind)
  // Consider descendants when centering a ROW of sibling families. An adverb
  // under a green adjective extends left of the green's own silhouette.
  // This is a structural extent, not an arbitrary on-screen drag position.
  const nestedLeft=a.kind==='oval'||a.kind==='rectangle'?nestedFamilyLeftExtent(doc,a.id,w):0
  return {id:a.id,width:w,height:h,extentLeft:nestedLeft,extentRight:w}
 })
 return positionChildren({x:blue.x,y:blue.y,width:width('circle'),height:height('circle')},
  specs,{gap:GAP,belowGap:VERTICAL})
}
/** A child's right edge meets its parent centerline, with the Blueprint
 * .28 vertical gap; valid for orange and purple nested families alike.
 */
function redRightChildPosition(parent:Atom) {
 return positionRedRightNestedOrange(
  {x:parent.x,y:parent.y,width:atomWidth(parent),height:atomHeight(parent)},
  {width:smallWidth('hexagon'),height:height('hexagon')*SMALL_ORANGE_Y},
  VERTICAL
 )
}
function nestedChildPosition(parent:Atom,child:Atom) {
 const childWidth=child.kind==='hexagon'?smallWidth('hexagon'):atomWidth(child)
 const childHeight=child.kind==='hexagon'?height('hexagon')*SMALL_ORANGE_Y:atomHeight(child)
 // Repeating adverb chains use the purple-style right-edge-to-midline anchor.
 // A RIGHT orange within a paired tier is the exception: centered below.
 return positionChildren(
  {x:parent.x,y:parent.y,width:atomWidth(parent),height:atomHeight(parent)},
  [{id:child.id,width:childWidth,height:childHeight}],
  {gap:GAP,belowGap:VERTICAL}
 ).get(child.id)!
}
/** Red-rooted families can have pairs under left orange and modifier chains
 * under right orange. Descendant subtrees move rigidly on every reflow. */
function alignOrangeTierChildren(doc:Draft,parentId:string,seen=new Set<string>()):Draft {
 if(seen.has(parentId))return doc
 seen.add(parentId)
 const parent=byId(doc,parentId),children=orangeChildren(doc,parentId)
 if(!parent||!children.length||children.length>2)return doc
 const smallW=smallWidth('hexagon'),smallH=height('hexagon')*SMALL_ORANGE_Y
 const parentBox={x:parent.x,y:parent.y,width:atomWidth(parent),height:atomHeight(parent)}
 const ownerId=parentOfSupport(doc,parentId)
 const siblings=ownerId?orangeChildren(doc,ownerId):[]
 const rightOfPair=siblings.length===2&&siblings[1].id===parentId
 const positions:Map<string,{x:number;y:number}>=children.length===2
  ?positionChildren(parentBox,children.map(c=>({id:c.id,width:smallW,height:smallH})),{gap:GAP,belowGap:VERTICAL})
  :new Map([[children[0].id,rightOfPair?redRightChildPosition(parent):nestedChildPosition(parent,children[0])]])
 let next=doc
 for(const child of children){
  const current=byId(next,child.id),target=positions.get(child.id)!
  next=translate(next,descendants(next,child.id),target.x-current.x,target.y-current.y)
 }
 for(const child of children)next=alignOrangeTierChildren(next,child.id,seen)
 return next
}
function miniFamilyPosition(_doc:Draft,green:Atom,orange:Atom) {
 return nestedChildPosition(green,orange)
}
/** Reflow one recursive modifier/possessive chain at any depth. */
function alignNestedChain(doc:Draft,startId:string,childKind:'hexagon'|'rectangle'):Draft {
 let next=doc,parentId=startId
 const seen=new Set<string>()
 while(!seen.has(parentId)){
  seen.add(parentId)
  const childId=supportChildOfKind(next,parentId,childKind)
  if(!childId)break
  const parent=byId(next,parentId),child=byId(next,childId)
  const redId=parentOfSupport(next,parent.id)
  const red=redId?byId(next,redId):undefined
  const isRightRedOrange=childKind==='hexagon'&&red?.kind==='triangle'&&
   orangeChildren(next,red!.id).at(-1)?.id===parent.id
  const target=isRightRedOrange?redRightChildPosition(parent):nestedChildPosition(parent,child)
  next=translate(next,descendants(next,child.id),target.x-child.x,target.y-child.y)
  parentId=childId
 }
 return next
}
function alignSupporters(doc:Draft,blueId:string):Draft {
 const positions=blueSupportPositions(doc,blueId)
 let next=doc
 // Moving a parent carries its children rigidly, before precision-aligning them.
 for(const atom of blueSupportAtoms(doc,blueId)){
  const target=positions.get(atom.id)!
  const current=byId(next,atom.id)
  next=translate(next,descendants(next,atom.id),target.x-current.x,target.y-current.y)
 }
 // Reflow real descendants, never the word-order predecessor.
 for(const child of blueSupportAtoms(next,blueId)){
  if(child.kind==='oval')next=alignNestedChain(next,child.id,'hexagon')
  if(child.kind==='square')next=alignNestedChain(next,child.id,'hexagon')
  if(child.kind==='rectangle')next=alignNestedChain(next,child.id,'rectangle')
 }
 return next
}
/** Recompute attached families after a bond or member disappears.
 * The same Blueprint geometry runs on snap, detach, delete and broom cleanup.
 * Free shapes and detached branches keep their own world-space coordinates.
 */
function reflowAfterRemoval(d:Draft):Draft {
 let next=normalizeRoles(d)
 for(const red of next.atoms.filter(a=>a.kind==='triangle')){
  next=normalizeRoles(withRedCompanion(next,red.id,id=>({
   id,kind:'hexagon',x:red.x,y:red.y+atomHeight(red)+VERTICAL,variant:'small'
  })))
  next=alignRedSupporters(next,red.id)
 }
 for(const blue of next.atoms.filter(a=>a.kind==='circle'))next=alignSupporters(next,blue.id)
 return alignSequenceFamilyClearance(next)
}
function supportPosition(blue:Atom,support:Atom,d:Draft) {
 const proposed:Draft={...d,bonds:[...d.bonds,{parent:blue.id,child:support.id,relation:'support'}]}
 return blueSupportPositions(normalizeRoles(proposed),blue.id).get(support.id)!
}
/** The orange adverb is nested directly UNDER the second green sibling. */
function hoveringBelowGreen(doc:Draft,blueId:string,orange:Atom):boolean {
 return greenSiblings(doc,blueId).some(green=>{
  const x=underSingleX(green.x,atomWidth(green),smallWidth('hexagon'))
  const y=green.y+atomHeight(green)+VERTICAL
  return Math.hypot(orange.x-x,orange.y-y)<=SNAP_RADIUS
 })
}
/** A red may be inserted into an existing BLUE → BLUE sequence without
 * destroying either noun's support family. Only a free red is eligible.
 * Match the space BETWEEN the blue heads, rather than whichever blue is closest.
 */
function redBetweenBlues(d:Draft,moving:Set<string>):Snap|null {
 const red=d.atoms.find(a=>moving.has(a.id)&&a.kind==='triangle')
 if(!red||molecule(d,red.id).size!==1)return null
 let best:Snap|null=null
 for(const bond of d.bonds.filter(b=>b.relation==='sequence')){
  const left=byId(d,bond.parent),right=byId(d,bond.child)
  if(left?.kind!=='circle'||right?.kind!=='circle'||moving.has(left.id)||moving.has(right.id))continue
  if(right.x<=left.x)continue
  const gapCentre=(left.x+atomWidth(left)+right.x)/2
  const midY=(left.y+right.y)/2
  const centreX=red.x+atomWidth(red)/2,centreY=red.y+atomHeight(red)/2
  const dx=centreX-gapCentre,dy=centreY-midY
  // A generous gesture zone: forgive an imperfect finger position in both axes.
  if(Math.abs(dx)>SNAP_RADIUS+atomWidth(red)/2||
     Math.abs(dy)>SNAP_RADIUS+atomHeight(red)/2)continue
  const desiredX=left.x+atomWidth(left)+BLUE_RED_GAP
  const desiredY=left.y+atomHeight(left)+4*UNIT
  const score=Math.hypot(dx,dy)
  const candidate:Snap={parent:left.id,child:red.id,relation:'sequence',
   dx:desiredX-red.x,dy:desiredY-red.y,distance:score,insertBefore:right.id}
  if(!best||candidate.distance<best.distance)best=candidate
 }
 return best
}
/** Returns only plausible near-drop join geometry; does NOT move anything itself. */
function bestSnap(d:Draft,moving:Set<string>):Snap|null {
 let best:Snap|null=null
 const offered=(s:Snap)=>{if(s.distance<=SNAP_RADIUS&&(!best||s.distance<best.distance))best=s}
 for(const a of d.atoms) {
  if(!moving.has(a.id))continue
  for(const b of d.atoms) {
   if(moving.has(b.id))continue
   // Parent-first STAX: pink and purple are siblings under a BLUE noun.
   // Never create a self-contained pink-purple magnet before the blue parent.
   // A support (or bonded pair) attaches under blue. Never attach it to a second blue.
   const blue=a.kind==='circle'?a:b.kind==='circle'?b:null
   const sup=(nounSupport(a)||a.kind==='hexagon')?a:(nounSupport(b)||b.kind==='hexagon')?b:null
   if(blue&&sup&&MAGNET_PORTS.blueSupport.includes(sup.kind as 'square'|'rectangle'|'oval'|'hexagon')&&
    (sup.kind!=='hexagon'||canAttachOrangeUnderObjectBlue(d,blue.id))&&!parentOfSupport(d,sup.id)&&!(sup.kind==='hexagon'&&a.id===sup.id&&hoveringBelowGreen(d,blue.id,sup))){
    const supGroup=molecule(d,sup.id)
    if(![...supGroup].some(id=>byId(d,id).kind==='circle')){
     const already=blueSupportAtoms(d,blue.id)
     const attaching=[sup,...(otherInPair(d,sup.id)?[byId(d,otherInPair(d,sup.id)!)]:[])]
     const duplicate=attaching.some(part=>part.kind!=='oval'&&already.some(existing=>existing.kind===part.kind))
     if(!duplicate) {
      const desired=supportPosition(blue,sup,d)
      const dx=a.id===sup.id?desired.x-sup.x:sup.x-desired.x
      const dy=a.id===sup.id?desired.y-sup.y:sup.y-desired.y
      offered({parent:blue.id,child:sup.id,relation:'support',dx,dy,distance:Math.hypot(dx,dy)})
     }
    }
   }
   // Orange arriving beside a pink support inserts BEFORE pink on object blue.
   // It may instead nest BELOW pink if dropped onto that lower port.
   if(a.kind==='hexagon'&&b.kind==='square'&&!parentOfSupport(d,a.id)){
    const blueId=parentOfSupport(d,b.id)
    if(blueId&&canAttachOrangeUnderObjectBlue(d,blueId)&&
      !blueSupportAtoms(d,blueId).some(child=>child.kind==='hexagon')){
     const target=supportPosition(byId(d,blueId),a,d)
     const alongsideX=b.x-atomWidth(a)-GAP
     const alongsideY=b.y+(atomHeight(b)-atomHeight(a))/2
     const proximity=Math.min(
      Math.hypot(target.x-a.x,target.y-a.y),
      Math.hypot(alongsideX-a.x,alongsideY-a.y))
     offered({parent:blueId,child:a.id,relation:'support',
      dx:target.x-a.x,dy:target.y-a.y,distance:proximity})
    }
   }
   // Follow an existing orange attached directly beneath BLUE with a pink,
   // purple or green sibling. The orange does not become that shape's parent.
   // This port deliberately NEVER applies to orange underneath RED.
   if(a.kind==='square'||a.kind==='rectangle'||a.kind==='oval'){
    const blueId=canFollowBlueOrange(d,a.id,b.id)
    if(blueId&&!molecule(d,a.id).has(b.id)){
     const blue=byId(d,blueId)
     const desired=supportPosition(blue,a,d)
     // The candidate may be presented beside the existing orange BEFORE
     // its row reflows. Permit either that handoff or the precise final port.
     const alongsideX=b.x+atomWidth(b)+GAP
     const alongsideY=b.y+(atomHeight(b)-atomHeight(a))/2
     const proximity=Math.min(
      Math.hypot(desired.x-a.x,desired.y-a.y),
      Math.hypot(alongsideX-a.x,alongsideY-a.y))
     offered({parent:blue.id,child:a.id,relation:'support',
      dx:desired.x-a.x,dy:desired.y-a.y,distance:proximity})
    }
   }
   // Purple possessives nest beneath purple rooted in blue:
   // my -> mom's -> friend's -> dog. This is structural parentage.
   if(a.kind==='rectangle'&&b.kind==='rectangle'&&
      canNestPossessive(d,a.id,b.id)&&!molecule(d,a.id).has(b.id)){
    const target=nestedChildPosition(b,a)
    offered({parent:b.id,child:a.id,relation:'support',
     dx:target.x-a.x,dy:target.y-a.y,
     distance:Math.hypot(target.x-a.x,target.y-a.y)})
   }
   // Purple arriving beside GREEN inserts before it, regardless of when
   // green was first attached to the blue family.
   if(a.kind==='rectangle'&&b.kind==='oval'&&!parentOfSupport(d,a.id)){
    const blueId=blueHeadOfAdjective(d,b.id)
    if(blueId&&!blueSupportAtoms(d,blueId).some(x=>x.kind==='rectangle')){
     const target=supportPosition(byId(d,blueId),a,d)
     const y=b.y+(atomHeight(b)-atomHeight(a))/2
     const nearGreen=Math.min(
      Math.hypot(a.x-(b.x-atomWidth(a)-GAP),a.y-y),
      Math.hypot(a.x-(b.x+atomWidth(b)+GAP),a.y-y))
     offered({parent:blueId,child:a.id,relation:'support',
      dx:target.x-a.x,dy:target.y-a.y,
      distance:Math.min(nearGreen,Math.hypot(target.x-a.x,target.y-a.y))})
    }
   }
   // New-family n: orange attaches below its REAL green adjective parent.
   // It never bonds to the purple determiner just because it precedes orange.
   const green=a.kind==='oval'?a:b.kind==='oval'?b:null
   const nestedOrange=a.kind==='hexagon'?a:b.kind==='hexagon'?b:null
   if(green&&nestedOrange&&a.id===nestedOrange.id&&!parentOfSupport(d,nestedOrange.id)&&eligibleAdverbHost(d,green.id)){
    const dropZone={x:underSingleX(green.x,atomWidth(green),smallWidth('hexagon')),
     y:green.y+atomHeight(green)+VERTICAL}
    const proximity=Math.hypot(nestedOrange.x-dropZone.x,nestedOrange.y-dropZone.y)
    if(proximity<=SNAP_RADIUS){
     const target=miniFamilyPosition(d,green,nestedOrange)
     offered({parent:green.id,child:nestedOrange.id,relation:'support',
      dx:target.x-nestedOrange.x,dy:target.y-nestedOrange.y,distance:proximity})
    }
   }
   // An adverb can modify a preposition ("always on the TV"),
   // without falsely becoming the blue noun's direct "not" child.
   if(a.kind==='hexagon'&&b.kind==='square'&&!parentOfSupport(d,a.id)&&
      canAttachAdverbUnderPreposition(d,b.id)&&!molecule(d,a.id).has(b.id)){
    const target=nestedChildPosition(b,a)
    offered({parent:b.id,child:a.id,relation:'support',
     dx:target.x-a.x,dy:target.y-a.y,
     distance:Math.hypot(target.x-a.x,target.y-a.y)})
   }
   // Recursive modifier: an orange may modify an orange which ultimately
   // belongs to a GREEN adjective under a BLUE noun/pronoun. Other orange
   // identities (gate, bridge, negation) remain free until real roles are known.
   if(a.kind==='hexagon'&&b.kind==='hexagon'&&!parentOfSupport(d,a.id)&&
      canExtendSupportChain(d,b.id,'hexagon','oval','circle')&&!molecule(d,a.id).has(b.id)){
    const target=nestedChildPosition(b,a)
    offered({parent:b.id,child:a.id,relation:'support',
     dx:target.x-a.x,dy:target.y-a.y,
     distance:Math.hypot(target.x-a.x,target.y-a.y)})
   }
   // Repeated orange tiers are structural: the left orange may open another
   // pair; the right orange accepts one lower modifier. No swaps.
   if(a.kind==='hexagon'&&b.kind==='hexagon'&&!molecule(d,a.id).has(b.id)){
    const slot=eligibleOrangeTierSlot(d,a.id,b.id)
    if(slot){
     const smallW=smallWidth('hexagon'),smallH=height('hexagon')*SMALL_ORANGE_Y
     const target=slot==='left-pair'?positionChildren(
       {x:b.x,y:b.y,width:atomWidth(b),height:atomHeight(b)},
       [{id:a.id,width:smallW,height:smallH},{id:'__future_pair',width:smallW,height:smallH}],
       {gap:GAP,belowGap:VERTICAL}).get(a.id)!:
      slot==='right-modifier'?redRightChildPosition(b):nestedChildPosition(b,a)
     offered({parent:b.id,child:a.id,relation:'support',
      dx:target.x-a.x,dy:target.y-a.y,distance:Math.hypot(target.x-a.x,target.y-a.y)})
    }
   }
   // Orange is an under-verb supporter on the Blueprint; allow either
   // dragging orange to a stationary red or moving a free red to orange.
   const red=a.kind==='triangle'?a:b.kind==='triangle'?b:null
   const orange=a.kind==='hexagon'?a:b.kind==='hexagon'?b:null
   if(red&&orange&&MAGNET_PORTS.redBelow.includes('hexagon')&&!parentOfSupport(d,orange.id)){
    const orangeGroup=molecule(d,orange.id)
    const occupied=orangeChildren(d,red.id).length
    // Blueprint Quest 21 shows two orange shapes beneath a red verb.
    if(!orangeGroup.has(red.id)&&occupied<2){
     const destination=redOrangePosition(red,d)
     // One canonical world-space anchor drives eligibility, glow and release.
     const dx=a.id===orange.id?destination.x-orange.x:orange.x-(destination.x-red.x)-red.x
     const dy=a.id===orange.id?destination.y-orange.y:orange.y-height('triangle')-VERTICAL-red.y
     offered({parent:red.id,child:orange.id,relation:'support',dx,dy,distance:Math.hypot(dx,dy)})
    }
   }
   // A large green complement can follow a red linking verb ("I am happy").
   // Unlike little green adjectives under blue, this is a following sequence.
   // Blueprint: 2.03 horizontal spacing, .49 vertical drop from red bottom.\n   // Both directions allow the *moving* atom to be placed on an existing partner.
   if(a.kind==='oval'&&b.kind==='triangle'&&!parentOfSupport(d,a.id)&&
      !molecule(d,a.id).has(b.id)&&
      !d.bonds.some(z=>z.relation==='sequence'&&(z.parent===b.id||z.child===a.id))){
     const target={x:b.x+atomWidth(b)+RED_BLUE_GAP,
      y:b.y+atomHeight(b)+BLUE_RED_GAP}
     offered({parent:b.id,child:a.id,relation:'sequence',
      dx:target.x-a.x,dy:target.y-a.y,
      distance:Math.hypot(target.x-a.x,target.y-a.y)})
   }
   if(a.kind==='triangle'&&b.kind==='oval'&&!parentOfSupport(d,b.id)&&
      !molecule(d,a.id).has(b.id)&&
      !d.bonds.some(z=>z.relation==='sequence'&&(z.parent===a.id||z.child===b.id))){
     const target={x:b.x-atomWidth(a)-RED_BLUE_GAP,
      y:b.y-atomHeight(a)-BLUE_RED_GAP}
     offered({parent:a.id,child:b.id,relation:'sequence',
      dx:target.x-a.x,dy:target.y-a.y,
      distance:Math.hypot(target.x-a.x,target.y-a.y)})
   }
   // Sequence ports accept noun ↔ conjunction in either order.
   // Yellow diamonds share the blue head's row; they are not noun supporters.
   const structural=a.kind==='circle'||a.kind==='triangle'
   const otherStructural=b.kind==='circle'||b.kind==='triangle'
   const blueYellow=(a.kind==='circle'&&b.kind==='diamond')||(a.kind==='diamond'&&b.kind==='circle')
   const left=a.x<=b.x?a:b,right=left.id===a.id?b:a
   // A green or orange changes visual role after attachment; no palette subtype.
   // A noun- or verb-adjacent green with an n-coded following relationship
   // must NOT become a predecessor bond; green connects to a known parent port.
   // An orange gate/adverb attaches only through its actual parent port,
   // not through a left-neighbor sequence bond.
   if(((structural&&otherStructural)&&!(a.kind==='triangle'&&b.kind==='triangle'))||blueYellow){
    const occupiedRight=d.bonds.some(z=>z.relation==='sequence'&&z.parent===left.id)
    const occupiedLeft=d.bonds.some(z=>z.relation==='sequence'&&z.child===right.id)
    if(!occupiedRight&&!occupiedLeft) {
     // Conjunctions sit horizontally beside blue; blue/red retain their Blueprint staircase.
     const conjunction=left.kind==='diamond'||right.kind==='diamond'
     const diagonal=conjunction||left.kind===right.kind?0:height(left.kind)+(left.kind==='circle'?4:7)*UNIT
     const gap=conjunction?CONNECTOR_GAP:left.kind==='triangle'&&right.kind==='circle'?RED_BLUE_GAP:BLUE_RED_GAP
     const horizontal=horizontalFollower(
      {x:left.x,y:left.y,width:width(left.kind),height:height(left.kind)},
      {width:width(right.kind),height:height(right.kind)},gap)
     const desired={x:horizontal.x,y:conjunction?horizontal.y:left.y+diagonal}
     // Only the moving component shifts; orientation is from spatial order.
     const delta=a.id===right.id?{x:desired.x-a.x,y:desired.y-a.y}:
      {x:b.x-width(a.kind)-gap-a.x,y:conjunction?b.y+(height(b.kind)-height(a.kind))/2-a.y:b.y-diagonal-a.y}
     offered({parent:left.id,child:right.id,relation:'sequence',dx:delta.x,dy:delta.y,distance:Math.hypot(delta.x,delta.y)})
    }
   }
  }
 }
 return best
}
/**
 * ONE resolver for all magnetic engagements. Used by both preview and release.
 * Relations are explicit: a support can bind under an already occupied sentence
 * head without consuming that head's sequence port.
 * A second under-red orange reflows its sibling locally; no head is relocated.
 */
function resolveMagnetBase(d:Draft,moving:Set<string>,snap:Snap):Draft {
 if(snap.insertBefore){
  const redMoved=translate(d,moving,snap.dx,snap.dy)
  const red=byId(redMoved,snap.child),right=byId(redMoved,snap.insertBefore)
  // The old blue successor (and its entire downstream molecule) becomes
  // the successor of red, preserving attached supporters and later sequence.
  const destinationX=red.x+atomWidth(red)+RED_BLUE_GAP
  const destinationY=red.y+atomHeight(red)+7*UNIT
  const repositioned=translate(redMoved,descendants(redMoved,right.id),
   destinationX-right.x,destinationY-right.y)
  return {...repositioned,bonds:[
   ...repositioned.bonds.filter(b=>!(b.relation==='sequence'&&b.parent===snap.parent&&b.child===snap.insertBefore)),
   {parent:snap.parent,child:snap.child,relation:'sequence'},
   {parent:snap.child,child:snap.insertBefore,relation:'sequence'}
  ]}
 }
 const translated=translate(d,moving,snap.dx,snap.dy)
 const host=byId(d,snap.parent)
 const slot=snap.relation==='support'&&host?.kind==='hexagon'&&byId(d,snap.child)?.kind==='hexagon'
  ?eligibleOrangeTierSlot(d,snap.child,snap.parent):null
 // Orange forms depend on the structure alone; do not silently reparent
 // or exchange any existing orange when a new piece attaches underneath.
 let joined:Draft={...translated,bonds:[
  ...translated.bonds,{parent:snap.parent,child:snap.child,relation:snap.relation}
 ]}
 if(slot==='left-pair'&&joined.atoms.length<80){
  const id='orange-companion-'+snap.child
  if(!joined.atoms.some(a=>a.id===id))joined={
   ...joined,atoms:[...joined.atoms,{id,kind:'hexagon',x:host.x,y:host.y+atomHeight(host)+VERTICAL,variant:'small'}],
   bonds:[...joined.bonds,{parent:host.id,child:id,relation:'support'}]
  }
 }
 const typed=normalizeRoles(joined)
 if(snap.relation!=='support')return typed
 const owner=byId(typed,snap.parent)
 if(owner.kind==='circle')return alignSupporters(typed,snap.parent)
 if(owner.kind==='triangle'){
  // First valid red orange creates its paired position. Partner starts empty
  // because gate+not and bridge+to cannot be distinguished from color alone.
  const paired=normalizeRoles(withRedCompanion(typed,owner.id,id=>({
   id,kind:'hexagon',x:owner.x,y:owner.y+atomHeight(owner)+VERTICAL,variant:'small'
  })))
  return alignRedSupporters(paired,owner.id)
 }
 if(owner.kind==='oval'){
  const blueId=blueHeadOfAdjective(typed,owner.id)
  return blueId?alignSupporters(typed,blueId):typed
 }
 if(owner.kind==='square'){
  const blueId=parentOfSupport(typed,owner.id)
  return blueId&&byId(typed,blueId)?.kind==='circle'?alignSupporters(typed,blueId):typed
 }
 if(owner.kind==='rectangle'){
  let candidate=owner.id
  const visited=new Set<string>()
  while(!visited.has(candidate)){
   visited.add(candidate)
   const parentId=parentOfSupport(typed,candidate)
   if(!parentId)break
   const parent=byId(typed,parentId)
   if(parent.kind==='circle')return alignSupporters(typed,parent.id)
   if(parent.kind!=='rectangle')break
   candidate=parent.id
  }
 }
 if(owner.kind==='hexagon'){
  const greenId=rootedSupportChain(typed,owner.id,'hexagon','oval','circle')
  const blueId=greenId?blueHeadOfAdjective(typed,greenId):undefined
  if(blueId)return alignSupporters(typed,blueId)
  if(orangeRootedInRed(typed,owner.id)){
   let current=owner.id
   const seen=new Set<string>()
   while(!seen.has(current)){
    seen.add(current)
    const parentId=parentOfSupport(typed,current)
    if(!parentId)break
    if(byId(typed,parentId)?.kind==='triangle')return alignRedSupporters(typed,parentId)
    current=parentId
   }
  }
  return typed
 }
 return typed
}
function resolveMagnet(d:Draft,moving:Set<string>,snap:Snap):Draft {
 return alignSequenceFamilyClearance(resolveMagnetBase(d,moving,snap))
}
function eligibleMagnet(d:Draft,moving:Set<string>):Snap|null {
 return newFamilyAfterBlue(d,moving)?null:redBetweenBlues(d,moving)??bestSnap(d,moving)
}
/** Project every changed atom to its exact post-bond coordinates and rendered size. */
function magneticProjection(before:Draft,after:Draft):Atom[] {
 return after.atoms.filter(atom=>{
  const prior=before.atoms.find(a=>a.id===atom.id)
  return !prior||Math.abs(atom.x-prior.x)>.01||Math.abs(atom.y-prior.y)>.01||
   atomWidth(atom)!==atomWidth(prior)||atomHeight(atom)!==atomHeight(prior)
 })
}
function magnetLabel(d:Draft,s:Snap):string {
 const parent=byId(d,s.parent),child=byId(d,s.child)
 if(s.relation==='support'&&parent.kind==='triangle')return 'Orange under red'
 if(s.relation==='support'&&parent.kind==='circle')return 'Support under blue'
 if(s.relation==='support'&&parent.kind==='oval')return 'Modifier beneath green (n)'
 if(s.relation==='support'&&parent.kind==='hexagon')return 'Nested orange beneath its actual parent'
 if(s.relation==='support'&&parent.kind==='rectangle')return 'Nested possessive beneath purple'
 if(s.relation==='pair')return 'Support pair'
 if(child.kind==='oval')return 'Green complement'
 return 'Sequence snap'
}
/** STAX POS source grid codes are directional, not generic shape-to-shape bonds:
 * n = a NEW family follows (owner-confirmed); o is retained as a source code,
 * not presumed to mean a supporter. These representative entries are source values.
 */
// STAX POS: rectangle→adverb is x; adjective (Oval)→adverb is n.
 // Do not convert a skipped n token into a sequential/predecessor bond.
const STAX_POS_SAMPLES = {
 'circle>rectangle':'n',
 'rectangle>circle':'o',
 'circle>diamond':'n',
 'diamond>circle':'n',
 'circle>triangle':'n',
 'triangle>circle':'n',
} as const
function newFamilyAfterBlue(d:Draft,moving:Set<string>):boolean {
 if(STAX_POS_SAMPLES['circle>rectangle']!=='n')return false
 // A rectangle explicitly to the RIGHT of a blue captain at its head level
 // is starting a different family (the source circle→rectangle n rule).
 // Never magnetically pull it underneath the earlier noun.
 return d.atoms.some(a=>{
  if(!moving.has(a.id)||a.kind!=='rectangle')return false
  const blue=d.atoms.filter(b=>!moving.has(b.id)&&b.kind==='circle')
   .sort((b,c)=>Math.hypot(a.x-b.x,a.y-b.y)-Math.hypot(a.x-c.x,a.y-c.y))[0]
  if(!blue)return false
  return a.x>=blue.x+atomWidth(blue)*.7&&a.x<=blue.x+atomWidth(blue)*2.3&&
   a.y>=blue.y-atomHeight(blue)*.4&&a.y<=blue.y+atomHeight(blue)*.7
 })
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
/** Lightweight metallic SVG stroke based on Letterz golden ink, no animation loop. */
function MetallicGoldStroke({id}:{id:string}){
 return <defs><linearGradient id={id} x1="4%" y1="0%" x2="94%" y2="100%">
  <stop offset="0%" stopColor="#9d661b"/>
  <stop offset="18%" stopColor="#f7d35c"/>
  <stop offset="36%" stopColor="#fff1ac"/>
  <stop offset="54%" stopColor="#ce921d"/>
  <stop offset="77%" stopColor="#f7d35c"/>
  <stop offset="100%" stopColor="#805319"/>
 </linearGradient></defs>
}
/** Theme-aware toolbar pictograms. SVG uses currentColor instead of platform font
 * symbols, so all 13 visual modes get the same legible line weights. */
type StaxToolbarIconName='back'|'expand'|'shrink'|'undo'|'remove'|'sweep'|'clear'|'theme'|'omit'|'center'|'fit'|'minus'|'plus'
function StaxToolbarIcon({name}:{name:StaxToolbarIconName}){
 return <svg className="stax-toolbar-icon" viewBox="0 0 24 24" width="25" height="25"
  fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
  {name==='back'&&<><path d="m14.5 5-7 7 7 7"/><path d="M8 12h12"/></>}
  {name==='expand'&&<><path d="M9 3H3v6M15 3h6v6M3 15v6h6M21 15v6h-6"/><path d="m3 3 7 7m11-7-7 7M3 21l7-7m11 7-7-7" opacity=".35"/></>}
  {name==='shrink'&&<><path d="M9 9H3M9 9V3M15 9h6M15 9V3M9 15H3M9 15v6M15 15h6M15 15v6"/><path d="m3 3 6 6m12-6-6 6M3 21l6-6m12 6-6-6" opacity=".35"/></>}
  {name==='undo'&&<><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></>}
  {name==='remove'&&<><path d="m4 8 6-5h10v18H10L4 16Z"/><path d="m12 10 5 5m0-5-5 5"/></>}
  {name==='sweep'&&<><path d="m5 3 13 13"/><path d="m13 13-6 1-4 5 2 2 5-4 1-6"/><path d="M13 19h8M16 22h5"/></>}
  {name==='clear'&&<><path d="M5 5 19 19M19 5 5 19"/></>}
  {name==='theme'&&<><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" stroke="none" opacity=".6"/></>}
  {name==='omit'&&<><path d="M3 12h3m4 0h4m4 0h3"/><circle cx="12" cy="12" r="8" strokeDasharray="2 4"/></>}
  {name==='center'&&<><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M12 1v4m0 14v4M1 12h4m14 0h4"/></>}
  {name==='fit'&&<><path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/><path d="m8 8 4 4 4-4m-8 8 4-4 4 4" opacity=".55"/></>}
  {name==='minus'&&<><circle cx="10" cy="10" r="7"/><path d="M7 10h6m2.5 5.5L21 21"/></>}
  {name==='plus'&&<><circle cx="10" cy="10" r="7"/><path d="M7 10h6m-3-3v6m5.5 2.5L21 21"/></>}
 </svg>
}
export function MoleculeBoard({onBack}:{onBack?:()=>void}={}){
 const [doc,setDoc]=useState<Draft>(()=>normalizeRoles(load()))
 const [theme,setTheme]=useState<StaxTheme>(()=>{
  try{const value=localStorage.getItem(THEME_KEY);return STAX_THEMES.find(t=>t===value)??'color'}catch{return 'color'}
 })
 const [omitBrush,setOmitBrush]=useState(false)
 const [pollenAnimated,setPollenAnimated]=useState(false)
 useEffect(()=>{if(theme!=='golden-pollen')setPollenAnimated(false)},[theme])
 const [view,setView]=useState<View>(defaultView)
 const [history,setHistory]=useState<Draft[]>([])
 const [questActive,setQuestActive]=useState(false)
 const [fullscreen,setFullscreen]=useState(false)
 const rootRef=useRef<HTMLDivElement>(null)
 useEffect(()=>{const sync=()=>setFullscreen(document.fullscreenElement===rootRef.current);document.addEventListener('fullscreenchange',sync);return()=>document.removeEventListener('fullscreenchange',sync)},[])
 const [selected,setSelected]=useState<string|null>(null)
 const [hint,setHint]=useState('Drag any shape anywhere. Only compatible pieces brought close together will snap.')
 // Keep all workspace controls in a horizontal bottom tray. Retract after
 // 6.5 seconds of inactivity; the left-edge handle remains reachable.
 const [trayOpen,setTrayOpen]=useState(true)
 const [trayActivity,setTrayActivity]=useState(0)
 useEffect(()=>{
  if(!trayOpen)return
  const timer=setTimeout(()=>setTrayOpen(false),6500)
  return ()=>clearTimeout(timer)
 },[trayOpen,trayActivity])
 function openTray(){setTrayOpen(true);setTrayActivity(n=>n+1)}
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
 useEffect(()=>{try{localStorage.setItem(THEME_KEY,theme)}catch{/* local theme unavailable */}},[theme])
 useEffect(()=>()=>{if(fallTimer.current)clearTimeout(fallTimer.current)},[])
 function update(d:Draft){const resolved=normalizeRoles(d);currentDoc.current=resolved;setDoc(resolved)}
 function save(d:Draft,prev=currentDoc.current){setHistory(v=>[...v,prev].slice(-40));update(d)}
 function aspect(){const rect=svg.current?.getBoundingClientRect();return rect?.height?rect.width/rect.height:ASPECT}
 function setCamera(v:View){
  const h=v.width/aspect(),adjusted={...v,y:v.y+(v.height-h)/2,height:h}
  currentView.current=adjusted;setView(adjusted)
 }
 useEffect(()=>{
  if(!rootRef.current||typeof ResizeObserver==='undefined')return
  const ro=new ResizeObserver(()=>setCamera(currentView.current))
  ro.observe(rootRef.current)
  return ()=>ro.disconnect()
 },[])
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
  if(omitBrush){
   e.stopPropagation()
   const old=currentDoc.current
   const atom=byId(old,id)
   save({...old,atoms:old.atoms.map(a=>a.id===id?{...a,omitted:!a.omitted}:a)},old)
   setSelected(id)
   setHint(atom.omitted?'Omission removed.':'Shape marked dotted: omitted.')
   return
  }
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
   setPreview(eligibleMagnet(proposed,molecule(proposed,d.id)))
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
    const moved=reflowAfterRemoval(translate(stripped,ids,0,DROP_DISTANCE))
    if(fallTimer.current)clearTimeout(fallTimer.current)
    setFall(new Set(ids));save(moved,old)
    fallTimer.current=setTimeout(()=>setFall(new Set()),300)
    setHint('Branch detached. The remaining siblings reflowed; Undo restores the previous map.')
   }else lastTap.current={id:d.id,time:t}
   return
  }
  lastTap.current=null
  const actual=currentDoc.current,moving=molecule(actual,d.id)
  // POS-grid n indicates a follower begins another family. A rectangle to the
  // right of blue stays loose instead of being misread as its subordinate.
  const snap=eligibleMagnet(actual,moving)
  if(snap){
   const result=resolveMagnet(actual,moving,snap)
   save(result,d.before)
   setHint(snap.relation==='support'?(byId(result,snap.parent)?.kind==='triangle'?'Red has its paired orange positions. The right orange can take a third below.':'Family snapped to its actual grammatical parent.'):'Magnetic snap! Connected pieces now move together.')
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
  const isNounSupport=kind==='square'||kind==='rectangle'||kind==='oval'
  // All shapes may exist as independent thinking objects. The bonding
  // eligibility rules, not palette availability, enforce family structure.
  const p=client?fromClient(client.x,client.y):null,camera=currentView.current
  let x=(p?.x??camera.x+camera.width/2)-width(kind)*variantWidthFactor(kind,variant)/2
  let y=(p?.y??camera.y+camera.height/2)-height(kind)*variantHeightFactor(kind,variant)/2
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
  const next:Draft={...previous,atoms:[...previous.atoms,{id,kind,x,y,variant,omitted:omitBrush}]}
  // Drag uses spatial magnets. Tap can attach to a unique valid parent.
  // Every shape may also remain loose; only valid family relationships bond.
  let snap:Snap|null=client?eligibleMagnet(next,new Set([id])):null
  if(!client&&(isNounSupport||kind==='hexagon')){
   const created=byId(next,id)
   let parent:Atom|undefined
   let target:{x:number;y:number}|undefined
   if(isNounSupport){
    const blues=next.atoms.filter(a=>a.kind==='circle')
    const blue=blues.length===1?blues[0]:blues.find(a=>a.id===selected)
    if(blue&&!blueSupportAtoms(next,blue.id).some(a=>a.kind===kind&&kind!=='oval')){
     parent=blue
     target=supportPosition(blue,created,next)
    }
   }else{
    const greens=next.atoms.filter(a=>a.kind==='oval'&&eligibleAdverbHost(next,a.id))
    const green=greens.find(a=>a.id===selected)||(greens.length===1?greens[0]:undefined)
    if(green){parent=green;target=miniFamilyPosition(next,green,created)}
    else if(!greens.length){
     const pinks=next.atoms.filter(a=>a.kind==='square'&&canAttachAdverbUnderPreposition(next,a.id))
     const pink=pinks.find(a=>a.id===selected)||(pinks.length===1?pinks[0]:undefined)
     if(pink){parent=pink;target=nestedChildPosition(pink,created)}
     const reds=next.atoms.filter(a=>a.kind==='triangle'&&orangeChildren(next,a.id).length<2)
     const red=reds.length===1?reds[0]:reds.find(a=>a.id===selected)
     if(!parent&&red){parent=red;target=redOrangePosition(red,next)}
     else if(!parent&&!reds.length){
      const blues=next.atoms.filter(a=>a.kind==='circle'&&canAttachOrangeUnderObjectBlue(next,a.id)&&!blueSupportAtoms(next,a.id).some(child=>child.kind==='hexagon'))
      const blue=blues.length===1?blues[0]:blues.find(a=>a.id===selected)
      if(blue){parent=blue;target=supportPosition(blue,created,next)}
     }
    }
   }
   if(parent&&target){
    const dx=target.x-created.x,dy=target.y-created.y
    snap={parent:parent.id,child:id,relation:'support',dx,dy,distance:Math.hypot(dx,dy)}
   }
  }
  if(snap){
   const result=resolveMagnet(next,new Set([id]),snap)
   save(result,previous)
   setSelected(id)
   setHint(snap.relation==='support'&&byId(result,snap.parent)?.kind==='triangle'?'Orange snapped precisely beneath red.':'Magnet connected to its actual parent.')
  }else{
   save(next,previous)
   setSelected(id)
   setHint('Placed freely. Any shape may wait unattached; only valid magnets create a family.')
  }
 }
 function palettePosition(kind:Kind,clientX:number,clientY:number,variant?:Atom['variant']):PaletteHover {
  const screenX=clientX,screenY=clientY-FINGER_LIFT
  const rect=svg.current?.getBoundingClientRect()
  const inside=!!rect&&screenX>=rect.left&&screenX<=rect.right&&screenY>=rect.top&&screenY<=rect.bottom
  const p=inside?fromClient(screenX,screenY):null
  const worldX=(p?.x??0)-width(kind)*variantWidthFactor(kind,variant)/2,worldY=(p?.y??0)-height(kind)*variantHeightFactor(kind,variant)/2
  let snap:Snap|null=null
  if(p&&currentDoc.current.atoms.length<80){
   const ghost:Atom={id:'__palette_preview__',kind,x:worldX,y:worldY,variant}
   const trial={...currentDoc.current,atoms:[...currentDoc.current.atoms,ghost]}
   snap=eligibleMagnet(trial,new Set([ghost.id]))
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
  // The example's under-red ports use the same exact positions as live magnets.
  const example=normalizeRoles(quest21())
  const next=alignSequenceFamilyClearance(alignRedSupporters(alignRedSupporters(example,'q21-buy'),'q21-is'))
  save(next);setCamera(fit(next,aspect()));setSelected(null);setQuestActive(true)
  setHint('Blueprint Level 21 loaded as a movable demonstration. Word roles are provisional; all shapes and bonds remain editable.')
 }
 async function toggleFullscreen(){
  try{if(document.fullscreenElement===rootRef.current){await document.exitFullscreen()}else if(rootRef.current?.requestFullscreen){await rootRef.current.requestFullscreen()}}catch{setHint('Full-screen mode is restricted in this browser; the canvas still fills the available window.')}
 }
 function undo(){const prev=history.at(-1);if(prev){update(prev);setHistory(v=>v.slice(0,-1));setHint('Undone.')}}
 function remove(){
  if(!selected)return
  const before=currentDoc.current
  const remaining={
   atoms:before.atoms.filter(a=>a.id!==selected),
   bonds:before.bonds.filter(b=>b.parent!==selected&&b.child!==selected),
  }
  save(reflowAfterRemoval(remaining),before)
  setSelected(null)
  setHint('Removed selected shape. Its former siblings have reflowed; Undo restores it.')
 }
 function sweepLoose(){
  const before=currentDoc.current,keep=largestAssembledFamily(before,selected)
  if(!keep){setHint('Nothing to sweep yet. Connect two shapes to form a map first.');return}
  const discard=before.atoms.length-keep.size
  if(!discard){setHint('Already clean: every shape belongs to the largest map.');return}
  const trimmed:Draft={
   atoms:before.atoms.filter(a=>keep.has(a.id)),
   bonds:before.bonds.filter(b=>keep.has(b.parent)&&keep.has(b.child)),
  }
  save(reflowAfterRemoval(trimmed),before)
  if(selected&&!keep.has(selected))setSelected(null)
  setQuestActive(false)
  setHint('Swept '+discard+' unattached or smaller-map shape'+(discard===1?'':'s')+'. Undo restores everything.')
 }
 return <div ref={rootRef} className="stax-molecule-ui" data-theme={theme} data-original-pollen={pollenAnimated?'true':'false'}>
  <button className="stax-tray-handle" type="button" aria-label={trayOpen?'Close workspace controls':'Open workspace controls'} aria-controls="stax-bottom-tray" aria-expanded={trayOpen} onClick={()=>{setTrayOpen(v=>!v);setTrayActivity(n=>n+1)}}><span aria-hidden="true">{trayOpen?'‹':'›'}</span></button>
  <div id="stax-bottom-tray" className="stax-molecule-dock" data-open={trayOpen?'true':'false'} aria-label="STAX workspace controls" aria-hidden={!trayOpen}
    onPointerEnter={openTray} onPointerDownCapture={openTray} onFocusCapture={openTray} onWheel={openTray}>
   <div className="stax-molecule-tools">
    <button className="stax-molecule-back" onClick={onBack} title="Back to Classic Shape Lab" aria-label="Back to Classic Shape Lab"><StaxToolbarIcon name="back"/></button>
    <div className="stax-molecule-buttons">
     <button onClick={toggleFullscreen} title={fullscreen?"Exit full screen":"Full screen"} aria-label={fullscreen?"Exit full screen":"Go full screen"}><StaxToolbarIcon name={fullscreen?'shrink':'expand'}/></button>
     <button onClick={loadQuest} title="Load Quest Level 21" aria-label="Load Quest 21">Q21</button>
     <button onClick={undo} disabled={!history.length} title="Undo" aria-label="Undo"><StaxToolbarIcon name="undo"/></button>
     <button onClick={remove} disabled={!selected} title="Remove selected shape" aria-label="Remove selected shape"><StaxToolbarIcon name="remove"/></button>
     <button onClick={sweepLoose} title="Sweep loose shapes and smaller maps; keep the largest connected map (Undo restores)" aria-label="Sweep loose shapes; keep largest connected map"><StaxToolbarIcon name="sweep"/></button>
     <button onClick={()=>{save(empty());setSelected(null);setQuestActive(false)}} title="Clear all shapes" aria-label="Clear all shapes"><StaxToolbarIcon name="clear"/></button>
     <button onClick={()=>{const next=nextStaxTheme(theme);setTheme(next);setHint('Visual mode: '+staxThemeName(next))}}
      title={'Visual mode: '+staxThemeName(theme)+' (tap to cycle '+STAX_THEMES.map(staxThemeName).join(', ')+')'}
      aria-label={'Visual mode: '+staxThemeName(theme)+'. Tap to change theme.'}><StaxToolbarIcon name="theme"/></button>
     <button className="stax-foam-shortcut" aria-pressed={theme==='classroom-foam'}
      onClick={()=>{const next=theme==='classroom-foam'?'color':'classroom-foam';setTheme(next);setHint('Visual mode: '+staxThemeName(next))}}
      title="Toggle Classroom Foam using Ashley's photographed desk and seven real foam pieces"
      aria-label="Toggle Classroom Foam">Foam</button>
     <button onClick={()=>{setOmitBrush(v=>!v);setHint(omitBrush?'Dotted omission brush off.':'Dotted omission brush on. Tap a shape to toggle, or add dotted shapes.')}}
      title="Omit brush: tap to toggle; when active tap shapes to mark omitted, or add new dotted shapes"
      aria-label="Toggle dotted omission brush" aria-pressed={omitBrush}
      className={omitBrush?'stax-mode-active':''}><StaxToolbarIcon name="omit"/></button>
    </div>
   </div>
   <div className="stax-molecule-view-controls">
    <button onClick={()=>setCamera(centre(currentDoc.current,currentView.current))} title="Center" aria-label="Center"><StaxToolbarIcon name="center"/></button>
    <button onClick={()=>setCamera(fit(currentDoc.current,aspect()))} title="Fit all" aria-label="Fit all"><StaxToolbarIcon name="fit"/></button>
    <button aria-label="Zoom out" title="Zoom out" onClick={()=>setCamera(zoom(currentView.current,1.25))}><StaxToolbarIcon name="minus"/></button>
    <span>{Math.round(100*W/view.width)}%</span>
    <button aria-label="Zoom in" title="Zoom in" onClick={()=>setCamera(zoom(currentView.current,.8))}><StaxToolbarIcon name="plus"/></button>
   </div>
  </div>
  {questActive&&<p className="stax-molecule-example">STAX QUEST · Level 21 — She’s buying a present for her best friend because her birthday is tomorrow. <small>Illustrative mapping; original slide does not label each shape with its individual word.</small></p>}
  <div className="stax-molecule-canvas">
   <svg ref={svg} viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} aria-label="STAX freely movable magnetic workspace" onPointerDownCapture={downTouch} onPointerMoveCapture={moveTouch} onPointerUpCapture={endTouch} onPointerCancelCapture={endTouch} onPointerDown={downBackground} onPointerMove={moveBackground} onPointerUp={upBackground} onPointerCancel={upBackground}>
    {theme==='golden-line'&&<MetallicGoldStroke id="stax-golden-board"/>}
     {hasStaxMaterial(theme)&&<StaxMaterialDefs prefix="stax-mat-board"/>}
    <rect data-board-background="true" x={view.x} y={view.y} width={view.width} height={view.height} fill={theme==='arc-reactor'||theme==='hologram'||theme==='cosmic'||theme==='golden-line'||(theme==='pearlescent-glass'||theme==='pearlescent-airglass'||theme==='pearlescent-dusk'||theme==='classroom-foam')||hasStaxMaterial(theme)?'transparent':staxBoardColor(theme)}/>
    {paletteHover?.snap&&<g className="stax-resonance-ghost" aria-hidden="true" pointerEvents="none">
      {(()=>{
       const phantom:Atom={id:'__palette_preview__',kind:paletteHover.kind,x:paletteHover.worldX,y:paletteHover.worldY,variant:paletteHover.variant,omitted:omitBrush}
       const staged:Draft={...doc,atoms:[...doc.atoms,phantom]}
       const projected=resolveMagnet(staged,new Set([phantom.id]),paletteHover.snap!)
       return magneticProjection(staged,projected).map(a=><g key={a.id} transform={`translate(${a.x} ${a.y})`}>
         <Glyph kind={a.kind} w={atomWidth(a)} h={atomHeight(a)} fill="none" stroke={theme==='golden-line'?'#f7d35c':'#13af8b'} strokeWidth={4} strokeDasharray="8 5"/>
       </g>)
      })()}
      <text x={byId(doc,paletteHover.snap.parent)?.x??0} y={(byId(doc,paletteHover.snap.parent)?.y??0)-13} fontSize="15" fontWeight="700" fill={theme==='golden-line'?'#f7d35c':'#168569'}>{magnetLabel({...doc,atoms:[...doc.atoms,{id:'__palette_preview__',kind:paletteHover.kind,x:paletteHover.worldX,y:paletteHover.worldY}]},paletteHover.snap)}</text>
     </g>}
    {preview&&dragging.current&&<g className="stax-resonance-ghost" aria-hidden="true" pointerEvents="none">
      {magneticProjection(doc,resolveMagnet(doc,molecule(doc,dragging.current.id),preview)).map(a=><g key={a.id} transform={`translate(${a.x} ${a.y})`}>
        <Glyph kind={a.kind} w={atomWidth(a)} h={atomHeight(a)} fill="none" stroke={theme==='golden-line'?'#f7d35c':'#2ca39a'} strokeDasharray="8 5" strokeWidth={3}/>
      </g>)}
      <text x={byId(doc,preview.parent).x} y={byId(doc,preview.parent).y-13} fontSize="15" fontWeight="700" fill={theme==='golden-line'?'#f7d35c':'#168569'}>{magnetLabel(doc,preview)}</text>
     </g>}
    {doc.atoms.map(a=><g key={a.id} transform={`translate(${a.x} ${a.y})`} data-kind={a.kind} data-id={a.id} data-omitted={a.omitted?'true':'false'} className={[
       fall.has(a.id)?'stax-molecule-dropping':'',
       (paletteHover?.snap&&(paletteHover.snap.parent===a.id||paletteHover.snap.child===a.id))||
       (preview&&dragging.current&&!molecule(doc,dragging.current.id).has(a.id)&&(preview.parent===a.id||preview.child===a.id))?'stax-resonant-target':''
      ].filter(Boolean).join(' ')}
      onPointerDown={e=>onShapeDown(e,a.id)} onPointerMove={onShapeMove} onPointerUp={releaseShape} onPointerCancel={()=>{dragging.current=null}} style={{touchAction:'none',cursor:'grab'}}>
      {selected===a.id&&<rect x="-7" y="-7" width={atomWidth(a)+14} height={atomHeight(a)+14} rx="5" fill="none" stroke={theme==='golden-line'?'#fff1ac':'#7b8795'} strokeDasharray="4 5" pointerEvents="none"/>}
      <Glyph kind={a.kind} w={atomWidth(a)} h={atomHeight(a)}
        fill={(theme==='pearlescent-glass'||theme==='pearlescent-airglass'||theme==='pearlescent-dusk'||theme==='classroom-foam')?(a.omitted?'#e9ddf71f':'#ffffff01'):materialFill(theme,'stax-mat-board',SYMBOLS[a.kind].color)}
        stroke={(theme==='pearlescent-glass'||theme==='pearlescent-airglass'||theme==='pearlescent-dusk'||theme==='classroom-foam')?(a.omitted?'#a891c1':'#ffffff01'):theme==='golden-line'?'url(#stax-golden-board)':materialStroke(theme,'stax-mat-board',SYMBOLS[a.kind].color)}
        strokeWidth={hasStaxMaterial(theme)?4:3} strokeDasharray={staxOmissionDash(a.omitted)}/>
       <StaxMaterialEffect theme={theme} kind={a.kind} w={atomWidth(a)} h={atomHeight(a)} seed={a.id} omitted={a.omitted} animated={pollenAnimated}/>
       {theme==='pearlescent-glass'&&<PearlescentGlass kind={a.kind} w={atomWidth(a)} h={atomHeight(a)} omitted={a.omitted}/>}
        {theme==='pearlescent-airglass'&&<PearlescentAirglass kind={a.kind} w={atomWidth(a)} h={atomHeight(a)} omitted={a.omitted}/>}
      {theme==='pearlescent-dusk'&&<PearlescentAirglass kind={a.kind} w={atomWidth(a)} h={atomHeight(a)} omitted={a.omitted} dusk/>}
      {theme==='classroom-foam'&&<FoamChip kind={a.kind} w={atomWidth(a)} h={atomHeight(a)} omitted={a.omitted}/>} 
      {a.word&&<text x={atomWidth(a)/2} y={atomHeight(a)/2+5} fontSize={Math.min(18,Math.max(11,atomWidth(a)/Math.max(a.word.length,3)*1.4))} fill={(theme==='pearlescent-glass'||theme==='pearlescent-airglass'||theme==='pearlescent-dusk'||theme==='classroom-foam')?'#514868':theme==='golden-line'||hasStaxMaterial(theme)?'#fff0c8':theme==='blueprint'||theme==='black'||theme==='arc-reactor'||theme==='hologram'||theme==='cosmic'?'#edf9ff':'#253c55'} fontWeight="600" textAnchor="middle" pointerEvents="none">{a.word}</text>}
    </g>)}
   </svg>
   {theme==='golden-pollen'&&<LetterzGoldenPollenCanvas
     atoms={doc.atoms.map(a=>({id:a.id,kind:a.kind,x:a.x,y:a.y,
      w:atomWidth(a),h:atomHeight(a),omitted:a.omitted}))}
     view={view} svgRef={svg} onReady={setPollenAnimated}/>}
   {!doc.atoms.length&&<p className="stax-molecule-empty">Tap a shape in the palette, or drag one into the workspace.</p>}
  </div>
  <div className="stax-molecule-palette">{choices.map(({kind,variant,label})=><button key={`${kind}-${variant||'default'}`} title={label+(omitBrush?' (omitted)':'')} aria-label={`Add ${label}${omitBrush?' (omitted)':''}`}
   onPointerDown={e=>paletteDown(e,kind,variant)} onPointerMove={paletteMove} onPointerUp={paletteUp} onPointerCancel={paletteCancel}>
   <svg viewBox={`-4 -4 ${width(kind)*variantWidthFactor(kind,variant)+8} ${height(kind)*variantHeightFactor(kind,variant)+8}`} aria-hidden="true">{theme==='golden-line'&&<MetallicGoldStroke id={`stax-golden-palette-${kind}-${variant||'default'}`}/>}
     {hasStaxMaterial(theme)&&<StaxMaterialDefs prefix={`stax-mat-palette-${kind}-${variant||'default'}`}/>}
     <Glyph kind={kind} w={width(kind)*variantWidthFactor(kind,variant)} h={height(kind)*variantHeightFactor(kind,variant)} stroke={(theme==='pearlescent-glass'||theme==='pearlescent-airglass'||theme==='pearlescent-dusk'||theme==='classroom-foam')?(omitBrush?'#a891c1':'#ffffff01'):theme==='golden-line'?`url(#stax-golden-palette-${kind}-${variant||'default'})`:materialStroke(theme,`stax-mat-palette-${kind}-${variant||'default'}`,SYMBOLS[kind].color)} fill={(theme==='pearlescent-glass'||theme==='pearlescent-airglass'||theme==='pearlescent-dusk'||theme==='classroom-foam')?(omitBrush?'#e9ddf71f':'#ffffff01'):materialFill(theme,`stax-mat-palette-${kind}-${variant||'default'}`,SYMBOLS[kind].color)} strokeWidth={hasStaxMaterial(theme)?4:3} strokeDasharray={staxOmissionDash(omitBrush)}/>
     <StaxMaterialEffect theme={theme} kind={kind} w={width(kind)*variantWidthFactor(kind,variant)} h={height(kind)*variantHeightFactor(kind,variant)} seed={kind} omitted={omitBrush} compact/>
     {theme==='pearlescent-glass'&&<PearlescentGlass kind={kind} w={width(kind)*variantWidthFactor(kind,variant)} h={height(kind)*variantHeightFactor(kind,variant)} omitted={omitBrush}/>} 
      {theme==='pearlescent-airglass'&&<PearlescentAirglass kind={kind} w={width(kind)*variantWidthFactor(kind,variant)} h={height(kind)*variantHeightFactor(kind,variant)} omitted={omitBrush}/>}
      {theme==='pearlescent-dusk'&&<PearlescentAirglass kind={kind} w={width(kind)*variantWidthFactor(kind,variant)} h={height(kind)*variantHeightFactor(kind,variant)} omitted={omitBrush} dusk/>}
      {theme==='classroom-foam'&&<FoamChip kind={kind} w={width(kind)*variantWidthFactor(kind,variant)} h={height(kind)*variantHeightFactor(kind,variant)} omitted={omitBrush}/>} </svg>
  </button>)}</div>
  {paletteHover&&<div className={`stax-lifted-ghost${paletteHover.snap?' is-eligible':''}`} style={{left:paletteHover.screenX,top:paletteHover.screenY}} aria-hidden="true">
    <svg width={Math.max(40,Math.min(130,width(paletteHover.kind)*variantWidthFactor(paletteHover.kind,paletteHover.variant)*(svg.current?.getBoundingClientRect().width||960)/view.width))}
      height={Math.max(28,Math.min(130,height(paletteHover.kind)*variantHeightFactor(paletteHover.kind,paletteHover.variant)*(svg.current?.getBoundingClientRect().width||960)/view.width))}
      viewBox={`0 0 ${width(paletteHover.kind)*variantWidthFactor(paletteHover.kind,paletteHover.variant)} ${height(paletteHover.kind)*variantHeightFactor(paletteHover.kind,paletteHover.variant)}`}>
     {theme==='golden-line'&&<MetallicGoldStroke id="stax-golden-lifted"/>}
      {hasStaxMaterial(theme)&&<StaxMaterialDefs prefix="stax-mat-lifted"/>}
     <Glyph kind={paletteHover.kind} w={width(paletteHover.kind)*variantWidthFactor(paletteHover.kind,paletteHover.variant)} h={height(paletteHover.kind)*variantHeightFactor(paletteHover.kind,paletteHover.variant)}
       fill={(theme==='pearlescent-glass'||theme==='pearlescent-airglass'||theme==='pearlescent-dusk'||theme==='classroom-foam')?'#ffffff01':materialFill(theme,'stax-mat-lifted',SYMBOLS[paletteHover.kind].color)} stroke={(theme==='pearlescent-glass'||theme==='pearlescent-airglass'||theme==='pearlescent-dusk'||theme==='classroom-foam')?(omitBrush?'#a891c1':'#ffffff01'):theme==='golden-line'?(paletteHover.snap?'#fff1ac':'url(#stax-golden-lifted)'):paletteHover.snap?'#12a981':materialStroke(theme,'stax-mat-lifted',SYMBOLS[paletteHover.kind].color)} strokeWidth={4} strokeDasharray={staxOmissionDash(omitBrush)}/>
      <StaxMaterialEffect theme={theme} kind={paletteHover.kind}
       w={width(paletteHover.kind)*variantWidthFactor(paletteHover.kind,paletteHover.variant)}
       h={height(paletteHover.kind)*variantHeightFactor(paletteHover.kind,paletteHover.variant)}
       seed={paletteHover.kind} omitted={omitBrush} compact/>
      {theme==='pearlescent-glass'&&<PearlescentGlass kind={paletteHover.kind}
       w={width(paletteHover.kind)*variantWidthFactor(paletteHover.kind,paletteHover.variant)}
       h={height(paletteHover.kind)*variantHeightFactor(paletteHover.kind,paletteHover.variant)} omitted={omitBrush}/>}
       {theme==='pearlescent-airglass'&&<PearlescentAirglass kind={paletteHover.kind}
       w={width(paletteHover.kind)*variantWidthFactor(paletteHover.kind,paletteHover.variant)}
       h={height(paletteHover.kind)*variantHeightFactor(paletteHover.kind,paletteHover.variant)} omitted={omitBrush}/>}
       {theme==='pearlescent-dusk'&&<PearlescentAirglass kind={paletteHover.kind}
       w={width(paletteHover.kind)*variantWidthFactor(paletteHover.kind,paletteHover.variant)}
       h={height(paletteHover.kind)*variantHeightFactor(paletteHover.kind,paletteHover.variant)} omitted={omitBrush} dusk/>}
       {theme==='classroom-foam'&&<FoamChip kind={paletteHover.kind}
        w={width(paletteHover.kind)*variantWidthFactor(paletteHover.kind,paletteHover.variant)}
        h={height(paletteHover.kind)*variantHeightFactor(paletteHover.kind,paletteHover.variant)} omitted={omitBrush}/>} 
    </svg>
   </div>}
  <p className="stax-molecule-hint" role="status">{hint}</p>
  <p className="stax-molecule-note">Shape sizes adapt to their attachment. Shapes lift above your finger during touch-drag; eligible magnets glow. Any color can remain loose for exploration. One finger moves atoms or pans; pinch with two fingers to zoom. Drag the background to pan. Nearby compatible shapes snap on release; remote shapes never move. Double-tap a child to detach and drop its branch. Saved locally. Pink/purple support blue; blue/yellow connect horizontally in either order; red/blue keep the staircase.</p>
 </div>
}
