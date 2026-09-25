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
    ...(process.env.LOGYQ_CHROME ? { channel: 'chrome' } : {}),
  })
})

test.after(async () => {
  await browser?.close()
})

async function stubMaps(context, { maps = [], capture = [], acceptPin = null, listBody = null } = {}) {
  const store = { maps: maps.map((row) => ({ ...row })) }
  await context.route('https://jzaghifuhinkzzhiojre.supabase.co/**', async (route) => {
    const url = route.request().url()
    const name = url.includes('/rpc/') ? url.split('/rpc/')[1].split('?')[0] : ''
    let body = {}
    try { body = route.request().postDataJSON() || {} } catch (_error) {}
    capture.push({ name, url, method: route.request().method(), body })
    if (acceptPin && body.pin !== acceptPin && ['logiq_map_list', 'logiq_map_save', 'logiq_map_delete'].includes(name)) {
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
  })
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
  }), true, 'late contextmenu must leave the card on the map')
  await page.waitForFunction((prev) => {
    const t = window.d3.zoomTransform(document.getElementById('canvas'))
    return Math.abs(t.y - prev.y) < 3
  }, beforeHold)

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
  const duringEdit = await page.evaluate((prev) => {
    const t = window.d3.zoomTransform(document.getElementById('canvas'))
    const input = document.querySelector('.node-edit-input')
    const box = input.getBoundingClientRect()
    const card = Array.from(document.querySelectorAll('g.node')).find((node) => node.__data__?.data?.name === 'Node 08')?.getBoundingClientRect()
    return {
      k: t.k,
      x: t.x,
      y: t.y,
      docked: !!input.closest('.node-edit-dock'),
      aboveCard: !card || box.top > card.bottom || box.bottom < card.top,
      nearKeyboard: box.bottom > window.innerHeight - 120,
    }
  }, beforeEdit)
  assert.ok(Math.abs(duringEdit.k - beforeEdit.k) < 0.02, 'double-tap edit must not zoom')
  assert.ok(Math.hypot(duringEdit.x - beforeEdit.x, duringEdit.y - beforeEdit.y) < 2, 'double-tap edit must not pan')
  assert.equal(duringEdit.docked, true)
  assert.equal(duringEdit.aboveCard, true)
  assert.equal(duringEdit.nearKeyboard, true)
  await page.locator('.node-edit-input').fill('Tapped 08')
  await page.locator('.node-edit-input').press('Enter')
  await page.waitForFunction(() => Array.from(document.querySelectorAll('g.node')).some((node) => node.textContent.includes('Tapped 08')))
  const afterEdit = await page.evaluate(() => {
    const t = window.d3.zoomTransform(document.getElementById('canvas'))
    return { x: t.x, y: t.y, k: t.k }
  })
  assert.ok(Math.abs(afterEdit.k - beforeEdit.k) < 0.02, 'committing an edit must not zoom back')
  assert.ok(Math.hypot(afterEdit.x - beforeEdit.x, afterEdit.y - beforeEdit.y) < 2, 'committing an edit must not pan back')

  assert.deepEqual(errors, [])
  await context.close()
})

test('LOGYQ phone paints a card on tap and a branch on flick-down, and does not re-center', async () => {
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
      const face = node.querySelector('rect:not(.grabzone)')
      const rect = (face || node).getBoundingClientRect()
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    }, name)
  }

  // Down and up share one evaluate so the 160ms hold timer cannot latch
  // between two Playwright round trips. A still press that actually lasts
  // past the hold timer is still a hold in the app.
  async function touch(x, y, x2 = x, y2 = y, pointerId = 51) {
    await page.evaluate(({ x, y, x2, y2, pointerId }) => {
      const canvas = document.getElementById('canvas')
      for (const [type, px, py] of [['pointerdown', x, y], ['pointerup', x2, y2]]) {
        canvas.dispatchEvent(new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerType: 'touch',
          pointerId,
          isPrimary: true,
          button: 0,
          buttons: type === 'pointerdown' ? 1 : 0,
          clientX: px,
          clientY: py,
          screenX: px,
          screenY: py,
        }))
      }
    }, { x, y, x2, y2, pointerId })
  }

  async function zoomNow() {
    return page.evaluate(() => {
      const t = window.d3.zoomTransform(document.getElementById('canvas'))
      return { x: t.x, y: t.y, k: t.k }
    })
  }

  const beforeTap = await zoomNow()
  const idle = await nodeCenter('Node 07')
  await touch(idle.x, idle.y, idle.x, idle.y, 51)
  await page.waitForTimeout(400)
  const afterTap = await zoomNow()
  assert.ok(Math.hypot(afterTap.x - beforeTap.x, afterTap.y - beforeTap.y) < 6, 'tap must not re-center the map')
  assert.ok(Math.abs(afterTap.k - beforeTap.k) < 0.02)
  assert.equal(await page.locator('svg#canvas g.node.is-outlined').count(), 0)
  assert.equal(await page.locator('.node-edit-input').count(), 0)
  assert.equal(await page.evaluate(() => window.LOGYQPreview.gestures.paintTap()), false)
  assert.equal(await page.evaluate(() => window.LOGYQPreview.gestures.paintFlickDown('down')), false)
  assert.equal(await page.evaluate(() => window.LOGYQPreview.gestures.paintFlickDown('left')), false)

  await page.locator('#logyq-paint-btn').click()
  await page.waitForSelector('#logyq-paint-strip.is-open')
  await page.locator('#logyq-paint-strip [data-paint="#fde68a"]').click()
  await page.waitForFunction(() => window.LOGYQPreview.paint?.active === true)
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('logyq_paint_color_v1') || 'null'))
  assert.equal(stored?.color, '#fde68a')
  assert.equal(await page.evaluate(() => window.LOGYQPreview.gestures.paintTap()), true)
  assert.equal(await page.evaluate(() => window.LOGYQPreview.gestures.paintFlickDown('down')), true)
  assert.equal(await page.evaluate(() => window.LOGYQPreview.gestures.paintFlickDown('left')), false)

  const beforePaint = await zoomNow()
  const paintCard = await nodeCenter('Node 08')
  await touch(paintCard.x, paintCard.y, paintCard.x, paintCard.y, 52)
  await page.waitForFunction(() => {
    const node = Array.from(document.querySelectorAll('g.node')).find((element) => element.__data__?.data?.name === 'Node 08')
    return node?.__data__?.data?.color === '#fde68a'
  })
  assert.equal(await page.locator('.node-edit-input').count(), 0)
  const afterPaint = await zoomNow()
  assert.ok(Math.hypot(afterPaint.x - beforePaint.x, afterPaint.y - beforePaint.y) < 6, 'paint tap must not re-center')
  const tapPaint = await page.evaluate(() => {
    const byName = (label) => Array.from(document.querySelectorAll('g.node')).find((element) => element.__data__?.data?.name === label)
    return {
      self: byName('Node 08')?.__data__?.data?.color || null,
      other: byName('Node 07')?.__data__?.data?.color || null,
      outlined: document.querySelectorAll('svg#canvas g.node.is-outlined').length,
    }
  })
  assert.equal(tapPaint.self, '#fde68a')
  assert.equal(tapPaint.other, null)
  assert.equal(tapPaint.outlined, 0)

  const beforeBranch = await page.locator('svg#canvas g.node').count()
  const branch = await nodeCenter('Node 02')
  await touch(branch.x, branch.y, branch.x, branch.y + 70, 53)
  await page.waitForFunction(() => {
    const node = Array.from(document.querySelectorAll('g.node')).find((element) => element.__data__?.data?.name === 'Node 02')
    return node?.__data__?.descendants?.().every((item) => item.data.color === '#fde68a')
  })
  assert.equal(await page.locator('svg#canvas g.node').count(), beforeBranch)
  const branchPaint = await page.evaluate(() => {
    const byName = (label) => Array.from(document.querySelectorAll('g.node')).find((element) => element.__data__?.data?.name === label)
    const root = byName('Node 02')
    return {
      names: root.__data__.descendants().map((item) => item.data.name),
      colors: root.__data__.descendants().map((item) => item.data.color),
      sibling: byName('Node 03')?.__data__?.data?.color || null,
    }
  })
  assert.ok(branchPaint.names.length >= 2)
  assert.ok(branchPaint.colors.every((color) => color === '#fde68a'))
  assert.equal(branchPaint.sibling, null)

  const snapshot = await page.evaluate(() => window.LOGYQBridge.snapshot().tree)
  assert.equal(findNode(snapshot, 'Node 08').color, '#fde68a')
  assert.equal(findNode(snapshot, 'Node 02').color, '#fde68a')

  const colorBagFromTree = (tree) => {
    const rows = []
    const walk = (node) => {
      if (!node?.name) return
      rows.push(`${node.name}\0${node.color || ''}`)
      for (const child of node.children || []) walk(child)
    }
    walk(tree)
    return rows.sort()
  }
  const beforeMix = await page.evaluate(() => window.LOGYQBridge.snapshot().tree)
  await page.evaluate(() => window.LOGYQBridge.mix(false))
  const afterMix = await page.evaluate(() => window.LOGYQBridge.snapshot().tree)
  assert.deepEqual(colorBagFromTree(afterMix), colorBagFromTree(beforeMix), 'Mix must keep each card color')
  const saved = await page.evaluate(() => window.LOGYQBridge.snapshot())
  assert.equal(findNode(saved.tree, 'Node 08').color, '#fde68a')
  await page.evaluate((snap) => window.LOGYQBridge.loadMap(snap.tree, snap.wordBank), saved)
  const afterLoad = await page.evaluate(() => window.LOGYQBridge.snapshot().tree)
  assert.deepEqual(colorBagFromTree(afterLoad), colorBagFromTree(beforeMix), 'save/load must keep each card color')
  await page.waitForFunction(() => {
    const live = window.LOGYQBridge.core.state.root?.descendants().length || 0
    return live > 0 && document.querySelectorAll('svg#canvas g.node').length === live
  })

  const beforeCreate = await page.locator('svg#canvas g.node').count()
  const side = await nodeCenter('Node 04')
  await touch(side.x, side.y, side.x + 80, side.y, 54)
  await page.waitForFunction((count) => document.querySelectorAll('g.node').length > count, beforeCreate)

  await page.locator('#logyq-paint-btn').click()
  await page.waitForSelector('#logyq-paint-strip.is-open')
  await page.locator('#logyq-paint-strip [data-paint="off"]').click()
  await page.waitForFunction(() => window.LOGYQPreview.paint?.active === false)
  const beforeDownCreate = await page.locator('svg#canvas g.node').count()
  const createDown = await nodeCenter('Node 10')
  await touch(createDown.x, createDown.y, createDown.x, createDown.y + 70, 55)
  await page.waitForFunction((count) => document.querySelectorAll('g.node').length > count, beforeDownCreate)

  assert.deepEqual(errors, [])
  await context.close()
})

test('LOGYQ map-card drag ghost uses the Word Bank chip opacity', async () => {
  const context = await newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await stubMaps(context)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logyq/index.html`, { waitUntil: 'networkidle' })
  await waitForBoot(page)
  await loadSampleTree(page)
  const hold = await page.evaluate(() => {
    const node = Array.from(document.querySelectorAll('g.node')).find((element) => element.__data__?.data?.name === 'Node 03')
    const rect = node.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, parent: node.__data__?.parent?.data?._uid || null }
  })
  await page.evaluate(({ x, y }) => {
    document.getElementById('canvas').dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, cancelable: true, composed: true, pointerType: 'touch', pointerId: 77,
      isPrimary: true, button: 0, buttons: 1, clientX: x, clientY: y,
    }))
  }, hold)
  await page.waitForFunction(() => document.body.classList.contains('v2-branch-drag'))
  const ghost = await page.evaluate(() => {
    const preview = document.getElementById('logyq-v162-branch-preview')
    const chipRule = Array.from(document.styleSheets).flatMap((sheet) => {
      try { return Array.from(sheet.cssRules || []) } catch (_error) { return [] }
    }).find((rule) => rule.selectorText === '#logyq-chip-ghost .chip')
    return {
      opacity: preview ? getComputedStyle(preview).opacity : '',
      chip: chipRule?.style?.opacity || '',
    }
  })
  assert.equal(ghost.chip, '0.55')
  assert.equal(ghost.opacity, ghost.chip, 'map-card ghost must match the chip ghost opacity')
  await page.evaluate(({ x, y }) => {
    const canvas = document.getElementById('canvas')
    canvas.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true, cancelable: true, composed: true, pointerType: 'touch', pointerId: 77,
      isPrimary: true, button: 0, buttons: 0, clientX: x, clientY: y,
    }))
  }, hold)
  await page.waitForFunction(() => !document.body.classList.contains('v2-branch-drag'))
  assert.equal(await page.locator('#logyq-v162-branch-preview').count(), 0)
  const after = await page.evaluate(() => {
    const node = Array.from(document.querySelectorAll('g.node')).find((element) => element.__data__?.data?.name === 'Node 03')
    return node?.__data__?.parent?.data?._uid || null
  })
  assert.equal(after, hold.parent, 'releasing the faded ghost must not reparent')
  assert.deepEqual(errors, [])
  await context.close()
})

test('LOGYQ empty library stays a library, not a chooser or editor', async () => {
  const capture = []
  const context = await newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await stubMaps(context, { capture })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logyq/index.html`, { waitUntil: 'networkidle' })
  await waitForBoot(page)
  await assertNoChooser(page)
  await page.waitForSelector('#logiq-library.is-open')
  assert.equal(await page.locator('.node-edit-input').count(), 0)
  assert.equal(await page.locator('#logiq-new-map').count(), 1)
  assert.equal(await page.locator('#logyq-tab-maps').getAttribute('aria-selected'), 'true')
  assert.match((await page.locator('#logiq-map-list').innerText()), /No maps yet/)
  assert.equal(await page.locator('#logiq-new-map').isVisible(), true)
  assert.equal(await page.locator('#logyq-new-folder').isVisible(), true)
  assert.equal(await page.locator('#logyq-curriculum').isVisible(), false)
  await page.locator('#logyq-tab-curriculum').click()
  assert.equal(await page.locator('#logyq-tab-curriculum').getAttribute('aria-selected'), 'true')
  assert.equal(await page.locator('#logyq-curriculum [data-level]').count(), 8)
  assert.equal(await page.locator('[data-level="fruit"]').isDisabled(), false)
  assert.equal(await page.locator('[data-level="food"]').isDisabled(), true)
  assert.match(await page.locator('[data-level="food"]').getAttribute('aria-label'), /locked/)
  assert.doesNotMatch(await page.locator('#logyq-curriculum').innerText(), /Levels coming soon|lunch|recess/)
  assert.equal(await page.locator('#logiq-map-list').isVisible(), false)
  assert.equal(await page.locator('#logiq-new-map').isVisible(), false)
  assert.equal(await page.locator('#logyq-new-folder').isVisible(), false)
  assert.equal(await page.locator('#logyq-curriculum .logiq-map-row').count(), 0)
  await page.locator('#logyq-tab-maps').click()
  assert.equal(await page.locator('#logyq-tab-maps').getAttribute('aria-selected'), 'true')
  assert.match((await page.locator('#logiq-map-list').innerText()), /No maps yet/)
  assert.equal(await page.locator('#logiq-new-map').isVisible(), true)
  assert.equal(await page.locator('#logyq-new-folder').isVisible(), true)
  await page.waitForTimeout(950)
  assert.ok(capture.every((request) => request.name !== 'logiq_map_save'))
  assert.deepEqual(errors, [])
  await context.close()
})

test('LOGYQ curriculum level 1 starts mixed on the map and unlocks level 2', async () => {
  const capture = []
  const context = await newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await stubMaps(context, { capture })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logyq/index.html`, { waitUntil: 'networkidle' })
  await waitForBoot(page)
  await page.locator('#logyq-tab-curriculum').click()
  await page.locator('[data-level="fruit"]').click()
  await page.waitForFunction(() => {
    const names = Array.from(document.querySelectorAll('g.node:not(.logyq-pile)')).map((el) => el.__data__?.data?.name)
    const start = document.getElementById('logyq-curriculum-start')
    return names.length === 3
      && document.body.dataset.curriculumPhase === 'gate'
      && start && !start.hidden
      && !!document.querySelector('.logyq-curriculum-frost')
  })
  const opened = await page.evaluate(() => {
    const hidden = (id) => getComputedStyle(document.getElementById(id)).display === 'none'
    const cards = Array.from(document.querySelectorAll('g.node:not(.logyq-pile)'))
    const names = cards.map((el) => el.__data__?.data?.name).sort()
    const depths = new Set(cards.map((el) => el.__data__.depth))
    const answer = window.LOGYQPreview.curriculum.matches(
      window.LOGYQPreview.curriculum.pack().find((level) => level.id === 'fruit').tree,
      window.LOGYQBridge.snapshot().tree,
    )
    return {
      chips: document.querySelectorAll('#Dock .chip').length,
      names,
      roots: cards.filter((el) => !el.__data__?.parent).length,
      linked: cards.some((el) => (el.__data__?.children || []).length > 0),
      depths: depths.size,
      pile: !!document.querySelector('g.node.logyq-pile'),
      answer,
      dock: hidden('Dock'),
      trash: hidden('trash'),
      warehouse: hidden('logyq-warehouse'),
      bankTrash: hidden('logyq-bank-trash'),
      title: document.getElementById('logyq-curriculum-status')?.textContent || '',
      playing: document.body.classList.contains('logyq-curriculum'),
      phase: document.body.dataset.curriculumPhase || '',
      start: document.getElementById('logyq-curriculum-start')?.hidden === false,
      frost: getComputedStyle(document.querySelector('.logyq-curriculum-frost')).backgroundColor,
    }
  })
  assert.equal(opened.chips, 0)
  assert.deepEqual(opened.names, ['apple', 'banana', 'fruit'])
  assert.equal(opened.roots, 1)
  assert.equal(opened.linked, true)
  assert.ok(opened.depths > 1, `Fruit start should use Mix depth, depths=${opened.depths}`)
  assert.equal(opened.pile, false)
  assert.equal(opened.answer, false)
  assert.equal(opened.dock, true)
  assert.equal(opened.trash, true)
  assert.equal(opened.warehouse, true)
  assert.equal(opened.bankTrash, true)
  assert.equal(opened.playing, true)
  assert.equal(opened.phase, 'gate')
  assert.equal(opened.start, true)
  assert.match(opened.frost, /244,\s*241,\s*228/)
  assert.match(opened.title, /Fruit/)
  assert.equal(await page.locator('#logyq-curriculum-start').isVisible(), true)
  assert.equal(await page.locator('#logyq-curriculum-check').isVisible(), false)
  assert.equal(await page.locator('#logyq-curriculum-mix').isVisible(), false)
  assert.equal(await page.locator('#logyq-curriculum').innerText().then((text) => text.includes('Word Bank')), false)

  const gateCamera = await page.evaluate(() => {
    const t = window.d3.zoomTransform(document.getElementById('canvas'))
    return { x: t.x, y: t.y, k: t.k }
  })
  await page.locator('#logyq-curriculum-start').click()
  await page.waitForTimeout(450)
  const midShuffle = await page.evaluate((before) => {
    const t = window.d3.zoomTransform(document.getElementById('canvas'))
    const gate = document.getElementById('logyq-curriculum-gate')
    const frost = document.querySelector('.logyq-curriculum-frost')
    const blurOf = (el, pseudo) => {
      if (!el) return 'none'
      const live = getComputedStyle(el, pseudo)
      return live.backdropFilter || live.webkitBackdropFilter || 'none'
    }
    return {
      phase: document.body.dataset.curriculumPhase,
      x: t.x,
      y: t.y,
      k: t.k,
      same: Math.abs(t.x - before.x) < 0.5 && Math.abs(t.y - before.y) < 0.5 && Math.abs(t.k - before.k) < 0.001,
      gateHidden: !gate || gate.hidden || getComputedStyle(gate).display === 'none',
      frostBlur: blurOf(frost),
      gateBefore: blurOf(gate, '::before'),
      gateAfter: blurOf(gate, '::after'),
    }
  }, gateCamera)
  assert.equal(midShuffle.phase, 'shuffle')
  assert.equal(midShuffle.same, true, `camera moved during shuffle x=${midShuffle.x} y=${midShuffle.y} k=${midShuffle.k}`)
  assert.equal(midShuffle.gateHidden, true, 'haze gate should leave the stack once Start fades')
  assert.equal(midShuffle.frostBlur, 'none')
  assert.equal(midShuffle.gateBefore, 'none')
  assert.equal(midShuffle.gateAfter, 'none')

  await page.waitForFunction(() => document.body.dataset.curriculumPhase === 'play', null, { timeout: 12000 })
  assert.equal(await page.locator('#logyq-curriculum-start').isVisible(), false)
  assert.equal(await page.locator('#logyq-curriculum-check').isVisible(), true)
  assert.equal(await page.locator('#logyq-curriculum-mix').isVisible(), true)
  assert.equal(await page.evaluate(() => {
    const svg = document.getElementById('canvas')
    const before = window.d3.zoomTransform(svg).k
    svg.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, clientX: 180, clientY: 400, bubbles: true, cancelable: true }))
    return window.d3.zoomTransform(svg).k === before
  }), true)
  const rootBeforeMix = await page.evaluate(() => {
    const root = Array.from(document.querySelectorAll('g.node')).find((el) => !el.__data__?.parent)
    const box = root.getBoundingClientRect()
    const t = window.d3.zoomTransform(document.getElementById('canvas'))
    return { y: box.top + box.height / 2, k: t.k }
  })

  const beforeKey = await page.evaluate(() => window.LOGYQPreview.curriculum.structureKey(window.LOGYQBridge.snapshot().tree))
  const mixing = await page.evaluate(() => {
    window.__logyqCurriculumMix()
    const gate = document.getElementById('logyq-curriculum-gate')
    const frost = document.querySelector('.logyq-curriculum-frost')
    const frostStyle = frost ? getComputedStyle(frost) : null
    return {
      reposition: window.LOGYQBridge.core.state.repositionMode,
      phase: document.body.dataset.curriculumPhase,
      gateHidden: !gate || gate.hidden || getComputedStyle(gate).display === 'none',
      frostBlur: frostStyle ? (frostStyle.backdropFilter || frostStyle.webkitBackdropFilter || 'none') : 'none',
    }
  })
  const mixedSpread = await page.evaluate((previous) => {
    const cards = window.LOGYQBridge.core.state.root.descendants()
    const depths = new Set(cards.map((node) => node.depth))
    return {
      key: window.LOGYQPreview.curriculum.structureKey(window.LOGYQBridge.snapshot().tree),
      previous,
      roots: cards.filter((node) => !node.parent).length,
      linked: cards.some((node) => (node.children || []).length > 0),
      depths: depths.size,
      pile: !!window.LOGYQBridge.snapshot().tree?.curriculumPile,
    }
  }, beforeKey)
  assert.equal(mixing.reposition, 'mix')
  assert.equal(mixing.phase, 'shuffle')
  assert.equal(mixing.gateHidden, true, 're-Mix must not put the haze back over the cards')
  assert.equal(mixing.frostBlur, 'none')
  assert.notEqual(mixedSpread.key, mixedSpread.previous)
  assert.equal(mixedSpread.roots, 1)
  assert.equal(mixedSpread.linked, true)
  assert.ok(mixedSpread.depths > 1, `Mix should keep a tree, depths=${mixedSpread.depths}`)
  assert.equal(mixedSpread.pile, false)
  await page.waitForFunction(() => {
    const cards = Array.from(document.querySelectorAll('g.node'))
    const boxes = cards.map((el) => el.getBoundingClientRect()).filter((box) => box.width > 8)
    if (boxes.length < 3) return false
    const left = Math.min(...boxes.map((box) => box.left))
    const right = Math.max(...boxes.map((box) => box.right))
    const top = Math.min(...boxes.map((box) => box.top))
    const bottom = Math.max(...boxes.map((box) => box.bottom))
    const bar = document.getElementById('logyq-curriculum-bar')?.getBoundingClientRect()
    const usableTop = bar && bar.height > 2 ? bar.bottom : 0
    const vw = window.innerWidth
    const vh = window.innerHeight
    const wide = right - left
    const tall = bottom - top
    const k = window.d3.zoomTransform(document.getElementById('canvas')).k
    const fits = left >= 4 && right <= vw - 4 && top >= usableTop + 2 && bottom <= vh - 8
    const overview = wide <= vw * 0.92 && tall <= (vh - usableTop) * 0.92
    return fits && overview && k <= 1.2 && k >= 0.2 && document.body.dataset.curriculumPhase === 'play'
  }, null, { timeout: 12000 })
  const rootAfterMix = await page.evaluate(() => {
    const root = Array.from(document.querySelectorAll('g.node')).find((el) => !el.__data__?.parent)
    const box = root.getBoundingClientRect()
    return box.top + box.height / 2
  })
  assert.ok(Math.abs(rootAfterMix - rootBeforeMix.y) < 14, `root bobbed from ${rootBeforeMix.y} to ${rootAfterMix}`)
  assert.equal(await page.evaluate(() => window.LOGYQBridge.core.state.wordBank.length), 0)
  const fruitUid = await page.evaluate(() => document.querySelector('g.node:not(.logyq-pile)')?.__data__?.data?._uid)
  const beforeNodes = await page.evaluate(() => document.querySelectorAll('g.node').length)
  await page.evaluate((uid) => window.LOGYQBridge.createRelative('down', uid), fruitUid)
  await page.evaluate((uid) => window.LOGYQBridge.editSelected({ uid }), fruitUid)
  assert.equal(await page.evaluate(() => document.querySelectorAll('g.node').length), beforeNodes)
  assert.equal(await page.locator('.node-edit-input').count(), 0)

  await page.evaluate(() => {
    const core = window.LOGYQBridge.core
    const tree = {
      name: '',
      curriculumPile: true,
      children: [{ name: 'fruit', children: [{ name: 'apple', children: [{ name: 'banana' }] }] }],
    }
    core.utils.assignUids(tree)
    core.state.wordBank = []
    core.state.root = window.d3.hierarchy(tree)
    core.utils.assignIds(core.state.root)
    core.wordDock.render()
    core.treeManager.layoutAndRender(false)
  })
  await page.locator('#logyq-curriculum-check').click()
  assert.match(await page.locator('#logyq-curriculum-status').innerText(), /Not yet/)
  assert.equal(await page.evaluate(() => localStorage.getItem('logyq_curriculum_progress_v1')), null)

  await page.evaluate(() => {
    const core = window.LOGYQBridge.core
    const tree = {
      name: '',
      curriculumPile: true,
      children: [{ name: 'fruit', children: [{ name: 'banana' }, { name: 'apple' }] }],
    }
    core.utils.assignUids(tree)
    core.state.wordBank = []
    core.state.root = window.d3.hierarchy(tree)
    core.utils.assignIds(core.state.root)
    core.wordDock.render()
    core.treeManager.layoutAndRender(false)
  })
  await page.locator('#logyq-curriculum-check').click()
  await page.waitForFunction(() => /Fruit cleared/.test(document.getElementById('logyq-curriculum-status')?.textContent || ''))
  const progress = await page.evaluate(() => JSON.parse(localStorage.getItem('logyq_curriculum_progress_v1')))
  assert.equal(typeof progress.levels.fruit.clearedAt, 'string')
  assert.equal(typeof progress.levels.fruit.ms, 'number')
  await page.locator('#logyq-curriculum-levels').click()
  await page.waitForFunction(() => {
    const food = document.querySelector('[data-level="food"]')
    const tab = document.getElementById('logyq-tab-curriculum')
    return food && !food.disabled && tab?.getAttribute('aria-selected') === 'true'
  })
  assert.match(await page.locator('[data-level="fruit"]').getAttribute('aria-label'), /cleared/)
  assert.equal(await page.locator('[data-level="body"]').isDisabled(), true)
  await page.locator('#logyq-tab-maps').click()
  assert.match(await page.locator('#logiq-map-list').innerText(), /No maps yet/)
  assert.equal(await page.locator('#logiq-new-map').isVisible(), true)
  await page.waitForTimeout(1000)
  assert.ok(capture.every((request) => request.name !== 'logiq_map_save'))
  assert.deepEqual(errors, [])
  await context.close()
})

test('LOGYQ curriculum above-root reparent uses the normal map gesture', async () => {
  const context = await newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await stubMaps(context)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logyq/index.html`, { waitUntil: 'networkidle' })
  await waitForBoot(page)
  await page.locator('#logyq-tab-curriculum').click()
  await page.locator('[data-level="fruit"]').click()
  await page.waitForFunction(() => document.body.dataset.curriculumPhase === 'gate' && document.querySelectorAll('g.node').length === 3)
  await page.locator('#logyq-curriculum-start').click()
  await page.waitForFunction(() => document.body.dataset.curriculumPhase === 'play', null, { timeout: 12000 })
  await page.waitForFunction(() => {
    const cards = Array.from(document.querySelectorAll('g.node'))
    const boxes = cards.map((el) => el.getBoundingClientRect()).filter((box) => box.width > 8)
    if (boxes.length < 3) return false
    const left = Math.min(...boxes.map((box) => box.left))
    const right = Math.max(...boxes.map((box) => box.right))
    const top = Math.min(...boxes.map((box) => box.top))
    const bottom = Math.max(...boxes.map((box) => box.bottom))
    const bar = document.getElementById('logyq-curriculum-bar')?.getBoundingClientRect()
    const usableTop = bar && bar.height > 2 ? bar.bottom : 0
    const fits = left >= 4 && right <= window.innerWidth - 4 && top >= usableTop + 2 && bottom <= window.innerHeight - 8
    const k = window.d3.zoomTransform(document.getElementById('canvas')).k
    return fits && k <= 1.2 && k >= 0.2
  }, null, { timeout: 8000 })

  async function touch(type, x, y, pointerId = 61) {
    await page.evaluate(({ type, x, y, pointerId }) => {
      document.getElementById('canvas').dispatchEvent(new PointerEvent(type, {
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

  const plan = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('svg#canvas g.node'))
    const root = nodes.find((el) => !el.__data__?.parent)
    const moving = nodes.find((el) => el.__data__?.parent)
    const rootBox = root.getBoundingClientRect()
    const moveBox = moving.getBoundingClientRect()
    const lift = window.LOGYQPreview.gestures.liftPx()
    return {
      rootName: root.__data__.data.name,
      movingName: moving.__data__.data.name,
      movingUid: moving.__data__.data._uid,
      rootUid: root.__data__.data._uid,
      from: { x: moveBox.left + moveBox.width / 2, y: moveBox.top + moveBox.height / 2 },
      above: { x: rootBox.left + rootBox.width / 2, y: rootBox.top - 24 + lift },
      onRoot: { x: rootBox.left + rootBox.width / 2, y: rootBox.top + rootBox.height / 2 + lift },
      count: nodes.length,
    }
  })

  await touch('pointerdown', plan.from.x, plan.from.y)
  await page.waitForTimeout(320)
  assert.equal(await page.evaluate(() => document.body.classList.contains('v2-branch-drag')), true)

  await touch('pointermove', plan.onRoot.x, plan.onRoot.y)
  await page.waitForTimeout(120)
  const onCard = await page.evaluate(() => {
    const drop = window.LOGYQBridge.core.state.dragState.drop
    return { type: drop?.type || null, target: drop?.targetUid || null }
  })
  assert.equal(onCard.type, 'node', 'ghost centered on the root card still attaches as a child')
  assert.equal(onCard.target, plan.rootUid)

  await touch('pointermove', plan.above.x, plan.above.y)
  await page.waitForTimeout(120)
  const above = await page.evaluate(() => {
    const drop = window.LOGYQBridge.core.state.dragState.drop
    const caret = document.querySelector('svg#canvas .caret-dot')
    return { type: drop?.type || null, caret: caret ? Number(getComputedStyle(caret).opacity) : 0 }
  })
  assert.equal(above.type, 'rootAbove')
  assert.ok(above.caret > 0.5, 'above-root targeting still shows the caret')

  await touch('pointerup', plan.above.x, plan.above.y)
  await page.waitForTimeout(500)
  const after = await page.evaluate(() => {
    const root = window.LOGYQBridge.snapshot().tree
    const hidden = (id) => getComputedStyle(document.getElementById(id)).display === 'none'
    return {
      root: root.name,
      childNames: (root.children || []).map((child) => child.name),
      count: document.querySelectorAll('g.node').length,
      dock: hidden('Dock'),
      trash: hidden('trash'),
      warehouse: hidden('logyq-warehouse'),
      bank: window.LOGYQBridge.core.state.wordBank.length,
      pile: !!root.curriculumPile,
    }
  })
  assert.equal(after.root, plan.movingName)
  assert.ok(after.childNames.includes(plan.rootName), `old root should sit under ${plan.movingName}, children=${after.childNames.join(',')}`)
  assert.equal(after.count, plan.count)
  assert.equal(after.dock, true)
  assert.equal(after.trash, true)
  assert.equal(after.warehouse, true)
  assert.equal(after.bank, 0)
  assert.equal(after.pile, false)

  await page.evaluate((uid) => window.LOGYQBridge.createRelative('down', uid), plan.movingUid)
  await page.evaluate((uid) => window.LOGYQBridge.editSelected({ uid }), plan.movingUid)
  assert.equal(await page.evaluate(() => document.querySelectorAll('g.node').length), plan.count)
  assert.equal(await page.locator('.node-edit-input').count(), 0)

  await page.keyboard.press('u')
  await page.waitForTimeout(400)
  assert.equal(await page.evaluate(() => window.LOGYQBridge.snapshot().tree.name), plan.rootName)
  assert.deepEqual(errors, [])
  await context.close()
})

test('LOGYQ normal map above-root reparent still promotes the dragged card', async () => {
  const context = await newContext({ viewport: { width: 1280, height: 800 } })
  await stubMaps(context)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logyq/index.html`, { waitUntil: 'networkidle' })
  await waitForBoot(page)
  await page.evaluate(() => {
    window.LOGYQPreview.app.hasOpenMap = true
    document.body.classList.add('logyq-map-open')
    document.body.classList.remove('logyq-home', 'logyq-curriculum')
    const library = document.getElementById('logiq-library')
    library?.classList.remove('is-open')
    library?.setAttribute('aria-hidden', 'true')
    const tree = { name: 'maple', children: [{ name: 'leaf' }, { name: 'twig' }] }
    window.LOGYQBridge.core.utils.assignUids(tree)
    window.LOGYQBridge.loadMap(tree, [])
    window.LOGYQBridge.fit()
  })
  await page.waitForFunction(() => document.querySelectorAll('g.node').length === 3)
  await page.waitForTimeout(500)
  const boxes = await page.evaluate(() => {
    const byName = (name) => Array.from(document.querySelectorAll('g.node')).find((el) => el.__data__?.data?.name === name)
    const box = (el) => {
      const rect = el.getBoundingClientRect()
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, top: rect.top }
    }
    return { leaf: box(byName('leaf')), maple: box(byName('maple')) }
  })
  await page.mouse.move(boxes.leaf.x, boxes.leaf.y)
  await page.mouse.down()
  await page.mouse.move(boxes.leaf.x + 14, boxes.leaf.y - 14, { steps: 4 })
  await page.mouse.move(boxes.maple.x, boxes.maple.top - 48, { steps: 12 })
  await page.waitForTimeout(120)
  assert.equal(await page.evaluate(() => window.LOGYQBridge.core.state.dragState.drop?.type), 'rootAbove')
  await page.mouse.up()
  await page.waitForTimeout(450)
  const tree = await page.evaluate(() => window.LOGYQBridge.snapshot().tree)
  assert.equal(tree.name, 'leaf')
  assert.ok((tree.children || []).some((child) => child.name === 'maple'))
  assert.equal(await page.evaluate(() => document.body.classList.contains('logyq-curriculum')), false)
  assert.deepEqual(errors, [])
  await context.close()
})

test('LOGYQ missing Lab PIN asks to connect and does not claim the library is empty', async () => {
  const capture = []
  const context = await newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, pin: null })
  await stubMaps(context, {
    capture,
    acceptPin: 'test-pin',
    maps: [
      { id: 'animals', name: 'Animals', tree: { name: 'Animals', formatVersion: 2 }, word_bank: [], updated_at: '2026-09-22T00:12:35.000Z' },
      { id: 'logyq-2', name: 'LOGYQ 2', tree: { name: 'LOGYQ 2', formatVersion: 2 }, word_bank: [], updated_at: '2026-09-22T00:11:39.000Z' },
      { id: 'logyq', name: 'LOGYQ', tree: { name: 'LOGYQ', formatVersion: 2 }, word_bank: [], updated_at: '2026-09-22T00:10:03.000Z' },
    ],
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logyq/index.html`, { waitUntil: 'networkidle' })
  await page.waitForSelector('#logiq-pin.is-open')
  assert.doesNotMatch(await page.locator('#logiq-map-list').innerText(), /No maps yet/)
  await page.locator('#logiq-pin-cancel').click()
  await waitForBoot(page)
  const locked = await page.locator('#logiq-map-list').innerText()
  assert.match(locked, /still saved/)
  assert.doesNotMatch(locked, /No maps yet/)
  await page.locator('[data-connect]').click()
  await page.waitForSelector('#logiq-pin.is-open')
  await page.locator('#logiq-pin-input').fill('0000')
  await page.locator('#logiq-pin-form button[type="submit"]').click()
  await page.waitForSelector('.logiq-pin-error.is-visible')
  assert.match(await page.locator('.logiq-pin-error').innerText(), /still saved/)
  assert.doesNotMatch(await page.locator('#logiq-map-list').innerText(), /No maps yet/)
  await page.locator('#logiq-pin-input').fill('test-pin')
  await page.locator('#logiq-pin-form button[type="submit"]').click()
  await page.waitForSelector('.logiq-map-name')
  const names = await page.locator('.logiq-map-name').allTextContents()
  assert.ok(names.includes('Animals'))
  assert.ok(names.includes('LOGYQ'))
  assert.ok(names.includes('LOGYQ 2'))
  assert.equal(capture.filter((request) => request.name === 'logiq_map_list').at(-1)?.body?.pin, 'test-pin')
  assert.deepEqual(errors, [])
  await context.close()
})

test('LOGYQ landscape edge chrome is full-bleed with paint on the rail and maps in the menu', async () => {
  const context = await newContext({ viewport: { width: 667, height: 375 }, isMobile: true, hasTouch: true })
  await stubMaps(context)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logyq/index.html`, { waitUntil: 'networkidle' })
  await waitForBoot(page)
  await loadSampleTree(page)
  const canvas = await page.locator('svg#canvas').boundingBox()
  assert.ok(canvas.x <= 1, `canvas x ${canvas.x} should stay full-bleed`)
  assert.ok(canvas.width >= 660, `canvas width ${canvas.width} should fill the landscape viewport`)
  assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('logiq-mobile-header')).display), 'contents')
  const cluster = await page.locator('#logyq-corner-cluster').boundingBox()
  assert.ok(cluster.width < 80, `corner cluster width ${cluster.width} should stay a narrow rail`)
  assert.ok(cluster.height < 360, `corner cluster height ${cluster.height} should not span the screen`)
  assert.ok(cluster.x > 520, `corner cluster x ${cluster.x} should sit on the right`)
  assert.equal(await page.locator('#logyq-select-strip').isVisible(), false)
  assert.equal(await page.locator('#logiq-mobile-word-input').isVisible(), false)
  assert.equal(await page.locator('#logiq-mobile-mic-btn').isVisible(), false)
  assert.equal(await page.locator('#logyq-home-btn').isVisible(), false)
  const paint = await page.locator('#logyq-paint-btn').boundingBox()
  const undo = await page.locator('#logyq-corner-cluster [data-tool="undo"]').boundingBox()
  assert.ok(paint.y < undo.y, `paint y ${paint.y} should sit above undo y ${undo.y}`)
  assert.ok(Math.abs(paint.x - undo.x) < 12, 'paint should sit in the right rail')
  await page.locator('#logyq-paint-btn').click()
  await page.waitForSelector('#logyq-paint-strip.is-open')
  const palette = await page.locator('#logyq-paint-strip').boundingBox()
  assert.ok(palette.width > 200 && palette.width < 430, `palette width ${palette.width} should hug the swatches`)
  assert.ok(palette.x + palette.width <= cluster.x + 4, `palette should end at the rail, not stretch across the screen`)
  await page.locator('#logiq-mobile-menu-btn').click()
  await page.locator('#logiq-mobile-panel [data-tool="library"]').click()
  await page.waitForSelector('#logiq-library.is-open')
  const library = await page.locator('#logiq-library').boundingBox()
  assert.ok(library.width > 640, `library width ${library.width} should overlay the screen`)
  assert.deepEqual(errors, [])
  await context.close()
})

test('LOGYQ library lists recents and New opens a calm one-card canvas', async () => {
  const capture = []
  const context = await newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await stubMaps(context, {
    capture,
    maps: [
      {
        id: 'old',
        name: 'Older map',
        tree: { name: 'Old root', formatVersion: 2 },
        word_bank: [],
        updated_at: '2026-09-20T12:00:00.000Z',
      },
      {
        id: 'sky',
        name: 'Recent sky',
        tree: { name: 'Sky root', color: '#fde68a', formatVersion: 2 },
        word_bank: [],
        updated_at: '2026-09-21T18:00:00.000Z',
      },
    ],
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logyq/index.html`, { waitUntil: 'networkidle' })
  await waitForBoot(page)
  await assertNoChooser(page)
  await page.waitForSelector('#logiq-library.is-open')
  assert.deepEqual(await page.locator('.logiq-map-name').allTextContents(), ['Recent sky', 'Older map'])
  await page.locator('.logiq-map-name', { hasText: 'Recent sky' }).click()
  await page.waitForFunction(() => !document.getElementById('logiq-library')?.classList.contains('is-open'))
  assert.equal(await page.locator('g.node').count(), 1)
  assert.equal(await page.evaluate(() => window.LOGYQBridge.snapshot().tree.color), '#fde68a')
  assert.equal(await page.locator('.node-edit-input').count(), 0)
  await page.locator('#logiq-mobile-menu-btn').click()
  await page.locator('#logiq-mobile-panel [data-tool="library"]').click()
  await page.waitForSelector('#logiq-library.is-open')
  await page.locator('#logiq-new-map').click()
  await page.waitForFunction(() => !document.getElementById('logiq-library')?.classList.contains('is-open'))
  await page.waitForFunction(() => {
    const live = window.LOGYQBridge.core.state.root?.descendants().length || 0
    return live === 1 && document.querySelectorAll('svg#canvas g.nodes g.node').length === 1
  })
  assert.equal(await page.locator('svg#canvas g.nodes g.node').count(), 1)
  assert.equal(await page.locator('.node-edit-input').count(), 0)
  await page.waitForTimeout(950)
  assert.ok(capture.every((request) => request.name !== 'logiq_map_save'))
  await page.locator('#logiq-mobile-menu-btn').click()
  await page.locator('#logiq-mobile-panel [data-tool="library"]').click()
  await page.waitForSelector('#logiq-library.is-open')
  await page.waitForSelector('.logiq-map-name')
  assert.deepEqual(await page.locator('.logiq-map-name').allTextContents(), ['Recent sky', 'Older map'])
  assert.equal(await page.evaluate(() => document.body.classList.contains('logyq-map-open')), false)
  await assertNoChooser(page)
  assert.deepEqual(errors, [])
  await context.close()
})

