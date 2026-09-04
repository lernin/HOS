import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const source=readFileSync(new URL('../src/experiences/woodland/world.ts',import.meta.url),'utf8')
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const w=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z)
test('large main circuit is closed, with three rejoining routes',()=>{
 assert.ok(distance(w.mainLoop[0],w.mainLoop.at(-1))<1e-9)
 const length=w.mainLoop.slice(1).reduce((n,p,i)=>n+distance(p,w.mainLoop[i]),0)
 assert.ok(length>700&&length<850)
 assert.equal(w.paths.length,4)
 for(const path of w.paths.slice(1))for(const p of [path[0],path.at(-1)])assert.ok(Math.min(...w.mainLoop.map(q=>distance(p,q)))<2)
 console.log(`Main circuit: ${Math.round(length)} metres`)
})
test('placements are deterministic and solid objects leave all paths clear',()=>{
 const a=w.placements(),b=w.placements();assert.deepEqual(a,b);assert.ok(a.filter(p=>p.kind.startsWith('tree')||p.kind==='pine').length>1000)
 for(const p of a.filter(p=>p.solid))assert.ok(w.pathDistance(p.x,p.z)>2.4)
 assert.ok(w.pathDistance(w.spawn.x,w.spawn.z)<.1)
})
test('movement normalizes diagonal speed and respects collision and boundaries',()=>{
 const a=w.move({x:0,z:0},1,0,0,.05,[]),b=w.move({x:0,z:0},1,1,0,.05,[])
 assert.ok(Math.abs(Math.hypot(a.x,a.z)-Math.hypot(b.x,b.z))<1e-9)
 assert.deepEqual(w.move({x:0,z:0},1,0,0,.05,[{x:1,z:0,solid:.8}]),{x:0,z:0})
 assert.ok(w.move({x:193.99,z:0},1,0,0,1,[]).x<194)
})
test('all bundled GLBs have valid container headers and licensed provenance',()=>{
 const models=JSON.parse(readFileSync(new URL('../public/woodland/models.json',import.meta.url),'utf8'))
 for(const m of models){const b=readFileSync(new URL(`../public/woodland/${m.name}.glb`,import.meta.url));assert.equal(b.toString('ascii',0,4),'glTF');assert.equal(b.readUInt32LE(4),2);assert.equal(b.readUInt32LE(8),b.length);assert.match(m.license,/CC0/)}
})
