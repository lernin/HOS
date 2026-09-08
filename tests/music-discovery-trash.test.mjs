import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const source = readFileSync(new URL('../src/experiences/musicDiscoveryTrash.ts', import.meta.url), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const {
  hasZeroRating,
  trashToggleVisible,
  leaveDecision,
  ratingChangeDecision,
  nextIndexAfterRemoving,
  filterCatalogForBrowse,
  hydrateTrashedIds,
  isDurablyDumped,
  persistTrashToggle,
} = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)

test('unset ratings are not zeros; only explicit 0 counts as trash bait', () => {
  assert.equal(hasZeroRating(undefined, undefined, undefined), false)
  assert.equal(hasZeroRating(null, 2, 3), false)
  assert.equal(hasZeroRating(1, 2, 3), false)
  assert.equal(hasZeroRating(0, 3, 3), true)
  assert.equal(hasZeroRating(3, 0, 2), true)
  assert.equal(hasZeroRating(2, 2, 0), true)
})

test('trash toggle is hidden unless a rating is zero', () => {
  assert.equal(trashToggleVisible(undefined, undefined, undefined), false)
  assert.equal(trashToggleVisible(3, 2, 1), false)
  assert.equal(trashToggleVisible(0, 3, 3), true)
  assert.equal(trashToggleVisible(2, 0, 3), true)
  assert.equal(trashToggleVisible(3, 3, 0), true)
})

test('swipe-away with any zero trashes; leftover zero cannot stay out', () => {
  assert.equal(leaveDecision(true, false), 'trash')
  assert.equal(leaveDecision(true, true), 'trash')
})

test('leaving with no zeros pulls a dumped track back out', () => {
  assert.equal(leaveDecision(false, true), 'untrash')
  assert.equal(leaveDecision(false, false), 'keep')
})

test('clearing every zero immediately releases trash; setting a zero does not dump until leave', () => {
  assert.equal(ratingChangeDecision(false, true), 'untrash')
  assert.equal(ratingChangeDecision(true, false), 'keep')
  assert.equal(ratingChangeDecision(true, true), 'keep')
  assert.equal(ratingChangeDecision(false, false), 'keep')
})

test('dumped then toggle trash off then clearing zeros still queues server untrash', () => {
  const status = 'rejected'
  const pending = {}
  const localTrashed = false
  assert.equal(isDurablyDumped(status, pending.action), true)
  assert.equal(ratingChangeDecision(true, localTrashed, true), 'keep')
  assert.equal(ratingChangeDecision(false, localTrashed, isDurablyDumped(status, pending.action)), 'untrash')
  assert.equal(leaveDecision(false, localTrashed, isDurablyDumped(status, pending.action)), 'untrash')
  const queued = { x:{ action:'untrash' } }
  assert.equal(hydrateTrashedIds([{ id:'x', status }], queued).x, undefined)
})

test('trash icon persists rejected state on and off', () => {
  assert.equal(persistTrashToggle(true, true), 'trash')
  assert.equal(persistTrashToggle(false, true), 'untrash')
  assert.equal(persistTrashToggle(true, false), null)
  assert.equal(persistTrashToggle(false, false), null)
  assert.equal(hydrateTrashedIds([{ id:'on', status:'candidate' }], { on:{ action:'trash' } }).on, true)
  assert.equal(hydrateTrashedIds([{ id:'off', status:'rejected' }], { off:{ action:'untrash' } }).off, undefined)
  assert.equal(leaveDecision(true, false, false), 'trash')
})

test('removing a dumped card keeps the neighbor that swipe was heading toward', () => {
  assert.equal(nextIndexAfterRemoving(0, 3, 1), 0)
  assert.equal(nextIndexAfterRemoving(2, 3, 1), 0)
  assert.equal(nextIndexAfterRemoving(1, 3, -1), 0)
  assert.equal(nextIndexAfterRemoving(0, 1, 1), 0)
})

test('dumpster browse shows only dumped rows; the main list hides them', () => {
  const items = [{ id:'keep' }, { id:'dumped' }]
  const trashed = { dumped:true }
  assert.deepEqual(filterCatalogForBrowse(items, trashed, false).map(item => item.id), ['keep'])
  assert.deepEqual(filterCatalogForBrowse(items, trashed, true).map(item => item.id), ['dumped'])
})

test('pending trash queue and rejected status hydrate the dumpster without deleting rows', () => {
  const items = [
    { id:'a', status:'candidate' },
    { id:'b', status:'rejected' },
    { id:'c', status:'rejected' },
    { id:'d', status:'candidate' },
  ]
  const pending = {
    a:{ action:'trash' },
    c:{ action:'untrash' },
    d:{},
  }
  assert.deepEqual(hydrateTrashedIds(items, pending), { a:true, b:true, d:true })
})
