import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { applyDecision, bootDeck, currentMatch, mergeLibrary, openPlacement, replayPending, returnToBracket, startFinals } from '../src/experiences/brush/deck.ts'
import { countryFromPath, fileStem, groupKeys, seriesFromName } from '../src/experiences/brush/names.ts'
import { challengerCount, extendQueue, finalsFieldSize, hashDistance, newEntrants, pairKey, sameGroup, seedOrder } from '../src/experiences/brush/pair.ts'
import { eloUpdate, nextSigma } from '../src/experiences/brush/rank.ts'
import { suggestRecipe } from '../src/experiences/brush/recipe.ts'
import { UPLOAD_BATCH_LIMIT, retryDelayMs, takeBatch } from '../src/experiences/brush/uploads.ts'

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
  const close = eloUpdate(1500, 1500, 0, 0, true, 'close')
  assert.equal(close.k, 16)
  assert.equal(close.eloA, 1508)
  assert.equal(close.eloB, 1492)
  const settledClose = eloUpdate(1500, 1500, 8, 8, true, 'close')
  assert.equal(settledClose.k, 8)
  assert.equal(settledClose.eloA, 1504)
  assert.equal(settledClose.eloB, 1496)
  const placement = eloUpdate(1500, 1700, 0, 20, true)
  assert.equal(placement.kA, 48)
  assert.equal(placement.kB, 24)
  assert.ok(Math.abs(placement.eloA - 1500) > Math.abs(placement.eloB - 1700))
})

function image(partial) {
  return {
    folder_path: partial.country || '',
    series: null,
    elo: 1500,
    sigma: 350,
    games: 0,
    wins: 0,
    losses: 0,
    trash_count: 0,
    trashed: false,
    drive_file_id: partial.id,
    mime_type: 'image/jpeg',
    source: 'drive',
    prompt_text: null,
    country: partial.country || '',
    ...partial,
  }
}

test('qualifying keeps the same model apart and shuffles the next pair', () => {
  assert.equal(seriesFromName('Japan_Model_R5_03.jpg'), 'Model R5')
  const modelA = image({ id: 'a', name: 'Japan_Model_01.jpg', country: 'Japan', folder_path: 'Japan/Models' })
  const modelB = image({ id: 'b', name: 'Japan_Model_02.jpg', country: 'Japan', folder_path: 'Japan/Models' })
  const roundA = image({ id: 'c', name: 'Japan_R3_01.jpg', country: 'Japan', folder_path: 'Japan/R3' })
  const roundB = image({ id: 'd', name: 'Japan_R3_09.jpg', country: 'Japan', folder_path: 'Japan/R3' })
  const redoA = image({ id: 'e', name: 'redo3_alpha_01.jpg', country: 'Studio' })
  const redoB = image({ id: 'f', name: 'redo3_beta_02.jpg', country: 'Studio' })
  const pony = image({ id: 'g', name: 'pony_01.jpg', country: 'Korea' })
  const korea = image({ id: 'h', name: 'Korea_02.jpg', country: 'Korea' })
  assert.ok(sameGroup(modelA, modelB))
  assert.equal(sameGroup(modelA, roundA), false)
  assert.ok(sameGroup(roundA, roundB))
  assert.ok(sameGroup(redoA, redoB))
  assert.equal(sameGroup(redoA, pony), false)
  assert.ok(groupKeys(modelA).includes('family:japan_model'))
  assert.ok(groupKeys({ name: 'Japan_Model_R5_03.jpg' }).includes('family:japan_model'))
  assert.equal(groupKeys({ name: 'Solo.jpg', folder_path: 'Japan' }).some(key => key.startsWith('folder:')), false)
  assert.ok(sameGroup(
    image({ id: 'p', name: 'one.jpg', perceptual_hash: 'ffffffffffffffff' }),
    image({ id: 'q', name: 'two.jpg', perceptual_hash: 'fffffffffffffff0' }),
  ))
  assert.equal(hashDistance('ffffffffffffffff', 'fffffffffffffff0'), 4)
  const pool = [modelA, modelB, roundA, roundB, redoA, redoB, pony, korea]
  let seed = 7
  const rng = () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
  const queue = extendQueue(pool, [], [], 12, rng)
  assert.ok(queue.length >= 8)
  for (const slot of queue) {
    const left = pool.find(item => item.id === slot.leftId)
    const right = pool.find(item => item.id === slot.rightId)
    assert.equal(sameGroup(left, right), false)
  }
  for (let index = 1; index < queue.length; index += 1) {
    assert.notEqual(pairKey(queue[index].leftId, queue[index].rightId), pairKey(queue[index - 1].leftId, queue[index - 1].rightId))
  }
  const deck = bootDeck(pool, null, rng)
  const picked = applyDecision(deck, {
    leftId: deck.queue[0].leftId,
    rightId: deck.queue[0].rightId,
    kind: 'pick',
    winnerId: deck.queue[0].leftId,
    trashLeft: false,
    trashRight: false,
    margin: 'close',
  }, rng)
  const winner = picked.images.find(item => item.id === deck.queue[0].leftId)
  assert.equal(winner.elo, 1508)
  assert.equal(winner.games, 1)
  const finals = startFinals({
    ...deck,
    images: [
      image({ id: 'only-a', name: 'Japan_Model_01.jpg', elo: 1600 }),
      image({ id: 'only-b', name: 'Japan_Model_02.jpg', elo: 1400 }),
    ],
    queue: [],
  })
  const finalPair = currentMatch(finals)
  assert.equal(finals.phase, 'finals')
  assert.ok(sameGroup(finalPair.left, finalPair.right))
  assert.deepEqual(seedOrder(8), [0, 7, 3, 4, 1, 6, 2, 5])
  assert.equal(finalsFieldSize(20), 16)
  assert.equal(finalsFieldSize(3), 2)
})

