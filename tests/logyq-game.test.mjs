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

function physicalSolutions(pieces) {
  const found = []
  const ids = pieces.map((piece) => piece.gameId)
  const consider = (tree) => {
    if (grammar.complete(tree, ids)) found.push(tree)
  }
  if (pieces.length === 2) {
    const [a, b] = pieces
    consider(card(a.gameId, a.paint, [card(b.gameId, b.paint)]))
    consider(card(b.gameId, b.paint, [card(a.gameId, a.paint)]))
    return found
  }
  for (const root of pieces) {
    const rest = pieces.filter((piece) => piece !== root)
    consider(card(root.gameId, root.paint, rest.map((piece) => card(piece.gameId, piece.paint))))
    consider(card(root.gameId, root.paint, rest.slice().reverse().map((piece) => card(piece.gameId, piece.paint))))
    consider(card(root.gameId, root.paint, [card(rest[0].gameId, rest[0].paint, [card(rest[1].gameId, rest[1].paint)])]))
    consider(card(root.gameId, root.paint, [card(rest[1].gameId, rest[1].paint, [card(rest[0].gameId, rest[0].paint)])]))
  }
  return found
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
  assert.equal(levels.length, 39)
  levels.forEach((level, index) => {
    assert.equal(level.title.startsWith((index + 1) + ' · '), true, level.title)
  })
  sandbox.preview.game.render()
  const html = elements['logyq-game-path'].innerHTML
  assert.equal(html.match(/data-game-level=/g).length, 39)
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
  const pieces = piecePool(first)
  const solved = physicalSolutions(pieces)[0]
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
  const lastSolved = physicalSolutions(piecePool(last))[0]
  assert.ok(lastSolved, last.id)
  sandbox.preview.game.begin(last)
  sandbox.bridge._snapshot = { tree: lastSolved }
  sandbox.preview.game.check()
  assert.equal(elements['logyq-game-status'].textContent, 'All 39 levels cleared.')
  assert.equal(elements['logyq-game-next'].hidden, true)
})

test('each playtest level has a solution made only of visible contacts', () => {
  const { sandbox } = loadGameFragment()
  const stuck = []
  for (const level of sandbox.preview.game.levels) {
    const pieces = piecePool(level)
    assert.equal(new Set(pieces.map((piece) => piece.gameId)).size, level.ids.length, level.id)
    if (!physicalSolutions(pieces).length) stuck.push(level.id + ' ' + level.title)
  }
  assert.deepEqual(stuck, [])
})
