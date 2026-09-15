(() => {
  'use strict'

  const frame = document.getElementById('app')
  if (!frame) return

  const IDLE_CANCEL_MS = 6000

  frame.addEventListener('load', () => {
    const win = frame.contentWindow
    const doc = frame.contentDocument
    const bridge = win?.LOGiQBridge
    const canvas = doc?.getElementById('canvas')
    if (!win || !doc || !bridge || !canvas) return

    const state = {
      pointerId: null,
      x: 0,
      y: 0,
      lastEventAt: 0,
      before: null,
      canceling: false,
    }

    const snapshot = () => {
      const value = bridge.snapshot()
      return {
        tree: value?.tree ? JSON.parse(JSON.stringify(value.tree)) : null,
        wordBank: Array.isArray(value?.wordBank) ? value.wordBank.slice() : [],
      }
    }

    const stable = value => JSON.stringify({
      tree: value?.tree || null,
      wordBank: Array.isArray(value?.wordBank) ? value.wordBank : [],
    })

    const clear = () => {
      state.pointerId = null
      state.before = null
      state.canceling = false
      state.lastEventAt = 0
    }

    const forceCancel = reason => {
      if (state.canceling || state.pointerId == null) return
      state.canceling = true
      const pointerId = state.pointerId
      const before = state.before

      try {
        canvas.dispatchEvent(new win.PointerEvent('pointercancel', {
          bubbles: true,
          cancelable: true,
          pointerType: 'touch',
          pointerId,
          isPrimary: true,
          clientX: state.x,
          clientY: state.y,
          buttons: 0,
        }))
      } catch (_) {}

      // Defensive exact restore if a browser interruption happened during a structural drag.
      win.setTimeout(() => {
        if (before && stable(bridge.snapshot()) !== stable(before)) {
          bridge.loadMap(before.tree, before.wordBank)
        }
        doc.getElementById('logiq-v2-branch-preview')?.remove()
        doc.querySelectorAll('.v2-branch-origin-ghost').forEach(node => node.classList.remove('v2-branch-origin-ghost'))
        doc.body.classList.remove('v2-branch-drag', 'v2-cancel')
        win.__logiqV2DragActive = false
        clear()
        win.LOGiQDragWatchdogLastCancel = reason
      }, 0)
    }

    win.addEventListener('pointerdown', event => {
      if (event.pointerType === 'mouse') return
      if (!(event.target === canvas || canvas.contains(event.target))) return

      if (win.__logiqV2DragActive && state.pointerId != null && event.pointerId !== state.pointerId) {
        forceCancel('second-touch')
        return
      }

      if (state.pointerId == null) {
        state.pointerId = event.pointerId
        state.x = event.clientX
        state.y = event.clientY
        state.lastEventAt = win.performance.now()
        state.before = snapshot()
        try { canvas.setPointerCapture?.(event.pointerId) } catch (_) {}
      }
    }, true)

    win.addEventListener('pointermove', event => {
      if (event.pointerId !== state.pointerId) return
      state.x = event.clientX
      state.y = event.clientY
      state.lastEventAt = win.performance.now()
    }, true)

    win.addEventListener('pointerup', event => {
      if (event.pointerId === state.pointerId) clear()
    }, true)

    win.addEventListener('pointercancel', event => {
      if (event.pointerId === state.pointerId) clear()
    }, true)

    win.addEventListener('blur', () => forceCancel('blur'), true)
    win.addEventListener('pagehide', () => forceCancel('pagehide'), true)
    doc.addEventListener('visibilitychange', () => {
      if (doc.visibilityState === 'hidden') forceCancel('hidden')
    }, true)
    canvas.addEventListener('lostpointercapture', () => {
      if (win.__logiqV2DragActive) forceCancel('lost-pointer-capture')
    }, true)

    win.setInterval(() => {
      if (!win.__logiqV2DragActive || state.pointerId == null || !state.lastEventAt) return
      if (win.performance.now() - state.lastEventAt > IDLE_CANCEL_MS) forceCancel('idle-timeout')
    }, 500)

    win.LOGiQDragWatchdog = Object.freeze({
      activePointer: () => state.pointerId,
      forceCancel: () => forceCancel('manual'),
    })
  })
})()
