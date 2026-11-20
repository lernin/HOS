/**
 * STAX family graph queries. Shapes remain free objects until a valid bond is
 * formed; graph structure (not the reading-order predecessor) defines family.
 *
 * Intentionally generic: the same helpers can serve future purple possession,
 * nested blue containers and bridge families. This does not assign orange roles
 * from color alone or guess the meaning of an unattached hexagon.
 */
export type FamilyNode = { id:string; kind:string }
export type FamilyEdge = { parent:string; child:string; relation:string }
export type FamilyGraph = {
 atoms:readonly FamilyNode[]
 bonds:readonly FamilyEdge[]
}

export function supportParent(graph:FamilyGraph,id:string):string|undefined {
 return graph.bonds.find(b=>b.relation==='support'&&b.child===id)?.parent
}
export function supportChildOfKind(graph:FamilyGraph,id:string,kind:string):string|undefined {
 return graph.bonds.find(b=>b.relation==='support'&&b.parent===id&&
  graph.atoms.some(a=>a.id===b.child&&a.kind===kind))?.child
}

/**
 * Follow a repeated shape family upward until its actual grammatical root.
 * rootOwnerKind ensures an isolated adjective (or another loose shape) cannot
 * silently receive a family bond that requires a noun head.
 *
 * Only support bonds count: sentence order and 'n' new-family boundaries
 * are NOT themselves magnetic relationships.
 */
export function rootedSupportChain(
 graph:FamilyGraph,startId:string,chainKind:string,rootKind:string,rootOwnerKind:string
):string|null {
 const visited=new Set<string>()
 let id:string|undefined=startId
 while(id&&!visited.has(id)&&visited.size<=graph.atoms.length){
  visited.add(id)
  const node=graph.atoms.find(a=>a.id===id)
  if(!node)return null
  if(node.kind===rootKind){
   const ownerId=supportParent(graph,id)
   return graph.atoms.some(a=>a.id===ownerId&&a.kind===rootOwnerKind)?id:null
  }
  if(node.kind!==chainKind)return null
  id=supportParent(graph,id)
 }
 return null
}

/** Append a same-kind nested modifier only after a rooted parent exists.
 * Each modifier has ONE direct modifier child; deeper depth is unrestricted.
 */
export function canExtendSupportChain(
 graph:FamilyGraph,parentId:string,chainKind:string,rootKind:string,rootOwnerKind:string
):boolean {
 if(graph.atoms.find(a=>a.id===parentId)?.kind!==chainKind)return false
 return rootedSupportChain(graph,parentId,chainKind,rootKind,rootOwnerKind)!==null&&
  !supportChildOfKind(graph,parentId,chainKind)
}

/** Keep sibling order as the user assembles the family.
 * A general blue supporter can follow an existing orange supporter; this
 * applies ONLY if that orange is a direct blue child, never below red.
 */
export function canFollowBlueOrange(
 graph:FamilyGraph,movingId:string,orangeId:string
):string|null {
 const moving=graph.atoms.find(a=>a.id===movingId)
 const orange=graph.atoms.find(a=>a.id===orangeId)
 if(!moving||!orange||orange.kind!=='hexagon'||
  !['square','rectangle','oval'].includes(moving.kind)||
  supportParent(graph,movingId))return null
 const blueId=supportParent(graph,orangeId)
 if(graph.atoms.find(a=>a.id===blueId)?.kind!=='circle')return null
 const brothers=graph.bonds.filter(b=>b.relation==='support'&&b.parent===blueId)
 if(brothers.at(-1)?.child!==orangeId)return null
 // Pink and purple are unique at this level; green may repeat.
 if(moving.kind!=='oval'&&brothers.some(b=>
  graph.atoms.find(a=>a.id===b.child)?.kind===moving.kind))return null
 return blueId!
}

/** Find the largest actual assembled molecule (support, sequence, or pair).
 * A selected member resolves equal-sized ties; otherwise the earliest
 * assembled component wins. When no bond exists, do nothing: there isn't
 * a uniquely useful assembled map to keep.
 */
export function largestAssembledFamily(
 graph:FamilyGraph,preferredId?:string|null
):Set<string>|null {
 const neighbors=new Map(graph.atoms.map(a=>[a.id,new Set<string>()]))
 for(const b of graph.bonds){
  if(!neighbors.has(b.parent)||!neighbors.has(b.child))continue
  neighbors.get(b.parent)!.add(b.child)
  neighbors.get(b.child)!.add(b.parent)
 }
 const seen=new Set<string>()
 let best:string[]=[]
 for(const atom of graph.atoms){
  if(seen.has(atom.id))continue
  const component:string[]=[]
  const queue=[atom.id]
  seen.add(atom.id)
  for(let i=0;i<queue.length;i++){
   const id=queue[i]
   component.push(id)
   for(const next of neighbors.get(id)??[]){
    if(!seen.has(next)){seen.add(next);queue.push(next)}
   }
  }
  if(component.length>best.length||
   (component.length===best.length&&!!preferredId&&
    component.includes(preferredId)&&!best.includes(preferredId)))best=component
 }
 return best.length>1?new Set(best):null
}

