import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { chromium } from 'playwright'

const baseUrl = process.env.LOGYQ_BASE_URL || process.env.LOGIQ_BASE_URL || 'http://127.0.0.1:4173'
const d3Source = readFileSync(new URL('../node_modules/d3/dist/d3.min.js', import.meta.url), 'utf8')
let browser

test.before(async () => {
  browser = await chromium.launch({ headless: true })
})

test.after(async () => {
  await browser?.close()
})

async function stubProduction(context, capture = []) {
  await context.route('https://jzaghifuhinkzzhiojre.supabase.co/**', async (route) => {
    capture.push({ url: route.request().url(), method: route.request().method() })
    await route.abort()
  })
}

async function newContext(options = {}) {
  const context = await browser.newContext(options)
  await context.route('https://cdn.jsdelivr.net/npm/d3@7*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: d3Source,
  }))
  await context.addInitScript(() => sessionStorage.setItem('logyq_lab_pin_v1', 'test-pin'))
  return context
}

async function waitForTree(page) {
  await page.waitForSelector('g.node', { timeout: 10_000 })
  await page.waitForFunction(() => document.querySelectorAll('g.node').length === 30)
}

function findNode(tree, name) {
  if (!tree) return null
  if (tree.name === name) return tree
  for (const child of tree.children || []) {
    const found = findNode(child, name)
    if (found) return found
  }
  return null
}

