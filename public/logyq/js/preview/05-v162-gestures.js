  function v162Constants() {
    return {
      FLICK_MIN: 52,
      FLICK_MAX_MS: 340,
      FLICK_RATIO: 1.45,
      HOLD_MS: 280,
      HOLD_SLOP: 8,
      TAP_MOVE: 11,
      DOUBLE_TAP_MS: 360,
      EDGE_ZONE: 84,
      EDGE_STEP: 14,
      PX_PER_CM: 38,
      OFFSET_UP_CM: 1.75,
      OFFSET_SIDE_CM: 0,
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
    win.__logyqV2ConsumedPointers ||= new Set()

    const holdState = {
      active: new Set(),
      pointers: new Map(),
      hold: null,
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
    win.addEventListener('pointermove', (event) => onHoldMove(event, win, holdState), true)
    win.addEventListener('pointerup', (event) => onHoldUp(event, doc, win, canvas, holdState), true)
    win.addEventListener('pointercancel', (event) => onHoldCancel(event, doc, win, holdState), true)

    canvas.addEventListener('pointerdown', (event) => onFlickDown(event, doc, win, flickState), true)
    canvas.addEventListener('pointerup', (event) => onFlickUp(event, doc, win, flickState), true)
    canvas.addEventListener('pointercancel', (event) => onFlickClear(event, win, flickState), true)
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
      if (state.drag) yieldNodeDrag(doc, win, canvas, state)
    }

    state.active.add(event.pointerId)
    const source = hitNode(doc, event.clientX, event.clientY)
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
    if (alreadyActive || !uid) return

    const hold = { pointerId: event.pointerId, ...pointer, timer: 0 }
    hold.timer = win.setTimeout(() => latchHold(doc, win, state, hold), v162Constants().HOLD_MS)
    state.hold = hold
  }

  function onHoldMove(event, win, state) {
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
      return
    }

    const drag = state.drag
    if (!drag || drag.pointerId !== event.pointerId) return
    drag.lastX = event.clientX
    drag.lastY = event.clientY
    const visual = visualPoint(event.clientX, event.clientY)
    movePreview(drag, event.clientX, event.clientY)
    mouse(win, win, 'mousemove', visual.x, visual.y, 1)
  }

  function onHoldUp(event, doc, win, canvas, state) {
    state.active.delete(event.pointerId)
    state.pointers.delete(event.pointerId)
    if (state.hold?.pointerId === event.pointerId) cancelHold(win, state)

    const drag = state.drag
    if (!drag || drag.pointerId !== event.pointerId) return

    event.preventDefault()
    event.stopImmediatePropagation()

    const canceled = doc.body.classList.contains('v2-cancel') || drag.multi
    const dockKind = canceled ? 'none' : dockDropKind(doc, event.clientX, event.clientY)
    const end = (canceled || dockKind !== 'none')
      ? { x: drag.x, y: drag.y }
      : visualPoint(event.clientX, event.clientY)

    if (canceled || dockKind !== 'none') mouse(win, win, 'mousemove', drag.x, drag.y, 1)
    mouse(win, win, 'mouseup', end.x, end.y, 0)

    cleanupDrag(doc, win, state, drag)
    dispatchPointerCancel(canvas, win, event.pointerId, event.clientX, event.clientY)
    if (dockKind === 'bank') sendDragToWordBank(doc, drag)
  }

  function onHoldCancel(event, doc, win, state) {
    state.active.delete(event.pointerId)
    state.pointers.delete(event.pointerId)
    if (state.hold?.pointerId === event.pointerId) cancelHold(win, state)

    const drag = state.drag
    if (!drag || drag.pointerId !== event.pointerId) return

    mouse(win, win, 'mousemove', drag.x, drag.y, 1)
    mouse(win, win, 'mouseup', drag.x, drag.y, 0)
    cleanupDrag(doc, win, state, drag)
  }

  function latchHold(doc, win, state, hold) {
    if (state.hold !== hold) return
    const pointer = state.pointers.get(hold.pointerId)
    if (!pointer || pointer.multi || state.active.size !== 1) return cancelHold(win, state)

    state.hold = null
    if (hold.timer) win.clearTimeout(hold.timer)

    const source = nodeByUid(doc, hold.uid) || hold.source
    const hierarchy = source?.__data__
    if (!source || !hierarchy) return

    const branch = typeof hierarchy.descendants === 'function' ? hierarchy.descendants() : [hierarchy]
    const uids = branch.map((item) => item?.data?._uid).filter(Boolean)
    freezeTreeLayout(doc, win)
    const previewHost = makeBranchPreview(doc, win, branch, hold.uid)
    if (!previewHost) return

    for (const uid of uids) nodeByUid(doc, uid)?.classList.add('v2-branch-origin-ghost')

    win.__logyqV2ConsumedPointers.add(hold.pointerId)
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
    }

    doc.body.classList.add('v2-branch-drag')
    bridge.selectByUid(hold.uid)
    const visual = visualPoint(hold.x, hold.y)
    mouse(source, win, 'mousedown', hold.x, hold.y, 1)
    stampOriginGhost(doc, uids)
    state.drag.originLayout = captureOriginLayout(doc, uids)
    mouse(win, win, 'mousemove', visual.x, visual.y, 1)
    movePreview(state.drag, hold.lastX, hold.lastY)
    startFeedbackLoop(doc, win, state)
    win.navigator.vibrate?.(12)
  }

  function makeBranchPreview(doc, win, branch, rootUid) {
    const nodes = []
    const centers = new Map()

    for (const item of branch) {
      const uid = item?.data?._uid
      const node = uid ? nodeByUid(doc, uid) : null
      if (!node) continue
      const rect = node.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) continue
      nodes.push({ item, uid, node, rect })
      centers.set(uid, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
    }
    if (!nodes.length) return null

    const host = doc.createElement('div')
    host.id = 'logyq-v162-branch-preview'
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('aria-hidden', 'true')
    host.appendChild(svg)

    for (const entry of nodes) {
      const parentUid = entry.item?.parent?.data?._uid
      if (!parentUid || !centers.has(parentUid)) continue
      const a = centers.get(parentUid)
      const b = centers.get(entry.uid)
      const line = doc.createElementNS('http://www.w3.org/2000/svg', 'line')
      line.setAttribute('x1', String(a.x)); line.setAttribute('y1', String(a.y))
      line.setAttribute('x2', String(b.x)); line.setAttribute('y2', String(b.y))
      svg.appendChild(line)
    }

    for (const entry of nodes) {
      const card = doc.createElement('div')
      card.className = `v2-float-node${entry.uid === rootUid ? ' is-root' : ''}`
      card.dataset.uid = entry.uid
      card.textContent = cardText(entry.node) || ' '
      card.style.left = `${entry.rect.left}px`
      card.style.top = `${entry.rect.top}px`
      card.style.width = `${entry.rect.width}px`
      card.style.height = `${entry.rect.height}px`
      const text = entry.node.querySelector('text')
      if (text) {
        const computed = win.getComputedStyle(text)
        if (computed.fontSize) card.style.fontSize = computed.fontSize
        if (computed.fontWeight) card.style.fontWeight = computed.fontWeight
      }
      host.appendChild(card)
    }

    doc.body.appendChild(host)
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
      const dockKind = dockDropKind(doc, drag.lastX, drag.lastY)
      doc.body.classList.toggle('v2-dock-target', dockKind === 'bank')
      if (dockKind === 'none') {
        edgePan(doc, win, drag.lastX, drag.lastY)
        const visual = visualPoint(drag.lastX, drag.lastY)
        mouse(win, win, 'mousemove', visual.x, visual.y, 1)
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
    for (const entry of layout || []) {
      const node = nodeByUid(doc, entry.uid)
      if (!node) continue
      if (entry.transform) node.setAttribute('transform', entry.transform)
      node.classList.add('v2-branch-origin-ghost')
    }
  }

  // Ported from public/logiq-v162-mobile/v2.js edgePan (also v2-ghost.js / clutch).
  // Finger toward an edge pans the map the opposite way so drop targets off-screen can be reached.
  function edgePan(doc, win, x, y) {
    const svg = doc.getElementById('canvas')
    if (!svg || !win.d3) return false
    const portrait = win.matchMedia('(orientation:portrait)').matches
    const leftInset = portrait ? 4 : 54
    const topInset = portrait ? 54 : 4
    const C = v162Constants()
    const step = (p, min, max) => {
      if (p < min + C.EDGE_ZONE) {
        const q = Math.max(0, Math.min(1, (min + C.EDGE_ZONE - p) / C.EDGE_ZONE))
        return C.EDGE_STEP * q * q
      }
      if (p > max - C.EDGE_ZONE) {
        const q = Math.max(0, Math.min(1, (p - (max - C.EDGE_ZONE)) / C.EDGE_ZONE))
        return -C.EDGE_STEP * q * q
      }
      return 0
    }
    const dx = step(x, leftInset, win.innerWidth)
    const dy = step(y, topInset, win.innerHeight - 4)
    if (!dx && !dy) return false
    const t = win.d3.zoomTransform(svg)
    const next = win.d3.zoomIdentity.translate(t.x + dx, t.y + dy).scale(t.k)
    svg.__zoom = next
    const root = Array.from(svg.children).find((child) => child.tagName?.toLowerCase() === 'g')
    if (root) root.setAttribute('transform', next.toString())
    return true
  }

  function getHandedness() {
    try {
      return localStorage.getItem(HAND_KEY) === 'left' ? 'left' : 'right'
    } catch (_error) {
      return 'right'
    }
  }

  function setHandedness(value) {
    const next = value === 'left' ? 'left' : 'right'
    try { localStorage.setItem(HAND_KEY, next) } catch (_error) {}
    syncHandednessUi(next)
    return next
  }

  function fingerOffset() {
    const C = v162Constants()
    const up = C.OFFSET_UP_CM * C.PX_PER_CM
    return { x: 0, y: -up }
  }

  function visualPoint(x, y) {
    const offset = fingerOffset()
    return { x: x + offset.x, y: y + offset.y }
  }

  function syncHandednessUi(value) {
    const hand = value === 'left' ? 'left' : 'right'
    const right = document.getElementById('logyqHandRight')
    const left = document.getElementById('logyqHandLeft')
    if (right) right.checked = hand === 'right'
    if (left) left.checked = hand === 'left'
    document.querySelectorAll('[data-hand]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.hand === hand)
    })
  }

  function bindHandednessUi() {
    syncHandednessUi(getHandedness())
    document.getElementById('logyqHandRight')?.addEventListener('change', () => setHandedness('right'))
    document.getElementById('logyqHandLeft')?.addEventListener('change', () => setHandedness('left'))
    document.querySelectorAll('[data-hand]').forEach((button) => {
      button.addEventListener('click', () => setHandedness(button.dataset.hand))
    })
  }

  function dockDropKind(doc, x, y) {
    const dock = doc.getElementById('Dock')
    if (!dock || dock.classList.contains('dock-hidden')) return 'none'
    const chipInset = 8
    const chips = Array.from(dock.querySelectorAll('.chip'))
    for (const chip of chips) {
      const rect = chip.getBoundingClientRect()
      if (rect.width < 12 || rect.height < 12) continue
      if (x >= rect.left + chipInset && x <= rect.right - chipInset && y >= rect.top + chipInset && y <= rect.bottom - chipInset) {
        return 'bank'
      }
    }
    const rect = dock.getBoundingClientRect()
    if (rect.width < 8 || rect.height < 8) return 'none'
    const slack = 16
    if (x >= rect.left - slack && x <= rect.right + slack && y >= rect.top - slack && y <= rect.bottom + slack) return 'near'
    return 'none'
  }

  function sendDragToWordBank(doc, drag) {
    const node = nodeByUid(doc, drag?.uid)
    const hierarchy = node?.__data__
    if (!hierarchy || !bridge.core?.treeOps?.sendSubtreeToWordBank) return
    bridge.selectByUid(drag.uid)
    bridge.core.treeOps.sendSubtreeToWordBank(hierarchy)
  }

  function cleanupDrag(doc, win, state, drag) {
    if (!drag) return
    drag.preview?.remove?.()
    for (const uid of drag.uids || []) nodeByUid(doc, uid)?.classList.remove('v2-branch-origin-ghost')
    doc.body.classList.remove('v2-branch-drag', 'v2-cancel', 'v2-dock-target')
    if (state.feedbackRaf) win.cancelAnimationFrame(state.feedbackRaf)
    state.feedbackRaf = 0
    if (state.drag === drag) state.drag = null
    win.setTimeout(() => win.__logyqV2ConsumedPointers.delete(drag.pointerId), 0)
  }

  function cancelHold(win, state) {
    const hold = state.hold
    if (!hold) return
    if (hold.timer) win.clearTimeout(hold.timer)
    state.hold = null
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

    const alreadyActive = state.active.size > 0
    if (alreadyActive) state.candidates.forEach((candidate) => { candidate.multi = true })
    state.active.add(event.pointerId)

    const node = hitNode(doc, event.clientX, event.clientY)
    const uid = nodeUid(node)
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

    if (candidate.uid && isFlick(dx, dy, elapsed)) {
      const direction = Math.abs(dx) > Math.abs(dy)
        ? (dx < 0 ? 'left' : 'right')
        : (dy < 0 ? 'up' : 'down')
      state.lastTap = null
      win.requestAnimationFrame(() => {
        restoreView(doc, win, candidate.view)
        bridge.selectByUid(candidate.uid)
        const createdUid = bridge.createRelative(direction)
        if (!createdUid) return
        const canvas = doc.getElementById('canvas')
        if (win.d3 && canvas) win.d3.select(canvas).interrupt()
        restoreView(doc, win, candidate.view)
        bridge.selectByUid(createdUid)
        armBlankCardMic(state.mic, doc, createdUid)
        win.requestAnimationFrame(() => {
          restoreView(doc, win, candidate.view)
          armBlankCardMic(state.mic, doc, createdUid)
        })
        win.navigator.vibrate?.(16)
      })
      return
    }

    if (candidate.moved) {
      state.lastTap = null
      return
    }

    const node = hitNode(doc, event.clientX, event.clientY)
    const uid = nodeUid(node)
    if (!uid || uid !== candidate.uid) {
      state.lastTap = null
      clearCardMic(state.mic)
      return
    }

    const now = win.performance.now()
    if (state.lastTap?.uid === uid && now - state.lastTap.time <= v162Constants().DOUBLE_TAP_MS) {
      state.lastTap = null
      clearCardMic(state.mic)
      bridge.selectByUid(uid)
      bridge.editSelected()
      return
    }

    bridge.selectByUid(uid)
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

  function nodeUid(node) {
    return node?.__data__?.data?._uid || null
  }

  function nodeByUid(doc, uid) {
    return Array.from(doc.querySelectorAll('g.node')).find((node) => nodeUid(node) === uid) || null
  }

  function hitNode(doc, x, y) {
    return Array.from(doc.querySelectorAll('g.node'))
      .filter((node) => {
        const rect = node.getBoundingClientRect()
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
      })
      .sort((a, b) => {
        const ar = a.getBoundingClientRect()
        const br = b.getBoundingClientRect()
        return ar.width * ar.height - br.width * br.height
      })[0] || null
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
  bindHandednessUi()
  if (preview.gestures) {
    preview.gestures.constants = v162Constants()
    preview.gestures.bindV162 = bindV162Gestures
    preview.gestures.armBlankCardMic = armBlankCardMic
    preview.gestures.edgePan = edgePan
    preview.gestures.fingerOffset = fingerOffset
    preview.gestures.visualPoint = visualPoint
    preview.gestures.getHandedness = getHandedness
    preview.gestures.setHandedness = setHandedness
    preview.gestures.yieldNodeDrag = yieldNodeDrag
    preview.gestures.dockDropKind = dockDropKind
  }
