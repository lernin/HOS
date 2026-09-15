import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { chromium } from 'playwright'

const baseUrl = process.env.LOGIQ_BASE_URL || 'http://127.0.0.1:4173'
const d3Source = readFileSync(new URL('../node_modules/d3/dist/d3.min.js', import.meta.url), 'utf8')
let browser

test.before(async () => { browser = await chromium.launch({ headless: true }) })
test.after(async () => { await browser?.close() })

async function openPhone() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await context.route('https://cdn.jsdelivr.net/npm/d3@7*', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: d3Source }))
  await context.route('https://jzaghifuhinkzzhiojre.supabase.co/rest/v1/rpc/**', async route => {
    const name = new URL(route.request().url()).pathname.split('/').pop()
    if (name === 'logiq_map_save') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify('11111111-1111-4111-8111-111111111111') })
    if (name === 'logiq_map_list') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    return route.fulfill({ status: 204, body: '' })
  })
  await context.addInitScript(() => sessionStorage.setItem('logiq_lab_pin_v1', 'test-pin'))

  const page = await context.newPage()
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
  await frame.waitForFunction(() => !!window.LOGiQOriginGhost && !!window.LOGiQDragWatchdog, null, { timeout: 5_000 })
  return { context, page, frame }
}

async function center(frame, name) {
  return frame.evaluate(value => {
    const node = Array.from(document.querySelectorAll('g.node')).find(element => element.textContent.includes(value))
    const r = node?.getBoundingClientRect()
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null
  }, name)
}

async function beginHold(frame, name, pointerId) {
  const p = await center(frame, name)
  assert.ok(p, `missing ${name}`)
  await frame.evaluate(({ p, pointerId }) => {
    const canvas = document.getElementById('canvas')
    canvas.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, cancelable: true, pointerType: 'touch', pointerId, isPrimary: true,
      buttons: 1, clientX: p.x, clientY: p.y,
    }))
  }, { p, pointerId })
  await new Promise(resolve => setTimeout(resolve, 360))
  await frame.waitForSelector('#logiq-v2-origin-freeze', { timeout: 2_000 })
  return p
}

async function backgroundPoint(frame) {
  return frame.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('g.node')).map(node => node.getBoundingClientRect())
    const clear = (x, y) => nodes.every(r => x < r.left - 28 || x > r.right + 28 || y < r.top - 28 || y > r.bottom + 28)
    for (let y = innerHeight - 150; y >= 180; y -= 45) {
      for (let x = 85; x <= innerWidth - 85; x += 45) if (clear(x, y)) return { x, y }
    }
    return { x: innerWidth / 2, y: innerHeight - 150 }
  })
}

async function movePointer(frame, pointerId, p) {
  await frame.evaluate(({ pointerId, p }) => {
    document.getElementById('canvas').dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true, cancelable: true, pointerType: 'touch', pointerId, isPrimary: true,
      buttons: 1, clientX: p.x, clientY: p.y,
    }))
  }, { pointerId, p })
}

async function endPointer(frame, pointerId, p) {
  await frame.evaluate(({ pointerId, p }) => {
    document.getElementById('canvas').dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true, cancelable: true, pointerType: 'touch', pointerId, isPrimary: true,
      buttons: 0, clientX: p.x, clientY: p.y,
    }))
  }, { pointerId, p })
}

