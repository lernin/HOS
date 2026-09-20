import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import { chromium } from 'playwright'

const baseUrl = process.env.LOGIQ_BASE_URL || 'http://127.0.0.1:4173'
const d3Source = readFileSync(new URL('../node_modules/d3/dist/d3.min.js', import.meta.url), 'utf8')
const immutableLegacyPath = new URL('../public/logiq-v161-legacy/index.html', import.meta.url)
const adapterPath = new URL('../public/logiq-clean/keyboard-zoom.js', import.meta.url)
let browser

test.before(async () => {
  browser = await chromium.launch({ headless: true })
})

test.after(async () => {
  await browser?.close()
})

async function open(route) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  await context.route('https://cdn.jsdelivr.net/npm/d3@7*', (request) => request.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: d3Source,
  }))
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => document.querySelectorAll('g.node').length === 30, null, { timeout: 10_000 })
  await page.waitForTimeout(350)
  assert.deepEqual(errors, [], `${route} emitted browser errors`)
  return { context, page }
}

async function activeSummary(page) {
  return page.evaluate(() => ({
    id: document.activeElement?.id || '',
    tag: document.activeElement?.tagName || '',
    cls: document.activeElement?.className || '',
  }))
}

async function selectedDistanceFromCanvasCenter(page, node) {
  const box = await node.boundingBox()
  const canvas = await page.locator('#canvas').boundingBox()
  assert.ok(box && canvas)
  const dx = Math.abs((box.x + box.width / 2) - (canvas.x + canvas.width / 2))
  const dy = Math.abs((box.y + box.height / 2) - (canvas.y + canvas.height / 2))
  return { dx, dy, distance: Math.hypot(dx, dy) }
}

async function shiftFCenter(route) {
  const { context, page } = await open(route)
  const node = page.locator('g.node').filter({ hasText: 'Node 30' }).first()
  await node.click()
  const before = await selectedDistanceFromCanvasCenter(page, node)
  await page.keyboard.press('Shift+F')
  await page.waitForTimeout(1350)
  const after = await selectedDistanceFromCanvasCenter(page, node)
  await context.close()
  return { before, after }
}

async function tabFromCanvas(route) {
  const { context, page } = await open(route)
  await page.evaluate(() => document.activeElement?.blur?.())
  await page.keyboard.press('Tab')
  await page.waitForTimeout(60)
  const result = await activeSummary(page)
  await context.close()
  return result
}

async function tabFromWordInput(route) {
  const { context, page } = await open(route)
  const input = page.locator('#wordInput')
  await input.focus()
  await input.fill('tab-probe')
  await page.keyboard.press('Tab')
  await page.waitForTimeout(60)
  const result = await activeSummary(page)
  await context.close()
  return result
}

async function tabFromInlineEditor(route) {
  const { context, page } = await open(route)
  await page.locator('g.node').filter({ hasText: 'Node 05' }).first().click()
  await page.keyboard.press('e')
  const editor = page.locator('.node-edit-input')
  await editor.waitFor({ state: 'visible' })
  await editor.fill('Node 05 tab commit')
  await page.keyboard.press('Tab')
  await page.waitForTimeout(450)
  const result = {
    active: await activeSummary(page),
    editorCount: await page.locator('.node-edit-input').count(),
    committed: await page.locator('text.label').allTextContents().then((labels) => labels.includes('Node 05 tab commit')),
  }
  await context.close()
  return result
}

async function tabWithSettingsModal(route) {
  const { context, page } = await open(route)
  await page.locator('#settingsBtn').click()
  await page.waitForFunction(() => document.getElementById('settingsBackdrop')?.classList.contains('show'))
  await page.keyboard.press('Tab')
  await page.waitForTimeout(60)
  const result = {
    active: await activeSummary(page),
    modalOpen: await page.locator('#settingsBackdrop').evaluate((el) => el.classList.contains('show')),
  }
  await context.close()
  return result
}

