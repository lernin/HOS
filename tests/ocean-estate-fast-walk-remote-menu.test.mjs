import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BASE_WALK_SPEED, MAX_WALK_SPEED, clampWalkingSpeed } from '../src/experiences/estate/walkingSpeed.ts'
import { remoteDestinationNames, findRemoteDestination } from '../src/experiences/estate/remoteNavigation.ts'
import { destinations } from '../src/experiences/estate/plan.ts'

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
})

test('phone menu exposes current canonical Estate destination list only', () => {
  assert.deepEqual(remoteDestinationNames, destinations.map(d => d.name))
  assert.ok(remoteDestinationNames.length > 9)
  assert.equal(new Set(remoteDestinationNames).size, remoteDestinationNames.length)
})

test('remote navigation accepts only the exact canonical destination name', () => {
  const target = findRemoteDestination('Great room')
  assert.equal(target?.name, 'Great room')
  assert.equal(target?.x, destinations.find(d => d.name === 'Great room')?.x)
  assert.equal(findRemoteDestination('great room'), null)
  assert.equal(findRemoteDestination('javascript:alert(1)'), null)
  assert.equal(findRemoteDestination('__proto__'), null)
  assert.equal(findRemoteDestination({ name: 'Great room', x: 9999 }), null)
  assert.equal(findRemoteDestination('Ocean lookout '), null)
})
