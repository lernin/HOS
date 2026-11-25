import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readPortraitPreference, nextPortraitPreference } from '../src/experiences/estate/portraitMode.ts'

test('portrait exploration must be explicitly opted in', () => {
  assert.equal(readPortraitPreference(undefined), false)
  assert.equal(readPortraitPreference(null), false)
  assert.equal(readPortraitPreference('true'), false)
  assert.equal(readPortraitPreference(1), false)
  assert.equal(readPortraitPreference(true), true)
  assert.equal(readPortraitPreference(false), false)
})

test('portrait choice is reversible without touching navigation mode', () => {
  assert.equal(nextPortraitPreference(false), true)
  assert.equal(nextPortraitPreference(true), false)
})

test('the legacy landscape gate is replaced with an opt-in, interactive portrait gateway', async () => {
  const { readFileSync } = await import('node:fs')
  const css = readFileSync(new URL('../src/experiences/estate/estate.css', import.meta.url), 'utf8')
  const ui = readFileSync(new URL('../src/experiences/OceanEstate.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(css, /\.oe-root::after\{/)
  assert.match(css, /\.oe-portrait-gate/)
  assert.match(css, /orientation:portrait/)
  assert.match(ui, /data-portrait-explore=/)
  assert.match(ui, /Portrait exploration/)
  assert.match(ui, /Explore in portrait/)
})
