import assert from 'node:assert/strict'
import { test } from 'node:test'
import { newRemoteCode, validRoom, validClient, sanitizeInput, joystickAxes, pairingUrl, stopMotionAfter, dropPairAfter } from '../src/experiences/estate/tvRemoteProtocol.ts'

test('only unpredictable, well-formed pairing and controller IDs are accepted', () => {
  const a = newRemoteCode(18), b = newRemoteCode(18), client = newRemoteCode(12)
  assert.match(a, /^[0-9a-f]{36}$/)
  assert.notEqual(a, b)
  assert.equal(validRoom(a), true)
  assert.equal(validRoom(a + '0'), false)
  assert.equal(validRoom('0'.repeat(36)), true)
  assert.equal(validRoom('javascript:alert(1)'), false)
  assert.equal(validClient(client), true)
  assert.equal(validClient(a), false)
})

test('pairing URL keeps the bearer code in the fragment, not query', () => {
  const url = pairingUrl('https://example.com', 'a'.repeat(36))
  assert.equal(url, 'https://example.com/estate-remote#pair=' + 'a'.repeat(36))
  assert.equal(new URL(url).search, '')
})

test('joystick orientation and dead zone match estate movement', () => {
  assert.deepEqual(joystickAxes(0, 0), { x: 0, z: 0 })
  assert.deepEqual(joystickAxes(0, -90), { x: 0, z: -1 })
  assert.deepEqual(joystickAxes(90, 0), { x: 1, z: 0 })
  assert.deepEqual(joystickAxes(0, 90), { x: 0, z: 1 })
  const diagonal = joystickAxes(120, 120)
  assert.ok(Math.hypot(diagonal.x, diagonal.z) <= 1.00001)
})

test('malformed and nonfinite remote motion cannot reach navigation', () => {
  assert.equal(sanitizeInput(null), null)
  assert.equal(sanitizeInput({ kind: 'motion', x: NaN, z: 0, dx: 0, dy: 0 }), null)
  assert.equal(sanitizeInput({ kind: 'motion', x: '1', z: 0, dx: 0, dy: 0 }), null)
  assert.equal(sanitizeInput({ kind: 'teleport', x: 0, z: 0 }), null)
  assert.deepEqual(sanitizeInput({kind:'motion',x:3,z:-4,dx:900,dy:-900}), {kind:'motion',x:1,z:-1,dx:30,dy:-30})
  assert.deepEqual(sanitizeInput({ kind: 'tap' }), { kind: 'tap' })
  assert.deepEqual(sanitizeInput({ kind: 'stop' }), { kind: 'stop' })
})

test('stale input stops and a lost controller releases the pairing', () => {
  assert.equal(stopMotionAfter(1000, 450), true)
  assert.equal(stopMotionAfter(1000, 850), false)
  assert.equal(dropPairAfter(4100, 1000), true)
  assert.equal(dropPairAfter(3900, 1000), false)
})
