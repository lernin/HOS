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
    const initKey = '__logiq_mobile_smoke_initialized_v1'
    if (!localStorage.getItem(initKey)) {
      for (const key of Object.keys(localStorage)) if (key.startsWith('logiq_working_lock_')) localStorage.removeItem(key)
      localStorage.setItem(initKey, '1')
    }
  })
  return context
}

async function appFrame(page) {
  await page.goto(`${baseUrl}/logiq-v162-mobile/index.html`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app')
  // Vercel resolves /logiq-v161/ as a directory index; Vite's smoke server does not.
  // Repoint the same iframe so all wrapper load listeners fire against the explicit local file.
  await page.evaluate(() => { document.getElementById('app').src = '/logiq-v161/index.html' })
  let frame = null
  for (let i = 0; i < 50 && !frame; i += 1) {
    frame = page.frames().find(item => item.url().includes('/logiq-v161/index.html')) || null
    if (!frame) await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.ok(frame, 'LOGiQ iframe should load')
  await frame.waitForSelector('g.node', { timeout: 10_000 })
  await frame.waitForFunction(() => document.querySelectorAll('g.node').length === 30, null, { timeout: 10_000 })
  await frame.waitForFunction(() => !!window.LOGiQZoom || !!window.LOGiQZoomError, null, { timeout: 5_000 })
  assert.equal(await frame.evaluate(() => window.LOGiQZoomError || null), null)
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
  const latched = await frame.evaluate(() => (
    !!document.getElementById('logiq-v2-branch-preview') ||
    document.body.classList.contains('v2-drag') ||
    document.body.classList.contains('v2-branch-drag')
  ))
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
  return latched
}

async function holdDragToBackground(frame, sourceName, pointerId = 61) {
  const source = await nodeCenter(frame, sourceName)
  assert.ok(source, `missing background-drag source ${sourceName}`)
  const background = await frame.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('g.node')).map(node => node.getBoundingClientRect())
    const clear = (x, y) => nodes.every(r => x < r.left - 34 || x > r.right + 34 || y < r.top - 34 || y > r.bottom + 34)
    for (let y = innerHeight - 120; y >= 150; y -= 40) {
      for (let x = 105; x <= innerWidth - 105; x += 40) if (clear(x, y)) return { x, y }
    }
    return { x: innerWidth / 2, y: innerHeight - 140 }
  })

  await frame.evaluate(({ source, pointerId }) => {
    const canvas = document.getElementById('canvas')
    canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch', pointerId, isPrimary: true, buttons: 1, clientX: source.x, clientY: source.y }))
  }, { source, pointerId })
  await new Promise(resolve => setTimeout(resolve, 340))

  const visual = await frame.evaluate(sourceName => {
    const sourceNode = Array.from(document.querySelectorAll('g.node')).find(element => element.textContent.includes(sourceName))
    const preview = document.querySelector('#logiq-v2-branch-preview .v2-float-node.is-root')
    const sourceRect = sourceNode?.getBoundingClientRect()
    const previewRect = preview?.getBoundingClientRect()
    const text = sourceNode?.querySelector('text')
    const baseFont = Number.parseFloat(text ? getComputedStyle(text).fontSize : '0')
    const expectedFont = baseFont * window.LOGiQZoom.scale()
    const previewFont = Number.parseFloat(preview ? getComputedStyle(preview).fontSize : '0')
    const dock = document.getElementById('Dock')
    return {
      branchPreview: !!document.getElementById('logiq-v2-branch-preview'),
      branchCards: document.querySelectorAll('#logiq-v2-branch-preview .v2-float-node').length,
      legacyPreview: !!document.getElementById('logiq-v2-drag-card'),
      legacyGroupSelectionCount: window.LOGiQBridge.getSelectedUids().length,
      dockVisibility: dock ? getComputedStyle(dock).visibility : null,
      sourceWidth: sourceRect?.width || 0,
      sourceHeight: sourceRect?.height || 0,
      previewWidth: previewRect?.width || 0,
      previewHeight: previewRect?.height || 0,
      expectedFont,
      previewFont,
    }
  }, sourceName)

  await frame.evaluate(({ background, pointerId }) => {
    const canvas = document.getElementById('canvas')
    canvas.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true, pointerType: 'touch', pointerId, isPrimary: true, buttons: 1, clientX: background.x, clientY: background.y }))
  }, { background, pointerId })
  await new Promise(resolve => setTimeout(resolve, 100))
  await frame.evaluate(({ background, pointerId }) => {
    const canvas = document.getElementById('canvas')
    canvas.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerType: 'touch', pointerId, isPrimary: true, buttons: 0, clientX: background.x, clientY: background.y }))
  }, { background, pointerId })
  await new Promise(resolve => setTimeout(resolve, 700))
  return visual
}

