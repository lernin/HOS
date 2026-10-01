Warning: truncated output (original token count: 99410)
Total output lines: 8077

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { chromium } from 'playwright'

const baseUrl = process.env.LOGYQ_BASE_URL || process.env.LOGIQ_BASE_URL || 'http://127.0.0.1:4173'
const d3Source = readFileSync(new URL('../node_modules/d3/dist/d3.min.js', import.meta.url), 'utf8')
let browser

test.before(async () => {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.LOGYQ_EXECUTABLE_PATH ? { executablePath: process.env.LOGYQ_EXECUTABLE_PATH } : {}),
    ...(process.env.LOGYQ_CHROME ? { channel: 'chrome' } : {}),
  })
})

test.after(async () => {
  await browser?.close()
})

function rpcFromRequest(route) {
  const url = route.request().url()
  let posted = {}
  try { posted = route.request().postDataJSON() || {} } catch (_error) {}
  if (url.includes('/api/logyq-maps')) {
    const args = posted.args && typeof posted.args === 'object' ? posted.args : {}
    return { name: posted.name || '', body: args, url, method: route.request().method() }
  }
  const name = url.includes('/rpc/') ? url.split('/rpc/')[1].split('?')[0] : ''
  return { name, body: posted, url, method: route.request().method() }
}

async function fulfillMapRpc(route, { store, capture, acceptPin, listBody }) {
  const request = rpcFromRequest(route)
  const { name, body } = request
  capture.push(request)
  if (acceptPin && Object.prototype.hasOwnProperty.call(body, 'pin') && body.pin !== acceptPin && ['logiq_map_list', 'logiq_map_save', 'logiq_map_delete'].includes(name)) {
    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Wrong Lab password', code: '28000' }),
    })
    return
  }
  if (name === 'logiq_map_list' && listBody) {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(listBody) })
    return
  }
  if (name === 'logiq_map_list') {
    const rows = store.maps.slice().sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) })
    return
  }
  if (name === 'logiq_map_save') {
    const id = body.map_id || `map-${store.maps.length + 1}`
    const row = {
      id,
      name: body.map_name,
      tree: body.map_tree,
      word_bank: body.map_word_bank,
      updated_at: new Date().toISOString(),
    }
    const index = store.maps.findIndex((item) => item.id === id)
    if (index >= 0) store.maps[index] = { ...store.maps[index], ...row }
    else store.maps.unshift(row)
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(id) })
    return
  }
  if (name === 'logiq_map_delete') {
    store.maps = store.maps.filter((item) => item.id !== body.map_id)
    await route.fulfill({ status: 200, contentType: 'application/json', body: 'null' })
    return
  }
  await route.fulfill({ status: 404, body: 'not found' })
}

async function stubMaps(context, { maps = [], capture = [], acceptPin = null, listBody = null } = {}) {
  const store = { maps: maps.map((row) => ({ ...row })) }
  const options = { store, capture, acceptPin, listBody }
  const handle = (route) => fulfillMapRpc(route, options)
  await context.route('**/api/logyq-maps', handle)
  await context.route('https://jzaghifuhinkzzhiojre.supabase.co/**', handle)
  return store
}

async function newContext(options = {}) {
  const { pin = 'test-pin', ...browserOptions } = options
  const context = await browser.newContext(browserOptions)
  await context.route('https://cdn.jsdelivr.net/npm/d3@7*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: d3Source,
  }))
  if (pin != null) await context.addInitScript((value) => sessionStorage.setItem('logyq_lab_pin_v1', value), pin)
  return context
}

async function waitForBoot(page) {
  await page.waitForFunction(() => window.LOGYQPreview?.app?.booted === true, null, { timeout: 10_000 })
}

async function waitForTree(page) {
  await page.waitForSelector('g.node', { timeout: 10_000 })
  await page.waitForFunction(() => document.querySelectorAll('g.node').length === 30)
}

async function loadSampleTree(page) {
  await page.evaluate(() => {
    window.LOGYQPreview.app.hasOpenMap = true
    document.body.classList.add('logyq-map-open')
    document.body.classList.remove('logyq-home')
    const library = document.getElementById('logiq-library')
    library?.classList.remove('is-open')
    library?.setAttribute('aria-hidden', 'true')
    window.LOGYQBridge.core.editing.closeNodeEditor(false, false)
    const tree = window.LOGYQBridge.core.data.generateTree(30)
    window.LOGYQBridge.loadMap(tree, [])
    const snap = window.LOGYQBridge.snapshot()
    window.LOGYQPreview.app.lastSnapshot = JSON.stringify({
      tree: snap.tree,
      word_bank: Array.isArray(snap.wordBank) ? snap.wordBank : [],
    })
  })
  await waitForTree(page)
  await page.waitForFunction(() => document.querySelectorAll('.node-edit-input').length === 0)
  await page.waitForFunction(() => {
    const live = window.LOGYQBridge.core.state.root?.descendants().length || 0
    return live === 30 && document.querySelectorAll('svg#canvas g.nodes g.node').length === 30
  })
  await page.waitForTimeout(450)
}

async function assertNoChooser(page) {
  assert.equal(await page.locator('.logyq-chooser, .logyq-choice-card').count(), 0)
  assert.equal(await page.evaluate(() => /New map OR/i.test(document.body.innerText)), false)
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
  await stubMaps(context, { maps: [], capture: requests })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logyq/index.html`, { waitUntil: 'networkidle' })
  await waitForBoot(page)
  await assertNoChooser(page)
  assert.equal(await page.locator('#logiq-library.is-open').count(), 1)
  assert.equal(await page.locator('.node-edit-input').count(), 0)
  assert.ok(requests.every((request) => request.name !== 'logiq_map_save'))
  await loadSampleTree(page)

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
  assert.ok(requests.some((request) => request.name === 'logiq_map_list'))
  assert.ok(requests.some((request) => request.name === 'logiq_map_save' && request.body?.map_tree?.formatVersion === 2))
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
  await stubMaps(context)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logyq/index.html`, { waitUntil: 'networkidle' })
  await waitForBoot(page)
  await loadSampleTree(page)
  await page.waitForTimeout(700)

  assert.equal(await page.evaluate(() => window.LOGYQPreview?.gestures?.bindCanvas), undefined)
  assert.equal(await page.evaluate(() => typeof window.LOGYQPreview?.gestures?.bindV162), 'function')
  assert.equal(await page.evaluate(() => window.LOGYQPreview?.gestures?.constants?.HOLD_MS), 160)
  assert.equal(await page.evaluate(() => window.LOGYQPreview?.gestures?.constants?.DOUBLE_TAP_MS), 360)
  assert.equal(await page.evaluate(() => window.LOGYQPreview?.gestures?.constants?.FLICK_MIN), 52)
  assert.equal(await page.evaluate(() => document.body.classList.contains('logyq-mobile-v162')), true)
  assert.equal(await page.locator('#logiq-spawn-puck').count(), 0)
  assert.equal(await page.locator('#logiq-mobile-context').count(), 0)
  assert.equal(await page.locator('body > header').isVisible(), false)
  assert.equal(await page.locator('#logiq-mobile-header').count(), 1)
  assert.equal(await page.locator('#logiq-mobile-header').isVisible(), true)
  assert.equal(await page.locator('#logyq-select-strip').isVisible(), false)
  assert.equal(await page.locator('#logiq-mobile-word-input').isVisible(), false)
  assert.equal(await page.locator('#logiq-mobile-mic-btn').isVisible(), false)
  assert.equal(await page.locator('#logyq-home-btn').isVisible(), true)
  assert.equal(await page.locator('#logyq-paint-btn').isVisible(), true)
  const headerBox = await page.locator('#logiq-mobile-header').boundingBox()
  assert.ok(headerBox, 'portrait header should be laid out')
  assert.ok(headerBox.height <= 52, `portrait header height ${headerBox.height} should stay compact`)
  assert.ok(headerBox.y <= 1, `portrait header y ${headerBox.y} should sit at the top`)
  assert.ok(headerBox.width >= 380, `portrait header width ${headerBox.width} should span the phone`)
  assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('logiq-mobile-header')).display), 'flex')
  assert.equal(await page.locator('#trash').isVisible(), false)
  assert.equal(await page.evaluate(() => {
    const boot = document.getElementById('logyq-phone-boot')?.textContent || ''
    return /#trash\s*\{[^}]*display\s*:\s*none\s*!important/.test(boot)
  }), true)
  assert.equal(await page.evaluate(() => {
    document.getElementById('logyq-preview-styles')?.remove()
    const trash = document.getElementById('trash')
    const style = trash ? getComputedStyle(trash) : null
    return !!(style && style.display === 'none' && style.visibility === 'hidden')
  }), true, 'trash must stay hidden from first-paint CSS after preview styles are removed')
  const canvasBox = await page.locator('svg#canvas').boundingBox()
  assert.ok(canvasBox, 'canvas should be laid out')
  assert.ok(canvasBox.width >= 388, `canvas width ${canvasBox.width} should fill the 390px phone viewport`)
  assert.ok(canvasBox.x <= 1, `canvas x ${canvasBox.x} should start at the left edge`)
  const fit = await page.evaluate(() => {
    const canvas = document.getElementById('canvas').getBoundingClientRect()
    const nodes = Array.from(document.querySelectorAll('svg#canvas g.node')).map((node) => node.getBoundingClientRect())
    const left = Math.min(...nodes.map((box) => box.left))
    const right = Math.max(...nodes.map((box) => box.right))
    return {
      canvas: canvas.width,
      tree: right - left,
      mid: (left + right) / 2,
      cx: canvas.left + canvas.width / 2,
    }
  })
  assert.ok(fit.tree >= fit.canvas * 0.8, `tree width ${fit.tree} should fill most of canvas ${fit.canvas}`)
  assert.ok(Math.abs(fit.mid - fit.cx) < fit.canvas * 0.12, `tree mid ${fit.mid} should be near canvas center ${fit.cx}`)
  const zoomExtent = await page.evaluate(() => window.LOGYQBridge.core.state.zoom.scaleExtent())
  assert.deepEqual(zoomExtent, [0.02, 2.4])
  const editUid = await page.evaluate(() => {
    window.LOGYQBridge.selectByName('Node 05')
    return window.LOGYQBridge.getSelectedUid()
  })
  await page.evaluate((uid) => window.LOGYQBridge.editSelected({ uid }), editUid)
  await page.locator('.node-edit-input').fill('Mobile 05')
  await page.locator('.node-edit-input').press('Enter')
  await page.waitForFunction(() => Array.from(document.querySelectorAll('g.node')).some((node) => node.textContent.includes('Mobile 05')))
  assert.deepEqual(errors, [])
  await context.close()
})

