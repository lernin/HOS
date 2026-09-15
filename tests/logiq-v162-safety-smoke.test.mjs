import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { chromium } from 'playwright'

const baseUrl = process.env.LOGIQ_BASE_URL || 'http://127.0.0.1:4173'
const d3Source = readFileSync(new URL('../node_modules/d3/dist/d3.min.js', import.meta.url), 'utf8')
let browser

test.before(async () => { browser = await chromium.launch({ headless: true }) })
test.after(async () => { await browser?.close() })

async function appFrame(page) {
  await page.goto(`${baseUrl}/logiq-v162-mobile/index.html`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app')
  await page.evaluate(() => { document.getElementById('app').src = '/logiq-v161/index.html' })
  let frame = null
  for (let i = 0; i < 50 && !frame; i += 1) {
    frame = page.frames().find(item => item.url().includes('/logiq-v161/index.html')) || null
    if (!frame) await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.ok(frame, 'LOGiQ iframe should load')
  await frame.waitForFunction(() => document.querySelectorAll('g.node').length === 30, null, { timeout: 10_000 })
  await frame.waitForFunction(() => !!window.LOGiQDragWatchdog && !!window.LOGiQOwnerDevice, null, { timeout: 5_000 })
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

test('owner device is remembered and browser focus loss cancels a latched branch drag exactly', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await context.route('https://cdn.jsdelivr.net/npm/d3@7*', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: d3Source }))
  await context.addInitScript(() => {
    sessionStorage.setItem('logiq_lab_pin_v1', 'owner-session-test')
    localStorage.removeItem('logiq_owner_device_pin_v1')
  })

  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const frame = await appFrame(page)

  assert.equal(await frame.evaluate(() => localStorage.getItem('logiq_owner_device_pin_v1')), 'owner-session-test')
  assert.equal(await frame.evaluate(() => window.LOGiQOwnerDevice.remembered()), true)
  assert.equal(await frame.locator('#logiq-pin-input').getAttribute('type'), 'text')
  assert.equal(await frame.locator('#logiq-pin-input').getAttribute('autocomplete'), 'off')

  const before = await frame.evaluate(() => window.LOGiQBridge.snapshot())
  const source = await nodeCenter(frame, 'Node 09')
  assert.ok(source, 'Node 09 should exist')

  await frame.evaluate(({ source }) => {
    const canvas = document.getElementById('canvas')
    canvas.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      pointerType: 'touch',
      pointerId: 91,
      isPrimary: true,
      buttons: 1,
      clientX: source.x,
      clientY: source.y,
    }))
  }, { source })
  await new Promise(resolve => setTimeout(resolve, 340))

  assert.equal(await frame.evaluate(() => !!document.getElementById('logiq-v2-branch-preview')), true, 'branch drag should latch before interruption')
  assert.equal(await frame.evaluate(() => window.__logiqV2DragActive), true)

  await frame.evaluate(() => window.dispatchEvent(new Event('blur')))
  await new Promise(resolve => setTimeout(resolve, 120))

  assert.equal(await frame.evaluate(() => !!document.getElementById('logiq-v2-branch-preview')), false, 'blur must remove branch preview')
  assert.equal(await frame.evaluate(() => document.body.classList.contains('v2-branch-drag')), false, 'blur must end branch-drag mode')
  assert.equal(await frame.evaluate(() => window.__logiqV2DragActive), false, 'blur must clear active drag flag')
  assert.equal(await frame.evaluate(() => window.LOGiQDragWatchdogLastCancel), 'blur')
  assert.deepEqual(await frame.evaluate(() => window.LOGiQBridge.snapshot()), before, 'interrupted drag must snap back without map mutation')
  assert.deepEqual(errors, [])

  await context.close()
})
