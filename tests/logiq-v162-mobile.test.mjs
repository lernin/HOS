import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const index = await readFile(new URL('../public/logiq-v162-mobile/index.html', import.meta.url), 'utf8')
const core = await readFile(new URL('../public/logiq-v161/index.html', import.meta.url), 'utf8')
const preview = await readFile(new URL('../public/logiq-v161/logiq-preview.js', import.meta.url), 'utf8')
const js = await readFile(new URL('../public/logiq-v162-mobile/v2-ghost.js', import.meta.url), 'utf8')
const chrome = await readFile(new URL('../public/logiq-v162-mobile/orientation-chrome.js', import.meta.url), 'utf8')
const flick = await readFile(new URL('../public/logiq-v162-mobile/direct-flick.js', import.meta.url), 'utf8')
const undoFix = await readFile(new URL('../public/logiq-v162-mobile/undo-bank-fix.js', import.meta.url), 'utf8')

test('mobile v2 shell stays isolated from the released v161 route', () => {
  assert.match(index, /src="\/logiq-v161\/"/)
  assert.match(index, /\.\/v2-ghost\.js/)
  assert.doesNotMatch(index, /\.\/v2-branch-affordance\.js/)
  assert.doesNotMatch(index, /\.\/v2-drag-visual-fix\.js/)
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

test('mobile v2 keeps pinch continuous below the desktop zoom floor', () => {
  assert.match(preview, /const ZOOM_MIN = 0\.02/)
  assert.match(core, /setZoomExtent\(extent\)/)
  assert.match(core, /getZoomExtent\(\)/)
  assert.match(core, /getZoomScale\(\)/)
  assert.match(core, /scaleZoomTo\(value\)/)
  assert.match(preview, /bridge\.setZoomExtent\(\[ZOOM_MIN, 2\.4\]\)/)
  assert.match(preview, /window\.LOGiQZoom = Object\.freeze/)
})

test('mobile ghost drag is the sole held-gesture owner and protects the Word Bank', () => {
  assert.doesNotMatch(js, /__logiqBranchDragOwnsHold/)
  assert.match(js, /function latchHold/)
  assert.match(js, /const missing = !treeHasUid/)
  assert.match(js, /bridge\.loadMap\(g\.before\.tree,g\.before\.wordBank\)/)
})

test('held-card drag keeps the complete source branch ghosted until release', () => {
  assert.match(js, /v2-origin-ghost/)
  assert.match(js, /const ghostUids = typeof hierarchy\?\.descendants[\s\S]*?hierarchy\.descendants\(\)/)
  assert.match(js, /for \(const uid of ghostUids\) nodeByUid\(doc,uid\)\?\.classList\.add\('v2-origin-ghost'\)/)
  assert.match(js, /for \(const uid of g\.ghostUids \|\| \[\]\) nodeByUid\(doc,uid\)\?\.classList\.remove\('v2-origin-ghost'\)/)
  assert.match(js, /function commitDrop/)
  assert.match(js, /mouse\(node,win,'mousedown',sx,sy,1\)/)
  assert.match(js, /mouse\(win,win,'mouseup',x,y,0\)/)
})

test('mobile drag preview keeps the held card at its exact rendered size', () => {
  assert.match(js, /function makeFloating/)
  assert.match(js, /Math\.max\(54,rect\.width\)/)
  assert.match(js, /Math\.max\(34,rect\.height\)/)
  assert.match(js, /#logiq-v2-drag-card\{[^}]*transform:none/)
})

test('mobile selection preserves the card geometry instead of scaling its rectangle', () => {
  assert.match(js, /g\.node\.is-outlined rect:not\(\.grabzone\),\s+body\.logiq-mobile-v2 g\.node\.is-filled rect:not\(\.grabzone\)\{transform:none!important/)
})

test('mobile editor overlays the card and centers it horizontally', () => {
  assert.match(js, /centerX = Math\.round\(win\.innerWidth \/ 2\)/)
  assert.match(js, /input\.style\.height=/)
  assert.match(js, /input\.style\.left=/)
  assert.match(js, /input\.style\.top=/)
})

test('mobile held drag defers the desktop transaction until release', () => {
  assert.match(js, /updateFloating\(doc,win,g,e\.clientX,e\.clientY\)/)
  assert.match(js, /function commitDrop/)
  assert.match(js, /mouse\(node,win,'mousedown',sx,sy,1\)/)
  assert.doesNotMatch(js, /startFeedbackLoop/)
})

test('mobile held drag mirrors the desktop sensing cues without moving the tree', () => {
  assert.match(js, /function updateDropHint/)
  assert.match(js, /function findDropHint/)
  assert.match(js, /hitNode\(doc,x,y/)
  assert.match(js, /screenToGraph/)
  assert.match(js, /v2-drop-target/)
  assert.match(js, /v2-drop-caret/)
  assert.match(js, /#f59e0b/)
  assert.match(js, /#64748b/)
  assert.doesNotMatch(js, /Detectors\.pick/)
  assert.doesNotMatch(js, /startFeedbackLoop/)
})

test('mobile ghost drag leaves the map untouched while it follows the finger', () => {
  assert.match(js, /body\.logiq-mobile-v2\.v2-drag svg#canvas\{cursor:grabbing\}/)
  assert.match(js, /body\.logiq-mobile-v2 g\.node\.v2-origin-ghost/)
  assert.doesNotMatch(index, /v2-branch-affordance/)
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
  assert.doesNotThrow(() => new Function(chrome))
  assert.doesNotThrow(() => new Function(flick))
  assert.doesNotThrow(() => new Function(undoFix))
})