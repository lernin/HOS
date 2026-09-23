  const THEKONYM_KEY = 'logyq_thekonym_mode_v1'
  const THEKONYM_EDIT_KEY = 'logyq_thekonym_local_edits_v1'
  const THEKONYM_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('')

  // THEKONYM_PURE_START
  // Join is the card text against public.thekonyms.term. LOGYQ has no Atomonym cleanse.
  function thekonymJoinKey(value) {
    return String(value ?? '').trim()
  }

  function thekonymMatch(catalogue, name) {
    const key = thekonymJoinKey(name)
    if (!key || !Array.isArray(catalogue)) return null
    return catalogue.find((row) => thekonymJoinKey(row?.term) === key) || null
  }

  function thekonymAlphabetLetter(term) {
    const first = thekonymJoinKey(term).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').charAt(0).toUpperCase()
    return /^[A-Z]$/.test(first) ? first : '#'
  }

  function thekonymByLetter(catalogue, letter) {
    return (Array.isArray(catalogue) ? catalogue : [])
      .filter((row) => row?.term && thekonymAlphabetLetter(row.term) === letter)
      .slice()
      .sort((a, b) => String(a.term).localeCompare(String(b.term)))
  }

  function thekonymFace(catalogue, name, edits) {
    const row = thekonymMatch(catalogue, name)
    const edit = row && edits ? edits[row.id] : null
    const onym = edit && typeof edit.term === 'string' ? edit.term : (row?.term || thekonymJoinKey(name))
    const essence = edit && typeof edit.essence === 'string' ? edit.essence : (typeof row?.essence === 'string' ? row.essence : '')
    return {
      matched: !!row,
      id: row?.id || null,
      onym,
      essence: essence || '',
      storedTerm: row?.term || '',
    }
  }

  function thekonymFaceLine(essence) {
    const text = String(essence || '').replace(/\s+/g, ' ').trim()
    if (text.length <= 22) return text
    return `${text.slice(0, 21).trimEnd()}…`
  }
  // THEKONYM_PURE_END

  const thekonymState = {
    on: false,
    rows: [],
    edits: {},
    status: 'idle',
    letter: '',
    card: null,
  }

  function readThekonymMode() {
    try { return localStorage.getItem(THEKONYM_KEY) === '1' } catch (_error) { return false }
  }

  function writeThekonymMode(on) {
    try { localStorage.setItem(THEKONYM_KEY, on ? '1' : '0') } catch (_error) {}
  }

  function readThekonymEdits() {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(THEKONYM_EDIT_KEY) || '{}')
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch (_error) { return {} }
  }

  function writeThekonymEdits(edits) {
    try { sessionStorage.setItem(THEKONYM_EDIT_KEY, JSON.stringify(edits)) } catch (_error) {}
  }

  function thekonymEnabled() {
    return thekonymState.on
  }

  function paintLabelElement(text, name) {
    if (!text || !thekonymState.on) return
    const face = thekonymFace(thekonymState.rows, name, thekonymState.edits)
    const svg = 'http://www.w3.org/2000/svg'
    text.textContent = ''
    const onym = document.createElementNS(svg, 'tspan')
    onym.setAttribute('class', 'logyq-onym')
    onym.setAttribute('x', '0')
    onym.setAttribute('dy', '-0.42em')
    onym.style.fontSize = '13px'
    onym.textContent = face.onym || thekonymJoinKey(name)
    const essence = document.createElementNS(svg, 'tspan')
    essence.setAttribute('class', 'logyq-essence')
    essence.setAttribute('x', '0')
    essence.setAttribute('dy', '1.2em')
    essence.style.fontSize = '10px'
    essence.textContent = thekonymFaceLine(face.essence)
    text.append(onym, essence)
  }

  function paintThekonymFaces() {
    if (!thekonymState.on || typeof d3 === 'undefined') return
    d3.selectAll('svg#canvas g.nodes g.node text.label').each(function paintFace(d) {
      paintLabelElement(this, d?.data?.name || '')
    })
  }

  function installThekonymFaces() {
    const wrap = bridge.core?.layout?.LabelWrap
    if (!wrap || wrap.apply?.__thekonym) return
    const original = wrap.apply.bind(wrap)
    function apply() {
      original()
      if (thekonymState.on) paintThekonymFaces()
    }
    apply.__thekonym = true
    wrap.apply = apply
  }

  function syncThekonymToggles() {
    const box = document.getElementById('logyq-thekonym-toggle')
    const mobile = document.getElementById('logyq-thekonym-mobile')
    if (box) box.checked = thekonymState.on
    if (mobile) mobile.setAttribute('aria-pressed', String(thekonymState.on))
    document.body.classList.toggle('logyq-thekonym', thekonymState.on)
  }

  function closeThekonymCard() {
    thekonymState.card = null
    document.getElementById('logyq-thekonym-card')?.classList.remove('is-open')
  }

  function closeThekonymBrowser() {
    document.getElementById('logyq-thekonym-browser')?.classList.remove('is-open')
  }

  function setThekonymMode(on) {
    thekonymState.on = !!on
    writeThekonymMode(thekonymState.on)
    syncThekonymToggles()
    if (!thekonymState.on) {
      closeThekonymCard()
      closeThekonymBrowser()
      try { bridge.core.layout.LabelWrap.apply() } catch (_error) {}
      return
    }
    loadThekonyms()
    try { bridge.core.layout.LabelWrap.apply() } catch (_error) {}
  }

  async function loadThekonyms() {
    const pin = (() => { try { return sessionStorage.getItem(PIN_KEY) } catch (_error) { return '' } })()
    if (!pin) {
      thekonymState.rows = []
      thekonymState.status = 'nopin'
      paintThekonymFaces()
      renderThekonymCard()
      renderThekonymList()
      return
    }
    thekonymState.status = 'reading'
    renderThekonymCard()
    try {
      const data = await rpc('lab_thekonym_read', { pin, term_id: null })
      if (!thekonymState.on) return
      thekonymState.rows = Array.isArray(data) ? data : []
      thekonymState.status = 'ready'
    } catch (_error) {
      if (!thekonymState.on) return
      thekonymState.rows = []
      thekonymState.status = 'error'
    }
    paintThekonymFaces()
    renderThekonymCard()
    renderThekonymList()
  }

  function currentCardFace() {
    const card = thekonymState.card
    if (!card) return null
    return thekonymFace(thekonymState.rows, card.name, thekonymState.edits)
  }

  function renderThekonymCard() {
    const root = document.getElementById('logyq-thekonym-card')
    if (!root || !thekonymState.card) return
    const face = currentCardFace()
    const onym = root.querySelector('.logyq-tk-onym')
    const essence = root.querySelector('.logyq-tk-essence')
    const empty = root.querySelector('.logyq-tk-empty')
    const bank = root.querySelector('.logyq-tk-bank')
    const editing = root.querySelector('.logyq-tk-input')
    if (editing) return
    const matched = !!face?.matched && thekonymState.status === 'ready'
    onym.hidden = !matched
    essence.hidden = !matched
    if (matched) {
      onym.textContent = face.onym
      onym.dataset.raw = face.onym
      essence.dataset.raw = face.essence
      essence.textContent = face.essence || 'Essence not recorded'
      essence.classList.toggle('is-missing', !face.essence)
    }
    if (thekonymState.status === 'ready' && !face?.matched) empty.textContent = 'not in Thekonyms yet.'
    else if (thekonymState.status === 'reading') empty.textContent = 'Reading Thekonyms…'
    else empty.textContent = 'Thekonyms could not be read.'
    empty.hidden = matched
    const chip = matched ? face.onym : thekonymJoinKey(thekonymState.card.name)
    bank.hidden = !chip
    bank.disabled = !chip
    root.classList.add('is-open')
  }

  function renderThekonymList() {
    const list = document.getElementById('logyq-thekonym-list')
    const letters = document.getElementById('logyq-thekonym-letters')
    if (!list || !letters) return
    letters.querySelectorAll('button').forEach((button) => {
      const letter = button.dataset.letter
      const count = thekonymByLetter(thekonymState.rows, letter).length
      button.disabled = thekonymState.status === 'ready' && count === 0
      button.setAttribute('aria-pressed', String(thekonymState.letter === letter))
    })
    if (!thekonymState.letter) {
      list.innerHTML = '<p class="logyq-tk-prompt">Pick a letter.</p>'
      return
    }
    const rows = thekonymByLetter(thekonymState.rows, thekonymState.letter)
    if (!rows.length) {
      list.innerHTML = '<p class="logyq-tk-none">No Thekonyms for that letter.</p>'
      return
    }
    list.innerHTML = rows.map((row) => {
      const face = thekonymFace([row], row.term, thekonymState.edits)
      const essence = face.essence || '—'
      return `<div class="logyq-tk-item"><button type="button" class="logyq-tk-row" data-id="${escapeHtml(row.id)}"><span>${escapeHtml(face.onym)}</span><small>${escapeHtml(essence)}</small></button><button type="button" class="logyq-tk-add" data-id="${escapeHtml(row.id)}">Add to Word Bank</button></div>`
    }).join('')
  }

  function openThekonymUid(uid) {
    if (!thekonymState.on) return false
    const node = bridge.core.utils.findByUid(bridge.core.state.root?.data, uid)
    thekonymState.card = { name: node?.name || '', uid }
    closeThekonymBrowser()
    renderThekonymCard()
    return true
  }

  function openThekonymRow(id) {
    const row = thekonymState.rows.find((item) => item.id === id)
    if (!row) return
    thekonymState.card = { name: row.term, uid: null }
    closeThekonymBrowser()
    renderThekonymCard()
  }

  function addThekonymToBank(name) {
    const word = thekonymJoinKey(name)
    if (!word) return false
    bridge.core.wordDock.addWords(word, 'bank')
    return true
  }

  // The catalogue update allow-list has neither term nor essence. Keep the edit on this device.
  function saveThekonymLocal(id, field, value) {
    if (!id || (field !== 'term' && field !== 'essence')) return false
    const next = field === 'term' ? thekonymJoinKey(value) : String(value ?? '').trim()
    if (field === 'term' && !next) return false
    const edits = { ...thekonymState.edits, [id]: { ...thekonymState.edits[id], [field]: next } }
    thekonymState.edits = edits
    writeThekonymEdits(edits)
    paintThekonymFaces()
    renderThekonymCard()
    renderThekonymList()
    return true
  }

  function beginThekonymEdit(field) {
    const face = currentCardFace()
    if (!face?.matched || !face.id) return
    const root = document.getElementById('logyq-thekonym-card')
    const host = root?.querySelector(field === 'term' ? '.logyq-tk-onym' : '.logyq-tk-essence')
    if (!host || host.querySelector('input')) return
    const input = document.createElement('input')
    input.className = 'logyq-tk-input'
    input.setAttribute('aria-label', field === 'term' ? 'Onym' : 'Essence')
    input.value = field === 'term' ? face.onym : face.essence
    host.textContent = ''
    host.hidden = false
    host.classList.remove('is-missing')
    host.append(input)
    input.focus()
    input.select()
    let settled = false
    const finish = (save) => {
      if (settled || !input.isConnected) return
      settled = true
      const value = input.value
      input.remove()
      if (save) saveThekonymLocal(face.id, field, value)
      else renderThekonymCard()
    }
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        finish(true)
      } else if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        finish(false)
      }
    })
    input.addEventListener('blur', () => finish(true))
  }

  function ensureThekonymChrome() {
    if (!document.getElementById('logyq-thekonym-fonts')) {
      const link = document.createElement('link')
      link.id = 'logyq-thekonym-fonts'
      link.rel = 'stylesheet'
      link.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Libre+Caslon+Display&display=swap'
      document.head.append(link)
    }
    if (!document.getElementById('logyq-thekonym-ask')) {
      const ask = document.createElement('button')
      ask.id = 'logyq-thekonym-ask'
      ask.type = 'button'
      ask.setAttribute('aria-label', 'Browse Thekonyms')
      ask.textContent = '?'
      ask.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        if (!thekonymState.on) return
        closeThekonymCard()
        document.getElementById('logyq-thekonym-browser')?.classList.add('is-open')
        renderThekonymList()
      })
      document.body.append(ask)
    }
    if (!document.getElementById('logyq-thekonym-toggle')) {
      const row = document.createElement('div')
      row.className = 'settings-row'
      row.id = 'logyq-thekonym-settings'
      row.innerHTML = '<label for="logyq-thekonym-toggle"><strong>Thekonym mode</strong></label><div style="display:flex;align-items:center;gap:8px;min-width:160px;"><label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" id="logyq-thekonym-toggle"> On</label></div>'
      const paint = document.getElementById('logyq-paint-settings-btn')?.closest('.settings-row')
      if (paint) paint.insertAdjacentElement('afterend', row)
      else document.querySelector('#settingsBackdrop .settings-modal')?.append(row)
      row.querySelector('input').addEventListener('change', (event) => setThekonymMode(event.target.checked))
    }
    const tools = document.querySelector('#logiq-mobile-panel .logiq-mobile-tools')
    if (tools && !document.getElementById('logyq-thekonym-mobile')) {
      const button = document.createElement('button')
      button.type = 'button'
      button.id = 'logyq-thekonym-mobile'
      button.textContent = 'Thekonym mode'
      button.setAttribute('aria-pressed', 'false')
      button.addEventListener('click', () => {
        setThekonymMode(!thekonymState.on)
        closeMobilePanel()
      })
      tools.append(button)
    }
    if (!document.getElementById('logyq-thekonym-browser')) {
      const browser = document.createElement('section')
      browser.id = 'logyq-thekonym-browser'
      browser.className = 'logyq-tk-browser'
      browser.setAttribute('role', 'dialog')
      browser.setAttribute('aria-label', 'Thekonyms A to Z')
      browser.innerHTML = `<header><h2>Thekonyms</h2><button type="button" id="logyq-thekonym-browser-close" aria-label="Close">×</button></header><div class="logyq-tk-az" id="logyq-thekonym-letters">${THEKONYM_LETTERS.map((letter) => `<button type="button" data-letter="${letter}">${letter}</button>`).join('')}</div><div class="logyq-tk-list" id="logyq-thekonym-list"></div>`
      document.body.append(browser)
      browser.querySelector('#logyq-thekonym-browser-close').addEventListener('click', closeThekonymBrowser)
      browser.addEventListener('click', (event) => {
        const letter = event.target.closest?.('[data-letter]')
        if (letter && !letter.disabled) {
          thekonymState.letter = letter.dataset.letter
          renderThekonymList()
          return
        }
        const add = event.target.closest?.('.logyq-tk-add')
        if (add) {
          const row = thekonymState.rows.find((item) => item.id === add.dataset.id)
          const face = row ? thekonymFace([row], row.term, thekonymState.edits) : null
          addThekonymToBank(face?.onym || row?.term)
          return
        }
        const open = event.target.closest?.('.logyq-tk-row')
        if (open) openThekonymRow(open.dataset.id)
      })
    }
    if (!document.getElementById('logyq-thekonym-card')) {
      const scrim = document.createElement('div')
      scrim.id = 'logyq-thekonym-card'
      scrim.className = 'logyq-tk-scrim'
      scrim.innerHTML = '<article class="logyq-tk-card" role="dialog" aria-label="Thekonym"><button type="button" class="logyq-tk-x" aria-label="Close">×</button><p class="logyq-tk-kicker">Thekonym</p><h1 class="logyq-tk-onym" data-edit="term"></h1><p class="logyq-tk-essence" data-edit="essence"></p><p class="logyq-tk-empty" hidden>not in Thekonyms yet.</p><button type="button" class="logyq-tk-bank">Add to Word Bank</button><p class="logyq-tk-note">Edits stay on this device. They are not written to Thekonyms.</p></article>'
      document.body.append(scrim)
      let lastField = ''
      let lastAt = 0
      scrim.addEventListener('click', (event) => {
        if (event.target === scrim) closeThekonymCard()
      })
      scrim.querySelector('.logyq-tk-x').addEventListener('click', closeThekonymCard)
      scrim.querySelector('.logyq-tk-bank').addEventListener('click', () => {
        const face = currentCardFace()
        addThekonymToBank(face?.matched ? face.onym : thekonymState.card?.name)
      })
      scrim.querySelector('.logyq-tk-card').addEventListener('pointerup', (event) => {
        const field = event.target.closest?.('[data-edit]')
        if (!field || field.querySelector('input')) return
        const now = performance.now()
        if (lastField === field.dataset.edit && now - lastAt <= 360) {
          lastField = ''
          beginThekonymEdit(field.dataset.edit)
          return
        }
        lastField = field.dataset.edit
        lastAt = now
      })
    }
  }

  function bindThekonym() {
    installThekonymFaces()
    ensureThekonymChrome()
    thekonymState.edits = readThekonymEdits()
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return
      if (document.querySelector('#logyq-thekonym-card .logyq-tk-input')) return
      closeThekonymCard()
      closeThekonymBrowser()
    })
    preview.thekonym = {
      key: THEKONYM_KEY,
      enabled: thekonymEnabled,
      set: setThekonymMode,
      match: (name) => thekonymMatch(thekonymState.rows, name),
      face: (name) => thekonymFace(thekonymState.rows, name, thekonymState.edits),
      openUid: openThekonymUid,
      paintLabel: paintLabelElement,
      saveLocal: saveThekonymLocal,
      reload: loadThekonyms,
    }
    setThekonymMode(readThekonymMode())
  }

  bindThekonym()
  bootSession()
})()
