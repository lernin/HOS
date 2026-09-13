import assert from 'node:assert/strict'
import test from 'node:test'
import { chromium } from 'playwright'

const baseUrl = process.env.LOGIQ_BASE_URL || 'http://127.0.0.1:4173'
const mapId = '11111111-1111-4111-8111-111111111111'
let browser

test.before(async () => {
  browser = await chromium.launch({ headless: true })
})

test.after(async () => {
  await browser?.close()
})

async function stubProduction(context, capture = []) {
  await context.route('https://jzaghifuhinkzzhiojre.supabase.co/rest/v1/rpc/**', async (route) => {
    const request = route.request()
    const name = new URL(request.url()).pathname.split('/').pop()
    const body = request.postDataJSON()
    capture.push({ name, body })
    if (name === 'logiq_map_save') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body.map_id || mapId) })
      return
    }
    if (name === 'logiq_map_list') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: mapId,
            name: 'Production map',
            tree: { name: 'Library root', children: [{ name: 'Library child' }] },
            word_bank: ['library word'],
            updated_at: '2026-09-13T12:00:00.000Z',
          },
        ]),
      })
      return
    }
    await route.fulfill({ status: 204, body: '' })
  })
}

async function newContext(options = {}) {
  const context = await browser.newContext(options)
  await context.addInitScript(() => sessionStorage.setItem('logiq_lab_pin_v1', 'test-pin'))
  return context
}

async function waitForTree(page) {
  await page.waitForSelector('g.node')
  await page.waitForFunction(() => document.querySelectorAll('g.node').length === 30)
}

async function selectByName(page, name) {
  const selected = await page.evaluate((value) => window.LOGiQBridge.selectByName(value), name)
  assert.equal(selected, true, `could not select ${name}`)
  await page.waitForFunction((value) => {
    const outlined = Array.from(document.querySelectorAll('g.node.is-outlined'))
    return outlined.some((node) => node.textContent.includes(value))
  }, name)
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

function childNames(tree, parentName) {
  return (findNode(tree, parentName)?.children || []).map((child) => child.name)
}

test('immutable legacy route loads and retains the known-good tree', async () => {
  const context = await newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logiq-v161-legacy/`, { waitUntil: 'networkidle' })
  await waitForTree(page)

  assert.equal(await page.locator('g.node').count(), 30)
  assert.equal(await page.locator('#saveBtn').count(), 0)
  assert.equal(await page.locator('#trash').isVisible(), true)
  await page.locator('g.node').filter({ hasText: 'Node 05' }).click()
  await page.waitForSelector('g.node.is-outlined')
  assert.deepEqual(errors, [])
  await context.close()
})

test('desktop preview preserves legacy commands and autosaves through production RPC', async () => {
  const requests = []
  const context = await newContext({ viewport: { width: 1440, height: 900 } })
  await stubProduction(context, requests)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logiq-v161/`, { waitUntil: 'networkidle' })
  await waitForTree(page)

  assert.equal(await page.locator('body > header').isVisible(), true)
  assert.equal(await page.locator('#logiq-mobile-header').isVisible(), false)
  assert.equal(await page.locator('#saveBtn').count(), 0)
  assert.equal(await page.locator('#trash').isVisible(), true)

  // Selection and editing.
  await selectByName(page, 'Node 05')
  await page.keyboard.press('e')
  const editor = page.locator('.node-edit-input')
  await editor.fill('Edited 05')
  await editor.press('Enter')
  await page.waitForFunction(() => document.querySelector('g.node.is-outlined')?.textContent.includes('Edited 05'))

  // Automatic save, with no manual Save control.
  await page.waitForFunction(() => document.querySelector('.logiq-save-state')?.textContent === 'Saved', null, { timeout: 6000 })
  assert.ok(requests.some((request) => request.name === 'logiq_map_save' && request.body.map_tree))

  // Undo rename.
  await page.keyboard.press('u')
  await page.waitForFunction(() => Array.from(document.querySelectorAll('g.node')).some((node) => node.textContent.includes('Node 05')))

  // Word Dock input.
  await page.locator('#wordInput').fill('alpha, beta')
  await page.locator('#wordInput').press('Enter')
  assert.deepEqual(await page.locator('#Dock .chip').allTextContents(), ['alpha', 'beta'])

  // Keyboard focus and horizontal navigation.
  await page.evaluate(() => window.LOGiQBridge.selectByName('Node 05'))
  const beforeNav = await page.evaluate(() => window.LOGiQBridge.getSelectedUid())
  await page.keyboard.press('ArrowRight')
  const afterNav = await page.evaluate(() => window.LOGiQBridge.getSelectedUid())
  assert.notEqual(afterNav, beforeNav)
  await page.keyboard.press('a')
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'wordInput')
  await page.keyboard.press('Escape')

  // Structural V-movement reorders siblings and Undo restores them.
  await page.evaluate(() => window.LOGiQBridge.selectByName('Node 05'))
  const beforeV = await page.evaluate(() => window.LOGiQBridge.snapshot().tree)
  await page.keyboard.down('v')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.up('v')
  await page.waitForTimeout(100)
  const afterV = await page.evaluate(() => window.LOGiQBridge.snapshot().tree)
  assert.notDeepEqual(childNames(afterV, 'Node 02'), childNames(beforeV, 'Node 02'))
  await page.keyboard.press('u')

  // Drag/reparent and Undo.
  const source = page.locator('g.node').filter({ hasText: 'Node 05' })
  const target = page.locator('g.node').filter({ hasText: 'Node 03' })
  const sourceBox = await source.boundingBox()
  const targetBox = await target.boundingBox()
  assert.ok(sourceBox && targetBox)
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 14 })
  await page.mouse.up()
  await page.waitForTimeout(650)
  assert.equal(await page.evaluate(() => window.LOGiQBridge.getParentName('Node 05')), 'Node 03')
  await page.keyboard.press('u')
  await page.waitForTimeout(500)
  assert.equal(await page.evaluate(() => window.LOGiQBridge.getParentName('Node 05')), 'Node 02')

  // Trash/delete and Undo.
  const countBeforeDelete = await page.locator('g.node').count()
  await selectByName(page, 'Node 30')
  await page.keyboard.press('t')
  await page.waitForFunction((count) => document.querySelectorAll('g.node').length < count, countBeforeDelete)
  await page.keyboard.press('u')
  await page.waitForFunction((count) => document.querySelectorAll('g.node').length === count, countBeforeDelete)

  // Dock transfer and Undo.
  await selectByName(page, 'Node 30')
  const chipsBeforeDock = await page.locator('#Dock .chip').count()
  await page.keyboard.press('d')
  await page.waitForFunction((count) => document.querySelectorAll('#Dock .chip').length > count, chipsBeforeDock)
  await page.keyboard.press('u')

  // Mix, Undo, zoom, Fit, and Dock position shortcut.
  const beforeMix = await page.evaluate(() => window.LOGiQBridge.snapshot().tree)
  await page.locator('#mixBtn').click()
  await page.waitForTimeout(1300)
  const afterMix = await page.evaluate(() => window.LOGiQBridge.snapshot().tree)
  assert.notDeepEqual(afterMix, beforeMix)
  await page.keyboard.press('u')
  await page.waitForTimeout(350)
  assert.deepEqual(await page.evaluate(() => window.LOGiQBridge.snapshot().tree), beforeMix)

  await page.keyboard.press('z')
  await page.waitForTimeout(450)
  const zoomed = await page.evaluate(() => d3.zoomTransform(document.getElementById('canvas')).k)
  await page.keyboard.press('f')
  await page.waitForTimeout(1300)
  const fitted = await page.evaluate(() => d3.zoomTransform(document.getElementById('canvas')).k)
  assert.ok(Number.isFinite(zoomed) && Number.isFinite(fitted))
  await page.keyboard.press('w')
  assert.ok(await page.locator('#Dock').evaluate((element) => element.classList.contains('dock-left') || element.classList.contains('dock-hidden')))

  assert.deepEqual(errors, [])
  await context.close()
})