test('Node 09 origin ghost is frozen independently and a partial moving branch cancels safely', async () => {
  const { context, page, frame } = await openPhone()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))

  const before = await frame.evaluate(() => window.LOGiQBridge.snapshot())
  const pointerId = 901
  await beginHold(frame, 'Node 09', pointerId)

  const initial = await frame.evaluate(() => {
    const ghost = document.getElementById('logiq-v2-origin-freeze')
    const root = ghost?.querySelector('.v2-float-node.is-root')?.getBoundingClientRect()
    return {
      frozenCards: ghost?.querySelectorAll('.v2-float-node').length || 0,
      movingCards: document.querySelectorAll('#logiq-v2-branch-preview .v2-float-node').length,
      labels: Array.from(ghost?.querySelectorAll('.v2-float-node') || []).map(node => node.textContent.trim()).sort(),
      root: root ? { x: root.x, y: root.y, width: root.width, height: root.height } : null,
    }
  })
  assert.equal(initial.frozenCards, 4)
  assert.equal(initial.movingCards, 4)
  assert.deepEqual(initial.labels, ['Node 09', 'Node 22', 'Node 23', 'Node 24'])
  assert.ok(initial.root)

  // Reproduce the reported failure mechanism: the live SVG loses all ghost classes.
  await frame.evaluate(() => document.querySelectorAll('.v2-branch-origin-ghost').forEach(node => node.classList.remove('v2-branch-origin-ghost')))
  const target = await backgroundPoint(frame)
  await movePointer(frame, pointerId, target)
  await new Promise(resolve => setTimeout(resolve, 100))

  const afterLiveLoss = await frame.evaluate(() => {
    const ghost = document.getElementById('logiq-v2-origin-freeze')
    const root = ghost?.querySelector('.v2-float-node.is-root')?.getBoundingClientRect()
    return {
      frozenCards: ghost?.querySelectorAll('.v2-float-node').length || 0,
      movingCards: document.querySelectorAll('#logiq-v2-branch-preview .v2-float-node').length,
      root: root ? { x: root.x, y: root.y, width: root.width, height: root.height } : null,
    }
  })
  assert.equal(afterLiveLoss.frozenCards, 4, 'frozen ghost must not depend on live SVG ghost classes')
  assert.equal(afterLiveLoss.movingCards, 4, 'moving branch must still contain all descendants')
  assert.deepEqual(afterLiveLoss.root, initial.root, 'origin ghost must remain fixed while the moving branch travels')

  // A layout/redraw can replace the SVG card element without changing map data.
  await frame.evaluate(() => {
    const live = Array.from(document.querySelectorAll('g.node')).find(node => node.textContent.includes('Node 09'))
    const replacement = live.cloneNode(true)
    replacement.__data__ = live.__data__
    live.replaceWith(replacement)
  })
  assert.equal(await frame.evaluate(() => window.LOGiQOriginGhost.cardCount()), 4, 'SVG DOM replacement must not erase the frozen branch')
  assert.deepEqual(await frame.evaluate(() => {
    const r = document.querySelector('#logiq-v2-origin-freeze .v2-float-node.is-root').getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  }), initial.root, 'SVG DOM replacement must not move the origin')

  // Even accidental removal of the frozen layer itself must be repaired while drag is active.
  await frame.evaluate(() => document.getElementById('logiq-v2-origin-freeze')?.remove())
  await new Promise(resolve => setTimeout(resolve, 100))
  assert.equal(await frame.evaluate(() => window.LOGiQOriginGhost.cardCount()), 4, 'origin ghost must restore itself during an active drag')

  await endPointer(frame, pointerId, target)
  await new Promise(resolve => setTimeout(resolve, 700))
  assert.deepEqual(await frame.evaluate(() => window.LOGiQBridge.snapshot()), before, 'background release after ghost churn must be an exact no-op')
  assert.equal(await frame.evaluate(() => !!document.getElementById('logiq-v2-origin-freeze')), false, 'origin ghost must clean up after release')

  // A representation that loses a child must cancel, never continue as a root-only drag.
  const beforePartial = await frame.evaluate(() => window.LOGiQBridge.snapshot())
  await beginHold(frame, 'Node 09', 902)
  await frame.evaluate(() => document.querySelector('#logiq-v2-branch-preview .v2-float-node:not(.is-root)')?.remove())
  await new Promise(resolve => setTimeout(resolve, 250))
  assert.equal(await frame.evaluate(() => window.__logiqV2DragActive), false, 'partial branch representation must hard-cancel the drag')
  assert.equal(await frame.evaluate(() => !!document.getElementById('logiq-v2-branch-preview')), false)
  assert.equal(await frame.evaluate(() => !!document.getElementById('logiq-v2-origin-freeze')), false)
  assert.deepEqual(await frame.evaluate(() => window.LOGiQBridge.snapshot()), beforePartial, 'partial-preview cancellation must preserve exact map state')

  assert.deepEqual(errors, [])
  await context.close()
})