test('LOGYQ open map pulls a newer database row and notes it above the rename field', async () => {
  const capture = []
  const context = await newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const store = await stubMaps(context, {
    capture,
    maps: [{
      id: 'sky',
      name: 'Recent sky',
      tree: {
        name: 'Sky',
        formatVersion: 2,
        _uid: 'root',
        children: [{ name: 'Cloud', _uid: 'cloud' }],
      },
      word_bank: [],
      updated_at: '2026-09-22T00:00:00.000Z',
    }],
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logyq/index.html`, { waitUntil: 'networkidle' })
  await waitForBoot(page)
  await page.locator('.logiq-map-name', { hasText: 'Recent sky' }).click()
  await page.waitForFunction(() => window.LOGYQBridge.snapshot().tree?.children?.[0]?.name === 'Cloud')
  await page.waitForFunction(() => document.body.classList.contains('logyq-mobile-v162'))

  store.maps[0].tree = {
    name: 'Sky',
    formatVersion: 2,
    _uid: 'root',
    children: [{ name: 'Storm', _uid: 'cloud' }],
  }
  store.maps[0].updated_at = '2026-09-23T00:00:00.000Z'
  await page.evaluate(() => window.LOGYQPreview.sync.pullRemote())
  await page.waitForFunction(() => window.LOGYQBridge.snapshot().tree?.children?.[0]?.name === 'Storm')
  assert.ok(capture.filter((request) => request.name === 'logiq_map_save').every((request) => {
    return request.body?.map_tree?.children?.[0]?.name !== 'Cloud'
  }))

  const uid = await page.evaluate(() => {
    const id = window.LOGYQBridge.snapshot().tree.children[0]._uid
    window.LOGYQBridge.editSelected({ uid: id })
    return id
  })
  await page.waitForSelector('.node-edit-stack.is-placed .node-edit-input')
  await page.locator('.node-edit-input').fill('Hail')
  store.maps[0].tree = {
    name: 'Sky',
    formatVersion: 2,
    _uid: 'root',
    children: [{ name: 'Squall', _uid: 'cloud' }],
  }
  store.maps[0].updated_at = '2026-09-23T01:00:00.000Z'
  await page.evaluate(() => window.LOGYQPreview.sync.pullRemote())
  await page.waitForSelector('#logyq-db-bubble[data-anchor="field"]:not([hidden])')
  assert.equal(await page.locator('#logyq-db-bubble').innerText(), 'Database change came in.')
  assert.equal(await page.locator('#logyq-db-bubble').evaluate((el) => el.tagName), 'DIV')
  const boxes = await page.evaluate(() => {
    const note = document.getElementById('logyq-db-bubble')
    const input = document.querySelector('.node-edit-input')
    const card = document.querySelector('svg#canvas g.node')
    const noteBox = note.getBoundingClientRect()
    const inputBox = input.getBoundingClientRect()
    const cardBox = card.getBoundingClientRect()
    return {
      noteTop: noteBox.top,
      noteBottom: noteBox.bottom,
      inputTop: inputBox.top,
      cardBottom: cardBox.bottom,
      anchor: note.dataset.anchor || '',
    }
  })
  assert.equal(boxes.anchor, 'field')
  assert.ok(boxes.noteBottom <= boxes.inputTop + 2, `note bottom ${boxes.noteBottom} should sit on the input top ${boxes.inputTop}`)
  assert.ok(boxes.cardBottom < boxes.noteTop, `map card bottom ${boxes.cardBottom} should stay above the note top ${boxes.noteTop}`)
  assert.equal(await page.locator('.node-edit-input').inputValue(), 'Hail')
  assert.equal(await page.evaluate(() => window.LOGYQBridge.snapshot().tree.children[0].name), 'Hail')
  assert.equal(await page.locator('#logyq-db-bubble').evaluate((el) => getComputedStyle(el).pointerEvents), 'none')
  store.maps[0].tree = {
    name: 'Sky',
    formatVersion: 2,
    _uid: 'root',
    children: [{ name: 'Gust', _uid: 'cloud' }, { name: 'Rain', _uid: 'rain' }],
  }
  store.maps[0].updated_at = '2026-09-23T02:00:00.000Z'
  await page.evaluate(() => window.LOGYQPreview.sync.pullRemote())
  await page.waitForSelector('#logyq-db-bubble:not([hidden])')
  await page.locator('.node-edit-input').press('Enter')
  await page.waitForFunction(() => {
    const tree = window.LOGYQBridge.snapshot().tree
    const names = (tree.children || []).map((node) => node.name)
    return names.includes('Hail') && names.includes('Rain')
  })
  await page.waitForTimeout(1200)
  const hailSave = capture.find((request) => request.name === 'logiq_map_save' && request.body?.map_tree?.children?.some((node) => node.name === 'Hail'))
  assert.ok(hailSave, 'Enter should save the typed name')
  assert.ok(hailSave.body.map_tree.children.some((node) => node.name === 'Rain'), 'remote sibling should survive the save')
  assert.equal(uid, 'cloud')
  assert.deepEqual(errors, [])
  await context.close()
})

test('LOGYQ flick-created blank double-tap renames only that card', async () => {
  const context = await newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await stubMaps(context)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logyq/index.html`, { waitUntil: 'networkidle' })
  await waitForBoot(page)
  await loadSampleTree(page)

  async function faceCenter(predicate) {
    return page.evaluate((fn) => {
      const match = new Function(`return (${fn})`)()
      const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find(match)
      const face = node?.querySelector('rect:not(.grabzone)') || node
      const rect = face.getBoundingClientRect()
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        uid: node?.__data__?.data?._uid || '',
        name: node?.__data__?.data?.name || '',
      }
    }, predicate)
  }

  async function touch(type, x, y, pointerId) {
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

  const origin = await faceCenter('(node) => node.__data__?.data?.name === "Node 10"')
  const beforeTransforms = await page.evaluate(() => Object.fromEntries(Array.from(document.querySelectorAll('svg#canvas g.node')).map((node) => [node.__data__.data._uid, node.getAttribute('transform')])))
  const beforeView = await page.evaluate(() => {
    const t = window.d3.zoomTransform(document.getElementById('canvas'))
    return { x: t.x, y: t.y, k: t.k }
  })
  const before = await page.locator('svg#canvas g.node').count()
  await touch('pointerdown', origin.x, origin.y, 71)
  await touch('pointerup', origin.x, origin.y + 70, 71)
  await page.waitForFunction((count) => document.querySelectorAll('svg#canvas g.node').length > count, before)
  const motion = await page.evaluate(({ beforeTransforms, beforeView }) => {
    const t = window.d3.zoomTransform(document.getElementById('canvas'))
    const snapped = []
    for (const node of document.querySelectorAll('svg#canvas g.node')) {
      const uid = node.__data__?.data?._uid
      if (!beforeTransforms[uid]) continue
      const laid = `translate(${node.__data__.x},${node.__data__.y})`
      const now = node.getAttribute('transform')
      if (beforeTransforms[uid] !== laid && now === laid) snapped.push(uid)
    }
    return {
      snapped,
      camera: Math.hypot(t.x - beforeView.x, t.y - beforeView.y) + Math.abs(t.k - beforeView.k),
    }
  }, { beforeTransforms, beforeView })
  assert.deepEqual(motion.snapped, [], 'flick-down must tween existing cards, not snap the tree')
  assert.ok(motion.camera < 2, 'flick-down must leave the camera')

  const blank = await faceCenter(`(node) => {
    const data = node.__data__
    return data?.parent?.data?.name === 'Node 10' && !(data?.data?.name || '').trim()
  }`)
  assert.ok(blank.uid, 'flick-down should create a blank child under Node 10')
  assert.notEqual(blank.uid, origin.uid)

  await touch('pointerdown', blank.x, blank.y, 72)
  await touch('pointerup', blank.x, blank.y, 72)
  await touch('pointerdown', blank.x, blank.y, 73)
  await touch('pointerup', blank.x, blank.y, 73)
  await page.waitForSelector('.node-edit-input')
  const editing = await page.evaluate(() => window.LOGYQBridge.core.state.editingUid)
  assert.equal(editing, blank.uid, 'editor must bind to the flick-created blank, not the origin')
  await page.locator('.node-edit-input').fill('cat')
  await page.locator('.node-edit-input').press('Enter')
  await page.waitForFunction(() => Array.from(document.querySelectorAll('svg#canvas g.node')).some((node) => node.__data__?.data?.name === 'cat'))

  const afterBlank = await page.evaluate(() => {
    const names = Array.from(document.querySelectorAll('svg#canvas g.node')).map((node) => node.__data__?.data?.name)
    const cat = Array.from(document.querySelectorAll('svg#canvas g.node')).find((node) => node.__data__?.data?.name === 'cat')
    return {
      names,
      catParent: cat?.__data__?.parent?.data?.name || null,
      node10: names.filter((name) => name === 'Node 10').length,
    }
  })
  assert.equal(afterBlank.names.filter((name) => name === 'cat').length, 1)
  assert.equal(afterBlank.catParent, 'Node 10')
  assert.equal(afterBlank.node10, 1)

  const named = await faceCenter('(node) => node.__data__?.data?.name === "Node 08"')
  await touch('pointerdown', named.x, named.y, 74)
  await touch('pointerup', named.x, named.y, 74)
  await touch('pointerdown', named.x, named.y, 75)
  await touch('pointerup', named.x, named.y, 75)
  await page.waitForSelector('.node-edit-input')
  await page.locator('.node-edit-input').fill('Tapped 08')
  await page.locator('.node-edit-input').press('Enter')
  await page.waitForFunction(() => Array.from(document.querySelectorAll('svg#canvas g.node')).some((node) => node.__data__?.data?.name === 'Tapped 08'))
  assert.equal(await page.evaluate(() => {
    const names = Array.from(document.querySelectorAll('svg#canvas g.node')).map((node) => node.__data__?.data?.name)
    return names.filter((name) => name === 'cat').length === 1 && names.includes('Tapped 08') && names.includes('Node 10')
  }), true)

  assert.deepEqual(errors, [])
  await context.close()
})

test('LOGYQ flick left/right/up create as calmly as down-on-leaf', async () => {
  const context = await newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await stubMaps(context)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logyq/index.html`, { waitUntil: 'networkidle' })
  await waitForBoot(page)
  await loadSampleTree(page)

  async function faceCenter(name) {
    return page.evaluate((label) => {
      const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((element) => element.__data__?.data?.name === label)
      const face = node?.querySelector('rect:not(.grabzone)') || node
      const rect = face.getBoundingClientRect()
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        uid: node?.__data__?.data?._uid || '',
      }
    }, name)
  }

  async function touch(type, x, y, pointerId) {
    await page.evaluate(({ type, x, y, pointerId }) => {
      document.getElementById('canvas').dispatchEvent(new PointerEvent(type, {
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

  async function flick(name, dx, dy, pointerId) {
    const origin = await faceCenter(name)
    const before = await page.locator('svg#canvas g.node').count()
    const view = await page.evaluate(() => {
      const t = window.d3.zoomTransform(document.getElementById('canvas'))
      return { x: t.x, y: t.y }
    })
    await touch('pointerdown', origin.x, origin.y, pointerId)
    await touch('pointerup', origin.x + dx, origin.y + dy, pointerId)
    await page.waitForFunction((count) => document.querySelectorAll('svg#canvas g.node').length > count, before)
    await page.waitForFunction(() => {
      const uid = window.LOGYQBridge.core.state.selectedUid
      return !!uid && !!window.LOGYQBridge.core.state.root?.descendants().find((item) => item.data?._uid === uid)
    })
    const after = await page.evaluate(() => {
      const t = window.d3.zoomTransform(document.getElementById('canvas'))
      const selected = window.LOGYQBridge.core.state.selectedUid
      const created = window.LOGYQBridge.core.state.root.descendants().find((item) => item.data?._uid === selected)
      return {
        x: t.x,
        y: t.y,
        editors: document.querySelectorAll('.node-edit-input').length,
        editing: window.LOGYQBridge.core.state.editingUid,
        mic: document.querySelectorAll('#logyq-v162-action.show').length,
        selected,
        createdName: created?.data?.name || '',
        parent: created?.parent?.data?.name || null,
        child: created?.children?.[0]?.data?.name || null,
        beforeName: (() => {
          const kids = created?.parent?.children || []
          const index = kids.findIndex((item) => item.data?._uid === selected)
          return index > 0 ? kids[index - 1]?.data?.name || null : null
        })(),
        afterName: (() => {
          const kids = created?.parent?.children || []
          const index = kids.findIndex((item) => item.data?._uid === selected)
          return index >= 0 ? kids[index + 1]?.data?.name || null : null
        })(),
      }
    })
    assert.ok(Math.hypot(after.x - view.x, after.y - view.y) < 2, `${name} flick must leave the camera`)
    assert.equal(after.editors, 0, `${name} flick must not open the rename bar`)
    assert.equal(after.editing, null)
    assert.equal(after.mic, 0, `${name} flick must not arm MIC`)
    assert.notEqual(after.selected, origin.uid)
    assert.equal(after.createdName, '')
    return { origin, after }
  }

  const left = await flick('Node 10', -70, 0, 81)
  assert.equal(left.after.afterName, 'Node 10')

  const right = await flick('Node 12', 70, 0, 82)
  assert.equal(right.after.beforeName, 'Node 12')

  const up = await flick('Node 05', 0, -70, 83)
  assert.equal(up.after.child, 'Node 05')

  const blank = await page.evaluate((uid) => {
    const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((element) => element.__data__?.data?._uid === uid)
    const face = node?.querySelector('rect:not(.grabzone)') || node
    const rect = face.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, uid }
  }, up.after.selected)
  await touch('pointerdown', blank.x, blank.y, 84)
  await touch('pointerup', blank.x, blank.y, 84)
  await touch('pointerdown', blank.x, blank.y, 85)
  await touch('pointerup', blank.x, blank.y, 85)
  await page.waitForSelector('.node-edit-input')
  assert.equal(await page.evaluate(() => window.LOGYQBridge.core.state.editingUid), blank.uid)
  await page.locator('.node-edit-input').fill('up-blank')
  await page.locator('.node-edit-input').press('Enter')
  await page.waitForFunction(() => Array.from(document.querySelectorAll('svg#canvas g.node')).some((node) => node.__data__?.data?.name === 'up-blank'))
  assert.equal(await page.evaluate(() => {
    const named = Array.from(document.querySelectorAll('svg#canvas g.node')).find((element) => element.__data__?.data?.name === 'up-blank')
    return named?.__data__?.children?.[0]?.data?.name || null
  }), 'Node 05')

  assert.deepEqual(errors, [])
  await context.close()
})

test('LOGYQ two blank cards edit by uid, not empty name', async () => {
  const context = await newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await stubMaps(context)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logyq/index.html`, { waitUntil: 'networkidle' })
  await waitForBoot(page)
  await loadSampleTree(page)

  assert.equal(await page.evaluate(() => window.LOGYQBridge.selectByName('')), false)
  assert.equal(await page.evaluate(() => window.LOGYQBridge.selectByName('   ')), false)
  assert.equal(await page.evaluate(() => window.LOGYQBridge.getParentName('')), null)

  async function faceOf(uid) {
    return page.evaluate((id) => {
      const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((element) => element.__data__?.data?._uid === id)
      const face = node?.querySelector('rect:not(.grabzone)') || node
      const rect = face?.getBoundingClientRect()
      return {
        uid: id,
        name: node?.__data__?.data?.name || '',
        x: rect ? rect.left + rect.width / 2 : 0,
        y: rect ? rect.top + rect.height / 2 : 0,
      }
    }, uid)
  }

  async function touch(type, x, y, pointerId) {
    await page.evaluate(({ type, x, y, pointerId }) => {
      document.getElementById('canvas').dispatchEvent(new PointerEvent(type, {
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

  const decoy = await page.evaluate(() => {
    window.LOGYQBridge.selectByName('Node 05')
    return window.LOGYQBridge.createRelative('down', window.LOGYQBridge.getSelectedUid())
  })
  const origin = await page.evaluate(() => {
    const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((element) => element.__data__?.data?.name === 'Node 10')
    const face = node?.querySelector('rect:not(.grabzone)') || node
    const rect = face.getBoundingClientRect()
    return {
      uid: node.__data__.data._uid,
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    }
  })
  const before = await page.locator('svg#canvas g.node').count()
  await touch('pointerdown', origin.x, origin.y, 91)
  await touch('pointerup', origin.x, origin.y + 70, 91)
  await page.waitForFunction((count) => document.querySelectorAll('svg#canvas g.node').length > count, before)

  const targetUid = await page.evaluate(() => window.LOGYQBridge.core.state.selectedUid)
  assert.ok(decoy)
  assert.ok(targetUid)
  assert.notEqual(targetUid, decoy)
  assert.notEqual(targetUid, origin.uid)

  const target = await faceOf(targetUid)
  await touch('pointerdown', target.x, target.y, 92)
  await touch('pointerup', target.x, target.y, 92)
  await touch('pointerdown', target.x, target.y, 93)
  await touch('pointerup', target.x, target.y, 93)
  await page.waitForSelector('.node-edit-input')
  const firstEdit = await page.evaluate(() => window.LOGYQBridge.core.state.editingUid)
  assert.equal(firstEdit, targetUid, 'double-tap must edit the flicked blank, not the first empty name')
  assert.notEqual(firstEdit, decoy)
  await page.locator('.node-edit-input').fill('cat')
  await page.locator('.node-edit-input').press('Enter')
  await page.waitForFunction((uid) => {
    const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((element) => element.__data__?.data?._uid === uid)
    return node?.__data__?.data?.name === 'cat'
  }, targetUid)

  const decoyFace = await faceOf(decoy)
  await touch('pointerdown', decoyFace.x, decoyFace.y, 94)
  await touch('pointerup', decoyFace.x, decoyFace.y, 94)
  await touch('pointerdown', decoyFace.x, decoyFace.y, 95)
  await touch('pointerup', decoyFace.x, decoyFace.y, 95)
  await page.waitForSelector('.node-edit-input')
  assert.equal(await page.evaluate(() => window.LOGYQBridge.core.state.editingUid), decoy)
  await page.locator('.node-edit-input').fill('dog')
  await page.locator('.node-edit-input').press('Enter')
  await page.waitForFunction((uid) => {
    const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((element) => element.__data__?.data?._uid === uid)
    return node?.__data__?.data?.name === 'dog'
  }, decoy)

  const names = await page.evaluate(({ targetUid, decoy }) => {
    const byUid = (uid) => Array.from(document.querySelectorAll('svg#canvas g.node')).find((element) => element.__data__?.data?._uid === uid)?.__data__?.data?.name
    return {
      target: byUid(targetUid),
      decoy: byUid(decoy),
      node10: Array.from(document.querySelectorAll('svg#canvas g.node')).some((element) => element.__data__?.data?.name === 'Node 10'),
    }
  }, { targetUid, decoy })
  assert.equal(names.target, 'cat')
  assert.equal(names.decoy, 'dog')
  assert.equal(names.node10, true)
  assert.deepEqual(errors, [])
  await context.close()
})

test('LOGYQ labeling never moves the root when a flicked blank is edited', async () => {
  const context = await newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await stubMaps(context)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logyq/index.html`, { waitUntil: 'networkidle' })
  await waitForBoot(page)
  await loadSampleTree(page)

  assert.equal(await page.evaluate(() => window.LOGYQBridge.createRelative('down')), null)
  assert.equal(await page.evaluate(() => window.LOGYQBridge.createRelative('down', '')), null)
  assert.equal(await page.evaluate(() => window.LOGYQBridge.editSelected()), false)

  async function tapFace(uid, pointerId) {
    await page.evaluate(({ uid, pointerId }) => {
      const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((element) => element.__data__?.data?._uid === uid)
        || Array.from(document.querySelectorAll('svg#canvas g.hit-slot')).find((element) => element.getAttribute('data-uid') === uid)
      const face = node?.querySelector?.('rect:not(.grabzone)') || node
      if (!face) throw new Error(`no face or hit-slot for ${uid}`)
      const rect = face.getBoundingClientRect()
      const x = rect.left + rect.width / 2
      const y = rect.top + rect.height / 2
      for (const type of ['pointerdown', 'pointerup']) {
        face.dispatchEvent(new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerType: 'touch',
          pointerId,
          isPrimary: true,
          button: 0,
          buttons: type === 'pointerdown' ? 1 : 0,
          clientX: x,
          clientY: y,
          screenX: x,
          screenY: y,
        }))
      }
    }, { uid, pointerId })
  }

  const rootName = await page.evaluate(() => window.LOGYQBridge.core.state.root?.data?.name)
  const rootUid = await page.evaluate(() => window.LOGYQBridge.core.state.root?.data?._uid)

  const empty = await page.evaluate(() => {
    const canvas = document.getElementById('canvas')
    const rect = canvas.getBoundingClientRect()
    const slots = Array.from(document.querySelectorAll('svg#canvas g.hit-slot, svg#canvas g.node'))
    for (let y = rect.top + 8; y < rect.bottom - 8; y += 20) {
      for (let x = rect.left + 8; x < rect.right - 8; x += 20) {
        const hit = slots.some((node) => {
          const box = node.getBoundingClientRect()
          return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom
        })
        if (!hit) return { x, y }
      }
    }
    return { x: rect.left + 8, y: rect.top + 8 }
  })
  await page.evaluate(({ x, y }) => {
    const canvas = document.getElementById('canvas')
    for (const type of ['pointerdown', 'pointerup']) {
      canvas.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerType: 'touch',
        pointerId: 301,
        isPrimary: true,
        button: 0,
        buttons: type === 'pointerdown' ? 1 : 0,
        clientX: x,
        clientY: y,
        screenX: x,
        screenY: y,
      }))
    }
  }, empty)
  assert.equal(await page.evaluate(() => window.LOGYQBridge.getSelectedUid()), null)

  const made = await page.evaluate(() => {
    const origin = Array.from(document.querySelectorAll('svg#canvas g.node')).find((element) => element.__data__?.data?.name === 'Node 05')
    const originUid = origin.__data__.data._uid
    const newUid = window.LOGYQBridge.createRelative('down', originUid)
    return { originUid, newUid, lastCreated: window.LOGYQBridge.core.state.lastCreatedUid }
  })
  assert.ok(made.newUid)
  assert.equal(made.lastCreated, made.newUid)
  assert.notEqual(made.newUid, rootUid)
  assert.notEqual(made.newUid, made.originUid)

  await tapFace(made.newUid, 302)
  await tapFace(made.newUid, 303)
  await page.waitForSelector('.node-edit-input')
  assert.equal(await page.evaluate(() => window.LOGYQBridge.core.state.editingUid), made.newUid)
  assert.notEqual(await page.evaluate(() => window.LOGYQBridge.core.state.editingUid), rootUid)

  await page.locator('.node-edit-input').fill('cat')
  await page.locator('.node-edit-input').press('Enter')
  await page.waitForFunction((uid) => {
    return window.LOGYQBridge.core.utils.findByUid(window.LOGYQBridge.core.state.root.data, uid)?.name === 'cat'
  }, made.newUid)

  const afterCat = await page.evaluate((ids) => {
    const byUid = (uid) => window.LOGYQBridge.core.utils.findByUid(window.LOGYQBridge.core.state.root.data, uid)
    return {
      child: byUid(ids.newUid)?.name,
      root: byUid(ids.rootUid)?.name,
      origin: byUid(ids.originUid)?.name,
    }
  }, { ...made, rootUid })
  assert.equal(afterCat.child, 'cat')
  assert.equal(afterCat.root, rootName)
  assert.equal(afterCat.origin, 'Node 05')

  await tapFace(made.newUid, 304)
  await tapFace(made.newUid, 305)
  await page.waitForSelector('.node-edit-input')
  assert.equal(await page.evaluate(() => window.LOGYQBridge.core.state.editingUid), made.newUid)
  await page.locator('.node-edit-input').fill('')
  await page.locator('.node-edit-input').press('Enter')
  await page.waitForFunction((uid) => {
    return window.LOGYQBridge.core.utils.findByUid(window.LOGYQBridge.core.state.root.data, uid)?.name === ''
  }, made.newUid)
  assert.equal(await page.evaluate((id) => window.LOGYQBridge.core.utils.findByUid(window.LOGYQBridge.core.state.root.data, id)?.name, rootUid), rootName)

  const other = await page.evaluate(() => {
    const origin = Array.from(document.querySelectorAll('svg#canvas g.node')).find((element) => element.__data__?.data?.name === 'Node 12')
    return window.LOGYQBridge.createRelative('down', origin.__data__.data._uid)
  })
  await tapFace(other, 306)
  await tapFace(other, 307)
  await page.waitForSelector('.node-edit-input')
  assert.equal(await page.evaluate(() => window.LOGYQBridge.core.state.editingUid), other)
  assert.notEqual(await page.evaluate(() => window.LOGYQBridge.core.state.editingUid), rootUid)
  assert.notEqual(await page.evaluate(() => window.LOGYQBridge.core.state.editingUid), made.newUid)
  await page.locator('.node-edit-input').fill('dog')
  await page.locator('.node-edit-input').press('Enter')
  await page.waitForFunction((uid) => {
    return window.LOGYQBridge.core.utils.findByUid(window.LOGYQBridge.core.state.root.data, uid)?.name === 'dog'
  }, other)

  const final = await page.evaluate((ids) => {
    const byUid = (uid) => window.LOGYQBridge.core.utils.findByUid(window.LOGYQBridge.core.state.root.data, uid)
    return {
      first: byUid(ids.first)?.name,
      second: byUid(ids.second)?.name,
      root: byUid(ids.rootUid)?.name,
    }
  }, { first: made.newUid, second: other, rootUid })
  assert.equal(final.first, '')
  assert.equal(final.second, 'dog')
  assert.equal(final.root, rootName)
  assert.deepEqual(errors, [])
  await context.close()
})

test('LOGYQ double-tap keeps the pointerdown uid even if pointerup lands on root', async () => {
  const context = await newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await stubMaps(context)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logyq/index.html`, { waitUntil: 'networkidle' })
  await waitForBoot(page)
  await loadSampleTree(page)

  const ids = await page.evaluate(() => {
    const rootUid = window.LOGYQBridge.core.state.root?.data?._uid
    const rootName = window.LOGYQBridge.core.state.root?.data?.name
    const origin = Array.from(document.querySelectorAll('svg#canvas g.node')).find((element) => element.__data__?.data?.name === 'Node 05')
    const originUid = origin.__data__.data._uid
    const newUid = window.LOGYQBridge.createRelative('down', originUid)
    return { rootUid, rootName, originUid, newUid }
  })
  assert.ok(ids.newUid)
  assert.notEqual(ids.newUid, ids.rootUid)

  await page.evaluate((ids) => {
    const nodeOf = (uid) => Array.from(document.querySelectorAll('svg#canvas g.node')).find((element) => element.__data__?.data?._uid === uid)
    const slotOf = (uid) => Array.from(document.querySelectorAll('svg#canvas g.hit-slot')).find((element) => element.getAttribute('data-uid') === uid)
    const canvas = document.getElementById('canvas')
    const fire = (target, type, pointerId, x, y) => {
      target.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerType: 'touch',
        pointerId,
        isPrimary: true,
        button: 0,
        buttons: type === 'pointerdown' ? 1 : 0,
        clientX: x,
        clientY: y,
        screenX: x,
        screenY: y,
      }))
    }
    const child = nodeOf(ids.newUid) || slotOf(ids.newUid)
    const root = nodeOf(ids.rootUid)
    const childBox = child.getBoundingClientRect()
    const cx = childBox.left + childBox.width / 2
    const cy = childBox.top + childBox.height / 2
    fire(child, 'pointerdown', 401, cx, cy)
    fire(root, 'pointerup', 401, cx, cy)
    fire(child, 'pointerdown', 402, cx, cy)
    fire(root, 'pointerup', 402, cx, cy)
  }, ids)

  await page.waitForSelector('.node-edit-input')
  assert.equal(await page.evaluate(() => window.LOGYQBridge.core.state.editingUid), ids.newUid)
  assert.notEqual(await page.evaluate(() => window.LOGYQBridge.core.state.editingUid), ids.rootUid)
  await page.locator('.node-edit-input').fill('cat')
  await page.locator('.node-edit-input').press('Enter')
  await page.waitForFunction((uid) => {
    return window.LOGYQBridge.core.utils.findByUid(window.LOGYQBridge.core.state.root.data, uid)?.name === 'cat'
  }, ids.newUid)
  assert.equal(await page.evaluate((id) => window.LOGYQBridge.core.utils.findByUid(window.LOGYQBridge.core.state.root.data, id)?.name, ids.rootUid), ids.rootName)
  assert.notEqual(ids.rootName, 'cat')
  assert.deepEqual(errors, [])
  await context.close()
})

test('LOGYQ flick-down child edit binds newUid not root, then clear stays on that uid', async () => {
  const context = await newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await stubMaps(context)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logyq/index.html`, { waitUntil: 'networkidle' })
  await waitForBoot(page)
  await loadSampleTree(page)

  const ids = await page.evaluate(() => {
    const rootUid = window.LOGYQBridge.core.state.root?.data?._uid
    window.LOGYQBridge.selectByName('Node 05')
    const originUid = window.LOGYQBridge.getSelectedUid()
    const newUid = window.LOGYQBridge.createRelative('down', originUid)
    return { rootUid, originUid, newUid }
  })
  assert.ok(ids.rootUid)
  assert.ok(ids.originUid)
  assert.ok(ids.newUid)
  assert.notEqual(ids.newUid, ids.rootUid)
  assert.notEqual(ids.newUid, ids.originUid)

  assert.equal(await page.evaluate(() => window.LOGYQBridge.editSelected()), false)
  assert.equal(await page.evaluate(() => window.LOGYQBridge.editSelected({})), false)
  assert.equal(await page.evaluate(() => window.LOGYQBridge.core.state.editingUid), null)

  const opened = await page.evaluate((uid) => window.LOGYQBridge.editSelected({ uid }), ids.newUid)
  assert.equal(opened, true)
  await page.waitForSelector('.node-edit-input')
  const editing = await page.evaluate(() => window.LOGYQBridge.core.state.editingUid)
  assert.equal(editing, ids.newUid)
  assert.notEqual(editing, ids.rootUid)
  assert.notEqual(editing, ids.originUid)

  await page.locator('.node-edit-input').fill('cat')
  await page.locator('.node-edit-input').press('Enter')
  await page.waitForFunction((uid) => {
    const node = window.LOGYQBridge.core.state.root?.descendants().find((item) => item.data?._uid === uid)
    return node?.data?.name === 'cat'
  }, ids.newUid)

  const afterCat = await page.evaluate((ids) => {
    const byUid = (uid) => window.LOGYQBridge.core.utils.findByUid(window.LOGYQBridge.core.state.root.data, uid)
    return {
      child: byUid(ids.newUid)?.name,
      root: byUid(ids.rootUid)?.name,
      origin: byUid(ids.originUid)?.name,
    }
  }, ids)
  assert.equal(afterCat.child, 'cat')
  assert.notEqual(afterCat.root, 'cat')
  assert.equal(afterCat.origin, 'Node 05')

  assert.equal(await page.evaluate((uid) => window.LOGYQBridge.editSelected({ uid }), ids.newUid), true)
  await page.waitForSelector('.node-edit-input')
  assert.equal(await page.evaluate(() => window.LOGYQBridge.core.state.editingUid), ids.newUid)
  await page.locator('.node-edit-input').fill('')
  await page.locator('.node-edit-input').press('Enter')
  await page.waitForFunction((uid) => {
    const node = window.LOGYQBridge.core.state.root?.descendants().find((item) => item.data?._uid === uid)
    return node?.data?.name === ''
  }, ids.newUid)

  const afterClear = await page.evaluate((ids) => {
    const byUid = (uid) => window.LOGYQBridge.core.utils.findByUid(window.LOGYQBridge.core.state.root.data, uid)
    return {
      child: byUid(ids.newUid)?.name,
      root: byUid(ids.rootUid)?.name,
      origin: byUid(ids.originUid)?.name,
    }
  }, ids)
  assert.equal(afterClear.child, '')
  assert.equal(afterClear.root, afterCat.root)
  assert.equal(afterClear.origin, 'Node 05')
  assert.deepEqual(errors, [])
  await context.close()
})

test('LOGYQ rename then delete all characters persists empty name on that uid', async () => {
  const context = await newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await stubMaps(context)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logyq/index.html`, { waitUntil: 'networkidle' })
  await waitForBoot(page)
  await loadSampleTree(page)

  const uid = await page.evaluate(() => {
    window.LOGYQBridge.selectByName('Node 12')
    return window.LOGYQBridge.getSelectedUid()
  })
  assert.ok(uid)
  assert.equal(await page.evaluate((id) => window.LOGYQBridge.renameNode(id, 'temp-name'), uid), true)
  await page.waitForFunction((id) => {
    const node = window.LOGYQBridge.core.utils.findByUid(window.LOGYQBridge.core.state.root.data, id)
    return node?.name === 'temp-name'
  }, uid)

  assert.equal(await page.evaluate((id) => window.LOGYQBridge.editSelected({ uid: id }), uid), true)
  await page.waitForSelector('.node-edit-input')
  await page.locator('.node-edit-input').fill('   ')
  await page.locator('.node-edit-input').press('Enter')
  await page.waitForFunction((id) => {
    const node = window.LOGYQBridge.core.utils.findByUid(window.LOGYQBridge.core.state.root.data, id)
    return node?.name === ''
  }, uid)

  const named = await page.evaluate((id) => {
    const node = window.LOGYQBridge.core.utils.findByUid(window.LOGYQBridge.core.state.root.data, id)
    return {
      name: node?.name,
      othersStillLabeled: window.LOGYQBridge.core.state.root.descendants()
        .filter((item) => item.data?._uid !== id)
        .every((item) => item.data?.name !== ''),
    }
  }, uid)
  assert.equal(named.name, '')
  assert.equal(named.othersStillLabeled, true)
  assert.equal(await page.evaluate((id) => window.LOGYQBridge.renameNode(id, ''), uid), true)
  assert.equal(await page.evaluate((id) => {
    return window.LOGYQBridge.core.utils.findByUid(window.LOGYQBridge.core.state.root.data, id)?.name
  }, uid), '')
  assert.deepEqual(errors, [])
  await context.close()
})

test('LOGYQ sequential flick-downs after background clear and pan do not overlap settle', async () => {
  const context = await newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await stubMaps(context)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logyq/index.html`, { waitUntil: 'networkidle' })
  await waitForBoot(page)
  await loadSampleTree(page)

  async function emptyPoint() {
    return page.evaluate(() => {
      const canvas = document.getElementById('canvas')
      const rect = canvas.getBoundingClientRect()
      const slots = Array.from(document.querySelectorAll('svg#canvas g.hit-slot, svg#canvas g.node'))
      for (let y = rect.top + 8; y < rect.bottom - 8; y += 20) {
        for (let x = rect.left + 8; x < rect.right - 8; x += 20) {
          const hit = slots.some((node) => {
            const box = node.getBoundingClientRect()
            return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom
          })
          if (!hit) return { x, y }
        }
      }
      return { x: rect.left + 8, y: rect.top + 8 }
    })
  }

  async function faceCenter(name) {
    return page.evaluate((label) => {
      const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((element) => element.__data__?.data?.name === label)
      const face = node?.querySelector('rect:not(.grabzone)') || node
      const rect = face.getBoundingClientRect()
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        uid: node?.__data__?.data?._uid || '',
      }
    }, name)
  }

  async function touch(type, x, y, pointerId) {
    await page.evaluate(({ type, x, y, pointerId }) => {
      document.getElementById('canvas').dispatchEvent(new PointerEvent(type, {
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

  const empty = await emptyPoint()
  await touch('pointerdown', empty.x, empty.y, 201)
  await touch('pointerup', empty.x, empty.y, 201)
  assert.equal(await page.evaluate(() => window.LOGYQBridge.getSelectedUid()), null)

  const view0 = await page.evaluate(() => {
    const t = window.d3.zoomTransform(document.getElementById('canvas'))
    return { x: t.x, y: t.y, k: t.k }
  })
  const origin = await faceCenter('Node 05')
  const before = await page.locator('svg#canvas g.node').count()
  await touch('pointerdown', origin.x, origin.y, 202)
  await touch('pointerup', origin.x, origin.y + 70, 202)
  await page.waitForFunction((count) => document.querySelectorAll('svg#canvas g.node').length > count, before)

  const after1 = await page.evaluate((view0) => {
    const t = window.d3.zoomTransform(document.getElementById('canvas'))
    return {
      dx: t.x - view0.x,
      dy: t.y - view0.y,
      overlap: window.LOGYQBridge.core.state.layoutOverlapCount || 0,
      selected: window.LOGYQBridge.getSelectedUid(),
      rootUid: window.LOGYQBridge.core.state.root?.data?._uid,
      editors: document.querySelectorAll('.node-edit-input').length,
      settling: !!window.LOGYQBridge.core.state.layoutSettling,
      generation: window.LOGYQBridge.core.state.layoutGeneration || 0,
    }
  }, view0)
  assert.ok(Math.hypot(after1.dx, after1.dy) < 2, 'first flick must leave the camera')
  assert.equal(after1.editors, 0, 'flick-create must not open the rename bar')
  assert.equal(after1.overlap, 0)
  assert.ok(after1.selected)
  assert.notEqual(after1.selected, after1.rootUid)
  const firstUid = after1.selected

  const queued = await page.evaluate(() => {
    const genBefore = window.LOGYQBridge.core.state.layoutGeneration || 0
    const overlapBefore = window.LOGYQBridge.core.state.layoutOverlapCount || 0
    window.LOGYQBridge.selectByName('Node 12')
    const second = window.LOGYQBridge.createRelative('down', window.LOGYQBridge.getSelectedUid())
    return {
      second,
      queued: !!window.LOGYQBridge.core.state.layoutFlushQueued,
      settling: !!window.LOGYQBridge.core.state.layoutSettling,
      generation: window.LOGYQBridge.core.state.layoutGeneration || 0,
      overlap: window.LOGYQBridge.core.state.layoutOverlapCount || 0,
      genBefore,
      overlapBefore,
    }
  })
  assert.ok(queued.second)
  assert.equal(queued.overlap, queued.overlapBefore, 'second create must not start an overlapping layout pass')
  if (queued.settling) {
    assert.equal(queued.generation, queued.genBefore)
    assert.equal(queued.queued, true)
  }

  await page.waitForFunction((uid) => {
    const live = window.LOGYQBridge.core.utils.findByUid(window.LOGYQBridge.core.state.root.data, uid)
    const node = Array.from(document.querySelectorAll('svg#canvas g.node')).some((element) => element.__data__?.data?._uid === uid)
    return !!live && node && !window.LOGYQBridge.core.state.layoutFlushQueued
  }, queued.second)

  await page.waitForFunction(() => !window.LOGYQBridge.core.state.layoutSettling)

  const panned = await page.evaluate(() => {
    const svg = document.getElementById('canvas')
    const t = window.d3.zoomTransform(svg)
    const next = window.d3.zoomIdentity.translate(t.x - 80, t.y - 60).scale(t.k)
    svg.__zoom = next
    const root = Array.from(svg.children).find((child) => child.tagName?.toLowerCase() === 'g')
    if (root) root.setAttribute('transform', next.toString())
    return { x: next.x, y: next.y, k: next.k }
  })

  const empty2 = await emptyPoint()
  await touch('pointerdown', empty2.x, empty2.y, 203)
  await touch('pointerup', empty2.x, empty2.y, 203)
  assert.equal(await page.evaluate(() => window.LOGYQBridge.getSelectedUid()), null)

  const origin2 = await faceCenter('Node 18')
  const before2 = await page.locator('svg#canvas g.node').count()
  await touch('pointerdown', origin2.x, origin2.y, 204)
  await touch('pointerup', origin2.x, origin2.y + 70, 204)
  await page.waitForFunction((count) => document.querySelectorAll('svg#canvas g.node').length > count, before2)

  const after2 = await page.evaluate((panned) => {
    const t = window.d3.zoomTransform(document.getElementById('canvas'))
    const selected = window.LOGYQBridge.getSelectedUid()
    return {
      dx: t.x - panned.x,
      dy: t.y - panned.y,
      overlap: window.LOGYQBridge.core.state.layoutOverlapCount || 0,
      selected,
      rootUid: window.LOGYQBridge.core.state.root?.data?._uid,
      editors: document.querySelectorAll('.node-edit-input').length,
    }
  }, panned)
  assert.ok(Math.hypot(after2.dx, after2.dy) < 2, 'second flick after pan must leave the camera')
  assert.equal(after2.editors, 0, 'flick-create must not open the rename bar')
  assert.equal(after2.overlap, 0)
  assert.ok(after2.selected)
  assert.notEqual(after2.selected, after2.rootUid)
  assert.notEqual(after2.selected, firstUid)

  assert.equal(await page.evaluate((uid) => window.LOGYQBridge.editSelected({ uid }), after2.selected), true)
  assert.equal(await page.evaluate(() => window.LOGYQBridge.core.state.editingUid), after2.selected)
  await page.locator('.node-edit-input').fill('cat')
  await page.locator('.node-edit-input').press('Enter')
  await page.waitForFunction((uid) => {
    return window.LOGYQBridge.core.utils.findByUid(window.LOGYQBridge.core.state.root.data, uid)?.name === 'cat'
  }, after2.selected)

  assert.equal(await page.evaluate((uid) => window.LOGYQBridge.editSelected({ uid }), after2.selected), true)
  await page.locator('.node-edit-input').fill('')
  await page.locator('.node-edit-input').press('Enter')
  await page.waitForFunction((uid) => {
    return window.LOGYQBridge.core.utils.findByUid(window.LOGYQBridge.core.state.root.data, uid)?.name === ''
  }, after2.selected)

  const names = await page.evaluate((ids) => {
    const byUid = (uid) => window.LOGYQBridge.core.utils.findByUid(window.LOGYQBridge.core.state.root.data, uid)?.name
    return {
      first: byUid(ids.firstUid),
      second: byUid(ids.second),
      root: byUid(ids.rootUid),
    }
  }, { firstUid, second: after2.selected, rootUid: after2.rootUid })
  assert.equal(names.second, '')
  assert.notEqual(names.root, 'cat')
  assert.deepEqual(errors, [])
  await context.close()
})

test('LOGYQ flick left/right reserve non-overlapping sibling slots', async () => {
  const context = await newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await stubMaps(context)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logyq/index.html`, { waitUntil: 'networkidle' })
  await waitForBoot(page)
  await loadSampleTree(page)

  async function faceCenter(name) {
    return page.evaluate((label) => {
      const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((element) => element.__data__?.data?.name === label)
      const face = node?.querySelector('rect:not(.grabzone)') || node
      const rect = face.getBoundingClientRect()
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        uid: node?.__data__?.data?._uid || '',
      }
    }, name)
  }

  async function touch(type, x, y, pointerId) {
    await page.evaluate(({ type, x, y, pointerId }) => {
      document.getElementById('canvas').dispatchEvent(new PointerEvent(type, {
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

  async function flick(name, dx, dy, pointerId) {
    const origin = await faceCenter(name)
    const before = await page.locator('svg#canvas g.node').count()
    await touch('pointerdown', origin.x, origin.y, pointerId)
    await touch('pointerup', origin.x + dx, origin.y + dy, pointerId)
    await page.waitForFunction((count) => document.querySelectorAll('svg#canvas g.node').length > count, before)
    return page.evaluate(() => window.LOGYQBridge.core.state.selectedUid)
  }

  function overlaps(a, b) {
    return !(a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1)
  }

  async function faces() {
    return page.evaluate(() => Array.from(document.querySelectorAll('svg#canvas g.node')).map((node) => {
      const face = node.querySelector('rect:not(.grabzone)') || node
      const rect = face.getBoundingClientRect()
      return {
        uid: node.__data__?.data?._uid || '',
        name: node.__data__?.data?.name || '',
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
      }
    }))
  }

  const leftUid = await flick('Node 10', -70, 0, 101)
  const rightUid = await flick('Node 12', 70, 0, 102)
  assert.ok(leftUid)
  assert.ok(rightUid)
  assert.notEqual(leftUid, rightUid)
  await page.waitForFunction(() => {
    const state = window.LOGYQBridge.core.state
    return !state.layoutSettling && !state.layoutFlushQueued
  })

  async function layoutFaces() {
    return page.evaluate(() => {
      const svg = document.getElementById('canvas')
      const view = svg.getBoundingClientRect()
      const t = window.d3.zoomTransform(svg)
      const w = window.LOGYQBridge.core.config.CARD_WIDTH
      const h = window.LOGYQBridge.core.config.CARD_HEIGHT
      return Array.from(document.querySelectorAll('svg#canvas g.node')).map((node) => {
        const d = node.__data__
        const cx = view.left + t.x + d.x * t.k
        const cy = view.top + t.y + d.y * t.k
        return {
          uid: d.data._uid,
          name: d.data.name || '',
          left: cx - (w / 2) * t.k,
          right: cx + (w / 2) * t.k,
          top: cy - (h / 2) * t.k,
          bottom: cy + (h / 2) * t.k,
        }
      })
    })
  }

  const slots = await layoutFaces()
  for (const card of slots.filter((box) => box.uid === leftUid || box.uid === rightUid)) {
    const hits = slots.filter((other) => other.uid !== card.uid && overlaps(card, other))
    assert.deepEqual(hits, [], `layout slot ${card.uid} must not overlap ${hits.map((hit) => hit.name || hit.uid).join(', ')}`)
  }

  await page.waitForTimeout(320)
  const boxes = await faces()
  const created = boxes.filter((box) => box.uid === leftUid || box.uid === rightUid)
  assert.equal(created.length, 2)
  for (const card of created) {
    const hits = boxes.filter((other) => other.uid !== card.uid && overlaps(card, other))
    assert.deepEqual(hits, [], `${card.uid} must not overlap ${hits.map((hit) => hit.name || hit.uid).join(', ')}`)
  }
  assert.equal(overlaps(created[0], created[1]), false)

  const left = slots.find((box) => box.uid === leftUid)
  await touch('pointerdown', (left.left + left.right) / 2, (left.top + left.bottom) / 2, 103)
  await touch('pointerup', (left.left + left.right) / 2, (left.top + left.bottom) / 2, 103)
  await touch('pointerdown', (left.left + left.right) / 2, (left.top + left.bottom) / 2, 104)
  await touch('pointerup', (left.left + left.right) / 2, (left.top + left.bottom) / 2, 104)
  await page.waitForSelector('.node-edit-input')
  assert.equal(await page.evaluate(() => window.LOGYQBridge.core.state.editingUid), leftUid)

  assert.deepEqual(errors, [])
  await context.close()
})

test('LOGYQ phone smite cake parks a thumb, counts mercy, and banks only the amber path', async () => {
  const context = await newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await stubMaps(context)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logyq/index.html`, { waitUntil: 'networkidle' })
  await waitForBoot(page)
  await page.evaluate(() => {
    window.LOGYQPreview.app.hasOpenMap = true
    document.body.classList.add('logyq-map-open')
    document.body.classList.remove('logyq-home')
    document.querySelectorAll('.logiq-backdrop.is-open').forEach((el) => el.classList.remove('is-open'))
    window.LOGYQBridge.loadMap({
      name: 'Root',
      color: '#2563eb',
      children: [
        { name: 'A', children: [{ name: 'A1' }, { name: '' }] },
        { name: 'B' },
      ],
    }, [])
  })
  await page.waitForFunction(() => document.body.classList.contains('logyq-mobile-v162') && document.getElementById('canvas')?.dataset.logyqSmite === '1')
  await page.waitForFunction(() => {
    const node = Array.from(document.querySelectorAll('g.node')).find((el) => el.__data__?.data?.name === 'A')
    const rect = node?.getBoundingClientRect()
    return rect && rect.width > 20 && rect.bottom > 48 && rect.top < window.innerHeight
  })

  const chrome = await page.evaluate(() => {
    const header = document.getElementById('logiq-mobile-header')
    const strip = document.getElementById('logyq-select-strip')
    return {
      display: getComputedStyle(header).display,
      height: header.getBoundingClientRect().height,
      strip: getComputedStyle(strip).display,
    }
  })
  assert.equal(chrome.display, 'flex')
  assert.ok(chrome.height > 40 && chrome.height <= 52)
  assert.equal(chrome.strip, 'none')

  async function center(name) {
    return page.evaluate((label) => {
      const node = Array.from(document.querySelectorAll('g.node')).find((el) => el.__data__?.data?.name === label)
      const rect = node.getBoundingClientRect()
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, uid: node.__data__.data._uid }
    }, name)
  }
  async function settle() {
    await page.waitForFunction(() => !document.body.classList.contains('logyq-layout-settling'))
  }
  async function touch(type, x, y, pointerId, uid = null) {
    await page.evaluate(({ type, x, y, pointerId, uid }) => {
      const node = uid
        ? Array.from(document.querySelectorAll('svg#canvas g.node')).find((el) => (el.__data__?.data?._uid || el.getAttribute('data-uid')) === uid)
        : null
      const target = node || document.getElementById('canvas')
      target.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerType: 'touch',
        pointerId,
        isPrimary: false,
        button: 0,
        buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
        clientX: x,
        clientY: y,
      }))
    }, { type, x, y, pointerId, uid })
  }
  async function park(zone, pointerId) {
    const point = await page.evaluate((which) => {
      const height = window.innerHeight
      const y = which === 'top' ? height * 0.16 : which === 'bottom' ? height * 0.84 : height * 0.5
      return { x: 16, y }
    }, zone)
    await touch('pointerdown', point.x, point.y, pointerId)
    return point
  }
  async function clocks() {
    return page.evaluate(() => Array.from(document.querySelectorAll('path.logyq-smite-clock')).map((clock) => {
      const node = clock.parentElement
      const face = node.querySelector('rect:not(.grabzone):not(.logyq-smite-wash):not(.logyq-smite-glow)')
      const wash = node.querySelector('rect.logyq-smite-wash')
      const text = node.querySelector('text.label')
      return {
        name: node.__data__?.data?.name ?? null,
        red: clock.classList.contains('logyq-smite-red'),
        amber: clock.classList.contains('logyq-smite-amber'),
        dash: clock.getAttribute('stroke-dasharray'),
        offset: Number(clock.getAttribute('stroke-dashoffset')),
        stroke: clock.getAttribute('stroke'),
        phase: node.dataset.smitePhase || '',
        faceFill: face?.style?.fill || '',
        wash: wash?.getAttribute('fill') || '',
        washOpacity: Number(wash?.getAttribute('fill-opacity')),
        glow: node.querySelector('rect.logyq-smite-glow') ? Number(node.querySelector('rect.logyq-smite-glow').getAttribute('fill-opacity')) : 0,
        text: text?.style?.fill || '',
      }
    }))
  }
  async function names() {
    return page.evaluate(() => window.LOGYQBridge.core.state.root.descendants().map((node) => node.data.name))
  }
  async function heats() {
    return page.evaluate(() => {
      const cssHex = (value) => {
        const rgb = String(value || '').match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
        if (!rgb) return String(value || '')
        const hex = (n) => Number(n).toString(16).padStart(2, '0')
        return `#${hex(rgb[1])}${hex(rgb[2])}${hex(rgb[3])}`
      }
      return Array.from(document.querySelectorAll('svg#canvas g.node')).filter((node) => node.dataset.smiteHeat === '1').map((node) => {
        const wash = node.querySelector('rect.logyq-smite-wash')
        return {
          name: node.__data__?.data?.name ?? null,
          phase: node.dataset.smitePhase || '',
          clock: !!node.querySelector('path.logyq-smite-clock'),
          wash: wash?.getAttribute('fill') || '',
          washOpacity: Number(wash?.getAttribute('fill-opacity')),
          glow: node.querySelector('rect.logyq-smite-glow') ? Number(node.querySelector('rect.logyq-smite-glow').getAttribute('fill-opacity')) : 0,
          faceStroke: cssHex(node.querySelector('rect:not(.grabzone):not(.logyq-smite-wash):not(.logyq-smite-glow)')?.style?.stroke || ''),
          washStroke: cssHex(wash?.getAttribute('stroke') || ''),
          clocks: node.querySelectorAll('path.logyq-smite-clock').length,
        }
      })
    })
  }
  async function edges() {
    return page.evaluate(() => {
      return Array.from(document.querySelectorAll('svg#canvas g.links path.link')).map((link) => {
        const grad = link.dataset.smiteGrad ? document.getElementById(link.dataset.smiteGrad) : null
        const stops = grad ? Array.from(grad.querySelectorAll('stop')).map((stop) => (stop.getAttribute('stop-color') || '').toLowerCase()) : []
        return {
          name: link.__data__?.target?.data?.name ?? null,
          stroke: stops[1] || stops[0] || '',
          dash: link.style.strokeDasharray || '',
          opacity: link.style.opacity || '',
          edge: link.dataset.smiteEdge || '',
          animation: link.style.animationName || link.style.animation || '',
        }
      })
    })
  }
  async function zoomK() {
    return page.evaluate(() => window.d3.zoomTransform(document.getElementById('canvas')).k)
  }

  const beforePinch = await names()
  const k0 = await zoomK()
  await touch('pointerdown', 40, 300, 11)
  await touch('pointerdown', 200, 300, 12)
  await touch('pointermove', 40, 420, 11)
  const kParked = await zoomK()
  assert.ok(Math.abs(kParked - k0) < 0.02, 'a parked finger does not zoom')
  await touch('pointermove', 180, 300, 12)
  const kArmed = await zoomK()
  assert.ok(Math.abs(kArmed - k0) < 0.02, 'becoming a pinch does not apply the earlier one-finger slide')
  await touch('pointermove', 40, 460, 11)
  await touch('pointermove', 120, 300, 12)
  const kPinch = await zoomK()
  assert.ok(Math.abs(kPinch - k0) > 0.01, 'two moving fingers pinch the map')
  await touch('pointerup', 120, 300, 12)
  await touch('pointerup', 40, 460, 11)
  assert.equal(await page.evaluate(() => window.__logyqSuppressZoom), false)
  assert.equal(await page.evaluate(() => window.LOGYQPreview.gestures.smite.mercy), null)
  assert.deepEqual(await clocks(), [])
  assert.deepEqual(await names(), beforePinch)

  await settle()
  const root = await center('Root')
  const kBeforeCast = await zoomK()
  await park('top', 21)
  await touch('pointerdown', root.x, root.y, 22, root.uid)
  await touch('pointermove', root.x, root.y + 80, 22, root.uid)
  const kDuringCast = await zoomK()
  assert.ok(Math.abs(kDuringCast - kBeforeCast) < 0.02, 'thumb park plus a swipe does not zoom')
  let armed = await clocks()
  assert.deepEqual(armed.map((clock) => clock.name), ['Root'])
  assert.equal(armed[0].red, true)
  assert.equal(armed[0].dash, 'none')
  assert.equal(armed[0].offset, 0)
  assert.equal(armed[0].phase, '')
  assert.equal(armed[0].stroke, '#ff0000')
  assert.equal(armed[0].glow, 0)
  assert.ok(armed[0].faceFill === '#2563eb' || armed[0].faceFill === 'rgb(37, 99, 235)', 'paint stays on the card')
  assert.equal(armed[0].wash, '', 'the clock card is an outline timer, not a fill')
  const rootMood = await edges()
  assert.equal(rootMood.some((edge) => edge.edge === '1'), false, 'a parent-only cast leaves connectors quiet')
  assert.equal(armed[0].text, '')
  const noon = await page.evaluate(() => {
    const clock = document.querySelector('path.logyq-smite-clock')
    const face = clock.parentElement.querySelector('rect:not(.grabzone):not(.logyq-smite-wash):not(.logyq-smite-glow)')
    const x = parseFloat(face.getAttribute('x')) || 0
    const y = parseFloat(face.getAttribute('y')) || 0
    const w = parseFloat(face.getAttribute('width')) || 0
    const h = parseFloat(face.getAttribute('height')) || 0
    const rxAttr = parseFloat(face.getAttribute('rx'))
    const ryAttr = parseFloat(face.getAttribute('ry'))
    const rx = rxAttr > 0 ? rxAttr : 10
    const ry = ryAttr > 0 ? ryAttr : rx
    const start = clock.getPointAtLength(0)
    const step = clock.getPointAtLength(Math.max(1, clock.getTotalLength() * 0.03))
    return {
      matches: clock.getAttribute('d') === window.LOGYQPreview.gestures.smiteClockPath(x, y, w, h, rx, ry),
      dx: Math.abs(start.x - (x + w / 2)),
      dy: Math.abs(start.y - y),
      counterClockwise: step.x < start.x,
    }
  })
  assert.equal(noon.matches, true)
  assert.ok(noon.dx < 1 && noon.dy < 1, 'live line starts at the top center of the card')
  assert.equal(noon.counterClockwise, true)
  const half = await page.evaluate(async () => {
    const svgNS = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(svgNS, 'svg')
    svg.setAttribute('width', '200')
    svg.setAttribute('height', '120')
    const path = document.createElementNS(svgNS, 'path')
    path.setAttribute('d', window.LOGYQPreview.gestures.smiteClockPath(20, 20, 160, 80, 10, 10))
    path.setAttribute('fill', 'none')
    path.setAttribute('stroke', '#dc2626')
    path.setAttribute('stroke-width', '8')
    path.setAttribute('stroke-linecap', 'butt')
    svg.appendChild(path)
    document.body.appendChild(svg)
    const dash = window.LOGYQPreview.gestures.smiteLineDash(0.5, path.getTotalLength())
    path.setAttribute('stroke-dasharray', dash.array)
    path.setAttribute('stroke-dashoffset', String(dash.offset))
    const xml = new XMLSerializer().serializeToString(svg)
    const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }))
    const image = new Image()
    image.src = url
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = 200
    canvas.height = 120
    const ctx = canvas.getContext('2d')
    ctx.drawImage(image, 0, 0)
    URL.revokeObjectURL(url)
    svg.remove()
    const red = (x, y) => {
      const pixel = ctx.getImageData(x, y, 1, 1).data
      return pixel[0] > 160 && pixel[1] < 90 && pixel[2] < 90
    }
    return {
      noon: red(100, 20),
      towardThree: red(140, 20),
      towardNine: red(60, 20),
      right: red(180, 60),
      left: red(20, 60),
    }
  })
  assert.equal(half.noon, true, 'half ring is still anchored at 12')
  assert.equal(half.towardThree, true, 'the remaining stroke includes the closing top')
  assert.equal(half.right, true)
  assert.equal(half.towardNine, false, 'the opening top toward the left has already been eaten')
  assert.equal(half.left, false)
  await touch('pointerup', root.x, root.y + 80, 22, root.uid)
  await touch('pointerup', 16, 120, 21)
  await page.evaluate(() => { window.LOGYQPreview.gestures.smite.mercy.remaining = 6000 })
  await page.waitForFunction(() => {
    const clock = document.querySelector('path.logyq-smite-clock')
    const dash = clock?.getAttribute('stroke-dasharray') || ''
    return dash.includes(' ')
  })
  const oneRing = await page.evaluate(() => {
    const clock = document.querySelector('path.logyq-smite-clock')
    const node = clock.parentElement
    const face = node.querySelector('rect:not(.grabzone):not(.logyq-smite-wash):not(.logyq-smite-glow)')
    const style = getComputedStyle(clock)
    const parts = clock.getAttribute('stroke-dasharray').trim().split(/[\s,]+/).map(Number)
    const total = clock.getTotalLength()
    const paths = Array.from(document.querySelectorAll('path.logyq-smite-clock'))
    const stroked = Array.from(node.children).filter((el) => {
      const paint = getComputedStyle(el).stroke
      return paint && paint !== 'none'
    }).map((el) => el.getAttribute('class') || el.tagName)
    return {
      paths: paths.length,
      onNode: node.querySelectorAll('path.logyq-smite-clock').length,
      stroked,
      pathLength: clock.getAttribute('pathLength'),
      animation: style.animationName,
      transition: style.transitionProperty,
      vector: style.vectorEffect,
      faceStroke: face.style.stroke,
      parts,
      total,
      offset: Number(clock.getAttribute('stroke-dashoffset')),
    }
  })
  assert.equal(oneRing.paths, 1, 'one mercy stroke on the doomed root')
  assert.equal(oneRing.onNode, 1)
  assert.deepEqual(oneRing.stroked, ['logyq-smite-clock logyq-smite-red'])
  assert.ok(Math.abs(Number(oneRing.pathLength) - oneRing.total) < 0.01, 'dash units are the path length once')
  assert.equal(oneRing.animation, 'none')
  assert.equal(oneRing.transition, 'none')
  assert.equal(oneRing.vector, 'none', 'the dash stays in the same space as the path')
  assert.equal(oneRing.faceStroke, 'none', 'the card border is not a second ring')
  assert.equal(oneRing.parts.length, 2)
  assert.ok(oneRing.parts[0] > 120 && oneRing.parts[1] > 120, 'the dash is one gap and one stroke, not a fast repeat')
  assert.ok(Math.abs(oneRing.parts[0] + oneRing.parts[1] - oneRing.total) < 1.5)
  assert.ok(Math.abs(oneRing.offset / oneRing.total - 0.5) < 0.12, 'the tip has rewound about halfway counter-clockwise')
  await page.evaluate(() => { window.LOGYQPreview.gestures.smite.mercy.remaining = 1600 })
  await page.waitForFunction(() => {
    const clock = document.querySelector('path.logyq-smite-clock')
    const parts = (clock?.getAttribute('stroke-dasharray') || '').trim().split(/[\s,]+/).map(Number)
    return parts.length === 2 && parts[0] < clock.getTotalLength() * 0.2
  })
  const late = await clocks()
  assert.equal(late[0].stroke, '#ff0000')
  assert.equal(late[0].wash, '')
  assert.equal(late[0].glow, 0)
  assert.ok(late[0].faceFill === '#2563eb' || late[0].faceFill === 'rgb(37, 99, 235)')
  await page.evaluate(() => { window.LOGYQPreview.gestures.smite.mercy.remaining = 15000 })
  const cycle = async (pointerId) => {
    const point = await center('Root')
    await touch('pointerdown', point.x, point.y, pointerId, point.uid)
    await touch('pointerup', point.x, point.y, pointerId, point.uid)
    return page.evaluate(() => {
      const mercy = window.LOGYQPreview.gestures.smite.mercy
      if (!mercy) return null
      const uid = window.LOGYQBridge.core.state.root.data._uid
      return { mark: mercy.marks.get(uid), remaining: mercy.remaining, dash: document.querySelector('path.logyq-smite-clock')?.getAttribute('stroke-dasharray'), stroke: document.querySelector('path.logyq-smite-clock')?.getAttribute('stroke') }
    })
  }
  const rearmed = await cycle(23)
  assert.equal(rearmed.mark, 'amber')
  assert.ok(rearmed.remaining >= 14000, 're-arming restarts the 3s hold')
  assert.equal(rearmed.dash, 'none')
  assert.equal(rearmed.stroke, '#ffa100')
  assert.equal((await edges()).some((edge) => edge.edge === '1'), false, 'parent-only amber still leaves connectors quiet')
  assert.equal(await cycle(25), null)
  const restored = await page.evaluate(() => {
    const node = Array.from(document.querySelectorAll('g.node')).find((el) => el.__data__?.data?.name === 'Root')
    return {
      wash: node.querySelectorAll('rect.logyq-smite-wash').length,
      glow: node.querySelectorAll('rect.logyq-smite-glow').length,
      clock: node.querySelectorAll('.logyq-smite-clock').length,
      fill: node.querySelector('rect:not(.grabzone)')?.style?.fill || '',
    }
  })
  assert.equal(restored.wash, 0)
  assert.equal(restored.glow, 0)
  assert.equal(restored.clock, 0)
  assert.ok(restored.fill === '#2563eb' || restored.fill === 'rgb(37, 99, 235)')
  assert.equal(await page.evaluate(() => window.LOGYQPreview.gestures.smite.mercy), null)
  assert.equal((await edges()).some((edge) => edge.edge === '1'), false)
  assert.equal(await page.locator('.node-edit-input').count(), 0)
  assert.ok((await names()).includes('A'))

  await settle()
  const leaf = await center('B')
  await park('middle', 31)
  await touch('pointerdown', leaf.x, leaf.y, 32, leaf.uid)
  await touch('pointermove', leaf.x - 80, leaf.y, 32, leaf.uid)
  const bankArmed = await clocks()
  assert.deepEqual(bankArmed.map((clock) => clock.name), ['B'])
  assert.equal(bankArmed[0].amber, true)
  assert.equal(bankArmed[0].stroke, '#ffa100')
  assert.equal(bankArmed[0].phase, '')
  assert.equal(bankArmed[0].wash, '')
  assert.equal(bankArmed[0].glow, 0)
  await touch('pointerup', leaf.x - 80, leaf.y, 32, leaf.uid)
  await touch('pointerup', 16, 400, 31)
  const triggerB = await center('B')
  await touch('pointerdown', triggerB.x, triggerB.y, 33, triggerB.uid)
  await touch('pointermove', triggerB.x, triggerB.y + 70, 33, triggerB.uid)
  await touch('pointerup', triggerB.x, triggerB.y + 70, 33, triggerB.uid)
  assert.deepEqual(await page.evaluate(() => window.LOGYQBridge.core.state.wordBank.slice()), ['B'])
  assert.equal((await names()).includes('B'), false)
  assert.equal(await page.locator('.logyq-smite-scar').count(), 0)
  await page.locator('[data-tool="undo"]').click()
  await page.waitForFunction(() => window.LOGYQBridge.core.state.wordBank.length === 0)

  await settle()
  const card = await center('A')
  await park('middle', 41)
  await touch('pointerdown', card.x, card.y, 42, card.uid)
  await touch('pointermove', card.x, card.y + 84, 42, card.uid)
  const family = await heats()
  assert.deepEqual(family.map((card) => card.name).sort(), ['', 'A1'])
  assert.equal(family.find((card) => card.name === 'A1')?.clock, false)
  assert.equal(family.every((card) => card.glow === 0), true)
  assert.equal(family.find((card) => card.name === 'A1')?.wash, 'none')
  assert.equal((family.find((card) => card.name === 'A1')?.washStroke || '').toLowerCase(), '#ff0000')
  assert.equal(family.find((card) => card.name === '')?.wash, 'none')
  assert.equal((family.find((card) => card.name === '')?.washStroke || '').toLowerCase(), '#ff0000')
  assert.equal((await clocks()).length, 1)
  assert.equal((await clocks())[0].name, 'A')
  assert.equal((await clocks())[0].stroke, '#ff0000')
  const familyEdges = await edges()
  assert.equal(familyEdges.find((edge) => edge.name === 'A1')?.edge, '1')
  assert.equal(familyEdges.find((edge) => edge.name === 'A1')?.stroke, '#ff0000')
  assert.equal(familyEdges.find((edge) => edge.name === '')?.stroke, '#ff0000')
  assert.equal(familyEdges.find((edge) => edge.name === 'A')?.edge || '', '')
  assert.equal(familyEdges.find((edge) => edge.name === 'B')?.edge || '', '')
  await touch('pointerup', card.x, card.y + 84, 42, card.uid)
  await touch('pointerup', 16, 422, 41)
  await page.evaluate(() => { window.LOGYQPreview.gestures.smite.mercy.remaining = 1600 })
  await page.waitForFunction(() => {
    const clock = document.querySelector('path.logyq-smite-clock')
    const parts = (clock?.getAttribute('stroke-dasharray') || '').trim().split(/[\s,]+/).map(Number)
    return clock?.getAttribute('stroke') === '#ff0000' && parts.length === 2 && parts[0] < clock.getTotalLength() * 0.2
  })
  assert.equal((await clocks())[0].stroke, '#ff0000')
  assert.equal((await clocks())[0].wash, '')
  assert.equal((await edges()).find((edge) => edge.name === 'A1')?.stroke, '#ff0000')
  assert.equal((await edges()).find((edge) => edge.name === 'A')?.edge || '', '')
  await page.evaluate(() => { window.LOGYQPreview.gestures.smite.mercy.remaining = 8000 })
  const child = await center('A1')
  await touch('pointerdown', child.x, child.y, 45, child.uid)
  await touch('pointerup', child.x, child.y, 45, child.uid)
  const childAmber = await heats()
  assert.equal(childAmber.find((card) => card.name === 'A1')?.wash, 'none')
  assert.equal((childAmber.find((card) => card.name === 'A1')?.washStroke || '').toLowerCase(), '#ffa100')
  assert.equal(childAmber.find((card) => card.name === '')?.wash, 'none')
  assert.equal((childAmber.find((card) => card.name === '')?.washStroke || '').toLowerCase(), '#ff0000')
  assert.equal((await edges()).find((edge) => edge.name === 'A1')?.stroke, '#ffa100')
  await touch('pointerdown', child.x, child.y, 46, child.uid)
  await touch('pointerup', child.x, child.y, 46, child.uid)
  const droppedChild = await heats()
  assert.equal(droppedChild.find((card) => card.name === 'A1')?.wash, 'none')
  assert.equal((droppedChild.find((card) => card.name === 'A1')?.washStroke || '').toLowerCase(), '#ffffff')
  assert.equal(droppedChild.find((card) => card.name === '')?.wash, 'none')
  assert.equal((droppedChild.find((card) => card.name === '')?.washStroke || '').toLowerCase(), '#ff0000')
  assert.equal(await page.evaluate(() => window.LOGYQPreview.gestures.smite.mercy.marks.get(
    Array.from(document.querySelectorAll('g.node')).find((el) => el.__data__?.data?.name === 'A1')?.__data__.data._uid
  )), 'normal')
  assert.ok(await page.evaluate(() => window.LOGYQPreview.gestures.smite.mercy.remaining >= 14000), 'a mercy tap restarts the hold')
  const parentPoint = await center('A')
  await touch('pointerdown', parentPoint.x, parentPoint.y, 43, parentPoint.uid)
  await touch('pointerup', parentPoint.x, parentPoint.y, 43, parentPoint.uid)
  const rearmedFamily = await heats()
  assert.deepEqual(rearmedFamily.map((card) => card.name).sort(), ['', 'A1'])
  assert.equal(rearmedFamily.find((card) => card.name === '')?.wash, 'none')
  assert.equal((rearmedFamily.find((card) => card.name === '')?.washStroke || '').toLowerCase(), '#ffa100')
  assert.equal(rearmedFamily.find((card) => card.name === 'A1')?.wash, 'none')
  assert.equal((rearmedFamily.find((card) => card.name === 'A1')?.washStroke || '').toLowerCase(), '#ffffff')
  assert.equal(await page.evaluate(() => window.LOGYQPreview.gestures.smite.mercy.marks.get(
    Array.from(document.querySelectorAll('g.node')).find((el) => el.__data__?.data?.name === 'A1')?.__data__.data._uid
  )), 'normal')
  assert.equal((await clocks()).length, 1)
  assert.equal((await clocks())[0].name, 'A')
  assert.equal((await clocks())[0].stroke, '#ffa100')
  assert.equal((await clocks())[0].dash, 'none')
  assert.ok(await page.evaluate(() => window.LOGYQPreview.gestures.smite.mercy.remaining >= 14000))
  await touch('pointerdown', child.x, child.y, 47, child.uid)
  await touch('pointerup', child.x, child.y, 47, child.uid)
  const reincluded = await heats()
  assert.equal(reincluded.find((card) => card.name === 'A1')?.wash, 'none')
  assert.equal((reincluded.find((card) => card.name === 'A1')?.washStroke || '').toLowerCase(), '#ff0000')
  assert.equal((await clocks())[0].name, 'A')
  assert.equal((await clocks())[0].stroke, '#ffa100')
  await touch('pointerdown', child.x, child.y, 48, child.uid)
  await touch('pointerup', child.x, child.y, 48, child.uid)
  await touch('pointerdown', child.x, child.y, 49, child.uid)
  await touch('pointerup', child.x, child.y, 49, child.uid)
  assert.equal((await heats()).find((card) => card.name === 'A1')?.wash, 'none')
  assert.equal(((await heats()).find((card) => card.name === 'A1')?.washStroke || '').toLowerCase(), '#ffffff')
  assert.equal((await edges()).find((edge) => edge.name === 'A1')?.stroke, '#ffffff')
  assert.equal((await edges()).find((edge) => edge.name === '')?.stroke, '#ffa100')
  assert.equal((await edges()).find((edge) => edge.name === 'A')?.edge || '', '')
  assert.equal(await page.locator('.node-edit-input').count(), 0)
  const again = await center('A')
  await touch('pointerdown', again.x, again.y, 44, again.uid)
  await touch('pointermove', again.x, again.y + 76, 44, again.uid)
  await touch('pointerup', again.x, again.y + 76, 44, again.uid)
  assert.deepEqual(await page.evaluate(() => window.LOGYQBridge.core.state.wordBank.slice()), ['A'])
  assert.deepEqual((await names()).slice().sort(), ['A1', 'B', 'Root'])
  assert.equal(await page.locator('.logyq-smite-scar').count(), 0)
  await page.locator('[data-tool="undo"]').click()
  await page.waitForFunction(() => window.LOGYQBridge.core.state.root.descendants().some((node) => node.data.name === 'A'))
  assert.equal(await page.locator('.logyq-smite-scar').count(), 0)
  assert.deepEqual(await page.evaluate(() => window.LOGYQBridge.core.state.wordBank.slice()), [])
  assert.equal((await edges()).some((edge) => edge.edge === '1'), false)

  await settle()
  const kidParent = await center('A')
  const thumbKids = await park('bottom', 91)
  await touch('pointerdown', kidParent.x, kidParent.y, 92, kidParent.uid)
  await touch('pointermove', kidParent.x, kidParent.y + 84, 92, kidParent.uid)
  const kidsOnly = await heats()
  assert.equal(kidsOnly.find((card) => card.name === 'A'), undefined)
  assert.equal(kidsOnly.find((card) => card.name === 'A1')?.clock, false)
  assert.equal(kidsOnly.find((card) => card.name === 'A1')?.wash, 'none')
  assert.equal((kidsOnly.find((card) => card.name === 'A1')?.washStroke || '').toLowerCase(), '#ff0000')
  assert.equal(kidsOnly.find((card) => card.name === '')?.wash, 'none')
  assert.equal((kidsOnly.find((card) => card.name === '')?.washStroke || '').toLowerCase(), '#ff0000')
  const kidClocks = await clocks()
  assert.deepEqual(kidClocks.map((clock) => clock.name), ['A'])
  assert.equal(kidClocks[0].stroke, '#ff0000')
  assert.equal(kidClocks[0].wash, '')
  assert.equal((await edges()).some((edge) => edge.edge === '1'), false, 'a kids-only cast leaves connectors quiet')
  await touch('pointerup', kidParent.x, kidParent.y + 84, 92, kidParent.uid)
  await touch('pointerup', thumbKids.x, thumbKids.y, 91)
  const kidTicket = await center('A1')
  await touch('pointerdown', kidTicket.x, kidTicket.y, 94, kidTicket.uid)
  await touch('pointerup', kidTicket.x, kidTicket.y, 94, kidTicket.uid)
  assert.equal((await heats()).find((card) => card.name === 'A1')?.wash, 'none')
  assert.equal(((await heats()).find((card) => card.name === 'A1')?.washStroke || '').toLowerCase(), '#ffa100')
  await touch('pointerdown', kidTicket.x, kidTicket.y, 194, kidTicket.uid)
  await touch('pointerup', kidTicket.x, kidTicket.y, 194, kidTicket.uid)
  const afterKid = await heats()
  assert.equal(afterKid.find((card) => card.name === 'A1')?.wash, 'none')
  assert.equal((afterKid.find((card) => card.name === 'A1')?.washStroke || '').toLowerCase(), '#ffffff')
  assert.equal(afterKid.find((card) => card.name === '')?.wash, 'none')
  assert.equal((afterKid.find((card) => card.name === '')?.washStroke || '').toLowerCase(), '#ff0000')
  assert.deepEqual((await clocks()).map((clock) => clock.name), ['A'])
  const master = await center('A')
  await touch('pointerdown', master.x, master.y, 95, master.uid)
  await touch('pointerup', master.x, master.y, 95, master.uid)
  const kidRearm = await heats()
  assert.equal(kidRearm.find((card) => card.name === 'A'), undefined)
  assert.equal(kidRearm.find((card) => card.name === 'A1')?.wash, 'none')
  assert.equal((kidRearm.find((card) => card.name === 'A1')?.washStroke || '').toLowerCase(), '#ffffff')
  assert.equal(kidRearm.find((card) => card.name === '')?.wash, 'none')
  assert.equal((kidRearm.find((card) => card.name === '')?.washStroke || '').toLowerCase(), '#ffa100')
  assert.deepEqual((await clocks()).map((clock) => clock.name), ['A'])
  assert.equal((await clocks())[0].stroke, '#ffa100')
  assert.equal((await edges()).some((edge) => edge.edge === '1'), false, 'kids-only amber still leaves connectors quiet')
  assert.ok(await page.evaluate(() => window.LOGYQPreview.gestures.smite.mercy.remaining >= 14000))
  await touch('pointerdown', kidTicket.x, kidTicket.y, 195, kidTicket.uid)
  await touch('pointerup', kidTicket.x, kidTicket.y, 195, kidTicket.uid)
  assert.equal((await heats()).find((card) => card.name === 'A1')?.wash, 'none')
  assert.equal(((await heats()).find((card) => card.name === 'A1')?.washStroke || '').toLowerCase(), '#ff0000')
  await touch('pointerdown', master.x, master.y, 96, master.uid)
  await touch('pointerup', master.x, master.y, 96, master.uid)
  assert.equal(((await heats()).find((card) => card.name === 'A1')?.washStroke || '').toLowerCase(), '#ffa100')
  assert.notEqual(await page.evaluate(() => window.LOGYQPreview.gestures.smite.mercy), null)
  await touch('pointerdown', master.x, master.y, 97, master.uid)
  await touch('pointerup', master.x, master.y, 97, master.uid)
  assert.equal(await page.evaluate(() => window.LOGYQPreview.gestures.smite.mercy), null)
  assert.deepEqual(await clocks(), [])
  assert.equal((await edges()).some((edge) => edge.edge === '1'), false)
  assert.equal(await page.locator('.node-edit-input').count(), 0)
  await touch('pointerdown', kidTicket.x, kidTicket.y, 196, kidTicket.uid)
  await touch('pointerup', kidTicket.x, kidTicket.y, 196, kidTicket.uid)
  assert.equal(await page.evaluate(() => window.LOGYQPreview.gestures.smite.mercy), null)
  assert.equal(((await heats()).find((card) => card.name === 'A1')?.washStroke || '').toLowerCase(), '#16a34a')
  await page.evaluate(() => {
    document.querySelectorAll('.node-edit-input').forEach((input) => input.blur())
    document.body.click()
  })
  assert.equal(await page.locator('.node-edit-input').count(), 0)

  await settle()
  const side = await center('B')
  const thumbB = await park('top', 71)
  await touch('pointerdown', side.x, side.y, 72, side.uid)
  await touch('pointermove', side.x, side.y + 80, 72, side.uid)
  await touch('pointerup', side.x, side.y + 80, 72, side.uid)
  await touch('pointerup', thumbB.x, thumbB.y, 71)
  const branch = await center('A')
  const thumbA = await park('middle', 81)
  await touch('pointerdown', branch.x, branch.y, 82, branch.uid)
  await touch('pointermove', branch.x - 86, branch.y, 82, branch.uid)
  await touch('pointerup', branch.x - 86, branch.y, 82, branch.uid)
  await touch('pointerup', thumbA.x, thumbA.y, 81)
  const parallel = await heats()
  assert.equal(parallel.find((card) => card.name === 'B'), undefined)
  assert.equal(parallel.find((card) => card.name === 'A'), undefined)
  assert.equal(parallel.find((card) => card.name === 'A1')?.clock, false)
  assert.equal(parallel.find((card) => card.name === 'A1')?.wash, 'none')
  assert.equal((parallel.find((card) => card.name === 'A1')?.washStroke || '').toLowerCase(), '#ffa100')
  assert.equal(await page.evaluate(() => document.querySelectorAll('path.logyq-smite-clock').length), 2)
  assert.equal(await page.evaluate(() => window.LOGYQPreview.gestures.smite.mercies.length), 2)
  const parallelClocks = await clocks()
  assert.equal(parallelClocks.find((clock) => clock.name === 'B')?.stroke, '#ff0000')
  assert.equal(parallelClocks.find((clock) => clock.name === 'A')?.stroke, '#ffa100')
  assert.equal((await edges()).find((edge) => edge.name === 'A1')?.stroke, '#ffa100')
  assert.equal((await edges()).find((edge) => edge.name === '')?.stroke, '#ffa100')
  assert.equal((await edges()).find((edge) => edge.name === 'A')?.edge || '', '')
  assert.equal((await edges()).find((edge) => edge.name === 'B')?.edge || '', '')
  assert.equal(await page.evaluate(({ a, b }) => {
    const root = window.LOGYQBridge.core.state.root
    const owns = (uid) => root.descendants().some((node) => node.data._uid === uid)
    return root.data.name === 'Root' && owns(a) && owns(b)
  }, { a: branch.uid, b: side.uid }), true, 'both mercy windows are branches of this one map')
  await page.evaluate((uid) => {
    const mercy = window.LOGYQPreview.gestures.smite.mercies.find((item) => item.marks.has(uid))
    mercy.remaining = 1600
  }, side.uid)
  await page.waitForFunction((uid) => {
    const node = Array.from(document.querySelectorAll('g.node')).find((el) => el.__data__?.data?._uid === uid)
    const clock = node?.querySelector('path.logyq-smite-clock')
    const parts = (clock?.getAttribute('stroke-dasharray') || '').trim().split(/[\s,]+/).map(Number)
    return clock?.getAttribute('stroke') === '#ff0000' && parts.length === 2 && parts[0] < clock.getTotalLength() * 0.25
  }, side.uid)
  const split = await clocks()
  assert.equal(split.find((clock) => clock.name === 'B')?.stroke, '#ff0000')
  assert.equal(split.find((clock) => clock.name === 'A')?.stroke, '#ffa100')
  await page.evaluate((uid) => {
    const mercy = window.LOGYQPreview.gestures.smite.mercies.find((item) => item.marks.has(uid))
    mercy.remaining = 15000
  }, side.uid)
  await page.waitForFunction((uid) => {
    const node = Array.from(document.querySelectorAll('g.node')).find((el) => el.__data__?.data?._uid === uid)
    return node?.querySelector('path.logyq-smite-clock')?.getAttribute('stroke-dasharray') === 'none'
  }, side.uid)
  const childAgain = await center('A1')
  await touch('pointerdown', childAgain.x, childAgain.y, 83, childAgain.uid)
  await touch('pointerup', childAgain.x, childAgain.y, 83, childAgain.uid)
  const afterToggle = await heats()
  assert.equal(afterToggle.find((card) => card.name === 'A1')?.wash, 'none')
  assert.equal((afterToggle.find((card) => card.name === 'A1')?.washStroke || '').toLowerCase(), '#ffffff')
  assert.equal((await clocks()).find((clock) => clock.name === 'A')?.stroke, '#ffa100')
  assert.equal((await clocks()).find((clock) => clock.name === 'B')?.stroke, '#ff0000')
  assert.equal((await edges()).find((edge) => edge.name === 'A1')?.edge, '1')
  assert.equal((await edges()).find((edge) => edge.name === 'A1')?.stroke, '#ffffff')
  assert.equal(await page.evaluate(() => document.querySelectorAll('path.logyq-smite-clock').length), 2)
  assert.equal(await page.evaluate(() => window.LOGYQPreview.gestures.smite.mercies.length), 2)
  const overlapThumb = await park('middle', 97)
  const overlap = await center('')
  await touch('pointerdown', overlap.x, overlap.y, 98, overlap.uid)
  await touch('pointermove', overlap.x, overlap.y + 80, 98, overlap.uid)
  await touch('pointerup', overlap.x, overlap.y + 80, 98, overlap.uid)
  await touch('pointerup', overlapThumb.x, overlapThumb.y, 97)
  assert.equal(await page.evaluate(() => window.LOGYQPreview.gestures.smite.mercies.length), 2)
  assert.equal((await clocks()).find((clock) => clock.name === 'A')?.stroke, '#ffa100')
  const finishB = await center('B')
  await touch('pointerdown', finishB.x, finishB.y, 93, finishB.uid)
  await touch('pointermove', finishB.x, finishB.y + 74, 93, finishB.uid)
  await touch('pointerup', finishB.x, finishB.y + 74, 93, finishB.uid)
  await settle()
  assert.equal((await names()).includes('B'), false)
  assert.equal(await page.locator('.logyq-smite-scar').count(), 0)
  assert.equal(await page.evaluate(() => window.LOGYQPreview.gestures.smite.mercies.length), 1)
  assert.equal((await clocks()).find((clock) => clock.name === 'A')?.stroke, '#ffa100')
  const rootAgain = await center('Root')
  const thumbRoot = await park('top', 94)
  await touch('pointerdown', rootAgain.x, rootAgain.y, 95, rootAgain.uid)
  await touch('pointermove', rootAgain.x, rootAgain.y + 80, 95, rootAgain.uid)
  await touch('pointerup', rootAgain.x, rootAgain.y + 80, 95, rootAgain.uid)
  await touch('pointerup', thumbRoot.x, thumbRoot.y, 94)
  const both = await clocks()
  assert.equal(await page.evaluate(() => window.LOGYQPreview.gestures.smite.mercies.length), 2)
  assert.equal(both.find((clock) => clock.name === 'Root')?.stroke, '#ff0000')
  assert.equal(both.find((clock) => clock.name === 'A')?.stroke, '#ffa100')

  assert.deepEqual(errors, [])
  await context.close()
})

