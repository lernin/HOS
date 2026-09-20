import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const levels = [
  'Ignore',
  'Observe',
  'Imitate',
  'Verify',
  'Choose from 2',
  'Choose from 4',
  'Match',
  'Reorder with model',
  'Reorder from concept cue',
  'Construct from supplied parts',
  'Complete partial target',
  'Produce with form hint',
  'Produce from direct cue',
  'Produce from context',
  'Recall',
  'Apply',
]

test('engagement lab exposes the three structural modes and canonical 0-15 ladder', () => {
  const source = read('src/experiences/EngagementLab.tsx')
  for (const mode of ['Standalone', 'Decompose', 'Compose']) assert.ok(source.includes(mode), `missing ${mode}`)
  levels.forEach((label, level) => {
    assert.ok(source.includes(`level: ${level}`), `missing level ${level}`)
    assert.ok(source.includes(label), `missing ${label}`)
  })
  for (const preset of ['umbrella', 'pencil', 'L /l/']) assert.ok(source.toLowerCase().includes(preset.toLowerCase()), `missing preset ${preset}`)
})

test('engagement lab includes interactive verify, choice, construction and production controls', () => {
  const source = read('src/experiences/EngagementLab.tsx')
  assert.match(source, /True/)
  assert.match(source, /False/)
  assert.match(source, /choice/i)
  assert.match(source, /token/i)
  assert.match(source, /<input/)
  assert.match(source, /reset/i)
})

test('entry router exposes engagement-lab and its dedicated entry keeps the Lab PIN check', () => {
  const router = read('src/entry-router.ts')
  const entry = read('src/engagement-lab-entry.tsx')
  assert.match(router, /engagement-lab/)
  assert.match(router, /engagement-lab-entry/)
  assert.match(entry, /lab_thekonym_read/)
  assert.match(entry, /EngagementLab/)
})

test('the unlocked Lab hub links to Engagement Matrix', () => {
  const source = read('index.html')
  assert.match(source, /Engagement Matrix/)
  assert.match(source, /engagement-matrix-hub-card/)
  assert.match(source, /engagement-lab-unlocked/)
  assert.match(source, /\/engagement-lab/)
})

test('vercel routes engagement-lab through the SPA', () => {
  const source = read('vercel.json')
  assert.match(source, /"source": "\/engagement-lab"/)
  assert.match(source, /"destination": "\/"/)
})
