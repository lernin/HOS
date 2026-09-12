import { chromium } from 'playwright'
import { mkdir,writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const output='artifacts/ocean-estate';await mkdir(output,{recursive:true})
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader']})
const page=await browser.newPage({viewport:{width:1440,height:960},deviceScaleFactor:1}),errors=[]
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
async function findSurface(title,points){
 for(const [x,y] of points){
  await page.mouse.click(x,y);await page.waitForTimeout(120)
  const picker=page.locator('.oe-material-picker');if(!(await picker.isVisible().catch(()=>false)))continue
  const heading=(await picker.locator('h2').textContent())?.trim();if(heading===title)return true
  await page.getByRole('button',{name:'Undo and close'}).click();await page.waitForTimeout(120)
 }
 return false
}
try{
 await page.goto('http://127.0.0.1:4173/tests/ocean-estate-visual.html',{waitUntil:'load'});await page.waitForSelector('body.ready',{timeout:120000})
 const diagnostics=await page.evaluate(()=>window.estateQA.diagnostics());console.log('Render budget',diagnostics)
 for(const view of ['arrival','great','ocean','courtyard','kitchen','suite','bath','exterior','aerial']){await page.evaluate(name=>window.estateQA.view(name),view);await page.waitForTimeout(500);await page.screenshot({path:`${output}/${view}.png`,timeout:120000});console.log('Captured',view)}
 await page.evaluate(()=>{window.estateQA.preset('evening');window.estateQA.view('great')});await page.waitForTimeout(500);await page.screenshot({path:`${output}/evening.png`,timeout:120000})
 await page.setViewportSize({width:412,height:915});await page.evaluate(()=>{window.estateQA.preset('golden');window.estateQA.view('great')});await page.waitForTimeout(500);await page.screenshot({path:`${output}/phone-great.png`,timeout:120000})
 await page.goto('http://127.0.0.1:4173/tests/ocean-estate-preview.html',{waitUntil:'load'});await page.getByRole('button',{name:'Step inside'}).waitFor({state:'visible',timeout:120000});await page.screenshot({path:`${output}/phone-arrival.png`,timeout:120000});await page.getByRole('button',{name:'Step inside'}).click();await page.getByRole('button',{name:'Estate settings'}).click();await page.getByLabel('Light',{exact:true}).selectOption('evening');await page.getByLabel('Design editing',{exact:true}).selectOption('on');await page.screenshot({path:`${output}/phone-settings.png`,timeout:120000});await page.getByRole('button',{name:'Back to exploring'}).click();await page.waitForTimeout(250)
 const floorPoints=[[206,500],[206,470],[160,500],[252,500],[206,535],[130,500],[282,500],[206,445]]
 assert.ok(await findSurface('Floor material',floorPoints),'direct foyer floor tap opens material picker');await page.screenshot({path:`${output}/phone-edit-floor.png`,timeout:120000});await page.getByRole('button',{name:'Undo and close'}).click();await page.waitForTimeout(180)
 const wallPoints=[[55,360],[357,360],[65,460],[347,460],[85,270],[327,270],[100,410],[312,410],[206,320]]
 assert.ok(await findSurface('Main wall material',wallPoints),'direct foyer wall tap opens material picker');await page.screenshot({path:`${output}/phone-edit-wall.png`,timeout:120000});await page.getByRole('button',{name:'Undo and close'}).click();await page.waitForTimeout(180)
 await page.getByRole('button',{name:'Estate settings'}).click();await page.getByLabel('Design editing',{exact:true}).selectOption('off');await page.getByRole('button',{name:'Back to exploring'}).click();await page.getByRole('button',{name:'Places',exact:false}).click();await page.screenshot({path:`${output}/phone-places.png`,timeout:120000});await page.getByRole('button',{name:'Close places'}).click()
 assert.equal(await page.locator('body').evaluate(e=>e.scrollWidth<=innerWidth),true,'phone horizontal overflow')
 const mobile=await browser.newContext({viewport:{width:412,height:915},deviceScaleFactor:1,isMobile:true,hasTouch:true});const touch=await mobile.newPage()
 touch.on('pageerror',e=>errors.push(e.message));await touch.goto('http://127.0.0.1:4173/tests/ocean-estate-preview.html',{waitUntil:'load'});await touch.locator('.oe-primary,[aria-label="Estate settings"]').first().waitFor({state:'visible',timeout:120000});const step=touch.getByRole('button',{name:'Step inside'});if(await step.isVisible().catch(()=>false))await step.tap()
 await touch.getByRole('button',{name:'Estate settings'}).waitFor({state:'visible',timeout:120000})
 const before=Number(await touch.locator('.oe-root').getAttribute('data-player-z'));await touch.touchscreen.tap(206,610)
 await touch.waitForFunction(z=>Number(document.querySelector('.oe-root').dataset.playerZ)<z-.12,before,{timeout:30000});await touch.getByRole('button',{name:/Stop/}).click()
 const yaw=Number(await touch.locator('.oe-root').getAttribute('data-camera-yaw')),gesture=await mobile.newCDPSession(touch);await gesture.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:230,y:360}]});for(let x=240;x<=320;x+=10)await gesture.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:360}]});await gesture.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await touch.waitForFunction(y=>Math.abs(Number(document.querySelector('.oe-root').dataset.cameraYaw)-y)>.1,yaw,{timeout:10000})
 await touch.getByRole('button',{name:'Estate settings'}).click();const stopped=Number(await touch.locator('.oe-root').getAttribute('data-player-z'));await touch.waitForTimeout(700);assert.ok(Math.abs(Number(await touch.locator('.oe-root').getAttribute('data-player-z'))-stopped)<.01,'settings stop movement');await touch.getByRole('button',{name:'Back to exploring'}).click()
 await touch.screenshot({path:`${output}/phone-touch.png`,timeout:120000});await mobile.close()
 await writeFile(`${output}/verification.json`,JSON.stringify({errors,diagnostics,phoneViewport:{width:412,height:915},renderer:'Chromium SwiftShader; not S23 hardware',ui:'entry, settings, lighting, destinations, direct foyer floor and wall editor taps, emulated touch tap-to-walk and drag-to-look, modal movement pause',routeTests:'see Node test output'},null,2))
 assert.ok(diagnostics.calls<350,`Draw calls ${diagnostics.calls}`);assert.ok(diagnostics.triangles<1300000,`Triangles ${diagnostics.triangles}`);assert.deepEqual(errors,[])
}finally{await page.screenshot({path:output+'/last-ui.png',timeout:120000}).catch(()=>{});await writeFile(`${output}/console-errors.json`,JSON.stringify(errors,null,2));await browser.close()}
