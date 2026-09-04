import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

const temporary = await mkdtemp(path.join(process.cwd(), '.kid-choice-test-'))
await build({ stdin: { contents: 'export * from "./src/lib/kidExplanationProposals"; export * from "./src/experiences/KidExplanationChoice";', resolveDir: process.cwd() }, outfile: path.join(temporary, 'choice.mjs'), bundle: true, jsx: 'automatic', packages: 'external', platform: 'node', format: 'esm', logLevel: 'silent' })
const { KidExplanationChoice, parseKidProposals, kidChoiceEdit } = await import(pathToFileURL(path.join(temporary, 'choice.mjs')).href)
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://test.local' })
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.IS_REACT_ACT_ENVIRONMENT = true
after(async () => { dom.window.close(); delete globalThis.window; delete globalThis.document; delete globalThis.IS_REACT_ACT_ENVIRONMENT; await rm(temporary, { recursive: true, force: true }) })

const text = 'Proposed explanations\n\n1. An invisible circle.\n\n2. Think about your class.\nIt includes people and books.\n\n3. A team clubhouse.\n\n4. A pretend box.\n\n5. Start a garden club.\n\nNomination: 2.\nThe classroom is familiar.'
const record = { id: 'test-term', term: 'Kyklonym', kid_explanation: text, kid_explanation_confidence: 0 }

test('proposal parser preserves whole options and separates nomination', () => {
  const result = parseKidProposals(text.replaceAll('\n', '\r\n'))
  assert.equal(result.options.length, 5)
  assert.equal(result.options[1], 'Think about your class.\nIt includes people and books.')
  assert.equal(result.nomination, 2)
  assert.equal(result.reason, 'The classroom is familiar.')
  for (const value of [null, '', 'A single explanation.', '1. First\n2. Second', text.replace('2. Think', '7. Think'), text.replace('Nomination: 2.', 'Nomination: six'), text.replace('Nomination: 2.', 'Nomination: 9.')]) assert.equal(parseKidProposals(value), null)
})

test('selection requires an explicit option and confidence; zero is valid', () => {
  assert.throws(() => kidChoiceEdit(record, null, 0), /Choose an explanation/)
  assert.throws(() => kidChoiceEdit(record, 8, 0), /Choose an explanation/)
  for (const value of [null, undefined, -1, 4, 1.5]) assert.throws(() => kidChoiceEdit(record, 1, value), /Choose confidence/)
  for (const confidence of [0, 1, 2, 3]) {
    const edit = kidChoiceEdit(record, 1, confidence)
    assert.deepEqual(edit.changes, { kid_explanation: 'Think about your class.\nIt includes people and books.', kid_explanation_confidence: confidence })
    assert.deepEqual(edit.expected, { kid_explanation: text, kid_explanation_confidence: 0 })
  }
})

async function mounted(source, run, online = true) {
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container)
  const saved = []
  let current = record
  const render = () => root.render(React.createElement(KidExplanationChoice, { key: JSON.stringify(current), record: current, source, online, onSaved: result => { saved.push(result); current = result.record; render() } }))
  try { await act(render); await run(container, saved) } finally { await act(() => root.unmount()); container.remove() }
}
const click = element => act(async () => { element.click() })
const option = (container, index) => container.querySelectorAll('.tv-kid-option input')[index]
const score = (container, value) => container.querySelector(`.tv-kid-scores input[value="${value}"]`)
const enter = container => container.querySelector('button[type="submit"]')

test('tap option, confidence zero, Enter makes one paired save and removes alternatives', async () => {
  const calls = []
  const source = { edit: async (...args) => { calls.push(args); return { record: { ...record, ...args[1] }, log: { status: 'pending' }, auditId: 'test-audit' } } }
  await mounted(source, async (container, saved) => {
    assert.equal(container.querySelectorAll('input:checked').length, 0)
    assert.equal(enter(container), null)
    await click(option(container, 1))
    assert.equal(enter(container).disabled, true)
    assert.equal(calls.length, 0)
    await click(score(container, 0))
    assert.equal(enter(container).disabled, false)
    assert.equal(calls.length, 0)
    await click(enter(container))
    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0][1], kidChoiceEdit(record, 1, 0).changes)
    assert.deepEqual(calls[0][2], kidChoiceEdit(record, 1, 0).expected)
    assert.equal(saved.length, 1)
    assert.equal(container.querySelectorAll('input').length, 0)
    assert.equal(container.textContent, 'Think about your class.\nIt includes people and books.')
  })
})

test('changing an option resets confidence; Cancel writes nothing', async () => {
  let calls = 0
  await mounted({ edit: async () => { calls++; throw new Error('Unexpected save') } }, async container => {
    await click(option(container, 0)); await click(score(container, 3))
    await click(option(container, 2))
    assert.equal(container.querySelectorAll('.tv-kid-scores input:checked').length, 0)
    assert.equal(enter(container).disabled, true)
    await click(container.querySelector('button[type="button"]'))
    assert.equal(container.querySelectorAll('input:checked').length, 0)
    assert.equal(enter(container), null)
    assert.equal(calls, 0)
  })
})

test('failed saves preserve choices and retry with the same request ID', async () => {
  const calls = []
  await mounted({ edit: async (...args) => { calls.push(args); throw new Error('This field changed elsewhere. Refresh before saving.') } }, async (container, saved) => {
    await click(option(container, 4)); await click(score(container, 2)); await click(enter(container))
    assert.match(container.querySelector('[role="alert"]').textContent, /changed elsewhere/)
    assert.equal(option(container, 4).checked, true)
    assert.equal(score(container, 2).checked, true)
    assert.equal(saved.length, 0)
    await click(enter(container))
    assert.equal(calls[0][3], calls[1][3])
  })
})

test('double Enter while saving makes one request', async () => {
  let calls = 0; let finish
  await mounted({ edit: (...args) => { calls++; return new Promise(resolve => { finish = () => resolve({ record: { ...record, ...args[1] }, log: { status: 'pending' } }) }) } }, async container => {
    await click(option(container, 0)); await click(score(container, 1))
    await act(() => {
      container.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
      container.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
    })
    assert.equal(calls, 1)
    assert.equal(enter(container).disabled, true)
    await act(async () => finish())
  })
})

test('offline and read-only views cannot select or save', async () => {
  await mounted({ edit: async () => { throw new Error('Unexpected save') } }, async container => {
    assert.equal(container.querySelector('fieldset').disabled, true)
    assert.match(container.textContent, /Reconnect/)
  }, false)
  await mounted({}, async container => {
    assert.equal(container.querySelector('fieldset').disabled, true)
    assert.match(container.textContent, /Read-only/)
  })
})
