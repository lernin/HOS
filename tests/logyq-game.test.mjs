import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import test from 'node:test'

const root = new URL('../public/logyq/js/', import.meta.url)
const sandbox = { window: {} }
runInNewContext(readFileSync(new URL('game-grammar.js', root), 'utf8'), sandbox)
const grammar = sandbox.window.LOGYQGameGrammar
const card = (id, paint, children = []) => ({ gameId: id, paint, children })

test('a child matches a parent only when the bottom and top colors agree', () => {
  const chain = card('root', 'orange', [card('middle', 'orange-blue', [card('leaf', 'blue')])])
  assert.equal(grammar.complete(chain, ['root', 'middle', 'leaf'], 'root'), true)
  assert.equal(grammar.complete(card('root', 'orange', [card('leaf', 'blue'), card('middle', 'orange-blue')]), ['root', 'middle', 'leaf'], 'root'), false)
})

test('diagonal siblings must also match at their shared edge', () => {
  const left = card('left', 'pink-blue-down')
  const right = card('right', 'blue-green-up')
  assert.equal(grammar.edge(left.paint, 'top'), 'blue')
  assert.equal(grammar.edge(left.paint, 'right'), 'blue')
  assert.equal(grammar.edge(right.paint, 'left'), 'blue')
  assert.equal(grammar.complete(card('root', 'blue', [left, right]), ['root', 'left', 'right'], 'root'), true)
  assert.equal(grammar.complete(card('root', 'blue', [right, left]), ['root', 'left', 'right'], 'root'), false)
})

test('a matching row without its parent is not a completed map', () => {
  const row = card('left', 'pink-blue-down', [card('middle', 'blue', [card('right', 'blue-green-up')])])
  assert.equal(grammar.complete(row, ['root', 'left', 'right'], 'root'), false)
})

test('drop check simulates the editor gap and node drops without mutating the source', () => {
  const chain = card('root', 'orange', [card('middle', 'orange-blue'), card('leaf', 'blue')])
  assert.equal(grammar.canDrop(chain, 'leaf', { type: 'node', targetUid: 'middle' }, 'root'), true)
  assert.equal(grammar.canDrop(chain, 'middle', { type: 'node', targetUid: 'leaf' }, 'root'), false)
  assert.equal(chain.children.length, 2)
  const branch = card('root', 'blue', [card('right', 'blue-green-up'), card('left', 'pink-blue-down')])
  assert.equal(grammar.canDrop(branch, 'left', { type: 'gap', parentUid: 'root', nextUid: 'right' }, 'root'), true)
  assert.equal(grammar.canDrop(branch, 'right', { type: 'gap', parentUid: 'root', nextUid: 'left' }, 'root'), false)
  assert.equal(grammar.canDrop(branch, 'root', { type: 'rootAbove' }, 'root'), false)
  assert.equal(branch.children[0].gameId, 'right')
})

test('the first puzzle starts as a chain and repairs by moving its parent below its child', () => {
  const start = card('root', 'orange', [card('leaf', 'blue', [card('middle', 'orange-blue')])])
  assert.equal(grammar.complete(start, ['root', 'middle', 'leaf'], 'root'), false)
  assert.equal(grammar.canDrop(start, 'leaf', { type: 'node', targetUid: 'middle' }, 'root'), true)
  assert.equal(start.children[0].gameId, 'leaf')
})