test('Shift+F centering behavior matches immutable v161', async () => {
  const legacy = await shiftFCenter('/logiq-v161-legacy/index.html')
  const clean = await shiftFCenter('/logiq-clean/index.html')

  assert.ok(legacy.after.distance < legacy.before.distance * 0.2,
    `legacy Shift+F did not materially center: ${JSON.stringify(legacy)}`)
  assert.ok(clean.after.distance < clean.before.distance * 0.2,
    `clean Shift+F did not materially center: ${JSON.stringify(clean)}`)
  assert.ok(Math.abs(clean.after.dx - legacy.after.dx) < 1,
    `Shift+F horizontal endpoint diverged: ${JSON.stringify({ legacy, clean })}`)
  assert.ok(Math.abs(clean.after.dy - legacy.after.dy) < 1,
    `Shift+F vertical endpoint diverged: ${JSON.stringify({ legacy, clean })}`)
})

test('clean runtime gives Shift+F a single camera owner', async () => {
  const { context, page } = await open('/logiq-clean/index.html')
  const owners = await page.evaluate(() => {
    const html = document.documentElement.innerHTML
    return {
      dispatcher: (html.match(/if\s*\(lower === 'f' && e\.shiftKey\)\s*\{\s*e\.preventDefault\(\);\s*centerOnSelected\(\);\s*return;\s*\}/g) || []).length,
      standalone: (html.match(/if\s*\(e\.key === 'F' && e\.shiftKey\)/g) || []).length,
    }
  })
  await context.close()

  assert.deepEqual(owners, { dispatcher: 1, standalone: 0 },
    'Shift+F must be owned only by keyDispatcher, which preserves ordinary selectedUid centering')
})

test('Tab from canvas matches immutable v161 focus behavior', async () => {
  const legacy = await tabFromCanvas('/logiq-v161-legacy/index.html')
  const clean = await tabFromCanvas('/logiq-clean/index.html')
  assert.deepEqual(clean, legacy)
})

test('Tab from Word input matches immutable v161 focus behavior', async () => {
  const legacy = await tabFromWordInput('/logiq-v161-legacy/index.html')
  const clean = await tabFromWordInput('/logiq-clean/index.html')
  assert.deepEqual(clean, legacy)
})

test('Tab from inline editor matches immutable v161 commit/focus behavior', async () => {
  const legacy = await tabFromInlineEditor('/logiq-v161-legacy/index.html')
  const clean = await tabFromInlineEditor('/logiq-clean/index.html')
  assert.equal(legacy.editorCount, 0, 'legacy Tab should close the inline editor')
  assert.deepEqual(clean, legacy)
})

test('Tab while settings modal is open matches immutable v161', async () => {
  const legacy = await tabWithSettingsModal('/logiq-v161-legacy/index.html')
  const clean = await tabWithSettingsModal('/logiq-clean/index.html')
  assert.equal(legacy.modalOpen, true)
  assert.deepEqual(clean, legacy)
})

function loadAdapter() {
  const source = readFileSync(adapterPath, 'utf8')
  const sandbox = { window: {} }
  vm.runInNewContext(source, sandbox, { filename: 'keyboard-zoom.js' })
  return { adapter: sandbox.window.LOGiQKeyboardZoom, sandbox, source }
}

function eventFor(key, overrides = {}) {
  let prevented = false
  return {
    key,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    target: {},
    preventDefault() { prevented = true },
    wasPrevented() { return prevented },
    ...overrides,
  }
}

