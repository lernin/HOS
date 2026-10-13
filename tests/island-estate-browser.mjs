import assert from 'node:assert/strict'
import { mkdir,writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import { createServer } from 'vite'

const out=process.env.ISLAND_REVIEW_DIR||'/tmp/island-estate-review'
await mkdir(out,{recursive:true})
const executablePath=process.env.ISLAND_CHROMIUM_PATH
const browserDir=executablePath?path.dirname(executablePath):null
const server=process.env.ISLAND_BASE_URL?null:await createServer({server:{host:'127.0.0.1',port:5181,strictPort:true}})
if(server)await server.listen()
const base=process.env.ISLAND_BASE_URL||'http://127.0.0.1:5181'
const browser=await chromium.launch({executablePath,headless:true,env:{...process.env,...(browserDir?{LD_LIBRARY_PATH:browserDir,FONTCONFIG_PATH:'/etc/fonts',FONTCONFIG_FILE:'/etc/fonts/fonts.conf'}:{})},args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader']})
const errors=[],evidence={screenshots:[],checks:[]}
function watch(page){page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('favicon'))errors.push(m.text())})}
async function state(page){return page.locator('.ie-root').evaluate(e=>({...e.dataset}))}
async function ready(page){await page.waitForSelector('.ie-root[data-ready="true"]',{timeout:60000});await page.waitForFunction(()=>Number(document.querySelector('.ie-root')?.dataset.drawCalls)>0,{timeout:30000});}
async function shot(page,name){await page.screenshot({path:path.join(out,name+'.png')});evidence.screenshots.push(name)}
try {
  const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});watch(page)
  await page.goto(base+'/island-estate');await ready(page)
  assert.equal(errors.length,0,`All architectural, landscape and water shaders must compile: ${errors.map(e=>e.slice(0,250)).join('\n')}`)
  evidence.checks.push('Initial WebGL render, no shader or runtime errors')
  assert.equal(await page.title(),'The Island Estate · The Lab')
  await shot(page,'aerial-day')
  if(process.env.ISLAND_INPUT_ONLY==='1') {
    await page.getByRole('button',{name:'Explore',exact:true}).click();await page.locator('.ie-canvas').focus()
    await page.keyboard.down('w');await page.waitForTimeout(1200);await page.getByRole('button',{name:'Sunset',exact:true}).click();await page.keyboard.up('w')
    const released=await state(page);await page.waitForTimeout(1500);const stopped=await state(page)
    assert.ok(Math.hypot(Number(stopped.playerX)-Number(released.playerX),Number(stopped.playerZ)-Number(released.playerZ))<.13,'Releasing W while toolbar has focus stops walking')
    await page.locator('.ie-canvas').evaluate(c=>c.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext())
    await page.getByRole('button',{name:'Reopen the island'}).click();await ready(page)
    evidence.checks.push('Focused key release stops movement; context loss reopens with a fresh canvas')
    console.log(JSON.stringify(evidence))
  }
  else if(process.env.ISLAND_QUICK==='1'){console.log(JSON.stringify({state:await state(page),errors,evidence}));}
  else {
    for(const [name,label] of [['front','Front elevation'],['roof','Rooftop sky garden'],['wing','Floating ocean wing'],['atrium','Grand atrium']]) {
      await page.getByRole('button',{name:label,exact:true}).first().click();await page.waitForTimeout(350);await shot(page,name)
    }
    await page.getByRole('button',{name:'Island aerial',exact:true}).first().click()
    await page.getByRole('button',{name:'Sunset',exact:true}).click();await page.waitForTimeout(350);await shot(page,'aerial-sunset')
    await page.getByRole('button',{name:'Compare with reference image'}).click();await page.waitForTimeout(350)
    assert.equal(await page.locator('.ie-reference img').evaluate(i=>i.complete&&i.naturalWidth>1000),true)
    await shot(page,'reference-comparison');await page.getByRole('button',{name:'Close reference comparison'}).last().click()
    await page.getByRole('button',{name:'Plans',exact:true}).click()
    await page.getByRole('dialog').filter({hasText:'Plans & sections'}).waitFor()
    assert.match(await page.locator('.ie-drawing').textContent(),/19.6 m ATRIUM/)
    await shot(page,'plans')
    const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Download SVG'}).click();const download=await downloadPromise;assert.match(download.suggestedFilename(),/The-Island-Estate-all.svg/)
    await page.getByRole('button',{name:'Close plans'}).click();evidence.checks.push('Plans, dimensions and SVG download')
    await page.getByRole('button',{name:'Explore',exact:true}).click();await page.locator('.ie-canvas').click({position:{x:1500,y:260}})
    const before=await state(page);await page.keyboard.down('w');await page.waitForTimeout(900);await page.keyboard.up('w');await page.waitForTimeout(240);const after=await state(page)
    assert.ok(Math.hypot(Number(after.playerX)-Number(before.playerX),Number(after.playerZ)-Number(before.playerZ))>.3,'Keyboard moves the walker')
    evidence.checks.push('Keyboard movement')
    await page.getByRole('button',{name:'Estate menu'}).click();await page.getByRole('button',{name:'Return to entrance'}).click();await page.waitForTimeout(250)
    const p=await state(page);assert.ok(Math.abs(Number(p.playerZ)-21)<.3)
    await page.getByRole('button',{name:'Walk to…'}).click();await page.getByRole('button',{name:'Atrium gallery First floor',exact:false}).click()
    await page.waitForFunction(()=>{const e=document.querySelector('.ie-root');return Number(e.dataset.playerY)>13.8&&Math.hypot(Number(e.dataset.playerX)-3,Number(e.dataset.playerZ)-5)<.7},{timeout:80000})
    await shot(page,'first-floor-walk');evidence.checks.push('Real-time walking route climbs the physical staircase to first floor')
    const phone=await browser.newPage({viewport:{width:412,height:915},deviceScaleFactor:1,hasTouch:true,isMobile:true});watch(phone)
    await phone.goto(base+'/island-estate');await ready(phone);await shot(phone,'phone-overview')
    await phone.getByRole('button',{name:'Explore',exact:true}).tap();await phone.waitForTimeout(250)
    const b=await phone.locator('.ie-joystick').boundingBox(),x=b.x+b.width/2,y=b.y+b.height/2
    const cdp=await phone.context().newCDPSession(phone),start=await state(phone)
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]})
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-32,id:1}]})
    await phone.waitForTimeout(900);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await phone.waitForTimeout(250)
    const moved=await state(phone);assert.ok(Math.hypot(Number(moved.playerX)-Number(start.playerX),Number(moved.playerZ)-Number(start.playerZ))>.3,'Real touch joystick moves the walker')
    await phone.waitForTimeout(500);const stopped=await state(phone);assert.ok(Math.hypot(Number(stopped.playerX)-Number(moved.playerX),Number(stopped.playerZ)-Number(moved.playerZ))<.1,'Touch release stops movement')
    await shot(phone,'phone-walk');evidence.checks.push('Phone touch joystick and release stop')
    assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight),true,'Phone viewport does not overflow')
    await phone.getByRole('button',{name:'Compare with reference image'}).tap();await shot(phone,'phone-reference');await phone.getByRole('button',{name:'Close reference comparison'}).last().tap()
    await phone.setViewportSize({width:915,height:412});await phone.waitForTimeout(350);await shot(phone,'phone-landscape');evidence.checks.push('Phone portrait, landscape, reference comparison')
    const hub=await browser.newPage({viewport:{width:412,height:915}});watch(hub);await hub.goto(base+'/');await hub.getByText('The Island Estate',{exact:true}).waitFor();await hub.locator('.experience-card').filter({hasText:'The Island Estate'}).getByRole('button',{name:'Go'}).click();await ready(hub);assert.match(hub.url(),/\/island-estate$/);evidence.checks.push('Lab card and direct route')
    assert.equal(errors.length,0,`No runtime/graphics errors throughout the full experience: ${errors.map(e=>e.slice(0,180)).join('\n')}`)
    evidence.desktop=await state(page);evidence.phone=await state(phone)
    console.log(JSON.stringify(evidence))
  }
} finally {await writeFile(path.join(out,'evidence.json'),JSON.stringify({evidence,errors},null,2));await browser.close();if(server)await server.close()}
