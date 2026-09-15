import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { chromium } from 'playwright'

const baseUrl = process.env.LOGIQ_BASE_URL || 'http://127.0.0.1:4173'
const d3Source = readFileSync(new URL('../node_modules/d3/dist/d3.min.js', import.meta.url), 'utf8')
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
  try {
    await page.waitForFunction(() => document.querySelectorAll('g.node').length === 30, null, { timeout: 10_000 })
  } catch (error) {
    const state = await page.evaluate(() => ({
      title: document.title,
      body: document.body?.innerText?.slice(0, 500),
      scripts: Array.from(document.scripts).map((script) => script.src || '[inline]'),
      d3: typeof window.d3,
      hygiene: window.__LOGIQ_HYGIENE_REPORT__ || null,
    }))
    await context.close()
    throw new Error(`${route} did not render: ${JSON.stringify({ errors, state })}`, { cause: error })
  }
  await page.waitForTimeout(1000)
  assert.deepEqual(errors, [], `${route} emitted browser errors`)
  return { context, page }
}

async function legacyBehavior(route) {
  const { context, page } = await open(route)

  const wordInput = page.locator('#wordInput')
  await wordInput.fill('hygiene-word')
  await wordInput.press('Enter')
  const chipsBefore = await page.locator('#Dock .chip').allTextContents()
  const dockClassBefore = await page.locator('#Dock').getAttribute('class')

  await page.evaluate(() => document.activeElement?.blur())
  await page.keyboard.press('Shift+w')
  await page.waitForTimeout(100)
  const chipsAfter = await page.locator('#Dock .chip').allTextContents()
  const dockClassAfter = await page.locator('#Dock').getAttribute('class')

  const node09 = page.locator('g.node').filter({ has: page.locator('text.label', { hasText: 'Node 09' }) })
  await node09.dblclick()
  await page.waitForTimeout(100)
  const editorVisible = await page.locator('.node-edit-input').isVisible().catch(() => false)

  const result = {
    chipsBefore,
    chipsAfter,
    dockClassBefore,
    dockClassAfter,
    editorVisible,
    saveButtonCount: await page.locator('#saveBtn').count(),
    mapsButtonCount: await page.locator('#mapsBtn').count(),
  }
  await context.close()
  return result
}

test('hygiene removes only proven-dead legacy paths and preserves their observable behavior', async () => {
  const { context, page } = await open('/logiq-clean/index.html')
  const report = await page.evaluate(() => window.__LOGIQ_HYGIENE_REPORT__)
  assert.deepEqual(report?.removals, [
    'unreachable-shift-w-wordbank-trash',
    'suppressed-node-dblclick-editor',
    'duplicate-tab-listener-registration',
    'unused-savedmaps-v1-surface',
  ])

  const cleanSavedMapsGlobals = await page.evaluate(() => ({
    saveCurrentMap: typeof window.saveCurrentMap,
    openMapsMenu: typeof window.openMapsMenu,
  }))
  assert.deepEqual(cleanSavedMapsGlobals, {
    saveCurrentMap: 'undefined',
    openMapsMenu: 'undefined',
  }, 'clean candidate must not retain the unreachable savedMaps_v1 runtime')
  await context.close()

  const legacy = await legacyBehavior('/logiq-v161-legacy/index.html')
  const clean = await legacyBehavior('/logiq-clean/index.html')

  // The cleanup contract is behavioral equivalence. In particular, the later
  // Shift+W trash block must remain unreachable: whatever the earlier legacy
  // handlers do with Shift+W, they must not clear the Word Bank.
  assert.deepEqual(clean, legacy)
  assert.deepEqual(clean.chipsAfter, ['hygiene-word'], 'Shift+W must not silently clear the Word Bank')
  assert.equal(clean.editorVisible, false, 'double-click remains intentionally muted')
  assert.equal(clean.saveButtonCount, 0, 'legacy runtime exposes no saveBtn control')
  assert.equal(clean.mapsButtonCount, 0, 'legacy runtime exposes no mapsBtn control')
})
