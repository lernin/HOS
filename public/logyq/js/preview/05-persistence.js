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
