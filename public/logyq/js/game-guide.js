/* First-contact drag guides. Overlay only: never changes placement validation. */
(() => {
  'use strict'
  const ns = 'http://www.w3.org/2000/svg'
  let active = null, frame = null, until = 0
  function target(level, nodes) {
    if (!level?.guide) return null
    const anchor = nodes.find(node => node.data.gameId === level.tree.gameId || node.data.name === level.tree.name)
    if (!anchor) return null
    if (level.guide === 'sibling') {
      const child = nodes.find(node => node.data.gameId === level.tree.children[0]?.gameId)
      return child ? {x:child.x + 144, y:child.y} : null
    }
    return {x:anchor.x, y:anchor.y + (level.guide === 'above' ? -141 : 141)}
  }
  function svg(name, attrs, parent) {
    const el = document.createElementNS(ns, name)
    for (const [key, value] of Object.entries(attrs || {})) el.setAttribute(key, value)
    parent?.appendChild(el)
    return el
  }
  function hide() {
    if (frame !== null) cancelAnimationFrame(frame)
    frame = null
    active?.element.remove()
    active = null
  }
  function position() {
    if (!active) return
    const {level, core, element} = active
    const root = core.state.root
    const t = root && target(level, root.descendants())
    const chip = document.querySelector('#Dock .chip')
    if (!t || !chip) return
    const transform = window.d3.zoomTransform(document.getElementById('canvas'))
    const canvas = document.getElementById('canvas').getBoundingClientRect()
    const x = canvas.left + transform.applyX(t.x), y = canvas.top + transform.applyY(t.y)
    const w = 140 * transform.k, h = 63 * transform.k
    const ghost = element.querySelector('#logyq-guide-target')
    Object.assign(ghost.style, {left:(x-w/2)+'px', top:(y-h/2)+'px', width:w+'px', height:h+'px'})
    const source = chip.getBoundingClientRect(), dock = document.getElementById('Dock').getBoundingClientRect()
    const sx = source.left + source.width/2, sy = source.top - 8
    const endY = y + h/2 + 8
    const bend = Math.min(innerWidth - 20, Math.max(sx, x) + w/2 + 60)
    const d = level.guide === 'below'
      ? `M${sx},${sy} L${x},${endY}`
      : `M${sx},${sy} C${bend},${sy-70} ${bend},${endY+60} ${x},${endY}`
    element.querySelectorAll('#logyq-guide-arrow path').forEach(path => path.setAttribute('d',d))
    element.querySelector('#logyq-guide-instruction').style.top = (dock.top-34)+'px'
  }
  function tick() {
    frame = null
    if (!active) return
    position()
    if (performance.now() < until) frame = requestAnimationFrame(tick)
  }
  function refresh() {
    if (!active) return
    until = performance.now() + 900
    if (frame === null) frame = requestAnimationFrame(tick)
  }
  function show(level, core) {
    hide()
    if (!level?.guide || !core?.state?.root) return
    const element = document.createElement('div')
    element.id = 'logyq-drag-guide'
    element.dataset.kind = level.guide
    const instructions = {below:'Drag this piece into the space below.',above:'Drag this piece into the space above.',sibling:'Drag this piece beside the other child.'}
    const label = document.createElement('p')
    label.id = 'logyq-guide-instruction'; label.textContent = instructions[level.guide]
    label.setAttribute('role','status')
    const ghost = document.createElement('div'); ghost.id = 'logyq-guide-target'; ghost.setAttribute('aria-hidden','true')
    const face = svg('svg',{viewBox:'0 0 140 63'},ghost)
    const card = level.bankCards[level.bank[0]], grammar = window.LOGYQGameGrammar
    if (card?.paint) {
      const paint = grammar.parsePaint(card.paint), spec = grammar.paintSpec(card.paint)
      svg('rect',{width:140,height:63,fill:paint.shape==='W'?spec.solid:spec.stops[3][1]},face)
      if (paint.shape!=='W') {
        const d = paint.shape==='L'?'M0 0H140V31.5H0Z':paint.shape==='DL'?'M0 0H140V63Z':'M0 0H140L0 63Z'
        svg('path',{d,fill:spec.stops[0][1]},face)
      }
    } else {
      svg('rect',{width:140,height:63,rx:14,fill:'#fff',stroke:'#e2e8f0','stroke-width':2},face)
      const label = svg('text',{x:70,y:39,'text-anchor':'middle',fill:'#0f172a','font-size':22,'font-weight':700},face)
      label.textContent = String(card?.name || '')
    }
    const arrow = svg('svg',{id:'logyq-guide-arrow','aria-hidden':'true'})
    const defs = svg('defs',{},arrow)
    const marker = svg('marker',{id:'logyq-guide-head',viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:6,markerHeight:6,orient:'auto'},defs)
    svg('polygon',{points:'0,0 10,5 0,10',fill:'#334155'},marker)
    svg('path',{fill:'none',stroke:'white','stroke-width':6,opacity:.85},arrow)
    svg('path',{class:'guide-flow',fill:'none',stroke:'#334155','stroke-width':2.5,'marker-end':'url(#logyq-guide-head)'},arrow)
    element.append(arrow,ghost,label); document.body.appendChild(element)
    active = {level,core,element}; refresh()
  }
  window.LOGYQGameGuide = Object.freeze({show,hide,refresh,target})
})()
