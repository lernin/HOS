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

test('utils assign unique uids even when labels are blank', () => {
  const utils = loadUtils()
  const a = { name: '' }
  const b = { name: '' }
  utils.assignUids(a)
  utils.assignUids(b)
  assert.ok(a._uid)
  assert.ok(b._uid)
  assert.notEqual(a._uid, b._uid)
})

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

test('LOGYQ map encode stamps GIQ-compatible formatVersion and keeps color', () => {
  const source = readFileSync(new URL('../public/logyq/js/preview/01-helpers.js', import.meta.url), 'utf8')
  const preview = {}
  const maps = new Function('preview', 'DEFAULT_NAME', `${source}; return preview.maps;`)(preview, 'Untitled map')
  const encoded = maps.encodeMapTree({
    name: 'Root',
    color: '#fde68a',
    extra: 'keep-me',
    children: [{ name: 'Kid', color: '#bae6fd' }],
  })
  assert.equal(encoded.formatVersion, 2)
  assert.equal(encoded.name, 'Root')
  assert.equal(encoded.color, '#fde68a')
  assert.equal(encoded.extra, 'keep-me')
  assert.equal(encoded.children[0].color, '#bae6fd')
  assert.equal(encoded.children[0].formatVersion, undefined)
  assert.equal(encoded.root, undefined)
  const record = maps.encodeMapRecord({ name: 'Mine', tree: encoded, wordBank: ['alpha'] })
  assert.equal(record.tree.formatVersion, 2)
  assert.equal(record.tree.name, 'Root')
  assert.deepEqual(record.word_bank, ['alpha'])
  const decoded = maps.decodeMapTree(record.tree)
  assert.equal(decoded.color, '#fde68a')
  assert.equal(decoded.extra, 'keep-me')
})

