import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import test from 'node:test'

const root = new URL('../public/logyq/js/', import.meta.url)
const sandbox = { window: {} }
runInNewContext(readFileSync(new URL('game-grammar.js', root), 'utf8'), sandbox)
const grammar = sandbox.window.LOGYQGameGrammar
const card = (id, paint, children = []) => ({ gameId: id, paint, children })

test('the four fixed geometries expose the intended top and bottom contacts', () => {
  for (const shape of ['L', 'DL', 'DR']) {
    assert.equal(grammar.edge(shape + ':A:B', 'top'), 'A')
    assert.equal(grammar.edge(shape + ':A:B', 'bottom'), 'B')
  }
  assert.equal(grammar.edge('W:A', 'top'), 'A')
  assert.equal(grammar.edge('W:A', 'bottom'), 'A')
  assert.equal(grammar.edge('DL:A:B', 'left'), 'B')
  assert.equal(grammar.edge('DL:A:B', 'right'), 'A')
  assert.equal(grammar.edge('DR:A:B', 'left'), 'A')
  assert.equal(grammar.edge('DR:A:B', 'right'), 'B')
})

test('Whole/Whole is ambiguous and therefore omitted from the 15-level curriculum', () => {
  const first = card('a', 'W:A', [card('b', 'W:A')])
  const second = card('b', 'W:A', [card('a', 'W:A')])
  assert.equal(grammar.complete(first, ['a', 'b']), true)
  assert.equal(grammar.complete(second, ['a', 'b']), true)
})

test('all other ordered geometry pairs have one canonical vertical solution', () => {
  const shapes = ['W', 'L', 'DL', 'DR']
  let count = 0
  for (const rootShape of shapes) {
    for (const childShape of shapes) {
      if (rootShape === 'W' && childShape === 'W') continue
      count++
      const rp = rootShape === 'W' ? 'W:A' : rootShape + ':A:B'
      const contact = rootShape === 'W' ? 'A' : 'B'
      const cp = childShape === 'W' ? 'W:' + contact : childShape + ':' + contact + ':' + (contact === 'A' ? 'B' : 'C')
      const solved = card('r', rp, [card('c', cp)])
      const reversed = card('c', cp, [card('r', rp)])
      assert.equal(grammar.complete(solved, ['r', 'c']), true, rootShape + ' -> ' + childShape)
      assert.equal(grammar.complete(reversed, ['r', 'c']), false, childShape + ' must not also root ' + rootShape)
      assert.equal(grammar.canDrop(reversed, 'r', { type: 'rootAbove' }), true)
    }
  }
  assert.equal(count, 15)
})

test('diagonal sibling orientation remains physically meaningful', () => {
  const left = card('left', 'DL:A:B')
  const right = card('right', 'DR:B:C')
  assert.notEqual(grammar.edge(left.paint, 'right'), grammar.edge(right.paint, 'left'))
})
