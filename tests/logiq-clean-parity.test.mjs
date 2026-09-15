import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { chromium } from 'playwright'

const baseUrl = process.env.LOGIQ_BASE_URL || 'http://127.0.0.1:4173'
const d3Source = readFileSync(new URL('../node_modules/d3/dist/d3.min.js', import.meta.url), 'utf8')
const viewport = { width: 1440, height: 900 }
let browser

test.before(async () => {
  browser = await chromium.launch({ headless: true })
})

test.after(async () => {
  await browser?.close()
})

async function newContext() {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  await context.route('https://cdn.jsdelivr.net/npm/d3@7*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: d3Source,
  }))
  return context
}

async function waitForStableTree(page) {
  await page.waitForSelector('g.node', { timeout: 10_000 })
  await page.waitForFunction(() => document.querySelectorAll('g.node').length === 30)
  // v161 fits on boot with a transition. Sample only after it settles.
  await page.waitForTimeout(1500)
}

async function openRoute(route) {
  const context = await newContext()
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' })
  await waitForStableTree(page)
  assert.deepEqual(errors, [], `${route} emitted browser errors`)
  return { context, page }
}

async function visualSnapshot(page) {
  return page.evaluate(() => {
    const n = (value) => Number(Number(value || 0).toFixed(2))
    const rect = (element) => {
      const box = element.getBoundingClientRect()
      return { x: n(box.x), y: n(box.y), width: n(box.width), height: n(box.height) }
    }
    const nodes = Array.from(document.querySelectorAll('g.node')).map((group) => {
      const label = group.querySelector('text.label')
      const card = group.querySelector('rect:not(.grabzone)') || group.querySelector('rect')
      const cardStyle = getComputedStyle(card)
      const labelStyle = getComputedStyle(label)
      return {
        name: (label?.textContent || '').trim(),
        transform: group.getAttribute('transform'),
        groupBox: rect(group),
        cardBox: rect(card),
        cardAttrs: {
          x: card.getAttribute('x'),
          y: card.getAttribute('y'),
          width: card.getAttribute('width'),
          height: card.getAttribute('height'),
          rx: card.getAttribute('rx'),
          ry: card.getAttribute('ry'),
        },
        cardStyle: {
          fill: cardStyle.fill,
          stroke: cardStyle.stroke,
          strokeWidth: cardStyle.strokeWidth,
          filter: cardStyle.filter,
        },
        labelBox: rect(label),
        labelStyle: {
          fontFamily: labelStyle.fontFamily,
          fontSize: labelStyle.fontSize,
          fontWeight: labelStyle.fontWeight,
          fill: labelStyle.fill,
          lineHeight: labelStyle.lineHeight,
        },
        classes: Array.from(group.classList).sort(),
      }
    }).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))

    const links = Array.from(document.querySelectorAll('path.link')).map((link) => ({
      d: link.getAttribute('d'),
      box: rect(link),
      stroke: getComputedStyle(link).stroke,
      strokeWidth: getComputedStyle(link).strokeWidth,
    })).sort((a, b) => String(a.d).localeCompare(String(b.d)))

    return {
      viewport: { width: innerWidth, height: innerHeight },
      canvasBox: rect(document.getElementById('canvas')),
      nodes,
      links,
    }
  })
}

async function nodeLocator(page, name) {
  const locator = page.locator('g.node').filter({ has: page.locator('text.label', { hasText: name }) })
  assert.equal(await locator.count(), 1, `expected exactly one node named ${name}`)
  return locator
}

async function selectedSnapshot(page, name) {
  const node = await nodeLocator(page, name)
  await node.click()
  await page.waitForFunction((value) => {
    const groups = Array.from(document.querySelectorAll('g.node.is-outlined'))
    return groups.some((group) => group.querySelector('text.label')?.textContent.trim() === value)
  }, name)
  return visualSnapshot(page)
}

