/** Deterministic eyes-free STAX selection order.
 * Visit sentence head families in grammatical sequence. Within each family,
 * scan ALL supporters and nested descendants from left to right, regardless
 * of tier/depth; visit the head LAST. The staggered third orange is physically
 * between the two top oranges, so it is heard/selected between them.
 * Works on geometry only; never mutates the shape graph or view.
 */
export type ScanAtom={id:string;kind:string;x:number;y:number}
export type ScanBond={parent:string;child:string;relation:string}
export type ScanGraph={atoms:readonly ScanAtom[];bonds:readonly ScanBond[]}
function familyOrder(atoms:ScanAtom[]):ScanAtom[]{
 // Geometry, not graph depth, determines reading order. When two pieces
 // share an x column, visit the lower piece before climbing to the top.
 return atoms.sort((a,b)=>a.x-b.x||b.y-a.y||a.id.localeCompare(b.id))
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
  const queue=[headId]
  for(let i=0;i<queue.length;i++){
   for(const edge of graph.bonds){
    if(edge.relation!=='support'&&edge.relation!=='pair')continue
    const child=edge.parent===queue[i]?edge.child:edge.relation==='pair'&&edge.child===queue[i]?edge.parent:null
    if(!child||!lookup.has(child)||family.has(child)||included.has(child))continue
    family.add(child);queue.push(child)
   }
  }
  const members=familyOrder([...family].filter(id=>id!==headId).map(id=>lookup.get(id)!))
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

/** Shared preference for both the phone controller and standalone board.
 * 1× preserves the original 40 px/shape; default 4× lets a single sweep
 * cross a full classroom sentence without altering its grammatical order.
 */
export const SCAN_SPEED_KEY='stax-sequential-scan-speed-v1'
export const DEFAULT_SCAN_SPEED=4
export function normalizeScanSpeed(value:unknown):number{
 if(value===null||value===undefined||value==='')return DEFAULT_SCAN_SPEED
 const speed=Number(value)
 return Number.isFinite(speed)?Math.max(1,Math.min(6,Math.round(speed))):DEFAULT_SCAN_SPEED
}
export function scanStrideForSpeed(speed:number):number{return 40/normalizeScanSpeed(speed)}

/** Read a continuous horizontal drag as one scan step per distance interval.
 * The step count changes in either direction, so reversing the same finger
 * retraces previous shapes. A batched pointer move can cross many shapes.
 */
export function scanSwipeSteps(previous:number,dx:number,stride=40):{step:number;directions:('left'|'right')[]}{
 const safeStride=Number.isFinite(stride)&&stride>=6?stride:40
 if(!Number.isFinite(dx)||!Number.isFinite(previous))return {step:0,directions:[]}
 const next=Math.trunc(dx/safeStride)
 const signed=next-previous
 const count=Math.min(80,Math.abs(signed))
 const direction=signed>=0?'right':'left'
 return {step:previous+Math.sign(signed)*count,directions:Array.from({length:count},()=>direction)}
}
