import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const source=readFileSync(new URL('../src/experiences/estate/motion.ts',import.meta.url),'utf8')
const javascript=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const {skipReachedWaypoints,easeGuidedPace}=await import('data:text/javascript;base64,'+Buffer.from(javascript).toString('base64'))

test('guided walk consumes nearby consecutive waypoints without a zero-motion frame',()=>{
  const route=[{x:.02,z:0},{x:.11,z:0},{x:2,z:0}]
  const next=skipReachedWaypoints(route,{x:0,z:0})
  assert.deepEqual(next,[{x:2,z:0}])
  assert.equal(route.length,3,'planned path stays immutable')
  assert.equal(skipReachedWaypoints(next,{x:0,z:0}),next,'no allocation when nothing is reached')
  assert.deepEqual(skipReachedWaypoints([{x:0,z:0}],{x:0,z:0}),[],'arrival consumes final point')
})

test('guided turn slowdown and recovery are smooth, bounded and frame-rate aware',()=>{
  let pace=1
  const decreased=[]
  for(let i=0;i<15;i++){pace=easeGuidedPace(pace,.22,1/60);decreased.push(pace)}
  assert.ok(decreased[0]<1&&decreased[0]>.85,'no instantaneous speed drop')
  for(let i=1;i<decreased.length;i++)assert.ok(decreased[i]<=decreased[i-1],'turn slowdown is monotonic')
  const low=pace
  for(let i=0;i<30;i++)pace=easeGuidedPace(pace,1,1/60)
  assert.ok(pace>low&&pace<1,'recover without overshoot')
  assert.equal(easeGuidedPace(1,.22,0),1,'zero delta makes no movement')
  assert.ok(easeGuidedPace(1,.22,1/30)<easeGuidedPace(1,.22,1/60),'longer frames advance the same time-based easing')
})
