import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const dir=await mkdtemp(path.resolve('node_modules/.kuna-test-'))
try {
  const outfile=path.join(dir,'kuna-navigation.mjs')
  const behaviorFile=path.join(dir,'kuna-behavior.mjs')
  await Promise.all([
    build({entryPoints:['src/experiences/estate/npc-navigation.ts'],outfile,bundle:true,platform:'node',format:'esm',packages:'external'}),
    build({entryPoints:['src/experiences/estate/npc-behavior.ts'],outfile:behaviorFile,bundle:true,platform:'node',format:'esm',packages:'external'}),
  ])
  const {createKunaNavigator,createKunaCompanionNavigator,KUNA_HOME,KUNA_KITCHEN_GOALS,KUNA_RADIUS,kunaClearSegment,kunaSafe}=await import(pathToFileURL(outfile).href)
  const {createKunaBehavior,KUNA_MAX_SPEED}=await import(pathToFileURL(behaviorFile).href)
  const nav=createKunaNavigator()
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z)
  const farAway={x:200,z:200}
  test('Kuna has a safe dedicated collision envelope and connected kitchen goals',()=>{
    assert.equal(KUNA_RADIUS,.46,'fox margin exceeds the .31m player radius')
    assert.ok(nav.goals.length>=4,'multiple physically viable goals around the kitchen island')
    assert.equal(kunaSafe(KUNA_HOME),true)
    for(const point of nav.goals) {
      assert.equal(nav.isSafe(point),true,'goal is not inside furniture or outside Kitchen')
      const route=nav.path(KUNA_HOME,point)
      assert.ok(route,'goal has a safe route: '+JSON.stringify(point))
      let previous=KUNA_HOME
      for(const next of route) {
        assert.ok(kunaClearSegment(previous,next),'entire line segment clears fox footprint')
        previous=next
      }
    }
    assert.equal(kunaSafe({x:-16.3,z:7.6}),false,'island is blocked')
    assert.equal(kunaSafe({x:-14.7,z:7.6}),false,'island stools/edges remain blocked')
    assert.equal(kunaSafe({x:-22.2,z:7.0}),false,'kitchen built-ins remain blocked')
    assert.equal(kunaSafe({x:-11.1,z:7.0}),false,'near-wall boundary is not walkable')
    const acrossIsland=KUNA_KITCHEN_GOALS[3]
    assert.equal(kunaClearSegment(KUNA_HOME,acrossIsland),false,'direct line through island is rejected')
    assert.ok(nav.path(KUNA_HOME,acrossIsland)?.length>=2,'A* routes around island')
  })
  test('10-minute fox patrol cannot cross kitchen boundary or kitchen furnishings',()=>{
    const controller=createKunaBehavior(nav,KUNA_HOME)
    const runFor=600,dtPattern=[1/60,1/30,1/45,1/50,.04,1/75]
    let seconds=0,last=controller.snapshot(),distanceMoved=0,walking=0,idle=0,maxJump=0
    for(let frame=0;seconds<runFor;frame++){
      const dt=Math.min(dtPattern[frame%dtPattern.length],runFor-seconds)
      const next=controller.update(dt,farAway)
      assert.ok(nav.isSafe(next.position),'out of bounds '+JSON.stringify(next))
      assert.ok(nav.clear(last.position,next.position),'body crossed obstacle')
      const delta=distance(next.position,last.position)
      maxJump=Math.max(maxJump,delta)
      assert.ok(delta<=KUNA_MAX_SPEED*dt+.012,'unrealistic instantaneous translation')
      const deltaYaw=Math.abs(Math.atan2(Math.sin(next.yaw-last.yaw),Math.cos(next.yaw-last.yaw)))
      assert.ok(deltaYaw<=1.6*dt+.012,'unrealistic instantaneous turn')
      if(next.phase==='walk'&&next.speed>.05)walking++
      if(next.phase==='idle')idle++
      distanceMoved+=delta;last=next;seconds+=dt
    }
    assert.ok(walking>400,'fox actually takes calm walks')
    assert.ok(idle>400,'fox pauses between walks')
    assert.ok(distanceMoved>20,'fox makes real progress between positions')
    console.log('Kuna 10min collision-free patrol: '+distanceMoved.toFixed(1)+'m, '+walking+' walking frames, '+idle+' idle frames; peak step '+maxJump.toFixed(3)+'m')
  })
  test('Kuna movement is consistent across 30 and 60 FPS',()=>{
    const run=(fps)=>{
      const c=createKunaBehavior(nav,KUNA_HOME)
      for(let i=0;i<fps*60;i++)c.update(1/fps,farAway)
      return c.snapshot()
    }
    const thirty=run(30),sixty=run(60)
    assert.ok(distance(thirty.position,sixty.position)<.07,'position is frame independent')
    assert.ok(Math.abs(thirty.speed-sixty.speed)<.08)
  })
  test('Kuna stops for a child, stays stationary while talking, and resumes safely',()=>{
    const c=createKunaBehavior(nav,KUNA_HOME)
    for(let i=0;i<500;i++)c.update(1/60,farAway)
    const before=c.snapshot()
    const child={x:before.position.x+.5,z:before.position.z+.5}
    for(let i=0;i<150;i++)c.update(1/60,child,true)
    const during=c.snapshot()
    assert.equal(during.phase,'talk')
    assert.ok(distance(during.position,before.position)<.001,'talk does not translate')
    assert.equal(during.speed,0)
    for(let i=0;i<180;i++)c.update(1/60,child,false)
    const near=c.snapshot()
    assert.ok(distance(near.position,during.position)<.001,'does not walk into nearby child')
    for(let i=0;i<900;i++){
      const p=c.update(1/60,farAway)
      assert.ok(nav.isSafe(p.position))
    }
  })
  test('engaged Kuna can follow a walking child without collision or teleport',()=>{
    const companion=createKunaCompanionNavigator(nav)
    const c=createKunaBehavior(companion,KUNA_HOME)
    const player={x:-14,z:10.8}
    const target={x:player.x+.78,z:player.z-1.75}
    assert.ok(companion.isSafe(target),'visible over-shoulder destination is safe')
    let previous=c.snapshot(),moved=0
    for(let i=0;i<900;i++){
      const next=c.update(1/60,player,false,{active:true,yaw:0})
      assert.ok(companion.isSafe(next.position),'fox stays on walkable surface')
      assert.ok(companion.clear(previous.position,next.position),'no furniture penetration')
      moved+=distance(next.position,previous.position)
      const turn=Math.abs(Math.atan2(Math.sin(next.yaw-previous.yaw),Math.cos(next.yaw-previous.yaw)))
      assert.ok(turn<1.6/60+.025,'no abrupt yaw snap')
      previous=next
    }
    assert.ok(moved>.15,'fox walks while following a moved child')
    assert.ok(distance(previous.position,target)<1.0,'fox approaches visible shoulder anchor')
    const seated=previous.position
    for(let i=0;i<120;i++){
      const p=c.update(1/60,player,true)
      assert.ok(distance(p.position,seated)<.02,'engagement holds position through speech phases')
    }
  })
  test('if a planned route becomes blocked Kuna stops, rather than sliding into furniture',()=>{
    const fake={
      goals:[{x:0,z:0},{x:3,z:0}],
      isSafe:p=>p.x<.25,
      clear:(a,b)=>b.x<.25,
      path:()=>[{x:.2,z:0},{x:3,z:0}],
    }
    const c=createKunaBehavior(fake,{x:0,z:0})
    for(let i=0;i<900;i++){
      const s=c.update(1/60,farAway)
      assert.ok(s.position.x<.25,'must never penetrate blocked corridor')
    }
  })
}finally{
  // Node test() callbacks run at the end of the current synchronous job. Defer
  // directory cleanup until after the test runner has completed imports.
  await rm(dir,{recursive:true,force:true})
}
