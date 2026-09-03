import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import vm from 'node:vm'
import { build } from 'esbuild'

const temporary = await mkdtemp(path.join(tmpdir(), 'thekonym-viewer-'))
const project = path.resolve(import.meta.dirname, '..')
await build({ stdin: { contents: 'export * from "./src/lib/thekonymViewer"; export * from "./src/lib/thekonymLiveSource";', resolveDir: project }, outfile: path.join(temporary, 'viewer.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' })
const viewer = await import(pathToFileURL(path.join(temporary, 'viewer.mjs')).href)
after(() => rm(temporary, { recursive: true, force: true }))

const makeRecord = patch => ({
  id: '00000000-0000-4000-8000-000000000001', term: 'ExampleThekonym',
  term_pronunciation: 'TEK • moh • nim', greek_root: 'τέκμαρ', greek_root_meaning: 'evidence',
  greek_root_meaning_confidence: 0, definition: 'A definition.', definition_confidence: 3,
  technical_definition: null, technical_definition_confidence: null, example: null,
  example_confidence: null, confidence_score: null, priority: null, target_phase: null,
  is_table: null, application_priority: null, notes: 'Keep these notes exactly.',
  ...patch,
})

test('unassessed confidence stays different from recorded zero', () => {
  assert.equal(viewer.score(null), '—')
  assert.equal(viewer.score(0), '0')
  assert.equal(viewer.score(3), '3')
})

test('pronunciation uses compact bullets and preserves the stored stress', () => {
  assert.equal(viewer.pronunciation('BY-oh-nim'), 'BY • oh • nim')
  assert.equal(viewer.pronunciation('  TEK  •   moh • nim '), 'TEK • moh • nim')
})

test('search supports former names, meaning, and exact-term ranking', () => {
  const rows = [{ id: 'a', term: 'Thekonym', former_names: ['Axionyms'], greek_root_meaning: 'container' }, { id: 'b', term: 'Other', definition: 'Thekonym collection' }]
  assert.equal(viewer.searchCatalogue(rows, '  AXIONYMS  ')[0].id, 'a')
  assert.equal(viewer.searchCatalogue(rows, 'container')[0].id, 'a')
  assert.equal(viewer.searchCatalogue(rows, 'thekonym')[0].id, 'a')
  assert.equal(viewer.searchCatalogue(rows, 'not-a-term').length, 0)
})

test('priority leaves missing inputs visible and preserves recorded zero', () => {
  assert.equal(viewer.calculatedPriority(makeRecord({})), 0)
  assert.equal(viewer.calculatedPriority(makeRecord({ target_phase: 2, is_table: true, is_field_of: ['public.example.field'], application_priority: 3 })), 6.5)
  assert.match(viewer.priorityExplanation(makeRecord({})), /0 · Missing target phase, table assessment, application priority/)
  assert.equal(viewer.priorityExplanation(makeRecord({ target_phase: 1, is_table: false, is_field_of: [], application_priority: 0 })), '((1 × 1) + 0) ÷ 1')
  assert.equal(viewer.priorityExplanation(makeRecord({ target_phase: 2, is_table: true, is_field_of: ['public.example.field'], application_priority: 3 })), '((5 × 2) + 3) ÷ 2')
})

test('copy reads again and returns changed data, with the entire record', async () => {
  let definition = 'Old value'
  let reads = 0
  const source = { mode: 'live', async loadRecord() { reads++; return makeRecord({ definition, custom_future_field: { preserved: true } }) } }
  await source.loadRecord()
  definition = 'New database value'
  const result = await viewer.freshCopy(source, makeRecord({}).id, new AbortController().signal)
  assert.equal(reads, 2)
  assert.match(result.text, /New database value/)
  assert.doesNotMatch(result.text, /Old value/)
  assert.match(result.text, /Keep these notes exactly/)
  assert.match(result.text, /custom_future_field/)
  assert.match(result.text, /production Supabase/)
  assert.match(result.text, /Greek meaning \[0\]/)
  assert.match(result.text, /Technical definition \[—\]/)
  assert.ok(Date.now() - Date.parse(result.capturedAt) < 1000)
})

test('copy refuses an unsuccessful read instead of returning a cached record', async () => {
  await assert.rejects(viewer.freshCopy({ mode: 'live', async loadRecord() { throw new Error('Offline') } }, makeRecord({}).id, new AbortController().signal), /Offline/)
})

test('copy refuses a mismatched record or cancelled request', async () => {
  const source = { mode: 'live', async loadRecord() { return makeRecord({}) } }
  await assert.rejects(viewer.freshCopy(source, 'different-id', new AbortController().signal), /does not match/)
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(viewer.freshCopy(source, makeRecord({}).id, controller.signal), { name: 'AbortError' })
})

test('snapshot copying retains the capture time and never claims a live read', async () => {
  const time = '2026-09-03T01:00:00.000Z'
  const source = { mode: 'snapshot', capturedAt: time, async loadRecord() { return makeRecord({}) } }
  const result = await viewer.freshCopy(source, makeRecord({}).id, new AbortController().signal)
  assert.equal(result.capturedAt, time)
  assert.match(result.text, /PREVIEW SNAPSHOT — not a live database read/)
  assert.doesNotMatch(result.text, /Fresh database read/)
})

test('unsafe reference URLs are not turned into links', () => {
  assert.equal(viewer.paperUrl('javascript:alert(1)'), null)
  assert.equal(viewer.paperUrl('docs/../secrets'), null)
  assert.equal(viewer.paperUrl('https://example.com/a'), null)
  assert.match(viewer.paperUrl('docs/A paper.md'), /docs\/A%20paper.md$/)
})

test('numbered stored examples are separated without rewriting their content', () => {
  assert.deepEqual(viewer.examples('Examples: (1) a word; (2) a sentence; (3) an essay.'), ['a word', 'a sentence', 'an essay.'])
})

test('live requests bypass the HTTP cache and select the computed field', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), ...init })
    return new Response(JSON.stringify(JSON.parse(init.body).term_id === null ? [] : makeRecord({})), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  try {
    await viewer.createThekonymLiveSource('test-password').loadCatalogue(new AbortController().signal)
    await viewer.createThekonymLiveSource('test-password').loadRecord(makeRecord({}).id, new AbortController().signal)
    assert.equal(calls.length, 2)
    assert.ok(calls.every(c => c.cache === 'no-store'))
    const detailUrl = new URL(calls[1].url)
    assert.equal(detailUrl.pathname, '/rest/v1/rpc/lab_thekonym_read')
    assert.deepEqual(JSON.parse(calls[1].body), { pin: 'test-password', term_id: makeRecord({}).id })
  } finally { globalThis.fetch = originalFetch }
})

test('service worker never serves a cached Thekonym response', async () => {
  const handlers = new Map()
  const worker = await readFile(path.join(project, 'public/sw.js'), 'utf8')
  vm.runInNewContext(worker, { URL, self: { addEventListener: (name, handler) => handlers.set(name, handler) } })
  let intercepted = false
  handlers.get('fetch')({ request: { method: 'GET', url: 'https://test.supabase.co/rest/v1/thekonyms?select=*' }, respondWith() { intercepted = true } })
  assert.equal(intercepted, false)
})
