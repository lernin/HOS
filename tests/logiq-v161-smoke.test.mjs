import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { chromium } from 'playwright'

const baseUrl = process.env.LOGIQ_BASE_URL || 'http://127.0.0.1:4173'
const mapId = '11111111-1111-4111-8111-111111111111'
const d3Source = readFileSync(new URL('../node_modules/d3/dist/d3.min.js', import.meta.url), 'utf8')
let browser

test.before(async () => {
  browser = await chromium.launch({ headless: true })
})

test.after(async () => {
  await browser?.close()
})

async function stubProduction(context, capture = []) {
  await context.route('https://jzaghifuhinkzzhiojre.supabase.co/rest/v1/rpc/**', async (route) => {
    const request = route.request()
    const name = new URL(request.url()).pathname.split('/').pop()
    const body = request.postDataJSON()
    capture.push({ name, body })
    if (name === 'logiq_map_save') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body.map_id || mapId) })
      return
    }
    if (name === 'logiq_map_list') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: mapId,
            name: 'Production map',
            tree: { name: 'Library root', children: [{ name: 'Library child' }] },
            word_bank: ['library word'],
            updated_at: '2026-09-13T12:00:00.000Z',
          },
        ]),
      })
      return
    }
    await route.fulfill({ status: 204, body: '' })
  })
}

async function newContext(options = {}) {
  const context = await browser.newContext(options)
  await context.route('https://cdn.jsdelivr.net/npm/d3@7*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: d3Source,
  }))
  await context.addInitScript(() => sessionStorage.setItem('logiq_lab_pin_v1', 'test-pin'))
  return context
}

async function waitForTree(page) {
  try {
    await page.waitForSelector('g.node', { timeout: 10_000 })
    await page.waitForFunction(() => document.querySelectorAll('g.node').length === 30)
  } catch (error) {
    const state = await page.evaluate(() => ({
      title: document.title,
      d3: typeof window.d3,
      body: document.body?.innerText?.slice(0, 300),
    }))
    throw new Error(`LOGiQ did not render: ${JSON.stringify(state)}`, { cause: error })
  }
}

