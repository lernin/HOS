// Reproducible CI visual evidence from the real WebGL scene; no mock renderer.
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const output='artifacts/waterfall-village'
await mkdir(output,{recursive:true})
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader']})
const page=await browser.newPage({viewport:{width:1536,height:1024},deviceScaleFactor:1})
const errors=[]
page.on('pageerror',e=>errors.push(e.message))
page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
await page.goto('http://127.0.0.1:4173/tests/waterfall-village-visual.html',{waitUntil:'load'})
await page.waitForSelector('body.ready',{timeout:120000})
console.log('Scene ready',await page.evaluate(()=>window.villageQA.diagnostics()))
const views=['spawn','cottage','water','elevated','interior']
for(const view of views){console.log('Rendering',view);await page.evaluate(v=>window.villageQA.view(v),view);await page.waitForTimeout(1200);await page.screenshot({timeout:120000,path:`${output}/${view}.png`})}
const tour=await page.evaluate(()=>window.villageQA.tour())
const diagnostics=await page.evaluate(()=>window.villageQA.diagnostics())
assert.ok(diagnostics.calls<180,`Draw call budget: ${diagnostics.calls}`)
assert.ok(diagnostics.triangles<1500000,`Triangle budget: ${diagnostics.triangles}`)
await page.setViewportSize({width:412,height:915})
await page.evaluate(()=>window.villageQA.view('spawn'));await page.waitForTimeout(800)
await page.screenshot({timeout:120000,path:`${output}/phone-spawn.png`})
await writeFile(`${output}/verification.json`,JSON.stringify({errors,tour,diagnostics,renderer:'Chromium SwiftShader, not S23 hardware',views},null,2))
await browser.close()
assert.deepEqual(errors,[])