async function pinchZoomOut(frame, startRadius = 72, endRadius = 42) {
  return frame.evaluate(async ({ startRadius, endRadius }) => {
    const canvas = document.getElementById('canvas')
    const center = { x: innerWidth / 2, y: innerHeight / 2 }
    const makeTouch = (identifier, x) => new Touch({
      identifier,
      target: canvas,
      clientX: x,
      clientY: center.y,
      screenX: x,
      screenY: center.y,
      pageX: x,
      pageY: center.y,
      radiusX: 8,
      radiusY: 8,
      force: 0.5,
    })
    const dispatch = (type, radius, ending = false) => {
      const pair = [makeTouch(71, center.x - radius), makeTouch(72, center.x + radius)]
      canvas.dispatchEvent(new TouchEvent(type, {
        bubbles: true,
        cancelable: true,
        touches: ending ? [] : pair,
        targetTouches: ending ? [] : pair,
        changedTouches: pair,
      }))
    }
    const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const before = window.LOGiQZoom.scale()
    dispatch('touchstart', startRadius)
    await nextFrame()
    const scales = []
    for (const radius of [62, 52, endRadius]) {
      dispatch('touchmove', radius)
      await nextFrame()
      scales.push(window.LOGiQZoom.scale())
    }
    dispatch('touchend', endRadius, true)
    await nextFrame()
    return { before, scales, after: window.LOGiQZoom.scale() }
  }, { startRadius, endRadius })
}

async function flickCard(frame, sourceName, dx = 72, pointerId = 81) {
  const source = await nodeCenter(frame, sourceName)
  assert.ok(source, `missing flick source ${sourceName}`)
  await frame.evaluate(({ source, dx, pointerId }) => {
    const canvas = document.getElementById('canvas')
    const event = (type, x, buttons) => canvas.dispatchEvent(new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerType: 'touch',
      pointerId,
      isPrimary: true,
      button: 0,
      buttons,
      clientX: x,
      clientY: source.y,
    }))
    event('pointerdown', source.x, 1)
    event('pointerup', source.x + dx, 0)
  }, { source, dx, pointerId })
  await new Promise(resolve => setTimeout(resolve, 200))
}