test('Node 09 branch keeps card geometry and rendered type through pickup, travel and cancel', async () => {
  const { context, page, frame } = await openPhone()
  // The restored map runs an animated Fit on load. Measure only once its view settles.
  await new Promise(resolve => setTimeout(resolve, 1200))
  const before = await frame.evaluate(() => window.LOGiQBridge.snapshot())
  const measure = await frame.evaluate(() => {
    const node = Array.from(document.querySelectorAll('g.node')).find(item => item.textContent.includes('Node 09'))
    const text = node.querySelector('text')
    const bounds = node.getBoundingClientRect()
    const zoom = window.d3.zoomTransform(document.getElementById('canvas')).k
    return { width: bounds.width, height: bounds.height, renderedFont: parseFloat(getComputedStyle(text).fontSize) * zoom, zoom }
  })
  const pointerId = 903
  const source = await beginHold(frame, 'Node 09', pointerId)
  async function floating() {
    return frame.evaluate(() => {
      const moving = document.querySelector('#logiq-v2-branch-preview .v2-float-node.is-root')
      const frozen = document.querySelector('#logiq-v2-origin-freeze .v2-float-node.is-root')
      const rect = item => { const r = item.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } }
      return {
        moving: rect(moving), frozen: rect(frozen),
        inlineWidth: moving.style.width, zoom: window.d3.zoomTransform(document.getElementById('canvas')).k,
        movingFont: parseFloat(getComputedStyle(moving).fontSize),
        frozenFont: parseFloat(getComputedStyle(frozen).fontSize),
        movingStyle: Object.fromEntries(['paddingLeft', 'paddingRight', 'borderWidth', 'borderRadius', 'fontFamily', 'fontWeight'].map(key => [key, getComputedStyle(moving)[key]])),
        movingLabels: Array.from(document.querySelectorAll('#logiq-v2-branch-preview .v2-float-node')).map(item => item.textContent.trim()).sort(),
        frozenLabels: Array.from(document.querySelectorAll('#logiq-v2-origin-freeze .v2-float-node')).map(item => item.textContent.trim()).sort(),
      }
    })
  }
  const picked = await floating()
  const labels = ['Node 09', 'Node 22', 'Node 23', 'Node 24']
  assert.deepEqual(picked.movingLabels, labels)
  assert.deepEqual(picked.frozenLabels, labels)
  for (const dimension of ['width', 'height']) assert.ok(Math.abs(picked.moving[dimension] - measure[dimension]) <= 1, `${dimension} changed on pickup: source ${JSON.stringify(measure)}, moving ${JSON.stringify(picked)}`)
  assert.ok(Math.abs(picked.movingFont - measure.renderedFont) <= .5, `rendered font changed on pickup: source ${measure.renderedFont}, moving ${picked.movingFont}`)
  for (const dimension of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(picked.frozen[dimension] - picked.moving[dimension]) <= .5, `origin ${dimension} differs at pickup`)

  const destination = { x: source.x + 90, y: source.y + 75 }
  await movePointer(frame, pointerId, destination)
  await new Promise(resolve => setTimeout(resolve, 80))
  const traveled = await floating()
  assert.deepEqual(traveled.movingLabels, labels)
  assert.deepEqual(traveled.frozenLabels, labels)
  assert.deepEqual(traveled.frozen, picked.frozen, 'origin never follows pointer travel')
  for (const dimension of ['width', 'height']) assert.ok(Math.abs(traveled.moving[dimension] - picked.moving[dimension]) <= .5, `${dimension} changed in transit`)
  assert.ok(Math.abs(traveled.movingFont - picked.movingFont) <= .1, 'rendered font changed in transit')
  assert.deepEqual(traveled.movingStyle, picked.movingStyle, 'card padding, border, and typography changed in transit')

  await frame.evaluate(() => window.dispatchEvent(new Event('blur')))
  await frame.waitForFunction(() => !window.__logiqV2DragActive)
  assert.deepEqual(await frame.evaluate(() => window.LOGiQBridge.snapshot()), before, 'cancel restores tree and Word Bank exactly')
  const restored = await frame.evaluate(() => {
    const node = Array.from(document.querySelectorAll('g.node')).find(item => item.textContent.includes('Node 09'))
    const r = node.getBoundingClientRect()
    const zoom = window.d3.zoomTransform(document.getElementById('canvas')).k
    return { width: r.width, height: r.height, renderedFont: parseFloat(getComputedStyle(node.querySelector('text')).fontSize) * zoom }
  })
  for (const dimension of ['width', 'height', 'renderedFont']) assert.ok(Math.abs(restored[dimension] - measure[dimension]) <= .5, `${dimension} changed after cancel`)
  assert.equal(await frame.evaluate(() => document.querySelectorAll('#logiq-v2-branch-preview, #logiq-v2-origin-freeze').length), 0)
  await context.close()
})
