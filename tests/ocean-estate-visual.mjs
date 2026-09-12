import { chromium } from 'playwright'
import { mkdir,writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const output='artifacts/ocean-estate';await mkdir(output,{recursive:true})
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader']})
const page=await browser.newPage({viewport:{width:1440,height:960},deviceScaleFactor:1}),errors=[]
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
const visible=locator=>locator.isVisible().catch(()=>false)
async function stopIfMoving(p){const stop=p.getByRole('button',{name:/^Stop/}).first();if(await visible(stop)){await stop.click();await p.waitForTimeout(80)}}
async function findSurface(p,title){
 const canvas=p.locator('.oe-canvas'),box=await canvas.boundingBox();if(!box)return false
 const xs=[.12,.20,.28,.36,.44,.52,.60,.68,.76,.84].map(v=>box.x+box.width*v)
 const ys=[.22,.31,.40,.49,.58,.67,.76].map(v=>box.y+box.height*v)
 for(const y of ys)for(const x of xs){
  await p.touchscreen.tap(x,y);await p.waitForTimeout(65)
  const picker=p.locator('.oe-material-picker')
  if(!(await visible(picker)))continue
  const heading=(await picker.locator('h2').textContent())?.trim()
  if(heading===title)return true
  await p.getByRole('button',{name:'Undo and close'}).click();await p.waitForTimeout(65)
 }
 return false
}
async function dragLook(p,gesture,dx){
 const box=await p.locator('.oe-canvas').boundingBox();if(!box)return
 const x=box.x+box.width*.55,y=box.y+box.height*.48,end=x+dx
 await gesture.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]})
 for(let i=1;i<=6;i++)await gesture.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+(end-x)*i/6,y}]})
 await gesture.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForTimeout(80)
}
async function findArtwork(p,gesture){
 const canvas=p.locator('.oe-canvas'),box=await canvas.boundingBox();if(!box)return false
 const xs=[.12,.22,.32,.42,.52,.62,.72,.82,.90].map(v=>box.x+box.width*v)
 const ys=[.24,.34,.44,.54,.64].map(v=>box.y+box.height*v)
 for(let turn=0;turn<7;turn++){
  for(const y of ys)for(const x of xs){
   await p.touchscreen.tap(x,y);await p.waitForTimeout(70)
   if(await visible(p.locator('.oe-art-view')))return true
   await stopIfMoving(p)
  }
  await dragLook(p,gesture,-135)
 }
 return false
}
try{
 await page.goto('http://127.0.0.1:4173/tests/ocean-estate-visual.html',{waitUntil:'load'});await page.waitForSelector('body.ready',{timeout:120000})
 const diagnostics=await page.evaluate(()=>window.estateQA.diagnostics());console.log('Render budget',diagnostics)
 for(const view of ['arrival','great','ocean','courtyard','kitchen','suite','bath','exterior','aerial']){await page.evaluate(name=>window.estateQA.view(name),view);await page.waitForTimeout(500);await page.screenshot({path:`${output}/${view}.png`,timeout:120000});console.log('Captured',view)}
 await page.evaluate(()=>{window.estateQA.preset('evening');window.estateQA.view('great')});await page.waitForTimeout(500);await page.screenshot({path:`${output}/evening.png`,timeout:120000})
 await page.setViewportSize({width:915,height:412});await page.evaluate(()=>{window.estateQA.preset('golden');window.estateQA.view('great')});await page.waitForTimeout(500);await page.screenshot({path:`${output}/phone-landscape-great.png`,timeout:120000})
 await page.close()

 const mobile=await browser.newContext({viewport:{width:915,height:412},deviceScaleFactor:1,isMobile:true,hasTouch:true});const touch=await mobile.newPage();const gesture=await mobile.newCDPSession(touch)
 touch.on('pageerror',e=>errors.push(e.message));touch.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
 await touch.goto('http://127.0.0.1:4173/tests/ocean-estate-preview.html',{waitUntil:'load'});await touch.getByRole('button',{name:'Step inside'}).waitFor({state:'visible',timeout:120000});await touch.screenshot({path:`${output}/phone-landscape-arrival.png`,timeout:120000});await touch.getByRole('button',{name:'Step inside'}).tap()

 await touch.getByRole('button',{name:'Estate settings'}).tap();await touch.getByLabel('Light',{exact:true}).selectOption('evening');await touch.getByLabel('Walking pace').fill('4');await touch.getByLabel('Design editing',{exact:true}).selectOption('on');await touch.screenshot({path:`${output}/phone-landscape-settings.png`,timeout:120000});await touch.getByRole('button',{name:/Back to exploring/}).tap();await touch.waitForTimeout(180)
 assert.ok(await findSurface(touch,'Floor material'),'direct landscape foyer floor tap opens material picker');await touch.screenshot({path:`${output}/phone-landscape-edit-floor.png`,timeout:120000});await touch.getByRole('button',{name:'Undo and close'}).tap();await touch.waitForTimeout(120)
 assert.ok(await findSurface(touch,'Main wall material'),'direct landscape foyer wall tap opens material picker');await touch.screenshot({path:`${output}/phone-landscape-edit-wall.png`,timeout:120000});await touch.getByRole('button',{name:'Undo and close'}).tap();await touch.waitForTimeout(120)

 await touch.getByRole('button',{name:'Estate settings'}).tap();await touch.getByLabel('Design editing',{exact:true}).selectOption('off');await touch.getByRole('button',{name:/Back to exploring/}).tap();await touch.waitForTimeout(120)
 const beforeX=Number(await touch.locator('.oe-root').getAttribute('data-player-x')),beforeZ=Number(await touch.locator('.oe-root').getAttribute('data-player-z'));const box=await touch.locator('.oe-canvas').boundingBox();assert.ok(box,'estate canvas bounds')
 await touch.touchscreen.tap(box.x+box.width*.50,box.y+box.height*.72);await touch.waitForFunction(([x,z])=>{const root=document.querySelector('.oe-root');return Math.hypot(Number(root.dataset.playerX)-x,Number(root.dataset.playerZ)-z)>.12},[beforeX,beforeZ],{timeout:30000});await stopIfMoving(touch)
 const yaw=Number(await touch.locator('.oe-root').getAttribute('data-camera-yaw'));await dragLook(touch,gesture,130);await touch.waitForFunction(y=>Math.abs(Number(document.querySelector('.oe-root').dataset.cameraYaw)-y)>.1,yaw,{timeout:10000})

 await touch.getByRole('button',{name:'Places',exact:false}).tap();await touch.getByRole('button',{name:/Great room/}).tap();await touch.keyboard.down('Shift');try{await touch.waitForFunction(()=>document.querySelector('.oe-location h1')?.textContent?.trim()==='Great room',{timeout:30000})}finally{await touch.keyboard.up('Shift')}await stopIfMoving(touch);await touch.waitForTimeout(180)
 assert.ok(await findArtwork(touch,gesture),'artwork tap opens immersive inspection in landscape');const artView=touch.locator('.oe-art-view');await artView.waitFor({state:'visible',timeout:5000});await touch.screenshot({path:`${output}/phone-landscape-art.png`,timeout:120000});await touch.getByRole('button',{name:'Return to the room'}).tap();await artView.waitFor({state:'hidden',timeout:5000})

 await touch.getByRole('button',{name:'Estate settings'}).tap();const stoppedX=Number(await touch.locator('.oe-root').getAttribute('data-player-x')),stoppedZ=Number(await touch.locator('.oe-root').getAttribute('data-player-z'));await touch.waitForTimeout(700);assert.ok(Math.hypot(Number(await touch.locator('.oe-root').getAttribute('data-player-x'))-stoppedX,Number(await touch.locator('.oe-root').getAttribute('data-player-z'))-stoppedZ)<.01,'settings stop movement');await touch.getByRole('button',{name:/Back to exploring/}).tap()
 assert.equal(await touch.locator('body').evaluate(e=>e.scrollWidth<=innerWidth),true,'landscape phone horizontal overflow');await touch.screenshot({path:`${output}/phone-landscape-touch.png`,timeout:120000});await mobile.close()
 await writeFile(`${output}/verification.json`,JSON.stringify({errors,diagnostics,phoneViewport:{width:915,height:412},renderer:'Chromium SwiftShader; not physical phone hardware',ui:'landscape entry, settings, lighting, direct floor/wall editor taps, normal tap-to-walk, drag-to-look, Great room artwork inspection and return, modal movement pause',routeTests:'see Node test output'},null,2))
 assert.ok(diagnostics.calls<350,`Draw calls ${diagnostics.calls}`);assert.ok(diagnostics.triangles<1300000,`Triangles ${diagnostics.triangles}`);assert.deepEqual(errors,[])
}finally{await page.screenshot({path:output+'/last-ui.png',timeout:120000}).catch(()=>{});await writeFile(`${output}/console-errors.json`,JSON.stringify(errors,null,2));await browser.close()}