test('LOGYQ desktop boot preserves the 30-node tree, edit, undo, dock, and reparent', async () => {
  const requests = []
  const context = await newContext({ viewport: { width: 1440, height: 900 } })
  await stubProduction(context, requests)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logyq/index.html`, { waitUntil: 'networkidle' })
  await waitForTree(page)

  assert.equal(await page.locator('g.node').count(), 30)
  assert.equal(await page.locator('#saveBtn').count(), 0)
  assert.equal(await page.locator('#trash').isVisible(), true)
  assert.equal(await page.evaluate(() => typeof window.LOGYQBridge), 'object')
  assert.equal(await page.evaluate(() => window.LOGiQBridge), undefined)
  assert.equal(await page.evaluate(() => !!window.LOGYQBridge.core?.state && !!window.LOGYQBridge.core?.utils), true)
  assert.equal(await page.evaluate(() => typeof window.LOGYQBridge.core?.layout?.LabelWrap?.apply), 'function')
  assert.equal(await page.evaluate(() => typeof window.LOGYQBridge.core?.structure?.moveSelectedHorizontally), 'function')
  assert.equal(await page.evaluate(() => typeof window.LOGYQBridge.core?.camera?.centerOnSelected), 'function')
  assert.equal(await page.evaluate(() => document.body.classList.contains('logyq-mobile-v162')), false)

  assert.equal(await page.evaluate(() => window.LOGYQBridge.selectByName('Node 05')), true)
  await page.keyboard.press('e')
  const editor = page.locator('.node-edit-input')
  await editor.fill('Edited 05')
  await editor.press('Enter')
  await page.waitForFunction(() => document.querySelector('g.node.is-outlined')?.textContent.includes('Edited 05'))
  await page.waitForFunction(() => document.querySelector('.logiq-save-state')?.textContent === 'Saved', null, { timeout: 6000 })
  assert.equal(requests.length, 0)
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('logyq_maps_v1') || '[]'))
  assert.ok(Array.isArray(stored) && stored.some((row) => row?.tree))
  assert.equal(await page.evaluate(() => sessionStorage.getItem('logiq_lab_pin_v1')), null)

  await page.keyboard.press('u')
  await page.waitForFunction(() => Array.from(document.querySelectorAll('g.node')).some((node) => node.textContent.includes('Node 05')))

  await page.locator('#wordInput').fill('alpha, beta')
  await page.locator('#wordInput').press('Enter')
  assert.deepEqual(await page.locator('#Dock .chip').allTextContents(), ['alpha', 'beta'])

  await page.evaluate(() => document.activeElement?.blur())
  await page.keyboard.press('w')
  assert.equal(await page.locator('#Dock').evaluate((el) => el.classList.contains('dock-left')), true)
  await page.keyboard.press('w')
  assert.equal(await page.locator('#Dock').evaluate((el) => el.classList.contains('dock-hidden')), true)
  await page.keyboard.press('w')
  assert.equal(await page.locator('#Dock').evaluate((el) => el.classList.contains('dock-left') || el.classList.contains('dock-hidden')), false)
  await page.evaluate(() => window.LOGYQBridge.selectByName('Node 05'))
  const beforeNav = await page.evaluate(() => window.LOGYQBridge.getSelectedUid())
  await page.keyboard.press('ArrowRight')
  assert.notEqual(await page.evaluate(() => window.LOGYQBridge.getSelectedUid()), beforeNav)

  const source = page.locator('g.node').filter({ hasText: 'Node 05' })
  const target = page.locator('g.node').filter({ hasText: 'Node 03' })
  const sourceBox = await source.boundingBox()
  const targetBox = await target.boundingBox()
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(sourceBox.x + sourceBox.width / 2 + 10, sourceBox.y + sourceBox.height / 2 + 10, { steps: 4 })
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 14 })
  await page.waitForTimeout(180)
  await page.mouse.up()
  await page.waitForTimeout(650)
  assert.equal(await page.evaluate(() => window.LOGYQBridge.getParentName('Node 05')), 'Node 03')
  await page.keyboard.press('u')
  await page.waitForTimeout(500)
  assert.equal(await page.evaluate(() => window.LOGYQBridge.getParentName('Node 05')), 'Node 02')

  const countBeforeDelete = await page.locator('g.node').count()
  await page.evaluate(() => window.LOGYQBridge.selectByName('Node 30'))
  await page.keyboard.press('t')
  await page.waitForFunction((count) => document.querySelectorAll('g.node').length < count, countBeforeDelete)
  await page.keyboard.press('u')
  await page.waitForFunction((count) => document.querySelectorAll('g.node').length === count, countBeforeDelete)

  const beforeMix = await page.evaluate(() => window.LOGYQBridge.snapshot().tree)
  await page.locator('#mixBtn').click()
  await page.waitForTimeout(1300)
  assert.notDeepEqual(await page.evaluate(() => window.LOGYQBridge.snapshot().tree), beforeMix)
  await page.keyboard.press('u')
  await page.waitForTimeout(350)
  assert.deepEqual(await page.evaluate(() => window.LOGYQBridge.snapshot().tree), beforeMix)
  assert.ok(findNode(beforeMix, 'Node 01'))

  assert.deepEqual(errors, [])
  await context.close()
})

test('LOGYQ phone shell keeps Fit, hides Trash, and can edit a selected card', async () => {
  const context = await newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await stubProduction(context)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logyq/index.html`, { waitUntil: 'networkidle' })
  await waitForTree(page)

  assert.equal(await page.evaluate(() => window.LOGYQPreview?.gestures?.bindCanvas), undefined)
  assert.equal(await page.evaluate(() => typeof window.LOGYQPreview?.gestures?.bindV162), 'function')
  assert.equal(await page.evaluate(() => window.LOGYQPreview?.gestures?.constants?.HOLD_MS), 280)
  assert.equal(await page.evaluate(() => window.LOGYQPreview?.gestures?.constants?.DOUBLE_TAP_MS), 360)
  assert.equal(await page.evaluate(() => window.LOGYQPreview?.gestures?.constants?.FLICK_MIN), 52)
  assert.equal(await page.evaluate(() => document.body.classList.contains('logyq-mobile-v162')), true)
  assert.equal(await page.locator('#logiq-spawn-puck').count(), 0)
  assert.equal(await page.locator('#logiq-mobile-context').count(), 0)
  assert.equal(await page.locator('body > header').isVisible(), false)
  assert.equal(await page.locator('#logiq-mobile-header').count(), 1)
  assert.equal(await page.locator('#logiq-mobile-header').isVisible(), true)
  const headerBox = await page.locator('#logiq-mobile-header').boundingBox()
  assert.ok(headerBox, 'phone header should be laid out')
  assert.ok(headerBox.height <= 52, `phone header height ${headerBox.height} should stay compact`)
  assert.ok(headerBox.y <= 1, `phone header y ${headerBox.y} should sit at the top`)
  assert.equal(await page.locator('#trash').isVisible(), false)
  const canvasBox = await page.locator('svg#canvas').boundingBox()
  assert.ok(canvasBox, 'canvas should be laid out')
  assert.ok(canvasBox.width >= 388, `canvas width ${canvasBox.width} should fill the 390px phone viewport`)
  assert.ok(canvasBox.x <= 1, `canvas x ${canvasBox.x} should start at the left edge`)
  const zoomExtent = await page.evaluate(() => window.LOGYQBridge.core.state.zoom.scaleExtent())
  assert.deepEqual(zoomExtent, [0.02, 2.4])
  await page.evaluate(() => window.LOGYQBridge.selectByName('Node 05'))
  await page.evaluate(() => window.LOGYQBridge.editSelected())
  await page.locator('.node-edit-input').fill('Mobile 05')
  await page.locator('.node-edit-input').press('Enter')
  await page.waitForFunction(() => Array.from(document.querySelectorAll('g.node')).some((node) => node.textContent.includes('Mobile 05')))
  assert.deepEqual(errors, [])
  await context.close()
})