async function selectByName(page, name) {
  const selected = await page.evaluate((value) => window.LOGiQBridge.selectByName(value), name)
  assert.equal(selected, true, `could not select ${name}`)
  await page.waitForFunction((value) => {
    const outlined = Array.from(document.querySelectorAll('g.node.is-outlined'))
    return outlined.some((node) => node.textContent.includes(value))
  }, name)
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

function childNames(tree, parentName) {
  return (findNode(tree, parentName)?.children || []).map((child) => child.name)
}

test('immutable legacy route loads and retains the known-good tree', async () => {
  const context = await newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logiq-v161-legacy/index.html`, { waitUntil: 'networkidle' })
  await waitForTree(page)

  assert.equal(await page.locator('g.node').count(), 30)
  assert.equal(await page.locator('#saveBtn').count(), 0)
  assert.equal(await page.locator('#trash').isVisible(), true)
  await page.locator('g.node').filter({ hasText: 'Node 05' }).click()
  await page.waitForSelector('g.node.is-outlined')
  assert.deepEqual(errors, [])
  await context.close()
})

test('desktop preview preserves legacy commands and autosaves through production RPC', async () => {
  const requests = []
  const context = await newContext({ viewport: { width: 1440, height: 900 } })
  await stubProduction(context, requests)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logiq-v161/index.html`, { waitUntil: 'networkidle' })
  await waitForTree(page)

  assert.equal(await page.locator('body > header').isVisible(), true)
  assert.equal(await page.locator('#logiq-mobile-header').isVisible(), false)
  assert.equal(await page.locator('#saveBtn').count(), 0)
  assert.equal(await page.locator('#trash').isVisible(), true)

  // Selection and editing.
  await selectByName(page, 'Node 05')
  await page.keyboard.press('e')
  const editor = page.locator('.node-edit-input')
  await editor.fill('Edited 05')
  await editor.press('Enter')
  await page.waitForFunction(() => document.querySelector('g.node.is-outlined')?.textContent.includes('Edited 05'))

  // Automatic save, with no manual Save control.
  await page.waitForFunction(() => document.querySelector('.logiq-save-state')?.textContent === 'Saved', null, { timeout: 6000 })
  assert.ok(requests.some((request) => request.name === 'logiq_map_save' && request.body.map_tree))

  // Undo rename.
  await page.keyboard.press('u')
  await page.waitForFunction(() => Array.from(document.querySelectorAll('g.node')).some((node) => node.textContent.includes('Node 05')))

  // Word Dock input.
  await page.locator('#wordInput').fill('alpha, beta')
  await page.locator('#wordInput').press('Enter')
  assert.deepEqual(await page.locator('#Dock .chip').allTextContents(), ['alpha', 'beta'])

  // Keyboard focus and horizontal navigation.
  await page.evaluate(() => document.activeElement?.blur())
  await page.evaluate(() => window.LOGiQBridge.selectByName('Node 05'))
  const beforeNav = await page.evaluate(() => window.LOGiQBridge.getSelectedUid())
  await page.keyboard.press('ArrowRight')
  const afterNav = await page.evaluate(() => window.LOGiQBridge.getSelectedUid())
  assert.notEqual(afterNav, beforeNav)
  await page.keyboard.press('a')
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'wordInput')
  await page.evaluate(() => document.activeElement?.blur())

  // Structural V-movement reorders siblings and Undo restores them.
  await page.evaluate(() => window.LOGiQBridge.selectByName('Node 05'))
  const beforeV = await page.evaluate(() => window.LOGiQBridge.snapshot().tree)
  await page.keyboard.down('v')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.up('v')
  await page.waitForTimeout(100)
  const afterV = await page.evaluate(() => window.LOGiQBridge.snapshot().tree)
  assert.notDeepEqual(childNames(afterV, 'Node 02'), childNames(beforeV, 'Node 02'))
  await page.keyboard.press('u')
  await page.waitForTimeout(900)

  // Drag/reparent and Undo.
  const source = page.locator('g.node').filter({ hasText: 'Node 05' })
  const target = page.locator('g.node').filter({ hasText: 'Node 03' })
  const sourceBox = await source.boundingBox()
  const targetBox = await target.boundingBox()
  assert.ok(sourceBox && targetBox)
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(sourceBox.x + sourceBox.width / 2 + 10, sourceBox.y + sourceBox.height / 2 + 10, { steps: 4 })
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 14 })
  await page.waitForTimeout(180)
  await page.mouse.up()
  await page.waitForTimeout(650)
  assert.equal(await page.evaluate(() => window.LOGiQBridge.getParentName('Node 05')), 'Node 03')
  await page.keyboard.press('u')
  await page.waitForTimeout(500)
  assert.equal(await page.evaluate(() => window.LOGiQBridge.getParentName('Node 05')), 'Node 02')

  // Trash/delete and Undo.
  const countBeforeDelete = await page.locator('g.node').count()
  await selectByName(page, 'Node 30')
  await page.keyboard.press('t')
  await page.waitForFunction((count) => document.querySelectorAll('g.node').length < count, countBeforeDelete)
  await page.keyboard.press('u')
  await page.waitForFunction((count) => document.querySelectorAll('g.node').length === count, countBeforeDelete)

  // Dock transfer and Undo.
  await selectByName(page, 'Node 30')
  const chipsBeforeDock = await page.locator('#Dock .chip').count()
  await page.keyboard.press('d')
  await page.waitForFunction((count) => document.querySelectorAll('#Dock .chip').length > count, chipsBeforeDock)
  await page.keyboard.press('u')

  // Mix, Undo, zoom, Fit, and Dock position shortcut.
  const beforeMix = await page.evaluate(() => window.LOGiQBridge.snapshot().tree)
  await page.locator('#mixBtn').click()
  await page.waitForTimeout(1300)
  const afterMix = await page.evaluate(() => window.LOGiQBridge.snapshot().tree)
  assert.notDeepEqual(afterMix, beforeMix)
  await page.keyboard.press('u')
  await page.waitForTimeout(350)
  assert.deepEqual(await page.evaluate(() => window.LOGiQBridge.snapshot().tree), beforeMix)

  await page.keyboard.press('z')
  await page.waitForTimeout(450)
  const zoomed = await page.evaluate(() => d3.zoomTransform(document.getElementById('canvas')).k)
  await page.keyboard.press('f')
  await page.waitForTimeout(1300)
  const fitted = await page.evaluate(() => d3.zoomTransform(document.getElementById('canvas')).k)
  assert.ok(Number.isFinite(zoomed) && Number.isFinite(fitted))
  await page.keyboard.press('w')
  assert.ok(await page.locator('#Dock').evaluate((element) => element.classList.contains('dock-left') || element.classList.contains('dock-hidden')))

  assert.deepEqual(errors, [])
  await context.close()
})

