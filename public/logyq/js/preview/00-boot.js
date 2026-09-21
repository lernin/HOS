(() => {
  'use strict'

  const bridge = window.LOGYQBridge
  if (!bridge) return

  // Preview bag: spawn-puck / tap-vs-pan live here, not on the engine `logyq` bag.
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

