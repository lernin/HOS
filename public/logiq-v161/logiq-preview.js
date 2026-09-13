(() => {
  'use strict'

  const bridge = window.LOGiQBridge
  if (!bridge) return

  const SUPABASE_URL = 'https://jzaghifuhinkzzhiojre.supabase.co'
  const SUPABASE_KEY = 'sb_publishable_rQDzA5bYlbzvaTjyo-uTXw_LiiIAddI'
  const PIN_KEY = 'logiq_lab_pin_v1'
  const CURRENT_KEY = 'logiq_v161_current_map_v1'
  const PENDING_KEY = 'logiq_v161_pending_save_v1'
  const DEFAULT_NAME = 'Untitled map'

  const app = {
    current: readJson(CURRENT_KEY, { id: null, name: DEFAULT_NAME }),
    lastSnapshot: stableSnapshot(bridge.snapshot()),
    timer: null,
    saving: false,
    saveAgain: false,
    libraryRows: [],
    structuralMode: false,
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
    new MutationObserver(updateContextActions).observe(nodeLayer, {
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    })
  }
  window.addEventListener('keydown', () => requestAnimationFrame(updateContextActions), true)
  window.addEventListener('online', retryPending)
  window.addEventListener('offline', () => setSaveState('offline'))
  updateContextActions()
  if (recovered && navigator.onLine) setTimeout(retryPending, 500)

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
    style.id = 'logiq-preview-styles'
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
      #logiq-mobile-header,#logiq-mobile-panel,#logiq-mobile-context{display:none}

      @media (max-width:700px){
        body>header{display:none!important}
        svg#canvas{height:100dvh;touch-action:none}
        #trash{display:none!important}
        body.global-no-cursor #trash{display:flex!important;width:62px;height:62px;right:12px;bottom:82px}
        #Dock{left:8px;right:8px;bottom:74px;padding:0 4px;max-height:25dvh;overflow:auto;justify-content:flex-start;flex-wrap:wrap}
        #Dock.dock-left{top:58px;bottom:74px;width:min(220px,72vw);padding:8px}
        #Hint{bottom:80px}
        #Toast{bottom:132px;max-width:calc(100vw - 36px);text-align:center}
        #logiq-mobile-header{position:fixed;display:flex;top:0;left:0;right:0;z-index:3000;height:52px;box-sizing:border-box;align-items:center;gap:9px;padding:7px 9px;background:rgba(255,255,255,.94);border-bottom:1px solid rgba(226,232,240,.9);box-shadow:0 1px 4px rgba(15,23,42,.1);backdrop-filter:blur(8px)}
        #logiq-mobile-header img{width:29px;height:29px}
        .logiq-mobile-title{min-width:0;flex:1}.logiq-mobile-title strong{display:block;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.logiq-mobile-title .logiq-save-state{font-size:11px}
        #logiq-mobile-panel{position:fixed;display:none;z-index:3100;top:58px;right:8px;left:8px;padding:12px;background:rgba(255,255,255,.98);border:1px solid #e2e8f0;border-radius:14px;box-shadow:0 18px 50px rgba(15,23,42,.22)}
        #logiq-mobile-panel.is-open{display:block}
        .logiq-mobile-input{display:grid;grid-template-columns:1fr auto;gap:8px;margin-bottom:10px}.logiq-mobile-input input{min-width:0;height:40px;border:1px solid #cbd5e1;border-radius:10px;padding:0 10px;font:inherit}
        .logiq-mobile-tools{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.logiq-mobile-tools button{min-height:40px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;color:#334155;font-weight:650}
        #logiq-mobile-context{position:fixed;display:none;z-index:3000;left:8px;right:8px;bottom:8px;min-height:56px;padding:7px;background:rgba(255,255,255,.96);border:1px solid #e2e8f0;border-radius:15px;box-shadow:0 12px 36px rgba(15,23,42,.2);backdrop-filter:blur(8px);grid-template-columns:repeat(8,1fr);gap:5px}
        #logiq-mobile-context.is-visible{display:grid}
        #logiq-mobile-context button{min-width:0;height:42px;border:1px solid #e2e8f0;border-radius:9px;background:#fff;color:#334155;font-size:12px;font-weight:700;padding:2px}
        #logiq-mobile-context button[data-action="delete"]{color:#dc2626}
        #logiq-mobile-context button.is-active{background:#dcfce7;border-color:#22c55e;color:#166534}
        .logiq-backdrop{padding:8px;align-items:flex-end}.logiq-modal{max-height:88dvh;border-radius:18px 18px 10px 10px}.logiq-map-row{grid-template-columns:1fr}.logiq-map-actions{justify-content:flex-start}
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
        <button class="logiq-icon-btn" id="logiq-mobile-menu-btn" aria-label="Open controls" aria-expanded="false">☰</button>
        <img src="logos/LOGO_GREEN_Q.svg" alt="LOGiQ">
        <div class="logiq-mobile-title"><strong id="logiq-mobile-map-name"></strong><span class="logiq-save-state" role="status" aria-live="polite"></span></div>
        <button class="logiq-icon-btn" id="logiq-mobile-library-btn" aria-label="Open maps">▤</button>
      </div>
      <section id="logiq-mobile-panel" aria-label="LOGiQ controls">
        <div class="logiq-mobile-input"><input id="logiq-mobile-word-input" placeholder="word(s,) or JSON"><button class="logiq-primary" data-tool="add">Add</button></div>
        <div class="logiq-mobile-tools">
          <button data-tool="add-child">To node</button><button data-tool="undo">Undo</button><button data-tool="mix">Mix</button>
          <button data-tool="fit">Fit</button><button data-tool="dock">Word Dock</button><button data-tool="help">Help</button>
        </div>
      </section>
      <nav id="logiq-mobile-context" aria-label="Selected node actions">
        <button data-action="left" aria-label="Previous node">←</button><button data-action="up" aria-label="Parent node">↑</button><button data-action="down" aria-label="Child node">↓</button><button data-action="right" aria-label="Next node">→</button>
        <button data-action="move" aria-label="Toggle structural movement">Move</button><button data-action="edit">Edit</button><button data-action="child">+ Child</button><button data-action="delete">Delete</button>
      </nav>
      <div class="logiq-backdrop" id="logiq-library" aria-hidden="true">
        <section class="logiq-modal" role="dialog" aria-modal="true" aria-labelledby="logiq-library-title">
          <header class="logiq-modal-head"><h2 id="logiq-library-title">Maps</h2><button class="logiq-primary" id="logiq-new-map">New map</button><button class="logiq-icon-btn" id="logiq-library-close" aria-label="Close maps">×</button></header>
          <div class="logiq-library-body"><p class="logiq-library-note">Maps save automatically to the production library.</p><div class="logiq-map-list" id="logiq-map-list"></div></div>
        </section>
      </div>
      <div class="logiq-backdrop" id="logiq-pin" aria-hidden="true">
        <form class="logiq-pin-card" id="logiq-pin-form"><h2>Connect to the LOGiQ library</h2><p>Enter the Lab PIN once for this browser session. It is used only by the existing production map functions.</p><input id="logiq-pin-input" type="password" inputmode="numeric" autocomplete="current-password" aria-label="Lab PIN" required><span class="logiq-pin-error">That PIN was not accepted.</span><div class="logiq-pin-actions"><button type="button" class="logiq-icon-btn" id="logiq-pin-cancel" aria-label="Cancel">×</button><button class="logiq-primary" type="submit">Connect</button></div></form>
      </div>
    `)

    return {
      saveStates: Array.from(document.querySelectorAll('.logiq-save-state')),
      mobileName: document.getElementById('logiq-mobile-map-name'),
      menuButton: document.getElementById('logiq-mobile-menu-btn'),
      mobilePanel: document.getElementById('logiq-mobile-panel'),
      mobileInput: document.getElementById('logiq-mobile-word-input'),
      mobileContext: document.getElementById('logiq-mobile-context'),
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
      if (open) ui.mobileInput.focus()
    })
    document.getElementById('logiq-mobile-library-btn').addEventListener('click', openLibrary)

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
      if (action === 'move') {
        app.structuralMode = !app.structuralMode
        button.classList.toggle('is-active', app.structuralMode)
      }
      if (action === 'edit') bridge.editSelected()
      if (action === 'child') bridge.addChild()
      if (action === 'delete' && window.confirm('Delete the selected node or subtree?')) bridge.deleteSelection()
    })

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
    if (app.structuralMode) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', bubbles: true, cancelable: true }))
      bridge.dispatchKey(key)
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'v', bubbles: true, cancelable: true }))
    } else {
      bridge.dispatchKey(key)
    }
  }

  function updateContextActions() {
    const selected = bridge.getSelectedUid() || bridge.getSelectedUids().length
    ui.mobileContext.classList.toggle('is-visible', !!selected)
    if (!selected) {
      app.structuralMode = false
      ui.mobileContext.querySelector('[data-action="move"]')?.classList.remove('is-active')
    }
  }

  function updateMapName() {
    ui.mobileName.textContent = app.current.name || DEFAULT_NAME
    localStorage.setItem(CURRENT_KEY, JSON.stringify(app.current))
  }

  function setSaveState(state) {
    const text = state === 'saving' ? 'Saving' : state === 'offline' ? 'Offline' : 'Saved'
    ui.saveStates.forEach((element) => {
      element.dataset.state = state
      element.textContent = text
      element.title = state === 'offline' ? 'Changes are safe on this device and will retry when connected.' : ''
    })
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
    setSaveState(navigator.onLine ? 'saving' : 'offline')
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
    if (!navigator.onLine) return setSaveState('offline')

    const pin = await getPin(true)
    if (!pin) return setSaveState('offline')

    app.saving = true
    setSaveState('saving')
    try {
      const id = await rpc('logiq_map_save', {
        pin,
        map_name: pending.name || DEFAULT_NAME,
        map_tree: pending.tree,
        map_word_bank: pending.word_bank || [],
        map_id: pending.id || null,
      })
      app.current = { id: typeof id === 'string' ? id : (id?.id || pending.id), name: pending.name || DEFAULT_NAME }
      updateMapName()
      const latest = readJson(PENDING_KEY, null)
      if (latest?.updated_at === pending.updated_at) localStorage.removeItem(PENDING_KEY)
      setSaveState(localStorage.getItem(PENDING_KEY) ? 'saving' : 'saved')
    } catch (error) {
      if (error.auth) sessionStorage.removeItem(PIN_KEY)
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

  async function rpc(name, body) {
    let response
    try {
      response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        cache: 'no-store',
      })
    } catch (cause) {
      throw Object.assign(new Error('Network unavailable'), { cause })
    }
    const text = await response.text()
    let data = null
    try { data = text ? JSON.parse(text) : null } catch (_error) { data = text }
    if (!response.ok) {
      const message = data?.message || data?.hint || `Request failed (${response.status})`
      throw Object.assign(new Error(message), { status: response.status, auth: response.status < 500 })
    }
    return data
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
    const pin = await getPin(true)
    if (!pin) {
      ui.mapList.innerHTML = '<div class="logiq-empty">Connect to view production maps.</div>'
      return
    }
    try {
      const rows = await rpc('logiq_map_list', { pin })
      app.libraryRows = Array.isArray(rows) ? rows : []
      renderLibrary()
    } catch (error) {
      if (error.auth) sessionStorage.removeItem(PIN_KEY)
      ui.mapList.innerHTML = `<div class="logiq-empty">${navigator.onLine ? 'Could not load maps. Check the Lab PIN.' : 'Offline. Saved changes will retry.'}</div>`
    }
  }

  function renderLibrary() {
    if (!app.libraryRows.length) {
      ui.mapList.innerHTML = '<div class="logiq-empty">No production maps yet. Create one to begin.</div>'
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
    const pin = await getPin(true)
    if (!pin) return
    try {
      await rpc('logiq_map_save', {
        pin,
        map_name: name,
        map_tree: row.tree,
        map_word_bank: row.word_bank || [],
        map_id: row.id,
      })
      row.name = name
      if (row.id === app.current.id) {
        app.current.name = name
        updateMapName()
      }
      renderLibrary()
      setSaveState('saved')
    } catch (error) {
      if (error.auth) sessionStorage.removeItem(PIN_KEY)
      setSaveState('offline')
    }
  }

  async function deleteMap(row) {
    const pin = await getPin(true)
    if (!pin) return
    try {
      await rpc('logiq_map_delete', { pin, map_id: row.id })
      app.libraryRows = app.libraryRows.filter((item) => item.id !== row.id)
      if (app.current.id === row.id) {
        app.current = { id: null, name: DEFAULT_NAME }
        updateMapName()
      }
      renderLibrary()
    } catch (error) {
      if (error.auth) sessionStorage.removeItem(PIN_KEY)
      setSaveState('offline')
    }
  }
})()
