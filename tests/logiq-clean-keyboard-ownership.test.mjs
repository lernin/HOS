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

async function shiftFCenter(route) {
  const { context, page } = await open(route)
  const node = page.locator('g.node').filter({ hasText: 'Node 30' }).first()
  await node.click()
  await page.keyboard.press('Shift+F')
  await page.waitForTimeout(1350)
  const box = await node.boundingBox()
  const canvas = await page.locator('#canvas').boundingBox()
  assert.ok(box && canvas)
  const result = {
    dx: Math.abs((box.x + box.width / 2) - (canvas.x + canvas.width / 2)),
    dy: Math.abs((box.y + box.height / 2) - (canvas.y + canvas.height / 2)),
  }
  await context.close()
  return result
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
  assert.ok(legacy.dx < 3 && legacy.dy < 3, `legacy Shift+F did not center selected node in canvas: ${JSON.stringify(legacy)}`)
  assert.ok(clean.dx < 3 && clean.dy < 3, `clean Shift+F did not center selected node in canvas: ${JSON.stringify(clean)}`)
  assert.ok(Math.abs(clean.dx - legacy.dx) < 1 && Math.abs(clean.dy - legacy.dy) < 1)
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
