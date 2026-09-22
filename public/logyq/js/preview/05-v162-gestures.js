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

  // Full ring at and above 12s. Only the last 12s drains.
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

  // Gap on the eaten prefix, dash on the suffix that still ends at 12.
  function smiteLineDash(fraction) {
    const f = Number(fraction)
    if (!Number.isFinite(f) || f >= 1) return { array: '100', offset: 0 }
    if (f <= 0) return { array: '0 100', offset: 0 }
    const visible = Math.min(100, Math.max(0, f * 100))
    const eaten = 100 - visible
    return { array: `${visible} ${eaten}`, offset: eaten }
  }

  // Heat follows the leading edge as it leaves 12 toward the left.
  // Very light until the top-left corner is rounded, then stronger after
  // each corner, and a behind-glow only on the last stretch.
  function smiteLinePhase(fraction, width, height, rx = 10, ry = 10) {
    const f = Number(fraction)
    if (!Number.isFinite(f) || f >= 1) return 'veil'
    if (f <= 0) return 'glow'
    const { w, h, capX, capY } = smiteRoundCaps(width, height, rx, ry)
    if (w <= 0 || h <= 0) return 'veil'
    const topHalf = Math.max(0, w / 2 - capX)
    const side = Math.max(0, h - 2 * capY)
    const bottom = Math.max(0, w - 2 * capX)
    const arc = smiteQuarterArc(capX, capY)
    const total = topHalf + arc + side + arc + bottom + arc + side + arc + topHalf
    if (total <= 0) return 'veil'
    const eaten = (1 - Math.min(1, f)) * total
    const topLeft = topHalf + arc
    const bottomLeft = topLeft + side + arc
    const bottomRight = bottomLeft + bottom + arc
    const topRight = bottomRight + side + arc
    if (eaten <= topLeft) return 'veil'
    if (eaten <= bottomLeft) return 'light'
    if (eaten <= bottomRight) return 'medium'
    if (eaten <= topRight) return 'dark'
    return 'glow'
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

  // Fate hue, stepped by how many corners the edge has rounded.
  // Wash stays translucent so painted color still reads underneath.
  function smiteHeat(phase, mark = 'red') {
    const amber = mark === 'amber'
    const table = amber
      ? {
          veil: { stroke: '#fde68a', wash: '#fde68a', washOpacity: 0.22, glow: 0 },
          light: { stroke: '#fcd34d', wash: '#fbbf24', washOpacity: 0.34, glow: 0 },
          medium: { stroke: '#f59e0b', wash: '#f59e0b', washOpacity: 0.48, glow: 0 },
          dark: { stroke: '#b45309', wash: '#92400e', washOpacity: 0.58, glow: 0 },
          glow: { stroke: '#ffb000', wash: '#f59e0b', washOpacity: 0.72, glow: 0.95 },
        }
      : {
          veil: { stroke: '#fecaca', wash: '#fecaca', washOpacity: 0.22, glow: 0 },
          light: { stroke: '#fca5a5', wash: '#f87171', washOpacity: 0.34, glow: 0 },
          medium: { stroke: '#ef4444', wash: '#ef4444', washOpacity: 0.48, glow: 0 },
          dark: { stroke: '#b91c1c', wash: '#991b1b', washOpacity: 0.58, glow: 0 },
          glow: { stroke: '#ff2d2d', wash: '#ef4444', washOpacity: 0.72, glow: 0.95 },
        }
    return table[phase] || table.veil
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

  // excited → hold / pan / flickish. Flick-speed strokes stay gated so
  // d3.zoom never applies; slow/medium slides become pan; still 160ms is hold.
  function classifyCardIntent(dist, elapsed, speed, sawFast, C) {
    const cfg = C || v162Constants()
    if (dist <= cfg.HOLD_SLOP) return 'excited'
    if (elapsed >= cfg.FLICK_MAX_MS) return 'pan'
    if (sawFast || speed >= flickFastSpeed(cfg)) return 'flickish'
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
    }
    win.__logyqSuppressZoom = true
    stopZoomGesture(doc)
  }

  function resolveCardRace(doc, win, state, event) {
    const race = state.race
    if (!race || race.mode === 'pan' || race.mode === 'drag') return
    const now = win.performance.now()
    race.samples.push({ t: now, x: event.clientX, y: event.clientY })
    if (race.samples.length > 24) race.samples.splice(0, race.samples.length - 24)
    const dist = Math.hypot(event.clientX - race.x, event.clientY - race.y)
    const elapsed = now - race.t0
    const speed = recentSpeedPxPerMs(race.samples, now)
    if (speed >= flickFastSpeed()) race.sawFast = true
    const intent = classifyCardIntent(dist, elapsed, speed, race.sawFast)
    if (intent === 'flickish') {
      race.mode = 'flickish'
      win.__logyqSuppressZoom = true
      stopZoomGesture(doc)
      return
    }
    if (intent !== 'pan') return
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

    const uid = uidFromTouchedNode(event) || nodeUid(hitNode(doc, event.clientX, event.clientY, event))
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
      return
    }

    const now = win.performance.now()
    if (state.lastTap?.uid === uid && now - state.lastTap.time <= v162Constants().DOUBLE_TAP_MS) {
      state.lastTap = null
      clearCardMic(state.mic)
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
    const vis = node?.querySelector?.('rect:not(.grabzone)')
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

  function hitNode(doc, x, y, event) {
    const uid = hitEditUid(doc, x, y, event)
    if (uid) return nodeByUid(doc, uid) || null
    return hitVisualNode(doc, x, y)
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
  const SMITE_START_MS = 15000
  const SMITE_MAX_MS = 15000
  const SMITE_FULL_MS = 12000
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
        uid,
      })
      if (smite.mercy?.marks?.has(uid) && holdState) cancelHold(win, holdState)
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
        if (!smite.mercy) clearSmiteClocks(doc)
        smiteApplyPinch(doc, win, smite)
        return
      }
      if (smite.pointers.size >= 2) smite.pinch = null
      if (!smite.mercy) smitePaintPreview(doc, win, smite)
    }, true)

    win.addEventListener('pointerup', (event) => {
      const pointer = smite.pointers.get(event.pointerId)
      if (!pointer) return
      pointer.lastX = event.clientX
      pointer.lastY = event.clientY
      const paired = smite.pair
      let handled = false
      if (smite.mercy && !smite.pinched) handled = smiteMercyUp(doc, win, smite, pointer)
      if (!handled && !smite.mercy) handled = smiteTryCast(doc, win, smite, pointer, event.pointerId)
      smite.pointers.delete(event.pointerId)
      if (handled || paired) win.__logyqV2ConsumedPointers.add(event.pointerId)
      smiteReleaseZoom(win, smite)
      if (!smite.mercy) clearSmiteClocks(doc)
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
        if (!smite.mercy) clearSmiteClocks(doc)
      }
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

  function smiteSetInteracting(win, smite, on) {
    const mercy = smite.mercy
    if (!mercy || mercy.committing) return
    if (mercy.interacting && !on) mercy.lastTick = win.performance?.now?.() || Date.now()
    mercy.interacting = !!on
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
    if (smite.pinched || smite.mercy || smite.pointers.size !== 2) {
      if (!smite.mercy) clearSmiteClocks(doc)
      return
    }
    const fingers = Array.from(smite.pointers.values())
    const moved = fingers.filter((finger) => smiteFingerMoved(finger, SMITE_PARK_SLOP))
    const parked = fingers.filter((finger) => !smiteFingerMoved(finger, SMITE_PARK_SLOP))
    if (moved.length !== 1 || parked.length !== 1 || !moved[0].uid) {
      clearSmiteClocks(doc)
      return
    }
    const swipe = moved[0]
    const direction = smiteCastDirection(swipe.lastX - swipe.x, swipe.lastY - swipe.y, v162Constants().FLICK_MIN)
    if (!direction) {
      clearSmiteClocks(doc)
      return
    }
    const data = smiteLiveData(swipe.uid)
    if (!data) return
    const marks = new Map()
    const tone = direction === 'left' ? 'amber' : 'red'
    for (const id of smiteAffected(data, smiteZone(parked[0].y, win.innerHeight))) marks.set(id, tone)
    if (!marks.size) {
      clearSmiteClocks(doc)
      return
    }
    paintSmiteClocks(doc, marks, 1)
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
      clearSmiteClocks(doc)
      return true
    }
    const tone = direction === 'left' ? 'amber' : 'red'
    const marks = new Map()
    for (const id of ids) marks.set(id, tone)
    beginSmiteMercy(doc, win, smite, { uid: pointer.uid, zone, direction, marks })
    return true
  }

  function beginSmiteMercy(doc, win, smite, cast) {
    if (smite.raf) win.cancelAnimationFrame(smite.raf)
    const now = win.performance?.now?.() || Date.now()
    smite.mercy = {
      marks: cast.marks,
      castUid: cast.uid,
      zone: cast.zone,
      direction: cast.direction,
      remaining: SMITE_START_MS,
      lastTick: now,
      interacting: smite.pointers.size > 0,
      committing: false,
    }
    smiteToast(`${cast.direction === 'left' ? 'Bank' : 'Mercy'} · ${smiteZoneWord(cast.zone)}`)
    paintSmiteClocks(doc, cast.marks, 1)
    smite.raf = win.requestAnimationFrame(() => smiteTick(doc, win, smite))
    try { win.navigator.vibrate?.(12) } catch (_error) {}
  }

  function smiteTick(doc, win, smite) {
    smite.raf = 0
    const mercy = smite.mercy
    if (!mercy || mercy.committing) return
    const now = win.performance?.now?.() || Date.now()
    const dt = Math.max(0, now - mercy.lastTick)
    mercy.lastTick = now
    if (!mercy.interacting) mercy.remaining -= dt
    if (mercy.remaining <= 0) {
      commitSmite(doc, win, smite)
      return
    }
    paintSmiteClocks(doc, mercy.marks, smiteRingFraction(mercy.remaining, SMITE_FULL_MS))
    smite.raf = win.requestAnimationFrame(() => smiteTick(doc, win, smite))
  }

  function smiteMercyUp(doc, win, smite, pointer) {
    const mercy = smite.mercy
    if (!mercy || mercy.committing) return false
    const dx = pointer.lastX - pointer.x
    const dy = pointer.lastY - pointer.y
    if (pointer.uid && pointer.uid === mercy.castUid && dy > SMITE_TRIGGER_DY && dy > Math.abs(dx)) {
      commitSmite(doc, win, smite)
      return true
    }
    if (Math.hypot(dx, dy) >= v162Constants().TAP_MOVE) return false
    if (!pointer.uid || !mercy.marks.has(pointer.uid)) return false
    const treeRoot = bridge.core?.state?.root?.data?._uid
    const current = mercy.marks.get(pointer.uid)
    const next = smiteNextMark(current, pointer.uid === treeRoot)
    if (next === current) return true
    mercy.marks.set(pointer.uid, next)
    mercy.remaining = smiteRefillMs(mercy.remaining, SMITE_REFILL_MS, SMITE_MAX_MS)
    paintSmiteClocks(doc, mercy.marks, smiteRingFraction(mercy.remaining, SMITE_FULL_MS))
    return true
  }

  function commitSmite(doc, win, smite) {
    const mercy = smite.mercy
    if (!mercy || mercy.committing) return
    mercy.committing = true
    if (smite.raf) {
      win.cancelAnimationFrame(smite.raf)
      smite.raf = 0
    }
    const core = bridge.core
    const state = core?.state
    const utils = core?.utils
    if (!state?.root || !utils?.deepClone) {
      smite.mercy = null
      clearSmiteClocks(doc)
      return
    }
    const prev = utils.deepClone(state.root.data)
    const prevBank = Array.isArray(state.wordBank) ? state.wordBank.slice() : []
    const plan = planSmiteCommit(prev, mercy.marks)
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
    smite.mercy = null
    clearSmiteClocks(doc)
    clearSmiteScars(doc, smite)
    try { win.navigator.vibrate?.(18) } catch (_error) {}
  }

  function smiteFace(node) {
    return node?.querySelector?.('rect:not(.grabzone):not(.logyq-smite-wash):not(.logyq-smite-glow)') || null
  }

  function smiteRestoreCard(node) {
    if (!node) return
    node.querySelectorAll('rect.logyq-smite-wash, rect.logyq-smite-glow').forEach((layer) => layer.remove())
    node.querySelectorAll('text.label').forEach((el) => {
      el.style.fill = ''
      el.style.stroke = ''
      el.style.strokeWidth = ''
      el.style.paintOrder = ''
    })
    delete node.dataset.smiteHeat
    delete node.dataset.smitePhase
    node.style?.removeProperty?.('--smite-ink')
  }

  function smitePaintCard(node, heat, rx, ry) {
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
    wash.setAttribute('fill', heat.wash)
    wash.setAttribute('fill-opacity', String(heat.washOpacity))
    wash.setAttribute('stroke', 'none')
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

  function paintSmiteClocks(doc, marks, fraction) {
    const clockRoots = new Set(smiteClockRoots(bridge.core?.state?.root?.data, marks))
    const nodes = doc.querySelectorAll('svg#canvas g.node')
    nodes.forEach((node) => {
      const uid = nodeUid(node)
      const mark = uid ? smiteMarkOf(marks, uid) : null
      let clock = null
      for (const child of node.children || []) {
        if (child.classList?.contains?.('logyq-smite-clock')) clock = child
      }
      if (mark !== 'red' && mark !== 'amber') {
        if (clock || node.dataset.smiteHeat === '1') smiteRestoreCard(node)
        clock?.remove()
        return
      }
      const face = smiteFace(node)
      if (!face) return
      const svg = 'http://www.w3.org/2000/svg'
      const rxAttr = parseFloat(face.getAttribute('rx'))
      const ryAttr = parseFloat(face.getAttribute('ry'))
      const rx = rxAttr > 0 ? rxAttr : 10
      const ry = ryAttr > 0 ? ryAttr : rx
      const x = parseFloat(face.getAttribute('x')) || 0
      const y = parseFloat(face.getAttribute('y')) || 0
      const w = parseFloat(face.getAttribute('width')) || 0
      const h = parseFloat(face.getAttribute('height')) || 0
      const phase = smiteLinePhase(fraction, w, h, rx, ry)
      const heat = smiteHeat(phase, mark)
      const isClock = clockRoots.has(uid)
      smitePaintCard(node, heat, rx, ry)
      node.dataset.smitePhase = phase
      node.style.setProperty('--smite-ink', heat.stroke)
      if (!isClock) {
        clock?.remove()
        node.querySelector('rect.logyq-smite-glow')?.remove()
        return
      }
      const d = smiteClockPath(x, y, w, h, rx, ry)
      if (!d) {
        clock?.remove()
        node.querySelector('rect.logyq-smite-glow')?.remove()
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
        clock.setAttribute('pathLength', '100')
        node.appendChild(clock)
      }
      const dash = smiteLineDash(fraction)
      clock.setAttribute('d', d)
      clock.setAttribute('class', `logyq-smite-clock logyq-smite-${mark}${phase === 'glow' ? ' is-glow' : ''}`)
      clock.setAttribute('stroke', heat.stroke)
      clock.setAttribute('stroke-dasharray', dash.array)
      clock.setAttribute('stroke-dashoffset', String(dash.offset))
      smitePaintGlow(node, heat, rx, ry)
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
    preview.gestures.smiteLineDash = smiteLineDash
    preview.gestures.smiteLinePhase = smiteLinePhase
    preview.gestures.smiteClockRoots = smiteClockRoots
    preview.gestures.smiteHeat = smiteHeat
    preview.gestures.smiteScarOpacity = smiteScarOpacity
    preview.gestures.smiteScarBlocked = smiteScarBlocked
    preview.gestures.syncSmiteScars = () => syncSmiteScars(document, window, preview.gestures.smite)
  }
