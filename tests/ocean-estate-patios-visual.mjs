import { createServer } from 'vite'
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const output='artifacts/ocean-estate-patios'
await mkdir(output,{recursive:true})
const server=await createServer({server:{host:'127.0.0.1',port:4173,strictPort:true}})
await server.listen()
const browser=await chromium.launch({executablePath:process.env.ESTATE_CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader']})
const errors=[],views=[]
try {
 const page=await browser.newPage({viewport:{width:1440,height:960}})
 page.on('pageerror',e=>errors.push(e.message))
 await page.goto('http://127.0.0.1:4173/tests/ocean-estate-visual.html',{waitUntil:'load'})
 await page.waitForSelector('body.ready',{timeout:120000})
 assert.equal(await page.locator('vite-error-overlay').count(),0)
 for(const name of ['circuitAerial','westPromenade','eastPromenade','arrivalWest','arrivalEast','poolTip','poolTipAerial','cobbleCourt']){
  await page.evaluate(name=>window.estateQA.view(name),name)
  await page.waitForTimeout(450)
  views.push({name,...await page.evaluate(()=>window.estateQA.diagnostics())})
  await page.screenshot({path:`${output}/${name}.png`,timeout:120000})
 }
 for(const viewport of [{width:915,height:412},{width:412,height:915}]){
  await page.setViewportSize(viewport)
  await page.evaluate(()=>window.estateQA.view('poolTip'))
  await page.waitForTimeout(450)
  await page.screenshot({path:`${output}/poolTip-${viewport.width}.png`,timeout:120000})
 }
 assert.deepEqual(errors,[])
 await writeFile(`${output}/verification.json`,JSON.stringify({errors,views},null,2))
 console.log(JSON.stringify({errors,views}))
}finally{await browser.close();await server.close()}
