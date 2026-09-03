import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
const dir = await mkdtemp(path.join(tmpdir(), 'thekonym-assistant-'))
await build({ entryPoints: ['api/thekonym-assistant.ts'], bundle: true, platform: 'node', format: 'esm', outfile: path.join(dir, 'api.mjs'), plugins: [{ name: 'fake-model', setup(b) {
  b.onResolve({ filter: /^(ai|@ai-sdk\/gateway)$/ }, a => ({ path: a.path, namespace: 'test-model' }))
  b.onLoad({ filter: /.*/, namespace: 'test-model' }, a => ({ contents: a.path === 'ai' ? 'export const tool=x=>x; export const jsonSchema=x=>x; export const stepCountIs=x=>x; export const generateText=options=>globalThis.testModel(options);' : 'export const gateway=x=>x;' }))
} }], logLevel: 'silent' })
const handler = (await import(pathToFileURL(path.join(dir, 'api.mjs')).href)).default
const originalFetch = globalThis.fetch
const oldToken = process.env.GITHUB_TOKEN
const oldScoped = process.env.PROCEDIA_GITHUB_TOKEN
delete process.env.GITHUB_TOKEN; delete process.env.PROCEDIA_GITHUB_TOKEN
const id = '00000000-0000-4000-8000-000000000001'
const request = body => new Request('https://lab.test/api/thekonym-assistant', { method: 'POST', headers: { 'x-review-pin': 'private-password-for-test', 'Content-Type': 'application/json' }, body: JSON.stringify({ termId: id, ...body }) })
after(async () => { globalThis.fetch = originalFetch; delete globalThis.testModel; if (oldToken) process.env.GITHUB_TOKEN = oldToken; if (oldScoped) process.env.PROCEDIA_GITHUB_TOKEN = oldScoped; await rm(dir, { recursive: true, force: true }) })
test('denied password never reaches the model', async () => {
  globalThis.fetch = async () => Response.json({ code: '28000' }, { status: 400 })
  globalThis.testModel = () => { throw new Error('Model must not run') }
  assert.equal((await handler.fetch(request({ action: 'chat', field: 'definition', messages: [{ role: 'user', content: 'Hi' }] }))).status, 401)
})
test('AI proposes a selected-field change without writing and keeps credentials out of its context', async () => {
  const calls = []
  globalThis.fetch = async (url, options) => { calls.push(String(url)); return Response.json({ id, term: 'Synthetic', definition: 'Before', definition_confidence: 1 }) }
  globalThis.testModel = async options => {
    assert.doesNotMatch(options.system, /private-password-for-test|x-review-pin/i)
    await options.tools.propose_edit.execute({ value: 'After', summary: 'Clearer wording' })
    return { text: 'Review this wording.' }
  }
  const response = await handler.fetch(request({ action: 'chat', field: 'definition', messages: [{ role: 'user', content: 'Improve this definition' }] }))
  const data = await response.json()
  assert.equal(response.status, 200)
  assert.deepEqual(data.proposal.changes, { definition: 'After' })
  assert.deepEqual(data.proposal.expected, { definition: 'Before' })
  assert.equal(data.github, false)
  assert.ok(calls.every(u => u.endsWith('lab_thekonym_read')))
})
test('accepted edit uses the guarded RPC and does not fail when GitHub is disconnected', async () => {
  const calls = []
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body); calls.push({ url: String(url), body })
    return Response.json(String(url).endsWith('lab_thekonym_update') ? { record: { id, definition: 'After' }, audit: { id: 'event', work_item_id: 'queued-item' } } : { id, definition: 'Before' })
  }
  const data = await (await handler.fetch(request({ action: 'apply', changes: { definition: 'After' }, expected: { definition: 'Before' }, requestId: id }))).json()
  assert.equal(data.record.definition, 'After')
  assert.equal(data.log.status, 'pending')
  assert.match(data.log.message, /AI work list/)
  assert.deepEqual(calls[1].body.expected, { definition: 'Before' })
})
test('concurrent change is returned as a conflict, never as saved', async () => {
  globalThis.fetch = async url => String(url).endsWith('lab_thekonym_read') ? Response.json({ id, definition: 'Newer' }) : Response.json({ code: '40001' }, { status: 400 })
  const response = await handler.fetch(request({ action: 'apply', changes: { definition: 'After' }, expected: { definition: 'Before' }, requestId: id }))
  assert.equal(response.status, 409)
  assert.match((await response.json()).error, /changed elsewhere/)
})
