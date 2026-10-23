import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { countryFromPath, fileStem, seriesFromName } from '../src/experiences/brush/names.ts'
import { eloUpdate, nextSigma } from '../src/experiences/brush/rank.ts'
import { suggestRecipe } from '../src/experiences/brush/recipe.ts'
import { retryDelayMs, takeBatch } from '../src/experiences/brush/uploads.ts'

test('elo matches the documented 1500 vs 1500 step', () => {
  const first = eloUpdate(1500, 1500, 0, 0, true)
  assert.equal(first.k, 48)
  assert.equal(first.eloA, 1524)
  assert.equal(first.eloB, 1476)
  const settled = eloUpdate(1500, 1500, 8, 8, true)
  assert.equal(settled.k, 24)
  assert.equal(settled.eloA, 1512)
  assert.equal(settled.eloB, 1488)
  assert.equal(nextSigma(350), 329)
  assert.equal(nextSigma(60), 60)
})

test('folder country and series come from the Drive path', () => {
  assert.equal(countryFromPath('Japan/Set A'), 'Japan')
  assert.equal(countryFromPath('Brush Uploads'), 'Uploads')
  assert.equal(countryFromPath(''), '')
  assert.equal(seriesFromName('Japan_Model_R5_03.jpg'), 'Model R5')
  assert.equal(fileStem('Japan/photo.prompt.txt'), 'photo')
})

test('recipe stays a suggestion and names turn-offs', () => {
  const text = suggestRecipe({
    tags: [{ label: 'hair shine', likes: 3, bads: 0, status: 'live' }],
    attributes: [{ trait: 'lighting', value: 'daylight', wins: 4, games: 5 }],
    turnOffs: [{ label: 'lighting', images: 2 }],
  })
  assert.match(text, /does not generate an image/i)
  assert.match(text, /hair shine/)
  assert.match(text, /Turn away from: lighting/)
})

test('migration keeps trash in the database and accepts Scout tags', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261023140000_brush_beauty_contest.sql', import.meta.url), 'utf8')
  assert.match(sql, /brush_images/)
  assert.match(sql, /enable row level security/i)
  assert.match(sql, /brush_save_trash_tags/)
  assert.match(sql, /turn_offs/)
  assert.match(sql, /'scout'/)
  assert.match(sql, /trashed_at/)
  assert.doesNotMatch(sql, /files\.delete|addParents|removeParents/)
})

test('Drive helper never deletes or moves files', () => {
  const source = readFileSync(new URL('../api/_brush/drive.ts', import.meta.url), 'utf8')
  assert.match(source, /does not/)
  assert.match(source, /redirect: 'manual'/)
  assert.match(source, /isDriveUploadUrl/)
  assert.doesNotMatch(source, /files\.delete|addParents|removeParents|trash=true/)
})

test('a batch stops at 100 and retries back off', () => {
  const batch = takeBatch(Array.from({ length: 101 }, (_, index) => index))
  assert.equal(batch.accepted.length, 100)
  assert.equal(batch.overflow, 1)
  assert.equal(retryDelayMs(1), 1000)
  assert.equal(retryDelayMs(2), 3000)
  assert.equal(retryDelayMs(5), 30000)
})

test('upload migration keeps originals in Drive and previews in storage', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261023163000_brush_upload_originals.sql', import.meta.url), 'utf8')
  assert.match(sql, /content_hash/)
  assert.match(sql, /brush-thumbs/)
  assert.match(sql, /created_at desc/)
  assert.match(sql, /games asc/)
  assert.match(sql, /brush_upload_claim/)
  assert.doesNotMatch(sql, /files\.delete|addParents|removeParents/)
  const retired = readFileSync(new URL('../api/_brush/routes/upload.ts', import.meta.url), 'utf8')
  assert.match(retired, /410/)
})

function serverlessFunctions(dir, prefix = '') {
  const found = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('_')) continue
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) found.push(...serverlessFunctions(`${dir}/${entry.name}`, rel))
    else if (/\.(ts|js|mjs|mts)$/.test(entry.name)) found.push(rel)
  }
  return found
}

test('Brush is one serverless function and the old paths still rewrite', () => {
  const files = serverlessFunctions(new URL('../api', import.meta.url))
  assert.ok(files.length <= 12, files.join(', '))
  assert.deepEqual(files.filter(file => file.startsWith('brush')), ['brush.ts'])
  const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
  const rewritten = new Map(vercel.rewrites.filter(item => String(item.source).startsWith('/api/brush')).map(item => [item.source, item.destination]))
  const expected = {
    '/api/brush-sync': '/api/brush?action=sync',
    '/api/brush-upload': '/api/brush?action=upload',
    '/api/brush-upload-session': '/api/brush?action=upload-session',
    '/api/brush-upload-chunk': '/api/brush?action=upload-chunk',
    '/api/brush-upload-finish': '/api/brush?action=upload-finish',
    '/api/brush-image': '/api/brush?action=image',
    '/api/brush-thumb': '/api/brush?action=thumb',
    '/api/brush-vision': '/api/brush?action=vision',
    '/api/brush-suggest': '/api/brush?action=suggest',
    '/api/brush-recipe': '/api/brush?action=recipe',
  }
  assert.deepEqual(Object.fromEntries(rewritten), expected)
})

function typescriptFiles(dir) {
  const found = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...typescriptFiles(full))
    else if (entry.name.endsWith('.ts')) found.push(full)
  }
  return found
}

test('relative api imports use .js so Vercel can resolve the compiled files', () => {
  const apiDir = fileURLToPath(new URL('../api/', import.meta.url))
  const bad = []
  for (const file of typescriptFiles(apiDir)) {
    const text = readFileSync(file, 'utf8')
    for (const match of text.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
      if (!match[1].endsWith('.js')) bad.push(`${file.slice(apiDir.length)}: ${match[1]}`)
    }
  }
  assert.deepEqual(bad, [])
})
