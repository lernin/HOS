import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import test from 'node:test'

const dock = readFileSync(new URL('../public/logyq/js/engine/14-word-dock.js', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../public/logyq/js/preview/02-styles.js', import.meta.url), 'utf8')

test('game bank keeps short and diagonal pulls seated while a clear upward pull lifts', () => {
  const source = dock.match(/  function gameBankIntent\(dx, dy\) \{[\s\S]*?\n  \}/)?.[0]
  assert.ok(source, 'game bank intent helper exists')
  const context = {}
  runInNewContext(source + '\nthis.intent = gameBankIntent', context)
  const intent = context.intent
  assert.equal(intent(0, -6), 'wait')
  assert.equal(intent(1, -18), 'wait')
  assert.equal(intent(1, -30), 'lift')
  assert.equal(intent(20, -30), 'lift')
  assert.equal(intent(22, -30), 'pan')
  assert.equal(intent(25, -4), 'pan')
  assert.equal(intent(-25, 4), 'pan')
  assert.equal(intent(2, 18), 'ignore')
  assert.equal(intent(20, -11), 'pan')
  assert.match(dock, /if \(directPuzzleShelf\(\)\) \{[\s\S]*?gameBankIntent\(dx, dy\)/)
  assert.match(dock, /const previousScroll = directPuzzleShelf\(\)/)
  assert.match(dock, /strip\.scrollLeft = previousScroll/)
})

test('game shelf gives horizontal touch gestures to native scrolling', () => {
  const gameDock = [...styles.matchAll(/body\.logyq-game #Dock,body\.logyq-game #Dock\.dock-left\{[^}]+\}/g)].at(-1)?.[0]
  const strip = [...styles.matchAll(/body\.logyq-game #logyq-bank-chips\{[^}]+\}/g)].at(-1)?.[0]
  const chip = [...styles.matchAll(/body\.logyq-game #Dock \.chip\.logyq-shape-chip,body\.logyq-game #Dock\.dock-left \.chip\.logyq-shape-chip\{[^}]+\}/g)].at(-1)?.[0]
  for (const rule of [gameDock, strip, chip]) assert.match(rule, /touch-action:pan-x/)
  assert.match(dock, /if \(intent === 'pan' \|\| intent === 'ignore'\) \{[\s\S]*?session\.nativePanning = true[\s\S]*?return/)
  assert.match(dock, /if \(session\.nativePanning\) return/)
})

test('game bank is an unboxed two-row horizontal strip with a right-side peek', () => {
  const gameDock = [...styles.matchAll(/body\.logyq-game #Dock,body\.logyq-game #Dock\.dock-left\{[^}]+\}/g)].at(-1)?.[0]
  assert.ok(gameDock)
  assert.match(gameDock, /background:transparent/)
  assert.match(gameDock, /border:0/)
  assert.match(gameDock, /box-shadow:none/)
  const strip = [...styles.matchAll(/body\.logyq-game #logyq-bank-chips\{[^}]+\}/g)].at(-1)?.[0]
  assert.ok(strip)
  assert.match(strip, /grid-template-rows:repeat\(2,44px\)/)
  assert.match(strip, /grid-auto-flow:column/)
  assert.match(strip, /overflow-x:auto/)
  assert.match(strip, /overflow-y:hidden/)
  assert.match(strip, /grid-auto-columns:clamp\(64px,18vw,72px\)/)
})
