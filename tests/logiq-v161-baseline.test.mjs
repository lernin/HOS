import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const legacyPath = new URL('../public/logiq-v161-legacy/index.html', import.meta.url)
const loaderPath = new URL('../public/logiq-v161/index.html', import.meta.url)
const previewScriptPath = new URL('../public/logiq-v161/logiq-preview.js', import.meta.url)
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

test('working preview is derived from the baseline through one integration seam', () => {
  const baseline = readFileSync(legacyPath)
  const previewBytes = readFileSync(loaderPath)
  const preview = previewBytes.toString('utf8')
  const seam = previewBytes.indexOf(Buffer.from('/* LOGiQ v161 preview integration seam.'))
  assert.ok(seam > 240_000)
  let commonPrefix = 0
  while (previewBytes[commonPrefix] === baseline[commonPrefix]) commonPrefix += 1
  assert.ok(commonPrefix > 248_000, `legacy engine diverged too early at byte ${commonPrefix}`)
  assert.match(preview, /LOGiQ v161 preview integration seam/)
  assert.match(preview, /window\.LOGiQBridge = Object\.freeze/)
  assert.match(preview, /<script src="\/logiq-v161\/logiq-preview\.js"><\/script>/)
  assert.match(preview, /Vercel clean URLs remove the trailing slash/)
  assert.doesNotMatch(preview, /patchLogiq|document\.write\(html\)/)
})

test('preview persistence targets only the existing production RPC surface', () => {
  const script = readFileSync(previewScriptPath, 'utf8')
  assert.match(script, /jzaghifuhinkzzhiojre\.supabase\.co/)
  assert.doesNotMatch(script, /psfxnlrsaorrsdbadikk|logiq_maps(?:\?|\")/)
  for (const rpc of ['logiq_map_save', 'logiq_map_list', 'logiq_map_delete']) {
    assert.ok(script.includes(rpc), `missing production RPC: ${rpc}`)
  }
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
