import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const source=readFileSync(new URL('../src/experiences/estate/npc-motion.ts',import.meta.url),'utf8')
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const {advanceWalker}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'))

test('a garden character walks smoothly along its path without overshooting',()=>{
  const path=[{x:.2,z:0},{x:.22,z:0},{x:1,z:0}]
  const step=advanceWalker({x:0,z:0},path,1,.1)
  assert.ok(Math.abs(step.point.x-.1)<1e-9)
  assert.equal(step.remaining.length,3)
  const next=advanceWalker({x:.195,z:0},path,1,.1)
  assert.equal(next.remaining.length,1,'nearby waypoints do not create pause frames')
  assert.ok(next.point.x>.22&&next.point.x<.3)
})
test('a character never moves when paused and clamps long frames',()=>{
  const path=[{x:5,z:0}]
  assert.deepEqual(advanceWalker({x:0,z:0},path,1,0).point,{x:0,z:0})
  assert.ok(advanceWalker({x:0,z:0},path,1,1).point.x<=.10000001)
  assert.ok(advanceWalker({x:0,z:0},path,100,.02).point.x<=.04000001)
  assert.deepEqual(advanceWalker({x:0,z:0},[{x:0,z:0}],1,.02).remaining,[])
})
test('a character progresses by elapsed time, not device frame count',()=>{
  const path=[{x:1,z:0}]
  let pos={x:0,z:0},route=path
  for(let i=0;i<10;i++){const next=advanceWalker(pos,route,.8,.05);pos=next.point;route=next.remaining}
  assert.ok(Math.abs(pos.x-.4)<1e-8)
})
