import test from 'node:test'
import assert from 'node:assert/strict'

import {
  advanceWithoutEvidence,
  createInitialSession,
  recordAllOutcomeAndAdvance,
  recordStudentOutcome,
  undoSession,
} from '../src/phonics-swipe/state.ts'

test('individual student swipe records only that learner and leaves the card in place', () => {
  const initial = createInitialSession()
  const next = recordStudentOutcome(initial, 'a', 'produce_success', 100)

  assert.equal(next.cardIndex, 0)
  assert.deepEqual(next.unresolved, ['b', 'c'])
  assert.deepEqual(next.events, [
    { cardId: 'a', studentId: 'a', outcome: 'produce_success', createdAt: 100 },
  ])
})

test('main card advance creates no evidence and resets unresolved students', () => {
  const initial = recordStudentOutcome(createInitialSession(), 'a', 'produce_success', 100)
  const next = advanceWithoutEvidence(initial)

  assert.equal(next.cardIndex, 1)
  assert.deepEqual(next.unresolved, ['a', 'b', 'c'])
  assert.equal(next.events.length, 1)
})

test('ALL records only unresolved learners and advances', () => {
  const initial = recordStudentOutcome(createInitialSession(), 'b', 'produce_failure', 100)
  const next = recordAllOutcomeAndAdvance(initial, 'produce_success', 200)

  assert.equal(next.cardIndex, 1)
  assert.deepEqual(next.unresolved, ['a', 'b', 'c'])
  assert.deepEqual(next.events, [
    { cardId: 'a', studentId: 'b', outcome: 'produce_failure', createdAt: 100 },
    { cardId: 'a', studentId: 'a', outcome: 'produce_success', createdAt: 200 },
    { cardId: 'a', studentId: 'c', outcome: 'produce_success', createdAt: 200 },
  ])
})

test('undo restores card, unresolved learners, and evidence atomically', () => {
  const first = recordStudentOutcome(createInitialSession(), 'a', 'produce_success', 100)
  const second = recordAllOutcomeAndAdvance(first, 'imitate_success', 200)
  const restored = undoSession(second)

  assert.equal(restored.cardIndex, 0)
  assert.deepEqual(restored.unresolved, ['b', 'c'])
  assert.deepEqual(restored.events, [
    { cardId: 'a', studentId: 'a', outcome: 'produce_success', createdAt: 100 },
  ])
})

test('recording the same student twice is ignored', () => {
  const first = recordStudentOutcome(createInitialSession(), 'a', 'produce_success', 100)
  const second = recordStudentOutcome(first, 'a', 'produce_failure', 200)

  assert.deepEqual(second, first)
})