test('LOGYQ attach follows the raised ghost center, not the finger', async () => {
  const context = await newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await stubMaps(context)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logyq/index.html`, { waitUntil: 'networkidle' })
  await waitForBoot(page)
  await page.evaluate(() => {
    window.LOGYQPreview.app.hasOpenMap = true
    document.body.classList.add('logyq-map-open')
    document.body.classList.remove('logyq-home')
    document.querySelectorAll('.logiq-backdrop.is-open').forEach((el) => el.classList.remove('is-open'))
    window.LOGYQBridge.loadMap({
      name: 'Root',
      children: [{ name: 'Upper', children: [{ name: 'Lower' }] }],
    }, ['Chip'])
  })
  await page.waitForSelector('#Dock .chip')
  await page.waitForFunction(() => {
    const upper = Array.from(document.querySelectorAll('g.node')).find((el) => el.__data__?.data?.name === 'Upper')
    return upper?.getBoundingClientRect().width > 20
  })

  const chip = await page.evaluate(() => {
    const node = Array.from(document.querySelectorAll('#Dock .chip')).find((el) => el.textContent.trim() === 'Chip')
    const rect = node.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  })
  const cdp = await page.context().newCDPSession(page)
  const nudge = { x: chip.x, y: chip.y - 36 }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...chip, id: 1 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...nudge, id: 1 }] })
  await page.waitForTimeout(40)
  const lift = await page.evaluate((finger) => {
    const rect = document.getElementById('logyq-chip-ghost')?.getBoundingClientRect()
    return {
      x: rect.left + rect.width / 2 - finger.x,
      y: rect.top + rect.height / 2 - finger.y,
    }
  }, nudge)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...chip, id: 1 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  assert.ok(lift.y < -30, `chip ghost should sit above the finger, lift=${lift.y}`)

  await page.evaluate((gap) => {
    const state = window.LOGYQBridge.core.state
    const svg = document.getElementById('canvas')
    const upper = state.root.descendants().find((node) => node.data.name === 'Upper')
    const lower = state.root.descendants().find((node) => node.data.name === 'Lower')
    const k = gap / (lower.y - upper.y)
    const tx = 200 - k * lower.x
    const ty = 460 - k * lower.y
    state._lastMoat = Date.now()
    window.d3.select(svg).call(state.zoom.transform, window.d3.zoomIdentity.translate(tx, ty).scale(k))
    state._lastMoat = Date.now()
  }, -lift.y)
  const cards = await page.evaluate(() => {
    const box = (name) => {
      const node = Array.from(document.querySelectorAll('g.node')).find((el) => el.__data__?.data?.name === name)
      const rect = node.getBoundingClientRect()
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, top: rect.top, bottom: rect.bottom }
    }
    return { upper: box('Upper'), lower: box('Lower') }
  })
  const aim = { x: cards.upper.x - lift.x, y: cards.upper.y - lift.y }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...chip, id: 2 }] })
  const steps = 8
  for (let i = 1; i <= steps; i += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{
        x: chip.x + ((aim.x - chip.x) * i) / steps,
        y: chip.y + ((aim.y - chip.y) * i) / steps,
        id: 2,
      }],
    })
    await page.waitForTimeout(16)
  }
  const liveUpper = await page.evaluate(() => {
    const node = Array.from(document.querySelectorAll('g.node')).find((el) => el.__data__?.data?.name === 'Upper')
    const rect = node.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  })
  const corrected = { x: liveUpper.x - lift.x, y: liveUpper.y - lift.y }
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: corrected.x, y: corrected.y, id: 2 }],
  })
  await page.waitForTimeout(40)
  const claim = await page.evaluate((finger) => {
    const ghost = document.getElementById('logyq-chip-ghost')?.getBoundingClientRect()
    const ghostPoint = ghost ? { x: ghost.left + ghost.width / 2, y: ghost.top + ghost.height / 2 } : null
    const svg = document.getElementById('canvas')
    const origin = svg.getBoundingClientRect()
    const graph = (point) => {
      const [x, y] = window.d3.zoomTransform(svg).invert([point.x - origin.left, point.y - origin.top])
      return window.LOGYQBridge.core.detectors.pick({ x, y })
    }
    const nameOf = (uid) => window.LOGYQBridge.core.state.root.descendants().find((node) => node.data._uid === uid)?.data.name || null
    const ghostPick = ghostPoint ? graph(ghostPoint) : null
    const fingerPick = graph(finger)
    const marked = document.querySelector('g.node.drop-target')?.__data__?.data?.name || null
    return {
      ghost: ghostPoint,
      marked,
      ghostTarget: ghostPick?.type === 'node' ? nameOf(ghostPick.targetUid) : ghostPick?.type || null,
      fingerTarget: fingerPick?.type === 'node' ? nameOf(fingerPick.targetUid) : fingerPick?.type || null,
      drop: window.LOGYQBridge.core.state.chipDrag.drop?.targetUid
        ? nameOf(window.LOGYQBridge.core.state.chipDrag.drop.targetUid)
        : window.LOGYQBridge.core.state.chipDrag.drop?.type || null,
    }
  }, corrected)
  assert.equal(claim.marked, 'Upper', JSON.stringify(claim))
  assert.equal(claim.drop, 'Upper', JSON.stringify(claim))
  assert.notEqual(claim.fingerTarget, 'Upper', JSON.stringify(claim))
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForFunction(() => {
    const upper = window.LOGYQBridge.core.state.root.descendants().find((node) => node.data.name === 'Upper')
    return upper?.children?.some((child) => child.data.name === 'Chip')
  })
  assert.equal(await page.evaluate(() => {
    const lower = window.LOGYQBridge.core.state.root.descendants().find((node) => node.data.name === 'Lower')
    return lower?.children?.some((child) => child.data.name === 'Chip') || false
  }), false)

  await page.evaluate(() => {
    window.LOGYQBridge.loadMap({
      name: 'Root',
      children: [{ name: 'Upper', children: [{ name: 'Lower' }] }],
    }, [])
  })
  await page.waitForFunction(() => document.querySelectorAll('g.node').length >= 3)
  await page.waitForTimeout(400)
  await page.evaluate(() => {
    const state = window.LOGYQBridge.core.state
    const svg = document.getElementById('canvas')
    const upper = state.root.descendants().find((node) => node.data.name === 'Upper')
    const lower = state.root.descendants().find((node) => node.data.name === 'Lower')
    const k = 80 / (lower.y - upper.y)
    state._lastMoat = Date.now()
    window.d3.select(svg).call(state.zoom.transform, window.d3.zoomIdentity.translate(200 - k * lower.x, 500 - k * lower.y).scale(k))
    state._lastMoat = Date.now()
  })
  const lower = await page.evaluate(() => {
    const node = Array.from(document.querySelectorAll('g.node')).find((el) => el.__data__?.data?.name === 'Lower')
    const rect = node.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  })
  await page.evaluate((point) => {
    document.getElementById('canvas').dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, cancelable: true, composed: true, pointerType: 'touch', pointerId: 9,
      isPrimary: true, button: 0, buttons: 1, clientX: point.x, clientY: point.y,
    }))
  }, lower)
  await page.waitForFunction(() => document.body.classList.contains('v2-branch-drag'))
  const upper = await page.evaluate(() => {
    const node = Array.from(document.querySelectorAll('g.node')).find((el) => el.__data__?.data?.name === 'Upper')
    const rect = node.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right }
  })
  const parked = await page.evaluate(() => {
    const ghost = document.querySelector('#logyq-v162-branch-preview svg')?.getBoundingClientRect()
    return ghost ? { x: ghost.left + ghost.width / 2, y: ghost.top + ghost.height / 2 } : null
  })
  const moved = {
    x: lower.x + (upper.x - (parked?.x || lower.x)),
    y: lower.y + (upper.y - (parked?.y || lower.y)) + 24,
  }
  await page.evaluate((point) => {
    document.getElementById('canvas').dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true, cancelable: true, composed: true, pointerType: 'touch', pointerId: 9,
      isPrimary: true, button: 0, buttons: 1, clientX: point.x, clientY: point.y,
    }))
  }, moved)
  await page.waitForTimeout(80)
  const landed = await page.evaluate(() => {
    const ghost = document.querySelector('#logyq-v162-branch-preview svg')?.getBoundingClientRect()
    return ghost ? { x: ghost.left + ghost.width / 2, y: ghost.top + ghost.height / 2 } : null
  })
  const correction = { x: moved.x + (upper.x - landed.x), y: moved.y + (upper.y - landed.y) }
  await page.evaluate((point) => {
    document.getElementById('canvas').dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true, cancelable: true, composed: true, pointerType: 'touch', pointerId: 9,
      isPrimary: true, button: 0, buttons: 1, clientX: point.x, clientY: point.y,
    }))
  }, correction)
  await page.waitForTimeout(80)
  const cardClaim = await page.evaluate((finger) => {
    const ghost = document.querySelector('#logyq-v162-branch-preview svg')?.getBoundingClientRect()
    const ghostPoint = ghost ? { x: ghost.left + ghost.width / 2, y: ghost.top + ghost.height / 2 } : null
    const upperNode = Array.from(document.querySelectorAll('g.node')).find((el) => el.__data__?.data?.name === 'Upper')
    const upperBox = upperNode.getBoundingClientRect()
    const inside = (point, box) => point && point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom
    return {
      marked: document.querySelector('g.node.drop-target')?.__data__?.data?.name || null,
      ghost: ghostPoint,
      finger,
      ghostOnUpper: inside(ghostPoint, upperBox),
      fingerOnUpper: inside(finger, upperBox),
      opacity: getComputedStyle(document.getElementById('logyq-v162-branch-preview')).opacity,
    }
  }, correction)
  assert.equal(cardClaim.opacity, '0.55')
  assert.equal(cardClaim.ghostOnUpper, true, JSON.stringify(cardClaim))
  assert.equal(cardClaim.fingerOnUpper, false, JSON.stringify(cardClaim))
  assert.equal(cardClaim.marked, 'Upper', JSON.stringify(cardClaim))
  await page.evaluate((point) => {
    document.getElementById('canvas').dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true, cancelable: true, composed: true, pointerType: 'touch', pointerId: 9,
      isPrimary: true, button: 0, buttons: 0, clientX: point.x, clientY: point.y,
    }))
  }, correction)
  await page.waitForFunction(() => !document.body.classList.contains('v2-branch-drag'))
  assert.equal(await page.evaluate(() => {
    const upperNode = window.LOGYQBridge.core.state.root.descendants().find((node) => node.data.name === 'Upper')
    return upperNode?.children?.some((child) => child.data.name === 'Lower') || false
  }), true)
  assert.deepEqual(errors, [])
  await cdp.detach()
  await context.close()
})

test('LOGYQ Word Bank chip drag pans the map with the card-drag follow', async () => {
  const context = await newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await stubMaps(context)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logyq/index.html`, { waitUntil: 'networkidle' })
  await waitForBoot(page)
  await page.evaluate(() => {
    window.LOGYQPreview.app.hasOpenMap = true
    document.body.classList.add('logyq-map-open')
    document.body.classList.remove('logyq-home')
    document.querySelectorAll('.logiq-backdrop.is-open').forEach((el) => el.classList.remove('is-open'))
    window.LOGYQBridge.loadMap({
      name: 'Root',
      children: [{ name: 'Far' }],
    }, ['Pan'])
  })
  await page.waitForSelector('#Dock .chip')
  await page.waitForFunction(() => {
    const far = Array.from(document.querySelectorAll('g.node')).find((el) => el.__data__?.data?.name === 'Far')
    return far?.getBoundingClientRect().width > 20 && !document.body.classList.contains('logyq-layout-settling')
  })
  const parked = await page.evaluate(() => {
    const state = window.LOGYQBridge.core.state
    const svg = document.getElementById('canvas')
    const node = state.root.descendants().find((item) => item.data.name === 'Far')
    const box = svg.getBoundingClientRect()
    const tx = box.left + box.width + 170 - node.x
    const ty = box.top + box.height / 2 - node.y
    state._lastMoat = Date.now() + 30000
    window.d3.select(svg).call(state.zoom.transform, window.d3.zoomIdentity.translate(tx, ty).scale(1))
    state._lastMoat = Date.now() + 30000
    const rect = Array.from(document.querySelectorAll('g.node')).find((el) => el.__data__?.data?.name === 'Far').getBoundingClientRect()
    const chip = Array.from(document.querySelectorAll('#Dock .chip')).find((el) => el.textContent.trim() === 'Pan').getBoundingClientRect()
    const zoom = window.d3.zoomTransform(svg)
    return {
      tx: zoom.x,
      farX: rect.left + rect.width / 2,
      chip: { x: chip.left + chip.width / 2, y: chip.top + chip.height / 2 },
      center: { x: box.left + box.width / 2, y: box.top + box.height / 2 },
      edge: { x: box.right - 12, y: box.top + box.height / 2 },
    }
  })
  assert.ok(parked.farX > parked.edge.x + 80, `Far should start off the right, x=${parked.farX} edge=${parked.edge.x}`)

  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...parked.chip, id: 1 }] })
  const steps = 6
  for (let i = 1; i <= steps; i += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{
        x: parked.chip.x + ((parked.edge.x - parked.chip.x) * i) / steps,
        y: parked.chip.y + ((parked.edge.y - parked.chip.y) * i) / steps,
        id: 1,
      }],
    })
    await page.waitForTimeout(16)
  }
  await page.waitForTimeout(280)
  const panned = await page.evaluate(() => {
    const svg = document.getElementById('canvas')
    const zoom = window.d3.zoomTransform(svg)
    const rect = Array.from(document.querySelectorAll('g.node')).find((el) => el.__data__?.data?.name === 'Far').getBoundingClientRect()
    return {
      tx: zoom.x,
      farX: rect.left + rect.width / 2,
      dragging: document.body.classList.contains('logyq-chip-drag'),
    }
  })
  assert.equal(panned.dragging, true)
  assert.ok(parked.tx - panned.tx > 24, `zoom x should drop, before=${parked.tx} after=${panned.tx}`)
  assert.ok(parked.farX - panned.farX > 24, `Far should slide left, before=${parked.farX} after=${panned.farX}`)

  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: parked.center.x, y: parked.center.y, id: 1 }],
  })
  await page.waitForTimeout(50)
  const held = await page.evaluate(() => window.d3.zoomTransform(document.getElementById('canvas')).x)
  await page.waitForTimeout(220)
  const still = await page.evaluate(() => window.d3.zoomTransform(document.getElementById('canvas')).x)
  assert.ok(Math.abs(still - held) < 2, `center hold should not keep panning, held=${held} still=${still}`)

  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ ...parked.chip, id: 1 }],
  })
  await page.waitForTimeout(40)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForFunction(() => !document.body.classList.contains('logyq-chip-drag'))
  assert.equal(await page.evaluate(() => window.LOGYQBridge.core.state.wordBank.includes('Pan')), true)
  assert.equal(await page.evaluate(() => window.LOGYQBridge.core.state.root.descendants().some((node) => node.data.name === 'Pan')), false)
  assert.deepEqual(errors, [])
  await cdp.detach()
  await context.close()
})

