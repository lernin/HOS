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
