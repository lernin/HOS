(() => {
  'use strict'

  const frame = document.getElementById('app')
  if (!frame) return

  frame.addEventListener('load', () => {
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
})()
