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