test('LOGYQ Game shell stays interactive through pause, resume, and return to levels', async () => {
  const context = await newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await stubMaps(context)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logyq/index.html`, { waitUntil: 'networkidle' })
  await waitForBoot(page)
  await page.locator('#logyq-tab-game').click()
  await page.locator('#logyq-game-path [data-game-level]').first().click()
  await page.waitForFunction(() => document.body.classList.contains('logyq-game'))
  await page.waitForSelector('svg#canvas g.node')

  assert.equal(await page.locator('#logyq-game-bar #logyq-game-back').isVisible(), true)
  assert.equal(await page.locator('#logyq-game-bar #logyq-game-pause').isVisible(), true)
  assert.match(await page.locator('#logyq-game-puzzle').textContent(), /^Puzzle 1$/)
  assert.equal(await page.locator('#logyq-game-check').isVisible(), false)

  await page.locator('#logyq-game-pause').click()
  assert.equal(await page.locator('#logyq-game-pause-panel').isVisible(), true)
  await page.locator('#logyq-game-resume').click()
  assert.equal(await page.locator('#logyq-game-pause-panel').isVisible(), false)
  assert.ok(await page.locator('svg#canvas g.node').count() > 0, 'board remains available after resume')

  await page.locator('#logyq-game-back').click()
  await page.waitForFunction(() => document.body.classList.contains('logyq-home'))
  assert.equal(await page.locator('#logyq-tab-game').isVisible(), true)
  assert.deepEqual(errors, [])
  await context.close()
})

test('LOGYQ phone v162 flick creates a relative, hold latches drag, double-tap edits', async () => {
  const context = await newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await stubMaps(context)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logyq/index.html`, { waitUntil: 'networkidle' })
  await waitForBoot(page)
  await loadSampleTree(page)

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
  const flickView = await page.evaluate(() => {
    const t = window.d3.zoomTransform(document.getElementById('canvas'))
    return { x: t.x, y: t.y, k: t.k }
  })
  await touch('pointerdown', flick.x, flick.y)
  await touch('pointermove', flick.x, flick.y + 36)
  await touch('pointermove', flick.x, flick.y + 70)
  const flickMid = await page.evaluate(() => {
    const t = window.d3.zoomTransform(document.getElementById('canvas'))
    return { x: t.x, y: t.y, drag: document.body.classList.contains('v2-branch-drag') }
  })
  assert.equal(flickMid.drag, false)
  assert.ok(Math.hypot(flickMid.x - flickView.x, flickMid.y - flickView.y) < 2, `flick stroke must not pan, before=${flickView.x},${flickView.y} mid=${flickMid.x},${flickMid.y}`)
  await touch('pointerup', flick.x, flick.y + 70)
  await page.waitForFunction((count) => document.querySelectorAll('g.node').length > count, before)
  const flickAfter = await page.evaluate(() => {
    const t = window.d3.zoomTransform(document.getElementById('canvas'))
    return { x: t.x, y: t.y }
  })
  assert.ok(Math.hypot(flickAfter.x - flickView.x, flickAfter.y - flickView.y) < 2, 'flick create must leave the camera where it was')
  assert.equal(await page.locator('#logiq-voice-bar.is-visible').count(), 0)
  assert.equal(await page.evaluate(() => !!window.LOGYQPreview.app?.recorder), false)
  assert.equal(await page.locator('#logyq-v162-action.show').count(), 0)
  assert.equal(await page.evaluate(() => !!window.LOGYQPreview.gestures.cardMic?.recorder), false)
  assert.equal(await page.evaluate(() => !!window.LOGYQPreview.gestures.cardMic?.actionUid), false)
  const flickEdit = await page.evaluate((prev) => {
    const t = window.d3.zoomTransform(document.getElementById('canvas'))
    return {
      editors: document.querySelectorAll('.node-edit-input').length,
      editing: window.LOGYQBridge.core.state.editingUid,
      selected: window.LOGYQBridge.core.state.selectedUid,
      k: t.k,
      x: t.x,
      y: t.y,
    }
  }, flickView)
  assert.equal(flickEdit.editors, 0, 'flick-create must not open the rename bar')
  assert.equal(flickEdit.editing, null)
  assert.ok(flickEdit.selected)
  assert.ok(Math.abs(flickEdit.k - flickView.k) < 0.02, 'create must not zoom')
  assert.ok(Math.hypot(flickEdit.x - flickView.x, flickEdit.y - flickView.y) < 2, 'create must not pan')
  await page.waitForTimeout(400)

  const panCard = await nodeCenter('Node 12')
  const panOrigin = await page.evaluate(() => {
    const node = Array.from(document.querySelectorAll('g.node')).find((element) => element.__data__?.data?.name === 'Node 12')
    const t = window.d3.zoomTransform(document.getElementById('canvas'))
    return {
      transform: node?.getAttribute('transform') || '',
      x: t.x,
      y: t.y,
      nodes: document.querySelectorAll('g.node').length,
    }
  })
  await touch('pointerdown', panCard.x, panCard.y, 81)
  // Slow 1:1 diagonal: under the flick speed and under ratio 1.45, so the
  // map pans after 48ms. A fast or axis-aligned stroke stays flick-gated.
  for (const step of [10, 22, 34, 46, 58, 74, 92]) {
    await page.waitForTimeout(90)
    await touch('pointermove', panCard.x + step, panCard.y + step, 81)
  }
  assert.equal(await page.evaluate(() => document.body.classList.contains('v2-branch-drag')), false, 'slow slide must not lift the card')
  const panDuring = await page.evaluate(() => {
    const node = Array.from(document.querySelectorAll('g.node')).find((element) => element.__data__?.data?.name === 'Node 12')
    const t = window.d3.zoomTransform(document.getElementById('canvas'))
    return {
      drag: document.body.classList.contains('v2-branch-drag'),
      transform: node?.getAttribute('transform') || '',
      x: t.x,
      y: t.y,
    }
  })
  assert.equal(panDuring.drag, false)
  assert.equal(panDuring.transform, panOrigin.transform, 'card stays put while the map pans')
  assert.ok(Math.hypot(panDuring.x - panOrigin.x, panDuring.y - panOrigin.y) > 40, `map should follow a diagonal card slide, before=${panOrigin.x},${panOrigin.y} during=${panDuring.x},${panDuring.y}`)
  await touch('pointerup', panCard.x + 92, panCard.y + 92, 81)
  const panAfter = await page.evaluate(() => {
    const t = window.d3.zoomTransform(document.getElementById('canvas'))
    return { x: t.x, y: t.y, nodes: document.querySelectorAll('g.node').length }
  })
  assert.equal(panAfter.nodes, panOrigin.nodes, 'sustained card slide is not a flick-create')
  assert.ok(Math.hypot(panAfter.x - panOrigin.x, panAfter.y - panOrigin.y) > 40, 'card-start pan must stick after release')

  const hold = await nodeCenter('Node 03')
  const holdCount = await page.locator('svg#canvas g.node').count()
  const bankBefore = await page.locator('#Dock .chip').count()
  const bankWordsBefore = await page.evaluate(() => (window.LOGYQBridge.core.state.wordBank || []).slice())
  const originTransform = await page.evaluate(() => {
    const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((element) => element.__data__?.data?.name === 'Node 03')
    return node?.getAttribute('transform') || ''
  })
  const slotBefore = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('svg#canvas g.node'))
    const held = nodes.find((element) => element.__data__?.data?.name === 'Node 03')
    const kids = held?.__data__?.parent?.children || []
    return {
      uid: held?.__data__?.data?._uid || '',
      x: held?.__data__?.x ?? null,
      y: held?.__data__?.y ?? null,
      inTree: !!(held?.__data__?.data?._uid && window.LOGYQBridge.core.state.root.descendants()
        .some((item) => item.data?._uid === held.__data__.data._uid)),
      row: kids.map((child) => {
        const node = nodes.find((element) => element.__data__?.data?._uid === child.data._uid)
        return {
          name: child.data.name,
          uid: child.data._uid,
          x: child.x,
          y: child.y,
          transform: node?.getAttribute('transform') || '',
        }
      }),
    }
  })
  const beforeHold = await page.evaluate(() => {
    const t = window.d3.zoomTransform(document.getElementById('canvas'))
    return { x: t.x, y: t.y, k: t.k }
  })
  await touch('pointerdown', hold.x, hold.y, 42)
  await page.waitForTimeout(320)
  assert.equal(await page.evaluate(() => document.body.classList.contains('v2-branch-drag')), true)
  assert.equal(await page.locator('#logyq-v162-branch-preview').count(), 1)
  assert.equal(await page.locator('svg#canvas g.node').count(), holdCount)
  const ghost = await page.evaluate(() => {
    const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((element) => element.__data__?.data?.name === 'Node 03')
    const other = Array.from(document.querySelectorAll('svg#canvas g.node.is-others'))[0]
    const t = window.d3.zoomTransform(document.getElementById('canvas'))
    return {
      ghost: node?.classList.contains('v2-branch-origin-ghost'),
      transform: node?.getAttribute('transform') || '',
      otherOpacity: other ? getComputedStyle(other).opacity : '1',
      offset: window.LOGYQPreview.gestures.fingerOffset(),
      lift: window.LOGYQPreview.gestures.liftPx(),
      previewTransform: document.getElementById('logyq-v162-branch-preview')?.style.transform || '',
      previewOpacity: getComputedStyle(document.getElementById('logyq-v162-branch-preview')).opacity,
      y: t.y,
    }
  })
  assert.equal(ghost.ghost, true)
  assert.equal(ghost.transform, originTransform)
  assert.equal(ghost.otherOpacity, '1')
  const D = 1.1 * 38
  assert.equal(ghost.lift, D)
  assert.deepEqual(ghost.offset, { x: 0, y: -D })
  assert.ok(Math.abs(ghost.y - beforeHold.y) < 2, `map must stay put on latch, before=${beforeHold.y} during=${ghost.y}`)
  assert.match(ghost.previewTransform, /translate3d\(/)
  assert.equal(ghost.previewOpacity, '0.55', 'map-card drag ghost uses the Word Bank chip opacity')
  const previewY = Number((ghost.previewTransform.match(/translate3d\([^,]+,\s*([-0-9.]+)px/) || [])[1])
  assert.ok(Number.isFinite(previewY) && Math.abs(previewY - (-D)) < 2, `floating card should pop north by 1.1cm, transform=${ghost.previewTransform}`)
  assert.equal(await page.locator('#logyq-v162-branch-preview .v2-float-node').count(), 0)
  assert.equal(await page.locator('#logyq-v162-branch-preview g.node').count(), 1)
  assert.equal(await page.locator('#logyq-v162-branch-preview line').count(), 0)
  const ghostPick = await page.evaluate(() => {
    const byName = (label) => Array.from(document.querySelectorAll('svg#canvas g.node')).find((element) => element.__data__?.data?.name === label)
    const held = byName('Node 03')?.__data__
    const other = byName('Node 05')?.__data__
    const CONFIG = window.LOGYQBridge.core.config
    const pick = window.LOGYQBridge.core.detectors.pick
    const origin = held?.data?._uid || ''
    const originSet = new Set((held?.descendants?.() || []).map((item) => item.data?._uid).filter(Boolean))
    const row = Array.from(document.querySelectorAll('svg#canvas g.node'))
      .map((element) => element.__data__)
      .filter((node) => node && node.depth === held.depth)
      .sort((a, b) => a.x - b.x)
    const heldIndex = row.findIndex((node) => node.data?._uid === origin)
    const neighbor = row[heldIndex + 1] || row[heldIndex - 1] || other
    const childRow = Array.from(document.querySelectorAll('svg#canvas g.node'))
      .map((element) => element.__data__)
      .filter((node) => node && node.depth === (held.depth || 0) + 1)
      .sort((a, b) => a.x - b.x)
    let cousinPair = null
    for (let i = 0; i < childRow.length - 1; i++) {
      const left = childRow[i]
      const right = childRow[i + 1]
      const leftGhost = originSet.has(left.data?._uid)
      const rightGhost = originSet.has(right.data?._uid)
      if (leftGhost !== rightGhost) {
        cousinPair = { left, right, live: leftGhost ? right : left }
        break
      }
    }
    const besideGhost = pick({ x: held.x + CONFIG.CARD_WIDTH / 2 + 10, y: held.y })
    const onGhost = pick({ x: held.x, y: held.y })
    const besideOther = other ? pick({ x: other.x + CONFIG.CARD_WIDTH / 2 + 10, y: other.y }) : null
    const underNeighbor = neighbor ? pick({ x: neighbor.x, y: neighbor.y }) : null
    const towardNeighbor = neighbor
      ? pick({ x: held.x + (neighbor.x - held.x) * 0.72, y: held.y })
      : null
    const betweenCousins = cousinPair
      ? pick({
        x: (() => {
          const mid = (cousinPair.left.x + cousinPair.right.x) / 2
          return mid + (cousinPair.live.x - mid) * 0.3
        })(),
        y: cousinPair.live.y,
      })
      : null
    const besideCousin = cousinPair
      ? pick({
        x: cousinPair.live.x + (cousinPair.live === cousinPair.left ? 1 : -1) * (CONFIG.CARD_WIDTH / 2 + 8),
        y: cousinPair.live.y,
      })
      : null
    return {
      origin,
      onGhostType: onGhost?.type || null,
      onGhostUid: onGhost?.targetUid || null,
      besideGhostType: besideGhost?.type || null,
      besideGhostUid: besideGhost?.targetUid || null,
      besideOtherType: besideOther?.type || null,
      besideOtherUid: besideOther?.targetUid || null,
      besideOtherPrev: besideOther?.prevUid || null,
      besideOtherNext: besideOther?.nextUid || null,
      neighborUid: neighbor?.data?._uid || null,
      underNeighborType: underNeighbor?.type || null,
      underNeighborUid: underNeighbor?.targetUid || null,
      towardNeighborType: towardNeighbor?.type || null,
      towardNeighborUid: towardNeighbor?.targetUid || null,
      towardNeighborPrev: towardNeighbor?.prevUid || null,
      towardNeighborNext: towardNeighbor?.nextUid || null,
      towardNeighborHit: towardNeighbor?._hit?.kind || null,
      besideCousinType: besideCousin?.type || null,
      besideCousinUid: besideCousin?.targetUid || null,
      besideCousinPrev: besideCousin?.prevUid || null,
      besideCousinNext: besideCousin?.nextUid || null,
      besideCousinHit: besideCousin?._hit?.kind || null,
      liveCousinUid: cousinPair?.live?.data?._uid || null,
      betweenType: betweenCousins?.type || null,
      betweenUid: betweenCousins?.targetUid || null,
      betweenPrev: betweenCousins?.prevUid || null,
      betweenNext: betweenCousins?.nextUid || null,
    }
  })
  assert.equal(ghostPick.onGhostType, 'node')
  assert.equal(ghostPick.onGhostUid, ghostPick.origin)
  assert.equal(ghostPick.besideGhostType, 'node', 'beside the origin ghost must arm put-back, not a side-insert caret')
  assert.equal(ghostPick.besideGhostUid, ghostPick.origin)
  assert.notEqual(ghostPick.besideOtherUid, ghostPick.origin, 'side-insert / adopt beside another card must not remap to the ghost')
  assert.equal(ghostPick.underNeighborType, 'node', 'dropping under a sibling/cousin must still adopt')
  assert.equal(ghostPick.underNeighborUid, ghostPick.neighborUid)
  assert.equal(ghostPick.towardNeighborType, 'gap', 'across the channel, the sibling side-insert must stay live')
  assert.notEqual(ghostPick.towardNeighborUid, ghostPick.origin)
  assert.ok(ghostPick.towardNeighborPrev || ghostPick.towardNeighborNext, 'sibling side-insert must keep gap ownership')
  assert.equal(ghostPick.besideCousinType, 'gap', 'beside a cousin across the channel must keep side-insert')
  assert.notEqual(ghostPick.besideCousinUid, ghostPick.origin)
  assert.ok(ghostPick.besideCousinPrev || ghostPick.besideCousinNext, 'cousin side-insert must keep gap ownership')
  assert.equal(ghostPick.betweenType, 'gap', 'the gap/dot between two cousins must stay a between-insert')
  assert.notEqual(ghostPick.betweenUid, ghostPick.origin)
  assert.ok(ghostPick.betweenPrev && ghostPick.betweenNext, 'between-cousin insert must keep both neighbors')
  await page.evaluate(({ x, y }) => {
    const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((element) => element.__data__?.data?.name === 'Node 03')
    node?.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y,
      button: 2,
    }))
  }, hold)
  await page.waitForTimeout(520)
  const still = await page.evaluate(() => {
    const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((element) => element.__data__?.data?.name === 'Node 03')
    const parentName = node?.__data__?.parent?.data?.name
    const parent = parentName
      ? Array.from(document.querySelectorAll('svg#canvas g.node')).find((element) => element.__data__?.data?.name === parentName)
      : null
    const t = window.d3.zoomTransform(document.getElementById('canvas'))
    const box = node?.getBoundingClientRect()
    const preview = document.getElementById('logyq-v162-branch-preview')
    return {
      ghost: node?.classList.contains('v2-branch-origin-ghost'),
      transform: node?.getAttribute('transform') || '',
      opacity: node ? getComputedStyle(node).opacity : '0',
      width: box?.width || 0,
      height: box?.height || 0,
      parentDrop: !!parent?.classList.contains('drop-target'),
      preview: !!preview,
      previewText: (preview?.textContent || '').replace(/\s+/g, ' ').trim(),
      banked: Array.from(document.querySelectorAll('#Dock .chip')).some((chip) => chip.textContent.trim() === 'Node 03'),
      y: t.y,
    }
  })
  assert.equal(still.ghost, true, 'origin ghost must survive a stationary hold after latch')
  assert.equal(still.transform, originTransform)
  assert.equal(still.parentDrop, false, 'still hold must not arm the parent as a magnetic drop')
  assert.equal(still.preview, true)
  assert.match(still.previewText, /Node 03/, `floating clone must keep the card label, got "${still.previewText}"`)
  assert.equal(still.banked, false, 'still hold must not dump the card into the Word Bank')
  assert.equal(await page.locator('#Dock .chip').count(), bankBefore)
  assert.deepEqual(await page.evaluate(() => (window.LOGYQBridge.core.state.wordBank || []).slice()), bankWordsBefore, 'still hold / long-press contextmenu must not copy into Word Bank')
  assert.equal(await page.evaluate(() => !!window.LOGYQBridge.core?.holdDrag?.blocksBank?.()), true)
  assert.ok(Number(still.opacity) > 0.2, `origin ghost opacity vanished: ${still.opacity}`)
  assert.ok(still.width > 6 && still.height > 6, `origin ghost box collapsed: ${still.width}x${still.height}`)
  assert.ok(Math.abs(still.y - beforeHold.y) < 2, `map must stay put while holding still, before=${beforeHold.y} during=${still.y}`)
  assert.equal(await page.locator('svg#canvas g.node').count(), holdCount)
  const slotStill = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('svg#canvas g.node'))
    const held = nodes.find((element) => element.__data__?.data?.name === 'Node 03')
    const kids = held?.__data__?.parent?.children || []
    return {
      uid: held?.__data__?.data?._uid || '',
      x: held?.__data__?.x ?? null,
      y: held?.__data__?.y ?? null,
      frozen: !!window.LOGYQBridge.core?.holdDrag?.frozen?.(),
      inTree: !!(held?.__data__?.data?._uid && window.LOGYQBridge.core.state.root.descendants()
        .some((item) => item.data?._uid === held.__data__.data._uid)),
      row: kids.map((child) => {
        const node = nodes.find((element) => element.__data__?.data?._uid === child.data._uid)
        return {
          name: child.data.name,
          uid: child.data._uid,
          x: child.x,
          y: child.y,
          transform: node?.getAttribute('transform') || '',
        }
      }),
    }
  })
  assert.equal(slotStill.frozen, true, 'hold-drag must freeze layout reservation while latched')
  assert.equal(slotStill.inTree, true, 'origin uid must stay in the hierarchy during hold-drag')
  assert.equal(slotStill.uid, slotBefore.uid)
  assert.equal(slotStill.x, slotBefore.x)
  assert.equal(slotStill.y, slotBefore.y)
  assert.ok(slotBefore.row.length >= 2, `Node 03 must share a row so sibling slot reservation is testable, got ${slotBefore.row.length}`)
  assert.deepEqual(slotStill.row, slotBefore.row, 'sibling layout slots must stay put while the origin is held')
  await touch('pointermove', hold.x + 4, hold.y + 4, 42)
  assert.equal(await page.locator('svg#canvas g.node').count(), holdCount)
  assert.equal(await page.evaluate(() => {
    const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((element) => element.__data__?.data?.name === 'Node 03')
    return node?.getAttribute('transform') || ''
  }), originTransform)
  assert.equal(await page.evaluate(() => {
    const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((element) => element.__data__?.data?.name === 'Node 03')
    return node?.classList.contains('v2-branch-origin-ghost')
  }), true)
  await touch('pointermove', hold.x + 80, hold.y + 30, 42)
  assert.equal(await page.locator('svg#canvas g.node').count(), holdCount)
  assert.equal(await page.evaluate(() => {
    const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((element) => element.__data__?.data?.name === 'Node 03')
    return node?.classList.contains('v2-branch-origin-ghost')
  }), true)
  await touch('pointermove', hold.x + 4, hold.y + 4, 42)
  await touch('pointerup', hold.x + 4, hold.y + 4, 42)
  await page.waitForFunction(() => !document.body.classList.contains('v2-branch-drag'))
  assert.equal(await page.locator('svg#canvas g.node').count(), holdCount)
  assert.equal(await page.locator('#Dock .chip').count(), bankBefore)
  assert.deepEqual(await page.evaluate(() => (window.LOGYQBridge.core.state.wordBank || []).slice()), bankWordsBefore)
  assert.equal(await page.evaluate(() => {
    return Array.from(document.querySelectorAll('svg#canvas g.node')).some((element) => element.__data__?.data?.name === 'Node 03')
  }), true)
  await page.waitForTimeout(520)
  await page.evaluate(({ x, y }) => {
    const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((element) => element.__data__?.data?.name === 'Node 03')
    for (const button of [0, 2]) {
      node?.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y,
        button,
      }))
    }
  }, hold)
  assert.equal(await page.locator('#Dock .chip').count(), bankBefore, 'late long-press contextmenu must not copy into Word Bank')
  assert.deepEqual(await page.evaluate(() => (window.LOGYQBridge.core.state.wordBank || []).slice()), bankWordsBefore)
  assert.equal(await page.evaluate(() => {
    return Array.from(document.querySelectorAll('svg#canvas g.node')).some((element) => element.__data__?.data?.name === 'Node 03')
  }), true, 'late contextmenu must leave the ca…79410 tokens truncated…ssert.ok(grid.lastBottom <= grid.listBottom + 1, `last chip bottom ${grid.lastBottom} should stay inside ${grid.listBottom}`)
  await page.locator('#logyq-warehouse-close').click()

  assert.deepEqual(errors, [])
  await context.close()
})

