  function buildUi() {
    const desktopState = document.createElement('span')
    desktopState.className = 'logiq-save-state'
    desktopState.setAttribute('role', 'status')
    desktopState.setAttribute('aria-live', 'polite')
    document.querySelector('header .controls')?.prepend(desktopState)

    if (!document.getElementById('logiq-mobile-header')) {
      document.body.insertAdjacentHTML('afterbegin', `
      <div id="logiq-mobile-header">
        <div id="logyq-corner-cluster">
          <button class="logiq-icon-btn" id="logyq-home-btn" type="button" aria-label="Your maps"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"></rect><rect x="14" y="3" width="7" height="7" rx="1.5"></rect><rect x="3" y="14" width="7" height="7" rx="1.5"></rect><rect x="14" y="14" width="7" height="7" rx="1.5"></rect></svg></button>
          <img src="/logyq/logos/LOGO_GREEN_Q.svg" alt="LOGYQ">
          <button class="logiq-icon-btn" data-tool="undo" aria-label="Undo">↶</button>
          <button class="logiq-icon-btn" data-tool="fit" aria-label="Recenter map"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5"></circle><path d="M12 2v4M12 18v4M2 12h4M18 12h4"></path></svg></button>
          <button class="logiq-icon-btn" id="logyq-paint-btn" aria-label="Paint colors" aria-expanded="false" aria-haspopup="true"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="8" r="3"></circle><circle cx="16" cy="8" r="3"></circle><circle cx="8" cy="16" r="3"></circle><circle cx="16" cy="16" r="3"></circle></svg></button>
          <span class="logiq-save-state" role="status" aria-live="polite"></span>
          <button class="logiq-icon-btn" id="logiq-mobile-menu-btn" aria-label="Open controls" aria-expanded="false">⋮</button>
        </div>
        <div id="logyq-select-strip">
          <input class="logiq-mobile-entry" id="logiq-mobile-word-input" placeholder="Type or speak…" aria-label="Add words">
          <button class="logiq-icon-btn" id="logiq-mobile-mic-btn" aria-label="Speak a word"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="3" width="8" height="12" rx="4"></rect><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"></path></svg></button>
        </div>
      </div>`)
    }

    document.body.insertAdjacentHTML('beforeend', `
      <section id="logiq-mobile-panel" aria-label="LOGiQ controls">
        <div class="logiq-mobile-tools">
          <button data-tool="add">Add typed words</button><button data-tool="add-child">Add to selected</button>
          <button data-tool="library">Your maps</button><button data-tool="mix">Mix</button>
          <button data-tool="paint">Paint colors</button><button data-tool="dock">Word Dock</button>
          <button data-tool="help">Help</button>
        </div>
      </section>
      <div id="logiq-voice-bar" role="status" aria-live="polite"><span id="logiq-voice-status">Listening…</span><button id="logiq-voice-stop">Stop</button></div>
      <div class="logiq-backdrop logyq-home-screen" id="logiq-library" aria-hidden="true">
        <section class="logiq-modal" role="dialog" aria-modal="true" aria-labelledby="logiq-library-title">
          <header class="logiq-modal-head"><h2 id="logiq-library-title">Your maps</h2><button class="logiq-primary" id="logiq-new-map" type="button">+ New</button><button class="logiq-icon-btn" id="logiq-library-close" aria-label="Back to map">×</button></header>
          <div class="logiq-library-body"><div class="logiq-map-list" id="logiq-map-list"></div></div>
        </section>
      </div>
      <div class="logiq-backdrop" id="logiq-pin" aria-hidden="true">
        <form class="logiq-pin-card" id="logiq-pin-form"><h2>Connect</h2><p>Enter the Lab PIN to open live maps. It stays in this LOGYQ session only.</p><input id="logiq-pin-input" type="password" inputmode="numeric" autocomplete="current-password" aria-label="Lab PIN" required><span class="logiq-pin-error">That PIN was not accepted.</span><div class="logiq-pin-actions"><button type="button" class="logiq-icon-btn" id="logiq-pin-cancel" aria-label="Cancel">×</button><button class="logiq-primary" type="submit">Connect</button></div></form>
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
      paintButton: document.getElementById('logyq-paint-btn'),
    }
  }

  function paintSwatches() {
    return [
      { id: 'off', value: 'off', label: 'Off' },
      { id: 'clear', value: 'clear', label: 'Clear' },
      { id: 'sun', value: '#fde68a', label: 'Sun' },
      { id: 'peach', value: '#fed7aa', label: 'Peach' },
      { id: 'rose', value: '#fecdd3', label: 'Rose' },
      { id: 'lilac', value: '#e9d5ff', label: 'Lilac' },
      { id: 'sky', value: '#bae6fd', label: 'Sky' },
      { id: 'mint', value: '#bbf7d0', label: 'Mint' },
      { id: 'sage', value: '#d9f99d', label: 'Sage' },
    ]
  }

  function readPaintColor() {
    const stored = localStorage.getItem(PAINT_KEY)
    if (!stored) return null
    try {
      const parsed = JSON.parse(stored)
      if (parsed && typeof parsed === 'object' && 'color' in parsed) return parsed.color || null
    } catch (_error) {}
    if (stored === 'off' || stored === 'clear' || stored === 'null') return stored === 'clear' ? 'clear' : null
    return stored
  }

  function persistPaintColor(color) {
    try { localStorage.setItem(PAINT_KEY, JSON.stringify({ color: color ?? null })) } catch (_error) {}
  }

  function ensurePaintStrip(doc) {
    let strip = doc.getElementById('logyq-paint-strip')
    if (strip) return strip
    strip = doc.createElement('div')
    strip.id = 'logyq-paint-strip'
    strip.setAttribute('role', 'listbox')
    strip.setAttribute('aria-label', 'Paint colors')
    strip.innerHTML = paintSwatches().map((swatch) => {
      const tone = swatch.value === 'off' || swatch.value === 'clear' ? '' : ` style="background:${swatch.value}"`
      return `<button type="button" class="logyq-swatch" role="option" data-paint="${swatch.value}" aria-label="${swatch.label}"${tone}>${swatch.value === 'off' ? '×' : swatch.value === 'clear' ? '○' : ''}</button>`
    }).join('')
    doc.body.appendChild(strip)
    return strip
  }

  function syncPaintChrome(doc) {
    const paint = preview.paint
    const button = doc.getElementById('logyq-paint-btn')
    const strip = doc.getElementById('logyq-paint-strip')
    if (button) {
      button.classList.toggle('is-paint-on', !!paint.active)
      button.setAttribute('aria-pressed', String(!!paint.active))
      button.style.setProperty('--paint-active', paint.active && paint.color && paint.color !== 'clear' ? paint.color : '')
    }
    if (strip) {
      strip.classList.toggle('is-open', !!paint.open)
      strip.querySelectorAll('[data-paint]').forEach((el) => {
        const value = el.getAttribute('data-paint')
        const selected = paint.active
          ? value === (paint.color || 'clear')
          : value === 'off'
        el.classList.toggle('is-active', selected)
        el.setAttribute('aria-selected', String(selected))
      })
    }
    if (button) button.setAttribute('aria-expanded', String(!!paint.open))
  }

  function setPaint(doc, { color, active, open } = {}) {
    const paint = preview.paint
    if (color !== undefined) {
      paint.color = color === 'off' ? paint.last : color
      if (color && color !== 'off') paint.last = color === 'clear' ? 'clear' : color
    }
    if (active !== undefined) paint.active = !!active
    if (open !== undefined) paint.open = !!open
    if (paint.color && paint.color !== 'off') persistPaintColor(paint.color)
    syncPaintChrome(doc)
    return paint
  }

  function openPaintStrip(doc) {
    return setPaint(doc, { open: true })
  }

  function closePaintStrip(doc) {
    return setPaint(doc, { open: false })
  }

  function bindPaintUi() {
    const doc = document
    const last = readPaintColor()
    preview.paint = {
      key: PAINT_KEY,
      swatches: paintSwatches(),
      last,
      color: last,
      active: false,
      open: false,
      set: (opts) => setPaint(doc, opts),
      openStrip: () => openPaintStrip(doc),
      closeStrip: () => closePaintStrip(doc),
      isActive: () => !!preview.paint.active,
    }
    const strip = ensurePaintStrip(doc)
    const button = doc.getElementById('logyq-paint-btn')
    button?.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopImmediatePropagation()
      if (preview.paint.open) closePaintStrip(doc)
      else openPaintStrip(doc)
    })
    strip.addEventListener('click', (event) => {
      const swatch = event.target?.closest?.('[data-paint]')
      if (!swatch) return
      event.preventDefault()
      event.stopImmediatePropagation()
      const value = swatch.getAttribute('data-paint')
      if (value === 'off') setPaint(doc, { active: false, open: false })
      else setPaint(doc, { color: value, active: true, open: false })
    })
    doc.getElementById('logyq-paint-settings-btn')?.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopImmediatePropagation()
      document.getElementById('settingsBackdrop')?.classList.remove('show')
      closeMobilePanel()
      openPaintStrip(doc)
    })
    syncPaintChrome(doc)
  }

  function bindUi() {
    bindPaintUi()
    ui.menuButton.addEventListener('click', () => {
      const open = ui.mobilePanel.classList.toggle('is-open')
      ui.menuButton.setAttribute('aria-expanded', String(open))
      if (open) closePaintStrip(document)
    })
    document.getElementById('logiq-mobile-mic-btn').addEventListener('click', () => startVoiceCapture())
    document.getElementById('logiq-voice-stop').addEventListener('click', stopVoiceCapture)

    const legacyMaps = document.getElementById('mapsBtn')
    legacyMaps?.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopImmediatePropagation()
      openLibrary()
    }, true)
    document.getElementById('logyq-home-btn')?.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopImmediatePropagation()
      openLibrary()
    })

    document.getElementById('logiq-library-close').addEventListener('click', closeLibrary)
    ui.library.addEventListener('click', (event) => { if (event.target === ui.library) closeLibrary() })
    document.getElementById('logiq-new-map').addEventListener('click', () => createMap({ edit: false }))

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
      if (action === 'paint') {
        closeMobilePanel()
        openPaintStrip(document)
        return
      }
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
      closePaintStrip(document)
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

