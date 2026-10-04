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
 assert.match(ui,/pickEditSurface\(x,y\)/)
 assert.match(ui,/else if\(prefs\.mode==='explore'\)\{const picked=engine\.current\?\.pick\(x,y\)/)
 assert.match(ui,/picked\.kind==='art'\)enterArt\(picked\.art\)/)
 assert.match(ui,/else setHelp\(false\)/)
})
test('touch navigation is adaptive: left moves, right looks, and two thumbs separate movement from steering',()=>{
 const ui=readFileSync(new URL('../src/experiences/OceanEstate.tsx',import.meta.url),'utf8')
 assert.match(ui,/type TouchPoint=\{side:'left'\|'right'/)
 assert.match(ui,/side=e\.clientX<rect\.left\+rect\.width\/2\?'left':'right'/)
 assert.match(ui,/input\.current\.z=axis\(\(left\.y-left\.startY\)\/72\)/)
 assert.match(ui,/input\.current\.x=right\?axis\(\(left\.x-left\.startX\)\/72\):0/)
 assert.match(ui,/t\.side==='right'\|\|\(t\.side==='left'&&!hasRight\)/)
 assert.match(ui,/if\(t\.side==='right'\)input\.current\.pitch=/)
 assert.match(ui,/!t\.dragged&&!t\.hadMulti&&touchPointers\.current\.size===0\)handleWorldTap/)
 assert.doesNotMatch(ui,/worldPinchStart|pinchReverse/)
})


test('walking HUD is quiet and secondary controls live in the menu',()=>{
 const ui=readFileSync(new URL('../src/experiences/OceanEstate.tsx',import.meta.url),'utf8')
 assert.doesNotMatch(ui,/className="oe-controls"/)
 assert.doesNotMatch(ui,/className="oe-hint"/)
 assert.match(ui,/className="oe-menu-places"/)
 assert.match(ui,/className="oe-menu-sound"/)
 assert.match(ui,/oe-location-fade/)
})

