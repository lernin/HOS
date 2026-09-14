(() => {
  'use strict'

  const frame = document.getElementById('app')
  if (!frame) return

  const LOCK_PREFIX = 'logiq_working_lock_v2:'
  const ICON_LOCKED = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path></svg>'
  const ICON_UNLOCKED = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"></rect><path d="M16 10V7a4 4 0 0 0-7.5-2"></path></svg>'

  frame.addEventListener('load', () => {
    const win = frame.contentWindow
    const doc = frame.contentDocument
    const bridge = win?.LOGiQBridge
    if (!win || !doc || !bridge) return

    const state = { locked: false, mapKey: '', guardSnapshot: '', restoring: false, toastTimer: 0 }
    injectStyles(doc)
    const controls = buildControls(doc)

    const currentMap = () => {
      try { return JSON.parse(win.localStorage.getItem('logiq_v161_current_map_v1') || '{}') || {} } catch (_) { return {} }
    }
    const mapKey = () => {
      const map = currentMap()
      return map.id ? `id:${map.id}` : `name:${map.name || 'Untitled map'}`
    }
    const lockKey = key => LOCK_PREFIX + key
    const snapshot = () => JSON.stringify(bridge.snapshot())

    const renderLock = button => {
      button.innerHTML = state.locked ? ICON_LOCKED : ICON_UNLOCKED
      button.dataset.lockState = state.locked ? 'locked' : 'unlocked'
      button.title = state.locked ? 'Structure locked — tap to unlock' : 'Structure unlocked — tap to lock'
      button.setAttribute('aria-label', button.title)
      button.setAttribute('aria-pressed', String(state.locked))
    }

    const setLocked = (value, { persist = true } = {}) => {
      state.locked = !!value
      state.mapKey = mapKey()
      state.guardSnapshot = snapshot()
      win.__logiqWorkingLocked = state.locked
      doc.body.classList.toggle('logiq-working-locked', state.locked)
      controls.forEach(renderLock)
      if (persist) win.localStorage.setItem(lockKey(state.mapKey), state.locked ? '1' : '0')
    }

    const syncMap = () => {
      const key = mapKey()
      if (key === state.mapKey) return
      state.mapKey = key
      setLocked(win.localStorage.getItem(lockKey(key)) === '1', { persist: false })
    }

    controls.forEach(button => {
      button.addEventListener('pointerdown', event => event.stopPropagation())
      button.addEventListener('click', event => {
        event.preventDefault(); event.stopImmediatePropagation()
        setLocked(!state.locked)
        toast(doc, state, state.locked ? 'Map structure locked' : 'Map structure unlocked')
      })
    })

    // Structural UI is disabled while locked; navigation, selection, zoom and deliberate editing remain.
    doc.addEventListener('click', event => {
      if (!state.locked) return
      const structural = event.target.closest(
        '#trash,[data-action="delete"],[data-tool="add"],[data-tool="add-child"],[data-tool="mix"],#logiq-spawn-puck,#Dock .chip'
      )
      if (!structural) return
      event.preventDefault(); event.stopImmediatePropagation()
      toast(doc, state, 'Unlock structure to change the map')
    }, true)

    // Safety net: any structural mutation that slips through is rolled back, but rename is allowed.
    bridge.subscribe(() => {
      syncMap()
      if (!state.locked || state.restoring) {
        state.guardSnapshot = snapshot()
        return
      }
      const now = bridge.snapshot()
      let before
      try { before = JSON.parse(state.guardSnapshot || '{}') } catch (_) { before = null }
      if (!before?.tree) { state.guardSnapshot = JSON.stringify(now); return }
      if (sameStructure(before, now)) {
        state.guardSnapshot = JSON.stringify(now) // rename/text edit is intentional
        return
      }
      state.restoring = true
      bridge.loadMap(before.tree, before.wordBank || [])
      state.restoring = false
      toast(doc, state, 'Structure is locked')
    })

    state.mapKey = mapKey()
    setLocked(win.localStorage.getItem(lockKey(state.mapKey)) === '1', { persist: false })
    win.setInterval(syncMap, 500)
  })

  function buildControls(doc) {
    const buttons = []
    const desktop = doc.createElement('button')
    desktop.className = 'logiq-working-lock-btn logiq-icon-btn'
    desktop.type = 'button'
    doc.querySelector('header .controls')?.prepend(desktop)
    buttons.push(desktop)

    const mobile = doc.createElement('button')
    mobile.className = 'logiq-working-lock-btn logiq-icon-btn'
    mobile.type = 'button'
    const menu = doc.getElementById('logiq-mobile-menu-btn')
    menu?.parentNode?.insertBefore(mobile, menu)
    buttons.push(mobile)

    const rail = doc.querySelector('#logiq-v2-rail .divider')
    if (rail) {
      const railButton = doc.createElement('button')
      railButton.className = 'logiq-working-lock-btn'
      railButton.type = 'button'
      rail.parentNode.insertBefore(railButton, rail)
      buttons.push(railButton)
    }
    return buttons
  }

  function injectStyles(doc) {
    const style = doc.createElement('style')
    style.textContent = `
      .logiq-working-lock-btn svg{width:20px;height:20px;display:block;margin:auto;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
      .logiq-working-lock-btn[data-lock-state="unlocked"]{background:#fff!important;border-color:#dbe3ec!important;color:#475569!important}
      .logiq-working-lock-btn[data-lock-state="locked"]{background:#dcfce7!important;border-color:#22c55e!important;color:#166534!important}
      body.logiq-working-locked #trash,
      body.logiq-working-locked #logiq-spawn-puck{opacity:.28!important;pointer-events:none!important}
      body.logiq-working-locked [data-action="delete"],
      body.logiq-working-locked [data-tool="add"],
      body.logiq-working-locked [data-tool="add-child"],
      body.logiq-working-locked [data-tool="mix"]{opacity:.38!important}
      #logiq-working-toast{position:fixed;z-index:9999;left:50%;bottom:18px;transform:translateX(-50%);padding:8px 12px;border-radius:999px;background:rgba(15,23,42,.92);color:#fff;font:700 12px system-ui;pointer-events:none}
    `
    doc.head.appendChild(style)
  }

  function sameStructure(a, b) {
    const shape = value => {
      const walk = node => node ? { _uid: node._uid || null, children: (node.children || []).map(walk) } : null
      return JSON.stringify({ tree: walk(value?.tree), wordBank: value?.wordBank || [] })
    }
    return shape(a) === shape(b)
  }

  function toast(doc, state, text) {
    let el = doc.getElementById('logiq-working-toast')
    if (!el) { el = doc.createElement('div'); el.id = 'logiq-working-toast'; doc.body.appendChild(el) }
    el.textContent = text; el.hidden = false
    clearTimeout(state.toastTimer); state.toastTimer = setTimeout(() => { el.hidden = true }, 1200)
  }
})()