test('LOGYQ Word Bank chip still pans when the finger is in the shelf slack', async () => {
  const context = await newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await stubMaps(context)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logyq/index.html`, { waitUntil: 'networkidle' })
  await waitForBoot(page)
  await page.evaluate(() => {
    window.LOGYQPreview.app.hasOpenMap = true
    document.body.classList.add('logyq-map-open')
    document.body.classList.remove('logyq-home')
    document.querySelectorAll('.logiq-backdrop.is-open').forEach((el) => el.classList.remove('is-open'))
    window.LOGYQBridge.loadMap({
      name: 'Root',
      children: [{ name: 'Far' }],
    }, ['Pan'])
  })
  await page.waitForSelector('#Dock .chip')
  await page.waitForFunction(() => {
    const far = Array.from(document.querySelectorAll('g.node')).find((el) => el.__data__?.data?.name === 'Far')
    return far?.getBoundingClientRect().width > 20 && !document.body.classList.contains('logyq-layout-settling')
  })
  const parked = await page.evaluate(() => {
    const state = window.LOGYQBridge.core.state
    const svg = document.getElementById('canvas')
    const node = state.root.descendants().find((item) => item.data.name === 'Far')
    const box = svg.getBoundingClientRect()
    const dock = document.getElementById('Dock').getBoundingClientRect()
    const tx = box.left + box.width + 220 - node.x
    const ty = box.top + box.height / 2 - node.y
    state._lastMoat = Date.now() + 30000
    window.d3.select(svg).call(state.zoom.transform, window.d3.zoomIdentity.translate(tx, ty).scale(1))
    state._lastMoat = Date.now() + 30000
    const chip = Array.from(document.querySelectorAll('#Dock .chip')).find((el) => el.textContent.trim() === 'Pan').getBoundingClientRect()
    const zoom = window.d3.zoomTransform(svg)
    return {
      tx: zoom.x,
      chip: { x: chip.left + chip.width / 2, y: chip.top + chip.height / 2 },
      lift: { x: chip.left + chip.width / 2, y: dock.top - 140 },
      edge: { x: box.right - 16, y: dock.top - 16 },
      dockTop: dock.top,
    }
  })
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...parked.chip, id: 1 }] })
  const liftSteps = 6
  for (let i = 1; i <= liftSteps; i += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{
        x: parked.chip.x + ((parked.lift.x - parked.chip.x) * i) / liftSteps,
        y: parked.chip.y + ((parked.lift.y - parked.chip.y) * i) / liftSteps,
        id: 1,
      }],
    })
    await page.waitForTimeout(16)
  }
  assert.equal(await page.evaluate(() => document.body.classList.contains('logyq-chip-drag')), true)
  const slideSteps = 8
  for (let i = 1; i <= slideSteps; i += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{
        x: parked.lift.x + ((parked.edge.x - parked.lift.x) * i) / slideSteps,
        y: parked.lift.y + ((parked.edge.y - parked.lift.y) * i) / slideSteps,
        id: 1,
      }],
    })
    await page.waitForTimeout(16)
  }
  await page.waitForTimeout(450)
  const panned = await page.evaluate((dockTop) => {
    const svg = document.getElementById('canvas')
    const zoom = window.d3.zoomTransform(svg)
    const ghost = document.getElementById('logyq-chip-ghost')?.getBoundingClientRect()
    const far = Array.from(document.querySelectorAll('g.node')).find((el) => el.__data__?.data?.name === 'Far').getBoundingClientRect()
    return {
      tx: zoom.x,
      farX: far.left + far.width / 2,
      ghostTop: ghost?.top ?? null,
      fingerInSlack: true,
      dockTop,
    }
  }, parked.dockTop)
  assert.ok(parked.edge.y > parked.dockTop - 28, `finger should sit in the shelf slack, y=${parked.edge.y} dock=${parked.dockTop}`)
  assert.ok(panned.ghostTop != null && panned.ghostTop < parked.dockTop - 28, `chip should be clear of the shelf, ghostTop=${panned.ghostTop}`)
  assert.ok(parked.tx - panned.tx > 40, `slack-edge hold should keep panning, before=${parked.tx} after=${panned.tx} far=${panned.farX}`)
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ ...parked.chip, id: 1 }],
  })
  await page.waitForTimeout(40)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForFunction(() => !document.body.classList.contains('logyq-chip-drag'))
  assert.equal(await page.evaluate(() => window.LOGYQBridge.core.state.wordBank.includes('Pan')), true)
  assert.deepEqual(errors, [])
  await cdp.detach()
  await context.close()
})

test('LOGYQ drag a Word Bank chip onto the map on phone and desktop', async () => {
  async function openBankMap(page, bank = ['Pop', 'Stay']) {
    await page.goto(`${baseUrl}/logyq/index.html`, { waitUntil: 'networkidle' })
    await waitForBoot(page)
    await page.evaluate((words) => {
      window.LOGYQPreview.app.hasOpenMap = true
      document.body.classList.add('logyq-map-open')
      document.body.classList.remove('logyq-home')
      document.querySelectorAll('.logiq-backdrop.is-open').forEach((el) => el.classList.remove('is-open'))
      window.LOGYQBridge.loadMap({
        name: 'Root',
        color: '#2563eb',
        children: [{ name: 'A' }, { name: 'B' }],
      }, words)
    }, bank)
    await page.waitForFunction(() => document.querySelector('#Dock .chip')?.textContent === 'Pop')
    await centerCard(page, 'A')
  }

  async function centerCard(page, name) {
    await page.waitForFunction((label) => {
      const node = Array.from(document.querySelectorAll('g.node')).find((el) => el.__data__?.data?.name === label)
      const rect = node?.getBoundingClientRect()
      return rect && rect.width > 20 && rect.height > 20
    }, name)
    await page.waitForTimeout(320)
    await page.evaluate((label) => {
      const state = window.LOGYQBridge.core.state
      state._lastMoat = Date.now()
      try { clearTimeout(window.__centerSoonT) } catch (_error) {}
      const svg = document.getElementById('canvas')
      const node = Array.from(document.querySelectorAll('g.node')).find((el) => el.__data__?.data?.name === label)
      const rect = node.getBoundingClientRect()
      const box = svg.getBoundingClientRect()
      const dx = (box.left + box.width / 2) - (rect.left + rect.width / 2)
      const dy = (box.top + box.height * 0.42) - (rect.top + rect.height / 2)
      window.d3.select(svg).call(state.zoom.translateBy, dx, dy)
      state._lastMoat = Date.now()
      try { clearTimeout(window.__centerSoonT) } catch (_error) {}
    }, name)
    const placed = await page.waitForFunction((label) => {
      const svg = document.getElementById('canvas')
      const node = Array.from(document.querySelectorAll('g.node')).find((el) => el.__data__?.data?.name === label)
      const rect = node?.getBoundingClientRect()
      const box = svg.getBoundingClientRect()
      const dockTop = document.getElementById('Dock').getBoundingClientRect().top
      if (!rect || rect.width < 20) return false
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      window.__centerCard = { label, cx, cy, box: { t: box.top, b: box.bottom, l: box.left, r: box.right }, dockTop }
      return cx > box.left + 8 && cx < box.right - 8 && cy > box.top + 8 && cy < Math.min(box.bottom - 8, dockTop - 8)
    }, name, { timeout: 4000 }).then(() => true).catch(() => false)
    if (!placed) {
      const info = await page.evaluate(() => window.__centerCard)
      throw new Error(`card ${name} stayed off the canvas ${JSON.stringify(info)}`)
    }
  }

  async function chipPoint(page, text) {
    return page.evaluate((label) => {
      const node = Array.from(document.querySelectorAll('#Dock .chip')).find((el) => el.textContent.trim() === label)
      const rect = node.getBoundingClientRect()
      const x = rect.left + rect.width / 2
      const y = rect.top + rect.height / 2
      const hit = document.elementFromPoint(x, y)
      return {
        x,
        y,
        hitChip: !!hit?.closest?.('.chip'),
        touchAction: getComputedStyle(node).touchAction,
        draggable: node.draggable,
      }
    }, text)
  }

  async function cardPoint(page, name) {
    return page.evaluate((label) => {
      const node = Array.from(document.querySelectorAll('g.node')).find((el) => el.__data__?.data?.name === label)
      const rect = node.getBoundingClientRect()
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    }, name)
  }

  async function touchPath(page, points) {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: points[0].x, y: points[0].y, id: 1 }] })
    for (let index = 1; index < points.length; index += 1) {
      const from = points[index - 1]
      const to = points[index]
      const steps = 5
      for (let i = 1; i <= steps; i += 1) {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{
            x: from.x + ((to.x - from.x) * i) / steps,
            y: from.y + ((to.y - from.y) * i) / steps,
            id: 1,
          }],
        })
        await page.waitForTimeout(16)
      }
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await cdp.detach()
  }

  async function touchDragAim(page, from, to, sample) {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y, id: 1 }] })
    const nudge = {
      x: from.x + Math.sign(to.x - from.x || 1) * 18,
      y: Math.max(70, from.y - 28),
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: nudge.x, y: nudge.y, id: 1 }] })
    await page.waitForTimeout(40)
    const lift = await page.evaluate((finger) => {
      const rect = document.getElementById('logyq-chip-ghost')?.getBoundingClientRect()
      if (!rect || rect.width < 1) return { x: 0, y: 0 }
      return {
        x: rect.left + rect.width / 2 - finger.x,
        y: rect.top + rect.height / 2 - finger.y,
      }
    }, nudge)
    const aimAt = async () => (typeof to === 'function' ? await to() : to)
    let prev = nudge
    const steps = 8
    for (let i = 1; i <= steps; i += 1) {
      const live = await aimAt()
      const dest = { x: live.x - lift.x, y: live.y - lift.y }
      const x = prev.x + (dest.x - prev.x) * 0.45
      const y = prev.y + (dest.y - prev.y) * 0.45
      prev = { x, y }
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y, id: 1 }],
      })
      await page.waitForTimeout(16)
      if (sample && i === 4) await sample({ x, y })
    }
    const live = await aimAt()
    let settled = { x: live.x - lift.x, y: live.y - lift.y }
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: settled.x, y: settled.y, id: 1 }],
    })
    await page.waitForTimeout(32)
    const liveAgain = await aimAt()
    settled = { x: liveAgain.x - lift.x, y: liveAgain.y - lift.y }
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: settled.x, y: settled.y, id: 1 }],
    })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await cdp.detach()
  }

  async function touchDrag(page, from, to, sample) {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y, id: 1 }] })
    const steps = 8
    for (let i = 1; i <= steps; i += 1) {
      const x = from.x + ((to.x - from.x) * i) / steps
      const y = from.y + ((to.y - from.y) * i) / steps
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y, id: 1 }],
      })
      await page.waitForTimeout(16)
      if (sample && i === 4) await sample({ x, y })
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await cdp.detach()
  }

  async function mouseDrag(page, from, to) {
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 12 })
    await page.mouse.up()
  }

  const phone = await newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await stubMaps(phone)
  const phonePage = await phone.newPage()
  const phoneErrors = []
  phonePage.on('pageerror', (error) => phoneErrors.push(error.message))
  await openBankMap(phonePage)
  assert.equal(await phonePage.locator('#logyq-bank-all').textContent(), 'All')
  await phonePage.locator('#logyq-bank-all').tap()
  assert.deepEqual(await phonePage.locator('#Dock .chip.is-outlined').allTextContents(), ['Pop', 'Stay'])
  assert.equal(await phonePage.locator('#logyq-bank-all').textContent(), 'None')
  await phonePage.locator('#logyq-bank-all').tap()
  assert.equal(await phonePage.locator('#Dock .chip.is-outlined').count(), 0)
  assert.equal(await phonePage.locator('#logyq-bank-all').textContent(), 'All')

  const pop = await chipPoint(phonePage, 'Pop')
  assert.equal(pop.hitChip, true)
  assert.equal(pop.touchAction, 'none')
  assert.equal(pop.draggable, false)
  const cardA = await cardPoint(phonePage, 'A')
  await touchDragAim(phonePage, pop, () => cardPoint(phonePage, 'A'), async (point) => {
    const ghost = await phonePage.evaluate(() => {
      const stack = document.getElementById('logyq-chip-ghost')
      const rect = stack?.getBoundingClientRect()
      const chip = stack?.querySelector('.chip')
      return {
        text: chip?.textContent || '',
        bottom: rect?.bottom ?? null,
        opacity: chip ? getComputedStyle(chip).opacity : null,
        lifting: document.querySelector('#Dock .chip.is-lifting')?.textContent || '',
      }
    })
    assert.equal(ghost.text, 'Pop')
    assert.equal(ghost.lifting, 'Pop')
    assert.ok(Number(ghost.opacity) < 0.9)
    assert.ok(ghost.bottom < point.y - 8)
  })
  await phonePage.waitForFunction(() => {
    const parent = window.LOGYQBridge.core.state.root.descendants().find((node) => node.data.name === 'A')
    return parent?.children?.some((child) => child.data.name === 'Pop')
  })
  assert.deepEqual(await phonePage.evaluate(() => window.LOGYQBridge.core.state.wordBank.slice()), ['Stay'])
  assert.equal(await phonePage.locator('#logyq-chip-ghost').count(), 0)

  await phonePage.waitForFunction(() => !document.body.classList.contains('logyq-layout-settling'))
  const stay = await chipPoint(phonePage, 'Stay')
  await touchPath(phonePage, [stay, { x: stay.x, y: Math.max(64, stay.y - 160) }, stay])
  assert.deepEqual(await phonePage.evaluate(() => window.LOGYQBridge.core.state.wordBank.slice()), ['Stay'])
  assert.equal(await phonePage.evaluate(() => window.LOGYQBridge.core.state.root.descendants().some((node) => node.data.name === 'Stay')), false)

  const beforeTap = await phonePage.evaluate(() => window.LOGYQBridge.core.state.root.descendants().map((node) => node.data.name).sort())
  await phonePage.locator('#Dock .chip', { hasText: 'Stay' }).tap()
  assert.equal(await phonePage.locator('#Dock .chip.is-outlined').textContent(), 'Stay')
  assert.deepEqual(await phonePage.evaluate(() => window.LOGYQBridge.core.state.wordBank.slice()), ['Stay'])
  assert.deepEqual(await phonePage.evaluate(() => window.LOGYQBridge.core.state.root.descendants().map((node) => node.data.name).sort()), beforeTap)
  await phonePage.locator('#Dock .chip', { hasText: 'Stay' }).tap()
  assert.equal(await phonePage.locator('#Dock .chip.is-outlined').count(), 0)

  await phonePage.evaluate(() => window.LOGYQBridge.core.wordDock.addWords('Mint'))
  assert.deepEqual(await phonePage.evaluate(() => window.LOGYQBridge.core.state.wordBank.slice()), ['Stay', 'Mint'])
  await centerCard(phonePage, 'A')
  const gap = await phonePage.evaluate(() => {
    const svg = document.getElementById('canvas')
    const transform = window.d3.zoomTransform(svg)
    const origin = svg.getBoundingClientRect()
    const dockTop = document.getElementById('Dock').getBoundingClientRect().top
    const nameOf = (uid) => window.LOGYQBridge.core.state.root.descendants().find((node) => node.data._uid === uid)?.data.name
    const dets = window.LOGYQBridge.core.state.detectors.filter((det) => det.kind === 'sibling' || det.kind === 'edgeSibling')
    for (const det of dets) {
      const [px, py] = transform.apply([det.x + det.width / 2, det.y + Math.min(28, det.height / 2)])
      const x = origin.left + px
      const y = origin.top + py
      if (x < 12 || y < 56 || x > innerWidth - 12 || y > dockTop - 12) continue
      const names = window.LOGYQBridge.core.state.root.descendants()
      const prev = nameOf(det.prevUid)
      const next = nameOf(det.nextUid)
      if (!prev || !next) continue
      return {
        x,
        y,
        gx: det.x + det.width / 2,
        gy: det.y + Math.min(28, det.height / 2),
        prev,
        next,
        parent: names.find((node) => node.data._uid === det.parentUid)?.data.name || 'Root',
      }
    }
    return null
  })
  assert.ok(gap, 'sibling gap is on screen')
  await touchDragAim(phonePage, await chipPoint(phonePage, 'Mint'), () => phonePage.evaluate((graph) => {
    const svg = document.getElementById('canvas')
    const origin = svg.getBoundingClientRect()
    const [px, py] = window.d3.zoomTransform(svg).apply([graph.gx, graph.gy])
    return { x: origin.left + px, y: origin.top + py }
  }, gap))
  await phonePage.waitForFunction((parentName) => {
    const root = window.LOGYQBridge.core.state.root
    const parent = parentName === root.data.name
      ? root
      : root.descendants().find((node) => node.data.name === parentName)
    return parent?.children?.some((child) => child.data.name === 'Mint')
      && !window.LOGYQBridge.core.state.wordBank.includes('Mint')
  }, gap.parent)
  const siblings = await phonePage.evaluate((parentName) => {
    const root = window.LOGYQBridge.core.state.root
    const parent = parentName === root.data.name
      ? root
      : root.descendants().find((node) => node.data.name === parentName)
    return parent.children.map((node) => node.data.name)
  }, gap.parent)
  assert.ok(siblings.indexOf(gap.prev) < siblings.indexOf('Mint') && siblings.indexOf('Mint') < siblings.indexOf(gap.next))

  await phonePage.evaluate(() => window.LOGYQBridge.core.wordDock.addWords('Miss'))
  const miss = await phonePage.evaluate(() => {
    const svg = document.getElementById('canvas')
    const transform = window.d3.zoomTransform(svg)
    const origin = svg.getBoundingClientRect()
    const dockTop = document.getElementById('Dock').getBoundingClientRect().top
    for (let y = origin.top + 64; y < dockTop - 16; y += 22) {
      for (let x = origin.left + 10; x < origin.right - 10; x += 26) {
        const [gx, gy] = transform.invert([x - origin.left, y - origin.top])
        const drop = window.LOGYQBridge.core.detectors.pick({ x: gx, y: gy })
        if (!drop || (drop.type !== 'node' && drop.type !== 'gap')) return { x, y, gx, gy }
      }
    }
    return null
  })
  assert.ok(miss, 'empty canvas beside the tree is a miss')
  const beforeMiss = await phonePage.evaluate(() => window.LOGYQBridge.core.state.root.data.name)
  await touchDragAim(phonePage, await chipPoint(phonePage, 'Miss'), () => phonePage.evaluate((graph) => {
    const svg = document.getElementById('canvas')
    const origin = svg.getBoundingClientRect()
    const [px, py] = window.d3.zoomTransform(svg).apply([graph.gx, graph.gy])
    return { x: origin.left + px, y: origin.top + py }
  }, miss))
  assert.equal(await phonePage.evaluate(() => window.LOGYQBridge.core.state.root.data.name), beforeMiss)
  assert.equal(await phonePage.evaluate(() => window.LOGYQBridge.core.state.wordBank.includes('Miss')), true)
  assert.equal(await phonePage.evaluate(() => window.LOGYQBridge.core.state.root.descendants().some((node) => node.data.name === 'Miss')), false)

  await phonePage.evaluate(() => {
    window.LOGYQBridge.loadMap({ name: 'Root', children: [{ name: 'A' }] }, ['Bare'])
    window.LOGYQBridge.core.state.root = null
  })
  const bare = await chipPoint(phonePage, 'Bare')
  await touchDragAim(phonePage, bare, { x: 180, y: 280 })
  await phonePage.waitForFunction(() => window.LOGYQBridge.core.state.root?.data?.name === 'Bare')
  assert.deepEqual(await phonePage.evaluate(() => window.LOGYQBridge.core.state.wordBank.slice()), [])

  await phonePage.evaluate(() => {
    window.LOGYQBridge.loadMap({ name: 'Root', children: [{ name: 'A' }] }, ['First', 'Second'])
    window.LOGYQBridge.core.state.root = null
  })
  await phonePage.locator('#Dock .chip', { hasText: 'First' }).tap()
  await phonePage.locator('#Dock .chip', { hasText: 'Second' }).tap()
  assert.deepEqual(await phonePage.locator('#Dock .chip.is-outlined').allTextContents(), ['First', 'Second'])
  await touchDragAim(phonePage, await chipPoint(phonePage, 'Second'), { x: 180, y: 280 })
  await phonePage.waitForFunction(() => window.LOGYQBridge.core.state.root?.data?.name === 'First')
  assert.deepEqual(await phonePage.evaluate(() => window.LOGYQBridge.core.state.root.children.map((node) => node.data.name)), ['Second'])
  assert.deepEqual(await phonePage.evaluate(() => window.LOGYQBridge.core.state.wordBank.slice()), [])
  assert.equal(await phonePage.locator('#Dock .chip.is-outlined').count(), 0)

  await phonePage.evaluate(() => {
    window.LOGYQBridge.loadMap({
      name: 'Root',
      color: '#2563eb',
      children: [{ name: 'A' }],
    }, ['Pop', 'Stay'])
  })
  await centerCard(phonePage, 'A')
  await phonePage.locator('#Dock .chip', { hasText: 'Pop' }).tap()
  await phonePage.locator('#Dock .chip', { hasText: 'Stay' }).tap()
  await touchDragAim(phonePage, await chipPoint(phonePage, 'Stay'), () => cardPoint(phonePage, 'A'))
  await phonePage.waitForFunction(() => {
    const parent = window.LOGYQBridge.core.state.root.descendants().find((node) => node.data.name === 'A')
    const names = parent?.children?.map((node) => node.data.name) || []
    return names[0] === 'Pop' && names[1] === 'Stay'
  })
  assert.deepEqual(await phonePage.evaluate(() => window.LOGYQBridge.core.state.wordBank.slice()), [])
  assert.equal(await phonePage.locator('#Dock .chip.is-outlined').count(), 0)
  assert.equal(await phonePage.locator('#logyq-paint-btn').count(), 1)
  assert.equal(await phonePage.locator('[data-tool="mix"]').count(), 1)
  assert.deepEqual(phoneErrors, [])
  await phone.close()

  const desktop = await newContext({ viewport: { width: 1440, height: 900 } })
  await stubMaps(desktop)
  const desktopPage = await desktop.newPage()
  const desktopErrors = []
  desktopPage.on('pageerror', (error) => desktopErrors.push(error.message))
  await openBankMap(desktopPage)
  await desktopPage.locator('#wordInput').fill('Typed')
  await desktopPage.locator('#wordInput').press('Enter')
  assert.deepEqual(await desktopPage.evaluate(() => window.LOGYQBridge.core.state.wordBank.slice()), ['Pop', 'Stay', 'Typed'])
  const desktopChip = await chipPoint(desktopPage, 'Pop')
  assert.equal(desktopChip.hitChip, true)
  await desktopPage.mouse.move(desktopChip.x, desktopChip.y)
  await desktopPage.mouse.down()
  const lifted = { x: desktopChip.x, y: Math.max(120, desktopChip.y - 160) }
  await desktopPage.mouse.move(lifted.x, lifted.y, { steps: 8 })
  const mouseGhost = await desktopPage.evaluate(() => {
    const stack = document.getElementById('logyq-chip-ghost')
    const rect = stack?.getBoundingClientRect()
    return { text: stack?.querySelector('.chip')?.textContent || '', bottom: rect?.bottom ?? null }
  })
  assert.equal(mouseGhost.text, 'Pop')
  assert.ok(mouseGhost.bottom < lifted.y - 8)
  const desktopCard = await cardPoint(desktopPage, 'A')
  const desktopLift = await desktopPage.evaluate((finger) => {
    const rect = document.getElementById('logyq-chip-ghost')?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return {
      x: rect.left + rect.width / 2 - finger.x,
      y: rect.top + rect.height / 2 - finger.y,
    }
  }, lifted)
  await desktopPage.mouse.move(desktopCard.x - desktopLift.x, desktopCard.y - desktopLift.y, { steps: 8 })
  await desktopPage.mouse.up()
  await desktopPage.waitForFunction(() => {
    const parent = window.LOGYQBridge.core.state.root.descendants().find((node) => node.data.name === 'A')
    return parent?.children?.some((child) => child.data.name === 'Pop')
  })
  const stayDesk = await chipPoint(desktopPage, 'Stay')
  await desktopPage.mouse.move(stayDesk.x, stayDesk.y)
  await desktopPage.mouse.down()
  await desktopPage.mouse.move(stayDesk.x, Math.max(80, stayDesk.y - 180), { steps: 8 })
  await desktopPage.mouse.move(stayDesk.x, stayDesk.y, { steps: 8 })
  await desktopPage.mouse.up()
  assert.equal(await desktopPage.evaluate(() => window.LOGYQBridge.core.state.wordBank.includes('Stay')), true)
  assert.equal(await desktopPage.locator('#logyq-chip-ghost').count(), 0)
  assert.deepEqual(desktopErrors, [])
  await desktop.close()
})

test('LOGYQ repeated flicks keep the camera still and the touched card', async () => {
  const context = await newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  await stubMaps(context)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logyq/index.html`, { waitUntil: 'networkidle' })
  await waitForBoot(page)

  async function bootTree(tree, bank = []) {
    await page.evaluate(({ tree, bank }) => {
      window.LOGYQPreview.app.hasOpenMap = true
      document.body.classList.add('logyq-map-open')
      document.body.classList.remove('logyq-home')
      document.querySelectorAll('.logiq-backdrop.is-open').forEach((el) => el.classList.remove('is-open'))
      window.LOGYQBridge.core.editing.closeNodeEditor(false, false)
      window.LOGYQPreview.paint.active = false
      window.LOGYQBridge.loadMap(tree, bank)
    }, { tree, bank })
    await page.waitForFunction(() => document.body.classList.contains('logyq-mobile-v162'))
    await page.waitForFunction((label) => {
      const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((el) => el.__data__?.data?.name === label)
      const rect = node?.getBoundingClientRect()
      return rect && rect.width > 20 && rect.top > 40 && rect.bottom < window.innerHeight
    }, tree.name)
    let prev = await view()
    for (let i = 0; i < 12; i += 1) {
      await page.waitForTimeout(80)
      const now = await view()
      if (Math.hypot(now.x - prev.x, now.y - prev.y) < 0.4 && Math.abs(now.k - prev.k) < 0.001) break
      prev = now
    }
  }

  async function face(name) {
    return page.evaluate((label) => {
      const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((el) => el.__data__?.data?.name === label)
      const box = node?.querySelector('rect:not(.grabzone)') || node
      const rect = box.getBoundingClientRect()
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        uid: node?.__data__?.data?._uid || '',
      }
    }, name)
  }

  async function view() {
    return page.evaluate(() => {
      const t = window.d3.zoomTransform(document.getElementById('canvas'))
      return { x: t.x, y: t.y, k: t.k }
    })
  }

  async function counts() {
    return page.evaluate(() => ({
      nodes: document.querySelectorAll('svg#canvas g.node').length,
      overlap: window.LOGYQBridge.core.state.layoutOverlapCount || 0,
      settling: !!window.LOGYQBridge.core.state.layoutSettling,
      queued: !!window.LOGYQBridge.core.state.layoutFlushQueued,
    }))
  }

  async function parentOfSelected() {
    return page.evaluate(() => {
      const uid = window.LOGYQBridge.getSelectedUid()
      const node = window.LOGYQBridge.core.state.root?.descendants().find((item) => item.data?._uid === uid)
      return {
        uid,
        parent: node?.parent ? (node.parent.data?.name ?? '') : null,
        name: node?.data?.name ?? null,
      }
    })
  }

  async function settle() {
    await page.waitForFunction(() => !window.LOGYQBridge.core.state.layoutSettling && !window.LOGYQBridge.core.state.layoutFlushQueued)
  }

  let pointerSerial = 40
  async function play(points) {
    const pointerId = pointerSerial++
    const start = await view()
    let max = 0
    for (let i = 0; i < points.length; i += 1) {
      const type = i === 0 ? 'pointerdown' : (i === points.length - 1 ? 'pointerup' : 'pointermove')
      await page.evaluate(({ type, x, y, pointerId }) => {
        const hit = document.elementFromPoint(x, y)
        const target = hit && document.getElementById('canvas')?.contains(hit) ? hit : document.getElementById('canvas')
        target.dispatchEvent(new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerType: 'touch',
          pointerId,
          isPrimary: true,
          button: 0,
          buttons: type === 'pointerup' ? 0 : 1,
          clientX: x,
          clientY: y,
        }))
      }, { type, x: points[i].x, y: points[i].y, pointerId })
      if (points[i].wait) await page.waitForTimeout(points[i].wait)
      const now = await view()
      max = Math.max(max, Math.hypot(now.x - start.x, now.y - start.y))
    }
    await page.waitForTimeout(40)
    const end = await view()
    return { max, dx: end.x - start.x, dy: end.y - start.y }
  }

  function line(from, dx, dy, steps, wait) {
    const points = []
    for (let i = 0; i <= steps; i += 1) {
      points.push({
        x: from.x + (dx * i) / steps,
        y: from.y + (dy * i) / steps,
        wait: i === 0 ? 0 : wait,
      })
    }
    return points
  }

  function creepDown(from) {
    const points = [{ x: from.x, y: from.y, wait: 0 }]
    for (let i = 1; i <= 6; i += 1) points.push({ x: from.x, y: from.y + i * 3, wait: 20 })
    for (let i = 1; i <= 4; i += 1) points.push({ x: from.x, y: from.y + 18 + i * 16, wait: 12 })
    return points
  }

  async function flickCard(name, dx, dy, { creep = false } = {}) {
    const origin = await face(name)
    const before = (await counts()).nodes
    const motion = await play(creep ? creepDown(origin) : line(origin, dx, dy, 5, 14))
    await page.waitForFunction((count) => document.querySelectorAll('svg#canvas g.node').length > count, before)
    const made = await parentOfSelected()
    return { origin, motion, made, before }
  }

  await bootTree({
    name: 'Root',
    children: [
      { name: 'A', children: [{ name: 'A1' }] },
      { name: 'B' },
    ],
  })

  const first = await flickCard('A', 0, 78, { creep: true })
  assert.ok(first.motion.max < 6, `slow-start down-flick dragged the map ${first.motion.max.toFixed(1)}px`)
  assert.ok(Math.hypot(first.motion.dx, first.motion.dy) < 2, 'flick must restore the camera')
  assert.equal(first.made.parent, 'A')
  await settle()

  for (let i = 0; i < 6; i += 1) {
    const name = i % 2 === 0 ? 'B' : 'A'
    const again = await flickCard(name, 0, 76)
    assert.ok(again.motion.max < 6, `repeat ${i} on ${name} drifted ${again.motion.max.toFixed(1)}px`)
    assert.equal(again.made.parent, name)
    await settle()
  }

  const overlapBefore = (await counts()).overlap
  const rapidOrigin = await face('A')
  const rapidBefore = (await counts()).nodes
  const rapid1 = await play(line(rapidOrigin, 0, 76, 4, 10))
  await page.waitForFunction((count) => document.querySelectorAll('svg#canvas g.node').length > count, rapidBefore)
  const mid = await face('A')
  const rapid2 = await play(line(mid, 0, 76, 4, 10))
  await page.waitForFunction((count) => document.querySelectorAll('svg#canvas g.node').length > count, rapidBefore + 1)
  await settle()
  const rapidAfter = await counts()
  assert.equal(rapidAfter.nodes, rapidBefore + 2)
  assert.equal(rapidAfter.overlap, overlapBefore)
  assert.ok(rapid1.max < 6 && rapid2.max < 6, 'a second flick during settle must not snap the map')
  const latest = await parentOfSelected()
  assert.equal(latest.parent, 'A', 'the second flick before settle still hits A')

  await settle()
  const left = await flickCard('B', -78, 8)
  assert.equal(left.made.parent, 'Root', 'left flick adds a sibling under the parent')
  assert.ok(left.motion.max < 6)
  await settle()
  const downAfterLeft = await flickCard('B', 0, 76)
  assert.equal(downAfterLeft.made.parent, 'B')
  assert.ok(downAfterLeft.motion.max < 6)

  await settle()
  const horizontal = await flickCard('A', 72, 18)
  assert.equal(horizontal.made.parent, 'Root', 'a near-horizontal flick is a sibling, not a child')
  assert.ok(horizontal.motion.max < 6)

  await settle()
  const rootUp = await flickCard('Root', 0, -78)
  assert.equal(rootUp.made.parent, null, 'swipe-up wraps the root')
  assert.ok(rootUp.motion.max < 6)
  await settle()
  const downOldRoot = await flickCard('Root', 0, 76)
  assert.equal(downOldRoot.made.parent, 'Root')
  assert.ok(downOldRoot.motion.max < 6)

  const panFrom = await face('B')
  const panStart = await view()
  const panBefore = (await counts()).nodes
  const panPoints = []
  for (let i = 0; i <= 12; i += 1) {
    panPoints.push({ x: panFrom.x + i * 4, y: panFrom.y + i * 3, wait: 45 })
  }
  await play(panPoints)
  await page.waitForTimeout(60)
  const panEnd = await view()
  const panDelta = Math.hypot(panEnd.x - panStart.x, panEnd.y - panStart.y)
  assert.equal((await counts()).nodes, panBefore, 'a long diagonal drag is a pan, not a flick')
  assert.ok(panDelta > 8, `a diagonal pan still moves the map (${panDelta.toFixed(1)}px)`)
  const afterPan = await flickCard('A', 0, 76, { creep: true })
  assert.equal(afterPan.made.parent, 'A')
  assert.ok(afterPan.motion.max < 6, 'a down-flick after a pan must not snap the map')

  await page.evaluate(() => window.LOGYQBridge.mix(false))
  await page.waitForTimeout(700)
  await settle()
  let mixPrev = await view()
  for (let i = 0; i < 12; i += 1) {
    await page.waitForTimeout(80)
    const now = await view()
    if (Math.hypot(now.x - mixPrev.x, now.y - mixPrev.y) < 0.4) break
    mixPrev = now
  }
  const mixedName = await page.evaluate(() => {
    const nodes = window.LOGYQBridge.core.state.root.descendants()
    return nodes.find((node) => node.parent && node.data?.name)?.data?.name
      || nodes.find((node) => node.parent)?.data?.name
      || nodes[0].data.name
  })
  const afterMix = await flickCard(mixedName, 0, 74)
  assert.equal(afterMix.made.parent, mixedName)
  assert.ok(afterMix.motion.max < 6, 'a down-flick after Mix must not snap the map')

  await settle()
  const beforeUndo = (await counts()).nodes
  await page.evaluate(() => window.LOGYQBridge.undo())
  await page.waitForFunction((count) => document.querySelectorAll('svg#canvas g.node').length < count, beforeUndo)
  await settle()
  const afterUndo = await flickCard(mixedName, 0, 74)
  assert.equal(afterUndo.made.parent, mixedName)
  assert.ok(afterUndo.motion.max < 6)

  await page.evaluate(() => window.LOGYQBridge.core.wordDock.addWords('Mint'))
  await settle()
  const chip = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('#Dock .chip')).find((node) => node.textContent.trim() === 'Mint')
    const rect = el.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  })
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: chip.x, y: chip.y, id: 1 }] })
  const nudge = { x: chip.x, y: Math.max(70, chip.y - 36) }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: nudge.x, y: nudge.y, id: 1 }] })
  await page.waitForTimeout(40)
  const lift = await page.evaluate((finger) => {
    const rect = document.getElementById('logyq-chip-ghost')?.getBoundingClientRect()
    if (!rect || rect.width < 1) return { x: 0, y: 0 }
    return {
      x: rect.left + rect.width / 2 - finger.x,
      y: rect.top + rect.height / 2 - finger.y,
    }
  }, nudge)
  let prev = nudge
  for (let i = 1; i <= 8; i += 1) {
    const live = await face(mixedName)
    const dest = { x: live.x - lift.x, y: live.y - lift.y }
    prev = { x: prev.x + (dest.x - prev.x) * 0.5, y: prev.y + (dest.y - prev.y) * 0.5 }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: prev.x, y: prev.y, id: 1 }] })
    await page.waitForTimeout(16)
  }
  const landed = await face(mixedName)
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: landed.x - lift.x, y: landed.y - lift.y, id: 1 }],
  })
  await page.waitForTimeout(32)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
  await page.waitForFunction((label) => {
    const parent = window.LOGYQBridge.core.state.root.descendants().find((node) => node.data.name === label)
    return parent?.children?.some((child) => child.data.name === 'Mint')
  }, mixedName)
  await settle()
  const afterBank = await flickCard(mixedName, 0, 74)
  assert.equal(afterBank.made.parent, mixedName)
  assert.ok(afterBank.motion.max < 6, 'a down-flick after a bank drop must not snap the map')

  await bootTree({
    name: 'Root',
    children: [
      { name: 'A', children: [{ name: 'A1' }] },
      { name: 'B' },
    ],
  })

  async function touch(type, x, y, pointerId) {
    await page.evaluate(({ type, x, y, pointerId }) => {
      const hit = document.elementFromPoint(x, y)
      const target = hit && document.getElementById('canvas')?.contains(hit) ? hit : document.getElementById('canvas')
      target.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerType: 'touch',
        pointerId,
        isPrimary: pointerId === 1,
        button: 0,
        buttons: type === 'pointerup' ? 0 : 1,
        clientX: x,
        clientY: y,
      }))
    }, { type, x, y, pointerId })
  }

  const thumb = await page.evaluate(() => {
    const height = window.innerHeight
    const y = height * 0.5
    const canvas = document.getElementById('canvas').getBoundingClientRect()
    for (let x = canvas.left + 8; x < canvas.right - 8; x += 12) {
      const hit = document.elementFromPoint(x, y)?.closest?.('g.node, g.hit-slot')
      if (!hit) return { x, y }
    }
    return { x: canvas.left + 10, y }
  })
  const castCard = await face('A')
  const k0 = (await view()).k
  await touch('pointerdown', thumb.x, thumb.y, 81)
  await touch('pointerdown', castCard.x, castCard.y, 82)
  await touch('pointermove', castCard.x, castCard.y + 30, 82)
  await page.waitForTimeout(20)
  await touch('pointermove', castCard.x, castCard.y + 70, 82)
  await touch('pointerup', castCard.x, castCard.y + 70, 82)
  await touch('pointerup', thumb.x, thumb.y, 81)
  assert.ok(Math.abs((await view()).k - k0) < 0.02)
  const nominated = await page.evaluate(() => {
    const mercy = window.LOGYQPreview.gestures.smite.mercy
    return mercy ? Array.from(mercy.marks.keys()).length : 0
  })
  assert.ok(nominated >= 2, 'the cast nominates the card and its subtree')

  const a1 = await face('A1')
  const execute = await play(creepDown(a1))
  assert.ok(execute.max < 6, 'a cast execute flick must not drag the map')
  await page.waitForFunction(() => !window.LOGYQBridge.core.state.root.descendants().some((node) => node.data.name === 'A1'))
  await settle()
  const afterExecute = await page.evaluate(() => window.LOGYQBridge.core.state.root.descendants().map((node) => node.data.name))
  assert.ok(afterExecute.includes('A'))
  assert.ok(afterExecute.includes('B'))
  const mercyLeft = await page.evaluate(() => {
    const mercy = window.LOGYQPreview.gestures.smite.mercy
    if (!mercy) return null
    return {
      committing: !!mercy.committing,
      names: window.LOGYQBridge.core.state.root.descendants()
        .filter((node) => mercy.marks.has(node.data._uid))
        .map((node) => node.data.name),
    }
  })
  assert.ok(mercyLeft, 'executing a child leaves the rest of the cast up')
  assert.equal(mercyLeft.committing, false)
  assert.ok(mercyLeft.names.includes('A'))

  const aFace = await face('A')
  const againCast = await play(creepDown(aFace))
  assert.ok(againCast.max < 6, 'a second cast flick must not drag the map')
  await page.waitForFunction(() => !window.LOGYQBridge.core.state.root.descendants().some((node) => node.data.name === 'A'))
  await settle()
  const afterSecond = await page.evaluate(() => ({
    names: window.LOGYQBridge.core.state.root.descendants().map((node) => node.data.name),
    mercy: window.LOGYQPreview.gestures.smite.mercy,
  }))
  assert.ok(afterSecond.names.includes('B'))
  assert.ok(afterSecond.names.includes('Root'))
  assert.equal(afterSecond.mercy, null)

  assert.deepEqual(errors, [])
  await context.close()
})

