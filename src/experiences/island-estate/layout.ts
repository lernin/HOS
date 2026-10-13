/** Spatial authority for The Island Estate. Metres, X east / Z south / Y up. */
export type PointXZ = { x: number; z: number }
export type WorldPoint = PointXZ & { y: number }
export type Level = 0 | 1 | 2
export const SEA = 0
export const ATRIUM = { x: 0, z: -7, radius: 9.8 }
export const PLAYER_RADIUS = .3
export const EYE_HEIGHT = 1.68
export const crownHeight=(angle:number)=>23.25+(1-Math.cos(angle))*.7
export const crownProfile=[[9.9,0],[14.9,.35],[16.2,-.08],[14.7,-.48],[9.9,-.25]]
export const levels = [
  { id: 0 as Level, y: 8, label: 'Ground floor', datum: '±0.00 m' },
  { id: 1 as Level, y: 14, label: 'First floor', datum: '+6.00 m' },
  { id: 2 as Level, y: 20, label: 'Rooftop', datum: '+12.00 m' },
]
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
export const smooth = (a: number,b: number,x: number) => { const t=clamp((x-a)/(b-a),0,1); return t*t*(3-2*t) }
const pt = (p: number[]) => ({ x:p[0], z:p[1] })

/** Closed cardinal spline, reused by the drawings, meshes and navigation. */
export function curve(anchors: PointXZ[], count = 192): PointXZ[] {
  const n=anchors.length
  return Array.from({length:count}, (_,i)=>{
    const u=i*n/count,k=Math.floor(u),t=u-k
    const a=anchors[(k+n-1)%n],b=anchors[k%n],c=anchors[(k+1)%n],d=anchors[(k+2)%n]
    const f=(a:number,b:number,c:number,d:number)=>.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t)
    return { x:f(a.x,b.x,c.x,d.x), z:f(a.z,b.z,c.z,d.z) }
  })
}
export function circle(center: PointXZ, rx:number, rz=rx, count=96): PointXZ[] {
  return Array.from({length:count},(_,i)=>({x:center.x+rx*Math.sin(i/count*Math.PI*2),z:center.z+rz*Math.cos(i/count*Math.PI*2)}))
}
export function contains(p: PointXZ, polygon: PointXZ[]): boolean {
  let inside=false
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const a=polygon[i],b=polygon[j]
    if(((a.z>p.z)!==(b.z>p.z)) && p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x) inside=!inside
  }
  return inside
}
export function segmentDistance(p: PointXZ,a: PointXZ,b: PointXZ): number {
  const dx=b.x-a.x,dz=b.z-a.z,t=clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz || 1),0,1)
  return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz)
}
export function boundaryDistance(p: PointXZ, polygon: PointXZ[]) {
  let distance=Infinity
  for(let i=0;i<polygon.length;i++) distance=Math.min(distance,segmentDistance(p,polygon[i],polygon[(i+1)%polygon.length]))
  return distance
}
export const groundAnchors = [
  [0,-34],[17,-31],[32,-25],[43,-16],[45,-4],[42,7],[31,14],
  [31,24],[25,31],[14,30],[5,23],[-5,22],[-18,30],[-31,28],
  [-40,18],[-39,8],[-44,-1],[-42,-15],[-29,-26],[-14,-31],
].map(pt)
export const outlines: PointXZ[][] = [
  curve(groundAnchors.map(p=>({x:p.x*.9,z:(p.z+7)*.9-7}))),
  curve(groundAnchors.map(p=>({x:p.x*.96,z:(p.z+7)*.96-7}))),
  curve(groundAnchors.map(p=>({x:p.x*(p.x>0?1.03:.99),z:(p.z+7)*.99-7}))),
]
export const islandOutline = curve([
  [-38,-52],[10,-56],[46,-38],[61,-13],[52,8],[42,27],
  [61,43],[73,68],[69,88],[58,100],[39,99],[22,83],[18,64],
  [0,57],[-23,56],[-47,42],[-64,20],[-60,-1],[-64,-22],[-55,-39],
].map(pt),192)

