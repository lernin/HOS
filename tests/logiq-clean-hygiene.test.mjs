import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { chromium } from 'playwright'

const baseUrl = process.env.LOGIQ_BASE_URL || 'http://127.0.0.1:4173'
const d3Source = readFileSync(new URL('../node_modules/d3/dist/d3.min.js', import.meta.url), 'utf8')
const immutableLegacyPath = new URL('../public/logiq-v161-legacy/index.html', import.meta.url)
const extractedCssPath = new URL('../public/logiq-clean/legacy-v161.css', import.meta.url)
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

async function treesMenuBehavior(route) {
  const { context, page } = await open(route)
  await page.evaluate(() => {
    localStorage.setItem('savedMaps_v1', JSON.stringify([
      {
        name: 'Hygiene Saved Tree',
        data: {
          name: 'Saved Root',
          _uid: 'hygiene-saved-root',
          children: [
            { name: 'Saved Child', _uid: 'hygiene-saved-child' },
          ],
        },
      },
    ]))
  })
  let promptCount = 0
  page.on('dialog', async (dialog) => {
    if (dialog.type() === 'prompt') {
      promptCount += 1
      await dialog.accept('1')
    } else {
      await dialog.dismiss()
    }
  })
  await page.locator('#mapsBtn').click()
  await page.waitForFunction(() => {
    const labels = Array.from(document.querySelectorAll('text.label')).map((node) => node.textContent)
    return labels.length === 2 && labels.includes('Saved Root') && labels.includes('Saved Child')
  }, null, { timeout: 3000 })
  const labels = await page.locator('text.label').allTextContents()
  const stored = await page.evaluate(() => localStorage.getItem('savedMaps_v1'))
  const result = { promptCount, labels, stored }
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
    'unreachable-local-map-save-path',
    'duplicate-trees-listener-registration',
    'dead-enforce-moat-for-selected',
    'superseded-early-fly-center-to-uid',
    'superseded-early-center-on-selected',
    'duplicate-standalone-shift-f-owner',
  ])
  await context.close()

  const legacy = await legacyBehavior('/logiq-v161-legacy/index.html')
  const clean = await legacyBehavior('/logiq-clean/index.html')
  assert.deepEqual(clean, legacy)
  assert.deepEqual(clean.chipsAfter, ['hygiene-word'], 'Shift+W must not silently clear the Word Bank')
  assert.equal(clean.editorVisible, false, 'double-click remains intentionally muted')
  assert.equal(clean.saveButtonCount, 0, 'legacy runtime exposes no saveBtn control')
  assert.equal(clean.mapsButtonCount, 1, 'Trees control is active and must be preserved')

  const legacyTrees = await treesMenuBehavior('/logiq-v161-legacy/index.html')
  const cleanTrees = await treesMenuBehavior('/logiq-clean/index.html')
  assert.deepEqual(cleanTrees, legacyTrees, 'Trees menu load behavior must remain identical to v161')
  assert.equal(cleanTrees.promptCount, 1)
  assert.deepEqual(cleanTrees.labels, ['Saved Root', 'Saved Child'])
})