test('LOGYQ ends a cast when nothing is left on delete or Word Bank', async () => {
  const context = await newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  await stubMaps(context)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logyq/index.html`, { waitUntil: 'networkidle' })
  await waitForBoot(page)
  await page.evaluate(() => {
    window.LOGYQPreview.app.hasOpenMap = true
    document.body.classList.add('logyq-map-open')
    document.body.classList.remove('logyq-home')
    document.querySelectorAll('.logiq-backdrop.is-open').forEach((el) => el.classList.remove('is-open'))
    window.LOGYQBridge.core.editing.closeNodeEditor(false, false)
    window.LOGYQBridge.loadMap({
      name: 'Root',
      children: [
        { name: 'A', children: [{ name: 'A1' }, { name: 'C' }] },
        { name: 'B' },
      ],
    }, [])
  })
  await page.waitForFunction(() => {
    const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((el) => el.__data__?.data?.name === 'A')
    const rect = node?.getBoundingClientRect()
    return rect && rect.width > 20 && rect.bottom < window.innerHeight
  })

  async function face(name) {
    return page.evaluate((label) => {
      const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((el) => el.__data__?.data?.name === label)
      const box = node?.querySelector('rect:not(.grabzone)') || node
      const rect = box.getBoundingClientRect()
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    }, name)
  }

  async function touch(type, x, y, pointerId) {
    await page.evaluate(({ type, x, y, pointerId }) => {
      const hit = document.elementFromPoint(x, y)
      const target = hit && document.getElementById('canvas')?.contains(hit) ? hit : document.getElementById('canvas')
      target.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerType: 'touch',
        pointerId,
        isPrimary: true,
        button: 0,
        buttons: type === 'pointerup' ? 0 : 1,
        clientX: x,
        clientY: y,
      }))
    }, { type, x, y, pointerId })
  }

  async function castKids() {
    const thumb = await page.evaluate(() => {
      const y = window.innerHeight * 0.84
      const canvas = document.getElementById('canvas').getBoundingClientRect()
      for (let x = canvas.left + 8; x < canvas.right - 8; x += 14) {
        const hit = document.elementFromPoint(x, y)?.closest?.('g.node, g.hit-slot')
        if (!hit) return { x, y }
      }
      return { x: canvas.left + 12, y }
    })
    const card = await face('A')
    await touch('pointerdown', thumb.x, thumb.y, 91)
    await touch('pointerdown', card.x, card.y, 92)
    await touch('pointermove', card.x, card.y + 70, 92)
    await touch('pointerup', card.x, card.y + 70, 92)
    await touch('pointerup', thumb.x, thumb.y, 91)
    await page.waitForFunction(() => {
      const mercy = window.LOGYQPreview.gestures.smite.mercy
      return mercy && mercy.marks.size >= 2
    })
  }

  async function tap(name, pointerId) {
    // One turn, on the painted face. A wash or clock above the card, or a
    // round trip longer than the hold timer, would swallow the tap.
    await page.evaluate(({ label, pointerId }) => {
      const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((el) => el.__data__?.data?.name === label)
      const face = node?.querySelector('rect:not(.grabzone):not(.logyq-smite-wash):not(.logyq-smite-glow):not(.logyq-edit-focus)') || node
      const rect = face.getBoundingClientRect()
      const x = rect.left + rect.width / 2
      const y = rect.top + rect.height / 2
      const fire = (type) => face.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerType: 'touch',
        pointerId,
        isPrimary: true,
        button: 0,
        buttons: type === 'pointerup' ? 0 : 1,
        clientX: x,
        clientY: y,
      }))
      fire('pointerdown')
      fire('pointerup')
    }, { label: name, pointerId })
    await page.waitForTimeout(40)
  }

  async function chrome() {
    return page.evaluate(() => ({
      mercy: !!window.LOGYQPreview.gestures.smite.mercy,
      washes: document.querySelectorAll('rect.logyq-smite-wash').length,
      clocks: document.querySelectorAll('path.logyq-smite-clock').length,
      names: window.LOGYQBridge.core.state.root.descendants().map((node) => node.data.name),
    }))
  }

  await castKids()
  await tap('A1', 93)
  await tap('A1', 94)
  let mid = await chrome()
  assert.equal(mid.mercy, true, 'one kid still on delete keeps the cast')
  await tap('C', 95)
  await tap('C', 96)
  let cleared = await chrome()
  assert.equal(cleared.mercy, false, 'the last kid leaving delete or Word Bank ends the cast')
  assert.equal(cleared.washes, 0)
  assert.equal(cleared.clocks, 0)
  await page.waitForTimeout(250)
  cleared = await chrome()
  assert.equal(cleared.mercy, false, 'the timer does not start again after a white-only cast')
  assert.equal(cleared.clocks, 0)
  await page.screenshot({ path: '/opt/cursor/artifacts/screenshots/cast_white_cleared.png' })

  await castKids()
  await tap('A1', 97)
  await tap('A1', 98)
  await page.evaluate(() => {
    const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((el) => el.__data__?.data?.name === 'C')
    const face = node?.querySelector('rect:not(.grabzone):not(.logyq-smite-wash):not(.logyq-smite-glow):not(.logyq-edit-focus)') || node
    const rect = face.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    const fire = (type, px, py) => face.dispatchEvent(new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerType: 'touch',
      pointerId: 99,
      isPrimary: true,
      button: 0,
      buttons: type === 'pointerup' ? 0 : 1,
      clientX: px,
      clientY: py,
    }))
    fire('pointerdown', x, y)
    fire('pointermove', x, y + 40)
    fire('pointerup', x, y + 74)
  })
  await page.waitForFunction(() => !window.LOGYQBridge.core.state.root.descendants().some((node) => node.data.name === 'C'))
  const afterFlick = await chrome()
  assert.equal(afterFlick.mercy, false, 'a flick that leaves only white cards ends the cast')
  assert.equal(afterFlick.washes, 0)
  assert.equal(afterFlick.clocks, 0)
  assert.ok(afterFlick.names.includes('A1'))

  await page.evaluate(() => {
    const smite = window.LOGYQPreview.gestures.smite
    if (smite.raf) cancelAnimationFrame(smite.raf)
    smite.raf = 0
    const a = window.LOGYQBridge.core.state.root.descendants().find((node) => node.data.name === 'A')
    const a1 = window.LOGYQBridge.core.state.root.descendants().find((node) => node.data.name === 'A1')
    const mercy = {
      marks: new Map([[a.data._uid, 'normal'], [a1.data._uid, 'normal']]),
      castUid: a.data._uid,
      zone: 'middle',
      direction: 'down',
      remaining: 9000,
      lastTick: performance.now(),
      interacting: false,
      committing: false,
    }
    smite.mercies = [mercy]
    smite.mercy = mercy
  })
  await tap('A', 100)
  const afterParent = await chrome()
  assert.equal(afterParent.mercy, false, 'tapping the clock card clears a white-only cast')
  assert.equal(afterParent.washes, 0)
  assert.equal(afterParent.clocks, 0)
  await page.waitForTimeout(200)
  assert.equal((await chrome()).mercy, false)

  assert.deepEqual(errors, [])
  await context.close()
})

test('LOGYQ pocket cast edges march and parent-only connectors stay quiet', async () => {
  const context = await newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  await stubMaps(context)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logyq/index.html`, { waitUntil: 'networkidle' })
  await waitForBoot(page)
  await page.evaluate(() => {
    window.LOGYQPreview.app.hasOpenMap = true
    document.body.classList.add('logyq-map-open')
    document.body.classList.remove('logyq-home')
    document.querySelectorAll('.logiq-backdrop.is-open').forEach((el) => el.classList.remove('is-open'))
    window.LOGYQBridge.core.editing.closeNodeEditor(false, false)
    window.LOGYQBridge.loadMap({
      name: 'Root',
      children: [{ name: 'Cut' }, { name: 'Bank' }, { name: 'Out', children: [{ name: 'Pale' }] }],
    }, [])
  })
  await page.waitForFunction(() => ['Root', 'Cut', 'Bank', 'Out', 'Pale'].every((label) => {
    const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((el) => el.__data__?.data?.name === label)
    return node && node.getBoundingClientRect().width > 20
  }))

  async function paint(marksFor) {
    return page.evaluate(async (mode) => {
      const core = window.LOGYQBridge.core
      const byName = (label) => core.state.root.descendants().find((node) => node.data.name === label)
      const root = byName('Root')
      const cut = byName('Cut')
      const bank = byName('Bank')
      const out = byName('Out')
      const pale = byName('Pale')
      const marks = mode === 'pocket'
        ? new Map([
          [root.data._uid, 'red'],
          [cut.data._uid, 'red'],
          [bank.data._uid, 'amber'],
          [out.data._uid, 'normal'],
          [pale.data._uid, 'normal'],
        ])
        : new Map([
          [root.data._uid, 'red'],
          [cut.data._uid, 'normal'],
          [bank.data._uid, 'normal'],
          [out.data._uid, 'normal'],
          [pale.data._uid, 'normal'],
        ])
      const smite = window.LOGYQPreview.gestures.smite
      smite.mercies = [{
        marks,
        castUid: root.data._uid,
        zone: 'middle',
        direction: 'down',
        remaining: 9000,
        lastTick: performance.now(),
        interacting: false,
        committing: false,
      }]
      smite.mercy = smite.mercies[0]
      const canvas = document.getElementById('canvas')
      const box = canvas.getBoundingClientRect()
      let point = null
      for (let y = box.top + 8; y < box.bottom - 8 && !point; y += 18) {
        for (let x = box.left + 8; x < box.right - 8; x += 18) {
          const hit = document.elementFromPoint(x, y)
          if (hit && canvas.contains(hit) && !hit.closest('g.node, g.hit-slot')) {
            point = { x, y }
            break
          }
        }
      }
      const target = point ? document.elementFromPoint(point.x, point.y) : canvas
      const fire = (type, buttons) => target.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, composed: true, pointerType: 'touch', pointerId: 7,
        isPrimary: true, button: 0, buttons, clientX: point?.x || 12, clientY: point?.y || 80,
      }))
      fire('pointerdown', 1)
      fire('pointerup', 0)
      const read = (name) => {
        const link = Array.from(document.querySelectorAll('svg#canvas g.links path.link')).find((el) => el.__data__?.target?.data?.name === name)
        const ants = []
        let sib = link?.nextElementSibling
        while (sib && sib.classList?.contains('logyq-smite-ant')) {
          ants.push({
            role: sib.dataset.antRole,
            weight: sib.dataset.smiteWeight || null,
            width: sib.style.strokeWidth,
            stroke: sib.getAttribute('stroke'),
            opacity: sib.style.opacity,
            animation: getComputedStyle(sib).animationName,
            duration: getComputedStyle(sib).animationDuration,
          })
          sib = sib.nextElementSibling
        }
        const stopsOf = (id) => id ? Array.from(document.getElementById(id)?.querySelectorAll('stop') || []).map((stop) => stop.getAttribute('stop-color')) : []
        const linkStyle = link ? getComputedStyle(link) : null
        return {
          weight: link?.dataset?.smiteWeight || null,
          edge: link?.dataset?.smiteEdge || null,
          width: linkStyle?.strokeWidth || null,
          opacity: linkStyle?.opacity || null,
          stops: stopsOf(link?.dataset?.smiteGrad),
          haloStops: stopsOf(link?.dataset?.smiteHalo),
          ants,
        }
      }
      const card = (name) => {
        const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((el) => el.__data__?.data?.name === name)
        const wash = node?.querySelector('rect.logyq-smite-wash')
        const clock = node?.querySelector('path.logyq-smite-clock')
        return {
          stroke: wash?.getAttribute('stroke') || null,
          outline: wash?.dataset?.smiteOutline || null,
          animation: wash ? getComputedStyle(wash).animationName : null,
          duration: wash ? getComputedStyle(wash).animationDuration : null,
          clock: !!clock,
          clockAnimation: clock ? getComputedStyle(clock).animationName : null,
        }
      }
      return {
        cut: read('Cut'),
        bank: read('Bank'),
        out: read('Out'),
        pale: read('Pale'),
        cards: { root: card('Root'), bank: card('Bank'), out: card('Out') },
      }
    }, marksFor)
  }

  const pocket = await paint('pocket')
  const slate = '#7C8491'
  assert.deepEqual(pocket.cut.stops, ['#ff0000', '#ff0000'])
  assert.deepEqual(pocket.cut.haloStops, ['#ffffff', '#ffffff'])
  assert.deepEqual(pocket.bank.stops, ['#ff0000', '#ffa100'])
  assert.deepEqual(pocket.bank.haloStops, ['#ffffff', '#ffffff'])
  assert.deepEqual(pocket.out.stops, ['#ff0000', '#ffffff'])
  assert.deepEqual(pocket.out.haloStops, ['#ffffff', slate])
  assert.deepEqual(pocket.pale.stops, ['#ffffff', '#ffffff'])
  assert.deepEqual(pocket.pale.haloStops, [slate, slate])
  for (const edge of [pocket.cut, pocket.bank, pocket.out, pocket.pale]) {
    assert.equal(edge.weight, 'strong')
    assert.equal(edge.edge, '1')
    assert.equal(edge.width, '3.5px')
    assert.equal(edge.opacity, '1')
    const color = edge.ants.find((ant) => ant.role === 'color')
    const halo = edge.ants.find((ant) => ant.role === 'halo')
    assert.equal(color.weight, 'strong')
    assert.equal(color.width, '3.5px')
    assert.equal(color.opacity, '1')
    assert.ok(color.stroke.startsWith('url('))
    assert.ok(halo.stroke.startsWith('url('))
    assert.notEqual(halo.stroke, '#ffffff')
    assert.equal(halo.width, '6px')
    assert.ok(edge.ants.every((ant) => ant.animation === 'logyq-smite-march' && (ant.duration === '1.4s' || ant.duration === '1400ms')))
  }
  assert.ok(pocket.cards.bank.duration === '1.4s' || pocket.cards.bank.duration === '1400ms')
  assert.ok(pocket.cards.out.duration === '1.4s' || pocket.cards.out.duration === '1400ms')
  assert.equal(pocket.cards.root.clock, true)
  assert.equal(pocket.cards.root.clockAnimation, 'none')
  assert.equal(pocket.cards.bank.stroke, '#ffa100')
  assert.equal(pocket.cards.bank.animation, 'logyq-smite-march')
  assert.equal(pocket.cards.out.stroke, '#ffffff')
  assert.equal(pocket.cards.out.animation, 'logyq-smite-march')

  const parentOnly = await paint('parent')
  assert.equal(parentOnly.cut.edge, null)
  assert.equal(parentOnly.bank.edge, null)
  assert.equal(parentOnly.out.edge, null)
  assert.equal(parentOnly.pale.edge, null)
  assert.equal(parentOnly.bank.ants.length, 0)
  assert.equal(parentOnly.out.ants.length, 0)
  assert.equal(parentOnly.pale.ants.length, 0)
  assert.deepEqual(errors, [])
  await context.close()
})

