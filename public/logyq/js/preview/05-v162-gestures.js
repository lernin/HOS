  function v162Constants() {
    return {
      FLICK_MIN: 52,
      FLICK_MAX_MS: 340,
      FLICK_RATIO: 1.45,
      FLICK_FAST_MS: 180,
      HOLD_MS: 160,
      HOLD_SLOP: 8,
      TAP_MOVE: 11,
      DOUBLE_TAP_MS: 360,
      PAN_DEAD_PX: 56,
      PAN_STEP: 16,
      PX_PER_CM: 38,
      OFFSET_UP_CM: 1.1,
      OFFSET_SIDE_CM: 0,
      BANK_DWELL_MS: 480,
      STILL_PX: 16,
    }
  }

  function v162Mobile(win) {
    const target = win || window
    return target.matchMedia('((pointer:coarse) and (max-width:1200px)),((hover:none) and (max-width:1200px))').matches
  }

  // SMITE_PURE_START
  // Parked-thumb smite. These stay pure so the mercy rules can be tested
  // without a phone: zone, cast direction, affected set, toggle, ring, commit.
  function smiteZone(y, height) {
    const span = Number(height) > 0 ? Number(height) : 1
    const ratio = Number(y) / span
    if (ratio < 1 / 3) return 'top'
    if (ratio < 2 / 3) return 'middle'
    return 'bottom'
  }

  function smiteCastDirection(dx, dy, min = 52) {
    const adx = Math.abs(Number(dx) || 0)
    const ady = Math.abs(Number(dy) || 0)
    if (Math.hypot(Number(dx) || 0, Number(dy) || 0) < min) return null
    if (ady >= adx && dy > 0) return 'down'
    if (adx > ady && dx < 0) return 'left'
    return null
  }

  function smiteNodeId(node) {
    if (!node) return null
    return node.uid || node._uid || node.data?._uid || null
  }

  function smiteChildList(node) {
    if (Array.isArray(node?.children)) return node.children
    if (Array.isArray(node?.data?.children)) return node.data.children
    return []
  }

  function smiteAffected(node, zone) {
    const id = smiteNodeId(node)
    if (!id) return []
    if (zone === 'top') return [id]
    if (zone === 'bottom') return smiteChildList(node).map(smiteNodeId).filter(Boolean)
    const out = []
    const walk = (current) => {
      const uid = smiteNodeId(current)
      if (uid) out.push(uid)
      for (const kid of smiteChildList(current)) walk(kid)
    }
    walk(node)
    return out
  }

  // Tree root stops at normal. Every other marked card cycles back to red.
  function smiteNextMark(mark, isTreeRoot) {
    if (mark === 'red') return 'amber'
    if (mark === 'amber') return 'normal'
    return isTreeRoot ? 'normal' : 'red'
  }

  // The mercy clock is 15s: 3s with the line held full, then a 12s drain.
  // `remaining` is that whole clock. Progress is the drain still left / 12s,
  // so the stroke and the delete share one number.
  function smiteRingFraction(remainingMs, fullMs = 12000) {
    const full = Number(fullMs) > 0 ? Number(fullMs) : 12000
    const remaining = Number(remainingMs) || 0
    if (remaining >= full) return 1
    if (remaining <= 0) return 0
    return remaining / full
  }

  function smiteRefillMs(remainingMs, addMs = 1000, maxMs = 15000) {
    const next = Math.max(0, Number(remainingMs) || 0) + (Number(addMs) || 0)
    return Math.min(Number(maxMs) > 0 ? Number(maxMs) : 15000, next)
  }

  function smiteMarkOf(marks, uid) {
    if (!marks || uid == null) return null
    const value = typeof marks.get === 'function' ? marks.get(uid) : marks[uid]
    return value === 'red' || value === 'amber' || value === 'normal' ? value : null
  }

  function smiteCloneCard(node) {
    const copy = JSON.parse(JSON.stringify(node))
    delete copy.children
    return copy
  }

  function smiteVisit(node, keptAncestorUid, marks, bank, scars) {
    if (!node || typeof node !== 'object') return []
    const uid = node._uid || node.uid || null
    const mark = smiteMarkOf(marks, uid)
    const fate = mark === 'red' || mark === 'amber' ? mark : 'keep'
    const nextAncestor = fate === 'keep' ? uid : keptAncestorUid
    const lifted = []
    const kids = Array.isArray(node.children) ? node.children : []
    for (const kid of kids) lifted.push(...smiteVisit(kid, nextAncestor, marks, bank, scars))
    if (fate === 'keep') {
      const copy = smiteCloneCard(node)
      copy.children = lifted.length ? lifted : null
      return [copy]
    }
    if (fate === 'amber') {
      const name = String(node.name || '').trim()
      if (name) bank.push(name)
      return lifted
    }
    scars.push({
      name: node.name || '',
      color: node.color || null,
      uid,
      parentUid: keptAncestorUid || null,
    })
    return lifted
  }

  // Does not mutate `tree`. Red scars, amber banks (blank labels do not),
  // normal and unmarked cards stay and climb to the nearest kept ancestor.
  function planSmiteCommit(tree, marks) {
    const bank = []
    const scars = []
    if (!tree || typeof tree !== 'object') return { tree: null, bank, scars }
    const source = JSON.parse(JSON.stringify(tree))
    const lifted = smiteVisit(source, null, marks, bank, scars)
    if (!lifted.length) return { tree: null, bank, scars }
    const root = lifted[0]
    if (lifted.length > 1) root.children = (root.children || []).concat(lifted.slice(1))
    return { tree: root, bank, scars }
  }

  function smiteNum(value) {
    return String(Math.round((Number(value) || 0) * 1000) / 1000)
  }

  function smiteRoundCaps(width, height, rx, ry) {
    const w = Number(width) || 0
    const h = Number(height) || 0
    const wantX = Number(rx) > 0 ? Number(rx) : 10
    const wantY = Number(ry) > 0 ? Number(ry) : wantX
    return {
      w,
      h,
      capX: Math.min(wantX, Math.max(0, w / 2 - 1)),
      capY: Math.min(wantY, Math.max(0, h / 2 - 1)),
    }
  }

  function smiteQuarterArc(rx, ry) {
    const a = Math.max(0, Number(rx) || 0)
    const b = Math.max(0, Number(ry) || 0)
    if (a <= 0 && b <= 0) return 0
    if (Math.abs(a - b) < 0.01) return (Math.PI * Math.max(a, b)) / 2
    const sum = a + b
    const h = ((a - b) / sum) ** 2
    return (Math.PI * sum * (1 + (3 * h) / (10 + Math.sqrt(Math.max(0, 4 - 3 * h))))) / 4
  }

  // Perimeter of the counter-clockwise outline, in the same user units as the path.
  function smiteLineCorners(width, height, rx = 10, ry = 10) {
    const { w, h, capX, capY } = smiteRoundCaps(width, height, rx, ry)
    if (w <= 0 || h <= 0) return null
    const topHalf = Math.max(0, w / 2 - capX)
    const side = Math.max(0, h - 2 * capY)
    const bottom = Math.max(0, w - 2 * capX)
    const arc = smiteQuarterArc(capX, capY)
    const firstCorner = topHalf + arc
    const bottomLeft = firstCorner + side + arc
    const bottomRight = bottomLeft + bottom + arc
    const finalTop = bottomRight + side + arc
    return { total: finalTop + topHalf, firstCorner, bottomLeft, bottomRight, finalTop }
  }

  function smiteClockLength(width, height, rx = 10, ry = 10) {
    return smiteLineCorners(width, height, rx, ry)?.total || 0
  }

  // One counter-clockwise rounded outline. It begins at 12 o'clock and
  // travels toward the left. The visible stroke is the untraveled suffix
  // that still closes back at 12, so the gap eats forward as the ring drains.
  function smiteClockPath(x, y, width, height, rx = 10, ry = 10) {
    const { w, h, capX, capY } = smiteRoundCaps(width, height, rx, ry)
    if (w <= 0 || h <= 0) return ''
    const left = Number(x) || 0
    const top = Number(y) || 0
    const right = left + w
    const bottom = top + h
    const noonX = left + w / 2
    if (capX <= 0 || capY <= 0) {
      return `M ${smiteNum(noonX)} ${smiteNum(top)} H ${smiteNum(left)} V ${smiteNum(bottom)} H ${smiteNum(right)} V ${smiteNum(top)} H ${smiteNum(noonX)} Z`
    }
    return [
      `M ${smiteNum(noonX)} ${smiteNum(top)}`,
      `H ${smiteNum(left + capX)}`,
      `A ${smiteNum(capX)} ${smiteNum(capY)} 0 0 0 ${smiteNum(left)} ${smiteNum(top + capY)}`,
      `V ${smiteNum(bottom - capY)}`,
      `A ${smiteNum(capX)} ${smiteNum(capY)} 0 0 0 ${smiteNum(left + capX)} ${smiteNum(bottom)}`,
      `H ${smiteNum(right - capX)}`,
      `A ${smiteNum(capX)} ${smiteNum(capY)} 0 0 0 ${smiteNum(right)} ${smiteNum(bottom - capY)}`,
      `V ${smiteNum(top + capY)}`,
      `A ${smiteNum(capX)} ${smiteNum(capY)} 0 0 0 ${smiteNum(right - capX)} ${smiteNum(top)}`,
      `H ${smiteNum(noonX)} Z`,
    ].join(' ')
  }

  // One progress value, one dash. `length` is the path's own user-unit length.
  // A full ring is a solid stroke (no dash pattern). While it drains, one gap
  // eats the counter-clockwise prefix and one dash is the suffix back to 12.
  function smiteLineDash(fraction, length) {
    const f = Number(fraction)
    const total = Math.max(0, Number(length) || 0)
    if (!Number.isFinite(f) || f >= 1) return { array: 'none', offset: 0 }
    if (f <= 0 || total <= 0) return { array: '0 1', offset: 0 }
  const visible = total * Math.min(1, f)
  const eaten = total - visible
  // Offset is the remaining length, so the pattern starts on the gap.
  // Dash + gap = pathLength, one suffix, no second painted lap.
  return { array: `${visible} ${eaten}`, offset: visible }
}

  // Five levels from where the drain tip is along the stroke.
  // l1 just staged, l2 after the first corner off the top, l3 after the
  // bottom-left corner, l4 after the bottom-right corner, l5 after the
  // last top corner.
  function smiteLinePhase(fraction, width, height, rx = 10, ry = 10) {
    const f = Number(fraction)
    if (!Number.isFinite(f) || f >= 1) return 'l1'
    if (f <= 0) return 'l5'
    const corners = smiteLineCorners(width, height, rx, ry)
    if (!corners || corners.total <= 0) return 'l1'
    const eaten = (1 - Math.min(1, f)) * corners.total
    if (eaten <= corners.firstCorner) return 'l1'
    if (eaten <= corners.bottomLeft) return 'l2'
    if (eaten <= corners.bottomRight) return 'l3'
    if (eaten <= corners.finalTop) return 'l4'
    return 'l5'
  }

  // A clock card is a dying node whose parent is not also dying.
  function smiteClockRoots(rootData, marks) {
    const roots = []
    const walk = (node, parentDying) => {
      if (!node || typeof node !== 'object') return
      const uid = node._uid || node.uid || node.data?._uid || null
      const mark = smiteMarkOf(marks, uid)
      const dying = mark === 'red' || mark === 'amber'
      if (dying && !parentDying && uid) roots.push(uid)
      const kids = Array.isArray(node.children) ? node.children : []
      for (const kid of kids) walk(kid, dying)
    }
    walk(rootData, false)
    return roots
  }

  function smiteMoodColor(mark) {
    return mark === 'amber' ? '#ffa100' : '#ff0000'
  }

  function smiteNodeUid(node) {
    return node?._uid || node?.uid || node?.data?._uid || null
  }

  function smiteNodeKids(node) {
    return Array.isArray(node?.children) ? node.children
      : (Array.isArray(node?.data?.children) ? node.data.children : [])
  }

  function smiteFindNode(tree, uid) {
    let found = null
    const find = (node) => {
      if (found || !node || typeof node !== 'object') return
      if (smiteNodeUid(node) === uid) {
        found = node
        return
      }
      for (const kid of smiteNodeKids(node)) find(kid)
    }
    find(tree)
    return found
  }

  // Connectors whose target is strictly below the clock parent. The edge
  // into that parent, and anything above it, keeps the normal link color.
  function smiteMoodTargets(tree, castUid) {
    const out = []
    if (!tree || !castUid) return out
    const found = smiteFindNode(tree, castUid)
    const collect = (node) => {
      for (const kid of smiteNodeKids(node)) {
        const uid = smiteNodeUid(kid)
        if (uid) out.push(uid)
        collect(kid)
      }
    }
    if (found) collect(found)
    return out
  }

  // The flicked card plus every structural descendant. Siblings and
  // ancestors are outside this set, so a partial commit leaves them.
  function smiteSubtreeIds(tree, uid) {
    const out = []
    if (!tree || !uid) return out
    const found = smiteFindNode(tree, uid)
    const collect = (node) => {
      const id = smiteNodeUid(node)
      if (id) out.push(id)
      for (const kid of smiteNodeKids(node)) collect(kid)
    }
    if (found) collect(found)
    return out
  }

  // Still-in fates only. Out and unmarked cards in the pocket stay.
  function smiteScopeMarks(marks, ids) {
    const want = new Set(ids || [])
    const scoped = new Map()
    for (const [id, mark] of smiteTicketEntries(marks)) {
      if (!want.has(id)) continue
      if (mark === 'red' || mark === 'amber') scoped.set(id, mark)
    }
    return scoped
  }

  function smiteFlickScope(tree, marks, uid) {
    return smiteScopeMarks(marks, smiteSubtreeIds(tree, uid))
  }

  // Out-in-cast is white. Delete and Word Bank keep the mercy colors.
  function smiteFateTone(mark) {
    if (mark === 'red') return '#ff0000'
    if (mark === 'amber') return '#ffa100'
    return '#ffffff'
  }

  // Soft slate, not charcoal. The map is #f0f2f5, so this deeper of the
  // two trial grays still reads around a white core.
  function smiteHaloTone(mark) {
    return smiteFateTone(mark) === '#ffffff' ? '#7C8491' : '#ffffff'
  }

  function smiteStillIn(mark) {
    return mark === 'red' || mark === 'amber'
  }

  function smiteInCast(mark) {
    return mark === 'red' || mark === 'amber' || mark === 'normal'
  }

  // Gradient runs parent → child. Every pocket edge is the same weight:
  // a thick fate core over a wider halo. Red and amber keep a white halo.
  // A white fate, including the white end of a mixed edge, uses slate.
  function smiteEdgePaint(parentMark, childMark) {
    return {
      from: smiteFateTone(parentMark),
      to: smiteFateTone(childMark),
      ants: smiteFateTone(childMark),
      haloFrom: smiteHaloTone(parentMark),
      haloTo: smiteHaloTone(childMark),
      weight: 'strong',
    }
  }

  // Parent-only, kids-only, or a whole pocket. Connectors move only for a pocket.
  function smiteCastShape(marks, castUid, descendantUids) {
    const rootIn = smiteStillIn(smiteMarkOf(marks, castUid))
    const kidIn = (descendantUids || []).some((uid) => smiteStillIn(smiteMarkOf(marks, uid)))
    if (rootIn && kidIn) return 'pocket'
    if (rootIn) return 'parent'
    if (kidIn) return 'kids'
    return 'idle'
  }

  // Armed select is a calm green outline. Not a fate, so no ants and no clock.
  function smiteArmChrome() {
    return { stroke: '#16a34a', ants: false, fill: 'none' }
  }

  // One-thumb direction. Up is only for a green-armed card.
  // Two-finger Smite keeps smiteCastDirection, which does not return up.
  function smiteArmDirection(dx, dy, min = 52) {
    const x = Number(dx) || 0
    const y = Number(dy) || 0
    const adx = Math.abs(x)
    const ady = Math.abs(y)
    if (Math.hypot(x, y) < min) return null
    if (adx > ady && x < 0) return 'left'
    if (ady >= adx && y > 0) return 'down'
    if (ady > adx && y < 0) return 'up'
    return null
  }

  // The swipe starts on the green card, or on one of its direct children.
  function smiteArmTarget(armedUid, hitUid, childIds) {
    if (!armedUid || !hitUid) return null
    if (hitUid === armedUid) return 'self'
    if ((childIds || []).some((id) => id === hitUid)) return 'child'
    return null
  }

  // self + down/left: the green card and everything under it.
  // self + up: the green card alone.
  // child + down/left: every direct child, not grandchildren.
  function smiteArmScope(node, target, direction) {
    if (!node || !target || !direction) return []
    const id = smiteNodeId(node)
    if (!id) return []
    if (target === 'child') {
      if (direction !== 'down' && direction !== 'left') return []
      return smiteChildList(node).map(smiteNodeId).filter(Boolean)
    }
    if (target !== 'self') return []
    if (direction === 'up') return [id]
    if (direction === 'down' || direction === 'left') return smiteAffected(node, 'middle')
    return []
  }

  // Clock cards wear the mercy timer, not a second ants outline. No fills.
  function smiteCardChrome(mark, isClockCard) {
    if (isClockCard) return null
    if (mark === 'red') return { stroke: '#ff0000', ants: true, fill: 'none' }
    if (mark === 'amber') return { stroke: '#ffa100', ants: true, fill: 'none' }
    if (mark === 'normal') return { stroke: '#ffffff', ants: true, fill: 'none' }
    return null
  }

  // Parent-only and kids-only leave the connectors alone. A pocket marches
  // every in-cast edge, including ones that end on a white / out child.
  function smiteLinkLive(shape, parentMark, childMark) {
    if (shape !== 'pocket') return null
    if (!smiteInCast(parentMark) || !smiteInCast(childMark)) return null
    return smiteEdgePaint(parentMark, childMark)
  }

  function smiteEdgeAnt(parentMark, childMark) {
    return smiteEdgePaint(parentMark, childMark).ants
  }

  // Edges whose target sits strictly below the clock card.
  function smiteMoodEdges(tree, castUid) {
    const out = []
    if (!tree || !castUid) return out
    const found = smiteFindNode(tree, castUid)
    const walk = (node) => {
      const parentUid = smiteNodeUid(node)
      for (const kid of smiteNodeKids(node)) {
        const childUid = smiteNodeUid(kid)
        if (parentUid && childUid) out.push({ parentUid, childUid })
        walk(kid)
      }
    }
    if (found) walk(found)
    return out
  }

  // True when any incoming card is already in a live branch.
  function smiteCastOverlaps(sets, ids) {
    const taken = new Set()
    for (const set of sets || []) {
      const marks = set?.marks || set
      if (!marks) continue
      if (typeof marks.keys === 'function') {
        for (const uid of marks.keys()) taken.add(uid)
      } else {
        for (const uid of Object.keys(marks)) taken.add(uid)
      }
    }
    return (ids || []).some((id) => taken.has(id))
  }

  // Disjoint branches stay side by side. A later cast that fully contains
  // an earlier branch absorbs it and becomes the primary. A partial overlap,
  // or a new cast nested inside an existing one, stays blocked.
  function smiteFoldCast(mercies, ids, tone) {
    const incoming = new Set(ids || [])
    const absorb = []
    for (const mercy of mercies || []) {
      if (!mercy) continue
      const held = smiteTicketEntries(mercy.marks).map(([uid]) => uid)
      if (!held.length) continue
      const hits = held.filter((id) => incoming.has(id))
      if (!hits.length) continue
      if (mercy.committing || hits.length !== held.length) {
        return { action: 'block', absorb: [], marks: null }
      }
      absorb.push(mercy)
    }
    const nextTone = tone === 'amber' ? 'amber' : 'red'
    const marks = new Map()
    for (const id of ids || []) marks.set(id, nextTone)
    for (const mercy of absorb) {
      for (const [uid, mark] of smiteTicketEntries(mercy.marks)) {
        if (incoming.has(uid) && (mark === 'red' || mark === 'amber' || mark === 'normal')) marks.set(uid, mark)
      }
    }
    return { action: absorb.length ? 'absorb' : 'clear', absorb, marks }
  }

  function smiteHsl(hue, sat, light) {
    const s = sat / 100
    const l = light / 100
    const a = s * Math.min(l, 1 - l)
    const channel = (n) => {
      const k = (n + hue / 30) % 12
      const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
      return Math.round(c * 255).toString(16).padStart(2, '0')
    }
    return `#${channel(0)}${channel(8)}${channel(4)}`
  }

  // One ladder for both fates. Same hue, saturation up, lightness down
  // toward the pure primary. l5 red is #ff0000. l5 amber is #ffa100.
  function smiteHeat(phase, mark = 'red') {
    const hue = mark === 'amber' ? 38 : 0
    const ladder = {
      l1: [78, 84, 0.38],
      l2: [86, 72, 0.52],
      l3: [92, 62, 0.66],
      l4: [96, 55, 0.8],
      l5: [100, 50, 0.94],
    }
    const stop = ladder[phase] || ladder.l1
    const color = smiteHsl(hue, stop[0], stop[1])
    return { stroke: color, wash: color, washOpacity: stop[2], glow: 0 }
  }

  function smitePastel(mark) {
    if (mark === 'amber') return { fill: '#ffcc80', opacity: 0.88 }
    return { fill: '#ffb8b8', opacity: 0.88 }
  }

  function smiteMarkList(marks) {
    const out = []
    if (!marks) return out
    if (typeof marks.forEach === 'function') marks.forEach((mark) => out.push(mark))
    else Object.keys(marks).forEach((uid) => out.push(marks[uid]))
    return out
  }

  // Clock color for the swiped card. Null when nothing is still nominated,
  // so a parent toggled all the way off does not keep a ring.
  function smiteNominatedTone(marks, castUid, tone) {
    const own = smiteMarkOf(marks, castUid)
    const nominated = smiteMarkList(marks).filter((mark) => mark === 'red' || mark === 'amber')
    if (!nominated.length) return null
    if (own === 'red' || own === 'amber') return own
    if (nominated.every((mark) => mark === nominated[0])) return nominated[0]
    if (tone === 'amber' || tone === 'red') return tone
    return nominated[0]
  }

  function smiteMember(marks, uid) {
    if (!uid || !marks) return false
    if (typeof marks.has === 'function') return marks.has(uid)
    return Object.prototype.hasOwnProperty.call(marks, uid)
  }

  // One card, one step: delete → Word Bank → out → delete.
  function smiteCardNext(mark) {
    if (mark === 'red') return 'amber'
    if (mark === 'amber') return 'normal'
    return 'red'
  }

  function smiteCycleMember(marks, uid) {
    const entries = smiteTicketEntries(marks)
    if (!smiteMember(marks, uid)) return { action: 'noop', entries }
    const next = smiteCardNext(smiteMarkOf(marks, uid))
    return {
      action: 'cycle',
      next,
      entries: entries.map(([id, mark]) => (id === uid ? [id, next] : [id, mark])),
    }
  }

  // Root tap steps the cast down. Delete becomes Word Bank for the root and
  // every descendant still on delete. Word Bank and out stay put. A root
  // that is already Word Bank ends the nomination. So does a clock tap
  // once nobody is left on delete or Word Bank — white outlines are not
  // a fate, and the cast must not keep throbbing.
  // A kids-only clock is not itself on delete. Tapping it still steps the
  // children: delete becomes Word Bank, and the next tap clears.
  function smiteRootStep(marks, castUid, descendantUids) {
    const entries = smiteTicketEntries(marks)
    const own = smiteMarkOf(marks, castUid)
    if (own === 'amber') return { action: 'clear', entries: [] }
    if (!smiteHasNominated(marks)) return { action: 'clear', entries: [] }
    const kids = new Set(descendantUids || [])
    const degrade = (includeSelf) => ({
      action: 'degrade',
      entries: entries.map(([id, mark]) => {
        if (mark !== 'red') return [id, mark]
        if ((includeSelf && id === castUid) || kids.has(id)) return [id, 'amber']
        return [id, mark]
      }),
    })
    if (own === 'red') return degrade(true)
    if (entries.some(([id, mark]) => mark === 'red' && kids.has(id))) return degrade(false)
    return { action: 'clear', entries: [] }
  }

  function smiteCastTap(marks, castUid, uid, descendantUids) {
    if (uid && uid === castUid) return smiteRootStep(marks, castUid, descendantUids)
    return smiteCycleMember(marks, uid)
  }

  // Down-swipe on the clock card or any nominated card (in or out) executes.
  // A stationary tap on a nominated card cycles that card. A tap on the
  // clock card steps the whole cast down instead.
  function smiteCastReply(marks, castUid, uid, dx, dy, tapMove = 11, triggerDy = 36) {
    const member = smiteMember(marks, uid)
    const root = !!uid && uid === castUid
    if (!member && !root) return 'ignore'
    const dxN = Number(dx) || 0
    const dyN = Number(dy) || 0
    if (dyN > triggerDy && dyN > Math.abs(dxN)) return 'execute'
    if (Math.hypot(dxN, dyN) >= tapMove) return 'ignore'
    return 'tap'
  }

  function smiteHasNominated(marks) {
    return smiteMarkList(marks).some((mark) => mark === 'red' || mark === 'amber')
  }

  function smiteTicketEntries(marks) {
    const out = []
    if (!marks) return out
    if (typeof marks.forEach === 'function') marks.forEach((mark, uid) => out.push([uid, mark]))
    else Object.keys(marks).forEach((uid) => out.push([uid, marks[uid]]))
    return out
  }

  // Full residue, then a soft ease-out. 0 means the scar is gone.
  function smiteScarOpacity(ageMs, holdMs = 2800, fadeMs = 7200) {
    const age = Math.max(0, Number(ageMs) || 0)
    const hold = Number(holdMs) > 0 ? Number(holdMs) : 0
    const fade = Number(fadeMs) > 0 ? Number(fadeMs) : 1
    if (age <= hold) return 1
    const t = (age - hold) / fade
    if (t >= 1) return 0
    const remain = 1 - t
    return remain * remain
  }

  // A live card owns the tap when its face contains the scar center.
  function smiteScarBlocked(x, y, rects) {
    const cx = Number(x)
    const cy = Number(y)
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return false
    for (const rect of rects || []) {
      if (!rect) continue
      if (cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom) return true
    }
    return false
  }
  // SMITE_PURE_END

  function bindV162Gestures() {
    const win = window
    const doc = document
    if (!v162Mobile(win) || !bridge) return
    const canvas = doc.getElementById('canvas')
    if (!canvas || canvas.dataset.logyqV162 === '1') return
    canvas.dataset.logyqV162 = '1'
    doc.body.classList.add('logyq-mobile-v162')
    try { bridge.core?.selection?.applySelectionStyles?.() } catch (_error) {}
    win.__logyqV2ConsumedPointers ||= new Set()
    win.requestAnimationFrame(() => {
      win.requestAnimationFrame(() => {
        try { bridge.fit() } catch (_error) {}
      })
    })

    const holdState = {
      active: new Set(),
      pointers: new Map(),
      hold: null,
      pan: null,
      race: null,
      drag: null,
      feedbackRaf: 0,
    }
    const flickState = {
      active: new Set(),
      candidates: new Map(),
      lastTap: null,
    }
    const mic = ensureCardMic(doc, win)
    holdState.mic = mic
    flickState.mic = mic

    win.addEventListener('pointerdown', (event) => onHoldDown(event, doc, win, canvas, holdState), true)
    win.addEventListener('pointermove', (event) => onHoldMove(event, doc, win, holdState), true)
    win.addEventListener('pointerup', (event) => onHoldUp(event, doc, win, canvas, holdState), true)
    win.addEventListener('pointercancel', (event) => onHoldCancel(event, doc, win, holdState), true)
    win.addEventListener('contextmenu', (event) => {
      if (!swallowBankContextMenu(event, doc, win, holdState)) return
      event.preventDefault()
      event.stopImmediatePropagation()
    }, true)

    canvas.addEventListener('pointerdown', (event) => onFlickDown(event, doc, win, flickState), true)
    canvas.addEventListener('pointerup', (event) => onFlickUp(event, doc, win, flickState), true)
    canvas.addEventListener('pointercancel', (event) => onFlickClear(event, win, flickState), true)
    if (preview.gestures) preview.gestures.session = { hold: holdState, flick: flickState }
    bindSmiteGestures(doc, win, canvas, holdState)
  }

  function hardClearBackground(doc, win, { keepStroke = false } = {}) {
    bridge.clearFocusSelection?.()
    const hold = preview.gestures?.session?.hold
    const flick = preview.gestures?.session?.flick
    if (hold) {
      cancelHold(win, hold)
      clearCardRace(win, hold)
      if (hold.pan) endCardPan(win, hold)
    }
    if (flick) {
      flick.lastTap = null
      if (!keepStroke) {
        flick.candidates.clear()
        flick.active.clear()
      }
      clearCardMic(flick.mic)
    }
    win.__logyqHoldArming = false
    if (!win.__logyqHoldDragSession) win.__logyqSuppressZoom = false
  }

  function noteTouchBankGrace(win) {
    if (typeof win.noteBankContextGrace === 'function') win.noteBankContextGrace(900)
    else {
      const until = Date.now() + 900
      if (!win.__logyqSuppressBankContextUntil || win.__logyqSuppressBankContextUntil < until) {
        win.__logyqSuppressBankContextUntil = until
      }
    }
  }

  // Phone has no right-click. Swallow card contextmenu during a hold,
  // during the post-touch grace, and any time the target is a card.
  // That is the long-press that used to addWords a copy into Word Bank.
  function swallowBankContextMenu(event, doc, win, holdState) {
    const onNode = !!event.target?.closest?.('g.node')
    if (holdState.drag || win.__logyqHoldDragSession || win.__logyqHoldArming || doc.body.classList.contains('v2-branch-drag')) return true
    if (!onNode) return false
    if (doc.body.classList.contains('logyq-mobile-v162') || v162Mobile(win)) return true
    if (win.__logyqSuppressBankContextUntil && Date.now() < win.__logyqSuppressBankContextUntil) return true
    if (typeof win.incidentalBankContext === 'function' && win.incidentalBankContext(event)) return true
    return false
  }

  function onHoldDown(event, doc, win, canvas, state) {
    if (event.pointerType === 'mouse') return
    noteTouchBankGrace(win)
    if (!(event.target === canvas || canvas.contains(event.target))) return
    if (bridge.core?.input?.isTextField?.(event.target)) return
    if (doc.querySelector('.logiq-backdrop.is-open')) return

    const alreadyActive = state.active.size > 0
    if (alreadyActive) {
      state.pointers.forEach((pointer) => { pointer.multi = true })
      cancelHold(win, state)
      endCardPan(win, state)
      clearCardRace(win, state)
      if (state.drag) yieldNodeDrag(doc, win, canvas, state)
    }

    state.active.add(event.pointerId)
    const source = hitNode(doc, event.clientX, event.clientY, event)
    const uid = nodeUid(source)
    const pointer = {
      x: event.clientX,
      y: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      uid,
      source,
      multi: alreadyActive,
    }
    state.pointers.set(event.pointerId, pointer)
    if (alreadyActive || !uid) {
      clearCardRace(win, state)
      return
    }

    const hold = { pointerId: event.pointerId, ...pointer, timer: 0 }
    hold.timer = win.setTimeout(() => latchHold(doc, win, state, hold), v162Constants().HOLD_MS)
    state.hold = hold
    win.__logyqHoldArming = true
    beginCardRace(doc, win, state, event)
  }

  function onHoldMove(event, doc, win, state) {
    const pointer = state.pointers.get(event.pointerId)
    if (!pointer) return
    pointer.lastX = event.clientX
    pointer.lastY = event.clientY

    if (state.hold?.pointerId === event.pointerId) {
      state.hold.lastX = event.clientX
      state.hold.lastY = event.clientY
      if (Math.hypot(event.clientX - state.hold.x, event.clientY - state.hold.y) > v162Constants().HOLD_SLOP) {
        cancelHold(win, state)
      }
    }

    if (state.race?.pointerId === event.pointerId) {
      resolveCardRace(doc, win, state, event)
      if (state.pan?.pointerId === event.pointerId) {
        applyFingerPan(doc, win, state.pan, event.clientX, event.clientY)
      }
      return
    }

    if (state.pan?.pointerId === event.pointerId) {
      applyFingerPan(doc, win, state.pan, event.clientX, event.clientY)
      return
    }

    const drag = state.drag
    if (!drag || drag.pointerId !== event.pointerId) return
    drag.lastX = event.clientX
    drag.lastY = event.clientY
    const feed = dragMousePoint(drag, event.clientX, event.clientY)
    movePreview(drag, event.clientX, event.clientY)
    mouse(win, win, 'mousemove', feed.x, feed.y, 1)
  }

  function onHoldUp(event, doc, win, canvas, state) {
    if (event.pointerType !== 'mouse') noteTouchBankGrace(win)
    state.active.delete(event.pointerId)
    state.pointers.delete(event.pointerId)
    if (state.hold?.pointerId === event.pointerId) cancelHold(win, state)
    if (state.race?.pointerId === event.pointerId) {
      const race = state.race
      const dx = event.clientX - race.x
      const dy = event.clientY - race.y
      if (race.view && isFlick(dx, dy, win.performance.now() - race.t0)) {
        restoreView(doc, win, race.view)
        state.pan = null
      }
    }
    if (state.pan?.pointerId === event.pointerId) endCardPan(win, state)
    if (state.race?.pointerId === event.pointerId) clearCardRace(win, state)

    const drag = state.drag
    if (!drag || drag.pointerId !== event.pointerId) return

    event.preventDefault()
    event.stopImmediatePropagation()

    const canceled = doc.body.classList.contains('v2-cancel') || drag.multi
    const releasedAtOrigin = Math.hypot(event.clientX - drag.x, event.clientY - drag.y) <= v162Constants().STILL_PX
    const dockKind = (canceled || releasedAtOrigin)
      ? 'none'
      : activeDockKind(doc, drag, event.clientX, event.clientY)
    const armedBank = !canceled && !releasedAtOrigin && drag.moved && dockKind === 'bank' && drag.bankArmed
    // Only a real move-drop mutates the tree. Stay-still, cancel, dock-near,
    // and second-finger yield keep the origin uid in the hierarchy so the
    // row cannot pack into the reserved slot. Word Bank is an explicit
    // post-cleanup call, not a side effect of d3.drag.end.
    const commitTree = !canceled && !releasedAtOrigin && dockKind === 'none'
      && fingerMovedFromLatch(drag, event.clientX, event.clientY)
    const end = (canceled || dockKind !== 'none' || releasedAtOrigin)
      ? { x: drag.x, y: drag.y }
      : visualPoint(event.clientX, event.clientY)

    if (commitTree) win.__logyqHoldDragCommit = true
    try {
      if (canceled || dockKind !== 'none' || releasedAtOrigin) mouse(win, win, 'mousemove', drag.x, drag.y, 1)
      mouse(win, win, 'mouseup', end.x, end.y, 0)

      cleanupDrag(doc, win, state, drag)
      dispatchPointerCancel(canvas, win, event.pointerId, event.clientX, event.clientY)
      if (armedBank) sendDragToWordBank(doc, drag)
    } finally {
      win.__logyqHoldDragCommit = false
      win.__logyqHoldDragAllowBank = false
      endHoldDragSession(win, state)
    }
  }

  function onHoldCancel(event, doc, win, state) {
    if (event.pointerType !== 'mouse') noteTouchBankGrace(win)
    state.active.delete(event.pointerId)
    state.pointers.delete(event.pointerId)
    if (state.hold?.pointerId === event.pointerId) cancelHold(win, state)
    if (state.pan?.pointerId === event.pointerId) endCardPan(win, state)
    if (state.race?.pointerId === event.pointerId) clearCardRace(win, state)

    const drag = state.drag
    if (!drag || drag.pointerId !== event.pointerId) return

    mouse(win, win, 'mousemove', drag.x, drag.y, 1)
    mouse(win, win, 'mouseup', drag.x, drag.y, 0)
    cleanupDrag(doc, win, state, drag)
    endHoldDragSession(win, state)
  }

  function latchHold(doc, win, state, hold) {
    if (state.hold !== hold) return
    const pointer = state.pointers.get(hold.pointerId)
    if (!pointer || pointer.multi || state.active.size !== 1) return cancelHold(win, state)

    state.hold = null
    if (hold.timer) win.clearTimeout(hold.timer)
    win.__logyqHoldArming = false
    clearCardRace(win, state)
    stopZoomGesture(doc)

    const source = nodeByUid(doc, hold.uid) || hold.source
    const hierarchy = source?.__data__
    if (!source || !hierarchy) return

    const branch = typeof hierarchy.descendants === 'function' ? hierarchy.descendants() : [hierarchy]
    const uids = branch.map((item) => item?.data?._uid).filter(Boolean)
    freezeTreeLayout(doc, win)
    const previewHost = makeBranchPreview(doc, win, hold.uid)
    if (!previewHost) return

    for (const uid of uids) nodeByUid(doc, uid)?.classList.add('v2-branch-origin-ghost')

    win.__logyqV2ConsumedPointers.add(hold.pointerId)
    win.__logyqHoldDragSession = true
    win.__logyqHoldDragAllowBank = false
    clearCardMic(state.mic)
    state.drag = {
      pointerId: hold.pointerId,
      uid: hold.uid,
      uids,
      x: hold.x,
      y: hold.y,
      lastX: hold.lastX,
      lastY: hold.lastY,
      preview: previewHost,
      multi: false,
      bankChip: null,
      bankSince: 0,
      bankArmed: false,
      moved: false,
    }

    doc.body.classList.add('v2-branch-drag')
    bridge.selectByUid(hold.uid)
    mouse(source, win, 'mousedown', hold.x, hold.y, 1)
    stampOriginGhost(doc, uids)
    state.drag.originLayout = captureOriginLayout(doc, uids)
    // Do not feed the 1.1cm card lift into d3 while the finger is still:
    // that phantom dy lands on the parent detector and the origin ghost
    // looks like it dissolved, then the tree reflows on release.
    mouse(win, win, 'mousemove', hold.x, hold.y, 1)
    movePreview(state.drag, hold.lastX, hold.lastY)
    startFeedbackLoop(doc, win, state)
    win.navigator.vibrate?.(12)
  }

  function makeBranchPreview(doc, win, rootUid) {
    const node = nodeByUid(doc, rootUid)
    if (!node) return null
    const vis = node.querySelector('rect:not(.grabzone)') || node
    const screen = vis.getBoundingClientRect()
    if (screen.width < 1 || screen.height < 1) return null

    const clone = node.cloneNode(true)
    clone.removeAttribute('transform')
    clone.removeAttribute('id')
    clone.classList.remove(
      'v2-branch-origin-ghost',
      'is-subtree',
      'is-others',
      'drop-target',
      'hover-adopt',
      'hover-adopt-sub',
      'is-focus-vhold',
    )
    clone.querySelectorAll('.grabzone').forEach((el) => el.remove())
    paintCloneCard(clone, node)

    const host = doc.createElement('div')
    host.id = 'logyq-v162-branch-preview'
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('aria-hidden', 'true')
    svg.style.left = `${screen.left}px`
    svg.style.top = `${screen.top}px`
    svg.style.width = `${screen.width}px`
    svg.style.height = `${screen.height}px`
    svg.appendChild(clone)
    host.appendChild(svg)
    doc.body.appendChild(host)

    let bbox = null
    try { bbox = (clone.querySelector('rect') || clone).getBBox() } catch (_error) { bbox = null }
    if (!bbox || bbox.width < 1 || bbox.height < 1) {
      host.remove()
      return null
    }
    svg.setAttribute('viewBox', `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`)
    return host
  }

  function movePreview(drag, x, y) {
    if (!drag?.preview) return
    const offset = fingerOffset()
    const dx = (x - drag.x) + offset.x
    const dy = (y - drag.y) + offset.y
    drag.preview.style.transform = `translate3d(${dx}px,${dy}px,0)`
  }

  function startFeedbackLoop(doc, win, state) {
    if (state.feedbackRaf) win.cancelAnimationFrame(state.feedbackRaf)
    const tick = () => {
      const drag = state.drag
      if (!drag) { state.feedbackRaf = 0; return }
      restoreOriginLayout(doc, drag.originLayout)
      stampOriginGhost(doc, drag.uids)
      const dockKind = activeDockKind(doc, drag, drag.lastX, drag.lastY)
      armBankHover(win, drag, dockKind, doc)
      doc.body.classList.toggle('v2-dock-target', !!drag.bankArmed)
      if (dockKind === 'none') {
        if (fingerMovedFromLatch(drag, drag.lastX, drag.lastY)) {
          edgePan(doc, win, drag.lastX, drag.lastY)
          const visual = visualPoint(drag.lastX, drag.lastY)
          mouse(win, win, 'mousemove', visual.x, visual.y, 1)
        }
      } else {
        mouse(win, win, 'mousemove', drag.x, drag.y, 1)
      }
      movePreview(drag, drag.lastX, drag.lastY)
      state.feedbackRaf = win.requestAnimationFrame(tick)
    }
    state.feedbackRaf = win.requestAnimationFrame(tick)
  }

  function yieldNodeDrag(doc, win, canvas, state) {
    const drag = state.drag
    if (!drag) return
    mouse(win, win, 'mousemove', drag.x, drag.y, 1)
    mouse(win, win, 'mouseup', drag.x, drag.y, 0)
    cleanupDrag(doc, win, state, drag)
    dispatchPointerCancel(canvas, win, drag.pointerId, drag.lastX, drag.lastY)
    endHoldDragSession(win, state)
  }

  function stampOriginGhost(doc, uids) {
    for (const uid of uids || []) nodeByUid(doc, uid)?.classList.add('v2-branch-origin-ghost')
  }

  function freezeTreeLayout(doc, win) {
    if (!win.d3) return
    const svg = doc.getElementById('canvas')
    if (!svg) return
    win.d3.select(svg).selectAll('g.node, path.link').interrupt()
  }

  function captureOriginLayout(doc, uids) {
    return (uids || []).map((uid) => {
      const node = nodeByUid(doc, uid)
      return { uid, transform: node?.getAttribute('transform') || '' }
    })
  }

  function restoreOriginLayout(doc, layout) {
    const win = doc.defaultView
    for (const entry of layout || []) {
      const node = nodeByUid(doc, entry.uid)
      if (!node) continue
      try { win?.d3?.select(node).interrupt() } catch (_error) {}
      if (entry.transform) node.setAttribute('transform', entry.transform)
      node.classList.add('v2-branch-origin-ghost')
    }
  }

  // Hold-drag camera: pan from the finger's offset to the viewport
  // center (not screen-edge bands). Further from center → faster.
  // Dead zone near center so tiny motions do not creep.
  function centerPanVector(x, y, view, C) {
    const dead = C?.PAN_DEAD_PX ?? 56
    const step = C?.PAN_STEP ?? 16
    const cx = (view?.left || 0) + (view?.width || 0) / 2
    const cy = (view?.top || 0) + (view?.height || 0) / 2
    const axis = (offset, half) => {
      const mag = Math.abs(offset)
      if (!half || mag <= dead) return 0
      const span = Math.max(1, half - dead)
      const q = Math.max(0, Math.min(1, (mag - dead) / span))
      return -Math.sign(offset) * step * q * q
    }
    return {
      dx: axis(x - cx, (view?.width || 0) / 2),
      dy: axis(y - cy, (view?.height || 0) / 2),
    }
  }

  function treeContentBounds(doc, win) {
    const core = win.LOGYQBridge?.core
    const cardW = core?.config?.CARD_WIDTH || 140
    const cardH = core?.config?.CARD_HEIGHT || 63
    const nodes = core?.state?.root?.descendants?.() || []
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const node of nodes) {
      if (node?.x == null || node?.y == null) continue
      minX = Math.min(minX, node.x - cardW / 2)
      maxX = Math.max(maxX, node.x + cardW / 2)
      minY = Math.min(minY, node.y - cardH / 2)
      maxY = Math.max(maxY, node.y + cardH / 2)
    }
    if (!Number.isFinite(minX)) return null
    return { minX, maxX, minY, maxY, cardW, cardH }
  }

  // Leash to the *leading* viewport edge (the edge in the pan
  // direction). Stop when that side’s empty band is ~⅓ of the
  // viewport so a drop near the bezel has breathing room.
  // Do not pin the AABB to the opposite / trailing side.
  function clampPanToContent(transform, dx, dy, bounds, view) {
    if (!bounds || !view) return { dx: 0, dy: 0 }
    const k = transform?.k || 1
    const marginX = Math.max(0, (view.width || (view.right - view.left) || 0) / 3)
    const marginY = Math.max(0, (view.height || (view.bottom - view.top) || 0) / 3)
    const x0 = transform?.x || 0
    const y0 = transform?.y || 0
    let nx = x0 + dx
    let ny = y0 + dy
    // Finger-right / content-left → leading edge is the right.
    if (dx < 0) {
      const minNx = view.right - marginX - bounds.maxX * k
      nx = Math.max(nx, Math.min(x0, minNx))
    } else if (dx > 0) {
      // Finger-left / content-right → leading edge is the left.
      const maxNx = view.left + marginX - bounds.minX * k
      nx = Math.min(nx, Math.max(x0, maxNx))
    }
    if (dy < 0) {
      const minNy = view.bottom - marginY - bounds.maxY * k
      ny = Math.max(ny, Math.min(y0, minNy))
    } else if (dy > 0) {
      const maxNy = view.top + marginY - bounds.minY * k
      ny = Math.min(ny, Math.max(y0, maxNy))
    }
    return { dx: nx - x0, dy: ny - y0 }
  }

  function viewRect(doc, win) {
    const box = doc.getElementById('canvas')?.getBoundingClientRect?.()
    if (box && box.width && box.height) {
      return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height }
    }
    return { left: 0, top: 0, right: win.innerWidth, bottom: win.innerHeight, width: win.innerWidth, height: win.innerHeight }
  }

  function edgePan(doc, win, x, y) {
    const svg = doc.getElementById('canvas')
    if (!svg || !win.d3) return false
    const view = viewRect(doc, win)
    let { dx, dy } = centerPanVector(x, y, view, v162Constants())
    if (!dx && !dy) return false
    const t = win.d3.zoomTransform(svg)
    const nextStep = clampPanToContent(t, dx, dy, treeContentBounds(doc, win), view)
    dx = nextStep.dx
    dy = nextStep.dy
    if (!dx && !dy) return false
    const next = win.d3.zoomIdentity.translate(t.x + dx, t.y + dy).scale(t.k)
    svg.__zoom = next
    const root = Array.from(svg.children).find((child) => child.tagName?.toLowerCase() === 'g')
    if (root) root.setAttribute('transform', next.toString())
    return true
  }

  function liftPx() {
    const C = v162Constants()
    return C.OFFSET_UP_CM * C.PX_PER_CM
  }

  function fingerOffset() {
    const C = v162Constants()
    const D = liftPx()
    return { x: C.OFFSET_SIDE_CM * C.PX_PER_CM, y: -D }
  }

  function visualPoint(x, y) {
    const offset = fingerOffset()
    return { x: x + offset.x, y: y + offset.y }
  }

  function fingerMovedFromLatch(drag, x, y) {
    if (!drag) return false
    if (drag.moved) return true
    const x0 = x == null ? drag.lastX : x
    const y0 = y == null ? drag.lastY : y
    drag.moved = Math.hypot(x0 - drag.x, y0 - drag.y) > v162Constants().STILL_PX
    return drag.moved
  }

  function dragMousePoint(drag, x, y) {
    if (!fingerMovedFromLatch(drag, x, y)) return { x: drag.x, y: drag.y }
    return visualPoint(x, y)
  }

  function activeDockKind(doc, drag, x, y) {
    if (!fingerMovedFromLatch(drag, x, y)) return 'none'
    return dockDropKind(doc, x, y)
  }

  function paintCloneCard(clone, source) {
    const label = cardText(source) || source?.__data__?.data?.name || ''
    const color = source?.__data__?.data?.color
    const text = clone.querySelector('text.label') || clone.querySelector('text')
    if (text) {
      if (label) text.textContent = label
      text.style.fill = '#374151'
      text.style.opacity = '1'
    }
    clone.querySelectorAll('rect:not(.grabzone)').forEach((rect) => {
      rect.style.fill = color || '#ffffff'
      rect.style.stroke = '#e2e8f0'
      rect.style.opacity = '1'
    })
  }

  function hitBankChip(doc, x, y) {
    const dock = doc.getElementById('Dock')
    if (!dock || dock.classList.contains('dock-hidden')) return null
    const chips = Array.from(dock.querySelectorAll('.chip'))
    for (const chip of chips) {
      const rect = chip.getBoundingClientRect()
      if (rect.width < 20 || rect.height < 16) continue
      const insetX = Math.max(14, rect.width * 0.28)
      const insetY = Math.max(10, rect.height * 0.28)
      if (x >= rect.left + insetX && x <= rect.right - insetX && y >= rect.top + insetY && y <= rect.bottom - insetY) {
        return chip
      }
    }
    return null
  }

  function armBankHover(win, drag, dockKind, doc) {
    const now = win.performance?.now?.() || Date.now()
    if (dockKind !== 'bank') {
      drag.bankChip = null
      drag.bankSince = 0
      drag.bankArmed = false
      return
    }
    drag.bankChip = hitBankChip(doc, drag.lastX, drag.lastY)
    if (!drag.bankSince) drag.bankSince = now
    drag.bankArmed = (now - drag.bankSince) >= v162Constants().BANK_DWELL_MS
  }

  function dockDropKind(doc, x, y) {
    const dock = doc.getElementById('Dock')
    if (!dock || dock.classList.contains('dock-hidden')) return 'none'
    const rect = dock.getBoundingClientRect()
    if (rect.width < 8 || rect.height < 8) return 'none'
    const inside = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
    if (inside || hitBankChip(doc, x, y)) return 'bank'
    const slack = 28
    if (x >= rect.left - slack && x <= rect.right + slack && y >= rect.top - slack && y <= rect.bottom + slack) return 'near'
    return 'none'
  }

  function sendDragToWordBank(doc, drag) {
    if (!drag?.moved || !fingerMovedFromLatch(drag, drag.lastX, drag.lastY)) return
    const node = nodeByUid(doc, drag?.uid)
    const hierarchy = node?.__data__
    if (!hierarchy || !bridge.core?.treeOps?.sendSubtreeToWordBank) return
    const win = doc.defaultView || window
    win.__logyqHoldDragAllowBank = true
    try {
      bridge.selectByUid(drag.uid)
      bridge.core.treeOps.sendSubtreeToWordBank(hierarchy)
    } finally {
      win.__logyqHoldDragAllowBank = false
    }
  }

  function endHoldDragSession(win, state) {
    win.__logyqHoldDragAllowBank = false
    win.setTimeout(() => {
      if (!state?.drag) win.__logyqHoldDragSession = false
    }, 400)
  }

  function cleanupDrag(doc, win, state, drag) {
    if (!drag) return
    drag.preview?.remove?.()
    for (const uid of drag.uids || []) nodeByUid(doc, uid)?.classList.remove('v2-branch-origin-ghost')
    doc.body.classList.remove('v2-branch-drag', 'v2-cancel', 'v2-dock-target')
    if (state.feedbackRaf) win.cancelAnimationFrame(state.feedbackRaf)
    state.feedbackRaf = 0
    if (state.drag === drag) state.drag = null
    win.setTimeout(() => win.__logyqV2ConsumedPointers.delete(drag.pointerId), 400)
  }

  function flickFastSpeed(C) {
    const cfg = C || v162Constants()
    return cfg.FLICK_MIN / cfg.FLICK_FAST_MS
  }

  function recentSpeedPxPerMs(samples, now, windowMs = 80) {
    if (!samples?.length) return 0
    const last = samples[samples.length - 1]
    let first = last
    for (let i = samples.length - 1; i >= 0; i -= 1) {
      first = samples[i]
      if (now - samples[i].t > windowMs) break
    }
    const dt = last.t - first.t
    if (dt < 16) return 0
    return Math.hypot(last.x - first.x, last.y - first.y) / dt
  }

  // excited → hold / pan / flickish. A straight stroke inside the flick
  // window stays gated even when it starts slow: locking "pan" on the
  // first 48ms made the 2nd down-flick drag the map and then snap it
  // back. Diagonal slides can still pan. After the flick window, pan.
  function classifyCardIntent(dist, elapsed, speed, sawFast, C, dx, dy) {
    const cfg = C || v162Constants()
    if (dist <= cfg.HOLD_SLOP) return 'excited'
    if (elapsed >= cfg.FLICK_MAX_MS) return 'pan'
    if (sawFast || speed >= flickFastSpeed(cfg)) return 'flickish'
    if (dx != null && dy != null && elapsed <= cfg.FLICK_MAX_MS) {
      const major = Math.max(Math.abs(dx), Math.abs(dy))
      const minor = Math.max(1, Math.min(Math.abs(dx), Math.abs(dy)))
      if (major / minor >= cfg.FLICK_RATIO) return 'flickish'
    }
    if (elapsed >= 48) return 'pan'
    return 'excited'
  }

  function beginCardRace(doc, win, state, event) {
    const now = win.performance.now()
    state.race = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      t0: now,
      samples: [{ t: now, x: event.clientX, y: event.clientY }],
      mode: 'excited',
      sawFast: false,
      view: captureView(doc, win),
    }
    win.__logyqSuppressZoom = true
    stopZoomGesture(doc)
  }

  function resolveCardRace(doc, win, state, event) {
    const race = state.race
    if (!race || race.mode === 'drag') return
    const now = win.performance.now()
    race.samples.push({ t: now, x: event.clientX, y: event.clientY })
    if (race.samples.length > 24) race.samples.splice(0, race.samples.length - 24)
    const dx = event.clientX - race.x
    const dy = event.clientY - race.y
    const dist = Math.hypot(dx, dy)
    const elapsed = now - race.t0
    const speed = recentSpeedPxPerMs(race.samples, now)
    if (speed >= flickFastSpeed()) race.sawFast = true
    const intent = classifyCardIntent(dist, elapsed, speed, race.sawFast, null, dx, dy)
    if (intent === 'flickish') {
      if (race.mode === 'pan' || state.pan) {
        restoreView(doc, win, race.view)
        state.pan = null
      }
      race.mode = 'flickish'
      win.__logyqSuppressZoom = true
      stopZoomGesture(doc)
      return
    }
    if (intent !== 'pan') return
    if (race.mode === 'pan') return
    race.mode = 'pan'
    win.__logyqSuppressZoom = false
    win.__logyqHoldArming = false
    cancelHold(win, state)
    state.pan = { pointerId: race.pointerId, lastX: event.clientX, lastY: event.clientY }
  }

  function clearCardRace(win, state) {
    state.race = null
    win.__logyqSuppressZoom = false
  }

  function cancelHold(win, state) {
    const hold = state.hold
    if (!hold) return
    if (hold.timer) win.clearTimeout(hold.timer)
    state.hold = null
    if (!state.pan) win.__logyqHoldArming = false
  }

  function beginCardPan(doc, win, state, hold, x, y) {
    const originX = hold.x
    const originY = hold.y
    const pointerId = hold.pointerId
    cancelHold(win, state)
    state.pan = { pointerId, lastX: originX, lastY: originY }
    win.__logyqHoldArming = false
    applyFingerPan(doc, win, state.pan, x, y)
  }

  function endCardPan(win, state) {
    state.pan = null
    if (!state.hold) win.__logyqHoldArming = false
  }

  function stopZoomGesture(doc) {
    const svg = doc.getElementById('canvas')
    const gesture = svg?.__zooming
    if (!gesture) return
    try {
      gesture.active = 1
      gesture.end()
    } catch (_error) {
      try { delete svg.__zooming } catch (_inner) {}
    }
    if (bridge.core?.state) bridge.core.state.isPanning = false
  }

  function applyFingerPan(doc, win, pan, x, y) {
    const svg = doc.getElementById('canvas')
    if (!svg || !win.d3 || !pan) return
    const dx = x - pan.lastX
    const dy = y - pan.lastY
    pan.lastX = x
    pan.lastY = y
    if (!dx && !dy) return
    const t = win.d3.zoomTransform(svg)
    const next = win.d3.zoomIdentity.translate(t.x + dx, t.y + dy).scale(t.k)
    svg.__zoom = next
    const root = Array.from(svg.children).find((child) => child.tagName?.toLowerCase() === 'g')
    if (root) root.setAttribute('transform', next.toString())
  }

  function dispatchPointerCancel(canvas, win, pointerId, x, y) {
    try {
      canvas.dispatchEvent(new win.PointerEvent('pointercancel', {
        bubbles: true,
        cancelable: true,
        pointerType: 'touch',
        pointerId,
        isPrimary: true,
        clientX: x,
        clientY: y,
      }))
    } catch (_error) {}
  }

  function onFlickDown(event, doc, win, state) {
    if (event.pointerType === 'mouse') return

    if (preview.paint?.open) preview.paint.closeStrip?.()

    const alreadyActive = state.active.size > 0
    if (alreadyActive) state.candidates.forEach((candidate) => { candidate.multi = true })
    state.active.add(event.pointerId)

    const uid = nodeUid(hitNode(doc, event.clientX, event.clientY, event))
    if (!uid) hardClearBackground(doc, win, { keepStroke: true })
    state.candidates.set(event.pointerId, {
      uid,
      x: event.clientX,
      y: event.clientY,
      started: win.performance.now(),
      multi: alreadyActive,
      moved: false,
      view: captureView(doc, win),
    })
  }

  function onFlickUp(event, doc, win, state) {
    state.active.delete(event.pointerId)
    const candidate = state.candidates.get(event.pointerId)
    state.candidates.delete(event.pointerId)

    if (win.__logyqV2ConsumedPointers.has(event.pointerId)) {
      win.__logyqV2ConsumedPointers.delete(event.pointerId)
      state.lastTap = null
      return
    }
    if (!candidate || candidate.multi) {
      state.lastTap = null
      return
    }

    const dx = event.clientX - candidate.x
    const dy = event.clientY - candidate.y
    const elapsed = win.performance.now() - candidate.started
    if (Math.hypot(dx, dy) > v162Constants().TAP_MOVE) candidate.moved = true

    // Paint vs create: tap is short+stationary (not pan). Flick-down paints a
    // branch only while a palette color is active. Left/right/up still create.
    // Hold-to-drag move is not paint. Double-tap edit still wins on tap 2.
    if (candidate.uid && isFlick(dx, dy, elapsed)) {
      const direction = flickDirection(dx, dy)
      if (paintFlickDown(direction)) {
        state.lastTap = null
        win.requestAnimationFrame(() => {
          restoreView(doc, win, candidate.view)
          bridge.paintBranch(candidate.uid, preview.paint.color)
          win.navigator.vibrate?.(16)
        })
        return
      }
      state.lastTap = null
      clearCardMic(state.mic)
      win.requestAnimationFrame(() => {
        restoreView(doc, win, candidate.view)
        const createdUid = bridge.createRelative(direction, candidate.uid)
        if (!createdUid) return
        restoreView(doc, win, candidate.view)
        bridge.selectByUid(createdUid)
        clearCardMic(state.mic)
        win.requestAnimationFrame(() => {
          restoreView(doc, win, candidate.view)
          clearCardMic(state.mic)
        })
        win.navigator.vibrate?.(16)
      })
      return
    }

    if (candidate.moved) {
      state.lastTap = null
      return
    }

    // Stationary tap keeps the pointerdown card. Re-hit on up is how a
    // mid-tween parent/root visual stole the editor from a new blank.
    const uid = (!candidate.moved && candidate.uid)
      || uidFromTouchedNode(event)
      || hitEditUid(doc, event.clientX, event.clientY, event)
    const node = uid ? nodeByUid(doc, uid) : null
    if (!uid) {
      hardClearBackground(doc, win, { keepStroke: true })
      smiteSetArm(doc, null)
      return
    }

    const now = win.performance.now()
    if (state.lastTap?.uid === uid && now - state.lastTap.time <= v162Constants().DOUBLE_TAP_MS) {
      state.lastTap = null
      clearCardMic(state.mic)
      smiteSetArm(doc, null)
      bridge.editSelected({ uid })
      return
    }

    if (paintTap()) {
      bridge.paintUid(uid, preview.paint.color)
      state.lastTap = { uid, time: now }
      clearCardMic(state.mic)
      return
    }

    state.lastTap = { uid, time: now }
    if (blank(node)) armBlankCardMic(state.mic, doc, uid)
    else clearCardMic(state.mic)
    const live = preview.gestures?.smite
    if (!live || !smiteOwnsUid(live, uid)) smiteSetArm(doc, uid)
  }

  function onFlickClear(event, win, state) {
    state.active.delete(event.pointerId)
    state.candidates.delete(event.pointerId)
    win.__logyqV2ConsumedPointers.delete(event.pointerId)
  }

  function isFlick(dx, dy, elapsed) {
    const C = v162Constants()
    const major = Math.max(Math.abs(dx), Math.abs(dy))
    const minor = Math.max(1, Math.min(Math.abs(dx), Math.abs(dy)))
    return elapsed <= C.FLICK_MAX_MS && Math.hypot(dx, dy) >= C.FLICK_MIN && major / minor >= C.FLICK_RATIO
  }

  function flickDirection(dx, dy) {
    return Math.abs(dx) > Math.abs(dy)
      ? (dx < 0 ? 'left' : 'right')
      : (dy < 0 ? 'up' : 'down')
  }

  function paintActive() {
    return !!preview.paint?.active
  }

  function paintFlickDown(direction) {
    return paintActive() && direction === 'down'
  }

  function paintTap() {
    return paintActive()
  }

  function nodeUid(node) {
    return node?.__data__?.data?._uid || node?.getAttribute?.('data-uid') || null
  }

  function nodeByUid(doc, uid) {
    return Array.from(doc.querySelectorAll('svg#canvas g.node')).find((node) => nodeUid(node) === uid) || null
  }

  function cardFaceRect(node) {
    const vis = node?.querySelector?.('rect:not(.grabzone):not(.logyq-smite-wash):not(.logyq-smite-glow):not(.logyq-edit-focus)')
    return vis?.getBoundingClientRect?.() || node?.getBoundingClientRect?.() || null
  }

  function pointInRect(rect, x, y) {
    return !!rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
  }

  function rankCardHits(hits, x, y) {
    const rows = (hits || []).filter((hit) => hit && (hit.onFace || hit.onBox))
    const pool = rows.some((hit) => hit.onFace) ? rows.filter((hit) => hit.onFace) : rows
    return pool.slice().sort((a, b) => {
      const depth = (b.depth || 0) - (a.depth || 0)
      if (depth) return depth
      const ad = Math.hypot(x - (a.cx || 0), y - (a.cy || 0))
      const bd = Math.hypot(x - (b.cx || 0), y - (b.cy || 0))
      return ad - bd
    })
  }

  function uidFromHost(host) {
    return host?.__data__?.data?._uid || host?.getAttribute?.('data-uid') || nodeUid(host) || null
  }

  function uidFromTouchedNode(event) {
    if (event?.__logyqUid != null && String(event.__logyqUid) !== '') return event.__logyqUid
    const path = typeof event?.composedPath === 'function' ? event.composedPath() : []
    const nodes = path.length ? path : (event?.target ? [event.target] : [])
    for (const item of nodes) {
      if (!item || item === item.window || item === item.document) continue
      const host = (item.classList?.contains?.('hit-slot') || item.classList?.contains?.('node'))
        ? item
        : item.closest?.('g.hit-slot, g.node')
      const uid = uidFromHost(host)
      if (uid != null && String(uid) !== '') {
        event.__logyqUid = uid
        return uid
      }
    }
    return null
  }

  function uidFromEvent(event) {
    return uidFromTouchedNode(event)
  }

  function uidFromPoint(doc, x, y) {
    const stack = typeof doc.elementsFromPoint === 'function' ? doc.elementsFromPoint(x, y) : []
    for (const el of stack) {
      const host = el?.closest?.('g.hit-slot, g.node')
      const uid = uidFromHost(host)
      if (uid) return uid
    }
    return null
  }

  // Mid-tween painted cards sit over reserved slots. Identity is the
  // touched node's datum / data-uid, then the reserved layout slot —
  // never a sliding parent/root visual under the finger.
  function uidFromVisualPoint(doc, x, y) {
    const stack = typeof doc.elementsFromPoint === 'function' ? doc.elementsFromPoint(x, y) : []
    for (const el of stack) {
      const host = el?.closest?.('g.node')
      const uid = uidFromHost(host)
      if (uid) return uid
    }
    return null
  }

  function hitEditUid(doc, x, y, event) {
    return uidFromTouchedNode(event)
      || uidFromEvent(event)
      || nodeUid(hitLayoutSlot(doc, x, y))
      || uidFromPoint(doc, x, y)
      || uidFromVisualPoint(doc, x, y)
  }

  function canvasView(doc) {
    const svg = doc.getElementById('canvas')
    if (!svg) return null
    const rect = svg.getBoundingClientRect()
    const win = doc.defaultView
    const t = win?.d3?.zoomTransform?.(svg) || svg.__zoom || { x: 0, y: 0, k: 1 }
    const root = svg.querySelector(':scope > g') || svg.querySelector('g')
    return {
      left: rect.left,
      top: rect.top,
      x: t.x || 0,
      y: t.y || 0,
      k: t.k || 1,
      ctm: root?.getScreenCTM?.() || null,
    }
  }

  function layoutFaceRect(node, view) {
    const d = node?.__data__
    if (!d || !Number.isFinite(d.x) || !Number.isFinite(d.y)) return null
    const cfg = (typeof window !== 'undefined' && window.LOGYQBridge?.core?.config) || {}
    const w = cfg.CARD_WIDTH || 140
    const h = cfg.CARD_HEIGHT || 63
    if (view?.ctm && typeof DOMPoint === 'function') {
      const c = new DOMPoint(d.x, d.y).matrixTransform(view.ctm)
      const tl = new DOMPoint(d.x - w / 2, d.y - h / 2).matrixTransform(view.ctm)
      const br = new DOMPoint(d.x + w / 2, d.y + h / 2).matrixTransform(view.ctm)
      return {
        left: Math.min(tl.x, br.x),
        right: Math.max(tl.x, br.x),
        top: Math.min(tl.y, br.y),
        bottom: Math.max(tl.y, br.y),
        cx: c.x,
        cy: c.y,
      }
    }
    if (!view) return null
    const cx = view.left + view.x + d.x * view.k
    const cy = view.top + view.y + d.y * view.k
    const hw = (w / 2) * view.k
    const hh = (h / 2) * view.k
    return { left: cx - hw, right: cx + hw, top: cy - hh, bottom: cy + hh, cx, cy }
  }

  function hitLayoutSlot(doc, x, y) {
    const view = canvasView(doc)
    if (!view) return null
    const scored = Array.from(doc.querySelectorAll('svg#canvas g.node')).map((node) => {
      const slot = layoutFaceRect(node, view)
      if (!pointInRect(slot, x, y)) return null
      return {
        node,
        onFace: true,
        onBox: true,
        depth: node.__data__?.depth ?? 0,
        cx: slot.cx,
        cy: slot.cy,
      }
    }).filter(Boolean)
    return rankCardHits(scored, x, y)[0]?.node || null
  }

  function hitVisualNode(doc, x, y) {
    const scored = Array.from(doc.querySelectorAll('svg#canvas g.node')).map((node) => {
      const face = cardFaceRect(node)
      const box = node.getBoundingClientRect()
      const onFace = pointInRect(face, x, y)
      const onBox = pointInRect(box, x, y)
      if (!onFace && !onBox) return null
      return {
        node,
        onFace,
        onBox,
        depth: node.__data__?.depth ?? 0,
        cx: face ? (face.left + face.right) / 2 : 0,
        cy: face ? (face.top + face.bottom) / 2 : 0,
      }
    }).filter(Boolean)
    return rankCardHits(scored, x, y)[0]?.node || null
  }

  function faceUnderFinger(event) {
    const target = event?.target
    if (!target || typeof target.closest !== 'function') return null
    if (target.closest('g.hit-slot, .node-edit-stack')) return null
    const painted = target.closest('rect, text')
    if (!painted || painted.classList?.contains('grabzone')) return null
    return painted.closest('g.node') || null
  }

  function hitNode(doc, x, y, event) {
    // The painted face under the finger is that card. A hit-slot or grab
    // zone can name a neighbor, so those fall through to the face geometry.
    const face = faceUnderFinger(event)
    if (face) return face
    const visual = hitVisualNode(doc, x, y)
    if (visual) return visual
    const uid = hitEditUid(doc, x, y, event)
    if (uid) return nodeByUid(doc, uid) || null
    return null
  }

  function cardText(node) {
    const data = node?.__data__?.data || {}
    for (const key of ['label', 'text', 'name', 'title', 'value']) {
      if (typeof data[key] === 'string' && data[key].trim()) return data[key].trim()
    }
    return Array.from(node?.querySelectorAll?.('text') || [])
      .map((element) => element.textContent?.trim() || '')
      .filter(Boolean)
      .join(' ')
      .trim()
  }

  function blank(node) {
    const text = cardText(node).toLowerCase()
    return !text || ['new', 'new card', 'untitled', '…', '...'].includes(text)
  }

  function ensureCardMic(doc, win) {
    if (preview.gestures?.cardMic) return preview.gestures.cardMic
    const button = doc.createElement('button')
    button.id = 'logyq-v162-action'
    button.type = 'button'
    button.textContent = 'MIC'
    button.setAttribute('aria-label', 'Record card')
    doc.body.appendChild(button)
    const mic = {
      button,
      actionUid: null,
      recorder: null,
      recordingUid: null,
      recordingStream: null,
      chunks: [],
      raf: 0,
    }
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault()
      event.stopImmediatePropagation()
    }, { passive: false })
    button.addEventListener('click', async (event) => {
      event.preventDefault()
      event.stopImmediatePropagation()
      if (!mic.actionUid) return
      if (mic.recorder) stopCardRecording(mic)
      else await startCardRecording(win, mic, mic.actionUid)
    })
    const tick = () => {
      const uid = mic.recordingUid || mic.actionUid
      const node = uid ? nodeByUid(doc, uid) : null
      const rect = node?.getBoundingClientRect()
      const editing = !!doc.querySelector('.node-edit-input')
      const onScreen = rect && rect.width > 1 && rect.height > 1 && rect.right > 0 && rect.left < win.innerWidth && rect.bottom > 0 && rect.top < win.innerHeight
      if (onScreen && !editing) {
        const fitsRight = rect.right + 46 <= win.innerWidth
        const left = fitsRight ? rect.right + 5 : rect.left - 45
        button.style.left = `${Math.max(4, Math.min(win.innerWidth - 44, left))}px`
        button.style.top = `${Math.max(4, Math.min(win.innerHeight - 44, rect.top + Math.max(0, (rect.height - 40) / 2)))}px`
        button.classList.add('show')
        button.classList.toggle('rec', !!mic.recorder)
        button.textContent = mic.recorder ? '■' : 'MIC'
        button.setAttribute('aria-label', mic.recorder ? 'Stop recording' : 'Record card')
      } else {
        button.classList.remove('show')
      }
      mic.raf = win.requestAnimationFrame(tick)
    }
    mic.raf = win.requestAnimationFrame(tick)
    if (preview.gestures) preview.gestures.cardMic = mic
    return mic
  }

  function armBlankCardMic(mic, doc, uid) {
    if (!mic || !uid) return
    const node = nodeByUid(doc, uid)
    if (node && !blank(node)) {
      if (!mic.recorder) mic.actionUid = null
      return
    }
    mic.actionUid = uid
  }

  function clearCardMic(mic) {
    if (!mic || mic.recorder) return
    mic.actionUid = null
  }

  async function startCardRecording(win, mic, uid) {
    if (mic.recorder || app.recorder) return
    if (!win.navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      showMobileToast('Voice recording is unavailable')
      return
    }
    const pin = await getPin(true)
    if (!pin) return
    try {
      const stream = await win.navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      mic.recorder = recorder
      mic.recordingUid = uid
      mic.recordingStream = stream
      mic.chunks = []
      recorder.addEventListener('dataavailable', (event) => { if (event.data?.size) mic.chunks.push(event.data) })
      recorder.addEventListener('stop', () => transcribeCardRecording(win, mic, recorder, pin), { once: true })
      recorder.start()
      win.navigator.vibrate?.(10)
      showMobileToast('Recording… tap MIC to stop')
    } catch (_error) {
      showMobileToast('Microphone permission is needed')
    }
  }

  function stopCardRecording(mic) {
    if (mic.recorder && mic.recorder.state !== 'inactive') mic.recorder.stop()
  }

  async function transcribeCardRecording(win, mic, recorder, pin) {
    const uid = mic.recordingUid
    const chunks = mic.chunks.slice()
    mic.recordingStream?.getTracks?.().forEach((track) => track.stop())
    mic.recordingStream = null
    mic.chunks = []
    try {
      const audio = new win.Blob(chunks, { type: recorder?.mimeType || 'audio/webm' })
      const form = new win.FormData()
      form.append('audio', audio, 'logyq-card.webm')
      const response = await win.fetch('/api/transcribe', { method: 'POST', headers: { 'x-review-pin': pin }, body: form })
      const result = await response.json()
      if (!response.ok || !result?.text?.trim()) {
        if (response.status === 401 || response.status === 403) forgetPin()
        throw new Error('transcribe')
      }
      const text = result.text.trim()
      bridge.renameNode(uid, text)
      mic.actionUid = null
      showMobileToast(`Added “${text}”`)
    } catch (_error) {
      mic.actionUid = uid
      showMobileToast('Could not transcribe — card left blank')
    } finally {
      mic.recorder = null
      mic.recordingUid = null
    }
  }

  function captureView(doc, win) {
    const svg = doc.getElementById('canvas')
    if (!svg || !win.d3) return null
    const transform = win.d3.zoomTransform(svg)
    return { x: transform.x, y: transform.y, k: transform.k }
  }

  function restoreView(doc, win, view) {
    if (!view || !win.d3) return
    const svg = doc.getElementById('canvas')
    if (!svg) return
    const transform = win.d3.zoomIdentity.translate(view.x, view.y).scale(view.k)
    svg.__zoom = transform
    const root = Array.from(svg.children).find((child) => child.tagName?.toLowerCase() === 'g')
    if (root) root.setAttribute('transform', transform.toString())
  }

  const SMITE_PARK_SLOP = 18
  const SMITE_BUFFER_MS = 3000
  const SMITE_DRAIN_MS = 12000
  const SMITE_START_MS = SMITE_BUFFER_MS + SMITE_DRAIN_MS
  const SMITE_MAX_MS = SMITE_START_MS
  const SMITE_FULL_MS = SMITE_DRAIN_MS
  const SMITE_REFILL_MS = 1000
  const SMITE_TRIGGER_DY = 36
  const SMITE_SCAR_HOLD_MS = 2800
  const SMITE_SCAR_FADE_MS = 7200

  function bindSmiteGestures(doc, win, canvas, holdState) {
    if (!canvas || canvas.dataset.logyqSmite === '1') return
    canvas.dataset.logyqSmite = '1'
    const smite = {
      pointers: new Map(),
      pair: false,
      pinched: false,
      pinch: null,
      mercy: null,
      // One entry per doomed branch of this map.
      mercies: [],
      scars: [],
      raf: 0,
    }
    if (preview.gestures) preview.gestures.smite = smite

    const onCanvas = (event) => event.target === canvas || canvas.contains(event.target)
    const ignore = (event) => {
      if (event.pointerType === 'mouse') return true
      if (bridge.core?.input?.isTextField?.(event.target)) return true
      if (doc.querySelector('.logiq-backdrop.is-open')) return true
      return false
    }

    win.addEventListener('pointerdown', (event) => {
      if (ignore(event) || !onCanvas(event)) return
      if (smite.pointers.size > 0) smite.pair = true
      const source = hitNode(doc, event.clientX, event.clientY, event)
      const uid = nodeUid(source)
      smite.pointers.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        t0: win.performance?.now?.() || Date.now(),
        view: captureView(doc, win),
        uid,
      })
      if (smiteOwnsUid(smite, uid) && holdState) cancelHold(win, holdState)
      if (smite.pointers.size >= 2) smiteHoldTwoFingers(doc, win, smite, holdState)
      smiteSetInteracting(win, smite, true)
    }, true)

    win.addEventListener('pointermove', (event) => {
      const pointer = smite.pointers.get(event.pointerId)
      if (!pointer) return
      pointer.lastX = event.clientX
      pointer.lastY = event.clientY
      if (smite.pointers.size >= 2) win.__logyqSuppressZoom = true
      let moved = 0
      smite.pointers.forEach((finger) => {
        if (smiteFingerMoved(finger, SMITE_PARK_SLOP)) moved += 1
      })
      if (smite.pointers.size >= 2 && moved >= 2) {
        smite.pinched = true
        smiteRefresh(doc, smite)
        smiteApplyPinch(doc, win, smite)
        return
      }
      if (smite.pointers.size >= 2) smite.pinch = null
      smitePaintPreview(doc, win, smite)
    }, true)

    win.addEventListener('pointerup', (event) => {
      const pointer = smite.pointers.get(event.pointerId)
      if (!pointer) return
      pointer.lastX = event.clientX
      pointer.lastY = event.clientY
      const paired = smite.pair
      let handled = false
      if (!smite.pinched) handled = smiteMercyUp(doc, win, smite, pointer)
      if (!handled && !smite.pinched && !paired) handled = smiteTryArmSwipe(doc, win, smite, pointer)
      if (!handled && !smite.pinched) handled = smiteTryCast(doc, win, smite, pointer, event.pointerId)
      smite.pointers.delete(event.pointerId)
      if (handled || paired) win.__logyqV2ConsumedPointers.add(event.pointerId)
      smiteReleaseZoom(win, smite)
      smiteRefresh(doc, smite)
      if (smite.pointers.size === 0) {
        smite.pair = false
        smite.pinched = false
        smiteSetInteracting(win, smite, false)
      } else {
        smiteSetInteracting(win, smite, true)
      }
    }, true)

    win.addEventListener('pointercancel', (event) => {
      if (!smite.pointers.has(event.pointerId)) return
      smite.pointers.delete(event.pointerId)
      smiteReleaseZoom(win, smite)
      if (smite.pointers.size === 0) {
        smite.pair = false
        smite.pinched = false
        smiteSetInteracting(win, smite, false)
      }
      smiteRefresh(doc, smite)
    }, true)

    doc.addEventListener('click', (event) => {
      if (event.target?.closest?.('[data-tool="undo"], #undoBtn')) clearSmiteScars(doc, smite)
    }, true)
    win.addEventListener('keydown', (event) => {
      if (bridge.core?.input?.isTextField?.(event.target)) return
      if (doc.querySelector('.logiq-backdrop.is-open, #settingsBackdrop.show')) return
      if ((event.key || '').toLowerCase() === 'u') clearSmiteScars(doc, smite)
    }, true)
  }

  function smiteFingerMoved(pointer, slop) {
    return Math.hypot(pointer.lastX - pointer.x, pointer.lastY - pointer.y) > slop
  }

  // Two fingers block the map zoom until both of them are actually moving.
  // A parked thumb stays a Smite cast, not a pinch.
  function smiteHoldTwoFingers(doc, win, smite, holdState) {
    smite.pinch = null
    if (holdState) {
      cancelHold(win, holdState)
      holdState.pan = null
      holdState.race = null
      win.__logyqHoldArming = false
    }
    win.__logyqSuppressZoom = true
    stopZoomGesture(doc)
  }

  function smiteReleaseZoom(win, smite) {
    if (smite.pointers.size >= 2) return
    win.__logyqSuppressZoom = false
    smite.pinch = null
  }

  function smiteApplyPinch(doc, win, smite) {
    const fingers = Array.from(smite.pointers.values())
    if (fingers.length < 2 || !win.d3) return
    const a = fingers[0]
    const b = fingers[1]
    const dist = Math.hypot(a.lastX - b.lastX, a.lastY - b.lastY)
    const midX = (a.lastX + b.lastX) / 2
    const midY = (a.lastY + b.lastY) / 2
    const prev = smite.pinch
    smite.pinch = { dist, midX, midY }
    if (!prev || prev.dist < 1 || dist < 1) return
    const svg = doc.getElementById('canvas')
    if (!svg) return
    const t = win.d3.zoomTransform(svg)
    const k = Math.max(0.02, Math.min(2.4, t.k * (dist / prev.dist)))
    const applied = t.k ? k / t.k : 1
    const nextX = midX - applied * (prev.midX - t.x)
    const nextY = midY - applied * (prev.midY - t.y)
    const next = win.d3.zoomIdentity.translate(nextX, nextY).scale(k)
    svg.__zoom = next
    const root = Array.from(svg.children).find((child) => child.tagName?.toLowerCase() === 'g')
    if (root) root.setAttribute('transform', next.toString())
  }

  function smiteOwnsUid(smite, uid) {
    if (!uid) return false
    return (smite.mercies || []).some((mercy) => mercy.marks?.has?.(uid))
  }

  function smiteDropMercy(smite, mercy) {
    smite.mercies = (smite.mercies || []).filter((item) => item !== mercy)
    if (smite.mercy === mercy) smite.mercy = smite.mercies[smite.mercies.length - 1] || null
  }

  function smiteActiveLayers(smite, skip) {
    return (smite.mercies || []).filter((mercy) => mercy && !mercy.committing && !(skip && skip.has(mercy))).map((mercy) => ({
      marks: mercy.marks,
      fraction: smiteRingFraction(mercy.remaining, SMITE_FULL_MS),
      castUid: mercy.castUid,
      tone: mercy.direction === 'left' ? 'amber' : 'red',
    }))
  }

  function smiteRefresh(doc, smite, extra, skip) {
    const layers = smiteActiveLayers(smite, skip)
    if (extra?.marks) layers.push(extra)
    if (!layers.length) {
      clearSmiteClocks(doc)
      paintSmiteArm(doc, smite.armed)
      paintEditFocus(doc, smite.editUid)
      return
    }
    paintSmiteLayers(doc, layers)
    paintSmiteArm(doc, smite.armed)
    paintEditFocus(doc, smite.editUid)
  }

  function paintSmiteArm(doc, uid) {
    doc.querySelectorAll('svg#canvas g.node[data-smite-arm="1"]').forEach((node) => {
      if (nodeUid(node) === uid) return
      delete node.dataset.smiteArm
      if (node.dataset.smiteClock === '1') return
      const wash = node.querySelector('rect.logyq-smite-wash')
      if (wash && wash.dataset.smiteOutline !== 'ants') wash.remove()
      if (!node.dataset.smiteClock && !node.querySelector('rect.logyq-smite-wash')) delete node.dataset.smiteHeat
    })
    if (!uid) return
    const node = nodeByUid(doc, uid)
    if (!node) return
    if (node.dataset.smiteClock === '1') {
      delete node.dataset.smiteArm
      return
    }
    const wash = node.querySelector('rect.logyq-smite-wash')
    if (node.dataset.smiteHeat === '1' && wash && wash.dataset.smiteOutline === 'ants') {
      delete node.dataset.smiteArm
      return
    }
    const face = smiteFace(node)
    if (!face) return
    const box = smiteFaceBox(face)
    smitePaintCard(node, smiteArmChrome(), box.rx, box.ry)
    node.dataset.smiteArm = '1'
  }

  // Rename focus uses the same calm green outline as an armed card.
  // It is not a Smite arm, so a swipe still needs a separate tap.
  function paintEditFocus(doc, uid) {
    doc.querySelectorAll('svg#canvas g.node[data-edit-focus="1"]').forEach((node) => {
      if (uid && nodeUid(node) === uid) return
      delete node.dataset.editFocus
      node.querySelectorAll('rect.logyq-edit-focus').forEach((el) => el.remove())
    })
    if (!uid) return
    const node = nodeByUid(doc, uid)
    if (!node) return
    if (node.dataset.smiteClock === '1') {
      delete node.dataset.editFocus
      node.querySelectorAll('rect.logyq-edit-focus').forEach((el) => el.remove())
      return
    }
    const face = smiteFace(node)
    if (!face) return
    const box = smiteFaceBox(face)
    const chrome = smiteArmChrome()
    let ring = node.querySelector('rect.logyq-edit-focus')
    if (!ring) {
      ring = doc.createElementNS('http://www.w3.org/2000/svg', 'rect')
      ring.setAttribute('class', 'logyq-edit-focus')
      ring.setAttribute('pointer-events', 'none')
      face.insertAdjacentElement('afterend', ring)
    }
    ring.setAttribute('x', face.getAttribute('x') || '0')
    ring.setAttribute('y', face.getAttribute('y') || '0')
    ring.setAttribute('width', face.getAttribute('width') || '0')
    ring.setAttribute('height', face.getAttribute('height') || '0')
    ring.setAttribute('rx', String(box.rx))
    ring.setAttribute('ry', String(box.ry))
    ring.setAttribute('fill', chrome.fill)
    ring.setAttribute('stroke', chrome.stroke)
    ring.style.fill = 'none'
    ring.style.stroke = chrome.stroke
    ring.style.strokeWidth = '3.5px'
    ring.style.animation = 'none'
    ring.style.filter = 'none'
    node.dataset.editFocus = '1'
  }

  function smiteEnsureTick(doc, win, smite) {
    if (smite.ticking || smite.raf) return
    if (!(smite.mercies || []).some((mercy) => mercy && !mercy.committing)) return
    smite.raf = win.requestAnimationFrame(() => smiteTick(doc, win, smite))
  }

  function smiteSetInteracting(win, smite, on) {
    const now = win.performance?.now?.() || Date.now()
    for (const mercy of smite.mercies || []) {
      if (!mercy || mercy.committing) continue
      if (mercy.interacting && !on) mercy.lastTick = now
      mercy.interacting = !!on
    }
  }

  function smiteLiveData(uid) {
    const root = bridge.core?.state?.root
    if (!root?.descendants || uid == null) return null
    const node = root.descendants().find((item) => item?.data?._uid === uid)
    return node?.data || null
  }

  function smiteToast(text) {
    try { bridge.core?.selection?.showToast?.(text, 1100) } catch (_error) {}
  }

  function smiteZoneWord(zone) {
    if (zone === 'top') return 'parent'
    if (zone === 'bottom') return 'kids'
    return 'family'
  }

  function smitePaintPreview(doc, win, smite) {
    if (smite.pinched || smite.pointers.size !== 2) {
      smiteRefresh(doc, smite)
      return
    }
    const fingers = Array.from(smite.pointers.values())
    const moved = fingers.filter((finger) => smiteFingerMoved(finger, SMITE_PARK_SLOP))
    const parked = fingers.filter((finger) => !smiteFingerMoved(finger, SMITE_PARK_SLOP))
    if (moved.length !== 1 || parked.length !== 1 || !moved[0].uid) {
      smiteRefresh(doc, smite)
      return
    }
    const swipe = moved[0]
    const direction = smiteCastDirection(swipe.lastX - swipe.x, swipe.lastY - swipe.y, v162Constants().FLICK_MIN)
    if (!direction) {
      smiteRefresh(doc, smite)
      return
    }
    const data = smiteLiveData(swipe.uid)
    if (!data) return
    const tone = direction === 'left' ? 'amber' : 'red'
    const ids = smiteAffected(data, smiteZone(parked[0].y, win.innerHeight))
    if (!ids.length) {
      smiteRefresh(doc, smite)
      return
    }
    const plan = smiteFoldCast(smite.mercies, ids, tone)
    if (plan.action === 'block') {
      smiteRefresh(doc, smite)
      return
    }
    smiteRefresh(doc, smite, { marks: plan.marks, fraction: 1, castUid: swipe.uid, tone }, new Set(plan.absorb))
  }

  function smiteSetArm(doc, uid) {
    const live = preview.gestures?.smite
    if (!live) return
    live.armed = uid || null
    smiteRefresh(doc, live)
  }

  function smiteTryArmSwipe(doc, win, smite, pointer) {
    if (!smite.armed || !pointer) return false
    const dx = pointer.lastX - pointer.x
    const dy = pointer.lastY - pointer.y
    const elapsed = (win.performance?.now?.() || Date.now()) - (pointer.t0 || 0)
    if (!isFlick(dx, dy, elapsed)) return false
    const direction = smiteArmDirection(dx, dy, v162Constants().FLICK_MIN)
    if (!direction) return false
    const data = smiteLiveData(smite.armed)
    const childIds = smiteChildList(data).map(smiteNodeId).filter(Boolean)
    const target = smiteArmTarget(smite.armed, pointer.uid, childIds)
    if (!target) return false
    const ids = smiteArmScope(data, target, direction)
    if (!ids.length) return false
    const flick = preview.gestures?.session?.flick
    if (flick) flick.lastTap = null
    const tone = direction === 'left' ? 'amber' : 'red'
    const plan = smiteFoldCast(smite.mercies, ids, tone)
    if (plan.action === 'block') {
      smiteRefresh(doc, smite)
      return true
    }
    if (pointer.view) restoreView(doc, win, pointer.view)
    for (const mercy of plan.absorb) smiteDropMercy(smite, mercy)
    const castUid = smite.armed
    const zone = target === 'child' ? 'bottom' : (direction === 'up' ? 'top' : 'middle')
    smite.armed = null
    beginSmiteMercy(doc, win, smite, {
      uid: castUid,
      zone,
      direction: direction === 'left' ? 'left' : 'down',
      marks: plan.marks,
    })
    return true
  }

  function smiteTryCast(doc, win, smite, pointer, pointerId) {
    if (smite.pinched || !pointer?.uid) return false
    const others = []
    smite.pointers.forEach((finger, id) => { if (id !== pointerId) others.push(finger) })
    if (others.length !== 1 || smiteFingerMoved(others[0], SMITE_PARK_SLOP)) return false
    if (!smiteFingerMoved(pointer, SMITE_PARK_SLOP)) return false
    const direction = smiteCastDirection(pointer.lastX - pointer.x, pointer.lastY - pointer.y, v162Constants().FLICK_MIN)
    if (!direction) return false
    const data = smiteLiveData(pointer.uid)
    if (!data) return true
    const zone = smiteZone(others[0].y, win.innerHeight)
    const ids = smiteAffected(data, zone)
    if (!ids.length) {
      smiteToast('Nothing to smite')
      smiteRefresh(doc, smite)
      return true
    }
    const tone = direction === 'left' ? 'amber' : 'red'
    const plan = smiteFoldCast(smite.mercies, ids, tone)
    if (plan.action === 'block') {
      smiteRefresh(doc, smite)
      return true
    }
    for (const mercy of plan.absorb) smiteDropMercy(smite, mercy)
    beginSmiteMercy(doc, win, smite, { uid: pointer.uid, zone, direction, marks: plan.marks })
    return true
  }

  function openSmiteCast(cast) {
    const live = preview.gestures?.smite
    const ids = cast?.ids || []
    if (!live || !ids.length || !cast?.uid) return 'block'
    const direction = cast.direction === 'left' ? 'left' : 'right'
    const plan = smiteFoldCast(live.mercies, ids, direction === 'left' ? 'amber' : 'red')
    if (plan.action === 'block') return 'block'
    for (const mercy of plan.absorb) smiteDropMercy(live, mercy)
    beginSmiteMercy(document, window, live, {
      uid: cast.uid,
      zone: cast.zone || 'middle',
      direction,
      marks: plan.marks,
    })
    return plan.action
  }

  function beginSmiteMercy(doc, win, smite, cast) {
    const now = win.performance?.now?.() || Date.now()
    const mercy = {
      marks: cast.marks,
      castUid: cast.uid,
      zone: cast.zone,
      direction: cast.direction,
      remaining: SMITE_START_MS,
      lastTick: now,
      interacting: smite.pointers.size > 0,
      committing: false,
    }
    smite.mercies.push(mercy)
    smite.mercy = mercy
    smiteToast(`${cast.direction === 'left' ? 'Bank' : 'Mercy'} · ${smiteZoneWord(cast.zone)}`)
    smiteRefresh(doc, smite)
    smiteEnsureTick(doc, win, smite)
    try { win.navigator.vibrate?.(12) } catch (_error) {}
  }

  function smiteTick(doc, win, smite) {
    smite.raf = 0
    smite.ticking = true
    try {
      const now = win.performance?.now?.() || Date.now()
      const due = []
      const idle = []
      for (const mercy of smite.mercies) {
        if (!mercy || mercy.committing) continue
        if (!smiteHasNominated(mercy.marks)) {
          idle.push(mercy)
          continue
        }
        const dt = Math.max(0, now - mercy.lastTick)
        mercy.lastTick = now
        if (!mercy.interacting) mercy.remaining = Math.max(0, mercy.remaining - dt)
        if (mercy.remaining <= 0) due.push(mercy)
      }
      for (const mercy of idle) smiteDropMercy(smite, mercy)
      for (const mercy of due) commitSmite(doc, win, smite, mercy)
      if (smite.mercies.some((mercy) => mercy && !mercy.committing)) {
        smiteRefresh(doc, smite)
        smite.raf = win.requestAnimationFrame(() => smiteTick(doc, win, smite))
      } else {
        clearSmiteClocks(doc)
      }
    } finally {
      smite.ticking = false
    }
  }

  function smiteMercyUp(doc, win, smite, pointer) {
    const live = (smite.mercies || []).filter((mercy) => mercy && !mercy.committing)
    if (!live.length || !pointer?.uid) return false
    const dx = pointer.lastX - pointer.x
    const dy = pointer.lastY - pointer.y
    const tapMove = v162Constants().TAP_MOVE
    const mercy = live.find((item) => smiteCastReply(item.marks, item.castUid, pointer.uid, dx, dy, tapMove, SMITE_TRIGGER_DY) !== 'ignore')
    if (!mercy) return false
    const reply = smiteCastReply(mercy.marks, mercy.castUid, pointer.uid, dx, dy, tapMove, SMITE_TRIGGER_DY)
    const now = win.performance?.now?.() || Date.now()
    mercy.remaining = SMITE_START_MS
    mercy.lastTick = now
    if (reply === 'execute') {
      commitSmite(doc, win, smite, mercy, pointer.uid)
      return true
    }
    const descendants = smiteMoodTargets(bridge.core?.state?.root?.data, mercy.castUid)
    const command = smiteCastTap(mercy.marks, mercy.castUid, pointer.uid, descendants)
    if (command.action === 'clear') smiteDropMercy(smite, mercy)
    else if (command.action === 'degrade' || command.action === 'cycle') {
      smiteApplyEntries(mercy.marks, command.entries)
      if (!smiteHasNominated(mercy.marks)) smiteDropMercy(smite, mercy)
    }
    smiteRefresh(doc, smite)
    smiteEnsureTick(doc, win, smite)
    return true
  }

  function smiteApplyEntries(marks, entries) {
    const keep = new Set(entries.map(([uid]) => uid))
    for (const uid of [...marks.keys()]) {
      if (!keep.has(uid)) marks.delete(uid)
    }
    for (const [uid, mark] of entries) marks.set(uid, mark)
  }

  function commitSmite(doc, win, smite, mercy = smite.mercy, scopeUid = null) {
    if (!mercy || mercy.committing) return
    mercy.committing = true
    const core = bridge.core
    const state = core?.state
    const utils = core?.utils
    if (!state?.root || !utils?.deepClone) {
      smiteDropMercy(smite, mercy)
      smiteRefresh(doc, smite)
      smiteEnsureTick(doc, win, smite)
      return
    }
    const prev = utils.deepClone(state.root.data)
    const prevBank = Array.isArray(state.wordBank) ? state.wordBank.slice() : []
    let marks = mercy.marks
    let scoped = null
    if (scopeUid) {
      scoped = smiteFlickScope(prev, mercy.marks, scopeUid)
      if (!smiteHasNominated(scoped)) {
        mercy.committing = false
        smiteRefresh(doc, smite)
        smiteEnsureTick(doc, win, smite)
        return
      }
      marks = scoped
    }
    const plan = planSmiteCommit(prev, marks)
    doc.body.classList.remove('v2-branch-drag', 'v2-cancel', 'v2-dock-target')
    win.__logyqHoldArming = false
    win.__logyqHoldDragSession = false
    try { core.history.pushHistory({ type: 'replace-root', prev, prevBank }) } catch (_error) {}
    core.selection?.clearGroup?.()
    core.selection?.clearSelection?.()
    if (plan.tree) {
      state.root = win.d3.hierarchy(plan.tree)
      utils.assignIds(state.root)
      core.treeManager.layoutAndRender(false)
    } else {
      state.root = null
      core.treeManager.renderEmpty()
    }
    if (plan.bank.length) {
      win.__logyqHoldDragAllowBank = true
      try {
        for (const name of plan.bank) core.wordDock.addWords(name, 'bank')
      } finally {
        win.__logyqHoldDragAllowBank = false
      }
    }
    core.wordDock.render?.()
    try { bridge.notifyChange?.() } catch (_error) {}
    if (scopeUid) {
      for (const [uid, mark] of smiteTicketEntries(scoped)) {
        if (mark === 'red' || mark === 'amber') mercy.marks.delete(uid)
      }
      const tookClock = smiteMarkOf(scoped, mercy.castUid) === 'red' || smiteMarkOf(scoped, mercy.castUid) === 'amber'
      if (tookClock || !state.root || !smiteHasNominated(mercy.marks)) smiteDropMercy(smite, mercy)
      else mercy.committing = false
    } else {
      smiteDropMercy(smite, mercy)
    }
    clearSmiteScars(doc, smite)
    smiteRefresh(doc, smite)
    smiteEnsureTick(doc, win, smite)
    try { win.navigator.vibrate?.(18) } catch (_error) {}
  }

  function smiteFace(node) {
    return node?.querySelector?.('rect:not(.grabzone):not(.logyq-smite-wash):not(.logyq-smite-glow):not(.logyq-edit-focus)') || null
  }

  function smiteRestoreFace(face) {
    if (!face?.style) return
    face.style.stroke = ''
    face.style.strokeWidth = ''
    face.style.strokeDasharray = ''
    face.style.animation = ''
  }

  function smiteRestoreCard(node) {
    if (!node) return
    smiteRestoreFace(smiteFace(node))
    node.querySelectorAll('rect.logyq-smite-wash, rect.logyq-smite-glow').forEach((layer) => layer.remove())
    node.querySelectorAll('text.label').forEach((el) => {
      el.style.fill = ''
      el.style.stroke = ''
      el.style.strokeWidth = ''
      el.style.paintOrder = ''
    })
    delete node.dataset.smiteHeat
    delete node.dataset.smitePhase
    delete node.dataset.smiteClock
    node.style?.removeProperty?.('--smite-ink')
  }

  // The card's own border stays hidden so it cannot paint a second shade.
  function smitePaintFaceStroke(face) {
    if (!face?.style) return
    face.style.animation = 'none'
    face.style.strokeDasharray = 'none'
    face.style.stroke = 'none'
  }

  function smiteFaceBox(face) {
    const rxAttr = parseFloat(face?.getAttribute?.('rx'))
    const ryAttr = parseFloat(face?.getAttribute?.('ry'))
    const rx = rxAttr > 0 ? rxAttr : 10
    const ry = ryAttr > 0 ? ryAttr : rx
    return {
      rx,
      ry,
      x: parseFloat(face?.getAttribute?.('x')) || 0,
      y: parseFloat(face?.getAttribute?.('y')) || 0,
      w: parseFloat(face?.getAttribute?.('width')) || 0,
      h: parseFloat(face?.getAttribute?.('height')) || 0,
    }
  }

  function smiteTakeClock(node) {
    const found = []
    for (const child of node?.children || []) {
      if (child.classList?.contains?.('logyq-smite-clock')) found.push(child)
    }
    for (const extra of found.slice(1)) extra.remove()
    return found[0] || null
  }

  function smiteEdgeGradientId(link) {
    const uid = link?.__data__?.target?.data?._uid || link?.__data__?.target?.data?.uid || 'edge'
    return `logyq-smite-grad-${String(uid).replace(/[^a-zA-Z0-9_-]/g, '')}`
  }

  function smiteDropAnts(link, gradId) {
    let sib = link?.nextElementSibling
    while (sib && sib.classList?.contains('logyq-smite-ant') && (!gradId || sib.dataset.forLink === gradId)) {
      const next = sib.nextElementSibling
      sib.remove()
      sib = next
    }
  }

  function smiteRestoreEdge(link) {
    if (!link || link.dataset.smiteEdge !== '1') return
    const gradId = link.dataset.smiteGrad
    const haloId = link.dataset.smiteHalo
    if (gradId) link.ownerDocument?.getElementById(gradId)?.remove()
    if (haloId) link.ownerDocument?.getElementById(haloId)?.remove()
    smiteDropAnts(link, gradId)
    link.style.stroke = ''
    link.style.strokeDasharray = ''
    link.style.strokeDashoffset = ''
    link.style.strokeLinecap = ''
    link.style.animation = ''
    link.style.removeProperty('stroke')
    link.style.removeProperty('stroke-width')
    link.style.removeProperty('opacity')
    link.style.opacity = '0.5'
    link.style.strokeWidth = '2.8px'
    link.style.vectorEffect = ''
    link.style.transition = ''
    delete link.dataset.smiteEdge
    delete link.dataset.smiteGrad
    delete link.dataset.smiteHalo
    delete link.dataset.smiteWeight
  }

  function smiteEnsureEdgeGradient(link, from, to, suffix) {
    const doc = link.ownerDocument
    const svg = doc.getElementById('canvas')
    const xml = 'http://www.w3.org/2000/svg'
    let defs = svg?.querySelector('defs.logyq-smite-grads')
    if (svg && !defs) {
      defs = doc.createElementNS(xml, 'defs')
      defs.setAttribute('class', 'logyq-smite-grads')
      svg.insertBefore(defs, svg.firstChild)
    }
    const id = smiteEdgeGradientId(link) + (suffix || '')
    let grad = doc.getElementById(id)
    if (!grad && defs) {
      grad = doc.createElementNS(xml, 'linearGradient')
      grad.id = id
      grad.setAttribute('gradientUnits', 'userSpaceOnUse')
      defs.appendChild(grad)
    }
    if (!grad) return id
    let start = { x: 0, y: 0 }
    let end = { x: 0, y: 1 }
    try {
      const length = link.getTotalLength()
      if (length > 0) {
        start = link.getPointAtLength(0)
        end = link.getPointAtLength(length)
      }
    } catch (_error) {}
    grad.setAttribute('x1', String(start.x))
    grad.setAttribute('y1', String(start.y))
    grad.setAttribute('x2', String(end.x))
    grad.setAttribute('y2', String(end.y))
    let stops = grad.querySelectorAll('stop')
    if (stops.length !== 2) {
      while (grad.firstChild) grad.removeChild(grad.firstChild)
      for (const offset of ['0', '1']) {
        const stop = doc.createElementNS(xml, 'stop')
        stop.setAttribute('offset', offset)
        grad.appendChild(stop)
      }
      stops = grad.querySelectorAll('stop')
    }
    stops[0].setAttribute('stop-color', from)
    stops[1].setAttribute('stop-color', to)
    return id
  }

  function smitePaintAnts(link, color, gradId, haloId) {
    const doc = link.ownerDocument
    const found = []
    let sib = link.nextElementSibling
    while (sib && sib.classList?.contains('logyq-smite-ant') && sib.dataset.forLink === gradId) {
      found.push(sib)
      sib = sib.nextElementSibling
    }
    if (!color) {
      found.forEach((path) => path.remove())
      return
    }
    const xml = 'http://www.w3.org/2000/svg'
    const d = link.getAttribute('d') || ''
    const ensure = (role, stroke, width, opacity) => {
      let path = found.find((item) => item.dataset.antRole === role)
      if (!path) {
        path = doc.createElementNS(xml, 'path')
        path.setAttribute('class', 'logyq-smite-ant')
        path.dataset.antRole = role
        path.dataset.forLink = gradId
        path.setAttribute('fill', 'none')
        path.setAttribute('pointer-events', 'none')
        link.parentNode.insertBefore(path, link.nextSibling)
        found.push(path)
      }
      path.dataset.smiteWeight = 'strong'
      path.setAttribute('d', d)
      path.setAttribute('stroke', stroke)
      path.style.stroke = stroke
      path.style.strokeWidth = width
      path.style.strokeDasharray = '8 6'
      path.style.strokeLinecap = 'round'
      path.style.animation = 'logyq-smite-march 1.4s linear infinite'
      path.style.opacity = opacity
      path.style.vectorEffect = 'non-scaling-stroke'
      path.style.fill = 'none'
      path.style.pointerEvents = 'none'
      return path
    }
    // Dashes use the same parent→child gradient, so a mixed edge does not
    // swap color at a hard midline. The halo follows fate: white beside
    // red and amber, slate beside a white segment.
    ensure('color', `url(#${gradId})`, '3.5px', '1')
    ensure('halo', `url(#${haloId})`, '6px', '0.9')
  }

  // A live layout tween owns `d` and should finish with the cards.
  // Interrupting it used to freeze cast curves on the pre-reflow path.
  function smiteLinkTweening(link) {
    const schedules = link?.__transition
    if (!schedules) return false
    for (const _id in schedules) return true
    return false
  }

  function smiteEnsureLinkGeometry(link) {
    if (!link || smiteLinkTweening(link)) return
    const vLink = link.ownerDocument?.defaultView?.LOGYQBridge?.core?.visual?.vLink
    const datum = link.__data__
    if (!datum?.source || !datum?.target || typeof vLink !== 'function') return
    let next = ''
    try { next = vLink(datum) || '' } catch (_error) { return }
    if (next && link.getAttribute('d') !== next) link.setAttribute('d', next)
  }

  function smitePaintEdge(link, paint) {
    smiteEnsureLinkGeometry(link)
    link.dataset.smiteEdge = '1'
    link.dataset.smiteWeight = 'strong'
    const gradId = smiteEnsureEdgeGradient(link, paint.from, paint.to)
    const haloId = smiteEnsureEdgeGradient(link, paint.haloFrom, paint.haloTo, '-halo')
    link.dataset.smiteGrad = gradId
    link.dataset.smiteHalo = haloId
    link.style.setProperty('stroke', `url(#${gradId})`, 'important')
    link.style.setProperty('stroke-width', '3.5px', 'important')
    link.style.setProperty('opacity', '1', 'important')
    link.style.strokeDasharray = 'none'
    link.style.strokeDashoffset = ''
    link.style.strokeLinecap = 'round'
    link.style.animation = 'none'
    link.style.transition = 'none'
    link.style.vectorEffect = 'non-scaling-stroke'
    smitePaintAnts(link, paint.ants, gradId, haloId)
  }

  function smitePaintCard(node, heat, rx, ry, outline) {
    const face = smiteFace(node)
    if (!face) return
    const doc = node.ownerDocument
    const svg = 'http://www.w3.org/2000/svg'
    let wash = node.querySelector('rect.logyq-smite-wash')
    if (!wash) {
      wash = doc.createElementNS(svg, 'rect')
      wash.setAttribute('class', 'logyq-smite-wash')
      wash.setAttribute('pointer-events', 'none')
      const text = node.querySelector('text.label')
      if (text) node.insertBefore(wash, text)
      else node.appendChild(wash)
    }
    wash.setAttribute('x', face.getAttribute('x') || '0')
    wash.setAttribute('y', face.getAttribute('y') || '0')
    wash.setAttribute('width', face.getAttribute('width') || '0')
    wash.setAttribute('height', face.getAttribute('height') || '0')
    wash.setAttribute('rx', String(rx))
    wash.setAttribute('ry', String(ry))
    wash.setAttribute('fill', 'none')
    wash.setAttribute('fill-opacity', '0')
    wash.style.fill = 'none'
    wash.style.fillOpacity = '0'
    wash.setAttribute('stroke', heat.stroke)
    wash.style.stroke = heat.stroke
    wash.style.strokeWidth = '3.5px'
    wash.style.strokeLinecap = 'round'
    wash.style.vectorEffect = 'non-scaling-stroke'
    if (heat.ants) {
      wash.dataset.smiteOutline = 'ants'
      wash.style.strokeDasharray = '8 6'
      wash.style.animation = 'logyq-smite-march 1.4s linear infinite'
    } else {
      delete wash.dataset.smiteOutline
      wash.style.strokeDasharray = 'none'
      wash.style.animation = 'none'
    }
    wash.style.filter = heat.stroke === '#ffffff' ? 'drop-shadow(0 0 1px rgba(15,23,42,.7))' : 'none'
    node.dataset.smiteHeat = '1'
  }

  function smitePaintGlow(node, heat, rx, ry) {
    const face = smiteFace(node)
    let glow = node.querySelector('rect.logyq-smite-glow')
    if (!face || !heat.glow) {
      glow?.remove()
      return
    }
    const doc = node.ownerDocument
    if (!glow) {
      glow = doc.createElementNS('http://www.w3.org/2000/svg', 'rect')
      glow.setAttribute('class', 'logyq-smite-glow')
      glow.setAttribute('pointer-events', 'none')
      node.insertBefore(glow, face)
    }
    const x = parseFloat(face.getAttribute('x')) || 0
    const y = parseFloat(face.getAttribute('y')) || 0
    const w = parseFloat(face.getAttribute('width')) || 0
    const h = parseFloat(face.getAttribute('height')) || 0
    const pad = 8
    glow.setAttribute('x', smiteNum(x - pad))
    glow.setAttribute('y', smiteNum(y - pad))
    glow.setAttribute('width', smiteNum(w + pad * 2))
    glow.setAttribute('height', smiteNum(h + pad * 2))
    glow.setAttribute('rx', String(rx + pad))
    glow.setAttribute('ry', String(ry + pad))
    glow.setAttribute('fill', heat.stroke)
    glow.setAttribute('fill-opacity', String(heat.glow))
    glow.setAttribute('stroke', 'none')
    glow.style.filter = 'blur(9px)'
  }

  function paintSmiteLayers(doc, layers) {
    const tree = bridge.core?.state?.root?.data
    const byUid = new Map()
    const clockHosts = new Map()
    for (const layer of layers || []) {
      const marks = layer?.marks
      if (!marks) continue
      const fraction = Number(layer.fraction)
      const owned = new Map()
      const take = (uid, mark) => {
        if (!uid || byUid.has(uid) || owned.has(uid)) return
        owned.set(uid, mark)
        byUid.set(uid, { mark, fraction, layer })
      }
      if (typeof marks.forEach === 'function') marks.forEach((mark, uid) => take(uid, mark))
      else Object.keys(marks).forEach((uid) => take(uid, marks[uid]))
      const castUid = layer.castUid || null
      const tone = smiteNominatedTone(marks, castUid, layer.tone)
      if (castUid && tone && !clockHosts.has(castUid)) {
        clockHosts.set(castUid, { mark: tone, fraction, marks })
      } else if (!castUid) {
        for (const uid of smiteClockRoots(tree, owned)) {
          const mark = owned.get(uid)
          if ((mark === 'red' || mark === 'amber') && !clockHosts.has(uid)) {
            clockHosts.set(uid, { mark, fraction, marks: owned })
          }
        }
      }
    }
    const nodes = doc.querySelectorAll('svg#canvas g.node')
    nodes.forEach((node) => {
      const uid = nodeUid(node)
      const entry = uid ? byUid.get(uid) : null
      const mark = entry?.mark
      const inScope = mark === 'red' || mark === 'amber' || mark === 'normal'
      const host = uid ? clockHosts.get(uid) : null
      let clock = smiteTakeClock(node)
      node.querySelectorAll('rect.logyq-smite-glow').forEach((layer) => layer.remove())
      delete node.dataset.smitePhase
      node.style?.removeProperty?.('--smite-ink')
      if (!inScope && !host) {
        if (clock || node.dataset.smiteHeat === '1' || node.dataset.smiteClock === '1' || node.querySelector('rect.logyq-smite-wash')) {
          smiteRestoreCard(node)
        }
        clock?.remove()
        delete node.dataset.smiteClock
        return
      }
      const face = smiteFace(node)
      if (!face) return
      const { rx, ry, x, y, w, h } = smiteFaceBox(face)
      const chrome = smiteCardChrome(mark, !!host)
      if (chrome) smitePaintCard(node, chrome, rx, ry)
      else {
        node.querySelectorAll('rect.logyq-smite-wash').forEach((layer) => layer.remove())
        if (!host) delete node.dataset.smiteHeat
      }
      if (!host) {
        clock?.remove()
        delete node.dataset.smiteClock
        smiteRestoreFace(face)
        return
      }
      const svg = 'http://www.w3.org/2000/svg'
      // The clock hides the card border so that white stroke is not a second ring.
      smitePaintFaceStroke(face)
      node.dataset.smiteClock = '1'
      const color = smiteMoodColor(host.mark)
      const d = smiteClockPath(x, y, w, h, rx, ry)
      if (!d) {
        clock?.remove()
        return
      }
      if (clock && clock.localName !== 'path') {
        clock.remove()
        clock = null
      }
      if (!clock) {
        clock = doc.createElementNS(svg, 'path')
        clock.setAttribute('fill', 'none')
        clock.setAttribute('stroke-width', '3.5')
        clock.setAttribute('stroke-linecap', 'round')
        clock.setAttribute('stroke-linejoin', 'round')
        clock.setAttribute('pointer-events', 'none')
        node.appendChild(clock)
      }
      clock.setAttribute('d', d)
      clock.setAttribute('class', `logyq-smite-clock logyq-smite-${host.mark}`)
      clock.setAttribute('stroke', color)
      clock.style.animation = 'none'
      clock.style.transition = 'none'
      clock.style.filter = 'none'
      clock.style.vectorEffect = 'none'
      let length = 0
      try { length = clock.getTotalLength() } catch (_error) { length = 0 }
      if (!(length > 0)) length = smiteClockLength(w, h, rx, ry)
      // Dash lives on the SVG attributes, in this one path length.
      // A CSS pixel length would shrink faster than the 12s drain when the map is scaled.
      clock.setAttribute('pathLength', String(length))
      const dash = smiteLineDash(host.fraction, length)
      clock.setAttribute('stroke-dasharray', dash.array)
      clock.setAttribute('stroke-dashoffset', String(dash.offset))
      clock.style.removeProperty('stroke-dasharray')
      clock.style.removeProperty('stroke-dashoffset')
    })
    const mood = new Map()
    for (const [castUid, host] of clockHosts) {
      const shape = smiteCastShape(host.marks, castUid, smiteMoodTargets(tree, castUid))
      for (const edge of smiteMoodEdges(tree, castUid)) {
        if (mood.has(edge.childUid)) continue
        const live = smiteLinkLive(
          shape,
          smiteMarkOf(host.marks, edge.parentUid),
          smiteMarkOf(host.marks, edge.childUid),
        )
        if (live) mood.set(edge.childUid, live)
      }
    }
    const liveGrads = new Set()
    doc.querySelectorAll('svg#canvas g.links path.link').forEach((link) => {
      smiteEnsureLinkGeometry(link)
      const uid = link.__data__?.target?.data?._uid || link.__data__?.target?.data?.uid || null
      const paint = uid ? mood.get(uid) : null
      if (paint) {
        smitePaintEdge(link, paint)
        if (link.dataset.smiteGrad) liveGrads.add(link.dataset.smiteGrad)
        if (link.dataset.smiteHalo) liveGrads.add(link.dataset.smiteHalo)
      } else smiteRestoreEdge(link)
    })
    doc.querySelectorAll('svg#canvas path.logyq-smite-ant').forEach((path) => {
      if (!liveGrads.has(path.dataset.forLink)) path.remove()
    })
    doc.querySelectorAll('svg#canvas defs.logyq-smite-grads linearGradient').forEach((grad) => {
      if (!liveGrads.has(grad.id)) grad.remove()
    })
  }

  function smiteScarPoint(doc, win, uid) {
    const nodes = Array.from(doc.querySelectorAll('svg#canvas g.node')).filter((node) => nodeUid(node) === uid)
    for (const node of nodes) {
      const face = smiteFace(node)
      const rect = face?.getBoundingClientRect?.()
      if (rect && rect.width >= 1 && rect.height >= 1) {
        return { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 }
      }
    }
    const laid = nodes.find((node) => Number.isFinite(node.__data__?.x) && Number.isFinite(node.__data__?.y))
    const host = doc.getElementById('canvas')?.querySelector('g')
    const ctm = host?.getScreenCTM?.()
    if (laid && ctm && typeof win.DOMPoint === 'function') {
      const point = new win.DOMPoint(laid.__data__.x, laid.__data__.y).matrixTransform(ctm)
      if (Number.isFinite(point.x) && Number.isFinite(point.y)) return { x: point.x, y: point.y }
    }
    return null
  }

  function clearSmiteClocks(doc) {
    doc.querySelectorAll('svg#canvas g.node').forEach((node) => {
      if (node.dataset.smiteHeat === '1' || node.querySelector('.logyq-smite-clock')) smiteRestoreCard(node)
    })
    doc.querySelectorAll('svg#canvas .logyq-smite-clock').forEach((clock) => clock.remove())
    doc.querySelectorAll('svg#canvas g.links path.link').forEach((link) => smiteRestoreEdge(link))
    doc.querySelectorAll('svg#canvas path.logyq-smite-ant').forEach((path) => path.remove())
    doc.querySelectorAll('svg#canvas defs.logyq-smite-grads').forEach((defs) => defs.remove())
  }

  function clearSmiteScars(doc, smite) {
    if (smite?.scarRaf) {
      ;(doc.defaultView || window).cancelAnimationFrame(smite.scarRaf)
      smite.scarRaf = 0
    }
    smite.scars = []
    doc.querySelectorAll('.logyq-smite-scar').forEach((scar) => scar.remove())
  }

  function smiteCardFaces(doc) {
    return Array.from(doc.querySelectorAll('svg#canvas g.node')).map((node) => {
      const face = smiteFace(node)
      const rect = face?.getBoundingClientRect?.()
      if (!rect || rect.width < 2 || rect.height < 2) return null
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
    }).filter(Boolean)
  }

  function syncSmiteScars(doc, win, smite) {
    const now = win.performance?.now?.() || Date.now()
    const faces = smiteCardFaces(doc)
    let live = false
    doc.querySelectorAll('.logyq-smite-scar').forEach((button) => {
      if (button._smiteBorn == null) button._smiteBorn = now
      const opacity = smiteScarOpacity(now - button._smiteBorn, SMITE_SCAR_HOLD_MS, SMITE_SCAR_FADE_MS)
      if (opacity <= 0) {
        button.remove()
        return
      }
      live = true
      const box = button.getBoundingClientRect()
      const blocked = smiteScarBlocked((box.left + box.right) / 2, (box.top + box.bottom) / 2, faces)
      button.style.opacity = String(opacity)
      button.style.transform = opacity < 1 ? `scale(${0.72 + 0.28 * opacity})` : ''
      button.classList.toggle('is-covered', blocked)
      button.style.pointerEvents = blocked ? 'none' : 'auto'
    })
    if (smite) {
      const still = new Set(doc.querySelectorAll('.logyq-smite-scar'))
      smite.scars = (smite.scars || []).filter((scar) => scar.button && still.has(scar.button))
    }
    return live
  }

  function kickSmiteScarLoop(doc, win, smite) {
    if (smite.scarRaf) return
    const tick = () => {
      smite.scarRaf = 0
      if (syncSmiteScars(doc, win, smite)) smite.scarRaf = win.requestAnimationFrame(tick)
    }
    smite.scarRaf = win.requestAnimationFrame(tick)
  }

  function mountSmiteScars(doc, win, smite, placed) {
    const born = win.performance?.now?.() || Date.now()
    placed.forEach((scar, index) => {
      const button = doc.createElement('button')
      button.type = 'button'
      button.className = 'logyq-smite-scar'
      button.dataset.uid = scar.uid || ''
      button.dataset.name = scar.name || ''
      button.setAttribute('aria-label', 'Restore smitten card')
      button.style.left = `${scar.x + index * 8}px`
      button.style.top = `${scar.y}px`
      button._smiteBorn = born
      scar.button = button
      button.addEventListener('pointerdown', (event) => {
        if (button.classList.contains('is-covered')) return
        event.preventDefault()
        event.stopPropagation()
      })
      button.addEventListener('pointerup', (event) => {
        if (button.classList.contains('is-covered')) return
        event.preventDefault()
        event.stopPropagation()
        const now = win.performance?.now?.() || Date.now()
        if (button._smiteTap && now - button._smiteTap <= v162Constants().DOUBLE_TAP_MS) {
          button._smiteTap = 0
          restoreSmiteScar(doc, win, smite, scar, button)
        } else {
          button._smiteTap = now
        }
      })
      doc.body.appendChild(button)
      smite.scars.push(scar)
    })
    syncSmiteScars(doc, win, smite)
    kickSmiteScarLoop(doc, win, smite)
  }

  function restoreSmiteScar(doc, win, smite, scar, button) {
    const core = bridge.core
    const state = core?.state
    const utils = core?.utils
    if (!state || !utils) return
    const card = { name: scar.name || '', _uid: scar.uid }
    if (scar.color) card.color = scar.color
    utils.assignUids?.(card)
    const prevBank = Array.isArray(state.wordBank) ? state.wordBank.slice() : []
    if (!state.root) {
      try { core.history.pushHistory({ type: 'add-root' }) } catch (_error) {}
      state.root = win.d3.hierarchy(card)
      utils.assignIds(state.root)
      core.treeManager.layoutAndRender(false)
    } else {
      const prev = utils.deepClone(state.root.data)
      const parent = scar.parentUid ? utils.findByUid(state.root.data, scar.parentUid) : null
      const host = parent || state.root.data
      try { core.history.pushHistory({ type: 'replace-root', prev, prevBank }) } catch (_error) {}
      host.children = host.children || []
      host.children.push(card)
      state.root = win.d3.hierarchy(state.root.data)
      utils.assignIds(state.root)
      core.treeManager.layoutAndRender(false)
    }
    button.remove()
    smite.scars = smite.scars.filter((item) => item !== scar)
    try { bridge.notifyChange?.() } catch (_error) {}
  }

  function mouse(target, win, type, x, y, buttons) {
    try {
      target.dispatchEvent(new win.MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: win,
        clientX: x,
        clientY: y,
        screenX: x,
        screenY: y,
        button: 0,
        buttons,
        shiftKey: false,
      }))
    } catch (_error) {}
  }

  bindV162Gestures()
  if (preview.gestures) {
    preview.gestures.constants = v162Constants()
    preview.gestures.bindV162 = bindV162Gestures
    preview.gestures.hardClearBackground = hardClearBackground
    preview.gestures.armBlankCardMic = armBlankCardMic
    preview.gestures.edgePan = edgePan
    preview.gestures.centerPanVector = centerPanVector
    preview.gestures.clampPanToContent = clampPanToContent
    preview.gestures.applyFingerPan = applyFingerPan
    preview.gestures.beginCardPan = beginCardPan
    preview.gestures.stopZoomGesture = stopZoomGesture
    preview.gestures.classifyCardIntent = classifyCardIntent
    preview.gestures.flickFastSpeed = flickFastSpeed
    preview.gestures.recentSpeedPxPerMs = recentSpeedPxPerMs
    preview.gestures.fingerOffset = fingerOffset
    preview.gestures.visualPoint = visualPoint
    preview.gestures.fingerMovedFromLatch = fingerMovedFromLatch
    preview.gestures.dragMousePoint = dragMousePoint
    preview.gestures.liftPx = liftPx
    preview.gestures.yieldNodeDrag = yieldNodeDrag
    preview.gestures.dockDropKind = dockDropKind
    preview.gestures.activeDockKind = activeDockKind
    preview.gestures.paintCloneCard = paintCloneCard
    preview.gestures.endHoldDragSession = endHoldDragSession
    preview.gestures.hitBankChip = hitBankChip
    preview.gestures.paintFlickDown = paintFlickDown
    preview.gestures.paintTap = paintTap
    preview.gestures.flickDirection = flickDirection
    preview.gestures.hitNode = hitNode
    preview.gestures.rankCardHits = rankCardHits
    preview.gestures.cardFaceRect = cardFaceRect
    preview.gestures.uidFromTouchedNode = uidFromTouchedNode
    preview.gestures.uidFromEvent = uidFromEvent
    preview.gestures.uidFromPoint = uidFromPoint
    preview.gestures.uidFromVisualPoint = uidFromVisualPoint
    preview.gestures.hitEditUid = hitEditUid
    preview.gestures.hitLayoutSlot = hitLayoutSlot
    preview.gestures.layoutFaceRect = layoutFaceRect
    preview.gestures.smiteZone = smiteZone
    preview.gestures.smiteCastDirection = smiteCastDirection
    preview.gestures.smiteAffected = smiteAffected
    preview.gestures.smiteNextMark = smiteNextMark
    preview.gestures.smiteRingFraction = smiteRingFraction
    preview.gestures.smiteRefillMs = smiteRefillMs
    preview.gestures.planSmiteCommit = planSmiteCommit
    preview.gestures.smiteClockPath = smiteClockPath
    preview.gestures.smiteClockLength = smiteClockLength
    preview.gestures.smiteLineDash = smiteLineDash
    preview.gestures.smiteLinePhase = smiteLinePhase
    preview.gestures.smiteClockRoots = smiteClockRoots
    preview.gestures.smiteCastOverlaps = smiteCastOverlaps
    preview.gestures.smiteFoldCast = smiteFoldCast
    preview.gestures.smiteArmDirection = smiteArmDirection
    preview.gestures.smiteArmTarget = smiteArmTarget
    preview.gestures.smiteArmScope = smiteArmScope
    preview.gestures.smiteArmChrome = smiteArmChrome
    preview.gestures.openSmiteCast = openSmiteCast
    preview.gestures.clearSmiteArm = () => smiteSetArm(document, null)
    if (bridge.core) {
      bridge.core.setEditFocus = (uid) => {
        const live = preview.gestures?.smite
        if (live) live.editUid = uid || null
        paintEditFocus(document, uid || null)
      }
    }
    preview.gestures.smiteHeat = smiteHeat
    preview.gestures.smiteScarOpacity = smiteScarOpacity
    preview.gestures.smiteScarBlocked = smiteScarBlocked
    preview.gestures.syncSmiteScars = () => syncSmiteScars(document, window, preview.gestures.smite)
  }
