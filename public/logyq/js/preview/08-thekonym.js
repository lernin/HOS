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

  function thekonymText(value) {
    return typeof value === 'string' ? value.trim() : ''
  }

  function thekonymExampleLines(example) {
    return thekonymText(example).split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  }

  function thekonymDossier(catalogue, name, edits) {
    const face = thekonymFace(catalogue, name, edits)
    const row = thekonymMatch(catalogue, name)
    return {
      ...face,
      pronunciation: thekonymText(row?.term_pronunciation),
      kids: thekonymText(row?.kid_explanation),
      definition: thekonymText(row?.definition),
      technical: thekonymText(row?.technical_definition),
      examples: thekonymExampleLines(row?.example),
    }
  }

  function thekonymInPlay(name, playing) {
    const key = thekonymJoinKey(name)
    if (!key) return true
    return (Array.isArray(playing) ? playing : []).some((item) => thekonymJoinKey(item) === key)
  }

  // Drop examples from the end until two fit, then one. Fade technical only after that.
  function thekonymExampleKeep(count, fits) {
    let keep = Math.max(0, count | 0)
    while (keep > 2 && !fits(keep)) keep -= 1
    if (keep > 1 && !fits(keep)) keep = 1
    return { keep, fadeTechnical: !fits(keep) }
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

  function fitSvgLine(el, size, max) {
    el.style.fontSize = `${size}px`
    const length = el.getComputedTextLength?.() || 0
    if (length > max && length > 0) el.style.fontSize = `${Math.max(12, (size * max) / length)}px`
  }

  function paintLabelElement(text, name) {
    if (!text || !thekonymState.on) return
    const face = thekonymFace(thekonymState.rows, name, thekonymState.edits)
    const svg = 'http://www.w3.org/2000/svg'
    const onymSize = 22
    const essenceSize = 14
    const gap = 5
    const onymAscent = onymSize * 0.8
    const onymDescent = onymSize * 0.22
    const essenceAscent = essenceSize * 0.78
    const essenceDescent = essenceSize * 0.24
    const block = onymAscent + onymDescent + gap + essenceAscent + essenceDescent
    const onymBaseline = (-block / 2) + onymAscent
    const essenceBaseline = onymBaseline + onymDescent + gap + essenceAscent
    text.textContent = ''
    text.style.dominantBaseline = 'alphabetic'
    const onym = document.createElementNS(svg, 'tspan')
    onym.setAttribute('class', 'logyq-onym')
    onym.setAttribute('x', '0')
    onym.setAttribute('y', String(onymBaseline))
    onym.textContent = face.onym || thekonymJoinKey(name)
    const essence = document.createElementNS(svg, 'tspan')
    essence.setAttribute('class', 'logyq-essence')
    essence.setAttribute('x', '0')
    essence.setAttribute('y', String(essenceBaseline))
    essence.textContent = thekonymFaceLine(face.essence)
    text.append(onym, essence)
    fitSvgLine(onym, onymSize, 126)
    fitSvgLine(essence, essenceSize, 126)
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
      else {
        document.querySelectorAll('svg#canvas g.node text.label').forEach((el) => {
          el.style.dominantBaseline = ''
        })
      }
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

  let dossierFlip = null

  function thekonymCardOrigin(uid) {
    const node = Array.from(document.querySelectorAll('svg#canvas g.node')).find((el) => (
      el.dataset.uid === String(uid) || el.__data__?.data?._uid === uid
    ))
    const face = node?.querySelector('rect:not(.grabzone):not(.logyq-smite-wash):not(.logyq-smite-glow):not(.logyq-edit-focus)')
    const rect = (face || node)?.getBoundingClientRect?.()
    if (!rect || rect.width < 8 || rect.height < 8) return null
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height, node }
  }

  function clearDossierFlip(root) {
    const flip = dossierFlip
    dossierFlip = null
    if (flip?.timer) clearTimeout(flip.timer)
    flip?.anims?.forEach((anim) => { try { anim.cancel() } catch (_error) {} })
    flip?.fly?.remove()
    if (flip?.node) flip.node.style.opacity = ''
    const card = root?.querySelector?.('.logyq-tk-card')
    if (card) {
      card.style.transform = ''
      card.style.opacity = ''
    }
    if (root) {
      root.classList.remove('is-flipping')
      root.style.backgroundColor = ''
      root.style.opacity = ''
      delete root.dataset.flip
    }
  }

  // Right-swipe open: the map card lifts, travels a little further right, and flips into the dossier.
  function playDossierFlip(origin) {
    const root = document.getElementById('logyq-thekonym-card')
    const card = root?.querySelector('.logyq-tk-card')
    if (!root || !card || !origin) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return
    clearDossierFlip(root)
    const final = card.getBoundingClientRect()
    if (final.width < 8 || final.height < 8) return
    const face = currentCardFace()
    const fly = document.createElement('div')
    fly.className = 'logyq-tk-fly'
    fly.setAttribute('aria-hidden', 'true')
    fly.style.left = `${origin.left}px`
    fly.style.top = `${origin.top}px`
    fly.style.width = `${origin.width}px`
    fly.style.height = `${origin.height}px`
    const faceEl = document.createElement('div')
    faceEl.className = 'logyq-tk-fly-face'
    const onymEl = document.createElement('span')
    onymEl.className = 'logyq-onym'
    onymEl.textContent = face?.onym || thekonymState.card?.name || ''
    faceEl.append(onymEl)
    if (face?.essence) {
      const essenceEl = document.createElement('span')
      essenceEl.className = 'logyq-essence'
      essenceEl.textContent = face.essence
      faceEl.append(essenceEl)
    }
    fly.append(faceEl)
    document.body.append(fly)
    if (origin.node) origin.node.style.opacity = '0'

    const startCx = origin.left + origin.width / 2
    const startCy = origin.top + origin.height / 2
    const endCx = final.left + final.width / 2
    const endCy = final.top + final.height / 2
    const bias = 36
    const vx = endCx - startCx
    const vy = endCy - startCy
    const liftX = vx * 0.34 + bias
    const liftY = vy * 0.22 - 18
    const edgeX = vx * 0.62 + bias * 0.45
    const edgeY = vy * 0.5 - 8
    const scaleX = final.width / origin.width
    const scaleY = final.height / origin.height
    const liftS = 1 + (Math.min(scaleX, 2.4) - 1) * 0.72
    const edgeS = liftS * 1.12
    const cardEdgeTX = (startCx + edgeX) - endCx
    const cardEdgeTY = (startCy + edgeY) - endCy
    const cardEdgeSX = (origin.width * edgeS) / final.width
    const cardEdgeSY = (origin.height * edgeS) / final.height
    const turnSX = cardEdgeSX + (1 - cardEdgeSX) * 0.45
    const turnSY = cardEdgeSY + (1 - cardEdgeSY) * 0.45
    const duration = 420
    const easing = 'linear'
    root.classList.add('is-flipping')
    root.dataset.flip = 'open'
    root.style.backgroundColor = 'rgba(22,46,39,0)'
    card.style.opacity = '0'
    card.style.transformOrigin = 'center center'

    const flyAnim = faceEl.animate([
      { transform: 'translate(0px, 0px) rotateY(0deg) scale(1, 1)', opacity: 1, offset: 0 },
      { transform: `translate(${liftX}px, ${liftY}px) rotateY(-16deg) scale(${liftS}, ${liftS})`, opacity: 1, offset: 0.36 },
      { transform: `translate(${edgeX}px, ${edgeY}px) rotateY(-90deg) scale(${edgeS}, ${edgeS})`, opacity: 1, offset: 0.54 },
      { transform: `translate(${edgeX}px, ${edgeY}px) rotateY(-90deg) scale(${edgeS}, ${edgeS})`, opacity: 0, offset: 0.6 },
      { transform: `translate(${edgeX}px, ${edgeY}px) rotateY(-90deg) scale(${edgeS}, ${edgeS})`, opacity: 0, offset: 1 },
    ], { duration, easing, fill: 'both' })
    const cardAnim = card.animate([
      { transform: `translate(${cardEdgeTX}px, ${cardEdgeTY}px) rotateY(90deg) scale(${cardEdgeSX}, ${cardEdgeSY})`, opacity: 0, offset: 0 },
      { transform: `translate(${cardEdgeTX}px, ${cardEdgeTY}px) rotateY(90deg) scale(${cardEdgeSX}, ${cardEdgeSY})`, opacity: 0, offset: 0.54 },
      { transform: `translate(${cardEdgeTX * 0.42 + 14}px, ${cardEdgeTY * 0.42}px) rotateY(58deg) scale(${turnSX}, ${turnSY})`, opacity: 1, offset: 0.7 },
      { transform: 'translate(0px, 0px) rotateY(0deg) scale(1, 1)', opacity: 1, offset: 1 },
    ], { duration, easing, fill: 'both' })
    const scrimAnim = root.animate([
      { backgroundColor: 'rgba(22,46,39,0)', offset: 0 },
      { backgroundColor: 'rgba(22,46,39,0.08)', offset: 0.36 },
      { backgroundColor: 'rgba(22,46,39,0.28)', offset: 1 },
    ], { duration, easing, fill: 'both' })
    const flip = { anims: [flyAnim, cardAnim, scrimAnim], fly, node: origin.node, timer: 0, closing: false }
    dossierFlip = flip
    const settle = () => {
      if (dossierFlip !== flip || flip.closing) return
      root.dataset.flip = 'settled'
      card.style.opacity = ''
      card.style.transform = ''
      root.style.backgroundColor = ''
      root.classList.remove('is-flipping')
      fly.remove()
      flip.anims.forEach((anim) => { try { anim.cancel() } catch (_error) {} })
      if (flip.node) flip.node.style.opacity = ''
      clearTimeout(flip.timer)
      dossierFlip = null
    }
    cardAnim.onfinish = settle
    flip.timer = setTimeout(settle, duration + 90)
  }

  function closeThekonymCard(immediate) {
    const root = document.getElementById('logyq-thekonym-card')
    thekonymState.card = null
    if (!root?.classList.contains('is-open')) return
    const flipping = root.dataset.flip === 'open' || root.dataset.flip === 'settled'
    if (immediate || !flipping) {
      clearDossierFlip(root)
      root.classList.remove('is-open')
      return
    }
    const flip = dossierFlip
    if (flip?.closing) return
    let closed = false
    const done = () => {
      if (closed) return
      closed = true
      clearDossierFlip(root)
      root.classList.remove('is-open')
    }
    if (flip && root.dataset.flip === 'open') {
      flip.closing = true
      clearTimeout(flip.timer)
      flip.anims.forEach((anim) => {
        try {
          anim.onfinish = done
          anim.reverse()
        } catch (_error) {}
      })
      flip.timer = setTimeout(done, 480)
      return
    }
    clearDossierFlip(root)
    root.dataset.flip = 'closing'
    const card = root.querySelector('.logyq-tk-card')
    const fade = card?.animate([
      { transform: 'scale(1)', opacity: 1 },
      { transform: 'scale(0.94) translateY(8px)', opacity: 0 },
    ], { duration: 260, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'both' })
    root.animate([
      { backgroundColor: 'rgba(22,46,39,0.28)' },
      { backgroundColor: 'rgba(22,46,39,0)' },
    ], { duration: 260, easing: 'ease-in', fill: 'both' })
    if (fade) fade.onfinish = done
    dossierFlip = { timer: setTimeout(done, 340), closing: true, anims: fade ? [fade] : [], fly: null, node: null }
  }

  function closeThekonymBrowser() {
    document.getElementById('logyq-thekonym-browser')?.classList.remove('is-open')
  }

  function setThekonymMode(on) {
    thekonymState.on = !!on
    writeThekonymMode(thekonymState.on)
    syncThekonymToggles()
    if (!thekonymState.on) {
      closeThekonymCard(true)
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
    return thekonymDossier(thekonymState.rows, card.name, thekonymState.edits)
  }

  function thekonymPlayingNames() {
    const names = []
    const bank = bridge.core?.state?.wordBank
    if (Array.isArray(bank)) names.push(...bank)
    const root = bridge.core?.state?.root
    if (root?.descendants) {
      root.descendants().forEach((node) => {
        if (node?.data?.name) names.push(node.data.name)
      })
    }
    return names
  }

  function setThekonymBlock(root, name, text) {
    const block = root.querySelector(`[data-block="${name}"]`)
    const copy = block?.querySelector('p')
    if (!block || !copy) return
    copy.textContent = text || ''
    block.hidden = !text
    block.classList.remove('is-fade')
  }

  function fitThekonymDossier(root, lines) {
    const body = root.querySelector('.logyq-tk-body')
    const list = root.querySelector('.logyq-tk-examples')
    const technical = root.querySelector('[data-block="technical"]')
    if (!body || !list || body.clientHeight < 40) return
    const items = [...list.querySelectorAll('li')]
    const fits = (keep) => {
      items.forEach((item, index) => { item.hidden = index >= keep })
      technical?.classList.remove('is-fade')
      return body.scrollHeight <= body.clientHeight + 1
    }
    const plan = thekonymExampleKeep(lines.length, fits)
    items.forEach((item, index) => { item.hidden = index >= plan.keep })
    technical?.classList.toggle('is-fade', !!plan.fadeTechnical && !technical.hidden)
  }

  function renderThekonymCard() {
    const root = document.getElementById('logyq-thekonym-card')
    if (!root || !thekonymState.card) return
    if (root.querySelector('.logyq-tk-input')) return
    const face = currentCardFace()
    const onym = root.querySelector('.logyq-tk-onym')
    const pron = root.querySelector('.logyq-tk-pron')
    const essence = root.querySelector('.logyq-tk-essence')
    const fields = root.querySelector('.logyq-tk-fields')
    const empty = root.querySelector('.logyq-tk-empty')
    const body = root.querySelector('.logyq-tk-body')
    const matched = !!face?.matched && thekonymState.status === 'ready'
    onym.hidden = !matched
    pron.hidden = !matched || !face.pronunciation
    essence.hidden = !matched
    fields.hidden = !matched
    body?.classList.toggle('is-miss', !matched)
    if (matched) {
      onym.textContent = face.onym
      pron.textContent = face.pronunciation
      essence.textContent = face.essence
      essence.classList.toggle('is-blank', !face.essence)
      setThekonymBlock(root, 'kids', face.kids)
      setThekonymBlock(root, 'definition', face.definition)
      setThekonymBlock(root, 'technical', face.technical)
      const list = root.querySelector('.logyq-tk-examples')
      const examples = root.querySelector('[data-block="examples"]')
      list.replaceChildren(...face.examples.map((line) => {
        const item = document.createElement('li')
        item.textContent = line
        return item
      }))
      examples.hidden = face.examples.length === 0
    }
    if (thekonymState.status === 'ready' && !face?.matched) empty.textContent = 'not in Thekonyms yet.'
    else if (thekonymState.status === 'reading') empty.textContent = 'Reading Thekonyms…'
    else empty.textContent = 'Thekonyms could not be read.'
    empty.hidden = matched
    root.classList.add('is-open')
    if (matched) {
      const lines = face.examples
      const run = () => {
        if (!root.classList.contains('is-open') || root.querySelector('.logyq-tk-input')) return
        fitThekonymDossier(root, lines)
      }
      run()
      requestAnimationFrame(run)
    }
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
    const playing = thekonymPlayingNames()
    list.innerHTML = rows.map((row) => {
      const face = thekonymFace([row], row.term, thekonymState.edits)
      const essence = face.essence || '—'
      const inPlay = thekonymInPlay(face.onym, playing) || thekonymInPlay(row.term, playing)
      const add = inPlay ? '' : `<button type="button" class="logyq-tk-add" data-id="${escapeHtml(row.id)}">Add to Word Bank</button>`
      return `<div class="logyq-tk-item"><button type="button" class="logyq-tk-row" data-id="${escapeHtml(row.id)}"><span>${escapeHtml(face.onym)}</span><small>${escapeHtml(essence)}</small></button>${add}</div>`
    }).join('')
  }

  function openThekonymUid(uid, options) {
    if (!thekonymState.on) return false
    const node = bridge.core.utils.findByUid(bridge.core.state.root?.data, uid)
    const origin = options?.flip ? thekonymCardOrigin(uid) : null
    thekonymState.card = { name: node?.name || '', uid }
    closeThekonymBrowser()
    renderThekonymCard()
    if (origin) playDossierFlip(origin)
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
    renderThekonymList()
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
    if (!face?.matched || !face.id || thekonymState.status !== 'ready') return
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
      link.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Inter:wght@500&family=Libre+Caslon+Display&display=swap'
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
      scrim.innerHTML = '<article class="logyq-tk-card" role="dialog" aria-label="Thekonym"><button type="button" class="logyq-tk-x" aria-label="Close">×</button><div class="logyq-tk-body"><p class="logyq-tk-kicker">Thekonym</p><h1 class="logyq-tk-onym" data-edit="term"></h1><p class="logyq-tk-pron" hidden></p><p class="logyq-tk-essence" data-edit="essence"></p><div class="logyq-tk-fields"><section class="logyq-tk-block" data-block="kids" hidden><h2>Kids definition</h2><p></p></section><section class="logyq-tk-block" data-block="definition" hidden><h2>Definition</h2><p></p></section><section class="logyq-tk-block logyq-tk-technical" data-block="technical" hidden><h2>Technical definition</h2><p></p></section><section class="logyq-tk-block" data-block="examples" hidden><h2>Examples</h2><ul class="logyq-tk-examples"></ul></section></div><p class="logyq-tk-empty" hidden>not in Thekonyms yet.</p></div></article>'
      document.body.append(scrim)
      let lastField = ''
      let lastAt = 0
      scrim.addEventListener('click', (event) => {
        if (event.target === scrim) closeThekonymCard()
      })
      scrim.querySelector('.logyq-tk-x').addEventListener('click', () => closeThekonymCard())
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
