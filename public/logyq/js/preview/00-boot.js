(() => {
  'use strict'

  const bridge = window.LOGYQBridge
  if (!bridge) return

  // Preview bag: v162 mobile gestures + header-mic voice live here, not on the engine `logyq` bag.
  const preview = {
    app: null,
    ui: null,
    bridge,
    gestures: null,
  }
  function attach(name, value) {
    preview[name] = value
    return value
  }
  window.LOGYQPreview = preview

  const PIN_KEY = 'logyq_lab_pin_v1'
  const CURRENT_KEY = 'logyq_current_map_v1'
  const PENDING_KEY = 'logyq_pending_save_v1'
  const LIBRARY_KEY = 'logyq_maps_v1'
  const HAND_KEY = 'logyq_handedness_v1'
  const DEFAULT_NAME = 'Untitled map'

  const app = {
    current: readJson(CURRENT_KEY, { id: null, name: DEFAULT_NAME }),
    lastSnapshot: stableSnapshot(bridge.snapshot()),
    timer: null,
    saving: false,
    saveAgain: false,
    libraryRows: [],
    recorder: null,
    recordingStream: null,
    recordingChunks: [],
  }
  preview.app = app

  injectStyles()
  const ui = buildUi()
  preview.ui = ui
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

  window.addEventListener('online', retryPending)
  if (recovered) setTimeout(retryPending, 500)