test('clean runtime keeps only the active flyCenterToUID declaration', async () => {
  const { context, page } = await open('/logiq-clean/index.html')
  const declarationCount = await page.evaluate(() => {
    const html = document.documentElement.innerHTML
    return (html.match(/function\s+flyCenterToUID\s*\(/g) || []).length
  })
  await context.close()
  assert.equal(declarationCount, 1, 'the superseded early flyCenterToUID declaration must be removed')
})

test('clean runtime keeps only the active centerOnSelected declaration', async () => {
  const clean = await open('/logiq-clean/index.html')
  const cleanState = await clean.page.evaluate(() => ({
    declarationCount: (document.documentElement.innerHTML.match(/function\s+centerOnSelected\s*\(/g) || []).length,
    activeBody: typeof centerOnSelected === 'function' ? centerOnSelected.toString() : null,
  }))
  await clean.context.close()

  const legacy = await open('/logiq-v161-legacy/index.html')
  const legacyActiveBody = await legacy.page.evaluate(() => (
    typeof centerOnSelected === 'function' ? centerOnSelected.toString() : null
  ))
  await legacy.context.close()

  assert.equal(cleanState.declarationCount, 1, 'the superseded early centerOnSelected declaration must be removed')
  assert.equal(cleanState.activeBody, legacyActiveBody, 'the active centerOnSelected binding must remain unchanged')
})

test('clean runtime externalizes the exact immutable v161 legacy stylesheet', async () => {
  const { context, page } = await open('/logiq-clean/index.html')

  const state = await page.evaluate(async () => {
    const legacySource = await fetch('/logiq-v161-legacy/index.html', { cache: 'no-store' }).then((r) => r.text())
    const match = legacySource.match(/<style>([\s\S]*?)<\/style>/i)
    if (!match) throw new Error('immutable v161 legacy style block not found')

    const externalHref = '/logiq-clean/legacy-v161.css'
    const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .map((link) => new URL(link.href).pathname)
      .filter((pathname) => pathname === externalHref)

    const extractedCss = await fetch(externalHref, { cache: 'no-store' }).then(async (r) => ({
      ok: r.ok,
      text: await r.text(),
    }))

    return {
      inlineStyleCount: document.head.querySelectorAll('style').length,
      externalStylesheetCount: links.length,
      extractedCssOk: extractedCss.ok,
      extractedCss: extractedCss.text,
      legacyCss: match[1],
    }
  })

  await context.close()

  assert.equal(state.inlineStyleCount, 0, 'clean runtime must not retain legacy inline style ownership')
  assert.equal(state.externalStylesheetCount, 1, 'clean runtime must load exactly one extracted legacy stylesheet')
  assert.equal(state.extractedCssOk, true, 'extracted legacy stylesheet must be fetchable')
  assert.equal(state.extractedCss, state.legacyCss, 'external stylesheet must exactly match immutable v161 CSS payload')
})

test('extracted stylesheet preserves the immutable v161 style payload as raw bytes', () => {
  const immutableSource = readFileSync(immutableLegacyPath)
  const extractedCss = readFileSync(extractedCssPath)
  const startDelimiter = Buffer.from('<style>')
  const endDelimiter = Buffer.from('</style>')
  const start = immutableSource.indexOf(startDelimiter)
  const end = immutableSource.indexOf(endDelimiter)

  assert.equal(start, immutableSource.lastIndexOf(startDelimiter), 'immutable v161 source must contain one ASCII <style> delimiter')
  assert.equal(end, immutableSource.lastIndexOf(endDelimiter), 'immutable v161 source must contain one ASCII </style> delimiter')
  assert.ok(start >= 0 && end > start, 'immutable v161 style delimiters must be ordered')
  assert.deepEqual(
    immutableSource.subarray(start + startDelimiter.length, end),
    extractedCss,
    'extracted stylesheet bytes must equal the immutable v161 style payload'
  )
})

test('sanitizer rejects sanitized legacy input with zero or two style blocks', async () => {
  const immutableSource = readFileSync(immutableLegacyPath, 'utf8')
  const styleStart = immutableSource.indexOf('<style>')
  const styleEnd = immutableSource.indexOf('</style>', styleStart) + '</style>'.length
  assert.ok(styleStart >= 0 && styleEnd > styleStart, 'immutable v161 style block must exist')
  const styleBlock = immutableSource.slice(styleStart, styleEnd)
  const inputs = [
    [immutableSource.replace(styleBlock, ''), 'LOGiQ hygiene expected 1 legacy inline style blocks; found 0'],
    [immutableSource.replace('</style>', '</style><style></style>'), 'LOGiQ hygiene expected 1 legacy inline style blocks; found 2'],
  ]

  const { context, page } = await open('/logiq-clean/index.html')
  try {
    for (const [input, expectedMessage] of inputs) {
      const escapedMessage = expectedMessage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      await assert.rejects(
        page.evaluate((source) => window.LOGiQLegacyHygiene.sanitize(source), input),
        { message: new RegExp(escapedMessage) }
      )
    }
  } finally {
    await context.close()
  }
})