export function terrainHeight(p: PointXZ): number {
  const ratio=Math.hypot(p.x/52,(p.z+5)/46)
  let h=8-Math.max(0,ratio-1)*13
  if(p.z>24 && p.x>12) h=8-(p.z-24)*.072
  const beach=smooth(18,43,p.z)*(1-smooth(-23,-9,p.x))
  h=h*(1-beach)+1.2*beach
  h=Math.max(1.05,h)
  const d=boundaryDistance(p,islandOutline)
  // Gentle on the beach; dramatic rock faces elsewhere.
  const shoreBlend=smooth(18,34,p.z)*(1-smooth(-18,-4,p.x))
  const shoreline=.78+(.16-.78)*shoreBlend
  return Math.min(h,.25+d*shoreline)
}

export type Pool = { id: string; y: number; outline: PointXZ[]; center: PointXZ; depth: number }
export const pools: Pool[] = [
  {id:'atrium-basin',y:8,outline:circle(ATRIUM,2.6),center:ATRIUM,depth:.45},
  {id:'garden-pool',y:8,outline:circle({x:-26,z:17},4.8,6.6),center:{x:-26,z:17},depth:1.1},
  {id:'infinity-pool',y:20,outline:curve([
    [18,-4],[31,-4],[37,2],[36,11],[28,20],[15,22],[6,18],
    [5,13],[8,11],[14,14],[22,13],[27,7],[25,2],[17,0],
  ].map(pt),128),center:{x:31,z:7},depth:1.2},
]
export const stair = { radius:7.8, width:2.8, start:-Math.PI*.7, sweep:Math.PI, risers:36 }
export function stairPoint(flight: 0 | 1,t: number,r=stair.radius): WorldPoint {
  const a=stair.start+flight*stair.sweep+clamp(t,0,1)*stair.sweep
  return {x:ATRIUM.x+Math.sin(a)*r,z:ATRIUM.z+Math.cos(a)*r,y:8+flight*6+clamp(t,0,1)*6}
}
export function stairHeight(p: PointXZ, flight: 0 | 1): number | null {
  const r=Math.hypot(p.x-ATRIUM.x,p.z-ATRIUM.z)
  if(r<stair.radius-stair.width/2 || r>stair.radius+stair.width/2) return null
  const a=Math.atan2(p.x-ATRIUM.x,p.z-ATRIUM.z)
  const delta=((a-stair.start-flight*stair.sweep)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)
  if(delta>stair.sweep+.00001) return null
  return 8+flight*6+delta/stair.sweep*6
}
export const landings = [0,1,2].map((level)=>{
  const a=stair.start+level*stair.sweep
  const radial={x:Math.sin(a),z:Math.cos(a)},side={x:Math.cos(a),z:-Math.sin(a)}
  const poly=[[-1,6.5],[-1,12.3],[1,12.3],[1,6.5]].map(([s,r])=>({x:radial.x*r+side.x*s*1.42,z:ATRIUM.z+radial.z*r+side.z*s*1.42}))
  return {level:level as Level,y:8+level*6,outline:poly}
})
export const dock = { y:2.4, outline:[{x:52,z:104},{x:75,z:104},{x:75,z:112},{x:52,z:112}] }
export const gangway = { start:{x:47,z:86}, end:{x:57,z:107},width:2.8 }
export const beachRamp:WorldPoint[]=[{x:0,y:8,z:27},{x:-3,y:6.5,z:33},{x:-14,y:3.4,z:37},{x:-29,y:1.2,z:41}]
export function gangwayPoint(t:number): WorldPoint {
  const y0=terrainHeight(gangway.start)
  return {x:gangway.start.x+(gangway.end.x-gangway.start.x)*t,z:gangway.start.z+(gangway.end.z-gangway.start.z)*t,y:y0+(dock.y-y0)*t}
}
export function groundHeight(p: PointXZ): number | null {
  for(let i=1;i<beachRamp.length;i++) {
    const a=beachRamp[i-1],b=beachRamp[i],dx=b.x-a.x,dz=b.z-a.z
    const t=clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz),0,1)
    if(Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz)<1.6)return a.y+(b.y-a.y)*t
  }
  if(segmentDistance(p,gangway.start,gangway.end)<gangway.width/2) {
    const dx=gangway.end.x-gangway.start.x,dz=gangway.end.z-gangway.start.z
    const t=clamp(((p.x-gangway.start.x)*dx+(p.z-gangway.start.z)*dz)/(dx*dx+dz*dz),0,1)
    const mid=gangwayPoint(t)
    if(Math.hypot(p.x-mid.x,p.z-mid.z)<gangway.width/2) return mid.y
  }
  if(contains(p,dock.outline))return dock.y
  if(contains(p,outlines[0])) return 8
  if(contains(p,islandOutline))return terrainHeight(p)
  return null
}

