import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const index = await readFile(new URL('../public/logiq-v162-mobile/index.html', import.meta.url), 'utf8')
const js = await readFile(new URL('../public/logiq-v162-mobile/v2-ghost.js', import.meta.url), 'utf8')
const branchAffordance = await readFile(new URL('../public/logiq-v162-mobile/v2-branch-affordance.js', import.meta.url), 'utf8')
const dragVisualFix = await readFile(new URL('../public/logiq-v162-mobile/v2-drag-visual-fix.js', import.meta.url), 'utf8')
const chrome = await readFile(new URL('../public/logiq-v162-mobile/orientation-chrome.js', import.meta.url), 'utf8')
const flick = await readFile(new URL('../public/logiq-v162-mobile/direct-flick.js', import.meta.url), 'utf8')
const undoFix = await readFile(new URL('../public/logiq-v162-mobile/undo-bank-fix.js', import.meta.url), 'utf8')

test('mobile v2 shell stays isolated from the released v161 route', () => {
  assert.match(index, /src="\/logiq-v161\/"/)
  assert.match(index, /\.\/v2-ghost\.js/)
  assert.match(index, /\.\/v2-branch-affordance\.js/)
  assert.match(index, /\.\/v2-drag-visual-fix\.js/)
  assert.match(index, /\.\/orientation-chrome\.js/)
  assert.match(index, /\.\/undo-bank-fix\.js/)
  assert.match(index, /\.\/direct-flick\.js/)
  assert.doesNotMatch(index, /<script src="\.\/v2\.js"><\/script>/)
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
})

test('held-card drag keeps a ghost origin and defers the V2 fallback transaction until release', () => {
  assert.match(js, /v2-origin-ghost/)
  assert.match(js, /node\.classList\.add\('v2-origin-ghost'\)/)
  assert.match(js, /function commitDrop/)
  assert.match(js, /mouse\(node,win,'mousedown',sx,sy,1\)/)
  assert.match(js, /mouse\(win,win,'mouseup',x,y,0\)/)
})

test('mobile drag preview keeps exact card sizes and carries the whole subtree', () => {
  assert.match(branchAffordance, /hierarchy\.descendants\(\)/)
  assert.match(branchAffordance, /v2-branch-origin-ghost/)
  assert.match(branchAffordance, /logiq-v2-branch-preview/)
  assert.match(branchAffordance, /card\.style\.width = `\$\{entry\.rect\.width\}px`/)
  assert.match(branchAffordance, /card\.style\.height = `\$\{entry\.rect\.height\}px`/)
  assert.match(branchAffordance, /#logiq-v2-drag-card\{display:none!important\}/)
  assert.match(branchAffordance, /transform:none!important/)
  assert.doesNotMatch(branchAffordance, /scale\(1\.0?2\)/)
  assert.match(branchAffordance, /parentUid = entry\.item\?\.parent\?\.data\?\._uid/)
})

test('mobile held drag drives the real desktop drag feedback engine', () => {
  assert.match(branchAffordance, /mouse\(source, win, 'mousedown', hold\.x, hold\.y, 1\)/)
  assert.match(branchAffordance, /mouse\(win, win, 'mousemove', event\.clientX, event\.clientY, 1\)/)
  assert.match(branchAffordance, /mouse\(win, win, 'mouseup', endX, endY, 0\)/)
  assert.match(branchAffordance, /dragging-mode g\.nodes g\.node\.hover-adopt-sub/)
  assert.match(branchAffordance, /g\.node\.drop-target rect/)
  assert.match(branchAffordance, /shiftKey: false/)
  assert.match(branchAffordance, /startFeedbackLoop/)
})

test('mobile branch drag visually stays the same except ghost and green destination affordance', () => {
  assert.match(dragVisualFix, /\.drag-mini,g\.drag-mini\{display:none!important/)
  assert.match(dragVisualFix, /\.v2-float-node\.is-root\{border-color:#22c55e!important/)
  assert.doesNotMatch(dragVisualFix, /#2563eb/)
  assert.match(dragVisualFix, /v2-branch-origin-ghost\{opacity:\.44!important/)
  assert.match(dragVisualFix, /g\.node\.is-others\{opacity:1!important/)
  assert.match(dragVisualFix, /--det-node:transparent!important/)
  assert.match(dragVisualFix, /--det-cousin-r:transparent!important/)
  assert.match(dragVisualFix, /g\.node\.drop-target rect/)
})

test('mobile branch drag prevents hidden trash from stealing a drop', () => {
  assert.match(branchAffordance, /v2-branch-drag #trash/)
  assert.match(branchAffordance, /left:-10000px!important/)
  assert.match(branchAffordance, /top:-10000px!important/)
})

test('invalid held-card drop restores exact tree and bank state', () => {
  assert.match(js, /const missing = !treeHasUid/)
  assert.match(js, /if \(missing\)/)
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
  assert.doesNotThrow(() => new Function(branchAffordance))
  assert.doesNotThrow(() => new Function(dragVisualFix))
  assert.doesNotThrow(() => new Function(chrome))
  assert.doesNotThrow(() => new Function(flick))
  assert.doesNotThrow(() => new Function(undoFix))
})