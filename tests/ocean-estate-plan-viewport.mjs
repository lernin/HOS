import { createServer } from 'vite'
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import assert from 'node:assert/strict'

// Regression: a zoomed landscape map must render and pick real patios outside
// the old central letterbox. Portrait must also use its extra vertical space.
const output='artifacts/plan-viewport'
await mkdir(output,{recursive:true})
const baseUrl=process.env.ESTATE_PLAN_TEST_URL||'http://127.0.0.1:4173'
const server=process.env.ESTATE_PLAN_TEST_URL?null:await createServer({server:{host:'127.0.0.1',port:4173,strictPort:true}})
await server?.listen()
const browser=await chromium.launch({executablePath:process.env.ESTATE_CHROMIUM_PATH||undefined,
  args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
try{
  for(const deviceScaleFactor of [1,2.625]){
    const page=await browser.newPage({viewport:{width:915,height:412},deviceScaleFactor,hasTouch:true})
    const errors=[];page.on('pageerror',e=>errors.push(e.message))
    await page.goto(`${baseUrl}/tests/ocean-estate-plan-preview.html`)
    await page.locator('.ep-reality').waitFor()
    async function point(x,z){return page.evaluate(({x,z})=>{
      const svg=document.querySelector('.ep-plan'),p=new DOMPoint(x,z).matrixTransform(svg.getScreenCTM())
      return {x:p.x,y:p.y}
    },{x,z})}
    async function includes(points){
      // View changes reset logical framing in an effect; wait for that frame
      // and the resize observer instead of asserting the transitional box.
      await page.waitForFunction(points=>{
        const svg=document.querySelector('.ep-plan'),rect=svg.getBoundingClientRect(),matrix=svg.getScreenCTM()
        return points.every(([x,z])=>{const p=new DOMPoint(x,z).matrixTransform(matrix)
          return p.x>=rect.left&&p.x<=rect.right&&p.y>=rect.top&&p.y<=rect.bottom})
      },points,{timeout:5000})
      const rect=await page.locator('.ep-stage').boundingBox()
      for(const [x,z] of points){
        const p=await point(x,z)
        assert.ok(p.x>=rect.x&&p.x<=rect.x+rect.width&&p.y>=rect.y&&p.y<=rect.y+rect.height,'Fit includes selected extent')
      }
    }
    async function patio(code,x,z){
      const p=await point(x,z)
      const rect=await page.locator('.ep-stage').boundingBox()
      assert.ok(p.x>rect.x&&p.x<rect.x+rect.width&&p.y>rect.y&&p.y<rect.y+rect.height,'patio lies on available screen')
      await page.mouse.click(p.x,p.y)
      assert.equal(await page.locator('.ep-selection-card>b').count(),1,`${code} is selectable beyond the old letterbox`)
      assert.equal(await page.locator('.ep-selection-card>b').innerText(),code)
      await page.locator('.ep-selection-card>button').click()
      const screenshot=await page.screenshot()
      const color=await page.evaluate(async({data,p,ratio})=>{
        const img=new Image();img.src='data:image/png;base64,'+data;await img.decode()
        const c=document.createElement('canvas');c.width=img.width;c.height=img.height
        const ctx=c.getContext('2d');ctx.drawImage(img,0,0)
        return [...ctx.getImageData(Math.round(p.x*ratio),Math.round(p.y*ratio),1,1).data]
      },{data:screenshot.toString('base64'),p,ratio:deviceScaleFactor})
      assert.ok(Math.hypot(color[0]-220,color[1]-239,color[2]-242)>30,`${code} is drawn, not blank blue: ${color}`)
    }
    for(let i=0;i<4;i++)await page.getByRole('button',{name:'Zoom in',exact:true}).click()
    await patio('P6',42,-20)
    await page.screenshot({path:`${output}/landscape-zoom-${deviceScaleFactor}.png`})
    const before=await point(-19.43,-18.37)
    await page.mouse.move(before.x,before.y);await page.mouse.down()
    await page.mouse.move(before.x+40,before.y+15,{steps:4});await page.mouse.up()
    const after=await point(-19.43,-18.37)
    assert.ok(Math.hypot(after.x-before.x-40,after.y-before.y-15)<1,'map follows the pan distance on the full viewport')
    await page.mouse.move(after.x,after.y);await page.mouse.wheel(0,-50)
    await page.waitForTimeout(100)
    const zoomed=await point(-19.43,-18.37)
    assert.ok(Math.hypot(zoomed.x-after.x,zoomed.y-after.y)<1,'wheel zoom holds the world point under the cursor')
    const anchor=await page.evaluate(()=>{
      const p=new DOMPoint(450,220).matrixTransform(document.querySelector('.ep-plan').getScreenCTM().inverse())
      return{x:p.x,z:p.y}
    })
    const cdp=await page.context().newCDPSession(page)
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:400,y:220,id:1},{x:500,y:220,id:2}]})
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:400,y:225,id:1},{x:540,y:235,id:2}]})
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
    const pinched=await point(anchor.x,anchor.z)
    assert.ok(Math.hypot(pinched.x-470,pinched.y-230)<1,'pinch preserves the world anchor while moving its midpoint')
    await cdp.detach()
    await page.getByRole('button',{name:'Fit plan',exact:true}).click()
    const house=[[-47,44],[50,-24],[-15,-70],[16,-70],[50,55]]
    await includes(house)
    await page.setViewportSize({width:412,height:915})
    await page.locator('.ep-zoom').getByRole('button',{name:'Fit',exact:true}).click()
    for(let i=0;i<2;i++)await page.locator('.ep-zoom button').first().click()
    await patio('P2',-13,-58)
    await page.screenshot({path:`${output}/portrait-zoom-${deviceScaleFactor}.png`})
    await page.locator('.ep-zoom').getByRole('button',{name:'Fit',exact:true}).click()
    await includes(house)
    await page.screenshot({path:`${output}/portrait-fit-${deviceScaleFactor}.png`})
    for(const viewport of [{width:412,height:915},{width:915,height:412}]){
      await page.setViewportSize(viewport)
      await page.getByRole('button',{name:'Arrival',exact:true}).click()
      await includes([[-20,41],[20,41],[0,62]])
      await page.getByRole('button',{name:'Whole site',exact:true}).click()
      await includes([[-60,0],[60,0],[0,-80],[0,66]])
    }
    await page.getByRole('button',{name:'Clean view',exact:true}).click()
    const clean=await page.locator('.ep-stage').boundingBox()
    assert.deepEqual(clean,{x:0,y:0,width:915,height:412},'Clean view uses the entire viewport')
    await page.getByRole('button',{name:'Exit clean view',exact:true}).click()
    assert.deepEqual(errors,[])
    await page.close()
  }
  console.log('PASS: full-viewport rendered patio picks at phone DPR, portrait/landscape zoom and complete Fit')
}finally{await browser.close();await server?.close()}
