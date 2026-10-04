import { FLOOR, floors, glass, walls } from './plan'
import type { Floor, Rect } from './plan'
import { estateRailings } from './railings'
import { courtyardPlanting, foyerGardenBeds, poolWater } from './site-layout'
import type { EstateRailPoint } from './railings'

export type EstateSurfaceKind =
  | 'interior'
  | 'deck'
  | 'covered-exterior'
  | 'arrival'
  | 'steps'
  | 'garden'
  | 'water'

export type EstateSurface =
  | { id:string; code:string; label:string; kind:EstateSurfaceKind; shape:'rect'; x1:number; x2:number; z1:number; z2:number; level:number; source:'3d-floor'|'3d-fixture' }
  | { id:string; code:string; label:string; kind:EstateSurfaceKind; shape:'circle'; x:number; z:number; r:number; level:number; source:'3d-floor'|'3d-fixture' }

export type EstateEdgeKind = 'wall' | 'glass' | 'railing' | 'step' | 'open'
export type EstateEdge = {
  id:string
  code:string
  kind:EstateEdgeKind
  a: EstateRailPoint
  b: EstateRailPoint
  length:number
  audit: 'covered' | 'review'
}

function surfaceKind(f:Floor):EstateSurfaceKind{
  if(f.use==='patio')return'deck'
  if(f.use==='covered-exterior')return'covered-exterior'
  if(f.use==='arrival')return'arrival'
  if(f.use==='steps')return'steps'
  return'interior'
}

const floorSurfaces:EstateSurface[] = floors.map((f,i)=>{
  const kind=surfaceKind(f),level=f.stair?Math.min(f.stair.startLevel,f.stair.endLevel):f.level??FLOOR,code=f.planCode??`S${i+1}`
  if(f.use==='arrival')return{id:`surface-floor-${i}`,code,label:f.name,kind,shape:'circle',x:1,z:41,r:19,level,source:'3d-floor'}
  return{id:`surface-floor-${i}`,code,label:f.name,kind,shape:'rect',x1:f.x1,x2:f.x2,z1:f.z1,z2:f.z2,level,source:'3d-floor'}
})

const extraSurfaces:EstateSurface[]=[
  {id:'surface-pool',code:'W1',label:'Infinity pool',kind:'water',shape:'rect',...poolWater,level:FLOOR-.08,source:'3d-fixture'},
  {id:'surface-courtyard-garden',code:'G1',label:'Courtyard planting',kind:'garden',shape:'rect',...courtyardPlanting,level:FLOOR+.02,source:'3d-fixture'},
  ...foyerGardenBeds.map((g,i)=>({id:`surface-${g.id}`,code:`G${i+2}`,label:i===0?'Foyer garden west':'Foyer garden east',kind:'garden' as const,shape:'rect' as const,x1:g.cx-g.rx-.21,x2:g.cx+g.rx+.21,z1:g.cz-g.rz-.21,z2:g.cz+g.rz+.21,level:FLOOR-.16,source:'3d-fixture' as const})),
  {id:'surface-arrival-fountain',code:'W2',label:'Arrival fountain',kind:'water',shape:'circle',x:1,z:41,r:3.45,level:5.08,source:'3d-fixture'},
]

export const estateSurfaces:EstateSurface[]=[...floorSurfaces,...extraSurfaces]
export const patioSurfaces=estateSurfaces.filter(s=>s.kind==='deck'||s.kind==='covered-exterior')

type RawEdge={a:EstateRailPoint;b:EstateRailPoint;kind:EstateEdgeKind}

// Audit the whole constructed circuit, including lower decks and stair flights.
const mainFloors=floors.filter(f=>f.name!=='Arrival court'&&f.name!=='Arrival steps')
const xs=[...new Set([
  ...mainFloors.flatMap(f=>[f.x1,f.x2]),
  ...walls.flatMap(r=>[r.x1,r.x2]),
  ...glass.flatMap(r=>[r.x1,r.x2]),
  ...estateRailings.flatMap(r=>r.points.map(p=>p[0])),
])].sort((a,b)=>a-b)
const zs=[...new Set([
  ...mainFloors.flatMap(f=>[f.z1,f.z2]),
  ...walls.flatMap(r=>[r.z1,r.z2]),
  ...glass.flatMap(r=>[r.z1,r.z2]),
  ...estateRailings.flatMap(r=>r.points.map(p=>p[1])),
])].sort((a,b)=>a-b)

