import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { applyDecision, bootDeck, currentMatch, dropUnreadable, mergeLibrary, openPlacement, replayPending, returnToBracket, startFinals } from '../src/experiences/brush/deck.ts'
import { levelOf, levelProgress, matchMoments, standingOf } from '../src/experiences/brush/level.ts'
import { faceBoxFromPixels, faceShift, faceZoom } from '../src/experiences/brush/face.ts'
import { boxFromPixels, focusBox, UPPER_FACE } from '../src/experiences/brush/face-box.ts'
import { countryFromPath, fileStem, groupKeys, seriesFromName } from '../src/experiences/brush/names.ts'
import { challengerCount, CLOSE_ELO, extendQueue, finalsFieldSize, hashDistance, lookOf, newEntrants, nextContender, nextQualifyingPair, pairKey, PLACEMENT_GAMES, RECENT_WINDOW, sameGroup, seedOrder, WILDCARD_RATE } from '../src/experiences/brush/pair.ts'
import { conservativeRating, glickoPeriod, glickoUpdate, INITIAL_RD, INITIAL_VOLATILITY, MIN_RD, rdForGames } from '../src/experiences/brush/rank.ts'
import { suggestRecipe } from '../src/experiences/brush/recipe.ts'
import { UPLOAD_BATCH_LIMIT, retryDelayMs, retryLoad, takeBatch } from '../src/experiences/brush/uploads.ts'
import { approach, clampInRanges, clampZoom, contentSpan, faceAimPan, faceDragGain, faceDragPan, faceEdgePan, facePanRange, facePanToPoint, imagePointAt, imagePointFromFace, panZoom, REST_ZOOM, restTranslate, zoomAround } from '../src/experiences/brush/zoom.ts'

test('glicko-2 matches the published example and keeps a close call smaller', () => {
  const paper = glickoPeriod({ rating: 1500, rd: 200, volatility: 0.06 }, [
    { rating: 1400, rd: 30, score: 1 },
    { rating: 1550, rd: 100, score: 0 },
    { rating: 1700, rd: 300, score: 0 },
  ])
  assert.ok(Math.abs(paper.rating - 1464.06) < 0.01, paper.rating)
  assert.ok(Math.abs(paper.rd - 151.52) < 0.01, paper.rd)
  assert.ok(Math.abs(paper.volatility - 0.05999) < 0.00001, paper.volatility)
  const fresh = { rating: 1500, rd: INITIAL_RD, volatility: INITIAL_VOLATILITY }
  const clear = glickoUpdate(fresh, fresh, true, 'clear')
  const close = glickoUpdate(fresh, fresh, true, 'close')
  assert.ok(clear.eloA > 1500 && clear.eloB < 1500)
  assert.ok(close.eloA > 1500 && close.eloA < clear.eloA)
  assert.ok(close.eloB < 1500 && close.eloB > clear.eloB)
  assert.ok(clear.sigmaA < INITIAL_RD && clear.sigmaA >= MIN_RD)
  assert.equal(rdForGames(0), 350)
  assert.equal(rdForGames(48), 50)
  assert.equal(rdForGames(200), 50)
  const lucky = glickoUpdate(
    { rating: 1500, rd: 350, volatility: 0.06 },
    { rating: 1600, rd: 50, volatility: 0.06 },
    true,
  )
  assert.ok(conservativeRating(lucky.eloA, lucky.sigmaA) < conservativeRating(1600, 50))
  assert.match(readFileSync(new URL('../src/experiences/brush/rank.ts', import.meta.url), 'utf8'), /rating - 2 \* RD/)
  assert.match(readFileSync(new URL('../src/experiences/brush/Sheets.tsx', import.meta.url), 'utf8'), /compareConservative/)
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
  const loser = picked.images.find(item => item.id === deck.queue[0].rightId)
  assert.ok(winner.elo > 1500)
  assert.ok(loser.elo < 1500)
  assert.ok(winner.elo - 1500 < 1500 - loser.elo + 1e-6)
  assert.ok(winner.sigma < 350 && winner.sigma >= 50)
  assert.equal(winner.games, 1)
  assert.equal(winner.close_wins, 1)
  assert.equal(loser.close_losses, 1)
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
  assert.ok(queue.every(slot => slot.leftId === 'new' || slot.rightId === 'new'))
  const opponentElos = opponents.map(id => veterans.find(item => item.id === id).elo)
  assert.ok(Math.min(...opponentElos) <= 1400, opponentElos.join(','))
  assert.ok(Math.max(...opponentElos) >= 1800, opponentElos.join(','))

  const field = [
    ...Array.from({ length: 16 }, (_, index) => image({ id: `v${index}`, name: `Vet_${index}.jpg`, elo: 1505, sigma: 80, games: 10, wins: 5 })),
    ...Array.from({ length: 3 }, (_, index) => image({ id: `low${index}`, name: `Low_${index}.jpg`, elo: 1400, sigma: 80, games: 10, wins: 2 })),
    image({ id: 'rose', name: 'Rose_01.jpg', elo: 1490, sigma: 350, volatility: 0.06, games: 2, wins: 1 }),
  ]
  const before = field
  const rose = glickoUpdate(
    { rating: 1490, rd: 350, volatility: 0.06 },
    { rating: 1505, rd: 80, volatility: 0.06 },
    true,
  )
  const after = field.map(item => {
    if (item.id === 'rose') return { ...item, elo: rose.eloA, sigma: rose.sigmaA, games: 3, wins: 2 }
    if (item.id === 'v0') return { ...item, elo: rose.eloB, sigma: rose.sigmaB, games: 11, wins: 5 }
    return item
  })
  assert.ok(conservativeRating(rose.eloA, rose.sigmaA) < conservativeRating(1505, 80))
  assert.deepEqual(newEntrants(before, after).map(item => item.id), [])
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
  assert.match(screen, /matchMoments/)
  assert.match(readFileSync(new URL('../src/experiences/brush/level.ts', import.meta.url), 'utf8'), /entered the top 16!/)
  const matchup = readFileSync(new URL('../src/experiences/brush/Matchup.tsx', import.meta.url), 'utf8')
  assert.match(matchup, /data-challenger/)
  assert.match(matchup, /data-placement/)
  assert.match(matchup, /\$\{image\.games\}\/\$\{PLACEMENT_GAMES\}/)
})

