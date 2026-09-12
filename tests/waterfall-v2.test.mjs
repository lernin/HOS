import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const source=readFileSync(new URL('../src/experiences/waterfall-v2/world.ts',import.meta.url),'utf8')
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const w=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)

test('V2 exposes three terrain concepts with exactly fifteen future building sites each',()=>{
  assert.equal(w.concepts.length,3)
  for(const concept of w.concepts){
    const pads=w.getPads(concept.id)
    assert.equal(pads.length,15)
    assert.equal(new Set(pads.map(p=>p.id)).size,15)
    for(const pad of pads){assert.ok(w.canStand(concept.id,pad.x,pad.z),`${concept.id} site ${pad.id} must be walkable`);assert.ok(!w.isRiver(concept.id,pad.x,pad.z),`${concept.id} site ${pad.id} must not sit in the river`)}
  }
})

test('each concept has a primary arch bridge and a separate lower crossing',()=>{
  for(const concept of w.concepts){
    const [arch,lower]=w.getBridges(concept.id)
    assert.equal(arch.primary,true);assert.equal(lower.primary,false);assert.ok(arch.archHeight>2.5);assert.ok(lower.z>arch.z)
    const centreY=w.bridgeHeight(arch,arch.centerX)
    assert.ok(centreY>w.waterHeight(concept.id,arch.z)+2,'grand arch should clear the water')
    assert.ok(w.canStand(concept.id,arch.centerX,arch.z),'grand arch deck must be walkable')
    assert.ok(w.canStand(concept.id,lower.centerX,lower.z),'lower crossing must be walkable')
  }
})

test('the terrain has meaningful vertical range and a continuous macro loop',()=>{
  for(const concept of w.concepts){
    const heights=[]
    for(let x=-60;x<=60;x+=20)for(let z=-60;z<=60;z+=20)heights.push(w.terrainHeight(concept.id,x,z))
    assert.ok(Math.max(...heights)-Math.min(...heights)>7,`${concept.id} should have strong elevation changes`)
    const loop=w.mainLoop(concept.id),first=loop[0],last=loop.at(-1)
    assert.ok(Math.hypot(first.x-last.x,first.z-last.z)<.01,'macro route should close')
  }
})

test('spawn points are safe and above the terrain floor',()=>{
  for(const concept of w.concepts){const p=w.spawnFor(concept.id);assert.ok(w.canStand(concept.id,p.x,p.z));assert.equal(p.y,w.floorHeight(concept.id,p.x,p.z))}
})
