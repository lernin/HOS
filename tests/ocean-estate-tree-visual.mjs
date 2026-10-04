import { createServer } from 'vite'
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

const output='artifacts/ocean-estate-trees'
await mkdir(output,{recursive:true})
const server=await createServer({server:{host:'127.0.0.1',port:4173,strictPort:true}})
await server.listen()
const browser=await chromium.launch({executablePath:process.env.ESTATE_CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader']})
const errors=[],report=[]
try {
  const page=await browser.newPage({viewport:{width:1440,height:960}})
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto('http://127.0.0.1:4173/design-lab.html?gallery=trees',{waitUntil:'load'})
  await page.getByRole('button',{name:'Trunk & planting',exact:true}).waitFor()
  assert.equal(await page.locator('vite-error-overlay').count(),0)
  assert.equal(await page.locator('.design-lab-grid [data-study]').count(),4)
  for(let i=0;i<3;i++){
    await page.locator(`.design-lab-grid [data-study="${i}"]`).click()
    await page.getByRole('button',{name:'Whole tree',exact:true}).click()
    await page.waitForTimeout(1600)
    await page.screenshot({path:`${output}/study-${i+1}.png`})
  }
  await page.locator('.design-lab-grid [data-study="0"]').click()
  for(const [label,file] of [['Trunk & planting','lab-base'],['Canopy','lab-canopy']]){
    await page.getByRole('button',{name:label,exact:true}).click();await page.waitForTimeout(1600)
    await page.screenshot({path:`${output}/${file}.png`})
  }
  const canvas=page.locator('canvas'),b=await canvas.boundingBox()
  await page.mouse.move(b.width*.55,b.height*.45);await page.mouse.down();await page.mouse.move(b.width*.7,b.height*.45,{steps:8});await page.mouse.up()
  await page.waitForTimeout(1300);await page.screenshot({path:`${output}/lab-orbit.png`})
  for(const viewport of [{width:915,height:412},{width:412,height:915}]){
    await page.setViewportSize(viewport)
    await page.getByRole('button',{name:'Whole tree',exact:true}).click();await page.waitForTimeout(1600)
    assert.equal(await page.evaluate(()=>document.body.scrollWidth<=innerWidth),true,'lab fits the phone width')
    for(const label of ['Whole tree','Trunk & planting','Canopy'])assert.equal(await page.getByRole('button',{name:label,exact:true}).isVisible(),true)
    await page.screenshot({path:`${output}/lab-phone-${viewport.width}.png`})
  }
  await page.setViewportSize({width:1440,height:960})
  await page.goto('http://127.0.0.1:4173/tests/ocean-estate-visual.html',{waitUntil:'load'})
  await page.waitForSelector('body.ready',{timeout:120000})
  for(const view of ['spaDome','spaTreeBase','spaTreeCanopy','spaRoof']){
    await page.evaluate(view=>window.estateQA.view(view),view);await page.waitForTimeout(700)
    report.push({view,...await page.evaluate(()=>window.estateQA.diagnostics())})
    await page.screenshot({path:`${output}/${view}.png`,timeout:120000})
  }
  await page.setViewportSize({width:915,height:412})
  for(const view of ['spaDome','spaTreeBase']){
    await page.evaluate(view=>window.estateQA.view(view),view);await page.waitForTimeout(700)
    await page.screenshot({path:`${output}/${view}-phone.png`,timeout:120000})
  }
  assert.deepEqual(errors,[])
  await writeFile(`${output}/verification.json`,JSON.stringify({errors,views:report},null,2))
  console.log(JSON.stringify({errors,views:report}))
} finally {await browser.close();await server.close()}
