import assert from 'node:assert/strict'
import { chromium } from 'playwright'

// Static controller smoke: true cross-device Supabase broadcast requires a physical
// TV + phone test and must not be claimed as verified by this browser-only check.
const base = process.env.ESTATE_PLAN_TEST_URL || 'http://127.0.0.1:4173'
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 393, height: 851 }, isMobile: true, hasTouch: true })
  const room = 'a'.repeat(36)
  await page.goto(base + '/estate-remote#' + room, { waitUntil: 'domcontentloaded' })
  await page.locator('main.oe-phone').waitFor({ timeout: 15000 })
  assert.equal(await page.locator('.oe-phone-pad').count(), 2, 'MOVE and LOOK pads must exist')
  assert.deepEqual(await page.locator('.oe-phone-pad > span').allTextContents(), ['MOVE', 'LOOK'])
  assert.deepEqual(await page.locator('.oe-phone-actions button').allTextContents(), ['Back', 'Select', 'Start', 'Menu'])
  assert.equal(await page.locator('.oe-phone-actions button:disabled').count(), 4, 'commands cannot run until paired')
  assert.equal(await page.locator('canvas').count(), 0, 'remote must never mount the 3D estate renderer')
  assert.equal(await page.locator('main.oe-phone').evaluate(e => getComputedStyle(e).backgroundColor), 'rgb(3, 5, 4)', 'controller should be dark')
  const vendor = await page.request.get(base + '/estate-remote/qrcode.min.js')
  assert.equal(vendor.status(), 200, 'QR asset should be bundled locally')
  assert.match(await vendor.text(), /QRCode/, 'QR script must provide the QRCode implementation')
  await page.goto(base + '/estate-remote#bad', { waitUntil: 'domcontentloaded' })
  await page.getByText('Invalid pairing link', { exact: false }).waitFor({ timeout: 12000 })
  assert.equal(await page.locator('.oe-phone-actions button:disabled').count(), 4, 'invalid code must not enable commands')
  console.log('Ocean Estate phone remote static UI smoke: PASS (pairing not tested)')
} finally {
  await browser.close()
}