test('mobile preview provides on-demand controls, contextual actions, library, and offline retry', async () => {
  const requests = []
  const context = await newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await stubProduction(context, requests)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logiq-v161/index.html`, { waitUntil: 'networkidle' })
  await waitForTree(page)

  assert.equal(await page.locator('body > header').isVisible(), false)
  assert.equal(await page.locator('#logiq-mobile-header').isVisible(), true)
  assert.equal(await page.locator('#trash').isVisible(), false)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)

  // Unselected cards pass touches through to canvas pan/pinch. A short tap
  // selects one; only that selected card becomes draggable.
  const node05 = page.locator('g.node').filter({ hasText: 'Node 05' })
  let node05Box = await node05.boundingBox()
  assert.ok(node05Box)
  assert.equal(await node05.evaluate((node) => getComputedStyle(node).pointerEvents), 'none')

  const panBefore = await page.evaluate(() => ({ ...d3.zoomTransform(document.getElementById('canvas')) }))
  await page.evaluate(({ x, y }) => {
    const canvas = document.getElementById('canvas')
    const touch = (clientX, clientY) => new Touch({ identifier: 41, target: canvas, clientX, clientY, pageX: clientX, pageY: clientY })
    const start = touch(x, y)
    canvas.dispatchEvent(new TouchEvent('touchstart', { touches: [start], targetTouches: [start], changedTouches: [start], bubbles: true, cancelable: true }))
    const moved = touch(x + 55, y + 45)
    canvas.dispatchEvent(new TouchEvent('touchmove', { touches: [moved], targetTouches: [moved], changedTouches: [moved], bubbles: true, cancelable: true }))
    canvas.dispatchEvent(new TouchEvent('touchend', { touches: [], targetTouches: [], changedTouches: [moved], bubbles: true, cancelable: true }))
  }, { x: node05Box.x + node05Box.width / 2, y: node05Box.y + node05Box.height / 2 })
  await page.waitForTimeout(100)
  const panAfter = await page.evaluate(() => ({ ...d3.zoomTransform(document.getElementById('canvas')) }))
  assert.ok(panAfter.x !== panBefore.x || panAfter.y !== panBefore.y, 'canvas should pan when a gesture starts over an unselected card')

  node05Box = await node05.boundingBox()
  const tapX = node05Box.x + node05Box.width / 2
  const tapY = node05Box.y + node05Box.height / 2
  await page.locator('#canvas').dispatchEvent('pointerdown', { pointerId: 3, pointerType: 'touch', clientX: tapX, clientY: tapY, bubbles: true })
  await page.locator('#canvas').dispatchEvent('pointerup', { pointerId: 3, pointerType: 'touch', clientX: tapX, clientY: tapY, bubbles: true })
  await page.waitForFunction(() => document.querySelector('g.node.is-outlined')?.textContent.includes('Node 05'))
  assert.notEqual(await node05.evaluate((node) => getComputedStyle(node).pointerEvents), 'none')

  const target03 = page.locator('g.node').filter({ hasText: 'Node 03' })
  const selectedBox = await node05.boundingBox()
  const targetBox = await target03.boundingBox()
  assert.ok(selectedBox && targetBox)
  await page.mouse.move(selectedBox.x + selectedBox.width / 2, selectedBox.y + selectedBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(selectedBox.x + selectedBox.width / 2 + 10, selectedBox.y + selectedBox.height / 2 + 10, { steps: 4 })
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 14 })
  await page.waitForTimeout(180)
  await page.mouse.up()
  await page.waitForTimeout(650)
  assert.equal(await page.evaluate(() => window.LOGiQBridge.getParentName('Node 05')), 'Node 03')
  await page.evaluate(() => window.LOGiQBridge.undo())
  await page.waitForTimeout(500)

  await page.locator('#logiq-mobile-menu-btn').tap()
  await page.waitForSelector('#logiq-mobile-panel.is-open')
  await page.locator('#logiq-mobile-word-input').fill('mobile word')
  await page.locator('[data-tool="add"]').tap()
  assert.ok((await page.locator('#Dock .chip').allTextContents()).includes('mobile word'))

  await page.evaluate(() => window.LOGiQBridge.selectByName('Node 05'))
  await page.waitForSelector('#logiq-mobile-context.is-visible')
  const selectedBefore = await page.evaluate(() => window.LOGiQBridge.getSelectedUid())
  await page.locator('[data-action="right"]').tap()
  assert.notEqual(await page.evaluate(() => window.LOGiQBridge.getSelectedUid()), selectedBefore)

  await page.evaluate(() => window.LOGiQBridge.selectByName('Node 05'))
  await page.locator('[data-action="edit"]').tap()
  await page.locator('.node-edit-input').fill('Mobile 05')
  await page.locator('.node-edit-input').press('Enter')
  await page.waitForFunction(() => Array.from(document.querySelectorAll('g.node')).some((node) => node.textContent.includes('Mobile 05')))

  await page.locator('#logiq-mobile-menu-btn').tap()
  await page.locator('[data-tool="library"]').tap()
  await page.waitForSelector('#logiq-library.is-open')
  await page.waitForFunction(() => document.querySelector('#logiq-map-list')?.textContent.includes('Production map'))
  assert.ok(requests.some((request) => request.name === 'logiq_map_list'))
  await page.locator('#logiq-library-close').tap()

  // A real offline transition stores the changed snapshot for retry.
  await context.setOffline(true)
  await page.evaluate(() => window.LOGiQBridge.selectByName('Node 06'))
  await page.locator('[data-action="edit"]').tap()
  await page.locator('.node-edit-input').fill('Offline 06')
  await page.locator('.node-edit-input').press('Enter')
  await page.waitForFunction(() => Array.from(document.querySelectorAll('.logiq-save-state')).some((element) => element.textContent === 'Offline'))
  assert.equal(await page.evaluate(() => !!localStorage.getItem('logiq_v161_pending_save_v1')), true)
  await context.setOffline(false)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await page.waitForFunction(() => Array.from(document.querySelectorAll('.logiq-save-state')).some((element) => element.textContent === 'Saved'), null, { timeout: 6000 })

  assert.deepEqual(errors, [])
  await context.close()
})

test('landscape phone shell stays compact and keeps Fit available without a trash target', async () => {
  const context = await newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true })
  await stubProduction(context)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logiq-v161/index.html`, { waitUntil: 'networkidle' })
  await waitForTree(page)

  assert.equal(await page.locator('body > header').isVisible(), false)
  assert.ok((await page.locator('#logiq-mobile-header').boundingBox()).height <= 48)
  assert.equal(await page.locator('#logiq-mobile-header').getByText('Logged in as Ashley').count(), 0)
  assert.equal(await page.locator('#trash').isVisible(), false)
  await page.evaluate(() => document.body.classList.add('global-no-cursor'))
  assert.equal(await page.locator('#trash').isVisible(), false)

  await page.keyboard.press('z')
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'Recenter map' }).tap()
  await page.waitForTimeout(1300)
  assert.ok(Number.isFinite(await page.evaluate(() => d3.zoomTransform(document.getElementById('canvas')).k)))
  assert.deepEqual(errors, [])
  await context.close()
})