/** Object-blue support row uses semantic word order, not attachment order.
 * Direct orange means "not" and must precede pink, purple, and green even
 * when inserted last. Nested orange under pink/green is never a row child.
 */
export function normalizeBlueSiblingOrder<T extends FamilyNode>(row:readonly T[]):T[] {
 const copy=[...row]
 for(let i=0;i<copy.length;i++){
  if(copy[i].kind!=='rectangle')continue
  const earliestGreen=copy.findIndex((n,j)=>j<i&&n.kind==='oval')
  if(earliestGreen>=0){
   const [purple]=copy.splice(i,1)
   copy.splice(earliestGreen,0,purple)
  }
 }
 // Pink prepositions enter before the determiner/adjective phrase even
 // when the pink is added after an already assembled orange-purple-green row.
 // Existing direct blue orange ("not") remains the leading support.
 for(let i=0;i<copy.length;i++){
  if(copy[i].kind!=='square')continue
  const firstLater=copy.findIndex((n,j)=>j<i&&(n.kind==='rectangle'||n.kind==='oval'))
  if(firstLater>=0){
   const [pink]=copy.splice(i,1)
   copy.splice(firstLater,0,pink)
  }
 }
 // "this is not in Vancouver": late "not" moves ahead of pink.
 for(let i=1;i<copy.length;i++){
  if(copy[i].kind==='hexagon'){
   const [orange]=copy.splice(i,1)
   copy.unshift(orange)
   break
  }
 }
 return copy
}

/** An orange direct under blue is an object-family "not" slot,
 * never an independent subject-family modifier.
 */
export function canAttachOrangeUnderObjectBlue(graph:FamilyGraph,blueId:string):boolean {
 if(!canAttachOrangeUnderBlue(graph,blueId))return false
 return !graph.bonds.some(b=>b.relation==='sequence'&&b.parent===blueId&&
  graph.atoms.some(a=>a.id===b.child&&a.kind==='triangle'))
}

/** A preposition may have its own adverb below it (always on the TV).
 * This is different from a direct blue-headed "not" slot.
 */
export function canAttachAdverbUnderPreposition(graph:FamilyGraph,pinkId:string):boolean {
 if(graph.atoms.find(a=>a.id===pinkId)?.kind!=='square')return false
 const blueId=supportParent(graph,pinkId)
 if(graph.atoms.find(a=>a.id===blueId)?.kind!=='circle')return false
 return !supportChildOfKind(graph,pinkId,'hexagon')
}

/** Recursive purple possessive family, rooted in a blue noun/pronoun head.
 * Support relationships are real parentage, not mere sentence adjacency.
 */
export function canNestPossessive(
 graph:FamilyGraph,movingId:string,parentId:string
):boolean {
 const moving=graph.atoms.find(a=>a.id===movingId)
 const parent=graph.atoms.find(a=>a.id===parentId)
 if(moving?.kind!=='rectangle'||parent?.kind!=='rectangle'||movingId===parentId||
  supportParent(graph,movingId)||supportChildOfKind(graph,parentId,'rectangle'))return false
 const seen=new Set<string>()
 let current=parentId
 while(!seen.has(current)){
  seen.add(current)
  const owner=supportParent(graph,current)
  if(!owner)return false
  const ownerKind=graph.atoms.find(a=>a.id===owner)?.kind
  if(ownerKind==='circle')return true
  if(ownerKind!=='rectangle')return false
  current=owner
 }
 return false
}

/** Each red directly hosts a pair of orange positions when its first orange
 * bonds. No lexical role is inferred for the second slot: both gate/not and
 * bridge/to were described by the owner, so guessing would be incorrect.
 */