async function wrappedLabelSnapshot(page) {
  const node = await nodeLocator(page, 'Node 09')
  await node.click()
  await page.keyboard.press('e')
  const editor = page.locator('.node-edit-input')
  await editor.waitFor({ state: 'visible' })
  await editor.fill('A deliberately wrapped parity label for typography')
  await editor.press('Enter')
  await page.waitForFunction(() => Array.from(document.querySelectorAll('text.label')).some((label) => label.textContent.includes('deliberately wrapped parity')))
  await page.waitForTimeout(250)
  return visualSnapshot(page)
}

async function dragStartSnapshot(page) {
  const source = await nodeLocator(page, 'Node 09')
  const sourceBefore = await source.boundingBox()
  const unrelated = await nodeLocator(page, 'Node 05')
  const unrelatedBefore = await unrelated.boundingBox()
  assert.ok(sourceBefore && unrelatedBefore)

  const x = sourceBefore.x + sourceBefore.width / 2
  const y = sourceBefore.y + sourceBefore.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 14, y + 12, { steps: 4 })
  await page.waitForTimeout(120)

  const sourceDuring = await source.boundingBox()
  const unrelatedDuring = await unrelated.boundingBox()
  assert.ok(sourceDuring && unrelatedDuring)

  // Baseline contract: grabbing alone must not resize the card or reflow unrelated nodes.
  assert.ok(Math.abs(sourceDuring.width - sourceBefore.width) <= 0.5)
  assert.ok(Math.abs(sourceDuring.height - sourceBefore.height) <= 0.5)
  assert.ok(Math.abs(unrelatedDuring.x - unrelatedBefore.x) <= 0.5)
  assert.ok(Math.abs(unrelatedDuring.y - unrelatedBefore.y) <= 0.5)

  // Return to the origin before release so the drag is a structural no-op.
  await page.mouse.move(x, y, { steps: 4 })
  await page.mouse.up()
  await page.waitForTimeout(650)

  return {
    before: {
      source: sourceBefore,
      unrelated: unrelatedBefore,
    },
    during: {
      source: sourceDuring,
      unrelated: unrelatedDuring,
    },
    after: await visualSnapshot(page),
  }
}

async function captureRoute(route) {
  const initialHandle = await openRoute(route)
  const initial = await visualSnapshot(initialHandle.page)
  await initialHandle.context.close()

  const selectedHandle = await openRoute(route)
  const selected = await selectedSnapshot(selectedHandle.page, 'Node 09')
  await selectedHandle.context.close()

  const wrappedHandle = await openRoute(route)
  const wrapped = await wrappedLabelSnapshot(wrappedHandle.page)
  await wrappedHandle.context.close()

  const dragHandle = await openRoute(route)
  const drag = await dragStartSnapshot(dragHandle.page)
  await dragHandle.context.close()

  return { initial, selected, wrapped, drag }
}

test('clean candidate has v161 visual and drag-start parity', async () => {
  const legacy = await captureRoute('/logiq-v161-legacy/index.html')
  const clean = await captureRoute('/logiq-clean/index.html')

  assert.deepEqual(clean.initial, legacy.initial, 'initial tree presentation drifted from v161')
  assert.deepEqual(clean.selected, legacy.selected, 'selected-node presentation drifted from v161')
  assert.deepEqual(clean.wrapped, legacy.wrapped, 'wrapped-label typography/geometry drifted from v161')
  assert.deepEqual(clean.drag.after, legacy.drag.after, 'drag no-op did not return to v161 geometry')

  for (const phase of ['before', 'during']) {
    for (const role of ['source', 'unrelated']) {
      const actual = clean.drag[phase][role]
      const expected = legacy.drag[phase][role]
      for (const key of ['x', 'y', 'width', 'height']) {
        assert.ok(Math.abs(actual[key] - expected[key]) <= 0.5, `${phase} ${role} ${key} differs from v161`)
      }
    }
  }
})