test('LOGYQ one-thumb tap arms green and a swipe nominates by target', async () => {
  const context = await newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  await stubMaps(context)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logyq/index.html`, { waitUntil: 'networkidle' })
  await waitForBoot(page)
  await page.evaluate(() => {
    window.LOGYQPreview.app.hasOpenMap = true
    document.body.classList.add('logyq-map-open')
    document.body.classList.remove('logyq-home')
    document.querySelectorAll('.logiq-backdrop.is-open').forEach((el) => el.classList.remove('is-open'))
    window.LOGYQBridge.core.editing.closeNodeEditor(false, false)
    window.LOGYQBridge.loadMap({
      name: 'Food',
      children: [
        {
          name: 'Fruit',
          children: [
            { name: 'Lime', children: [{ name: 'Peel' }] },
            { name: 'Zest' },
          ],
        },
        { name: 'Meat' },
      ],
    }, [])
  })
  await page.waitForFunction(() => ['Food', 'Fruit', 'Lime', 'Peel', 'Zest', 'Meat'].every((label) => {
    const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((el) => el.__data__?.data?.name === label)
    return node && node.getBoundingClientRect().width > 20
  }))

  const read = () => page.evaluate(() => {
    const chrome = (name) => {
      const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((el) => el.__data__?.data?.name === name)
      const wash = node?.querySelector('rect.logyq-smite-wash')
      const clock = node?.querySelector('path.logyq-smite-clock')
      return {
        arm: node?.dataset?.smiteArm || null,
        stroke: wash?.getAttribute('stroke') || null,
        fill: wash?.getAttribute('fill') || null,
        ants: wash?.dataset?.smiteOutline || null,
        animation: wash ? getComputedStyle(wash).animationName : null,
        width: wash ? getComputedStyle(wash).strokeWidth : null,
        clock: node?.dataset?.smiteClock === '1',
        clockStroke: clock?.getAttribute('stroke') || null,
      }
    }
    const smite = window.LOGYQPreview.gestures.smite
    const marked = []
    smite.mercies[0]?.marks?.forEach((mark, uid) => {
      const node = window.LOGYQBridge.core.state.root.descendants().find((item) => item.data._uid === uid)
      marked.push(`${node?.data?.name}:${mark}`)
    })
    marked.sort()
    return {
      armed: smite.armed,
      mercies: smite.mercies.length,
      cast: smite.mercy?.castUid || null,
      marked,
      editor: !!document.querySelector('.node-edit-input'),
      cards: {
        Food: chrome('Food'),
        Fruit: chrome('Fruit'),
        Lime: chrome('Lime'),
        Peel: chrome('Peel'),
        Zest: chrome('Zest'),
        Meat: chrome('Meat'),
      },
    }
  })

  const point = async (name) => page.evaluate((label) => {
    const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((el) => el.__data__?.data?.name === label)
    const face = node?.querySelector('rect:not(.grabzone):not(.logyq-smite-wash):not(.logyq-smite-glow)')
    const rect = (face || node).getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right }
  }, name)

  const gesture = async (x, y, dx, dy) => {
    await page.evaluate(({ x, y, dx, dy }) => {
      const canvas = document.getElementById('canvas')
      const faceAt = (px, py) => {
        const nodes = Array.from(document.querySelectorAll('svg#canvas g.node'))
        for (const node of nodes) {
          const face = node.querySelector('rect:not(.grabzone):not(.logyq-smite-wash):not(.logyq-smite-glow):not(.logyq-edit-focus)')
          const rect = face?.getBoundingClientRect()
          if (!face || !rect || rect.width < 1) continue
          if (px >= rect.left && px <= rect.right && py >= rect.top && py <= rect.bottom) return face
        }
        return null
      }
      const fire = (type, px, py) => {
        // Aim at the painted face that contains the point. elementFromPoint
        // can land on a wash, clock, or shelf and drop the nomination.
        const face = faceAt(px, py)
        const hit = document.elementFromPoint(px, py)
        const target = face || (hit && canvas.contains(hit) ? hit : canvas)
        target.dispatchEvent(new PointerEvent(type, {
          bubbles: true, cancelable: true, composed: true, pointerType: 'touch', pointerId: 8,
          isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: px, clientY: py,
        }))
      }
      fire('pointerdown', x, y)
      fire('pointerup', x + dx, y + dy)
    }, { x, y, dx, dy })
  }

  const reset = async () => {
    await page.evaluate(() => {
      const smite = window.LOGYQPreview.gestures.smite
      smite.mercies = []
      smite.mercy = null
      window.LOGYQPreview.gestures.clearSmiteArm()
    })
  }

  const meat = await point('Meat')
  await gesture(meat.x, meat.y, 0, 0)
  await gesture(meat.x, meat.y, 0, 0)
  await page.waitForSelector('.node-edit-input')
  const editing = await read()
  assert.equal(editing.editor, true)
  assert.equal(editing.cards.Meat.arm, null)
  await page.locator('.node-edit-input').press('Escape')
  await page.waitForFunction(() => !document.querySelector('.node-edit-input'))

  await reset()
  const fruit = await point('Fruit')
  await gesture(fruit.x, fruit.y, 0, 0)
  const armed = await read()
  assert.equal(armed.cards.Fruit.arm, '1')
  assert.equal(armed.cards.Fruit.stroke, '#16a34a')
  assert.equal(armed.cards.Fruit.fill, 'none')
  assert.equal(armed.cards.Fruit.ants, null)
  assert.equal(armed.cards.Fruit.animation, 'none')
  assert.equal(armed.cards.Fruit.width, '3.5px')
  assert.equal(armed.cards.Fruit.clock, false)
  assert.equal(armed.mercies, 0)
  assert.equal(armed.editor, false)

  const empty = await page.evaluate(() => {
    const canvas = document.getElementById('canvas').getBoundingClientRect()
    for (let y = 70; y < 220; y += 18) {
      for (let x = canvas.left + 12; x < canvas.right - 12; x += 22) {
        const hit = document.elementFromPoint(x, y)
        if (hit && !hit.closest('g.node, g.hit-slot, .node-edit-stack')) return { x, y }
      }
    }
    return null
  })
  assert.ok(empty, 'need an empty map point')
  await gesture(empty.x, empty.y, 0, 0)
  const cleared = await read()
  assert.equal(cleared.armed, null)
  assert.equal(cleared.cards.Fruit.arm, null)
  assert.equal(cleared.cards.Fruit.stroke, null)

  const swipe = async (name, dx, dy) => {
    const spot = await point(name)
    await gesture(spot.x, spot.y, dx, dy)
  }

  await swipe('Fruit', 0, 0)
  await swipe('Fruit', 0, 80)
  const branch = await read()
  assert.deepEqual(branch.marked, ['Fruit:red', 'Lime:red', 'Peel:red', 'Zest:red'])
  assert.equal(branch.cards.Fruit.clock, true)
  assert.equal(branch.cards.Fruit.clockStroke, '#ff0000')
  assert.equal(branch.cards.Lime.stroke, '#ff0000')
  assert.equal(branch.cards.Lime.ants, 'ants')
  assert.equal(branch.cards.Peel.stroke, '#ff0000')
  assert.equal(branch.cards.Zest.stroke, '#ff0000')
  assert.equal(branch.cards.Meat.stroke, null)
  assert.equal(branch.cards.Food.stroke, null)
  assert.equal(branch.cards.Fruit.arm, null)

  await reset()
  await swipe('Fruit', 0, 0)
  await swipe('Fruit', 0, -80)
  const alone = await read()
  assert.deepEqual(alone.marked, ['Fruit:red'])
  assert.equal(alone.cards.Fruit.clock, true)
  assert.equal(alone.cards.Fruit.clockStroke, '#ff0000')
  assert.equal(alone.cards.Lime.stroke, null)
  assert.equal(alone.cards.Peel.stroke, null)
  assert.equal(alone.cards.Zest.stroke, null)
  assert.equal(alone.cards.Food.stroke, null)

  await reset()
  await swipe('Fruit', 0, 0)
  await swipe('Lime', 0, 80)
  const kids = await read()
  assert.deepEqual(kids.marked, ['Lime:red', 'Zest:red'])
  assert.equal(kids.cards.Fruit.clock, true)
  assert.equal(kids.cards.Fruit.stroke, null)
  assert.equal(kids.cards.Lime.stroke, '#ff0000')
  assert.equal(kids.cards.Zest.stroke, '#ff0000')
  assert.equal(kids.cards.Peel.stroke, null)
  assert.equal(kids.cards.Meat.stroke, null)

  await reset()
  await swipe('Fruit', 0, 0)
  await swipe('Zest', 0, 80)
  const kidsAgain = await read()
  assert.deepEqual(kidsAgain.marked, ['Lime:red', 'Zest:red'])
  assert.equal(kidsAgain.cards.Peel.stroke, null)
  assert.equal(kidsAgain.cards.Fruit.clock, true)

  await reset()
  await swipe('Fruit', 0, 0)
  await swipe('Fruit', -80, 0)
  const bank = await read()
  assert.deepEqual(bank.marked, ['Fruit:amber', 'Lime:amber', 'Peel:amber', 'Zest:amber'])
  assert.equal(bank.cards.Fruit.clock, true)
  assert.equal(bank.cards.Fruit.clockStroke, '#ffa100')
  assert.equal(bank.cards.Lime.stroke, '#ffa100')
  assert.equal(bank.cards.Peel.stroke, '#ffa100')
  assert.equal(bank.cards.Zest.stroke, '#ffa100')
  assert.equal(bank.cards.Meat.stroke, null)

  await reset()
  await swipe('Fruit', 0, 0)
  await swipe('Lime', -80, 0)
  const kidBank = await read()
  assert.deepEqual(kidBank.marked, ['Lime:amber', 'Zest:amber'])
  assert.equal(kidBank.cards.Fruit.clock, true)
  assert.equal(kidBank.cards.Fruit.clockStroke, '#ffa100')
  assert.equal(kidBank.cards.Lime.stroke, '#ffa100')
  assert.equal(kidBank.cards.Zest.stroke, '#ffa100')
  assert.equal(kidBank.cards.Peel.stroke, null)

  await reset()
  await swipe('Fruit', 0, 0)
  await swipe('Peel', 0, 80)
  const deeper = await read()
  assert.equal(deeper.mercies, 0)
  assert.equal(deeper.cards.Lime.stroke, null)
  assert.equal(deeper.cards.Zest.stroke, null)
  assert.equal(deeper.cards.Fruit.clock, false)

  assert.deepEqual(errors, [])
  await context.close()
})

test('LOGYQ rename mirrors onto the card and clears the green focus', async () => {
  const context = await newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  await stubMaps(context)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logyq/index.html`, { waitUntil: 'networkidle' })
  await waitForBoot(page)
  await page.evaluate(() => {
    window.LOGYQPreview.app.hasOpenMap = true
    document.body.classList.add('logyq-map-open')
    document.body.classList.remove('logyq-home')
    document.querySelectorAll('.logiq-backdrop.is-open').forEach((el) => el.classList.remove('is-open'))
    window.LOGYQBridge.core.editing.closeNodeEditor(false, false)
    window.LOGYQBridge.loadMap({ name: 'Food', children: [{ name: 'Fruit' }] }, [])
  })
  await page.waitForFunction(() => {
    const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((el) => el.__data__?.data?.name === 'Fruit')
    return node && node.getBoundingClientRect().width > 20
  })
  const read = () => page.evaluate(() => {
    const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((el) => el.dataset.editFocus === '1')
      || Array.from(document.querySelectorAll('svg#canvas g.node')).find((el) => el.__data__?.data?.name === 'Fruit' || el.__data__?.data?._uid)
    const fruit = Array.from(document.querySelectorAll('svg#canvas g.node')).find((el) => {
      const uid = el.__data__?.data?._uid
      return uid && uid === document.querySelector('.node-edit-input')?.dataset?.editUid
    }) || Array.from(document.querySelectorAll('svg#canvas g.node')).find((el) => el.__data__?.data?.name === 'Fruit' || el.__data__?.data?.name === 'Peel' || el.__data__?.data?.name === 'Citrus')
    const ring = fruit?.querySelector('rect.logyq-edit-focus')
    const label = fruit?.querySelector('text.label')
    return {
      name: fruit?.__data__?.data?.name ?? null,
      label: label?.textContent || '',
      focus: fruit?.dataset?.editFocus || null,
      arm: fruit?.dataset?.smiteArm || null,
      armed: window.LOGYQPreview.gestures.smite.armed,
      stroke: ring?.getAttribute('stroke') || null,
      fill: ring?.getAttribute('fill') || null,
      width: ring ? getComputedStyle(ring).strokeWidth : null,
      value: document.querySelector('.node-edit-input')?.value ?? null,
      editing: window.LOGYQBridge.core.state.editingUid,
    }
  })
  const point = await page.evaluate(() => {
    const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((el) => el.__data__?.data?.name === 'Fruit')
    const rect = node.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  })
  const tap = async () => {
    await page.evaluate(({ x, y }) => {
      const nodes = Array.from(document.querySelectorAll('svg#canvas g.node'))
      const host = nodes.find((node) => {
        const face = node.querySelector('rect:not(.grabzone):not(.logyq-smite-wash):not(.logyq-smite-glow):not(.logyq-edit-focus)')
        const rect = face?.getBoundingClientRect()
        return rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
      })
      const face = host?.querySelector('rect:not(.grabzone):not(.logyq-smite-wash):not(.logyq-smite-glow):not(.logyq-edit-focus)')
      const canvas = document.getElementById('canvas')
      const hit = document.elementFromPoint(x, y)
      const target = face || (hit && canvas.contains(hit) ? hit : canvas)
      const fire = (type) => target.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, composed: true, pointerType: 'touch', pointerId: 9,
        isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y,
      }))
      fire('pointerdown')
      fire('pointerup')
    }, point)
  }
  await tap()
  await tap()
  await page.waitForSelector('.node-edit-input')
  await page.waitForFunction(() => document.activeElement?.classList?.contains('node-edit-input'))
  const opened = await read()
  assert.equal(opened.value, 'Fruit')
  assert.equal(opened.focus, '1')
  assert.equal(opened.stroke, '#16a34a')
  assert.equal(opened.fill, 'none')
  assert.equal(opened.width, '3.5px')
  assert.equal(opened.arm, null)
  assert.equal(opened.armed, null)
  await page.locator('.node-edit-input').pressSequentially('Pe')
  const mid = await read()
  assert.equal(mid.value, 'FruitPe')
  assert.equal(mid.name, 'FruitPe')
  assert.equal(mid.label, 'FruitPe')
  assert.equal(mid.focus, '1')
  await page.locator('.node-edit-input').fill('Peel')
  const typed = await read()
  assert.equal(typed.name, 'Peel')
  assert.equal(typed.label, 'Peel')
  await page.locator('.node-edit-cancel').click()
  await page.waitForFunction(() => !window.LOGYQBridge.core.state.editingUid)
  const cancelled = await page.evaluate(() => {
    const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((el) => el.__data__?.data?.name === 'Fruit')
    return {
      name: node?.__data__?.data?.name ?? null,
      label: node?.querySelector('text.label')?.textContent || '',
      focus: document.querySelectorAll('rect.logyq-edit-focus').length,
      armed: window.LOGYQPreview.gestures.smite.armed,
    }
  })
  assert.equal(cancelled.name, 'Fruit')
  assert.equal(cancelled.label, 'Fruit')
  assert.equal(cancelled.focus, 0)
  assert.equal(cancelled.armed, null)
  const again = await page.evaluate(() => {
    const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((el) => el.__data__?.data?.name === 'Fruit')
    const rect = node.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  })
  const tapAt = async (spot) => {
    await page.evaluate(({ x, y }) => {
      const nodes = Array.from(document.querySelectorAll('svg#canvas g.node'))
      const host = nodes.find((node) => {
        const face = node.querySelector('rect:not(.grabzone):not(.logyq-smite-wash):not(.logyq-smite-glow):not(.logyq-edit-focus)')
        const rect = face?.getBoundingClientRect()
        return rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
      })
      const face = host?.querySelector('rect:not(.grabzone):not(.logyq-smite-wash):not(.logyq-smite-glow):not(.logyq-edit-focus)')
      const canvas = document.getElementById('canvas')
      const hit = document.elementFromPoint(x, y)
      const target = face || (hit && canvas.contains(hit) ? hit : canvas)
      const fire = (type) => target.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, composed: true, pointerType: 'touch', pointerId: 9,
        isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y,
      }))
      fire('pointerdown')
      fire('pointerup')
    }, spot)
  }
  await tapAt(again)
  await tapAt(again)
  const second = await page.evaluate(({ x, y }) => {
    const hit = document.elementFromPoint(x, y)
    return {
      editing: window.LOGYQBridge.core.state.editingUid,
      editors: document.querySelectorAll('.node-edit-input').length,
      hit: hit ? `${hit.tagName}.${hit.getAttribute('class') || ''}` : null,
      armed: window.LOGYQPreview.gestures.smite.armed,
    }
  }, again)
  assert.equal(second.editors, 1, JSON.stringify(second))
  await page.waitForFunction(() => document.activeElement?.classList?.contains('node-edit-input'))
  await page.locator('.node-edit-input').fill('Citrus')
  const live = await read()
  assert.equal(live.name, 'Citrus')
  assert.equal(live.label, 'Citrus')
  assert.equal(live.stroke, '#16a34a')
  await page.locator('.node-edit-input').press('Enter')
  await page.waitForFunction(() => !window.LOGYQBridge.core.state.editingUid)
  const saved = await page.evaluate(() => {
    const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((el) => el.__data__?.data?.name === 'Citrus')
    return {
      name: node?.__data__?.data?.name ?? null,
      label: node?.querySelector('text.label')?.textContent || '',
      focus: document.querySelectorAll('rect.logyq-edit-focus').length,
      armed: window.LOGYQPreview.gestures.smite.armed,
    }
  })
  assert.equal(saved.name, 'Citrus')
  assert.equal(saved.label, 'Citrus')
  assert.equal(saved.focus, 0)
  assert.equal(saved.armed, null)
  assert.deepEqual(errors, [])
  await context.close()
})

test('LOGYQ an ancestor cast absorbs a nested branch and disjoint branches stay live', async () => {
  const context = await newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  await stubMaps(context)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logyq/index.html`, { waitUntil: 'networkidle' })
  await waitForBoot(page)
  await page.evaluate(() => {
    window.LOGYQPreview.app.hasOpenMap = true
    document.body.classList.add('logyq-map-open')
    document.body.classList.remove('logyq-home')
    document.querySelectorAll('.logiq-backdrop.is-open').forEach((el) => el.classList.remove('is-open'))
    window.LOGYQBridge.core.editing.closeNodeEditor(false, false)
    window.LOGYQBridge.loadMap({
      name: 'Root',
      children: [
        { name: 'A', children: [{ name: 'B', children: [{ name: 'B1' }] }] },
        { name: 'C' },
      ],
    }, [])
  })
  await page.waitForFunction(() => ['A', 'B', 'B1', 'C'].every((label) => {
    const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((el) => el.__data__?.data?.name === label)
    return node && node.getBoundingClientRect().width > 20
  }))
  const report = await page.evaluate(() => {
    const core = window.LOGYQBridge.core
    const byName = (label) => core.state.root.descendants().find((node) => node.data.name === label)
    const uid = (label) => byName(label).data._uid
    const clock = (label) => {
      const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((el) => el.__data__?.data?.name === label)
      return node?.dataset?.smiteClock === '1'
    }
    const gestures = window.LOGYQPreview.gestures
    gestures.smite.mercies = []
    gestures.smite.mercy = null
    const child = gestures.openSmiteCast({
      uid: uid('B'),
      direction: 'right',
      ids: [uid('B'), uid('B1')],
    })
    const nested = gestures.smite.mercies[0]
    nested.marks.set(uid('B1'), 'amber')
    const ancestor = gestures.openSmiteCast({
      uid: uid('A'),
      direction: 'right',
      ids: [uid('A'), uid('B'), uid('B1')],
    })
    const absorbed = {
      child,
      ancestor,
      count: gestures.smite.mercies.length,
      castUid: gestures.smite.mercy?.castUid,
      primaryIsA: gestures.smite.mercy?.castUid === uid('A'),
      marks: [...(gestures.smite.mercy?.marks || [])],
      clocks: { a: clock('A'), b: clock('B'), b1: clock('B1'), c: clock('C') },
    }
    gestures.smite.mercies = []
    gestures.smite.mercy = null
    const left = gestures.openSmiteCast({
      uid: uid('A'),
      direction: 'right',
      ids: [uid('A'), uid('B'), uid('B1')],
    })
    const right = gestures.openSmiteCast({
      uid: uid('C'),
      direction: 'left',
      ids: [uid('C')],
    })
    const live = gestures.smite.mercies.map((mercy) => mercy.castUid)
    return {
      absorbed,
      disjoint: {
        left,
        right,
        count: gestures.smite.mercies.length,
        live,
        clocks: { a: clock('A'), b: clock('B'), c: clock('C') },
        a: live.includes(uid('A')),
        c: live.includes(uid('C')),
      },
    }
  })
  assert.equal(report.absorbed.child, 'clear')
  assert.equal(report.absorbed.ancestor, 'absorb')
  assert.equal(report.absorbed.count, 1)
  assert.equal(report.absorbed.primaryIsA, true)
  assert.deepEqual(report.absorbed.marks.map((entry) => entry[1]), ['red', 'red', 'amber'])
  assert.equal(report.absorbed.clocks.a, true)
  assert.equal(report.absorbed.clocks.b, false)
  assert.equal(report.absorbed.clocks.b1, false)
  assert.equal(report.disjoint.left, 'clear')
  assert.equal(report.disjoint.right, 'clear')
  assert.equal(report.disjoint.count, 2)
  assert.equal(report.disjoint.a, true)
  assert.equal(report.disjoint.c, true)
  assert.equal(report.disjoint.clocks.a, true)
  assert.equal(report.disjoint.clocks.c, true)
  assert.equal(report.disjoint.clocks.b, false)
  assert.deepEqual(errors, [])
  await context.close()
})

test('LOGYQ partial smite conclude redraws connectors with the cards', async () => {
  const context = await newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  await stubMaps(context)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logyq/index.html`, { waitUntil: 'networkidle' })
  await waitForBoot(page)
  await page.evaluate(() => {
    window.LOGYQPreview.app.hasOpenMap = true
    document.body.classList.add('logyq-map-open')
    document.body.classList.remove('logyq-home')
    document.querySelectorAll('.logiq-backdrop.is-open').forEach((el) => el.classList.remove('is-open'))
    window.LOGYQBridge.core.editing.closeNodeEditor(false, false)
    window.LOGYQBridge.loadMap({
      name: 'Root',
      children: [
        { name: 'Gone' },
        { name: 'Stay', children: [{ name: 'Leaf' }] },
      ],
    }, [])
  })
  await page.waitForFunction(() => ['Root', 'Gone', 'Stay', 'Leaf'].every((label) => {
    const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((el) => el.__data__?.data?.name === label)
    return node && node.getBoundingClientRect().width > 20
  }))
  await page.evaluate(() => window.LOGYQBridge.core.treeManager.autoFit())
  await page.waitForFunction(() => {
    const names = ['Root', 'Gone', 'Stay']
    return names.every((label) => {
      const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((el) => el.__data__?.data?.name === label)
      const rect = node?.querySelector('rect:not(.grabzone)')?.getBoundingClientRect()
      return rect && rect.top > 40 && rect.bottom < window.innerHeight - 80 && rect.left > 0 && rect.right < window.innerWidth
    })
  })

  async function face(name) {
    return page.evaluate((label) => {
      const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((el) => el.__data__?.data?.name === label)
      const box = node?.querySelector('rect:not(.grabzone)') || node
      const rect = box.getBoundingClientRect()
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    }, name)
  }
  async function touch(type, x, y, pointerId) {
    await page.evaluate(({ type, x, y, pointerId }) => {
      const hit = document.elementFromPoint(x, y)
      const canvas = document.getElementById('canvas')
      const target = hit && canvas.contains(hit) ? hit : canvas
      target.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, composed: true, pointerType: 'touch', pointerId,
        isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y,
      }))
    }, { type, x, y, pointerId })
  }

  const planted = await page.evaluate(() => {
    const core = window.LOGYQBridge.core
    const byName = (label) => core.state.root.descendants().find((node) => node.data.name === label)
    const root = byName('Root')
    const gone = byName('Gone')
    const stay = byName('Stay')
    const leaf = byName('Leaf')
    const mercy = {
      marks: new Map([
        [root.data._uid, 'red'],
        [gone.data._uid, 'red'],
        [stay.data._uid, 'red'],
        [leaf.data._uid, 'amber'],
      ]),
      castUid: root.data._uid,
      zone: 'middle',
      direction: 'down',
      remaining: 9000,
      lastTick: performance.now(),
      interacting: false,
      committing: false,
    }
    const smite = window.LOGYQPreview.gestures.smite
    smite.mercies = [mercy]
    smite.mercy = mercy
    const stayLink = Array.from(document.querySelectorAll('svg#canvas g.links path.link')).find((link) => link.__data__?.target?.data?.name === 'Stay')
    return { before: stayLink?.getAttribute('d') || '' }
  })
  assert.ok(planted.before)

  const gone = await face('Gone')
  await touch('pointerdown', gone.x, gone.y, 41)
  await touch('pointerup', gone.x, gone.y + 74, 41)
  await page.waitForFunction(() => !window.LOGYQBridge.core.state.root.descendants().some((node) => node.data.name === 'Gone'))
  await page.waitForFunction(() => !window.LOGYQBridge.core.state.layoutSettling)

  const geometry = await page.evaluate(() => {
    const vLink = window.LOGYQBridge.core.visual.vLink
    const links = Array.from(document.querySelectorAll('svg#canvas g.links path.link')).map((link) => {
      const name = link.__data__?.target?.data?.name || ''
      const want = vLink(link.__data__)
      const d = link.getAttribute('d') || ''
      return { name, d, want, match: d === want }
    })
    const ants = Array.from(document.querySelectorAll('svg#canvas path.logyq-smite-ant')).map((path) => {
      let link = path.previousElementSibling
      while (link && !link.classList?.contains('link')) link = link.previousElementSibling
      return {
        d: path.getAttribute('d') || '',
        link: link?.getAttribute('d') || '',
        match: (path.getAttribute('d') || '') === (link?.getAttribute('d') || ''),
      }
    })
    return {
      names: window.LOGYQBridge.core.state.root.descendants().map((node) => node.data.name),
      links,
      ants,
      mercy: window.LOGYQPreview.gestures.smite.mercies.length,
    }
  })
  assert.deepEqual(geometry.names.slice().sort(), ['Leaf', 'Root', 'Stay'])
  assert.equal(geometry.mercy, 1, 'the rest of the cast stays live')
  assert.ok(geometry.links.length >= 2, 'root, stay, and leaf still have connectors')
  for (const link of geometry.links) {
    assert.equal(link.match, true, `${link.name} connector should sit on the new layout`)
  }
  const stay = geometry.links.find((link) => link.name === 'Stay')
  assert.ok(stay)
  assert.notEqual(stay.d, planted.before, 'the stay connector must leave its pre-conclude curve')
  assert.ok(geometry.ants.length >= 2, 'cast ants should still be on the live edges')
  for (const ant of geometry.ants) assert.equal(ant.match, true, 'cast ants should follow the link they decorate')
  assert.deepEqual(errors, [])
  await context.close()
})

