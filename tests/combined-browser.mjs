import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const base=process.env.ESTATE_PLAN_TEST_URL||'http://127.0.0.1:4173'
const browser=await chromium.launch({
  headless:true,
  args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader',
    '--enable-webgl','--enable-unsafe-swiftshader'],
})
try{
  const page=await browser.newPage({viewport:{width:900,height:580}})
  const errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(base+'/combined',{waitUntil:'domcontentloaded'})
  await page.locator('.combined-world[data-combined-world="estate"]').waitFor({timeout:45000})
  await page.getByRole('button',{name:'Estate menu'}).waitFor({timeout:100000})
  await page.locator('.oe-canvas').waitFor({timeout:15000})
  assert.equal(await page.locator('canvas').count(),1,'only one full-scene canvas runs at a time')
  await page.getByRole('button',{name:'Estate menu'}).click()
  await page.getByRole('button',{name:/Follow path to Woodland Walk/}).click()
  await page.locator('.combined-world[data-combined-world="woodland"]').waitFor({timeout:90000})
  await page.locator('.woodland canvas').waitFor({timeout:35000})
  assert.equal(await page.locator('canvas').count(),1,'Estate scene is released before Woodland is mounted')
  await page.getByRole('button',{name:/Return to Ocean Estate/}).first().click({timeout:30000})
  await page.locator('.combined-world[data-combined-world="estate"]').waitFor({timeout:90000})
  await page.locator('.oe-canvas').waitFor({timeout:35000})
  assert.equal(await page.locator('canvas').count(),1,'Woodland scene is released before Estate returns')
  assert.deepEqual(errors,[],'no uncaught browser errors while swapping')
  console.log('Combined Estate ⇄ Woodland one-renderer live transition: PASS')
}finally{
  await browser.close()
}
