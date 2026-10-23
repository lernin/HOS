import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { countryFromPath, fileStem, seriesFromName } from '../src/experiences/brush/names.ts'
import { eloUpdate, nextSigma } from '../src/experiences/brush/rank.ts'
import { suggestRecipe } from '../src/experiences/brush/recipe.ts'

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
  assert.doesNotMatch(source, /files\.delete|addParents|removeParents|trash=true/)
})
