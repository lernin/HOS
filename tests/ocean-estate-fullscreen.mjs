import { chromium } from 'playwright'
import assert from 'node:assert/strict'

const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader']})
try{
  for(const options of [{label:'desktop',viewport:{width:1280,height:800},isMobile:false,hasTouch:false},{label:'landscape mobile',viewport:{width:915,height:412},isMobile:true,hasTouch:true}]){
    const context=await browser.newContext({viewport:options.viewport,isMobile:options.isMobile,hasTouch:options.hasTouch})
    const page=await context.newPage()
    await page.goto('http://127.0.0.1:4173/tests/ocean-estate-preview.html',{waitUntil:'domcontentloaded'})
    const button=page.getByRole('button',{name:'Enter fullscreen'})
    await button.waitFor({state:'visible',timeout:20000})
    const rect=await button.boundingBox()
    assert.ok(rect&&rect.x<65&&rect.y<75,options.label+' has fullscreen at top left')
    if(options.hasTouch)await button.tap()
    else await button.click()
    await page.waitForFunction(()=>document.fullscreenElement?.classList.contains('oe-root')===true,{timeout:5000})
    assert.equal(await button.count(),0,options.label+' hides entry button after fullscreen succeeds')
    assert.equal(await page.getByRole('button',{name:'Estate menu'}).count(),1,options.label+' menu remains available')
    console.log('Fullscreen entry verified on '+options.label)
    await context.close()
  }
}finally{await browser.close()}
