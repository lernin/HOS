import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { assembleLogyqEngine, assembleLogyqPreview } from '../scripts/assemble-logyq.mjs'
import { engineSource, logyqDir } from './logyq-source.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const indexPath = join(logyqDir, 'index.html')
const previewPath = join(logyqDir, 'js/preview.js')

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) walk(path, files)
    else files.push(path)
  }
  return files
}

test('LOGYQ lives only under public/logyq and does not import v161 asset paths', () => {
  const files = walk(logyqDir).filter((path) => /\.(html|js|css)$/.test(path))
  assert.ok(files.length > 0)
  for (const path of files) {
    const text = readFileSync(path, 'utf8')
    assert.doesNotMatch(text, /\/logiq-v161\//, relative(root, path))
    assert.doesNotMatch(text, /LOGiQBridge/)
    assert.doesNotMatch(text, /logiq-preview\.js/)
    assert.doesNotMatch(text, /\/logyq\/logyq-preview\.js/)
  }
})

test('isolated copy retains the v161 engine markers and working controls', () => {
  const html = readFileSync(indexPath, 'utf8')
  const engine = engineSource()
  const preview = readFileSync(previewPath, 'utf8')

  assert.match(html, /<title>LOGYQ<\/title>/)
  assert.match(engine, /window\.LOGYQBridge = Object\.freeze/)
  assert.match(html, /<script src="\/logyq\/js\/engine\.js"><\/script>/)
  assert.match(html, /<script src="\/logyq\/js\/preview\.js"><\/script>/)
  assert.match(preview, /const bridge = window\.LOGYQBridge/)
  assert.match(preview, /logyq_current_map_v1/)
  assert.match(preview, /logyq_pending_save_v1/)
  assert.doesNotMatch(preview, /logiq_v161_current_map_v1|logiq_v161_pending_save_v1/)
  assert.doesNotMatch(preview, /logiq_lab_pin_v1/)

  for (const marker of [
    'const CONFIG =',
    'const state =',
    'const utils =',
    'const Detectors =',
    'const dragManager =',
    'const treeManager =',
    'function keyDispatcher',
    'function randomizeTree',
    'function undo',
    'function openNodeEditor',
    'function moveSelectedVertically',
    'function moveSelectedHorizontally',
    'function sendSubtreeToWordBank',
    'function deleteNodesToTrash',
  ]) assert.ok(engine.includes(marker), `missing engine marker: ${marker}`)

  for (const id of [
    'wordInput', 'addWordBtn', 'undoBtn', 'mixBtn', 'mapsBtn', 'fitBtn',
    'settingsBtn', 'helpBtn', 'Dock', 'Toast', 'canvas', 'trash',
  ]) assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`)

  assert.doesNotMatch(html, /id=["']saveBtn["']/)
})

test('LOGYQ preview persists maps locally and does not call production LOGiQ RPCs', () => {
  const preview = readFileSync(previewPath, 'utf8')
  const engine = engineSource()
  assert.match(preview, /logyq_lab_pin_v1/)
  assert.match(preview, /logyq_current_map_v1/)
  assert.match(preview, /logyq_pending_save_v1/)
  assert.match(preview, /logyq_maps_v1/)
  assert.doesNotMatch(preview, /logiq_lab_pin_v1/)
  assert.doesNotMatch(preview, /logiq_v161_current_map_v1|logiq_v161_pending_save_v1/)
  assert.doesNotMatch(preview, /jzaghifuhinkzzhiojre\.supabase\.co/)
  for (const rpc of ['logiq_map_save', 'logiq_map_list', 'logiq_map_delete']) {
    assert.doesNotMatch(preview, new RegExp(rpc))
    assert.doesNotMatch(engine, new RegExp(rpc))
  }
  assert.match(engine, /logyq_saved_maps_v1/)
  assert.match(engine, /logyq_ashley_user_v1/)
  assert.doesNotMatch(engine, /savedMaps_v1/)
  assert.doesNotMatch(engine, /["']ashleyUser["']/)
})

test('engine exposes a shared logyq API bag that fragments register onto', () => {
  const engine = engineSource()
  assert.match(engine, /const logyq = \{/)
  assert.match(engine, /function attach\(name, value\)/)
  assert.match(engine, /core: logyq/)
  for (const call of [
    "attach('config', CONFIG)",
    "attach('state', state)",
    "attach('elements', elements)",
    "attach('utils', utils)",
    "attach('history', { pushHistory, undo, autoFitSoon })",
    "attach('detectors', Detectors)",
    "attach('editing', {",
    "attach('selection', {",
    "attach('drag', dragManager)",
    "attach('treeManager', treeManager)",
  ]) assert.ok(engine.includes(call), call)
  const config = readFileSync(join(logyqDir, 'js/engine/01-config.js'), 'utf8')
  const editing = readFileSync(join(logyqDir, 'js/engine/09-editing.js'), 'utf8')
  const selection = readFileSync(join(logyqDir, 'js/engine/10-selection.js'), 'utf8')
  assert.match(config, /const \{ elements, state \} = logyq/)
  assert.match(config, /const \{ state, moat \} = logyq/)
  assert.match(editing, /attach\('editing'/)
  assert.match(selection, /attach\('selection'/)
  assert.match(editing, /const \{ state, elements, config: CONFIG \} = logyq/)
  assert.match(selection, /const \{ state, elements \} = logyq/)
  assert.match(editing, /setSelectionSet\(merged\)/)
  assert.doesNotMatch(engine, /function setSelectionSet/)
})

test('copied engine script parses', () => {
  assert.doesNotThrow(() => new Function(engineSource()))
  assert.ok(statSync(join(logyqDir, 'logos/LOGO_GREEN_Q.svg')).isFile())
})

test('theme styles live in the extracted stylesheet', () => {
  const html = readFileSync(indexPath, 'utf8')
  const css = readFileSync(join(logyqDir, 'css/app.css'), 'utf8')
  assert.match(html, /href="\/logyq\/css\/app\.css"/)
  assert.doesNotMatch(html, /<style>/)
  for (const marker of ['#trash', '#Dock', 'g.node', '.global-no-cursor', '--card-color']) {
    assert.ok(css.includes(marker), `missing css marker: ${marker}`)
  }
})

test('engine fragments concatenate to the served IIFE without edits', () => {
  const assembled = assembleLogyqEngine()
  assert.equal(assembled.names.length, 21)
  assert.deepEqual(assembled.names[0], '00-iife-open.js')
  assert.deepEqual(assembled.names[1], '00-api.js')
  assert.deepEqual(assembled.names.at(-1), '19-iife-close.js')
  assert.equal(assembled.source, engineSource())
  for (const name of [
    '00-api.js', '01-config.js', '03-utils.js', '05-history.js', '08-detectors.js',
    '10-selection.js', '13-drag.js', '16-tree-manager.js', '17-keyboard.js', '18-bridge.js',
  ]) assert.ok(assembled.names.includes(name), name)
})

test('preview fragments concatenate to the served enhancement without edits', () => {
  const assembled = assembleLogyqPreview()
  assert.deepEqual(assembled.names, [
    '00-boot.js', '01-helpers.js', '02-styles.js', '03-ui.js', '04-gestures.js', '05-persistence.js',
  ])
  assert.equal(assembled.source, readFileSync(previewPath, 'utf8'))
  assert.match(assembled.source, /function queueAutosave/)
  assert.match(assembled.source, /function beginSpawnGesture/)
  assert.match(assembled.source, /function injectStyles/)
})

test('this branch does not modify existing logiq-* files', () => {
  const names = execFileSync('git', ['diff', '--name-only', 'origin/main...HEAD'], { encoding: 'utf8' })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' })
  const touched = [
    ...names,
    ...dirty.split('\n').map((line) => line.slice(3).trim()),
  ].filter(Boolean)
  const forbidden = touched.filter((name) => /(^|\/)logiq/i.test(name) && !name.startsWith('public/logyq/'))
  assert.deepEqual(forbidden, [])
})