test('LOGYQ phone v162 flick creates a relative, hold latches drag, double-tap edits', async () => {
  const context = await newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await stubProduction(context)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logyq/index.html`, { waitUntil: 'networkidle' })
  await waitForTree(page)

  async function nodeCenter(name) {
    return page.evaluate((label) => {
      const node = Array.from(document.querySelectorAll('g.node')).find((element) => element.__data__?.data?.name === label)
      const rect = node.getBoundingClientRect()
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    }, name)
  }

  async function touch(type, x, y, pointerId = 41) {
    await page.evaluate(({ type, x, y, pointerId }) => {
      const canvas = document.getElementById('canvas')
      canvas.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerType: 'touch',
        pointerId,
        isPrimary: true,
        button: 0,
        buttons: type === 'pointerdown' || type === 'pointermove' ? 1 : 0,
        clientX: x,
        clientY: y,
        screenX: x,
        screenY: y,
      }))
    }, { type, x, y, pointerId })
  }

  const before = await page.locator('g.node').count()
  const flick = await nodeCenter('Node 10')
  await touch('pointerdown', flick.x, flick.y)
  await touch('pointerup', flick.x, flick.y + 70)
  await page.waitForFunction((count) => document.querySelectorAll('g.node').length > count, before)
  assert.equal(await page.locator('#logiq-voice-bar.is-visible').count(), 0)
  assert.equal(await page.evaluate(() => !!window.LOGYQPreview.app?.recorder), false)
  await page.waitForSelector('#logyq-v162-action.show')
  assert.equal(await page.locator('#logyq-v162-action').textContent(), 'MIC')
  assert.equal(await page.evaluate(() => !!window.LOGYQPreview.gestures.cardMic?.recorder), false)
  assert.equal(await page.evaluate(() => !!window.LOGYQPreview.gestures.cardMic?.actionUid), true)
  await page.waitForTimeout(400)

  const hold = await nodeCenter('Node 03')
  const holdCount = await page.locator('g.node').count()
  const originTransform = await page.evaluate(() => {
    const node = Array.from(document.querySelectorAll('g.node')).find((element) => element.__data__?.data?.name === 'Node 03')
    return node?.getAttribute('transform') || ''
  })
  await touch('pointerdown', hold.x, hold.y, 42)
  await page.waitForTimeout(320)
  assert.equal(await page.evaluate(() => document.body.classList.contains('v2-branch-drag')), true)
  assert.equal(await page.locator('#logyq-v162-branch-preview').count(), 1)
  assert.equal(await page.locator('g.node').count(), holdCount)
  const ghost = await page.evaluate(() => {
    const node = Array.from(document.querySelectorAll('g.node')).find((element) => element.__data__?.data?.name === 'Node 03')
    const other = Array.from(document.querySelectorAll('g.node.is-others'))[0]
    return {
      ghost: node?.classList.contains('v2-branch-origin-ghost'),
      transform: node?.getAttribute('transform') || '',
      otherOpacity: other ? getComputedStyle(other).opacity : '1',
      handed: window.LOGYQPreview.gestures.getHandedness(),
      offset: window.LOGYQPreview.gestures.fingerOffset(),
    }
  })
  assert.equal(ghost.ghost, true)
  assert.equal(ghost.transform, originTransform)
  assert.equal(ghost.otherOpacity, '1')
  assert.equal(ghost.handed, 'right')
  assert.deepEqual(ghost.offset, { x: 0, y: -(1.45 * 38) })
  assert.equal(await page.locator('#logyq-v162-branch-preview .v2-float-node').count(), 0)
  assert.equal(await page.locator('#logyq-v162-branch-preview g.node').count(), 1)
  assert.equal(await page.locator('#logyq-v162-branch-preview line').count(), 0)
  await touch('pointermove', hold.x + 4, hold.y + 4, 42)
  assert.equal(await page.locator('g.node').count(), holdCount)
  assert.equal(await page.evaluate(() => {
    const node = Array.from(document.querySelectorAll('g.node')).find((element) => element.__data__?.data?.name === 'Node 03')
    return node?.getAttribute('transform') || ''
  }), originTransform)
  await touch('pointerup', hold.x + 4, hold.y + 4, 42)
  await page.waitForFunction(() => !document.body.classList.contains('v2-branch-drag'))

  const edit = await nodeCenter('Node 08')
  const beforeEdit = await page.evaluate(() => {
    const t = window.d3.zoomTransform(document.getElementById('canvas'))
    return { x: t.x, y: t.y, k: t.k }
  })
  await touch('pointerdown', edit.x, edit.y, 43)
  await touch('pointerup', edit.x, edit.y, 43)
  await touch('pointerdown', edit.x, edit.y, 44)
  await touch('pointerup', edit.x, edit.y, 44)
  await page.waitForSelector('.node-edit-input')
  await page.waitForFunction(() => window.d3.zoomTransform(document.getElementById('canvas')).k >= 1.34)
  await page.locator('.node-edit-input').fill('Tapped 08')
  await page.locator('.node-edit-input').press('Enter')
  await page.waitForFunction(() => Array.from(document.querySelectorAll('g.node')).some((node) => node.textContent.includes('Tapped 08')))
  await page.waitForFunction((prev) => {
    const t = window.d3.zoomTransform(document.getElementById('canvas'))
    return Math.abs(t.k - prev.k) < 0.06 && Math.hypot(t.x - prev.x, t.y - prev.y) < 24
  }, beforeEdit)

  assert.deepEqual(errors, [])
  await context.close()
})
