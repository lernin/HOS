(() => {
  'use strict'

  const frame = document.getElementById('app')
  if (!frame) return

  frame.addEventListener('load', () => {
    const doc = frame.contentDocument
    const win = frame.contentWindow
    if (!doc || !win || !win.matchMedia('((pointer:coarse) and (max-width:1200px)),((hover:none) and (max-width:1200px))').matches) return

    const style = doc.createElement('style')
    style.id = 'logiq-v2-drag-visual-fix'
    style.textContent = `
      @media (pointer:coarse) and (max-width:1200px),(hover:none) and (max-width:1200px){
        #logiq-v2-drag-card,.drag-mini,g.drag-mini{display:none!important;opacity:0!important;visibility:hidden!important}
        #logiq-v2-branch-preview .v2-float-node{transform:none!important;background:#fff!important;color:#374151!important;border:2px solid #fff!important;border-radius:10px!important;box-shadow:0 1px 3px rgba(0,0,0,.12),0 1px 2px rgba(0,0,0,.24)!important}
        #logiq-v2-branch-preview .v2-float-node.is-root{border-color:#22c55e!important;box-shadow:0 1px 3px rgba(0,0,0,.12),0 1px 2px rgba(0,0,0,.24)!important}
        body.logiq-mobile-v2.v2-cancel #logiq-v2-branch-preview .v2-float-node.is-root{border-color:#ef4444!important}
        body.logiq-mobile-v2.v2-branch-drag g.node.v2-branch-origin-ghost{opacity:.44!important}
        body.logiq-mobile-v2.v2-branch-drag g.node.v2-branch-origin-ghost rect:not(.grabzone){fill:#fff!important;stroke:#94a3b8!important;stroke-width:2px!important;stroke-dasharray:5 4!important;filter:drop-shadow(0 1px 2px rgba(0,0,0,.08))!important}
        body.logiq-mobile-v2.v2-branch-drag g.node.v2-branch-origin-ghost text{fill:#64748b!important;opacity:.82!important}
        body.logiq-mobile-v2.v2-branch-drag svg.dragging-mode g.nodes g.node.is-others{opacity:1!important}
        body.logiq-mobile-v2.v2-branch-drag svg.dragging-mode g.links path.link{opacity:1!important;stroke:var(--link-color)!important;transition:none!important}
        body.logiq-mobile-v2.v2-branch-drag svg.dragging-mode g.links path.link.is-sub-link,body.logiq-mobile-v2.v2-branch-drag svg.dragging-mode g.links path.link.is-parent-link{opacity:.38!important;stroke:#94a3b8!important}
        body.logiq-mobile-v2.v2-branch-drag{--det-node:transparent!important;--det-sib:transparent!important;--det-cousin-l:transparent!important;--det-cousin-r:transparent!important;--det-edge:transparent!important}
        body.logiq-mobile-v2.v2-branch-drag g.node.drop-target rect:not(.grabzone){fill:#22c55e!important;stroke:#22c55e!important;filter:drop-shadow(0 0 7px rgba(34,197,94,.28))!important}
        body.logiq-mobile-v2.v2-branch-drag g.node.drop-target text{fill:#fff!important;opacity:1!important}
        body.logiq-mobile-v2.v2-branch-drag .caret-dot{fill:#22c55e!important}
      }
    `
    doc.head.appendChild(style)
  })
})()
