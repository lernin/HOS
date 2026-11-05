import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import * as d3 from 'd3'

const jsRoot = new URL('../public/logyq/js/', import.meta.url)
const sandbox = { window: {} }
runInNewContext(readFileSync(new URL('game-grammar.js', jsRoot), 'utf8'), sandbox)
const grammar = sandbox.window.LOGYQGameGrammar

function giantBlock(file) {
  const source = readFileSync(new URL(file, jsRoot), 'utf8')
  const block = source.match(/  const GIANT_COLORS = [\s\S]*?(?=  const GAME_ADAPTIVE = '_adaptive')/)
  assert.ok(block, file + ' has the giant levels')
  return block[0]
}

test('15-piece giants have visible, unique, portrait branches; 20-piece levels stay intact', () => {
  const block = giantBlock('preview/10-game.js')
  assert.equal(giantBlock('preview.js'), block, 'served script and fragment must agree')
  const levels = []
  runInNewContext(block, { addOpenLevel(id, title, tree, anchor, extra) {
    levels.push({ id, title, tree, anchor, extra })
  } })
  assert.equal(levels.length, 6)
  const shapes = []
  for (const [index, level] of levels.entries()) {
    const pieces = []
    const walk = (node, depth = 1) => {
      pieces.push({ gameId: node.gameId, paint: node.paint, depth, forks: node.children.length })
      node.children.forEach(child => walk(child, depth + 1))
    }
    walk(level.tree)
    assert.equal(level.id, 'confidence-' + (index < 3 ? 15 : 20) + '-' + (index % 3 + 1))
    assert.equal(level.anchor, level.tree.gameId)
    assert.equal(level.extra.tier, 12)
    assert.equal(pieces.length, index < 3 ? 15 : 20)
    assert.equal(grammar.contacts(level.tree), true, level.id)
    if (index < 3) {
      const solutions = grammar.physicalSolutions(pieces, 2)
      assert.equal(solutions.length, 1, level.id + ' must have one physical solution')
      assert.equal(pieces.filter(piece => piece.forks === 2).length, 4, level.id)
      assert.ok(Math.max(...pieces.map(piece => piece.depth)) <= 7, level.id)
      assert.equal(new Set(pieces.map(piece => piece.paint)).size, 15, level.id)
      shapes.push(JSON.stringify(pieces.map(piece => [piece.depth, piece.forks])))
      const root = d3.hierarchy(level.tree)
      // Same node spacing as the game board; check the solved silhouette.
      const separation = (a, b) => {
        let A = a, B = b
        while (A.depth > B.depth) A = A.parent
        while (B.depth > A.depth) B = B.parent
        while (A !== B) { A = A.parent; B = B.parent }
        const up = Math.max(1, a.depth - A.depth)
        return Math.max(0.1, (up === 1 ? 0.9 : 0.75) +
          (up > 1 ? 0.35 * (up - 1) : 0) +
          0.2 * Math.max(0, (a.children?.length ?? 0) - 1) +
          0.2 * Math.max(0, (b.children?.length ?? 0) - 1))
      }
      d3.tree().nodeSize([160, 141]).separation(separation)(root)
      const xs = root.descendants().map(node => node.x)
      const width = Math.max(...xs) - Math.min(...xs) + 140
      const height = (Math.max(...root.descendants().map(node => node.depth)) * 141) + 63
      assert.ok(Math.min(344 / width, 472 / height) >= 0.5,
        level.id + ' is too large for the portrait safe area')
    } else {
      assert.equal(pieces.filter(piece => piece.forks > 1).length, 0, level.id)
    }
  }
  assert.equal(new Set(shapes).size, 3, 'three distinct branch silhouettes')
})