test('LOGYQ landscape shelf is a left column with corner warehouse and trash', async () => {
  const context = await newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true })
  await stubMaps(context)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logyq/index.html`, { waitUntil: 'networkidle' })
  await waitForBoot(page)
  await page.evaluate(() => {
    localStorage.removeItem('logyq_word_warehouse_v1')
    window.LOGYQPreview.app.hasOpenMap = true
    document.body.classList.add('logyq-map-open')
    document.body.classList.remove('logyq-home')
    document.querySelectorAll('.logiq-backdrop.is-open').forEach((el) => el.classList.remove('is-open'))
    window.LOGYQBridge.loadMap({ name: 'Root', children: [{ name: 'A' }] }, Array.from({ length: 18 }, (_, index) => `Word ${index + 1}`))
  })
  await page.waitForFunction(() => document.querySelectorAll('#Dock .chip').length === 18)
  const layout = await page.evaluate(() => {
    const shelf = document.getElementById('Dock').getBoundingClientRect()
    const house = document.getElementById('logyq-warehouse').getBoundingClientRect()
    const trash = document.getElementById('logyq-bank-trash')
    const dock = document.getElementById('Dock')
    return {
      shelf: { left: shelf.left, top: shelf.top, bottom: shelf.bottom, width: shelf.width, height: shelf.height },
      house: { left: house.left, top: house.top, bottom: house.bottom },
      trashDisplay: getComputedStyle(trash).display,
      houseDisplay: getComputedStyle(document.getElementById('logyq-warehouse')).display,
      radius: getComputedStyle(dock).borderRadius,
      flow: getComputedStyle(dock).flexDirection,
      overflowY: getComputedStyle(document.getElementById('logyq-bank-chips')).overflowY,
    }
  })
  assert.equal(layout.flow, 'column')
  assert.equal(layout.overflowY, 'auto')
  assert.equal(layout.houseDisplay, 'none', 'warehouse stays hidden until something is stored')
  assert.equal(layout.trashDisplay, 'none', 'trash stays hidden until a drag')
  assert.equal(layout.radius, '0px')
  assert.ok(layout.shelf.left < 2, 'shelf is flush to the left edge')
  assert.ok(layout.shelf.top < 2, 'shelf is flush to the top')
  assert.ok(layout.shelf.bottom > 385, 'shelf is flush to the bottom')
  assert.ok(layout.shelf.width < 180 && layout.shelf.width > 120)
  assert.ok(layout.shelf.height > 300, 'landscape shelf runs the side')
  const landscapeHouse = await page.evaluate(() => {
    const id = window.LOGYQPreview?.app?.current?.id || '_draft'
    const store = {}
    store[id] = ['Word 1']
    localStorage.setItem('logyq_word_warehouse_v1', JSON.stringify(store))
    window.LOGYQBridge.core.wordDock.render()
    const house = document.getElementById('logyq-warehouse').getBoundingClientRect()
    const shelf = document.getElementById('Dock').getBoundingClientRect()
    return {
      display: getComputedStyle(document.getElementById('logyq-warehouse')).display,
      left: house.left,
      top: house.top,
      shelfRight: shelf.right,
      onShelf: Array.from(document.querySelectorAll('#Dock .chip')).some((el) => el.textContent.trim() === 'Word 1'),
    }
  })
  assert.notEqual(landscapeHouse.display, 'none', 'warehouse shows when a word is stored and the shelf still has other chips')
  assert.equal(landscapeHouse.onShelf, false)
  assert.ok(landscapeHouse.left >= landscapeHouse.shelfRight - 2, 'warehouse is just right of the shelf')
  assert.ok(landscapeHouse.top < 24, 'warehouse is the top corner')

  const landscapeTrash = await page.evaluate(() => {
    const chip = document.querySelector('#Dock .chip')
    const rect = chip.getBoundingClientRect()
    const x = rect.left + 12
    const y = rect.top + 16
    const fire = (type, cx, cy, buttons, node) => node.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, composed: true, pointerId: 22, pointerType: 'touch',
      isPrimary: true, button: 0, buttons, clientX: cx, clientY: cy,
    }))
    fire('pointerdown', x, y, 1, chip)
    fire('pointermove', x + 40, y, 1, window)
    const trash = document.getElementById('logyq-bank-trash')
    const shelf = document.getElementById('Dock').getBoundingClientRect()
    const box = trash.getBoundingClientRect()
    const during = {
      display: getComputedStyle(trash).display,
      left: box.left,
      bottom: box.bottom,
      shelfRight: shelf.right,
    }
    fire('pointercancel', x + 40, y, 0, window)
    return { during, after: getComputedStyle(trash).display, bank: window.LOGYQBridge.core.state.wordBank.length }
  })
  assert.equal(landscapeTrash.during.display, 'flex')
  assert.ok(landscapeTrash.during.left >= landscapeTrash.during.shelfRight - 2, 'trash is just right of the shelf')
  assert.ok(landscapeTrash.during.bottom > 360, 'trash is the bottom corner')
  assert.equal(landscapeTrash.after, 'none')
  assert.equal(landscapeTrash.bank, 18)

  const scrolled = await page.evaluate(() => {
    const strip = document.getElementById('logyq-bank-chips')
    const chip = strip.querySelector('.chip')
    const rect = chip.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + 20
    const before = strip.scrollTop
    chip.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, cancelable: true, composed: true, pointerId: 14, pointerType: 'touch',
      isPrimary: true, button: 0, buttons: 1, clientX: x, clientY: y,
    }))
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true, cancelable: true, composed: true, pointerId: 14, pointerType: 'touch',
      isPrimary: true, button: 0, buttons: 1, clientX: x, clientY: y - 24,
    }))
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true, cancelable: true, composed: true, pointerId: 14, pointerType: 'touch',
      isPrimary: true, button: 0, buttons: 1, clientX: x, clientY: y - 90,
    }))
    window.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true, cancelable: true, composed: true, pointerId: 14, pointerType: 'touch',
      isPrimary: true, button: 0, buttons: 0, clientX: x, clientY: y - 90,
    }))
    return {
      before,
      after: strip.scrollTop,
      dragging: document.body.classList.contains('logyq-chip-drag'),
      bank: window.LOGYQBridge.core.state.wordBank.length,
    }
  })
  assert.ok(scrolled.after > scrolled.before + 30, `vertical pan should scroll the shelf, before=${scrolled.before} after=${scrolled.after}`)
  assert.equal(scrolled.dragging, false)
  assert.equal(scrolled.bank, 18)
  assert.deepEqual(errors, [])
  await context.close()
})

test('LOGYQ nested folders organize maps without deleting them', async () => {
  const capture = []
  const context = await newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const store = await stubMaps(context, {
    capture,
    maps: [{
      id: 'robins',
      name: 'Robins',
      tree: { name: 'Robins', formatVersion: 2, _uid: 'root' },
      word_bank: [],
      updated_at: '2026-09-24T00:00:00.000Z',
    }],
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('dialog', (dialog) => dialog.accept())
  await page.goto(`${baseUrl}/logyq/index.html`, { waitUntil: 'networkidle' })
  await waitForBoot(page)
  await page.waitForSelector('#logiq-library.is-open')
  assert.match(await page.locator('#logiq-map-list').innerText(), /Robins/)

  await page.locator('#logyq-new-folder').click()
  await page.locator('[data-new-folder] input').fill('Animals')
  await page.locator('[data-new-folder] button').click()
  await page.locator('.logyq-folder-open', { hasText: 'Animals' }).click()
  await page.waitForSelector('.logyq-crumbs')
  assert.match(await page.locator('.logyq-crumbs').innerText(), /My maps/)
  assert.match(await page.locator('.logyq-crumbs').innerText(), /Animals/)
  assert.match(await page.locator('#logiq-map-list').innerText(), /This folder is empty/)

  await page.locator('#logyq-new-folder').click()
  await page.locator('[data-new-folder] input').fill('Birds')
  await page.locator('[data-new-folder] button').click()
  await page.locator('.logyq-crumbs button', { hasText: 'My maps' }).click()
  await page.locator('.logiq-map-row', { hasText: 'Robins' }).locator('[data-map-action="move"]').click()
  await page.locator('.logiq-map-row select').selectOption({ label: 'Animals / Birds' })
  await page.locator('.logiq-map-row [data-map-move] button').click()
  assert.equal(await page.locator('.logiq-map-row', { hasText: 'Robins' }).count(), 0)

  await page.locator('.logyq-folder-open', { hasText: 'Animals' }).click()
  await page.locator('.logyq-folder-open', { hasText: 'Birds' }).click()
  assert.match(await page.locator('.logyq-crumbs').innerText(), /Birds/)
  await page.locator('.logiq-map-name', { hasText: 'Robins' }).click()
  await page.waitForFunction(() => !document.getElementById('logiq-library')?.classList.contains('is-open'))
  assert.equal(await page.evaluate(() => window.LOGYQBridge.snapshot().tree.name), 'Robins')
  await page.locator('#logyq-home-btn').click()
  await page.waitForSelector('#logiq-library.is-open')
  assert.match(await page.locator('.logyq-crumbs').innerText(), /Birds/)
  assert.equal(await page.locator('.logiq-map-name', { hasText: 'Robins' }).count(), 1)

  await page.locator('.logyq-crumbs button', { hasText: 'Animals' }).click()
  const birds = page.locator('.logyq-folder-row', { hasText: 'Birds' })
  await birds.locator('[data-folder-action="rename"]').click()
  await birds.locator('[data-folder-rename] input').fill('Songbirds')
  await birds.locator('[data-folder-rename] button').click()
  assert.equal(await page.locator('.logyq-folder-open', { hasText: 'Songbirds' }).count(), 1)
  await page.locator('.logyq-folder-row', { hasText: 'Songbirds' }).locator('[data-folder-action="delete"]').click()
  assert.equal(await page.locator('.logiq-map-name', { hasText: 'Robins' }).count(), 1)
  assert.equal(store.maps.length, 1)
  assert.equal(store.maps[0].tree.name, 'Robins')
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('logyq_map_folders_v1')))
  const animalsId = saved.folders.find((folder) => folder.name === 'Animals').id
  assert.equal(saved.placements.robins, animalsId)
  assert.equal(saved.folders.some((folder) => folder.name === 'Songbirds'), false)

  await page.locator('#logiq-new-map').click()
  await page.waitForFunction(() => window.LOGYQPreview.app.draftFolderId === window.LOGYQPreview.app.libraryFolderId)
  await page.evaluate(() => {
    const uid = window.LOGYQBridge.core.state.root.data._uid
    window.LOGYQBridge.renameNode(uid, 'Sparrow')
  })
  await page.waitForFunction(() => {
    const raw = localStorage.getItem('logyq_map_folders_v1')
    return raw && raw.includes('map-')
  })
  const placed = await page.evaluate(() => JSON.parse(localStorage.getItem('logyq_map_folders_v1')))
  const sparrow = store.maps.find((row) => row.tree?.name === 'Sparrow')
  assert.ok(sparrow)
  assert.equal(placed.placements[sparrow.id], animalsId)
  assert.equal(store.maps.find((row) => row.id === 'robins').tree.name, 'Robins')
  assert.deepEqual(errors, [])
  await context.close()
})

test('LOGYQ my maps list fits a phone viewport', async () => {
  const longMap = 'Robins along the winter reed beds and the long causeway'
  const longFolder = 'Birds of the northern estuary survey folder'
  const context = await newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await stubMaps(context, {
    maps: [{
      id: 'robins',
      name: longMap,
      tree: { name: longMap, formatVersion: 2, _uid: 'root' },
      word_bank: [],
      updated_at: '2026-09-24T00:00:00.000Z',
    }],
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('dialog', (dialog) => dialog.accept())
  await page.goto(`${baseUrl}/logyq/index.html`, { waitUntil: 'networkidle' })
  await waitForBoot(page)
  await page.waitForSelector('#logiq-library.is-open')

  async function assertListFits(label) {
    const box = await page.evaluate(() => {
      const view = document.documentElement.clientWidth
      const modal = document.querySelector('#logiq-library .logiq-modal')
      const list = document.getElementById('logiq-map-list')
      const rows = Array.from(document.querySelectorAll('.logiq-map-row, .logyq-folder-row')).map((el) => {
        const rect = el.getBoundingClientRect()
        const name = el.querySelector('.logiq-map-name')
        const actions = Array.from(el.querySelectorAll('.logiq-map-actions button')).map((button) => {
          const bounds = button.getBoundingClientRect()
          return { text: button.textContent, left: bounds.left, right: bounds.right, width: bounds.width, height: bounds.height }
        })
        return { left: rect.left, right: rect.right, nameClient: name?.clientWidth || 0, nameScroll: name?.scrollWidth || 0, actions }
      })
      return {
        view,
        docScroll: document.documentElement.scrollWidth,
        modalClient: modal.clientWidth,
        modalScroll: modal.scrollWidth,
        listClient: list.clientWidth,
        listScroll: list.scrollWidth,
        rows,
      }
    })
    assert.ok(box.docScroll <= box.view + 1, `${label} document ${box.docScroll} > ${box.view}`)
    assert.ok(box.modalScroll <= box.modalClient + 1, `${label} modal ${box.modalScroll} > ${box.modalClient}`)
    assert.ok(box.listScroll <= box.listClient + 1, `${label} list ${box.listScroll} > ${box.listClient}`)
    for (const row of box.rows) {
      assert.ok(row.left >= -1 && row.right <= box.view + 1, `${label} row ${row.left}-${row.right}`)
      for (const action of row.actions) {
        assert.ok(action.width >= 24 && action.height >= 24, `${label} ${action.text}`)
        assert.ok(action.left >= -1 && action.right <= box.view + 1, `${label} ${action.text} ${action.left}-${action.right}`)
      }
    }
    return box
  }

  const root = await assertListFits('root')
  assert.ok(root.rows.some((row) => row.nameScroll > row.nameClient + 8), 'long map name truncates')

  await page.locator('#logyq-new-folder').click()
  await page.locator('[data-new-folder] input').fill(longFolder)
  await page.locator('[data-new-folder] button').click()
  const withFolder = await assertListFits('root folder')
  assert.ok(withFolder.rows.some((row) => row.nameScroll > row.nameClient + 8), 'long folder name truncates')

  await page.locator('.logyq-folder-open', { hasText: longFolder }).click()
  await page.waitForSelector('.logyq-crumbs')
  await page.locator('#logyq-new-folder').click()
  await page.locator('[data-new-folder] input').fill('Nests')
  await page.locator('[data-new-folder] button').click()
  await assertListFits('nested folder')

  await page.locator('.logyq-crumbs button', { hasText: 'My maps' }).click()
  await page.locator('.logiq-map-row').locator('[data-map-action="move"]').click()
  await page.locator('.logiq-map-row select').selectOption({ label: `${longFolder} / Nests` })
  await assertListFits('move open')
  await page.locator('.logiq-map-row [data-map-move] button').click()
  await page.locator('.logyq-folder-open', { hasText: longFolder }).click()
  await page.locator('.logyq-folder-open', { hasText: 'Nests' }).click()
  await assertListFits('map inside nest')
  await page.locator('.logiq-map-row').locator('[data-map-action="rename"]').click()
  await assertListFits('rename open')
  await page.locator('.logiq-map-name').click()
  await page.waitForFunction(() => !document.getElementById('logiq-library')?.classList.contains('is-open'))
  assert.equal(await page.evaluate(() => window.LOGYQBridge.snapshot().tree.name), longMap)
  assert.deepEqual(errors, [])
  await context.close()
})

test('every solved game tree stays in the phone safe area', async () => {
  const viewports = [
    { width: 360, height: 640 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]
  const context = await newContext({ viewport: viewports[0], isMobile: true, hasTouch: true })
  await stubMaps(context, { maps: [] })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logyq/index.html`, { waitUntil: 'networkidle' })
  await waitForBoot(page)
  const failures = []
  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    const report = await page.evaluate(({ width, height }) => {
      const overlap = (a, b) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1
      const rectOf = (id) => {
        const el = document.getElementById(id)
        if (!el) return null
        const style = getComputedStyle(el)
        if (style.display === 'none' || style.visibility === 'hidden') return null
        const rect = el.getBoundingClientRect()
        if (rect.width < 2 || rect.height < 2) return null
        return rect
      }
      const bad = []
      const levels = window.LOGYQPreview.game.levels
      for (const level of levels) {
        window.LOGYQPreview.game.presentSolved(level)
        const live = new Set((window.LOGYQBridge.core.state.root?.descendants() || []).map((node) => node.data?._uid))
        const cards = [...document.querySelectorAll('svg#canvas g.nodes g.node')]
          .filter((node) => live.has(node.__data__?.data?._uid))
          .map((node) => node.getBoundingClientRect())
        if (!cards.length) {
          bad.push(width + 'x' + height + ' ' + level.title + ' has no cards')
          continue
        }
        const bar = rectOf('logyq-game-bar')
        const dock = rectOf('Dock')
        let minX = Infinity
        let maxX = -Infinity
        for (const card of cards) {
          if (card.left < -1 || card.top < -1 || card.right > width + 1 || card.bottom > height + 1) {
            bad.push(width + 'x' + height + ' ' + level.title + ' card outside ' + Math.round(card.left) + ',' + Math.round(card.top) + ' ' + Math.round(card.right) + ',' + Math.round(card.bottom))
          }
          if (bar && overlap(card, bar)) bad.push(width + 'x' + height + ' ' + level.title + ' card overlaps the top panel')
          if (dock && overlap(card, dock)) bad.push(width + 'x' + height + ' ' + level.title + ' card overlaps the Word Bank')
          minX = Math.min(minX, card.left)
          maxX = Math.max(maxX, card.right)
        }
        let safeLeft = 0
        let safeRight = width
        if (dock && dock.width < width * 0.45 && dock.height > height * 0.45 && dock.left < width * 0.5) safeLeft = dock.right
        const cluster = rectOf('logyq-corner-cluster')
        if (cluster && cluster.left > width * 0.55 && cluster.width < width * 0.4) safeRight = cluster.left
        const treeMid = (minX + maxX) / 2
        const safeMid = (safeLeft + safeRight) / 2
        const limit = Math.max(18, (safeRight - safeLeft) * 0.08)
        if (Math.abs(treeMid - safeMid) > limit) {
          bad.push(width + 'x' + height + ' ' + level.title + ' off center by ' + Math.round(treeMid - safeMid))
        }
      }
      return bad
    }, viewport)
    failures.push(...report)
  }
  assert.deepEqual(failures, [])
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => {
    const level = window.LOGYQPreview.game.levels[0]
    window.LOGYQPreview.game.presentSolved(level)
  })
  await page.locator('#logyq-game-check').click()
  assert.equal(await page.locator('#logyq-game-status').textContent(), 'It fits!')
  assert.equal(await page.locator('#logyq-game-status').evaluate((el) => el.scrollWidth <= el.clientWidth + 1), true)
  assert.equal(await page.locator('#logyq-game-bar').evaluate((el) => Math.round(el.getBoundingClientRect().height)), 32)
  assert.equal(await page.locator('#logyq-game-next').isVisible(), true)
  const before = await page.locator('#logyq-game-name').textContent()
  await page.locator('#logyq-game-next').click()
  await page.waitForFunction((title) => document.getElementById('logyq-game-name')?.textContent !== title, before)
  await page.locator('#logyq-game-levels-button').click()
  await page.waitForSelector('#logiq-library.is-open')
  assert.equal(await page.locator('#logiq-library').getAttribute('data-shelf'), 'game')
  assert.deepEqual(errors, [])
  await context.close()
})