test('mobile v2 isolates subtree drag from legacy groups, keeps exact visuals, snaps background drops back, and reparents whole branches', async () => {
  const context = await contextForPhone()
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const frame = await appFrame(page)

  const lock = frame.locator('#logiq-mobile-header .logiq-working-lock-btn')
  await lock.waitFor({ state: 'visible' })
  assert.equal(await lock.getAttribute('data-lock-state'), 'unlocked')
  assert.equal(await frame.evaluate(() => window.__logiqWorkingLocked), false)
  assert.deepEqual(await frame.evaluate(() => window.LOGiQZoom.extent()), [0.02, 2.4])

  await frame.evaluate(() => window.LOGiQBridge.fit())
  await new Promise(resolve => setTimeout(resolve, 1300))
  const fitted = await frame.evaluate(() => window.LOGiQZoom.scale())
  assert.ok(fitted < 0.4, `phone fit should be allowed below 0.4, got ${fitted}`)

  const pinch = await pinchZoomOut(frame)
  assert.ok(pinch.after < pinch.before, `pinch should continue outward from fit: ${JSON.stringify(pinch)}`)
  assert.ok(pinch.scales.every(scale => scale < 0.4), `pinch must never snap to the legacy 0.4 floor: ${JSON.stringify(pinch)}`)
  assert.ok(pinch.scales.every((scale, index, values) => index === 0 || scale <= values[index - 1]), `pinch samples should move smoothly outward: ${JSON.stringify(pinch)}`)

  // Reproduce the phone failure: leave an unrelated desktop-style multi-selection behind,
  // then hold a real subtree root (Node 09 owns Node 22/23/24).
  const staleGroupCount = await frame.evaluate(() => {
    const bridge = window.LOGiQBridge
    bridge.selectByName('Node 05')
    bridge.dispatchKey('g')
    bridge.selectByName('Node 09')
    bridge.dispatchKey('g')
    return bridge.getSelectedUids().length
  })
  assert.equal(staleGroupCount, 2, 'test must begin with stale legacy multi-selection state')

  const beforeBackground = await frame.evaluate(() => window.LOGiQBridge.snapshot())
  const dragVisual = await holdDragToBackground(frame, 'Node 09')
  assert.equal(dragVisual.branchPreview, true, 'held subtree should use the branch preview')
  assert.equal(dragVisual.branchCards, 4, 'Node 09 drag preview must contain Node 09 plus Node 22/23/24')
  assert.equal(dragVisual.legacyPreview, false, 'held subtree must not create the old second drag card')
  assert.equal(dragVisual.legacyGroupSelectionCount, 0, 'mobile hold must clear stale desktop multi-selection before drag starts')
  assert.equal(dragVisual.dockVisibility, 'hidden', 'Word Dock must not participate visually or natively in a structural branch drag')
  assert.ok(Math.abs(dragVisual.previewWidth - dragVisual.sourceWidth) < 0.75, `drag card width must not jump: ${JSON.stringify(dragVisual)}`)
  assert.ok(Math.abs(dragVisual.previewHeight - dragVisual.sourceHeight) < 0.75, `drag card height must not jump: ${JSON.stringify(dragVisual)}`)
  assert.ok(Math.abs(dragVisual.previewFont - dragVisual.expectedFont) < 0.75, `drag text must stay at rendered scale: ${JSON.stringify(dragVisual)}`)
  assert.deepEqual(await frame.evaluate(() => window.LOGiQBridge.snapshot()), beforeBackground, 'dropping a whole held branch on background must be an exact no-op')
  assert.equal(await frame.evaluate(() => !!document.getElementById('logiq-v2-branch-preview')), false, 'background snapback must clean up the preview')

  const beforeBranchMove = await frame.evaluate(() => ({
    wordBank: window.LOGiQBridge.snapshot().wordBank,
    node05Parent: window.LOGiQBridge.getParentName('Node 05'),
  }))
  assert.equal(await holdDrag(frame, 'Node 09', 'Node 10', 62), true)
  assert.equal(await frame.evaluate(() => window.LOGiQBridge.getParentName('Node 09')), 'Node 10')
  assert.equal(await frame.evaluate(() => window.LOGiQBridge.getParentName('Node 22')), 'Node 09')
  assert.equal(await frame.evaluate(() => window.LOGiQBridge.getParentName('Node 23')), 'Node 09')
  assert.equal(await frame.evaluate(() => window.LOGiQBridge.getParentName('Node 24')), 'Node 09')
  assert.equal(await frame.evaluate(() => window.LOGiQBridge.getParentName('Node 05')), beforeBranchMove.node05Parent, 'unrelated stale group member must not move')
  assert.deepEqual(await frame.evaluate(() => window.LOGiQBridge.snapshot().wordBank), beforeBranchMove.wordBank, 'structural branch drag must never create Word Dock entries')

  assert.equal(await holdDrag(frame, 'Node 05', 'Node 03'), true)
  assert.equal(await frame.evaluate(() => window.LOGiQBridge.getParentName('Node 05')), 'Node 03')

  await lock.tap()
  assert.equal(await lock.getAttribute('data-lock-state'), 'locked')
  assert.equal(await frame.evaluate(() => window.__logiqWorkingLocked), true)
  const beforeLocked = await frame.evaluate(() => window.LOGiQBridge.snapshot().tree)
  assert.equal(await holdDrag(frame, 'Node 06', 'Node 03', 52), false, 'locked hold must not latch a drag preview')
  const afterLocked = await frame.evaluate(() => window.LOGiQBridge.snapshot().tree)
  assert.deepEqual(afterLocked, beforeLocked, 'locked map must reject structural drag')

  const beforeLockedFlick = await frame.evaluate(() => window.LOGiQBridge.snapshot().tree)
  await flickCard(frame, 'Node 07')
  assert.deepEqual(await frame.evaluate(() => window.LOGiQBridge.snapshot().tree), beforeLockedFlick, 'locked map must reject directional flick creation')

  assert.equal(await frame.evaluate(() => {
    window.LOGiQBridge.selectByName('Node 07')
    const uid = window.LOGiQBridge.getSelectedUid()
    return window.LOGiQBridge.renameNode(uid, 'Node 07 renamed')
  }), true, 'working lock should still permit deliberate rename')
  assert.equal(await frame.evaluate(() => window.LOGiQBridge.selectByName('Node 07 renamed')), true)

  const lockedPinch = await pinchZoomOut(frame, 62, 48)
  assert.ok(lockedPinch.after < lockedPinch.before, 'working lock must preserve pinch navigation')

  const lockStorage = await frame.evaluate(() => Object.fromEntries(
    Object.keys(localStorage).filter(key => key.startsWith('logiq_working_lock_')).map(key => [key, localStorage.getItem(key)])
  ))
  assert.ok(Object.values(lockStorage).includes('1'), `locked state should be persisted before reopen: ${JSON.stringify(lockStorage)}`)
  const persisted = await appFrame(page)
  const persistedLock = persisted.locator('#logiq-mobile-header .logiq-working-lock-btn')
  await persistedLock.waitFor({ state: 'visible' })
  const persistedStorage = await persisted.evaluate(() => Object.fromEntries(
    Object.keys(localStorage).filter(key => key.startsWith('logiq_working_lock_')).map(key => [key, localStorage.getItem(key)])
  ))
  assert.equal(await persistedLock.getAttribute('data-lock-state'), 'locked', `working lock must survive reopening the same map: ${JSON.stringify(persistedStorage)}`)
  await persistedLock.tap()
  assert.equal(await persistedLock.getAttribute('data-lock-state'), 'unlocked')
  assert.equal(await persisted.evaluate(() => window.__logiqWorkingLocked), false)
  await new Promise(resolve => setTimeout(resolve, 1300))
  assert.equal(await holdDrag(persisted, 'Node 06', 'Node 03', 53), true)
  assert.equal(await persisted.evaluate(() => window.LOGiQBridge.getParentName('Node 06')), 'Node 03')

  assert.deepEqual(errors, [])
  await context.close()
})
