(() => {
  'use strict'

  const frame = document.getElementById('app')
  if (!frame) return

  const HOLD_MS = 280
  const HOLD_SLOP = 8

  frame.addEventListener('load', () => {
    const win = frame.contentWindow
    const doc = frame.contentDocument
    if (!win || !doc || !mobile(win)) return

    const canvas = doc.getElementById('canvas')
    if (!canvas) return

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
  })

  function mobile(win) {
    return win.matchMedia('((pointer:coarse) and (max-width:1200px)),((hover:none) and (max-width:1200px))').matches
  }

  function installStyles(doc) {
    const style = doc.createElement('style')
    style.id = 'logiq-v2-branch-affordance-styles'
    style.textContent = `
      @media (pointer:coarse) and (max-width:1200px),(hover:none) and (max-width:1200px){
        /* Replace both mobile's earlier fixed mini-card and desktop's drag mini with one exact-size branch preview. */
        #logiq-v2-drag-card{display:none!important}
        body.logiq-mobile-v2.v2-branch-drag .drag-mini{display:none!important;opacity:0!important}

        #logiq-v2-branch-preview{position:fixed;inset:0;z-index:3940;pointer-events:none;overflow:visible;transform:translate3d(0,0,0);will-change:transform}
        #logiq-v2-branch-preview svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none}
        #logiq-v2-branch-preview line{stroke:#cfcfcf;stroke-width:2;stroke-linecap:round}
        #logiq-v2-branch-preview .v2-float-node{position:absolute;box-sizing:border-box;display:flex;align-items:center;justify-content:center;padding:0 8px;border:2px solid #fff;border-radius:10px;background:#fff;color:#374151;box-shadow:0 1px 3px rgba(0,0,0,.12),0 1px 2px rgba(0,0,0,.24);font:600 14px/1.15 Inter,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transform:none!important}
        #logiq-v2-branch-preview .v2-float-node.is-root{border-color:#2563eb;box-shadow:0 8px 22px rgba(37,99,235,.18),0 1px 3px rgba(0,0,0,.16)}

        /* Keep the complete source branch in place as a ghost. */
        body.logiq-mobile-v2 .v2-branch-origin-ghost{opacity:.24!important}
        body.logiq-mobile-v2 .v2-branch-origin-ghost rect:not(.grabzone){fill:#f8fafc!important;stroke:#64748b!important;stroke-width:2px!important;stroke-dasharray:5 4!important}
        body.logiq-mobile-v2 .v2-branch-origin-ghost text{opacity:.58!important}

        /* Desktop drag mode normally hides every non-source node. Keep the stable tree visible on mobile,
           but dim it enough that the desktop hover-adopt wake-up remains obvious. */
        body.logiq-mobile-v2.v2-branch-drag svg.dragging-mode g.nodes g.node.is-others{opacity:.34!important}
        body.logiq-mobile-v2.v2-branch-drag svg.dragging-mode g.nodes g.node.hover-adopt-sub{opacity:.58!important}
        body.logiq-mobile-v2.v2-branch-drag svg.dragging-mode g.nodes g.node.hover-adopt{opacity:1!important}
        body.logiq-mobile-v2.v2-branch-drag g.node.drop-target rect:not(.grabzone){fill:#22c55e!important;filter:drop-shadow(0 0 7px rgba(34,197,94,.38))}
        body.logiq-mobile-v2.v2-branch-drag g.node.drop-target text{fill:#fff!important}

        /* Mobile has no visible trash target. Move the legacy hit box away so it can never steal a held-card drop. */
        body.logiq-mobile-v2.v2-branch-drag #trash{display:block!important;position:fixed!important;left:-10000px!important;right:auto!important;top:-10000px!important;bottom:auto!important}

        body.logiq-mobile-v2.v2-cancel #logiq-v2-branch-preview .v2-float-node.is-root{border-color:#ef4444;box-shadow:0 8px 22px rgba(239,68,68,.2)}
      }
    `
    doc.head.appendChild(style)
  }

  function onDown(event, doc, win, canvas, state) {
    if (event.pointerType === 'mouse') return
    if (!(event.target === canvas || canvas.contains(event.target))) return
    if (win.__logiqWorkingLocked) return

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

    /* Own the release so v2-ghost does not run a second synthetic drag transaction. */
    event.preventDefault()
    event.stopImmediatePropagation()

    const canceled = doc.body.classList.contains('v2-cancel') || drag.multi
    const endX = canceled ? drag.x : event.clientX
    const endY = canceled ? drag.y : event.clientY

    if (canceled) mouse(win, win, 'mousemove', drag.x, drag.y, 1)
    mouse(win, win, 'mouseup', endX, endY, 0)

    /* Let the existing V2 pointer-cancel path clear its hold/edge-pan bookkeeping without committing again. */
    cleanup(doc, win, state, drag)
    dispatchPointerCancel(canvas, win, event.pointerId, event.clientX, event.clientY)
  }

  function onCancel(event, doc, win, state) {
    state.active.delete(event.pointerId)
    state.pointers.delete(event.pointerId)
    if (state.hold?.pointerId === event.pointerId) cancelHold(win, state)

    const drag = state.drag
    if (!drag || drag.pointerId !== event.pointerId) return

    /* A system cancel returns the desktop drag to its source, which is a self-drop/no-op. */
    mouse(win, win, 'mousemove', drag.x, drag.y, 1)
    mouse(win, win, 'mouseup', drag.x, drag.y, 0)
    cleanup(doc, win, state, drag)
  }

  function latch(doc, win, state, hold) {
    if (state.hold !== hold) return
    if (win.__logiqWorkingLocked) return cancelHold(win, state)
    const pointer = state.pointers.get(hold.pointerId)
    if (!pointer || pointer.multi || state.active.size !== 1) return cancelHold(win, state)

    state.hold = null
    if (hold.timer) win.clearTimeout(hold.timer)

    const source = nodeByUid(doc, hold.uid) || hold.source
    const hierarchy = source?.__data__
    if (!source || !hierarchy) return

    const branch = typeof hierarchy.descendants === 'function' ? hierarchy.descendants() : [hierarchy]
    const uids = branch.map(item => item?.data?._uid).filter(Boolean)
    const preview = makeBranchPreview(doc, win, branch, hold.uid)
    if (!preview) return

    for (const uid of uids) nodeByUid(doc, uid)?.classList.add('v2-branch-origin-ghost')

    state.drag = {
      pointerId: hold.pointerId,
      uid: hold.uid,
      uids,
      x: hold.x,
      y: hold.y,
      lastX: hold.lastX,
      lastY: hold.lastY,
      preview,
      multi: false,
    }

    doc.body.classList.add('v2-branch-drag')

    /* This is the real desktop drag start. It marks the subtree and initializes the same
       Detectors.pick/drop-target/caret machinery desktop uses, but it does not mutate the tree. */
    mouse(source, win, 'mousedown', hold.x, hold.y, 1)
    mouse(win, win, 'mousemove', hold.lastX, hold.lastY, 1)
    movePreview(state.drag, hold.lastX, hold.lastY)
    startFeedbackLoop(win, state)
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
    host.id = 'logiq-v2-branch-preview'
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
      /* Exact on-screen dimensions: no scale-up on latch. */
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
    const dx = x - drag.x
    const dy = y - drag.y
    drag.preview.style.transform = `translate3d(${dx}px,${dy}px,0)`
  }

  function startFeedbackLoop(win, state) {
    if (state.feedbackRaf) win.cancelAnimationFrame(state.feedbackRaf)
    const tick = () => {
      const drag = state.drag
      if (!drag) { state.feedbackRaf = 0; return }
      /* Edge auto-pan changes graph coordinates even while the finger is stationary.
         Re-feeding the current pointer keeps desktop attraction/caret feedback live. */
      mouse(win, win, 'mousemove', drag.lastX, drag.lastY, 1)
      state.feedbackRaf = win.requestAnimationFrame(tick)
    }
    state.feedbackRaf = win.requestAnimationFrame(tick)
  }

  function cleanup(doc, win, state, drag) {
    if (!drag) return
    drag.preview?.remove?.()
    for (const uid of drag.uids || []) nodeByUid(doc, uid)?.classList.remove('v2-branch-origin-ghost')
    doc.body.classList.remove('v2-branch-drag')
    if (state.feedbackRaf) win.cancelAnimationFrame(state.feedbackRaf)
    state.feedbackRaf = 0
    if (state.drag === drag) state.drag = null
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
