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
  for (const mode of ['Standalone', 'Decompose', 'Compose']) assert.match(source, new RegExp(mode))
  levels.forEach((label, level) => {
    assert.match(source, new RegExp(`level:\\s*${level}`), `missing level ${level}`)
    assert.match(source, new RegExp(label.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')), `missing ${label}`)
  })
  for (const preset of ['umbrella', 'pencil', 'L /l/']) assert.match(source, new RegExp(preset.replace('/', '\\/'), 'i'))
})

test('engagement lab includes interactive verify, choice, construction and production controls', () => {
  const source = read('src/experiences/EngagementLab.tsx')
  assert.match(source, /True/)
  assert.match(source, /False/)
  assert.match(source, /choice/i)
  assert.match(source, /token/i)
  assert.match(source, /input/)
  assert.match(source, /reset/i)
})

test('the Lab router exposes engagement-lab behind the existing app gate', () => {
  const source = read('src/main.tsx')
  assert.match(source, /engagement-lab/)
  assert.match(source, /EngagementLab/)
  assert.match(source, /Engagement Matrix/)
  assert.match(source, /navigate\('engagement-lab'\)/)
})

test('vercel routes engagement-lab through the existing SPA', () => {
  const source = read('vercel.json')
  assert.match(source, /engagement-lab/)
  assert.match(source, /index\.html/)
})
