import test from 'node:test'
import assert from 'node:assert/strict'

import {
  PHONICS_DECKS,
  advanceWithoutEvidence,
  createInitialSession,
  recordAllOutcomeAndAdvance,
  recordObservation,
  recordStudentOutcome,
  setDeckMode,
  undoSession,
} from '../src/phonics-swipe/state.ts'

test('alphabet is the default deck and contains all 26 letters', () => {
  const initial = createInitialSession()
  assert.equal(initial.deckMode, 'alphabet')
  assert.equal(PHONICS_DECKS.alphabet.length, 26)
  assert.deepEqual(PHONICS_DECKS.alphabet.map((card) => card.label), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''))
})

test('prototype exposes blends, digraphs, and trigraphs decks', () => {
  assert.ok(PHONICS_DECKS.blends.some((card) => card.label === 'PL'))
  assert.ok(PHONICS_DECKS.digraphs.some((card) => card.label === 'CH'))
  assert.ok(PHONICS_DECKS.trigraphs.some((card) => card.label === 'TCH'))
})

test('production success resolves the learner', () => {
  const next = recordStudentOutcome(createInitialSession(), 'a', 'produce_success', 100)
  assert.deepEqual(next.unresolved, ['b', 'c'])
  assert.deepEqual(next.productionFailed, [])
  assert.equal(next.events.at(-1)?.deckMode, 'alphabet')
})

test('production failure records evidence but keeps learner active', () => {
  const next = recordStudentOutcome(createInitialSession(), 'a', 'produce_failure', 100)
  assert.deepEqual(next.unresolved, ['a', 'b', 'c'])
  assert.deepEqual(next.productionFailed, ['a'])
  assert.equal(next.events.at(-1)?.outcome, 'produce_failure')
})

test('swiping production failure twice toggles the mistaken note off', () => {
  const first = recordStudentOutcome(createInitialSession(), 'a', 'produce_failure', 100)
  const second = recordStudentOutcome(first, 'a', 'produce_failure', 200)
  assert.deepEqual(second.productionFailed, [])
  assert.equal(second.events.some((event) => event.studentId === 'a' && event.outcome === 'produce_failure'), false)
  assert.deepEqual(second.unresolved, ['a', 'b', 'c'])
})

test('production success after a failure preserves both attempts then resolves learner', () => {
  const first = recordStudentOutcome(createInitialSession(), 'a', 'produce_failure', 100)
  const second = recordStudentOutcome(first, 'a', 'produce_success', 200)
  assert.deepEqual(second.unresolved, ['b', 'c'])
  assert.deepEqual(second.productionFailed, [])
  assert.deepEqual(second.events.map((event) => event.outcome), ['produce_failure', 'produce_success'])
})

test('imitation can be recorded without implying a production failure', () => {
  const next = recordStudentOutcome(createInitialSession(), 'a', 'imitate_success', 100)
  assert.deepEqual(next.unresolved, ['b', 'c'])
  assert.deepEqual(next.productionFailed, [])
  assert.deepEqual(next.events.map((event) => event.outcome), ['imitate_success'])
})

test('observation can be toggled off by repeating the same swipe', () => {
  const watched = recordObservation(createInitialSession(), 'a', 'watch_success', 100)
  const cleared = recordObservation(watched, 'a', 'watch_success', 200)
  assert.deepEqual(cleared.observations.a, { watch: null, listen: null })
  assert.equal(cleared.events.some((event) => event.outcome === 'watch_success'), false)
})

test('opposite observation replaces the current per-card observation', () => {
  const watched = recordObservation(createInitialSession(), 'a', 'watch_success', 100)
  const next = recordObservation(watched, 'a', 'watch_failure', 200)
  assert.deepEqual(next.observations.a, { watch: 'negative', listen: null })
  assert.deepEqual(next.events.map((event) => event.outcome), ['watch_failure'])
})

test('main card advance creates no new evidence and resets current-card markers', () => {
  const failed = recordStudentOutcome(createInitialSession(), 'a', 'produce_failure', 100)
  const observed = recordObservation(failed, 'b', 'watch_failure', 200)
  const next = advanceWithoutEvidence(observed)
  assert.equal(next.cardIndex, 1)
  assert.deepEqual(next.unresolved, ['a', 'b', 'c'])
  assert.deepEqual(next.productionFailed, [])
  assert.deepEqual(next.observations.b, { watch: null, listen: null })
  assert.equal(next.events.length, 2)
})

test('ALL production failure toggles all unresolved learners on then off', () => {
  const first = recordAllOutcomeAndAdvance(createInitialSession(), 'produce_failure', 100)
  assert.equal(first.cardIndex, 0)
  assert.deepEqual(first.productionFailed, ['a', 'b', 'c'])
  assert.equal(first.events.length, 3)

  const second = recordAllOutcomeAndAdvance(first, 'produce_failure', 200)
  assert.equal(second.cardIndex, 0)
  assert.deepEqual(second.productionFailed, [])
  assert.equal(second.events.length, 0)
})

test('ALL terminal outcome applies only to unresolved learners and advances', () => {
  const initial = recordStudentOutcome(createInitialSession(), 'b', 'produce_success', 100)
  const next = recordAllOutcomeAndAdvance(initial, 'imitate_success', 200)
  assert.equal(next.cardIndex, 1)
  assert.deepEqual(next.unresolved, ['a', 'b', 'c'])
  assert.deepEqual(next.events.map((event) => [event.studentId, event.outcome]), [
    ['b', 'produce_success'],
    ['a', 'imitate_success'],
    ['c', 'imitate_success'],
  ])
})

test('changing deck resets card markers but preserves prior evidence', () => {
  const failed = recordStudentOutcome(createInitialSession(), 'a', 'produce_failure', 100)
  const next = setDeckMode(failed, 'blends')
  assert.equal(next.deckMode, 'blends')
  assert.equal(next.cardIndex, 0)
  assert.deepEqual(next.productionFailed, [])
  assert.deepEqual(next.unresolved, ['a', 'b', 'c'])
  assert.equal(next.events.length, 1)
})

test('undo restores deck, markers, and evidence atomically', () => {
  const failed = recordStudentOutcome(createInitialSession(), 'a', 'produce_failure', 100)
  const changed = setDeckMode(failed, 'digraphs')
  const restored = undoSession(changed)
  assert.equal(restored.deckMode, 'alphabet')
  assert.deepEqual(restored.productionFailed, ['a'])
  assert.deepEqual(restored.events.map((event) => event.outcome), ['produce_failure'])
})
