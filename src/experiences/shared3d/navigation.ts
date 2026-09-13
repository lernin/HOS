export type NavPoint = { x: number; z: number }

export type NavigationSurface = {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  cell?: number
  radius?: number
  maxGrade?: number
  walkable: (point: NavPoint, radius: number) => boolean
  heightAt: (point: NavPoint) => number | null
}

function gradeSafe(surface: NavigationSurface, a: NavPoint, b: NavPoint) {
  const ya = surface.heightAt(a)
  const yb = surface.heightAt(b)
  if (ya === null || yb === null) return false
  const distance = Math.max(0.001, Math.hypot(b.x - a.x, b.z - a.z))
  const maxGrade = surface.maxGrade ?? 0.72
  return Math.abs(yb - ya) <= Math.max(0.05, distance * maxGrade)
}

export function clearLine(surface: NavigationSurface, a: NavPoint, b: NavPoint, radius = surface.radius ?? 0.3) {
  const distance = Math.hypot(b.x - a.x, b.z - a.z)
  const steps = Math.max(1, Math.ceil(distance / 0.14))
  let previous = a
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const point = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }
    if (!surface.walkable(point, radius) || !gradeSafe(surface, previous, point)) return false
    previous = point
  }
  return true
}

export function moveSafely(surface: NavigationSurface, point: NavPoint, dx: number, dz: number, radius = surface.radius ?? 0.3): NavPoint {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.1))
  let current = { ...point }
  for (let i = 0; i < steps; i++) {
    const sx = dx / steps
    const sz = dz / steps
    const direct = { x: current.x + sx, z: current.z + sz }
    if (surface.walkable(direct, radius) && gradeSafe(surface, current, direct)) {
      current = direct
      continue
    }
    const slideX = { x: current.x + sx, z: current.z }
    if (surface.walkable(slideX, radius) && gradeSafe(surface, current, slideX)) {
      current = slideX
      continue
    }
    const slideZ = { x: current.x, z: current.z + sz }
    if (surface.walkable(slideZ, radius) && gradeSafe(surface, current, slideZ)) current = slideZ
  }
  return current
}

export function createGridNavigator(surface: NavigationSurface) {
  const cell = surface.cell ?? 0.5
  const radius = surface.radius ?? 0.3
  const columns = Math.floor((surface.maxX - surface.minX) / cell) + 1
  const rows = Math.floor((surface.maxZ - surface.minZ) / cell) + 1
  const grid = new Uint8Array(columns * rows)
  const pointFor = (index: number): NavPoint => ({
    x: surface.minX + (index % columns) * cell,
    z: surface.minZ + Math.floor(index / columns) * cell,
  })

  for (let index = 0; index < grid.length; index++) {
    grid[index] = Number(surface.walkable(pointFor(index), radius + 0.04))
  }

  function nearest(point: NavPoint) {
    const column = Math.round((point.x - surface.minX) / cell)
    const row = Math.round((point.z - surface.minZ) / cell)
    let best = -1
    let bestDistance = Infinity
    for (let rz = -4; rz <= 4; rz++) {
      for (let cx = -4; cx <= 4; cx++) {
        const x = column + cx
        const z = row + rz
        if (x < 0 || x >= columns || z < 0 || z >= rows) continue
        const index = z * columns + x
        if (!grid[index]) continue
        const candidate = pointFor(index)
        const distance = Math.hypot(candidate.x - point.x, candidate.z - point.z)
        if (distance < bestDistance && clearLine(surface, point, candidate, radius)) {
          best = index
          bestDistance = distance
        }
      }
    }
    return best
  }

  function path(start: NavPoint, end: NavPoint): NavPoint[] | null {
    if (!surface.walkable(start, radius) || !surface.walkable(end, radius)) return null
    if (clearLine(surface, start, end, radius)) return [{ ...end }]
    const first = nearest(start)
    const last = nearest(end)
    if (first < 0 || last < 0) return null

    const costs = new Float32Array(grid.length)
    costs.fill(Infinity)
    const parents = new Int32Array(grid.length)
    parents.fill(-1)
    const closed = new Uint8Array(grid.length)
    const heap: { id: number; score: number }[] = []
    const destination = pointFor(last)
    const heuristic = (index: number) => {
      const point = pointFor(index)
      return Math.hypot(point.x - destination.x, point.z - destination.z) / cell
    }
    const push = (id: number, score: number) => {
      heap.push({ id, score })
      let index = heap.length - 1
      while (index > 0) {
        const parent = (index - 1) >> 1
        if (heap[parent].score <= score) break
        const tmp = heap[parent]
        heap[parent] = heap[index]
        heap[index] = tmp
        index = parent
      }
    }
    const pop = () => {
      const result = heap[0].id
      const lastItem = heap.pop()!
      if (heap.length) {
        heap[0] = lastItem
        let index = 0
        for (;;) {
          let next = index
          const left = index * 2 + 1
          const right = left + 1
          if (left < heap.length && heap[left].score < heap[next].score) next = left
          if (right < heap.length && heap[right].score < heap[next].score) next = right
          if (next === index) break
          const tmp = heap[next]
          heap[next] = heap[index]
          heap[index] = tmp
          index = next
        }
      }
      return result
    }

    costs[first] = 0
    push(first, heuristic(first))
    const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]] as const

    while (heap.length) {
      const current = pop()
      if (closed[current]) continue
      if (current === last) {
        const route: NavPoint[] = [{ ...end }]
        let index = current
        while (index !== first) {
          route.push(pointFor(index))
          index = parents[index]
          if (index < 0) return null
        }
        route.push(pointFor(first))
        route.reverse()

        const smooth: NavPoint[] = []
        let anchor = start
        let cursor = 0
        while (cursor < route.length) {
          let farthest = cursor
          while (farthest + 1 < route.length && clearLine(surface, anchor, route[farthest + 1], radius)) farthest++
          smooth.push(route[farthest])
          anchor = route[farthest]
          cursor = farthest + 1
        }
        return smooth
      }

      closed[current] = 1
      const column = current % columns
      const row = Math.floor(current / columns)
      for (const [dx, dz] of neighbors) {
        const x = column + dx
        const z = row + dz
        if (x < 0 || x >= columns || z < 0 || z >= rows) continue
        const next = z * columns + x
        if (!grid[next] || closed[next]) continue
        if (dx && dz && (!grid[current + dx] || !grid[current + dz * columns])) continue
        if (!gradeSafe(surface, pointFor(current), pointFor(next))) continue
        const cost = costs[current] + (dx && dz ? Math.SQRT2 : 1)
        if (cost < costs[next]) {
          costs[next] = cost
          parents[next] = current
          push(next, cost + heuristic(next))
        }
      }
    }
    return null
  }

  return { path }
}
