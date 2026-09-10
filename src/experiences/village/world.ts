// Metres. Rendering, dressing and collision all sample this same landscape.
export type Point = { x: number; y: number; z: number }
export type PathKind = 'trail' | 'boardwalk' | 'stair' | 'bridge'
export type Path = { name: string; points: Point[]; width: number; kind: PathKind; rails?: boolean }
export const spawn = { x: -13, y: 2.8, z: 21, yaw: -.24 }
export const tree = { x: -9, y: 5.8, z: -13, radius: 1.65 }
export const houses = [
  { x: -11, y: 2.8, z: 6, name: 'Willow Cottage', roof: '#456578' },
  { x: -17, y: 10.2, z: -13, name: 'The Treetop Library', roof: '#496b61' },
  { x: 13, y: 5.5, z: -12, name: 'Fern Cottage', roof: '#a56748' },
]
export const docks = [{ x: -4.6, y: 1.25, z: 19 }, { x: 9, y: 1.25, z: 23 }]
export const boatStart = { x: -.8, y: .65, z: 19 }
export const waterLevel = .55
const p = (x: number, y: number, z: number): Point => ({ x, y, z })
export const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
// Catmull-Rom sampled once: render and navigation use identical curved centrelines.
function curve(points: Point[], step = .22): Point[] {
  const out: Point[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[Math.max(0, i - 1)], b = points[i], c = points[i + 1], d = points[Math.min(points.length - 1, i + 2)]
    const n = Math.max(3, Math.ceil(Math.hypot(c.x - b.x, c.z - b.z) / step))
    for (let j = 0; j < n; j++) {
      const t = j / n, t2 = t * t, t3 = t2 * t
      const axis = (k: keyof Point) => .5 * ((2 * b[k]) + (-a[k] + c[k]) * t + (2*a[k] - 5*b[k] + 4*c[k] - d[k]) * t2 + (-a[k] + 3*b[k] - 3*c[k] + d[k]) * t3)
      out.push(p(axis('x'), b.y + (c.y - b.y) * smooth(0, 1, t), axis('z')))
    }
  }
  return [...out, points.at(-1)!]
}
const path = (name: string, kind: PathKind, width: number, points: Point[], rails = false): Path => ({ name, kind, width, points: curve(points), rails })
export const stairPoints = Array.from({ length: 181 }, (_, i) => {
  const t = i / 180, a = Math.PI / 2 + t * Math.PI * 2
  return p(tree.x + Math.cos(a) * 4.8, 5.8 + t * 4.4, tree.z + Math.sin(a) * 4.8)
})
export const paths: Path[] = [
  path('entrance-to-willow', 'trail', 2.5, [p(-13,2.8,21),p(-15,2.8,17),p(-14,2.8,13),p(-11,2.8,10.2)]),
  path('entrance-to-river-dock','trail',2.3,[p(-13,2.8,21),p(-10,2.6,23),p(-6.5,1.6,22),p(-4.6,1.25,19)]),
  path('willow-to-tree','trail',2.6,[p(-11,2.8,10.2),p(-16,2.8,10.4),p(-17,3,6),p(-18,4,1),p(-18,5.4,-3),p(-15,5.8,-6),p(-9,5.8,-8.2)]),
  { name:'winding-tree-walk',kind:'stair',width:2,points:stairPoints,rails:true },
  path('tree-to-library','boardwalk',2.4,[p(-9,10.2,-8.2),p(-12,10.2,-6),p(-16,10.2,-6.5),p(-17,10.2,-8.8)],true),
  path('library-to-fern','bridge',2.4,[p(-17,10.2,-8.8),p(-16,10.2,-6.5),p(-12,10.2,-6),p(-6,9.8,-6.5),p(0,8.2,-7),p(6,6.6,-7.5),p(10,5.5,-7.5),p(13,5.5,-7.8)],true),
  path('fern-to-lake','trail',2.5,[p(13,5.5,-7.8),p(17,5.5,-6),p(18,4.5,0),p(15,3.1,8),p(13,2.2,15),p(12,1.4,21),p(9,1.25,23)]),
  path('cottage-to-bridge','trail',2.5,[p(-11,2.8,10.2),p(-8,2.8,11),p(-5,2.65,9),p(-3.8,2.5,6.5)]),
  path('garden-bridge','bridge',2.5,[p(-3.8,2.5,6.5),p(-1,3,6),p(2,3.2,5.2),p(5.5,2.7,4.4),p(7.5,2.5,4.5)],true),
  path('bridge-to-fern','trail',2.4,[p(7.5,2.5,4.5),p(10,2.9,2),p(10,3.8,-2),p(9.5,5,-5),p(13,5.5,-7.8)]),
  path('cascade-lookout','trail',2.2,[p(7.5,2.5,4.5),p(8,3,1),p(6.6,3.6,-2.8)]),
]
export function pathNamed(name: string) { const found = paths.find(v => v.name === name); if (!found) throw Error(`Unknown village path: ${name}`); return found }
export function riverCenter(z: number) { return 1.1 + Math.sin(z * .18) * 1.7 + Math.sin(z * .43) * .3 }
export function riverWidth(z: number) { return 2.4 + .35 * Math.sin(z * .3 + 1) + 5.1 * Math.exp(-(((z - 21) / 7.8) ** 2)) }
export function waterHeight(z: number) { return waterLevel + 4.1 * (1 - smooth(-5.5, -.5, z)) + 1.4 * (1 - smooth(-23, -19, z)) }
export function isWater(x: number,z: number, margin=0) { return z > -31 + margin && z < 31 - margin && Math.abs(x - riverCenter(z)) < riverWidth(z) - margin }
export function projectSegment(x:number,z:number,a:Point,b:Point) {
  const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1)))
  return {distance:Math.hypot(x-a.x-t*dx,z-a.z-t*dz),y:a.y+(b.y-a.y)*t}
}
export function nearestPath(x:number,z:number, groundOnly=false) {
  let result={distance:Infinity,y:0,width:0,path:paths[0]}
  for(const path of paths) {
    if(groundOnly && path.kind !== 'trail') continue
    for(let i=1;i<path.points.length;i++) {const hit=projectSegment(x,z,path.points[i-1],path.points[i]);if(hit.distance<result.distance)result={...hit,width:path.width,path}}
  }
  return result
}
// A continuous valley with a carved channel, eroded ridges and flattened cottage foundations.
export function groundHeight(x:number,z:number) {
  const upper=1-smooth(-8,6,z)
  let y=2.7+3.15*upper+.22*Math.sin(x*.42)*Math.sin(z*.31)+.18*Math.cos(z*.67+x*.24)
  y+=smooth(19,32,Math.abs(x))*(5+3*Math.sin(z*.11)**2)
  y+=smooth(23,39,-z)*(7+4*Math.sin(x*.15)**2)
  y-=1.25*smooth(12,24,z)
  const bankDistance=Math.abs(x-riverCenter(z))-riverWidth(z)
  const riverbed=waterHeight(z)-.8+.12*Math.sin(x*2+z)
  y=riverbed+(y-riverbed)*smooth(-.4,2.1,bankDistance)
  for(const h of [houses[0],houses[2]]) {
    const edge=Math.max(Math.abs(x-h.x)-3.6,Math.abs(z-h.z)-3.6)
    y=h.y+(y-h.y)*smooth(0,2.2,edge)
  }
  const t=nearestPath(x,z,true), influence=1-smooth(t.width*.5,t.width*.5+1.1,t.distance)
  y+=(t.y-y)*influence
  return y
}
export const villageTrees = [
  {x:-20,z:19,h:7,kind:'tree'},{x:-21,z:11,h:9,kind:'pine'},{x:-23,z:2,h:11,kind:'pine'},
  {x:-22,z:-12,h:10,kind:'pine'},{x:-18,z:-22,h:8,kind:'tree-b'},{x:-5,z:-24,h:10,kind:'pine'},
  {x:9,z:-22,h:11,kind:'pine'},{x:21,z:-15,h:12,kind:'pine'},{x:22,z:0,h:10,kind:'tree'},
  {x:20,z:9,h:8,kind:'pine'},{x:18,z:20,h:9,kind:'tree-b'},{x:-8,z:17,h:5,kind:'tree'},
]
export const obstacles = [
  {x:-18.7,z:16,r:.75},{x:-7,z:14.1,r:.7},{x:-6,z:1.3,r:.85},{x:8.7,z:9.2,r:.85},
  {x:18.7,z:11,r:.9},{x:-20.5,z:-5,r:1.2},{x:8.8,z:-16.5,r:1.1},{x:17.8,z:-20,r:1.2},
]
export function floorCandidates(x:number,z:number) {
  const hits:{distance:number;y:number}[]=[]
  for(const path of paths) for(let i=1;i<path.points.length;i++) { const hit=projectSegment(x,z,path.points[i-1],path.points[i]);if(hit.distance<path.width/2-.18)hits.push(hit) }
  hits.sort((a,b)=>a.distance-b.distance)
  const heights=hits.map(v=>v.y)
  // Cottage floors and porches are physical surfaces, including the elevated library.
  for(const h of houses) if((Math.abs(x-h.x)<3.5 && Math.abs(z-h.z)<3.5)||(Math.abs(x-h.x)<1.6 && z>=h.z+3.4 && z<h.z+4.72))heights.push(h.y)
  for(const d of docks) if(Math.abs(x-d.x)<1.6 && Math.abs(z-d.z)<2)heights.push(d.y)
  const border=23+1.1*Math.sin(z*.24)+.7*Math.cos(z*.57)
  if(Math.abs(x)<border && z>-26 && z<27 && !isWater(x,z,-.3)) heights.push(groundHeight(x,z))
  return heights
}
export function blocked(x:number,y:number,z:number) {
  if(y<20 && Math.hypot(x-tree.x,z-tree.z)<tree.radius+.22)return true
  for(const t of villageTrees)if(Math.hypot(x-t.x,z-t.z)<t.h*.035+.22&&Math.abs(y-groundHeight(t.x,t.z))<4)return true
  for(const o of obstacles) if(Math.hypot(x-o.x,z-o.z)<o.r+.2 && Math.abs(y-groundHeight(o.x,o.z))<2.3)return true
  for(const h of houses) {
    if(Math.abs(y-h.y)>1.6)continue
    const dx=x-h.x,dz=z-h.z,edge=.35
    if(Math.abs(dx)<3.4+edge && Math.abs(dz)<3.4+edge) {
      if(Math.abs(dx)>3.4-edge || dz<-3.4+edge)return true
      if(dz>3.4-edge && Math.abs(dx)>1.03)return true
      if(dx>-2.95&&dx<-1.25&&dz>-1.5&&dz<1.4)return true
      if(dx>2.15&&dz<.8)return true
      if(Math.abs(dx)<1.35&&dz<-2.05)return true
    }
  }
  return false
}
// Substeps prevent a long input frame from tunnelling through a wall or railing.
export function walkStep(position:Point,dx:number,dz:number):Point {
  const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.09));let pos={...position}
  for(let i=0;i<steps;i++) {
    const attempt=(x:number,z:number)=> {
      const y=floorCandidates(x,z).find(candidate=>Math.abs(candidate-pos.y)<.36)
      return y!==undefined&&!blocked(x,y,z)?{x,y,z}:null
    }
    pos=attempt(pos.x+dx/steps,pos.z+dz/steps)||attempt(pos.x+dx/steps,pos.z)||attempt(pos.x,pos.z+dz/steps)||pos
  }
  return pos
}
export function placeName(pos:Point,boating:boolean) {
  if(boating)return pos.z>16?'The open lake':'Willow River'
  for(const h of houses)if(Math.abs(pos.y-h.y)<1&&Math.abs(pos.x-h.x)<3.25&&Math.abs(pos.z-h.z)<3.25)return h.name
  if(pos.y>7.2&&pos.x>-5)return 'Skybridge'
  if(Math.hypot(pos.x-tree.x,pos.z-tree.z)<6)return 'The winding tree walk'
  if(pos.x>4&&pos.z>-4&&pos.z<8)return 'Cascade garden'
  if(pos.z>17&&pos.x>-7)return 'Lakeside landing'
  return 'Waterfall Village'
}
