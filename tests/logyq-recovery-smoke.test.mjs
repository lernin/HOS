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

test('fresh phone session boots and shows saved map content without a map PIN', async () => {
  const context = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true })
  await context.route('https://cdn.jsdelivr.net/npm/d3@7*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: d3Source,
  }))
  await context.route('**/api/logyq-maps', async (route) => {
    let payload = {}
    try { payload = route.request().postDataJSON() || {} } catch (_error) {}
    if (payload.name !== 'logiq_map_list') {
      await route.fulfill({ status: 404, body: 'not found' })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        id: 'recovery-map-1',
        name: 'Recovery Saved Map',
        tree: { name: 'Saved root', children: [] },
        word_bank: [],
        updated_at: '2026-10-01T08:00:00.000Z',
      }]),
    })
  })

  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))

  await page.goto(`${baseUrl}/logyq/index.html`, { waitUntil: 'domcontentloaded', timeout: 10_000 })
  await page.waitForFunction(() => window.LOGYQPreview?.app?.booted === true, null, { timeout: 10_000 })
  await page.waitForFunction(() => document.getElementById('logiq-map-list')?.textContent?.includes('Recovery Saved Map'), null, { timeout: 10_000 })

  assert.equal(await page.evaluate(() => document.getElementById('logiq-pin')?.classList.contains('is-open') || false), false)
  assert.match(await page.locator('#logiq-map-list').innerText(), /Recovery Saved Map/)
  assert.deepEqual(errors, [])

  await context.close()
})
