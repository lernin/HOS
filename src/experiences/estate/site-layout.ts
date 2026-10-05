export type PlanPoint = readonly [number, number]

// The finished spa roof reaches Y9.945: raise the upstand and gutter above it.
export const spaDome = { cx:-31.7, cz:29.7, rx:4.7, rz:5.15, base:10.18, rise:4.6 }
export const spaTreeBed = { cx:spaDome.cx, cz:spaDome.cz, rx:1.65, rz:1.95 }

// Pool is intentionally narrower than the surrounding terrace. Keep its original
// centre line at x=.5, but widen the side patios equally on both sides.
export const poolWater = {
  x1: -8,
  x2: 9,
  z1: -60.2,
  z2: -24.2,
}
export const poolDeck = { x1:-15, x2:16 }
export const poolWalkNorth=poolWater.z1+.2
export const poolWalkSouth=poolWater.z2+.2

// Shared footprints for the outdoor circuit; north runs from entrance to pool.
export const outdoorPatios = [
  {name:'West ocean promenade',x1:-47,x2:-23,z1:-24,z2:-17,planCode:'P8'},
  {name:'West cliff promenade',x1:-47,x2:-39,z1:-17,z2:44,planCode:'P9'},
  {name:'West arrival terrace',x1:-39,x2:-31,z1:39,z2:44,planCode:'P10'},
  {name:'East cliff promenade',x1:40,x2:50,z1:14,z2:55,planCode:'P11'},
  {name:'East ocean promenade',x1:44,x2:50,z1:-24,z2:14,planCode:'P12'},
  {name:'East arrival terrace',x1:24,x2:40,z1:51,z2:55,planCode:'P13'},
  {name:'Pool-tip terrace',x1:poolDeck.x1,x2:poolDeck.x2,z1:-70,z2:-60.2,level:5.2,planCode:'P14'},
  {name:'East arrival landing',x1:24,x2:27,z1:49,z2:51,planCode:'P15'},
  {name:'West arrival landing',x1:-31,x2:-22,z1:43,z2:44,planCode:'P16'},
] as const
export type StairFlight = {name:string;planCode:string;x1:number;x2:number;z1:number;z2:number;axis:'x'|'z';startLevel:number;endLevel:number;risers:number}
export const outdoorStairs: readonly StairFlight[] = [
  {name:'Arrival staircase 1',planCode:'ST1',x1:-22,x2:-15,z1:39,z2:44,axis:'x',startLevel:6,endLevel:4.8,risers:8},
  {name:'Arrival staircase 2',planCode:'ST2',x1:15,x2:24,z1:47,z2:51,axis:'x',startLevel:4.8,endLevel:6,risers:8},
  {name:'West pool staircase',planCode:'ST3',x1:-15,x2:-11,z1:-64,z2:-60,axis:'z',startLevel:5.2,endLevel:6,risers:5},
  {name:'East pool staircase',planCode:'ST4',x1:12,x2:16,z1:-64,z2:-60,axis:'z',startLevel:5.2,endLevel:6,risers:5},
]
export const courtyardPlanting = {
  x1: -20,
  x2: -12,
  z1: 18,
  z2: 27,
}

export const foyerGardenBeds = [
  { id:'foyer-garden-west', cx:-8.5, cz:11, rx:1.9, rz:2.35 },
  { id:'foyer-garden-east', cx:10.5, cz:11.5, rx:1.8, rz:2.75 },
] as const

export const featureTrees = [
  { id:'tree-courtyard', x:-17.6, y:6.37, z:20.8, size:1.05, seed:4 },
  { id:'tree-west-arrival', x:spaDome.cx, y:5.95, z:spaDome.cz, size:1.1, seed:3 },
  { id:'tree-east-cliff', x:53, y:4, z:-7, size:1.25, seed:1 },
  { id:'tree-west-coast', x:-30, y:5.1, z:-25, size:1.5, seed:8 },
  { id:'tree-east-arrival', x:22, y:4.7, z:43, size:1.2, seed:9 },
] as const

export const featurePalms = [
  { id:'palm-arrival-west', x:-8, z:28, size:4.2 },
  { id:'palm-arrival-east', x:10, z:28, size:4.7 },
  { id:'palm-ocean-west', x:-21, z:-21, size:4 },
  { id:'palm-ocean-east', x:25, z:-22, size:4.8 },
  { id:'palm-garden-west', x:-49, z:36, size:4.5 },
  { id:'palm-garden-east', x:53, z:21, size:4.2 },
] as const

export const architecturalPlanters = [
  [-9,-10],[11,-10],[-9,6],[11,6],[25,-10],[38,0],[9,26],[-22,12],[-34,-3],[-27,27],[42,-12],[42,12],[-7,22],
] as const satisfies readonly PlanPoint[]


export const coastSegments = 100
export const coastEdgeScale = (a:number) => 1 + .04*Math.sin(a*7) + .025*Math.sin(a*13)
const smooth=(lo:number,hi:number,value:number)=>{const t=Math.max(0,Math.min(1,(value-lo)/(hi-lo)));return t*t*(3-2*t)}
export const coastZ = (a:number,r:number) => {
  const north=smooth(.55,.94,-Math.sin(a)),radial=smooth(.25,.7,r)
  const extension=poolWater.z2-poolWater.z1-12+10
  return 7 + Math.sin(a)*64*r*(Math.sin(a)<0 ? .7+.3*Math.min(1,Math.abs(Math.cos(a))*3) : 1)-extension*north*radial
}
export const coastPoint = (a:number,r:number) => {
  const edge=coastEdgeScale(a)
  return [Math.cos(a)*58*r*edge,coastZ(a,r)*edge] as const
}
export const coastline = Array.from({length:coastSegments+1},(_,i)=>coastPoint(i/coastSegments*Math.PI*2,1))

export const estatePlanViews={
  main:{x:-52,y:-75,w:107,h:135},
  arrival:{x:-52,y:15,w:107,h:49},
  site:{x:-66,y:Math.floor(Math.min(...coastline.map(p=>p[1])))-7,w:132,h:76-(Math.floor(Math.min(...coastline.map(p=>p[1])))-7)},
}
