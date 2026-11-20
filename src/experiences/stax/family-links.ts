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