test('game reframes smoothly after a layout change and freezes while a pointer is held', async () => {
  const context = await newContext({ viewport: {width:390,height:844}, isMobile:true, hasTouch:true })
  await stubMaps(context, { maps: [] })
  const page = await context.newPage()
  await page.goto(`${baseUrl}/logyq/index.html`, {waitUntil:'networkidle'})
  await waitForBoot(page)
  const camera = () => page.evaluate(() => {
    const t = window.LOGYQBridge.core.elements.svg.node().__zoom
    return {x:t.x,y:t.y,k:t.k}
  })
  await page.evaluate(() => window.LOGYQPreview.game.begin(window.LOGYQPreview.game.levels[129]))
  await page.waitForTimeout(650)
  const before = await camera()
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointerdown',{pointerId:7}))
    const level = window.LOGYQPreview.game.levels[129]
    window.LOGYQBridge.loadMap(structuredClone(level.solution),[],{fit:false})
  })
  await page.waitForTimeout(700)
  assert.deepEqual(await camera(), before, 'a held pointer must not chase a moving viewport')
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup',{pointerId:7})))
  await page.waitForFunction(k => window.LOGYQBridge.core.elements.svg.node().__zoom.k < k - 0.01, before.k, {timeout:2000})
  const during = await camera()
  await page.waitForTimeout(600)
  const after = await camera()
  assert.ok(after.k < before.k, 'the wider board must resize to fit')
  assert.ok(during.k > after.k + 0.001, 'the camera must pass through intermediate scales')
  const bounds = await page.locator('svg#canvas g.nodes').boundingBox()
  const bar = await page.locator('#logyq-game-bar').boundingBox()
  const dock = await page.locator('#Dock').boundingBox()
  assert.ok(bounds.y >= bar.y + bar.height + 7)
  assert.ok(bounds.y + bounds.height <= (dock?.y ?? 844) - 7)
  assert.ok(bounds.x >= 19 && bounds.x + bounds.width <= 371)
  await context.close()
})

