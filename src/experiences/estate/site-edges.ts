import { FLOOR, floors, glass, walls } from './plan'
import type { Floor, Rect } from './plan'
import { estateRailings } from './railings'
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
  | { id:string; code:string; label:string; kind:EstateSurfaceKind; shape:'rect'; x1:number; x2:number; z1:number; z2:number; level:number }
  | { id:string; code:string; label:string; kind:EstateSurfaceKind; shape:'circle'; x:number; z:number; r:number; level:number }

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

const exteriorDeckNames = new Set([
  'Ocean terrace','Pool walk','Garden courtyard','Sunrise terrace','Ocean lookout','Garden path',
])
const coveredExteriorNames = new Set(['Garden gallery'])

function surfaceKind(f:Floor):EstateSurfaceKind{
  if(f.name==='Arrival court')return'arrival'
  if(f.name==='Arrival steps')return'steps'
  if(exteriorDeckNames.has(f.name))return'deck'
  if(coveredExteriorNames.has(f.name))return'covered-exterior'
  return'interior'
}

const floorSurfaces:EstateSurface[] = floors.map((f,i)=>{
  const kind=surfaceKind(f),level=f.level??FLOOR
  if(f.name==='Arrival court')return{id:`surface-floor-${i}`,code:`S${i+1}`,label:f.name,kind,shape:'circle',x:1,z:41,r:19,level}
  return{id:`surface-floor-${i}`,code:`S${i+1}`,label:f.name,kind,shape:'rect',x1:f.x1,x2:f.x2,z1:f.z1,z2:f.z2,level}
})

const extraSurfaces:EstateSurface[]=[
  {id:'surface-pool',code:'S31',label:'Infinity pool',kind:'water',shape:'rect',x1:-10.9,x2:11.9,z1:-36,z2:-24.2,level:FLOOR-.08},
  {id:'surface-courtyard-garden',code:'S32',label:'Courtyard planting',kind:'garden',shape:'rect',x1:-20,x2:-12,z1:18,z2:27,level:FLOOR+.02},
  {id:'surface-foyer-garden-west',code:'S33',label:'Foyer garden west',kind:'garden',shape:'rect',x1:-10.61,x2:-6.39,z1:8.44,z2:13.56,level:FLOOR-.16},
  {id:'surface-foyer-garden-east',code:'S34',label:'Foyer garden east',kind:'garden',shape:'rect',x1:8.49,x2:12.51,z1:8.54,z2:14.46,level:FLOOR-.16},
  {id:'surface-arrival-garden-west',code:'S35',label:'Arrival garden west',kind:'garden',shape:'rect',x1:-24.1,x2:-17.9,z1:35.2,z2:44.8,level:FLOOR-.35},
  {id:'surface-arrival-garden-east',code:'S36',label:'Arrival garden east',kind:'garden',shape:'rect',x1:20.1,x2:24.9,z1:43.8,z2:49.2,level:FLOOR-.35},
  {id:'surface-arrival-fountain',code:'S37',label:'Arrival fountain',kind:'water',shape:'circle',x:1,z:41,r:3.45,level:4.86},
]

export const estateSurfaces:EstateSurface[]=[...floorSurfaces,...extraSurfaces]

type RawEdge={a:EstateRailPoint;b:EstateRailPoint;kind:EstateEdgeKind}

const mainFloors=floors.filter(f=>f.name!=='Arrival court'&&f.name!=='Arrival steps'&&(f.level??FLOOR)===FLOOR)
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
const overlap=(a1:number,a2:number,b1:number,b2:number)=>Math.max(a1,b1)<Math.min(a2,b2)-1e-5
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

function canMerge(a:RawEdge,b:RawEdge){
  if(a.kind!==b.kind)return false
  const av=[a.b[0]-a.a[0],a.b[1]-a.a[1]],bv=[b.b[0]-b.a[0],b.b[1]-b.a[1]]
  if(Math.abs(av[0]*bv[1]-av[1]*bv[0])>.001)return false
  const touch=Math.hypot(a.b[0]-b.a[0],a.b[1]-b.a[1])<.001
  const sameLine=Math.abs(av[0])>.001?Math.abs(a.a[1]-b.a[1])<.001:Math.abs(a.a[0]-b.a[0])<.001
  return touch&&sameLine
}
const ordered=raw.sort((a,b)=>a.a[0]-b.a[0]||a.a[1]-b.a[1]||a.b[0]-b.b[0]||a.b[1]-b.b[1])
const merged:RawEdge[]=[]
for(const edge of ordered){
  const last=merged[merged.length-1]
  if(last&&canMerge(last,edge))last.b=edge.b
  else merged.push({a:[edge.a[0],edge.a[1]],b:[edge.b[0],edge.b[1]],kind:edge.kind})
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