export function withRedCompanion<T extends FamilyNode, E extends FamilyEdge>(
 graph:{atoms:T[];bonds:E[]},redId:string,makeAtom:(id:string)=>T
):{atoms:T[];bonds:E[]} {
 if(graph.atoms.find(a=>a.id===redId)?.kind!=='triangle')return graph
 const direct=graph.bonds.filter(b=>b.relation==='support'&&b.parent===redId&&
  graph.atoms.some(a=>a.id===b.child&&a.kind==='hexagon'))
 // The persisted workspace accepts at most 80 shapes; do not silently
 // create a partner that makes the saved board invalid on reload.
 if(direct.length!==1||graph.atoms.length>=80)return graph
 const partnerId='red-companion-'+direct[0].child
 if(graph.atoms.some(a=>a.id===partnerId))return graph
 return {
  atoms:[...graph.atoms,makeAtom(partnerId)],
  bonds:[...graph.bonds,{parent:redId,child:partnerId,relation:'support'} as E],
 }
}

/** The third orange is nested beneath the RIGHT red-supported orange,
 * never added as a third direct child of the red triangle.
 */
export function canNestRightRedOrange(
 graph:FamilyGraph,movingId:string,parentId:string
):boolean {
 if(graph.atoms.find(a=>a.id===movingId)?.kind!=='hexagon'||
  graph.atoms.find(a=>a.id===parentId)?.kind!=='hexagon'||
  movingId===parentId||supportParent(graph,movingId)||
  supportChildOfKind(graph,parentId,'hexagon'))return false
 const redId=supportParent(graph,parentId)
 if(graph.atoms.find(a=>a.id===redId)?.kind!=='triangle')return false
 const oranges=graph.bonds.filter(b=>b.relation==='support'&&b.parent===redId&&
  graph.atoms.find(a=>a.id===b.child)?.kind==='hexagon')
 return oranges.length===2&&oranges[1].child===parentId
}


/**
 * Orange tiers beneath RED verbs are grammatical families, not reading-order
 * neighbors. A paired tier has exactly two side-by-side orange members:
 *   - the LEFT member can open the next paired bridge/gate tier;
 *   - the RIGHT member can hold a single modifier (or insert above one).
 * An orange below a singleton can continue the same modifier chain.
 * The caller never guesses labels such as "to", "not" or "really".
 */
export type OrangeTierSlot = 'left-pair'|'right-modifier'|'modifier-chain'
export function orangeTierChildren(graph:FamilyGraph,parentId:string):string[] {
 return graph.bonds.filter(b=>b.parent===parentId&&b.relation==='support'&&
  graph.atoms.some(a=>a.id===b.child&&a.kind==='hexagon')).map(b=>b.child)
}
export function orangeRootedInRed(graph:FamilyGraph,parentId:string):boolean {
 if(graph.atoms.find(a=>a.id===parentId)?.kind!=='hexagon')return false
 const seen=new Set<string>()
 let current=parentId
 while(!seen.has(current)){
  seen.add(current)
  const ancestor=supportParent(graph,current)
  const kind=graph.atoms.find(a=>a.id===ancestor)?.kind
  if(kind==='triangle')return true
  if(kind!=='hexagon')return false
  current=ancestor!
 }
 return false
}
export function eligibleOrangeTierSlot(graph:FamilyGraph,movingId:string,parentId:string):OrangeTierSlot|null {
 if(graph.atoms.find(a=>a.id===movingId)?.kind!=='hexagon'||
    graph.atoms.find(a=>a.id===parentId)?.kind!=='hexagon'||
    movingId===parentId||supportParent(graph,movingId)||
    !orangeRootedInRed(graph,parentId))return null
 const owner=supportParent(graph,parentId)!
 const siblings=orangeTierChildren(graph,owner)
 const index=siblings.indexOf(parentId)
 const existing=orangeTierChildren(graph,parentId)
 if(index<0||existing.length>1)return null
 // A pair's RIGHT orange can host one lower orange. All pieces retain
 // their existing locations/identity; the user assigns meaning later.
 if(siblings.length===2&&index===1)return existing.length===0?'right-modifier':null
 // A pair's LEFT orange can grow a further paired tier.
 if(siblings.length===2&&index===0)return existing.length===0?'left-pair':null
 // Repeated adverb chains stack downwards like nested purple rectangles.
 if(siblings.length===1&&index===0)return existing.length===0?'modifier-chain':null
 return null
}
/** One direct orange ("not") slot per object blue. Existing green or pink
 * supports do not block late insertion; the row is normalized before them.
 * Orange nested beneath pink/green is a separate grammatical relationship.
 */
export function canAttachOrangeUnderBlue(graph:FamilyGraph,blueId:string):boolean {
 if(graph.atoms.find(a=>a.id===blueId)?.kind!=='circle')return false
 return !graph.bonds.some(b=>b.relation==='support'&&b.parent===blueId&&
  graph.atoms.some(a=>a.id===b.child&&a.kind==='hexagon'))
}
