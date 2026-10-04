export type PlanPoint = readonly [number, number]

export const poolWater = {
  x1: -11,
  x2: 12,
  z1: -36.2,
  z2: -24.2,
}

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
  { id:'tree-west-arrival', x:-29, y:5.2, z:30, size:1.1, seed:3 },
  { id:'tree-east-cliff', x:46, y:4, z:-7, size:1.25, seed:1 },
  { id:'tree-west-coast', x:-30, y:5.1, z:-25, size:1.5, seed:8 },
  { id:'tree-east-arrival', x:18, y:4.7, z:43, size:1.2, seed:9 },
] as const

export const featurePalms = [
  { id:'palm-arrival-west', x:-8, z:28, size:4.2 },
  { id:'palm-arrival-east', x:10, z:28, size:4.7 },
  { id:'palm-ocean-west', x:-21, z:-21, size:4 },
  { id:'palm-ocean-east', x:25, z:-22, size:4.8 },
  { id:'palm-garden-west', x:-34, z:41, size:4.5 },
  { id:'palm-garden-east', x:44, z:21, size:4.2 },
] as const

export const architecturalPlanters = [
  [-9,-10],[11,-10],[-9,6],[11,6],[25,-10],[38,0],[9,26],[-22,12],[-34,-3],[-27,27],[42,-12],[42,12],[-7,22],
] as const satisfies readonly PlanPoint[]


export const coastSegments = 100
export const coastEdgeScale = (a:number) => 1 + .04*Math.sin(a*7) + .025*Math.sin(a*13)
export const coastZ = (a:number,r:number) => 7 + Math.sin(a)*64*r*(Math.sin(a)<0 ? .7+.3*Math.min(1,Math.abs(Math.cos(a))*3) : 1)
export const coastPoint = (a:number,r:number) => {
  const edge=coastEdgeScale(a)
  return [Math.cos(a)*58*r*edge,coastZ(a,r)*edge] as const
}
export const coastline = Array.from({length:coastSegments+1},(_,i)=>coastPoint(i/coastSegments*Math.PI*2,1))
