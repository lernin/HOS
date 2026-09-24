/* Fixed-orientation card grammar. Each paint defines the colors at its four
 * contacts; neighboring children touch on their shared vertical edge. */
(() => {
  'use strict'
  const faces = Object.freeze({
    orange: { top: 'orange', bottom: 'orange', left: 'orange', right: 'orange' },
    blue: { top: 'blue', bottom: 'blue', left: 'blue', right: 'blue' },
    'orange-blue': { top: 'orange', bottom: 'blue', left: 'orange-blue', right: 'orange-blue' },
    'pink-blue-down': { top: 'blue', bottom: 'pink', left: 'pink', right: 'blue' },
    'blue-green-up': { top: 'blue', bottom: 'green', left: 'blue', right: 'green' },
  })

  function edge(paint, side) { return faces[paint]?.[side] || null }
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
  function complete(tree, ids, rootId) {
    if (!tree || tree.gameId !== rootId || !Array.isArray(ids) || !contacts(tree)) return false
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
  // Destination contacts are the only move test. The starter arrangement may
  // have a clash elsewhere; the moved card must fit wherever it is dropped.
  function canDrop(tree, movingUid, drop, rootId) {
    if (!tree || !drop || isUid(tree, movingUid)) return false
    if (drop.type !== 'gap' && drop.type !== 'node') return false
    const copy = clone(tree)
    const moving = find(copy, movingUid)
    const targetUid = drop.type === 'node' ? drop.targetUid : drop.parentUid
    const target = find(copy, targetUid)
    if (!moving || !target || find(moving, targetUid)) return false
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
    return copy.gameId === rootId &&
      touchesMatch(target, 'bottom', moving, 'top') &&
      (index === 0 || touchesMatch(siblings[index - 1], 'right', moving, 'left')) &&
      (index === siblings.length - 1 || touchesMatch(moving, 'right', siblings[index + 1], 'left'))
  }
  window.LOGYQGameGrammar = Object.freeze({ edge, contacts, complete, canDrop })
})()