test('phone shell survives a desktop-like 980px mobile viewport', async () => {
  const context = await newContext({ viewport: { width: 980, height: 1743 }, isMobile: true, hasTouch: true })
  await stubProduction(context)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logiq-v161/index.html`, { waitUntil: 'networkidle' })
  await waitForTree(page)

  assert.equal(await page.locator('body > header').isVisible(), false)
  assert.equal(await page.locator('#logiq-mobile-header').isVisible(), true)
  assert.equal(await page.locator('#trash').isVisible(), false)
  assert.match(await page.locator('#logiq-mobile-header img').getAttribute('src'), /^\/logiq-v161\/logos\//)
  assert.deepEqual(errors, [])
  await context.close()
})

test('selected-card spawn gesture creates a child and voice names it', async () => {
  const context = await newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await context.addInitScript(() => {
    class FakeRecorder extends EventTarget {
      constructor(stream) { super(); this.stream = stream; this.state = 'inactive'; this.mimeType = 'audio/webm' }
      start() { this.state = 'recording' }
      stop() {
        this.state = 'inactive'
        this.dispatchEvent(new MessageEvent('dataavailable', { data: new Blob(['voice'], { type: this.mimeType }) }))
        this.dispatchEvent(new Event('stop'))
      }
    }
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } })
    Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: FakeRecorder })
  })
  await stubProduction(context)
  await context.route('**/api/transcribe', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: 'Spoken puppy' }) }))
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logiq-v161/index.html`, { waitUntil: 'networkidle' })
  await waitForTree(page)

  await page.evaluate(() => window.LOGiQBridge.selectByName('Node 05'))
  await page.waitForSelector('#logiq-spawn-puck.is-visible')
  const puck = await page.locator('#logiq-spawn-puck').boundingBox()
  assert.ok(puck)
  const x = puck.x + puck.width / 2
  const y = puck.y + puck.height / 2
  await page.locator('#logiq-spawn-puck').dispatchEvent('pointerdown', { pointerId: 7, pointerType: 'touch', clientX: x, clientY: y, bubbles: true })
  await page.locator('#logiq-spawn-puck').dispatchEvent('pointermove', { pointerId: 7, pointerType: 'touch', clientX: x, clientY: y + 70, bubbles: true })
  await page.locator('#logiq-spawn-puck').dispatchEvent('pointerup', { pointerId: 7, pointerType: 'touch', clientX: x, clientY: y + 70, bubbles: true })
  await page.waitForSelector('#logiq-voice-bar.is-visible')
  await page.getByRole('button', { name: 'Stop' }).tap()
  await page.waitForFunction(() => {
    const visit = (node) => node?.name === 'Spoken puppy' || (node?.children || []).some(visit)
    return visit(window.LOGiQBridge.snapshot().tree)
  })
  assert.equal(await page.evaluate(() => window.LOGiQBridge.getParentName('Spoken puppy')), 'Node 05')

  // The other flick directions reuse the proven v161 Shift+I/J/L semantics.
  assert.equal(await page.evaluate(() => {
    LOGiQBridge.selectByName('Node 06')
    const uid = LOGiQBridge.createRelative('left')
    return LOGiQBridge.renameNode(uid, 'Older sibling') && LOGiQBridge.getParentName('Older sibling')
  }), 'Node 02')
  await page.evaluate(() => { LOGiQBridge.undo(); LOGiQBridge.undo() })
  assert.equal(await page.evaluate(() => {
    LOGiQBridge.selectByName('Node 06')
    const uid = LOGiQBridge.createRelative('right')
    return LOGiQBridge.renameNode(uid, 'Younger sibling') && LOGiQBridge.getParentName('Younger sibling')
  }), 'Node 02')
  await page.evaluate(() => { LOGiQBridge.undo(); LOGiQBridge.undo() })
  assert.equal(await page.evaluate(() => {
    LOGiQBridge.selectByName('Node 06')
    const uid = LOGiQBridge.createRelative('up')
    LOGiQBridge.renameNode(uid, 'Intermediate parent')
    return LOGiQBridge.getParentName('Node 06')
  }), 'Intermediate parent')
  assert.deepEqual(errors, [])
  await context.close()
})
