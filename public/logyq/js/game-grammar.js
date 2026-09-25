/* LOGYQ fixed-orientation physical card grammar.
 * Paint syntax:
 *   W:A       whole card
 *   L:A:B     horizontal layer cake: A top, B bottom
 *   DL:A:B    diagonal \\: A touches top/right, B touches bottom/left
 *   DR:A:B    diagonal /: A touches top/left, B touches bottom/right
 * No semantic target tree is consulted: only visible contacts and inventory. */
(() => {
  'use strict'

  const GAME_COLORS = { A: '#60a5fa', B: '#fb923c', C: '#86efac', D: '#f0abfc' }
  const SHAPE_NAMES = { W: 'Whole', L: 'Layer Cake', DL: 'Diagonal Left', DR: 'Diagonal Right' }
  const SPLIT = {
    L: { x1: '0%', y1: '0%', x2: '0%', y2: '100%' },
    DL: { x1: '100%', y1: '0%', x2: '0%', y2: '100%' },
    DR: { x1: '0%', y1: '0%', x2: '100%', y2: '100%' },
  }

  function parsePaint(paint) {
    const [shape, a, b] = String(paint || '').split(':')
    if (shape === 'W' && a) return { shape, a, b: a }
    if ((shape === 'L' || shape === 'DL' || shape === 'DR') && a && b) return { shape, a, b }
    return null
  }

  // One description of the card face. The canvas gradient and the Word Bank
  // thumbnail both read this, so the split is not redrawn in two places.
  function paintSpec(paint) {
    const parsed = parsePaint(paint)
    if (!parsed) return null
    const a = GAME_COLORS[parsed.a] || '#cbd5e1'
    const b = GAME_COLORS[parsed.b] || '#cbd5e1'
    const name = SHAPE_NAMES[parsed.shape] || parsed.shape
    if (parsed.shape === 'W') return { name, solid: a }
    const split = SPLIT[parsed.shape]
    if (!split) return null
    return {
      name,
      split: { x1: split.x1, y1: split.y1, x2: split.x2, y2: split.y2 },
      stops: [['0%', a], ['49.9%', a], ['50%', b], ['100%', b]],
    }
  }

  function edge(paint, side) {
    const p = parsePaint(paint)
    if (!p) return null
    if (p.shape === 'W') return p.a
    if (side === 'top') return p.a
    if (side === 'bottom') return p.b
    if (p.shape === 'L') return p.a + '|' + p.b
    if (p.shape === 'DL') return side === 'left' ? p.b : p.a
    if (p.shape === 'DR') return side === 'left' ? p.a : p.b
    return null
  }

  function touchesMatch(a, sideA, b, sideB) {
    const first = edge(a?.paint, sideA)
    return !!first && first === edge(b?.paint, sideB)
  }

  function contacts(tree) {
    if (!tree || !edge(tree.paint, 'top')) return false
    const children = Array.isArray(tree.children) ? tree.children : []
    return children.every((child, i) =>
      touchesMatch(tree, 'bottom', child, 'top') &&
      (i === 0 || touchesMatch(children[i - 1], 'right', child, 'left')) &&
      contacts(child))
  }

  function complete(tree, ids) {
    if (!tree || !Array.isArray(ids) || !contacts(tree)) return false
    const found = []
    const visit = (node) => {
      found.push(node.gameId)
      for (const child of node.children || []) visit(child)
    }
    visit(tree)
    return found.length === ids.length && new Set(found).size === ids.length &&
      ids.every((id) => found.includes(id))
  }

  function clone(node) {
    return { ...node, children: (node.children || []).map(clone) }
  }
  function isUid(node, uid) {
    return uid != null && (node?._uid === uid || node?.gameId === uid)
  }
  function find(node, uid) {
    if (isUid(node, uid)) return node
    for (const child of node?.children || []) {
      const match = find(child, uid)
      if (match) return match
    }
    return null
  }
  function detach(node, uid) {
    const children = node?.children || []
    const index = children.findIndex((child) => isUid(child, uid))
    if (index >= 0) return children.splice(index, 1)[0]
    for (const child of children) {
      const found = detach(child, uid)
      if (found) return found
    }
    return null
  }

  // Simulate the actual editor drop and accept it only when the moved card's
  // visible contacts fit. rootAbove is important: it lets a player discover
  // which of the two cards is the root rather than encoding the root as a clue.
  function canDrop(tree, movingUid, drop) {
    if (!tree || !drop) return false
    if (!['gap', 'node', 'rootAbove'].includes(drop.type)) return false
    const copy = clone(tree)
    const moving = find(copy, movingUid)
    if (!moving) return false

    if (drop.type === 'rootAbove') {
      if (isUid(copy, movingUid)) return false
      const detached = detach(copy, movingUid)
      if (!detached) return false
      detached.children ||= []
      detached.children.push(copy)
      return contacts(detached)
    }

    if (isUid(copy, movingUid)) return false
    const targetUid = drop.type === 'node' ? drop.targetUid : drop.parentUid
    const target = find(copy, targetUid)
    if (!target || isUid(moving, targetUid) || find(moving, targetUid)) return false
    const detached = detach(copy, movingUid)
    if (!detached) return false
    target.children ||= []
    let index = target.children.length
    if (drop.type === 'gap') {
      const next = target.children.findIndex((child) => isUid(child, drop.nextUid))
      const prev = target.children.findIndex((child) => isUid(child, drop.prevUid))
      if (next >= 0) index = next
      if (prev >= 0) index = prev + 1
    }
    target.children.splice(index, 0, detached)
    return contacts(copy)
  }

  function canAdd(tree, card, drop) {
    if (!tree || !card || !drop || !edge(card.paint, 'top')) return false
    const copy = clone(tree)
    const fresh = clone(card)
    if (drop.type === 'rootAbove') {
      fresh.children ||= []
      fresh.children.push(copy)
      return contacts(fresh)
    }
    const targetUid = drop.type === 'node' ? drop.targetUid : drop.parentUid
    const target = find(copy, targetUid)
    if (!target) return false
    target.children ||= []
    let index = target.children.length
    if (drop.type === 'gap') {
      const next = target.children.findIndex((child) => isUid(child, drop.nextUid))
      const prev = target.children.findIndex((child) => isUid(child, drop.prevUid))
      if (next >= 0) index = next
      if (prev >= 0) index = prev + 1
    }
    target.children.splice(index, 0, fresh)
    return contacts(copy)
  }

  window.LOGYQGameGrammar = Object.freeze({ parsePaint, paintSpec, edge, touchesMatch, contacts, complete, canDrop, canAdd })
})()
