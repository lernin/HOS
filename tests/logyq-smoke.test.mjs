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
  assert.equal(await page.locator('.node-edit-input').count(), 0)
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
    assert.equal(after.editors, 0, `${name} flick must not open the editor`)
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
  assert.equal(after1.editors, 0)
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
  assert.equal(after2.editors, 0)
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
    return page.evaluate(() => Array.from(document.querySelectorAll('svg#canvas g.node')).filter((node) => node.dataset.smiteHeat === '1').map((node) => {
      const wash = node.querySelector('rect.logyq-smite-wash')
      return {
        name: node.__data__?.data?.name ?? null,
        phase: node.dataset.smitePhase || '',
        clock: !!node.querySelector('path.logyq-smite-clock'),
        wash: wash?.getAttribute('fill') || '',
        washOpacity: Number(wash?.getAttribute('fill-opacity')),
        glow: node.querySelector('rect.logyq-smite-glow') ? Number(node.querySelector('rect.logyq-smite-glow').getAttribute('fill-opacity')) : 0,
      }
    }))
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
  assert.equal(armed[0].dash, '100')
  assert.equal(armed[0].offset, 0)
  assert.equal(armed[0].phase, 'l1')
  assert.equal(armed[0].stroke, '#f6b6b6')
  assert.equal(armed[0].glow, 0)
  assert.ok(armed[0].faceFill === '#2563eb' || armed[0].faceFill === 'rgb(37, 99, 235)', 'paint stays on the card')
  assert.equal(armed[0].wash, '#f6b6b6')
  assert.ok(armed[0].washOpacity >= 0.35 && armed[0].washOpacity < 0.45)
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
    const dash = window.LOGYQPreview.gestures.smiteLineDash(0.5)
    path.setAttribute('d', window.LOGYQPreview.gestures.smiteClockPath(20, 20, 160, 80, 10, 10))
    path.setAttribute('fill', 'none')
    path.setAttribute('stroke', '#dc2626')
    path.setAttribute('stroke-width', '8')
    path.setAttribute('stroke-linecap', 'butt')
    path.setAttribute('pathLength', '100')
    path.setAttribute('stroke-dasharray', dash.array)
    path.setAttribute('stroke-dashoffset', String(dash.offset))
    svg.appendChild(path)
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
  await page.evaluate(() => { window.LOGYQPreview.gestures.smite.mercy.remaining = 1600 })
  await page.waitForFunction(() => {
    const node = Array.from(document.querySelectorAll('g.node')).find((el) => el.__data__?.data?.name === 'Root')
    return node?.dataset?.smitePhase === 'l5'
  })
  const late = await clocks()
  assert.equal(late[0].phase, 'l5')
  assert.equal(late[0].stroke, '#ff0000')
  assert.equal(late[0].wash, '#ff0000')
  assert.equal(late[0].glow, 0)
  assert.ok(late[0].faceFill === '#2563eb' || late[0].faceFill === 'rgb(37, 99, 235)')
  assert.ok(late[0].washOpacity >= 0.9, 'the last level washes the card in pure red')
  const cycle = async (pointerId) => {
    const point = await center('Root')
    await touch('pointerdown', point.x, point.y, pointerId, point.uid)
    await touch('pointerup', point.x, point.y, pointerId, point.uid)
    return page.evaluate(() => {
      const mercy = window.LOGYQPreview.gestures.smite.mercy
      const uid = window.LOGYQBridge.core.state.root.data._uid
      return mercy.marks.get(uid)
    })
  }
  assert.equal(await cycle(23), 'amber')
  assert.equal(await cycle(25), 'normal')
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
  assert.equal(await cycle(27), 'normal')
  assert.equal(await page.locator('.node-edit-input').count(), 0)
  const pull = await center('Root')
  await touch('pointerdown', pull.x, pull.y, 24, pull.uid)
  await touch('pointermove', pull.x, pull.y + 80, 24, pull.uid)
  await touch('pointerup', pull.x, pull.y + 80, 24, pull.uid)
  assert.equal(await page.evaluate(() => window.LOGYQPreview.gestures.smite.mercy), null)
  assert.ok((await names()).includes('A'))
  await page.locator('[data-tool="undo"]').click()
  await page.waitForFunction(() => window.LOGYQBridge.core.state.root?.data?.name === 'Root')
  assert.equal(await page.locator('.logyq-smite-scar').count(), 0)

  await settle()
  const leaf = await center('B')
  await park('middle', 31)
  await touch('pointerdown', leaf.x, leaf.y, 32, leaf.uid)
  await touch('pointermove', leaf.x - 80, leaf.y, 32, leaf.uid)
  const bankArmed = await clocks()
  assert.deepEqual(bankArmed.map((clock) => clock.name), ['B'])
  assert.equal(bankArmed[0].amber, true)
  assert.equal(bankArmed[0].stroke, '#f6dfb6')
  assert.equal(bankArmed[0].phase, 'l1')
  assert.equal(bankArmed[0].wash, '#f6dfb6')
  assert.ok(bankArmed[0].washOpacity >= 0.35 && bankArmed[0].washOpacity < 0.45)
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
  assert.deepEqual(family.filter((card) => card.clock).map((card) => card.name), ['A'])
  assert.ok(family.every((card) => card.phase === 'l1' && card.wash === '#f6b6b6' && card.glow === 0))
  assert.equal((await clocks()).length, 1)
  assert.equal((await clocks())[0].name, 'A')
  await touch('pointerup', card.x, card.y + 84, 42, card.uid)
  await touch('pointerup', 16, 422, 41)
  const child = await center('A1')
  await touch('pointerdown', child.x, child.y, 43, child.uid)
  await touch('pointerup', child.x, child.y, 43, child.uid)
  const toggled = await heats()
  assert.equal(toggled.find((card) => card.name === 'A1')?.clock, false)
  assert.equal(toggled.find((card) => card.name === 'A1')?.wash, '#f6dfb6')
  assert.equal(toggled.find((card) => card.name === 'A')?.clock, true)
  assert.equal(toggled.find((card) => card.name === 'A')?.wash, '#f6b6b6')
  assert.equal(await page.locator('.node-edit-input').count(), 0)
  const again = await center('A')
  await touch('pointerdown', again.x, again.y, 44, again.uid)
  await touch('pointermove', again.x, again.y + 76, 44, again.uid)
  await touch('pointerup', again.x, again.y + 76, 44, again.uid)
  assert.deepEqual(await page.evaluate(() => window.LOGYQBridge.core.state.wordBank.slice()), ['A1'])
  assert.deepEqual((await names()).slice().sort(), ['B', 'Root'])
  assert.equal(await page.locator('.logyq-smite-scar').count(), 0)
  await page.locator('[data-tool="undo"]').click()
  await page.waitForFunction(() => window.LOGYQBridge.core.state.root.descendants().some((node) => node.data.name === 'A'))
  assert.equal(await page.locator('.logyq-smite-scar').count(), 0)
  assert.deepEqual(await page.evaluate(() => window.LOGYQBridge.core.state.wordBank.slice()), [])

  assert.deepEqual(errors, [])
  await context.close()
})