export type Collider = {id:string; y:number;height:number;center:PointXZ;radius?:number;outline?:PointXZ[]}
export const planters: Collider[] = [
  {id:'west-roof-garden',y:20,height:.7,center:{x:-26,z:-12},radius:5.5},
  {id:'north-roof-garden',y:20,height:.65,center:{x:-16,z:-24},radius:2.1},
  {id:'east-pool-island',y:20,height:.65,center:{x:17,z:7},radius:2.3},
  {id:'west-arrival-garden',y:8,height:.6,center:{x:-15,z:16},radius:2.3},
  {id:'east-arrival-garden',y:8,height:.6,center:{x:15,z:18},radius:2.3},
  ...[[-27,-25,20],[-35,-15,20],[-19,-28,20],[23,-23,20],[33,-17,20],[-36,18,8],[35,19,8]].map(([x,z,y],i)=>({id:`terrace-planter-${i}`,y,height:.45,center:{x,z},radius:1.12})),
]
export const roofBeds:Collider[]=[
  {id:'west-sky-garden-bed',y:20,height:.55,center:{x:-29,z:-19},outline:curve([[-41,-13],[-33,-25],[-20,-27],[-15,-24],[-20,-19],[-30,-18],[-35,-8],[-40,-5]].map(pt),72)},
  {id:'east-sky-garden-bed',y:20,height:.55,center:{x:29,z:-20},outline:curve([[18,-28],[31,-25],[39,-15],[39,-9],[34,-8],[30,-17],[23,-20],[17,-23]].map(pt),72)},
  {id:'south-sky-garden-bed',y:20,height:.55,center:{x:-26,z:22},outline:circle({x:-26,z:22},5.1,3.6,48)},
]
const rectangle=(x:number,z:number,w:number,d:number)=>[{x:x-w/2,z:z-d/2},{x:x+w/2,z:z-d/2},{x:x+w/2,z:z+d/2},{x:x-w/2,z:z+d/2}]
export const furnitureSolids: Collider[] = [
  {id:'west-sofa',y:8,height:.9,center:{x:-27,z:-8},outline:rectangle(-27,-8,5.5,1.3)},
  {id:'east-sofa',y:8,height:.9,center:{x:26,z:-6},outline:rectangle(26,-6,5.5,1.3)},
  {id:'dining-table',y:8,height:.8,center:{x:-19,z:-21},outline:rectangle(-19,-21,5,1.6)},
  {id:'kitchen-island',y:8,height:1,center:{x:18,z:-20},outline:rectangle(18,-20,5.5,2.2)},
  {id:'primary-bed',y:14,height:1,center:{x:-24,z:-10},outline:rectangle(-24,-10,4.3,3.7)},
  {id:'east-guest-bed',y:14,height:1,center:{x:27,z:-10},outline:rectangle(27,-10,3.4,3.4)},
  {id:'south-guest-bed',y:14,height:1,center:{x:-22,z:19},outline:rectangle(-22,19,3.4,3.4)},
  {id:'west-coffee-table',y:8,height:.5,center:{x:-27,z:-5.55},outline:rectangle(-27,-5.55,3,1)},
  {id:'east-coffee-table',y:8,height:.5,center:{x:26,z:-3.55},outline:rectangle(26,-3.55,3,1)},
  {id:'observation-table',y:20,height:.5,center:{x:0,z:-21},radius:1.25},
  ...[3,6,9,12].map((z,i)=>({id:`east-chaise-${i}`,y:20,height:.65,center:{x:39,z},outline:rectangle(0,0,.85,2.1).map(p=>({x:39+Math.cos(-.1)*p.x+Math.sin(-.1)*p.z,z:z-Math.sin(-.1)*p.x+Math.cos(-.1)*p.z}))})),
  ...[-32,-29,-26].map((x,i)=>({id:`west-chaise-${i}`,y:20,height:.65,center:{x,z:2},outline:rectangle(0,0,.85,2.1).map(p=>({x:x+Math.cos(.28)*p.x+Math.sin(.28)*p.z,z:2-Math.sin(.28)*p.x+Math.cos(.28)*p.z}))})),
]
export const colliders = [...planters,...roofBeds,...furnitureSolids]
export const structuralColumns=[[-12,-17],[12,-17],[-12,1],[12,1]].map(([x,z])=>({x,z}))
export const supports=[[-29,2,1],[29,11,0],[-17,-24,1],[18,-24,0]].map(([x,z,west])=>[
  {y:7.45,x,z,rx:3.2,rz:2.0},{y:9,x:x+(west?1:-1),z,rx:1.8,rz:1.1},
  {y:12.6,x:x+(west?2:-2),z:z-1,rx:.65,rz:.7},{y:16,x,z:z-2,rx:1.35,rz:1.0},
  {y:18.7,x:x+(west?-3:3),z:z-3,rx:4.0,rz:2.0},{y:19.55,x:x+(west?-5:5),z:z-4,rx:7.5,rz:3.6},
])
export type Palm = PointXZ & {y:number;height:number;seed:number}
const hash=(n:number)=>{const a=Math.sin(n*127.1+31.7)*43758.5453;return a-Math.floor(a)}
export const palms:Palm[]=[]
for(let i=0;i<140;i++) {
  const p={x:-59+hash(i*7+1)*125,z:-46+hash(i*7+2)*135}
  if(!contains(p,islandOutline)||contains(p,outlines[0])||boundaryDistance(p,islandOutline)<4.5)continue
  if(pathsNear(p)<2.6)continue
  palms.push({...p,y:terrainHeight(p),height:4.6+hash(i*7+3)*4.9,seed:i})
}
function pathsNear(p:PointXZ) {
  const line=[{x:0,z:26},{x:12,z:34},{x:25,z:42},{x:31,z:56},{x:46,z:68},{x:47,z:86}]
  return Math.min(...line.slice(1).map((q,i)=>segmentDistance(p,line[i],q)))
}
export type GlassRun = {a:PointXZ;b:PointXZ;y:number;height:number}
export const glazing: GlassRun[] = []
for(const level of [0,1] as const) {
  const p=outlines[level].map(p=>({x:p.x*.83,z:(p.z+7)*.83-7}))
  for(let i=0;i<p.length;i++) {
    const a=p[i],b=p[(i+1)%p.length],m={x:(a.x+b.x)/2,z:(a.z+b.z)/2}
    // Real openings: entrance and both ocean terraces. No invisible door wall.
    if((m.z>9&&Math.abs(m.x)<7) || (Math.abs(m.x)>28&&m.z>-6&&m.z<5)) continue
    glazing.push({a,b,y:levels[level].y,height:5.15})
  }
}
// Curved observation pavilion on the back of the roof, open toward the pool.
export const pavilionCenter={x:0,z:-24.3}
const pavilion = circle(pavilionCenter,13.5,6.8,96)
for(let i=0;i<pavilion.length;i++) {
  const a=pavilion[i],b=pavilion[(i+1)%pavilion.length]
  if(a.z>-20.3&&Math.abs(a.x)<8)continue
  glazing.push({a,b,y:20,height:3.7})
}
export const partitions: GlassRun[] = [
  {a:{x:-18,z:-22},b:{x:-14,z:-15},y:14,height:4.9},
  {a:{x:17,z:-23},b:{x:15,z:-16},y:14,height:4.9},
  {a:{x:-29,z:8},b:{x:-17,z:9},y:14,height:4.9},
  {a:{x:22,z:13},b:{x:30,z:15},y:14,height:4.9},
]

