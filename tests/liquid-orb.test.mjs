import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../src/experiences/LiquidOrb.tsx', import.meta.url), 'utf8')
const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8')
const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))

test('Liquid Orb stays behind the existing Lab PIN gate', () => {
  assert.ok(main.indexOf("if (!pin) return") < main.indexOf("if (view === 'liquid-orb') return"))
  assert.ok(vercel.rewrites.some(rewrite => rewrite.source === '/liquid-orb' && rewrite.destination === '/'))
})

test('Liquid Orb keeps the complete preset and live-control surface', () => {
  for (const name of ['Aurora', 'Ember', 'Toxic', 'Ice', 'Plasma', 'Ghost', 'Daylight']) assert.match(source, new RegExp(`name: '${name}'`))
  for (const label of ['Size', 'Deformation', 'Lobes', 'Morph speed', 'Rotation', 'Outer glow', 'Liquid flow', 'Swirl scale', 'Brightness', 'Filaments', 'Core glow']) assert.match(source, new RegExp(`label: '${label}'`))
  assert.match(source, /Surprise me/)
  assert.match(source, /Pause motion/)
  assert.match(source, /Render quality/)
})

test('Liquid Orb is local-only and caps its render resolution', () => {
  assert.doesNotMatch(source, /fetch\(|supabase|\/api\//)
  assert.match(source, /getContext\('webgl2'/)
  assert.match(source, /1400 \/ longestSide/)
  assert.match(source, /lab-liquid-orb-settings-v1/)
})
