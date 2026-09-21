(() => {
  'use strict'

  const frame = document.getElementById('app')
  if (!frame) return

  const HOLD_MS = 280
  const HOLD_SLOP = 8
  const EDGE_ZONE = 84
  const EDGE_STEP = 14

  frame.addEventListener('load', () => {
    const win = frame.contentWindow
    const doc = frame.contentDocument
    if (!win || !doc || !mobile(win)) return

    const canvas = doc.getElementById('canvas')
    if (!canvas) return

    /* One owner for held-card movement. v2-ghost still owns tap/edit/MIC, but it must not
       create a second drag preview/transaction in parallel with this branch drag. */
    win.__logiqBranchDragOwnsHold = true
    win.__logiqV2ConsumedPointers ||= new Set()

    installStyles(doc)

    const state = {
      active: new Set(),
      pointers: new Map(),
      hold: null,
      drag: null,
      feedbackRaf: 0,
    }

    win.addEventListener('pointerdown', (event) => onDown(event, doc, win, canvas, state), true)
    win.addEventListener('pointermove', (event) => onMove(event, doc, win, state), true)
    win.addEventListener('pointerup', (event) => onUp(event, doc, win, canvas, state), true)
    win.addEventListener('pointercancel', (event) => onCancel(event, doc, win, state), true)

    /* Android/Chrome can otherwise manufacture a native text/group drag image from SVG content.
       The mobile branch engine is pointer-driven; native HTML drag/drop must never run in parallel. */
    const suppressNativeDrag = (event) => {
      if (!state.drag) return
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    win.addEventListener('dragstart', suppressNativeDrag, true)
    win.addEventListener('drop', suppressNativeDrag, true)
  })

  function mobile(win) {
    return win.matchMedia('((pointer:coarse) and (max-width:1200px)),((hover:none) and (max-width:1200px))').matches
  }

  function installStyles(doc) {
    const style = doc.createElement('style')
    style.id = 'logiq-v2-branch-affordance-styles'
    style.textContent = `
      @media (pointer:coarse) and (max-width:1200px),(hover:none) and (max-width:1200px){
        #logiq-v2-drag-card{display:none!important}
        body.logiq-mobile-v2.v2-branch-drag .drag-mini{display:none!important;opacity:0!important}
        body.logiq-mobile-v2.v2-branch-drag #Dock{visibility:hidden!important;pointer-events:none!important}
        body.logiq-mobile-v2.v2-branch-drag svg#canvas,body.logiq-mobile-v2.v2-branch-drag svg#canvas *{-webkit-user-drag:none!important}

        #logiq-v2-branch-preview{position:fixed;inset:0;z-index:3940;pointer-events:none;overflow:visible;transform:translate3d(0,0,0);will-change:transform}
        #logiq-v2-branch-preview svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none}
        #logiq-v2-branch-preview line{stroke:#cfcfcf;stroke-width:var(--v2-link-width,2px);stroke-linecap:round}
        #logiq-v2-branch-preview .v2-float-node{position:absolute;box-sizing:border-box;display:flex;align-items:center;justify-content:center;padding:0 var(--v2-pad-x,8px);border:var(--v2-border-width,2px) solid #fff;border-radius:var(--v2-radius,10px);background:#fff;color:#374151;box-shadow:0 1px 3px rgba(0,0,0,.12),0 1px 2px rgba(0,0,0,.24);font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;font-weight:600;line-height:1.15;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transform:none!important}
        #logiq-v2-branch-preview .v2-float-node.is-root{border-color:#22c55e}

        body.logiq-mobile-v2 .v2-branch-origin-ghost{opacity:.44!important}
        body.logiq-mobile-v2 .v2-branch-origin-ghost rect:not(.grabzone){fill:#fff!important;stroke:#94a3b8!important;stroke-width:2px!important;stroke-dasharray:5 4!important}
        body.logiq-mobile-v2 .v2-branch-origin-ghost text{fill:#64748b!important;opacity:.82!important}

        body.logiq-mobile-v2.v2-branch-drag svg.dragging-mode g.nodes g.node.is-others{opacity:1!important}
        body.logiq-mobile-v2.v2-branch-drag svg.dragging-mode g.nodes g.node.hover-adopt-sub{opacity:.58!important}
        body.logiq-mobile-v2.v2-branch-drag svg.dragging-mode g.nodes g.node.hover-adopt{opacity:1!important}
        body.logiq-mobile-v2.v2-branch-drag g.node.drop-target rect:not(.grabzone){fill:#22c55e!important;filter:drop-shadow(0 0 7px rgba(34,197,94,.38))}
        body.logiq-mobile-v2.v2-branch-drag g.node.drop-target text{fill:#fff!important}

        body.logiq-mobile-v2.v2-branch-drag #trash{display:block!important;position:fixed!important;left:-10000px!important;right:auto!important;top:-10000px!important;bottom:auto!important}
        body.logiq-mobile-v2.v2-cancel #logiq-v2-branch-preview .v2-float-node.is-root{border-color:#ef4444}
      }
    `
    doc.head.appendChild(style)
  }

  function onDown(event, doc, win, canvas, state) {
    if (event.pointerType === 'mouse') return
    if (!(event.target === canvas || canvas.contains(event.target))) return
    canvas.setPointerCapture?.(event.pointerId)

    const alreadyActive = state.active.size > 0
    if (alreadyActive) {
      state.pointers.forEach(pointer => { pointer.multi = true })
      cancelHold(win, state)
      if (state.drag) state.drag.multi = true
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
    hold.timer = win.setTimeout(() => latch(doc, win, state, hold), HOLD_MS)
    state.hold = hold
  }

  function onMove(event, doc, win, state) {
    const pointer = state.pointers.get(event.pointerId)
    if (!pointer) return
    pointer.lastX = event.clientX
    pointer.lastY = event.clientY

    if (state.hold?.pointerId === event.pointerId) {
      state.hold.lastX = event.clientX
      state.hold.lastY = event.clientY
      if (Math.hypot(event.clientX - state.hold.x, event.clientY - state.hold.y) > HOLD_SLOP) cancelHold(win, state)
      return
    }

    const drag = state.drag
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    drag.lastX = event.clientX
    drag.lastY = event.clientY
    movePreview(drag, event.clientX, event.clientY)
    mouse(win, win, 'mousemove', event.clientX, event.clientY, 1)
  }

  function onUp(event, doc, win, canvas, state) {
    state.active.delete(event.pointerId)
    state.pointers.delete(event.pointerId)
    if (state.hold?.pointerId === event.pointerId) cancelHold(win, state)

    const drag = state.drag
    if (!drag || drag.pointerId !== event.pointerId) return

    event.preventDefault()
    event.stopImmediatePropagation()

    const explicitCancel = doc.body.classList.contains('v2-cancel') || drag.multi
    if (!explicitCancel) mouse(win, win, 'mousemove', event.clientX, event.clientY, 1)

    /* A background release is not a destructive action. If desktop's attraction engine has
       no live node/caret destination, return the synthetic drag to its source before release. */
    const validDrop = !explicitCancel && hasActiveDrop(doc, win)
    const snapBack = explicitCancel || !validDrop
    const endX = snapBack ? drag.x : event.clientX
    const endY = snapBack ? drag.y : event.clientY

    if (snapBack) mouse(win, win, 'mousemove', drag.x, drag.y, 1)
    mouse(win, win, 'mouseup', endX, endY, 0)

    settleRelease(win, drag, snapBack)
    cleanup(doc, win, state, drag)
    dispatchPointerCancel(canvas, win, event.pointerId, event.clientX, event.clientY)
  }

  function onCancel(event, doc, win, state) {
    state.active.delete(event.pointerId)
    state.pointers.delete(event.pointerId)
    if (state.hold?.pointerId === event.pointerId) cancelHold(win, state)

    const drag = state.drag
    if (!drag || drag.pointerId !== event.pointerId) return

    mouse(win, win, 'mousemove', drag.x, drag.y, 1)
    mouse(win, win, 'mouseup', drag.x, drag.y, 0)
    settleRelease(win, drag, true)
    cleanup(doc, win, state, drag)
  }

  function latch(doc, win, state, hold) {
    if (state.hold !== hold) return
    const pointer = state.pointers.get(hold.pointerId)
    if (!pointer || pointer.multi || state.active.size !== 1) return cancelHold(win, state)

    state.hold = null
    if (hold.timer) win.clearTimeout(hold.timer)

    const source = nodeByUid(doc, hold.uid) || hold.source
    const hierarchy = source?.__data__
    if (!source || !hierarchy) return

    const branch = typeof hierarchy.descendants === 'function' ? hierarchy.descendants() : [hierarchy]
    const uids = branch.map(item => item?.data?._uid).filter(Boolean)
    const preview = makeBranchPreview(doc, win, [hierarchy], hold.uid)
    if (!preview) return

    const bridge = win.LOGiQBridge
    const before = captureState(bridge)

    /* Mobile hold always means exactly this card's subtree. Desktop's selectedUids is a
       separate group-edit concept and may be stale from an earlier operation, so clear it
       before feeding the synthetic desktop drag lifecycle. */
    bridge?.clearFocusSelection?.()
    bridge?.selectByUid?.(hold.uid)

    nodeByUid(doc, hold.uid)?.classList.add('v2-branch-origin-ghost')

    state.drag = {
      pointerId: hold.pointerId,
      uid: hold.uid,
      uids,
      x: hold.x,
      y: hold.y,
      lastX: hold.lastX,
      lastY: hold.lastY,
      preview,
      before,
      multi: false,
    }

    win.__logiqV2ConsumedPointers.add(hold.pointerId)
    win.__logiqV2DragActive = true
    doc.body.classList.add('v2-branch-drag')

    mouse(source, win, 'mousedown', hold.x, hold.y, 1)
    mouse(win, win, 'mousemove', hold.lastX, hold.lastY, 1)
    movePreview(state.drag, hold.lastX, hold.lastY)
    startFeedbackLoop(doc, win, state)
    win.navigator.vibrate?.(12)
  }

  function makeBranchPreview(doc, win, branch, rootUid) {
    const nodes = []
    const centers = new Map()
    const zoom = currentZoom(doc, win)

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
    host.id = 'logiq-v2-branch-preview'
    host.style.setProperty('--v2-link-width', `${Math.max(.6, 2 * zoom)}px`)
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
      card.style.setProperty('--v2-border-width', `${Math.max(.7, 2 * zoom)}px`)
      card.style.setProperty('--v2-radius', `${Math.max(2, 10 * zoom)}px`)
      card.style.setProperty('--v2-pad-x', `${Math.max(1, 8 * zoom)}px`)
      const text = entry.node.querySelector('text')
      if (text) {
        const computed = win.getComputedStyle(text)
        const baseSize = Number.parseFloat(computed.fontSize)
        if (Number.isFinite(baseSize)) card.style.fontSize = `${Math.max(1, baseSize * zoom)}px`
        if (computed.fontWeight) card.style.fontWeight = computed.fontWeight
        if (computed.fontFamily) card.style.fontFamily = computed.fontFamily
      }
      host.appendChild(card)
    }

    doc.body.appendChild(host)
    return host
  }

  function currentZoom(doc, win) {
    try {
      const svg = doc.getElementById('canvas')
      const k = win.d3?.zoomTransform(svg)?.k
      return Number.isFinite(k) && k > 0 ? k : 1
    } catch (_) { return 1 }
  }

  function movePreview(drag, x, y) {
    if (!drag?.preview) return
    const dx = x - drag.x
    const dy = y - drag.y
    drag.preview.style.transform = `translate3d(${dx}px,${dy}px,0)`
  }

  function startFeedbackLoop(doc, win, state) {
    if (state.feedbackRaf) win.cancelAnimationFrame(state.feedbackRaf)
    const tick = () => {
      const drag = state.drag
      if (!drag) { state.feedbackRaf = 0; return }
      edgePan(doc, win, drag.lastX, drag.lastY)
      mouse(win, win, 'mousemove', drag.lastX, drag.lastY, 1)
      state.feedbackRaf = win.requestAnimationFrame(tick)
    }
    state.feedbackRaf = win.requestAnimationFrame(tick)
  }

  function edgePan(doc, win, x, y) {
    const svg = doc.getElementById('canvas')
    if (!svg || !win.d3) return false
    const portrait = win.matchMedia('(orientation:portrait)').matches
    const leftInset = portrait ? 4 : 54
    const topInset = portrait ? 54 : 4
    const step = (p, min, max) => {
      if (p < min + EDGE_ZONE) {
        const q = Math.max(0, Math.min(1, (min + EDGE_ZONE - p) / EDGE_ZONE))
        return EDGE_STEP * q * q
      }
      if (p > max - EDGE_ZONE) {
        const q = Math.max(0, Math.min(1, (p - (max - EDGE_ZONE)) / EDGE_ZONE))
        return -EDGE_STEP * q * q
      }
      return 0
    }
    const dx = step(x, leftInset, win.innerWidth)
    const dy = step(y, topInset, win.innerHeight - 4)
    if (!dx && !dy) return false
    const t = win.d3.zoomTransform(svg)
    const next = win.d3.zoomIdentity.translate(t.x + dx, t.y + dy).scale(t.k)
    svg.__zoom = next
    const root = Array.from(svg.children).find(child => child.tagName?.toLowerCase() === 'g')
    if (root) root.setAttribute('transform', next.toString())
    return true
  }

  function hasActiveDrop(doc, win) {
    if (doc.querySelector('g.node.drop-target')) return true
    const caret = doc.querySelector('.caret-dot')
    if (!caret) return false
    const inline = Number.parseFloat(caret.style.opacity || '0')
    if (inline > .05) return true
    const computed = Number.parseFloat(win.getComputedStyle(caret).opacity || '0')
    return computed > .05
  }

  function settleRelease(win, drag, snapBack) {
    const bridge = win.LOGiQBridge
    if (!bridge || !drag?.before) return
    win.setTimeout(() => {
      const after = bridge.snapshot()
      const bankChanged = JSON.stringify(after?.wordBank || []) !== JSON.stringify(drag.before.wordBank || [])
      const missingBranchNode = (drag.uids || []).some(uid => !treeHasUid(after?.tree, uid))
      const changedOnSnapBack = snapBack && stableState(after) !== stableState(drag.before)

      /* A structural drag must never create/delete Word Dock entries or lose part of the branch.
         If the legacy engine ever does that, restore the exact pre-drag snapshot instead of
         leaving a fragile/corrupted map. Background release is always an exact no-op. */
      if (bankChanged || missingBranchNode || changedOnSnapBack) {
        bridge.loadMap(drag.before.tree, drag.before.wordBank)
        bridge.selectByUid(drag.uid)
      }
    }, 0)
  }

  function captureState(bridge) {
    const snapshot = bridge?.snapshot?.() || {}
    return {
      tree: snapshot.tree ? JSON.parse(JSON.stringify(snapshot.tree)) : null,
      wordBank: Array.isArray(snapshot.wordBank) ? snapshot.wordBank.slice() : [],
    }
  }

  function stableState(value) {
    return JSON.stringify({
      tree: value?.tree || null,
      wordBank: Array.isArray(value?.wordBank) ? value.wordBank : [],
    })
  }

  function treeHasUid(node, uid) {
    if (!node) return false
    if (node._uid === uid) return true
    return Array.isArray(node.children) && node.children.some(child => treeHasUid(child, uid))
  }

  function cleanup(doc, win, state, drag) {
    if (!drag) return
    const canvas = doc.getElementById('canvas')
    canvas?.releasePointerCapture?.(drag.pointerId)
    drag.preview?.remove?.()
    for (const uid of drag.uids || []) nodeByUid(doc, uid)?.classList.remove('v2-branch-origin-ghost')
    doc.body.classList.remove('v2-branch-drag')
    if (state.feedbackRaf) win.cancelAnimationFrame(state.feedbackRaf)
    state.feedbackRaf = 0
    if (state.drag === drag) state.drag = null
    win.__logiqV2DragActive = false
    win.setTimeout(() => win.__logiqV2ConsumedPointers.delete(drag.pointerId), 0)
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
    } catch (_) {}
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
    } catch (_) {}
  }

  function nodeUid(node) {
    return node?.__data__?.data?._uid || null
  }

  function nodeByUid(doc, uid) {
    return Array.from(doc.querySelectorAll('g.node')).find(node => nodeUid(node) === uid) || null
  }

  function hitNode(doc, x, y) {
    return Array.from(doc.querySelectorAll('g.node'))
      .filter(node => {
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
    for (const key of ['label','text','name','title','value']) {
      if (typeof data[key] === 'string' && data[key].trim()) return data[key].trim()
    }
    return Array.from(node?.querySelectorAll?.('text') || [])
      .map(element => element.textContent?.trim() || '')
      .filter(Boolean)
      .join(' ')
      .trim()
  }
})()
