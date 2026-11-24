// The estate's normal walking pace remains unchanged; higher values are opt-in.
export const BASE_WALK_SPEED = 2.4
export const MAX_WALK_SPEED = BASE_WALK_SPEED * 5

export function clampWalkingSpeed(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return BASE_WALK_SPEED
  return Math.min(MAX_WALK_SPEED, Math.max(1, raw))
}