test('game rejects mismatches but permits matching touch moves; hides Undo and All', async () => {
  const context = await newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})
  await stubMaps(context,{maps:[]})
  await observeGameAudio(context)
  const page = await context.newPage()
  await page.goto(`${baseUrl}/logyq/index.html`,{waitUntil:'networkidle'})
  await waitForBoot(page)
  await page.evaluate(() => window.LOGYQPreview.game.presentSolved(window.LOGYQPreview.game.levels[125]))
  await page.waitForTimeout(700)
  await page.locator('#logyq-game-check').click()
  assert.equal(await page.locator('#logyq-game-next').isVisible(),true)
  assert.equal(await page.locator('#logiq-mobile-header [data-tool="undo"]').isVisible(),false)
  assert.equal(await page.locator('#logyq-bank-all').count(),0)
  const cdp = await context.newCDPSession(page)
  const snapshot = () => page.evaluate(() => JSON.stringify(window.LOGYQBridge.snapshot().tree))
  for (const matching of [false,true,'root']) {
    if (matching === true) {
      // Interaction fixture: matching faces permit different seats. Catalog
      // uniqueness is tested separately; this fixture is never a catalog level.
      await page.evaluate(() => {
        const tree = window.LOGYQBridge.snapshot().tree
        const paint = n => {n.paint='W:A';n.color='#60a5fa';for(const c of n.children||[])paint(c)}
        paint(tree)
        window.LOGYQBridge.loadMap(tree,[],{fit:false})
      })
      await page.waitForTimeout(700)
    }
    const before = await snapshot()
    const notesBefore = await page.evaluate(()=>window.__audioNotes.length)
    const info = await page.evaluate(rootMove => {
      const root=window.LOGYQBridge.core.state.root
      const leaf=root.descendants().find(n=>n.depth===root.height)
      const center=n=>{
        const el=Array.from(document.querySelectorAll('svg#canvas g.node')).find(el=>el.__data__?.data._uid===n.data._uid)
        const r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}
      }
      const source=rootMove?root:leaf,target=rootMove?root.children[0]:root
      return{uid:source.data._uid,rootUid:target.data._uid,from:center(source),to:center(target)}
    },matching==='root')
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...info.from,id:1}]})
    const nudge={x:info.from.x+18,y:info.from.y-18}
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...nudge,id:1}]})
    await page.waitForTimeout(60)
    const offset=await page.evaluate(point=>{
      const r=document.querySelector('#logyq-v162-branch-preview svg').getBoundingClientRect()
      return{x:r.x+r.width/2-point.x,y:r.y+r.height/2-point.y}
    },nudge)
    const dest={x:info.to.x-offset.x,y:info.to.y-offset.y}
    for(let i=1;i<=12;i++){
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:info.from.x+(dest.x-info.from.x)*i/12,y:info.from.y+(dest.y-info.from.y)*i/12,id:1}]})
      await page.waitForTimeout(20)
    }
    const aim=await page.evaluate(uid=>{
      const core=window.LOGYQBridge.core,dot=core.elements.caretDot.node()
      const target=core.state.root.descendants().find(n=>n.data._uid===uid),last=target.children.at(-1)
      const faces=Array.from(document.querySelectorAll('svg#canvas g.node rect:not(.grabzone)'))
      return{drop:core.state.dragState.drop,opacity:getComputedStyle(dot).opacity,
        x:+dot.getAttribute('cx'),lastRight:last.x+core.config.CARD_WIDTH/2,
        colors:faces.every(el=>getComputedStyle(el).fill===el.style.fill)}
    },info.rootUid)
    assert.equal(aim.drop?.targetUid,info.rootUid)
    assert.equal(aim.opacity,'1');assert.ok(aim.x>aim.lastRight);assert.equal(aim.colors,true)
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
    await page.waitForTimeout(900)
    const newNotes=await page.evaluate(count=>window.__audioNotes.slice(count),notesBefore)
    assert.deepEqual(newNotes.map(n=>n.frequency),matching?[620,180]:[], 'only a committed matching drop plays the click')
    if(matching){
      const parent=await page.evaluate(uid=>window.LOGYQBridge.core.state.root.descendants().find(n=>n.data._uid===uid)?.parent?.data._uid,info.uid)
      assert.equal(parent,info.rootUid)
      const moved=await snapshot()
      await page.evaluate(()=>window.LOGYQBridge.undo())
      await page.keyboard.press('Control+z')
      assert.equal(await snapshot(),moved,'game undo cannot move cards or restore the bank')
      const dot=await page.evaluate(uid=>{
        const core=window.LOGYQBridge.core,leaf=core.state.root.descendants().find(n=>n.data._uid===uid)
        core.selection.showGameChildCaret(uid)
        return{x:+core.elements.caretDot.attr('cx'),y:+core.elements.caretDot.attr('cy'),leafX:leaf.x,bottom:leaf.y+core.config.CARD_HEIGHT/2}
      },info.uid)
      assert.equal(dot.x,dot.leafX);assert.ok(dot.y>dot.bottom)
    }else{
      assert.equal(await snapshot(),before,'rejected contact leaves the board untouched')
      assert.match(await page.locator('#logyq-game-status').textContent(),/do not match/)
    }
  }
  await cdp.detach();await context.close()
})

