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

  window.LOGiQBranchGeometry = Object.freeze({ createPreview })
})()
