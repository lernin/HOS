import { chromium } from 'playwright'
import { mkdir,writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const output='artifacts/ocean-estate';await mkdir(output,{recursive:true})
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader']})
const page=await browser.newPage({viewport:{width:1440,height:960},deviceScaleFactor:1}),errors=[]
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
try{
 await page.goto('http://127.0.0.1:4173/tests/ocean-estate-visual.html',{waitUntil:'load'});await page.waitForSelector('body.ready',{timeout:120000})
 const diagnostics=await page.evaluate(()=>window.estateQA.diagnostics());console.log('Render budget',diagnostics)
 for(const view of ['arrival','great','ocean','courtyard','kitchen','suite','bath','exterior','aerial']){await page.evaluate(name=>window.estateQA.view(name),view);await page.waitForTimeout(500);await page.screenshot({path:`${output}/${view}.png`,timeout:120000});console.log('Captured',view)}
 await page.evaluate(()=>{window.estateQA.preset('evening');window.estateQA.view('great')});await page.waitForTimeout(500);await page.screenshot({path:`${output}/evening.png`,timeout:120000})
 await page.setViewportSize({width:412,height:915});await page.evaluate(()=>{window.estateQA.preset('golden');window.estateQA.view('great')});await page.waitForTimeout(500);await page.screenshot({path:`${output}/phone-great.png`,timeout:120000})
 await page.goto('http://127.0.0.1:4173/tests/ocean-estate-preview.html',{waitUntil:'load'});await page.getByRole('button',{name:'Step inside'}).waitFor({state:'visible',timeout:120000});await page.screenshot({path:`${output}/phone-arrival.png`,timeout:120000});await page.getByRole('button',{name:'Step inside'}).click();await page.getByRole('button',{name:'Estate settings'}).click();await page.getByLabel('Light',{exact:true}).selectOption('evening');await page.screenshot({path:`${output}/phone-settings.png`,timeout:120000});await page.getByRole('button',{name:'Back to exploring'}).click();await page.getByRole('button',{name:'Places',exact:false}).click();await page.screenshot({path:`${output}/phone-places.png`,timeout:120000})
 await page.getByRole('button',{name:/Great room/}).click();await page.getByRole('button',{name:'Stop · Great room'}).waitFor({state:'visible',timeout:10000});await page.getByRole('button',{name:'Stop · Great room'}).click()
 assert.equal(await page.locator('body').evaluate(e=>e.scrollWidth<=innerWidth),true,'phone horizontal overflow')
 await writeFile(`${output}/verification.json`,JSON.stringify({errors,diagnostics,phoneViewport:{width:412,height:915},renderer:'Chromium SwiftShader; not S23 hardware',ui:'entry, settings, lighting, destinations, navigation start/stop',routeTests:'see Node test output'},null,2))
 assert.ok(diagnostics.calls<350,`Draw calls ${diagnostics.calls}`);assert.ok(diagnostics.triangles<1300000,`Triangles ${diagnostics.triangles}`);assert.deepEqual(errors,[])
}finally{await page.screenshot({path:output+'/last-ui.png',timeout:120000}).catch(()=>{});await writeFile(`${output}/console-errors.json`,JSON.stringify(errors,null,2));await browser.close()}