test('completion colors expand into a background and reset without changing the puzzle',async()=>{
  const context=await newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})
  await stubMaps(context,{maps:[]})
  const page=await context.newPage()
  await page.goto(`${baseUrl}/logyq/index.html`,{waitUntil:'networkidle'})
  await waitForBoot(page)
  await page.evaluate(()=>window.LOGYQPreview.game.begin(window.LOGYQPreview.game.levels[51]))
  await page.waitForTimeout(750)
  assert.equal(await page.locator('#logyq-completion-art').count(),0,'unfinished puzzles have no completion art')
  await page.evaluate(()=>window.LOGYQPreview.game.presentSolved(window.LOGYQPreview.game.levels[51]))
  const before=await page.evaluate(()=>JSON.stringify(window.LOGYQBridge.snapshot().tree))
  await page.locator('#logyq-game-check').click()
  await page.waitForFunction(()=>document.getElementById('logyq-completion-art')?.dataset.phase==='complete',null,{timeout:4000})
  const art=await page.evaluate(()=>{
    const svg=document.getElementById('logyq-completion-art')
    return{viewBox:svg.getAttribute('viewBox'),cards:svg.querySelectorAll('[data-piece]').length,
      colors:Array.from(svg.querySelectorAll('path')).map(p=>p.getAttribute('fill')),
      opacity:+getComputedStyle(document.querySelector('svg#canvas g.nodes')).opacity,
      pointerEvents:getComputedStyle(svg).pointerEvents}
  })
  assert.equal(art.viewBox,'0 0 390 844');assert.equal(art.cards,5)
  assert.ok(art.colors.includes('#86efac')&&art.colors.includes('#f0abfc'))
  assert.equal(art.opacity,0);assert.equal(art.pointerEvents,'none')
  assert.equal(await page.locator('#Dock').evaluate(el=>+getComputedStyle(el).opacity),0)
  assert.equal(await page.locator('#logyq-game-next').isVisible(),true)
  assert.equal(await page.evaluate(()=>JSON.stringify(window.LOGYQBridge.snapshot().tree)),before)
  await page.screenshot({path:'/workspace/scratch/ae226cb204ec/logyq-completion-phone.png'})
  await page.locator('svg#canvas').tap({position:{x:200,y:300}})
  await page.waitForTimeout(350)
  assert.equal(await page.locator('#logyq-completion-art').count(),0)
  assert.equal(await page.locator('svg#canvas g.nodes').evaluate(el=>+getComputedStyle(el).opacity),1)
  assert.equal(await page.evaluate(()=>JSON.stringify(window.LOGYQBridge.snapshot().tree)),before)
  await page.locator('#logyq-game-check').click()
  await page.locator('#logyq-game-next').click()
  await page.waitForTimeout(2200)
  assert.equal(await page.locator('#logyq-completion-art').count(),0,'switching levels cancels pending effects')
  await page.emulateMedia({reducedMotion:'reduce'})
  await page.evaluate(()=>window.LOGYQPreview.game.presentSolved(window.LOGYQPreview.game.levels[51]))
  await page.locator('#logyq-game-check').click()
  await page.waitForFunction(()=>document.getElementById('logyq-completion-art')?.dataset.phase==='complete',null,{timeout:2000})
  assert.equal(await page.locator('svg#canvas g.nodes').evaluate(el=>getComputedStyle(el).transitionDuration),'0s')
  await page.setViewportSize({width:844,height:390})
  await page.waitForFunction(()=>document.getElementById('logyq-completion-art')?.getAttribute('viewBox')==='0 0 844 390',null,{timeout:2000})
  await page.screenshot({path:'/workspace/scratch/ae226cb204ec/logyq-completion-landscape.png'})
  await context.close()
})

