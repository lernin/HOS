import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const source = readFileSync(new URL('../src/experiences/water-garden/model.ts', import.meta.url), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { respond, lines, stages, tasks, targets, canWalk, findPath, readStage, riverX, distance } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)

test('complete learning loop reaches a blooming flower', () => {
  let stage = 'hello'
  for (const expected of ['can', 'water', 'flower', 'done']) {
    const target = tasks[stage].target
    const next = respond(stage, target, lines[target].answer)
    assert.equal(next.ok, true); assert.equal(next.stage, expected); stage = next.stage
  }
})
test('wrong answers and out-of-order objects preserve progress', () => {
  for (const stage of stages.slice(0, -1)) {
    assert.equal(respond(stage, tasks[stage].target, 'unrelated answer').stage, stage)
    for (const target of Object.keys(targets).filter(t => t !== tasks[stage].target)) assert.equal(respond(stage, target, lines[target].answer).stage, stage)
  }
  assert.equal(respond('done', 'red', lines.red.answer).stage, 'done')
})
test('invalid saved progress starts safely from hello', () => {
  for (const value of [null, '', '5', '{}', 'undefined', 'invalid']) assert.equal(readStage(value), 'hello')
  for (const stage of stages) assert.equal(readStage(stage), stage)
})
test('water and island edges cannot be walked through; the bridge can', () => {
  for (const z of [-8, -5, 3, 8]) assert.equal(canWalk({ x: riverX(z), z }), false)
  assert.equal(canWalk({ x: 0.7, z: 0 }), true)
  for (const point of [{ x: 30, z: 0 }, { x: 0, z: 30 }, { x: NaN, z: 0 }]) assert.equal(canWalk(point), false)
})
test('every task is reachable in sequence and crossing uses bridge', () => {
  let start = { x: -8, z: 6 }
  for (const target of ['mina', 'can', 'water', 'red']) {
    const end = targets[target].approach, route = findPath(start, end)
    assert.ok(route.length, `${target} has a path`)
    assert.ok(route.every(canWalk), `${target}: all waypoints are walkable`)
    assert.ok(distance(route.at(-1), end) < 0.1)
    if (target === 'red') assert.ok(route.some(p => Math.abs(p.x - riverX(p.z)) < 1 && Math.abs(p.z) <= 1.1))
    start = end
  }
})
test('both flowers and the gardener remain reachable after completion', () => {
  for (const object of Object.values(targets)) assert.ok(findPath(targets.red.approach, object.approach).length)
})
test('garden has no recording, network, account or database dependencies', () => {
  for (const file of ['../src/experiences/WaterGarden.tsx', '../src/experiences/water-garden/audio.ts', '../src/experiences/water-garden/scene.ts']) {
    const content = readFileSync(new URL(file, import.meta.url), 'utf8')
    assert.doesNotMatch(content, /getUserMedia|MediaRecorder|fetch\(|supabase|\/api\//)
  }
})
test('existing Lab gate and deployment restrictions are retained', () => {
  const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8')
  assert.ok(main.indexOf("if (!pin) return") < main.indexOf("if (view === 'water-garden') return"))
  const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
  assert.equal(vercel.git.deploymentEnabled['*'], false)
  assert.equal(vercel.git.deploymentEnabled.main, true)
  assert.ok(vercel.rewrites.some(r => r.source === '/water-garden'))
})
