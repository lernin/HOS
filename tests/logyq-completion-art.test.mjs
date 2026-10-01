import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
const scope={window:{}}
for(const name of ['game-grammar.js','completion-art.js']){
  try{runInNewContext(readFileSync(new URL('../public/logyq/js/'+name,import.meta.url),'utf8'),scope)}
  catch(error){if(error.code!=='ENOENT')throw error}
}
const area=poly=>Math.abs(poly.reduce((sum,p,i)=>{const q=poly[(i+1)%poly.length];return sum+p[0]*q[1]-q[0]*p[1]},0))/2

test('completion regions cover the viewport using the solved cards colors',()=>{
  assert.ok(scope.window.LOGYQCompletionArt,'completion geometry is available')
  const cards=[{gameId:'a',paint:'DL:C:B',x:120,y:180,width:140,height:63},{gameId:'b',paint:'DR:B:A',x:40,y:330,width:140,height:63},{gameId:'c',paint:'L:B:D',x:210,y:330,width:140,height:63}]
  const result=scope.window.LOGYQCompletionArt.build(cards,390,844)
  const regions=result.flatMap(card=>card.regions)
  assert.ok(Math.abs(regions.reduce((sum,r)=>sum+area(r.polygon),0)-390*844)<0.01)
  assert.deepEqual(new Set(regions.map(r=>r.color)),new Set(['#86efac','#fb923c','#60a5fa','#f0abfc']))
  for(const region of regions)for(const [x,y] of region.polygon)assert.ok(x>=-0.001&&x<=390.001&&y>=-0.001&&y<=844.001)
})

test('diagonal continuations keep the exact card angle and side colors',()=>{
  assert.ok(scope.window.LOGYQCompletionArt)
  const dl=scope.window.LOGYQCompletionArt.build([{gameId:'a',paint:'DL:C:B',x:120,y:180,width:140,height:63}],390,844)[0]
  assert.equal(dl.regions[0].color,'#86efac')
  assert.equal(dl.regions[1].color,'#fb923c')
  const cx=190,cy=211.5,slope=63/140
  for(const [x,y] of dl.regions[0].polygon)assert.ok(y-cy-slope*(x-cx)<=0.001)
  const dr=scope.window.LOGYQCompletionArt.build([{gameId:'b',paint:'DR:A:D',x:120,y:180,width:140,height:63}],390,844)[0]
  for(const [x,y] of dr.regions[0].polygon)assert.ok(y-cy+slope*(x-cx)<=0.001)
})
