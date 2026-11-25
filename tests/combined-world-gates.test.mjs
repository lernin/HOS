import assert from 'node:assert/strict'
import { test } from 'node:test'
import { estateCrossing, woodlandCrossing, ESTATE_GATE, WOODLAND_GATE } from '../src/experiences/combined/gates.ts'

test('the forest entrance stays on the real Estate arrival court', () => {
  assert.equal(ESTATE_GATE.x, 1)
  assert.ok(ESTATE_GATE.z >= 54 && ESTATE_GATE.z <= 60)
  assert.equal(estateCrossing({ x: 1, z: 57.9 }, true), false)
  assert.equal(estateCrossing({ x: 1, z: 59 }, false), false)
  assert.equal(estateCrossing({ x: 1, z: 59 }, true), true)
  assert.equal(estateCrossing({ x: 25, z: 59 }, true), false)
})

test('return gate is located just beyond the real forest spawn trail', () => {
  assert.ok(WOODLAND_GATE.z > 100 && WOODLAND_GATE.z < 120)
  assert.equal(woodlandCrossing({ x: WOODLAND_GATE.x, z: WOODLAND_GATE.z-4 }, true), false)
  assert.equal(woodlandCrossing({ x: WOODLAND_GATE.x, z: WOODLAND_GATE.z }, true), true)
  assert.equal(woodlandCrossing({ x: WOODLAND_GATE.x+25, z: WOODLAND_GATE.z }, true), false)
  assert.equal(woodlandCrossing({ x: WOODLAND_GATE.x, z: WOODLAND_GATE.z }, false), false)
})

test('gate comparisons reject invalid or untrusted coordinates', () => {
  assert.equal(estateCrossing({ x: NaN, z: 100 }, true), false)
  assert.equal(woodlandCrossing({ x: -8, z: Infinity }, true), false)
})
