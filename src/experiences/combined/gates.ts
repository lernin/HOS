export type GatePoint = { x: number; z: number }

export const ESTATE_GATE = { x: 1, z: 59 } as const
export const WOODLAND_GATE = { x: -8, z: 110 } as const

function valid(point: GatePoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.z)
}

// Triggers only after the player is walking toward a short forest connector
// on the north side of the round arrival court. The original Estate scene
// collision model remains unchanged.
export function estateCrossing(point: GatePoint, moving: boolean): boolean {
  return moving && valid(point) && point.z >= ESTATE_GATE.z - .4 &&
    Math.abs(point.x - ESTATE_GATE.x) <= 8
}

// Forest trail entry is at the existing first-person spawn. Moving several
// metres toward the lightweight estate glimpse switches back.
export function woodlandCrossing(point: GatePoint, moving: boolean): boolean {
  return moving && valid(point) && point.z >= WOODLAND_GATE.z - .4 &&
    Math.abs(point.x - WOODLAND_GATE.x) <= 8
}
