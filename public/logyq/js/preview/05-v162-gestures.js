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
      if (!(holdState.drag || win.__logyqHoldDragSession || doc.body.classList.contains('v2-branch-drag'))) return
      event.preventDefault()
      event.stopImmediatePropagation()
    }, true)

    canvas.addEventListener('pointerdown', (event) => onFlickDown(event, doc, win, flickState), true)
    canvas.addEventListener('pointerup', (event) => onFlickUp(event, doc, win, flickState), true)
    canvas.addEventListener('pointercancel', (event) => onFlickClear(event, win, flickState), true)
    if (preview.gestures) preview.gestures.session = { hold: holdState, flick: flickState }
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

  function onHoldDown(event, doc, win, canvas, state) {
    if (event.pointerType === 'mouse') return
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
    const chip = dockKind === 'bank' ? hitBankChip(doc, drag.lastX, drag.lastY) : null
    const now = win.performance?.now?.() || Date.now()
    if (chip && chip === drag.bankChip) {
      drag.bankArmed = (now - drag.bankSince) >= v162Constants().BANK_DWELL_MS
      return
    }
    drag.bankChip = chip
    drag.bankSince = chip ? now : 0
    drag.bankArmed = false
  }

  function dockDropKind(doc, x, y) {
    const dock = doc.getElementById('Dock')
    if (!dock || dock.classList.contains('dock-hidden')) return 'none'
    if (hitBankChip(doc, x, y)) return 'bank'
    const rect = dock.getBoundingClientRect()
    if (rect.width < 8 || rect.height < 8) return 'none'
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

    const node = hitNode(doc, event.clientX, event.clientY, event)
    const uid = nodeUid(node)
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

    const uid = hitEditUid(doc, event.clientX, event.clientY, event)
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
    return host?.getAttribute?.('data-uid') || nodeUid(host) || null
  }

  function uidFromEvent(event) {
    const path = typeof event?.composedPath === 'function' ? event.composedPath() : []
    const nodes = path.length ? path : (event?.target ? [event.target] : [])
    for (const item of nodes) {
      if (!item || item === item.window || item === item.document) continue
      const host = item.closest?.('g.hit-slot, g.node')
        || (item.classList?.contains?.('hit-slot') || item.classList?.contains?.('node') ? item : null)
      const uid = uidFromHost(host)
      if (uid) return uid
    }
    return null
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

  // Cards are pointer-events:none on phone so the event target is often a
  // reserved hit-slot *behind* a mid-tween visual. Prefer the painted
  // g.node under the finger (elementsFromPoint still sees it) so a
  // just-created blank keeps its own _uid even if she taps before settle.
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
    return uidFromVisualPoint(doc, x, y)
      || uidFromEvent(event)
      || uidFromPoint(doc, x, y)
      || nodeUid(hitLayoutSlot(doc, x, y))
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
        if (response.status === 401 || response.status === 403) win.sessionStorage.removeItem(PIN_KEY)
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
    preview.gestures.uidFromEvent = uidFromEvent
    preview.gestures.uidFromPoint = uidFromPoint
    preview.gestures.uidFromVisualPoint = uidFromVisualPoint
    preview.gestures.hitEditUid = hitEditUid
    preview.gestures.hitLayoutSlot = hitLayoutSlot
    preview.gestures.layoutFaceRect = layoutFaceRect
  }
