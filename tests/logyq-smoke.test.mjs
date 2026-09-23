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
  for (const step of [12, 24, 36, 48, 64, 88]) {
    await page.waitForTimeout(60)
    await touch('pointermove', panCard.x + step, panCard.y + Math.round(step * 0.6), 81)
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
  assert.ok(Math.hypot(panDuring.x - panOrigin.x, panDuring.y - panOrigin.y) > 40, `map should follow an early card slide, before=${panOrigin.x},${panOrigin.y} during=${panDuring.x},${panDuring.y}`)
  await touch('pointerup', panCard.x + 88, panCard.y + 54, 81)
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
  assert.ok(still.width > 8 && still.height > 8, `origin ghost box collapsed: ${still.width}x${still.height}`)
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
      const rect = node.getBoundingClientRect()
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    }, name)
  }

  async function touch(type, x, y, pointerId = 51) {
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

  async function zoomNow() {
    return page.evaluate(() => {
      const t = window.d3.zoomTransform(document.getElementById('canvas'))
      return { x: t.x, y: t.y, k: t.k }
    })
  }

  const beforeTap = await zoomNow()
  const idle = await nodeCenter('Node 07')
  await touch('pointerdown', idle.x, idle.y, 51)
  await touch('pointerup', idle.x, idle.y, 51)
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
  await touch('pointerdown', paintCard.x, paintCard.y, 52)
  await touch('pointerup', paintCard.x, paintCard.y, 52)
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
  await touch('pointerdown', branch.x, branch.y, 53)
  await touch('pointerup', branch.x, branch.y + 70, 53)
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
  await touch('pointerdown', side.x, side.y, 54)
  await touch('pointerup', side.x + 80, side.y, 54)
  await page.waitForFunction((count) => document.querySelectorAll('g.node').length > count, beforeCreate)

  await page.locator('#logyq-paint-btn').click()
  await page.waitForSelector('#logyq-paint-strip.is-open')
  await page.locator('#logyq-paint-strip [data-paint="off"]').click()
  await page.waitForFunction(() => window.LOGYQPreview.paint?.active === false)
  const beforeDownCreate = await page.locator('svg#canvas g.node').count()
  const createDown = await nodeCenter('Node 10')
  await touch('pointerdown', createDown.x, createDown.y, 55)
  await touch('pointerup', createDown.x, createDown.y + 70, 55)
  await page.waitForFunction((count) => document.querySelectorAll('g.node').length > count, beforeDownCreate)

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
  assert.match((await page.locator('#logiq-map-list').innerText()), /No maps yet/)
  await page.waitForTimeout(950)
  assert.ok(capture.every((request) => request.name !== 'logiq_map_save'))
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
      const cssHex = (value) => {
        const rgb = String(value || '').match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
        if (!rgb) return String(value || '')
        const hex = (n) => Number(n).toString(16).padStart(2, '0')
        return `#${hex(rgb[1])}${hex(rgb[2])}${hex(rgb[3])}`
      }
      return Array.from(document.querySelectorAll('svg#canvas g.links path.link')).map((link) => ({
        name: link.__data__?.target?.data?.name ?? null,
        stroke: cssHex(getComputedStyle(link).stroke || link.style.stroke || ''),
        dash: link.style.strokeDasharray || '',
        opacity: link.style.opacity || '',
        edge: link.dataset.smiteEdge || '',
        animation: link.style.animationName || link.style.animation || '',
      }))
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
  assert.equal(armed[0].wash, '#ffb8b8')
  assert.ok(armed[0].washOpacity > 0.8)
  const rootMood = await edges()
  for (const name of ['A', 'A1', '', 'B']) {
    assert.equal(rootMood.find((edge) => edge.name === name)?.edge, '1')
    assert.equal(rootMood.find((edge) => edge.name === name)?.stroke, '#ff0000')
  }
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
  assert.equal(late[0].wash, '#ffb8b8')
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
  assert.equal((await edges()).find((edge) => edge.name === 'A')?.stroke, '#ffa100')
  assert.equal((await edges()).find((edge) => edge.name === 'A1')?.stroke, '#ffa100')
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
  assert.equal(bankArmed[0].wash, '#ffcc80')
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
  assert.deepEqual(family.map((card) => card.name).sort(), ['', 'A', 'A1'])
  assert.equal(family.find((card) => card.name === 'A')?.clock, true)
  assert.equal(family.find((card) => card.name === 'A1')?.clock, false)
  assert.equal(family.every((card) => card.wash === '#ffb8b8' && card.glow === 0), true)
  assert.equal(family.find((card) => card.name === 'A')?.faceStroke, 'none')
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
  assert.equal((await clocks())[0].wash, '#ffb8b8')
  assert.equal((await edges()).find((edge) => edge.name === 'A1')?.stroke, '#ff0000')
  assert.equal((await edges()).find((edge) => edge.name === 'A')?.edge || '', '')
  await page.evaluate(() => { window.LOGYQPreview.gestures.smite.mercy.remaining = 8000 })
  const child = await center('A1')
  await touch('pointerdown', child.x, child.y, 45, child.uid)
  await touch('pointerup', child.x, child.y, 45, child.uid)
  const childAmber = await heats()
  assert.equal(childAmber.find((card) => card.name === 'A1')?.wash, '#ffcc80')
  assert.equal(childAmber.find((card) => card.name === 'A')?.wash, '#ffb8b8')
  assert.equal(childAmber.find((card) => card.name === '')?.wash, '#ffb8b8')
  assert.equal((await edges()).find((edge) => edge.name === 'A1')?.stroke, '#ff0000')
  await touch('pointerdown', child.x, child.y, 46, child.uid)
  await touch('pointerup', child.x, child.y, 46, child.uid)
  const droppedChild = await heats()
  assert.equal(droppedChild.find((card) => card.name === 'A1'), undefined)
  assert.equal(droppedChild.find((card) => card.name === 'A')?.wash, '#ffb8b8')
  assert.equal(droppedChild.find((card) => card.name === '')?.wash, '#ffb8b8')
  assert.equal(await page.evaluate(() => window.LOGYQPreview.gestures.smite.mercy.marks.get(
    Array.from(document.querySelectorAll('g.node')).find((el) => el.__data__?.data?.name === 'A1')?.__data__.data._uid
  )), 'normal')
  assert.ok(await page.evaluate(() => window.LOGYQPreview.gestures.smite.mercy.remaining < 14000), 'a child cycle does not restart the parent clock')
  const parentPoint = await center('A')
  await touch('pointerdown', parentPoint.x, parentPoint.y, 43, parentPoint.uid)
  await touch('pointerup', parentPoint.x, parentPoint.y, 43, parentPoint.uid)
  const rearmedFamily = await heats()
  assert.deepEqual(rearmedFamily.map((card) => card.name).sort(), ['', 'A'])
  assert.equal(rearmedFamily.every((card) => card.wash === '#ffcc80'), true)
  assert.equal(rearmedFamily.find((card) => card.name === 'A')?.clock, true)
  assert.equal(rearmedFamily.find((card) => card.name === 'A1'), undefined)
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
  assert.equal(reincluded.find((card) => card.name === 'A1')?.wash, '#ffb8b8')
  assert.equal(reincluded.find((card) => card.name === 'A')?.wash, '#ffcc80')
  assert.equal(reincluded.find((card) => card.name === 'A')?.clock, true)
  assert.equal((await clocks())[0].stroke, '#ffa100')
  await touch('pointerdown', child.x, child.y, 48, child.uid)
  await touch('pointerup', child.x, child.y, 48, child.uid)
  await touch('pointerdown', child.x, child.y, 49, child.uid)
  await touch('pointerup', child.x, child.y, 49, child.uid)
  assert.equal((await heats()).find((card) => card.name === 'A1'), undefined)
  assert.equal((await edges()).find((edge) => edge.name === 'A1')?.stroke, '#ffa100')
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
  assert.equal(kidsOnly.find((card) => card.name === 'A1')?.wash, '#ffb8b8')
  assert.equal(kidsOnly.find((card) => card.name === '')?.wash, '#ffb8b8')
  const kidClocks = await clocks()
  assert.deepEqual(kidClocks.map((clock) => clock.name), ['A'])
  assert.equal(kidClocks[0].stroke, '#ff0000')
  assert.equal(kidClocks[0].wash, '')
  assert.equal((await edges()).find((edge) => edge.name === 'A1')?.stroke, '#ff0000')
  assert.equal((await edges()).find((edge) => edge.name === '')?.stroke, '#ff0000')
  assert.equal((await edges()).find((edge) => edge.name === 'A')?.edge || '', '')
  await touch('pointerup', kidParent.x, kidParent.y + 84, 92, kidParent.uid)
  await touch('pointerup', thumbKids.x, thumbKids.y, 91)
  const kidTicket = await center('A1')
  await touch('pointerdown', kidTicket.x, kidTicket.y, 94, kidTicket.uid)
  await touch('pointerup', kidTicket.x, kidTicket.y, 94, kidTicket.uid)
  assert.equal((await heats()).find((card) => card.name === 'A1')?.wash, '#ffcc80')
  await touch('pointerdown', kidTicket.x, kidTicket.y, 194, kidTicket.uid)
  await touch('pointerup', kidTicket.x, kidTicket.y, 194, kidTicket.uid)
  const afterKid = await heats()
  assert.equal(afterKid.find((card) => card.name === 'A1'), undefined)
  assert.equal(afterKid.find((card) => card.name === '')?.wash, '#ffb8b8')
  assert.deepEqual((await clocks()).map((clock) => clock.name), ['A'])
  const master = await center('A')
  await touch('pointerdown', master.x, master.y, 95, master.uid)
  await touch('pointerup', master.x, master.y, 95, master.uid)
  const kidRearm = await heats()
  assert.equal(kidRearm.find((card) => card.name === 'A')?.wash, '#ffcc80')
  assert.equal(kidRearm.find((card) => card.name === 'A')?.clock, true)
  assert.equal(kidRearm.find((card) => card.name === 'A1'), undefined)
  assert.equal(kidRearm.find((card) => card.name === '')?.wash, '#ffcc80')
  assert.deepEqual((await clocks()).map((clock) => clock.name), ['A'])
  assert.equal((await clocks())[0].stroke, '#ffa100')
  assert.equal((await edges()).find((edge) => edge.name === 'A1')?.stroke, '#ffa100')
  assert.equal((await edges()).find((edge) => edge.name === 'A')?.edge || '', '')
  assert.ok(await page.evaluate(() => window.LOGYQPreview.gestures.smite.mercy.remaining >= 14000))
  await touch('pointerdown', kidTicket.x, kidTicket.y, 195, kidTicket.uid)
  await touch('pointerup', kidTicket.x, kidTicket.y, 195, kidTicket.uid)
  assert.equal((await heats()).find((card) => card.name === 'A1')?.wash, '#ffb8b8')
  assert.equal((await heats()).find((card) => card.name === 'A')?.wash, '#ffcc80')
  await touch('pointerdown', master.x, master.y, 96, master.uid)
  await touch('pointerup', master.x, master.y, 96, master.uid)
  assert.equal(await page.evaluate(() => window.LOGYQPreview.gestures.smite.mercy), null)
  assert.deepEqual(await clocks(), [])
  assert.equal((await edges()).some((edge) => edge.edge === '1'), false)
  assert.equal(await page.locator('.node-edit-input').count(), 0)
  await touch('pointerdown', kidTicket.x, kidTicket.y, 196, kidTicket.uid)
  await touch('pointerup', kidTicket.x, kidTicket.y, 196, kidTicket.uid)
  assert.equal(await page.evaluate(() => window.LOGYQPreview.gestures.smite.mercy), null)
  assert.equal((await heats()).find((card) => card.name === 'A1'), undefined)
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
  assert.equal(parallel.find((card) => card.name === 'B')?.clock, true)
  assert.equal(parallel.find((card) => card.name === 'B')?.wash, '#ffb8b8')
  assert.equal(parallel.find((card) => card.name === 'A')?.clock, true)
  assert.equal(parallel.find((card) => card.name === 'A')?.wash, '#ffcc80')
  assert.equal(parallel.find((card) => card.name === 'A1')?.clock, false)
  assert.equal(parallel.find((card) => card.name === 'A1')?.wash, '#ffcc80')
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
  assert.equal(afterToggle.find((card) => card.name === 'A1'), undefined)
  assert.equal(afterToggle.find((card) => card.name === 'A')?.wash, '#ffcc80')
  assert.equal((await clocks()).find((clock) => clock.name === 'A')?.stroke, '#ffa100')
  assert.equal((await clocks()).find((clock) => clock.name === 'B')?.stroke, '#ff0000')
  assert.equal((await edges()).find((edge) => edge.name === 'A1')?.edge, '1')
  assert.equal((await edges()).find((edge) => edge.name === 'A1')?.stroke, '#ffa100')
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
  await touchDrag(phonePage, pop, cardA, async (point) => {
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
      return { x, y, prev, next, parent: names.find((node) => node.data._uid === det.parentUid)?.data.name || 'Root' }
    }
    return null
  })
  assert.ok(gap, 'sibling gap is on screen')
  await touchDrag(phonePage, await chipPoint(phonePage, 'Mint'), gap)
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
        if (!drop || (drop.type !== 'node' && drop.type !== 'gap')) return { x, y }
      }
    }
    return null
  })
  assert.ok(miss, 'empty canvas beside the tree is a miss')
  const beforeMiss = await phonePage.evaluate(() => window.LOGYQBridge.core.state.root.data.name)
  await touchDrag(phonePage, await chipPoint(phonePage, 'Miss'), miss)
  assert.equal(await phonePage.evaluate(() => window.LOGYQBridge.core.state.root.data.name), beforeMiss)
  assert.equal(await phonePage.evaluate(() => window.LOGYQBridge.core.state.wordBank.includes('Miss')), true)
  assert.equal(await phonePage.evaluate(() => window.LOGYQBridge.core.state.root.descendants().some((node) => node.data.name === 'Miss')), false)

  await phonePage.evaluate(() => {
    window.LOGYQBridge.loadMap({ name: 'Root', children: [{ name: 'A' }] }, ['Bare'])
    window.LOGYQBridge.core.state.root = null
  })
  const bare = await chipPoint(phonePage, 'Bare')
  await touchDrag(phonePage, bare, { x: 180, y: 280 })
  await phonePage.waitForFunction(() => window.LOGYQBridge.core.state.root?.data?.name === 'Bare')
  assert.deepEqual(await phonePage.evaluate(() => window.LOGYQBridge.core.state.wordBank.slice()), [])

  await phonePage.evaluate(() => {
    window.LOGYQBridge.loadMap({ name: 'Root', children: [{ name: 'A' }] }, ['First', 'Second'])
    window.LOGYQBridge.core.state.root = null
  })
  await phonePage.locator('#Dock .chip', { hasText: 'First' }).tap()
  await phonePage.locator('#Dock .chip', { hasText: 'Second' }).tap()
  assert.deepEqual(await phonePage.locator('#Dock .chip.is-outlined').allTextContents(), ['First', 'Second'])
  await touchDrag(phonePage, await chipPoint(phonePage, 'Second'), { x: 180, y: 280 })
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
  await touchDrag(phonePage, await chipPoint(phonePage, 'Stay'), await cardPoint(phonePage, 'A'))
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
  await desktopPage.mouse.move((await cardPoint(desktopPage, 'A')).x, (await cardPoint(desktopPage, 'A')).y, { steps: 8 })
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
  const host = await face(mixedName)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: chip.x, y: chip.y, id: 1 }] })
  for (let i = 1; i <= 8; i += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{
        x: chip.x + ((host.x - chip.x) * i) / 8,
        y: chip.y + ((host.y - chip.y) * i) / 8,
        id: 1,
      }],
    })
    await page.waitForTimeout(16)
  }
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
    const point = await face(name)
    await touch('pointerdown', point.x, point.y, pointerId)
    await touch('pointerup', point.x, point.y, pointerId)
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
  const flick = await face('C')
  await touch('pointerdown', flick.x, flick.y, 99)
  await touch('pointermove', flick.x, flick.y + 40, 99)
  await page.waitForTimeout(16)
  await touch('pointerup', flick.x, flick.y + 74, 99)
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
      children: [{ name: 'Cut' }, { name: 'Bank' }, { name: 'Out' }],
    }, [])
  })
  await page.waitForFunction(() => ['Root', 'Cut', 'Bank', 'Out'].every((label) => {
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
      const marks = mode === 'pocket'
        ? new Map([
          [root.data._uid, 'red'],
          [cut.data._uid, 'red'],
          [bank.data._uid, 'amber'],
          [out.data._uid, 'normal'],
        ])
        : new Map([
          [root.data._uid, 'red'],
          [cut.data._uid, 'normal'],
          [bank.data._uid, 'normal'],
          [out.data._uid, 'normal'],
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
          })
          sib = sib.nextElementSibling
        }
        const gradId = link?.dataset?.smiteGrad
        const stops = gradId ? Array.from(document.getElementById(gradId)?.querySelectorAll('stop') || []).map((stop) => stop.getAttribute('stop-color')) : []
        const linkStyle = link ? getComputedStyle(link) : null
        return {
          weight: link?.dataset?.smiteWeight || null,
          edge: link?.dataset?.smiteEdge || null,
          width: linkStyle?.strokeWidth || null,
          opacity: linkStyle?.opacity || null,
          stops,
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
          clock: !!clock,
          clockAnimation: clock ? getComputedStyle(clock).animationName : null,
        }
      }
      return {
        cut: read('Cut'),
        bank: read('Bank'),
        out: read('Out'),
        cards: { root: card('Root'), bank: card('Bank'), out: card('Out') },
      }
    }, marksFor)
  }

  const pocket = await paint('pocket')
  assert.deepEqual(pocket.cut.stops, ['#ff0000', '#ff0000'])
  assert.deepEqual(pocket.bank.stops, ['#ff0000', '#ffa100'])
  assert.deepEqual(pocket.out.stops, ['#ff0000', '#ffffff'])
  for (const edge of [pocket.cut, pocket.bank, pocket.out]) {
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
    assert.equal(halo.stroke, '#ffffff')
    assert.equal(halo.width, '6px')
    assert.ok(edge.ants.every((ant) => ant.animation === 'logyq-smite-march'))
  }
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
  assert.equal(parentOnly.bank.ants.length, 0)
  assert.equal(parentOnly.out.ants.length, 0)
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
    const point = await face(name)
    await touch('pointerdown', point.x, point.y, pointerId)
    await touch('pointerup', point.x, point.y, pointerId)
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
  assert.equal(duringPan.name, 'Lime')
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
