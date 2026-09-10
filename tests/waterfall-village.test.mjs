import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const source = readFileSync(new URL('../src/experiences/village/world.ts', import.meta.url), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const w = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
function follow(start, points) {
  let pos = { ...start }
  for (const target of points) {
    for (let tick = 0; tick < 3000 && distance(pos, target) > .08; tick++) {
      const d = distance(pos, target), step = Math.min(.055, d)
      const next = w.walkStep(pos, (target.x - pos.x) / d * step, (target.z - pos.z) / d * step)
      assert.ok(distance(next, pos) > .00001, `Blocked at ${JSON.stringify(pos)} toward ${JSON.stringify(target)}`)
      pos = next
    }
    assert.ok(distance(pos, target) < .09, 'Reached route waypoint')
  }
  return pos
}
test('all paths are walkable in both directions including the full tree stair', () => {
  for (const path of w.paths) {
    const forward = follow(path.points[0], path.points.slice(1))
    assert.ok(Math.abs(forward.y - path.points.at(-1).y) < .55)
    const reverse = [...path.points].reverse()
    const back = follow(reverse[0], reverse.slice(1))
    assert.ok(Math.abs(back.y - reverse.at(-1).y) < .55)
  }
})
test('entrance connects to cottage, treehouse, opposite cottage and lakeside dock', () => {
  follow(w.spawn, [{ x: -27, y: 4, z: 30 }, { x: -27, y: 4, z: 24 }])
  const trunk = follow({ x: -27, y: 4, z: 30 }, w.paths[1].points.slice(1))
  const top = follow(trunk, w.stairPoints)
  const deck = follow(top, w.paths[3].points)
  const inside = follow(deck, [{ x: -39, y: 19, z: -14 }])
  assert.equal(w.placeName(inside, false), 'The Treetop Library')
  const cross = follow({ x: -32, y: 9, z: -4.6 }, [{ x: -20, y: 9, z: -10 }, ...w.paths[4].points])
  follow(cross, [{ x: 26, y: 8, z: -29 }, { x: 26, y: 8, z: -34 }])
  const lakeDock = follow({ x: 26, y: 8, z: -29 }, [{ x: 32, y: 8, z: -28 }, { x: 33, y: 8, z: -41 }, ...w.paths[5].points])
  assert.ok(distance(lakeDock, w.docks[1]) < .1)
})
test('house doors work both ways while walls and furniture block walking', () => {
  for (const h of w.houses) {
    const inside = follow({ x: h.x, y: h.y, z: h.z + 4.1 }, [{ x: h.x, y: h.y, z: h.z }])
    assert.equal(w.placeName(inside, false), h.name)
    follow(inside, [{ x: h.x, y: h.y, z: h.z + 4.1 }])
    assert.ok(w.blocked(h.x + 3.5, h.y, h.z))
    assert.ok(w.blocked(h.x - 2.1, h.y, h.z))
  }
})
test('walking cannot step into the river, off cliffs, or through the great tree', () => {
  const p = { x: -4.3, y: 1.5, z: 42 }
  assert.deepEqual(w.walkStep(p, 1, 0), p)
  assert.equal(w.floorCandidates(0, 45).length, 0)
  assert.ok(w.blocked(w.tree.x, 9, w.tree.z))
  assert.equal(w.floorCandidates(-1000, 0).length, 0)
})
test('river boat can reach the lake with full hull clearance and return to either dock', () => {
  for (let z = 42; z >= -135; z -= .25) assert.ok(w.isWater(w.riverCenter(z), z, 2.5), `Blocked boat at ${z}`)
  const start = { x: w.riverCenter(-105), z: -105 }
  for (let i = 0; i <= 100; i++) {
    const t = i / 100
    assert.ok(w.isWater(start.x + (12.4 - start.x) * t, -105 + 4 * t, 2.5), `Lake dock approach ${t}`)
  }
  assert.equal(w.isWater(90, -130, 2.5), false)
  assert.equal(w.placeName({ x: 3, y: .2, z: -130 }, true), 'The open lake')
})
test('new scene is lazy loaded behind the unchanged Lab gate and both route resolvers include it', () => {
  const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8')
  assert.ok(main.indexOf('if (!pin)') < main.indexOf("if (view === 'waterfall-village')"))
  assert.ok((main.match(/window.location.pathname === '\/waterfall-village'/g) || []).length === 2)
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
  assert.ok(config.rewrites.some(r => r.source === '/waterfall-village' && r.destination === '/'))
  assert.equal(config.git.deploymentEnabled, false)
})
