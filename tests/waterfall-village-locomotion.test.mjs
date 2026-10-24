import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

function moduleUrl(source) {
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
}

const worldSource = readFileSync(new URL('../src/experiences/village/world.ts', import.meta.url), 'utf8')
const worldUrl = moduleUrl(worldSource)
const w = await import(worldUrl)
const locomotionSource = readFileSync(new URL('../src/experiences/village/locomotion.ts', import.meta.url), 'utf8')
const locomotionCode = ts.transpileModule(locomotionSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  .replace(/from ['"]\.\/world['"]/, `from '${worldUrl}'`)
const l = await import(`data:text/javascript;base64,${Buffer.from(locomotionCode).toString('base64')}`)

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)

function nearestDistance(position, path) {
  let best = Infinity
  for (let i = 1; i < path.points.length; i++) best = Math.min(best, w.projectSegment(position.x, position.z, path.points[i - 1], path.points[i]).distance)
  return best
}

function fixedAimWalk(start, end, rawX, rawZ, forwardIntent) {
  let position = { ...start }, guide = null
  for (let tick = 0; tick < 1400; tick++) {
    const move = l.assistedWalkStep(position, rawX, rawZ, forwardIntent, 0, guide)
    assert.ok(distance(move.position, position) > 1e-5, `guided movement stuck at ${JSON.stringify(position)}`)
    position = move.position
    guide = move.guide
    if (distance(position, end) < .22 && Math.abs(position.y - end.y) < .16) break
  }
  return { position, guide }
}

test('holding one forward direction climbs the full winding tree walk without steering the curve', () => {
  const path = w.pathNamed('winding-tree-walk')
  const start = path.points[0], next = path.points[1], end = path.points.at(-1)
  const d = distance(start, next)
  const rawX = (next.x - start.x) / d * .055, rawZ = (next.z - start.z) / d * .055
  const result = fixedAimWalk(start, end, rawX, rawZ, 1)
  assert.ok(distance(result.position, end) < .22, `finished near top: ${JSON.stringify(result.position)}`)
  assert.ok(Math.abs(result.position.y - end.y) < .16, 'reached the upper loop rather than snapping to the lower overlap')
})

test('the same forward-thumb behavior descends the full winding tree walk', () => {
  const path = w.pathNamed('winding-tree-walk')
  const start = path.points.at(-1), next = path.points.at(-2), end = path.points[0]
  const d = distance(start, next)
  const rawX = (next.x - start.x) / d * .055, rawZ = (next.z - start.z) / d * .055
  const result = fixedAimWalk(start, end, rawX, rawZ, 1)
  assert.ok(distance(result.position, end) < .22)
  assert.ok(Math.abs(result.position.y - end.y) < .16)
})

test('ordinary trails magnetically recenter but a deliberate sideways thumb gesture disengages the guide', () => {
  const path = w.pathNamed('willow-to-tree')
  const a = path.points[45], b = path.points[46]
  const length = distance(a, b), tx = (b.x - a.x) / length, tz = (b.z - a.z) / length
  const nx = -tz, nz = tx
  let position = { x: a.x + nx * .62, y: a.y, z: a.z + nz * .62 }, guide = null
  const initial = nearestDistance(position, path)

  for (let i = 0; i < 24; i++) {
    const move = l.assistedWalkStep(position, tx * .05, tz * .05, 1, 0, guide)
    position = move.position; guide = move.guide
  }
  assert.ok(nearestDistance(position, path) < initial * .72, 'trail guidance pulls the walker gently toward the centreline')

  const before = { ...position }
  const escape = l.assistedWalkStep(position, nx * .055, nz * .055, 0, 1, guide)
  assert.equal(escape.guide, null)
  assert.ok(distance(escape.position, before) > .02, 'sideways intent remains useful for leaving an ordinary trail')
})

test('movement inside cottages remains free rather than being captured by a nearby path', () => {
  const h = w.houses[0]
  const start = { x: h.x, y: h.y, z: h.z + .5 }
  const move = l.assistedWalkStep(start, .045, 0, 1, 0, null)
  assert.equal(move.guided, false)
  assert.equal(move.guide, null)
})
