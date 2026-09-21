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
      #logiq-mobile-header,#logiq-mobile-panel,#logiq-voice-bar{display:none}

      @media (max-width:700px), (pointer:coarse) and (max-width:1200px), (hover:none) and (max-width:1200px){
        html,body{width:100%;max-width:100%;overflow:hidden}
        body>header{display:none!important}
        svg#canvas{position:fixed;inset:0;width:100%;height:100dvh;max-width:none;touch-action:none;overflow:visible;z-index:0}
        #trash{display:none!important;visibility:hidden!important;pointer-events:none!important}
        #Dock{left:8px;right:8px;bottom:max(8px,env(safe-area-inset-bottom));padding:0 4px;max-height:25dvh;overflow:auto;justify-content:flex-start;flex-wrap:wrap}
        #Dock.dock-left{top:54px;bottom:max(8px,env(safe-area-inset-bottom));left:8px;right:auto;width:min(220px,72vw);padding:8px}
        #Toast{bottom:72px;max-width:calc(100vw - 36px);text-align:center}
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
        #logiq-voice-bar{position:fixed;z-index:3300;left:50%;bottom:70px;transform:translateX(-50%);align-items:center;gap:9px;max-width:calc(100vw - 20px);padding:8px 9px 8px 13px;border-radius:999px;background:#111827;color:#fff;box-shadow:0 12px 34px rgba(15,23,42,.35);font-size:13px;font-weight:700;white-space:nowrap}
        #logiq-voice-bar.is-visible{display:flex}
        #logiq-voice-stop{border:0;border-radius:999px;background:#ef4444;color:#fff;padding:8px 13px;font-weight:800}
        svg#canvas g.node:not(.is-outlined){pointer-events:none}
        body.logyq-mobile-v162 svg#canvas g.node{pointer-events:none!important}
        #logyq-v162-action{position:fixed;z-index:3950;display:none;place-items:center;width:40px;height:40px;padding:0;border:2px solid #fff;border-radius:50%;background:#16a34a;color:#fff;box-shadow:0 7px 20px rgba(15,23,42,.26);font:800 10px/1 system-ui;touch-action:none}
        #logyq-v162-action.show{display:grid}#logyq-v162-action.rec{background:#ef4444}
        #logyq-v162-action.rec::before{content:"";position:absolute;inset:-5px;border:2px solid rgba(239,68,68,.35);border-radius:50%;animation:logyq-v162-pulse 1.05s ease-out infinite}
        @keyframes logyq-v162-pulse{0%{transform:scale(.72);opacity:.95}100%{transform:scale(1.28);opacity:0}}
        .logiq-backdrop{padding:8px;align-items:flex-end}.logiq-modal{max-height:88dvh;border-radius:18px 18px 10px 10px}.logiq-map-row{grid-template-columns:1fr}.logiq-map-actions{justify-content:flex-start}
      }
      @media (pointer:coarse) and (max-width:1200px),(hover:none) and (max-width:1200px){
        body.logyq-mobile-v162 #logiq-v2-drag-card,body.logyq-mobile-v162 .drag-mini,body.logyq-mobile-v162 g.drag-mini{display:none!important;opacity:0!important;visibility:hidden!important}
        body.logyq-mobile-v162.v2-branch-drag .drag-mini{display:none!important;opacity:0!important}
        #logyq-v162-branch-preview{position:fixed;inset:0;z-index:3940;pointer-events:none;overflow:visible;transform:translate3d(0,0,0);will-change:transform}
        #logyq-v162-branch-preview svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none}
        #logyq-v162-branch-preview line{stroke:#cfcfcf;stroke-width:2;stroke-linecap:round}
        #logyq-v162-branch-preview .v2-float-node{position:absolute;box-sizing:border-box;display:flex;align-items:center;justify-content:center;padding:0 8px;border:2px solid #fff;border-radius:10px;background:#fff;color:#374151;box-shadow:0 1px 3px rgba(0,0,0,.12),0 1px 2px rgba(0,0,0,.24);font:600 14px/1.15 Inter,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transform:none!important}
        #logyq-v162-branch-preview .v2-float-node.is-root{border-color:#22c55e!important;box-shadow:0 1px 3px rgba(0,0,0,.12),0 1px 2px rgba(0,0,0,.24)!important}
        body.logyq-mobile-v162.v2-cancel #logyq-v162-branch-preview .v2-float-node.is-root{border-color:#ef4444!important;box-shadow:0 8px 22px rgba(239,68,68,.2)}
        body.logyq-mobile-v162 .v2-branch-origin-ghost{opacity:.44!important}
        body.logyq-mobile-v162 .v2-branch-origin-ghost rect:not(.grabzone){fill:#fff!important;stroke:#94a3b8!important;stroke-width:2px!important;stroke-dasharray:5 4!important;filter:drop-shadow(0 1px 2px rgba(0,0,0,.08))!important}
        body.logyq-mobile-v162 .v2-branch-origin-ghost text{fill:#64748b!important;opacity:.82!important}
        body.logyq-mobile-v162.v2-branch-drag svg.dragging-mode g.nodes g.node.is-others{opacity:1!important}
        body.logyq-mobile-v162.v2-branch-drag svg.dragging-mode g.links path.link{opacity:1!important;stroke:var(--link-color)!important;transition:none!important}
        body.logyq-mobile-v162.v2-branch-drag svg.dragging-mode g.links path.link.is-sub-link,body.logyq-mobile-v162.v2-branch-drag svg.dragging-mode g.links path.link.is-parent-link{opacity:.38!important;stroke:#94a3b8!important}
        body.logyq-mobile-v162.v2-branch-drag{--det-node:transparent!important;--det-sib:transparent!important;--det-cousin-l:transparent!important;--det-cousin-r:transparent!important;--det-edge:transparent!important}
        body.logyq-mobile-v162.v2-branch-drag g.node.drop-target rect:not(.grabzone){fill:#22c55e!important;stroke:#22c55e!important;filter:drop-shadow(0 0 7px rgba(34,197,94,.28))!important}
        body.logyq-mobile-v162.v2-branch-drag g.node.drop-target text{fill:#fff!important;opacity:1!important}
        body.logyq-mobile-v162.v2-branch-drag .caret-dot{fill:#22c55e!important}
        body.logyq-mobile-v162.v2-branch-drag #trash{display:block!important;position:fixed!important;left:-10000px!important;right:auto!important;top:-10000px!important;bottom:auto!important}
      }
      @media (hover:none) and (pointer:coarse) and (max-height:500px){
        #logiq-mobile-header{height:44px;padding-top:4px;padding-bottom:4px}
        #logiq-mobile-panel{top:48px;left:auto;width:min(310px,calc(100vw - 16px))}
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
    document.getElementById('logiq-mobile-mic-btn').addEventListener('click', () => startVoiceCapture())
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
      if (action === 'dock') bridge.cycleDock()
      if (action === 'help') document.getElementById('helpBtn')?.click()
      closeMobilePanel()
    }))
    ui.mobileInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return
      event.preventDefault()
      commitMobileInput(event.shiftKey)
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

  function updateMapName() {
    localStorage.setItem(CURRENT_KEY, JSON.stringify(app.current))
  }

  function showMobileToast(message) {
    const toast = document.getElementById('Toast')
    if (!toast) return
    toast.textContent = message
    toast.style.display = 'inline-flex'
    clearTimeout(showMobileToast.timer)
    showMobileToast.timer = setTimeout(() => { toast.style.display = 'none' }, 1800)
  }

  async function startVoiceCapture() {
    if (app.recorder) return
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      showMobileToast('Voice capture is not available in this browser')
      return
    }
    const pin = await getPin(true)
    if (!pin) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      app.recorder = recorder
      app.recordingStream = stream
      app.recordingChunks = []
      recorder.addEventListener('dataavailable', (event) => { if (event.data?.size) app.recordingChunks.push(event.data) })
      recorder.addEventListener('stop', transcribeRecording, { once: true })
      recorder.start()
      ui.voiceStatus.textContent = 'Listening…'
      ui.voiceBar.classList.add('is-visible')
    } catch (_error) {
      showMobileToast('Microphone permission is needed for voice entry')
    }
  }

  function stopVoiceCapture() {
    if (!app.recorder || app.recorder.state === 'inactive') return
    ui.voiceStatus.textContent = 'Transcribing…'
    app.recorder.stop()
  }

  async function transcribeRecording() {
    const recorder = app.recorder
    const chunks = app.recordingChunks.slice()
    app.recordingStream?.getTracks?.().forEach((track) => track.stop())
    app.recorder = null
    app.recordingStream = null
    app.recordingChunks = []
    try {
      const audio = new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' })
      const form = new FormData()
      form.append('audio', audio, 'logyq-card.webm')
      const response = await fetch('/api/transcribe', { method: 'POST', headers: { 'x-review-pin': await getPin(false) }, body: form })
      const result = await response.json()
      if (!response.ok || !result?.text?.trim()) throw new Error(result?.error || 'No speech detected')
      const text = result.text.trim()
      ui.mobileInput.value = text
      ui.mobileInput.focus()
      showMobileToast('Voice text ready')
    } catch (_error) {
      showMobileToast('Could not transcribe. Type the card instead.')
    } finally {
      ui.voiceBar.classList.remove('is-visible')
    }
  }

  attach('gestures', {
    startVoiceCapture,
    stopVoiceCapture,
  });
  function v162Constants() {
    return {
      FLICK_MIN: 52,
      FLICK_MAX_MS: 340,
      FLICK_RATIO: 1.45,
      HOLD_MS: 280,
      HOLD_SLOP: 8,
      TAP_MOVE: 11,
      DOUBLE_TAP_MS: 360,
    }
  }

  function v162Mobile(win) {
    const target = win || window
    return target.matchMedia('((pointer:coarse) and (max-width:1200px)),((hover:none) and (max-width:1200px))').matches
  }

  function bindV162Gestures() {
    const win = window
    const doc = document
    if (!v162Mobile(win) || !bridge) return
    const canvas = doc.getElementById('canvas')
    if (!canvas || canvas.dataset.logyqV162 === '1') return
    canvas.dataset.logyqV162 = '1'
    doc.body.classList.add('logyq-mobile-v162')
    win.__logyqV2ConsumedPointers ||= new Set()

    const holdState = {
      active: new Set(),
      pointers: new Map(),
      hold: null,
      drag: null,
      feedbackRaf: 0,
    }
    const flickState = {
      active: new Set(),
      candidates: new Map(),
      lastTap: null,
    }
    const mic = ensureCardMic(doc, win)
    holdState.mic = mic
    flickState.mic = mic

    win.addEventListener('pointerdown', (event) => onHoldDown(event, doc, win, canvas, holdState), true)
    win.addEventListener('pointermove', (event) => onHoldMove(event, win, holdState), true)
    win.addEventListener('pointerup', (event) => onHoldUp(event, doc, win, canvas, holdState), true)
    win.addEventListener('pointercancel', (event) => onHoldCancel(event, doc, win, holdState), true)

    canvas.addEventListener('pointerdown', (event) => onFlickDown(event, doc, win, flickState), true)
    canvas.addEventListener('pointerup', (event) => onFlickUp(event, doc, win, flickState), true)
    canvas.addEventListener('pointercancel', (event) => onFlickClear(event, win, flickState), true)
  }

  function onHoldDown(event, doc, win, canvas, state) {
    if (event.pointerType === 'mouse') return
    if (!(event.target === canvas || canvas.contains(event.target))) return
    if (bridge.core?.input?.isTextField?.(event.target)) return
    if (doc.querySelector('.logiq-backdrop.is-open')) return

    const alreadyActive = state.active.size > 0
    if (alreadyActive) {
      state.pointers.forEach((pointer) => { pointer.multi = true })
      cancelHold(win, state)
      if (state.drag) {
        state.drag.multi = true
        doc.body.classList.add('v2-cancel')
      }
    }

    state.active.add(event.pointerId)
    const source = hitNode(doc, event.clientX, event.clientY)
    const uid = nodeUid(source)
    const pointer = {
      x: event.clientX,
      y: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      uid,
      source,
      multi: alreadyActive,
    }
    state.pointers.set(event.pointerId, pointer)
    if (alreadyActive || !uid) return

    const hold = { pointerId: event.pointerId, ...pointer, timer: 0 }
    hold.timer = win.setTimeout(() => latchHold(doc, win, state, hold), v162Constants().HOLD_MS)
    state.hold = hold
  }

  function onHoldMove(event, win, state) {
    const pointer = state.pointers.get(event.pointerId)
    if (!pointer) return
    pointer.lastX = event.clientX
    pointer.lastY = event.clientY

    if (state.hold?.pointerId === event.pointerId) {
      state.hold.lastX = event.clientX
      state.hold.lastY = event.clientY
      if (Math.hypot(event.clientX - state.hold.x, event.clientY - state.hold.y) > v162Constants().HOLD_SLOP) {
        cancelHold(win, state)
      }
      return
    }

    const drag = state.drag
    if (!drag || drag.pointerId !== event.pointerId) return
    drag.lastX = event.clientX
    drag.lastY = event.clientY
    movePreview(drag, event.clientX, event.clientY)
    mouse(win, win, 'mousemove', event.clientX, event.clientY, 1)
  }

  function onHoldUp(event, doc, win, canvas, state) {
    state.active.delete(event.pointerId)
    state.pointers.delete(event.pointerId)
    if (state.hold?.pointerId === event.pointerId) cancelHold(win, state)

    const drag = state.drag
    if (!drag || drag.pointerId !== event.pointerId) return

    event.preventDefault()
    event.stopImmediatePropagation()

    const canceled = doc.body.classList.contains('v2-cancel') || drag.multi
    const endX = canceled ? drag.x : event.clientX
    const endY = canceled ? drag.y : event.clientY

    if (canceled) mouse(win, win, 'mousemove', drag.x, drag.y, 1)
    mouse(win, win, 'mouseup', endX, endY, 0)

    cleanupDrag(doc, win, state, drag)
    dispatchPointerCancel(canvas, win, event.pointerId, event.clientX, event.clientY)
  }

  function onHoldCancel(event, doc, win, state) {
    state.active.delete(event.pointerId)
    state.pointers.delete(event.pointerId)
    if (state.hold?.pointerId === event.pointerId) cancelHold(win, state)

    const drag = state.drag
    if (!drag || drag.pointerId !== event.pointerId) return

    mouse(win, win, 'mousemove', drag.x, drag.y, 1)
    mouse(win, win, 'mouseup', drag.x, drag.y, 0)
    cleanupDrag(doc, win, state, drag)
  }

  function latchHold(doc, win, state, hold) {
    if (state.hold !== hold) return
    const pointer = state.pointers.get(hold.pointerId)
    if (!pointer || pointer.multi || state.active.size !== 1) return cancelHold(win, state)

    state.hold = null
    if (hold.timer) win.clearTimeout(hold.timer)

    const source = nodeByUid(doc, hold.uid) || hold.source
    const hierarchy = source?.__data__
    if (!source || !hierarchy) return

    const branch = typeof hierarchy.descendants === 'function' ? hierarchy.descendants() : [hierarchy]
    const uids = branch.map((item) => item?.data?._uid).filter(Boolean)
    const previewHost = makeBranchPreview(doc, win, branch, hold.uid)
    if (!previewHost) return

    for (const uid of uids) nodeByUid(doc, uid)?.classList.add('v2-branch-origin-ghost')

    win.__logyqV2ConsumedPointers.add(hold.pointerId)
    clearCardMic(state.mic)
    state.drag = {
      pointerId: hold.pointerId,
      uid: hold.uid,
      uids,
      x: hold.x,
      y: hold.y,
      lastX: hold.lastX,
      lastY: hold.lastY,
      preview: previewHost,
      multi: false,
    }

    doc.body.classList.add('v2-branch-drag')
    bridge.selectByUid(hold.uid)
    mouse(source, win, 'mousedown', hold.x, hold.y, 1)
    mouse(win, win, 'mousemove', hold.lastX, hold.lastY, 1)
    movePreview(state.drag, hold.lastX, hold.lastY)
    startFeedbackLoop(win, state)
    win.navigator.vibrate?.(12)
  }

  function makeBranchPreview(doc, win, branch, rootUid) {
    const nodes = []
    const centers = new Map()

    for (const item of branch) {
      const uid = item?.data?._uid
      const node = uid ? nodeByUid(doc, uid) : null
      if (!node) continue
      const rect = node.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) continue
      nodes.push({ item, uid, node, rect })
      centers.set(uid, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
    }
    if (!nodes.length) return null

    const host = doc.createElement('div')
    host.id = 'logyq-v162-branch-preview'
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('aria-hidden', 'true')
    host.appendChild(svg)

    for (const entry of nodes) {
      const parentUid = entry.item?.parent?.data?._uid
      if (!parentUid || !centers.has(parentUid)) continue
      const a = centers.get(parentUid)
      const b = centers.get(entry.uid)
      const line = doc.createElementNS('http://www.w3.org/2000/svg', 'line')
      line.setAttribute('x1', String(a.x)); line.setAttribute('y1', String(a.y))
      line.setAttribute('x2', String(b.x)); line.setAttribute('y2', String(b.y))
      svg.appendChild(line)
    }

    for (const entry of nodes) {
      const card = doc.createElement('div')
      card.className = `v2-float-node${entry.uid === rootUid ? ' is-root' : ''}`
      card.dataset.uid = entry.uid
      card.textContent = cardText(entry.node) || ' '
      card.style.left = `${entry.rect.left}px`
      card.style.top = `${entry.rect.top}px`
      card.style.width = `${entry.rect.width}px`
      card.style.height = `${entry.rect.height}px`
      const text = entry.node.querySelector('text')
      if (text) {
        const computed = win.getComputedStyle(text)
        if (computed.fontSize) card.style.fontSize = computed.fontSize
        if (computed.fontWeight) card.style.fontWeight = computed.fontWeight
      }
      host.appendChild(card)
    }

    doc.body.appendChild(host)
    return host
  }

  function movePreview(drag, x, y) {
    if (!drag?.preview) return
    const dx = x - drag.x
    const dy = y - drag.y
    drag.preview.style.transform = `translate3d(${dx}px,${dy}px,0)`
  }

  function startFeedbackLoop(win, state) {
    if (state.feedbackRaf) win.cancelAnimationFrame(state.feedbackRaf)
    const tick = () => {
      const drag = state.drag
      if (!drag) { state.feedbackRaf = 0; return }
      mouse(win, win, 'mousemove', drag.lastX, drag.lastY, 1)
      state.feedbackRaf = win.requestAnimationFrame(tick)
    }
    state.feedbackRaf = win.requestAnimationFrame(tick)
  }

  function cleanupDrag(doc, win, state, drag) {
    if (!drag) return
    drag.preview?.remove?.()
    for (const uid of drag.uids || []) nodeByUid(doc, uid)?.classList.remove('v2-branch-origin-ghost')
    doc.body.classList.remove('v2-branch-drag', 'v2-cancel')
    if (state.feedbackRaf) win.cancelAnimationFrame(state.feedbackRaf)
    state.feedbackRaf = 0
    if (state.drag === drag) state.drag = null
    win.setTimeout(() => win.__logyqV2ConsumedPointers.delete(drag.pointerId), 0)
  }

  function cancelHold(win, state) {
    const hold = state.hold
    if (!hold) return
    if (hold.timer) win.clearTimeout(hold.timer)
    state.hold = null
  }

  function dispatchPointerCancel(canvas, win, pointerId, x, y) {
    try {
      canvas.dispatchEvent(new win.PointerEvent('pointercancel', {
        bubbles: true,
        cancelable: true,
        pointerType: 'touch',
        pointerId,
        isPrimary: true,
        clientX: x,
        clientY: y,
      }))
    } catch (_error) {}
  }

  function onFlickDown(event, doc, win, state) {
    if (event.pointerType === 'mouse') return

    const alreadyActive = state.active.size > 0
    if (alreadyActive) state.candidates.forEach((candidate) => { candidate.multi = true })
    state.active.add(event.pointerId)

    const node = hitNode(doc, event.clientX, event.clientY)
    const uid = nodeUid(node)
    state.candidates.set(event.pointerId, {
      uid,
      x: event.clientX,
      y: event.clientY,
      started: win.performance.now(),
      multi: alreadyActive,
      moved: false,
      view: captureView(doc, win),
    })
  }

  function onFlickUp(event, doc, win, state) {
    state.active.delete(event.pointerId)
    const candidate = state.candidates.get(event.pointerId)
    state.candidates.delete(event.pointerId)

    if (win.__logyqV2ConsumedPointers.has(event.pointerId)) {
      win.__logyqV2ConsumedPointers.delete(event.pointerId)
      return
    }
    if (!candidate || candidate.multi) {
      state.lastTap = null
      return
    }

    const dx = event.clientX - candidate.x
    const dy = event.clientY - candidate.y
    const elapsed = win.performance.now() - candidate.started
    if (Math.hypot(dx, dy) > v162Constants().TAP_MOVE) candidate.moved = true

    if (candidate.uid && isFlick(dx, dy, elapsed)) {
      const direction = Math.abs(dx) > Math.abs(dy)
        ? (dx < 0 ? 'left' : 'right')
        : (dy < 0 ? 'up' : 'down')
      state.lastTap = null
      win.requestAnimationFrame(() => {
        restoreView(doc, win, candidate.view)
        bridge.selectByUid(candidate.uid)
        const createdUid = bridge.createRelative(direction)
        if (!createdUid) return
        bridge.selectByUid(createdUid)
        armBlankCardMic(state.mic, doc, createdUid)
        win.navigator.vibrate?.(16)
      })
      return
    }

    if (candidate.moved) {
      state.lastTap = null
      return
    }

    const node = hitNode(doc, event.clientX, event.clientY)
    const uid = nodeUid(node)
    if (!uid || uid !== candidate.uid) {
      state.lastTap = null
      clearCardMic(state.mic)
      return
    }

    const now = win.performance.now()
    if (state.lastTap?.uid === uid && now - state.lastTap.time <= v162Constants().DOUBLE_TAP_MS) {
      state.lastTap = null
      clearCardMic(state.mic)
      bridge.selectByUid(uid)
      bridge.editSelected()
      return
    }

    bridge.selectByUid(uid)
    state.lastTap = { uid, time: now }
    if (blank(node)) armBlankCardMic(state.mic, doc, uid)
    else clearCardMic(state.mic)
  }

  function onFlickClear(event, win, state) {
    state.active.delete(event.pointerId)
    state.candidates.delete(event.pointerId)
    win.__logyqV2ConsumedPointers.delete(event.pointerId)
  }

  function isFlick(dx, dy, elapsed) {
    const C = v162Constants()
    const major = Math.max(Math.abs(dx), Math.abs(dy))
    const minor = Math.max(1, Math.min(Math.abs(dx), Math.abs(dy)))
    return elapsed <= C.FLICK_MAX_MS && Math.hypot(dx, dy) >= C.FLICK_MIN && major / minor >= C.FLICK_RATIO
  }

  function nodeUid(node) {
    return node?.__data__?.data?._uid || null
  }

  function nodeByUid(doc, uid) {
    return Array.from(doc.querySelectorAll('g.node')).find((node) => nodeUid(node) === uid) || null
  }

  function hitNode(doc, x, y) {
    return Array.from(doc.querySelectorAll('g.node'))
      .filter((node) => {
        const rect = node.getBoundingClientRect()
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
      })
      .sort((a, b) => {
        const ar = a.getBoundingClientRect()
        const br = b.getBoundingClientRect()
        return ar.width * ar.height - br.width * br.height
      })[0] || null
  }

  function cardText(node) {
    const data = node?.__data__?.data || {}
    for (const key of ['label', 'text', 'name', 'title', 'value']) {
      if (typeof data[key] === 'string' && data[key].trim()) return data[key].trim()
    }
    return Array.from(node?.querySelectorAll?.('text') || [])
      .map((element) => element.textContent?.trim() || '')
      .filter(Boolean)
      .join(' ')
      .trim()
  }

  function blank(node) {
    const text = cardText(node).toLowerCase()
    return !text || ['new', 'new card', 'untitled', '…', '...'].includes(text)
  }

  function ensureCardMic(doc, win) {
    if (preview.gestures?.cardMic) return preview.gestures.cardMic
    const button = doc.createElement('button')
    button.id = 'logyq-v162-action'
    button.type = 'button'
    button.textContent = 'MIC'
    button.setAttribute('aria-label', 'Record card')
    doc.body.appendChild(button)
    const mic = {
      button,
      actionUid: null,
      recorder: null,
      recordingUid: null,
      recordingStream: null,
      chunks: [],
      raf: 0,
    }
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault()
      event.stopImmediatePropagation()
    }, { passive: false })
    button.addEventListener('click', async (event) => {
      event.preventDefault()
      event.stopImmediatePropagation()
      if (!mic.actionUid) return
      if (mic.recorder) stopCardRecording(mic)
      else await startCardRecording(win, mic, mic.actionUid)
    })
    const tick = () => {
      const uid = mic.recordingUid || mic.actionUid
      const node = uid ? nodeByUid(doc, uid) : null
      const rect = node?.getBoundingClientRect()
      const editing = !!doc.querySelector('.node-edit-input')
      const onScreen = rect && rect.width > 1 && rect.height > 1 && rect.right > 0 && rect.left < win.innerWidth && rect.bottom > 0 && rect.top < win.innerHeight
      if (onScreen && !editing) {
        const fitsRight = rect.right + 46 <= win.innerWidth
        const left = fitsRight ? rect.right + 5 : rect.left - 45
        button.style.left = `${Math.max(4, Math.min(win.innerWidth - 44, left))}px`
        button.style.top = `${Math.max(4, Math.min(win.innerHeight - 44, rect.top + Math.max(0, (rect.height - 40) / 2)))}px`
        button.classList.add('show')
        button.classList.toggle('rec', !!mic.recorder)
        button.textContent = mic.recorder ? '■' : 'MIC'
        button.setAttribute('aria-label', mic.recorder ? 'Stop recording' : 'Record card')
      } else {
        button.classList.remove('show')
      }
      mic.raf = win.requestAnimationFrame(tick)
    }
    mic.raf = win.requestAnimationFrame(tick)
    if (preview.gestures) preview.gestures.cardMic = mic
    return mic
  }

  function armBlankCardMic(mic, doc, uid) {
    if (!mic || !uid) return
    const node = nodeByUid(doc, uid)
    if (node && !blank(node)) {
      if (!mic.recorder) mic.actionUid = null
      return
    }
    mic.actionUid = uid
  }

  function clearCardMic(mic) {
    if (!mic || mic.recorder) return
    mic.actionUid = null
  }

  async function startCardRecording(win, mic, uid) {
    if (mic.recorder || app.recorder) return
    if (!win.navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      showMobileToast('Voice recording is unavailable')
      return
    }
    const pin = await getPin(true)
    if (!pin) return
    try {
      const stream = await win.navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      mic.recorder = recorder
      mic.recordingUid = uid
      mic.recordingStream = stream
      mic.chunks = []
      recorder.addEventListener('dataavailable', (event) => { if (event.data?.size) mic.chunks.push(event.data) })
      recorder.addEventListener('stop', () => transcribeCardRecording(win, mic, recorder, pin), { once: true })
      recorder.start()
      win.navigator.vibrate?.(10)
      showMobileToast('Recording… tap MIC to stop')
    } catch (_error) {
      showMobileToast('Microphone permission is needed')
    }
  }

  function stopCardRecording(mic) {
    if (mic.recorder && mic.recorder.state !== 'inactive') mic.recorder.stop()
  }

  async function transcribeCardRecording(win, mic, recorder, pin) {
    const uid = mic.recordingUid
    const chunks = mic.chunks.slice()
    mic.recordingStream?.getTracks?.().forEach((track) => track.stop())
    mic.recordingStream = null
    mic.chunks = []
    try {
      const audio = new win.Blob(chunks, { type: recorder?.mimeType || 'audio/webm' })
      const form = new win.FormData()
      form.append('audio', audio, 'logyq-card.webm')
      const response = await win.fetch('/api/transcribe', { method: 'POST', headers: { 'x-review-pin': pin }, body: form })
      const result = await response.json()
      if (!response.ok || !result?.text?.trim()) {
        if (response.status === 401 || response.status === 403) win.sessionStorage.removeItem(PIN_KEY)
        throw new Error('transcribe')
      }
      const text = result.text.trim()
      bridge.renameNode(uid, text)
      mic.actionUid = null
      showMobileToast(`Added “${text}”`)
    } catch (_error) {
      mic.actionUid = uid
      showMobileToast('Could not transcribe — card left blank')
    } finally {
      mic.recorder = null
      mic.recordingUid = null
    }
  }

  function captureView(doc, win) {
    const svg = doc.getElementById('canvas')
    if (!svg || !win.d3) return null
    const transform = win.d3.zoomTransform(svg)
    return { x: transform.x, y: transform.y, k: transform.k }
  }

  function restoreView(doc, win, view) {
    if (!view || !win.d3) return
    const svg = doc.getElementById('canvas')
    if (!svg) return
    const transform = win.d3.zoomIdentity.translate(view.x, view.y).scale(view.k)
    svg.__zoom = transform
    const root = Array.from(svg.children).find((child) => child.tagName?.toLowerCase() === 'g')
    if (root) root.setAttribute('transform', transform.toString())
  }

  function mouse(target, win, type, x, y, buttons) {
    try {
      target.dispatchEvent(new win.MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: win,
        clientX: x,
        clientY: y,
        screenX: x,
        screenY: y,
        button: 0,
        buttons,
        shiftKey: false,
      }))
    } catch (_error) {}
  }

  bindV162Gestures()
  if (preview.gestures) {
    preview.gestures.constants = v162Constants()
    preview.gestures.bindV162 = bindV162Gestures
    preview.gestures.armBlankCardMic = armBlankCardMic
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
