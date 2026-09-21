  function setSaveState(state) {
    const text = state === 'saving' ? 'Saving' : state === 'offline' ? 'Offline' : 'Saved'
    ui.saveStates.forEach((element) => {
      element.dataset.state = state
      element.textContent = text
      element.title = state === 'offline' ? 'Changes could not be stored on this device.' : ''
    })
  }

  function cacheLibrary(rows) {
    try { localStorage.setItem(LIBRARY_KEY, JSON.stringify(rows)) } catch (_error) {}
  }

  function readCachedLibrary() {
    const rows = readJson(LIBRARY_KEY, [])
    return Array.isArray(rows) ? rows : []
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

  function queueAutosave(snapshot) {
    if (!app.hasOpenMap) return
    if (isBlankDraft({
      id: app.current.id,
      name: app.current.name,
      tree: snapshot?.tree,
      wordBank: snapshot?.wordBank,
    })) {
      localStorage.removeItem(PENDING_KEY)
      clearTimeout(app.timer)
      setSaveState('saved')
      return
    }
    const encoded = encodeMapRecord({
      name: app.current.name || DEFAULT_NAME,
      tree: snapshot?.tree,
      wordBank: snapshot?.wordBank,
    })
    const serialized = stableSnapshot({ tree: encoded.tree, wordBank: encoded.word_bank })
    if (serialized === app.lastSnapshot) return
    app.lastSnapshot = serialized
    localStorage.setItem(PENDING_KEY, JSON.stringify({
      id: app.current.id,
      name: encoded.name,
      tree: encoded.tree,
      word_bank: encoded.word_bank,
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
    if (isBlankDraft({
      id: pending.id,
      name: pending.name,
      tree: pending.tree,
      wordBank: pending.word_bank,
    })) {
      localStorage.removeItem(PENDING_KEY)
      return setSaveState('saved')
    }
    if (!navigator.onLine) return setSaveState('offline')

    const pin = await getPin(true)
    if (!pin) return setSaveState('offline')

    app.saving = true
    setSaveState('saving')
    try {
      const payload = encodeMapRecord({
        name: pending.name || DEFAULT_NAME,
        tree: pending.tree,
        wordBank: pending.word_bank,
      })
      const id = await rpc('logiq_map_save', {
        pin,
        map_name: payload.name,
        map_tree: payload.tree,
        map_word_bank: payload.word_bank,
        map_id: pending.id || null,
      })
      app.current = { id: typeof id === 'string' ? id : (id?.id || pending.id), name: payload.name }
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

  function showLibrary() {
    document.body.classList.add('logyq-home')
    document.body.classList.toggle('logyq-map-open', !!app.hasOpenMap)
    ui.library.classList.add('is-open')
    ui.library.setAttribute('aria-hidden', 'false')
  }

  function hideLibrary() {
    document.body.classList.remove('logyq-home')
    ui.library.classList.remove('is-open')
    ui.library.setAttribute('aria-hidden', 'true')
  }

  function abandonBlankDraft() {
    if (!app.hasOpenMap || app.current.id) return
    const snapshot = bridge.snapshot()
    if (!isBlankDraft({
      id: app.current.id,
      name: app.current.name,
      tree: snapshot?.tree,
      wordBank: snapshot?.wordBank,
    })) return
    app.hasOpenMap = false
    document.body.classList.remove('logyq-map-open')
    app.current = { id: null, name: DEFAULT_NAME }
    app.lastSnapshot = ''
    localStorage.removeItem(PENDING_KEY)
    updateMapName()
    setSaveState('saved')
  }

  function openHomeLibrary() {
    app.hasOpenMap = false
    document.body.classList.remove('logyq-map-open')
    showLibrary()
    renderLibrary()
  }

  async function openLibrary() {
    closeMobilePanel()
    abandonBlankDraft()
    showLibrary()
    ui.mapList.innerHTML = '<div class="logiq-empty">Loading maps…</div>'
    await refreshLibrary()
  }

  function closeLibrary() {
    if (!app.hasOpenMap) return
    hideLibrary()
  }

  async function listLiveMaps() {
    const pin = await getPin(true)
    if (!pin) return readCachedLibrary()
    const rows = await rpc('logiq_map_list', { pin })
    const list = Array.isArray(rows) ? rows.slice() : []
    list.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))
    cacheLibrary(list)
    return list
  }

  async function refreshLibrary() {
    try {
      app.libraryRows = await listLiveMaps()
      renderLibrary()
    } catch (error) {
      if (error.auth) sessionStorage.removeItem(PIN_KEY)
      app.libraryRows = readCachedLibrary()
      if (app.libraryRows.length) renderLibrary()
      else ui.mapList.innerHTML = `<div class="logiq-empty">${navigator.onLine ? 'Could not load maps. Check the Lab PIN.' : 'Offline. Saved changes will retry.'}</div>`
    }
  }

  function renderLibrary() {
    const rows = Array.isArray(app.libraryRows) ? app.libraryRows : []
    if (!rows.length) {
      ui.mapList.innerHTML = '<div class="logiq-empty"><p>No maps yet.</p><button type="button" class="logiq-primary" data-empty-new>+ New</button></div>'
      return
    }
    ui.mapList.innerHTML = rows.map((row) => {
      const current = row.id === app.current.id ? ' is-current' : ''
      const when = formatUpdatedAt(row.updated_at)
      return `<article class="logiq-map-row${current}" data-id="${escapeHtml(row.id)}">
        <div><div class="logiq-map-name">${escapeHtml(row.name || DEFAULT_NAME)}</div><div class="logiq-map-time">${escapeHtml(when)}</div></div>
        <div class="logiq-map-actions"><button type="button" data-map-action="rename">Rename</button><button type="button" class="danger" data-map-action="delete">Delete</button></div>
        <form class="logiq-inline-rename"><input value="${escapeHtml(row.name || DEFAULT_NAME)}" aria-label="Map name"><button>Done</button></form>
      </article>`
    }).join('')
  }

  async function handleMapAction(event) {
    if (event.target.closest('[data-empty-new]')) {
      createMap({ edit: false })
      return
    }
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
    if (action === 'rename') {
      rowElement.querySelector('.logiq-inline-rename').classList.toggle('is-open')
      rowElement.querySelector('input').focus()
      return
    }
    if (action === 'delete' && window.confirm(`Delete “${row.name || DEFAULT_NAME}”?`)) {
      await deleteMap(row)
      return
    }
    if (!action) openMap(row)
  }

  function enterEditor(row, { edit = false } = {}) {
    const tree = decodeMapTree(row.tree)
    const wordBank = Array.isArray(row.word_bank) ? row.word_bank : (row.wordBank || [])
    app.current = { id: row.id || null, name: row.name || DEFAULT_NAME }
    app.hasOpenMap = true
    document.body.classList.add('logyq-map-open')
    app.lastSnapshot = stableSnapshot({ tree, wordBank })
    updateMapName()
    hideLibrary()
    bridge.loadMap(tree, wordBank)
    if (edit) {
      const uid = bridge.core?.state?.root?.data?._uid
      if (uid) {
        bridge.selectByUid(uid)
        bridge.editSelected({ wipe: true })
      }
    }
    setSaveState('saved')
  }

  function openMap(row) {
    localStorage.removeItem(PENDING_KEY)
    enterEditor(row, { edit: false })
  }

  function createMap({ edit = false } = {}) {
    app.current = { id: null, name: DEFAULT_NAME }
    const tree = encodeMapTree({ name: '' })
    app.hasOpenMap = true
    document.body.classList.add('logyq-map-open')
    app.lastSnapshot = ''
    updateMapName()
    hideLibrary()
    bridge.loadMap(tree, [])
    const uid = bridge.core?.state?.root?.data?._uid
    if (uid && edit) {
      bridge.selectByUid(uid)
      bridge.editSelected({ wipe: true })
    }
  }

  async function renameMap(row, name) {
    const pin = await getPin(true)
    if (!pin) return
    try {
      const payload = encodeMapRecord({
        name,
        tree: row.tree,
        wordBank: row.word_bank,
      })
      await rpc('logiq_map_save', {
        pin,
        map_name: payload.name,
        map_tree: payload.tree,
        map_word_bank: payload.word_bank,
        map_id: row.id,
      })
      row.name = payload.name
      if (row.id === app.current.id) {
        app.current.name = payload.name
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
      cacheLibrary(app.libraryRows)
      if (app.current.id === row.id) {
        app.current = { id: null, name: DEFAULT_NAME }
        app.hasOpenMap = false
        document.body.classList.remove('logyq-map-open')
        updateMapName()
      }
      renderLibrary()
      if (!app.libraryRows.length) openHomeLibrary()
    } catch (error) {
      if (error.auth) sessionStorage.removeItem(PIN_KEY)
      setSaveState('offline')
    }
  }

  async function bootSession() {
    const recovered = readJson(PENDING_KEY, null)
    if (recovered?.tree && !isBlankDraft({
      id: recovered.id || null,
      name: recovered.name,
      tree: recovered.tree,
      wordBank: recovered.word_bank || [],
    })) {
      enterEditor({
        id: recovered.id || null,
        name: recovered.name || DEFAULT_NAME,
        tree: recovered.tree,
        word_bank: recovered.word_bank || [],
      }, { edit: false })
      app.booted = true
      setTimeout(retryPending, 500)
      return
    }
    if (recovered) localStorage.removeItem(PENDING_KEY)
    try {
      const rows = await listLiveMaps()
      app.libraryRows = rows
      openHomeLibrary()
    } catch (_error) {
      app.libraryRows = readCachedLibrary()
      openHomeLibrary()
    }
    app.booted = true
  }
})()

