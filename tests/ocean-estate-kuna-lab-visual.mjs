import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import {mkdir,readFile} from 'node:fs/promises'

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
    await page.screenshot({path:'artifacts/ocean-estate/kuna-neutral-front-'+testCase.name+'.png'})
    await page.getByRole('button',{name:'Run full simulation'}).click()
    await page.getByRole('button',{name:'listening',exact:true}).waitFor({state:'visible'})
    await page.waitForFunction(()=>[...document.querySelectorAll('button.selected')]
      .some(button=>button.textContent==='listening'),null,{timeout:2500})
    await page.getByRole('button',{name:'idle',exact:true}).click()
    await page.getByRole('button',{name:'Record',exact:true}).click()
    await page.keyboard.press('j')
    await page.waitForTimeout(600)
    await page.getByRole('button',{name:'Stop & Save'}).click()
    await page.getByText(/Saved custom\./).waitFor({timeout:5000})
    await page.getByRole('heading',{name:/Expression gallery/}).waitFor()
    assert.equal(await page.locator('.kl-gallery-card').count(),1,'saved take appears as a motion card')
    await page.getByRole('textbox',{name:'Register a new emotion'}).fill('Reassurance')
    await page.getByRole('button',{name:'Add emotion'}).click()
    await page.locator('.kl-emotion-palette').getByRole('button',{name:/reassurance/i}).click()
    await page.locator('.kl-emotion-palette').getByRole('button',{name:/curiosity/i}).click()
    const curiosity=page.getByRole('slider',{name:'curiosity emotional strength'})
    await curiosity.focus()
    await curiosity.press('End')
    for(let i=0;i<4;i++)await curiosity.press('ArrowLeft')
    assert.equal(await curiosity.inputValue(),'80','emotion rating is stored independently')
    const intensity=page.getByRole('slider',{name:'Playback intensity'})
    await intensity.focus()
    await intensity.press('Home')
    for(let i=0;i<5;i++)await intensity.press('ArrowRight')
    assert.equal(await intensity.inputValue(),'25','subtle replay has separate movement strength')
    await page.getByRole('combobox',{name:'Filter takes by registered emotion'}).selectOption('curiosity')
    assert.equal(await page.locator('.kl-gallery-card').count(),1,'gallery filters by rated meaning')
    // Classify the same recorded gesture for both child-relative situations.
    await page.getByRole('group',{name:'Applicable performance contexts'})
      .getByRole('button',{name:/Walking alongside/}).click()
    await page.getByRole('combobox',{name:'Filter takes by performance context'}).selectOption('alongside')
    assert.equal(await page.locator('.kl-gallery-card').count(),1,'alongside ratings can be filtered')
    await page.getByRole('group',{name:'Expression viewing context'})
      .getByRole('button',{name:'Walking alongside'}).click()
    await page.getByRole('button',{name:/Mirror view: right → left/}).click()
    await page.getByText(/Walking alongside · left view/).waitFor()
    await page.getByRole('button',{name:/Replay at 25%/}).click()
    await page.getByRole('button',{name:/Mirror view: left → right/}).click()
    await page.getByText(/Walking alongside · right view/).waitFor()
    await page.screenshot({path:'artifacts/ocean-estate/kuna-walking-alongside-'+testCase.name+'.png'})
    const downloadEvent=page.waitForEvent('download')
    await page.getByRole('button',{name:'Export gallery + vocabulary'}).click()
    const dl=await downloadEvent
    assert.ok(dl.suggestedFilename().endsWith('.json'))
    const bundle=JSON.parse(await readFile(await dl.path(),'utf8'))
    assert.equal(bundle.version,3)
    assert.equal(bundle.type,'kuna-motion-library')
    assert.ok(bundle.emotions.includes('reassurance'))
    assert.equal(bundle.takes[0].emotions.curiosity,80)
    assert.equal(bundle.takes[0].playbackIntensity,25)
    assert.deepEqual(bundle.takes[0].contexts,['face-to-face','alongside'])
    // New takes recorded from the walking viewpoint carry alongside only;
    // right/left remain mirrors, not duplicated categories.
    await page.getByRole('button',{name:'Record',exact:true}).click()
    await page.keyboard.press('l')
    await page.waitForTimeout(450)
    await page.getByRole('button',{name:'Stop & Save'}).click()
    await page.getByText(/Saved custom\./).waitFor({timeout:5000})
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('hos-kuna-motion-studio-v2')??'[]'))
    assert.equal(saved.length,2)
    assert.deepEqual(saved[1].contexts,['alongside'])
    await page.screenshot({path:'artifacts/ocean-estate/kuna-lab-'+testCase.name+'.png',fullPage:true})
    assert.deepEqual(errors,[],'Kuna Lab emitted no uncaught JS exceptions: '+errors.join(','))
    console.log('Kuna Lab '+testCase.name+': GLB, recording, emotion registration, 80% rating, 25% replay and v3 export passed')
    await context.close()
  }
}finally{await browser.close()}
