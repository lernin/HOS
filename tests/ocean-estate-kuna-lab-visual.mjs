import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'

const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader']})
await mkdir('artifacts/ocean-estate',{recursive:true})
try{
  for(const testCase of [
    {name:'desktop',width:1280,height:800,mobile:false},
    {name:'landscape-phone',width:915,height:412,mobile:true}
  ]){
    const context=await browser.newContext({
      viewport:{width:testCase.width,height:testCase.height},
      isMobile:testCase.mobile,hasTouch:testCase.mobile,acceptDownloads:true
    })
    const page=await context.newPage()
    // Vite dev server does not apply Vercel's cross-project GLB rewrite.
    // Serve the exact canonical Procedia fox asset through this test route.
    await page.route('**/models/fox-mascot.glb',async route=>{
      const response=await fetch('https://procedia-two.vercel.app/models/fox-mascot.glb')
      assert.equal(response.status,200,'canonical Procedia GLB must be available')
      await route.fulfill({
        status:200,contentType:'model/gltf-binary',
        body:Buffer.from(await response.arrayBuffer()),
      })
    })
    const errors=[]
    page.on('pageerror',e=>errors.push(e.message))
    await page.goto('http://127.0.0.1:4173/kuna-lab',{waitUntil:'domcontentloaded'})
    await page.getByText('Ashley’s private workspace').waitFor({state:'visible',timeout:15000}) // Preserve the real PIN gate.
    // An isolated Vite-only fixture renders the same component without
    // weakening app authentication or storing a PIN in test credentials.
    await page.goto('http://127.0.0.1:4173/tests/kuna-lab-preview.html',{waitUntil:'domcontentloaded'})
    await page.getByRole('heading',{name:'Kuna Lab'}).waitFor({timeout:15000})
    await page.getByText('Model ready',{exact:true}).waitFor({timeout:30000})
    assert.equal(await page.locator('.kl-stage canvas').count(),1,'Kuna Lab has an interactive 3D stage')
    await page.getByRole('button',{name:'Run full simulation'}).click()
    await page.getByRole('button',{name:'listening',exact:true}).waitFor({state:'visible'})
    await page.waitForFunction(()=>document.querySelector('button.selected')?.textContent==='listening',{timeout:2500})
    await page.getByRole('button',{name:'idle',exact:true}).click()
    await page.getByRole('button',{name:'Record',exact:true}).click()
    await page.keyboard.press('j')
    await page.waitForTimeout(600)
    await page.getByRole('button',{name:'Stop & Save'}).click()
    await page.getByText(/Saved custom\./).waitFor({timeout:5000})
    const downloadEvent=page.waitForEvent('download')
    await page.getByRole('button',{name:'Export JSON'}).click()
    const dl=await downloadEvent
    assert.ok(dl.suggestedFilename().endsWith('.json'))
    await page.screenshot({path:'artifacts/ocean-estate/kuna-lab-'+testCase.name+'.png',fullPage:true})
    assert.deepEqual(errors,[],'Kuna Lab emitted no uncaught JS exceptions: '+errors.join(','))
    console.log('Kuna Lab '+testCase.name+': original GLB loaded; speaking simulation, record/replay export passed')
    await context.close()
  }
}finally{await browser.close()}