test('LOGYQ blank drafts are untitled empty roots with no children', () => {
  const source = readFileSync(new URL('../public/logyq/js/preview/01-helpers.js', import.meta.url), 'utf8')
  const preview = {}
  const maps = new Function('preview', 'DEFAULT_NAME', `${source}; return preview.maps;`)(preview, 'Untitled map')
  assert.equal(maps.isBlankDraft({ id: null, name: 'Untitled map', tree: { name: '', formatVersion: 2 }, wordBank: [] }), true)
  assert.equal(maps.isBlankDraft({ id: null, name: 'Untitled map', tree: { name: '   ' }, wordBank: [] }), true)
  assert.equal(maps.isBlankDraft({ id: null, name: 'Untitled map', tree: { name: 'untitled' }, wordBank: [] }), true)
  assert.equal(maps.isBlankDraft({ id: null, name: 'Untitled map', tree: { name: 'Sky' }, wordBank: [] }), false)
  assert.equal(maps.isBlankDraft({ id: null, name: 'Untitled map', tree: { name: '', children: [{ name: 'Kid' }] }, wordBank: [] }), false)
  assert.equal(maps.isBlankDraft({ id: null, name: 'Untitled map', tree: { name: '' }, wordBank: ['alpha'] }), false)
  assert.equal(maps.isBlankDraft({ id: null, name: 'Untitled map', tree: { name: '', color: '#fde68a' }, wordBank: [] }), false)
  assert.equal(maps.isBlankDraft({ id: 'saved', name: 'Untitled map', tree: { name: '' }, wordBank: [] }), false)
  assert.equal(maps.isBlankDraft({ id: null, name: 'Untitled 1', tree: { name: '' }, wordBank: [] }), true)
  assert.equal(maps.isBlankDraft({ id: null, name: 'Untitled 2', tree: { name: '', children: [{ name: '' }] }, wordBank: [] }), false)
  assert.equal(maps.nextUntitledName(['Animals', 'Untitled 1', 'Untitled 2']), 'Untitled 3')
  assert.equal(maps.nextUntitledName([]), 'Untitled 1')
  assert.equal(maps.nextUntitledName(['untitled 4', 'Untitled 1']), 'Untitled 2')
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
  const logyq = {
    state: fake,
    elements: { undoBtn: fake.undoBtn },
    config: { HISTORY_LIMIT: 50 },
    dock: { updateDockBounds() {} },
  }
  const pushHistory = new Function('logyq', `${push}; return pushHistory;`)(logyq)
  for (let i = 0; i < 60; i += 1) pushHistory({ type: 'rename', i })
  assert.equal(logyq.state.history.length, 50)
  assert.equal(logyq.state.history[0].i, 10)
  assert.equal(logyq.elements.undoBtn.disabled, false)
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

test('hold-drag remaps only the origin ghost side, not cousin/sibling sides', () => {
  const source = readFileSync(new URL('../public/logyq/js/engine/08-detectors.js', import.meta.url), 'utf8')
  const start = source.indexOf('function putBackGhost(drop, originUid){')
  const end = source.indexOf('function holdDragGhostContext(){', start)
  assert.ok(start >= 0 && end > start)
  const remapHoldDragGhostDrop = new Function(`${source.slice(start, end)}; return remapHoldDragGhostDrop;`)()
  const origin = 'ghost-1'
  const ghosts = new Set([origin, 'ghost-kid'])
  const back = (hit) => ({ type: 'node', targetUid: origin, _hit: hit })

  const ghostEdge = { type: 'gap', prevUid: origin, nextUid: null, parentUid: 'p', _hit: { kind: 'edgeSibling' } }
  assert.deepEqual(remapHoldDragGhostDrop(ghostEdge, origin, ghosts), back(ghostEdge._hit))

  const ghostLeftCousin = { type: 'gap', prevUid: origin, nextUid: 'cousin', parentUid: 'p', _hit: { kind: 'leftCousin' } }
  assert.deepEqual(remapHoldDragGhostDrop(ghostLeftCousin, origin, ghosts), back(ghostLeftCousin._hit))

  const cousinRight = { type: 'gap', prevUid: origin, nextUid: 'cousin', parentUid: 'q', _hit: { kind: 'rightCousin' } }
  assert.equal(remapHoldDragGhostDrop(cousinRight, origin, ghosts), cousinRight)

  const cousinLeft = { type: 'gap', prevUid: 'cousin', nextUid: origin, parentUid: 'q', _hit: { kind: 'leftCousin' } }
  assert.equal(remapHoldDragGhostDrop(cousinLeft, origin, ghosts), cousinLeft)

  const ghostRightCousin = { type: 'gap', prevUid: 'cousin', nextUid: origin, parentUid: 'p', _hit: { kind: 'rightCousin' } }
  assert.deepEqual(remapHoldDragGhostDrop(ghostRightCousin, origin, ghosts), back(ghostRightCousin._hit))

  const bothGhost = { type: 'gap', prevUid: origin, nextUid: 'ghost-kid', parentUid: 'p', _hit: { kind: 'sibling', centerX: 0 } }
  assert.deepEqual(remapHoldDragGhostDrop(bothGhost, origin, ghosts), back(bothGhost._hit))

  const sibHit = { kind: 'sibling', centerX: 100 }
  const ghostSib = { type: 'gap', prevUid: origin, nextUid: 'sib', parentUid: 'p', _hit: sibHit }
  assert.deepEqual(remapHoldDragGhostDrop(ghostSib, origin, ghosts, { x: 80 }), back(sibHit))
  assert.equal(remapHoldDragGhostDrop(ghostSib, origin, ghosts, { x: 130 }), ghostSib)

  const twoCousins = { type: 'gap', prevUid: 'left', nextUid: 'right', parentUid: 'p', _hit: { kind: 'leftCousin' } }
  assert.equal(remapHoldDragGhostDrop(twoCousins, origin, ghosts), twoCousins)
  const adopt = { type: 'node', targetUid: 'other' }
  assert.equal(remapHoldDragGhostDrop(adopt, origin, ghosts), adopt)
})

test('inline edit goes through openNodeEditor, not a second helper', () => {
  const editing = readFileSync(new URL('../public/logyq/js/engine/09-editing.js', import.meta.url), 'utf8')
  const keyboard = readFileSync(new URL('../public/logyq/js/engine/17-keyboard.js', import.meta.url), 'utf8')
  const bridge = readFileSync(new URL('../public/logyq/js/engine/18-bridge.js', import.meta.url), 'utf8')
  assert.doesNotMatch(editing, /function startInlineEdit/)
  assert.doesNotMatch(editing, /function zoomToNodeCenter/)
  assert.match(editing, /function openNodeEditor/)
  assert.match(editing, /function dockMobileEditor/)
  assert.match(editing, /node-edit-dock/)
  assert.match(editing, /node-edit-stack/)
  assert.match(editing, /node-edit-cancel/)
  assert.match(editing, /Cancel rename/)
  assert.match(editing, /stack\.style\.bottom = keyboard \+ 'px'/)
  assert.doesNotMatch(editing, /node-edit-done/)
  assert.doesNotMatch(editing, /keyboard \+ 8/)
  assert.match(editing, /if \(mobileQuietEdit\(\)\) return/)
  assert.doesNotMatch(editing, /flyEditFocusToUID/)
  assert.match(editing, /closeNodeEditor\(false, true\)/)
  assert.match(editing, /closeNodeEditor\(true, true\)/)
  assert.match(keyboard, /logyq\.editing\.openNodeEditor\(h\)/)
  assert.match(bridge, /logyq\.editing\.openNodeEditor\(node\)/)
  assert.match(bridge, /item\.data\?\.\_uid === targetUid/)
  assert.match(bridge, /if \(!label\) return false/)
  assert.match(bridge, /if \(uid == null \|\| String\(uid\) === ''\) return false/)
  assert.doesNotMatch(bridge, /explicitUid/)
  assert.doesNotMatch(bridge, /targetUid = explicitUid \? uid : logyq\.state\.selectedUid/)
  assert.doesNotMatch(bridge, /if \(!target \|\| !next\) return false/)
  assert.match(bridge, /name == null \? '' : String\(name\)\.trim\(\)/)
  assert.match(editing, /utils\.findByUid\(state\.root\.data, uid\)/)
  assert.match(editing, /state\.editingUid = uid/)
  assert.match(editing, /el\.value\.trim\(\) : prev/)
  assert.doesNotMatch(editing, /\|\| prev/)
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
  assert.deepEqual(normalizeToTree({ name: 'Painted', color: '#fde68a', children: [{ name: 'Kid', color: '#bfdbfe' }] }), {
    name: 'Painted',
    color: '#fde68a',
    children: [{ name: 'Kid', color: '#bfdbfe' }],
  })
  assert.deepEqual(normalizeToTree({
    name: 'Alias',
    color: '#bbf7d0',
    label: 'Shown',
    text: 'Body',
    title: 'Title',
    value: 'Val',
  }), {
    name: 'Alias',
    color: '#bbf7d0',
    label: 'Shown',
    text: 'Body',
    title: 'Title',
    value: 'Val',
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

  const previousWindow = globalThis.window
  globalThis.window = { __logyqHoldDragBlocksBank: () => true }
  addWords('copied', 'bank')
  assert.deepEqual(logyq.state.wordBank, ['alpha', 'beta', 'gamma'], 'stay-still hold must not copy into Word Bank')
  globalThis.window = previousWindow

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
    treeManager: {
      layoutAndRender() {},
      renderEmpty() {},
      requestCreateLayout(after) {
        if (logyq.state.root?.data) logyq.state.root = fakeHierarchy(logyq.state.root.data)
        this.layoutAndRender()
        after?.()
      },
      isLayoutSettling() { return false },
    },
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
    `${source}; return { addChildOf, addSiblingRightOf, addSiblingLeftOf, insertParentAbove, addSubtreeChildOf };`,
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

test('left sibling and insert-parent stay calm when noEdit is set', () => {
  const { logyq, history, addSiblingLeftOf, insertParentAbove } = loadTreeOps()
  const tree = { name: 'root', children: [{ name: 'a' }, { name: 'c' }] }
  logyq.utils.assignUids(tree)
  logyq.state.root = fakeHierarchy(tree)
  const leftUid = addSiblingLeftOf(tree.children[1]._uid, 'b', { noEdit: true })
  assert.deepEqual(tree.children.map((child) => child.name), ['a', 'b', 'c'])
  assert.equal(leftUid, tree.children[1]._uid)
  assert.equal(logyq._opened, undefined)
  assert.equal(addSiblingLeftOf(tree._uid, 'nope', { noEdit: true }), null)

  const parentUid = insertParentAbove(tree.children[0]._uid, '', { noEdit: true })
  assert.equal(tree.children[0]._uid, parentUid)
  assert.equal(tree.children[0].name, '')
  assert.equal(tree.children[0].children[0].name, 'a')
  assert.equal(logyq.state.selectedUid, parentUid)
  assert.equal(logyq._opened, undefined)

  const wrappedUid = insertParentAbove(tree._uid, '', { noEdit: true })
  assert.equal(logyq.state.root.data._uid, wrappedUid)
  assert.equal(logyq.state.root.data.name, '')
  assert.equal(logyq.state.root.data.children[0].name, 'root')
  assert.equal(logyq.state.root.data.children[0].children[0].name, '')
  assert.equal(logyq.state.selectedUid, wrappedUid)
  assert.equal(logyq._opened, undefined)
  assert.equal(history.at(-1).type, 'replace-root')
  assert.equal(history.at(-1).prev.name, 'root')
})

test('create inserts go through requestCreateLayout instead of overlapping layoutAndRender', () => {
  const treeOps = readFileSync(new URL('../public/logyq/js/engine/12-tree-ops.js', import.meta.url), 'utf8')
  const treeManager = readFileSync(new URL('../public/logyq/js/engine/16-tree-manager.js', import.meta.url), 'utf8')
  const v162 = readFileSync(new URL('../public/logyq/js/preview/05-v162-gestures.js', import.meta.url), 'utf8')
  assert.match(treeOps, /function commitCreatedNode/)
  assert.match(treeOps, /requestCreateLayout/)
  assert.match(treeOps, /parent\.children\.push\(newNode\);\s*return commitCreatedNode/)
  assert.match(treeManager, /requestCreateLayout/)
  assert.match(treeManager, /layoutFlushQueued/)
  assert.match(treeManager, /CREATE_SETTLE_MS: 260/)
  assert.match(treeManager, /if \(state\.layoutSettling\) state\.layoutOverlapCount/)
  assert.doesNotMatch(treeManager, /selectAll\('g\.node'\)\.interrupt\(\)/)
  assert.match(v162, /function hardClearBackground/)
  assert.match(v162, /bridge\.clearFocusSelection/)
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

test('dead getSelectionUids helper is gone; bridge getSelectedUids is the live read', () => {
  const drag = readFileSync(new URL('../public/logyq/js/engine/13-drag.js', import.meta.url), 'utf8')
  const bridge = readFileSync(new URL('../public/logyq/js/engine/18-bridge.js', import.meta.url), 'utf8')
  assert.doesNotMatch(drag, /function getSelectionUids/)
  assert.match(bridge, /getSelectedUids: \(\) => logyq\.state\.selectedUids/)
})

test('keyboard W cycles the dock CSS side and no longer dumps the WordBank', () => {
  const source = readFileSync(new URL('../public/logyq/js/engine/17-keyboard.js', import.meta.url), 'utf8')
  assert.match(source, /if \(lower === 'w' && !e\.shiftKey\)/)
  assert.match(source, /logyq\.dock\.cycleDockSide\(\)/)
  assert.doesNotMatch(source, /toggleVisibility/)
  assert.doesNotMatch(source, /Moved \$\{moved\.length\} items to Trash/)
  assert.doesNotMatch(source, /renderWordBank/)
  assert.doesNotMatch(source, /function getSelectedUid/)
  assert.match(source, /logyq\.selection\.getSelectedUid\(\)/)
  assert.match(source, /function onRelativeCreateHotkeys/)
})

test('getSelectedUid prefers focus, then a singleton group', () => {
  const source = readFileSync(new URL('../public/logyq/js/engine/10-selection.js', import.meta.url), 'utf8')
  const start = source.indexOf('function getSelectedUid(){')
  const end = source.indexOf('function applySelectionStyles()', start)
  const evalUid = (state) => new Function('logyq', `${source.slice(start, end)}; return getSelectedUid();`)({ state })
  assert.equal(evalUid({ selectedUid: 'focus', selectedUids: new Set(['a']) }), 'focus')
  assert.equal(evalUid({ selectedUid: null, selectedUids: new Set(['only']) }), 'only')
  assert.equal(evalUid({ selectedUid: null, selectedUids: new Set(['a', 'b']) }), null)
  assert.equal(evalUid({ selectedUid: null, selectedUids: null }), null)
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

test('randomizeTree shuffles the root with the other cards and clears the bank only when asked', () => {
  const { logyq, history, toasts, randomizeTree, rendered } = loadMix()
  randomizeTree(false)
  assert.equal(logyq.state.root, null)
  assert.equal(toasts[0], 'Nothing to mix')

  const tree = { name: 'Root', children: [{ name: 'A' }, { name: 'B' }] }
  logyq.utils.assignUids(tree)
  logyq.state.root = fakeHierarchy(tree)
  logyq.state.wordBank = ['C']
  const random = Math.random
  Math.random = () => 0
  try { randomizeTree(false) } finally { Math.random = random }
  const names = []
  const walk = (node) => {
    names.push(node.name)
    for (const child of node.children || []) walk(child)
  }
  walk(logyq.state.root.data)
  assert.deepEqual(names.slice().sort(), ['A', 'B', 'Root'])
  assert.notEqual(logyq.state.root.data.name, 'Root')
  assert.deepEqual(logyq.state.wordBank, ['C'])
  assert.equal(history[0].type, 'randomize')
  assert.deepEqual(history[0].nextBank, ['C'])
  assert.equal(history[0].prevBank[0], 'C')
  assert.equal(rendered(), 1)

  randomizeTree(true)
  assert.deepEqual(logyq.state.wordBank, [])
  assert.deepEqual(history.at(-1).nextBank, [])
  assert.equal(logyq.state.repositionMode, 'mix')
  const mixed = []
  const walkMixed = (node) => {
    mixed.push(node.name)
    for (const child of node.children || []) walkMixed(child)
  }
  walkMixed(logyq.state.root.data)
  assert.deepEqual(mixed.slice().sort(), ['A', 'B', 'C', 'Root'])
})

test('randomizeTree and snapshot keep each card color', () => {
  const { logyq, randomizeTree } = loadMix()
  const tree = {
    name: 'Root',
    color: '#fecaca',
    children: [
      { name: 'A', color: '#fde68a' },
      { name: 'B', color: '#bfdbfe' },
      { name: 'C' },
    ],
  }
  logyq.utils.assignUids(tree)
  logyq.state.root = fakeHierarchy(tree)
  randomizeTree(false)

  const bag = []
  const walk = (node) => {
    bag.push(`${node.name}:${node.color || ''}`)
    for (const child of node.children || []) walk(child)
  }
  walk(logyq.state.root.data)
  assert.deepEqual(bag.sort(), ['A:#fde68a', 'B:#bfdbfe', 'C:', 'Root:#fecaca'].sort())
  const rootCard = (() => {
    const find = (node) => {
      if (node.name === 'Root') return node
      for (const child of node.children || []) {
        const hit = find(child)
        if (hit) return hit
      }
      return null
    }
    return find(logyq.state.root.data)
  })()
  assert.equal(rootCard.color, '#fecaca')

  const snap = logyq.utils.deepClone(logyq.state.root.data)
  const again = []
  const walkSnap = (node) => {
    again.push(`${node.name}:${node.color || ''}`)
    for (const child of node.children || []) walkSnap(child)
  }
  walkSnap(snap)
  assert.deepEqual(again.sort(), bag.sort())
})

test('randomizeTree mixes blank painted cards and keeps their colors', () => {
  const { logyq, toasts, randomizeTree } = loadMix()
  const tree = {
    name: '',
    color: '#fde68a',
    children: [
      { name: '', color: '#bae6fd' },
      { name: '', color: '#bbf7d0' },
      { name: '', color: '#fecdd3' },
    ],
  }
  logyq.utils.assignUids(tree)
  logyq.state.root = fakeHierarchy(tree)
  const random = Math.random
  Math.random = () => 0
  try { randomizeTree(false) } finally { Math.random = random }
  assert.deepEqual(toasts, [])
  assert.equal(logyq.state.root.data.name, '')
  assert.notEqual(logyq.state.root.data.color, '#fde68a')
  const colors = []
  const walk = (node) => {
    colors.push(node.color || '')
    assert.equal(node.name, '')
    for (const child of node.children || []) walk(child)
  }
  walk(logyq.state.root.data)
  assert.deepEqual(colors.slice().sort(), ['#bae6fd', '#bbf7d0', '#fde68a', '#fecdd3'].sort())
  assert.deepEqual(logyq.state.wordBank, [], 'Mix must not throw blank cards into Word Bank')
})

test('randomizeTree keeps label aliases with each card', () => {
  const { logyq, randomizeTree } = loadMix()
  const tree = {
    name: 'Root',
    label: 'Root label',
    children: [
      { name: 'A', color: '#fde68a', title: 'Alpha', text: 'A body' },
      { name: 'B', value: 'bravo' },
    ],
  }
  logyq.utils.assignUids(tree)
  logyq.state.root = fakeHierarchy(tree)
  randomizeTree(false)
  const byName = (label) => {
    const walk = (node) => {
      if (node.name === label) return node
      for (const child of node.children || []) {
        const hit = walk(child)
        if (hit) return hit
      }
      return null
    }
    return walk(logyq.state.root.data)
  }
  assert.equal(byName('Root').label, 'Root label')
  assert.equal(byName('A').color, '#fde68a')
  assert.equal(byName('A').title, 'Alpha')
  assert.equal(byName('A').text, 'A body')
  assert.equal(byName('B').value, 'bravo')
  assert.ok(byName('A')._uid)
})

test('Word Bank contextmenu never copies a card, including desktop right-click', () => {
  const config = readFileSync(new URL('../public/logyq/js/engine/01-config.js', import.meta.url), 'utf8')
  const start = config.indexOf('function coarseBankSurface')
  const end = config.indexOf('window.__logyqHoldDragFrozen = holdDragFrozen')
  const { incidentalBankContext, noteBankContextGrace } = new Function(
    `${config.slice(start, end)}; return { coarseBankSurface, incidentalBankContext, noteBankContextGrace };`,
  )()
  const previousWindow = globalThis.window
  const previousDocument = globalThis.document
  const body = { className: '', classList: { contains: (name) => body.className.split(/\s+/).includes(name) } }
  globalThis.document = { body }
  globalThis.window = {
    matchMedia: (query) => ({ matches: query.includes('pointer:coarse') && globalThis.window.coarse }),
    coarse: false,
  }

  try {
  assert.equal(incidentalBankContext({ button: 2, pointerType: 'mouse' }), false)
  assert.equal(incidentalBankContext({ button: 0, pointerType: 'mouse' }), true, 'button 0 contextmenu is a long-press')
  assert.equal(incidentalBankContext({ button: 2, pointerType: 'touch' }), true)
  globalThis.window.__logyqHoldArming = true
  assert.equal(incidentalBankContext({ button: 2, pointerType: 'mouse' }), true, 'arming must block bank contextmenu')
  globalThis.window.__logyqHoldArming = false
  globalThis.window.__logyqHoldDragSession = true
  assert.equal(incidentalBankContext({ button: 2, pointerType: 'mouse' }), true)
  globalThis.window.__logyqHoldDragSession = false
  noteBankContextGrace(5000)
  assert.equal(incidentalBankContext({ button: 2, pointerType: 'mouse' }), true, 'post-touch grace must block a late contextmenu')
  globalThis.window.__logyqSuppressBankContextUntil = 0
  globalThis.window.coarse = true
  body.className = 'logyq-mobile-v162'
  assert.equal(incidentalBankContext({ button: 2, pointerType: 'mouse' }), true, 'phone right-click synthesis must not bank')

  const { logyq, added, onNodeContextMenu } = loadMix()
  const menuEvent = () => ({ preventDefault() {}, stopPropagation() {}, button: 2, pointerType: 'mouse' })
  globalThis.window.incidentalBankContext = incidentalBankContext

  const named = { name: 'Root', children: [{ name: 'Leaf' }] }
  logyq.utils.assignUids(named)
  logyq.state.root = fakeHierarchy(named)
  const leaf = logyq.state.root.children[0]
  leaf.descendants = () => [leaf]
  globalThis.window.coarse = false
  body.className = ''
  globalThis.window.__logyqHoldArming = false
  globalThis.window.__logyqHoldDragSession = false
  globalThis.window.__logyqSuppressBankContextUntil = 0
  onNodeContextMenu(menuEvent(), leaf)
  assert.deepEqual(added, [], 'right-click must not copy a card into Word Bank')
  assert.equal(named.children[0].name, 'Leaf')

  added.length = 0
  const again = { name: 'Root', children: [{ name: 'Leaf' }] }
  logyq.utils.assignUids(again)
  logyq.state.root = fakeHierarchy(again)
  const phoneLeaf = logyq.state.root.children[0]
  phoneLeaf.descendants = () => [phoneLeaf]
  globalThis.window.coarse = true
  body.className = 'logyq-mobile-v162'
  onNodeContextMenu({ ...menuEvent(), button: 0, pointerType: 'touch' }, phoneLeaf)
  assert.deepEqual(added, [], 'phone contextmenu must not copy into Word Bank')
  assert.equal(again.children[0].name, 'Leaf')

  added.length = 0
  const blank = { name: '', color: '#fde68a', children: [{ name: '   ', color: '#bae6fd' }] }
  logyq.utils.assignUids(blank)
  logyq.state.root = fakeHierarchy(blank)
  const blankLeaf = logyq.state.root.children[0]
  blankLeaf.descendants = () => [blankLeaf]
  globalThis.window.coarse = false
  body.className = ''
  onNodeContextMenu(menuEvent(), blankLeaf)
  onNodeContextMenu(menuEvent(), logyq.state.root)
  assert.deepEqual(added, [], 'empty-label cards must not become Word Bank chips')
  assert.equal(blank.children.length, 1)
  assert.equal(logyq.state.root.data.name, '')
  } finally {
    globalThis.window = previousWindow
    globalThis.document = previousDocument
  }
})

test('undo after a bank send restores the Word Bank and redo puts the chips back', () => {
  const source = readFileSync(new URL('../public/logyq/js/engine/05-history.js', import.meta.url), 'utf8')
  const state = {
    history: [],
    redo: [],
    root: null,
    wordBank: ['Leaf'],
  }
  let dockRenders = 0
  const logyq = {
    state,
    elements: { undoBtn: { disabled: false } },
    config: { HISTORY_LIMIT: 50 },
    utils: {
      deepClone: (value) => JSON.parse(JSON.stringify(value)),
      assignIds() {},
      findByPath() { return null },
      findByUid() { return null },
    },
    dock: { updateDockBounds() {} },
    treeManager: { layoutAndRender() {}, renderEmpty() {}, autoFit() {} },
    wordDock: { render() { dockRenders += 1 } },
  }
  const d3 = { hierarchy: (data) => ({ data }) }
  let historyApi = null
  new Function('logyq', 'd3', 'attach', source)(logyq, d3, (_name, value) => { historyApi = value })
  state.history.push({ type: 'delete-root', subtree: { name: 'Leaf', _uid: 'a' }, prevBank: [] })
  historyApi.undo()
  assert.equal(state.root.data.name, 'Leaf')
  assert.deepEqual(state.wordBank, [])
  assert.ok(dockRenders >= 1)
  historyApi.redo()
  assert.equal(state.root, null)
  assert.deepEqual(state.wordBank, ['Leaf'])
})

test('sendSubtreeToWordBank ignores blank cards', () => {
  const source = readFileSync(new URL('../public/logyq/js/engine/12-tree-ops.js', import.meta.url), 'utf8')
  const start = source.indexOf('function sendSubtreeToWordBank')
  const end = source.indexOf('function sendNodeToWordBank_abandon')
  const state = { wordBank: ['keep'], root: null }
  const added = []
  const sendSubtreeToWordBank = new Function('logyq', 'showToast', 'd3', `${source.slice(start, end)}; return sendSubtreeToWordBank;`)({
    get state() { return state },
    utils: loadUtils(),
    wordDock: { addWords(raw) { added.push(raw) } },
    history: { pushHistory() {} },
    treeManager: { renderEmpty() {}, layoutAndRender() {} },
    drag: { clear() {} },
    selection: { showToast() {} },
  }, () => {}, { hierarchy: fakeHierarchy })
  const previousWindow = globalThis.window
  globalThis.window = {}
  try {
    const blank = fakeHierarchy({ name: '', color: '#fde68a', children: [{ name: '', color: '#fff' }] })
    state.root = blank
    sendSubtreeToWordBank(blank)
    assert.deepEqual(added, [])
    assert.deepEqual(state.wordBank, ['keep'])
    assert.equal(blank.data.children.length, 1)

    const named = fakeHierarchy({ name: 'Root', children: [{ name: 'Leaf' }] })
    const leaf = named.children[0]
    leaf.descendants = () => [leaf]
    state.root = named
    sendSubtreeToWordBank(leaf)
    assert.deepEqual(added, [], 'a card must not bank without move+dwell or an explicit key')
    assert.equal(named.data.children[0].name, 'Leaf')
    globalThis.window.__logyqHoldDragAllowBank = true
    sendSubtreeToWordBank(leaf)
    assert.deepEqual(added, ['Leaf'])
  } finally {
    globalThis.window = previousWindow
  }
})

test('contextmenu does not dump cards into the Word Bank', () => {
  const source = sourceMix()
  assert.match(source, /Contextmenu is never a Word Bank write/)
  assert.doesNotMatch(source, /namesToBank/)
  assert.doesNotMatch(source, /addWords\(/)
  assert.doesNotMatch(source, /wordBank\.push/)
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

test('refreshLaneOnZoom stays a no-op and LabelWrap is registered on the layout bag', () => {
  const { logyq } = loadLayout()
  assert.equal(logyq.layout.showLaneAtY, undefined)
  assert.equal(logyq.layout.hideLane, undefined)
  assert.equal(typeof logyq.layout.refreshLaneOnZoom, 'function')
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
  const start = source.indexOf('const DOCK_SIDES')
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
  const { cycleDockSide, setSide } = new Function(
    'logyq',
    `${source.slice(start, end)}; return { applyDockSide, setSide, cycleDockSide };`,
  )(logyq)
  assert.equal(cycleDockSide(), 'left')
  assert.ok(classes.has('dock-left'))
  assert.equal(cycleDockSide(), 'hidden')
  assert.ok(classes.has('dock-hidden'))
  assert.equal(cycleDockSide(), 'bottom')
  assert.equal(classes.size, 0)
  assert.equal(setSide('hidden'), 'hidden')
  assert.ok(classes.has('dock-hidden'))
  assert.equal(setSide('nope'), 'hidden')
})

test('preview gestures expose v162 flick/hold/double-tap seams and have no spawn puck', () => {
  const gestures = readFileSync(new URL('../public/logyq/js/preview/04-gestures.js', import.meta.url), 'utf8')
  const v162 = readFileSync(new URL('../public/logyq/js/preview/05-v162-gestures.js', import.meta.url), 'utf8')
  const ui = readFileSync(new URL('../public/logyq/js/preview/03-ui.js', import.meta.url), 'utf8')
  const boot = readFileSync(new URL('../public/logyq/js/preview/00-boot.js', import.meta.url), 'utf8')
  const styles = readFileSync(new URL('../public/logyq/js/preview/02-styles.js', import.meta.url), 'utf8')
  assert.match(boot, /window\.LOGYQPreview = preview/)
  assert.match(gestures, /attach\('gestures'/)
  assert.doesNotMatch(gestures, /function bindCanvasGestures/)
  assert.doesNotMatch(gestures, /function bindSpawnGestures/)
  assert.doesNotMatch(gestures, /addEventListener\('pointerdown'/)
  assert.doesNotMatch(ui, /logiq-spawn-puck/)
  assert.doesNotMatch(ui, /spawnPuck/)
  assert.doesNotMatch(ui, /logiq-mobile-context/)
  assert.doesNotMatch(ui, /function updateContextActions/)
  assert.doesNotMatch(ui, /function navigate/)
  assert.doesNotMatch(boot, /updateContextActions/)
  assert.doesNotMatch(styles, /logiq-spawn-puck/)
  assert.doesNotMatch(styles, /#logiq-mobile-context/)
  assert.doesNotMatch(boot, /spawnGesture/)
  assert.doesNotMatch(boot, /canvasPointers/)
  assert.match(v162, /HOLD_MS: 160/)
  assert.match(v162, /HOLD_SLOP: 8/)
  assert.match(v162, /DOUBLE_TAP_MS: 360/)
  assert.match(v162, /FLICK_MIN: 52/)
  assert.match(v162, /__logyqV2ConsumedPointers/)
  assert.match(v162, /bridge\.createRelative\(direction, candidate\.uid\)/)
  assert.match(v162, /function hardClearBackground/)
  assert.match(v162, /hardClearBackground\(doc, win/)
  assert.match(v162, /bridge\.editSelected\(\{ uid \}\)/)
  assert.match(v162, /function uidFromEvent/)
  assert.match(v162, /function uidFromTouchedNode/)
  assert.match(v162, /function uidFromVisualPoint/)
  assert.match(v162, /function hitEditUid/)
  assert.match(v162, /uidFromTouchedNode\(event\)/)
  assert.match(v162, /!candidate\.moved && candidate\.uid/)
  assert.match(v162, /function hitLayoutSlot/)
  assert.match(styles, /logyq-layout-settling/)
  assert.doesNotMatch(v162, /snapLaidOutNodes/)
  assert.doesNotMatch(v162, /selectAll\('g\.node'\)\.interrupt\(\)/)
  assert.doesNotMatch(v162, /armBlankCardMic\(state\.mic, doc, createdUid\)/)
  assert.match(v162, /function rankCardHits/)
  assert.match(v162, /rect:not\(\.grabzone\)/)
  assert.match(v162, /function bindV162Gestures/)
  assert.match(v162, /bindV162Gestures\(\)/)
  assert.match(v162, /function armBlankCardMic/)
  assert.match(v162, /function startCardRecording/)
  assert.match(v162, /logyq-v162-action/)
  assert.match(v162, /clearCardMic\(state\.mic\)/)
  assert.match(v162, /function edgePan/)
  assert.match(v162, /function centerPanVector/)
  assert.match(v162, /function clampPanToContent/)
  assert.match(v162, /function beginCardPan/)
  assert.match(v162, /function applyFingerPan/)
  assert.match(v162, /function stopZoomGesture/)
  assert.match(v162, /function classifyCardIntent/)
  assert.match(v162, /__logyqSuppressZoom/)
  assert.match(v162, /FLICK_FAST_MS: 180/)
  assert.match(v162, /__logyqHoldArming/)
  assert.match(v162, /PAN_DEAD_PX: 56/)
  assert.match(v162, /PAN_STEP: 16/)
  assert.doesNotMatch(v162, /EDGE_ZONE: 84/)
  assert.doesNotMatch(v162, /EDGE_STEP: 14/)
  assert.match(v162, /function fingerOffset/)
  assert.match(v162, /OFFSET_UP_CM: 1\.1/)
  assert.match(v162, /OFFSET_SIDE_CM: 0/)
  assert.match(v162, /function liftPx/)
  assert.match(v162, /y: -D/)
  assert.doesNotMatch(v162, /LATCH_MAP_SHIFT/)
  assert.doesNotMatch(v162, /function shiftMapOnLatch/)
  assert.doesNotMatch(v162, /function revertMapShift/)
  assert.doesNotMatch(v162, /function latchShiftPx/)
  assert.match(v162, /BANK_DWELL_MS: 480/)
  assert.match(v162, /PX_PER_CM: 38/)
  assert.match(v162, /cloneNode\(true\)/)
  assert.doesNotMatch(v162, /v2-float-node/)
  assert.match(v162, /function visualPoint/)
  assert.match(v162, /STILL_PX: 16/)
  assert.match(v162, /function fingerMovedFromLatch/)
  assert.match(v162, /function dragMousePoint/)
  assert.match(v162, /function activeDockKind/)
  assert.match(v162, /function paintCloneCard/)
  assert.match(v162, /if \(!fingerMovedFromLatch\(drag, x, y\)\) return 'none'/)
  assert.match(v162, /if \(!drag\?\.moved \|\| !fingerMovedFromLatch/)
  assert.match(v162, /Do not feed the 1\.1cm card lift into d3 while the finger is still/)
  assert.match(v162, /mouse\(win, win, 'mousemove', hold\.x, hold\.y, 1\)/)
  assert.match(v162, /const commitTree/)
  assert.match(v162, /__logyqHoldDragCommit = true/)
  assert.match(v162, /__logyqHoldDragCommit = false/)
  assert.match(v162, /__logyqHoldDragSession = true/)
  assert.match(v162, /__logyqHoldDragAllowBank = true/)
  assert.match(v162, /function endHoldDragSession/)
  assert.match(v162, /addEventListener\('contextmenu'/)
  assert.match(v162, /function swallowBankContextMenu/)
  assert.match(v162, /function noteTouchBankGrace/)
  assert.match(v162, /__logyqSuppressBankContextUntil/)
  const config = readFileSync(new URL('../public/logyq/js/engine/01-config.js', import.meta.url), 'utf8')
  const treeOps = readFileSync(new URL('../public/logyq/js/engine/12-tree-ops.js', import.meta.url), 'utf8')
  const drag = readFileSync(new URL('../public/logyq/js/engine/13-drag.js', import.meta.url), 'utf8')
  const treeManager = readFileSync(new URL('../public/logyq/js/engine/16-tree-manager.js', import.meta.url), 'utf8')
  const wordDock = readFileSync(new URL('../public/logyq/js/engine/14-word-dock.js', import.meta.url), 'utf8')
  const mix = readFileSync(new URL('../public/logyq/js/engine/15-mix-and-context.js', import.meta.url), 'utf8')
  assert.match(config, /function holdDragFrozen/)
  assert.match(config, /function holdDragBlocksBank/)
  assert.match(config, /function incidentalBankContext/)
  assert.match(config, /__logyqHoldArming/)
  assert.match(config, /window\.__logyqHoldDragFrozen/)
  assert.match(config, /window\.__logyqHoldDragBlocksBank/)
  assert.match(treeOps, /if \(window\.__logyqHoldDragFrozen\?\.\(\)\) return;/)
  assert.match(treeOps, /if \(window\.__logyqHoldDragBlocksBank\?\.\(\)\) return;/)
  assert.match(treeOps, /if \(!labels\.length\) return;/)
  assert.match(mix, /incidentalBankContext/)
  assert.match(treeManager, /if \(window\.__logyqHoldDragFrozen\?\.\(\)\) return;/)
  assert.match(drag, /if \(window\.__logyqHoldDragFrozen\?\.\(\)\)/)
  assert.match(drag, /dragManager\.clear\(\);/)
  assert.match(wordDock, /typeof window !== 'undefined' && window\.__logyqHoldDragBlocksBank\?\.\(\)\) return;/)
  assert.match(mix, /__logyqHoldDragBlocksBank/)
  assert.match(v162, /svg#canvas g\.node/)
  assert.match(v162, /function yieldNodeDrag/)
  assert.match(v162, /function stampOriginGhost/)
  assert.match(v162, /function restoreOriginLayout/)
  assert.match(v162, /function freezeTreeLayout/)
  assert.match(v162, /function dockDropKind/)
  assert.match(v162, /function hitBankChip/)
  assert.match(v162, /sendSubtreeToWordBank/)
  assert.match(v162, /v2-dock-target/)
  assert.match(v162, /drag\.bankArmed/)
  assert.doesNotMatch(v162, /HAND_KEY/)
  assert.match(v162, /function paintFlickDown/)
  assert.match(v162, /paintActive\(\) && direction === 'down'/)
  assert.match(v162, /function paintTap/)
  assert.match(v162, /TAP_MOVE: 11/)
  assert.match(v162, /bridge\.paintBranch/)
  assert.match(v162, /bridge\.paintUid/)
  assert.match(v162, /if \(paintTap\(\)\)/)
  assert.doesNotMatch(boot, /logyq_handedness_v1/)
  assert.match(boot, /logyq_paint_color_v1/)
  assert.match(ui, /function paintSwatches/)
  assert.match(ui, /id="logyq-paint-btn"/)
  assert.match(ui, /data-tool="paint"/)
  assert.match(ui, /function paintFlickDown|logyq-paint-strip/)
  assert.match(styles, /#logyq-paint-strip/)
  assert.doesNotMatch(ui, /data-hand="right"/)
  assert.doesNotMatch(ui, /data-hand="left"/)
  assert.doesNotMatch(ui, /logyq-handedness/)
  assert.match(styles, /body\.v2-branch-drag svg\.dragging-mode g\.nodes g\.node\.is-others\{opacity:1!important/)
  assert.match(styles, /v2-branch-origin-ghost/)
  assert.match(styles, /v2-branch-origin-ghost\.hover-adopt-sub/)
  assert.match(styles, /v2-branch-origin-ghost\.drop-target rect:not\(\.grabzone\)/)
  assert.match(styles, /#logyq-v162-branch-preview g\.node text/)
  assert.match(styles, /v2-branch-drag svg#canvas g\.node\.drop-target text/)
  assert.doesNotMatch(styles, /v2-float-node/)
  assert.doesNotMatch(v162, /startCardRecording\([^)]*createdUid/)
  assert.doesNotMatch(v162, /startVoiceCapture/)
  assert.doesNotMatch(v162, /contentWindow/)
  assert.doesNotMatch(v162, /dblclick/)
})

test('hold-drag pan is center-offset with a third-viewport content leash', () => {
  const source = readFileSync(new URL('../public/logyq/js/preview/05-v162-gestures.js', import.meta.url), 'utf8')
  const start = source.indexOf('function centerPanVector(x, y, view, C) {')
  const end = source.indexOf('function viewRect(doc, win) {', start)
  assert.ok(start >= 0 && end > start)
  const helpers = new Function(`${source.slice(start, end)}; return { centerPanVector, treeContentBounds, clampPanToContent };`)()
  const C = { PAN_DEAD_PX: 56, PAN_STEP: 16 }
  const view = { left: 0, top: 0, right: 390, bottom: 844, width: 390, height: 844 }
  assert.deepEqual(helpers.centerPanVector(195, 422, view, C), { dx: 0, dy: 0 })
  assert.deepEqual(helpers.centerPanVector(195 + 40, 422, view, C), { dx: 0, dy: 0 })
  const right = helpers.centerPanVector(360, 422, view, C)
  assert.ok(right.dx < 0, 'finger right of center pans content left')
  assert.equal(right.dy, 0)
  const down = helpers.centerPanVector(195, 700, view, C)
  assert.ok(down.dy < 0, 'finger below center pans content up')
  assert.equal(down.dx, 0)
  const up = helpers.centerPanVector(195, 80, view, C)
  assert.ok(up.dy > 0, 'finger above center pans content down')
  const farther = helpers.centerPanVector(195, 820, view, C)
  assert.ok(Math.abs(farther.dy) > Math.abs(down.dy), 'further from center is stronger')

  const wide = { minX: -400, maxX: 800, minY: -400, maxY: 1200, cardW: 140, cardH: 63 }
  const t = { x: 200, y: 200, k: 1 }
  const marginX = view.width / 3
  const marginY = view.height / 3
  const free = helpers.clampPanToContent(t, -40, 0, wide, view)
  assert.equal(free.dx, -40, 'wide tree can still slide toward the leading edge')
  const fingerRight = helpers.clampPanToContent(t, -2000, 0, wide, view)
  const rightEdge = wide.maxX * t.k + t.x + fingerRight.dx
  assert.ok(Math.abs(rightEdge - (view.right - marginX)) < 0.5, 'finger-right stops with ~⅓ viewport empty on the right')
  assert.ok(rightEdge > view.left + 100, 'must not crush the AABB onto the opposite (left) side')
  const fingerLeft = helpers.clampPanToContent(t, 2000, 0, wide, view)
  const leftEdge = wide.minX * t.k + t.x + fingerLeft.dx
  assert.ok(Math.abs(leftEdge - (view.left + marginX)) < 0.5, 'finger-left stops with ~⅓ viewport empty on the left')
  assert.ok(leftEdge < view.right - 100, 'must not crush the AABB onto the opposite (right) side')
  const fingerDown = helpers.clampPanToContent(t, 0, -2000, wide, view)
  const bottomEdge = wide.maxY * t.k + t.y + fingerDown.dy
  assert.ok(Math.abs(bottomEdge - (view.bottom - marginY)) < 0.5, 'finger-below stops with ~⅓ viewport empty on the bottom')
  const fingerUp = helpers.clampPanToContent(t, 0, 2000, wide, view)
  const topEdge = wide.minY * t.k + t.y + fingerUp.dy
  assert.ok(Math.abs(topEdge - (view.top + marginY)) < 0.5, 'finger-above stops with ~⅓ viewport empty on the top')
  const se = helpers.clampPanToContent(t, -2000, -2000, wide, view)
  const seRight = wide.maxX * t.k + t.x + se.dx
  const seBottom = wide.maxY * t.k + t.y + se.dy
  assert.ok(Math.abs(seRight - (view.right - marginX)) < 0.5, 'SE diagonal opens the right third')
  assert.ok(Math.abs(seBottom - (view.bottom - marginY)) < 0.5, 'SE diagonal opens the bottom third')
  const nw = helpers.clampPanToContent(t, 2000, 2000, wide, view)
  const nwLeft = wide.minX * t.k + t.x + nw.dx
  const nwTop = wide.minY * t.k + t.y + nw.dy
  assert.ok(Math.abs(nwLeft - (view.left + marginX)) < 0.5, 'NW diagonal opens the left third')
  assert.ok(Math.abs(nwTop - (view.top + marginY)) < 0.5, 'NW diagonal opens the top third')
  const already = { x: 200, y: 200, k: 1 }
  already.x = view.right - marginX - wide.maxX
  const noYank = helpers.clampPanToContent(already, -50, 0, wide, view)
  assert.equal(noYank.dx, 0, 'already at the leading bound: do not shove further or yank to the far side')
  assert.deepEqual(helpers.clampPanToContent(t, -20, -20, null, view), { dx: 0, dy: 0 })
})

test('early card slide pans via applyFingerPan and keep the 160ms hold latch', () => {
  const source = readFileSync(new URL('../public/logyq/js/preview/05-v162-gestures.js', import.meta.url), 'utf8')
  assert.match(source, /HOLD_MS: 160/)
  assert.match(source, /HOLD_SLOP: 8/)
  assert.match(source, /FLICK_MAX_MS: 340/)
  const start = source.indexOf('function applyFingerPan(doc, win, pan, x, y) {')
  const end = source.indexOf('function dispatchPointerCancel(canvas, win, pointerId, x, y) {', start)
  assert.ok(start >= 0 && end > start)
  const helpers = new Function(`${source.slice(start, end)}; return { applyFingerPan };`)()
  const g = { tagName: 'g', transform: '', setAttribute(_name, value) { this.transform = value } }
  const svg = { children: [g], __zoom: null }
  const win = {
    d3: {
      zoomTransform: (node) => node.__zoom || { x: 10, y: 20, k: 1.5 },
      zoomIdentity: {
        translate(x, y) {
          return {
            scale(k) {
              return { x, y, k, toString() { return `translate(${x},${y}) scale(${k})` } }
            },
          }
        },
      },
    },
  }
  const doc = { getElementById: () => svg }
  const pan = { lastX: 100, lastY: 80 }
  helpers.applyFingerPan(doc, win, pan, 140, 50)
  assert.equal(pan.lastX, 140)
  assert.equal(pan.lastY, 50)
  assert.equal(svg.__zoom.x, 50)
  assert.equal(svg.__zoom.y, -10)
  assert.equal(svg.__zoom.k, 1.5)
  assert.match(g.transform, /translate\(50,-10\)/)

  const drag = readFileSync(new URL('../public/logyq/js/engine/13-drag.js', import.meta.url), 'utf8')
  assert.match(drag, /logyq-mobile-v162/)
  assert.match(drag, /__logyqHoldDragSession/)
  assert.match(drag, /!window\.__logyqHoldDragSession/)
  const zoom = readFileSync(new URL('../public/logyq/js/engine/16-tree-manager.js', import.meta.url), 'utf8')
  assert.match(zoom, /__logyqHoldDragSession/)
  assert.match(zoom, /logyq-mobile-v162/)
  assert.match(source, /function stopZoomGesture/)
  assert.match(source, /function classifyCardIntent/)
  assert.match(source, /svg\?\.\_\_zooming/)
  const zoomSrc = readFileSync(new URL('../public/logyq/js/engine/16-tree-manager.js', import.meta.url), 'utf8')
  assert.match(zoomSrc, /__logyqSuppressZoom/)
})

test('card contact race classifies hold vs slow pan vs flick-speed', () => {
  const source = readFileSync(new URL('../public/logyq/js/preview/05-v162-gestures.js', import.meta.url), 'utf8')
  const start = source.indexOf('function flickFastSpeed(C) {')
  const end = source.indexOf('function beginCardRace(doc, win, state, event) {', start)
  assert.ok(start >= 0 && end > start)
  const helpers = new Function(`${source.slice(start, end)}; function v162Constants() { return { FLICK_MIN: 52, FLICK_MAX_MS: 340, FLICK_RATIO: 1.45, FLICK_FAST_MS: 180, HOLD_MS: 160, HOLD_SLOP: 8, TAP_MOVE: 11 }; } return { classifyCardIntent, flickFastSpeed, recentSpeedPxPerMs };`)()
  const C = { FLICK_MIN: 52, FLICK_MAX_MS: 340, FLICK_RATIO: 1.45, FLICK_FAST_MS: 180, HOLD_MS: 160, HOLD_SLOP: 8 }
  assert.ok(Math.abs(helpers.flickFastSpeed(C) - (52 / 180)) < 1e-6)
  assert.equal(helpers.classifyCardIntent(4, 80, 0, false, C), 'excited', 'inside slop stays excited')
  assert.equal(helpers.classifyCardIntent(20, 30, 0.1, false, C), 'excited', 'too early to call a slow pan')
  assert.equal(helpers.classifyCardIntent(24, 80, 0.12, false, C), 'pan', 'undirected slow slide becomes pan')
  assert.equal(helpers.classifyCardIntent(24, 80, 0.12, false, C, 22, 18), 'pan', 'a diagonal slide still pans')
  assert.equal(helpers.classifyCardIntent(24, 80, 0.12, false, C, 0, 24), 'flickish', 'a straight stroke can still finish as a flick')
  assert.equal(helpers.classifyCardIntent(80, 200, 0.12, false, C, 0, 80), 'flickish', 'a slow axial flick must not pan the map')
  assert.equal(helpers.classifyCardIntent(80, 360, 0.12, false, C, 0, 80), 'pan', 'after the flick window a straight drag may pan')
  assert.equal(helpers.classifyCardIntent(70, 80, 0.5, false, C), 'flickish', 'high recent speed stays gated')
  assert.equal(helpers.classifyCardIntent(70, 100, 0.05, true, C), 'flickish', 'a prior whip stays flickish inside the window')
  assert.equal(helpers.classifyCardIntent(70, 360, 0.5, true, C), 'pan', 'after 340ms a held stroke may pan from now')
  assert.match(source, /if \(!race \|\| race\.mode === 'drag'\) return/)
  assert.doesNotMatch(source, /race\.mode === 'pan' \|\| race\.mode === 'drag'/)
  const samples = [
    { t: 0, x: 0, y: 0 },
    { t: 40, x: 0, y: 4 },
    { t: 80, x: 0, y: 10 },
  ]
  assert.ok(helpers.recentSpeedPxPerMs(samples, 80) < helpers.flickFastSpeed(C))
  const whip = [
    { t: 0, x: 0, y: 0 },
    { t: 80, x: 0, y: 0 },
    { t: 140, x: 0, y: 70 },
  ]
  assert.ok(helpers.recentSpeedPxPerMs(whip, 140) > helpers.flickFastSpeed(C))
})

test('uidFromEvent reads data-uid from the tapped hit-slot or node', () => {
  const source = readFileSync(new URL('../public/logyq/js/preview/05-v162-gestures.js', import.meta.url), 'utf8')
  const start = source.indexOf('function nodeUid(node) {')
  const end = source.indexOf('function canvasView(doc) {', start)
  assert.ok(start >= 0 && end > start)
  const uidFromEvent = new Function(`${source.slice(start, end)}; return uidFromEvent;`)()
  const slot = { getAttribute: (name) => (name === 'data-uid' ? 'n-blank-2' : null), closest() { return this }, classList: { contains: (name) => name === 'hit-slot' } }
  const parent = { getAttribute: () => 'n-parent', closest() { return this }, classList: { contains: (name) => name === 'node' } }
  assert.equal(uidFromEvent({ composedPath: () => [slot] }), 'n-blank-2')
  assert.equal(uidFromEvent({ composedPath: () => [parent] }), 'n-parent')
  assert.equal(uidFromEvent({ composedPath: () => [] }), null)
  assert.equal(uidFromEvent({ currentTarget: { __data__: { data: { _uid: 'n-from-current' } } } }), null)
  assert.equal(uidFromEvent({ target: slot }), 'n-blank-2')
})

test('card hit-test uses the painted face before a layout slot', () => {
  const source = readFileSync(new URL('../public/logyq/js/preview/05-v162-gestures.js', import.meta.url), 'utf8')
  const start = source.indexOf('function hitNode(doc, x, y, event) {')
  const end = source.indexOf('function cardText(node) {', start)
  assert.ok(start >= 0 && end > start)
  const body = source.slice(start, end)
  assert.ok(body.indexOf('hitVisualNode') < body.indexOf('hitEditUid'), 'a painted card beats a moved slot or grab zone')
})

test('card hit-test prefers the visual face and the deepest overlapping card', () => {
  const source = readFileSync(new URL('../public/logyq/js/preview/05-v162-gestures.js', import.meta.url), 'utf8')
  const start = source.indexOf('function rankCardHits(hits, x, y) {')
  const end = source.indexOf('function uidFromEvent(event) {', start)
  assert.ok(start >= 0 && end > start)
  const rankCardHits = new Function(`${source.slice(start, end)}; return rankCardHits;`)()
  const parent = { id: 'parent', onFace: false, onBox: true, depth: 1, cx: 100, cy: 80 }
  const child = { id: 'child', onFace: true, onBox: true, depth: 2, cx: 100, cy: 140 }
  const sibling = { id: 'sib', onFace: true, onBox: true, depth: 2, cx: 180, cy: 140 }
  assert.equal(rankCardHits([parent, child], 100, 140)[0].id, 'child')
  assert.equal(rankCardHits([parent], 100, 90)[0].id, 'parent', 'grabzone-only fallback still finds the parent')
  assert.equal(rankCardHits([child, sibling], 110, 140)[0].id, 'child')
})

function loadSmitePure() {
  const source = readFileSync(new URL('../public/logyq/js/preview/05-v162-gestures.js', import.meta.url), 'utf8')
  const start = source.indexOf('// SMITE_PURE_START')
  const end = source.indexOf('// SMITE_PURE_END')
  assert.ok(start >= 0 && end > start)
  return new Function(`${source.slice(start, end)}; return { smiteZone, smiteCastDirection, smiteAffected, smiteNextMark, smiteRingFraction, smiteRefillMs, planSmiteCommit, smiteClockPath, smiteClockLength, smiteLineDash, smiteLinePhase, smiteClockRoots, smiteMoodTargets, smiteMoodColor, smiteSubtreeIds, smiteFlickScope, smiteEdgePaint, smiteEdgeAnt, smiteMoodEdges, smiteCastShape, smiteCardChrome, smiteLinkLive, smiteCastOverlaps, smiteHeat, smitePastel, smiteNominatedTone, smiteCardNext, smiteCycleMember, smiteRootStep, smiteCastTap, smiteCastReply, smiteHasNominated, smiteScarOpacity, smiteScarBlocked };`)()
}

function smiteSampleTree() {
  return {
    name: 'Root',
    _uid: 'r',
    color: '#111',
    children: [
      {
        name: 'A',
        _uid: 'a',
        color: '#aaa',
        children: [
          { name: 'A1', _uid: 'a1', color: '#a1a' },
          { name: '  ', _uid: 'blank', color: '#bbb' },
        ],
      },
      { name: 'B', _uid: 'b', color: '#bbb' },
    ],
  }
}

test('smite deletes a blank card and does not turn it into a chip', () => {
  const smite = loadSmitePure()
  const tree = {
    name: 'Root',
    _uid: 'r',
    children: [
      { name: '', _uid: 'blank', color: '#fde68a' },
      { name: 'Kept', _uid: 'k' },
    ],
  }
  const red = smite.planSmiteCommit(tree, new Map([['blank', 'red']]))
  assert.deepEqual(red.bank, [])
  assert.equal(red.tree.name, 'Root')
  assert.deepEqual(red.tree.children.map((child) => child.name), ['Kept'])
  const amber = smite.planSmiteCommit(tree, new Map([['blank', 'amber']]))
  assert.deepEqual(amber.bank, [], 'an empty label is not a Word Bank chip')
  assert.deepEqual(amber.tree.children.map((child) => child.name), ['Kept'])
})

test('smite cake zones, directions, marks, and the mercy ring', () => {
  const smite = loadSmitePure()
  assert.equal(smite.smiteZone(0, 300), 'top')
  assert.equal(smite.smiteZone(99, 300), 'top')
  assert.equal(smite.smiteZone(100, 300), 'middle')
  assert.equal(smite.smiteZone(199, 300), 'middle')
  assert.equal(smite.smiteZone(200, 300), 'bottom')

  assert.equal(smite.smiteCastDirection(0, 60), 'down')
  assert.equal(smite.smiteCastDirection(-60, 10), 'left')
  assert.equal(smite.smiteCastDirection(60, 0), null)
  assert.equal(smite.smiteCastDirection(0, -60), null)
  assert.equal(smite.smiteCastDirection(-20, 20), null)
  assert.equal(smite.smiteCastDirection(-40, 50), 'down')

  const node = smiteSampleTree()
  assert.deepEqual(smite.smiteAffected(node, 'top'), ['r'])
  assert.deepEqual(smite.smiteAffected(node, 'bottom'), ['a', 'b'])
  assert.deepEqual(smite.smiteAffected(node, 'middle'), ['r', 'a', 'a1', 'blank', 'b'])
  assert.deepEqual(smite.smiteAffected({ data: { _uid: 'h' }, children: [{ data: { _uid: 'c' } }] }, 'bottom'), ['c'])

  assert.equal(smite.smiteNextMark('red', false), 'amber')
  assert.equal(smite.smiteNextMark('amber', false), 'normal')
  assert.equal(smite.smiteNextMark('normal', false), 'red')
  assert.equal(smite.smiteNextMark('red', true), 'amber')
  assert.equal(smite.smiteNextMark('amber', true), 'normal')
  assert.equal(smite.smiteNextMark('normal', true), 'normal')

  assert.equal(smite.smiteRingFraction(15000), 1)
  assert.equal(smite.smiteRingFraction(12000), 1)
  assert.equal(smite.smiteRingFraction(6000), 0.5)
  assert.equal(smite.smiteRingFraction(0), 0)
  // 3s full, then the line is drain-left / 12s, empty at 15s.
  for (let elapsed = 0; elapsed <= 3000; elapsed += 100) {
    assert.equal(smite.smiteRingFraction(15000 - elapsed), 1)
  }
  assert.equal(smite.smiteRingFraction(15000 - 9000), 0.5)
  assert.equal(smite.smiteRingFraction(15000 - 15000), 0)
  assert.equal(smite.smiteRefillMs(15000), 15000)
  assert.equal(smite.smiteRefillMs(14500), 15000)
  assert.equal(smite.smiteRefillMs(1000), 2000)

  const ring = smite.smiteClockPath(0, 0, 140, 63, 10, 10)
  assert.ok(ring.startsWith('M 70 0 H 10'), 'the line starts at 12 and travels toward the left')
  assert.ok(ring.includes('A 10 10 0 0 0 0 10'), 'from 12 it rounds counter-clockwise onto the left side')
  assert.equal(/A [\d.]+ [\d.]+ 0 0 1 /.test(ring), false)
  assert.equal(smite.smiteClockPath(0, 0, 0, 40), '')
  assert.ok(smite.smiteClockPath(0, 0, 140, 63, 0, 0).includes('A 10 10'), 'a missing radius still rounds the card')
  const length = smite.smiteClockLength(140, 63, 10, 10)
  assert.ok(length > 300 && length < 450, 'the dash uses the real outline length')
  assert.equal(smite.smiteLineDash(1, length).array, 'none')
  assert.equal(smite.smiteLineDash(1, length).offset, 0)
  const halfDash = smite.smiteLineDash(0.5, length)
  assert.equal(Number(halfDash.array.split(' ')[0]) + Number(halfDash.array.split(' ')[1]), length)
  assert.equal(halfDash.offset, length / 2)
  assert.equal(smite.smiteLineDash(0, length).array, '0 1')
  assert.ok(Math.abs(halfDash.offset - length / 2) < 1e-6)

  const box = [140, 63, 10, 10]
  assert.equal(smite.smiteLinePhase(1, ...box), 'l1')
  assert.equal(smite.smiteLinePhase(smite.smiteRingFraction(15000), ...box), 'l1')
  assert.equal(smite.smiteLinePhase(0.9, ...box), 'l1')
  assert.equal(smite.smiteLinePhase(0.75, ...box), 'l2')
  assert.equal(smite.smiteLinePhase(0.5, ...box), 'l3')
  assert.equal(smite.smiteLinePhase(0.22, ...box), 'l4')
  assert.equal(smite.smiteLinePhase(0.08, ...box), 'l5')
  assert.equal(smite.smiteLinePhase(0, ...box), 'l5')

  const red = ['l1', 'l2', 'l3', 'l4', 'l5'].map((phase) => smite.smiteHeat(phase, 'red'))
  const amber = ['l1', 'l2', 'l3', 'l4', 'l5'].map((phase) => smite.smiteHeat(phase, 'amber'))
  assert.deepEqual(red.map((heat) => heat.stroke), ['#f6b6b6', '#f57a7a', '#f74545', '#fa1e1e', '#ff0000'])
  assert.deepEqual(amber.map((heat) => heat.stroke), ['#f6dfb6', '#f5c87a', '#f7b645', '#faaa1e', '#ffa100'])
  assert.deepEqual(red.map((heat) => heat.wash), red.map((heat) => heat.stroke))
  assert.deepEqual(amber.map((heat) => heat.wash), amber.map((heat) => heat.stroke))
  assert.deepEqual(red.map((heat) => heat.washOpacity), amber.map((heat) => heat.washOpacity))
  assert.deepEqual(red.map((heat) => heat.glow), [0, 0, 0, 0, 0])
  for (let i = 1; i < red.length; i += 1) assert.ok(red[i].washOpacity > red[i - 1].washOpacity)
  assert.equal(red[4].stroke, '#ff0000')
  assert.equal(amber[4].stroke, '#ffa100')
  assert.deepEqual(smite.smitePastel('red'), { fill: '#ffb8b8', opacity: 0.88 })
  assert.deepEqual(smite.smitePastel('amber'), { fill: '#ffcc80', opacity: 0.88 })
  assert.equal(smite.smiteNominatedTone(new Map([['a1', 'red'], ['blank', 'red']]), 'a', 'red'), 'red')
  assert.equal(smite.smiteNominatedTone(new Map([['a', 'amber'], ['a1', 'amber']]), 'a', 'red'), 'amber')
  assert.equal(smite.smiteNominatedTone(new Map([['a', 'normal'], ['a1', 'amber']]), 'a', 'red'), 'amber')
  assert.equal(smite.smiteNominatedTone(new Map([['a', 'normal']]), 'a', 'red'), null)
  assert.equal(smite.smiteCardNext('red'), 'amber')
  assert.equal(smite.smiteCardNext('amber'), 'normal')
  assert.equal(smite.smiteCardNext('normal'), 'red')
  const toAmber = smite.smiteCycleMember(new Map([['a', 'red'], ['a1', 'red'], ['blank', 'red']]), 'a1')
  assert.equal(toAmber.action, 'cycle')
  assert.equal(toAmber.next, 'amber')
  assert.deepEqual(toAmber.entries, [['a', 'red'], ['a1', 'amber'], ['blank', 'red']])
  const toOut = smite.smiteCycleMember(new Map(toAmber.entries), 'a1')
  assert.equal(toOut.next, 'normal')
  assert.deepEqual(toOut.entries, [['a', 'red'], ['a1', 'normal'], ['blank', 'red']])
  const toDelete = smite.smiteCycleMember(new Map(toOut.entries), 'a1')
  assert.equal(toDelete.next, 'red')
  assert.deepEqual(toDelete.entries, [['a', 'red'], ['a1', 'red'], ['blank', 'red']])
  assert.equal(smite.smiteCycleMember(new Map([['blank', 'red']]), 'a1').action, 'noop')
  const mixed = new Map([['a', 'red'], ['a1', 'red'], ['blank', 'amber'], ['b', 'normal'], ['side', 'red']])
  const degraded = smite.smiteRootStep(mixed, 'a', ['a1', 'blank', 'b'])
  assert.equal(degraded.action, 'degrade')
  assert.deepEqual(degraded.entries, [['a', 'amber'], ['a1', 'amber'], ['blank', 'amber'], ['b', 'normal'], ['side', 'red']])
  const cleared = smite.smiteRootStep(new Map(degraded.entries), 'a', ['a1', 'blank', 'b'])
  assert.equal(cleared.action, 'clear')
  assert.deepEqual(cleared.entries, [])
  const remote = smite.smiteRootStep(new Map([['a', 'normal'], ['a1', 'red']]), 'a', ['a1'])
  assert.equal(remote.action, 'degrade')
  assert.deepEqual(remote.entries, [['a', 'normal'], ['a1', 'amber']])
  const kidsOnly = new Map([['a1', 'red'], ['blank', 'red'], ['b', 'normal']])
  const kidsBank = smite.smiteRootStep(kidsOnly, 'a', ['a1', 'blank', 'b'])
  assert.equal(kidsBank.action, 'degrade')
  assert.deepEqual(kidsBank.entries, [['a1', 'amber'], ['blank', 'amber'], ['b', 'normal']])
  assert.equal(smite.smiteRootStep(new Map(kidsBank.entries), 'a', ['a1', 'blank', 'b']).action, 'clear')
  assert.equal(smite.smiteCastTap(kidsOnly, 'a', 'a', ['a1', 'blank', 'b']).action, 'degrade')
  assert.equal(smite.smiteRootStep(new Map([['a1', 'amber'], ['blank', 'amber']]), 'a', ['a1', 'blank']).action, 'clear')
  const sideStays = smite.smiteRootStep(new Map([['a', 'normal'], ['a1', 'red'], ['side', 'red']]), 'a', ['a1'])
  assert.deepEqual(sideStays.entries, [['a', 'normal'], ['a1', 'amber'], ['side', 'red']])
  assert.equal(smite.smiteCastTap(mixed, 'a', 'a1', ['a1', 'blank', 'b']).next, 'amber')
  assert.equal(smite.smiteCastTap(mixed, 'a', 'a', ['a1', 'blank', 'b']).action, 'degrade')
  assert.equal(smite.smiteCastReply(new Map([['a', 'red'], ['a1', 'normal']]), 'a', 'a1', 0, 40), 'execute')
  assert.equal(smite.smiteCastReply(new Map([['a', 'red'], ['a1', 'normal']]), 'a', 'a', 0, 40), 'execute')
  assert.equal(smite.smiteCastReply(new Map([['a1', 'red']]), 'a', 'a', 0, 40), 'execute')
  assert.equal(smite.smiteCastReply(new Map([['a', 'red'], ['a1', 'normal']]), 'a', 'a1', 2, 3), 'tap')
  assert.equal(smite.smiteCastReply(new Map([['a', 'red']]), 'a', 'a', 4, 2), 'tap')
  assert.equal(smite.smiteCastReply(new Map([['a1', 'red']]), 'a', 'a', 2, 3), 'tap')
  assert.equal(smite.smiteCastReply(new Map([['a', 'red'], ['a1', 'normal']]), 'a', 'a1', 30, 20), 'ignore')
  assert.equal(smite.smiteCastReply(new Map([['a', 'red']]), 'a', 'b', 0, 80), 'ignore')
  assert.equal(smite.smiteHasNominated(new Map([['a1', 'normal']])), false)
  assert.equal(smite.smiteHasNominated(new Map([['a1', 'normal'], ['blank', 'amber']])), true)
  const whites = new Map([['a', 'normal'], ['a1', 'normal'], ['blank', 'normal']])
  assert.equal(smite.smiteRootStep(whites, 'a', ['a1', 'blank']).action, 'clear')
  assert.equal(smite.smiteCastTap(whites, 'a', 'a', ['a1', 'blank']).action, 'clear')
  assert.equal(smite.smiteRootStep(new Map([['a1', 'normal'], ['blank', 'normal']]), 'a', ['a1', 'blank']).action, 'clear')
  const pocket = new Map([['a', 'normal'], ['a1', 'red'], ['blank', 'normal']])
  const scoped = smite.smiteFlickScope(smiteSampleTree(), pocket, 'a1')
  assert.equal(smite.smiteHasNominated(scoped), true)
  for (const [uid, mark] of scoped) {
    if (mark === 'red' || mark === 'amber') pocket.delete(uid)
  }
  assert.equal(smite.smiteHasNominated(pocket), false)

  const tree = smiteSampleTree()
  assert.deepEqual(smite.smiteClockRoots(tree, { r: 'red', a: 'red', a1: 'red' }), ['r'])
  assert.deepEqual(smite.smiteClockRoots(tree, { a: 'red', b: 'amber' }), ['a', 'b'])
  assert.deepEqual(smite.smiteClockRoots(tree, { a: 'red' }), ['a'])
  assert.deepEqual(smite.smiteClockRoots(tree, { r: 'normal', a: 'red' }), ['a'])
  assert.deepEqual(smite.smiteClockRoots(tree, { a: 'amber', a1: 'amber', blank: 'normal' }), ['a'])
  assert.deepEqual(smite.smiteMoodTargets(tree, 'a').slice().sort(), ['a1', 'blank'])
  assert.deepEqual(smite.smiteMoodTargets(tree, 'r').slice().sort(), ['a', 'a1', 'b', 'blank'])
  assert.deepEqual(smite.smiteMoodTargets(tree, 'b'), [])
  assert.equal(smite.smiteMoodTargets(tree, 'a').includes('a'), false)
  assert.equal(smite.smiteMoodColor('red'), '#ff0000')
  assert.equal(smite.smiteMoodColor('amber'), '#ffa100')
  assert.equal(smite.smiteCastOverlaps([], ['a']), false)
  assert.equal(smite.smiteCastOverlaps([{ marks: new Map([['a', 'red'], ['a1', 'red']]) }], ['b']), false)
  assert.equal(smite.smiteCastOverlaps([{ marks: { a: 'red', a1: 'amber' } }], ['a1']), true)
  assert.equal(smite.smiteCastOverlaps([{ marks: new Map([['a', 'normal']]) }], ['a']), true)

  assert.equal(smite.smiteScarOpacity(0), 1)
  assert.equal(smite.smiteScarOpacity(2800), 1)
  assert.ok(smite.smiteScarOpacity(2800 + 3600) < 1 && smite.smiteScarOpacity(2800 + 3600) > 0)
  assert.equal(smite.smiteScarOpacity(2800 + 7200), 0)
  const card = { left: 40, top: 80, right: 180, bottom: 143 }
  assert.equal(smite.smiteScarBlocked(100, 110, [card]), true)
  assert.equal(smite.smiteScarBlocked(10, 110, [card]), false)
  assert.equal(smite.smiteScarBlocked(100, 110, []), false)
})

test('smite commit kills red, banks amber, and climbs the cards that stay', () => {
  const smite = loadSmitePure()
  const original = smiteSampleTree()
  const snapshot = JSON.stringify(original)

  const top = smite.planSmiteCommit(original, { a: 'red' })
  assert.equal(JSON.stringify(original), snapshot)
  assert.deepEqual(top.bank, [])
  assert.deepEqual(top.scars.map((scar) => scar.uid), ['a'])
  assert.equal(top.scars[0].parentUid, 'r')
  assert.equal(top.scars[0].color, '#aaa')
  assert.deepEqual(top.tree.children.map((child) => child._uid), ['a1', 'blank', 'b'])
  assert.equal(top.tree.children[0].color, '#a1a')

  const middle = smite.planSmiteCommit(original, { a: 'red', a1: 'red', blank: 'red' })
  assert.deepEqual(middle.tree.children.map((child) => child._uid), ['b'])
  assert.deepEqual(middle.scars.map((scar) => scar.uid), ['a1', 'blank', 'a'])

  const bottom = smite.planSmiteCommit(original, new Map([['a', 'red'], ['b', 'red']]))
  assert.equal(bottom.tree._uid, 'r')
  assert.deepEqual(bottom.tree.children.map((child) => child._uid), ['a1', 'blank'])
  assert.deepEqual(bottom.scars.map((scar) => scar.parentUid), ['r', 'r'])

  const banked = smite.planSmiteCommit(original, { a: 'amber', blank: 'amber', a1: 'normal' })
  assert.deepEqual(banked.bank, ['A'])
  assert.deepEqual(banked.scars, [])
  assert.deepEqual(banked.tree.children.map((child) => child._uid), ['a1', 'b'])

  const optedOut = smite.planSmiteCommit(original, new Map([['a', 'red'], ['a1', 'normal'], ['blank', 'red'], ['b', 'red']]))
  assert.deepEqual(optedOut.bank, [])
  assert.deepEqual(optedOut.scars.map((scar) => scar.uid), ['blank', 'a', 'b'])
  assert.deepEqual(optedOut.tree.children.map((child) => child._uid), ['a1'])

  const promoted = smite.planSmiteCommit(original, { r: 'red' })
  assert.equal(promoted.tree._uid, 'a')
  assert.deepEqual(promoted.tree.children.map((child) => child._uid), ['a1', 'blank', 'b'])
  assert.equal(promoted.scars[0].uid, 'r')
  assert.equal(promoted.scars[0].parentUid, null)

  const emptied = smite.planSmiteCommit({ name: 'Only', _uid: 'r' }, { r: 'amber' })
  assert.equal(emptied.tree, null)
  assert.deepEqual(emptied.bank, ['Only'])

  const blankAmber = smite.planSmiteCommit({ name: ' ', _uid: 'r', children: [{ name: 'Keep', _uid: 'k' }] }, { r: 'amber' })
  assert.deepEqual(blankAmber.bank, [])
  assert.equal(blankAmber.tree._uid, 'k')
})

test('a down-flick commits only the still-in pocket under that card', () => {
  const smite = loadSmitePure()
  const tree = smiteSampleTree()
  const marks = new Map([
    ['r', 'red'],
    ['a', 'red'],
    ['a1', 'normal'],
    ['blank', 'red'],
    ['b', 'amber'],
  ])
  assert.deepEqual(smite.smiteSubtreeIds(tree, 'a').slice().sort(), ['a', 'a1', 'blank'])
  assert.deepEqual(smite.smiteSubtreeIds(tree, 'b'), ['b'])
  assert.deepEqual(smite.smiteSubtreeIds(tree, 'r').slice().sort(), ['a', 'a1', 'b', 'blank', 'r'])

  const pocket = smite.smiteFlickScope(tree, marks, 'a')
  assert.deepEqual([...pocket.entries()].sort(), [['a', 'red'], ['blank', 'red']])
  const plan = smite.planSmiteCommit(tree, pocket)
  assert.equal(plan.tree._uid, 'r')
  assert.deepEqual(plan.tree.children.map((child) => child._uid), ['a1', 'b'])
  assert.equal(plan.tree.children[0].name, 'A1')
  assert.deepEqual(plan.scars.map((scar) => scar.uid).sort(), ['a', 'blank'])
  assert.deepEqual(plan.bank, [])
  assert.equal(JSON.stringify(tree), JSON.stringify(smiteSampleTree()))

  const sibling = smite.smiteFlickScope(tree, marks, 'b')
  assert.deepEqual([...sibling.entries()], [['b', 'amber']])
  const banked = smite.planSmiteCommit(tree, sibling)
  assert.deepEqual(banked.bank, ['B'])
  assert.deepEqual(banked.tree.children.map((child) => child._uid), ['a'])
  assert.equal(banked.tree.children[0]._uid, 'a')
  assert.deepEqual(banked.tree.children[0].children.map((child) => child._uid), ['a1', 'blank'])

  assert.equal(smite.smiteFlickScope(tree, marks, 'a1').size, 0)
  const above = smite.smiteFlickScope(tree, marks, 'missing')
  assert.equal(above.size, 0)
})

test('cast edges gradient from parent fate to child fate, and ants follow the child', () => {
  const smite = loadSmitePure()
  const clear = '#ffffff'
  const red = '#ff0000'
  const amber = '#ffa100'
  const pairs = [
    ['red', 'red', red, red, red],
    ['amber', 'amber', amber, amber, amber],
    ['red', 'amber', red, amber, amber],
    ['amber', 'red', amber, red, red],
    ['normal', 'red', clear, red, red],
    ['normal', 'amber', clear, amber, amber],
    ['red', 'normal', red, clear, null],
    ['amber', 'normal', amber, clear, null],
    ['normal', 'normal', clear, clear, null],
    [null, 'red', clear, red, red],
    ['red', null, red, clear, null],
    ['amber', undefined, amber, clear, null],
  ]
  for (const [parent, child, from, to, ants] of pairs) {
    const paint = smite.smiteEdgePaint(parent, child)
    assert.equal(paint.from, from, `${parent} → ${child} from`)
    assert.equal(paint.to, to, `${parent} → ${child} to`)
    assert.equal(paint.ants, ants, `${parent} → ${child} ants`)
    assert.equal(smite.smiteEdgeAnt(parent, child), ants)
  }
  const tree = smiteSampleTree()
  assert.equal(smite.smiteMoodTargets(tree, 'a').includes('a'), false)
  assert.deepEqual(
    smite.smiteMoodEdges(tree, 'a').map((edge) => `${edge.parentUid}>${edge.childUid}`).sort(),
    ['a>a1', 'a>blank'],
  )
  assert.deepEqual(smite.smiteMoodEdges(tree, 'b'), [])
  assert.equal(smite.smiteMoodEdges(tree, 'r').some((edge) => edge.childUid === 'r'), false)
})

test('cast chrome is an outline with no fill, and connectors move only for a whole pocket', () => {
  const smite = loadSmitePure()
  const red = '#ff0000'
  const amber = '#ffa100'
  const white = '#ffffff'
  assert.equal(smite.smiteCastShape(new Map([['r', 'red'], ['a', 'normal'], ['b', 'normal']]), 'r', ['a', 'b']), 'parent')
  assert.equal(smite.smiteCastShape(new Map([['r', 'normal'], ['a', 'red'], ['b', 'amber']]), 'r', ['a', 'b']), 'kids')
  assert.equal(smite.smiteCastShape(new Map([['a', 'red']]), 'r', ['a', 'b']), 'kids')
  assert.equal(smite.smiteCastShape(new Map([['r', 'red'], ['a', 'red'], ['b', 'normal']]), 'r', ['a', 'b']), 'pocket')
  assert.equal(smite.smiteCastShape(new Map([['r', 'amber'], ['a', 'amber'], ['b', 'normal']]), 'r', ['a', 'b']), 'pocket')
  assert.equal(smite.smiteCastShape(new Map([['r', 'normal'], ['a', 'normal']]), 'r', ['a']), 'idle')
  assert.equal(smite.smiteCardChrome('red', true), null)
  assert.deepEqual(smite.smiteCardChrome('red', false), { stroke: red, ants: true, fill: 'none' })
  assert.deepEqual(smite.smiteCardChrome('amber', false), { stroke: amber, ants: true, fill: 'none' })
  assert.deepEqual(smite.smiteCardChrome('normal', false), { stroke: white, ants: true, fill: 'none' })
  assert.equal(smite.smiteCardChrome('normal', true), null)
  assert.equal(smite.smiteCardChrome(null, false), null)
  assert.equal(smite.smiteLinkLive('parent', 'red', 'normal'), null)
  assert.equal(smite.smiteLinkLive('parent', 'red', 'red'), null)
  assert.equal(smite.smiteLinkLive('kids', 'normal', 'red'), null)
  assert.equal(smite.smiteLinkLive('kids', 'red', 'amber'), null)
  assert.equal(smite.smiteLinkLive('idle', 'red', 'red'), null)
  assert.equal(smite.smiteLinkLive('pocket', 'normal', 'normal'), null)
  assert.equal(smite.smiteLinkLive('pocket', null, 'red'), null)
  const same = smite.smiteLinkLive('pocket', 'red', 'red')
  assert.equal(same.from, red)
  assert.equal(same.to, red)
  assert.equal(same.ants, red)
  const mixed = smite.smiteLinkLive('pocket', 'red', 'amber')
  assert.equal(mixed.from, red)
  assert.equal(mixed.to, amber)
  assert.equal(mixed.ants, amber)
  const fade = smite.smiteLinkLive('pocket', 'red', 'normal')
  assert.equal(fade.from, red)
  assert.equal(fade.to, white)
  assert.equal(fade.ants, null)
  const rising = smite.smiteLinkLive('pocket', 'normal', 'red')
  assert.equal(rising.from, white)
  assert.equal(rising.to, red)
  assert.equal(rising.ants, red)
  const v162 = readFileSync(new URL('../public/logyq/js/preview/05-v162-gestures.js', import.meta.url), 'utf8')
  const styles = readFileSync(new URL('../public/logyq/js/preview/02-styles.js', import.meta.url), 'utf8')
  const paint = v162.slice(v162.indexOf('function paintSmiteLayers'), v162.indexOf('function smiteScarPoint'))
  assert.match(paint, /smiteCardChrome\(/)
  assert.match(paint, /smiteLinkLive\(/)
  assert.doesNotMatch(paint, /smitePastel\(/)
  assert.match(v162, /setAttribute\('fill', 'none'\)/)
  const wash = styles.slice(styles.indexOf('rect.logyq-smite-wash{'), styles.indexOf('path.logyq-smite-clock'))
  assert.match(wash, /fill:\s*none/)
  assert.match(wash, /data-smite-outline="ants"/)
  assert.doesNotMatch(wash, /stroke:\s*none/)
})

test('smite cake is a solid clock and does not reopen a long-press Word Bank dump', () => {
  const v162 = readFileSync(new URL('../public/logyq/js/preview/05-v162-gestures.js', import.meta.url), 'utf8')
  const styles = readFileSync(new URL('../public/logyq/js/preview/02-styles.js', import.meta.url), 'utf8')
  const mix = readFileSync(new URL('../public/logyq/js/engine/15-mix-and-context.js', import.meta.url), 'utf8')
  assert.match(v162, /function bindSmiteGestures/)
  assert.match(v162, /function commitSmite/)
  assert.match(v162, /function smiteCycleMember/)
  assert.match(v162, /function smiteRootStep/)
  assert.match(v162, /function smiteCastTap/)
  assert.match(v162, /function smiteCastReply/)
  const mercyUp = v162.slice(v162.indexOf('function smiteMercyUp'), v162.indexOf('function smiteApplyEntries'))
  assert.match(mercyUp, /mercy\.remaining = SMITE_START_MS/)
  assert.match(mercyUp, /smiteCastReply\(/)
  assert.match(mercyUp, /smiteCastTap\(/)
  assert.match(mercyUp, /command\.action === 'clear'/)
  assert.match(mercyUp, /!smiteHasNominated\(mercy\.marks\)/)
  assert.match(mercyUp, /commitSmite\(doc, win, smite, mercy, pointer\.uid\)/)
  assert.doesNotMatch(mercyUp, /smiteParentCommand|smiteChildCommand|smiteToggleParticipation/)
  const tick = v162.slice(v162.indexOf('function smiteTick('), v162.indexOf('function smiteMercyUp'))
  assert.match(tick, /for \(const mercy of due\) commitSmite\(doc, win, smite, mercy\)/)
  assert.match(tick, /if \(!smiteHasNominated\(mercy\.marks\)\)/)
  assert.match(tick, /for \(const mercy of idle\) smiteDropMercy\(smite, mercy\)/)
  assert.doesNotMatch(tick, /pointer\.uid/)
  const commit = v162.slice(v162.indexOf('function commitSmite'), v162.indexOf('function smiteFace'))
  assert.match(commit, /smiteFlickScope\(/)
  assert.match(commit, /scopeUid/)
  assert.match(commit, /mercy\.committing = false/)
  assert.match(commit, /!smiteHasNominated\(mercy\.marks\)/)
  assert.match(v162, /function smiteEdgePaint/)
  assert.match(v162, /function smiteEdgeAnt/)
  assert.match(v162, /function smiteMoodEdges/)
  assert.match(v162, /strokeDasharray = '8 6'/)
  assert.match(v162, /strokeDasharray = 'none'/)
  assert.match(v162, /linearGradient/)
  assert.match(v162, /logyq-smite-ants/)
  const edge = styles.slice(styles.indexOf('data-smite-edge'), styles.indexOf('path.logyq-smite-clock'))
  assert.match(edge, /stroke-dasharray:\s*none/)
  assert.match(edge, /logyq-smite-ant/)
  assert.match(edge, /logyq-smite-ants/)
  assert.match(edge, /stroke-width:\s*3\.5px/)
  assert.match(v162, /__logyqV2ConsumedPointers\.add\(event\.pointerId\)/)
  assert.match(v162, /smite\.pinched/)
  assert.match(v162, /smite\.mercies/)
  assert.match(v162, /function smiteApplyPinch/)
  assert.match(v162, /clearSmiteScars\(doc, smite\)/)
  assert.doesNotMatch(v162.slice(v162.indexOf('function commitSmite'), v162.indexOf('function smiteFace')), /mountSmiteScars/)
  assert.match(v162, /addWords\(name, 'bank'\)/)
  assert.match(v162, /Contextmenu is never a Word Bank write|swallowBankContextMenu/)
  assert.match(mix, /Contextmenu is never a Word Bank write/)
  assert.match(styles, /logyq-smite-red/)
  assert.match(styles, /logyq-smite-amber/)
  assert.match(styles, /logyq-smite-scar/)
  const clock = styles.slice(styles.indexOf('path.logyq-smite-clock'), styles.indexOf('.logyq-smite-scar'))
  assert.doesNotMatch(clock, /#22c55e/)
  assert.doesNotMatch(clock, /stroke-dasharray:\s*5\s+4/)
  assert.match(clock, /vector-effect:\s*none/)
  assert.match(clock, /animation:\s*none/)
  assert.match(clock, /transition:\s*none/)
  assert.match(styles, /@keyframes logyq-smite-ants/)
  assert.doesNotMatch(v162, /Sent subtree to Word Dock/)
  assert.match(v162, /setAttribute\('pathLength'/)
  assert.match(v162, /SMITE_BUFFER_MS = 3000/)
  assert.match(v162, /SMITE_DRAIN_MS = 12000/)
  assert.match(v162, /clock\.style\.removeProperty\('stroke-dasharray'\)/)
  assert.match(v162, /clock\.style\.removeProperty\('stroke-dashoffset'\)/)
  assert.doesNotMatch(v162, /clock\.style\.strokeDasharray\s*=/)
  assert.doesNotMatch(v162, /clock\.style\.strokeDashoffset\s*=/)
})