test('a visit resumes the bracket and newcomers place without resetting ratings', () => {
  const seeded = [
    image({ id: 'a', name: 'Alpha_01.jpg', elo: 1700, games: 9, wins: 6 }),
    image({ id: 'b', name: 'Beta_01.jpg', elo: 1600, games: 9, wins: 5 }),
    image({ id: 'c', name: 'Gamma_01.jpg', elo: 1500, games: 9, wins: 4 }),
    image({ id: 'd', name: 'Delta_01.jpg', elo: 1400, games: 9, wins: 3 }),
  ]
  const started = startFinals(bootDeck(seeded, { phase: 'qualifying', rounds: [], championId: null }))
  const live = currentMatch(started)
  const mid = applyDecision(started, {
    leftId: live.left.id,
    rightId: live.right.id,
    kind: 'pick',
    winnerId: live.left.id,
    trashLeft: false,
    trashRight: false,
    margin: 'clear',
  })
  const resumed = bootDeck(mid.images, { phase: mid.phase, rounds: mid.rounds, championId: mid.championId })
  assert.equal(resumed.phase, 'finals')
  assert.equal(startFinals(resumed), resumed)
  const resumedMatch = currentMatch(resumed)
  const midMatch = currentMatch(mid)
  assert.equal(pairKey(resumedMatch.left.id, resumedMatch.right.id), pairKey(midMatch.left.id, midMatch.right.id))
  const replayed = replayPending(bootDeck(seeded, { phase: 'finals', rounds: started.rounds, championId: null }), [{
    leftId: live.left.id,
    rightId: live.right.id,
    decision: 'pick',
    winnerId: live.left.id,
    trashLeft: false,
    trashRight: false,
    margin: 'clear',
    matchId: null,
  }])
  assert.equal(replayed.rounds[0].find(slot => slot.leftId === live.left.id || slot.rightId === live.left.id).winnerId, live.left.id)
  assert.equal(replayed.images.find(item => item.id === live.left.id).games, live.left.games + 1)

  const fresh = image({ id: 'new', name: 'Solo_New.jpg', country: 'Uploads', folder_path: 'Brush Uploads', elo: 1500, games: 0 })
  const stale = resumed.images.map(item => item.id === 'a' ? { ...item, elo: 1500, games: 0, wins: 0 } : item)
  const merged = mergeLibrary(resumed, [...stale, fresh])
  assert.equal(merged.images.find(item => item.id === 'a').elo, resumed.images.find(item => item.id === 'a').elo)
  assert.equal(merged.images.find(item => item.id === 'a').games, resumed.images.find(item => item.id === 'a').games)
  assert.equal(merged.phase, 'finals')
  assert.equal(merged.rounds.flat().some(slot => slot.leftId === 'new' || slot.rightId === 'new'), false)
  assert.equal(challengerCount(merged.images), 1)

  let seed = 3
  const rng = () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
  const placing = openPlacement(merged, rng)
  const placed = currentMatch(placing)
  assert.ok([placed.left.id, placed.right.id].includes('new'))
  const kept = applyDecision(placing, {
    leftId: placed.left.id,
    rightId: placed.right.id,
    kind: 'pick',
    winnerId: 'new',
    trashLeft: false,
    trashRight: false,
    margin: 'clear',
  }, rng)
  assert.equal(kept.phase, 'finals')
  assert.deepEqual(kept.rounds, placing.rounds)
  assert.equal(kept.images.find(item => item.id === 'new').games, 1)
  assert.equal(returnToBracket(kept).focus, 'bracket')
  assert.equal(currentMatch(returnToBracket(kept)).left.id, resumedMatch.left.id)

  const veterans = [1200, 1400, 1600, 1800, 2000].map(elo => image({
    id: `e${elo}`,
    name: `Lane_${elo}.jpg`,
    elo,
    games: 12,
    wins: 6,
  }))
  const queue = extendQueue([fresh, ...veterans], [], [], 5, rng)
  assert.equal(queue.length, 5)
  const opponents = queue.map(slot => slot.leftId === 'new' ? slot.rightId : slot.leftId)
  assert.deepEqual(opponents, ['e1600', 'e1800', 'e1400', 'e2000', 'e1200'])
  assert.ok(queue.every(slot => slot.leftId === 'new' || slot.rightId === 'new'))

  const field = [
    ...Array.from({ length: 16 }, (_, index) => image({ id: `v${index}`, name: `Vet_${index}.jpg`, elo: 1505, games: 10, wins: 5 })),
    ...Array.from({ length: 3 }, (_, index) => image({ id: `low${index}`, name: `Low_${index}.jpg`, elo: 1400, games: 10, wins: 2 })),
    image({ id: 'rose', name: 'Rose_01.jpg', elo: 1490, games: 2, wins: 1 }),
  ]
  const before = field
  const rose = eloUpdate(1490, 1505, 2, 10, true)
  const after = field.map(item => {
    if (item.id === 'rose') return { ...item, elo: rose.eloA, games: 3, wins: 2 }
    if (item.id === 'v0') return { ...item, elo: rose.eloB, games: 11, wins: 5 }
    return item
  })
  assert.deepEqual(newEntrants(before, after).map(item => item.id), ['rose'])
  assert.deepEqual(newEntrants(after, after).map(item => item.id), [])

  const upload = readFileSync(new URL('../supabase/migrations/20261023163000_brush_upload_originals.sql', import.meta.url), 'utf8')
  const conflict = upload.slice(upload.lastIndexOf('on conflict (drive_file_id)'), upload.indexOf('updated_at = pg_catalog.now();', upload.lastIndexOf('on conflict (drive_file_id)')))
  assert.doesNotMatch(conflict, /\belo\b|\bgames\b/)
  const ongoing = readFileSync(new URL('../supabase/migrations/20261024013000_brush_ongoing_tournament.sql', import.meta.url), 'utf8')
  assert.match(ongoing, /games_a < 8/)
  assert.match(ongoing, /games_b < 8/)
  assert.match(ongoing, /games < 5/)
  assert.match(ongoing, /percentile_cont/)
  assert.doesNotMatch(ongoing, /files\.delete|addParents|removeParents/)
  const screen = readFileSync(new URL('../src/experiences/Brush.tsx', import.meta.url), 'utf8')
  assert.match(screen, /New challengers:/)
  assert.match(screen, /entered the top 16!/)
  assert.match(readFileSync(new URL('../src/experiences/brush/Matchup.tsx', import.meta.url), 'utf8'), /data-challenger/)
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

test('quick picks keep a gallery chooser and a smaller close-call step', () => {
  const sheet = readFileSync(new URL('../src/experiences/brush/Sheets.tsx', import.meta.url), 'utf8')
  const input = sheet.slice(sheet.indexOf('data-upload-input'), sheet.indexOf('data-upload-input') + 180)
  assert.match(input, /accept="image\/\*"/)
  assert.match(input, /multiple/)
  assert.equal(input.includes('capture'), false)
  assert.equal(UPLOAD_BATCH_LIMIT, 100)
  const matchup = readFileSync(new URL('../src/experiences/brush/Matchup.tsx', import.meta.url), 'utf8')
  const css = readFileSync(new URL('../src/experiences/brush.css', import.meta.url), 'utf8')
  assert.match(css, /touch-action:\s*none/)
  assert.match(matchup, /passive: false/)
  assert.match(matchup, /data-action="close"/)
  assert.doesNotMatch(matchup, /Love both|onTrashBoth/)
  const hit = matchup.indexOf('className="brush-photo-hit"')
  const caption = matchup.indexOf('className="brush-caption"')
  assert.ok(hit !== -1 && caption > hit)
  assert.match(css, /object-fit:\s*contain/)
  assert.match(css, /safe-area-inset/)
  assert.match(css, /brush-footer/)
  assert.match(css, /brush-card-bar/)
  const brush = readFileSync(new URL('../src/experiences/Brush.tsx', import.meta.url), 'utf8')
  assert.match(brush, /data-action="flip"/)
  assert.match(brush, /data-action="menu"/)
  const sql = readFileSync(new URL('../supabase/migrations/20261023233000_brush_quick_picks.sql', import.meta.url), 'utf8')
  assert.match(sql, /margin text default 'clear'/)
  assert.match(sql, /perceptual_hash/)
  assert.match(sql, /brush_group_keys/)
  assert.match(sql, /brush_contest/)
  assert.match(sql, /1\.0 \/ 3\.0/)
  assert.doesNotMatch(sql, /files\.delete|addParents|removeParents/)
})

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