test('mobile preview provides on-demand controls, contextual actions, library, and offline retry', async () => {
  const requests = []
  const context = await newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await stubProduction(context, requests)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/logiq-v161/`, { waitUntil: 'networkidle' })
  await waitForTree(page)

  assert.equal(await page.locator('body > header').isVisible(), false)
  assert.equal(await page.locator('#logiq-mobile-header').isVisible(), true)
  assert.equal(await page.locator('#trash').isVisible(), false)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)

  await page.locator('#logiq-mobile-menu-btn').tap()
  await page.waitForSelector('#logiq-mobile-panel.is-open')
  await page.locator('#logiq-mobile-word-input').fill('mobile word')
  await page.locator('[data-tool="add"]').tap()
  assert.ok((await page.locator('#Dock .chip').allTextContents()).includes('mobile word'))

  await page.evaluate(() => window.LOGiQBridge.selectByName('Node 05'))
  await page.waitForSelector('#logiq-mobile-context.is-visible')
  const selectedBefore = await page.evaluate(() => window.LOGiQBridge.getSelectedUid())
  await page.locator('[data-action="right"]').tap()
  assert.notEqual(await page.evaluate(() => window.LOGiQBridge.getSelectedUid()), selectedBefore)

  await page.evaluate(() => window.LOGiQBridge.selectByName('Node 05'))
  await page.locator('[data-action="edit"]').tap()
  await page.locator('.node-edit-input').fill('Mobile 05')
  await page.locator('.node-edit-input').press('Enter')
  await page.waitForFunction(() => Array.from(document.querySelectorAll('g.node')).some((node) => node.textContent.includes('Mobile 05')))

  await page.locator('#logiq-mobile-library-btn').tap()
  await page.waitForSelector('#logiq-library.is-open')
  await page.waitForFunction(() => document.querySelector('#logiq-map-list')?.textContent.includes('Production map'))
  assert.ok(requests.some((request) => request.name === 'logiq_map_list'))
  await page.locator('#logiq-library-close').tap()

  // A real offline transition stores the changed snapshot for retry.
  await context.setOffline(true)
  await page.evaluate(() => window.LOGiQBridge.selectByName('Node 06'))
  await page.locator('[data-action="edit"]').tap()
  await page.locator('.node-edit-input').fill('Offline 06')
  await page.locator('.node-edit-input').press('Enter')
  await page.waitForFunction(() => Array.from(document.querySelectorAll('.logiq-save-state')).some((element) => element.textContent === 'Offline'))
  assert.equal(await page.evaluate(() => !!localStorage.getItem('logiq_v161_pending_save_v1')), true)
  await context.setOffline(false)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await page.waitForFunction(() => Array.from(document.querySelectorAll('.logiq-save-state')).some((element) => element.textContent === 'Saved'), null, { timeout: 6000 })

  assert.deepEqual(errors, [])
  await context.close()
})
