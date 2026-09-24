import test from 'node:test'
import assert from 'node:assert/strict'
import { makeLevel, canPlace, place, detach, isSolved } from '../public/logyq/fit/rules.mjs'

test('the first puzzle is a three-piece chain with two different connections', () => {
  const level = makeLevel(0)
  assert.equal(level.pieces.length, 3)
  assert.deepEqual(level.pieces.map((piece) => piece.parent), [null, 0, 1])
  assert.notEqual(level.pieces[1].incoming, level.pieces[2].incoming)
})

test('all 100 generated puzzles have a fixed root, distinct physical matches, and branches later', () => {
  const shapes = new Set()
  const puzzles = new Set()
  for (let index = 0; index < 100; index++) {
    const level = makeLevel(index)
    assert.equal(level.pieces[0].parent, null)
    const keys = level.pieces.slice(1).map((piece) => piece.incoming)
    assert.equal(new Set(keys).size, keys.length, `level ${index + 1}`)
    for (const piece of level.pieces.slice(1)) {
      assert.ok(piece.parent < piece.id)
      assert.ok(level.pieces[piece.parent].outputs.includes(piece.incoming))
    }
    shapes.add(level.pieces.map((piece) => piece.outputs.length).join(','))
    puzzles.add(JSON.stringify(level.pieces.map((piece) => [piece.parent, piece.incoming])))
  }
  assert.equal(puzzles.size, 100, 'all levels should present a different fitting puzzle')
  assert.ok(shapes.size > 15)
  assert.ok(makeLevel(25).pieces.some((piece) => piece.outputs.length > 1))
  assert.ok(makeLevel(99).pieces.some((piece) => piece.incoming?.startsWith('diagonal:')))
})

test('a tile can enter only a vacant, exposed, exactly matching socket', () => {
  const level = makeLevel(0)
  const state = { 0: true }
  assert.equal(canPlace(level, state, 1, 0, 0), true)
  assert.equal(canPlace(level, state, 2, 0, 0), false)
  assert.equal(canPlace(level, state, 2, 1, 0), false)
  const next = place(level, state, 1, 0, 0)
  assert.equal(canPlace(level, next, 2, 1, 0), true)
  assert.equal(canPlace(level, next, 2, 0, 0), false)
  assert.equal(isSolved(level, next), false)
  assert.equal(isSolved(level, place(level, next, 2, 1, 0)), true)
})

test('detaching a card returns its descendants to the tray', () => {
  const level = makeLevel(0)
  const assembled = { 0: true, 1: true, 2: true }
  assert.deepEqual(detach(level, assembled, 1), { 0: true })
})