test('keyboard zoom adapter validates dependencies, mounts once, and preserves key filtering', () => {
  for (const dependencies of [
    {},
    { target: { addEventListener() {} } },
    { target: { addEventListener() {} }, zoomByStep() {} },
  ]) {
    const { adapter } = loadAdapter()
    assert.throws(() => adapter.mount(dependencies), /LOGiQ keyboard zoom adapter/)
  }

  for (const { dependencies, message } of [
    {
      dependencies: (registrations) => ({
        target: { addEventListener: 'not a function' },
        zoomByStep() {},
        isTextField() { return false },
      }),
      message: /requires an event target/,
    },
    {
      dependencies: (registrations) => ({
        target: { addEventListener() { registrations.push('registered') } },
        zoomByStep: 'not a function',
        isTextField() { return false },
      }),
      message: /requires zoomByStep/,
    },
    {
      dependencies: (registrations) => ({
        target: { addEventListener() { registrations.push('registered') } },
        zoomByStep() {},
        isTextField: 'not a function',
      }),
      message: /requires isTextField/,
    },
  ]) {
    const { adapter } = loadAdapter()
    const registrations = []
    assert.throws(() => adapter.mount(dependencies(registrations)), message)
    assert.deepEqual(registrations, [])
  }

  const { adapter, sandbox, source } = loadAdapter()
  assert.equal(Object.isFrozen(adapter), true)
  assert.equal(typeof adapter.mount, 'function')

  const registrations = []
  const directions = []
  let typing = false
  const target = {
    addEventListener(type, handler, options) {
      registrations.push({ type, handler, options })
    },
  }

  adapter.mount({
    target,
    zoomByStep: (direction) => directions.push(direction),
    isTextField: () => typing,
  })

  assert.equal(registrations.length, 1)
  assert.equal(registrations[0].type, 'keydown')
  assert.equal(registrations[0].options.passive, false)

  const handler = registrations[0].handler
  const zoomIn = eventFor('z')
  handler(zoomIn)
  const zoomOut = eventFor('Z', { shiftKey: true })
  handler(zoomOut)
  assert.deepEqual(directions, [1, -1])
  assert.equal(zoomIn.wasPrevented(), true)
  assert.equal(zoomOut.wasPrevented(), true)

  for (const bypass of [
    eventFor('z', { ctrlKey: true }),
    eventFor('z', { metaKey: true }),
    eventFor('z', { altKey: true }),
    eventFor('q'),
  ]) {
    handler(bypass)
    assert.equal(bypass.wasPrevented(), false)
  }

  typing = true
  const typedZ = eventFor('z')
  handler(typedZ)
  assert.equal(typedZ.wasPrevented(), false)
  assert.deepEqual(directions, [1, -1])

  assert.throws(
    () => adapter.mount({ target, zoomByStep() {}, isTextField() { return false } }),
    /already mounted/
  )
  assert.throws(
    () => vm.runInNewContext(source, sandbox, { filename: 'keyboard-zoom.js' }),
    /namespace already exists/
  )
})

test('clean runtime gives keyboard zoom one external owner while preserving private zoom and W owners', async () => {
  const { context, page } = await open('/logiq-clean/index.html')
  const ownership = await page.evaluate(() => {
    const html = document.documentElement.innerHTML
    const adapterPathname = '/logiq-clean/keyboard-zoom.js'
    return {
      adapterScripts: Array.from(document.scripts)
        .map((script) => script.src ? new URL(script.src).pathname : '')
        .filter((pathname) => pathname === adapterPathname).length,
      namespaceFrozen: Object.isFrozen(window.LOGiQKeyboardZoom),
      mountType: typeof window.LOGiQKeyboardZoom?.mount,
      inlineZOwners: (html.match(/if\s*\(e\.key === 'z' \|\| e\.key === 'Z'\)/g) || []).length,
      mountCalls: (html.match(/LOGiQKeyboardZoom\.mount\s*\(/g) || []).length,
      zoomDefinitions: (html.match(/function\s+zoomByStep\s*\(/g) || []).length,
      inlineWOwners: (html.match(/if\s*\(e\.key === 'w' \|\| e\.key === 'W'\)/g) || []).length,
    }
  })
  await context.close()

  assert.deepEqual(ownership, {
    adapterScripts: 1,
    namespaceFrozen: true,
    mountType: 'function',
    inlineZOwners: 0,
    mountCalls: 1,
    zoomDefinitions: 1,
    inlineWOwners: 1,
  })
})

async function keyboardTrace(route) {
  const { context, page } = await open(route)
  await page.waitForTimeout(650)
  const trace = await page.evaluate(() => {
    const canvas = document.getElementById('canvas')
    const round = (value) => Number(Number(value).toFixed(6))
    const transform = () => {
      const current = d3.zoomTransform(canvas)
      return { x: round(current.x), y: round(current.y), k: round(current.k) }
    }
    const dispatch = (init, target = document.body) => {
      const before = transform()
      const event = new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        ...init,
      })
      target.dispatchEvent(event)
      return { before, after: transform(), defaultPrevented: event.defaultPrevented }
    }

    const z = dispatch({ key: 'z' })
    const shiftZ = dispatch({ key: 'Z', shiftKey: true })
    const ctrlZ = dispatch({ key: 'z', ctrlKey: true })
    const metaZ = dispatch({ key: 'z', metaKey: true })
    const altZ = dispatch({ key: 'z', altKey: true })
    const inputZ = dispatch({ key: 'z' }, document.getElementById('wordInput'))
    const dockBefore = document.getElementById('Dock').className
    const w = dispatch({ key: 'w' })
    const dockAfter = document.getElementById('Dock').className

    return { z, shiftZ, ctrlZ, metaZ, altZ, inputZ, dockBefore, dockAfter, w }
  })
  await context.close()
  return trace
}