export function floorCandidates(p: PointXZ): number[] {
  const candidates:number[]=[]
  const y=groundHeight(p);if(y!==null)candidates.push(y)
  for(const level of [1,2] as const) {
    if(contains(p,outlines[level])&&Math.hypot(p.x,p.z+7)>=ATRIUM.radius) candidates.push(levels[level].y)
  }
  for(const landing of landings)if(contains(p,landing.outline))candidates.push(landing.y)
  for(const flight of [0,1] as const){const h=stairHeight(p,flight);if(h!==null)candidates.push(h)}
  return candidates
}
export function supportedHeight(p: PointXZ, nearY:number): number | null {
  // Follow the tread before an overlapping landing; the latter otherwise causes
  // an artificial step up just before the final riser.
  for(const flight of [0,1] as const) {
    const h=stairHeight(p,flight)
    if(h!==null&&h<=nearY+.25&&h>=nearY-.4)return h
  }
  let best:number|null=null
  const accept=(h:number)=>{if(h<=nearY+.25&&h>=nearY-.4&&(best===null||h>best))best=h}
  // Avoid testing the island and other storeys for every step on an upper deck.
  for(const level of [1,2] as const)if(levels[level].y<=nearY+.25&&levels[level].y>=nearY-.4&&Math.hypot(p.x,p.z+7)>=ATRIUM.radius&&contains(p,outlines[level]))accept(levels[level].y)
  for(const landing of landings)if(landing.y<=nearY+.25&&landing.y>=nearY-.4&&contains(p,landing.outline))accept(landing.y)
  if(nearY<=8.4){const h=groundHeight(p);if(h!==null)accept(h)}
  return best
}

