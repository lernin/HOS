import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const base = process.env.ESTATE_PLAN_TEST_URL || 'http://127.0.0.1:4173'
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
    '--enable-webgl', '--enable-unsafe-swiftshader'],
})
try {
  const context = await browser.newContext({
    viewport: { width: 393, height: 851 }, deviceScaleFactor: 1,
    isMobile: true, hasTouch: true,
  })
  const page = await context.newPage()
  await page.goto(base + '/ocean-estate', { waitUntil: 'domcontentloaded' })
  await page.locator('main.oe-root').waitFor({ timeout: 30000 })
  const gate = page.getByRole('region', { name: 'Portrait exploration choice' })
  await gate.waitFor({ state: 'visible', timeout: 30000 })
  assert.equal(await page.locator('.oe-root').getAttribute('data-portrait-explore'), 'off')
  assert.equal(await page.locator('canvas.oe-canvas').count(), 1,
    'portrait uses the same existing 3D renderer')
  await page.getByRole('button', { name: 'Explore in portrait' }).tap()
  assert.equal(await page.locator('.oe-root').getAttribute('data-portrait-explore'), 'on')
  await gate.waitFor({ state: 'hidden', timeout: 10000 })
  await page.getByRole('button', { name: 'Estate menu' }).tap()
  const option = page.getByRole('checkbox', { name: 'Portrait exploration' })
  assert.equal(await option.isChecked(), true, 'opt-in reflected in settings')
  assert.equal(await page.locator('.oe-settings').evaluate(
    node => node.scrollHeight >= node.clientHeight && node.clientWidth <= innerWidth), true,
    'portrait settings fit viewport and remain scrollable')
  await option.uncheck()
  await gate.waitFor({ state: 'visible', timeout: 10000 })
  await page.getByRole('button', { name: 'Explore in portrait' }).tap()
  await gate.waitFor({ state: 'hidden', timeout: 10000 })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('.oe-root[data-portrait-explore="on"]').waitFor({ timeout: 30000 })
  await gate.waitFor({ state: 'hidden', timeout: 10000 })
  await page.setViewportSize({ width: 851, height: 393 })
  assert.equal(await gate.isVisible(), false, 'landscape continues to work')
  await page.setViewportSize({ width: 393, height: 851 })
  assert.equal(await gate.isVisible(), false, 'return to portrait retains the opt-in')
  assert.equal(await page.locator('main.oe-root').evaluate(
    node => node.scrollWidth <= innerWidth), true, 'no horizontal overflow')
  console.log('Ocean Estate portrait opt-in/rotation/mobile layout smoke: PASS')
} finally {
  await browser.close()
}
