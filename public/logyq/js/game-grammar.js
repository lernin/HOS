/* LOGYQ fixed-orientation visual-card grammar.
 * Region numbers are logical identities. Display colors are a renderer concern. */
(() => {
  'use strict'

  const SHAPES = Object.freeze(['whole', 'horizontal', 'diagonal_left', 'diagonal_right'])

  function validCard(card) {
    if (!card || !SHAPES.includes(card.shape) || !Array.isArray(card.regions)) return false
    const needed = card.shape === 'whole' ? 1 : 2
    return card.regions.length === needed && card.regions.every((value) => Number.isInteger(value) && value >= 1 && value <= 4)
  }

  function edge(card, side) {
    if (!validCard(card)) return null
    const [a, b] = card.regions
    if (card.shape === 'whole') return String(a)
    if (side === 'top') return String(a)
    if (side === 'bottom') return String(b)
    if (card.shape === 'horizontal') return side === 'left' || side === 'right' ? `${a}|${b}` : null
    if (card.shape === 'diagonal_left') {
      if (side === 'left') return String(b)
      if (side === 'right') return String(a)
    }
    if (card.shape === 'diagonal_right') {
      if (side === 'left') return String(a)
      if (side === 'right') return String(b)
    }
    return null
  }

  function touchesMatch(a, sideA, b, sideB) {
    const first = edge(a, sideA)
    return !!first && first === edge(b, sideB)
  }

  function contacts(tree) {
    if (!tree || !validCard(tree)) return false
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
    return { ...node, regions: Array.isArray(node?.regions) ? node.regions.slice() : node?.regions, children: (node.children || []).map(clone) }
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
  function parentOf(node, uid) {
    if ((node?.children || []).some((child) => isUid(child, uid))) return node
    for (const child of node?.children || []) {
      const found = parentOf(child, uid)
      if (found) return found
    }
    return null
  }

  // Only physical destination contacts decide whether a move is allowed.
  function canDrop(tree, movingUid, drop) {
    if (!tree || !drop || !movingUid) return false
    if (!['gap', 'node', 'rootAbove'].includes(drop.type)) return false
    const copy = clone(tree)
    const moving = find(copy, movingUid)
    if (!moving) return false

    if (drop.type === 'rootAbove') {
      if (isUid(copy, movingUid)) return false
      detach(copy, movingUid)
      moving.children ||= []
      moving.children.push(copy)
      return contacts(moving)
    }

    if (isUid(copy, movingUid)) return false
    const targetUid = drop.type === 'node' ? drop.targetUid : drop.parentUid
    const target = find(copy, targetUid)
    if (!target || isUid(moving, targetUid)) return false

    if (find(moving, targetUid)) {
      if (drop.type !== 'node') return false
      const oldParent = parentOf(copy, movingUid)
      if (!oldParent) return false
      const index = oldParent.children.findIndex((child) => isUid(child, movingUid))
      oldParent.children.splice(index, 1, ...(moving.children || []))
      moving.children = []
      const promoted = find(copy, targetUid)
      promoted.children ||= []
      promoted.children.push(moving)
      return contacts(copy)
    }

    detach(copy, movingUid)
    target.children ||= []
    let index = target.children.length
    if (drop.type === 'gap') {
      const next = target.children.findIndex((child) => isUid(child, drop.nextUid))
      const prev = target.children.findIndex((child) => isUid(child, drop.prevUid))
      if (next >= 0) index = next
      if (prev >= 0) index = prev + 1
    }
    target.children.splice(index, 0, moving)
    const siblings = target.children
    return touchesMatch(target, 'bottom', moving, 'top') &&
      (index === 0 || touchesMatch(siblings[index - 1], 'right', moving, 'left')) &&
      (index === siblings.length - 1 || touchesMatch(moving, 'right', siblings[index + 1], 'left'))
  }

  window.LOGYQGameGrammar = Object.freeze({ SHAPES, validCard, edge, touchesMatch, contacts, complete, canDrop })
})()
