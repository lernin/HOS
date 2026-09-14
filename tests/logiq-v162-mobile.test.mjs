import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const index = await readFile(new URL('../public/logiq-v162-mobile/index.html', import.meta.url), 'utf8')
const js = await readFile(new URL('../public/logiq-v162-mobile/v2.js', import.meta.url), 'utf8')
const chrome = await readFile(new URL('../public/logiq-v162-mobile/orientation-chrome.js', import.meta.url), 'utf8')
const flick = await readFile(new URL('../public/logiq-v162-mobile/direct-flick.js', import.meta.url), 'utf8')
const undoFix = await readFile(new URL('../public/logiq-v162-mobile/undo-bank-fix.js', import.meta.url), 'utf8')

test('mobile v2 shell stays isolated from the released v161 route', () => {
  assert.match(index, /src="\/logiq-v161\/"/)
  assert.match(index, /\.\/v2\.js/)
  assert.match(index, /\.\/orientation-chrome\.js/)
  assert.match(index, /\.\/undo-bank-fix\.js/)
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
  assert.match(flick, /__logiqV2ConsumedPointers/)
  assert.match(flick, /bridge\.createRelative\(direction\)/)
  assert.match(flick, /restoreView\(doc, win, candidate\.view\)/)
  assert.doesNotMatch(flick, /MediaRecorder/)
  assert.doesNotMatch(flick, /startRecording/)
})

test('mobile v2 uses stationary hold to latch drag while preserving pinch and pan', () => {
  assert.match(js, /holdMs: 280/)
  assert.match(js, /holdSlop: 8/)
  assert.match(js, /setTimeout\(\(\) => latchHold/)
  assert.match(js, /if \(had\).*cancelHold/s)
  assert.match(js, /state\.active\.size !== 1/)
  assert.match(js, /__logiqV2ConsumedPointers\.add/)
  assert.doesNotMatch(js, /beginDrag\(doc,win,state,g\)/)
})

test('invalid or canceled held-card drag restores exact tree and bank state', () => {
  assert.match(js, /const missing = !treeHasUid/)
  assert.match(js, /if \(g\.cancel \|\| missing\)/)
  assert.match(js, /bridge\.loadMap\(g\.before\.tree,g\.before\.wordBank\)/)
})

test('Word Bank deletion is converted to one atomic tree+bank undo entry', () => {
  assert.match(undoFix, /action\.type === 'delete'/)
  assert.match(undoFix, /action\.type === 'delete-root'/)
  assert.match(undoFix, /beforeBank/)
  assert.match(undoFix, /type: 'replace-root'/)
  assert.match(undoFix, /prevBank: transaction\.beforeBank/)
})

test('mobile v2 keeps local blank-card voice and double-tap edit', () => {
  assert.match(js, /state\.lastTap\?\.uid === uid/)
  assert.match(js, /openEditor\(win,bridge,state,live,uid\)/)
  assert.match(js, /logiq-v2-action/)
  assert.match(js, /bridge\.renameNode\(uid,text\)/)
})

test('mobile v2 scripts parse', () => {
  assert.doesNotThrow(() => new Function(js))
  assert.doesNotThrow(() => new Function(chrome))
  assert.doesNotThrow(() => new Function(flick))
  assert.doesNotThrow(() => new Function(undoFix))
})