test('LOGYQ clears white outlines on the midfield parents Ashley photographed', async () => {
  const context = await newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  await stubMaps(context)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logyq/index.html`, { waitUntil: 'networkidle' })
  await waitForBoot(page)
  await page.evaluate(() => {
    window.LOGYQPreview.app.hasOpenMap = true
    document.body.classList.add('logyq-map-open')
    document.body.classList.remove('logyq-home')
    document.querySelectorAll('.logiq-backdrop.is-open').forEach((el) => el.classList.remove('is-open'))
    window.LOGYQBridge.core.editing.closeNodeEditor(false, false)
    window.LOGYQBridge.loadMap({
      name: 'Food',
      children: [
        { name: 'Fruit', children: [{ name: 'Apple' }, { name: 'Banana' }] },
        { name: 'Meat', children: [{ name: 'Chicken' }, { name: 'Beef' }] },
      ],
    }, [])
  })
  await page.waitForFunction(() => {
    const names = ['Food', 'Fruit', 'Meat', 'Apple', 'Banana', 'Chicken', 'Beef']
    return names.every((label) => {
      const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((el) => el.__data__?.data?.name === label)
      const rect = node?.getBoundingClientRect()
      return rect && rect.width > 20 && rect.top > 40 && rect.bottom < window.innerHeight
    })
  })

  async function face(name) {
    return page.evaluate((label) => {
      const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((el) => el.__data__?.data?.name === label)
      const box = node?.querySelector('rect:not(.grabzone)') || node
      const rect = box.getBoundingClientRect()
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    }, name)
  }

  async function touch(type, x, y, pointerId) {
    await page.evaluate(({ type, x, y, pointerId }) => {
      const hit = document.elementFromPoint(x, y)
      const target = hit && document.getElementById('canvas')?.contains(hit) ? hit : document.getElementById('canvas')
      target.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerType: 'touch',
        pointerId,
        isPrimary: true,
        button: 0,
        buttons: type === 'pointerup' ? 0 : 1,
        clientX: x,
        clientY: y,
      }))
    }, { type, x, y, pointerId })
  }

  async function castKidsOfFood() {
    const thumb = await page.evaluate(() => {
      const canvas = document.getElementById('canvas').getBoundingClientRect()
      const yStart = Math.floor(window.innerHeight * (2 / 3)) + 8
      for (let y = window.innerHeight - 6; y >= yStart; y -= 10) {
        for (let x = canvas.left + 6; x < canvas.right - 6; x += 12) {
          const hit = document.elementFromPoint(x, y)?.closest?.('g.node, g.hit-slot')
          if (!hit) return { x, y }
        }
      }
      return null
    })
    assert.ok(thumb, 'bottom third needs an empty thumb park')
    const card = await face('Food')
    await touch('pointerdown', thumb.x, thumb.y, 111)
    await touch('pointerdown', card.x, card.y, 112)
    await touch('pointermove', card.x, card.y + 70, 112)
    await touch('pointerup', card.x, card.y + 70, 112)
    await touch('pointerup', thumb.x, thumb.y, 111)
    await page.waitForFunction(() => window.LOGYQPreview.gestures.smite.mercy?.marks?.size === 2)
  }

  async function tap(name, pointerId) {
    await page.evaluate(({ label, pointerId }) => {
      const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((el) => el.__data__?.data?.name === label)
      const face = node?.querySelector('rect:not(.grabzone):not(.logyq-smite-wash):not(.logyq-smite-glow):not(.logyq-edit-focus)') || node
      const rect = face.getBoundingClientRect()
      const x = rect.left + rect.width / 2
      const y = rect.top + rect.height / 2
      const fire = (type) => face.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerType: 'touch',
        pointerId,
        isPrimary: true,
        button: 0,
        buttons: type === 'pointerup' ? 0 : 1,
        clientX: x,
        clientY: y,
      }))
      fire('pointerdown')
      fire('pointerup')
    }, { label: name, pointerId })
    await page.waitForTimeout(40)
  }

  async function chrome() {
    return page.evaluate(() => {
      const read = (label) => {
        const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((el) => el.__data__?.data?.name === label)
        const wash = node?.querySelector('rect.logyq-smite-wash')
        const clock = node?.querySelector('path.logyq-smite-clock')
        const raw = wash ? (wash.getAttribute('stroke') || '') : ''
        const stroke = raw === 'rgb(255, 0, 0)' ? '#ff0000' : (raw === 'rgb(255, 255, 255)' ? '#ffffff' : (raw === 'rgb(255, 161, 0)' ? '#ffa100' : (raw || null)))
        return {
          stroke,
          ants: wash?.dataset?.smiteOutline || null,
          clock: !!clock,
        }
      }
      const mercy = window.LOGYQPreview.gestures.smite.mercy
      const root = window.LOGYQBridge.core.state.root
      const nameOf = (uid) => root.descendants().find((node) => node.data._uid === uid)?.data?.name || null
      return {
        mercy: !!mercy,
        raf: window.LOGYQPreview.gestures.smite.raf || 0,
        remaining: mercy ? mercy.remaining : null,
        marks: mercy ? [...mercy.marks.entries()].map(([uid, mark]) => [nameOf(uid), mark]).sort() : [],
        names: root.descendants().map((node) => node.data.name),
        Food: read('Food'),
        Fruit: read('Fruit'),
        Meat: read('Meat'),
        Apple: read('Apple'),
        Banana: read('Banana'),
        Chicken: read('Chicken'),
        Beef: read('Beef'),
      }
    })
  }

  await castKidsOfFood()
  let nominated = await chrome()
  assert.deepEqual(nominated.marks, [['Fruit', 'red'], ['Meat', 'red']])
  assert.equal(nominated.Food.clock, true)
  assert.equal(nominated.Food.stroke, null)
  assert.equal(nominated.Fruit.stroke, '#ff0000')
  assert.equal(nominated.Meat.stroke, '#ff0000')
  for (const kid of ['Apple', 'Banana', 'Chicken', 'Beef']) {
    assert.equal(nominated[kid].stroke, null, `${kid} stays quiet during a kids-only cast`)
  }

  await tap('Fruit', 113)
  await tap('Fruit', 114)
  const oneWhite = await chrome()
  assert.equal(oneWhite.mercy, true, 'Meat still on delete keeps the cast')
  assert.equal(oneWhite.Fruit.stroke, '#ffffff')
  assert.equal(oneWhite.Fruit.ants, 'ants')
  assert.equal(oneWhite.Meat.stroke, '#ff0000')
  assert.equal(oneWhite.Apple.stroke, null)

  await tap('Meat', 115)
  await tap('Meat', 116)
  let cleared = await chrome()
  assert.equal(cleared.mercy, false, 'Fruit and Meat both white ends the cast')
  assert.equal(cleared.raf, 0, 'the mercy timer does not keep a frame')
  for (const name of ['Food', 'Fruit', 'Meat', 'Apple', 'Banana', 'Chicken', 'Beef']) {
    assert.equal(cleared[name].stroke, null, `${name} has no outline after the cast ends`)
    assert.equal(cleared[name].clock, false)
  }
  assert.deepEqual(cleared.names.slice().sort(), ['Apple', 'Banana', 'Beef', 'Chicken', 'Food', 'Fruit', 'Meat'])
  await page.waitForTimeout(300)
  cleared = await chrome()
  assert.equal(cleared.mercy, false)
  assert.equal(cleared.raf, 0)
  await page.screenshot({ path: '/opt/cursor/artifacts/screenshots/cast_food_white_cleared.png' })

  await page.evaluate(() => {
    const smite = window.LOGYQPreview.gestures.smite
    if (smite.raf) cancelAnimationFrame(smite.raf)
    smite.raf = 0
    const root = window.LOGYQBridge.core.state.root
    const uid = (label) => root.descendants().find((node) => node.data.name === label).data._uid
    const mercy = {
      marks: new Map([[uid('Fruit'), 'normal'], [uid('Meat'), 'normal']]),
      castUid: uid('Food'),
      zone: 'bottom',
      direction: 'down',
      remaining: 9000,
      lastTick: performance.now(),
      interacting: false,
      committing: false,
    }
    smite.mercies = [mercy]
    smite.mercy = mercy
  })
  const empty = await page.evaluate(() => {
    const canvas = document.getElementById('canvas').getBoundingClientRect()
    for (let y = 80; y < window.innerHeight - 8; y += 14) {
      for (let x = canvas.left + 6; x < canvas.right - 6; x += 16) {
        const hit = document.elementFromPoint(x, y)?.closest?.('g.node, g.hit-slot')
        if (!hit) return { x, y }
      }
    }
    return null
  })
  assert.ok(empty)
  await touch('pointerdown', empty.x, empty.y, 117)
  await touch('pointerup', empty.x, empty.y, 117)
  const stuck = await chrome()
  assert.equal(stuck.mercy, true)
  assert.equal(stuck.Food.stroke, null)
  assert.equal(stuck.Food.clock, false)
  assert.equal(stuck.Fruit.stroke, '#ffffff')
  assert.equal(stuck.Fruit.ants, 'ants')
  assert.equal(stuck.Meat.stroke, '#ffffff')
  assert.equal(stuck.Meat.ants, 'ants')
  for (const kid of ['Apple', 'Banana', 'Chicken', 'Beef']) {
    assert.equal(stuck[kid].stroke, null)
    assert.equal(stuck[kid].clock, false)
  }
  await page.screenshot({ path: '/opt/cursor/artifacts/screenshots/cast_food_white_stuck.png' })

  await tap('Food', 118)
  const afterFood = await chrome()
  assert.equal(afterFood.mercy, false, 'tapping Food clears the white-only midfield cast')
  assert.equal(afterFood.raf, 0)
  assert.equal(afterFood.Fruit.stroke, null)
  assert.equal(afterFood.Meat.stroke, null)
  assert.equal(afterFood.Food.clock, false)
  await page.waitForTimeout(300)
  assert.equal((await chrome()).mercy, false)
  await page.screenshot({ path: '/opt/cursor/artifacts/screenshots/cast_food_after_parent.png' })

  assert.deepEqual(errors, [])
  await context.close()
})

test('LOGYQ phone edit uses a keyboard field and does not move the map', async () => {
  const context = await newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  await stubMaps(context)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logyq/index.html`, { waitUntil: 'networkidle' })
  await waitForBoot(page)
  await page.evaluate(() => {
    window.LOGYQPreview.app.hasOpenMap = true
    document.body.classList.add('logyq-map-open')
    document.body.classList.remove('logyq-home')
    document.querySelectorAll('.logiq-backdrop.is-open').forEach((el) => el.classList.remove('is-open'))
    window.LOGYQBridge.core.editing.closeNodeEditor(false, false)
    window.LOGYQBridge.loadMap({
      name: 'Food',
      children: [{ name: 'Fruit' }],
    }, [])
  })
  await page.waitForFunction(() => {
    const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((el) => el.__data__?.data?.name === 'Fruit')
    const rect = node?.getBoundingClientRect()
    return rect && rect.width > 20 && rect.bottom < window.innerHeight
  })

  async function face(name) {
    return page.evaluate((label) => {
      const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((el) => el.__data__?.data?.name === label)
      const box = node?.querySelector('rect:not(.grabzone)') || node
      const rect = box.getBoundingClientRect()
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, uid: node?.__data__?.data?._uid }
    }, name)
  }

  async function touch(type, x, y, pointerId) {
    await page.evaluate(({ type, x, y, pointerId }) => {
      const hit = document.elementFromPoint(x, y)
      const target = hit && document.getElementById('canvas')?.contains(hit) ? hit : document.getElementById('canvas')
      target.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerType: 'touch',
        pointerId,
        isPrimary: true,
        button: 0,
        buttons: type === 'pointerup' ? 0 : 1,
        clientX: x,
        clientY: y,
      }))
    }, { type, x, y, pointerId })
  }

  async function view() {
    return page.evaluate(() => {
      const t = window.d3.zoomTransform(document.getElementById('canvas'))
      return { x: t.x, y: t.y, k: t.k }
    })
  }

  function sameCamera(before, after, label) {
    assert.ok(Math.abs(after.k - before.k) < 0.02, `${label} must not zoom before=${before.k} after=${after.k}`)
    assert.ok(Math.hypot(after.x - before.x, after.y - before.y) < 2, `${label} must not pan before=${before.x},${before.y} after=${after.x},${after.y}`)
  }

  await page.waitForFunction(() => {
    const t = window.d3.zoomTransform(document.getElementById('canvas'))
    const prev = window.__logyqCamSettle
    const now = performance.now()
    const still = !!(prev && Math.abs(prev.k - t.k) < 0.001 && Math.hypot(prev.x - t.x, prev.y - t.y) < 0.5)
    window.__logyqCamSettle = { x: t.x, y: t.y, k: t.k, since: still ? prev.since : now }
    return still && now - prev.since > 150
  })
  const before = await view()
  const fruit = await face('Fruit')
  await touch('pointerdown', fruit.x, fruit.y, 11)
  await touch('pointerup', fruit.x, fruit.y, 11)
  await touch('pointerdown', fruit.x, fruit.y, 12)
  await touch('pointerup', fruit.x, fruit.y, 12)
  await page.waitForSelector('.node-edit-stack')
  assert.equal(await page.evaluate(() => document.querySelector('.node-edit-stack').classList.contains('is-placed')), false, 'bar stays hidden while the keyboard rises')
  await page.waitForSelector('.node-edit-stack.is-placed', { timeout: 2000 })
  await page.waitForFunction(() => {
    const stack = document.querySelector('.node-edit-stack')
    const box = stack?.getBoundingClientRect()
    return stack?.dataset?.drawerSettled === '1' && box && Math.abs(window.innerHeight - box.bottom) < 2
  })
  const opened = await page.evaluate(() => {
    const input = document.querySelector('.node-edit-input')
    const dock = document.querySelector('.node-edit-dock')
    const cancel = document.querySelector('.node-edit-cancel')
    const box = dock.getBoundingClientRect()
    const field = input.getBoundingClientRect()
    const cross = cancel.getBoundingClientRect()
    const card = Array.from(document.querySelectorAll('svg#canvas g.node')).find((el) => el.__data__?.data?.name === 'Fruit').getBoundingClientRect()
    const dockStyle = getComputedStyle(dock)
    const fieldStyle = getComputedStyle(input)
    return {
      uid: window.LOGYQBridge.core.state.editingUid,
      value: input.value,
      docked: field.bottom > window.innerHeight - 80 && field.top > card.bottom,
      left: box.left,
      right: box.right,
      bottomGap: window.innerHeight - box.bottom,
      radius: dockStyle.borderRadius,
      fontSize: fieldStyle.fontSize,
      done: document.querySelectorAll('.node-edit-done').length,
      cancel: cancel?.getAttribute('aria-label') || '',
      crossAbove: cross.bottom <= box.top + 1,
      crossRound: getComputedStyle(cancel).borderRadius,
      crossLeft: cross.left,
      crossWidth: cross.width,
      shadow: dockStyle.boxShadow,
      placed: document.querySelector('.node-edit-stack').classList.contains('is-placed'),
      drawerFrom: Number(document.querySelector('.node-edit-stack').dataset.drawerFrom || 0),
      inner: window.innerHeight,
    }
  })
  assert.equal(opened.uid, fruit.uid)
  assert.equal(opened.value, 'Fruit')
  assert.equal(opened.docked, true)
  assert.ok(opened.left <= 1, `rename bar must be full bleed, left=${opened.left}`)
  assert.ok(opened.right >= 389, `rename bar must reach the right edge, right=${opened.right}`)
  assert.ok(opened.bottomGap < 2, `rename bar must sit on the bottom edge, gap=${opened.bottomGap}`)
  assert.equal(opened.radius, '0px')
  assert.equal(opened.fontSize, '16px')
  assert.equal(opened.done, 0)
  assert.equal(opened.cancel, 'Cancel rename')
  assert.equal(opened.crossAbove, true)
  assert.equal(opened.crossRound, '999px')
  assert.equal(opened.placed, true)
  assert.ok(opened.crossLeft >= 12, `X must sit in from the screen edge, left=${opened.crossLeft}`)
  assert.ok(opened.crossWidth >= 44, `X hit target must be at least 44px, width=${opened.crossWidth}`)
  assert.ok(opened.shadow && opened.shadow !== 'none', 'bar shadow must separate it from the map')
  assert.match(opened.shadow, /12px/, `top shadow must stay a light wash, shadow=${opened.shadow}`)
  assert.doesNotMatch(opened.shadow, /52px/, `top shadow must not wash up the map, shadow=${opened.shadow}`)
  assert.ok(opened.drawerFrom > opened.inner + 8, `rename bar must slide up from below the screen, from=${opened.drawerFrom}`)
  await page.screenshot({ path: '/opt/cursor/artifacts/screenshots/edit_rename_bar.png' })
  sameCamera(before, await view(), 'double-tap')
  await page.waitForTimeout(280)
  sameCamera(before, await view(), 'double-tap after the old zoom delay')
  await page.locator('.node-edit-input').fill('Citrus')
  await page.locator('.node-edit-input').press('Enter')
  await page.waitForFunction(() => {
    const node = window.LOGYQBridge.core.state.root.descendants().find((item) => item.data.name === 'Citrus')
    return node && !window.LOGYQBridge.core.state.editingUid
  })
  const renamed = await page.evaluate((uid) => {
    return window.LOGYQBridge.core.utils.findByUid(window.LOGYQBridge.core.state.root.data, uid)?.name
  }, fruit.uid)
  assert.equal(renamed, 'Citrus')
  sameCamera(before, await view(), 'Enter')

  const citrus = await face('Citrus')
  const count = await page.locator('svg#canvas g.node').count()
  await touch('pointerdown', citrus.x, citrus.y, 13)
  await touch('pointermove', citrus.x, citrus.y + 40, 13)
  await page.waitForTimeout(16)
  await touch('pointerup', citrus.x, citrus.y + 74, 13)
  await page.waitForFunction((n) => document.querySelectorAll('svg#canvas g.node').length > n, count)
  const created = await page.evaluate((parentUid) => {
    const selected = window.LOGYQBridge.core.state.selectedUid
    const node = window.LOGYQBridge.core.state.root.descendants().find((item) => item.data._uid === selected)
    return {
      editors: document.querySelectorAll('.node-edit-input').length,
      selected,
      name: node?.data?.name ?? null,
      parent: node?.parent?.data?._uid || null,
    }
  }, citrus.uid)
  assert.equal(created.editors, 0, 'flick-create must not open the rename bar')
  assert.notEqual(created.selected, citrus.uid)
  assert.equal(created.parent, citrus.uid)
  assert.equal(created.name, '')
  sameCamera(before, await view(), 'flick-create')
  const blank = await page.evaluate((uid) => {
    const face = Array.from(document.querySelectorAll('svg#canvas g.node')).find((el) => el.__data__?.data?._uid === uid)
    const box = face?.querySelector('rect:not(.grabzone)') || face
    const rect = box.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  }, created.selected)
  await touch('pointerdown', blank.x, blank.y, 131)
  await touch('pointerup', blank.x, blank.y, 131)
  await touch('pointerdown', blank.x, blank.y, 132)
  await touch('pointerup', blank.x, blank.y, 132)
  await page.waitForSelector('.node-edit-input')
  assert.equal(await page.evaluate(() => window.LOGYQBridge.core.state.editingUid), created.selected)
  await page.locator('.node-edit-input').fill('Lime')
  await page.locator('.node-edit-input').press('Enter')
  await page.waitForFunction((uid) => {
    return window.LOGYQBridge.core.utils.findByUid(window.LOGYQBridge.core.state.root.data, uid)?.name === 'Lime'
  }, created.selected)
  sameCamera(before, await view(), 'Enter on the new card')
  assert.equal(await page.locator('.node-edit-input').count(), 0)

  const lime = await page.evaluate((uid) => {
    const node = window.LOGYQBridge.core.state.root.descendants().find((item) => item.data._uid === uid)
    const face = Array.from(document.querySelectorAll('svg#canvas g.node')).find((el) => el.__data__?.data?._uid === uid)
    const box = face?.querySelector('rect:not(.grabzone)') || face
    const rect = box.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, parent: node?.parent?.data?.name }
  }, created.selected)
  assert.equal(lime.parent, 'Citrus')
  await touch('pointerdown', lime.x, lime.y, 14)
  await touch('pointerup', lime.x, lime.y, 14)
  await touch('pointerdown', lime.x, lime.y, 15)
  await touch('pointerup', lime.x, lime.y, 15)
  await page.waitForSelector('.node-edit-input')
  await page.locator('.node-edit-input').fill('Discard me')
  await page.locator('.node-edit-input').press('Escape')
  await page.waitForFunction(() => !window.LOGYQBridge.core.state.editingUid)
  assert.equal(await page.evaluate((uid) => {
    return window.LOGYQBridge.core.utils.findByUid(window.LOGYQBridge.core.state.root.data, uid)?.name
  }, created.selected), 'Lime')
  sameCamera(before, await view(), 'Escape')

  await touch('pointerdown', lime.x, lime.y, 16)
  await touch('pointerup', lime.x, lime.y, 16)
  await touch('pointerdown', lime.x, lime.y, 17)
  await touch('pointerup', lime.x, lime.y, 17)
  await page.waitForSelector('.node-edit-cancel')
  await page.locator('.node-edit-input').evaluate((el) => {
    el.focus()
    el.value = ''
    el.setSelectionRange(0, 0)
  })
  await page.locator('.node-edit-input').pressSequentially('Discard me')
  const panSpot = await page.evaluate(() => {
    const canvas = document.getElementById('canvas').getBoundingClientRect()
    for (let y = 80; y < window.innerHeight - 120; y += 16) {
      for (let x = canvas.left + 8; x < canvas.right - 8; x += 18) {
        const hit = document.elementFromPoint(x, y)?.closest?.('g.node, g.hit-slot, .node-edit-stack')
        if (!hit) return { x, y }
      }
    }
    return { x: 40, y: 180 }
  })
  const panBefore = await view()
  await page.evaluate(({ x, y }) => {
    const canvas = document.getElementById('canvas')
    const point = (px, py) => new Touch({ identifier: 7, target: canvas, clientX: px, clientY: py })
    canvas.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [point(x, y)], targetTouches: [point(x, y)], changedTouches: [point(x, y)] }))
    canvas.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [point(x + 90, y + 48)], targetTouches: [point(x + 90, y + 48)], changedTouches: [point(x + 90, y + 48)] }))
    canvas.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], targetTouches: [], changedTouches: [point(x + 90, y + 48)] }))
  }, panSpot)
  const panned = await view()
  assert.ok(Math.hypot(panned.x - panBefore.x, panned.y - panBefore.y) > 30, `map must pan while the rename bar is open, before=${panBefore.x},${panBefore.y} after=${panned.x},${panned.y}`)
  const duringPan = await page.evaluate((uid) => {
    return {
      editing: window.LOGYQBridge.core.state.editingUid,
      name: window.LOGYQBridge.core.utils.findByUid(window.LOGYQBridge.core.state.root.data, uid)?.name,
      value: document.querySelector('.node-edit-input')?.value || '',
    }
  }, created.selected)
  assert.equal(duringPan.editing, created.selected)
  assert.equal(duringPan.name, 'Discard me')
  assert.equal(duringPan.value, 'Discard me')
  const pinchBefore = await view()
  await page.evaluate(({ x, y }) => {
    const canvas = document.getElementById('canvas')
    const fire = (type, px, py, pointerId) => {
      canvas.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerType: 'touch',
        pointerId,
        isPrimary: pointerId === 21,
        button: 0,
        buttons: type === 'pointerup' ? 0 : 1,
        clientX: px,
        clientY: py,
      }))
    }
    fire('pointerdown', x, y, 21)
    fire('pointerdown', x + 160, y, 22)
    fire('pointermove', x + 24, y, 21)
    fire('pointermove', x + 136, y, 22)
    fire('pointermove', x + 50, y, 21)
    fire('pointermove', x + 90, y, 22)
    fire('pointerup', x + 50, y, 21)
    fire('pointerup', x + 90, y, 22)
  }, panSpot)
  const pinched = await view()
  assert.ok(pinchBefore.k - pinched.k > 0.05, `map must pinch-zoom while renaming, before=${pinchBefore.k} after=${pinched.k}`)
  assert.equal(await page.evaluate(() => window.LOGYQBridge.core.state.editingUid), created.selected)
  await page.locator('.node-edit-cancel').click()
  await page.waitForFunction(() => !window.LOGYQBridge.core.state.editingUid)
  assert.equal(await page.evaluate((uid) => {
    return window.LOGYQBridge.core.utils.findByUid(window.LOGYQBridge.core.state.root.data, uid)?.name
  }, created.selected), 'Lime')
  const afterCancel = await view()
  assert.ok(Math.abs(afterCancel.k - pinched.k) < 0.05, 'cancel must not snap the zoom')
  assert.ok(Math.hypot(afterCancel.x - pinched.x, afterCancel.y - pinched.y) < 2, 'cancel must not snap the pan')

  assert.deepEqual(errors, [])
  await context.close()
})

test('LOGYQ saved-map blank double-tap does not rename the root', async () => {
  const context = await newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  await stubMaps(context)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logyq/index.html`, { waitUntil: 'networkidle' })
  await waitForBoot(page)
  await page.evaluate(() => {
    window.LOGYQPreview.app.hasOpenMap = true
    document.body.classList.add('logyq-map-open')
    document.body.classList.remove('logyq-home')
    document.querySelectorAll('.logiq-backdrop.is-open').forEach((el) => el.classList.remove('is-open'))
    window.LOGYQBridge.core.editing.closeNodeEditor(false, false)
    window.LOGYQBridge.loadMap({
      name: 'Food',
      _uid: 'n1',
      children: [{ name: 'Fruit', _uid: 'n2' }],
    }, [])
  })
  await page.waitForFunction(() => ['Food', 'Fruit'].every((label) => {
    const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((el) => el.__data__?.data?.name === label)
    const rect = node?.getBoundingClientRect()
    return rect && rect.width > 20
  }))
  await page.waitForTimeout(400)

  async function face(name) {
    return page.evaluate((label) => {
      const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((el) => el.__data__?.data?.name === label)
      const box = node?.querySelector('rect:not(.grabzone)') || node
      const rect = box.getBoundingClientRect()
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, uid: node?.__data__?.data?._uid }
    }, name)
  }
  async function touch(type, x, y, pointerId) {
    await page.evaluate(({ type, x, y, pointerId }) => {
      const hit = document.elementFromPoint(x, y)
      const canvas = document.getElementById('canvas')
      const target = hit && canvas.contains(hit) ? hit : canvas
      target.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, composed: true, pointerType: 'touch', pointerId,
        isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y,
      }))
    }, { type, x, y, pointerId })
  }

  const fruit = await face('Fruit')
  const before = await page.locator('svg#canvas g.node').count()
  await touch('pointerdown', fruit.x, fruit.y, 11)
  await touch('pointerup', fruit.x, fruit.y + 74, 11)
  await page.waitForFunction((n) => document.querySelectorAll('svg#canvas g.node').length > n, before)
  await page.waitForFunction(() => !window.LOGYQBridge.core.state.layoutSettling)
  const blank = await page.evaluate(() => {
    const rootUid = window.LOGYQBridge.core.state.root.data._uid
    const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((el) => !(el.__data__?.data?.name || '').trim())
    const uid = node?.__data__?.data?._uid || null
    if (!uid) return { uid: null, rootUid }
    const svg = document.getElementById('canvas')
    const box = node.querySelector('rect:not(.grabzone)') || node
    const rect = box.getBoundingClientRect()
    const cy = rect.top + rect.height / 2
    const targetY = Math.min(window.innerHeight * 0.55, window.innerHeight - 180)
    if (cy < 80 || cy > window.innerHeight - 120) {
      const t = window.d3.zoomTransform(svg)
      const next = window.d3.zoomIdentity.translate(t.x, t.y + (targetY - cy)).scale(t.k)
      svg.__zoom = next
      const root = Array.from(svg.children).find((child) => child.tagName?.toLowerCase() === 'g')
      if (root) root.setAttribute('transform', next.toString())
    }
    const placed = box.getBoundingClientRect()
    return {
      x: placed.left + placed.width / 2,
      y: placed.top + placed.height / 2,
      uid,
      rootUid,
    }
  })
  assert.ok(blank.uid)
  assert.notEqual(blank.uid, blank.rootUid, 'a new blank must not reuse the root uid')
  const onBlank = await page.evaluate(({ x, y }) => {
    const hit = document.elementFromPoint(x, y)
    const host = hit?.closest?.('g.node')
    return host?.__data__?.data?._uid || null
  }, { x: blank.x, y: blank.y })
  assert.equal(onBlank, blank.uid, 'double-tap point must be the blank face')
  await touch('pointerdown', blank.x, blank.y, 21)
  await touch('pointerup', blank.x, blank.y, 21)
  await touch('pointerdown', blank.x, blank.y, 22)
  await touch('pointerup', blank.x, blank.y, 22)
  await page.waitForSelector('.node-edit-input')
  const bound = await page.evaluate(() => ({
    editing: window.LOGYQBridge.core.state.editingUid,
    stamp: document.querySelector('.node-edit-input')?.dataset?.editUid || null,
    value: document.querySelector('.node-edit-input')?.value ?? null,
  }))
  assert.equal(bound.editing, blank.uid)
  assert.equal(bound.stamp, blank.uid)
  assert.equal(bound.value, '')
  await page.locator('.node-edit-input').fill('Lime')
  await page.locator('.node-edit-input').press('Enter')
  await page.waitForFunction((uid) => {
    return window.LOGYQBridge.core.utils.findByUid(window.LOGYQBridge.core.state.root.data, uid)?.name === 'Lime'
  }, blank.uid)
  assert.equal(await page.evaluate(() => window.LOGYQBridge.core.state.root.data.name), 'Food')
  assert.equal(await page.evaluate(() => {
    const fruit = window.LOGYQBridge.core.state.root.descendants().find((node) => node.data._uid === 'n2')
    return fruit?.data?.name
  }), 'Fruit')
  assert.deepEqual(errors, [])
  await context.close()
})

test('LOGYQ double-tap renames only the card under the finger', async () => {
  const context = await newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  await stubMaps(context)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logyq/index.html`, { waitUntil: 'networkidle' })
  await waitForBoot(page)
  await page.evaluate(() => {
    window.LOGYQPreview.app.hasOpenMap = true
    document.body.classList.add('logyq-map-open')
    document.body.classList.remove('logyq-home')
    document.querySelectorAll('.logiq-backdrop.is-open').forEach((el) => el.classList.remove('is-open'))
    window.LOGYQBridge.core.editing.closeNodeEditor(false, false)
    window.LOGYQBridge.loadMap({
      name: 'Food',
      children: [{ name: 'Fruit' }, { name: 'Meat' }],
    }, [])
  })
  await page.waitForFunction(() => ['Food', 'Fruit', 'Meat'].every((label) => {
    const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((el) => el.__data__?.data?.name === label)
    const rect = node?.getBoundingClientRect()
    return rect && rect.width > 20
  }))
  await page.waitForFunction(() => {
    const t = window.d3.zoomTransform(document.getElementById('canvas'))
    const prev = window.__logyqCamSettle
    const now = performance.now()
    const still = !!(prev && Math.abs(prev.k - t.k) < 0.001 && Math.hypot(prev.x - t.x, prev.y - t.y) < 0.5)
    window.__logyqCamSettle = { x: t.x, y: t.y, k: t.k, since: still ? prev.since : now }
    return still && now - prev.since > 150
  })

  async function face(name) {
    return page.evaluate((label) => {
      const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((el) => el.__data__?.data?.name === label)
      const box = node?.querySelector('rect:not(.grabzone)') || node
      const rect = box.getBoundingClientRect()
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, uid: node?.__data__?.data?._uid }
    }, name)
  }

  async function touch(type, x, y, pointerId) {
    await page.evaluate(({ type, x, y, pointerId }) => {
      const hit = document.elementFromPoint(x, y)
      const canvas = document.getElementById('canvas')
      const target = hit && canvas.contains(hit) ? hit : canvas
      target.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerType: 'touch',
        pointerId,
        isPrimary: true,
        button: 0,
        buttons: type === 'pointerup' ? 0 : 1,
        clientX: x,
        clientY: y,
      }))
    }, { type, x, y, pointerId })
  }

  async function label(uid) {
    return page.evaluate((id) => {
      return window.LOGYQBridge.core.utils.findByUid(window.LOGYQBridge.core.state.root.data, id)?.name
    }, uid)
  }

  const fruit = await face('Fruit')
  const beforeFlick = await page.locator('svg#canvas g.node').count()
  await touch('pointerdown', fruit.x, fruit.y, 21)
  await touch('pointerup', fruit.x, fruit.y + 74, 21)
  await page.waitForFunction((n) => document.querySelectorAll('svg#canvas g.node').length > n, beforeFlick)
  const flicked = await page.evaluate((parentUid) => {
    const selected = window.LOGYQBridge.core.state.selectedUid
    const node = window.LOGYQBridge.core.state.root.descendants().find((item) => item.data._uid === selected)
    return {
      editors: document.querySelectorAll('.node-edit-input, .node-edit-stack').length,
      selected,
      parent: node?.parent?.data?._uid || null,
      name: node?.data?.name ?? null,
    }
  }, fruit.uid)
  assert.equal(flicked.editors, 0, 'flick-create must not open the rename bar')
  assert.equal(flicked.parent, fruit.uid)
  assert.equal(flicked.name, '')
  const food = await face('Food')
  const meatCard = await face('Meat')
  assert.equal(await label(food.uid), 'Food')
  assert.equal(await label(fruit.uid), 'Fruit')
  assert.equal(await label(meatCard.uid), 'Meat')

  async function doubleTap(label, pointerId) {
    const card = await face(label)
    await touch('pointerdown', card.x, card.y, pointerId)
    await touch('pointerup', card.x, card.y, pointerId)
    await touch('pointerdown', card.x, card.y, pointerId + 1)
    await touch('pointerup', card.x, card.y, pointerId + 1)
    await page.waitForSelector('.node-edit-input')
    assert.equal(await page.evaluate(() => document.querySelector('.node-edit-stack')?.classList.contains('is-placed') === true), false, 'bar waits for the keyboard')
    await page.waitForSelector('.node-edit-stack.is-placed', { timeout: 2000 })
    await page.waitForFunction(() => {
      const stack = document.querySelector('.node-edit-stack')
      const box = stack?.getBoundingClientRect()
      return stack?.dataset?.drawerSettled === '1' && box && Math.abs(window.innerHeight - box.bottom) < 2
    })
    return card
  }

  const opened = await doubleTap('Fruit', 31)
  const bound = await page.evaluate(() => {
    const input = document.querySelector('.node-edit-input')
    const stack = document.querySelector('.node-edit-stack')
    const box = stack.getBoundingClientRect()
    return {
      uid: window.LOGYQBridge.core.state.editingUid,
      stamp: input.dataset.editUid,
      value: input.value,
      left: box.left,
      right: box.right,
      bottom: box.bottom,
      inner: window.innerHeight,
    }
  })
  assert.equal(bound.uid, opened.uid)
  assert.equal(bound.stamp, opened.uid)
  assert.equal(bound.value, 'Fruit')
  assert.ok(bound.left <= 1 && bound.right >= 389, 'bar stays full width')
  assert.ok(Math.abs(bound.inner - bound.bottom) < 2, 'bar stays flush')
  const hop = await page.evaluate(() => {
    const stack = document.querySelector('.node-edit-stack')
    const before = stack.getBoundingClientRect().bottom
    let writes = 0
    const obs = new MutationObserver(() => { writes += 1 })
    obs.observe(stack, { attributes: true, attributeFilter: ['style'] })
    const vv = window.visualViewport
    vv?.dispatchEvent(new Event('resize'))
    vv?.dispatchEvent(new Event('scroll'))
    window.dispatchEvent(new Event('resize'))
    return new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        obs.disconnect()
        resolve({ before, after: stack.getBoundingClientRect().bottom, writes })
      }))
    })
  })
  assert.equal(hop.writes, 0, 'viewport events must not reposition the bar again')
  assert.ok(Math.abs(hop.after - hop.before) < 1, 'bar must not hop')
  await page.locator('.node-edit-input').fill('Berry')
  await page.locator('.node-edit-input').press('Enter')
  await page.waitForFunction((uid) => {
    return window.LOGYQBridge.core.utils.findByUid(window.LOGYQBridge.core.state.root.data, uid)?.name === 'Berry'
  }, opened.uid)
  assert.equal(await label(food.uid), 'Food')
  assert.equal(await label(fruit.uid), 'Berry')
  assert.equal(await label(meatCard.uid), 'Meat')
  assert.equal(await label(flicked.selected), '')

  const meat = await doubleTap('Meat', 41)
  await page.locator('.node-edit-input').fill('Steak')
  await page.locator('.node-edit-input').press('Enter')
  await page.waitForFunction((uid) => {
    return window.LOGYQBridge.core.utils.findByUid(window.LOGYQBridge.core.state.root.data, uid)?.name === 'Steak'
  }, meat.uid)
  assert.equal(await label(food.uid), 'Food')
  assert.equal(await label(fruit.uid), 'Berry')
  assert.equal(await label(meat.uid), 'Steak')
  assert.equal(await label(flicked.selected), '')

  const foodEdit = await doubleTap('Food', 51)
  assert.equal(await page.evaluate(() => document.querySelector('.node-edit-input').value), 'Food')
  await page.locator('.node-edit-input').fill('Nope')
  await page.evaluate(() => {
    const cancel = document.querySelector('.node-edit-cancel')
    const rect = cancel.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    const base = { bubbles: true, cancelable: true, composed: true, pointerType: 'touch', pointerId: 7, isPrimary: true, button: 0, clientX: x, clientY: y }
    cancel.dispatchEvent(new PointerEvent('pointerdown', { ...base, buttons: 1 }))
    cancel.dispatchEvent(new PointerEvent('pointerup', { ...base, buttons: 0 }))
  })
  await page.waitForFunction(() => !window.LOGYQBridge.core.state.editingUid)
  assert.equal(await page.evaluate((uid) => {
    return window.LOGYQBridge.core.utils.findByUid(window.LOGYQBridge.core.state.root.data, uid)?.name
  }, foodEdit.uid), 'Food')
  assert.equal(await label(fruit.uid), 'Berry')
  assert.equal(await label(meat.uid), 'Steak')

  const blankFace = await page.evaluate((uid) => {
    const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((el) => el.__data__?.data?._uid === uid)
    const box = node?.querySelector('rect:not(.grabzone)') || node
    const rect = box.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, uid }
  }, flicked.selected)
  await touch('pointerdown', blankFace.x, blankFace.y, 61)
  await touch('pointerup', blankFace.x, blankFace.y, 61)
  await touch('pointerdown', blankFace.x, blankFace.y, 62)
  await touch('pointerup', blankFace.x, blankFace.y, 62)
  await page.waitForSelector('.node-edit-input')
  assert.equal(await page.evaluate(() => window.LOGYQBridge.core.state.editingUid), flicked.selected)
  await page.locator('.node-edit-input').fill('Lime')
  await page.locator('.node-edit-input').press('Enter')
  await page.waitForFunction((uid) => {
    return window.LOGYQBridge.core.utils.findByUid(window.LOGYQBridge.core.state.root.data, uid)?.name === 'Lime'
  }, flicked.selected)
  assert.equal(await label(food.uid), 'Food')
  assert.equal(await label(fruit.uid), 'Berry')
  assert.equal(await label(meat.uid), 'Steak')
  assert.equal(await label(flicked.selected), 'Lime')

  assert.deepEqual(errors, [])
  await context.close()
})

