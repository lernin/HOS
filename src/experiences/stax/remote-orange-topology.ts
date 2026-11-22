/** Remote B-down orange progression is topological only. All x/y positions,
 * compact sizing and tier reflow remain owned by canonical MoleculeBoard.
 *
 * Supported step counts: 0 -> 2 -> 3 -> 4 -> 6 -> 7.
 * The transition 3 -> 4 intentionally converts the third orange (previously
 * beneath top-right) into the first member of the next left-hand paired tier,
 * then creates its companion. This is a reversible draft-level decision,
 * NOT a claim about the grammar of the third orange's written word.
 */
export type RemoteOrangeNode={id:string;kind:string;x:number;y:number}
export type RemoteOrangeBond={parent:string;child:string;relation:'support'|'sequence'|'pair'}
export type RemoteOrangeGraph<N extends RemoteOrangeNode=RemoteOrangeNode,B extends RemoteOrangeBond=RemoteOrangeBond>={atoms:N[];bonds:B[]}
export type RemoteOrangeStep<N extends RemoteOrangeNode,B extends RemoteOrangeBond>={
 graph:RemoteOrangeGraph<N,B>;before:number;after:2|3|4|6|7;added:number;reparented:boolean
}
export function redOrangeChildren(graph:RemoteOrangeGraph, parent:string):string[]{
 const orangeIds=new Set(graph.atoms.filter(a=>a.kind==='hexagon').map(a=>a.id))
 return graph.bonds.filter(b=>b.parent===parent&&b.relation==='support'&&orangeIds.has(b.child)).map(b=>b.child)
}
export function countRedOranges(graph:RemoteOrangeGraph,redId:string):number{
 const red=graph.atoms.find(a=>a.id===redId)
 if(red?.kind!=='triangle')return 0
 const seen=new Set<string>(),queue=[redId]
 for(let i=0;i<queue.length;i++){
  for(const childId of redOrangeChildren(graph,queue[i])){
   if(seen.has(childId))continue
   seen.add(childId);queue.push(childId)
  }
 }
 return seen.size
}
export function nextRedOrangeRemoteStep<N extends RemoteOrangeNode,B extends RemoteOrangeBond>(
 graph:RemoteOrangeGraph<N,B>,redId:string,makeOrange:()=>N
):RemoteOrangeStep<N,B>|null{
 const red=graph.atoms.find(a=>a.id===redId)
 if(red?.kind!=='triangle')return null
 const before=countRedOranges(graph,redId)
 if(![0,2,3,4,6].includes(before))return null
 const target:2|3|4|6|7=before===0?2:before===2?3:before===3?4:before===4?6:7
 if(graph.atoms.length+target-before>80)return null
 const top=redOrangeChildren(graph,redId)
 let parent:string
 let reparentId:string|undefined
 if(before===0){
  if(top.length)return null
  parent=redId
 }else{
  if(top.length!==2)return null
  if(before===2){
   if(redOrangeChildren(graph,top[0]).length||redOrangeChildren(graph,top[1]).length)return null
   parent=top[1]
  }else if(before===3){
   const leftChildren=redOrangeChildren(graph,top[0]),rightChildren=redOrangeChildren(graph,top[1])
   if(leftChildren.length||rightChildren.length!==1)return null
   parent=top[0]
   reparentId=rightChildren[0]
  }else{
   const middle=redOrangeChildren(graph,top[0])
   if(middle.length!==2||redOrangeChildren(graph,top[1]).length)return null
   const bottom=redOrangeChildren(graph,middle[0])
   if(before===4){
    if(bottom.length||redOrangeChildren(graph,middle[1]).length)return null
    parent=middle[0]
   }else{
    if(bottom.length!==2||redOrangeChildren(graph,middle[1]).length)return null
    parent=middle[1]
   }
  }
 }
 const atoms=[...graph.atoms],bonds=[...graph.bonds]
 if(reparentId){
  const prior=bonds.find(b=>b.child===reparentId&&b.relation==='support')
  if(!prior)return null
  bonds.splice(bonds.indexOf(prior),1,{...prior,parent} as B)
 }
 const existing=new Set(atoms.map(a=>a.id))
 for(let i=0;i<target-before;i++){
  const orange=makeOrange()
  if(orange.kind!=='hexagon'||existing.has(orange.id))return null
  atoms.push(orange);existing.add(orange.id)
  bonds.push({parent,child:orange.id,relation:'support'} as B)
 }
 const next={atoms,bonds}
 if(countRedOranges(next,redId)!==target)return null
 return {graph:next,before,after:target,added:target-before,reparented:!!reparentId}
}
