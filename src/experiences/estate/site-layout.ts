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
  { id:'foyer-garden-west', x1:-10.61, x2:-6.39, z1:8.44, z2:13.56 },
  { id:'foyer-garden-east', x1:8.49, x2:12.51, z1:8.54, z2:14.46 },
] as const

export const featureTrees = [
  { id:'tree-courtyard', x:-17.6, z:20.8 },
  { id:'tree-west-arrival', x:-29, z:30 },
  { id:'tree-east-cliff', x:46, z:-7 },
  { id:'tree-west-coast', x:-30, z:-25 },
  { id:'tree-east-arrival', x:18, z:43 },
] as const

export const featurePalms = [
  { id:'palm-arrival-west', x:-8, z:28 },
  { id:'palm-arrival-east', x:10, z:28 },
  { id:'palm-ocean-west', x:-21, z:-21 },
  { id:'palm-ocean-east', x:25, z:-22 },
  { id:'palm-garden-west', x:-34, z:41 },
  { id:'palm-garden-east', x:44, z:21 },
] as const

export const architecturalPlanters = [
  [-9,-10],[11,-10],[-9,6],[11,6],[25,-10],[38,0],[9,26],[-22,12],[-34,-3],[-27,27],[42,-12],[42,12],[-7,22],
] as const satisfies readonly PlanPoint[]