test('LOGYQ kids-only parent tap steps delete to Word Bank then clears', async () => {
  const context = await newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  await stubMaps(context)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logyq/index.html`, { waitUntil: 'networkidle' })
  await waitForBoot(page)
  await page.evaluate(() => {
    window.LOGYQPreview.app.hasOpenMap = true
    document.body.classList.add('logyq-map-open')
    document.body.classList.remove('logyq-home')
    document.querySelectorAll('.logiq-backdrop.is-open').forEach((el) => el.classList.remove('is-open'))
    window.LOGYQBridge.core.editing.closeNodeEditor(false, false)
    window.LOGYQBridge.loadMap({
      name: 'Food',
      children: [
        { name: 'Fruit', children: [{ name: 'Apple' }, { name: 'Banana' }] },
        { name: 'Meat', children: [{ name: 'Chicken' }, { name: 'Beef' }] },
      ],
    }, [])
  })
  await page.waitForFunction(() => {
    return ['Food', 'Fruit', 'Meat', 'Apple'].every((label) => {
      const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((el) => el.__data__?.data?.name === label)
      const rect = node?.getBoundingClientRect()
      return rect && rect.width > 20 && rect.bottom < window.innerHeight
    })
  })

  async function face(name) {
    return page.evaluate((label) => {
      const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((el) => el.__data__?.data?.name === label)
      const box = node?.querySelector('rect:not(.grabzone)') || node
      const rect = box.getBoundingClientRect()
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    }, name)
  }

  async function touch(type, x, y, pointerId) {
    await page.evaluate(({ type, x, y, pointerId }) => {
      const hit = document.elementFromPoint(x, y)
      const target = hit && document.getElementById('canvas')?.contains(hit) ? hit : document.getElementById('canvas')
      target.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerType: 'touch',
        pointerId,
        isPrimary: true,
        button: 0,
        buttons: type === 'pointerup' ? 0 : 1,
        clientX: x,
        clientY: y,
      }))
    }, { type, x, y, pointerId })
  }

  async function thumb() {
    return page.evaluate(() => {
      const canvas = document.getElementById('canvas').getBoundingClientRect()
      const yStart = Math.floor(window.innerHeight * (2 / 3)) + 8
      for (let y = window.innerHeight - 6; y >= yStart; y -= 10) {
        for (let x = canvas.left + 6; x < canvas.right - 6; x += 12) {
          const hit = document.elementFromPoint(x, y)?.closest?.('g.node, g.hit-slot')
          if (!hit) return { x, y }
        }
      }
      return null
    })
  }

  async function castKids(dx, pointerId) {
    const park = await thumb()
    assert.ok(park, 'bottom third needs an empty thumb park')
    const card = await face('Food')
    await touch('pointerdown', park.x, park.y, pointerId)
    await touch('pointerdown', card.x, card.y, pointerId + 1)
    await touch('pointermove', card.x + dx, card.y + (dx ? 0 : 70), pointerId + 1)
    await touch('pointerup', card.x + dx, card.y + (dx ? 0 : 70), pointerId + 1)
    await touch('pointerup', park.x, park.y, pointerId)
    await page.waitForFunction(() => window.LOGYQPreview.gestures.smite.mercy?.marks?.size === 2)
  }

  async function tapFood(pointerId) {
    const card = await face('Food')
    await touch('pointerdown', card.x, card.y, pointerId)
    await touch('pointerup', card.x, card.y, pointerId)
    await page.waitForTimeout(40)
  }

  async function castState() {
    return page.evaluate(() => {
      const mercy = window.LOGYQPreview.gestures.smite.mercy
      const root = window.LOGYQBridge.core.state.root
      const nameOf = (uid) => root.descendants().find((node) => node.data._uid === uid)?.data?.name || null
      const wash = (label) => {
        const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((el) => el.__data__?.data?.name === label)
        return node?.querySelector('rect.logyq-smite-wash')?.getAttribute('stroke') || null
      }
      const clock = Array.from(document.querySelectorAll('svg#canvas g.node')).find((el) => el.querySelector('path.logyq-smite-clock'))
      return {
        mercy: !!mercy,
        marks: mercy ? [...mercy.marks.entries()].map(([uid, mark]) => [nameOf(uid), mark]).sort() : [],
        clock: clock?.__data__?.data?.name || null,
        Fruit: wash('Fruit'),
        Meat: wash('Meat'),
        Apple: wash('Apple'),
        editors: document.querySelectorAll('.node-edit-input').length,
      }
    })
  }

  await castKids(0, 21)
  let live = await castState()
  assert.deepEqual(live.marks, [['Fruit', 'red'], ['Meat', 'red']])
  assert.equal(live.clock, 'Food')
  assert.equal(live.Apple, null)
  await tapFood(23)
  live = await castState()
  assert.equal(live.mercy, true, 'Word Bank kids keep the cast')
  assert.deepEqual(live.marks, [['Fruit', 'amber'], ['Meat', 'amber']])
  assert.equal(live.clock, 'Food')
  assert.equal(live.Fruit, '#ffa100')
  assert.equal(live.Meat, '#ffa100')
  assert.equal(live.Apple, null)
  assert.equal(live.editors, 0)
  await page.screenshot({ path: '/opt/cursor/artifacts/screenshots/cast_kids_parent_bank.png' })
  await page.waitForTimeout(400)
  await tapFood(24)
  live = await castState()
  assert.equal(live.mercy, false, 'the next parent tap clears a Word Bank kids-only cast')
  assert.equal(live.clock, null)
  assert.equal(live.Fruit, null)
  assert.equal(live.Meat, null)
  assert.equal(live.editors, 0)

  await castKids(-70, 31)
  live = await castState()
  assert.deepEqual(live.marks, [['Fruit', 'amber'], ['Meat', 'amber']])
  assert.equal(live.clock, 'Food')
  await tapFood(33)
  live = await castState()
  assert.equal(live.mercy, false, 'a Word Bank kids-only cast clears on the first parent tap')
  assert.equal(live.clock, null)
  assert.equal(live.Fruit, null)
  assert.equal(live.Meat, null)

  assert.deepEqual(errors, [])
  await context.close()
})

test('LOGYQ Thekonym mode pairs a Roboto Condensed onym with a sans essence, and a right swipe opens the dossier', async () => {
  const calls = []
  const context = await newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await stubMaps(context)
  await context.route('https://jzaghifuhinkzzhiojre.supabase.co/**', async (route) => {
    const url = route.request().url()
    if (!url.includes('/rpc/lab_thekonym_')) return route.fallback()
    const name = url.split('/rpc/')[1].split('?')[0]
    calls.push(name)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(name === 'lab_thekonym_read'
        ? [{
          id: 'row-1',
          term: 'Zephyronym',
          term_pronunciation: 'ZEF-ee-oh-nim',
          essence: 'a test essence',
          kid_explanation: 'A kid line for the test.',
          definition: 'A short definition.',
          technical_definition: 'A longer technical definition kept on the dossier.',
          example: 'First example.\nSecond example.\nThird example.',
        }, {
          id: 'row-2',
          term: 'Quillonym',
          essence: 'not on the map',
        }]
        : { refused: true }),
    })
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logyq/index.html`, { waitUntil: 'networkidle' })
  await waitForBoot(page)
  assert.equal(await page.evaluate(() => document.body.classList.contains('logyq-thekonym')), false)
  assert.equal(await page.locator('#logyq-thekonym-ask').isVisible(), false)

  await page.evaluate(() => {
    document.body.classList.add('logyq-map-open')
    document.body.classList.remove('logyq-home')
    const library = document.getElementById('logiq-library')
    library?.classList.remove('is-open')
    library?.setAttribute('aria-hidden', 'true')
    window.LOGYQPreview.app.hasOpenMap = true
  })
  await page.locator('#logiq-mobile-menu-btn').click()
  await page.locator('#logyq-thekonym-mobile').click()
  await page.waitForFunction(() => window.LOGYQPreview.thekonym.face('Zephyronym')?.essence === 'a test essence')
  assert.equal(await page.locator('#logyq-thekonym-ask').isVisible(), true)
  await page.evaluate(() => document.getElementById('settingsBtn').click())
  assert.equal(await page.locator('#logyq-thekonym-toggle').isChecked(), true)
  await page.evaluate(() => document.getElementById('settingsClose').click())

  await page.evaluate(() => {
    window.LOGYQBridge.loadMap({ name: 'Zephyronym', children: [{ name: 'Other' }] }, [])
  })
  await page.waitForFunction(() => {
    const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((el) => el.__data__?.data?.name === 'Zephyronym')
    return node?.querySelector('tspan.logyq-essence')?.textContent === 'a test essence'
      && node.querySelector('tspan.logyq-onym')?.textContent === 'Zephyronym'
  })
  const heat = await page.evaluate(() => {
    const node = (name) => Array.from(document.querySelectorAll('svg#canvas g.node')).find((el) => el.__data__?.data?.name === name)
    const fill = (name) => {
      const wash = node(name)?.querySelector('rect.logyq-tk-heat')
      return wash ? getComputedStyle(wash).fill : ''
    }
    return {
      z: node('Zephyronym')?.dataset.tkHeat || '',
      other: node('Other')?.dataset.tkHeat || '',
      zFill: fill('Zephyronym'),
    }
  })
  assert.equal(heat.z, 'amber')
  assert.equal(heat.other, '')
  assert.match(heat.zFill, /214,\s*148,\s*42/)

  const faceType = await page.evaluate(() => {
    const onym = document.querySelector('tspan.logyq-onym')
    const essence = document.querySelector('tspan.logyq-essence')
    const onymCss = getComputedStyle(onym)
    const essenceCss = getComputedStyle(essence)
    const wash = getComputedStyle(document.body, '::before')
    const dossierOnym = getComputedStyle(document.querySelector('.logyq-tk-onym'))
    const dossierEssence = getComputedStyle(document.querySelector('.logyq-tk-essence'))
    return {
      onymFamily: onymCss.fontFamily,
      onymWeight: onymCss.fontWeight,
      onymStroke: onymCss.strokeWidth,
      essenceFamily: essenceCss.fontFamily,
      essenceWeight: essenceCss.fontWeight,
      essenceFill: essenceCss.fill,
      dossierOnym: dossierOnym.fontFamily,
      dossierOnymWeight: dossierOnym.fontWeight,
      dossierEssence: dossierEssence.fontFamily,
      dossierEssenceWeight: dossierEssence.fontWeight,
      typeLab: !!document.querySelector('#logyq-thekonym-type-lab, #logyq-thekonym-type-mobile, a[href*="thekonym-type"]'),
      animation: wash.animationName,
      background: wash.backgroundImage,
    }
  })
  assert.match(faceType.onymFamily, /Roboto Condensed/)
  assert.equal(faceType.onymWeight, '400')
  assert.ok(parseFloat(faceType.onymStroke) === 0, 'map onym stays regular, with no optical stroke')
  assert.match(faceType.essenceFamily, /Inter/)
  assert.equal(faceType.essenceWeight, '500')
  assert.match(faceType.essenceFill, /102,\s*112,\s*106|66706a/i)
  assert.match(faceType.dossierOnym, /Roboto Condensed/)
  assert.equal(faceType.dossierOnymWeight, '400')
  assert.match(faceType.dossierEssence, /Inter/)
  assert.equal(faceType.dossierEssenceWeight, '500')
  assert.equal(faceType.typeLab, false)
  assert.equal(faceType.animation, 'swirl')
  assert.doesNotMatch(faceType.background, /247,\s*245,\s*233|239,\s*230,\s*210|efe6d2/i)

  const uid = await page.evaluate(() => window.LOGYQBridge.core.state.root.data._uid)
  const nodeCount = () => page.evaluate(() => document.querySelectorAll('svg#canvas g.node').length)
  const beforeNodes = await nodeCount()
  await page.evaluate((id) => {
    const face = document.querySelector(`svg#canvas g.node[data-uid="${id}"] rect:not(.grabzone)`)
    const rect = face.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    for (const pointerId of [41, 42]) {
      for (const type of ['pointerdown', 'pointerup']) {
        face.dispatchEvent(new PointerEvent(type, {
          bubbles: true, cancelable: true, composed: true, pointerType: 'touch', pointerId,
          isPrimary: true, button: 0, buttons: type === 'pointerdown' ? 1 : 0,
          clientX: x, clientY: y,
        }))
      }
    }
  }, uid)
  await page.waitForSelector('.node-edit-input')
  assert.equal(await page.locator('#logyq-thekonym-card.is-open').count(), 0)
  await page.locator('.node-edit-cancel').click()
  await page.waitForFunction(() => !document.querySelector('.node-edit-input'))

  const stroke = (id, dx, pointerId) => page.evaluate(({ id, dx, pointerId }) => {
    const face = document.querySelector(`svg#canvas g.node[data-uid="${id}"] rect:not(.grabzone)`)
    const rect = face.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    const point = (type, px) => face.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, composed: true, pointerType: 'touch', pointerId,
      isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1,
      clientX: px, clientY: y,
    }))
    point('pointerdown', x)
    point('pointermove', x + dx / 2)
    point('pointermove', x + dx)
    point('pointerup', x + dx)
  }, { id, dx, pointerId })

  await stroke(uid, 0, 43)
  await page.waitForFunction((id) => document.querySelector(`svg#canvas g.node[data-uid="${id}"]`)?.dataset.smiteArm === '1', uid)
  await stroke(uid, 28, 44)
  assert.equal(await page.locator('#logyq-thekonym-card.is-open').count(), 0)
  assert.equal(await page.locator('.node-edit-input').count(), 0)
  assert.equal(await nodeCount(), beforeNodes)
  assert.equal(await page.evaluate((id) => document.querySelector(`svg#canvas g.node[data-uid="${id}"]`)?.dataset.smiteArm, uid), '1')
  await stroke(uid, 96, 45)
  await page.waitForSelector('#logyq-thekonym-card.is-open')
  const flipMotion = await page.evaluate(() => {
    const card = document.querySelector('#logyq-thekonym-card .logyq-tk-card')
    const anim = card.getAnimations().find((item) => item.effect?.target === card)
    const frames = anim.effect.getKeyframes().map((frame) => frame.transform || '')
    anim.pause()
    anim.currentTime = 0
    const edge = card.getBoundingClientRect()
    anim.currentTime = Math.max(0, (anim.effect.getTiming().duration || 400) - 1)
    const face = card.getBoundingClientRect()
    anim.play()
    return {
      flip: document.getElementById('logyq-thekonym-card')?.dataset.flip || '',
      fly: document.querySelectorAll('.logyq-tk-fly').length,
      layoutWide: card.offsetWidth > window.innerWidth * 0.8,
      layoutTall: card.offsetHeight > window.innerHeight * 0.8,
      frames,
      edgeW: edge.width,
      faceW: face.width,
    }
  })
  assert.equal(flipMotion.flip, 'open')
  assert.equal(flipMotion.fly, 0)
  assert.equal(flipMotion.layoutWide, true)
  assert.equal(flipMotion.layoutTall, true)
  assert.ok(flipMotion.frames.length >= 2, 'the dossier has a flip')
  assert.ok(flipMotion.frames.every((value) => value.includes('rotateY') && !value.includes('scale')), flipMotion.frames.join(' | '))
  assert.ok(flipMotion.edgeW < flipMotion.faceW * 0.5, 'the flip starts edge-on')
  assert.equal(await page.locator('.node-edit-input').count(), 0)
  assert.equal(await nodeCount(), beforeNodes)
  assert.equal(await page.evaluate(() => window.LOGYQPreview.gestures.smite.mercy), null)
  const dossier = await page.evaluate(() => {
    const card = document.getElementById('logyq-thekonym-card')
    return {
      word: card.querySelector('.logyq-tk-onym')?.textContent,
      pron: card.querySelector('.logyq-tk-pron')?.textContent,
      essence: card.querySelector('.logyq-tk-essence')?.textContent,
      kids: card.querySelector('[data-block="kids"] p')?.textContent,
      definition: card.querySelector('[data-block="definition"] p')?.textContent,
      technical: card.querySelector('[data-block="technical"] p')?.textContent,
      examples: [...card.querySelectorAll('.logyq-tk-examples li')].filter((item) => !item.hidden).map((item) => item.textContent),
      bank: card.querySelectorAll('.logyq-tk-bank, .logyq-tk-add').length,
      addText: /Add to Word Bank/.test(card.innerText),
    }
  })
  assert.equal(dossier.word, 'Zephyronym')
  assert.equal(dossier.pron, 'ZEF • ee • oh • nim')
  assert.equal(dossier.essence, 'a test essence')
  assert.equal(dossier.kids, 'A kid line for the test.')
  assert.equal(dossier.definition, 'A short definition.')
  assert.equal(dossier.technical, 'A longer technical definition kept on the dossier.')
  assert.deepEqual(dossier.examples, ['First example.', 'Second example.', 'Third example.'])
  assert.equal(dossier.bank, 0)
  assert.equal(dossier.addText, false)
  await page.waitForFunction(() => document.getElementById('logyq-thekonym-card')?.dataset.flip === 'settled')
  const frost = await page.evaluate(() => {
    const layer = document.getElementById('logyq-tk-frost')
    const css = getComputedStyle(layer)
    const card = getComputedStyle(document.querySelector('.logyq-tk-card'))
    return { blur: css.backdropFilter, opacity: Number(css.opacity), cardBlur: card.backdropFilter }
  })
  assert.match(frost.blur, /blur\(1[0-6]px/)
  assert.ok(frost.opacity > 0.9, 'the frost is up while the dossier is open')
  assert.equal(frost.cardBlur, 'none')
  const dossierSwipe = (dx) => page.evaluate((delta) => {
    const card = document.querySelector('.logyq-tk-card')
    const rect = card.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    const point = (type, px) => card.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, composed: true, pointerType: 'touch', pointerId: 7,
      isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1,
      clientX: px, clientY: y,
    }))
    point('pointerdown', x)
    point('pointermove', x + delta / 2)
    point('pointermove', x + delta)
    point('pointerup', x + delta)
  }, dx)
  await dossierSwipe(-28)
  assert.equal(await page.locator('#logyq-thekonym-card.is-open').count(), 1)
  await page.evaluate(() => {
    const card = document.querySelector('.logyq-tk-card')
    const rect = card.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    const fire = (type, px) => {
      const touch = new Touch({ identifier: 4, target: card, clientX: px, clientY: y })
      card.dispatchEvent(new TouchEvent(type, {
        bubbles: true, cancelable: true,
        touches: type === 'touchend' ? [] : [touch],
        targetTouches: type === 'touchend' ? [] : [touch],
        changedTouches: [touch],
      }))
    }
    fire('touchstart', x)
    fire('touchmove', x - 48)
    fire('touchmove', x - 110)
    fire('touchend', x - 110)
  })
  const closeMotion = await page.evaluate(() => {
    const card = document.querySelector('#logyq-thekonym-card .logyq-tk-card')
    const anim = card.getAnimations().find((item) => item.effect?.target === card)
    const frames = anim.effect.getKeyframes().map((frame) => frame.transform || '')
    const duration = anim.effect.getTiming().duration || 400
    anim.pause()
    const widths = []
    for (let time = 0; time <= duration; time += 40) {
      anim.currentTime = time
      widths.push(Math.round(card.getBoundingClientRect().width))
    }
    let flat = 0
    let maxFlat = 0
    for (let index = 1; index < widths.length - 2; index += 1) {
      if (Math.abs(widths[index] - widths[index - 1]) < 6) {
        flat += 1
        maxFlat = Math.max(maxFlat, flat)
      } else flat = 0
    }
    return {
      flip: document.getElementById('logyq-thekonym-card')?.dataset.flip || '',
      frames,
      faceW: widths[0],
      edgeW: widths[widths.length - 1],
      tall: card.offsetHeight > window.innerHeight * 0.8,
      maxFlat,
      widths,
    }
  })
  assert.equal(closeMotion.flip, 'close')
  assert.equal(closeMotion.tall, true)
  assert.ok(closeMotion.frames.length === 2, closeMotion.frames.join(' | '))
  assert.ok(closeMotion.frames.every((value) => value.includes('rotateY') && !value.includes('scale')), closeMotion.frames.join(' | '))
  assert.ok(closeMotion.edgeW < closeMotion.faceW * 0.5, 'the reverse flip ends edge-on')
  assert.ok(closeMotion.maxFlat < 3, `reverse flip paused: ${closeMotion.widths.join(',')}`)
  await page.waitForFunction(() => !document.getElementById('logyq-thekonym-card').classList.contains('is-open'))
  await page.evaluate((id) => window.LOGYQPreview.thekonym.openUid(id, { flip: true }), uid)
  await page.waitForFunction(() => document.getElementById('logyq-thekonym-card')?.dataset.flip === 'settled')
  await page.evaluate(() => {
    const card = document.querySelector('.logyq-tk-card')
    const rect = card.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    const point = (type, px) => card.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, composed: true, pointerType: 'touch', pointerId: 8,
      isPrimary: true, button: 0, buttons: type === 'pointercancel' ? 0 : 1,
      clientX: px, clientY: y,
    }))
    point('pointerdown', x)
    point('pointermove', x - 48)
    point('pointermove', x - 110)
    point('pointercancel', x - 110)
  })
  assert.equal(await page.evaluate(() => document.getElementById('logyq-thekonym-card')?.dataset.flip), 'close')
  await page.waitForFunction(() => !document.getElementById('logyq-thekonym-card').classList.contains('is-open'))
  await page.evaluate((id) => window.LOGYQPreview.thekonym.openUid(id, { flip: true }), uid)
  await page.waitForFunction(() => document.getElementById('logyq-thekonym-card')?.dataset.flip === 'settled')
  await page.locator('#logyq-thekonym-card .logyq-tk-x').click()
  assert.equal(await page.evaluate(() => document.getElementById('logyq-thekonym-card')?.dataset.flip), 'close')
  await page.waitForFunction(() => !document.getElementById('logyq-thekonym-card').classList.contains('is-open'))

  const other = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('svg#canvas g.node')).find((el) => el.__data__?.data?.name === 'Other').dataset.uid
  })
  await page.evaluate((id) => window.LOGYQPreview.thekonym.openUid(id), other)
  await page.waitForSelector('#logyq-thekonym-card.is-open')
  assert.match(await page.locator('#logyq-thekonym-card .logyq-tk-empty').innerText(), /not in Thekonyms yet/)
  await page.locator('#logyq-thekonym-card .logyq-tk-x').click()

  await page.locator('#logyq-thekonym-ask').click()
  await page.locator('#logyq-thekonym-letters [data-letter="Z"]').click()
  await page.waitForSelector('.logyq-tk-row')
  assert.match(await page.locator('.logyq-tk-row').innerText(), /Zephyronym/)
  assert.match(await page.locator('.logyq-tk-row').innerText(), /a test essence/)
  assert.equal(await page.locator('.logyq-tk-add').count(), 0)
  await page.locator('#logyq-thekonym-letters [data-letter="Q"]').click()
  await page.waitForSelector('.logyq-tk-add')
  assert.match(await page.locator('.logyq-tk-row').innerText(), /Quillonym/)
  await page.locator('.logyq-tk-add').click()
  await page.waitForFunction(() => window.LOGYQBridge.core.state.wordBank.includes('Quillonym'))
  assert.equal(await page.locator('#Dock .chip', { hasText: 'Quillonym' }).count(), 1)
  assert.equal(await page.locator('.logyq-tk-add').count(), 0)
  await page.locator('#logyq-thekonym-browser-close').click()
  await page.evaluate((id) => window.LOGYQPreview.thekonym.openUid(id), uid)
  await page.waitForSelector('#logyq-thekonym-card.is-open .logyq-tk-essence')
  await page.evaluate(() => {
    const field = document.querySelector('#logyq-thekonym-card .logyq-tk-essence')
    for (let i = 0; i < 2; i += 1) {
      field.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch' }))
    }
  })
  await page.locator('#logyq-thekonym-card .logyq-tk-input').fill('local essence')
  await page.locator('#logyq-thekonym-card .logyq-tk-input').press('Enter')
  await page.waitForFunction(() => {
    const edits = JSON.parse(sessionStorage.getItem('logyq_thekonym_local_edits_v1') || '{}')
    const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((el) => el.__data__?.data?.name === 'Zephyronym')
    return edits['row-1']?.essence === 'local essence' && node?.querySelector('tspan.logyq-essence')?.textContent === 'local essence'
  })
  await page.locator('#logyq-thekonym-card .logyq-tk-x').click()
  await page.locator('#logiq-mobile-menu-btn').click()
  await page.locator('#logyq-thekonym-mobile').click()
  await page.waitForFunction(() => {
    const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((el) => el.__data__?.data?.name === 'Zephyronym')
    return node && !node.querySelector('tspan.logyq-essence') && !document.body.classList.contains('logyq-thekonym')
  })
  const plain = await page.evaluate(() => {
    const label = Array.from(document.querySelectorAll('svg#canvas g.node text.label')).find((el) => el.textContent === 'Zephyronym')
    const wash = getComputedStyle(document.body, '::before')
    return { weight: label ? getComputedStyle(label).fontWeight : '', animation: wash.animationName }
  })
  assert.equal(plain.weight, '600')
  assert.equal(plain.animation, 'swirl')
  await page.evaluate((id) => {
    const face = document.querySelector(`svg#canvas g.node[data-uid="${id}"] rect:not(.grabzone)`)
    const rect = face.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    for (const pointerId of [51, 52]) {
      for (const type of ['pointerdown', 'pointerup']) {
        face.dispatchEvent(new PointerEvent(type, {
          bubbles: true, cancelable: true, composed: true, pointerType: 'touch', pointerId,
          isPrimary: true, button: 0, buttons: type === 'pointerdown' ? 1 : 0,
          clientX: x, clientY: y,
        }))
      }
    }
  }, uid)
  await page.waitForSelector('.node-edit-input')
  assert.equal(await page.locator('#logyq-thekonym-card.is-open').count(), 0)
  assert.deepEqual(calls.filter((name) => name !== 'lab_thekonym_read'), [])
  assert.ok(calls.includes('lab_thekonym_read'))
  assert.deepEqual(errors, [])
  await context.close()
})

test('LOGYQ phone shelf pans in place, and warehouse or trash only take a dragged chip', async () => {
  const context = await newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await stubMaps(context)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logyq/index.html`, { waitUntil: 'networkidle' })
  await waitForBoot(page)
  const many = ['Pop', 'Stay', 'Keep', 'Alpha', 'Bravo', 'Cedar', 'Delta', 'Echo', 'Foxtrot']
  await page.evaluate((words) => {
    localStorage.removeItem('logyq_word_warehouse_v1')
    window.LOGYQPreview.app.hasOpenMap = true
    document.body.classList.add('logyq-map-open')
    document.body.classList.remove('logyq-home')
    document.querySelectorAll('.logiq-backdrop.is-open').forEach((el) => el.classList.remove('is-open'))
    window.LOGYQBridge.loadMap({ name: 'Root', children: [{ name: 'A' }] }, words)
  }, many)
  await page.waitForFunction(() => document.querySelectorAll('#Dock .chip').length === 9)

  const portrait = await page.evaluate(() => {
    const shelf = document.getElementById('Dock').getBoundingClientRect()
    const house = document.getElementById('logyq-warehouse').getBoundingClientRect()
    const trash = document.getElementById('logyq-bank-trash')
    const dock = document.getElementById('Dock')
    return {
      shelfTop: shelf.top,
      shelfBottom: shelf.bottom,
      shelfLeft: shelf.left,
      shelfWidth: shelf.width,
      radius: getComputedStyle(dock).borderRadius,
      house: { left: house.left, right: house.right, top: house.top, bottom: house.bottom, w: house.width },
      trashDisplay: getComputedStyle(trash).display,
      iconsInRow: !!dock.querySelector('#logyq-warehouse, #logyq-bank-trash'),
      wrap: getComputedStyle(dock).flexWrap,
      overflowX: getComputedStyle(document.getElementById('logyq-bank-chips')).overflowX,
      dockOverflow: getComputedStyle(dock).overflowX,
      houseDisplay: getComputedStyle(document.getElementById('logyq-warehouse')).display,
    }
  })
  assert.equal(portrait.iconsInRow, false)
  assert.equal(portrait.wrap, 'nowrap')
  assert.equal(portrait.overflowX, 'auto')
  assert.equal(portrait.dockOverflow, 'hidden', 'the Word Bank bar itself does not scroll the All control')
  assert.equal(portrait.houseDisplay, 'none', 'warehouse stays hidden until something is stored')
  assert.equal(portrait.trashDisplay, 'none', 'trash stays hidden until a drag')
  assert.ok(portrait.shelfLeft < 2, `shelf is flush left, left=${portrait.shelfLeft}`)
  assert.ok(portrait.shelfBottom > 840, `shelf sits flush on the bottom, bottom=${portrait.shelfBottom}`)
  assert.ok(portrait.shelfWidth > 380, `portrait shelf is full-bleed, width=${portrait.shelfWidth}`)
  assert.equal(portrait.radius, '0px')
  assert.equal(portrait.house.w, 0, 'an empty warehouse has no corner button')

  const swipeChip = (label, dx, dy) => page.evaluate(({ label, dx, dy }) => {
    const chip = Array.from(document.querySelectorAll('#Dock .chip')).find((el) => el.textContent.trim() === label)
    if (!chip) throw new Error(`missing chip ${label}`)
    const rect = chip.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    const point = (type, buttons, ox, oy, target) => (target || chip).dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, composed: true, pointerId: 9, pointerType: 'touch',
      isPrimary: true, button: 0, buttons, clientX: x + ox, clientY: y + oy,
    }))
    point('pointerdown', 1, 0, 0)
    point('pointermove', 1, Math.sign(dx) * 8, Math.sign(dy || 1) * 12, window)
    point('pointermove', 1, dx, dy, window)
    window.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true, cancelable: true, composed: true, pointerId: 9, pointerType: 'touch',
      isPrimary: true, button: 0, buttons: 0, clientX: x + dx, clientY: y + dy,
    }))
  }, { label, dx, dy })

  const tapChip = (label) => page.evaluate((label) => {
    const chip = Array.from(document.querySelectorAll('#Dock .chip')).find((el) => el.textContent.trim() === label)
    const rect = chip.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    for (const type of ['pointerdown', 'pointerup']) {
      chip.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, composed: true, pointerId: 8, pointerType: 'touch',
        isPrimary: true, button: 0, buttons: type === 'pointerdown' ? 1 : 0, clientX: x, clientY: y,
      }))
    }
  }, label)

  await swipeChip('Pop', 0, 18)
  await swipeChip('Pop', 0, 64)
  assert.equal(await page.evaluate(() => window.LOGYQBridge.core.state.wordBank.includes('Pop')), true)
  assert.equal(await page.locator('#Dock .chip', { hasText: 'Pop' }).count(), 1)
  assert.equal(await page.evaluate(() => document.body.classList.contains('logyq-chip-drag')), false)

  const panned = await page.evaluate(() => {
    const dock = document.getElementById('Dock')
    const strip = document.getElementById('logyq-bank-chips')
    const all = document.getElementById('logyq-bank-all')
    const chip = Array.from(strip.querySelectorAll('.chip')).find((el) => el.textContent.trim() === 'Pop')
    const rect = chip.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    const before = strip.scrollLeft
    const allBefore = all.getBoundingClientRect()
    const dockBox = dock.getBoundingClientRect()
    const move = (type, cx, buttons) => window.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, composed: true, pointerId: 11, pointerType: 'touch',
      isPrimary: true, button: 0, buttons, clientX: cx, clientY: y,
    }))
    chip.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, cancelable: true, composed: true, pointerId: 11, pointerType: 'touch',
      isPrimary: true, button: 0, buttons: 1, clientX: x, clientY: y,
    }))
    move('pointermove', x - 30, 1)
    move('pointermove', x - 120, 1)
    move('pointerup', x - 120, 0)
    const allAfter = all.getBoundingClientRect()
    return {
      before,
      after: strip.scrollLeft,
      dragging: document.body.classList.contains('logyq-chip-drag'),
      still: window.LOGYQBridge.core.state.wordBank.includes('Pop'),
      allShift: Math.abs(allAfter.right - allBefore.right),
      allRight: allAfter.right,
      dockRight: dockBox.right,
      allInStrip: strip.contains(all),
    }
  })
  assert.ok(panned.after > panned.before + 40, `horizontal pan should scroll the shelf, before=${panned.before} after=${panned.after}`)
  assert.equal(panned.allInStrip, false, 'All sits outside the chip scroller')
  assert.ok(panned.allShift < 2, `All stays pinned while chips scroll, shift=${panned.allShift}`)
  assert.ok(panned.dockRight - panned.allRight < 16, `All stays on the right of the Word Bank bar, gap=${panned.dockRight - panned.allRight}`)
  assert.equal(panned.dragging, false)
  assert.equal(panned.still, true)

  const trashWhileDragging = await page.evaluate(() => {
    const chip = Array.from(document.querySelectorAll('#Dock .chip')).find((el) => el.textContent.trim() === 'Cedar')
    const rect = chip.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    const fire = (type, cx, cy, buttons, node) => node.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, composed: true, pointerId: 21, pointerType: 'touch',
      isPrimary: true, button: 0, buttons, clientX: cx, clientY: cy,
    }))
    fire('pointerdown', x, y, 1, chip)
    fire('pointermove', x, y - 36, 1, window)
    const trash = document.getElementById('logyq-bank-trash')
    const shelf = document.getElementById('Dock').getBoundingClientRect()
    const box = trash.getBoundingClientRect()
    const during = {
      display: getComputedStyle(trash).display,
      bottom: box.bottom,
      right: box.right,
      shelfTop: shelf.top,
    }
    fire('pointercancel', x, y - 36, 0, window)
    return {
      during,
      after: getComputedStyle(trash).display,
      still: window.LOGYQBridge.core.state.wordBank.includes('Cedar'),
    }
  })
  assert.equal(trashWhileDragging.during.display, 'flex', 'trash appears while a shelf chip is dragged')
  assert.ok(trashWhileDragging.during.bottom <= trashWhileDragging.during.shelfTop + 4, 'trash sits just above the shelf')
  assert.ok(trashWhileDragging.during.right > 360, 'trash is the bottom-right corner')
  assert.equal(trashWhileDragging.after, 'none', 'trash hides when the drag is cancelled')
  assert.equal(trashWhileDragging.still, true)

  const dropOn = async (label, targetId) => {
    await page.evaluate(({ label, targetId }) => {
      const chip = Array.from(document.querySelectorAll('#Dock .chip')).find((el) => el.textContent.trim() === label)
      const target = document.getElementById(targetId)
      const from = chip.getBoundingClientRect()
      const x = from.left + from.width / 2
      const y = from.top + from.height / 2
      const fire = (type, cx, cy, buttons, node) => node.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, composed: true, pointerId: 12, pointerType: 'touch',
        isPrimary: true, button: 0, buttons, clientX: cx, clientY: cy,
      }))
      fire('pointerdown', x, y, 1, chip)
      fire('pointermove', x, y - 28, 1, window)
      const live = target.getBoundingClientRect()
      const tx = live.width > 1 ? live.left + live.width / 2 : x
      const ty = live.height > 1 ? live.top + live.height / 2 : y - 80
      fire('pointermove', tx, ty, 1, window)
      fire('pointerup', tx, ty, 0, window)
    }, { label, targetId })
  }

  await dropOn('Pop', 'logyq-warehouse')
  await page.waitForFunction(() => !Array.from(document.querySelectorAll('#Dock .chip')).some((el) => el.textContent.trim() === 'Pop'))
  const housed = await page.evaluate(() => {
    const el = document.getElementById('logyq-warehouse')
    const box = el.getBoundingClientRect()
    const shelf = document.getElementById('Dock').getBoundingClientRect()
    return { display: getComputedStyle(el).display, bottom: box.bottom, left: box.left, w: box.width, shelfTop: shelf.top }
  })
  assert.notEqual(housed.display, 'none', 'warehouse shows once a word is stored')
  assert.ok(housed.bottom <= housed.shelfTop + 4, 'warehouse sits just above the shelf')
  assert.ok(housed.left < 24, 'warehouse is the bottom-left corner')
  assert.ok(housed.w <= 48 && housed.w >= 36)
  assert.equal(await page.evaluate(() => window.LOGYQBridge.core.state.wordBank.includes('Pop')), true)
  assert.equal(await page.evaluate(() => window.LOGYQBridge.core.state.root.data.children.some((child) => child.name === 'Pop')), false)

  await page.waitForFunction(() => !window.__logyqChipPlacing)
  await page.locator('#logyq-warehouse').click()
  await page.waitForSelector('#logyq-warehouse-sheet.is-open')
  const popped = page.locator('#logyq-warehouse-list button[data-word="Pop"]')
  assert.equal(await popped.getAttribute('aria-pressed'), 'false')
  const stayed = page.locator('#logyq-warehouse-list button[data-word="Stay"]')
  assert.equal(await stayed.getAttribute('aria-pressed'), 'true')
  await stayed.click()
  assert.equal(await stayed.getAttribute('aria-pressed'), 'false')
  await popped.click()
  assert.equal(await popped.getAttribute('aria-pressed'), 'true')
  await page.locator('#logyq-warehouse-close').click()
  await page.waitForFunction(() => !document.getElementById('logyq-warehouse-sheet')?.classList.contains('is-open'))
  await page.waitForFunction(() => {
    const names = Array.from(document.querySelectorAll('#Dock .chip')).map((el) => el.textContent.trim())
    return names.includes('Pop') && !names.includes('Stay')
  })
  assert.equal(await page.evaluate(() => window.LOGYQBridge.core.state.wordBank.includes('Stay')), true)

  await tapChip('Keep')
  await tapChip('Alpha')
  assert.deepEqual(await page.locator('#Dock .chip.is-outlined').allTextContents(), ['Keep', 'Alpha'])
  await dropOn('Keep', 'logyq-bank-trash')
  await page.waitForFunction(() => !window.LOGYQBridge.core.state.wordBank.includes('Keep') && !window.LOGYQBridge.core.state.wordBank.includes('Alpha'))
  assert.equal(await page.evaluate(() => window.LOGYQBridge.snapshot().tree.children.map((child) => child.name).join(',')), 'A')

  await page.evaluate(() => window.LOGYQBridge.undo())
  await page.waitForFunction(() => window.LOGYQBridge.core.state.wordBank.includes('Keep') && window.LOGYQBridge.core.state.wordBank.includes('Alpha'))

  const mapDelete = await page.evaluate(() => {
    document.body.classList.add('v2-branch-drag')
    const trash = document.getElementById('logyq-bank-trash').getBoundingClientRect()
    const node = window.LOGYQBridge.core.state.root.children.find((child) => child.data.name === 'A')
    const zone = window.LOGYQBridge.core.drag.zone(trash.left + trash.width / 2, trash.top + trash.height / 2)
    // A real map drop sets this before mouseup so the hold freeze lets the delete through.
    window.__logyqHoldDragCommit = true
    try {
      window.LOGYQBridge.core.drag.end({
        sourceEvent: { clientX: trash.left + trash.width / 2, clientY: trash.top + trash.height / 2 },
      }, node)
    } finally {
      window.__logyqHoldDragCommit = false
      document.body.classList.remove('v2-branch-drag')
    }
    return {
      zone,
      trash: { w: trash.width, h: trash.height },
      names: (window.LOGYQBridge.snapshot().tree.children || []).map((child) => child.name),
      trashHidden: getComputedStyle(document.getElementById('logyq-bank-trash')).display,
    }
  })
  assert.equal(mapDelete.zone, 'over', `map drag should hit the corner trash, box=${JSON.stringify(mapDelete.trash)}`)
  assert.deepEqual(mapDelete.names, [], 'dropping a map card on the corner trash deletes it')
  assert.equal(mapDelete.trashHidden, 'none')

  const emptyRule = await page.evaluate(() => {
    localStorage.removeItem('logyq_word_warehouse_v1')
    window.LOGYQBridge.loadMap({ name: 'Root', children: [{ name: 'A' }] }, [])
    const house = document.getElementById('logyq-warehouse')
    const empty = getComputedStyle(house).display === 'none' && house.classList.contains('is-bank-empty')
    window.LOGYQBridge.core.wordDock.addWords('Stored', 'bank')
    return {
      empty,
      shelfOnly: getComputedStyle(house).display === 'none' && house.classList.contains('is-bank-empty'),
    }
  })
  assert.equal(emptyRule.empty, true, 'warehouse hides when nothing is stored')
  assert.equal(emptyRule.shelfOnly, true, 'words on the shelf do not open the warehouse')
  await page.waitForFunction(() => !window.__logyqChipPlacing)
  const storedSheet = await page.evaluate(() => {
    document.getElementById('logyq-warehouse').click()
    const list = document.getElementById('logyq-warehouse-list')
    const button = list.querySelector('button[data-word="Stored"]')
    const box = button?.getBoundingClientRect()
    return {
      open: document.getElementById('logyq-warehouse-sheet').classList.contains('is-open'),
      words: Array.from(list.querySelectorAll('button')).map((el) => el.dataset.word),
      box: box ? { w: box.width, h: box.height, top: box.top } : null,
    }
  })
  assert.equal(storedSheet.open, true, `warehouse sheet did not list Stored: ${JSON.stringify(storedSheet)}`)
  assert.deepEqual(storedSheet.words, ['Stored'])
  assert.ok(storedSheet.box && storedSheet.box.h > 8, `stored chip should be visible ${JSON.stringify(storedSheet.box)}`)
  await page.locator('#logyq-warehouse-list button[data-word="Stored"]').click()
  await page.locator('#logyq-warehouse-close').click()
  const warehousedOnly = await page.evaluate(() => ({
    onShelf: Array.from(document.querySelectorAll('#Dock .chip')).some((el) => el.textContent.trim() === 'Stored'),
    inBank: window.LOGYQBridge.core.state.wordBank.includes('Stored'),
    house: getComputedStyle(document.getElementById('logyq-warehouse')).display,
  }))
  assert.equal(warehousedOnly.onShelf, false)
  assert.equal(warehousedOnly.inBank, true)
  assert.notEqual(warehousedOnly.house, 'none', 'warehouse stays when every word is stored off the shelf')

  await page.evaluate(() => {
    localStorage.removeItem('logyq_word_warehouse_v1')
    const words = Array.from({ length: 160 }, (_, index) => `N${index + 1}`)
    window.LOGYQBridge.loadMap({ name: 'Root', children: [{ name: 'A' }] }, words)
    const id = window.LOGYQPreview?.app?.current?.id || '_draft'
    localStorage.setItem('logyq_word_warehouse_v1', JSON.stringify({ [id]: ['N1'] }))
    window.LOGYQBridge.core.wordDock.render()
  })
  await page.locator('#logyq-warehouse').click()
  await page.waitForSelector('#logyq-warehouse-sheet.is-open')
  const grid = await page.evaluate(() => {
    const list = document.getElementById('logyq-warehouse-list')
    const chips = list.querySelectorAll('button.chip')
    const sample = list.querySelector('button.chip.is-on')
    list.scrollTop = list.scrollHeight
    const last = list.querySelector('button.chip:last-of-type')
    const listBox = list.getBoundingClientRect()
    const chipBox = last.getBoundingClientRect()
    return {
      count: chips.length,
      wrap: getComputedStyle(list).flexWrap,
      green: sample ? getComputedStyle(sample).backgroundColor : '',
      overflow: list.scrollHeight > list.clientHeight + 8,
      lastBottom: chipBox.bottom,
      listBottom: listBox.bottom,
      lastTop: chipBox.top,
      listTop: listBox.top,
    }
  })
  assert.equal(grid.count, 160)
  assert.equal(grid.wrap, 'wrap')
  assert.equal(grid.green, 'rgb(220, 252, 231)')
  assert.equal(grid.overflow, true, 'warehouse grid scrolls when the chips overflow')
  assert.ok(grid.lastTop >= grid.listTop - 1, `last chip top ${grid.lastTop} should stay inside ${grid.listTop}`)
  assert.ok(grid.lastBottom <= grid.listBottom + 1, `last chip bottom ${grid.lastBottom} should stay inside ${grid.listBottom}`)
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
