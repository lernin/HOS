import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'

async function importTs(path){
 const source=readFileSync(new URL(path,import.meta.url),'utf8')
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
 return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
}

const w=await importTs('../src/experiences/woodland/world.ts')
const score=await importTs('../src/experiences/woodland/musicWorld.ts')
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
test('musical world exposes ten ordered colors and compatible melody banks',()=>{
 assert.equal(score.moods.length,10)
 assert.equal(score.journeySigns.length,10)
 assert.equal(score.journeySigns[0].mood,'hearth')
 assert.equal(score.journeySigns.at(-1).mood,'triumph')
 assert.equal(new Set(score.moods.map(m=>m.id)).size,10)
 for(const mood of score.moods){
   const candidates=score.melodyCandidates(mood.id)
   assert.ok(candidates.length>=6)
   assert.equal(new Set(candidates.map(x=>x.id)).size,candidates.length)
   for(const candidate of candidates){
     assert.equal(candidate.degrees.length,candidate.rhythm.length)
     assert.equal(candidate.rhythm.reduce((a,b)=>a+b,0),16)
     assert.equal(score.melodyNotes(mood.id,candidate.id).length,candidate.degrees.length)
   }
   assert.equal(score.chordNotes(mood.id,0).length,4)
 }
})
test('legacy Woodland synthesizer and harmony palette are gone from in-game audio',()=>{
 const audio=readFileSync(new URL('../src/experiences/woodland/audio.ts',import.meta.url),'utf8')
 assert.doesNotMatch(audio,/createOscillator|woodlandProgressions|setProgressions|audition/)
 assert.match(audio,/forest-birds\.mp3/)
 const walk=readFileSync(new URL('../src/experiences/WoodlandWalk.tsx',import.meta.url),'utf8')
 assert.doesNotMatch(walk,/WoodlandMusicPalette|woodlandProgressions/)
 assert.match(walk,/woodlandWorldScore/)
})