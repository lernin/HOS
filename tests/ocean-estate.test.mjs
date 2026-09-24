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
function rayFromEye(from,to){
 const y0=(plan.floorAt(from)??plan.FLOOR)+plan.EYE,y1=plan.floorAt(to)
 assert.equal(y1===null,false,'aim has a floor')
 return plan.resolveFloorRay({x:from.x,y:y0,z:from.z},{x:to.x-from.x,y:y1-y0,z:to.z-from.z})
}
test('court and mid-step taps resolve onto the arrival ramp',()=>{
 const midAim={x:1,z:27.5},mid=rayFromEye({x:1,z:38},midAim)
 assert.ok(mid,'mid-step tap hits a floor')
 assert.ok(mid.z>24&&mid.z<31,`mid tap stays on the steps, got ${mid.z}`)
 assert.ok(Math.abs(mid.z-midAim.z)<1.1,`mid tap tracks the step, got z=${mid.z}`)
 assert.ok(Math.abs(plan.floorAt(mid)-plan.floorAt(midAim))<0.25)
 assert.ok(plan.floorAt(mid)>4.9&&plan.floorAt(mid)<5.8,'mid tap is a climbable step height')
 const court={x:1,z:36};assert.ok(navigator.path(court,mid),'path from the court climbs onto the step')
 assert.ok(plan.floorAt(mid)>plan.floorAt(court)+.35,'resolved step is above the court')
 const lowAim={x:1,z:30},low=rayFromEye({x:1,z:36},lowAim)
 assert.ok(low&&low.z>28.4&&low.z<31&&Math.abs(low.z-lowAim.z)<1,`low step tap got ${JSON.stringify(low)}`)
 assert.ok(plan.floorAt(low)<5.2&&plan.floorAt(low)>4.8)
 const lookedDown=rayFromEye({x:1,z:18},{x:1,z:28})
 assert.ok(lookedDown&&Math.abs(lookedDown.z-28)<1.2,`foyer view of the ramp got ${JSON.stringify(lookedDown)}`)
 const back=rayFromEye({x:1,z:29},{x:4,z:42})
 assert.ok(back&&Math.hypot(back.x-4,back.z-42)<1.2&&plan.floorAt(back)===4.8,'looking downhill still hits the court')
 const terrace=rayFromEye({x:0,z:-8},{x:3,z:-22})
 assert.ok(terrace&&Math.hypot(terrace.x-3,terrace.z+22)<1,'flat floors still pick the aimed terrace')
})
test('wanted rooms stay connected and ocean, cliffs, and blank garden patches stay closed',()=>{
 const stops=[{name:'court',x:2,z:36},{name:'steps',x:1,z:27},{name:'foyer',x:1,z:16},{name:'great room',x:7,z:3},{name:'terrace',x:2,z:-18},{name:'lookout',x:32,z:-16},{name:'sunrise',x:41.5,z:0}]
 for(let i=0;i<stops.length;i++)for(let j=i+1;j<stops.length;j++){
  assert.ok(nav.walkable(stops[i])&&nav.walkable(stops[j]),stops[i].name+'/'+stops[j].name)
  assert.ok(navigator.path(stops[i],stops[j]),stops[i].name+' → '+stops[j].name)
  assert.ok(navigator.path(stops[j],stops[i]),stops[j].name+' → '+stops[i].name)
 }
 const gallery={x:22,z:34};assert.ok(nav.walkable(gallery)&&navigator.path(plan.spawn,gallery),'gallery past the court lip')
 const lip=nav.moveSafely(gallery,-4,0);assert.ok(lip.x>20,'gallery railing blocks the drop into the court')
 for(const p of [{x:0,z:-40},{x:-20,z:-30},{x:48,z:0},{x:33,z:-26},{x:-21,z:40},{x:23,z:48},{x:10,z:12},{x:-9,z:10}])assert.equal(nav.walkable(p),false,'no-go '+JSON.stringify(p))
})
test('material picker uses the active HOS catalog for every editable surface',()=>{
 const ui=readFileSync(new URL('../src/experiences/OceanEstate.tsx',import.meta.url),'utf8')
 const catalog=readFileSync(new URL('../src/experiences/estate/catalog.ts',import.meta.url),'utf8')
 assert.match(ui,/materialCatalog\.map\(/)
 assert.doesNotMatch(ui,/filter\(m=>m\.surface===picker\.surface\)/)
 assert.match(catalog,/material_assets\?select=/)
 assert.match(catalog,/status=eq\.active/)
})
test('normal scene taps still route artwork separately from floor walking while edit taps use editor picking',()=>{
 const ui=readFileSync(new URL('../src/experiences/OceanEstate.tsx',import.meta.url),'utf8')
 assert.match(ui,/pickEditSurface\(e\.clientX,e\.clientY\)/)
 assert.match(ui,/else if\(prefs\.mode==='explore'\)\{const picked=engine\.current\?\.pick\(e\.clientX,e\.clientY\)/)
 assert.match(ui,/picked\.kind==='art'\)enterArt\(picked\.art\)/)
 assert.match(ui,/else setHelp\(false\)/)
})
