import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import * as d3 from 'd3'

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


test('home tabs share one even row at phone width and in landscape', () => {
  const styles = readFileSync(new URL('../public/logyq/js/preview/02-styles.js', import.meta.url), 'utf8')
  const phone = styles.slice(styles.indexOf('@media (max-width:700px)'), styles.indexOf('@media (pointer:coarse)'))
  const landscape = styles.slice(styles.indexOf('@media (orientation:landscape)'))
  for (const block of [phone, landscape]) {
    assert.match(block, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/)
    assert.match(block, /white-space:nowrap/)
    assert.match(block, /minmax\(0,1fr\)/)
  }
  assert.match(phone, /font-size:clamp\(13px,3\.7vw,16px\)/)
})

test('game play fits on entry and then keeps the camera fixed', () => {
  const config = readFileSync(new URL('../public/logyq/js/engine/01-config.js', import.meta.url), 'utf8')
  const tree = readFileSync(new URL('../public/logyq/js/engine/16-tree-manager.js', import.meta.url), 'utf8')
  const history = readFileSync(new URL('../public/logyq/js/engine/05-history.js', import.meta.url), 'utf8')
  const keyboard = readFileSync(new URL('../public/logyq/js/engine/17-keyboard.js', import.meta.url), 'utf8')
  const bridge = readFileSync(new URL('../public/logyq/js/engine/18-bridge.js', import.meta.url), 'utf8')
  const gestures = readFileSync(new URL('../public/logyq/js/preview/05-v162-gestures.js', import.meta.url), 'utf8')
  assert.match(config, /function gameCameraLocked\(\)/)
  assert.match(config, /gameCameraLocked\(\)\) return/)
  assert.match(tree, /gameCameraLocked\(\)\) return false/)
  assert.match(tree, /wheel\.smooth[\s\S]*gameCameraLocked\(\)\) return/)
  assert.match(tree, /fitBtn\.addEventListener\('click'[\s\S]*gameCameraLocked\(\)\) return/)
  assert.match(history, /gameCameraLocked\(\)\) return/)
  assert.match(bridge, /fit\(\) \{[\s\S]*gameCameraLocked\(\)\) return/)
  assert.match(bridge, /if \(fit\) logyq\.treeManager\.autoFit\(\)/)
  const gameKeys = keyboard.slice(keyboard.indexOf("contains('logyq-game')"), keyboard.indexOf('const phase'))
  assert.match(gameKeys, /return;/)
  assert.doesNotMatch(gameKeys, /settleRootAnchored|autoFit|createRelative/)
  assert.match(gestures, /curriculumViewLocked\(doc\) \|\| gamePlay\(doc\)\) return false/)
  assert.match(gestures, /curriculumViewLocked\(doc\) \|\| gamePlay\(doc\)\) return/)
  assert.match(gestures, /contains\('logyq-game'\)\) return/)
})

