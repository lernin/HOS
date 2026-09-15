/* The drag's geometry is captured once from the rendered SVG. Gesture code never
   chooses card size, type size, or branch spacing. Both moving and frozen origin
   layers use the same captured cards and shared visual rules. */
(() => {
  'use strict'

  function createPreview(doc, win, branch, rootUid) {
    const entries = []
    const centers = new Map()
    const svgCanvas = doc.getElementById('canvas')
    const zoom = win.d3?.zoomTransform(svgCanvas)?.k || 1

    for (const item of branch) {
      const uid = item?.data?._uid
      const node = Array.from(doc.querySelectorAll('g.node')).find(element => element.__data__?.data?._uid === uid)
      const rect = node?.getBoundingClientRect()
      // An incomplete moving representation must never become a root-only drag.
      if (!uid || !rect || rect.width < 1 || rect.height < 1) return null
      entries.push({ item, uid, node, rect })
      centers.set(uid, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
    }
    if (!entries.length) return null

    const host = doc.createElement('div')
    host.id = 'logiq-v2-branch-preview'
    host.className = 'v2-branch-layer'
    host.style.setProperty('--v2-link-width', `${Math.max(.6, 2 * zoom)}px`)
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('aria-hidden', 'true')
    host.appendChild(svg)

    for (const entry of entries) {
      const parentUid = entry.item?.parent?.data?._uid
      if (!parentUid || !centers.has(parentUid)) continue
      const a = centers.get(parentUid)
      const b = centers.get(entry.uid)
      const line = doc.createElementNS('http://www.w3.org/2000/svg', 'line')
      line.setAttribute('x1', String(a.x)); line.setAttribute('y1', String(a.y))
      line.setAttribute('x2', String(b.x)); line.setAttribute('y2', String(b.y))
      svg.appendChild(line)
    }

    for (const entry of entries) {
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

  function cardText(node) {
    const data = node?.__data__?.data || {}
    for (const key of ['label', 'text', 'name', 'title', 'value']) {
      if (typeof data[key] === 'string' && data[key].trim()) return data[key].trim()
    }
    return Array.from(node?.querySelectorAll?.('text') || [])
      .map(element => element.textContent?.trim() || '')
      .filter(Boolean).join(' ').trim()
  }

  const frame = document.getElementById('app')
  if (frame) frame.addEventListener('load', () => {
    const win = frame.contentWindow
    const doc = frame.contentDocument
    if (!win || !doc || !mobile(win)) return

    installStyles(doc)

    let frozen = null
    let expectedCards = 0
    let cancelIssued = false

    const preview = () => doc.getElementById('logiq-v2-branch-preview')
    const dragging = () => doc.body.classList.contains('v2-branch-drag')
    const cardCount = element => element?.querySelectorAll?.('.v2-float-node')?.length || 0

    const clear = () => {
      frozen?.remove?.()
      frozen = null
      expectedCards = 0
      cancelIssued = false
      doc.body.classList.remove('v2-origin-freeze-active')
    }

    const createFrozenOrigin = moving => {
      const clone = moving.cloneNode(true)
      clone.id = 'logiq-v2-origin-freeze'
      clone.setAttribute('aria-hidden', 'true')
      clone.style.transform = 'none'
      clone.style.willChange = 'auto'
      moving.parentNode?.insertBefore(clone, moving)
      frozen = clone
      expectedCards = cardCount(moving)
      doc.body.classList.add('v2-origin-freeze-active')
    }

    const ensure = () => {
      const moving = preview()
      if (!dragging() || !moving) {
        clear()
        return
      }

      if (!frozen) createFrozenOrigin(moving)
      else if (!frozen.isConnected) moving.parentNode?.insertBefore(frozen, moving)

      const movingCards = cardCount(moving)
      const frozenCards = cardCount(frozen)
      if (!expectedCards) expectedCards = movingCards

      /* Never allow a whole-branch gesture to degrade into a root-only drag. A partial
         preview means the drag representation is no longer trustworthy, so cancel safely. */
      if (!cancelIssued && expectedCards > 1 && (movingCards !== expectedCards || frozenCards !== expectedCards)) {
        cancelIssued = true
        win.LOGiQDragWatchdog?.forceCancel?.()
      }
    }

    /* Watch only structural changes. Desktop attraction feedback changes SVG classes on every
       drag frame; observing those classes created needless feedback work and could starve touch
       handling. Child-list changes are sufficient to detect/rebuild a vanished ghost or branch. */
    const observer = new MutationObserver(ensure)
    observer.observe(doc.body, { childList: true, subtree: true })

    win.addEventListener('pointermove', () => {
      if (dragging()) ensure()
    }, true)
    win.addEventListener('pointerup', () => win.queueMicrotask(ensure), true)
    win.addEventListener('pointercancel', () => win.queueMicrotask(ensure), true)

    win.LOGiQOriginGhost = Object.freeze({
      active: () => !!frozen?.isConnected,
      cardCount: () => cardCount(frozen),
      expectedCards: () => expectedCards,
    })
  })

  function mobile(win) {
    return win.matchMedia('((pointer:coarse) and (max-width:1200px)),((hover:none) and (max-width:1200px))').matches
  }

  function installStyles(doc) {
    const style = doc.createElement('style')
    style.id = 'logiq-v2-origin-freeze-styles'
    style.textContent = `
      @media (pointer:coarse) and (max-width:1200px),(hover:none) and (max-width:1200px){
        #logiq-v2-origin-freeze{position:fixed;inset:0;z-index:3930;pointer-events:none;overflow:visible;transform:none!important;will-change:auto!important}
        #logiq-v2-origin-freeze svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none}
        #logiq-v2-origin-freeze line{stroke:#94a3b8!important;stroke-width:var(--v2-link-width,2px)!important;stroke-linecap:round;opacity:.48!important}
        #logiq-v2-origin-freeze .v2-float-node{opacity:.48!important;background:#fff!important;color:#64748b!important;border-color:#94a3b8!important;border-style:dashed!important;box-shadow:0 1px 2px rgba(0,0,0,.08)!important;transform:none!important}
        #logiq-v2-origin-freeze .v2-float-node.is-root{border-color:#94a3b8!important}
        body.v2-origin-freeze-active g.node.v2-branch-origin-ghost{opacity:0!important}
      }
    `
    doc.head.appendChild(style)
  }
  window.LOGiQBranchGeometry = Object.freeze({ createPreview })
})()
