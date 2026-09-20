import test from 'node:test'
import assert from 'node:assert/strict'

import {
  advanceWithoutEvidence,
  createInitialSession,
  recordAllOutcomeAndAdvance,
  recordObservation,
  recordStudentOutcome,
  undoSession,
} from '../src/phonics-swipe/state.ts'

test('production success resolves the learner', () => {
  const next = recordStudentOutcome(createInitialSession(), 'a', 'produce_success', 100)
  assert.deepEqual(next.unresolved, ['b', 'c'])
  assert.deepEqual(next.productionFailed, [])
})

test('production failure records evidence but keeps learner active for a later check', () => {
  const next = recordStudentOutcome(createInitialSession(), 'a', 'produce_failure', 100)
  assert.deepEqual(next.unresolved, ['a', 'b', 'c'])
  assert.deepEqual(next.productionFailed, ['a'])
  assert.equal(next.events.at(-1)?.outcome, 'produce_failure')
})

test('production success after a failure records the second attempt and resolves the learner', () => {
  const first = recordStudentOutcome(createInitialSession(), 'a', 'produce_failure', 100)
  const second = recordStudentOutcome(first, 'a', 'produce_success', 200)
  assert.deepEqual(second.unresolved, ['b', 'c'])
  assert.deepEqual(second.productionFailed, [])
  assert.deepEqual(second.events.map((event) => event.outcome), ['produce_failure', 'produce_success'])
})

test('imitation can be recorded without implying an earlier production failure', () => {
  const next = recordStudentOutcome(createInitialSession(), 'a', 'imitate_success', 100)
  assert.deepEqual(next.unresolved, ['b', 'c'])
  assert.deepEqual(next.productionFailed, [])
  assert.deepEqual(next.events.map((event) => event.outcome), ['imitate_success'])
})

test('observation updates attention state without resolving the learner', () => {
  const watched = recordObservation(createInitialSession(), 'a', 'watch_success', 100)
  const next = recordObservation(watched, 'a', 'listen_failure', 200)
  assert.deepEqual(next.unresolved, ['a', 'b', 'c'])
  assert.deepEqual(next.observations.a, { watch: 'positive', listen: 'negative' })
  assert.deepEqual(next.events.map((event) => event.outcome), ['watch_success', 'listen_failure'])
})

test('main card advance creates no new evidence and resets current-card markers', () => {
  const failed = recordStudentOutcome(createInitialSession(), 'a', 'produce_failure', 100)
  const observed = recordObservation(failed, 'b', 'watch_failure', 200)
  const next = advanceWithoutEvidence(observed)
  assert.equal(next.cardIndex, 1)
  assert.deepEqual(next.unresolved, ['a', 'b', 'c'])
  assert.deepEqual(next.productionFailed, [])
  assert.deepEqual(next.observations.a, { watch: null, listen: null })
  assert.deepEqual(next.observations.b, { watch: null, listen: null })
  assert.equal(next.events.length, 2)
})

test('ALL production failure keeps the card and learners active', () => {
  const next = recordAllOutcomeAndAdvance(createInitialSession(), 'produce_failure', 100)
  assert.equal(next.cardIndex, 0)
  assert.deepEqual(next.unresolved, ['a', 'b', 'c'])
  assert.deepEqual(next.productionFailed, ['a', 'b', 'c'])
  assert.equal(next.events.length, 3)
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

test('undo restores card markers and evidence atomically', () => {
  const failed = recordStudentOutcome(createInitialSession(), 'a', 'produce_failure', 100)
  const observed = recordObservation(failed, 'a', 'watch_success', 200)
  const restored = undoSession(observed)
  assert.deepEqual(restored.productionFailed, ['a'])
  assert.deepEqual(restored.observations.a, { watch: null, listen: null })
  assert.deepEqual(restored.events.map((event) => event.outcome), ['produce_failure'])
})

test('terminally resolved learner cannot be recorded again on the same card', () => {
  const first = recordStudentOutcome(createInitialSession(), 'a', 'produce_success', 100)
  const second = recordStudentOutcome(first, 'a', 'produce_failure', 200)
  assert.deepEqual(second, first)
})