test('pairings prefer a different look, a fresh opponent, and a close rating', () => {
  assert.equal(CLOSE_ELO, 150)
  assert.equal(RECENT_WINDOW, 10)
  assert.equal(WILDCARD_RATE, 0.2)
  assert.deepEqual(lookOf(image({
    id: 'look',
    name: 'Studio_01.jpg',
    country: 'Japan',
    prompt_text: 'soft daylight, sage dress, glossy hair',
  })), { country: 'japan', series: '', setting: 'studio', dress: 'sage' })

  const anchor = image({ id: 'a', name: 'Alpha_01.jpg', country: 'Japan', elo: 1600, games: 10, prompt_text: 'studio, sage dress' })
  const closeSame = image({ id: 'b', name: 'Beta_01.jpg', country: 'Japan', elo: 1620, games: 12, prompt_text: 'studio, sage dress' })
  const closeDiff = image({ id: 'c', name: 'Gamma_01.jpg', country: 'Korea', elo: 1680, games: 12, prompt_text: 'beach, red gown' })
  const far = image({ id: 'd', name: 'Delta_01.jpg', country: 'Sweden', elo: 2100, games: 12, prompt_text: 'park, blue dress' })
  const steady = () => 0.5
  const preferred = nextQualifyingPair([anchor, closeSame, closeDiff, far], { rng: steady })
  assert.equal(preferred.left.id, 'a')
  assert.equal(preferred.right.id, 'c')
  const widened = nextQualifyingPair([
    anchor,
    image({ id: 'far-a', name: 'Far_A.jpg', country: 'Thailand', elo: 2100, games: 12, prompt_text: 'temple, gold dress' }),
    image({ id: 'far-b', name: 'Far_B.jpg', country: 'Vietnam', elo: 2300, games: 12, prompt_text: 'alley, navy outfit' }),
  ], { rng: steady })
  assert.equal(widened.right.id, 'far-a')
  const recent = nextQualifyingPair([anchor, closeSame, closeDiff], {
    rng: steady,
    recentKeys: [pairKey('a', 'c')],
  })
  assert.equal(recent.right.id, 'b')
  const remembered = bootDeck([anchor, closeSame, closeDiff, far], {
    phase: 'qualifying', rounds: [], championId: null, recentKeys: [pairKey('a', 'c')],
  }, steady)
  assert.notEqual(pairKey(remembered.queue[0].leftId, remembered.queue[0].rightId), pairKey('a', 'c'))

  const portraits = [
    ['jp1', 'Japan', 'Japan_Model_01.jpg', 'Japan/Models', 1620, 'studio, sage dress'],
    ['jp2', 'Japan', 'Japan_Model_02.jpg', 'Japan/Models', 1680, 'studio, black dress'],
    ['kr1', 'Korea', 'Korea_R1_05.jpg', 'Korea/R1', 1710, 'night street, red gown'],
    ['kr2', 'Korea', 'Korea_Cafe_02.jpg', 'Korea/Cafe', 1590, 'cafe, cream dress'],
    ['ph', 'Philippines', 'Philippines_Beach_01.jpg', 'Philippines', 1540, 'beach, white dress'],
    ['th', 'Thailand', 'Thailand_Garden_03.jpg', 'Thailand', 1490, 'garden, gold dress'],
    ['vn', 'Vietnam', 'Vietnam_Alley_01.jpg', 'Vietnam', 1760, 'alley, navy outfit'],
    ['id', 'Indonesia', 'Indonesia_Temple_02.jpg', 'Indonesia', 1430, 'temple, emerald dress'],
    ['cn', 'China', 'China_Studio_04.jpg', 'China', 1660, 'studio, red dress'],
    ['se', 'Sweden', 'Sweden_Park_01.jpg', 'Sweden', 1510, 'park, blue dress'],
  ].map(([id, country, name, folder, elo, prompt]) => image({
    id, country, name, folder_path: folder, elo, games: 12, wins: 6, prompt_text: prompt,
  }))
  let seed = 11
  const rng = () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
  assert.equal(extendQueue(portraits, [], []).length, 5)
  const generated = extendQueue(portraits, [], [], 20, rng)
  assert.equal(generated.length, 20)
  const byId = new Map(portraits.map(item => [item.id, item]))
  let sameCountry = 0
  let sameModel = 0
  let repeats = 0
  const seen = new Set()
  const lines = []
  for (const slot of generated) {
    const left = byId.get(slot.leftId)
    const right = byId.get(slot.rightId)
    const leftLook = lookOf(left)
    const rightLook = lookOf(right)
    if (leftLook.country && leftLook.country === rightLook.country) sameCountry += 1
    if (sameGroup(left, right)) sameModel += 1
    const key = pairKey(left.id, right.id)
    if (seen.has(key)) repeats += 1
    seen.add(key)
    lines.push(`${left.country} ${leftLook.setting || '—'} ${leftLook.dress || '—'} ${left.elo} vs ${right.country} ${rightLook.setting || '—'} ${rightLook.dress || '—'} ${right.elo}`)
  }
  assert.equal(sameModel, 0)
  assert.ok(sameCountry <= 6, `same country ${sameCountry}`)
  assert.ok(repeats <= 2, `repeats ${repeats}`)
  assert.ok(seen.size >= 16, `unique ${seen.size}`)
  assert.equal(lines.length, 20)
  const memory = readFileSync(new URL('../supabase/migrations/20261024143000_brush_pairing_memory.sql', import.meta.url), 'utf8')
  assert.match(memory, /brush_contest_get/)
  assert.match(memory, /limit 10/)
  assert.match(readFileSync(new URL('../src/experiences/brush/client.ts', import.meta.url), 'utf8'), /recentKeys/)

  const hungry = image({ id: 'hungry', name: 'Hungry_01.jpg', country: 'Sweden', elo: 1500, games: 0, sigma: 350, prompt_text: 'park, blue dress' })
  const mid = image({ id: 'mid', name: 'Mid_01.jpg', country: 'Korea', elo: 1500, games: 3, sigma: 180, prompt_text: 'cafe, cream dress' })
  const placed = [1200, 1500, 1800].map(elo => image({
    id: `placed-${elo}`,
    name: `Placed_${elo}.jpg`,
    country: elo === 1500 ? 'Japan' : 'Thailand',
    elo,
    games: 12,
    sigma: 60,
    prompt_text: 'garden, gold dress',
  }))
  const waiting = extendQueue([hungry, mid, ...placed], [], [], 5, steady)
  assert.equal(waiting.length, 5)
  assert.ok(waiting[0].leftId === 'hungry' || waiting[0].rightId === 'hungry')
  const unplaced = new Set(['hungry', 'mid'])
  assert.ok(waiting.every(slot => unplaced.has(slot.leftId) || unplaced.has(slot.rightId)))
  const rankedOnly = extendQueue(placed, [], [], 3, steady)
  assert.equal(rankedOnly.length, 3)
  assert.ok(rankedOnly.every(slot => !unplaced.has(slot.leftId) && !unplaced.has(slot.rightId)))

  const sure = image({ id: 'sure', name: 'Sure_01.jpg', country: 'Sweden', elo: 1600, games: 30, sigma: 50, prompt_text: 'garden, gold dress' })
  const shaky = image({ id: 'shaky', name: 'Shaky_01.jpg', country: 'Korea', elo: 1600, games: 8, sigma: 300, prompt_text: 'park, blue dress' })
  const ladder = [
    image({ id: 'low', name: 'Low_01.jpg', country: 'Thailand', elo: 1200, games: 20, sigma: 60, prompt_text: 'beach, white dress' }),
    sure,
    shaky,
    image({ id: 'high', name: 'High_01.jpg', country: 'Vietnam', elo: 2000, games: 20, sigma: 60, prompt_text: 'alley, navy outfit' }),
  ]
  const informative = nextQualifyingPair([hungry, ...ladder], { rng: steady })
  assert.equal(informative.left.id, 'hungry')
  assert.equal(informative.right.id, 'sure')
  const rungs = [1200, 1400, 1600, 1800, 2000].map(elo => image({
    id: `rung-${elo}`,
    name: `Rung_${elo}.jpg`,
    country: 'Studio',
    elo,
    games: 12,
    sigma: 80,
  }))
  const debut = image({ id: 'debut', name: 'Debut_01.jpg', country: 'Uploads', elo: 1500, games: 0, sigma: 350 })
  const walked = extendQueue([debut, ...rungs], [], [], 5, steady)
  const walkedElos = walked.map(slot => {
    const id = slot.leftId === 'debut' ? slot.rightId : slot.leftId
    return rungs.find(item => item.id === id).elo
  })
  assert.deepEqual(walkedElos, [1600, 1800, 1400, 1800, 1400])

  const keep = image({ id: 'keep', name: 'Keep_01.jpg', country: 'Japan', elo: 1550, games: 12, sigma: 60, prompt_text: 'studio, sage dress' })
  const starved = image({ id: 'starved', name: 'Starved_01.jpg', country: 'Sweden', elo: 1500, games: 1, sigma: 250, prompt_text: 'park, blue dress' })
  const later = image({ id: 'later', name: 'Later_01.jpg', country: 'Korea', elo: 1500, games: 4, sigma: 160, prompt_text: 'cafe, cream dress' })
  const rival = image({ id: 'rival', name: 'Rival_01.jpg', country: 'Thailand', elo: 1550, games: 20, sigma: 55, prompt_text: 'beach, white dress' })
  assert.equal(nextContender([keep, starved, later, rival], 'keep', { rng: steady }).id, 'starved')
  const twinModel = image({ id: 'twin', name: 'Japan_Model_02.jpg', country: 'Japan', folder_path: 'Japan/Models', elo: 1500, games: 0, sigma: 350 })
  const keepModel = image({ id: 'model', name: 'Japan_Model_01.jpg', country: 'Japan', folder_path: 'Japan/Models', elo: 1600, games: 12, sigma: 60 })
  assert.equal(nextContender([keepModel, twinModel, later], 'model', { rng: steady }).id, 'later')
  assert.equal(PLACEMENT_GAMES, 5)
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
    '/api/brush-sync-daily': '/api/brush?action=sync-daily',
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

test('trashing one picture keeps the other and brings a different model', () => {
  const japan = image({ id: 'a', name: 'Japan_Model_01.jpg', country: 'Japan', folder_path: 'Japan/Models' })
  const japan2 = image({ id: 'b', name: 'Japan_Model_02.jpg', country: 'Japan', folder_path: 'Japan/Models' })
  const korea = image({ id: 'c', name: 'Korea_02.jpg', country: 'Korea' })
  const studio = image({ id: 'd', name: 'Studio_03.jpg', country: 'Studio' })
  const deck = bootDeck([japan, japan2, korea, studio], null, () => 0)
  const match = currentMatch(deck)
  assert.ok(match)
  const next = applyDecision(deck, {
    leftId: match.left.id,
    rightId: match.right.id,
    kind: 'trash',
    winnerId: null,
    trashLeft: false,
    trashRight: true,
    margin: 'clear',
  }, () => 0)
  const after = currentMatch(next)
  assert.ok(after)
  assert.equal(after.left.id, match.left.id)
  assert.notEqual(after.right.id, match.right.id)
  assert.equal(sameGroup(after.left, after.right), false)
  assert.equal(next.images.find(item => item.id === match.right.id).trashed, true)
  assert.equal(next.images.find(item => item.id === match.left.id).elo, match.left.elo)
})

test('a skin-tone blob becomes a normalized face box', () => {
  const width = 40
  const height = 40
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 8; y <= 28; y += 1) {
    for (let x = 12; x <= 27; x += 1) {
      const offset = (y * width + x) * 4
      data[offset] = 200
      data[offset + 1] = 150
      data[offset + 2] = 120
      data[offset + 3] = 255
    }
  }
  const box = faceBoxFromPixels(width, height, data)
  assert.ok(box)
  assert.ok(box.x >= 0 && box.y >= 0 && box.w > 0 && box.h > 0)
  assert.ok(box.x + box.w <= 1.001)
  assert.ok(box.y + box.h <= 1.001)
  assert.ok(box.y < 0.5)
  const zoom = faceZoom(box)
  assert.ok(zoom.scale >= 1.35 && zoom.scale <= 3.5)
  const framed = faceZoom({ x: 0.32, y: 0.14, w: 0.26, h: 0.28 })
  const eyeLine = framed.y + framed.ty / 100
  assert.ok(eyeLine > 0.3 && eyeLine < 0.36, `eye line ${eyeLine}`)
  assert.ok(framed.scale > 2.6 && framed.scale <= 3.5, `scale ${framed.scale}`)
  const shift = faceShift(framed)
  const shiftedEye = 0.5 + (framed.y - 0.5) * shift.scale + shift.ty / 100
  assert.ok(Math.abs(shiftedEye - eyeLine) < 0.001)
  const topped = faceZoom({ x: 0.3, y: 0, w: 0.28, h: 0.22 })
  const toppedEye = topped.y + topped.ty / 100
  const visibleTop = topped.y - toppedEye / topped.scale
  assert.ok(visibleTop >= -0.02 && visibleTop < 0.04, `top ${visibleTop}`)
  assert.ok(toppedEye <= 0.34)
  assert.equal(faceBoxFromPixels(4, 4, new Uint8ClampedArray(64)), null)
  assert.deepEqual(focusBox(null), UPPER_FACE)
  assert.ok(faceZoom(UPPER_FACE).y < 0.3)
  const detected = boxFromPixels(100, 200, [30, 20], [70, 90])
  assert.ok(detected)
  assert.ok(detected.y < 0.2)
  assert.ok(detected.w > 0 && detected.h > 0)
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
  const brush = readFileSync(new URL('../src/experiences/Brush.tsx', import.meta.url), 'utf8')
  const input = brush.slice(brush.indexOf('data-upload-input'), brush.indexOf('data-upload-input') + 180)
  assert.match(input, /accept="image\/\*"/)
  assert.match(input, /multiple/)
  assert.equal(input.includes('capture'), false)
  const nav = brush.slice(brush.indexOf('function navLinks'), brush.indexOf('function navLinks') + 800)
  assert.ok(nav.includes('data-action="upload"'))
  assert.ok(nav.indexOf('data-action="upload"') < nav.indexOf('>Hub<'))
  assert.equal(nav.includes('type="file"'), false)
  const sheet = readFileSync(new URL('../src/experiences/brush/Sheets.tsx', import.meta.url), 'utf8')
  assert.match(sheet, /htmlFor="brush-gallery"/)
  assert.match(sheet, /data-upload-sheet/)
  assert.match(sheet, /Only 100 photos can be chosen at once/)
  assert.equal(sheet.includes('capture='), false)
  assert.equal(UPLOAD_BATCH_LIMIT, 100)
  const matchup = readFileSync(new URL('../src/experiences/brush/Matchup.tsx', import.meta.url), 'utf8')
  const css = readFileSync(new URL('../src/experiences/brush.css', import.meta.url), 'utf8')
  assert.match(css, /touch-action:\s*none/)
  assert.match(matchup, /passive: false/)
  assert.match(matchup, /data-action="close"/)
  assert.doesNotMatch(matchup, /Love both|onTrashBoth/)
  assert.match(matchup, /WINNER →/)
  assert.match(matchup, /← WINNER/)
  assert.match(matchup, /Close call/)
  assert.match(matchup, /Hold for face/)
  assert.match(matchup, /data-action="face"/)
  assert.match(matchup, /data-face="both"/)
  assert.match(matchup, /data-swipe=/)
  assert.match(matchup, /navigator\.vibrate/)
  assert.match(matchup, /SWIPE_THRESHOLD/)
  assert.match(matchup, /faceHeld/)
  assert.match(matchup, /faceShift/)
  assert.match(matchup, /250ms ease/)
  assert.match(matchup, /pointerId/)
  assert.match(matchup, /touchstart/)
  assert.match(matchup, /passive: false/)
  assert.match(matchup, /focusBox/)
  assert.match(matchup, /brush-gutter-actions/)
  assert.doesNotMatch(matchup, /onLostPointerCapture/)
  assert.match(css, /-webkit-touch-callout:\s*none/)
  const upload = readFileSync(new URL('../api/_brush/routes/upload-finish.ts', import.meta.url), 'utf8')
  const sync = readFileSync(new URL('../api/_brush/routes/sync.ts', import.meta.url), 'utf8')
  assert.match(upload, /saveDetectedFace/)
  assert.match(sync, /scanUnscannedFaces/)
  const faceSql = readFileSync(new URL('../supabase/migrations/20261024053000_brush_face_queue.sql', import.meta.url), 'utf8')
  assert.match(faceSql, /brush_face_queue/)
  assert.doesNotMatch(matchup, /onPick\(id, 'clear'\)/)
  assert.doesNotMatch(matchup, /◀ This one|That one ▶/)
  assert.match(matchup, /brush-gutter/)
  assert.match(css, /min-width:\s*88px/)
  assert.match(css, /object-fit:\s*contain/)
  assert.match(css, /safe-area-inset/)
  assert.match(css, /brush-footer/)
  assert.match(css, /brush-card-bar/)
  assert.match(brush, /data-action="flip"/)
  assert.match(brush, /data-action="menu"/)
  assert.match(brush, /deck\?\.phase === 'finals' && reason/)
  assert.match(brush, /brush-gutter-toast/)
  assert.match(brush, /data-moment=/)
  assert.match(brush, /top16/)
  assert.match(css, /brush-gutter-actions/)
  assert.match(css, /brush-swipe/)
  assert.match(css, /\.brush-swipe-hint\.is-left\{left:16px\}/)
  assert.match(css, /\.brush-swipe-hint\.is-right\{right:16px\}/)
  assert.match(css, /\.brush-swipe-face\{[^}]*padding:8px 28px/)
  assert.doesNotMatch(css, /\.brush-control-row \.brush-swipe-face\{padding:0 14px\}/)
  assert.match(matchup, /SwipeHint/)
  assert.match(matchup, /PadIcon/)
  assert.match(matchup, /data-match-count/)
  assert.match(matchup, /data-open/)
  assert.match(css, /backdrop-filter:blur\(14px\)/)
  assert.match(css, /brush-photo-glow/)
  assert.match(css, /min-width:\s*84px/)
  assert.match(css, /min-width:\s*196px/)
  assert.match(css, /brush-info-strip/)
  assert.match(css, /brush-control-row/)
  assert.match(css, /justify-content:\s*space-evenly/)
  assert.match(matchup, /facePan/)
  assert.match(matchup, /data-strip/)
  assert.match(matchup, /rankFor/)
  const sql = readFileSync(new URL('../supabase/migrations/20261023233000_brush_quick_picks.sql', import.meta.url), 'utf8')
  assert.match(sql, /margin text default 'clear'/)
  assert.match(sql, /perceptual_hash/)
  assert.match(sql, /brush_group_keys/)
  assert.match(sql, /brush_contest/)
  assert.match(sql, /1\.0 \/ 3\.0/)
  assert.doesNotMatch(sql, /files\.delete|addParents|removeParents/)
  const face = readFileSync(new URL('../supabase/migrations/20261024040000_brush_face_box.sql', import.meta.url), 'utf8')
  assert.match(face, /brush_set_face_box/)
  assert.match(face, /face_box/)
  assert.match(face, /face_scanned/)
})

test('levels stay open and a fifth placement debuts', () => {
  assert.equal(levelOf(1500), 1)
  assert.equal(levelOf(1599), 1)
  assert.equal(levelOf(1600), 2)
  assert.equal(levelOf(1490), 1)
  assert.equal(levelOf(1699), 2)
  assert.equal(levelOf(1700), 3)
  assert.equal(levelOf(2600), 12)
  assert.equal(levelProgress(1550), 0.5)
  assert.equal(levelProgress(1600), 0)
  assert.equal(levelProgress(1400), 0)
  assert.ok(levelProgress(1599) > 0.9 && levelProgress(1599) < 1)
  const before = [
    image({ id: 'a', name: 'Philippines_R1_01.jpg', country: 'Philippines', elo: 1590, games: 4, wins: 3, losses: 1 }),
    image({ id: 'b', name: 'Japan_R2_10.jpg', country: 'Japan', elo: 1680, games: 9, wins: 6, losses: 3 }),
  ]
  const after = [
    { ...before[0], elo: 1620, games: 5, wins: 4 },
    { ...before[1], elo: 1668, games: 10, losses: 4 },
  ]
  const debut = matchMoments(before, after)
  assert.equal(debut[0].kind, 'placement')
  assert.match(debut[0].text, /Placement complete: Philippines debuts at Level 2, #2/)
  const rankedBefore = [
    image({ id: 'a', name: 'Alpha.jpg', country: 'Alpha', elo: 1590, games: 8, wins: 4, losses: 4 }),
    image({ id: 'b', name: 'Beta.jpg', country: 'Beta', elo: 1500, games: 8, wins: 4, losses: 4 }),
  ]
  const rankedAfter = [
    { ...rankedBefore[0], elo: 1610, games: 9, wins: 5 },
    { ...rankedBefore[1], elo: 1488, games: 9, losses: 5 },
  ]
  const up = matchMoments(rankedBefore, rankedAfter)
  assert.equal(up.length, 1)
  assert.equal(up[0].kind, 'level')
  assert.match(up[0].text, /^Level up! Alpha · Level 2$/)
  assert.deepEqual(standingOf(after, 'b'), { rank: 1, total: 2 })
  assert.equal(standingOf(after, 'a').rank, 2)
  assert.equal(standingOf([{ ...before[0] }], 'a'), null)
  const lucky = image({ id: 'lucky', name: 'Lucky.jpg', country: 'Lucky', elo: 1800, sigma: 350, games: 6 })
  const settledPic = image({ id: 'settled', name: 'Settled.jpg', country: 'Settled', elo: 1600, sigma: 50, games: 40 })
  assert.equal(standingOf([lucky, settledPic], 'settled').rank, 1)
  assert.equal(standingOf([lucky, settledPic], 'lucky').rank, 2)
  assert.equal(levelOf(1800), 4)
  const glickoSql = readFileSync(new URL('../supabase/migrations/20261024230000_brush_glicko.sql', import.meta.url), 'utf8')
  assert.match(glickoSql, /volatility/)
  assert.match(glickoSql, /sqrt/)
  assert.match(glickoSql, /greatest\(50/)
  assert.match(glickoSql, /2\.0 \/ 3\.0/)
  assert.match(glickoSql, /'volatility', image\.volatility/)
  assert.doesNotMatch(glickoSql.slice(0, glickoSql.indexOf('private.brush_glicko_f')), /\belo\s*=/)
  const levels = readFileSync(new URL('../supabase/migrations/20261024120000_brush_levels.sql', import.meta.url), 'utf8')
  assert.match(levels, /close_wins/)
  assert.match(levels, /close_losses/)
  assert.match(levels, /brush_tally_close/)
  const moments = readFileSync(new URL('../src/experiences/brush/level.ts', import.meta.url), 'utf8')
  assert.match(moments, /Placement complete/)
  assert.match(moments, /Level up!/)
  assert.match(moments, /entered the top 16!/)
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

test('pinch stays under the fingers and Face aim reaches the picture edges', () => {
  const rest = restTranslate(REST_ZOOM)
  assert.equal(rest.tx, 0)
  assert.equal(rest.ty, 0)
  assert.equal(rest.scale, 1)

  const start = imagePointAt(REST_ZOOM, 0.35, 0.62)
  assert.equal(start.x, 0.35)
  assert.equal(start.y, 0.62)
  const zoomed = clampZoom(zoomAround(2, start.x, start.y, 0.35, 0.62))
  const still = imagePointAt(zoomed, 0.35, 0.62)
  assert.ok(Math.abs(still.x - 0.35) < 1e-9)
  assert.ok(Math.abs(still.y - 0.62) < 1e-9)

  const followed = clampZoom(zoomAround(2, start.x, start.y, 0.48, 0.7))
  const underFingers = imagePointAt(followed, 0.48, 0.7)
  assert.ok(Math.abs(underFingers.x - start.x) < 1e-9)
  assert.ok(Math.abs(underFingers.y - start.y) < 1e-9)
  const before = restTranslate(zoomed)
  const after = restTranslate(followed)
  assert.ok(after.tx > before.tx)
  assert.ok(after.ty > before.ty)

  const width = 200
  const height = 400
  const panned = panZoom(zoomed, 20, -10, width, height)
  const shiftX = (restTranslate(panned).tx - restTranslate(zoomed).tx) / 100 * width
  const shiftY = (restTranslate(panned).ty - restTranslate(zoomed).ty) / 100 * height
  assert.ok(Math.abs(shiftX - 20) < 1e-6)
  assert.ok(Math.abs(shiftY - -10) < 1e-6)
  const edge = clampZoom({ scale: 2, x: 0, y: 1 })
  assert.equal(edge.x, 0.25)
  assert.equal(edge.y, 0.75)
  assert.equal(clampZoom({ scale: 8, x: 0.5, y: 0.5 }).scale, 4)

  const range = facePanRange(0, 200, 3)
  assert.deepEqual(range, { min: -200, max: 200 })
  assert.equal(clampInRanges(500, [range]), 200)
  assert.equal(clampInRanges(-500, [range]), -200)
  assert.equal(clampInRanges(40, [range, { min: -50, max: 80 }]), 40)
  assert.equal(clampInRanges(10, [{ min: -100, max: 20 }, { min: 80, max: 200 }]), 10)
  assert.equal(clampInRanges(30, [{ min: -100, max: 20 }, { min: 80, max: 200 }]), 20)
  assert.equal(clampInRanges(500, [{ min: -100, max: 20 }, { min: 80, max: 200 }]), 200)

  const face = { faceTx: 0, faceTy: 0, scale: 3, width: 200, height: 400, imageX: 0.4, imageY: 0.55, screenX: 0.4, screenY: 0.55 }
  const pan = facePanToPoint(face)
  const back = imagePointFromFace({ ...face, panX: pan.x, panY: pan.y })
  assert.ok(Math.abs(back.x - 0.4) < 1e-9)
  assert.ok(Math.abs(back.y - 0.55) < 1e-9)
  const moved = facePanToPoint({ ...face, screenX: 0.55, screenY: 0.4 })
  assert.ok(moved.x > pan.x)
  assert.ok(moved.y < pan.y)
  const anchored = imagePointFromFace({ ...face, panX: moved.x, panY: moved.y, screenX: 0.55, screenY: 0.4 })
  assert.ok(Math.abs(anchored.x - 0.4) < 1e-9)
  assert.ok(Math.abs(anchored.y - 0.55) < 1e-9)

  const span = contentSpan(100, 200, 1, 'contain')
  assert.deepEqual(span, { x0: 0, x1: 1, y0: 0.25, y1: 0.75 })
  const aimed = { faceTx: 4, faceTy: -18, scale: 2.8, width: 220, height: 390, span }
  const screenY = (panY, edge) => 0.5 + (edge - 0.5) * aimed.scale + aimed.faceTy / 100 + panY / aimed.height
  const screenX = (panX, edge) => 0.5 + (edge - 0.5) * aimed.scale + aimed.faceTx / 100 + panX / aimed.width
  const bottom = faceAimPan({ ...aimed, imageX: 0.2, imageY: 1 })
  const top = faceAimPan({ ...aimed, imageX: 0.8, imageY: 0 })
  const left = faceAimPan({ ...aimed, imageX: 0, imageY: 0.4 })
  const right = faceAimPan({ ...aimed, imageX: 1, imageY: 0.6 })
  assert.ok(Math.abs(screenY(bottom.y, span.y1) - 1) < 1e-6)
  assert.ok(Math.abs(screenY(top.y, span.y0)) < 1e-6)
  assert.ok(Math.abs(screenX(left.x, span.x0)) < 1e-6)
  assert.ok(Math.abs(screenX(right.x, span.x1) - 1) < 1e-6)
  const mid = faceAimPan({ faceTx: 6, faceTy: -12, scale: 2, width: 200, height: 400, imageX: 0.42, imageY: 0.58 })
  const atCenterX = 0.5 + (-6 / 100 - mid.x / 200) / 2
  const atCenterY = 0.5 + (12 / 100 - mid.y / 400) / 2
  assert.ok(Math.abs(atCenterX - 0.42) < 1e-6)
  assert.ok(Math.abs(atCenterY - 0.58) < 1e-6)

  const dragged = faceDragPan({ originX: 40, originY: 80, x: 40, y: 80, startX: 0, startY: 0, gainX: 1.5, gainY: 2, minX: -120, maxX: 90, minY: -400, maxY: 60 })
  assert.deepEqual(dragged, { x: 0, y: 0 })
  const lower = faceDragPan({ originX: 40, originY: 80, x: 40, y: 110, startX: 0, startY: 0, gainX: 1.5, gainY: 2, minX: -120, maxX: 90, minY: -400, maxY: 60 })
  const lowerStill = faceDragPan({ originX: 40, originY: 80, x: 70, y: 140, startX: 0, startY: 0, gainX: 1.5, gainY: 2, minX: -120, maxX: 90, minY: -400, maxY: 60 })
  assert.ok(lower.y < dragged.y)
  assert.ok(lowerStill.y < lower.y)
  assert.ok(lowerStill.x < dragged.x)
  assert.equal(faceDragPan({ originX: 0, originY: 0, x: 0, y: 999, startX: 0, startY: 0, gainX: 1, gainY: 3, minX: -10, maxX: 10, minY: -50, maxY: 20 }).y, -50)
  assert.equal(faceDragGain(200, -300, 100), 2)
  const edges = faceEdgePan({ faceTx: 0, faceTy: 0, scale: 2, width: 100, height: 200 })
  assert.ok(edges.minY < 0 && edges.maxY > 0 && edges.minY < edges.maxY)
  let eased = 0
  const samples = []
  for (let step = 0; step < 16; step += 1) {
    eased = approach(eased, -80, 0.42)
    samples.push(eased)
  }
  assert.ok(samples.every((sample, index) => index === 0 || sample <= samples[index - 1] + 1e-9))
  assert.equal(samples.at(-1), -80)

  const matchup = readFileSync(new URL('../src/experiences/brush/Matchup.tsx', import.meta.url), 'utf8')
  assert.match(matchup, /faceDragPan/)
  assert.match(matchup, /requestAnimationFrame/)
  assert.match(matchup, /holdId/)
  assert.match(matchup, /id !== holdId/)
  assert.doesNotMatch(matchup, /120ms ease-out/)
  assert.doesNotMatch(matchup, /pictureAim/)
  assert.match(matchup, /zoomAround/)
  assert.match(matchup, /facePanToPoint/)
  assert.match(matchup, /250ms ease/)
})

test('a portrait that will not load is replaced without changing the match record', () => {
  const images = ['Japan', 'Korea', 'Thailand', 'Vietnam', 'Canada', 'Sweden'].map((country, index) => image({
    id: country.toLowerCase(),
    name: `${country}_Solo_01.jpg`,
    country,
    elo: 1500 + index * 40,
    games: index < 2 ? 1 : 8,
    wins: index < 2 ? 0 : 4,
    losses: index < 2 ? 1 : 4,
  }))
  const deck = bootDeck(images, null, () => 0.5)
  const match = currentMatch(deck)
  assert.ok(match)
  const before = deck.images.map(item => ({ id: item.id, elo: item.elo, games: item.games, wins: item.wins, losses: item.losses }))
  const next = dropUnreadable(deck, match.left.id, () => 0.5)
  const replaced = currentMatch(next)
  assert.ok(replaced)
  assert.equal(replaced.right.id, match.right.id)
  assert.notEqual(replaced.left.id, match.left.id)
  assert.equal(next.images.find(item => item.id === match.left.id).unreadable, true)
  assert.deepEqual(next.images.map(item => ({ id: item.id, elo: item.elo, games: item.games, wins: item.wins, losses: item.losses })), before)
  const sql = readFileSync(new URL('../supabase/migrations/20261024234500_brush_unreadable.sql', import.meta.url), 'utf8')
  assert.match(sql, /unreadable_at/)
  assert.match(sql, /brush_flag_unreadable/)
  assert.doesNotMatch(sql, /set elo|games = 0/)
})

test('portrait loads are retried and landscape slots stay equal', async () => {
  let calls = 0
  await assert.rejects(() => retryLoad(async () => {
    calls += 1
    throw new Error('Drive preview failed')
  }, 3))
  assert.equal(calls, 3)
  calls = 0
  assert.equal(await retryLoad(async () => {
    calls += 1
    if (calls < 2) throw new Error('temporary')
    return 'ready'
  }, 3), 'ready')
  const css = readFileSync(new URL('../src/experiences/brush.css', import.meta.url), 'utf8')
  const card = css.slice(css.indexOf('.brush.is-landscape.is-match .brush-card{'), css.indexOf('.brush.is-landscape.is-match .brush-photo-hit{'))
  assert.match(card, /flex:1 1 0/)
  assert.doesNotMatch(card, /aspect-ratio:9\/16/)
  assert.match(css, /object-position:center/)
  const matchup = readFileSync(new URL('../src/experiences/brush/Matchup.tsx', import.meta.url), 'utf8')
  assert.match(matchup, /data-photo-slot/)
  assert.doesNotMatch(matchup, /width: side === 'left' \? frame\.left/)
  const brush = readFileSync(new URL('../src/experiences/Brush.tsx', import.meta.url), 'utf8')
  assert.match(brush, /retryLoad/)
  assert.match(brush, /dropUnreadable/)
  assert.match(brush, /flagUnreadable/)
  assert.match(brush, /client\.sync\(/)
  const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
  assert.equal(vercel.crons.length, 1)
  assert.equal(vercel.crons[0].path, '/api/brush-sync-daily')
  assert.match(vercel.crons[0].schedule, /^\d+ \d+ \* \* \*$/)
})

test('daily sync accepts only a bearer cron secret', () => {
  const source = readFileSync(new URL('../api/_brush/routes/sync-daily.ts', import.meta.url), 'utf8')
  assert.match(source, /const secret = process\.env\.CRON_SECRET\?\.trim\(\)/)
  assert.match(source, /if \(!secret\) return false/)
  assert.match(source, /request\.headers\.get\('authorization'\) === `Bearer \$\{secret\}`/)
  assert.match(source, /process\.env\.ACCESS_PIN\?\.trim\(\)/)
  assert.doesNotMatch(source, /vercel-cron/i)
  assert.doesNotMatch(source, /user-agent/i)
  assert.doesNotMatch(source, /3476/)
})
