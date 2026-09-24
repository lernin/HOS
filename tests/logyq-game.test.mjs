import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import test from 'node:test'

const root = new URL('../public/logyq/js/', import.meta.url)
const sandbox = { window: {} }
runInNewContext(readFileSync(new URL('game-grammar.js', root), 'utf8'), sandbox)
const grammar = sandbox.window.LOGYQGameGrammar
const card = (id, shape, regions, children = []) => ({ gameId: id, shape, regions, children })

const shapes = ['whole', 'horizontal', 'diagonal_left', 'diagonal_right']

function pair(rootShape, childShape) {
  const rootRegions = rootShape === 'whole' ? [1] : [1, 2]
  const contact = rootShape === 'whole' ? 1 : 2
  const childRegions = childShape === 'whole' ? [contact] : [contact, contact === 1 ? 2 : 3]
  const solution = card('p1', rootShape, rootRegions, [card('p2', childShape, childRegions)])
  const inverted = card('p2', childShape, childRegions, [card('p1', rootShape, rootRegions)])
  return { solution, inverted }
}

test('the grammar exposes exactly the four fixed card shapes', () => {
  assert.deepEqual(Array.from(grammar.SHAPES), shapes)
  for (const shape of shapes) {
    assert.equal(grammar.validCard(card('x', shape, shape === 'whole' ? [1] : [1, 2])), true)
  }
})

test('region numbers are logical identities and top/bottom contacts follow fixed orientation', () => {
  assert.equal(grammar.edge(card('w', 'whole', [4]), 'top'), '4')
  assert.equal(grammar.edge(card('h', 'horizontal', [1, 3]), 'top'), '1')
  assert.equal(grammar.edge(card('h', 'horizontal', [1, 3]), 'bottom'), '3')
  assert.equal(grammar.edge(card('dl', 'diagonal_left', [1, 2]), 'left'), '2')
  assert.equal(grammar.edge(card('dl', 'diagonal_left', [1, 2]), 'right'), '1')
  assert.equal(grammar.edge(card('dr', 'diagonal_right', [1, 2]), 'left'), '1')
  assert.equal(grammar.edge(card('dr', 'diagonal_right', [1, 2]), 'right'), '2')
})

test('the 4×4 N=2 catalog has 15 candidates after Whole/Whole is excluded', () => {
  const candidates = []
  for (const rootShape of shapes) for (const childShape of shapes) {
    if (rootShape === 'whole' && childShape === 'whole') continue
    candidates.push([rootShape, childShape])
  }
  assert.equal(candidates.length, 15)
})

test('all 15 intended N=2 stacks fit and every inversion fails', () => {
  let count = 0
  for (const rootShape of shapes) for (const childShape of shapes) {
    if (rootShape === 'whole' && childShape === 'whole') continue
    const { solution, inverted } = pair(rootShape, childShape)
    assert.equal(grammar.complete(solution, ['p1', 'p2']), true, `${rootShape} -> ${childShape} should fit`)
    assert.equal(grammar.complete(inverted, ['p1', 'p2']), false, `${rootShape} -> ${childShape} inversion must fail`)
    count += 1
  }
  assert.equal(count, 15)
})

test('each inverted puzzle can be solved by promoting the intended root above the current root', () => {
  for (const rootShape of shapes) for (const childShape of shapes) {
    if (rootShape === 'whole' && childShape === 'whole') continue
    const { inverted } = pair(rootShape, childShape)
    assert.equal(grammar.canDrop(inverted, 'p1', { type: 'rootAbove' }), true, `${rootShape} -> ${childShape}`)
  }
})

test('Whole/Whole demonstrates why the excluded pair is ambiguous under inversion', () => {
  const a = card('p1', 'whole', [1], [card('p2', 'whole', [1])])
  const b = card('p2', 'whole', [1], [card('p1', 'whole', [1])])
  assert.equal(grammar.complete(a, ['p1', 'p2']), true)
  assert.equal(grammar.complete(b, ['p1', 'p2']), true)
})
