import { houses, paths, walkStep, type Path, type Point } from './world'

export type PathGuideState = {
  pathName: string
  forwardDirection: 1 | -1
  tangentX: number
  tangentZ: number
}

export type AssistedMove = {
  position: Point
  guide: PathGuideState | null
  guided: boolean
}

type PathHit = {
  path: Path
  point: Point
  tangentX: number
  tangentZ: number
  distance: number
  vertical: number
  segment: number
  t: number
  score: number
}

function insideHouse(position: Point) {
  return houses.some(h => Math.abs(position.y - h.y) < .75 && Math.abs(position.x - h.x) < 3.18 && Math.abs(position.z - h.z) < 3.18)
}

function project(position: Point, path: Path, segment: number): PathHit | null {
  const a = path.points[segment], b = path.points[segment + 1]
  const dx = b.x - a.x, dz = b.z - a.z, length2 = dx * dx + dz * dz
  if (length2 < 1e-8) return null
  const t = Math.max(0, Math.min(1, ((position.x - a.x) * dx + (position.z - a.z) * dz) / length2))
  const x = a.x + dx * t, z = a.z + dz * t, y = a.y + (b.y - a.y) * t
  const horizontal = Math.hypot(position.x - x, position.z - z)
  const vertical = Math.abs(position.y - y)
  const length = Math.sqrt(length2)
  return {
    path,
    point: { x, y, z },
    tangentX: dx / length,
    tangentZ: dz / length,
    distance: horizontal,
    vertical,
    segment,
    t,
    score: Infinity,
  }
}

export function pathGuideAt(position: Point, desiredX = 0, desiredZ = 0, preferredPathName?: string | null): PathHit | null {
  const desiredLength = Math.hypot(desiredX, desiredZ)
  let best: PathHit | null = null

  for (const path of paths) {
    const constrained = path.kind !== 'trail'
    const capture = path.width * .5 + (constrained ? .36 : .52)
    const verticalLimit = constrained ? .62 : .9

    for (let segment = 0; segment < path.points.length - 1; segment++) {
      const hit = project(position, path, segment)
      if (!hit || hit.distance > capture || hit.vertical > verticalLimit) continue

      const alignment = desiredLength > 1e-5
        ? Math.abs((desiredX * hit.tangentX + desiredZ * hit.tangentZ) / desiredLength)
        : 1
      const atEndpoint = (segment === 0 && hit.t < .18) || (segment === path.points.length - 2 && hit.t > .82)
      const preferredBonus = path.name === preferredPathName ? (atEndpoint ? -.015 : -.05) : 0
      const constrainedBonus = constrained && hit.distance < path.width * .5 ? -.07 : 0
      hit.score = hit.distance + hit.vertical * 1.7 + (1 - alignment) * (constrained ? .12 : .18) + preferredBonus + constrainedBonus

      if (!best || hit.score < best.score) best = hit
    }
  }
  return best
}

function forwardDirectionFor(hit: PathHit, dx: number, dz: number, forwardIntent: number, previous: PathGuideState | null): 1 | -1 {
  if (previous?.pathName === hit.path.name) return previous.forwardDirection

  const atStart = hit.segment === 0 && hit.t < .28
  const atEnd = hit.segment === hit.path.points.length - 2 && hit.t > .72
  if (atStart) return 1
  if (atEnd) return -1

  const speed = Math.hypot(dx, dz)
  let aimX = speed > 1e-6 ? dx / speed : 0
  let aimZ = speed > 1e-6 ? dz / speed : 0
  let dot = aimX * hit.tangentX + aimZ * hit.tangentZ

  if (Math.abs(dot) < .16 && previous) {
    aimX = previous.tangentX * previous.forwardDirection
    aimZ = previous.tangentZ * previous.forwardDirection
    dot = aimX * hit.tangentX + aimZ * hit.tangentZ
  }

  const actualDirection: 1 | -1 = dot >= 0 ? 1 : -1
  const inputDirection: 1 | -1 = forwardIntent >= 0 ? 1 : -1
  return (actualDirection * inputDirection) as 1 | -1
}

function movedDistance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

export function assistedWalkStep(
  position: Point,
  dx: number,
  dz: number,
  forwardIntent: number,
  lateralIntent: number,
  previous: PathGuideState | null = null,
): AssistedMove {
  const speed = Math.hypot(dx, dz)
  if (speed < 1e-7) return { position: { ...position }, guide: previous, guided: Boolean(previous) }
  if (insideHouse(position)) return { position: walkStep(position, dx, dz), guide: null, guided: false }

  const hit = pathGuideAt(position, dx, dz, previous?.pathName)
  if (!hit) return { position: walkStep(position, dx, dz), guide: null, guided: false }

  const forwardAmount = Math.abs(forwardIntent), lateralAmount = Math.abs(lateralIntent)
  const constrained = hit.path.kind !== 'trail'

  // Ordinary trails should feel magnetic, not imprisoning. A clear sideways thumb
  // gesture deliberately drops the guide so children can wander into open ground.
  if (!constrained && lateralAmount > .48 && lateralAmount > forwardAmount * 1.25) {
    return { position: walkStep(position, dx, dz), guide: null, guided: false }
  }

  const forwardDirection = forwardDirectionFor(hit, dx, dz, forwardIntent, previous)
  const guide: PathGuideState = { pathName: hit.path.name, forwardDirection, tangentX: hit.tangentX, tangentZ: hit.tangentZ }
  const intentTotal = Math.max(1e-6, forwardAmount + lateralAmount)
  const forwardShare = forwardAmount / intentTotal
  const alongScale = forwardAmount < .035 ? 0 : Math.min(1, forwardShare / (constrained ? .46 : .62))
  const inputSign: 1 | -1 = forwardIntent >= 0 ? 1 : -1
  const travelSign = forwardDirection * inputSign

  const tangentDot = dx * hit.tangentX + dz * hit.tangentZ
  const lateralX = dx - hit.tangentX * tangentDot
  const lateralZ = dz - hit.tangentZ * tangentDot
  const lateralScale = hit.path.kind === 'stair' ? .08 : constrained ? .16 : .34

  let moveX = hit.tangentX * travelSign * speed * alongScale + lateralX * lateralScale
  let moveZ = hit.tangentZ * travelSign * speed * alongScale + lateralZ * lateralScale

  const centerX = hit.point.x - position.x, centerZ = hit.point.z - position.z
  const centerDistance = Math.hypot(centerX, centerZ)
  if (centerDistance > .015) {
    const centerGain = hit.path.kind === 'stair' ? .24 : constrained ? .18 : .11
    const centerCap = speed * (hit.path.kind === 'stair' ? .58 : constrained ? .48 : .32)
    const correction = Math.min(centerCap, centerDistance * centerGain)
    moveX += centerX / centerDistance * correction
    moveZ += centerZ / centerDistance * correction
  }

  const requested = Math.hypot(moveX, moveZ)
  const cap = speed * 1.06
  if (requested > cap) {
    moveX *= cap / requested
    moveZ *= cap / requested
  }

  let next = walkStep(position, moveX, moveZ)

  // Narrow elevated surfaces are where manual steering felt worst. If a blended
  // correction still catches a railing/collision seam, retry a shorter pure
  // centreline step rather than leaving the player stuck against it.
  if (constrained && alongScale > 0 && movedDistance(position, next) < speed * .18) {
    const fallback = walkStep(position, hit.tangentX * travelSign * speed * .72, hit.tangentZ * travelSign * speed * .72)
    if (movedDistance(position, fallback) > movedDistance(position, next)) next = fallback
  }

  return { position: next, guide, guided: true }
}
