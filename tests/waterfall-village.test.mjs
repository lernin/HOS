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
    for (let tick = 0; tick < 5000 && distance(pos, target) > .08; tick++) {
      const d = distance(pos, target), step = Math.min(.055, d)
      const next = w.walkStep(pos, (target.x - pos.x) / d * step, (target.z - pos.z) / d * step)
      assert.ok(distance(next, pos) > .00001, `Blocked at ${JSON.stringify(pos)} toward ${JSON.stringify(target)}`)
      pos = next
    }
    assert.ok(distance(pos, target) < .09, `Reached route waypoint ${JSON.stringify(target)}`)
  }
  return pos
}

function followPath(start, name, reverse = false) {
  const points = [...w.pathNamed(name).points]
  if (reverse) points.reverse()
  return follow(start, points)
}

function enterAndLeave(start, house) {
  const inside = follow(start, [{ x: house.x, y: house.y, z: house.z }])
  assert.equal(w.placeName(inside, false), house.name)
  return follow(inside, [{ x: start.x, y: start.y, z: start.z }])
}

test('every named path is walkable in both directions including the full winding tree walk', () => {
  for (const path of w.paths) {
    const forward = follow(path.points[0], path.points.slice(1))
    assert.ok(Math.abs(forward.y - path.points.at(-1).y) < .55)
    const reverse = [...path.points].reverse()
    const back = follow(reverse[0], reverse.slice(1))
    assert.ok(Math.abs(back.y - reverse.at(-1).y) < .55)
  }
})

test('one continuous walk reaches and enters all three homes before the lake dock', () => {
  let pos = followPath(w.spawn, 'entrance-to-willow')
  pos = enterAndLeave(pos, w.houses[0])

  pos = followPath(pos, 'willow-to-tree')
  pos = followPath(pos, 'winding-tree-walk')
  pos = followPath(pos, 'tree-to-library')
  pos = enterAndLeave(pos, w.houses[1])

  pos = followPath(pos, 'library-to-fern')
  pos = enterAndLeave(pos, w.houses[2])

  pos = followPath(pos, 'fern-to-lake')
  assert.ok(distance(pos, w.docks[1]) < .1)
})

test('river dock is directly reachable from the village entrance', () => {
  const dock = followPath(w.spawn, 'entrance-to-river-dock')
  assert.ok(distance(dock, w.docks[0]) < .1)
})

test('house doors work both ways while walls and sparse furniture block walking', () => {
  for (const h of w.houses) {
    const outside = { x: h.x, y: h.y, z: h.z + 4.2 }
    const inside = follow(outside, [{ x: h.x, y: h.y, z: h.z }])
    assert.equal(w.placeName(inside, false), h.name)
    follow(inside, [outside])
    assert.ok(w.blocked(h.x + 3.4, h.y, h.z))
    assert.ok(w.blocked(h.x - 2.1, h.y, h.z))
  }
})

test('walking stops at water, bridge edges, major rocks, trees and walls', () => {
  const bank = { x: -5.4, y: w.groundHeight(-5.4, 1), z: 1 }
  let pos = bank
  for (let i=0;i<150;i++) pos=w.walkStep(pos,.05,0)
  assert.ok(!w.isWater(pos.x,pos.z), 'Walking stops before open water')
  assert.ok(pos.x<0, 'Cannot cross the channel without its bridge')
  const bridge=w.pathNamed('garden-bridge').points[30]
  let onBridge={...bridge}
  for(let i=0;i<90;i++)onBridge=w.walkStep(onBridge,0,.05)
  assert.ok(distance(onBridge,bridge)<1.9,'Visible bridge railing agrees with its safe surface')
  for(const o of w.obstacles)assert.ok(w.blocked(o.x,w.groundHeight(o.x,o.z),o.z))
  for(const t of w.villageTrees)assert.ok(w.blocked(t.x,w.groundHeight(t.x,t.z),t.z))
  assert.ok(w.blocked(w.tree.x,w.tree.y,w.tree.z))
  assert.equal(w.floorCandidates(-1000,0).length,0)
  const h=w.houses[0],inside={x:h.x,y:h.y,z:h.z}
  assert.ok(w.walkStep(inside,12,0).x<h.x+3.4,'Large deltas cannot tunnel through walls')
})

test('a continuous lower loop crosses the garden bridge, climbs to Fern Cottage and returns', () => {
  let pos=followPath(w.spawn,'entrance-to-willow')
  pos=enterAndLeave(pos,w.houses[0])
  pos=followPath(pos,'cottage-to-bridge')
  pos=followPath(pos,'garden-bridge')
  pos=followPath(pos,'cascade-lookout')
  pos=followPath(pos,'cascade-lookout',true)
  pos=followPath(pos,'bridge-to-fern')
  pos=enterAndLeave(pos,w.houses[2])
  pos=followPath(pos,'bridge-to-fern',true)
  pos=followPath(pos,'garden-bridge',true)
  pos=followPath(pos,'cottage-to-bridge',true)
  pos=followPath(pos,'entrance-to-willow',true)
  assert.ok(distance(pos,w.spawn)<.1)
})

test('lake boat route clears the full hull and both docking approaches', () => {
  const checkpoints=[w.boatStart,{x:2,z:19},{x:4.7,z:21.5},{x:4.7,z:23},{x:2,z:25},{x:-1,z:23},w.boatStart]
  let pos={...checkpoints[0]}
  for(const target of checkpoints.slice(1))for(let i=0;i<100;i++) {
    const t=(i+1)/100,x=pos.x+(target.x-pos.x)*t,z=pos.z+(target.z-pos.z)*t
    assert.ok(w.isWater(x,z,1.55),`Boat hull clearance at ${x}, ${z}`)
    assert.ok(w.waterHeight(z)<w.waterLevel+.12,'Boat cannot climb the cascade')
    if(i===99)pos={...target}
  }
  assert.ok(distance(w.boatStart,w.docks[0])<4.8)
  assert.ok(distance({x:4.7,z:23},w.docks[1])<4.8)
  assert.equal(w.placeName({x:2,y:.65,z:21},true),'The open lake')
})

test('scene stays lazy-loaded behind the Lab gate and route resolvers include it', () => {
  const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8')
  assert.match(main, /const WaterfallVillage = lazy\(\(\) => import/ )
  assert.ok(main.indexOf('if (!pin)') < main.indexOf("if (view === 'waterfall-village')"))
  assert.ok((main.match(/window.location.pathname === '\/waterfall-village'/g) || []).length === 2)
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
  assert.ok(config.rewrites.some(r => r.source === '/waterfall-village' && r.destination === '/'))
})
