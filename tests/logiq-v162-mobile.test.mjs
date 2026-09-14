import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const index = await readFile(new URL('../public/logiq-v162-mobile/index.html', import.meta.url), 'utf8')
const js = await readFile(new URL('../public/logiq-v162-mobile/v2.js', import.meta.url), 'utf8')
const chrome = await readFile(new URL('../public/logiq-v162-mobile/orientation-chrome.js', import.meta.url), 'utf8')
const flick = await readFile(new URL('../public/logiq-v162-mobile/direct-flick.js', import.meta.url), 'utf8')

test('mobile v2 shell stays isolated from the released v161 route', () => {
  assert.match(index, /src="\/logiq-v161\/"/)
  assert.match(index, /\.\/v2\.js/)
  assert.match(index, /\.\/orientation-chrome\.js/)
  assert.match(index, /\.\/direct-flick\.js/)
  assert.doesNotMatch(index, /logiq-mobile-word-input/)
})

test('mobile v2 keeps navigation primary with portrait header and landscape rail', () => {
  assert.match(js, /svg#canvas g\.node\{pointer-events:none!important\}/)
  assert.match(chrome, /orientation:portrait/)
  assert.match(chrome, /#logiq-mobile-header\{display:flex!important\}/)
  assert.match(chrome, /#logiq-v2-rail\{display:none!important\}/)
  assert.match(chrome, /orientation:landscape/)
  assert.match(chrome, /#logiq-mobile-header\{display:none!important\}/)
  assert.match(chrome, /#logiq-v2-rail\{display:flex!important\}/)
})

test('mobile v2 supports direct card flick creation without auto recording', () => {
  assert.match(flick, /const FLICK_MIN = 52/)
  assert.match(flick, /candidate\.multi/)
  assert.match(flick, /bridge\.createRelative\(direction\)/)
  assert.match(flick, /restoreView\(doc, win, candidate\.view\)/)
  assert.doesNotMatch(flick, /MediaRecorder/)
  assert.doesNotMatch(flick, /startRecording/)
})

test('mobile v2 retains tap-touch drag and local blank-card voice', () => {
  assert.match(js, /state\.lastTap\?\.uid === uid/)
  assert.match(js, /beginDrag\(doc,win,state,g\)/)
  assert.match(js, /logiq-v2-action/)
  assert.match(js, /bridge\.renameNode\(uid,text\)/)
})

test('mobile v2 scripts parse', () => {
  assert.doesNotThrow(() => new Function(js))
  assert.doesNotThrow(() => new Function(chrome))
  assert.doesNotThrow(() => new Function(flick))
})