export const destinations: {id:string;label:string;level:Level;position:WorldPoint;yaw:number}[] = [
  {id:'entrance',label:'Main entrance',level:0,position:{x:0,y:8,z:21},yaw:0},
  {id:'atrium',label:'Grand atrium',level:0,position:{x:1,y:8,z:4},yaw:0},
  {id:'west-wing',label:'Floating west wing',level:0,position:{x:-32,y:8,z:1},yaw:-1.4},
  {id:'east-wing',label:'Ocean living room',level:0,position:{x:34,y:8,z:0},yaw:1.6},
  {id:'dining',label:'Dining pavilion',level:0,position:{x:-20,y:8,z:-16},yaw:-2.5},
  {id:'first-gallery',label:'Atrium gallery',level:1,position:{x:3,y:14,z:5},yaw:Math.PI},
  {id:'primary-suite',label:'Primary suite',level:1,position:{x:-27,y:14,z:-4},yaw:-1.8},
  {id:'sky-garden',label:'Rooftop sky garden',level:2,position:{x:-14,y:20,z:-14},yaw:-1.6},
  {id:'rooftop-pool',label:'Infinity pool terrace',level:2,position:{x:18,y:20,z:25},yaw:Math.PI},
  {id:'observation',label:'Observation pavilion',level:2,position:{x:0,y:20,z:-18},yaw:Math.PI},
  {id:'beach',label:'Private beach',level:0,position:{x:-32,y:terrainHeight({x:-32,z:41}),z:41},yaw:1.8},
  {id:'dock',label:'Yacht dock',level:0,position:{x:62,y:dock.y,z:108},yaw:0},
]
export const viewpoints = [
  {id:'aerial',label:'Island aerial',position:{x:78,y:68,z:108},target:{x:0,y:11,z:5}},
  {id:'front',label:'Front elevation',position:{x:13,y:21,z:109},target:{x:0,y:14,z:-3}},
  {id:'roof',label:'Rooftop sky garden',position:{x:63,y:49,z:56},target:{x:8,y:20,z:0}},
  {id:'wing',label:'Floating ocean wing',position:{x:65,y:26,z:25},target:{x:20,y:15,z:-5}},
  {id:'atrium',label:'Grand atrium',position:{x:3,y:10.4,z:13},target:{x:0,y:13.6,z:-9}},
  {id:'island',label:'Full island',position:{x:142,y:112,z:185},target:{x:0,y:5,z:25}},
] as const
export const paths: PointXZ[][] = [
  [{x:0,z:22},...beachRamp,{x:-38,z:41}],
  [{x:0,z:26},{x:12,z:34},{x:25,z:42},{x:31,z:56},{x:46,z:68},{x:47,z:86}],
  [{x:-38,z:2},{x:-45,z:14},{x:-43,z:25},{x:-38,z:39}],
  [{x:35,z:1},{x:41,z:13},{x:35,z:25},{x:25,z:42}],
]
