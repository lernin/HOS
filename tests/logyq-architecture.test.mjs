import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { engineSource, logyqDir } from './logyq-source.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const indexPath = join(logyqDir, 'index.html')
const previewPath = join(logyqDir, 'logyq-preview.js')

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
  }
})

test('isolated copy retains the v161 engine markers and working controls', () => {
  const html = readFileSync(indexPath, 'utf8')
  const engine = engineSource()
  const preview = readFileSync(previewPath, 'utf8')

  assert.match(html, /<title>LOGYQ<\/title>/)
  assert.match(engine, /window\.LOGYQBridge = Object\.freeze/)
  assert.match(html, /<script src="\/logyq\/js\/engine\.js"><\/script>/)
  assert.match(html, /<script src="\/logyq\/logyq-preview\.js"><\/script>/)
  assert.match(preview, /const bridge = window\.LOGYQBridge/)
  assert.match(preview, /logyq_current_map_v1/)
  assert.match(preview, /logyq_pending_save_v1/)
  assert.doesNotMatch(preview, /logiq_v161_current_map_v1|logiq_v161_pending_save_v1/)

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

test('LOGYQ preview still targets the existing production RPC surface', () => {
  const preview = readFileSync(previewPath, 'utf8')
  assert.match(preview, /jzaghifuhinkzzhiojre\.supabase\.co/)
  for (const rpc of ['logiq_map_save', 'logiq_map_list', 'logiq_map_delete']) {
    assert.ok(preview.includes(rpc), `missing production RPC: ${rpc}`)
  }
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
