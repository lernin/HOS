import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { chromium } from 'playwright'

const baseUrl = process.env.LOGIQ_BASE_URL || 'http://127.0.0.1:4173'
const d3Source = readFileSync(new URL('../node_modules/d3/dist/d3.min.js', import.meta.url), 'utf8')
let browser

test.before(async () => { browser = await chromium.launch({ headless: true }) })
test.after(async () => { await browser?.close() })

async function contextForPhone() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await context.route('https://cdn.jsdelivr.net/npm/d3@7*', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: d3Source }))
  await context.route('https://jzaghifuhinkzzhiojre.supabase.co/rest/v1/rpc/**', async route => {
    const name = new URL(route.request().url()).pathname.split('/').pop()
    if (name === 'logiq_map_save') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify('11111111-1111-4111-8111-111111111111') })
    if (name === 'logiq_map_list') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    return route.fulfill({ status: 204, body: '' })
  })
  await context.addInitScript(() => {
    sessionStorage.setItem('logiq_lab_pin_v1', 'test-pin')
    for (const key of Object.keys(localStorage)) if (key.startsWith('logiq_working_lock_')) localStorage.removeItem(key)
  })
  return context
}

async function appFrame(page) {
  await page.goto(`${baseUrl}/logiq-v162-mobile/index.html`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app')
  let frame = null
  for (let i = 0; i < 50 && !frame; i += 1) {
    frame = page.frames().find(item => item.url().includes('/logiq-v161/')) || null
    if (!frame) await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.ok(frame, 'LOGiQ iframe should load')
  await frame.waitForSelector('g.node', { timeout: 10_000 })
  await frame.waitForFunction(() => document.querySelectorAll('g.node').length === 30, null, { timeout: 10_000 })
  return frame
}

async function nodeCenter(frame, name) {
  return frame.evaluate(value => {
    const node = Array.from(document.querySelectorAll('g.node')).find(element => element.textContent.includes(value))
    if (!node) return null
    const r = node.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }, name)
}

async function holdDrag(frame, sourceName, targetName, pointerId = 51) {
  const source = await nodeCenter(frame, sourceName)
  const target = await nodeCenter(frame, targetName)
  assert.ok(source && target, `missing drag endpoints ${sourceName} -> ${targetName}`)
  await frame.evaluate(({ source, pointerId }) => {
    const canvas = document.getElementById('canvas')
    canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch', pointerId, isPrimary: true, buttons: 1, clientX: source.x, clientY: source.y }))
  }, { source, pointerId })
  await new Promise(resolve => setTimeout(resolve, 340))
  await frame.evaluate(({ target, pointerId }) => {
    const canvas = document.getElementById('canvas')
    canvas.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true, pointerType: 'touch', pointerId, isPrimary: true, buttons: 1, clientX: target.x, clientY: target.y }))
  }, { target, pointerId })
  await new Promise(resolve => setTimeout(resolve, 80))
  await frame.evaluate(({ target, pointerId }) => {
    const canvas = document.getElementById('canvas')
    canvas.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerType: 'touch', pointerId, isPrimary: true, buttons: 0, clientX: target.x, clientY: target.y }))
  }, { target, pointerId })
  await new Promise(resolve => setTimeout(resolve, 700))
}

test('mobile v2 unlocks, zooms below 0.4 without snapping, and drag/reparents when unlocked', async () => {
  const context = await contextForPhone()
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const frame = await appFrame(page)

  const lock = frame.locator('#logiq-mobile-header .logiq-working-lock-btn')
  await lock.waitFor({ state: 'visible' })
  assert.equal(await lock.getAttribute('data-lock-state'), 'unlocked')
  assert.equal(await frame.evaluate(() => window.__logiqWorkingLocked), false)
  assert.equal(await frame.evaluate(() => window.eval('state.zoom.scaleExtent()[0]')), 0.02)

  await frame.evaluate(() => window.LOGiQBridge.fit())
  await new Promise(resolve => setTimeout(resolve, 1300))
  const fitted = await frame.evaluate(() => d3.zoomTransform(document.getElementById('canvas')).k)
  assert.ok(fitted < 0.4, `phone fit should be allowed below 0.4, got ${fitted}`)

  const targetScale = Math.max(0.02, fitted * 0.7)
  const zoomedOut = await frame.evaluate(target => {
    const canvas = document.getElementById('canvas')
    const before = d3.zoomTransform(canvas).k
    window.eval(`state.zoom.scaleTo(d3.select(document.getElementById('canvas')), ${target})`)
    return { before, after: d3.zoomTransform(canvas).k }
  }, targetScale)
  assert.ok(zoomedOut.after < zoomedOut.before, `zoom should continue outward from fit: ${JSON.stringify(zoomedOut)}`)
  assert.ok(zoomedOut.after < 0.4)

  await holdDrag(frame, 'Node 05', 'Node 03')
  assert.equal(await frame.evaluate(() => window.LOGiQBridge.getParentName('Node 05')), 'Node 03')

  await lock.tap()
  assert.equal(await lock.getAttribute('data-lock-state'), 'locked')
  assert.equal(await frame.evaluate(() => window.__logiqWorkingLocked), true)
  const beforeLocked = await frame.evaluate(() => window.LOGiQBridge.snapshot().tree)
  await holdDrag(frame, 'Node 06', 'Node 03', 52)
  const afterLocked = await frame.evaluate(() => window.LOGiQBridge.snapshot().tree)
  assert.deepEqual(afterLocked, beforeLocked, 'locked map must reject structural drag')

  await lock.tap()
  assert.equal(await lock.getAttribute('data-lock-state'), 'unlocked')
  assert.equal(await frame.evaluate(() => window.__logiqWorkingLocked), false)
  await holdDrag(frame, 'Node 06', 'Node 03', 53)
  assert.equal(await frame.evaluate(() => window.LOGiQBridge.getParentName('Node 06')), 'Node 03')

  assert.deepEqual(errors, [])
  await context.close()
})