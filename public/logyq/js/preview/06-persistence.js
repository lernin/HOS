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

  function isFieldEditing() {
    if (bridge.core?.state?.editingUid) return true
    const input = document.querySelector('.node-edit-input')
    return !!(input && input.isConnected)
  }

  function queueAutosave(snapshot) {
    if (app.curriculum) {
      setSaveState('saved')
      maybeCurriculumClear(snapshot)
      return
    }
    if (app.applyingRemote) return
    if (app.heldRemote) {
      if (isFieldEditing()) {
        clearTimeout(app.timer)
        localStorage.removeItem(PENDING_KEY)
        return
      }
      if (settleHeldRemote(snapshot)) return
    }
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
      folder_id: app.current.id ? null : (app.draftFolderId || null),
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
    if (app.curriculum) {
      if (localStorage.getItem(PENDING_KEY)) {
        clearTimeout(app.timer)
        app.timer = setTimeout(savePending, 850)
      }
      return
    }
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

    let savedOk = false
    app.saving = true
    setSaveState('saving')
    try {
      let payload = encodeMapRecord({
        name: pending.name || DEFAULT_NAME,
        tree: pending.tree,
        wordBank: pending.word_bank,
      })
      if (pending.id) {
        const gate = await reconcileBeforeSave(pending, pin)
        if (gate?.skip) {
          const latest = readJson(PENDING_KEY, null)
          if (latest?.updated_at === pending.updated_at) localStorage.removeItem(PENDING_KEY)
          setSaveState(localStorage.getItem(PENDING_KEY) ? 'saving' : 'saved')
          return
        }
        if (gate?.payload) payload = gate.payload
      }
      const id = await rpc('logiq_map_save', {
        pin,
        map_name: payload.name,
        map_tree: payload.tree,
        map_word_bank: payload.word_bank,
        map_id: pending.id || null,
      })
      acceptPin(pin)
      const savedId = typeof id === 'string' ? id : (id?.id || pending.id)
      app.current = { id: savedId, name: payload.name }
      if (!pending.id && savedId && pending.folder_id) {
        writeFolderIndex(placeMap(readFolderIndex(), savedId, pending.folder_id))
        app.draftFolderId = null
      }
      updateMapName()
      app.ackedTree = decodeMapTree(payload.tree)
      app.ackedWordBank = payload.word_bank.slice()
      app.ackedName = payload.name
      app.ackedContent = contentKey(payload.tree, payload.word_bank)
      app.lastSnapshot = app.ackedContent
      const latest = readJson(PENDING_KEY, null)
      if (latest?.updated_at === pending.updated_at) localStorage.removeItem(PENDING_KEY)
      setSaveState(localStorage.getItem(PENDING_KEY) ? 'saving' : 'saved')
      savedOk = true
    } catch (error) {
      if (error.auth) forgetPin()
      setSaveState('offline')
    } finally {
      app.saving = false
      if (savedOk) pullRemote()
      if (app.saveAgain) {
        app.saveAgain = false
        clearTimeout(app.timer)
        app.timer = setTimeout(savePending, 1100)
      }
    }
  }

  let memoryPin = null
  let pinResolver = null
  let libraryTask = null

  function readStoredPin() {
    try {
      const stored = sessionStorage.getItem(PIN_KEY)
      if (stored) return stored
    } catch (_error) {}
    return memoryPin
  }

  function acceptPin(value) {
    memoryPin = value || null
    if (!value) return
    try { sessionStorage.setItem(PIN_KEY, value) } catch (_error) {}
  }

  function forgetPin() {
    memoryPin = null
    try { sessionStorage.removeItem(PIN_KEY) } catch (_error) {}
  }

  function getPin(interactive, options = {}) {
    const stored = readStoredPin()
    if (stored || !interactive) return Promise.resolve(stored)
    if (pinResolver) return new Promise((resolve) => {
      const prior = pinResolver
      pinResolver = (value) => { prior(value); resolve(value) }
    })
    ui.pinInput.value = ''
    if (!options.keepError) ui.pinError.classList.remove('is-visible')
    ui.pin.classList.add('is-open')
    ui.pin.setAttribute('aria-hidden', 'false')
    requestAnimationFrame(() => ui.pinInput.focus())
    return new Promise((resolve) => { pinResolver = resolve })
  }

  function finishPin(value) {
    if (!pinResolver) return
    ui.pin.classList.remove('is-open')
    ui.pin.setAttribute('aria-hidden', 'true')
    const resolve = pinResolver
    pinResolver = null
    resolve(value || null)
  }

  function showLibrary() {
    document.body.classList.add('logyq-home')
    document.body.classList.toggle('logyq-map-open', !!app.hasOpenMap)
    setHomeTab('maps')
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
    app.draftFolderId = null
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
    if (!libraryTask) {
      app.libraryStatus = 'loading'
      ui.mapList.innerHTML = '<div class="logiq-empty">Loading maps…</div>'
    }
    await refreshLibrary()
  }

  function closeLibrary() {
    if (!app.hasOpenMap) return
    hideLibrary()
  }

  async function listLiveMaps() {
    let keepError = false
    for (;;) {
      const pin = await getPin(true, { keepError })
      keepError = false
      if (!pin) throw Object.assign(new Error('Lab PIN required'), { locked: true })
      try {
        const rows = await rpc('logiq_map_list', { pin })
        if (!Array.isArray(rows)) throw new Error('Could not read the map list.')
        acceptPin(pin)
        const list = rows.slice()
        list.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))
        cacheLibrary(list)
        return list
      } catch (error) {
        if (!error.auth) throw error
        forgetPin()
        ui.pinError.textContent = 'That PIN was not accepted. Your maps are still saved.'
        ui.pinError.classList.add('is-visible')
        keepError = true
      }
    }
  }

  function refreshLibrary() {
    if (libraryTask) return libraryTask
    libraryTask = refreshLibraryNow().finally(() => { libraryTask = null })
    return libraryTask
  }

  async function refreshLibraryNow() {
    try {
      app.libraryRows = await listLiveMaps()
      app.libraryStatus = 'live'
      writeFolderIndex(prunePlacements(readFolderIndex(), app.libraryRows))
      renderLibrary()
    } catch (error) {
      if (error.auth) forgetPin()
      app.libraryRows = readCachedLibrary()
      app.libraryStatus = error.locked ? 'locked' : 'error'
      renderLibrary()
    }
  }

  function folderChoiceOptions(choices) {
    return choices.map((choice) => `<option value="${escapeHtml(choice.id || '')}">${escapeHtml(choice.label)}</option>`).join('')
  }

  function renderFolderCrumbs(crumbs) {
    if (!crumbs.length) return ''
    const parts = ['<button type="button" data-crumb="">My maps</button>']
    crumbs.forEach((folder, index) => {
      parts.push('<span class="logyq-crumb-sep" aria-hidden="true">/</span>')
      if (index === crumbs.length - 1) parts.push(`<span aria-current="page">${escapeHtml(folder.name)}</span>`)
      else parts.push(`<button type="button" data-crumb="${escapeHtml(folder.id)}">${escapeHtml(folder.name)}</button>`)
    })
    return `<nav class="logyq-crumbs" aria-label="Folders">${parts.join('')}</nav>`
  }

  function renderFolderComposer() {
    return '<form class="logyq-new-folder-form" data-new-folder><input aria-label="Folder name" placeholder="Folder name" maxlength="80"><button type="submit">Add</button></form>'
  }

  function renderFolderRow(index, rows, folder) {
    const choices = moveChoices(index, { kind: 'folder', id: folder.id, currentParentId: folder.parentId })
    const move = choices.length
      ? `<form class="logyq-move-form" data-folder-move><select aria-label="Move ${escapeHtml(folder.name)} to">${folderChoiceOptions(choices)}</select><button type="submit">Move</button></form>`
      : ''
    const moveBtn = choices.length ? '<button type="button" data-folder-action="move">Move</button>' : ''
    return `<article class="logyq-folder-row" data-folder-id="${escapeHtml(folder.id)}">
      <button type="button" class="logyq-folder-open" data-open-folder="${escapeHtml(folder.id)}">
        <span class="logyq-folder-mark" aria-hidden="true"></span>
        <span class="logyq-folder-copy"><span class="logiq-map-name">${escapeHtml(folder.name)}</span><span class="logiq-map-time">${escapeHtml(insideLabel(directCount(index, rows, folder.id)))}</span></span>
      </button>
      <div class="logiq-map-actions"><button type="button" data-folder-action="rename">Rename</button>${moveBtn}<button type="button" class="danger" data-folder-action="delete">Delete</button></div>
      <form class="logiq-inline-rename" data-folder-rename><input value="${escapeHtml(folder.name)}" aria-label="Folder name" maxlength="80"><button type="submit">Done</button></form>
      ${move}
    </article>`
  }

  function renderMapRow(index, row) {
    const placed = index.placements[row.id] || null
    const choices = moveChoices(index, { kind: 'map', id: row.id, currentParentId: placed })
    const current = row.id === app.current.id ? ' is-current' : ''
    const when = formatUpdatedAt(row.updated_at)
    const moveBtn = choices.length ? '<button type="button" data-map-action="move">Move</button>' : ''
    const move = choices.length
      ? `<form class="logyq-move-form" data-map-move><select aria-label="Move ${escapeHtml(row.name || DEFAULT_NAME)} to">${folderChoiceOptions(choices)}</select><button type="submit">Move</button></form>`
      : ''
    return `<article class="logiq-map-row${current}" data-id="${escapeHtml(row.id)}">
      <div><div class="logiq-map-name">${escapeHtml(row.name || DEFAULT_NAME)}</div><div class="logiq-map-time">${escapeHtml(when)}</div></div>
      <div class="logiq-map-actions"><button type="button" data-map-action="rename">Rename</button>${moveBtn}<button type="button" class="danger" data-map-action="delete">Delete</button></div>
      <form class="logiq-inline-rename"><input value="${escapeHtml(row.name || DEFAULT_NAME)}" aria-label="Map name"><button type="submit">Done</button></form>
      ${move}
    </article>`
  }

  function openLibraryFolder(id) {
    const index = readFolderIndex()
    app.libraryFolderId = id && index.folders.some((folder) => folder.id === id) ? id : null
    app.folderComposer = false
    renderLibrary()
  }

  function addLibraryFolder(name) {
    const index = readFolderIndex()
    const parentId = index.folders.some((folder) => folder.id === app.libraryFolderId) ? app.libraryFolderId : null
    const created = createFolder(index, { name, parentId })
    if (created.ok) writeFolderIndex(created.index)
    app.folderComposer = false
    renderLibrary()
  }

  function renderLibrary() {
    const rows = Array.isArray(app.libraryRows) ? app.libraryRows : []
    const status = app.libraryStatus || 'live'
    if (status === 'loading') {
      ui.mapList.innerHTML = '<div class="logiq-empty">Loading maps…</div>'
      return
    }
    const index = readFolderIndex()
    const open = index.folders.some((folder) => folder.id === app.libraryFolderId) ? app.libraryFolderId : null
    if (app.libraryFolderId !== open) app.libraryFolderId = open
    const head = renderFolderCrumbs(folderCrumbs(index, open)) + (app.folderComposer ? renderFolderComposer() : '')
    if (!rows.length && !index.folders.length && !open) {
      if (status === 'locked') {
        ui.mapList.innerHTML = `${head}<div class="logiq-empty"><p>Your maps are still saved. Enter the Lab PIN to open them.</p><button type="button" class="logiq-primary" data-connect>Connect</button></div>`
        return
      }
      if (status !== 'live') {
        ui.mapList.innerHTML = `${head}<div class="logiq-empty"><p>${navigator.onLine ? 'Could not load maps. Nothing was deleted.' : 'Offline. Saved changes will retry.'}</p><button type="button" class="logiq-primary" data-connect>Try again</button></div>`
        return
      }
      ui.mapList.innerHTML = `${head}<div class="logiq-empty"><p>No maps yet.</p><button type="button" class="logiq-primary" data-empty-new>+ New</button></div>`
      return
    }
    const view = libraryView(index, rows, open)
    const note = status === 'live' ? '' : '<div class="logiq-library-note"><p>Showing maps last opened on this device. Connect to refresh the Lab. Nothing was deleted.</p><button type="button" class="logiq-primary" data-connect>Connect</button></div>'
    const foldersHtml = view.folders.map((folder) => renderFolderRow(index, rows, folder)).join('')
    const mapsHtml = view.maps.map((row) => renderMapRow(index, row)).join('')
    const empty = !view.folders.length && !view.maps.length
      ? `<div class="logiq-empty"><p>${open ? 'This folder is empty.' : 'No maps yet.'}</p>${open ? '' : '<button type="button" class="logiq-primary" data-empty-new>+ New</button>'}</div>`
      : ''
    ui.mapList.innerHTML = head + note + foldersHtml + mapsHtml + empty
  }

  async function handleFolderAction(event, folderElement) {
    const id = folderElement.dataset.folderId
    const index = readFolderIndex()
    const folder = index.folders.find((item) => item.id === id)
    if (!folder) return
    const renameForm = event.target.closest('[data-folder-rename]')
    if (renameForm) {
      if (!event.target.closest('button')) return
      event.preventDefault()
      const renamed = renameFolder(index, id, renameForm.querySelector('input').value)
      if (renamed.ok) writeFolderIndex(renamed.index)
      renderLibrary()
      return
    }
    const moveForm = event.target.closest('[data-folder-move]')
    if (moveForm) {
      if (!event.target.closest('button')) return
      event.preventDefault()
      const moved = moveFolder(index, id, moveForm.querySelector('select').value || null)
      if (moved.ok) writeFolderIndex(moved.index)
      renderLibrary()
      return
    }
    const action = event.target.closest('[data-folder-action]')?.dataset.folderAction
    if (action === 'rename') {
      folderElement.querySelector('[data-folder-rename]')?.classList.add('is-open')
      folderElement.querySelector('[data-folder-move]')?.classList.remove('is-open')
      folderElement.querySelector('[data-folder-rename] input')?.focus()
      return
    }
    if (action === 'move') {
      folderElement.querySelector('[data-folder-move]')?.classList.add('is-open')
      folderElement.querySelector('[data-folder-rename]')?.classList.remove('is-open')
      return
    }
    if (action === 'delete') {
      const count = directCount(index, app.libraryRows, id)
      const parent = index.folders.find((item) => item.id === folder.parentId)
      const home = parent?.name || 'My maps'
      const message = count
        ? `Remove “${folder.name}”? Folders and maps inside move up into ${home}. Saved maps are not deleted.`
        : `Remove empty folder “${folder.name}”?`
      if (!window.confirm(message)) return
      writeFolderIndex(deleteFolder(index, id).index)
      renderLibrary()
      return
    }
    if (event.target.closest('[data-open-folder]')) openLibraryFolder(id)
  }

  async function handleMapAction(event) {
    if (event.target.closest('[data-connect]')) {
      refreshLibrary()
      return
    }
    if (event.target.closest('[data-empty-new]')) {
      createMap({ edit: false })
      return
    }
    const crumb = event.target.closest('[data-crumb]')
    if (crumb) {
      openLibraryFolder(crumb.dataset.crumb || null)
      return
    }
    const createForm = event.target.closest('[data-new-folder]')
    if (createForm) {
      if (!event.target.closest('button')) return
      event.preventDefault()
      addLibraryFolder(createForm.querySelector('input').value)
      return
    }
    const folderElement = event.target.closest('.logyq-folder-row')
    if (folderElement) {
      await handleFolderAction(event, folderElement)
      return
    }
    const rowElement = event.target.closest('.logiq-map-row')
    if (!rowElement) return
    const row = app.libraryRows.find((item) => item.id === rowElement.dataset.id)
    if (!row) return

    const renameForm = event.target.closest('.logiq-inline-rename')
    if (renameForm) {
      if (!event.target.closest('button')) return
      event.preventDefault()
      const name = renameForm.querySelector('input').value.trim() || DEFAULT_NAME
      await renameMap(row, name)
      return
    }
    const moveForm = event.target.closest('[data-map-move]')
    if (moveForm) {
      if (!event.target.closest('button')) return
      event.preventDefault()
      writeFolderIndex(placeMap(readFolderIndex(), row.id, moveForm.querySelector('select').value || null))
      renderLibrary()
      return
    }

    const action = event.target.closest('[data-map-action]')?.dataset.mapAction
    if (action === 'rename') {
      rowElement.querySelector('.logiq-inline-rename').classList.add('is-open')
      rowElement.querySelector('[data-map-move]')?.classList.remove('is-open')
      rowElement.querySelector('.logiq-inline-rename input').focus()
      return
    }
    if (action === 'move') {
      rowElement.querySelector('[data-map-move]')?.classList.add('is-open')
      rowElement.querySelector('.logiq-inline-rename')?.classList.remove('is-open')
      return
    }
    if (action === 'delete' && window.confirm(`Delete “${row.name || DEFAULT_NAME}”?`)) {
      await deleteMap(row)
      return
    }
    if (!action) openMap(row)
  }

  function enterEditor(row, { edit = false, baseline = true } = {}) {
    leaveCurriculumPlay()
    const tree = decodeMapTree(row.tree)
    const wordBank = Array.isArray(row.word_bank) ? row.word_bank : (row.wordBank || [])
    app.current = { id: row.id || null, name: row.name || DEFAULT_NAME }
    app.hasOpenMap = true
    document.body.classList.add('logyq-map-open')
    app.heldRemote = null
    hideConflictBubble()
    app.serverUpdatedAt = baseline && row.updated_at ? row.updated_at : null
    app.ackedName = app.current.name
    app.applyingRemote = true
    app.lastSnapshot = contentKey(tree, wordBank)
    app.ackedContent = app.lastSnapshot
    app.ackedTree = tree
    app.ackedWordBank = wordBank.slice()
    updateMapName()
    hideLibrary()
    bridge.loadMap(tree, wordBank)
    queueMicrotask(() => {
      alignAckToLive()
      app.applyingRemote = false
    })
    if (edit) {
      const uid = bridge.core?.state?.root?.data?._uid
      if (uid) {
        bridge.selectByUid(uid)
        bridge.editSelected({ wipe: true, uid })
      }
    }
    setSaveState('saved')
  }

  function openMap(row) {
    localStorage.removeItem(PENDING_KEY)
    enterEditor(row, { edit: false })
  }

  function createMap({ edit = false } = {}) {
    leaveCurriculumPlay()
    const folderIndex = readFolderIndex()
    app.draftFolderId = folderIndex.folders.some((folder) => folder.id === app.libraryFolderId) ? app.libraryFolderId : null
    const taken = []
    for (const row of app.libraryRows || []) taken.push(row?.name)
    for (const row of readCachedLibrary()) taken.push(row?.name)
    if (app.current?.name) taken.push(app.current.name)
    app.current = { id: null, name: nextUntitledName(taken) }
    app.serverUpdatedAt = null
    app.ackedContent = ''
    app.ackedTree = null
    app.ackedWordBank = []
    app.ackedName = app.current.name
    app.heldRemote = null
    hideConflictBubble()
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
      bridge.editSelected({ wipe: true, uid })
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
      acceptPin(pin)
      row.name = payload.name
      if (row.id === app.current.id) {
        app.current.name = payload.name
        app.ackedName = payload.name
        updateMapName()
      }
      renderLibrary()
      setSaveState('saved')
    } catch (error) {
      if (error.auth) forgetPin()
      setSaveState('offline')
    }
  }

  async function deleteMap(row) {
    const pin = await getPin(true)
    if (!pin) return
    try {
      await rpc('logiq_map_delete', { pin, map_id: row.id })
      acceptPin(pin)
      writeFolderIndex(placeMap(readFolderIndex(), row.id, null))
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
      if (error.auth) forgetPin()
      setSaveState('offline')
    }
  }

  function alignAckToLive() {
    const live = bridge.snapshot()
    const key = contentKey(live?.tree, live?.wordBank)
    app.lastSnapshot = key
    app.ackedContent = key
    app.ackedTree = decodeMapTree(live?.tree)
    app.ackedWordBank = Array.isArray(live?.wordBank) ? live.wordBank.slice() : []
  }

  function ensureConflictBubble() {
    let el = document.getElementById('logyq-db-bubble')
    if (el) return el
    el = document.createElement('div')
    el.id = 'logyq-db-bubble'
    el.className = 'logyq-db-bubble'
    el.setAttribute('role', 'status')
    el.textContent = 'Database change came in.'
    el.hidden = true
    document.body.appendChild(el)
    return el
  }

  let bubbleFrame = 0

  function hideConflictBubble() {
    const el = document.getElementById('logyq-db-bubble')
    if (el) el.hidden = true
    if (bubbleFrame) cancelAnimationFrame(bubbleFrame)
    bubbleFrame = 0
  }

  function placeConflictBubble(el) {
    const input = document.querySelector('.node-edit-input')
    const dock = input?.closest?.('.node-edit-dock')
    const stack = input?.closest?.('.node-edit-stack')
    if (!input) {
      el.hidden = true
      return
    }
    if (dock && stack) {
      if (!stack.classList.contains('is-placed')) {
        el.hidden = true
        return
      }
      if (el.parentElement !== stack || el.nextElementSibling !== dock) stack.insertBefore(el, dock)
      el.dataset.anchor = 'field'
      el.hidden = false
      return
    }
    if (el.parentElement !== document.body) document.body.appendChild(el)
    delete el.dataset.anchor
    const rect = input.getBoundingClientRect()
    if (rect.width < 8 || rect.height < 8) {
      el.hidden = true
      return
    }
    el.hidden = false
    el.style.left = `${rect.left + rect.width / 2}px`
    el.style.top = `${rect.top}px`
  }

  function showConflictBubble() {
    const el = ensureConflictBubble()
    const track = () => {
      bubbleFrame = 0
      if (!app.heldRemote) {
        el.hidden = true
        return
      }
      placeConflictBubble(el)
      bubbleFrame = requestAnimationFrame(track)
    }
    if (!bubbleFrame) {
      placeConflictBubble(el)
      bubbleFrame = requestAnimationFrame(track)
    }
  }

  function holdRemote(row) {
    app.heldRemote = row
    clearTimeout(app.timer)
    localStorage.removeItem(PENDING_KEY)
    if (!app.saving) setSaveState('saved')
    showConflictBubble()
  }

  function acknowledgeRemote(row) {
    if (row?.updated_at) app.serverUpdatedAt = row.updated_at
    if (row?.name && (app.current.name || '') === (app.ackedName || '')) {
      app.current.name = row.name
      updateMapName()
    }
    app.ackedName = app.current.name || app.ackedName
    alignAckToLive()
  }

  function applyRemoteRow(row, options = {}) {
    if (!row || app.curriculum) return
    app.applyingRemote = true
    app.heldRemote = null
    app.editClaim = null
    hideConflictBubble()
    clearTimeout(app.timer)
    localStorage.removeItem(PENDING_KEY)
    const tree = decodeMapTree(row.tree)
    const wordBank = Array.isArray(row.word_bank) ? row.word_bank.slice() : []
    app.current = { id: row.id || app.current.id, name: row.name || app.current.name || DEFAULT_NAME }
    if (row.updated_at) app.serverUpdatedAt = row.updated_at
    app.ackedName = app.current.name
    updateMapName()
    bridge.loadMap(tree, wordBank, {
      keepEditor: !!options.keepEditor && isFieldEditing(),
      fit: false,
      keepSelection: true,
    })
    queueMicrotask(() => {
      alignAckToLive()
      app.applyingRemote = false
    })
    setSaveState('saved')
  }

  function buildMerge(row, live, claim) {
    const remoteTree = decodeMapTree(row.tree)
    const remoteBank = Array.isArray(row.word_bank) ? row.word_bank.slice() : []
    const localTree = live?.tree || remoteTree
    const localBank = Array.isArray(live?.wordBank) ? live.wordBank.slice() : []
    const wins = claim?.submit && claim.uid ? [String(claim.uid)] : []
    const tree = preview.maps.mergeMapTrees({
      acked: app.ackedTree,
      local: localTree,
      remote: remoteTree,
      localWinsUids: wins,
    })
    const wordBank = preview.maps.mergeWordBank(app.ackedWordBank, localBank, remoteBank)
    let name = app.current.name
    if ((app.current.name || '') === (app.ackedName || '') && row.name) name = row.name
    return { tree, wordBank, name }
  }

  function mergeCommit(row, snapshot, claim) {
    const merged = buildMerge(row, snapshot, claim)
    const remoteTree = decodeMapTree(row.tree)
    const remoteBank = Array.isArray(row.word_bank) ? row.word_bank : []
    const sameTree = contentKey(merged.tree, merged.wordBank) === contentKey(remoteTree, remoteBank)
    const sameName = (merged.name || '') === (row.name || app.current.name || '')
    if (sameTree && sameName) {
      applyRemoteRow(row)
      return
    }
    // This remote revision is already folded in. A later poll of the same stamp must not undo Enter.
    if (row.updated_at) app.serverUpdatedAt = row.updated_at
    app.applyingRemote = true
    app.heldRemote = null
    hideConflictBubble()
    clearTimeout(app.timer)
    localStorage.removeItem(PENDING_KEY)
    app.current.name = merged.name || app.current.name
    updateMapName()
    bridge.loadMap(merged.tree, merged.wordBank, { fit: false, keepSelection: true })
    queueMicrotask(() => {
      app.applyingRemote = false
      app.lastSnapshot = app.ackedContent || ''
      queueAutosave(bridge.snapshot())
    })
  }

  function settleHeldRemote(snapshot) {
    if (!app.heldRemote || isFieldEditing()) return false
    const row = app.heldRemote
    const claim = app.editClaim
    app.heldRemote = null
    app.editClaim = null
    hideConflictBubble()
    if (claim?.submit) mergeCommit(row, snapshot || bridge.snapshot(), claim)
    else applyRemoteRow(row)
    return true
  }

  function considerRemoteRow(row) {
    if (!row || !app.hasOpenMap || app.curriculum || app.applyingRemote || app.saving) return
    if (row.id && app.current?.id && row.id !== app.current.id) return
    const remoteBank = Array.isArray(row.word_bank) ? row.word_bank : []
    const remoteKey = contentKey(decodeMapTree(row.tree), remoteBank)
    const live = bridge.snapshot()
    const localKey = contentKey(live?.tree, live?.wordBank)
    const plan = preview.maps.planRemoteSync({
      localAckAt: app.serverUpdatedAt,
      remoteUpdatedAt: row.updated_at,
      localContent: localKey,
      ackedContent: app.ackedContent,
      remoteContent: remoteKey,
      editing: isFieldEditing(),
    })
    if (plan.action === 'ignore') return
    if (plan.action === 'ack') return acknowledgeRemote(row)
    if (plan.action === 'hold') return holdRemote(row)
    if (plan.action === 'apply') return applyRemoteRow(row)
    if (plan.action === 'merge') return mergeCommit(row, live, app.editClaim?.submit ? app.editClaim : null)
  }

  async function reconcileBeforeSave(pending, pin) {
    let rows
    try { rows = await rpc('logiq_map_list', { pin }) } catch (_error) { return null }
    if (!Array.isArray(rows)) return null
    const row = rows.find((item) => item.id === pending.id)
    if (!row) return null
    const remoteBank = Array.isArray(row.word_bank) ? row.word_bank : []
    const remoteKey = contentKey(decodeMapTree(row.tree), remoteBank)
    const live = bridge.snapshot()
    const localKey = contentKey(live?.tree, live?.wordBank)
    const plan = preview.maps.planRemoteSync({
      localAckAt: app.serverUpdatedAt,
      remoteUpdatedAt: row.updated_at,
      localContent: localKey,
      ackedContent: app.ackedContent,
      remoteContent: remoteKey,
      editing: isFieldEditing(),
    })
    if (plan.action === 'ignore') return null
    if (plan.action === 'ack') {
      acknowledgeRemote(row)
      return { skip: true }
    }
    if (plan.action === 'hold') {
      holdRemote(row)
      return { skip: true }
    }
    if (plan.action === 'apply') {
      applyRemoteRow(row)
      return { skip: true }
    }
    const claim = app.editClaim?.submit ? app.editClaim : null
    const merged = buildMerge(row, live, claim)
    if (contentKey(merged.tree, merged.wordBank) === remoteKey && (merged.name || '') === (row.name || '')) {
      applyRemoteRow(row)
      return { skip: true }
    }
    app.current.name = merged.name || app.current.name
    updateMapName()
    if (row.updated_at) app.serverUpdatedAt = row.updated_at
    app.applyingRemote = true
    bridge.loadMap(merged.tree, merged.wordBank, { fit: false, keepSelection: true })
    queueMicrotask(() => { app.applyingRemote = false })
    return {
      payload: encodeMapRecord({
        name: app.current.name,
        tree: merged.tree,
        wordBank: merged.wordBank,
      }),
    }
  }

  let pullFlight = null

  async function pullRemoteNow() {
    if (app.curriculum || !app.hasOpenMap || !app.current?.id || app.saving || app.applyingRemote) return
    if (document.body.classList.contains('v2-branch-drag') || document.body.classList.contains('dragging-mode')) return
    const gesture = preview.gestures?.session
    if (gesture?.flick?.active?.size || gesture?.hold?.race || gesture?.hold?.pan) return
    const pin = readStoredPin()
    if (!pin) return
    let rows
    try { rows = await rpc('logiq_map_list', { pin }) } catch (_error) { return }
    if (!Array.isArray(rows)) return
    const row = rows.find((item) => item.id === app.current.id)
    if (!row) return
    considerRemoteRow(row)
  }

  function pullRemote() {
    if (pullFlight) return pullFlight
    pullFlight = pullRemoteNow().finally(() => { pullFlight = null })
    return pullFlight
  }

  function noteEditClaim(input, claim) {
    if (!input?.classList?.contains('node-edit-input')) return
    app.editClaim = {
      uid: input.dataset.editUid || null,
      name: input.value,
      ...claim,
    }
  }

  document.addEventListener('keydown', (event) => {
    const input = event.target
    if (!input?.classList?.contains?.('node-edit-input')) return
    if (event.key === 'Enter') noteEditClaim(input, { submit: true })
    else if (event.key === 'Escape') noteEditClaim(input, { submit: false, cancel: true })
  }, true)

  document.addEventListener('keyup', (event) => {
    if (event.key !== 'Enter' && event.key !== 'Escape') return
    queueMicrotask(() => settleHeldRemote(bridge.snapshot()))
  }, true)

  document.addEventListener('focusout', (event) => {
    const input = event.target
    if (!input?.classList?.contains?.('node-edit-input')) return
    if (app.editClaim?.submit || app.editClaim?.cancel) return
    if (document.body.classList.contains('logyq-mobile-v162')) return
    noteEditClaim(input, { submit: true })
    queueMicrotask(() => settleHeldRemote(bridge.snapshot()))
  }, true)

  setInterval(() => { pullRemote() }, preview.maps.REMOTE_POLL_MS)

  preview.sync = {
    pullRemote,
    considerRemoteRow,
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
      }, { edit: false, baseline: false })
      app.booted = true
      setTimeout(retryPending, 500)
      return
    }
    if (recovered) localStorage.removeItem(PENDING_KEY)
    app.hasOpenMap = false
    document.body.classList.remove('logyq-map-open')
    showLibrary()
    app.libraryStatus = 'loading'
    ui.mapList.innerHTML = '<div class="logiq-empty">Loading maps…</div>'
    await refreshLibrary()
    app.booted = true
  }