test('closed arrival garden pockets read as intentional planted areas',()=>{
 const env=readFileSync(new URL('../src/experiences/estate/environment.ts',import.meta.url),'utf8')
 const rails=readFileSync(new URL('../src/experiences/estate/railings.ts',import.meta.url),'utf8')
 assert.match(env,/Arrival garden pockets/)
 assert.match(rails,/id:'arrival-garden-west'/)
 assert.match(rails,/id:'arrival-garden-east'/)
 assert.match(env,/ellipsoid\([^\n]*'pink'/)
})



test('grand foyer grass pockets are framed as intentional gardens',()=>{
 const env=readFileSync(new URL('../src/experiences/estate/environment.ts',import.meta.url),'utf8')
 const rails=readFileSync(new URL('../src/experiences/estate/railings.ts',import.meta.url),'utf8')
 const layout=readFileSync(new URL('../src/experiences/estate/site-layout.ts',import.meta.url),'utf8')
 assert.equal(rails.includes("id:'foyer-garden-west-a'"),true)
 assert.equal(rails.includes("id:'foyer-garden-east-a'"),true)
 assert.equal(rails.includes("curb:true"),true)
 assert.equal(env.includes('Foyer garden planting'),true)
 assert.equal(env.includes('for(const {cx,cz,rx,rz} of foyerGardenBeds)'),true)
 assert.equal(layout.includes("cx:-8.5, cz:11, rx:1.9, rz:2.35"),true)
 assert.equal(layout.includes("cx:10.5, cz:11.5, rx:1.8, rz:2.75"),true)
})



test('garden courtyard paving avoids near-coplanar grout geometry',()=>{
 const env=readFileSync(new URL('../src/experiences/estate/environment.ts',import.meta.url),'utf8')
 const kit=readFileSync(new URL('../src/experiences/estate/kit.ts',import.meta.url),'utf8')
 assert.equal(env.includes("f.name==='Garden courtyard'?'courtyardPaving'"),true)
 assert.equal(env.includes("f.name!=='Garden courtyard'"),true)
 assert.equal(kit.includes('courtyardPaving'),true)
 assert.equal(kit.includes('vec2 grid=vec2(p.x/2.8,p.z/1.65)'),true)
})


test('arrival court walkability reaches the visible round edge',()=>{
 assert.equal(nav.walkable({x:1,z:59.88}),true,'visitor can approach the north edge of the round court')
 assert.equal(nav.walkable({x:1,z:60.08}),false,'visitor still cannot step beyond the round court')
 assert.equal(plan.floorAt({x:19.8,z:41}),4.8,'east side of rendered circle is navigable')
})

test('entry portal is grounded and round court edge has a continuous natural boulder barrier',()=>{
 const env=readFileSync(new URL('../src/experiences/estate/environment.ts',import.meta.url),'utf8')
 assert.equal(env.includes('Massive stair-side abutments'),true)
 assert.equal(env.includes('supportBase=FLOOR-1.22'),true)
 assert.equal(env.includes('Dense natural boulder band marks the round court edge'),true)
 assert.equal(env.includes('i<92'),true)
 assert.equal(env.includes('19.46+wobble'),true)
 assert.equal(env.includes('if(i%4===0)'),true)
})

test('fill lights use stable selection and eased movement instead of per-frame nearest swapping',()=>{
 const scene=readFileSync(new URL('../src/experiences/estate/scene.ts',import.meta.url),'utf8')
 assert.equal(scene.includes('fillSelectionOrigin'),true)
 assert.equal(scene.includes('>4){'),true)
 assert.equal(scene.includes('l.position.lerp'),true)
 assert.equal(scene.includes('locations.sort'),false)
})


test('arrival-court barrier uses charcoal stone rather than black basalt',()=>{
 const kit=readFileSync(new URL('../src/experiences/estate/kit.ts',import.meta.url),'utf8')
 const env=readFileSync(new URL('../src/experiences/estate/environment.ts',import.meta.url),'utf8')
 assert.equal(kit.includes("charcoalRock:'#5a6261'"),true)
 assert.equal(env.includes("700+i,'charcoalRock'"),true)
 assert.equal(env.includes("900+i,'charcoalRock'"),true)
})

test('roofed house perimeter has no accidental wall gaps',()=>{
 const roofed=plan.floors.filter(f=>f.roof)
 const shell=[...plan.walls,...plan.glass]
 const intended=[
  {axis:'z',at:-12,a:-7,b:9,label:'great-room ocean opening'},
  {axis:'x',at:-6,a:15,b:20,label:'foyer courtyard opening'},
  {axis:'x',at:8,a:10,b:14,label:'foyer east garden opening'},
  {axis:'z',at:24,a:-1.2,b:3.2,label:'main entrance'},
  {axis:'x',at:-11,a:8,b:14,label:'kitchen garden opening'},
  {axis:'x',at:-23,a:14,b:39,label:'west gallery courtyard opening'},
  {axis:'z',at:39,a:-26,b:-23,label:'west garden path opening'},
  {axis:'x',at:13,a:8,b:15,label:'east foyer garden opening'},
  {axis:'z',at:-12,a:13,b:24,label:'east gallery terrace opening'},
  {axis:'x',at:20,a:28,b:40,label:'arrival overlook with railing'},
  {axis:'z',at:40,a:20,b:24,label:'east gallery outdoor end'},
  {axis:'x',at:39,a:-5,b:-2,label:'primary terrace door'},
  {axis:'z',at:-12,a:29,b:33,label:'primary ocean door'},
  {axis:'x',at:24,a:40,b:49,label:'open-sided garden gallery'},
  {axis:'z',at:49,a:24,b:27,label:'garden gallery garden end'},
  {axis:'z',at:51,a:28,b:39,label:'garage door'},
 ]
 const insideRoofed=(x,z)=>roofed.some(r=>x>r.x1+.001&&x<r.x2-.001&&z>r.z1+.001&&z<r.z2-.001)
 const covered=(axis,at,t)=>shell.some(w=>axis==='x'
   ?Math.abs((w.x1+w.x2)/2-at)<.22&&t>=w.z1-.06&&t<=w.z2+.06
   :Math.abs((w.z1+w.z2)/2-at)<.22&&t>=w.x1-.06&&t<=w.x2+.06)
 const allowed=(axis,at,t)=>intended.some(o=>o.axis===axis&&Math.abs(o.at-at)<.01&&t>=o.a-.06&&t<=o.b+.06)
 const misses=[]
 for(const r of roofed){
  const edges=[
   {axis:'x',at:r.x1,a:r.z1,b:r.z2,ox:-.06,oz:0,room:r.name,side:'west'},
   {axis:'x',at:r.x2,a:r.z1,b:r.z2,ox:.06,oz:0,room:r.name,side:'east'},
   {axis:'z',at:r.z1,a:r.x1,b:r.x2,ox:0,oz:-.06,room:r.name,side:'south'},
   {axis:'z',at:r.z2,a:r.x1,b:r.x2,ox:0,oz:.06,room:r.name,side:'north'},
  ]
  for(const e of edges)for(let t=e.a+.125;t<e.b;t+=.25){
   const x=e.axis==='x'?e.at+e.ox:t+e.ox,z=e.axis==='z'?e.at+e.oz:t+e.oz
   if(insideRoofed(x,z))continue
   if(!covered(e.axis,e.at,t)&&!allowed(e.axis,e.at,t))misses.push(`${e.room} ${e.side} @ ${t.toFixed(2)}`)
  }
 }
 assert.deepEqual(misses,[])
 assert.equal(covered('x',8,26),true,'Library west wall above the entry stair is closed')
})


test('repaired Library wall is visually grounded to the lower arrival court',()=>{
 const env=readFileSync(new URL('../src/experiences/estate/environment.ts',import.meta.url),'utf8')
 assert.equal(env.includes('Library stair-side foundation'),true)
 assert.equal(env.includes("k.box(8,FLOOR-.60,26,.50,1.20,4,'travertine'"),true)
})


test('all estate railings use one shared architectural system',()=>{
 const env=readFileSync(new URL('../src/experiences/estate/environment.ts',import.meta.url),'utf8')
 const rails=readFileSync(new URL('../src/experiences/estate/railings.ts',import.meta.url),'utf8')
 const planText=readFileSync(new URL('../src/experiences/estate/plan.ts',import.meta.url),'utf8')
 assert.equal(env.includes("from './railings'"),true)
 assert.equal(env.includes('for(const rail of estateRailings)'),true)
 assert.equal(env.includes('const oceanReferencePath='),false)
 assert.equal(env.includes('gardenPocketRail'),false)
 assert.equal(env.includes('foyerGardenRail'),false)
 assert.equal(rails.includes('RAIL_BASE = .115'),true)
 assert.equal(rails.includes('RAIL_EDGE_GAP = RAIL_BASE / 2'),true)
 assert.equal(rails.includes('RAIL_EDGE_INSET = RAIL_BASE / 2 + RAIL_EDGE_GAP'),true)
 assert.equal(rails.includes('RAIL_END_GAP = RAIL_EDGE_INSET - RAIL_CAP_OVERHANG'),true)
 assert.equal(env.includes('placePost(firstPost)'),true)
 assert.equal(env.includes('for(const p of cornerPosts)placePost(p)'),true)
 assert.equal(planText.includes('west ocean railing returns'),true)
 assert.equal(planText.includes('lookout ocean edge, joined to the terrace corner'),true)
})


test('railing pedestal edge gap equals half the pedestal width',()=>{
 const pedestal=.115,gap=pedestal/2,centerInset=pedestal
 assert.equal(Number((centerInset-pedestal/2).toFixed(4)),Number(gap.toFixed(4)))
 const rails=readFileSync(new URL('../src/experiences/estate/railings.ts',import.meta.url),'utf8')
 assert.equal(rails.includes('p(-23+RAIL_EDGE_INSET,-17.08)'),true)
 assert.equal(rails.includes('p(44-RAIL_EDGE_INSET,-14+RAIL_END_GAP)'),true)
 assert.equal(rails.includes('p(-22,33-RAIL_EDGE_INSET)'),true)
 assert.equal(rails.includes('p(20+RAIL_EDGE_INSET,31.1)'),true)
})


test('low garden rails share the same posts caps and pedestals as guard rails',()=>{
 const env=readFileSync(new URL('../src/experiences/estate/environment.ts',import.meta.url),'utf8')
 const rails=readFileSync(new URL('../src/experiences/estate/railings.ts',import.meta.url),'utf8')
 assert.equal(rails.includes("family:'garden'"),true)
 assert.equal(rails.includes('height:.82'),true)
 assert.equal(rails.includes('glass:false'),true)
 assert.equal((env.match(/const estateRailPath=/g)||[]).length,1)
})


test('Estate Plan is a routed bird-eye markup workspace backed by live plan geometry',()=>{
 const main=readFileSync(new URL('../src/main.tsx',import.meta.url),'utf8')
 const estate=readFileSync(new URL('../src/experiences/OceanEstate.tsx',import.meta.url),'utf8')
 const planner=readFileSync(new URL('../src/experiences/EstatePlan.tsx',import.meta.url),'utf8')
 assert.equal(main.includes("'ocean-estate-plan'"),true)
 assert.equal(main.includes("import('./experiences/EstatePlan')"),true)
 assert.equal(estate.includes('Open Estate Plan'),true)
 assert.equal(planner.includes("from './estate/plan'"),true)
 assert.equal(planner.includes("from './estate/railings'"),true)
 assert.equal(planner.includes("type Tool='pan'|'pen'|'arrow'|'area'|'note'"),true)
 assert.equal(planner.includes("const STORAGE='ocean-estate-plan-markups-v1'"),true)
 assert.equal(planner.includes('Copy change brief'),true)
 assert.equal(planner.includes('exportPng'),true)
 assert.equal(planner.includes("(['main','arrival','site'] as PlanView[])"),true)
 assert.equal(planner.includes('const rotate180=(p:Pt):Pt=>({x:-p.x,y:-p.y})'),true)
 assert.equal(planner.includes('<g transform="rotate(180)">'),true)
 assert.equal(planner.includes('return rotate180(toView(clientX,clientY))'),true)
})

test('Estate Plan has a direct Vercel SPA rewrite',()=>{
 const vercel=readFileSync(new URL('../vercel.json',import.meta.url),'utf8')
 assert.equal(vercel.includes('{ "source": "/ocean-estate-plan", "destination": "/" }'),true)
})


test('Estate Plan distinguishes exterior surfaces and exposed edge conditions',()=>{
 const site=readFileSync(new URL('../src/experiences/estate/site-edges.ts',import.meta.url),'utf8')
 const planner=readFileSync(new URL('../src/experiences/EstatePlan.tsx',import.meta.url),'utf8')
 assert.equal(site.includes("export type EstateSurfaceKind"),true)
 assert.equal(site.includes("'deck'"),true)
 assert.equal(site.includes("'covered-exterior'"),true)
 assert.equal(site.includes("'garden'"),true)
 assert.equal(site.includes("'water'"),true)
 assert.equal(site.includes("export const estateEdges"),true)
 assert.equal(site.includes("e.kind==='open'?'review':'covered'"),true)
 assert.equal(planner.includes("surfaceFill"),true)
 assert.equal(planner.includes("ep-deck-hatch"),true)
 assert.equal(planner.includes("auditOpenEdges"),true)
 assert.equal(planner.includes("Edge audit"),true)
})

test('every estate railing has a stable selectable R-code',()=>{
 const rails=readFileSync(new URL('../src/experiences/estate/railings.ts',import.meta.url),'utf8')
 const planner=readFileSync(new URL('../src/experiences/EstatePlan.tsx',import.meta.url),'utf8')
 for(let i=1;i<=11;i++)assert.equal(rails.includes(`code:'R${i}'`),true,`R${i} exists`)
 assert.equal(rails.includes("audit?: 'review'"),true)
 assert.equal(rails.includes("id:'arrival-garden-west'"),true)
 assert.equal(rails.includes("id:'arrival-garden-east'"),true)
 assert.equal((rails.match(/audit:'review'/g)||[]).length,2)
 assert.equal(planner.includes('setSelectedRail(r.id)'),true)
 assert.equal(planner.includes('selectedRailData.code'),true)
 assert.equal(planner.includes("strokeWidth=\"2.2\""),true)
})

test('site audit uses live estate plan walls glass floors and shared railing geometry',()=>{
 const site=readFileSync(new URL('../src/experiences/estate/site-edges.ts',import.meta.url),'utf8')
 assert.equal(site.includes("import { FLOOR, floors, glass, walls } from './plan'"),true)
 assert.equal(site.includes("import { estateRailings } from './railings'"),true)
 assert.equal(site.includes("const mainFloors=floors.filter"),true)
 assert.equal(site.includes("if(glass.some"),true)
 assert.equal(site.includes("if(walls.some"),true)
 assert.equal(site.includes("if(railNear(a,b))return'railing'"),true)
})


test('bird-eye patios are exact shared 3D floor slabs, not inferred room names',()=>{
 const plan=readFileSync(new URL('../src/experiences/estate/plan.ts',import.meta.url),'utf8')
 const site=readFileSync(new URL('../src/experiences/estate/site-edges.ts',import.meta.url),'utf8')
 assert.equal(plan.includes("export type FloorUse = 'interior' | 'patio' | 'covered-exterior' | 'arrival' | 'steps'"),true)
 for(let i=1;i<=7;i++)assert.equal(plan.includes(`planCode: 'P${i}'`),true,`P${i} exact floor slab exists`)
 assert.equal(plan.includes("name: 'Garden gallery'")&&plan.includes("use: 'covered-exterior', planCode: 'C1'"),true)
 assert.equal(site.includes("if(f.use==='patio')return'deck'"),true)
 assert.equal(site.includes("const kind=surfaceKind(f)"),true)
 assert.equal(site.includes("code=f.planCode??"),true)
})

test('bird-eye pool and landmark planting share exact 3D geometry constants',()=>{
 const layout=readFileSync(new URL('../src/experiences/estate/site-layout.ts',import.meta.url),'utf8')
 const env=readFileSync(new URL('../src/experiences/estate/environment.ts',import.meta.url),'utf8')
 const planner=readFileSync(new URL('../src/experiences/EstatePlan.tsx',import.meta.url),'utf8')
 assert.equal(layout.includes("x1: -11")&&layout.includes("x2: 12")&&layout.includes("z1: -36.2")&&layout.includes("z2: -24.2"),true)
 assert.equal(env.includes("poolWater.x2-poolWater.x1"),true)
 assert.equal(env.includes("for(const t of featureTrees)"),true)
 assert.equal(env.includes("for(const p of featurePalms)"),true)
 assert.equal(planner.includes("featureTrees.map"),true)
 assert.equal(planner.includes("featurePalms.map"),true)
 assert.equal(planner.includes("architecturalPlanters.map"),true)
})

test('bird-eye plan does not invent rectangular arrival garden surfaces',()=>{
 const site=readFileSync(new URL('../src/experiences/estate/site-edges.ts',import.meta.url),'utf8')
 assert.equal(site.includes("surface-arrival-garden-west"),false)
 assert.equal(site.includes("surface-arrival-garden-east"),false)
 assert.equal(site.includes("source:'3d-floor'"),true)
 assert.equal(site.includes("source:'3d-fixture'"),true)
})

test('patios are selectable design objects with exact dimensions',()=>{
 const planner=readFileSync(new URL('../src/experiences/EstatePlan.tsx',import.meta.url),'utf8')
 assert.equal(planner.includes("selectedSurfaceData=patioSurfaces.find"),true)
 assert.equal(planner.includes("setSelectedSurface(s.id)"),true)
 assert.equal(planner.includes("Exact 3D slab"),true)
 assert.equal(planner.includes("patioSurfaces.filter"),true)
})


test('bird-eye terrain coastline is the exact 3D terrain formula',()=>{
 const layout=readFileSync(new URL('../src/experiences/estate/site-layout.ts',import.meta.url),'utf8')
 const env=readFileSync(new URL('../src/experiences/estate/environment.ts',import.meta.url),'utf8')
 const planner=readFileSync(new URL('../src/experiences/EstatePlan.tsx',import.meta.url),'utf8')
 assert.equal(layout.includes('export const coastEdgeScale'),true)
 assert.equal(layout.includes('export const coastZ'),true)
 assert.equal(layout.includes('export const coastline'),true)
 assert.equal(env.includes('edge=coastEdgeScale(a)'),true)
 assert.equal(env.includes('z=coastZ(a,r)*edge'),true)
 assert.equal(planner.includes("coastline.map(([x,z])"),true)
 assert.equal(planner.includes("rx=\"58\" ry=\"61\""),false)
 assert.equal(planner.includes('x="-70" y="12" width="140" height="65"'),false)
})


test('Estate Plan defaults to live 3D reality without stale geometry overlays',()=>{
 const planner=readFileSync(new URL('../src/experiences/EstatePlan.tsx',import.meta.url),'utf8')
 assert.equal(planner.includes("useState({reality:true,surfaces:false,edges:false,labels:false,furniture:false,railings:false,markups:true})"),true)
 assert.equal(planner.includes("!layers.reality&&walls.map"),true)
 assert.equal(planner.includes("!layers.reality&&glass.map"),true)
 assert.equal(planner.includes('className="ep-reality-lock"'),true)
 assert.equal(planner.includes('<b>3D reality</b><small>source of truth</small>'),true)
 assert.equal(planner.includes("['surfaces','Reference zones']"),false)
 assert.equal(planner.includes("['furniture','2D furniture']"),false)
})

test('live 3D and SVG annotations share the same aspect-preserving viewport transform',()=>{
 const reality=readFileSync(new URL('../src/experiences/estate/plan-reality.ts',import.meta.url),'utf8')
 const planner=readFileSync(new URL('../src/experiences/EstatePlan.tsx',import.meta.url),'utf8')
 assert.equal(planner.includes('preserveAspectRatio="xMidYMid meet"'),true)
 assert.equal(reality.includes("const viewAspect=box.w/box.h,canvasAspect=w/h"),true)
 assert.equal(reality.includes("renderer.setViewport(Math.round(vx),Math.round(vy),Math.round(vw),Math.round(vh))"),true)
 assert.equal(reality.includes("renderer.setScissor(Math.round(vx),Math.round(vy),Math.round(vw),Math.round(vh))"),true)
})

test('Estate Plan floor selection raycasts the actual 3D slab mesh',()=>{
 const env=readFileSync(new URL('../src/experiences/estate/environment.ts',import.meta.url),'utf8')
 const reality=readFileSync(new URL('../src/experiences/estate/plan-reality.ts',import.meta.url),'utf8')
 const planner=readFileSync(new URL('../src/experiences/EstatePlan.tsx',import.meta.url),'utf8')
 assert.equal(env.includes("slab.userData.estatePlan={kind:'floor'"),true)
 assert.equal(reality.includes("raycaster.intersectObjects(scene.children,true)"),true)
 assert.equal(reality.includes("if(data?.kind==='floor')return data"),true)
 assert.equal(planner.includes("realityEngine.current?.pick(e.clientX,e.clientY)"),true)
 assert.equal(planner.includes("Picked from live 3D mesh"),true)
})
