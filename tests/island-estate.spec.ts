import assert from 'node:assert/strict'
import { test } from 'node:test'
import { levels, stairPoint, destinations, pools, type WorldPoint } from '../src/experiences/island-estate/layout'
import { createNavigator, isWalkable, moveSafely, advanceRoute } from '../src/experiences/island-estate/navigation'
import * as T from 'three'
import { createKit } from '../src/experiences/island-estate/geometry'
import { architecture } from '../src/experiences/island-estate/architecture'

const distance = (a: WorldPoint, b: WorldPoint) => Math.hypot(a.x-b.x, a.y-b.y, a.z-b.z)
const navigator = createNavigator()

test('reference floor elevations retain the explicit six-metre spacing', () => {
  assert.deepEqual(levels.map(l => l.y), [8, 14, 20])
})
test('the physical staircase supports ascent and descent with no floor jump', () => {
  for (const flight of [0, 1] as const) {
    let p = stairPoint(flight, 0)
    assert.ok(isWalkable(p), `flight ${flight} start`)
    for (let i = 1; i <= 240; i++) {
      const q = stairPoint(flight, i/240)
      p = moveSafely(p, q.x-p.x, q.z-p.z)
      assert.ok(distance(p,q) < .25, `ascent flight ${flight} sample ${i}: ${JSON.stringify(p)} vs ${JSON.stringify(q)}`)
    }
    for (let i = 239; i >= 0; i--) {
      const q = stairPoint(flight, i/240)
      p = moveSafely(p, q.x-p.x, q.z-p.z)
      assert.ok(distance(p,q) < .25, `descent flight ${flight} sample ${i}`)
    }
  }
})
test('entrance, both wings, first-floor gallery, roof and dock are connected', () => {
  const start = destinations.find(d=>d.id==='entrance')!.position
  for (const destination of destinations) {
    assert.ok(isWalkable(destination.position), `${destination.id} is a valid standing position`)
    const route = navigator.path(start, destination.position)
    assert.ok(route && route.length, `physical route to ${destination.id}`)
    assert.ok(distance(route.at(-1)!, destination.position) < .8, `reaches ${destination.id}`)
    let p = start
    for (const q of route) {
      const n = Math.max(1, Math.ceil(Math.hypot(q.x-p.x,q.z-p.z)/.09))
      const dx=(q.x-p.x)/n, dz=(q.z-p.z)/n
      for (let i=0; i<n; i++) p=moveSafely(p,dx,dz)
      assert.ok(distance(p,q)<.65, `${destination.id}: walk physically reaches route segment ${JSON.stringify(p)} → ${JSON.stringify(q)}`)
    }
  }
})
test('upper floors cannot fall into the atrium or enter the rooftop pool', () => {
  assert.equal(isWalkable({x:0,y:14,z:-7}), false)
  assert.equal(isWalkable({x:0,y:20,z:-7}), false)
  for(const pool of pools) assert.equal(isWalkable({x:pool.center.x,y:pool.y,z:pool.center.z}),false)
  const edge = {x:42,y:20,z:1}
  if(isWalkable(edge)) {
    const next=moveSafely(edge,15,0)
    assert.ok(isWalkable(next))
    assert.ok(next.x<49)
    assert.ok(Math.abs(next.y-20)<.25)
  }
})
test('invalid coordinates and unreachable ocean targets are rejected', () => {
  const start = destinations[0].position
  assert.equal(navigator.path(start,{x:500,y:8,z:500}),null)
  assert.equal(navigator.path(start,{x:NaN,y:8,z:0}),null)
  assert.deepEqual(moveSafely(start,Infinity,0), start)
})
test('the real-time follower reaches all ordered destinations at 16 ms frames',()=>{
  for(const a of destinations)for(const b of destinations) {
    if(a===b)continue
    const route=navigator.path(a.position,b.position)
    assert.ok(route,`${a.id} → ${b.id} has a route`)
    let p={...a.position},blocked=0
    for(let frame=0;route.length&&frame<12000;frame++) {
      const goal={...route[0]},q=advanceRoute(p,route,2.6*.016).position
      if(distance(p,q)<.00001)blocked++;else blocked=0
      p=q
      assert.ok(blocked<5,`${a.id} → ${b.id}: follower stops at ${JSON.stringify(p)} before ${JSON.stringify(goal)}`)
    }
    assert.equal(route.length,0,`${a.id} → ${b.id} completes`)
    assert.ok(distance(p,b.position)<.2,`${a.id} → ${b.id} arrives on the correct floor`)
  }
})
test('the rooftop crown clears a standing visitor and faces outward',()=>{
  const scene=new T.Scene(),kit=createKit(scene)
  try {
    architecture(kit);kit.finish();scene.updateMatrixWorld(true)
    kit.material('shell').side=T.DoubleSide
    const up=new T.Raycaster(new T.Vector3(0,20.04,6),new T.Vector3(0,1,0))
    const hit=up.intersectObjects(kit.root.children,false).find(h=>(h.object as T.Mesh).material===kit.material('shell'))
    assert.ok(hit,'crown is present above the rooftop')
    assert.ok(hit.point.y-20>2.35,`standing clearance is ${hit.point.y-20} m`)
    const down=new T.Raycaster(new T.Vector3(0,35,6),new T.Vector3(0,-1,0))
    const top=down.intersectObjects(kit.root.children,false).find(h=>(h.object as T.Mesh).material===kit.material('shell'))
    assert.ok(top.face.normal.y>0,'crown top faces the sky')
  }finally{kit.dispose()}
})
