export type Point = { x: number; z: number }
export type Rect = { x1: number; x2: number; z1: number; z2: number }
export type Floor = Rect & { name: string; material: string; roof?: number; level?: number }
export type Wall = Rect & { height: number; material: string }
export const FLOOR = 6
export const EYE = 1.65
export const spawn = { x: 1, z: 29, yaw: 0 }
export const floors: Floor[] = [
  { name: 'Great room', x1: -11, x2: 13, z1: -12, z2: 8, material: 'limestone', roof: 5.5 },
  { name: 'Grand foyer', x1: -6, x2: 8, z1: 8, z2: 24, material: 'limestone', roof: 4.5 },
  { name: 'Ocean terrace', x1: -23, x2: 27, z1: -24, z2: -12, material: 'travertine' },
  { name: 'Pool walk', x1: -15, x2: -11, z1: -36, z2: -24, material: 'travertine' },
  { name: 'Pool walk', x1: 12, x2: 16, z1: -36, z2: -24, material: 'travertine' },
  { name: 'Dining room', x1: -23, x2: -11, z1: -12, z2: 2, material: 'limestone', roof: 4.2 },
  { name: 'Kitchen', x1: -23, x2: -11, z1: 2, z2: 14, material: 'limestone', roof: 3.6 },
  { name: 'Family lounge', x1: -35, x2: -23, z1: -17, z2: -2, material: 'oak', roof: 3.8 },
  { name: 'Media room', x1: -39, x2: -26, z1: -2, z2: 11, material: 'walnut', roof: 3.4 },
  { name: 'West gallery', x1: -26, x2: -23, z1: -2, z2: 39, material: 'limestone', roof: 3.4 },
  { name: 'Fitness studio', x1: -39, x2: -26, z1: 11, z2: 24, material: 'oak', roof: 3.5 },
  { name: 'Wellness & spa', x1: -39, x2: -26, z1: 24, z2: 39, material: 'travertine', roof: 3.5 },
  { name: 'Garden courtyard', x1: -23, x2: -6, z1: 14, z2: 33, material: 'travertine' },
  { name: 'Library', x1: 8, x2: 20, z1: 15, z2: 28, material: 'oak', roof: 3.6 },
  { name: 'East gallery', x1: 13, x2: 24, z1: -12, z2: 15, material: 'limestone', roof: 3.5 },
  { name: 'East gallery', x1: 20, x2: 24, z1: 15, z2: 40, material: 'limestone', roof: 3.5 },
  { name: 'Primary suite', x1: 24, x2: 39, z1: -12, z2: 2, material: 'oak', roof: 3.8 },
  { name: 'Dressing room', x1: 24, x2: 31, z1: 2, z2: 13, material: 'oak', roof: 3.3 },
  { name: 'Primary bath', x1: 31, x2: 39, z1: 2, z2: 13, material: 'travertine', roof: 3.3 },
  { name: 'Sunrise terrace', x1: 39, x2: 44, z1: -14, z2: 14, material: 'travertine' },
  { name: 'Ocean lookout', x1: 27, x2: 40, z1: -23, z2: -12, material: 'travertine' },
  { name: 'Sage guest suite', x1: 24, x2: 32, z1: 17, z2: 28, material: 'oak', roof: 3.3 },
  { name: 'Sand guest suite', x1: 32, x2: 40, z1: 17, z2: 28, material: 'oak', roof: 3.3 },
  { name: 'Guest gallery', x1: 24, x2: 40, z1: 28, z2: 31, material: 'limestone', roof: 3.3 },
  { name: 'Indigo guest suite', x1: 27, x2: 40, z1: 31, z2: 40, material: 'oak', roof: 3.3 },
  { name: 'Garden gallery', x1: 24, x2: 27, z1: 31, z2: 49, material: 'limestone', roof: 3.3 },
  { name: 'Garage', x1: 27, x2: 40, z1: 40, z2: 51, material: 'concrete', roof: 3.3 },
  { name: 'Arrival steps', x1: -5, x2: 7, z1: 24, z2: 31, material: 'travertine' },
  { name: 'Arrival court', x1: -22, x2: 25, z1: 31, z2: 50, material: 'basalt', level: 4.8 },
  { name: 'Garden path', x1: -31, x2: -22, z1: 33, z2: 43, material: 'travertine' },
]
export const walls: Wall[] = []
const wall = (x1:number,x2:number,z1:number,z2:number,height=3.5,material='plaster') => walls.push({x1,x2,z1,z2,height,material})
// Openings are part of the floor plan, not holes patched into collision later.
export function partition(axis:'x'|'z',at:number,from:number,to:number,gaps:number[][]=[],height=3.5,material='plaster') {
  let edge=from
  for(const [a,b] of [...gaps,[to,to]]) { if(a>edge) axis==='x'?wall(at-.18,at+.18,edge,a,height,material):wall(edge,a,at-.18,at+.18,height,material); edge=b }
}
partition('x',-11,-12,8,[[-8,-2],[3,7]],5.5,'travertine')
partition('x',13,-12,8,[[-7,-2],[3,7]],5.5,'travertine')
partition('z',8,-11,13,[[-4,5]],4.5)
partition('z',24,-6,8,[[-1.2,3.2]],4.5,'travertine')
partition('x',-6,8,24,[[15,20]],4.5)
partition('x',8,8,24,[[10,14],[19,23]],4.5)
partition('x',-23,-17,14,[[-9,-5],[4,8]],3.8,'walnut')
partition('z',14,-23,-6,[[-10,-6.3]],3.6)
partition('z',2,-23,-11,[[-19,-12]],3.6)
partition('x',-26,-2,39,[[3,6],[16,19],[29,32]],3.4)
partition('z',-2,-39,-26,[],3.4,'walnut')
partition('z',11,-39,-26,[],3.4,'walnut')
partition('z',24,-39,-26,[],3.4)
partition('z',39,-39,-23,[[-26,-23]],3.5)
partition('x',-39,-2,39,[[14,22],[26,35]],3.5,'basalt')
partition('z',15,8,20,[[14,18]],3.6)
partition('x',20,15,28,[[19,23]],3.6)
partition('z',28,8,20,[],3.6,'walnut')
partition('x',24,-12,28,[[-7,-3],[5,9],[20,23]],3.8)
partition('z',2,24,39,[[26,29],[34,37]],3.3)
partition('x',31,2,13,[[5,8]],3.3)
partition('z',13,24,39,[],3.3)
partition('z',17,24,40,[],3.3)
partition('x',32,17,28,[],3.3)
partition('z',28,24,40,[[27,30],[35,38]],3.3)
partition('z',31,27,40,[[28,31]],3.3)
partition('x',27,31,51,[[34,37],[44,47]],3.3)
partition('z',40,27,40,[],3.3)
partition('x',40,17,51,[[19,26],[33,38]],3.3)
partition('z',51,27,40,[[28,39]],3.3)
export const glass: Wall[] = [
  {x1:-11,x2:-7,z1:-12.08,z2:-11.98,height:4.8,material:'glass'},
  {x1:9,x2:13,z1:-12.08,z2:-11.98,height:4.8,material:'glass'},
  {x1:-23,x2:-11,z1:-12.08,z2:-11.98,height:3.8,material:'glass'},
  {x1:-35,x2:-23,z1:-17.08,z2:-16.98,height:3.4,material:'glass'},
  {x1:-35.08,x2:-34.98,z1:-17,z2:-2,height:3.4,material:'glass'},
  {x1:24,x2:29,z1:-12.08,z2:-11.98,height:3.4,material:'glass'},
  {x1:33,x2:39,z1:-12.08,z2:-11.98,height:3.4,material:'glass'},
  {x1:38.98,x2:39.08,z1:-12,z2:-5,height:3.4,material:'glass'},
  {x1:38.98,x2:39.08,z1:-2,z2:13,height:3.0,material:'glass'},
  {x1:39.98,x2:40.08,z1:19,z2:26,height:2.9,material:'glass'},
  {x1:39.98,x2:40.08,z1:33,z2:38,height:2.9,material:'glass'},
  {x1:-39.08,x2:-38.98,z1:14,z2:22,height:3.1,material:'glass'},
  {x1:-39.08,x2:-38.98,z1:26,z2:35,height:3.1,material:'glass'},
]
export type Furnishing = { kind:string; x:number; z:number; angle?:number; tone?:string; scale?:number }
export const furnishings:Furnishing[] = [
  {kind:'sofa',x:-2,z:-5},{kind:'sofa',x:-2,z:.6,angle:Math.PI},{kind:'lounge',x:-6,z:-2.4,angle:-Math.PI/2},{kind:'lounge',x:2.3,z:-2.1,angle:Math.PI/2},
  {kind:'coffee',x:-2,z:-2.3},{kind:'piano',x:8.9,z:-6.7,angle:-.5},
  {kind:'dining',x:-17,z:-5.3},{kind:'island',x:-16.3,z:7.6},
  {kind:'sofa',x:-29,z:-11},{kind:'lounge',x:-32,z:-7,angle:-1.3},{kind:'coffee',x:-29,z:-8.2},
  {kind:'bed',x:32,z:-4,angle:Math.PI,tone:'linen',scale:1.25},{kind:'lounge',x:36.5,z:-9,angle:2.6},
  {kind:'bath',x:36,z:6.3,angle:0.4},{kind:'wardrobeIsland',x:27.5,z:7.5},
  {kind:'desk',x:14,z:23},{kind:'lounge',x:10.5,z:18.5,angle:-.6},
  {kind:'bed',x:28,z:22,angle:Math.PI,tone:'sage'},
  {kind:'bed',x:36,z:21.5,angle:Math.PI,tone:'clay'},
  {kind:'bed',x:34.5,z:35.2,angle:Math.PI/2,tone:'indigo'},
  {kind:'sofa',x:-33,z:6,angle:Math.PI,tone:'indigo'},{kind:'sofa',x:-33,z:2,angle:Math.PI,tone:'indigo'},
  {kind:'treadmill',x:-36,z:16},{kind:'treadmill',x:-32.8,z:16},
  {kind:'treatment',x:-33,z:31.5},
  {kind:'sofa',x:-18,z:-17,angle:Math.PI/2},{kind:'sofa',x:-14.5,z:-20},{kind:'fire',x:-15,z:-17},
  {kind:'outdoorDining',x:21,z:-17.5},
  {kind:'lounger',x:-13,z:-28,angle:Math.PI},{kind:'lounger',x:14,z:-28,angle:Math.PI},
  {kind:'lounge',x:32,z:-19,angle:2.5},{kind:'lounge',x:36,z:-19,angle:-2.5},{kind:'fire',x:34,z:-17,scale:.7},
]
const sizes:Record<string,[number,number]>={sofa:[3.5,1.18],lounge:[1.12,1.18],coffee:[1.9,1.35],piano:[2,2.5],dining:[3.5,6.2],island:[2,4.8],bed:[3.1,3.8],bath:[2.5,1.35],wardrobeIsland:[1.5,2.6],desk:[3.4,2.3],treadmill:[1.05,2.3],treatment:[1.5,2.7],fire:[2.2,1.3],outdoorDining:[3.4,5.5],lounger:[.95,2.2]}
export function footprint(f:Furnishing):Rect {
  const [w,d]=sizes[f.kind],a=f.angle||0,s=f.scale||1
  const dx=(Math.abs(Math.cos(a))*w+Math.abs(Math.sin(a))*d)*s/2,dz=(Math.abs(Math.sin(a))*w+Math.abs(Math.cos(a))*d)*s/2
  return {x1:f.x-dx,x2:f.x+dx,z1:f.z-dz,z2:f.z+dz}
}
export const obstacles:Rect[]=[...walls,...glass,...furnishings.map(footprint),
  {x1:-20,x2:-12,z1:18,z2:27}, // courtyard planting / fountain
  {x1:-22.8,x2:-21.8,z1:3,z2:13}, // kitchen run
  {x1:24.3,x2:25.2,z1:3,z2:12},{x1:29.8,x2:30.8,z1:3,z2:12},
  {x1:31.5,x2:37.7,z1:11.8,z2:12.8}, // vanity
  {x1:-38.8,x2:-35.3,z1:34,z2:38.8}, // sauna
  {x1:-35,x2:-30,z1:35,z2:38.8}, // spa water
  {x1:10,x2:19,z1:26.9,z2:27.8}, // library shelves
  {x1:-3,x2:5,z1:37,z2:45}, // arrival fountain
]
export const destinations=[
  {name:'Entrance',x:1,z:27,yaw:0},{name:'Great room',x:7,z:3,yaw:.7},
  {name:'Pool',x:3,z:-22,yaw:0},{name:'Courtyard',x:-9,z:24,yaw:1.4},
  {name:'Kitchen',x:-12.8,z:10.5,yaw:1.2},{name:'Primary suite',x:28,z:-8.5,yaw:-1.3},
  {name:'Spa',x:-28.5,z:30,yaw:1.4},{name:'Library',x:16,z:17,yaw:Math.PI},
  {name:'Guest suites',x:25.5,z:29.5,yaw:-1.4},{name:'Ocean lookout',x:30,z:-15,yaw:0},
]
export function contains(r:Rect,p:Point,pad=0){return p.x>=r.x1-pad&&p.x<=r.x2+pad&&p.z>=r.z1-pad&&p.z<=r.z2+pad}
export function floorAt(p:Point):number|null {
  const f=floors.find(r=>contains(r,p))
  if(!f)return null
  if(f.name==='Arrival steps')return FLOOR-Math.max(0,Math.min(1,(p.z-24)/7))*1.2
  return f.level??FLOOR
}
export function locationAt(p:Point){return floors.find(r=>contains(r,p))?.name||'Ocean Estate'}
