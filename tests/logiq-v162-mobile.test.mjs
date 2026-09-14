import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const index = await readFile(new URL('../public/logiq-v162-mobile/index.html', import.meta.url), 'utf8')
const js = await readFile(new URL('../public/logiq-v162-mobile/v2.js', import.meta.url), 'utf8')

test('mobile v2 shell stays isolated from the released v161 route', () => {
  assert.match(index, /src="\/logiq-v161\/"/)
  assert.match(index, /\.\/v2\.js/)
  assert.doesNotMatch(index, /logiq-mobile-word-input/)
})

test('mobile v2 keeps navigation primary and removes persistent top chrome', () => {
  assert.match(js, /#logiq-mobile-header\{display:none!important\}/)
  assert.match(js, /svg#canvas g\.node\{pointer-events:none!important\}/)
  assert.match(js, /orientation:landscape/)
  assert.match(js, /logiq-v2-rail/)
})

test('mobile v2 uses tap-touch manipulation and blank-card local voice', () => {
  assert.match(js, /state\.lastTap\?\.uid === uid/)
  assert.match(js, /bridge\.createRelative\(dir\)/)
  assert.match(js, /Blank card created/)
  assert.match(js, /logiq-v2-action/)
  assert.match(js, /bridge\.renameNode\(uid,text\)/)
  assert.doesNotMatch(js, /startVoiceCapture/)
  assert.doesNotMatch(js, /triggerExistingSpawnGesture/)
})

test('mobile v2 script parses', () => {
  assert.doesNotThrow(() => new Function(js))
})
