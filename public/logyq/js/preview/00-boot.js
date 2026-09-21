(() => {
  'use strict'

  const bridge = window.LOGYQBridge
  if (!bridge) return

  const SUPABASE_URL = 'https://jzaghifuhinkzzhiojre.supabase.co'
  const SUPABASE_KEY = 'sb_publishable_rQDzA5bYlbzvaTjyo-uTXw_LiiIAddI'
  const PIN_KEY = 'logiq_lab_pin_v1'
  const CURRENT_KEY = 'logyq_current_map_v1'
  const PENDING_KEY = 'logyq_pending_save_v1'
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
  window.addEventListener('offline', () => setSaveState('offline'))
  updateContextActions()
  if (recovered && navigator.onLine) setTimeout(retryPending, 500)

