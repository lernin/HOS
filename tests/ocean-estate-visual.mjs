import { chromium } from 'playwright'
import { mkdir,writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const output='artifacts/ocean-estate';await mkdir(output,{recursive:true})
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader']})
const page=await browser.newPage({viewport:{width:1440,height:960},deviceScaleFactor:1}),errors=[],externalNetwork=[]
const recordConsole=m=>{if(m.type()!=='error')return;const message=m.text();if(message.includes('net::ERR_NAME_NOT_RESOLVED')){externalNetwork.push(message);return}errors.push(message)}
page.on('pageerror',e=>errors.push(e.message));page.on('console',recordConsole)
const visible=locator=>locator.isVisible().catch(()=>false)
async function dragLook(p,gesture,dx){
 const box=await p.locator('.oe-canvas').boundingBox();if(!box)return false
 const x=box.x+box.width*.55,y=box.y+box.height*.48,end=x+dx
 await gesture.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]})
 for(let i=1;i<=6;i++)await gesture.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+(end-x)*i/6,y}]})
 await gesture.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForTimeout(120);return true
}
try{
 await page.goto('http://127.0.0.1:4173/tests/ocean-estate-visual.html',{waitUntil:'load'});await page.waitForSelector('body.ready',{timeout:120000})
 const diagnostics=await page.evaluate(()=>window.estateQA.diagnostics());console.log('Render budget',diagnostics)
 for(const view of ['arrival','oceanRail','oceanRailCorner','oceanRailReturn','sunriseRail','courtyardRail','eastGalleryRail','foyerRail','arrivalGardenRail','entryRight','great','ocean','courtyard','kitchen','suite','bath','exterior','aerial']){await page.evaluate(name=>window.estateQA.view(name),view);await page.waitForTimeout(180);await page.screenshot({path:`${output}/${view}.png`,timeout:120000})}
 await page.evaluate(()=>{window.estateQA.preset('evening');window.estateQA.view('great')});await page.waitForTimeout(180);await page.screenshot({path:`${output}/evening.png`,timeout:120000})
 await page.setViewportSize({width:915,height:412});await page.evaluate(()=>{window.estateQA.preset('golden');window.estateQA.view('great')});await page.waitForTimeout(180);await page.screenshot({path:`${output}/phone-landscape-great.png`,timeout:120000})

 await page.evaluate(()=>window.estateQA.view('foyerFloor'));await page.waitForTimeout(120);assert.deepEqual(await page.evaluate(()=>window.estateQA.editPickCenter()),{room:'foyer',surface:'floor'},'foyer floor remains directly pickable');const floorPick=await page.evaluate(()=>window.estateQA.artPickCenter());assert.equal(floorPick?.kind,'floor','normal scene picking still routes a clear foyer floor tap to walking')
 await page.evaluate(()=>window.estateQA.view('arrivalStep'));await page.waitForTimeout(120);const stairPick=await page.evaluate(()=>window.estateQA.artPickCenter());assert.equal(stairPick?.kind,'floor','arrival stairs remain valid click-to-walk targets')
 await page.evaluate(()=>window.estateQA.view('foyerWall'));await page.waitForTimeout(120);assert.deepEqual(await page.evaluate(()=>window.estateQA.editPickCenter()),{room:'foyer',surface:'walls'},'foyer wall remains directly pickable')
 await page.evaluate(()=>window.estateQA.view('artHero'));await page.waitForTimeout(120);const artPick=await page.evaluate(()=>window.estateQA.artPickCenter());assert.equal(artPick?.kind,'art','hero artwork remains separately pickable from floor walking');await page.screenshot({path:`${output}/art-pick.png`,timeout:120000});await page.close()

 const mobile=await browser.newContext({viewport:{width:915,height:412},deviceScaleFactor:1,isMobile:true,hasTouch:true});const touch=await mobile.newPage();const gesture=await mobile.newCDPSession(touch)
 touch.on('pageerror',e=>errors.push(e.message));touch.on('console',recordConsole)
 await touch.goto('http://127.0.0.1:4173/tests/ocean-estate-preview.html',{waitUntil:'load'});await touch.getByRole('button',{name:'Step inside'}).waitFor({state:'visible',timeout:120000});await touch.screenshot({path:`${output}/phone-landscape-arrival.png`,timeout:120000});await touch.getByRole('button',{name:'Step inside'}).tap();await touch.getByRole('button',{name:'Estate menu'}).waitFor({state:'visible',timeout:5000})
 await touch.getByRole('button',{name:'Estate menu'}).tap();await touch.getByLabel('Light',{exact:true}).selectOption('evening');await touch.getByLabel('Design editing',{exact:true}).selectOption('on');await touch.getByLabel('Design editing',{exact:true}).selectOption('off');await touch.screenshot({path:`${output}/phone-landscape-settings.png`,timeout:120000});await touch.getByRole('button',{name:/Back to exploring/}).tap();await touch.waitForTimeout(120)
 const yaw=Number(await touch.locator('.oe-root').getAttribute('data-camera-yaw'));assert.ok(await dragLook(touch,gesture,130),'touch drag dispatched');await touch.waitForFunction(y=>Math.abs(Number(document.querySelector('.oe-root').dataset.cameraYaw)-y)>.1,yaw,{timeout:10000})
 await touch.getByRole('button',{name:'Estate menu'}).tap();assert.ok(await visible(touch.getByRole('heading',{name:'Go somewhere'})),'destination choices live in the single menu');assert.ok(await visible(touch.getByRole('button',{name:/Great room/})),'menu exposes destinations without a walking-screen button cluster');assert.ok(await visible(touch.getByText('Ocean sound',{exact:true})),'sound control lives in the menu');await touch.getByRole('button',{name:'Close settings'}).tap();await touch.waitForTimeout(120)
 assert.equal(await touch.locator('body').evaluate(e=>e.scrollWidth<=innerWidth),true,'landscape phone horizontal overflow');await touch.screenshot({path:`${output}/phone-landscape-touch.png`,timeout:120000});await mobile.close()

 const planner=await browser.newPage({viewport:{width:915,height:412},deviceScaleFactor:1});planner.on('pageerror',e=>errors.push(e.message));planner.on('console',recordConsole)
 await planner.goto('http://127.0.0.1:4173/ocean-estate-plan',{waitUntil:'load'});await planner.locator('.ep-plan').waitFor({state:'visible',timeout:15000});await planner.screenshot({path:`${output}/estate-plan.png`,timeout:120000})
 await planner.getByRole('button',{name:/Audit/}).first().click();await planner.getByText('R6',{exact:true}).waitFor({state:'visible',timeout:5000});await planner.screenshot({path:`${output}/estate-plan-audit.png`,timeout:120000})
 await planner.locator('polyline[stroke="transparent"]').nth(5).click({force:true});await planner.locator('.ep-selection-card').waitFor({state:'visible',timeout:5000});assert.match(await planner.locator('.ep-selection-card').innerText(),/R6/);await planner.screenshot({path:`${output}/estate-plan-railing-selected.png`,timeout:120000});await planner.close()

 await writeFile(`${output}/verification.json`,JSON.stringify({errors,externalNetwork,diagnostics,phoneViewport:{width:915,height:412},renderer:'Chromium SwiftShader; not physical phone hardware',ui:'landscape entry/single menu, edit-mode control, deterministic floor/wall/stair and artwork picking, touch drag-to-look, clean walking HUD, Estate Plan surface/edge audit and railing selection',routeTests:'see Node test output'},null,2))
 assert.ok(diagnostics.calls<350,`Draw calls ${diagnostics.calls}`);assert.ok(diagnostics.triangles<1300000,`Triangles ${diagnostics.triangles}`);assert.deepEqual(errors,[])
}finally{await page.screenshot({path:output+'/last-ui.png',timeout:120000}).catch(()=>{});await writeFile(`${output}/console-errors.json`,JSON.stringify(errors,null,2));await browser.close()}
