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

  // Every ordered tree on these pieces, accepted only by contacts().
  // Stops once `limit` solutions exist so callers can tell 1 from many.
  function physicalSolutions(pieces, limit = 2) {
    const pool = (Array.isArray(pieces) ? pieces : []).map((piece) => ({
      gameId: piece?.gameId,
      paint: piece?.paint,
      name: '',
    }))
    const n = pool.length
    const cap = limit > 0 ? limit : 0
    if (!n || !cap || pool.some((piece) => !piece.gameId || !edge(piece.paint, 'top'))) return []
    const full = (1 << n) - 1
    const cache = new Map()
    const groupsOf = new Map()

    function compositions(mask) {
      if (groupsOf.has(mask)) return groupsOf.get(mask)
      const bits = []
      for (let i = 0; i < n; i++) if (mask & (1 << i)) bits.push(i)
      const rec = (remaining) => {
        if (!remaining.length) return [[]]
        const out = []
        const width = remaining.length
        for (let sub = 1; sub < (1 << width); sub++) {
          let first = 0
          const rest = []
          for (let i = 0; i < width; i++) {
            if (sub & (1 << i)) first |= 1 << remaining[i]
            else rest.push(remaining[i])
          }
          for (const tail of rec(rest)) out.push([first].concat(tail))
        }
        return out
      }
      const groups = rec(bits)
      groupsOf.set(mask, groups)
      return groups
    }

    function treesFor(mask) {
      if (cache.has(mask)) return cache.get(mask)
      const idxs = []
      for (let i = 0; i < n; i++) if (mask & (1 << i)) idxs.push(i)
      const trees = []
      if (idxs.length === 1) {
        const piece = pool[idxs[0]]
        trees.push({ gameId: piece.gameId, paint: piece.paint, name: '', children: [] })
      } else {
        for (const rootIdx of idxs) {
          const piece = pool[rootIdx]
          for (const groups of compositions(mask ^ (1 << rootIdx))) {
            const options = groups.map((group) => treesFor(group))
            if (options.some((option) => !option.length)) continue
            const combo = []
            const walk = (depth) => {
              if (depth === options.length) {
                const tree = { gameId: piece.gameId, paint: piece.paint, name: '', children: combo.slice() }
                if (contacts(tree)) trees.push(tree)
                return
              }
              for (const child of options[depth]) {
                combo[depth] = child
                walk(depth + 1)
              }
            }
            walk(0)
          }
        }
      }
      cache.set(mask, trees)
      return trees
    }

    const found = []
    const idxs = []
    for (let i = 0; i < n; i++) idxs.push(i)
    for (const rootIdx of idxs) {
      if (found.length >= cap) break
      const piece = pool[rootIdx]
      for (const groups of compositions(full ^ (1 << rootIdx))) {
        if (found.length >= cap) break
        const options = groups.map((group) => treesFor(group))
        if (options.some((option) => !option.length)) continue
        const combo = []
        const walk = (depth) => {
          if (found.length >= cap) return
          if (depth === options.length) {
            const tree = { gameId: piece.gameId, paint: piece.paint, name: '', children: combo.slice() }
            if (contacts(tree)) found.push(tree)
            return
          }
          for (const child of options[depth]) {
            if (found.length >= cap) return
            combo[depth] = child
            walk(depth + 1)
          }
        }
        walk(0)
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
