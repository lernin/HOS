(() => {
  'use strict'

  const bridge = window.LOGYQBridge
  if (!bridge) return

  const PIN_KEY = 'logyq_lab_pin_v1'
  const CURRENT_KEY = 'logyq_current_map_v1'
  const PENDING_KEY = 'logyq_pending_save_v1'
  const LIBRARY_KEY = 'logyq_maps_v1'
  const DEFAULT_NAME = 'Untitled map'

  const app = {
    current: readJson(CURRENT_KEY, { id: null, name: DEFAULT_NAME }),
    lastSnapshot: stableSnapshot(bridge.snapshot()),
    timer: null,
    saving: false,
    saveAgain: false,
    libraryRows: [],
    spawnGesture: null,
    recorder: null,
    recordingStream: null,
    recordingChunks: [],
    recordingUid: null,
    canvasPointers: new Map(),
  }

  injectStyles()
  const ui = buildUi()
  const recovered = readJson(PENDING_KEY, null)
  if (recovered?.tree) {
    app.current = { id: recovered.id || null, name: recovered.name || DEFAULT_NAME }
    app.lastSnapshot = stableSnapshot({ tree: recovered.tree, wordBank: recovered.word_bank || [] })
    bridge.loadMap(recovered.tree, recovered.word_bank || [])
  }
  bindUi()
  updateMapName()
  setSaveState(localStorage.getItem(PENDING_KEY) ? 'offline' : 'saved')

  bridge.subscribe(queueAutosave)
  const dock = document.getElementById('Dock')
  if (dock) {
    new MutationObserver(() => bridge.notifyChange()).observe(dock, {
      childList: true,
      subtree: true,
      characterData: true,
    })
  }

  const nodeLayer = document.querySelector('g.nodes')
  if (nodeLayer) {
    new MutationObserver(() => requestAnimationFrame(updateContextActions)).observe(nodeLayer, {
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    })
  }
  window.addEventListener('keydown', () => requestAnimationFrame(updateContextActions), true)
  window.addEventListener('resize', () => requestAnimationFrame(updateContextActions))
  window.addEventListener('online', retryPending)
  updateContextActions()
  if (recovered) setTimeout(retryPending, 500)

  function readJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null')
      return value ?? fallback
    } catch (_error) {
      return fallback
    }
  }

  function stableSnapshot(snapshot) {
    return JSON.stringify({
      tree: snapshot?.tree || null,
      word_bank: Array.isArray(snapshot?.wordBank) ? snapshot.wordBank : [],
    })
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;')
  }

  function injectStyles() {
    const style = document.createElement('style')
    style.id = 'logyq-preview-styles'
    style.textContent = `
      .logiq-save-state{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:#64748b;white-space:nowrap}
      .logiq-save-state::before{content:"";width:7px;height:7px;border-radius:50%;background:#22c55e}
      .logiq-save-state[data-state="saving"]::before{background:#f59e0b;animation:logiq-pulse 900ms ease-in-out infinite}
      .logiq-save-state[data-state="offline"]::before{background:#94a3b8}
      @keyframes logiq-pulse{50%{opacity:.35}}
      .logiq-backdrop{position:fixed;inset:0;z-index:5000;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(15,23,42,.36);backdrop-filter:blur(4px)}
      .logiq-backdrop.is-open{display:flex}
      .logiq-modal{width:min(680px,100%);max-height:min(760px,calc(100dvh - 36px));overflow:auto;background:#fff;border:1px solid #e2e8f0;border-radius:18px;box-shadow:0 24px 70px rgba(15,23,42,.24);color:#334155}
      .logiq-modal-head{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:10px;padding:16px;background:rgba(255,255,255,.96);border-bottom:1px solid #e2e8f0}
      .logiq-modal-head h2{font-size:18px;margin:0;flex:1}
      .logiq-icon-btn{width:38px;height:38px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;color:#334155;font-size:18px;cursor:pointer}
      .logiq-primary{border:0;border-radius:10px;background:#16a34a;color:#fff;padding:9px 13px;font-weight:750;cursor:pointer}
      .logiq-library-body{padding:12px 16px 18px}
      .logiq-library-note{margin:0 0 12px;color:#64748b;font-size:13px}
      .logiq-map-list{display:grid;gap:9px}
      .logiq-map-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:12px;border:1px solid #e2e8f0;border-radius:12px;background:#fff}
      .logiq-map-row.is-current{border-color:#22c55e;box-shadow:0 0 0 2px rgba(34,197,94,.12)}
      .logiq-map-name{font-weight:750;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .logiq-map-time{font-size:12px;color:#94a3b8;margin-top:3px}
      .logiq-map-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
      .logiq-map-actions button,.logiq-inline-rename button{border:1px solid #e2e8f0;border-radius:8px;background:#fff;padding:6px 9px;color:#334155;cursor:pointer}
      .logiq-map-actions .danger{color:#dc2626}
      .logiq-inline-rename{display:none;grid-column:1/-1;gap:8px;grid-template-columns:1fr auto}
      .logiq-inline-rename.is-open{display:grid}
      .logiq-inline-rename input,.logiq-pin-card input{height:38px;border:1px solid #cbd5e1;border-radius:9px;padding:0 10px;font:inherit}
      .logiq-empty{padding:28px;text-align:center;color:#64748b;border:1px dashed #cbd5e1;border-radius:12px}
      .logiq-pin-card{width:min(360px,100%);padding:20px;background:#fff;border-radius:16px;box-shadow:0 24px 70px rgba(15,23,42,.24);display:grid;gap:12px;color:#334155}
      .logiq-pin-card h2,.logiq-pin-card p{margin:0}.logiq-pin-card p{font-size:13px;color:#64748b}
      .logiq-pin-actions{display:flex;justify-content:flex-end;gap:8px}
      .logiq-pin-error{display:none;color:#dc2626;font-size:12px}.logiq-pin-error.is-visible{display:block}
      #logiq-mobile-header,#logiq-mobile-panel,#logiq-mobile-context,#logiq-spawn-puck,#logiq-spawn-ghost,#logiq-voice-bar{display:none}

      @media (max-width:700px), (pointer:coarse) and (max-width:1200px), (hover:none) and (max-width:1200px){
        body>header{display:none!important}
        svg#canvas{height:100dvh;touch-action:none}
        #trash{display:none!important}
        #Dock{left:8px;right:8px;bottom:66px;padding:0 4px;max-height:25dvh;overflow:auto;justify-content:flex-start;flex-wrap:wrap}
        #Dock.dock-left{top:54px;bottom:66px;width:min(220px,72vw);padding:8px}
        #Hint{bottom:72px}
        #Toast{bottom:122px;max-width:calc(100vw - 36px);text-align:center}
        #logiq-mobile-header{position:fixed;display:flex;top:0;left:0;right:0;z-index:3000;height:48px;box-sizing:border-box;align-items:center;gap:5px;padding:5px 7px;background:rgba(255,255,255,.95);border-bottom:1px solid rgba(226,232,240,.9);box-shadow:0 1px 4px rgba(15,23,42,.1);backdrop-filter:blur(8px)}
        #logiq-mobile-header img{width:28px;height:28px;flex:0 0 auto}
        .logiq-mobile-entry{height:36px;min-width:66px;flex:1;border:1px solid #dbe3ec;border-radius:10px;padding:0 9px;font:inherit;font-size:14px;background:rgba(255,255,255,.9)}
        #logiq-mobile-header .logiq-icon-btn{width:36px;height:36px;flex:0 0 36px;border-radius:10px;font-size:17px;padding:0}
        #logiq-mobile-header .logiq-icon-btn svg{width:19px;height:19px;display:block;margin:auto;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
        #logiq-mobile-header .logiq-save-state{width:9px;overflow:hidden;gap:0;flex:0 0 9px;color:transparent}
        #logiq-mobile-header .logiq-save-state::before{flex:0 0 8px;width:8px;height:8px}
        #logiq-mobile-panel{position:fixed;display:none;z-index:3100;top:54px;right:8px;left:8px;padding:12px;background:rgba(255,255,255,.98);border:1px solid #e2e8f0;border-radius:14px;box-shadow:0 18px 50px rgba(15,23,42,.22)}
        #logiq-mobile-panel.is-open{display:block}
        .logiq-mobile-tools{display:grid;grid-template-columns:repeat(2,1fr);gap:7px}.logiq-mobile-tools button{min-height:42px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;color:#334155;font-weight:650}
        #logiq-mobile-context{position:fixed;display:none;z-index:3000;left:8px;right:8px;bottom:8px;min-height:52px;padding:6px;background:rgba(255,255,255,.96);border:1px solid #e2e8f0;border-radius:15px;box-shadow:0 12px 36px rgba(15,23,42,.2);backdrop-filter:blur(8px);grid-template-columns:repeat(6,1fr);gap:5px}
        #logiq-mobile-context.is-visible{display:grid}
        #logiq-mobile-context button{min-width:0;height:40px;border:1px solid #e2e8f0;border-radius:9px;background:#fff;color:#334155;font-size:12px;font-weight:700;padding:2px}
        #logiq-mobile-context button[data-action="delete"]{color:#dc2626}
        #logiq-mobile-context button.is-active{background:#dcfce7;border-color:#22c55e;color:#166534}
        #logiq-spawn-puck{position:fixed;z-index:3200;width:38px;height:38px;border:2px solid #fff;border-radius:50%;background:#16a34a;color:#fff;box-shadow:0 5px 16px rgba(15,23,42,.3);font-size:24px;line-height:30px;align-items:center;justify-content:center;touch-action:none;user-select:none}
        #logiq-spawn-puck.is-visible{display:none!important}
        #logiq-spawn-puck.is-dragging{transform:scale(1.08);background:#15803d}
        #logiq-spawn-ghost{position:fixed;z-index:3190;min-width:92px;padding:7px 10px;border-radius:999px;background:rgba(15,23,42,.9);color:#fff;text-align:center;font-size:12px;font-weight:750;pointer-events:none;transform:translate(-50%,-50%)}
        #logiq-spawn-ghost.is-visible{display:none!important}
        #logiq-voice-bar{position:fixed;z-index:3300;left:50%;bottom:70px;transform:translateX(-50%);align-items:center;gap:9px;max-width:calc(100vw - 20px);padding:8px 9px 8px 13px;border-radius:999px;background:#111827;color:#fff;box-shadow:0 12px 34px rgba(15,23,42,.35);font-size:13px;font-weight:700;white-space:nowrap}
        #logiq-voice-bar.is-visible{display:flex}
        #logiq-voice-stop{border:0;border-radius:999px;background:#ef4444;color:#fff;padding:8px 13px;font-weight:800}
        svg#canvas g.node:not(.is-outlined){pointer-events:none}
        .logiq-backdrop{padding:8px;align-items:flex-end}.logiq-modal{max-height:88dvh;border-radius:18px 18px 10px 10px}.logiq-map-row{grid-template-columns:1fr}.logiq-map-actions{justify-content:flex-start}
      }
      @media (hover:none) and (pointer:coarse) and (max-height:500px){
        #logiq-mobile-header{height:44px;padding-top:4px;padding-bottom:4px}
        #logiq-mobile-panel{top:48px;left:auto;width:min(310px,calc(100vw - 16px))}
        #logiq-mobile-context{left:auto;width:min(360px,calc(100vw - 16px))}
        #logiq-voice-bar{bottom:62px}
      }
    `
    document.head.append(style)
  }

  function buildUi() {
    const desktopState = document.createElement('span')
    desktopState.className = 'logiq-save-state'
    desktopState.setAttribute('role', 'status')
    desktopState.setAttribute('aria-live', 'polite')
    document.querySelector('header .controls')?.prepend(desktopState)

    document.body.insertAdjacentHTML('beforeend', `
      <div id="logiq-mobile-header">
        <img src="/logyq/logos/LOGO_GREEN_Q.svg" alt="LOGiQ">
        <input class="logiq-mobile-entry" id="logiq-mobile-word-input" placeholder="Type or speak…" aria-label="Add words">
        <button class="logiq-icon-btn" id="logiq-mobile-mic-btn" aria-label="Speak a word"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="3" width="8" height="12" rx="4"></rect><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"></path></svg></button>
        <button class="logiq-icon-btn" data-tool="undo" aria-label="Undo">↶</button>
        <button class="logiq-icon-btn" data-tool="fit" aria-label="Recenter map"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5"></circle><path d="M12 2v4M12 18v4M2 12h4M18 12h4"></path></svg></button>
        <span class="logiq-save-state" role="status" aria-live="polite"></span>
        <button class="logiq-icon-btn" id="logiq-mobile-menu-btn" aria-label="Open controls" aria-expanded="false">⋮</button>
      </div>
      <section id="logiq-mobile-panel" aria-label="LOGiQ controls">
        <div class="logiq-mobile-tools">
          <button data-tool="add">Add typed words</button><button data-tool="add-child">Add to selected</button>
          <button data-tool="library">Maps</button><button data-tool="mix">Mix</button>
          <button data-tool="dock">Word Dock</button><button data-tool="help">Help</button>
        </div>
      </section>
      <nav id="logiq-mobile-context" aria-label="Selected node actions">
        <button data-action="left" aria-label="Previous node">←</button><button data-action="up" aria-label="Parent node">↑</button><button data-action="down" aria-label="Child node">↓</button><button data-action="right" aria-label="Next node">→</button>
        <button data-action="edit">Edit</button><button data-action="delete">Delete</button>
      </nav>
      <button id="logiq-spawn-puck" aria-label="Flick to create a related card" title="Flick: up parent, left/right sibling, down child">+</button>
      <div id="logiq-spawn-ghost" aria-hidden="true"></div>
      <div id="logiq-voice-bar" role="status" aria-live="polite"><span id="logiq-voice-status">Listening…</span><button id="logiq-voice-stop">Stop</button></div>
      <div class="logiq-backdrop" id="logiq-library" aria-hidden="true">
        <section class="logiq-modal" role="dialog" aria-modal="true" aria-labelledby="logiq-library-title">
          <header class="logiq-modal-head"><h2 id="logiq-library-title">Maps</h2><button class="logiq-primary" id="logiq-new-map">New map</button><button class="logiq-icon-btn" id="logiq-library-close" aria-label="Close maps">×</button></header>
          <div class="logiq-library-body"><p class="logiq-library-note">Maps save automatically on this device. They are not written to production LOGiQ storage.</p><div class="logiq-map-list" id="logiq-map-list"></div></div>
        </section>
      </div>
      <div class="logiq-backdrop" id="logiq-pin" aria-hidden="true">
        <form class="logiq-pin-card" id="logiq-pin-form"><h2>Connect for voice transcription</h2><p>Enter the Lab PIN once for this LOGYQ session. It is stored under a LOGYQ-only key and is not used to read or write production LOGiQ maps.</p><input id="logiq-pin-input" type="password" inputmode="numeric" autocomplete="current-password" aria-label="Lab PIN" required><span class="logiq-pin-error">That PIN was not accepted.</span><div class="logiq-pin-actions"><button type="button" class="logiq-icon-btn" id="logiq-pin-cancel" aria-label="Cancel">×</button><button class="logiq-primary" type="submit">Connect</button></div></form>
      </div>
    `)

    return {
      saveStates: Array.from(document.querySelectorAll('.logiq-save-state')),
      menuButton: document.getElementById('logiq-mobile-menu-btn'),
      mobilePanel: document.getElementById('logiq-mobile-panel'),
      mobileInput: document.getElementById('logiq-mobile-word-input'),
      mobileContext: document.getElementById('logiq-mobile-context'),
      spawnPuck: document.getElementById('logiq-spawn-puck'),
      spawnGhost: document.getElementById('logiq-spawn-ghost'),
      voiceBar: document.getElementById('logiq-voice-bar'),
      voiceStatus: document.getElementById('logiq-voice-status'),
      library: document.getElementById('logiq-library'),
      mapList: document.getElementById('logiq-map-list'),
      pin: document.getElementById('logiq-pin'),
      pinForm: document.getElementById('logiq-pin-form'),
      pinInput: document.getElementById('logiq-pin-input'),
      pinError: document.querySelector('.logiq-pin-error'),
    }
  }

  function bindUi() {
    ui.menuButton.addEventListener('click', () => {
      const open = ui.mobilePanel.classList.toggle('is-open')
      ui.menuButton.setAttribute('aria-expanded', String(open))
    })
    document.getElementById('logiq-mobile-mic-btn').addEventListener('click', () => startVoiceCapture(null))
    document.getElementById('logiq-voice-stop').addEventListener('click', stopVoiceCapture)

    const legacyMaps = document.getElementById('mapsBtn')
    legacyMaps?.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopImmediatePropagation()
      openLibrary()
    }, true)

    document.getElementById('logiq-library-close').addEventListener('click', closeLibrary)
    ui.library.addEventListener('click', (event) => { if (event.target === ui.library) closeLibrary() })
    document.getElementById('logiq-new-map').addEventListener('click', createMap)

    document.querySelectorAll('[data-tool]').forEach((button) => button.addEventListener('click', () => {
      const action = button.dataset.tool
      if (action === 'add') commitMobileInput(false)
      if (action === 'add-child') commitMobileInput(true)
      if (action === 'undo') bridge.undo()
      if (action === 'mix') bridge.mix(false)
      if (action === 'fit') bridge.fit()
      if (action === 'library') openLibrary()
      if (action === 'dock') bridge.dispatchKey('w')
      if (action === 'help') document.getElementById('helpBtn')?.click()
      closeMobilePanel()
    }))
    ui.mobileInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return
      event.preventDefault()
      commitMobileInput(event.shiftKey)
    })

    ui.mobileContext.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]')
      if (!button) return
      const action = button.dataset.action
      if (['left', 'up', 'down', 'right'].includes(action)) navigate(action)
      if (action === 'edit') bridge.editSelected()
      if (action === 'delete' && window.confirm('Delete the selected node or subtree?')) bridge.deleteSelection()
    })

    ui.spawnPuck.addEventListener('pointerdown', beginSpawnGesture)
    ui.spawnPuck.addEventListener('pointermove', moveSpawnGesture)
    ui.spawnPuck.addEventListener('pointerup', finishSpawnGesture)
    ui.spawnPuck.addEventListener('pointercancel', cancelSpawnGesture)

    const canvas = document.getElementById('canvas')
    canvas?.addEventListener('pointerdown', beginCanvasPointer, true)
    canvas?.addEventListener('pointermove', moveCanvasPointer, true)
    canvas?.addEventListener('pointerup', finishCanvasPointer, true)
    canvas?.addEventListener('pointercancel', cancelCanvasPointer, true)

    ui.mapList.addEventListener('click', handleMapAction)
    ui.pin.addEventListener('click', (event) => { if (event.target === ui.pin) finishPin(null) })
    document.getElementById('logiq-pin-cancel').addEventListener('click', () => finishPin(null))
    ui.pinForm.addEventListener('submit', (event) => {
      event.preventDefault()
      const value = ui.pinInput.value.trim()
      if (value) finishPin(value)
    })

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return
      closeMobilePanel()
      closeLibrary()
      if (ui.pin.classList.contains('is-open')) finishPin(null)
    })
  }

  function commitMobileInput(toNode) {
    const legacyInput = document.getElementById('wordInput')
    const legacyAdd = document.getElementById('addWordBtn')
    if (!legacyInput || !legacyAdd) return
    legacyInput.value = ui.mobileInput.value
    if (toNode) {
      legacyInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true }))
    } else {
      legacyAdd.click()
    }
    ui.mobileInput.value = ''
    closeMobilePanel()
  }

  function closeMobilePanel() {
    ui.mobilePanel.classList.remove('is-open')
    ui.menuButton.setAttribute('aria-expanded', 'false')
  }

  function navigate(direction) {
    const key = `Arrow${direction[0].toUpperCase()}${direction.slice(1)}`
    bridge.dispatchKey(key)
  }

  function updateContextActions() {
    const selectedUid = bridge.getSelectedUid()
    const selected = selectedUid || bridge.getSelectedUids().length
    ui.mobileContext.classList.toggle('is-visible', !!selected)
    ui.spawnPuck.classList.toggle('is-visible', !!selectedUid && isPhoneUi())
    if (!selectedUid || !isPhoneUi()) return
    const node = Array.from(document.querySelectorAll('g.node')).find((element) => element.__data__?.data?._uid === selectedUid)
    const rect = node?.getBoundingClientRect()
    if (!rect || rect.width < 1 || rect.height < 1) {
      ui.spawnPuck.classList.remove('is-visible')
      return
    }
    const left = Math.min(window.innerWidth - 43, Math.max(5, rect.right + 7))
    const top = Math.min(window.innerHeight - 58, Math.max(51, rect.top + rect.height / 2 - 19))
    ui.spawnPuck.style.left = `${left}px`
    ui.spawnPuck.style.top = `${top}px`
  }

  function updateMapName() {
    localStorage.setItem(CURRENT_KEY, JSON.stringify(app.current))
  }

  function isPhoneUi() {
    return window.matchMedia('(max-width:700px), (pointer:coarse) and (max-width:1200px), (hover:none) and (max-width:1200px)').matches
  }

  function beginCanvasPointer(event) {
    if (!isPhoneUi() || event.target.closest?.('g.node.is-outlined')) return
    app.canvasPointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      started: performance.now(),
      moved: false,
      multi: app.canvasPointers.size > 0,
    })
    if (app.canvasPointers.size > 1) app.canvasPointers.forEach((pointer) => { pointer.multi = true })
  }

  function moveCanvasPointer(event) {
    const pointer = app.canvasPointers.get(event.pointerId)
    if (!pointer) return
    if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 9) pointer.moved = true
  }

  function finishCanvasPointer(event) {
    const pointer = app.canvasPointers.get(event.pointerId)
    app.canvasPointers.delete(event.pointerId)
    if (!pointer || pointer.multi || pointer.moved || performance.now() - pointer.started > 450) return
    const candidates = Array.from(document.querySelectorAll('g.node')).filter((node) => {
      const rect = node.getBoundingClientRect()
      return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom
    }).sort((a, b) => {
      const ar = a.getBoundingClientRect()
      const br = b.getBoundingClientRect()
      return ar.width * ar.height - br.width * br.height
    })
    const uid = candidates[0]?.__data__?.data?._uid
    if (uid) bridge.selectByUid(uid)
    else bridge.clearFocusSelection()
    requestAnimationFrame(updateContextActions)
  }

  function cancelCanvasPointer(event) {
    app.canvasPointers.delete(event.pointerId)
  }

  function directionFromDelta(dx, dy) {
    if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'left' : 'right'
    return dy < 0 ? 'up' : 'down'
  }

  function directionLabel(direction) {
    return ({ up: '↑ Insert parent', left: '← Older sibling', down: '↓ Add child', right: 'Younger sibling →' })[direction]
  }

  function beginSpawnGesture(event) {
    if (app.recorder || !bridge.getSelectedUid()) return
    event.preventDefault()
    try { ui.spawnPuck.setPointerCapture?.(event.pointerId) } catch (_error) {}
    app.spawnGesture = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, started: performance.now(), direction: null }
    ui.spawnPuck.classList.add('is-dragging')
  }

  function moveSpawnGesture(event) {
    const gesture = app.spawnGesture
    if (!gesture || gesture.pointerId !== event.pointerId) return
    event.preventDefault()
    const dx = event.clientX - gesture.x
    const dy = event.clientY - gesture.y
    const distance = Math.hypot(dx, dy)
    if (distance < 22) return
    gesture.direction = directionFromDelta(dx, dy)
    ui.spawnGhost.textContent = directionLabel(gesture.direction)
    ui.spawnGhost.style.left = `${event.clientX}px`
    ui.spawnGhost.style.top = `${event.clientY}px`
    ui.spawnGhost.classList.add('is-visible')
    if (!gesture.threshold && distance >= 48) {
      gesture.threshold = true
      navigator.vibrate?.(18)
    }
  }

  async function finishSpawnGesture(event) {
    const gesture = app.spawnGesture
    if (!gesture || gesture.pointerId !== event.pointerId) return
    const distance = Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y)
    const elapsed = performance.now() - gesture.started
    const direction = gesture.direction
    cancelSpawnGesture()
    if (!direction || distance < 48 || elapsed > 850) {
      showMobileToast('Flick the + toward parent, sibling, or child')
      return
    }
    const uid = bridge.createRelative(direction)
    if (!uid) {
      showMobileToast(direction === 'up' || direction === 'left' || direction === 'right' ? 'The root card cannot have a sibling or inserted parent' : 'Could not create card')
      return
    }
    requestAnimationFrame(updateContextActions)
    await startVoiceCapture(uid)
  }

  function cancelSpawnGesture() {
    app.spawnGesture = null
    ui.spawnPuck.classList.remove('is-dragging')
    ui.spawnGhost.classList.remove('is-visible')
  }

  function showMobileToast(message) {
    const toast = document.getElementById('Toast')
    if (!toast) return
    toast.textContent = message
    toast.style.display = 'inline-flex'
    clearTimeout(showMobileToast.timer)
    showMobileToast.timer = setTimeout(() => { toast.style.display = 'none' }, 1800)
  }

  async function startVoiceCapture(uid) {
    if (app.recorder) return
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      showMobileToast('Voice capture is not available in this browser')
      if (uid) bridge.editSelected({ wipe: true })
      return
    }
    const pin = await getPin(true)
    if (!pin) {
      if (uid) bridge.editSelected({ wipe: true })
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      app.recorder = recorder
      app.recordingStream = stream
      app.recordingChunks = []
      app.recordingUid = uid
      recorder.addEventListener('dataavailable', (event) => { if (event.data?.size) app.recordingChunks.push(event.data) })
      recorder.addEventListener('stop', transcribeRecording, { once: true })
      recorder.start()
      ui.voiceStatus.textContent = uid ? 'Listening for card…' : 'Listening…'
      ui.voiceBar.classList.add('is-visible')
    } catch (_error) {
      showMobileToast('Microphone permission is needed for voice entry')
      if (uid) bridge.editSelected({ wipe: true })
    }
  }

  function stopVoiceCapture() {
    if (!app.recorder || app.recorder.state === 'inactive') return
    ui.voiceStatus.textContent = 'Transcribing…'
    app.recorder.stop()
  }

  async function transcribeRecording() {
    const uid = app.recordingUid
    const recorder = app.recorder
    const chunks = app.recordingChunks.slice()
    app.recordingStream?.getTracks?.().forEach((track) => track.stop())
    app.recorder = null
    app.recordingStream = null
    app.recordingChunks = []
    app.recordingUid = null
    try {
      const audio = new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' })
      const form = new FormData()
      form.append('audio', audio, 'logyq-card.webm')
      const response = await fetch('/api/transcribe', { method: 'POST', headers: { 'x-review-pin': await getPin(false) }, body: form })
      const result = await response.json()
      if (!response.ok || !result?.text?.trim()) throw new Error(result?.error || 'No speech detected')
      const text = result.text.trim()
      if (uid) bridge.renameNode(uid, text)
      else {
        ui.mobileInput.value = text
        ui.mobileInput.focus()
      }
      showMobileToast(uid ? `Added “${text}”` : 'Voice text ready')
    } catch (_error) {
      showMobileToast('Could not transcribe. Type the card instead.')
      if (uid) bridge.editSelected({ wipe: true })
    } finally {
      ui.voiceBar.classList.remove('is-visible')
      requestAnimationFrame(updateContextActions)
    }
  }

  function setSaveState(state) {
    const text = state === 'saving' ? 'Saving' : state === 'offline' ? 'Offline' : 'Saved'
    ui.saveStates.forEach((element) => {
      element.dataset.state = state
      element.textContent = text
      element.title = state === 'offline' ? 'Changes could not be stored on this device.' : ''
    })
  }

  function newMapId() {
    try {
      if (globalThis.crypto?.randomUUID) return crypto.randomUUID()
    } catch (_error) {}
    return `logyq-${Date.now()}-${Math.random().toString(16).slice(2)}`
  }

  function readLibrary() {
    const rows = readJson(LIBRARY_KEY, [])
    return Array.isArray(rows) ? rows : []
  }

  function writeLibrary(rows) {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(rows))
  }

  function upsertLibraryRecord(record) {
    const rows = readLibrary()
    const index = rows.findIndex((row) => row.id === record.id)
    if (index >= 0) rows[index] = record
    else rows.unshift(record)
    writeLibrary(rows)
    return record
  }

  function queueAutosave(snapshot) {
    const serialized = stableSnapshot(snapshot)
    if (serialized === app.lastSnapshot) return
    app.lastSnapshot = serialized
    localStorage.setItem(PENDING_KEY, JSON.stringify({
      id: app.current.id,
      name: app.current.name || DEFAULT_NAME,
      ...JSON.parse(serialized),
      updated_at: new Date().toISOString(),
    }))
    setSaveState('saving')
    clearTimeout(app.timer)
    app.timer = setTimeout(savePending, 850)
  }

  async function retryPending() {
    if (!localStorage.getItem(PENDING_KEY)) return setSaveState('saved')
    await savePending()
  }

  async function savePending() {
    if (app.saving) {
      app.saveAgain = true
      return
    }
    const pending = readJson(PENDING_KEY, null)
    if (!pending) return setSaveState('saved')

    app.saving = true
    setSaveState('saving')
    try {
      const id = pending.id || newMapId()
      upsertLibraryRecord({
        id,
        name: pending.name || DEFAULT_NAME,
        tree: pending.tree,
        word_bank: pending.word_bank || [],
        updated_at: pending.updated_at || new Date().toISOString(),
      })
      app.current = { id, name: pending.name || DEFAULT_NAME }
      updateMapName()
      const latest = readJson(PENDING_KEY, null)
      if (latest?.updated_at === pending.updated_at) localStorage.removeItem(PENDING_KEY)
      setSaveState(localStorage.getItem(PENDING_KEY) ? 'saving' : 'saved')
    } catch (_error) {
      setSaveState('offline')
    } finally {
      app.saving = false
      if (app.saveAgain) {
        app.saveAgain = false
        clearTimeout(app.timer)
        app.timer = setTimeout(savePending, 1100)
      }
    }
  }

  let pinResolver = null
  function getPin(interactive) {
    const stored = sessionStorage.getItem(PIN_KEY)
    if (stored || !interactive) return Promise.resolve(stored)
    if (pinResolver) return new Promise((resolve) => {
      const prior = pinResolver
      pinResolver = (value) => { prior(value); resolve(value) }
    })
    ui.pinInput.value = ''
    ui.pinError.classList.remove('is-visible')
    ui.pin.classList.add('is-open')
    ui.pin.setAttribute('aria-hidden', 'false')
    requestAnimationFrame(() => ui.pinInput.focus())
    return new Promise((resolve) => { pinResolver = resolve })
  }

  function finishPin(value) {
    if (!pinResolver) return
    if (value) sessionStorage.setItem(PIN_KEY, value)
    ui.pin.classList.remove('is-open')
    ui.pin.setAttribute('aria-hidden', 'true')
    const resolve = pinResolver
    pinResolver = null
    resolve(value)
  }

  async function openLibrary() {
    closeMobilePanel()
    ui.library.classList.add('is-open')
    ui.library.setAttribute('aria-hidden', 'false')
    ui.mapList.innerHTML = '<div class="logiq-empty">Loading maps…</div>'
    await refreshLibrary()
  }

  function closeLibrary() {
    ui.library.classList.remove('is-open')
    ui.library.setAttribute('aria-hidden', 'true')
  }

  async function refreshLibrary() {
    try {
      app.libraryRows = readLibrary()
      renderLibrary()
    } catch (_error) {
      ui.mapList.innerHTML = '<div class="logiq-empty">Could not read maps stored on this device.</div>'
    }
  }

  function renderLibrary() {
    if (!app.libraryRows.length) {
      ui.mapList.innerHTML = '<div class="logiq-empty">No maps yet. Create one to begin.</div>'
      return
    }
    ui.mapList.innerHTML = app.libraryRows.map((row) => {
      const current = row.id === app.current.id ? ' is-current' : ''
      const when = row.updated_at ? new Date(row.updated_at).toLocaleString() : ''
      return `<article class="logiq-map-row${current}" data-id="${escapeHtml(row.id)}">
        <div><div class="logiq-map-name">${escapeHtml(row.name || DEFAULT_NAME)}</div><div class="logiq-map-time">${escapeHtml(when)}</div></div>
        <div class="logiq-map-actions"><button data-map-action="open">Open</button><button data-map-action="rename">Rename</button><button class="danger" data-map-action="delete">Delete</button></div>
        <form class="logiq-inline-rename"><input value="${escapeHtml(row.name || DEFAULT_NAME)}" aria-label="Map name"><button>Done</button></form>
      </article>`
    }).join('')
  }

  async function handleMapAction(event) {
    const rowElement = event.target.closest('.logiq-map-row')
    if (!rowElement) return
    const row = app.libraryRows.find((item) => item.id === rowElement.dataset.id)
    if (!row) return

    const renameForm = event.target.closest('.logiq-inline-rename')
    if (renameForm) {
      event.preventDefault()
      const name = renameForm.querySelector('input').value.trim() || DEFAULT_NAME
      await renameMap(row, name)
      return
    }

    const action = event.target.closest('[data-map-action]')?.dataset.mapAction
    if (action === 'open') openMap(row)
    if (action === 'rename') {
      rowElement.querySelector('.logiq-inline-rename').classList.toggle('is-open')
      rowElement.querySelector('input').focus()
    }
    if (action === 'delete' && window.confirm(`Delete “${row.name || DEFAULT_NAME}”?`)) await deleteMap(row)
  }

  function openMap(row) {
    app.current = { id: row.id, name: row.name || DEFAULT_NAME }
    app.lastSnapshot = stableSnapshot({ tree: row.tree, wordBank: row.word_bank || [] })
    localStorage.removeItem(PENDING_KEY)
    updateMapName()
    bridge.loadMap(row.tree, row.word_bank || [])
    setSaveState('saved')
    closeLibrary()
  }

  function createMap() {
    app.current = { id: null, name: DEFAULT_NAME }
    const snapshot = { tree: { name: 'New map' }, wordBank: [] }
    app.lastSnapshot = ''
    updateMapName()
    bridge.loadMap(snapshot.tree, snapshot.wordBank)
    queueAutosave(bridge.snapshot())
    closeLibrary()
  }

  async function renameMap(row, name) {
    try {
      row.name = name
      upsertLibraryRecord({
        ...row,
        name,
        updated_at: new Date().toISOString(),
      })
      if (row.id === app.current.id) {
        app.current.name = name
        updateMapName()
      }
      renderLibrary()
      setSaveState('saved')
    } catch (_error) {
      setSaveState('offline')
    }
  }

  async function deleteMap(row) {
    try {
      writeLibrary(readLibrary().filter((item) => item.id !== row.id))
      app.libraryRows = app.libraryRows.filter((item) => item.id !== row.id)
      if (app.current.id === row.id) {
        app.current = { id: null, name: DEFAULT_NAME }
        updateMapName()
      }
      renderLibrary()
    } catch (_error) {
      setSaveState('offline')
    }
  }
})()