async function observeGameAudio(context){
  await context.addInitScript(()=>{
    window.__audioNotes=[];window.__audioContexts=[]
    const Native=window.AudioContext
    window.AudioContext=class extends Native{
      constructor(...args){super(...args);window.__audioContexts.push(this)}
      createOscillator(){
        const osc=super.createOscillator(),start=osc.start.bind(osc)
        let frequency=osc.frequency.value
        const set=osc.frequency.setValueAtTime.bind(osc.frequency)
        osc.frequency.setValueAtTime=(value,time)=>{frequency=value;return set(value,time)}
        osc.start=(...args)=>{window.__audioNotes.push({frequency,time:args[0]});return start(...args)}
        return osc
      }
    }
  })
}

test('game sound unlocks on interaction, chimes with completion, and remembers mute',async()=>{
  const context=await newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})
  await stubMaps(context,{maps:[]});await observeGameAudio(context)
  const page=await context.newPage()
  await page.goto(`${baseUrl}/logyq/index.html`,{waitUntil:'networkidle'});await waitForBoot(page)
  assert.equal(await page.evaluate(()=>window.__audioContexts.length),0)
  await page.evaluate(()=>window.LOGYQPreview.game.begin(window.LOGYQPreview.game.levels[51]))
  assert.equal(await page.locator('#logyq-game-sound').count(),1,'game has an accessible sound toggle')
  await page.locator('#logiq-mobile-menu-btn').click()
  await page.locator('#logyq-game-sound').click()
  assert.equal(await page.locator('#logyq-game-sound').getAttribute('aria-pressed'),'false')
  await page.locator('#logiq-mobile-menu-btn').click()
  await page.evaluate(()=>window.LOGYQPreview.game.presentSolved(window.LOGYQPreview.game.levels[51]))
  await page.locator('#logyq-game-check').click()
  await page.waitForFunction(()=>document.getElementById('logyq-completion-art')?.dataset.phase==='complete')
  assert.equal(await page.evaluate(()=>window.__audioNotes.length),0,'muted completion is silent')
  await page.reload({waitUntil:'networkidle'});await waitForBoot(page)
  await page.evaluate(()=>window.LOGYQPreview.game.begin(window.LOGYQPreview.game.levels[51]))
  assert.equal(await page.locator('#logyq-game-sound').getAttribute('aria-pressed'),'false')
  assert.equal(await page.evaluate(()=>window.__audioContexts.length),0,'remembered mute does not create an audio context')
  await page.locator('#logiq-mobile-menu-btn').click();await page.locator('#logyq-game-sound').click()
  await page.locator('#logiq-mobile-menu-btn').click()
  await page.waitForFunction(()=>window.__audioContexts[0]?.state==='running')
  await page.evaluate(()=>window.LOGYQPreview.game.presentSolved(window.LOGYQPreview.game.levels[51]))
  await page.locator('#logyq-game-check').click()
  await page.waitForFunction(()=>window.__audioNotes.length===3)
  assert.equal(await page.locator('#logyq-completion-art').getAttribute('data-phase'),'expanding')
  const notes=await page.evaluate(()=>window.__audioNotes)
  assert.deepEqual(notes.map(n=>Math.round(n.frequency)),[523,659,784])
  assert.ok(notes[1].time>notes[0].time&&notes[2].time>notes[1].time)
  await page.locator('#logyq-game-check').click()
  assert.equal(await page.evaluate(()=>window.__audioNotes.length),3,'repeated Check does not stack chimes')
  await context.close()
})

