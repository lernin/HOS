import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BASE_WALK_SPEED, MAX_WALK_SPEED, clampWalkingSpeed, effectiveWalkingSpeed } from '../src/experiences/estate/walkingSpeed.ts'
import { findRemoteDestination } from '../src/experiences/estate/remoteNavigation.ts'

test('fast walking has a 5x maximum without changing the default', () => {
  assert.equal(BASE_WALK_SPEED, 2.4)
  assert.equal(MAX_WALK_SPEED, BASE_WALK_SPEED * 5)
  assert.equal(MAX_WALK_SPEED, 12)
  assert.equal(clampWalkingSpeed(undefined), 2.4)
  assert.equal(clampWalkingSpeed(null), 2.4)
  assert.equal(clampWalkingSpeed(Infinity), 2.4)
  assert.equal(clampWalkingSpeed('12'), 2.4)
  assert.equal(clampWalkingSpeed(13), 12)
  assert.equal(clampWalkingSpeed(0), 1)
  assert.equal(clampWalkingSpeed(8.5), 8.5)
  assert.equal(effectiveWalkingSpeed(12, true), 12)
  assert.equal(effectiveWalkingSpeed(2.4, true), 3.48)
  assert.equal(effectiveWalkingSpeed(12, false), 12)
})

const canonical = [{ name: 'Entrance', x: 1 }, { name: 'Great room', x: 7 }, { name: 'Pool', x: 3 }]

test('phone menu accepts only exact canonical Estate destination names', () => {
  const target = findRemoteDestination(canonical, 'Great room')
  assert.equal(target, canonical[1])
  assert.equal(findRemoteDestination(canonical, 'Pool'), canonical[2])
  assert.equal(findRemoteDestination(canonical, 'great room'), null)
  assert.equal(findRemoteDestination(canonical, 'javascript:alert(1)'), null)
  assert.equal(findRemoteDestination(canonical, '__proto__'), null)
  assert.equal(findRemoteDestination(canonical, { name: 'Great room', x: 9999 }), null)
  assert.equal(findRemoteDestination(canonical, 'Pool '), null)
  assert.equal(findRemoteDestination(canonical, 0), null)
  assert.equal(findRemoteDestination(canonical, null), null)
  assert.equal(findRemoteDestination([], 'Pool'), null)
})