test('game drags start after a few pixels and flicks cannot add, delete, or warehouse', () => {
  const gestures = readFileSync(new URL('../public/logyq/js/preview/05-v162-gestures.js', import.meta.url), 'utf8')
  const dock = readFileSync(new URL('../public/logyq/js/engine/14-word-dock.js', import.meta.url), 'utf8')
  const styles = readFileSync(new URL('../public/logyq/js/preview/02-styles.js', import.meta.url), 'utf8')
  assert.match(gestures, /GAME_DRAG_PX: 6/)
  assert.match(gestures, /function gamePlay\(doc\)/)
  assert.match(gestures, /if \(gamePlay\(doc\)\) return/)
  assert.match(gestures, /GAME_DRAG_PX\)/)
  assert.match(gestures, /armedBank && !gamePlay\(doc\)/)
  assert.match(gestures, /gamePlay\(doc\) \? 'none'/)
  assert.match(gestures, /Game taps do not nominate/)
  assert.match(gestures, /logyq-game'\)\)/)
  assert.match(dock, /logyq-game'\)\) \{\s*if \(Math\.hypot\(dx, dy\) < 6\) return\s*beginLift\(\[session\.word\]\)/)
  assert.match(dock, /logyq-game'\)\) return/)
  assert.doesNotMatch(styles, /body\.logyq-game #Dock,/)
  assert.match(styles, /body\.logyq-game #logyq-warehouse/)
  assert.match(styles, /body\.logyq-game #trash/)
  assert.match(styles, /body\.logyq-game #addWordBtn/)
  assert.match(styles, /body\.logyq-game #logiq-mobile-panel \[data-tool="add"\]/)
  assert.match(styles, /body\.logyq-mobile-v162\.logyq-game\.v2-branch-drag #trash/)
})

test('paint spec is the shared face for every fixed card', () => {
  const layer = grammar.paintSpec('L:A:B')
  assert.equal(layer.name, 'Layer Cake')
  assert.equal(layer.solid, undefined)
  assert.equal(layer.split.x1, '0%')
  assert.equal(layer.split.y1, '0%')
  assert.equal(layer.split.x2, '0%')
  assert.equal(layer.split.y2, '100%')
  assert.equal(layer.stops.map((stop) => stop[1]).join(','), '#60a5fa,#60a5fa,#fb923c,#fb923c')
  const left = grammar.paintSpec('DL:A:B')
  assert.equal(left.name, 'Diagonal Left')
  assert.equal(left.split.x1, '100%')
  assert.equal(left.split.y1, '0%')
  assert.equal(left.split.x2, '0%')
  assert.equal(left.split.y2, '100%')
  const right = grammar.paintSpec('DR:B:C')
  assert.equal(right.name, 'Diagonal Right')
  assert.equal(right.stops[0][1], '#fb923c')
  assert.equal(right.stops.at(-1)[1], '#86efac')
  assert.equal(right.split.x1, '0%')
  assert.equal(right.split.y1, '0%')
  assert.equal(right.split.x2, '100%')
  assert.equal(right.split.y2, '100%')
  assert.equal(grammar.paintSpec('W:A').name, 'Whole')
  assert.equal(grammar.paintSpec('W:A').solid, '#60a5fa')
})

test('game chips thumbnail the card face and other banks stay text', () => {
  const dock = readFileSync(new URL('../public/logyq/js/engine/14-word-dock.js', import.meta.url), 'utf8')
  const game = readFileSync(new URL('../public/logyq/js/preview/10-game.js', import.meta.url), 'utf8')
  const styles = readFileSync(new URL('../public/logyq/js/preview/02-styles.js', import.meta.url), 'utf8')
  assert.match(game, /gameGrammar\.paintSpec\(paint\)/)
  assert.doesNotMatch(game, /x1: '100%', y1: '0%', x2: '0%', y2: '100%'/)
  assert.match(dock, /contains\('logyq-game'\)/)
  assert.match(dock, /LOGYQGameGrammar\?\.paintSpec/)
  assert.match(dock, /CONFIG\.CARD_WIDTH/)
  assert.match(dock, /CONFIG\.CARD_HEIGHT/)
  assert.match(dock, /aria-label', spec\.name/)
  assert.match(dock, /stroke', '#ffffff'/)
  assert.match(dock, /key\.textContent = word/)
  assert.match(dock, /if \(!spec\) \{\s*chip\.textContent = word/)
  assert.match(dock, /paintBankChip\(ghost, word\)/)
  assert.match(styles, /logyq-shape-chip svg\{display:block;height:30px;width:auto\}/)
  assert.match(styles, /body\.logyq-game #Dock \.chip\.logyq-shape-chip/)
})

test('a loose bank card can solve from either starting side', () => {
  const root = card('r', 'L:A:B')
  const child = card('c', 'DR:B:C')
  assert.equal(grammar.canAdd(root, child, { type: 'node', targetUid: 'r' }), true)
  assert.equal(grammar.canAdd(child, root, { type: 'rootAbove' }), true)
  assert.equal(grammar.canAdd(root, child, { type: 'rootAbove' }), false)
})

function piecePool(level) {
  const pieces = []
  const take = (node) => {
    if (!node?.gameId) return
    pieces.push({ gameId: node.gameId, paint: node.paint, name: '', children: [] })
    for (const child of node.children || []) take(child)
  }
  take(level.tree)
  for (const card of Object.values(level.bankCards || {})) take(card)
  return pieces
}

function solutionPieces(level) {
  const ids = new Set(level.ids)
  return piecePool(level).filter((piece) => ids.has(piece.gameId))
}

function decoyPieces(level) {
  const ids = new Set(level.ids)
  return piecePool(level).filter((piece) => !ids.has(piece.gameId))
}

function loadGameFragment() {
  const store = {}
  const listeners = {}
  const elements = {}
  const bodyClass = new Set()
  function el(id) {
    return {
      id,
      hidden: true,
      style: {},
      innerHTML: '',
      textContent: '',
      dataset: {},
      listeners: {},
      addEventListener(type, fn) { (listeners[id + ':' + type] ||= []).push(fn) },
      querySelector() { return null },
      insertBefore() {},
      firstChild: null,
    }
  }
  const sandbox = {
    window: {},
    document: {
      body: {
        classList: {
          add(...names) { names.forEach((name) => bodyClass.add(name)) },
          remove(...names) { names.forEach((name) => bodyClass.delete(name)) },
          toggle(name, on) { if (on) bodyClass.add(name); else bodyClass.delete(name) },
          contains(name) { return bodyClass.has(name) },
        },
      },
      getElementById(id) { return elements[id] ||= el(id) },
      createElementNS() {
        return { setAttribute() {}, appendChild() {}, querySelector() { return null } }
      },
    },
    readJson(key, fallback) {
      if (!store[key]) return fallback
      return JSON.parse(store[key])
    },
    localStorage: {
      setItem(key, value) { store[key] = value },
      getItem(key) { return store[key] ?? null },
    },
    structuredClone: globalThis.structuredClone,
    d3,
    app: {},
    preview: {},
    bridge: { loadMap() {}, snapshot() { return sandbox.bridge._snapshot || { tree: null } } },
    leaveCurriculumPlay() {},
    updateMapName() {},
    hideLibrary() {},
    setSaveState() {},
    openLibrary() { return Promise.resolve() },
    setHomeTab() {},
    DEFAULT_NAME: 'Untitled',
  }
  runInNewContext(readFileSync(new URL('game-grammar.js', root), 'utf8'), sandbox)
  runInNewContext(readFileSync(new URL('preview/10-game.js', root), 'utf8'), sandbox)
  return { sandbox, elements, listeners, store }
}

test('every game level is selectable without clearing an earlier one', () => {
  const { sandbox, elements, listeners } = loadGameFragment()
  const levels = sandbox.preview.game.levels
  assert.equal(levels.length, 139)
  levels.forEach((level, index) => {
    assert.equal(level.title.startsWith((index + 1) + ' · '), true, level.title)
  })
  sandbox.preview.game.render()
  const html = elements['logyq-game-path'].innerHTML
  assert.equal(html.match(/data-game-level=/g).length, 139)
  assert.doesNotMatch(html, /disabled/)
  assert.doesNotMatch(html, /Clear the previous level/)
  const open = (id) => {
    const button = { dataset: { gameLevel: id } }
    for (const fn of listeners['logyq-game-path:click']) {
      fn({ target: { closest: (sel) => sel === '[data-game-level]' ? button : null } })
    }
  }
  for (const index of [0, 15, 27, 38]) {
    open(levels[index].id)
    assert.equal(sandbox.app.game.id, levels[index].id, 'level ' + (index + 1) + ' opens with an empty progress record')
    assert.equal(sandbox.app.game.cleared, false)
  }
})

test('completion is recorded and never required for the next pick', () => {
  const { sandbox, elements } = loadGameFragment()
  const levels = sandbox.preview.game.levels
  const first = levels[0]
  const pieces = solutionPieces(first)
  const solved = grammar.physicalSolutions(pieces, 2)[0]
  assert.ok(solved, first.id)
  sandbox.preview.game.begin(first)
  sandbox.bridge._snapshot = { tree: solved }
  sandbox.preview.game.check()
  assert.equal(elements['logyq-game-status'].textContent, 'It fits!')
  assert.equal(elements['logyq-game-next'].hidden, false)
  assert.doesNotMatch(elements['logyq-game-status'].textContent, /unlock/i)
  sandbox.preview.game.render()
  assert.match(elements['logyq-game-path'].innerHTML, new RegExp('data-game-level="' + first.id + '" class="is-cleared"'))
  assert.match(elements['logyq-game-path'].innerHTML, /✓/)
  sandbox.preview.game.begin(levels[27])
  assert.equal(sandbox.app.game.id, levels[27].id)
  const last = levels.at(-1)
  const lastSolved = grammar.physicalSolutions(solutionPieces(last), 1)[0]
  assert.ok(lastSolved, last.id)
  sandbox.preview.game.begin(last)
  sandbox.bridge._snapshot = { tree: lastSolved }
  sandbox.preview.game.check()
  assert.equal(elements['logyq-game-status'].textContent, 'It fits!')
  assert.equal(elements['logyq-game-next'].hidden, false)
  for (const level of levels) {
    const progress = JSON.parse(sandbox.localStorage.getItem('logyq_game_progress_v2') || '{}')
    if (progress[level.id]) continue
    const tree = grammar.physicalSolutions(solutionPieces(level), 1)[0]
    assert.ok(tree, level.id)
    sandbox.preview.game.begin(level)
    sandbox.bridge._snapshot = { tree }
    sandbox.preview.game.check()
  }
  assert.equal(elements['logyq-game-status'].textContent, 'All 139 levels cleared.')
  assert.equal(elements['logyq-game-next'].hidden, false)
})

test('each playtest level has a solution made only of visible contacts', () => {
  const { sandbox } = loadGameFragment()
  const stuck = []
  for (const level of sandbox.preview.game.levels) {
    const pieces = solutionPieces(level)
    assert.equal(new Set(pieces.map((piece) => piece.gameId)).size, level.ids.length, level.id)
    if (!grammar.physicalSolutions(pieces, 2).length) stuck.push(level.id + ' ' + level.title)
  }
  assert.deepEqual(stuck, [])
})

test('every level has one physical solution and every decoy has no seat', () => {
  const { sandbox } = loadGameFragment()
  const levels = sandbox.preview.game.levels
  assert.equal(levels.length, 139)
  const tiers = {}
  for (const level of levels) tiers[level.tier] = (tiers[level.tier] || 0) + 1
  assert.deepEqual(tiers, { 1: 15, 2: 12, 3: 12, 4: 14, 5: 14, 6: 14, 7: 15, 8: 15, 9: 14, 10: 14 })
  for (const level of levels) {
    const pieces = solutionPieces(level)
    const sols = grammar.physicalSolutions(pieces, 2)
    assert.equal(sols.length, 1, level.title)
    assert.equal(grammar.complete(sols[0], level.ids), true, level.title)
    const paints = pieces.map((piece) => piece.paint)
    if (level.id.startsWith('climb-')) {
      assert.equal(new Set(paints).size, paints.length, level.title + ' repeats a face')
      assert.equal(paints.some((paint) => {
        const parsed = grammar.parsePaint(paint)
        return parsed.shape === 'W' || parsed.a === parsed.b
      }), false, level.title + ' has a solid card')
    }
    for (const decoy of decoyPieces(level)) {
      assert.equal(grammar.validSeats(sols[0], decoy, 1), 0, level.title + ' decoy ' + decoy.paint)
    }
  }
})

test('saved progress for an older level set still opens', () => {
  const { sandbox, elements, store } = loadGameFragment()
  store.logyq_game_progress_v2 = JSON.stringify({
    'two-l-dl': 1,
    'climb-129': 2,
    'retired-level': 3,
    _adaptive: { clean: 2, tier: 10, played: { 'climb-129': 2, 'missing-id': 4 } },
  })
  assert.doesNotThrow(() => sandbox.preview.game.render())
  assert.match(elements['logyq-game-path'].innerHTML, /data-game-level="climb-129" class="is-cleared"/)
  sandbox.preview.game.begin(sandbox.preview.game.levels[128])
  assert.equal(sandbox.app.game.id, 'climb-129')
  assert.equal(sandbox.app.game.cleared, false)
})

test('every solved tree fits a 360x640 phone at the readable card scale', () => {
  const game = readFileSync(new URL('../public/logyq/js/preview/10-game.js', import.meta.url), 'utf8')
  const styles = readFileSync(new URL('../public/logyq/js/preview/02-styles.js', import.meta.url), 'utf8')
  assert.doesNotMatch(game, /Next level unlocked/)
  assert.match(game, /'It fits!'/)
  assert.match(styles, /#logyq-game-status\{[^}]*text-overflow:ellipsis/)
  assert.match(styles, /#logyq-game-name/)
  assert.match(styles, /height:32px/)
  const { sandbox } = loadGameFragment()
  const budget = sandbox.preview.game.layoutBudget
  assert.equal(budget.minScale, 0.8)
  assert.equal(budget.safeWidth, 344)
  assert.equal(budget.safeHeight, 472)
  assert.equal(budget.maxRows, 4)
  assert.equal(budget.maxCardsWide, 3)
  const fails = []
  let widest = 0
  let tallest = 0
  for (const level of sandbox.preview.game.levels) {
    const pieces = solutionPieces(level)
    const tree = level.solution || grammar.physicalSolutions(pieces, 1)[0]
    const box = sandbox.preview.game.measureSolved(tree)
    widest = Math.max(widest, box.bounds.width)
    tallest = Math.max(tallest, box.bounds.height)
    if (box.rows > budget.maxRows || box.bounds.width * budget.minScale > budget.safeWidth + 0.05 || box.bounds.height * budget.minScale > budget.safeHeight + 0.05) {
      fails.push(level.title + ' ' + box.rows + ' rows ' + box.bounds.width.toFixed(0) + 'x' + box.bounds.height.toFixed(0))
    }
  }
  assert.deepEqual(fails, [])
  assert.ok(widest <= 428.01, 'widest solved tree is ' + widest)
  assert.ok(tallest <= 486.01, 'tallest solved tree is ' + tallest)
  let chain = null
  for (let i = 4; i >= 0; i--) chain = { gameId: 'p' + i, paint: 'L:A:B', children: chain ? [chain] : [] }
  const five = sandbox.preview.game.measureSolved(chain)
  assert.equal(five.rows, 5)
  assert.ok(five.bounds.height * budget.minScale > budget.safeHeight)
})