test('clean completion joins render the reported chain and fork examples',async()=>{
  const context=await newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})
  await stubMaps(context,{maps:[]})
  const page=await context.newPage()
  await page.goto(`${baseUrl}/logyq/index.html`,{waitUntil:'networkidle'})
  await waitForBoot(page)
  await page.emulateMedia({reducedMotion:'reduce'})
  for(const index of [39,40,41,53]){
    await page.evaluate(i=>window.LOGYQPreview.game.presentSolved(window.LOGYQPreview.game.levels[i]),index)
    await page.locator('#logyq-game-check').click()
    await page.waitForFunction(()=>document.getElementById('logyq-completion-art')?.dataset.phase==='complete')
    assert.ok(await page.locator('#logyq-completion-art path').count()>0)
    await page.screenshot({path:`/workspace/scratch/ae226cb204ec/logyq-clean-${index+1}.png`})
  }
  await context.close()
})

test('game tray leaves gesture margins and first concepts show drag destinations',async()=>{
  const context=await newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})
  await stubMaps(context,{maps:[]})
  const page=await context.newPage()
  await page.goto(`${baseUrl}/logyq/index.html`,{waitUntil:'networkidle'})
  await waitForBoot(page)
  for(const [index,kind,count] of [[0,'below',1],[1,'above',1],[27,'sibling',2]]){
    await page.evaluate(i=>window.LOGYQPreview.game.begin(window.LOGYQPreview.game.levels[i]),index)
    await page.waitForTimeout(750)
    const tray=await page.locator('#Dock').boundingBox()
    assert.ok(tray.x>=20&&390-tray.x-tray.width>=20,'tray is inset from both phone edges')
    assert.ok(844-tray.y-tray.height>=30,'tray clears the bottom gesture region')
    assert.equal(await page.locator('#logyq-drag-guide').getAttribute('data-kind'),kind)
    assert.equal(await page.locator('svg#canvas g.node').count(),count)
    const target=await page.locator('#logyq-guide-target').boundingBox()
    assert.ok(target.x>=15&&target.x+target.width<=375&&target.y>=90&&target.y+target.height<tray.y)
    const chip=await page.locator('#Dock .chip').first().boundingBox()
    assert.ok(Math.abs(chip.x+chip.width/2-195)<2,'single loose piece is centered')
    await page.screenshot({path:`/workspace/scratch/ae226cb204ec/logyq-guide-${kind}.png`})
    const cdp=await context.newCDPSession(page)
    const from={x:chip.x+chip.width/2,y:chip.y+chip.height/2}
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...from,id:1}]})
    const nudge={x:from.x,y:from.y-22}
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...nudge,id:1}]})
    await page.waitForTimeout(60)
    const lifted=await page.locator('#logyq-chip-ghost').boundingBox()
    const dest={x:target.x+target.width/2-(lifted.x+lifted.width/2-nudge.x),
      y:target.y+target.height/2-(lifted.y+lifted.height/2-nudge.y)}
    for(let i=1;i<=12;i++){
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.x+(dest.x-from.x)*i/12,y:from.y+(dest.y-from.y)*i/12,id:1}]})
      await page.waitForTimeout(20)
    }
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
    await page.waitForTimeout(400)
    assert.equal(await page.locator('#logyq-drag-guide').count(),0,'successful drop dismisses guide')
    assert.equal(await page.evaluate(()=>window.LOGYQPreview.game.check()),undefined)
    assert.equal(await page.evaluate(()=>window.LOGYQBridge.core.state.root.descendants().length),kind==='sibling'?3:2)
    await cdp.detach()

  }
  for(const viewport of [{width:360,height:640},{width:844,height:390}]){
    await page.setViewportSize(viewport)
    await page.evaluate(()=>localStorage.removeItem('logyq_game_progress_v2'))
    for(const index of [0,1,27]){
      await page.evaluate(i=>window.LOGYQPreview.game.begin(window.LOGYQPreview.game.levels[i]),index)
      await page.waitForTimeout(1000)
      const tray=await page.locator('#Dock').boundingBox(), target=await page.locator('#logyq-guide-target').boundingBox()
      assert.ok(target.x>=15&&target.x+target.width<=viewport.width-15)
      assert.ok(target.y>=48&&target.y+target.height<tray.y-8)
      assert.ok(viewport.height-tray.y-tray.height>=30)
      if(index===1)assert.equal(await page.locator('#logyq-guide-target svg path').count(),0)
      else assert.equal(await page.locator('#logyq-guide-target svg path').getAttribute('d'),index===0?'M0 0H140V31.5H0Z':'M0 0H140L0 63Z')
    }
    await page.evaluate(()=>window.LOGYQPreview.game.begin(window.LOGYQPreview.game.levels[51]))
    await page.waitForTimeout(750)
    assert.equal(await page.locator('#logyq-drag-guide').count(),0,'other puzzles have no guide')
    const tray=await page.locator('#Dock').boundingBox()
    for(const chip of await page.locator('#Dock .chip').all()){
      const r=await chip.boundingBox()
      assert.ok(r.x>=tray.x&&r.x+r.width<=tray.x+tray.width&&r.y>=tray.y&&r.y+r.height<=tray.y+tray.height,'every loose card is reachable inside the tray')
    }
  }
  await page.evaluate(()=>window.LOGYQPreview.game.leave())
  assert.equal(await page.locator('#logyq-drag-guide').count(),0)
  await context.close()
})
