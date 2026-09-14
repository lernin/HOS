(() => {
  'use strict'

  const frame = document.getElementById('app')
  if (!frame) return

  const FLICK_MIN = 52
  const FLICK_MAX_MS = 340
  const FLICK_RATIO = 1.45

  frame.addEventListener('load', () => {
    const win = frame.contentWindow
    const doc = frame.contentDocument
    const bridge = win?.LOGiQBridge
    if (!win || !doc || !bridge || !mobile(win)) return

    win.__logiqV2ConsumedPointers ||= new Set()
    const canvas = doc.getElementById('canvas')
    if (!canvas) return

    const active = new Set()
    const candidates = new Map()

    canvas.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse') return

      const alreadyActive = active.size > 0
      if (alreadyActive) candidates.forEach((candidate) => { candidate.multi = true })
      active.add(event.pointerId)

      const node = hitNode(doc, event.clientX, event.clientY)
      const uid = nodeUid(node)
      if (!uid) return

      candidates.set(event.pointerId, {
        uid,
        x: event.clientX,
        y: event.clientY,
        started: win.performance.now(),
        multi: alreadyActive,
        view: captureView(doc, win),
      })
    }, true)

    canvas.addEventListener('pointerup', (event) => {
      active.delete(event.pointerId)
      const candidate = candidates.get(event.pointerId)
      candidates.delete(event.pointerId)

      if (win.__logiqV2ConsumedPointers.has(event.pointerId)) {
        win.__logiqV2ConsumedPointers.delete(event.pointerId)
        return
      }
      if (!candidate || candidate.multi) return

      const dx = event.clientX - candidate.x
      const dy = event.clientY - candidate.y
      const elapsed = win.performance.now() - candidate.started
      if (!isFlick(dx, dy, elapsed)) return

      const direction = Math.abs(dx) > Math.abs(dy)
        ? (dx < 0 ? 'left' : 'right')
        : (dy < 0 ? 'up' : 'down')

      win.requestAnimationFrame(() => {
        restoreView(doc, win, candidate.view)
        bridge.selectByUid(candidate.uid)
        const createdUid = bridge.createRelative(direction)
        if (!createdUid) return
        bridge.selectByUid(createdUid)
        win.navigator.vibrate?.(16)
        revealBlankCardAction(doc, win, createdUid)
      })
    }, true)

    const clear = (event) => {
      active.delete(event.pointerId)
      candidates.delete(event.pointerId)
      win.__logiqV2ConsumedPointers.delete(event.pointerId)
    }
    canvas.addEventListener('pointercancel', clear, true)
  })

  function mobile(win) {
    return win.matchMedia('((pointer:coarse) and (max-width:1200px)),((hover:none) and (max-width:1200px))').matches
  }

  function isFlick(dx, dy, elapsed) {
    const major = Math.max(Math.abs(dx), Math.abs(dy))
    const minor = Math.max(1, Math.min(Math.abs(dx), Math.abs(dy)))
    return elapsed <= FLICK_MAX_MS && Math.hypot(dx, dy) >= FLICK_MIN && major / minor >= FLICK_RATIO
  }

  function nodeUid(node) {
    return node?.__data__?.data?._uid || null
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

  function revealBlankCardAction(doc, win, uid) {
    let attempts = 0
    const tick = () => {
      attempts += 1
      const node = Array.from(doc.querySelectorAll('g.node')).find((element) => nodeUid(element) === uid)
      if (!node) {
        if (attempts < 12) win.requestAnimationFrame(tick)
        return
      }

      const rect = node.getBoundingClientRect()
      const x = rect.left + rect.width / 2
      const y = rect.top + rect.height / 2
      const pointerId = 88001
      const options = {
        bubbles: true,
        cancelable: true,
        pointerType: 'touch',
        pointerId,
        isPrimary: true,
        button: 0,
        buttons: 1,
        clientX: x,
        clientY: y,
      }

      try {
        canvasEvent(doc, win, 'pointerdown', options)
        canvasEvent(doc, win, 'pointerup', { ...options, buttons: 0 })
      } catch (_) {}
    }
    win.requestAnimationFrame(tick)
  }

  function canvasEvent(doc, win, type, options) {
    doc.getElementById('canvas')?.dispatchEvent(new win.PointerEvent(type, options))
  }
})()