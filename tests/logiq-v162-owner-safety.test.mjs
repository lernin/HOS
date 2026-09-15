import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const index = await readFile(new URL('../public/logiq-v162-mobile/index.html', import.meta.url), 'utf8')
const owner = await readFile(new URL('../public/logiq-v162-mobile/owner-device.js', import.meta.url), 'utf8')
const watchdog = await readFile(new URL('../public/logiq-v162-mobile/drag-watchdog.js', import.meta.url), 'utf8')

test('mobile shell wires owner device and drag watchdog after canonical branch drag', () => {
  assert.match(index, /\.\/v2-branch-affordance\.js/)
  assert.match(index, /\.\/drag-watchdog\.js/)
  assert.match(index, /\.\/owner-device\.js/)
  assert.ok(index.indexOf('./v2-branch-affordance.js') < index.indexOf('./drag-watchdog.js'))
})

test('owner device is remembered without creating a browser password login', () => {
  assert.match(owner, /DEVICE_PIN_KEY = 'logiq_owner_device_pin_v1'/)
  assert.match(owner, /localStorage\.setItem\(DEVICE_PIN_KEY, sessionPin\)/)
  assert.match(owner, /sessionStorage\.setItem\(SESSION_PIN_KEY, devicePin\)/)
  assert.match(owner, /input\.type = 'text'/)
  assert.match(owner, /input\.autocomplete = 'off'/)
  assert.match(owner, /form\.setAttribute\('autocomplete', 'off'\)/)
  assert.match(owner, /Paper will remember this device/)
  assert.match(owner, /Storage\.prototype\.removeItem/)
  assert.doesNotMatch(owner, /current-password|type=['"]password['"]/)
  assert.doesNotMatch(owner, /3476/)
})

test('drag watchdog hard-cancels interruptions and restores pre-drag state', () => {
  assert.match(watchdog, /IDLE_CANCEL_MS = 6000/)
  assert.match(watchdog, /new win\.PointerEvent\('pointercancel'/)
  assert.match(watchdog, /win\.addEventListener\('blur'/)
  assert.match(watchdog, /win\.addEventListener\('pagehide'/)
  assert.match(watchdog, /visibilitychange/)
  assert.match(watchdog, /lostpointercapture/)
  assert.match(watchdog, /second-touch/)
  assert.match(watchdog, /bridge\.loadMap\(before\.tree, before\.wordBank\)/)
  assert.match(watchdog, /logiq-v2-branch-preview/)
  assert.match(watchdog, /v2-branch-drag/)
})

test('owner and watchdog scripts parse', () => {
  assert.doesNotThrow(() => new Function(owner))
  assert.doesNotThrow(() => new Function(watchdog))
})
