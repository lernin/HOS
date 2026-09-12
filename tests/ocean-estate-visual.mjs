import { chromium } from 'playwright'
import { mkdir,writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const output='artifacts/ocean-estate';await mkdir(output,{recursive:true})
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader']})
const page=await browser.newPage({viewport:{width:1440,height:960},deviceScaleFactor:1}),errors=[]
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
const visible=locator=>locator.isVisible().catch(()=>false)
async function stopIfMoving(p){const stop=p.getByRole('button',{name:/^Stop/}).first();if(await visible(stop)){await stop.click();await p.waitForTimeout(80)}}
async function dragLook(p,gesture,dx){
 const box=await p.locator('.oe-canvas').boundingBox();if(!box)return false
 const x=box.x+box.width*.55,y=box.y+box.height*.48,end=x+dx
 await gesture.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]})
 for(let i=1;i<=6;i++)await gesture.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+(end-x)*i/6,y}]})
 await gesture.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForTimeout(120);return true
}
async function startFloorWalk(p){
 const root=p.locator('.oe-root'),box=await p.locator('.oe-canvas').boundingBox();if(!box)return false
 const startX=Number(await root.getAttribute('data-player-x')),startZ=Number(await root.getAttribute('data-player-z'))
 for(const [fx,fy] of [[.50,.72],[.42,.72],[.58,.72],[.50,.64],[.35,.68],[.65,.68]]){
  await p.touchscreen.tap(box.x+box.width*fx,box.y+box.height*fy)
  try{await p.waitForFunction(([x,z])=>{const r=document.querySelector('.oe-root');return Math.hypot(Number(r.dataset.playerX)-x,Number(r.dataset.playerZ)-z)>.10},[startX,startZ],{timeout:2500});return true}catch{await stopIfMoving(p)}
 }
 return false
}
try{
 await page.goto('http://127.0.0.1:4173/tests/ocean-estate-visual.html',{waitUntil:'load'});await page.waitForSelector('body.ready',{timeout:120000})
 const diagnostics=await page.evaluate(()=>window.estateQA.diagnostics());console.log('Render budget',diagnostics)
 for(const view of ['arrival','great','ocean','courtyard','kitchen','suite','bath','exterior','aerial']){await page.evaluate(name=>window.estateQA.view(name),view);await page.waitForTimeout(180);await page.screenshot({path:`${output}/${view}.png`,timeout:120000})}
 await page.evaluate(()=>{window.estateQA.preset('evening');window.estateQA.view('great')});await page.waitForTimeout(180);await page.screenshot({path:`${output}/evening.png`,timeout:120000})
 await page.setViewportSize({width:915,height:412});await page.evaluate(()=>{window.estateQA.preset('golden');window.estateQA.view('great')});await page.waitForTimeout(180);await page.screenshot({path:`${output}/phone-landscape-great.png`,timeout:120000})

 await page.evaluate(()=>window.estateQA.view('foyerFloor'));await page.waitForTimeout(120);assert.deepEqual(await page.evaluate(()=>window.estateQA.editPickCenter()),{room:'foyer',surface:'floor'},'foyer floor remains directly pickable')
 await page.evaluate(()=>window.estateQA.view('foyerWall'));await page.waitForTimeout(120);assert.deepEqual(await page.evaluate(()=>window.estateQA.editPickCenter()),{room:'foyer',surface:'walls'},'foyer wall remains directly pickable')
 await page.evaluate(()=>window.estateQA.view('artHero'));await page.waitForTimeout(120);const artPick=await page.evaluate(()=>window.estateQA.artPickCenter());assert.equal(artPick?.kind,'art','hero artwork remains separately pickable from floor walking');await page.screenshot({path:`${output}/art-pick.png`,timeout:120000});await page.close()

 const mobile=await browser.newContext({viewport:{width:915,height:412},deviceScaleFactor:1,isMobile:true,hasTouch:true});const touch=await mobile.newPage();const gesture=await mobile.newCDPSession(touch)
 touch.on('pageerror',e=>errors.push(e.message));touch.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
 await touch.goto('http://127.0.0.1:4173/tests/ocean-estate-preview.html',{waitUntil:'load'});await touch.getByRole('button',{name:'Step inside'}).waitFor({state:'visible',timeout:120000});await touch.screenshot({path:`${output}/phone-landscape-arrival.png`,timeout:120000});await touch.getByRole('button',{name:'Step inside'}).tap();await touch.getByRole('button',{name:'Estate settings'}).waitFor({state:'visible',timeout:5000})
 await touch.getByRole('button',{name:'Estate settings'}).tap();await touch.getByLabel('Light',{exact:true}).selectOption('evening');await touch.getByLabel('Design editing',{exact:true}).selectOption('on');await touch.getByLabel('Design editing',{exact:true}).selectOption('off');await touch.screenshot({path:`${output}/phone-landscape-settings.png`,timeout:120000});await touch.getByRole('button',{name:/Back to exploring/}).tap();await touch.waitForTimeout(120)
 assert.ok(await startFloorWalk(touch),'landscape touch tap starts floor walking');await stopIfMoving(touch)
 const yaw=Number(await touch.locator('.oe-root').getAttribute('data-camera-yaw'));assert.ok(await dragLook(touch,gesture,130),'touch drag dispatched');await touch.waitForFunction(y=>Math.abs(Number(document.querySelector('.oe-root').dataset.cameraYaw)-y)>.1,yaw,{timeout:10000})
 await touch.getByRole('button',{name:'Places',exact:false}).tap();assert.ok(await visible(touch.getByRole('navigation',{name:'Estate destinations'})),'Places opens in landscape');await touch.getByRole('button',{name:'Close places'}).tap()
 assert.equal(await touch.locator('body').evaluate(e=>e.scrollWidth<=innerWidth),true,'landscape phone horizontal overflow');await touch.screenshot({path:`${output}/phone-landscape-touch.png`,timeout:120000});await mobile.close()

 await writeFile(`${output}/verification.json`,JSON.stringify({errors,diagnostics,phoneViewport:{width:915,height:412},renderer:'Chromium SwiftShader; not physical phone hardware',ui:'landscape entry/settings, edit-mode control, deterministic floor/wall picking, normal touch tap-to-walk, touch drag-to-look, artwork picking, Places panel',routeTests:'see Node test output'},null,2))
 assert.ok(diagnostics.calls<350,`Draw calls ${diagnostics.calls}`);assert.ok(diagnostics.triangles<1300000,`Triangles ${diagnostics.triangles}`);assert.deepEqual(errors,[])
}finally{await page.screenshot({path:output+'/last-ui.png',timeout:120000}).catch(()=>{});await writeFile(`${output}/console-errors.json`,JSON.stringify(errors,null,2));await browser.close()}