test('keyboard zoom and adjacent W behavior match immutable v161', async () => {
  const legacy = await keyboardTrace('/logiq-v161-legacy/index.html')
  const clean = await keyboardTrace('/logiq-clean/index.html')

  assert.deepEqual(clean, legacy)
  assert.ok(clean.z.after.k > clean.z.before.k, 'Z must zoom in')
  assert.ok(clean.shiftZ.after.k < clean.shiftZ.before.k, 'Shift+Z must zoom out')
  assert.equal(clean.z.defaultPrevented, true)
  assert.equal(clean.shiftZ.defaultPrevented, true)

  for (const name of ['ctrlZ', 'metaZ', 'altZ', 'inputZ']) {
    assert.deepEqual(clean[name].after, clean[name].before, `${name} must not zoom`)
    assert.equal(clean[name].defaultPrevented, false, `${name} must not prevent default`)
  }

  assert.notEqual(clean.dockAfter, clean.dockBefore, 'plain W must still move the Word Dock')
})

test('sanitizer rejects zero or duplicate zoom listeners and runtime anchors', async () => {
  const source = readFileSync(immutableLegacyPath, 'utf8')
  const listenerPattern = /window\.addEventListener\('keydown', \(e\) => \{\r?\n[ \t]*\/\/ Don.t hijack Undo\/Redo or when typing in inputs[\s\S]*?zoomByStep\(e\.shiftKey \? -1 : \+1\);\r?\n[ \t]*\}\r?\n[ \t]*\}, \{ passive: false \}\);\r?\n/
  const listener = source.match(listenerPattern)?.[0]
  assert.ok(listener, 'immutable v161 keyboard zoom listener must exist')

  const anchors = [...source.matchAll(/<script>(\r?\n)\(\(\) => \{/g)]
  assert.equal(anchors.length, 1, 'immutable v161 must have one main runtime anchor')
  const anchor = anchors[0][0]
  const newline = anchors[0][1]

  const cases = [
    [source.replace(listener, ''), /expected 1 Z\/Shift\+Z keyboard listeners; found 0/],
    [source.replace(listener, `${listener}${listener}`), /expected 1 Z\/Shift\+Z keyboard listeners; found 2/],
    [source.replace(anchor, `<script>${newline}/* anchor drift */${newline}(() => {`), /expected 1 legacy runtime script anchors; found 0/],
    [source.replace(anchor, `${anchor}${newline}${anchor}`), /expected 1 legacy runtime script anchors; found 2/],
  ]

  const { context, page } = await open('/logiq-clean/index.html')
  try {
    for (const [input, expected] of cases) {
      await assert.rejects(
        page.evaluate((html) => window.LOGiQLegacyHygiene.sanitize(html), input),
        { message: expected }
      )
    }
  } finally {
    await context.close()
  }
})
