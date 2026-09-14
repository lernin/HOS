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
    installDesktopFeedbackBridge(doc)

    const state = {
      active: new Set(),
      pointers: new Map(),
      hold: null,
      drag: null,
      cleanupTimer: 0,
    }

    win.addEventListener('pointerdown', (event) => onDown(event, doc, win, canvas, state), true)
    win.addEventListener('pointermove', (event) => onMove(event, doc, win, state), true)
    win.addEventListener('pointerup', (event) => onUp(event, doc, win, state), true)
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
        /* The branch preview replaces the earlier single-card preview. */
        #logiq-v2-drag-card{display:none!important}
        #logiq-v2-branch-preview{position:fixed;inset:0;z-index:3940;pointer-events:none;overflow:visible;transform:translate3d(0,0,0);will-change:transform}
        #logiq-v2-branch-preview svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none}
        #logiq-v2-branch-preview line{stroke:#cfcfcf;stroke-width:2;stroke-linecap:round}
        #logiq-v2-branch-preview .v2-float-node{position:absolute;box-sizing:border-box;display:flex;align-items:center;justify-content:center;padding:0 8px;border:2px solid #fff;border-radius:10px;background:#fff;color:#374151;box-shadow:0 1px 3px rgba(0,0,0,.12),0 1px 2px rgba(0,0,0,.24);font:600 14px/1.15 Inter,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        #logiq-v2-branch-preview .v2-float-node.is-root{border-color:#2563eb;box-shadow:0 8px 22px rgba(37,99,235,.18),0 1px 3px rgba(0,0,0,.16)}
        body.logiq-mobile-v2 .v2-branch-origin-ghost{opacity:.24!important}
        body.logiq-mobile-v2 .v2-branch-origin-ghost rect:not(.grabzone){fill:#f8fafc!important;stroke:#64748b!important;stroke-width:2px!important;stroke-dasharray:5 4!important}
        body.logiq-mobile-v2 .v2-branch-origin-ghost text{opacity:.58!important}
        body.logiq-mobile-v2.v2-cancel #logiq-v2-branch-preview .v2-float-node.is-root{border-color:#ef4444;box-shadow:0 8px 22px rgba(239,68,68,.2)}
        body.logiq-mobile-v2.v2-branch-drag g.node.drop-target rect:not(.grabzone){fill:#22c55e!important;filter:drop-shadow(0 0 7px rgba(34,197,94,.38))}
        body.logiq-mobile-v2.v2-branch-drag g.node.drop-target text{fill:#fff!important}
      }
    `
    doc.head.appendChild(style)
  }

  function installDesktopFeedbackBridge(doc) {
    const script = doc.createElement('script')
    script.id = 'logiq-v2-desktop-feedback-bridge'
    script.textContent = `
      (() => {
        try {
          window.__logiqV2DesktopFeedback = {
            pickScreen(clientX, clientY) {
              const svg = elements.svg.node()
              const rect = svg.getBoundingClientRect()
              const px = clientX - rect.left
              const py = clientY - rect.top
              const t = d3.zoomTransform(svg)
              const [gx, gy] = t.invert([px, py])
              return Detectors.pick({ x: gx, y: gy })
            },
            show(drop, excludedUids) {
              const excluded = new Set(excludedUids || [])
              elements.caretDot.style('opacity', 0)
              elements.gNodes.selectAll('g.node').classed('drop-target hover-adopt hover-adopt-sub', false)
              if (!drop) return null

              if (drop.type === 'node') {
                if (excluded.has(drop.targetUid)) return null
                const targetH = state.root?.descendants().find(n => n.data && n.data._uid === drop.targetUid)
                if (!targetH) return null
                elements.gNodes.selectAll('g.node')
                  .filter(n => n.data && n.data._uid === drop.targetUid)
                  .classed('drop-target hover-adopt', true)
                const subUids = new Set(targetH.descendants().map(n => n.data._uid))
                elements.gNodes.selectAll('g.node')
                  .filter(n => n.data && subUids.has(n.data._uid))
                  .classed('hover-adopt-sub', true)
                return { type: 'node', targetUid: drop.targetUid }
              }

              if (drop.type === 'gap') {
                if (excluded.has(drop.parentUid)) return null
                const [cx, cy] = caretXYFromHit(drop._hit)
                elements.caretDot.attr('cx', cx).attr('cy', cy).attr('r', CONFIG.CARET_DOT_RADIUS).style('opacity', 1)
                return { type: 'gap', parentUid: drop.parentUid, prevUid: drop.prevUid, nextUid: drop.nextUid }
              }

              if (drop.type === 'rootAbove') {
                const [cx, cy] = caretXYFromHit(drop._hit)
                elements.caretDot.attr('cx', cx).attr('cy', cy).attr('r', CONFIG.CARET_DOT_RADIUS).style('opacity', 1)
                return { type: 'rootAbove' }
              }
              return null
            },
            clear() {
              elements.caretDot.style('opacity', 0)
              elements.gNodes.selectAll('g.node').classed('drop-target hover-adopt hover-adopt-sub', false)
            }
          }
        } catch (error) {
          window.__logiqV2DesktopFeedback = null
        }
      })()
    `
    doc.head.appendChild(script)
  }

  function onDown(event, doc, win, canvas, state) {
    if (event.pointerType === 'mouse') return
    if (!(event.target === canvas || canvas.contains(event.target))) return

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
      moved: false,
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
      if (Math.hypot(event.clientX - state.hold.x, event.clientY - state.hold.y) > HOLD_SLOP) {
        pointer.moved = true
        cancelHold(win, state)
      }
      return
    }

    const drag = state.drag
    if (!drag || drag.pointerId !== event.pointerId) return
    drag.lastX = event.clientX
    drag.lastY = event.clientY
    movePreview(doc, win, drag, event.clientX, event.clientY)
  }

  function onUp(event, doc, win, state) {
    state.active.delete(event.pointerId)
    state.pointers.delete(event.pointerId)
    if (state.hold?.pointerId === event.pointerId) cancelHold(win, state)
    if (!state.drag || state.drag.pointerId !== event.pointerId) return
    const drag = state.drag
    if (state.cleanupTimer) win.clearTimeout(state.cleanupTimer)
    state.cleanupTimer = win.setTimeout(() => cleanup(doc, state, drag), 0)
  }

  function onCancel(event, doc, win, state) {
    state.active.delete(event.pointerId)
    state.pointers.delete(event.pointerId)
    if (state.hold?.pointerId === event.pointerId) cancelHold(win, state)
    if (state.drag?.pointerId === event.pointerId) cleanup(doc, state, state.drag)
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
    const uidSet = new Set(uids)
    const preview = makeBranchPreview(doc, win, branch, hold.uid)
    if (!preview) return

    for (const uid of uids) nodeByUid(doc, uid)?.classList.add('v2-branch-origin-ghost')

    const rootRect = source.getBoundingClientRect()
    state.drag = {
      pointerId: hold.pointerId,
      uid: hold.uid,
      uids,
      uidSet,
      x: hold.x,
      y: hold.y,
      lastX: hold.lastX,
      lastY: hold.lastY,
      rootCenterX: rootRect.left + rootRect.width / 2,
      rootCenterY: rootRect.top + rootRect.height / 2,
      preview,
      multi: false,
      lastDrop: null,
    }
    doc.body.classList.add('v2-branch-drag')
    movePreview(doc, win, state.drag, hold.lastX, hold.lastY)
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
      const entry = { item, uid, node, rect }
      nodes.push(entry)
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

  function movePreview(doc, win, drag, x, y) {
    if (!drag?.preview) return
    const dx = x - drag.x
    const dy = y - drag.y
    drag.preview.style.transform = `translate3d(${dx}px,${dy}px,0)`

    const centerX = drag.rootCenterX + dx
    const centerY = drag.rootCenterY + dy
    const feedback = win.__logiqV2DesktopFeedback
    if (!feedback) return
    try {
      const drop = feedback.pickScreen(centerX, centerY)
      drag.lastDrop = feedback.show(drop, drag.uids)
    } catch (_) {
      drag.lastDrop = null
    }
  }

  function cleanup(doc, state, drag) {
    if (!drag) return
    drag.preview?.remove?.()
    for (const uid of drag.uids || []) nodeByUid(doc, uid)?.classList.remove('v2-branch-origin-ghost')
    try { frame.contentWindow?.__logiqV2DesktopFeedback?.clear?.() } catch (_) {}
    doc.body.classList.remove('v2-branch-drag')
    if (state.drag === drag) state.drag = null
    state.cleanupTimer = 0
  }

  function cancelHold(win, state) {
    const hold = state.hold
    if (!hold) return
    if (hold.timer) win.clearTimeout(hold.timer)
    state.hold = null
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
