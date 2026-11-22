import { useEffect, useRef, useState, type CSSProperties, type RefObject, type WheelEvent as ReactWheelEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { Glyph, SCALE } from './SymbolCanvas'
import { SYMBOLS, type Kind } from './model'
import { STAX_SPACING, positionChildren, positionRedOrangeCrossPair, horizontalFollower, positionRedRightNestedOrange, requiredFamilyFollowerShift, type FamilyChild } from './geometry'
import { nextRedOrangeRemoteStep } from './remote-orange-topology'
import { startTwoFinger, advanceTwoFinger, type TwoFingerSession } from './two-finger-intent'
import { canAttachOrangeUnderObjectBlue, canAttachAdverbUnderPreposition, canExtendSupportChain, canFollowBlueOrange, canNestPossessive, eligibleOrangeTierSlot, orangeRootedInRed, largestAssembledFamily, normalizeBlueSiblingOrder, rootedSupportChain, supportChildOfKind, withRedCompanion } from './family-links'
import { STAX_THEMES, nextStaxTheme, staxBoardColor, staxOmissionDash, staxThemeName, type StaxTheme } from './view-modes'
import { StaxMaterialDefs, StaxMaterialEffect, hasStaxMaterial, materialFill, materialStroke } from './materials'
import { LetterzGoldenPollenCanvas } from './letterz-golden-pollen'
import { PearlescentGlass } from './pearlescent-atlas'
import { PearlescentAirglass } from './pearlescent-airglass'
import { FoamChip } from './foam-chips'
import { FoamSlideAudio, FOAM_SLIDE_SOUNDS, safeFoamSoundId, normalizeFoamSoundTuning, DEFAULT_FOAM_SOUND_TUNING, type FoamSlideSoundId, type FoamSoundTuning } from './foam-slide-audio'
import { STAX_QUEST_LEVELS, staxQuestLevel } from './quest-levels'
import type { RemoteInput, RemoteDirection } from './remote-gesture-model'
import { parseStaxSentence, type ParsedStax } from './quest-parser'
import { advanceQuestTwo, harvestQuestTwo, QUEST_TWO_ORDER, type QuestTwoSide } from './quest-two'
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
type Snap = { parent:string;child:string;relation:Relation;dx:number;dy:number;distance:number;insertBefore?:string;bridgeRight?:string }
type PaletteHover = { kind:Kind;variant?:'small'|'large';screenX:number;screenY:number;worldX:number;worldY:number;snap:Snap|null }
// Distances from the STAX Blueprint's .07-unit design grid; only snap geometry is quantised.
const UNIT=SCALE*STAX_SPACING.unit
const GAP=SCALE*STAX_SPACING.attachment, VERTICAL=SCALE*STAX_SPACING.attachment
const BLUE_RED_GAP=SCALE*STAX_SPACING.group, RED_BLUE_GAP=SCALE*STAX_SPACING.row
const CONNECTOR_GAP=SCALE*STAX_SPACING.connector
const W=960,H=570,ASPECT=W/H, SNAP_RADIUS=76, DROP_DISTANCE=124, TAP=9, DOUBLE_MS=350, FINGER_LIFT=42, FINGER_COVER_DIAMETER=58
// Red/blue heads have diagonal Blueprint destinations; allow a wider approach
// zone but preserve exact final positions and all other magnet eligibility.
const RED_BLUE_SNAP_RADIUS=SNAP_RADIUS*1.75
const KEY='stax-free-molecules-v2', THEME_KEY='stax-molecule-theme-v1', FOAM_SOUND_KEY='stax-foam-slide-sound-v1', FOAM_SOUND_PRESET_KEY='stax-foam-slide-preset-v2', FOAM_SOUND_TUNING_KEY='stax-foam-synth-tuning-v1'
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
// The authentic wood texture is a 411-unit-tall repeating slat. Showing ~3
// slats (two black seams) at rest avoids magnifying the tabletop photograph.
const CLASSROOM_WOOD_DEFAULT_ZOOM=2.18
const classroomWoodDefaultView:View={
 x:W*(1-CLASSROOM_WOOD_DEFAULT_ZOOM)/2,
 y:H*(1-CLASSROOM_WOOD_DEFAULT_ZOOM)/2,
 width:W*CLASSROOM_WOOD_DEFAULT_ZOOM,
 height:H*CLASSROOM_WOOD_DEFAULT_ZOOM,
}
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
 const parent={x:red.x,y:red.y,width:width('triangle'),height:height('triangle')}
 // Preview the same X crossing used after the second orange attaches.
 return (items.length===2&&!compact
  ?positionRedOrangeCrossPair(parent,[items[0],items[1]],VERTICAL)
  :positionChildren(parent,items,{gap:GAP,belowGap:VERTICAL})
 ).get('__incoming_orange')!
}
function alignRedSupporters(doc:Draft,redId:string):Draft {
 const red=byId(doc,redId),orange=orangeChildren(doc,redId)
 if(!red||orange.length<1)return doc
 const parent={x:red.x,y:red.y,width:width('triangle'),height:height('triangle')}
 const children=orange.map(a=>({id:a.id,width:atomWidth(a),height:atomHeight(a)}))
 // A pair BELOW the LEFT supporter already occupies a lower vertical row.
 // Do not include those grandchildren in the upper row's horizontal widths:
 // that previously shoved the right "uncle" far away and shifted the row
 // off the red's center. The Blueprint calls for a modest .77 upper gap,
 // with the lower X pair allowed to project underneath the upper-right orange.
 const hasLeftLowerPair=orange.length===2&&orangeChildren(doc,orange[0].id).length===2
 const upperGap=hasLeftLowerPair?11*UNIT:GAP
 // Exactly two direct large hexagons cross at their inner tips (Blueprint X).
 // If another orange is added to the red-rooted family, keep existing compact
 // tier spacing; neither purple nor other support rows use this exception.
 const positions=orange.length===2&&redOrangeFamilySize(doc,redId)===2
  ?positionRedOrangeCrossPair(parent,[children[0],children[1]],VERTICAL)
  :positionChildren(parent,children,{gap:upperGap,belowGap:VERTICAL})
 let next=doc
 for(const child of orange){
  const a=byId(next,child.id),target=positions.get(child.id)!
  next=translate(next,descendants(next,a.id),target.x-a.x,target.y-a.y)
 }
 // Red's paired oranges can each own descendants and additional bridge tiers.
 for(const child of orange)next=alignOrangeTierChildren(next,child.id)
 return next
}
/** Reconcile only the four-orange Blueprint upper tier after loading old saved
 * workspaces or a nonstandard edit path. Prior previews preserved the old,
 * over-wide coordinates in localStorage even after the spacing rule changed.
 * Do NOT normalize or move other family shapes here (notably the approved
 * three-orange arrangement and existing purple insertion).
 */
