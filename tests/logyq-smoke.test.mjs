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
  await page.waitForTimeout(700)

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
  assert.equal(await page.locator('#logyq-paint-btn').count(), 1)
  assert.equal(await page.locator('#logyq-paint-btn').isVisible(), true)
  const headerBox = await page.locator('#logiq-mobile-header').boundingBox()
  assert.ok(headerBox, 'phone header should be laid out')
  assert.ok(headerBox.height <= 52, `phone header height ${headerBox.height} should stay compact`)
  assert.ok(headerBox.y <= 1, `phone header y ${headerBox.y} should sit at the top`)
  assert.equal(await page.locator('#trash').isVisible(), false)
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
