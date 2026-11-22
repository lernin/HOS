/** Deterministic eyes-free STAX selection order.
 * Each sentence head (yellow, blue, red, etc.) is a family; its attached
 * supporters and nested descendants scan bottom-up, left-to-right in rows,
 * followed by the head. Then move to the next head in sentence sequence.
 * Works on geometry only; does not mutate grammar or view state.
 */
export type ScanAtom={id:string;kind:string;x:number;y:number}
export type ScanBond={parent:string;child:string;relation:string}
export type ScanGraph={atoms:readonly ScanAtom[];bonds:readonly ScanBond[]}
function familyOrder(atoms:{atom:ScanAtom;depth:number}[]):ScanAtom[]{
 // Deepest descendants first, then left-to-right within the same level.
 // Family depth avoids unreliable raw y comparisons between unequal shapes.
 return atoms.sort((a,b)=>b.depth-a.depth||a.atom.x-b.atom.x||a.atom.y-b.atom.y||
  a.atom.id.localeCompare(b.atom.id)).map(item=>item.atom)
}
export function sequentialScanOrder(graph:ScanGraph):string[]{
 const lookup=new Map(graph.atoms.map(a=>[a.id,a]))
 const successors=new Map<string,string[]>()
 const previous=new Set<string>()
 const supporters=new Set<string>()
 for(const edge of graph.bonds){
  if(edge.relation!=='sequence'||!lookup.has(edge.parent)||!lookup.has(edge.child))continue
  const list=successors.get(edge.parent)??[]
  if(!list.includes(edge.child))list.push(edge.child)
  successors.set(edge.parent,list);previous.add(edge.child)
 }
 for(const edge of graph.bonds)if((edge.relation==='support'||edge.relation==='pair')&&lookup.has(edge.child))supporters.add(edge.child)
 const visitHead=new Set<string>(),heads:string[]=[]
 const visit=(id:string)=>{
  if(visitHead.has(id))return
  visitHead.add(id);heads.push(id)
  const next=(successors.get(id)??[]).sort((a,b)=>(lookup.get(a)?.x??0)-(lookup.get(b)?.x??0))
  for(const successor of next)visit(successor)
 }
 // Sequence roots first, sorted left-to-right. This puts a yellow
 // predecessor before its first blue, followed by red and later blues.
 for(const atom of [...graph.atoms].filter(a=>!previous.has(a.id)&&!supporters.has(a.id)).sort((a,b)=>a.x-b.x||a.y-b.y))visit(atom.id)
 for(const atom of graph.atoms)visit(atom.id)
 const included=new Set<string>(),ordered:string[]=[]
 for(const headId of heads){
  if(included.has(headId))continue
  const family=new Set<string>([headId])
  const depth=new Map<string,number>([[headId,0]])
  const queue=[headId]
  for(let i=0;i<queue.length;i++){
   for(const edge of graph.bonds){
    if(edge.relation!=='support'&&edge.relation!=='pair')continue
    const child=edge.parent===queue[i]?edge.child:edge.relation==='pair'&&edge.child===queue[i]?edge.parent:null
    if(!child||!lookup.has(child)||family.has(child)||included.has(child))continue
    family.add(child);depth.set(child,(depth.get(queue[i])??0)+1);queue.push(child)
   }
  }
  const members=familyOrder([...family].filter(id=>id!==headId).map(id=>({atom:lookup.get(id)!,depth:depth.get(id)??0})))
  for(const atom of members){if(!included.has(atom.id)){included.add(atom.id);ordered.push(atom.id)}}
  if(!included.has(headId)){included.add(headId);ordered.push(headId)}
 }
 return ordered
}
export function sequentialScanNext(graph:ScanGraph,currentId:string|null,direction:'left'|'right'):string|null{
 const order=sequentialScanOrder(graph)
 if(!order.length)return null
 const at=currentId?order.indexOf(currentId):-1
 if(at<0)return direction==='right'?order[0]:order[order.length-1]
 return order[(at+(direction==='right'?1:-1)+order.length)%order.length]
}
