import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const planSource=ts.transpileModule(readFileSync(new URL('../src/experiences/estate/plan.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const planUrl='data:text/javascript;base64,'+Buffer.from(planSource).toString('base64')
const navSource=ts.transpileModule(readFileSync(new URL('../src/experiences/estate/navigation.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace("'./plan'",JSON.stringify(planUrl))
const plan=await import(planUrl),nav=await import('data:text/javascript;base64,'+Buffer.from(navSource).toString('base64'))
const navigator=nav.createNavigator()
test('every first-playable destination is reachable in both directions',()=>{
 for(const d of plan.destinations){assert.equal(nav.walkable(d),true,d.name+' is standable');const path=navigator.path(plan.spawn,d);assert.ok(path,d.name+' reachable from entry');let p=plan.spawn;for(const next of path){assert.ok(nav.clearLine(p,next),d.name+' path segment has clearance');const n=Math.ceil(Math.hypot(next.x-p.x,next.z-p.z)/.07);const dx=(next.x-p.x)/n,dz=(next.z-p.z)/n;for(let i=0;i<n;i++){p=nav.moveSafely(p,dx,dz);assert.ok(nav.walkable(p))}assert.ok(Math.hypot(next.x-p.x,next.z-p.z)<.08,d.name+' reached waypoint')}assert.ok(navigator.path(d,plan.spawn),d.name+' return route')}
})
test('all secondary rooms have a navigable interior connected to arrival',()=>{
 for(const f of plan.floors.filter(f=>f.roof)){let found=false;for(let x=f.x1+1;x<f.x2-1&&!found;x+=1.6)for(let z=f.z1+1;z<f.z2-1&&!found;z+=1.6){const p={x,z};if(nav.walkable(p)&&navigator.path(plan.spawn,p))found=true}assert.ok(found,f.name+' accessible')}
})
test('pool, cliffs, glazing, walls and major furniture reject traversal',()=>{
 for(const p of [{x:0,z:-30},{x:70,z:-30},{x:10,z:-12},{x:-11,z:1},{x:-2,z:-5},{x:-16.3,z:7.6}])assert.equal(nav.walkable(p),false,JSON.stringify(p))
 const start={x:0,z:-23};const p=nav.moveSafely(start,0,-15);assert.ok(p.z>-24);assert.ok(nav.walkable(p))
})
test('entrance elevation changes continuously and tap targets do not snap through obstacles',()=>{
 assert.equal(plan.floorAt({x:1,z:24}),6);assert.equal(plan.floorAt({x:1,z:31}),4.8)
 let previous=plan.floorAt({x:1,z:24});for(let z=24.1;z<=31;z+=.1){const y=plan.floorAt({x:1,z});assert.ok(Math.abs(y-previous)<.03);previous=y}
 assert.equal(navigator.path(plan.spawn,{x:1,z:41}),null)
 const garden={x:-10,z:32.7};const stopped=nav.moveSafely(garden,0,2);assert.ok(stopped.z<=33,'no drop from the raised garden into the arrival court')
})
test('material picker uses the full HOS catalog for every editable surface',()=>{
 const ui=readFileSync(new URL('../src/experiences/OceanEstate.tsx',import.meta.url),'utf8')
 const catalog=readFileSync(new URL('../src/experiences/estate/catalog.ts',import.meta.url),'utf8')
 assert.match(ui,/materialCatalog\.map\(/)
 assert.doesNotMatch(ui,/filter\(m=>m\.surface===picker\.surface\)/)
 assert.match(catalog,/material_assets\?select=/)
 assert.match(catalog,/status=eq\.active/)
})