function ensureFourOrangeBlueprint(d:Draft):Draft {
 let next=d
 for(const red of d.atoms.filter(a=>a.kind==='triangle')){
  const top=orangeChildren(next,red.id)
  if(top.length!==2||redOrangeFamilySize(next,red.id)!==4||
    orangeChildren(next,top[0].id).length!==2)continue
  const parent={x:red.x,y:red.y,width:atomWidth(red),height:atomHeight(red)}
  const children=top.map(a=>({id:a.id,width:atomWidth(a),height:atomHeight(a)}))
  const correct=positionChildren(parent,children,{gap:11*UNIT,belowGap:VERTICAL})
  // Reflow only stale coordinates; never perturb an already-correct assembly.
  const stale=top.some(a=>{
   const target=correct.get(a.id)!
   return Math.abs(a.x-target.x)>SCALE*.05||
     Math.abs(a.y-target.y)>SCALE*.05
  })
  if(stale)next=alignRedSupporters(next,red.id)
 }
 // Existing six/seven-piece drafts kept the old touching middle pair in
 // localStorage. Reflow those only; never disturb approved three/four layouts.
 for(const red of d.atoms.filter(a=>a.kind==='triangle')){
  if(redOrangeFamilySize(next,red.id)<6)continue
  const top=orangeChildren(next,red.id)
  if(top.length!==2)continue
  const middle=orangeChildren(next,top[0].id)
  if(middle.length!==2||orangeChildren(next,middle[0].id).length!==2)continue
  const topLeft=byId(next,top[0].id)
  const correct=positionChildren(
   {x:topLeft.x,y:topLeft.y,width:atomWidth(topLeft),height:atomHeight(topLeft)},
   middle.map(a=>({id:a.id,width:atomWidth(a),height:atomHeight(a)})),
   {gap:GAP,belowGap:VERTICAL}
  )
  const bottom=orangeChildren(next,middle[0].id)
  const staleMiddle=middle.some(a=>Math.abs(a.x-correct.get(a.id)!.x)>SCALE*.05||
   Math.abs(a.y-correct.get(a.id)!.y)>SCALE*.05)
  let staleBottom=false
  if(redOrangeFamilySize(next,red.id)>=7&&bottom.length===2){
   const lowerParent=byId(next,middle[0].id)
   const expected=positionChildren(
    {x:lowerParent.x,y:lowerParent.y,width:atomWidth(lowerParent),height:atomHeight(lowerParent)},
    bottom.map(a=>({id:a.id,width:atomWidth(a),height:atomHeight(a)})),
    {gap:GAP,belowGap:VERTICAL}
   )
   staleBottom=bottom.some(a=>Math.abs(a.x-expected.get(a.id)!.x)>SCALE*.05||
    Math.abs(a.y-expected.get(a.id)!.y)>SCALE*.05)
  }
  if(staleMiddle||staleBottom)next=alignRedSupporters(next,red.id)
 }
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
 // A following orange is LARGE, like a green complement after red.
 // Only nested/support oranges take the small form.
 return owner&&['circle','oval','hexagon'].includes(byId(d,owner.parent)?.kind)?'small':'large'
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
/** Shared exact snap port: free drag and Quest sentence heads use the same Blueprint coordinates. */
function snappedSequenceFollowerPosition(left:Atom,right:Atom):{x:number;y:number}{
 if(left.kind==='triangle'&&(right.kind==='oval'||right.kind==='hexagon'))return {
  x:left.x+atomWidth(left)+RED_BLUE_GAP,
  y:left.y+atomHeight(left)+BLUE_RED_GAP
 }
 const conjunction=left.kind==='diamond'||right.kind==='diamond'
 const diagonal=conjunction||left.kind===right.kind?0:height(left.kind)+(left.kind==='circle'?4:7)*UNIT
 const gap=conjunction?CONNECTOR_GAP:left.kind==='triangle'&&right.kind==='circle'?RED_BLUE_GAP:BLUE_RED_GAP
 const horizontal=horizontalFollower(
  {x:left.x,y:left.y,width:width(left.kind),height:height(left.kind)},
  {width:width(right.kind),height:height(right.kind)},gap)
 return {x:horizontal.x,y:conjunction?horizontal.y:left.y+diagonal}
}
function sequenceHeadGap(left:Atom,right:Atom):number {
 if(left.kind==='diamond'||right.kind==='diamond')return CONNECTOR_GAP
 if(left.kind==='circle'&&right.kind==='triangle')return BLUE_RED_GAP
 if(left.kind==='triangle'&&right.kind==='circle')return RED_BLUE_GAP
 return RED_BLUE_GAP
}
/** Expand following family branches to honor both the head port and the
 * silhouettes of children at intersecting heights. Never change supporter
 * geometry or the relative coordinates within a family. */
function alignSequenceFamilyClearance(doc:Draft,compact=false):Draft {
 let next=doc
 const edges=doc.bonds.filter(b=>b.relation==='sequence')
 if(compact){
  // After a supporter is removed, restore the canonical blue-to-blue head
  // port first, then re-expand only where remaining family silhouettes need
  // clearance. Moving the follower's descendants keeps its family intact.
  for(const edge of edges){
   const left=byId(next,edge.parent),right=byId(next,edge.child)
   if(!left||!right||left.kind!=='circle'||right.kind!=='circle')continue
   const target=snappedSequenceFollowerPosition(left,right)
   const dx=target.x-right.x
   if(Math.abs(dx)>.01)next=translate(next,descendants(next,right.id),dx,0)
  }
 }
 for(let pass=0;pass<edges.length;pass++){
  let changed=false
  for(const edge of edges){
   const left=byId(next,edge.parent),right=byId(next,edge.child)
   if(!left||!right)continue
   // A single left-justified supporter under the FIRST blue fits without
   // widening the next blue. Two or more supporters may project rightward
   // and must trigger real silhouette clearance. A supporter on the following
   // blue can also require clearance. Red-orange families alone never spread it.
   const leftFamily=left.kind==='circle'?supportFootprint(next,left.id):null
   const rightFamily=right.kind==='circle'?supportFootprint(next,right.id):null
   if(right.kind==='circle'&&(left.kind==='triangle'||left.kind==='circle')&&
      (rightFamily?.length??1)===1&&
      (left.kind!=='circle'||(leftFamily?.length??1)<=2))continue
   const a=leftFamily??supportFootprint(next,left.id)
   const b=rightFamily??supportFootprint(next,right.id)
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
/** Direct noun supporters stay side by side; nested adverbs are NEVER row members. */
function blueSupportPositions(doc:Draft,blueId:string):Map<string,{x:number;y:number}> {
 const blue=byId(doc,blueId),items=blueSupportAtoms(doc,blueId)
 if(!blue||!items.length)return new Map()
 const specs:FamilyChild[]=items.map(a=>{
  const w=a.kind==='oval'?smallWidth('oval'):a.kind==='hexagon'?smallWidth('hexagon'):width(a.kind)
  const h=a.kind==='oval'?height('oval')*SMALL_GREEN_Y:a.kind==='hexagon'?height('hexagon')*SMALL_ORANGE_Y:height(a.kind)
  // Only immediate supporters determine this row's center.
  // A deep purple/orange chain is carried with its direct parent but cannot
  // shift the circle or its sibling supporters when a new descendant joins.
  return {id:a.id,width:w,height:h}
 })
 return positionChildren({x:blue.x,y:blue.y,width:width('circle'),height:height('circle')},
  specs,{gap:GAP,belowGap:VERTICAL})
}
/** A single orange beneath another orange follows the same under-port as pink. */
function redRightModifierPosition(parent:Atom) {
 // Special THIRD orange: beneath the right direct red supporter, slightly
 // left of center but NOT as far left as the pink-like single-child port.
 return positionRedRightNestedOrange(
  {x:parent.x,y:parent.y,width:atomWidth(parent),height:atomHeight(parent)},
  {width:smallWidth('hexagon'),height:height('hexagon')*SMALL_ORANGE_Y},
  VERTICAL
 )
}
function nestedChildPosition(parent:Atom,child:Atom) {
 const childWidth=child.kind==='hexagon'?smallWidth('hexagon'):atomWidth(child)
 const childHeight=child.kind==='hexagon'?height('hexagon')*SMALL_ORANGE_Y:atomHeight(child)
 // All single orange descendants, including the third below red's RIGHT
 // orange, use the same offset as an orange beneath pink: right edge at
 // parent's horizontal midpoint, not centerline-to-centerline.
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
 const owner=ownerId?byId(doc,ownerId):undefined
 const siblings=owner&&(owner.kind==='triangle'||owner.kind==='hexagon')?orangeChildren(doc,owner.id):[]
 const rightDirectRedOrange=owner?.kind==='triangle'&&siblings.length===2&&siblings[1].id===parentId
 // The seventh orange beneath the RIGHT member of the second paired row
 // uses the same staggered right-side port as the third orange. The older
 // generic single-child port shifts it too far left toward the bottom pair.
 const rightPairedOrange=rightDirectRedOrange||(
  owner?.kind==='hexagon'&&siblings.length===2&&siblings[1].id===parentId)
 // Blueprint: at six or seven, the MIDDLE pair is separated by .28;
 // only the BOTTOM pair touches at its inner tips. Leave four-orange X intact.
 const rootId=orangeRedRoot(doc,parentId)
 const familySize=rootId?redOrangeFamilySize(doc,rootId):0
 const middleOfDeepFamily=owner?.kind==='triangle'&&
  familySize>=6&&children.length===2&&
  orangeChildren(doc,children[0].id).length===2
 // On SEVEN, the lower pair opens the same small gap as the middle pair.
 // On SIX, preserve its approved touching inner corners.
 const bottomOfSeven=owner?.kind==='hexagon'&&
  familySize>=7&&children.length===2
 const pair=[{id:children[0]?.id,width:smallW,height:smallH},
  {id:children[1]?.id,width:smallW,height:smallH}]
 const positions:Map<string,{x:number;y:number}>=children.length===2
  ?middleOfDeepFamily||bottomOfSeven
   ?positionChildren(parentBox,pair,{gap:GAP,belowGap:VERTICAL})
   :positionRedOrangeCrossPair(parentBox,[pair[0],pair[1]],VERTICAL)
  :new Map([[children[0].id,rightPairedOrange
    ?redRightModifierPosition(parent):nestedChildPosition(parent,children[0])]])
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
  const target=nestedChildPosition(parent,child)
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
 return alignSequenceFamilyClearance(next,true)
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
 // Two separate blue heads can BOTH connect to the red in a single drop.
 // Preserve their existing support families and reject distant second blues.
 if(best)return best
 const blues=d.atoms.filter(a=>a.kind==='circle'&&!moving.has(a.id))
 for(const left of blues){
  if(d.bonds.some(z=>z.relation==='sequence'&&z.parent===left.id))continue
  for(const right of blues){
   if(right.id===left.id||right.x<=left.x||molecule(d,left.id).has(right.id))continue
   if(d.bonds.some(z=>z.relation==='sequence'&&z.child===right.id))continue
   const expectedRed=snappedSequenceFollowerPosition(left,red)
   const placedRed={...red,x:expectedRed.x,y:expectedRed.y}
   const expectedRight=snappedSequenceFollowerPosition(placedRed,right)
   const blueGapError=Math.hypot(right.x-expectedRight.x,right.y-expectedRight.y)
   const redError=Math.hypot(red.x-expectedRed.x,red.y-expectedRed.y)
   if(blueGapError>RED_BLUE_SNAP_RADIUS*1.5||redError>RED_BLUE_SNAP_RADIUS)continue
   const redMid=red.x+atomWidth(red)/2
   if(redMid<=left.x+atomWidth(left)/2||redMid>=right.x+atomWidth(right)/2)continue
   const score=redError+blueGapError*.35
   const candidate:Snap={parent:left.id,child:red.id,relation:'sequence',
    dx:expectedRed.x-red.x,dy:expectedRed.y-red.y,distance:score,
    bridgeRight:right.id}
   if(!best||candidate.distance<best.distance)best=candidate
  }
 }
 return best
}
/** Returns only plausible near-drop join geometry; does NOT move anything itself. */
function bestSnap(d:Draft,moving:Set<string>):Snap|null {
 let best:Snap|null=null
 const offered=(s:Snap)=>{
  const parent=byId(d,s.parent),child=byId(d,s.child)
  const redBlue=s.relation==='sequence'&&parent&&child&&
   ((parent.kind==='circle'&&child.kind==='triangle')||
    (parent.kind==='triangle'&&child.kind==='circle'))
  const radius=redBlue?RED_BLUE_SNAP_RADIUS:SNAP_RADIUS
  if(s.distance<=radius&&(!best||s.distance<best.distance))best=s
 }
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
     const target=slot==='left-pair'?positionRedOrangeCrossPair(
       {x:b.x,y:b.y,width:atomWidth(b),height:atomHeight(b)},
       [{id:a.id,width:smallW,height:smallH},{id:'__future_pair',width:smallW,height:smallH}],
       VERTICAL).get(a.id)!:
      slot==='right-modifier'?redRightModifierPosition(b):nestedChildPosition(b,a)
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
   // A LARGE green or orange complement can follow a red linking verb.
   // Its sentence-follower port is distinct from under-red orange support.
   // Blueprint: 2.03 horizontal spacing, .49 vertical drop from red bottom.\n   // Both directions allow the *moving* atom to be placed on an existing partner.
   if((a.kind==='oval'||a.kind==='hexagon')&&b.kind==='triangle'&&!parentOfSupport(d,a.id)&&
      !molecule(d,a.id).has(b.id)&&
      !d.bonds.some(z=>z.relation==='sequence'&&(z.parent===b.id||z.child===a.id))){
     const target={x:b.x+atomWidth(b)+RED_BLUE_GAP,
      y:b.y+atomHeight(b)+BLUE_RED_GAP}
     offered({parent:b.id,child:a.id,relation:'sequence',
      dx:target.x-a.x,dy:target.y-a.y,
      distance:Math.hypot(target.x-a.x,target.y-a.y)})
   }
   if(a.kind==='triangle'&&(b.kind==='oval'||b.kind==='hexagon')&&!parentOfSupport(d,b.id)&&
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
     // Same canonical magnet position used by parser-generated Quest maps.
     const desired=snappedSequenceFollowerPosition(left,right)
     const delta=a.id===right.id?{x:desired.x-a.x,y:desired.y-a.y}:
      {x:b.x-(desired.x-left.x)-a.x,y:b.y-(desired.y-left.y)-a.y}
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
 if(snap.bridgeRight){
  // One gesture joins BLUE -> RED -> BLUE. Shift the right family's
  // complete descendant subtree, never destroy its support bonds.
  const redMoved=translate(d,moving,snap.dx,snap.dy)
  const red=byId(redMoved,snap.child),right=byId(redMoved,snap.bridgeRight)
  const target=snappedSequenceFollowerPosition(red,right)
  const repositioned=translate(redMoved,descendants(redMoved,right.id),
   target.x-right.x,target.y-right.y)
  return {...repositioned,bonds:[
   ...repositioned.bonds,
   {parent:snap.parent,child:snap.child,relation:'sequence'},
   {parent:snap.child,child:snap.bridgeRight,relation:'sequence'}
  ]}
 }
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
 * Turn a conservative grammar parse into world-space editable STAX atoms.
 * Parser owns grammatical roles; board geometry owns shape sizes/positions.
 * Sentence-head sequence and direct supporter relationships remain separate.
 */
function layoutParsedQuest(parsed:ParsedStax):Draft{
 const connected=new Set(parsed.bonds.filter(b=>b.relation==='support').map(b=>b.child))
 const heads=parsed.atoms.filter(a=>!connected.has(a.id))
 const coords=new Map<string,{x:number;y:number}>()
 heads.forEach((head,i)=>{
  const previous=i>0?heads[i-1]:null
  const prior=previous?coords.get(previous.id):null
  if(!previous||!prior){coords.set(head.id,{x:95,y:85});return}
  const source:Atom={id:previous.id,kind:previous.kind,x:prior.x,y:prior.y,word:previous.word}
  const follower:Atom={id:head.id,kind:head.kind,x:0,y:0,word:head.word}
  coords.set(head.id,snappedSequenceFollowerPosition(source,follower))
 })
 const atoms:Atom[]=parsed.atoms.map(a=>{
  const xy=coords.get(a.id)||{x:95,y:85}
  return {id:a.id,kind:a.kind,word:a.word,x:xy.x,y:xy.y}
 })
 let doc:Draft=normalizeRoles({atoms,bonds:parsed.bonds.map(b=>({...b}))})
 // Supporters align ONLY via the same exact reflow functions as manual snaps:
 // alignSupporters for BLUE and alignRedSupporters for RED. Never estimate.
 for(const head of heads){
  if(head.kind==='circle'&&blueSupportAtoms(doc,head.id).length)doc=alignSupporters(doc,head.id)
  if(head.kind==='triangle'&&orangeChildren(doc,head.id).length)doc=alignRedSupporters(doc,head.id)
 }
 return alignSequenceFamilyClearance(normalizeRoles(doc))
}
/** Quest 2 is always the exact unaltered Level 2 answer map.
 * 4B is an interaction/tap order, NOT a different map. H is a separate
 * question operator above the BLUE region; there is no placeholder atom.
 */
function questTwoAnswerDraft():Draft{
 const parsed=parseStaxSentence("I'm ok.")
 if(!parsed.supported)throw Error('STAX Quest 2 base must be parsable')
 const original=layoutParsedQuest(parsed)
 return {atoms:original.atoms.map(a=>({...a,id:'q2-a-'+a.id})),
  bonds:original.bonds.map(b=>({parent:'q2-a-'+b.parent,child:'q2-a-'+b.child,relation:b.relation}))}
}
/** H floats ABOVE the unchanged blue subject, never beside a virtual slot.
 * Its visible text is only 'H'; the HTML button provides a large touch target.
 */
function questTwoHPosition(d:Draft):{x:number;y:number}|null{
 const blue=d.atoms.find(a=>a.id==='q2-a-q-1'&&a.kind==='circle')
 if(!blue)return null
 return {x:blue.x+atomWidth(blue)/2,y:blue.y-height('circle')*.60}
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
export function MoleculeBoard({onBack,onRemoteTest,remoteSandbox=false,remoteInputRef}:{onBack?:()=>void;onRemoteTest?:()=>void;remoteSandbox?:boolean;remoteInputRef?:RefObject<((input:RemoteInput)=>void)|null>}={}){
 const [doc,setDoc]=useState<Draft>(()=>remoteSandbox?empty():ensureFourOrangeBlueprint(normalizeRoles(load())))
 const [theme,setTheme]=useState<StaxTheme>(()=>{
  if(remoteSandbox)return 'classroom-foam'
  try{const value=localStorage.getItem(THEME_KEY);return STAX_THEMES.find(t=>t===value)??'color'}catch{return 'color'}
 })
 // Classroom Foam presentation only; no shape or magnet geometry depends on this.
 const shadowCssVars={
  '--stax-foam-shadow-contact':String(.425),
  '--stax-foam-shadow-middle':String(.3625),
  '--stax-foam-shadow-cast':String(.2125),
  '--stax-foam-shadow-blur-near':'0.5px',
  '--stax-foam-shadow-blur-middle':'0.5px',
  '--stax-foam-shadow-blur-far':'0.5px',
 } as CSSProperties
 const [foamSoundEnabled,setFoamSoundEnabled]=useState(()=>{
  try{return localStorage.getItem(FOAM_SOUND_KEY)!=='off'}catch{return true}
 })
 const [foamSoundPreset,setFoamSoundPreset]=useState<FoamSlideSoundId>(()=>{
  try{return safeFoamSoundId(localStorage.getItem(FOAM_SOUND_PRESET_KEY))}catch{return 'plastic'}
 })
 const [foamSoundTuning,setFoamSoundTuning]=useState<FoamSoundTuning>(()=>{
  try{return normalizeFoamSoundTuning(JSON.parse(localStorage.getItem(FOAM_SOUND_TUNING_KEY)||'null'))}
  catch{return {...DEFAULT_FOAM_SOUND_TUNING}}
 })
 const [soundLabOpen,setSoundLabOpen]=useState(false)
 const foamAudio=useRef<FoamSlideAudio|null>(null)
 function audio(){
  if(!foamAudio.current)foamAudio.current=new FoamSlideAudio()
  foamAudio.current.setPreset(foamSoundPreset)
  foamAudio.current.setTuning(foamSoundTuning)
  return foamAudio.current
 }
 const [omitBrush,setOmitBrush]=useState(false)
 const [pollenAnimated,setPollenAnimated]=useState(false)
 useEffect(()=>{if(theme!=='golden-pollen')setPollenAnimated(false)},[theme])
 const [view,setView]=useState<View>(()=>remoteSandbox||theme==='classroom-foam'?classroomWoodDefaultView:defaultView)
 const [history,setHistory]=useState<Draft[]>([])
 const [questActive,setQuestActive]=useState(false)
 const [questPanelOpen,setQuestPanelOpen]=useState(false)
 const [chosenQuestLevel,setChosenQuestLevel]=useState(1)
 const [questTwoSide,setQuestTwoSide]=useState<QuestTwoSide>('question')
 const [questTwoTaps,setQuestTwoTaps]=useState<string[]>([])
 const [questTwoContracted,setQuestTwoContracted]=useState(true)
 const [activeQuestLevel,setActiveQuestLevel]=useState<number|null>(null)
 const [fullscreen,setFullscreen]=useState(false)
 const rootRef=useRef<HTMLDivElement>(null)
 useEffect(()=>{const sync=()=>setFullscreen(document.fullscreenElement===rootRef.current);document.addEventListener('fullscreenchange',sync);return()=>document.removeEventListener('fullscreenchange',sync)},[])
 const [selected,setSelected]=useState<string|null>(null)
 // Preserve one Undo snapshot per input session, rather than per keystroke.
 const textEditBefore=useRef<Draft|null>(null)
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
 function skinButtonDown(e:ReactPointerEvent<HTMLButtonElement>){
  if(e.pointerType==='mouse'&&e.button!==0)return
  menuHold.current={pointer:e.pointerId}
  suppressMenuClick.current=false
  try{e.currentTarget.setPointerCapture(e.pointerId)}catch{/* optional */}
 }
 function skinButtonEnd(e:ReactPointerEvent<HTMLButtonElement>){
  if(menuHold.current?.pointer!==e.pointerId)return
  if(skinButtonActive)suppressMenuClick.current=true
  menuHold.current=null;skinSurfaceSwipe.current=null;setSkinButtonActive(false)
 }
 const [fall,setFall]=useState<Set<string>>(new Set())
 const [preview,setPreview]=useState<Snap|null>(null)
 const [paletteHover,setPaletteHover]=useState<PaletteHover|null>(null)
 const svg=useRef<SVGSVGElement>(null),currentDoc=useRef(doc),currentView=useRef(view)
 const dragging=useRef<Drag|null>(null),panning=useRef<Pan|null>(null)
 const lastTap=useRef<{id:string;time:number}|null>(null)
 const fallTimer=useRef<ReturnType<typeof setTimeout>|null>(null)
 const paletteDrag=useRef<{kind:Kind;variant?:'small'|'large';pointer:number;startX:number;startY:number}|null>(null)
 const activeTouches=useRef<Map<number,TouchPoint>>(new Map())
 const touchAtom=useRef<Map<number,string>>(new Map())
 const touchStarted=useRef<Map<number,number>>(new Map())
 const questTwoPair=useRef<{pointers:[number,number];first:TouchPoint;second:TouchPoint;started:number;released:Set<number>}|null>(null)
 const pinch=useRef<Pinch|null>(null)
 const twoFingerIntent=useRef<TwoFingerSession|null>(null)
 const menuHold=useRef<{pointer:number}|null>(null)
 const skinSurfaceSwipe=useRef<{pointer:number;startX:number;startY:number;originX:number;step:number;active:boolean}|null>(null)
 const suppressMenuClick=useRef(false)
 const [skinButtonActive,setSkinButtonActive]=useState(false)
 const blockRelease=useRef<Set<number>>(new Set())
 const threeFingerCooldown=useRef(false)
 useEffect(()=>{if(remoteSandbox)return;try{localStorage.setItem(KEY,JSON.stringify(doc))}catch{/* local save unavailable */}},[doc,remoteSandbox])
 useEffect(()=>{if(remoteSandbox)return;try{localStorage.setItem(THEME_KEY,theme)}catch{/* local theme unavailable */}},[theme,remoteSandbox])
 useEffect(()=>{foamAudio.current?.setPreset(foamSoundPreset);try{localStorage.setItem(FOAM_SOUND_PRESET_KEY,foamSoundPreset)}catch{/* unavailable */}},[foamSoundPreset])
 useEffect(()=>{
  foamAudio.current?.setTuning(foamSoundTuning)
  try{localStorage.setItem(FOAM_SOUND_TUNING_KEY,JSON.stringify(foamSoundTuning))}catch{/* unavailable */}
 },[foamSoundTuning])
 useEffect(()=>{
  foamAudio.current?.setEnabled(foamSoundEnabled&&theme==='classroom-foam')
  try{localStorage.setItem(FOAM_SOUND_KEY,foamSoundEnabled?'on':'off')}catch{/* local sound preference unavailable */}
 },[foamSoundEnabled,theme])
 useEffect(()=>()=>foamAudio.current?.dispose(),[])
 useEffect(()=>()=>{if(fallTimer.current)clearTimeout(fallTimer.current)},[])
 function questTwoTap(token:string){
  if(!questActive||activeQuestLevel!==2)return
  const result=advanceQuestTwo(questTwoSide,questTwoTaps,token)
  if(result.complete&&!result.accepted)return
  setQuestTwoTaps(result.next)
  if(result.accepted)setHint(result.complete?'Expression harvested: '+harvestQuestTwo(questTwoSide,result.next,questTwoContracted):
   'Correct '+result.next.length+' of '+QUEST_TWO_ORDER[questTwoSide].length+'.')
  else setHint('Not quite. Tap in the shown order; start again.')
 }
 function changeQuestTwoSide(side:QuestTwoSide){
  if(questTwoSide===side)return
  // Expression 4B and statement 5 harvest the SAME physical STAX map.
  // Never replace atoms/bonds, save another scene, or move the camera.
  setQuestTwoSide(side);setQuestTwoTaps([]);setSelected(null);setOmitBrush(false)
  setHint(side==='question'?'4B: tap H, red SMR, blue I. The same map remains in place.':
   '5: tap blue I, red SMR, green ok. Contract with the button or a two-shape tap.')
 }
 function toggleQuestTwoContraction(){
  setQuestTwoContracted(v=>!v)
  setHint('The BLUE and RED shapes stay separate; only the spoken/written form changes.')
 }
 function setSelectedShapeWord(value:string){
  if(!selected)return
  const current=currentDoc.current
  if(!current.atoms.some(a=>a.id===selected))return
  update({...current,atoms:current.atoms.map(a=>a.id===selected?{...a,word:value.slice(0,36)}:a)})
 }
 function finishShapeTextEdit(){
  const before=textEditBefore.current
  textEditBefore.current=null
  if(before&&selected&&before.atoms.find(a=>a.id===selected)?.word!==currentDoc.current.atoms.find(a=>a.id===selected)?.word){
   setHistory(h=>[...h,before].slice(-40))
  }
 }
 function wordOnAtom(a:Atom){
  return activeQuestLevel===2&&questActive&&questTwoSide==='answer'&&a.id==='q2-a-q-2'
   ?questTwoContracted?"'m":'am':a.word||''
 }
 function update(d:Draft){const resolved=ensureFourOrangeBlueprint(normalizeRoles(d));currentDoc.current=resolved;setDoc(resolved)}
 function save(d:Draft,prev=currentDoc.current){setHistory(v=>[...v,prev].slice(-40));update(d)}
 function aspect(){const rect=svg.current?.getBoundingClientRect();return rect?.height?rect.width/rect.height:ASPECT}
 function setCamera(v:View){
  const h=v.width/aspect(),adjusted={...v,y:v.y+(v.height-h)/2,height:h}
  currentView.current=adjusted;setView(adjusted)
 }
 function wheelZoom(e:ReactWheelEvent<SVGSVGElement>){
  // Zoom only on intentional desktop wheel movement, anchored to cursor.
  if(e.ctrlKey)return
  e.preventDefault()
  const rect=svg.current?.getBoundingClientRect()
  if(!rect||!rect.width||!rect.height)return
  const v=currentView.current
  const factor=Math.exp(Math.max(-100,Math.min(100,e.deltaY))*.0015)
  const width=Math.max(300,Math.min(4000,v.width*factor))
  const height=width/aspect()
  const u=(e.clientX-rect.left)/rect.width,w=(e.clientY-rect.top)/rect.height
  setCamera({x:v.x+u*(v.width-width),y:v.y+w*(v.height-height),width,height})
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
 // Two stationary touches on the Level 2 BLUE I + RED SMR pair switch
 // contraction. Any moving pair remains a pinch zoom. No grammar mutation.
 function downTouch(e:ReactPointerEvent<SVGSVGElement>){
  if(menuHold.current){
   // One finger holds menu, the OTHER swipes on the actual board.
   if(!skinSurfaceSwipe.current){
    skinSurfaceSwipe.current={pointer:e.pointerId,startX:e.clientX,startY:e.clientY,originX:e.clientX,step:0,active:skinButtonActive}
    try{e.currentTarget.setPointerCapture(e.pointerId)}catch{/* optional */}
   }
   return
  }
  if(e.pointerType!=='touch')return
  activeTouches.current.set(e.pointerId,{x:e.clientX,y:e.clientY})
  if(activeTouches.current.size>=3){
   // Reserved for future program navigation: never move camera or change skins.
   pinch.current=null;twoFingerIntent.current=null;panning.current=null;questTwoPair.current=null
   threeFingerCooldown.current=true
   if(dragging.current){foamAudio.current?.stop();update(dragging.current.before);dragging.current=null;setPreview(null)}
   for(const id of activeTouches.current.keys())blockRelease.current.add(id)
   return
  }
  if(threeFingerCooldown.current)return
  touchStarted.current.set(e.pointerId,Date.now())
  const atomId=(e.target as Element).closest?.('[data-id]')?.getAttribute('data-id')
  if(atomId)touchAtom.current.set(e.pointerId,atomId)
  blockRelease.current.delete(e.pointerId)
  if(activeTouches.current.size!==2)return
  const ids=[...activeTouches.current.keys()] as [number,number]
  const a=activeTouches.current.get(ids[0])!,b=activeTouches.current.get(ids[1])!
  if(dragging.current){foamAudio.current?.stop();update(dragging.current.before);dragging.current=null;setPreview(null)}
  panning.current=null;lastTap.current=null
  blockRelease.current.add(ids[0]);blockRelease.current.add(ids[1])
  const atoms=[touchAtom.current.get(ids[0]),touchAtom.current.get(ids[1])]
  const recognized=questActive&&activeQuestLevel===2&&questTwoSide==='answer'&&
   atoms.includes('q2-a-q-1')&&atoms.includes('q2-a-q-2')&&
   Math.abs((touchStarted.current.get(ids[0])||0)-(touchStarted.current.get(ids[1])||0))<300
  if(recognized){
   questTwoPair.current={pointers:ids,first:{...a},second:{...b},started:Date.now(),released:new Set()}
   setHint('Release both shapes together to toggle I am / I\'m. Move to pinch zoom.')
   return
  }
  twoFingerIntent.current=startTwoFinger({id:ids[0],...a},{id:ids[1],...b})
  setHint('Two fingers: move together to pan, spread or pinch to zoom. Gesture locks until release.')
 }
 function moveTouch(e:ReactPointerEvent<SVGSVGElement>){
  const style=skinSurfaceSwipe.current
  if(style&&style.pointer===e.pointerId&&menuHold.current){
   if(!style.active){
    const dx=e.clientX-style.startX,dy=e.clientY-style.startY
    if(dy<=-54&&Math.abs(dy)>Math.abs(dx)*1.2){
     style.active=true;style.originX=e.clientX;style.step=0
     setSkinButtonActive(true);suppressMenuClick.current=true
     setHint('Skin selection: drag left or right on the board while holding menu.')
    }
    return
   }
   const step=Math.trunc((e.clientX-style.originX)/48),delta=step-style.step
   if(delta){
    setTheme(previous=>STAX_THEMES[(STAX_THEMES.indexOf(previous)+delta%STAX_THEMES.length+STAX_THEMES.length)%STAX_THEMES.length])
    style.step=step
   }
   return
  }
  if(e.pointerType!=='touch'||!activeTouches.current.has(e.pointerId))return
  activeTouches.current.set(e.pointerId,{x:e.clientX,y:e.clientY})
  if(threeFingerCooldown.current)return
  const pair=questTwoPair.current
  if(pair){
   const a=activeTouches.current.get(pair.pointers[0]),b=activeTouches.current.get(pair.pointers[1])
   const distanceA=a?Math.hypot(a.x-pair.first.x,a.y-pair.first.y):0
   const distanceB=b?Math.hypot(b.x-pair.second.x,b.y-pair.second.y):0
   if(Math.max(distanceA,distanceB)<=14)return
   questTwoPair.current=null
   if(a&&b)twoFingerIntent.current=startTwoFinger({id:pair.pointers[0],...pair.first},{id:pair.pointers[1],...pair.second})
   else return
  }
  if(threeFingerCooldown.current)return
  const session=twoFingerIntent.current
  if(!session||activeTouches.current.size!==2)return
  const a=activeTouches.current.get(session.ids[0]),b=activeTouches.current.get(session.ids[1])
  if(!a||!b)return
  const result=advanceTwoFinger(session,{id:session.ids[0],...a},{id:session.ids[1],...b})
  twoFingerIntent.current=result.session
  if(result.lockedNow)setHint(result.session.mode==='pan'?'PAN locked · zoom disabled until release':'PINCH locked · pan disabled until release')
  const frame=result.frame
  if(!frame)return
  const rect=svg.current?.getBoundingClientRect()
  if(!rect||!rect.width||!rect.height)return
  const v=currentView.current
  if(result.session.mode==='pan'){
   setCamera({...v,x:v.x-frame.dx*v.width/rect.width,y:v.y-frame.dy*v.height/rect.height})
  }else{
   const width=Math.max(300,Math.min(4000,v.width/frame.scale))
   const height=width/aspect()
   // Pinch is zoom-only. Keep the fixed midpoint of the initial gesture
   // anchored to the same world point; ignore centroid drift.
   const initial=result.session.initial
   const u=(initial.x-rect.left)/rect.width,w=(initial.y-rect.top)/rect.height
   setCamera({x:v.x+u*(v.width-width),y:v.y+w*(v.height-height),width,height})
  }
 }
 function endTouch(e:ReactPointerEvent<SVGSVGElement>){
  if(skinSurfaceSwipe.current?.pointer===e.pointerId){
   skinSurfaceSwipe.current=null;return
  }
  if(e.pointerType!=='touch')return
  const pair=questTwoPair.current
  if(pair&&pair.pointers.includes(e.pointerId)){
   if(e.type==='pointercancel')questTwoPair.current=null
   else{
    pair.released.add(e.pointerId)
    if(pair.released.size===2){
     questTwoPair.current=null
     if(Date.now()-pair.started<=550)toggleQuestTwoContraction()
    }
   }
  }
  activeTouches.current.delete(e.pointerId)
  if(threeFingerCooldown.current){
   pinch.current=null;twoFingerIntent.current=null;panning.current=null
   if(activeTouches.current.size===0)threeFingerCooldown.current=false
  }else if(activeTouches.current.size<2){
   twoFingerIntent.current=null
  }
  touchAtom.current.delete(e.pointerId)
  touchStarted.current.delete(e.pointerId)
  if(pinch.current?.pointers.includes(e.pointerId)){
   pinch.current=null
   panning.current=null
  }
 }
 /** Lift ONLY a touch-hidden tiny shape. A visible joined molecule should
  * stay under the finger, even when the board is zoomed out. */
 function needsFingerLift(d:Draft,id:string,pointerType:string):boolean{
  if(pointerType!=='touch')return false
  const group=molecule(d,id)
  const atoms=d.atoms.filter(a=>group.has(a.id))
  if(!atoms.length)return false
  const rect=svg.current?.getBoundingClientRect()
  if(!rect?.width||!rect.height)return false
  const left=Math.min(...atoms.map(a=>a.x)),right=Math.max(...atoms.map(a=>a.x+atomWidth(a)))
  const top=Math.min(...atoms.map(a=>a.y)),bottom=Math.max(...atoms.map(a=>a.y+atomHeight(a)))
  const renderedWidth=(right-left)*rect.width/currentView.current.width
  const renderedHeight=(bottom-top)*rect.height/currentView.current.height
  // Even partially visible joined pieces offer a usable visual reference.
  return renderedWidth<FINGER_COVER_DIAMETER&&renderedHeight<FINGER_COVER_DIAMETER
 }
 function onShapeDown(e:ReactPointerEvent<SVGGElement>,id:string){
  if(e.pointerType==='mouse'&&e.button!==0)return
  if(menuHold.current||pinch.current||questTwoPair.current||twoFingerIntent.current||threeFingerCooldown.current)return
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
  dragging.current={id,pointer:e.pointerId,sx:p.x,sy:p.y,before:currentDoc.current,moved:false,fingerLift:needsFingerLift(currentDoc.current,id,e.pointerType)?FINGER_LIFT:0}
  if(theme==='classroom-foam'&&foamSoundEnabled)audio().start(e.clientX,e.clientY)
  e.currentTarget.setPointerCapture(e.pointerId)
  // Defer selection until release so tapping an already selected piece
  // removes the halo without interfering with an intentional drag.
 }
 function onShapeMove(e:ReactPointerEvent<SVGGElement>){
  if(pinch.current||questTwoPair.current||twoFingerIntent.current||threeFingerCooldown.current)return
  const d=dragging.current;if(!d||d.pointer!==e.pointerId)return
  const pt=pointer(e),dx=pt.x-d.sx,dy=pt.y-d.sy
  if(Math.hypot(dx,dy)>TAP)d.moved=true
  if(d.moved){
   setSelected(d.id)
   if(theme==='classroom-foam'&&foamSoundEnabled)audio().move(e.clientX,e.clientY)
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
  if(blockRelease.current.has(e.pointerId)){blockRelease.current.delete(e.pointerId);foamAudio.current?.stop();dragging.current=null;setPreview(null);return}
  const d=dragging.current;if(!d||d.pointer!==e.pointerId)return
  dragging.current=null;foamAudio.current?.stop();setPreview(null);e.stopPropagation()
  if(!d.moved){
   if(!(questActive&&activeQuestLevel===2))setSelected(s=>s===d.id?null:d.id)
   if(questActive&&activeQuestLevel===2){lastTap.current=null;questTwoTap(d.id);return}
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
  if(menuHold.current)return
  if(pinch.current||questTwoPair.current)return
  if(e.target!==e.currentTarget&&!(e.target as Element).hasAttribute('data-board-background'))return
  if(e.pointerType==='mouse'&&e.button!==0)return
  panning.current={pointer:e.pointerId,startX:e.clientX,startY:e.clientY,before:currentView.current,moved:false}
  e.currentTarget.setPointerCapture(e.pointerId)
  setSelected(null)
 }
 function moveBackground(e:ReactPointerEvent<SVGSVGElement>){
  if(menuHold.current)return
  if(pinch.current||twoFingerIntent.current||threeFingerCooldown.current)return
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
  if(theme==='classroom-foam'&&foamSoundEnabled)audio().start(e.clientX,e.clientY)
  e.currentTarget.setPointerCapture(e.pointerId)
  setPaletteHover(palettePosition(kind,e.clientX,e.clientY,variant))
 }
 function paletteMove(e:ReactPointerEvent<HTMLButtonElement>){
  const p=paletteDrag.current;if(!p||p.pointer!==e.pointerId)return
  if(theme==='classroom-foam'&&foamSoundEnabled&&Math.hypot(e.clientX-p.startX,e.clientY-p.startY)>10)audio().move(e.clientX,e.clientY)
  setPaletteHover(palettePosition(p.kind,e.clientX,e.clientY,p.variant))
 }
 function paletteUp(e:ReactPointerEvent<HTMLButtonElement>){
  const p=paletteDrag.current;if(!p||p.pointer!==e.pointerId)return
  paletteDrag.current=null;foamAudio.current?.stop();setPaletteHover(null)
  const moved=Math.hypot(e.clientX-p.startX,e.clientY-p.startY)>10
  const liftedY=e.clientY-FINGER_LIFT,rect=svg.current?.getBoundingClientRect()
  const inside=!!rect&&e.clientX>=rect.left&&e.clientX<=rect.right&&liftedY>=rect.top&&liftedY<=rect.bottom
  if(moved&&!inside){setHint('Drop the lifted shape inside the workspace.');return}
  addAt(p.kind,moved?{x:e.clientX,y:liftedY}:undefined,p.variant)
 }
 function paletteCancel(){paletteDrag.current=null;foamAudio.current?.stop();setPaletteHover(null)}
 function loadQuest(level:number){
  const item=staxQuestLevel(level)
  if(!item)return
  if(level===2){
   const base=questTwoAnswerDraft()
   save(base,currentDoc.current)
   setCamera(fit(base,aspect()))
   setSelected(null);setOmitBrush(false);setQuestActive(true)
   setActiveQuestLevel(2);setChosenQuestLevel(2);setQuestPanelOpen(false)
   setQuestTwoSide('question');setQuestTwoTaps([]);setQuestTwoContracted(true)
   setHint('Quest 2 · 4B: H is above the original I + SMR + ok map. Tap H, then red, then blue.')
   return
  }
  setQuestTwoTaps([])
  const before=currentDoc.current
  const parsed=level<=10?parseStaxSentence(item.sentence,{learnerName:'Ashley'}):null
  const known=parsed?.supported?layoutParsedQuest(parsed):null
  // No fabricated maps for unknown grammar. Level 21 retains the existing
  // illustrative diagram; all other levels open a blank editable workspace.
  const example=known|| (level===21?normalizeRoles(quest21()):empty())
  const next=level===21
   ?alignSequenceFamilyClearance(alignRedSupporters(alignRedSupporters(example,'q21-buy'),'q21-is'))
   :example
  save(next,before)
  setCamera(next.atoms.length?fit(next,aspect()):defaultView)
  setSelected(null);setQuestActive(true);setActiveQuestLevel(level);setQuestPanelOpen(false)
  setHint(level<=10&&known?'Quest '+level+' loaded: editable sentence-to-STAX map. SMR and other verb forms are kept distinct.':
   level===21?'Quest 21 illustrative map loaded; individual word-role mappings remain provisional.':
   'Quest '+level+': build the original sentence with shapes. Its grammar has not yet been parsed.')
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

 // STAX Remote is a temporary, non-persistent CANONICAL board: no parallel
 // magnet layout. Contextual commands call the same resolver as physical drag.
 const remoteFocus=useRef<string|null>(null)
 const remoteDrag=useRef<{before:Draft;changed:boolean}|null>(null)
 const remoteRedo=useRef<Draft[]>([])
 const remoteDeleteArmed=useRef(false)
 const remoteDeleteTarget=useRef<string|null>(null)
 function remoteNotice(value:string){setHint(value)}
 function remoteSelect(id:string|null){
  if(remoteDeleteTarget.current!==id){remoteDeleteArmed.current=false;remoteDeleteTarget.current=null}
  remoteFocus.current=id;setSelected(id)
 }
 function remoteCommit(next:Draft,focused:string|null,message:string){
  if(next===currentDoc.current)return
  remoteRedo.current=[]
  save(next)
  remoteSelect(focused)
  remoteNotice(message)
 }
 function remoteSpine(){
  const before=currentDoc.current
  if(before.atoms.length>=78){remoteNotice('Shape limit reached.');return}
  const heads=before.atoms.filter(a=>a.kind==='circle'||a.kind==='triangle')
  const last=heads.at(-1)
  const kind:Kind=!last?'circle':heads.length===1&&last.kind==='circle'?'triangle':'circle'
  const id=crypto.randomUUID()
  const target=last?snappedSequenceFollowerPosition(last,{id,kind,x:0,y:0}):{x:Math.max(170,currentView.current.x+currentView.current.width*.39),y:Math.max(95,currentView.current.y+currentView.current.height*.23)}
  const nextAtom:Atom={id,kind,x:target.x,y:target.y}
  let next:Draft={atoms:[...before.atoms,nextAtom],bonds:[...before.bonds]}
  if(last)next.bonds.push({parent:last.id,child:id,relation:'sequence'})
  if(kind==='triangle'&&heads.length===1){
   // Working hypothesis: the yellow conjunction is a non-displacing
   // predecessor of the FIRST blue, never a gap inserted between blue and red.
   // Preserve the existing blue/red positions; revise this rule if the
   // final yes/no semantics differ.
   const blue=heads[0]
   if(!next.atoms.some(a=>a.kind==='diamond')){
    const yellowId=crypto.randomUUID()
    const yellow:Atom={id:yellowId,kind:'diamond',
     x:blue.x-width('diamond')-CONNECTOR_GAP,y:blue.y}
    next={atoms:[...next.atoms,yellow],bonds:[...next.bonds,
     {parent:yellowId,child:blue.id,relation:'sequence'}]}
   }
  }
  next=alignSequenceFamilyClearance(normalizeRoles(next))
  remoteCommit(next,id,kind==='triangle'?'Added red; yellow backfilled before the first blue without moving it.':
   kind==='circle'&&heads.length===0?'First blue circle added.':'Added next blue circle.')
  // Construction must never zoom or pan automatically. The user controls
  // the view via two-finger gestures and explicit fit/center commands.
 }
 function remoteAttach(parentId:string,kind:Kind){
  const before=currentDoc.current,parent=before.atoms.find(a=>a.id===parentId)
  if(!parent||before.atoms.length>=78){remoteNotice('Cannot add another shape here.');return}
  if(parent.kind==='triangle'&&kind==='hexagon'){
   const progress=nextRedOrangeRemoteStep(before,parent.id,():Atom=>({
    id:crypto.randomUUID(),kind:'hexagon',x:parent.x,y:parent.y+atomHeight(parent)+VERTICAL,variant:'small'
   }))
   if(!progress){
    remoteNotice('Red-orange progression supports 2 → 3 → 4 → 6 → 7; selected red is at an unsupported tier.');return
   }
   // The planner changes topology only. Canonical red support positioning,
   // companion sizes, lower X crossings and later-tier clearance remain here.
   const next=alignSequenceFamilyClearance(alignRedSupporters(normalizeRoles(progress.graph),parent.id))
   remoteCommit(next,parent.id,
    'Red has '+progress.after+' oranges'+(progress.reparented?' (third reorganized into second pair)':'')+'. Undo reverses this entire step.')
   return
  }
  const id=crypto.randomUUID()
  const incoming:Atom={id,kind,x:parent.x,y:parent.y+atomHeight(parent)+VERTICAL}
  const staged:Draft={atoms:[...before.atoms,incoming],bonds:[...before.bonds]}
  let host=parent
  let destination:{x:number;y:number}|null=null
  if(parent.kind==='circle'&&['square','rectangle','oval','hexagon'].includes(kind)){
   if(kind==='hexagon'&&!canAttachOrangeUnderObjectBlue(before,parent.id)){
    remoteNotice('This blue has no available direct orange-not slot.');return
   }
   if((kind==='square'||kind==='rectangle')&&blueSupportAtoms(before,parent.id).some(a=>a.kind===kind)){
    remoteNotice('This blue already has a '+(kind==='square'?'pink':'purple')+' supporter.');return
   }
   destination=supportPosition(parent,incoming,staged)
  }else if(parent.kind==='oval'&&kind==='hexagon'){
   let seen=new Set<string>(),tip=parent
   while(!seen.has(tip.id)){
    seen.add(tip.id)
    const childId=supportChildOfKind(before,tip.id,'hexagon')
    if(!childId)break
    tip=byId(before,childId)
   }
   host=tip
   if(host.kind==='oval'?!eligibleAdverbHost(before,host.id):
    !canExtendSupportChain(staged,host.id,'hexagon','oval','circle')){
    remoteNotice('No compatible green-adverb slot.');return
   }
   destination=nestedChildPosition(host,incoming)
  }else if(parent.kind==='square'&&kind==='hexagon'){
   if(!canAttachAdverbUnderPreposition(before,parent.id)){
    remoteNotice('Pink already has an adverb. More layers need a verified pink chain.');return
   }
   destination=nestedChildPosition(parent,incoming)
  }else if(parent.kind==='rectangle'&&kind==='rectangle'){
   let seen=new Set<string>(),tip=parent
   while(!seen.has(tip.id)){
    seen.add(tip.id)
    const childId=supportChildOfKind(before,tip.id,'rectangle')
    if(!childId)break
    tip=byId(before,childId)
   }
   host=tip
   if(!canNestPossessive(staged,id,host.id)){
    remoteNotice('No valid recursive purple attachment.');return
   }
   destination=nestedChildPosition(host,incoming)
  }else if(parent.kind==='hexagon'&&kind==='hexagon'){
   if(canExtendSupportChain(staged,host.id,'hexagon','oval','circle'))
    destination=nestedChildPosition(host,incoming)
  }
  if(!destination){remoteNotice('No verified '+kind+' attachment on '+parent.kind+'.');return}
  const snap:Snap={parent:host.id,child:id,relation:'support',
   dx:destination.x-incoming.x,dy:destination.y-incoming.y,
   distance:Math.hypot(destination.x-incoming.x,destination.y-incoming.y)}
  const next=resolveMagnet(staged,new Set([id]),snap)
  remoteCommit(next,parentId,'Attached '+kind+' to selected '+parent.kind+' with canonical STAX geometry.')
 }
 function remotePairedRedOrange(d:Draft,id:string):boolean{
  const target=d.atoms.find(a=>a.id===id)
  const parentId=parentOfSupport(d,id)
  const parent=parentId?d.atoms.find(a=>a.id===parentId):undefined
  return target?.kind==='hexagon'&&parent?.kind==='triangle'&&orangeChildren(d,parent.id).length===2
 }
 function remoteDetachSelected(){
  const before=currentDoc.current
  const id=remoteFocus.current
  if(!id||!before.atoms.some(a=>a.id===id)){remoteNotice('Select a piece before detaching.');return}
  if(remotePairedRedOrange(before,id)){
   remoteNotice('Two direct red oranges form a mandatory pair. Select another branch to detach; removing one would automatically recreate it.');return
  }
  const branch=descendants(before,id)
  const outside=before.bonds.filter(b=>branch.has(b.child)&&!branch.has(b.parent))
  if(!outside.length){
   remoteNotice('This piece is already a free root. Hold A and drag it anywhere.');return
  }
  // Match the existing double-tap detach mechanic: retain internal links,
  // remove ONLY incoming bonds, drop the branch clear, reflow the remainder.
  const separated:Draft={...before,bonds:before.bonds.filter(b=>!outside.includes(b))}
  const next=reflowAfterRemoval(translate(separated,branch,0,DROP_DISTANCE))
  remoteCommit(next,id,'Detached '+branch.size+' connected '+(branch.size===1?'piece':'pieces')+'. Hold A to move the free branch. Undo restores it.')
 }
 function remoteRemoveLastModifier(parentId:string){
  const d=currentDoc.current,parent=d.atoms.find(a=>a.id===parentId)
  if(!parent)return
  const childKind=parent.kind==='rectangle'?'rectangle':'hexagon'
  if(!['square','oval','rectangle'].includes(parent.kind)){
   remoteNotice('Select pink, green or purple to remove a nested modifier.');return
  }
  let tip=parent
  const seen=new Set<string>()
  while(!seen.has(tip.id)){
   seen.add(tip.id)
   const childId=supportChildOfKind(d,tip.id,childKind)
   if(!childId)break
   tip=byId(d,childId)
  }
  if(tip.id===parent.id){remoteNotice('No nested modifier to remove.');return}
  const next=reflowAfterRemoval({atoms:d.atoms.filter(a=>a.id!==tip.id),
   bonds:d.bonds.filter(b=>b.child!==tip.id&&b.parent!==tip.id)})
  remoteCommit(next,parentId,'Removed last '+childKind+' modifier. Undo restores it.')
 }
 function remoteModify(dir:RemoteDirection){
  const d=currentDoc.current
  const focused=remoteFocus.current??d.atoms.at(-1)?.id
  const target=focused?d.atoms.find(a=>a.id===focused):undefined
  if(!target){remoteNotice('First hold B and tap to create a blue circle.');return}
  if(target.kind==='circle'){
   const kind:Kind=dir==='left'?'square':dir==='up'?'rectangle':dir==='right'?'oval':'hexagon'
   remoteAttach(target.id,kind)
  }else if(target.kind==='triangle'&&dir==='down')remoteAttach(target.id,'hexagon')
  else if((target.kind==='square'||target.kind==='oval'||target.kind==='rectangle')&&dir==='down')
   remoteAttach(target.id,target.kind==='rectangle'?'rectangle':'hexagon')
  else if(dir==='up')remoteRemoveLastModifier(target.id)
  else remoteNotice('That swipe has no verified attachment for '+target.kind+'.')
 }
 function remoteNavigate(dir:RemoteDirection){
  const d=currentDoc.current,anchor=d.atoms.find(a=>a.id===remoteFocus.current)??d.atoms[0]
  if(!anchor)return
  const candidate=d.atoms.filter(a=>{
   if(a.id===anchor.id)return false
   const dx=(a.x+atomWidth(a)/2)-(anchor.x+atomWidth(anchor)/2)
   const dy=(a.y+atomHeight(a)/2)-(anchor.y+atomHeight(anchor)/2)
   return dir==='left'?dx< -12:dir==='right'?dx>12:dir==='up'?dy< -12:dy>12
  }).sort((a,b)=>{
   const cost=(p:Atom)=>{
    const dx=(p.x+atomWidth(p)/2)-(anchor.x+atomWidth(anchor)/2)
    const dy=(p.y+atomHeight(p)/2)-(anchor.y+atomHeight(anchor)/2)
    const primary=dir==='left'||dir==='right'?Math.abs(dx):Math.abs(dy)
    const secondary=dir==='left'||dir==='right'?Math.abs(dy):Math.abs(dx)
    return primary+secondary*2
   }
   return cost(a)-cost(b)
  })[0]
  if(candidate){remoteSelect(candidate.id);remoteNotice('Selected '+candidate.kind+'.')}
  else remoteNotice('No shape '+dir+' of this '+anchor.kind+'.')
 }
 function remoteHandle(input:RemoteInput){
  if(!remoteSandbox)return
  const d=currentDoc.current
  if(input.type==='move'){
   const drag=remoteDrag.current,id=remoteFocus.current
   if(!drag||!id||!d.atoms.some(a=>a.id===id))return
   const rect=svg.current?.getBoundingClientRect()
   const ratio=currentView.current.width/(rect?.width||960)
   const dx=Math.max(-90,Math.min(90,input.dx))*ratio,dy=Math.max(-90,Math.min(90,input.dy))*ratio
   if(dx||dy){update(translate(d,molecule(d,id),dx,dy));drag.changed=true}
   return
  }
  if(input.type==='view'){
   const v=currentView.current,rect=svg.current?.getBoundingClientRect()
   const ratio=v.width/(rect?.width||960)
   const scale=Number.isFinite(input.scale)?Math.max(.8,Math.min(1.25,input.scale)):1
   const nextWidth=Math.max(W*.25,Math.min(W*8,v.width/scale))
   const nextHeight=nextWidth/aspect()
   setCamera({x:v.x+(v.width-nextWidth)/2-input.dx*ratio,
    y:v.y+(v.height-nextHeight)/2-input.dy*ratio,width:nextWidth,height:nextHeight})
   return
  }
  switch(input.action){
   case 'spine':remoteSpine();break
   case 'modify':if(input.dir)remoteModify(input.dir);break
   case 'navigate':if(input.dir)remoteNavigate(input.dir);break
   case 'select':{
    if(remoteFocus.current){remoteSelect(null);remoteNotice('Selection cleared. Swipe to focus another piece.')}
    else remoteNotice('Nothing selected. Swipe to choose a piece.')
    break
   }
   case 'move_start':remoteDrag.current={before:d,changed:false};break
   case 'move_end':{
    const drag=remoteDrag.current;remoteDrag.current=null
    if(drag?.changed){setHistory(h=>[...h,drag.before].slice(-40));remoteRedo.current=[]}
    break
   }
   case 'theme_next':case 'theme_prev':{
    const offset=input.action==='theme_next'?1:-1
    setTheme(previous=>STAX_THEMES[(STAX_THEMES.indexOf(previous)+offset+STAX_THEMES.length)%STAX_THEMES.length])
    break
   }
   case 'undo':{
    const before=history.at(-1)
    if(before){remoteRedo.current.push(d);setHistory(h=>h.slice(0,-1));update(before);
     remoteSelect(before.atoms.some(a=>a.id===remoteFocus.current)?remoteFocus.current:before.atoms.at(-1)?.id??null)}
    break
   }
   case 'redo':{
    const next=remoteRedo.current.pop()
    if(next){setHistory(h=>[...h,d].slice(-40));update(next);
     remoteSelect(next.atoms.some(a=>a.id===remoteFocus.current)?remoteFocus.current:next.atoms.at(-1)?.id??null)}
    break
   }
   case 'detach':remoteDetachSelected();break
   case 'delete_arm':{
    const id=remoteFocus.current
    if(!id||!d.atoms.some(a=>a.id===id)){
     remoteNotice('Select a piece before deleting.');break
    }
    remoteDeleteArmed.current=true;remoteDeleteTarget.current=id
    const size=descendants(d,id).size
    remoteNotice('Delete selected branch ('+size+' '+(size===1?'piece':'pieces')+')? Hold A-Shift and tap to confirm; swipe up to cancel.')
    break
   }
   case 'delete_cancel':remoteDeleteArmed.current=false;remoteDeleteTarget.current=null;remoteNotice('Deletion cancelled.');break
   case 'delete_confirm':{
    const id=remoteFocus.current
    if(!remoteDeleteArmed.current||remoteDeleteTarget.current!==id||!id)return
    remoteDeleteArmed.current=false;remoteDeleteTarget.current=null
    if(remotePairedRedOrange(d,id)){
     remoteNotice('Cannot remove one mandatory red-orange partner. Undo its construction step instead.');return
    }
    const branch=descendants(d,id)
    const incoming=d.bonds.find(b=>b.child===id&&!branch.has(b.parent))
    const next=reflowAfterRemoval({atoms:d.atoms.filter(a=>!branch.has(a.id)),
     bonds:d.bonds.filter(b=>!branch.has(b.child)&&!branch.has(b.parent))})
    const nextFocus=incoming&&next.atoms.some(a=>a.id===incoming.parent)?incoming.parent:next.atoms.at(-1)?.id??null
    remoteCommit(next,nextFocus,'Deleted '+branch.size+' selected '+(branch.size===1?'piece':'pieces')+'. Undo restores the branch.')
    break
   }
   case 'center':{
    const a=d.atoms.find(a=>a.id===remoteFocus.current)
    if(a){const v=currentView.current;setCamera({...v,
     x:a.x+atomWidth(a)/2-v.width/2,y:a.y+atomHeight(a)/2-v.height/2})}
    break
   }
   case 'fit':setCamera(fit(d,aspect()));break
   case 'zoom_in':case 'zoom_out':{
    const v=currentView.current,factor=input.action==='zoom_in'?.84:1.19
    setCamera({...v,x:v.x+v.width*(1-factor)/2,y:v.y+v.height*(1-factor)/2,
     width:v.width*factor,height:v.height*factor})
    break
   }
   case 'reset':remoteRedo.current=[];remoteFocus.current=null;setHistory([]);update(empty());setCamera(classroomWoodDefaultView);
    remoteSelect(null);remoteNotice('Demo reset. Hold B and tap to add blue.');break
   case 'seed':{
    if(d.atoms.length)remoteNotice('Use B-tap to extend the current sentence, or reset first.')
    else {remoteSpine()}
    break
   }
   default:break
  }
 }
 useEffect(()=>{
  if(!remoteInputRef||!remoteSandbox)return
  remoteInputRef.current=remoteHandle
  return ()=>{remoteInputRef.current=null}
 })
 const questionMarker=questActive&&activeQuestLevel===2&&questTwoSide==='question'?questTwoHPosition(doc):null
 const questTwoHarvest=questActive&&activeQuestLevel===2?harvestQuestTwo(questTwoSide,questTwoTaps,questTwoContracted):null
 const viewPercentX=(x:number)=>`${(x-view.x)/view.width*100}%`
 const viewPercentY=(y:number)=>`${(y-view.y)/view.height*100}%`
 return <div ref={rootRef} className="stax-molecule-ui" style={shadowCssVars} data-theme={theme} data-remote-sandbox={remoteSandbox?'true':'false'} data-original-pollen={pollenAnimated?'true':'false'}>
  <button className="stax-tray-handle" type="button" data-skin-mode={skinButtonActive?'true':'false'} aria-label={skinButtonActive?'Skin selection: slide left or right':trayOpen?'Close workspace controls':'Open workspace controls'} aria-controls="stax-bottom-tray" aria-expanded={trayOpen}
    onPointerDown={skinButtonDown} onPointerUp={skinButtonEnd} onPointerCancel={skinButtonEnd}
    onClick={()=>{if(suppressMenuClick.current){suppressMenuClick.current=false;return}setTrayOpen(v=>!v);setTrayActivity(n=>n+1)}}><span aria-hidden="true">{trayOpen?'‹':'›'}</span></button>
  <div id="stax-bottom-tray" className="stax-molecule-dock" data-open={trayOpen?'true':'false'} aria-label="STAX workspace controls" aria-hidden={!trayOpen}
    onPointerEnter={openTray} onPointerDownCapture={openTray} onFocusCapture={openTray} onWheel={openTray}>
   <div className="stax-molecule-tools">
    <button className="stax-molecule-back" onClick={onBack} title="Back to Classic Shape Lab" aria-label="Back to Classic Shape Lab"><StaxToolbarIcon name="back"/></button>
    <div className="stax-molecule-buttons">
     <button onClick={toggleFullscreen} title={fullscreen?"Exit full screen":"Full screen"} aria-label={fullscreen?"Exit full screen":"Go full screen"}><StaxToolbarIcon name={fullscreen?'shrink':'expand'}/></button>
     <button onClick={()=>loadQuest(21)} title="Load Quest Level 21" aria-label="Load Quest 21">Q21</button>
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
      <button type="button" className="stax-remote-button" title="Open phone trackpad experiment without clearing your STAX board"
       aria-label="Toggle phone trackpad experiment on" onClick={onRemoteTest}>Remote · Off</button>
      <button type="button" className="stax-sound-button"
       onClick={()=>setSoundLabOpen(v=>!v)}
       aria-label="Foam sound lab" title="Foam sound lab" aria-expanded={soundLabOpen} aria-controls="stax-sound-panel">Sound</button>
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
  {soundLabOpen&&<section className="stax-sound-panel" id="stax-sound-panel" role="region" aria-label="Foam sound lab">
    <div className="stax-sound-panel-header">
     <strong>Foam sound lab</strong>
     <button type="button" onClick={()=>setSoundLabOpen(false)} aria-label="Close sound lab">×</button>
    </div>
    <label className="stax-foam-sound-option">
     <input type="checkbox" checked={foamSoundEnabled} onChange={e=>setFoamSoundEnabled(e.target.checked)}/>
     Foam sliding sound
    </label>
    <label htmlFor="stax-foam-sound-preset">Surface material</label>
    <select id="stax-foam-sound-preset" value={foamSoundPreset}
     onChange={e=>{setFoamSoundPreset(safeFoamSoundId(e.target.value));foamAudio.current?.stop()}}>
     {FOAM_SLIDE_SOUNDS.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}
    </select>
    <div id="stax-sound-lab" className="stax-sound-lab" role="region" aria-label="Synthesized sliding sound lab">
     {([
      {key:'pitch',title:'Pitch',min:50,max:200,low:'Lower',high:'Higher'},
      {key:'brightness',title:'Brightness',min:40,max:200,low:'Darker',high:'Crisper'},
      {key:'texture',title:'Texture',min:0,max:200,low:'Smooth',high:'Grainy'},
      {key:'volume',title:'Volume',min:0,max:200,low:'Silent',high:'Louder'},
     ] as const).map(control=><div className="stax-sound-lab-control" key={control.key}>
      <label htmlFor={'stax-sound-'+control.key}>{control.title}
       <output htmlFor={'stax-sound-'+control.key}>{foamSoundTuning[control.key]}%</output>
      </label>
      <input type="range" id={'stax-sound-'+control.key} min={control.min} max={control.max} step="5"
       value={foamSoundTuning[control.key]} disabled={!foamSoundEnabled||theme!=='classroom-foam'}
       onChange={e=>setFoamSoundTuning(v=>({...v,[control.key]:Number(e.target.value)}))}/>
      <div className="stax-sound-scale"><span>{control.low}</span><span>{control.high}</span></div>
     </div>)}
     <div className="stax-sound-lab-actions">
      <button type="button" disabled={!foamSoundEnabled||theme!=='classroom-foam'}
       onClick={()=>audio().preview(foamSoundPreset)}>Preview tuned sound</button>
      <button type="button" onClick={()=>setFoamSoundTuning({...DEFAULT_FOAM_SOUND_TUNING})}>Reset tuning</button>
     </div>
     <small>Saved automatically. Drag a foam piece to hear your changes.</small>
    </div>
   </section>}
  {selected&&doc.atoms.some(a=>a.id===selected)&&<label className="stax-shape-word-editor" htmlFor="stax-selected-shape-word">
   <span>Shape word</span>
   <input id="stax-selected-shape-word" type="text" maxLength={36}
    placeholder="Enter a word…" value={doc.atoms.find(a=>a.id===selected)?.word??''}
    onFocus={()=>{textEditBefore.current=currentDoc.current}}
    onChange={e=>setSelectedShapeWord(e.target.value)}
    onBlur={finishShapeTextEdit}/>
  </label>}
  <div className="stax-quest-nav">
   <button className="stax-quest-tab" type="button" aria-expanded={questPanelOpen} aria-controls="stax-quest-panel"
    onClick={()=>setQuestPanelOpen(v=>!v)}>STAX Quest · {chosenQuestLevel}/100</button>
   {questPanelOpen&&<div id="stax-quest-panel" className="stax-quest-panel" role="region" aria-label="STAX Quest level selection">
    <label htmlFor="stax-quest-level">Choose a level</label>
    <select id="stax-quest-level" value={chosenQuestLevel} onChange={e=>setChosenQuestLevel(Number(e.target.value))}>
     {STAX_QUEST_LEVELS.map(item=><option key={item.level} value={item.level}>Level {item.level} — {item.sentence}</option>)}
    </select>
    <p className="stax-quest-sentence">{staxQuestLevel(chosenQuestLevel)?.sentence}</p>
    <div className="stax-quest-actions">
     <button type="button" onClick={()=>setChosenQuestLevel(n=>Math.max(1,n-1))} disabled={chosenQuestLevel===1}>Previous</button>
     <button type="button" onClick={()=>loadQuest(chosenQuestLevel)}>{chosenQuestLevel===2?'Play 4B / 5':chosenQuestLevel<=10||chosenQuestLevel===21?'Load map':'Start blank map'}</button>
     <button type="button" onClick={()=>setChosenQuestLevel(n=>Math.min(100,n+1))} disabled={chosenQuestLevel===100}>Next</button>
    </div>
    {staxQuestLevel(chosenQuestLevel)?.youtubeUrl&&<a href={staxQuestLevel(chosenQuestLevel)!.youtubeUrl!} target="_blank" rel="noopener noreferrer">Watch original Quest video</a>}
    {chosenQuestLevel>10&&chosenQuestLevel!==21&&<small>Original sentence available; shape map not yet authored.</small>}
    {chosenQuestLevel===6&&<small>Level 6 map uses “My name is Ashley.” Learner-name personalization can follow later.</small>}
   </div>}
  </div>
  {questActive&&activeQuestLevel!==null&&<p className="stax-molecule-example">STAX QUEST · Level {activeQuestLevel} {activeQuestLevel===2?'· '+(questTwoSide==='question'?'4B question':'5 answer'):'— '+(activeQuestLevel===6?'My name is Ashley.':staxQuestLevel(activeQuestLevel)?.sentence)} {(activeQuestLevel<=10||activeQuestLevel===21)&&<small>Editable draft; teacher confirmation required before assessment.</small>}</p>}
  {questActive&&activeQuestLevel===2&&<section className="stax-quest2-panel" aria-label="STAX Quest Level 2 question and answer">
   <div className="stax-quest2-modes">
    <button type="button" aria-pressed={questTwoSide==='question'} onClick={()=>changeQuestTwoSide('question')}>4B · Question</button>
    <button type="button" aria-pressed={questTwoSide==='answer'} onClick={()=>changeQuestTwoSide('answer')}>5 · Answer</button>
   </div>
   <div className="stax-quest2-output" role="status" aria-live="polite">
    {questTwoHarvest?<strong>{questTwoHarvest}</strong>:<span>{questTwoSide==='question'?'Tap H → red → blue':'Tap I → red → ok'} <em>{questTwoTaps.length}/3</em></span>}
   </div>
   <div className="stax-quest2-actions">
    {questTwoSide==='answer'&&<button type="button" onClick={toggleQuestTwoContraction} aria-pressed={questTwoContracted}>Contraction: {questTwoContracted?"I'm":'I am'}</button>}
    <button type="button" onClick={()=>{setQuestTwoTaps([]);setHint('Tap the three targets in order.')}}>Try again</button>
   </div>
   {questTwoSide==='answer'&&<small>Touch blue I and red SMR together to toggle. Move two fingers to zoom.</small>}
  </section>}
  <div className="stax-molecule-canvas">
   <svg ref={svg} viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} aria-label="STAX freely movable magnetic workspace" onWheel={wheelZoom} onPointerDownCapture={downTouch} onPointerMoveCapture={moveTouch} onPointerUpCapture={endTouch} onPointerCancelCapture={endTouch} onPointerDown={downBackground} onPointerMove={moveBackground} onPointerUp={upBackground} onPointerCancel={upBackground}>
    {theme==='golden-line'&&<MetallicGoldStroke id="stax-golden-board"/>}
     {hasStaxMaterial(theme)&&<StaxMaterialDefs prefix="stax-mat-board"/>}
     {theme==='classroom-foam'&&<defs>
      {/* Seam-to-seam slat crop, repeated as normal wood + horizontal mirror.
          This image is world-anchored within the SAME SVG viewBox as every
          chip: pan and pinch-zoom never break the physical tabletop illusion.
          The mirrored 2-panel strip joins at matching wood-grain edges. */}
      <pattern id="stax-classroom-wood-world" patternUnits="userSpaceOnUse"
       x="0" y="0" width="2304" height="411" patternContentUnits="userSpaceOnUse">
       <image href="/stax-foam/wood-desk-mirrored.webp"
        x="0" y="0" width="2304" height="411"
        preserveAspectRatio="none" pointerEvents="none"/>
      </pattern>
     </defs>}
    <rect data-board-background="true" x={view.x} y={view.y} width={view.width} height={view.height} fill={theme==='classroom-foam'?'url(#stax-classroom-wood-world)':theme==='arc-reactor'||theme==='hologram'||theme==='cosmic'||theme==='golden-line'||(theme==='pearlescent-glass'||theme==='pearlescent-airglass'||theme==='pearlescent-dusk')||hasStaxMaterial(theme)?'transparent':staxBoardColor(theme)}/>
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
       selected===a.id?'stax-selected-atom':'',
       (paletteHover?.snap&&(paletteHover.snap.parent===a.id||paletteHover.snap.child===a.id))||
       (preview&&dragging.current&&!molecule(doc,dragging.current.id).has(a.id)&&(preview.parent===a.id||preview.child===a.id))?'stax-resonant-target':''
      ].filter(Boolean).join(' ')}
      tabIndex={questActive&&activeQuestLevel===2?0:undefined} role={questActive&&activeQuestLevel===2?'button':undefined} aria-label={questActive&&activeQuestLevel===2?'Tap '+wordOnAtom(a):undefined}
      onKeyDown={e=>{if(questActive&&activeQuestLevel===2&&(e.key==='Enter'||e.key===' ')){e.preventDefault();questTwoTap(a.id)}}}
      onPointerDown={e=>onShapeDown(e,a.id)} onPointerMove={onShapeMove} onPointerUp={releaseShape} onPointerCancel={()=>{foamAudio.current?.stop();dragging.current=null}} style={{touchAction:'none',cursor:'grab'}}> 
      {selected===a.id&&theme!=='classroom-foam'&&<g className="stax-selection-glow-outline" aria-hidden="true" pointerEvents="none">
       <Glyph kind={a.kind} w={atomWidth(a)} h={atomHeight(a)} fill="none" stroke="#fffdf6" strokeWidth={4}/>
      </g>}
      <Glyph kind={a.kind} w={atomWidth(a)} h={atomHeight(a)}
        fill={(theme==='pearlescent-glass'||theme==='pearlescent-airglass'||theme==='pearlescent-dusk'||theme==='classroom-foam')?(a.omitted?'#e9ddf71f':'#ffffff01'):materialFill(theme,'stax-mat-board',SYMBOLS[a.kind].color)}
        stroke={(theme==='pearlescent-glass'||theme==='pearlescent-airglass'||theme==='pearlescent-dusk'||theme==='classroom-foam')?(a.omitted?'#a891c1':'#ffffff01'):theme==='golden-line'?'url(#stax-golden-board)':materialStroke(theme,'stax-mat-board',SYMBOLS[a.kind].color)}
        strokeWidth={hasStaxMaterial(theme)?4:3} strokeDasharray={staxOmissionDash(a.omitted)}/>
       <StaxMaterialEffect theme={theme} kind={a.kind} w={atomWidth(a)} h={atomHeight(a)} seed={a.id} omitted={a.omitted} animated={pollenAnimated}/>
       {theme==='pearlescent-glass'&&<PearlescentGlass kind={a.kind} w={atomWidth(a)} h={atomHeight(a)} omitted={a.omitted}/>}
        {theme==='pearlescent-airglass'&&<PearlescentAirglass kind={a.kind} w={atomWidth(a)} h={atomHeight(a)} omitted={a.omitted}/>}
      {theme==='pearlescent-dusk'&&<PearlescentAirglass kind={a.kind} w={atomWidth(a)} h={atomHeight(a)} omitted={a.omitted} dusk/>}
      {theme==='classroom-foam'&&<FoamChip kind={a.kind} w={atomWidth(a)} h={atomHeight(a)} omitted={a.omitted}/>} 
      {wordOnAtom(a)&&<text x={atomWidth(a)/2} y={atomHeight(a)/2} dominantBaseline="middle" fontFamily={'"Trebuchet MS","Noto Sans",system-ui,sans-serif'}
        fontSize={Math.min(22,Math.max(13,atomHeight(a)*.29),(atomWidth(a)-12)/Math.max(1,wordOnAtom(a).length*.56))}
         fill={theme==='classroom-foam'?'#3b2d22':(theme==='pearlescent-glass'||theme==='pearlescent-airglass'||theme==='pearlescent-dusk')?'#3f354c':theme==='golden-line'||hasStaxMaterial(theme)?'#fff0c8':theme==='blueprint'||theme==='black'||theme==='arc-reactor'||theme==='hologram'||theme==='cosmic'?'#edf9ff':'#253c55'} fontWeight={700} textAnchor="middle" pointerEvents="none">{wordOnAtom(a)}</text>}
    </g>)}
   </svg>
   {questionMarker&&<button className="stax-quest2-h" type="button" aria-label="H interrogative marker, tap to ask How" title="H means How" style={{left:viewPercentX(questionMarker.x),top:viewPercentY(questionMarker.y)}} onClick={()=>questTwoTap('H')}>H</button>}
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
  <p className="stax-molecule-note">Shape sizes adapt to their attachment. Shapes lift above your finger during touch-drag; eligible magnets glow. Any color can remain loose for exploration. One finger moves atoms or pans; pinch with two fingers to zoom. Hold the menu button and swipe up on the board with another finger, then left/right to change skins. Three fingers are reserved. Drag the background to pan. Nearby compatible shapes snap on release; remote shapes never move. Double-tap a child to detach and drop its branch. Saved locally. Pink/purple support blue; blue/yellow connect horizontally in either order; red/blue keep the staircase.</p>
 </div>
}