const covers=(x:number,z:number)=>mainFloors.some(f=>x>f.x1+1e-6&&x<f.x2-1e-6&&z>f.z1+1e-6&&z<f.z2-1e-6)
const nearRect=(p:{x:number;z:number},r:Rect,pad=.24)=>p.x>=r.x1-pad&&p.x<=r.x2+pad&&p.z>=r.z1-pad&&p.z<=r.z2+pad
const parallel=(a:EstateRailPoint,b:EstateRailPoint,c:EstateRailPoint,d:EstateRailPoint)=>{
  const ax=b[0]-a[0],az=b[1]-a[1],bx=d[0]-c[0],bz=d[1]-c[1]
  return Math.abs(ax*bz-az*bx)<.02
}
const pointSegDistance=(p:{x:number;z:number},a:EstateRailPoint,b:EstateRailPoint)=>{
  const vx=b[0]-a[0],vz=b[1]-a[1],wx=p.x-a[0],wz=p.z-a[1],den=vx*vx+vz*vz
  const t=den?Math.max(0,Math.min(1,(wx*vx+wz*vz)/den)):0
  return Math.hypot(p.x-(a[0]+vx*t),p.z-(a[1]+vz*t))
}
const railNear=(a:EstateRailPoint,b:EstateRailPoint)=>{
  const p={x:(a[0]+b[0])/2,z:(a[1]+b[1])/2}
  return estateRailings.some(r=>r.points.slice(0,-1).some((q,i)=>{
    const n=r.points[i+1]
    return parallel(a,b,q,n)&&pointSegDistance(p,q,n)<.32
  }))
}
const kindAt=(a:EstateRailPoint,b:EstateRailPoint):EstateEdgeKind=>{
  const p={x:(a[0]+b[0])/2,z:(a[1]+b[1])/2}
  if(p.z>23.75&&p.z<24.25&&p.x>-5.2&&p.x<7.2)return'step'
  if(floors.some(f=>f.stair&&nearRect(p,f,.01)&&((f.stair.axis==='x'&&(Math.abs(p.x-f.x1)<.01||Math.abs(p.x-f.x2)<.01))||(f.stair.axis==='z'&&(Math.abs(p.z-f.z1)<.01||Math.abs(p.z-f.z2)<.01)))))return'step'
  if(glass.some(r=>nearRect(p,r,.16)))return'glass'
  if(walls.some(r=>nearRect(p,r,.2)))return'wall'
  if(railNear(a,b))return'railing'
  return'open'
}

const cells=new Set<string>()
for(let ix=0;ix<xs.length-1;ix++)for(let iz=0;iz<zs.length-1;iz++){
  const mx=(xs[ix]+xs[ix+1])/2,mz=(zs[iz]+zs[iz+1])/2
  if(covers(mx,mz))cells.add(`${ix}:${iz}`)
}
const raw:RawEdge[]=[]
const add=(a:EstateRailPoint,b:EstateRailPoint)=>raw.push({a,b,kind:kindAt(a,b)})
for(let ix=0;ix<xs.length-1;ix++)for(let iz=0;iz<zs.length-1;iz++){
  if(!cells.has(`${ix}:${iz}`))continue
  if(!cells.has(`${ix-1}:${iz}`))add([xs[ix],zs[iz]],[xs[ix],zs[iz+1]])
  if(!cells.has(`${ix+1}:${iz}`))add([xs[ix+1],zs[iz]],[xs[ix+1],zs[iz+1]])
  if(!cells.has(`${ix}:${iz-1}`))add([xs[ix],zs[iz]],[xs[ix+1],zs[iz]])
  if(!cells.has(`${ix}:${iz+1}`))add([xs[ix],zs[iz+1]],[xs[ix+1],zs[iz+1]])
}

const groups=new Map<string,RawEdge[]>()
for(const edge of raw){
  const horizontal=Math.abs(edge.b[0]-edge.a[0])>=Math.abs(edge.b[1]-edge.a[1])
  let a=edge.a,b=edge.b
  if(horizontal&&a[0]>b[0]){const t=a;a=b;b=t}
  if(!horizontal&&a[1]>b[1]){const t=a;a=b;b=t}
  const line=horizontal?a[1]:a[0]
  const key=`${edge.kind}:${horizontal?'h':'v'}:${line.toFixed(4)}`
  const list=groups.get(key)??[]
  list.push({a:[a[0],a[1]],b:[b[0],b[1]],kind:edge.kind})
  groups.set(key,list)
}
const merged:RawEdge[]=[]
for(const list of groups.values()){
  const horizontal=Math.abs(list[0].b[0]-list[0].a[0])>=Math.abs(list[0].b[1]-list[0].a[1])
  list.sort((a,b)=>(horizontal?a.a[0]-b.a[0]:a.a[1]-b.a[1]))
  let current:RawEdge|null=null
  for(const edge of list){
    if(!current){current={a:[edge.a[0],edge.a[1]],b:[edge.b[0],edge.b[1]],kind:edge.kind};continue}
    const currentEnd=horizontal?current.b[0]:current.b[1],nextStart=horizontal?edge.a[0]:edge.a[1]
    if(nextStart<=currentEnd+.001)current.b=[edge.b[0],edge.b[1]]
    else{merged.push(current);current={a:[edge.a[0],edge.a[1]],b:[edge.b[0],edge.b[1]],kind:edge.kind}}
  }
  if(current)merged.push(current)
}
const sorted=merged.sort((a,b)=>{
  const ay=Math.min(a.a[1],a.b[1]),by=Math.min(b.a[1],b.b[1])
  return ay-by||Math.min(a.a[0],a.b[0])-Math.min(b.a[0],b.b[0])
})

export const estateEdges:EstateEdge[]=sorted.map((e,i)=>({
  id:`edge-${i+1}`,
  code:`E${i+1}`,
  kind:e.kind,
  a:e.a,
  b:e.b,
  length:Math.hypot(e.b[0]-e.a[0],e.b[1]-e.a[1]),
  audit:e.kind==='open'?'review':'covered',
}))

export const auditOpenEdges=estateEdges.filter(e=>e.audit==='review')
export const auditReviewRailings=estateRailings.filter(r=>r.audit==='review')
