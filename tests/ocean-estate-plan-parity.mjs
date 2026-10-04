import { chromium } from 'playwright'
import { createServer } from 'vite'
import { readFile, mkdir } from 'node:fs/promises'
import assert from 'node:assert/strict'
const output='artifacts/ocean-estate-parity'
await mkdir(output,{recursive:true})
const server=await createServer({server:{host:'127.0.0.1',port:4173}})
await server.listen()
const browser=await chromium.launch({
  executablePath:process.env.ESTATE_CHROMIUM_PATH||undefined,
  headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader'],
})
try{
  const page=await browser.newPage({viewport:{width:915,height:412},deviceScaleFactor:1,acceptDownloads:true})
  const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto('http://127.0.0.1:4173/tests/ocean-estate-plan-preview.html')
  await page.locator('.ep-plan').waitFor()
  async function worldPoint(x,z){return page.evaluate(({x,z})=>{
    const p=new DOMPoint(-x,z).matrixTransform(document.querySelector('.ep-plan').getScreenCTM())
    return {x:p.x,y:p.y}
  },{x,z})}
  // Catch mirrored, stretched, or stale transforms with asymmetric real slabs.
  for(const [code,x,z] of [['P1',-19.43,-18.37],['P2',-13,-30],['P3',14,-30],['P4',-8,29],['P5',42,5],['P6',34,-20],['P7',-27,41]]){
    const p=await worldPoint(x,z);await page.mouse.click(p.x,p.y)
    await page.locator('.ep-selection-card').waitFor()
    assert.equal(await page.locator('.ep-selection-card>b').innerText(),code,`screen and scene agree on ${code}`)
    await page.locator('.ep-selection-card>button').click()
  }
  await page.getByRole('button',{name:'Zoom in'}).click()
  await page.getByRole('button',{name:'Zoom in'}).click()
  const zoomPoint=await worldPoint(-19.43,-18.37);await page.mouse.click(zoomPoint.x,zoomPoint.y)
  assert.equal(await page.locator('.ep-selection-card>b').innerText(),'P1','selection stays aligned after zoom')
  await page.locator('.ep-selection-card>button').click()
  await page.getByRole('button',{name:'Fit plan'}).click()
  const empty=await worldPoint(0,-30);await page.mouse.click(empty.x,empty.y)
  assert.equal(await page.locator('.ep-selection-card').count(),0,'pool water never selects an invented patio')
  await page.screenshot({path:`${output}/plan.png`})
  const downloadPromise=page.waitForEvent('download')
  await page.getByRole('button',{name:'Export plan'}).click()
  const download=await downloadPromise;await download.saveAs(`${output}/export.png`)
  const data=await readFile(`${output}/export.png`)
  const pixel=await page.evaluate(async data=>{
    const img=new Image();img.src=`data:image/png;base64,${data}`;await img.decode()
    const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height
    const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0)
    return [...ctx.getImageData(Math.round((19.43+48)/92*img.width),Math.round((-18.37+43)/96*img.height),1,1).data]
  },data.toString('base64'))
  assert.ok(Math.abs(pixel[0]-247)+Math.abs(pixel[1]-243)+Math.abs(pixel[2]-232)>30,`export must include the actual patio, got ${pixel}`)
  await page.getByRole('button',{name:/Draw/}).click()
  const start=await worldPoint(-19.43,-18.37),end=await worldPoint(-17.43,-17.37)
  await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:5});await page.mouse.up()
  const mark=await page.evaluate(()=>JSON.parse(localStorage.getItem('ocean-estate-plan-markups-v1'))[0])
  assert.ok(Math.abs(mark.points[0].x+19.43)<.01&&Math.abs(mark.points[0].y-18.37)<.01,'drawing is saved at its actual world coordinate')
  await page.getByRole('button',{name:/Pan/}).click()
  for(const viewport of [{width:412,height:915},{width:1440,height:960},{width:915,height:412}]){
    await page.setViewportSize(viewport)
    await page.waitForFunction(()=>{const c=document.querySelector('.ep-reality');return c.width===Math.round(c.clientWidth)})
    const p=await worldPoint(-19.43,-18.37);await page.mouse.click(p.x,p.y)
    assert.equal(await page.locator('.ep-selection-card>b').innerText(),'P1',`actual slab selection stays aligned at ${viewport.width}×${viewport.height}`)
    await page.locator('.ep-selection-card>button').click()
    const endpoint=await page.evaluate(()=>{
      const poly=[...document.querySelectorAll('.ep-plan polyline')].find(e=>e.getAttribute('stroke')==='#d34f4f')
      const first=poly.points.getItem(0),p=new DOMPoint(first.x,first.y).matrixTransform(poly.getScreenCTM())
      return {x:p.x,y:p.y}
    })
    assert.ok(Math.hypot(endpoint.x-p.x,endpoint.y-p.y)<1,'drawing stays on its patio after resizing')
  }
  await page.screenshot({path:`${output}/annotated-plan.png`})
  assert.deepEqual(errors,[])
  console.log('PASS: all seven patio screen picks, zoom/resize/drawing alignment, pool void, and actual estate in PNG export')
}finally{await browser.close();await server.close()}
