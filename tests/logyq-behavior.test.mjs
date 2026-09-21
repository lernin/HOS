import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { engineSource, extractBlock } from './logyq-source.mjs'

function loadUtils() {
  const block = readFileSync(new URL('../public/logyq/js/engine/03-utils.js', import.meta.url), 'utf8')
  return new Function(`const logyq = {}; function attach(name, value) { logyq[name] = value; return value; }; ${block}; return utils;`)()
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

function selectionSource() {
  return readFileSync(new URL('../public/logyq/js/engine/10-selection.js', import.meta.url), 'utf8')
}

function loadSelectionFn(startMarker, endMarker) {
  const block = extractBlock(selectionSource(), startMarker, endMarker)
  return new Function('logyq', `${block}; return ${startMarker.slice('function '.length).split('(')[0]};`)
}

test('group moves ignore descendants whose ancestor is also selected', () => {
  const make = (uid, x, parent = null) => {
    const node = { data: { _uid: uid }, x, parent, children: [] }
    if (parent) parent.children.push(node)
    return node
  }
  const root = make('root', 0)
  make('a', 10, root)
  make('b', 40, root)
  make('a-child', 12, root.children[0])
  const collect = []
  const walk = (node) => { collect.push(node); node.children.forEach(walk) }
  walk(root)
  root.descendants = () => collect
  const topLevelSelection = loadSelectionFn('function topLevelSelection(uids){', 'function clearFocus(){')({ state: { root } })
  assert.deepEqual(topLevelSelection(new Set(['a', 'a-child', 'b'])), ['a', 'b'])
})

test('selection styles outline the group and fill only the focused member', () => {
  const applySelectionStyles = loadSelectionFn('function applySelectionStyles(){', 'function toggleGroupMembershipOf(uid){')
  const nodes = [{ data: { _uid: 'a' } }, { data: { _uid: 'b' } }, { data: { _uid: 'c' } }]
  const flags = new Map()
  const elements = {
    gNodes: {
      selectAll() {
        return {
          classed(name, fn) {
            for (const node of nodes) {
              const row = flags.get(node.data._uid) || {}
              row[name] = fn(node)
              flags.set(node.data._uid, row)
            }
            return this
          },
        }
      },
    },
  }

  applySelectionStyles({
    state: { selectedUid: 'a', selectedUids: new Set(['a', 'b']), vHold: false },
    elements,
  })()
  assert.equal(flags.get('a')['is-outlined'], true)
  assert.equal(flags.get('a')['is-filled'], true)
  assert.equal(flags.get('b')['is-outlined'], true)
  assert.equal(flags.get('b')['is-filled'], false)
  assert.equal(flags.get('c')['is-outlined'], false)
  assert.equal(flags.get('a')['is-focus-vhold'], false)

  flags.clear()
  applySelectionStyles({
    state: { selectedUid: 'c', selectedUids: new Set(), vHold: true },
    elements,
  })()
  assert.equal(flags.get('c')['is-outlined'], true)
  assert.equal(flags.get('c')['is-filled'], true)
  assert.equal(flags.get('c')['is-focus-vhold'], true)
  assert.equal(flags.get('a')['is-outlined'], false)
})

test('removeNode deletes a subtree or promotes children when abandoning', () => {
  const utils = loadUtils()
  const removeNode = loadSelectionFn(
    'function removeNode(uid, { abandon = false } = {}){',
    '// ===== HOISTED HOLD HANDLERS',
  )
  const tree = {
    name: 'root',
    children: [
      { name: 'a', children: [{ name: 'a1' }, { name: 'a2' }] },
      { name: 'b' },
    ],
  }
  utils.assignUids(tree)
  const aUid = tree.children[0]._uid
  const logyq = { state: { root: { data: tree } }, utils }

  const removed = removeNode(logyq)(aUid)
  assert.equal(removed.name, 'a')
  assert.equal(removed.children.length, 2)
  assert.deepEqual(tree.children.map((child) => child.name), ['b'])

  const again = {
    name: 'root',
    children: [
      { name: 'a', children: [{ name: 'a1' }, { name: 'a2' }] },
      { name: 'b' },
    ],
  }
  utils.assignUids(again)
  const abandoned = removeNode({ state: { root: { data: again } }, utils })(again.children[0]._uid, { abandon: true })
  assert.equal(abandoned.name, 'a')
  assert.equal(abandoned.children, null)
  assert.deepEqual(again.children.map((child) => child.name), ['a1', 'a2', 'b'])
})

test('insertNodeAtDrop places a node in a sibling gap or under a target', () => {
  const utils = loadUtils()
  const insertNodeAtDrop = loadSelectionFn(
    'function insertNodeAtDrop(movingData, drop){',
    '// Move currently selected nodes under a targetUid.',
  )
  const tree = { name: 'root', children: [{ name: 'left' }, { name: 'right' }] }
  utils.assignUids(tree)
  const moving = { name: 'mid' }
  utils.assignUids(moving)
  const logyq = { state: { root: { data: tree } }, utils }
  const gap = insertNodeAtDrop(logyq)(moving, {
    type: 'gap',
    parentUid: tree._uid,
    prevUid: tree.children[0]._uid,
    nextUid: tree.children[1]._uid,
  })
  assert.equal(gap.toIndex, 1)
  assert.deepEqual(tree.children.map((child) => child.name), ['left', 'mid', 'right'])

  const adopted = { name: 'leaf' }
  utils.assignUids(adopted)
  const nodeDrop = insertNodeAtDrop(logyq)(adopted, { type: 'node', targetUid: tree.children[0]._uid })
  assert.equal(nodeDrop.toParentUid, tree.children[0]._uid)
  assert.equal(tree.children[0].children[0].name, 'leaf')
})

test('inline edit still requires exactly one selected node', () => {
  const source = readFileSync(new URL('../public/logyq/js/engine/09-editing.js', import.meta.url), 'utf8')
  const block = extractBlock(source, 'function startInlineEdit({ wipe = false } = {}) {', '/* [patch] edit-hotkey helpers end */')
  const toasts = []
  const opened = []
  const startInlineEdit = new Function('logyq', 'showToast', 'openNodeEditor', `${block}; return startInlineEdit;`)
  const run = (selectedUids) => startInlineEdit(
    { state: { root: {}, selectedUids, editorEl: null } },
    (msg) => toasts.push(msg),
    (node) => opened.push(node),
  )()

  run(new Set())
  run(new Set(['a', 'b']))
  assert.deepEqual(toasts, ['Select a node for editing', 'Select just one node'])
  assert.equal(opened.length, 0)
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

test('parseGIQ still splits JSON, word-dock, and $$$ tail', () => {
  const source = readFileSync(new URL('../public/logyq/js/engine/14-word-dock.js', import.meta.url), 'utf8')
  const block = extractBlock(source, 'function parseGIQ(raw) {', '/* Helper: normalize parsed JSON')
  const parseGIQ = new Function(`${block}; return parseGIQ;`)()
  assert.deepEqual(parseGIQ('{"name":"Map"}###alpha, beta$$$future'), {
    jsonText: '{"name":"Map"}',
    wordsText: 'alpha, beta',
    futureText: 'future',
  })
})

test('addWords splits on commas/semicolons and appends to the bank or the focused node', () => {
  const utils = loadUtils()
  const source = readFileSync(new URL('../public/logyq/js/engine/14-word-dock.js', import.meta.url), 'utf8')
  const history = []
  const dock = { innerHTML: '', appendChild() {} }
  const logyq = {
    utils,
    state: { root: null, wordBank: [], selectedUid: null, selectedUids: new Set(), chipDrag: {} },
    history: { pushHistory: (action) => history.push(action) },
    treeManager: { layoutAndRender() {} },
    selection: { showToast() {} },
    elements: { Dock: dock, caretDot: { style() { return this }, attr() { return this } }, trash: { classList: { remove() {} } }, svg: { on() {}, node() { return {} }, call() {} }, gNodes: { selectAll() { return { classed() { return this }, filter() { return this } } } } },
  }
  globalThis.document = {
    createElement() {
      return { className: '', textContent: '', draggable: false, addEventListener() {} }
    },
    querySelectorAll() { return [] },
  }
  const d3 = {
    hierarchy: fakeHierarchy,
    pointer() { return [0, 0] },
    zoomTransform() { return { invert() { return [0, 0] }, k: 1 } },
    selectAll() { return { classed() {} } },
  }
  const addWords = new Function(
    'logyq',
    'd3',
    'attach',
    `${source}; return addWords;`,
  )(logyq, d3, (name, value) => { logyq[name] = value; return value })

  addWords('alpha; beta, gamma', 'bank')
  assert.deepEqual(logyq.state.wordBank, ['alpha', 'beta', 'gamma'])

  const tree = { name: 'root', children: [] }
  logyq.utils.assignUids(tree)
  logyq.state.root = fakeHierarchy(tree)
  logyq.state.selectedUid = tree._uid
  addWords('kid', 'selected')
  assert.equal(tree.children[0].name, 'kid')
  assert.equal(history[0].type, 'add')
})

test('chip-drop cases keep empty-canvas, rootAbove, gap, then node order', () => {
  const source = readFileSync(new URL('../public/logyq/js/engine/14-word-dock.js', import.meta.url), 'utf8')
  const dropStart = source.indexOf("logyq.elements.svg.on('drop'")
  const empty = source.indexOf("if (drop.type === 'newRootAt')", dropStart)
  const above = source.indexOf("if (drop.type === 'rootAbove' && state.root)", dropStart)
  const gap = source.indexOf("if (drop.type === 'gap')", dropStart)
  const node = source.indexOf("if (drop.type === 'node')", dropStart)
  assert.ok(dropStart > 0 && empty > dropStart && above > empty && gap > above && node > gap)
})

test('undo still recognizes the original action types', () => {
  const history = readFileSync(new URL('../public/logyq/js/engine/05-history.js', import.meta.url), 'utf8')
  for (const type of ['delete', 'move', 'add', 'rename', 'randomize', 'delete-root', 'add-root', 'replace-root']) {
    assert.ok(history.includes(`'${type}'`), type)
  }
})

test('only one live dropSelectedToWordBank remains', () => {
  const source = engineSource()
  const matches = source.match(/function dropSelectedToWordBank/g) || []
  assert.equal(matches.length, 1)
})

function fakeHierarchy(data) {
  const wrap = (node, parent = null, depth = 0) => {
    const h = { data: node, parent, children: [], depth, x: 0, y: depth * 141 }
    h.children = (node.children || []).map((child) => wrap(child, h, depth + 1))
    return h
  }
  const root = wrap(data)
  const collect = []
  const visit = (n) => { collect.push(n); n.children.forEach(visit) }
  visit(root)
  root.descendants = () => collect
  return root
}

function loadDeletion() {
  const utils = loadUtils()
  const source = readFileSync(new URL('../public/logyq/js/engine/11-deletion.js', import.meta.url), 'utf8')
  const history = []
  const emptied = { count: 0 }
  const logyq = {
    utils,
    state: { root: null, wordBank: [], selectedUid: null, selectedUids: new Set() },
    history: { pushHistory: (action) => history.push(action) },
    treeManager: { layoutAndRender() {}, renderEmpty() { emptied.count += 1 } },
    selection: {
      setSelected(uid) { logyq.state.selectedUid = uid },
      selectSingle(uid) { logyq.state.selectedUid = uid },
      clearSelection() { logyq.state.selectedUid = null },
      clearGroup() { logyq.state.selectedUids = new Set() },
    },
    editing: { openNodeEditor() {}, updateNodeEditorPosition() {} },
    drag: { clear() {} },
  }
  const fns = new Function(
    'logyq',
    'd3',
    'attach',
    `${source}; return { deleteNodesToTrash, deleteSelectedNodeOnly, deleteSelectedNodesOnly, exportGIQ };`,
  )(logyq, { hierarchy: fakeHierarchy }, (name, value) => { logyq[name] = value; return value })
  return { logyq, history, emptied, ...fns }
}

test('deleteNodesToTrash drops a subtree, skips nested selections, and clears a selected root', () => {
  const { logyq, history, emptied, deleteNodesToTrash } = loadDeletion()
  const tree = {
    name: 'root',
    children: [
      { name: 'a', children: [{ name: 'a1' }] },
      { name: 'b' },
    ],
  }
  logyq.utils.assignUids(tree)
  logyq.state.root = fakeHierarchy(tree)
  const aUid = tree.children[0]._uid
  const a1Uid = tree.children[0].children[0]._uid
  deleteNodesToTrash([aUid, a1Uid])
  assert.deepEqual(tree.children.map((child) => child.name), ['b'])
  assert.equal(history[0].type, 'delete')
  assert.equal(history[0].subtree.name, 'a')

  const rooted = { name: 'only' }
  logyq.utils.assignUids(rooted)
  logyq.state.root = fakeHierarchy(rooted)
  deleteNodesToTrash([rooted._uid])
  assert.equal(logyq.state.root, null)
  assert.equal(history.at(-1).type, 'delete-root')
  assert.equal(emptied.count, 1)
})

test('deleteSelectedNodeOnly promotes children into the parent', () => {
  const { logyq, history, deleteSelectedNodeOnly } = loadDeletion()
  const tree = {
    name: 'root',
    children: [
      { name: 'keep' },
      { name: 'mid', children: [{ name: 'kid' }] },
    ],
  }
  logyq.utils.assignUids(tree)
  logyq.state.root = fakeHierarchy(tree)
  const midUid = tree.children[1]._uid
  logyq.state.selectedUids = new Set([midUid])
  deleteSelectedNodeOnly()
  assert.deepEqual(tree.children.map((child) => child.name), ['keep', 'kid'])
  assert.equal(history[0].type, 'replace-root')
  assert.equal(logyq.state.selectedUid, tree._uid)
})

test('exportGIQ still concatenates JSON, hashes, and the word bank', () => {
  const { logyq, exportGIQ } = loadDeletion()
  const tree = { name: 'Map', children: [{ name: 'Child' }] }
  logyq.utils.assignUids(tree)
  logyq.state.root = fakeHierarchy(tree)
  logyq.state.wordBank = ['alpha', 'beta']
  const giq = exportGIQ()
  assert.match(giq, /"name": "Map"/)
  assert.match(giq, /\n###\nalpha,beta\n\$\$\$/)
})

function loadTreeOps() {
  const utils = loadUtils()
  const source = readFileSync(new URL('../public/logyq/js/engine/12-tree-ops.js', import.meta.url), 'utf8')
  const history = []
  const logyq = {
    utils,
    state: { root: null, wordBank: [], selectedUid: null, selectedUids: new Set() },
    history: { pushHistory: (action) => history.push(action) },
    treeManager: { layoutAndRender() {}, renderEmpty() {} },
    selection: {
      setSelected(uid) { logyq.state.selectedUid = uid },
      selectSingle(uid) { logyq.state.selectedUid = uid },
      clearSelection() { logyq.state.selectedUid = null },
      clearGroup() { logyq.state.selectedUids = new Set() },
    },
    editing: { openNodeEditor(node) { logyq._opened = node } },
    drag: { clear() {} },
    wordDock: { addWords() {}, render() {} },
  }
  const fns = new Function(
    'logyq',
    'd3',
    'showToast',
    'attach',
    `${source}; return { addChildOf, addSiblingRightOf, addSubtreeChildOf };`,
  )(logyq, { hierarchy: fakeHierarchy }, () => {}, (name, value) => { logyq[name] = value; return value })
  return { logyq, history, ...fns }
}

test('addChildOf appends a child and addSiblingRightOf inserts after the target', () => {
  const { logyq, history, addChildOf, addSiblingRightOf } = loadTreeOps()
  const tree = { name: 'root', children: [{ name: 'a' }, { name: 'c' }] }
  logyq.utils.assignUids(tree)
  logyq.state.root = fakeHierarchy(tree)

  const childUid = addChildOf(tree._uid, 'd', { noEdit: true })
  assert.equal(tree.children.at(-1).name, 'd')
  assert.equal(tree.children.at(-1)._uid, childUid)
  assert.equal(history[0].type, 'add')
  assert.equal(logyq.state.selectedUid, childUid)
  assert.equal(logyq._opened, undefined)

  const siblingUid = addSiblingRightOf(tree.children[0]._uid, 'b')
  assert.deepEqual(tree.children.map((child) => child.name), ['a', 'b', 'c', 'd'])
  assert.equal(siblingUid, tree.children[1]._uid)
  assert.equal(logyq._opened.data._uid, siblingUid)
})

test('addSiblingRightOf on the root falls back to addChildOf', () => {
  const { logyq, addSiblingRightOf } = loadTreeOps()
  const tree = { name: 'root', children: [{ name: 'a' }] }
  logyq.utils.assignUids(tree)
  logyq.state.root = fakeHierarchy(tree)
  addSiblingRightOf(tree._uid, 'kid')
  assert.equal(tree.children.at(-1).name, 'kid')
})

test('drag drop handling keeps group, solo, then subtree order', () => {
  const source = readFileSync(new URL('../public/logyq/js/engine/13-drag.js', import.meta.url), 'utf8')
  const group = source.indexOf('/* ========= A) GROUP MOVE ========= */')
  const solo = source.indexOf('/* ========= B) SOLO MOVE (Shift held): move only this node; children stay with old parent ========= */')
  const subtree = source.indexOf('/* ========= C) NORMAL (subtree) SINGLE MOVE (no Shift, not group) ========= */')
  assert.ok(group > 0 && solo > group && subtree > solo)
  assert.match(source, /group \+ rootAbove not supported yet/)
  assert.match(source, /Never allow rootAbove while dragging the current root/)
})

test('getSelectionUids reads the group set from the logyq bag', () => {
  const source = readFileSync(new URL('../public/logyq/js/engine/13-drag.js', import.meta.url), 'utf8')
  const start = source.indexOf('function getSelectionUids(){')
  const fn = new Function('logyq', `${source.slice(start)}; return getSelectionUids;`)
  assert.deepEqual(fn({ state: { selectedUids: new Set(['b', 'a']) } })().sort(), ['a', 'b'])
  assert.deepEqual(fn({ state: { selectedUids: null } })(), [])
})

test('keyboard still handles W before the unreachable Shift+W WordBank branch', () => {
  const source = readFileSync(new URL('../public/logyq/js/engine/17-keyboard.js', import.meta.url), 'utf8')
  const w = source.indexOf("if (lower === 'w')")
  const shiftW = source.indexOf("if ((lower === 'w' && e.shiftKey)")
  assert.ok(w > 0 && shiftW > w)
  assert.equal((source.match(/function getSelectedUid\(\)/g) || []).length, 4)
})

test('getSelectedUid prefers the helper, then focus, then a singleton group', () => {
  const source = readFileSync(new URL('../public/logyq/js/engine/17-keyboard.js', import.meta.url), 'utf8')
  const start = source.lastIndexOf('function getSelectedUid(){')
  const end = source.indexOf('function insertParentAboveSelectedAndEdit()', start)
  const factory = new Function('logyq', '__selectedUid', `${source.slice(start, end)}; return getSelectedUid;`)
  assert.equal(factory({ state: { selectedUid: 'focus' } }, () => 'from-helper')(), 'from-helper')
  assert.equal(factory({ state: { selectedUid: 'focus', selectedUids: new Set(['a']) } }, null)(), 'focus')
  assert.equal(factory({ state: { selectedUid: null, selectedUids: new Set(['only']) } }, null)(), 'only')
  assert.equal(factory({ state: { selectedUid: null, selectedUids: new Set(['a', 'b']) } }, null)(), null)
})

function loadMix() {
  const utils = loadUtils()
  const history = []
  const toasts = []
  const added = []
  let rendered = 0
  const logyq = {
    utils,
    state: { root: null, wordBank: [], selectedUid: null, selectedUids: new Set() },
    history: { pushHistory: (action) => history.push(action) },
    treeManager: { layoutAndRender() {}, renderEmpty() {}, autoFit() {} },
    selection: {
      setSelected(uid) { logyq.state.selectedUid = uid },
      showToast(msg) { toasts.push(msg) },
    },
    wordDock: {
      addWords(raw, to) { added.push([raw, to]) },
      render() { rendered += 1 },
      getSelectedChipNames() { return [] },
      clearChipSelection() {},
    },
    drag: { clear() {} },
    treeOps: {},
    camera: { checkMoatAndAutoFit() {} },
  }
  const fns = new Function(
    'logyq',
    'd3',
    'attach',
    `${sourceMix()}; return { randomizeTree, onNodeContextMenu };`,
  )(logyq, { hierarchy: fakeHierarchy }, (name, value) => { logyq[name] = value; return value })
  return { logyq, history, toasts, added, rendered: () => rendered, ...fns }
}

function sourceMix() {
  return readFileSync(new URL('../public/logyq/js/engine/15-mix-and-context.js', import.meta.url), 'utf8')
}

test('randomizeTree keeps the root label, records randomize history, and clears the bank only when asked', () => {
  const { logyq, history, toasts, randomizeTree, rendered } = loadMix()
  randomizeTree(false)
  assert.equal(logyq.state.root, null)
  assert.equal(toasts[0], 'Nothing to mix')

  const tree = { name: 'Root', children: [{ name: 'A' }, { name: 'B' }] }
  logyq.utils.assignUids(tree)
  logyq.state.root = fakeHierarchy(tree)
  logyq.state.wordBank = ['C']
  randomizeTree(false)
  assert.equal(logyq.state.root.data.name, 'Root')
  assert.deepEqual(logyq.state.wordBank, ['C'])
  assert.equal(history[0].type, 'randomize')
  assert.deepEqual(history[0].nextBank, ['C'])
  assert.equal(history[0].prevBank[0], 'C')
  assert.equal(rendered(), 1)

  randomizeTree(true)
  assert.equal(logyq.state.root.data.name, 'Root')
  assert.deepEqual(logyq.state.wordBank, [])
  assert.deepEqual(history.at(-1).nextBank, [])
  assert.equal(logyq.state.repositionMode, 'mix')
})

test('context-menu Word Dock dumps still join names with newlines', () => {
  const source = sourceMix()
  assert.match(source, /logyq\.wordDock\.addWords\(namesToBank\.join\('\\n'\), 'bank'\)/)
  assert.match(source, /logyq\.wordDock\.addWords\(names\.join\('\\n'\), 'bank'\)/)
  const treeManager = readFileSync(new URL('../public/logyq/js/engine/16-tree-manager.js', import.meta.url), 'utf8')
  assert.equal((treeManager.match(/mixBtn\.addEventListener\('contextmenu'/g) || []).length, 1)
  assert.doesNotMatch(treeManager, /Tab-hold \(preserved\)/)
  assert.equal((treeManager.match(/addWordBtn\.addEventListener\('contextmenu'/g) || []).length, 0)
})

function loadLayout() {
  const source = readFileSync(new URL('../public/logyq/js/engine/07-layout-and-structure.js', import.meta.url), 'utf8')
  const attachAt = source.indexOf("attach('layout'")
  const end = source.indexOf('});', attachAt) + 3
  const cut = source.slice(0, end)
  const logyq = {
    config: { CARD_WIDTH: 140, CARD_HEIGHT: 63, VERTICAL_GAP: 78, FONT_SIZE: 18 },
    state: { root: null },
    elements: {
      gOverlay: {
        append() {
          return {
            attr() { return this },
            style() { return this },
            node() { return { style: {}, textContent: '' } },
          }
        },
      },
    },
  }
  const fns = new Function(
    'logyq',
    'd3',
    'attach',
    `${cut}; return { laneYForDepth, laneHeightForDepth, __rowStats, LabelWrap };`,
  )(logyq, { selectAll() { return { each() {} } } }, (name, value) => { logyq[name] = value; return value })
  return { logyq, ...fns }
}

test('laneYForDepth falls back to nominal spacing and uses row centers when laid out', () => {
  const { logyq, laneYForDepth, laneHeightForDepth, __rowStats } = loadLayout()
  assert.equal(laneYForDepth(2), 282)
  assert.equal(laneHeightForDepth(0), 141)

  const tree = { name: 'root', children: [{ name: 'a' }, { name: 'b' }] }
  logyq.state.root = fakeHierarchy(tree)
  logyq.state.root.children[0].y = 100
  logyq.state.root.children[1].y = 300
  logyq.state.root.y = 0
  assert.equal(__rowStats().get(0).center, 0)
  assert.equal(__rowStats().get(1).center, 200)
  assert.equal(laneYForDepth(0), 0)
  assert.equal(laneYForDepth(1), 200)
  assert.equal(laneHeightForDepth(0), 200)
  assert.equal(laneHeightForDepth(1), 141)
})

test('lane stubs stay no-ops and LabelWrap is registered on the layout bag', () => {
  const { logyq } = loadLayout()
  assert.equal(typeof logyq.layout.showLaneAtY, 'function')
  assert.equal(logyq.layout.showLaneAtY(12), undefined)
  assert.equal(logyq.layout.hideLane(), undefined)
  assert.equal(logyq.layout.refreshLaneOnZoom(), undefined)
  assert.equal(typeof logyq.layout.LabelWrap.apply, 'function')
})

function loadStructure() {
  const utils = loadUtils()
  const history = []
  const toasts = []
  const source = readFileSync(new URL('../public/logyq/js/engine/07-layout-and-structure.js', import.meta.url), 'utf8')
  const logyq = {
    utils,
    config: { CARD_WIDTH: 140, CARD_HEIGHT: 63, VERTICAL_GAP: 78, FONT_SIZE: 18 },
    state: { root: null, selectedUid: null, selectedUids: new Set() },
    history: { pushHistory: (action) => history.push(action) },
    treeManager: { layoutAndRender() {} },
    selection: {
      showToast(msg) { toasts.push(msg) },
      setSelected(uid) { logyq.state.selectedUid = uid },
    },
    camera: { checkMoatAndAutoFit() {} },
    elements: {
      gOverlay: {
        append() {
          return {
            attr() { return this },
            style() { return this },
            node() { return { style: {}, textContent: '' } },
          }
        },
      },
    },
  }
  const fns = new Function(
    'logyq',
    'd3',
    'attach',
    `${source}; return { moveSelectedHorizontally, moveSelectedVertically };`,
  )(logyq, { hierarchy: fakeHierarchy, selectAll() { return { each() {} } } }, (name, value) => { logyq[name] = value; return value })
  return { logyq, history, toasts, ...fns }
}

test('moveSelectedHorizontally swaps siblings under the same parent and keeps focus', () => {
  const { logyq, history, toasts, moveSelectedHorizontally } = loadStructure()
  moveSelectedHorizontally(1)
  assert.equal(toasts.length, 0)

  const tree = { name: 'root', children: [{ name: 'A' }, { name: 'B' }] }
  logyq.utils.assignUids(tree)
  logyq.state.root = fakeHierarchy(tree)
  logyq.state.selectedUid = tree.children[0]._uid
  moveSelectedHorizontally(1)
  assert.deepEqual(logyq.state.root.data.children.map((child) => child.name), ['B', 'A'])
  assert.equal(history[0].type, 'replace-root')
  assert.equal(logyq.state.selectedUid, tree.children[0]._uid)

  logyq.state.selectedUid = null
  moveSelectedHorizontally(1)
  assert.equal(toasts.at(-1), 'No focused node')
})

test('moveSelectedVertically up from a root-child becomes the new root', () => {
  const { logyq, history, moveSelectedVertically } = loadStructure()
  const tree = { name: 'root', children: [{ name: 'kid', children: [{ name: 'grand' }] }] }
  logyq.utils.assignUids(tree)
  logyq.state.root = fakeHierarchy(tree)
  const kidUid = tree.children[0]._uid
  logyq.state.selectedUid = kidUid
  moveSelectedVertically(-1)
  assert.equal(logyq.state.root.data.name, 'kid')
  assert.equal(logyq.state.root.data.children[0].name, 'root')
  assert.equal(history[0].type, 'replace-root')
  assert.equal(logyq.state.selectedUid, kidUid)
})

test('structure movers notify camera moat after a successful change', () => {
  const { logyq, moveSelectedHorizontally } = loadStructure()
  const tags = []
  logyq.camera.checkMoatAndAutoFit = (tag) => { tags.push(tag) }
  const tree = { name: 'root', children: [{ name: 'A' }, { name: 'B' }] }
  logyq.utils.assignUids(tree)
  logyq.state.root = fakeHierarchy(tree)
  logyq.state.selectedUid = tree.children[0]._uid
  moveSelectedHorizontally(1)
  assert.deepEqual(tags, ['vhold'])
})

test('isTextField treats inputs and role=textbox as typing surfaces', () => {
  const source = readFileSync(new URL('../public/logyq/js/engine/02-state.js', import.meta.url), 'utf8')
  const start = source.indexOf('const isTextField')
  const end = source.indexOf('function keyIsNav')
  const isTextField = new Function(`${source.slice(start, end)}; return isTextField;`)()
  assert.equal(isTextField(null), false)
  assert.equal(isTextField({ matches: () => true, getAttribute: () => null }), true)
  assert.equal(isTextField({ matches: () => false, getAttribute: (name) => name === 'role' ? 'textbox' : null }), true)
  assert.equal(isTextField({ matches: () => false, getAttribute: () => 'button' }), false)
})

test('cycleDockSide walks bottom → left → hidden → bottom', () => {
  const source = readFileSync(new URL('../public/logyq/js/engine/02-state.js', import.meta.url), 'utf8')
  const start = source.indexOf('function applyDockSide')
  const end = source.indexOf("attach('input'")
  const classes = new Set()
  const logyq = {
    state: { dockSide: 'bottom' },
    elements: {
      Dock: {
        classList: {
          remove(...names) { names.forEach((name) => classes.delete(name)) },
          add(name) { classes.add(name) },
        },
      },
    },
  }
  const { cycleDockSide } = new Function(
    'logyq',
    `${source.slice(start, end)}; return { applyDockSide, cycleDockSide };`,
  )(logyq)
  assert.equal(cycleDockSide(), 'left')
  assert.ok(classes.has('dock-left'))
  assert.equal(cycleDockSide(), 'hidden')
  assert.ok(classes.has('dock-hidden'))
  assert.equal(cycleDockSide(), 'bottom')
  assert.equal(classes.size, 0)
})
