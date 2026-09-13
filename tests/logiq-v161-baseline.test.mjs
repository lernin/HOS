import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const legacyPath = new URL('../public/logiq-v161-legacy/index.html', import.meta.url)
const loaderPath = new URL('../public/logiq-v161/index.html', import.meta.url)
const expectedSourceSha = '14ba1d93c5ea9a772b7b0118a2ba5de6702164b222b8a93f4c35681ab64da66b'

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function compressedSource() {
  const parts = Array.from({ length: 7 }, (_, index) => {
    const name = `../public/logiq-v161/parts/part-${String(index + 1).padStart(3, '0')}.b64`
    return readFileSync(new URL(name, import.meta.url), 'utf8').replace(/\s/g, '')
  }).join('')
  assert.equal(parts.length, 78_920)
  return gunzipSync(Buffer.from(parts, 'base64'))
}

test('immutable legacy source matches the recovered v161 payload', () => {
  const legacy = readFileSync(legacyPath)
  const recovered = compressedSource()
  assert.equal(sha256(legacy), expectedSourceSha)
  assert.equal(sha256(recovered), expectedSourceSha)
  assert.deepEqual(legacy, recovered)
})

test('baseline loader writes the recovered source without runtime patches', () => {
  const loader = readFileSync(loaderPath, 'utf8')
  assert.match(loader, /b64\.length !== 78920/)
  assert.match(loader, /document\.write\(html\)/)
  assert.doesNotMatch(loader, /patchLogiq|LOGIQ_SUPABASE|saveCurrentMap\s*=\s*async/)
})

test('legacy inline script parses and retains the core architecture', () => {
  const html = readFileSync(legacyPath, 'utf8')
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1])
    .filter(Boolean)

  assert.equal(scripts.length, 1)
  assert.doesNotThrow(() => new Function(scripts[0]))

  for (const marker of [
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
  ]) assert.ok(html.includes(marker), `missing legacy marker: ${marker}`)
})

test('legacy DOM exposes the expected working controls and canvas', () => {
  const html = readFileSync(legacyPath, 'utf8')
  for (const id of [
    'wordInput', 'addWordBtn', 'undoBtn', 'mixBtn', 'mapsBtn', 'fitBtn',
    'settingsBtn', 'helpBtn', 'Dock', 'Toast', 'canvas', 'trash',
  ]) assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`)

  assert.doesNotMatch(html, /id=["']saveBtn["']/)
  assert.doesNotMatch(html, /supabase\.co|LOGIQ_SUPABASE/)
})

