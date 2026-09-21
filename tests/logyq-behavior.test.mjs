import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { engineSource, extractBlock } from './logyq-source.mjs'

function loadUtils() {
  const block = readFileSync(new URL('../public/logyq/js/engine/03-utils.js', import.meta.url), 'utf8')
  return new Function(`${block}; return utils;`)()
}

function loadTreeHelpers() {
  const utils = loadUtils()
  const source = engineSource()
  const dataBlock = extractBlock(
    source,
    '  const dataManager = {',
    '  /* ======================= VISUALS ======================= */',
  )
  const parseBlock = extractBlock(source, 'function tryParsePureJSON(str){', 'function __namesFromSubtree(nodeData){')
  return new Function('utils', `${dataBlock}\n${parseBlock}\nreturn { dataManager, tryParsePureJSON, tryParseGIQ, parseIncoming };`)(utils)
}

test('utils assign stable uids, clone trees, and resolve paths', () => {
  const utils = loadUtils()
  const tree = { name: 'root', children: [{ name: 'a' }, { name: 'b', children: [{ name: 'c' }] }] }
  utils.assignUids(tree)
  assert.equal(tree._uid, 'n1')
  assert.equal(tree.children[0]._uid, 'n2')
  assert.equal(tree.children[1].children[0]._uid, 'n4')

  const clone = utils.deepClone(tree)
  clone.name = 'other'
  assert.equal(tree.name, 'root')
  assert.equal(utils.findByUid(tree, 'n4').name, 'c')
  assert.deepEqual(utils.pathToUid(tree, 'n4'), ['n1', 'n3', 'n4'])
  assert.equal(utils.uidInSubtree(tree.children[1], 'n2'), false)
  assert.equal(utils.uidInSubtree(tree, 'n4'), true)
  assert.equal(utils.clamp(9, 0, 5), 5)
})

test('sample tree generator still builds the known 30-node baseline', () => {
  const { dataManager } = loadTreeHelpers()
  const root = dataManager.generateTree(30)
  const names = []
  const visit = (node) => {
    names.push(node.name)
    for (const child of node.children || []) visit(child)
  }
  visit(root)
  const expected = Array.from({ length: 30 }, (_, index) => `Node ${String(index + 1).padStart(2, '0')}`)
  assert.equal(root.name, 'Node 01')
  assert.ok(root._uid)
  assert.deepEqual([...names].sort(), expected)
  assert.equal(new Set(names).size, 30)
})

test('GIQ and JSON import parsing keep v161 normalization rules', () => {
  const { tryParsePureJSON, tryParseGIQ, parseIncoming } = loadTreeHelpers()
  assert.deepEqual(tryParsePureJSON('{"name":"Root","children":[{"name":"Child"}]}'), {
    name: 'Root',
    children: [{ name: 'Child' }],
  })
  const giq = tryParseGIQ('{"name":"Map"}\n###\nalpha, beta\n$$$\nignored')
  assert.equal(giq.tree.name, 'Map')
  assert.deepEqual(giq.wordBank, ['alpha', 'beta'])
  assert.equal(parseIncoming('plain text'), null)
})

test('undo history is capped at CONFIG.HISTORY_LIMIT of 50', () => {
  const source = engineSource()
  assert.match(source, /HISTORY_LIMIT:\s*50/)
  const push = extractBlock(source, '  function pushHistory(action){', 'function autoFitSoon(delay){')
  const fake = {
    history: [],
    undoBtn: { disabled: true },
  }
  const CONFIG = { HISTORY_LIMIT: 50 }
  const elements = { undoBtn: fake.undoBtn }
  const state = fake
  const pushHistory = new Function('state', 'elements', 'CONFIG', `${push}; return pushHistory;`)(state, elements, CONFIG)
  for (let i = 0; i < 60; i += 1) pushHistory({ type: 'rename', i })
  assert.equal(state.history.length, 50)
  assert.equal(state.history[0].i, 10)
  assert.equal(elements.undoBtn.disabled, false)
})

test('group moves ignore descendants whose ancestor is also selected', () => {
  const source = readFileSync(new URL('../public/logyq/js/engine/10-selection.js', import.meta.url), 'utf8')
  const block = extractBlock(source, 'function topLevelSelection(uids){', 'function clearFocus(){')
  const make = (uid, x, parent = null) => {
    const node = { data: { _uid: uid }, x, parent, children: [] }
    if (parent) parent.children.push(node)
    return node
  }
  const root = make('root', 0)
  const a = make('a', 10, root)
  const b = make('b', 40, root)
  const aChild = make('a-child', 12, a)
  const collect = []
  const walk = (node) => { collect.push(node); node.children.forEach(walk) }
  walk(root)
  root.descendants = () => collect
  const topLevelSelection = new Function('state', `${block}; return topLevelSelection;`)({ root })
  assert.deepEqual(topLevelSelection(new Set(['a', 'a-child', 'b'])), ['a', 'b'])
})

test('normalizeToTree preserves v161 array, node, and plain-object rules', () => {
  const source = readFileSync(new URL('../public/logyq/js/engine/14-word-dock.js', import.meta.url), 'utf8')
  const start = source.indexOf('function normalizeToTree(value) {')
  const end = source.indexOf('return node || null;', start)
  assert.ok(start >= 0 && end > start)
  const block = `${source.slice(start, end)}return node || null;\n}`
  const normalizeToTree = new Function(`${block}; return normalizeToTree;`)()
  assert.deepEqual(normalizeToTree(['alpha', 'beta']), {
    name: 'Root',
    children: [{ name: 'alpha' }, { name: 'beta' }],
  })
  assert.deepEqual(normalizeToTree({ name: 'Map', children: [{ name: 'Child' }] }), {
    name: 'Map',
    children: [{ name: 'Child' }],
  })
  assert.equal(normalizeToTree('leaf').name, 'leaf')
})

test('undo still recognizes the original action types', () => {
  const history = readFileSync(new URL('../public/logyq/js/engine/05-history.js', import.meta.url), 'utf8')
  for (const type of ['delete', 'move', 'add', 'rename', 'randomize', 'delete-root', 'add-root', 'replace-root']) {
    assert.ok(history.includes(`'${type}'`), type)
  }
})

test('duplicate Word Dock drop helper remains in place', () => {
  const source = engineSource()
  const matches = source.match(/function dropSelectedToWordBank/g) || []
  assert.equal(matches.length, 2)
})
