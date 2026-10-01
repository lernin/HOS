/* LOGYQ fixed-orientation physical card grammar.
 * Paint syntax:
 *   W:A       whole card
 *   L:A:B     horizontal layer cake: A top, B bottom
 *   DL:A:B    diagonal \\: A touches top/right, B touches bottom/left
 *   DR:A:B    diagonal /: A touches top/left, B touches bottom/right
 * No semantic target tree is consulted: only visible contacts and inventory. */
(() => {
  'use strict'

  const GAME_COLORS = {
    A: '#60a5fa', B: '#fb923c', C: '#86efac', D: '#f0abfc',
    E: '#facc15', F: '#f87171', G: '#2dd4bf',
  }
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
    let copy = clone(tree)
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

    const targetUid = drop.type === 'node' ? drop.targetUid : drop.parentUid
    const target = find(copy, targetUid)
    if (!target || isUid(moving, targetUid)) return false
    const intoOwn = !!find(moving, targetUid)
    let detached
    if (isUid(copy, movingUid)) {
      // Match the mapper's root promotion: its leftmost child becomes root,
      // other root children append there, and the old root moves alone.
      if (!intoOwn || !moving.children.length) return false
      const [promoted, ...others] = moving.children
      moving.children = []
      promoted.children.push(...others)
      copy = promoted
      detached = moving
    } else if (intoOwn) {
      // Moving onto a descendant promotes children at the old parent first.
      const parent = (() => {
        const walk = node => {
          if (node.children.some(child => isUid(child, movingUid))) return node
          for (const child of node.children) { const found = walk(child); if (found) return found }
          return null
        }
        return walk(copy)
      })()
      if (!parent) return false
      const index = parent.children.indexOf(moving)
      parent.children.splice(index, 1, ...moving.children)
      moving.children = []
      detached = moving
    } else detached = detach(copy, movingUid)
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

  // All ordered rooted trees on distinct physical IDs. Subtree results are
  // memoized by inventory and root. The rest of a tree can observe only that
  // root's edge signatures, so retaining `cap` witnesses for it is sufficient.
  // The count saturates at cap; a returned pair is evidence of ambiguity.
  function physicalSolutions(pieces, limit = 2, { singleSpine = false } = {}) {
    const pool = (Array.isArray(pieces) ? pieces : []).map(piece => ({
      gameId: piece?.gameId, paint: piece?.paint, name: '',
    }))
    const n = pool.length
    const cap = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0
    if (n > 20) throw new Error('Unsupported inventory size: maximum 20 pieces')
    if (new Set(pool.map(p => p.gameId)).size !== n) throw new Error('Physical IDs must be unique')
    if (!n || !cap || pool.some(p => !p.gameId || !parsePaint(p.paint))) return []
    const signatures = pool.map(p => ({
      top: edge(p.paint, 'top'), bottom: edge(p.paint, 'bottom'),
      left: edge(p.paint, 'left'), right: edge(p.paint, 'right'),
    }))
    const trees = new Map()
    const forests = new Map()
    function forest(mask, bottom, previousRight, hasNonleaf = false) {
      if (!mask) return [[]]
      const key = JSON.stringify([mask, bottom, previousRight, hasNonleaf])
      if (forests.has(key)) return forests.get(key)
      const out = []
      for (let sub = mask; sub; sub = (sub - 1) & mask) {
        const nonleaf = (sub & (sub - 1)) !== 0
        // Audit certificates can search only layouts with no cousins. This
        // narrows the search; it must never be used to certify uniqueness.
        if (singleSpine && hasNonleaf && nonleaf) continue
        for (let i = 0; i < n; i++) {
          if (!(sub & (1 << i)) || signatures[i].top !== bottom) continue
          if (previousRight !== null && signatures[i].left !== previousRight) continue
          const firsts = tree(sub, i)
          if (!firsts.length) continue
          const tails = forest(mask ^ sub, bottom, signatures[i].right, hasNonleaf || nonleaf)
          for (const first of firsts) for (const tail of tails) {
            out.push([first, ...tail])
            if (out.length >= cap) { forests.set(key, out); return out }
          }
        }
      }
      forests.set(key, out)
      return out
    }
    function tree(mask, root) {
      const key = mask + ':' + root
      if (trees.has(key)) return trees.get(key)
      const out = forest(mask ^ (1 << root), signatures[root].bottom, null)
        .map(children => ({...pool[root], children}))
      trees.set(key, out)
      return out
    }
    const found = []
    for (let root = 0; root < n; root++) {
      for (const solution of tree((1 << n) - 1, root)) {
        found.push(solution)
        if (found.length >= cap) return found
      }
    }
    return found
  }

  // Seats the game would accept for one loose card on this board.
  // Node and gap drops, plus becoming the root. Stops at `limit`.
  function validSeats(tree, card, limit = 1) {
    const cap = limit > 0 ? limit : 0
    if (!cap || !tree || !card || !edge(card.paint, 'top')) return 0
    let count = 0
    const consider = (drop) => {
      if (count >= cap) return
      if (canAdd(tree, card, drop)) count += 1
    }
    consider({ type: 'rootAbove' })
    const walk = (node) => {
      if (!node || count >= cap) return
      consider({ type: 'node', targetUid: node.gameId })
      const kids = node.children || []
      for (let i = 0; i <= kids.length; i++) {
        const drop = { type: 'gap', parentUid: node.gameId }
        if (kids[i - 1]) drop.prevUid = kids[i - 1].gameId
        if (kids[i]) drop.nextUid = kids[i].gameId
        consider(drop)
      }
      for (const child of kids) walk(child)
    }
    walk(tree)
    return count
  }

  window.LOGYQGameGrammar = Object.freeze({
    parsePaint, paintSpec, edge, touchesMatch, contacts, complete, canDrop, canAdd,
    physicalSolutions, validSeats,
  })
})()
