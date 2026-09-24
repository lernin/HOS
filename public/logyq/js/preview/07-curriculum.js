  const CURRICULUM_KEY = 'logyq_curriculum_progress_v1'

  // CURRICULUM_PURE_START
  function curriculumNode(name, ...children) {
    return children.length ? { name, children } : { name }
  }

  function curriculumPack() {
    return [
      { id: 'fruit', title: 'Fruit', tree: curriculumNode('fruit', curriculumNode('apple'), curriculumNode('banana')) },
      { id: 'food', title: 'Food', tree: curriculumNode('food',
        curriculumNode('fruit', curriculumNode('apple'), curriculumNode('banana')),
        curriculumNode('meat', curriculumNode('chicken'), curriculumNode('beef'))) },
      { id: 'places', title: 'Places', tree: curriculumNode('Earth',
        curriculumNode('Korea', curriculumNode('Seoul')),
        curriculumNode('Canada', curriculumNode('Vancouver'))) },
      { id: 'body', title: 'Body', tree: curriculumNode('body', curriculumNode('arm'), curriculumNode('leg'), curriculumNode('head')) },
      { id: 'body-deep', title: 'Body deep', tree: curriculumNode('body',
        curriculumNode('arm', curriculumNode('hand', curriculumNode('finger'))),
        curriculumNode('leg', curriculumNode('foot', curriculumNode('toe'))),
        curriculumNode('head', curriculumNode('face', curriculumNode('eyes'), curriculumNode('nose'), curriculumNode('mouth')))) },
      { id: 'animals', title: 'Animals', tree: curriculumNode('animal',
        curriculumNode('mammal', curriculumNode('dog'), curriculumNode('cat')),
        curriculumNode('bird', curriculumNode('eagle'), curriculumNode('sparrow'))) },
      { id: 'school', title: 'School', tree: curriculumNode('school',
        curriculumNode('subject', curriculumNode('math'), curriculumNode('English')),
        curriculumNode('room', curriculumNode('classroom'), curriculumNode('library'))) },
      { id: 'home', title: 'Home', tree: curriculumNode('home',
        curriculumNode('kitchen', curriculumNode('fridge'), curriculumNode('stove')),
        curriculumNode('bedroom', curriculumNode('bed'), curriculumNode('desk'))) },
    ]
  }

  function curriculumWords(node, into = []) {
    if (!node || typeof node !== 'object') return into
    const name = String(node.name ?? '').trim()
    if (name) into.push(name)
    for (const child of node.children || []) curriculumWords(child, into)
    return into
  }

  function curriculumStructureKey(node) {
    if (!node || typeof node !== 'object') return ''
    const name = String(node.name ?? '').trim()
    const kids = (Array.isArray(node.children) ? node.children : [])
      .map((child) => curriculumStructureKey(child))
      .filter((key) => key.length)
      .sort()
    return `${name}[${kids.join('|')}]`
  }

  function curriculumMatches(target, live) {
    if (!target || !live) return false
    return curriculumStructureKey(target) === curriculumStructureKey(live)
  }

  function curriculumUnlocked(index, progress, pack) {
    if (index <= 0) return true
    const prev = pack?.[index - 1]
    if (!prev) return false
    return !!progress?.levels?.[prev.id]?.clearedAt
  }

  // The answer sheet is the one rebuilt tree. A play pile with several loose
  // cards is not that tree. One child under the pile is the rebuilt tree.
  function curriculumAnswerTree(live) {
    if (!live || typeof live !== 'object') return null
    if (!live.curriculumPile) return live
    const kids = (Array.isArray(live.children) ? live.children : [])
      .filter((child) => String(child?.name ?? '').trim())
    if (kids.length !== 1) return null
    return kids[0]
  }
  // CURRICULUM_PURE_END

  function readCurriculumProgress() {
    const stored = readJson(CURRICULUM_KEY, { levels: {} })
    const levels = stored && typeof stored.levels === 'object' && stored.levels ? stored.levels : {}
    return { levels }
  }

  function writeCurriculumProgress(progress) {
    try { localStorage.setItem(CURRICULUM_KEY, JSON.stringify(progress)) } catch (_error) {}
  }

  function curriculumLevel(id) {
    return curriculumPack().find((level) => level.id === id) || null
  }

  function renderCurriculumChrome() {
    const playing = !!app.curriculum
    document.body.classList.toggle('logyq-curriculum', playing)
    const status = document.getElementById('logyq-curriculum-status')
    if (status && playing && !status.dataset.tone) status.textContent = app.curriculum.title || ''
  }

  function leaveCurriculumPlay() {
    if (!app.curriculum) {
      renderCurriculumChrome()
      return
    }
    app.curriculum = null
    const status = document.getElementById('logyq-curriculum-status')
    if (status) {
      status.textContent = ''
      delete status.dataset.tone
    }
    renderCurriculumChrome()
  }

  function renderCurriculumPath() {
    const path = document.getElementById('logyq-level-path')
    if (!path) return
    const pack = curriculumPack()
    const progress = readCurriculumProgress()
    path.innerHTML = pack.map((level, index) => {
      const unlocked = curriculumUnlocked(index, progress, pack)
      const cleared = !!progress.levels?.[level.id]?.clearedAt
      const state = cleared ? 'cleared' : unlocked ? 'open' : 'locked'
      const label = `Level ${index + 1}, ${level.title}${cleared ? ', cleared' : unlocked ? '' : ', locked'}`
      return `<li class="logyq-level is-${state}">
        <button type="button" data-level="${escapeHtml(level.id)}" aria-label="${escapeHtml(label)}"${unlocked ? '' : ' disabled'}>
          <span class="logyq-level-num">${index + 1}</span>
          <span class="logyq-level-name">${escapeHtml(level.title)}</span>
          ${unlocked ? '' : '<svg class="logyq-level-lock" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V8a4 4 0 0 1 8 0v3"></path></svg>'}
        </button>
      </li>`
    }).join('')
  }

  function curriculumCardPool(live, answer) {
    const expected = curriculumWords(answer)
    const found = []
    const walk = (node) => {
      if (!node || typeof node !== 'object') return
      if (!node.curriculumPile) {
        const name = String(node.name ?? '').trim()
        if (name) found.push({ name, _uid: node._uid })
      }
      for (const child of node.children || []) walk(child)
    }
    walk(live)
    const names = found.map((card) => card.name).sort()
    const want = expected.slice().sort()
    const same = names.length === want.length && names.every((name, index) => name === want[index])
    if (!same) return expected.map((name) => ({ name }))
    return found
  }

  function mixCurriculum() {
    const session = app.curriculum
    if (!session || session.cleared) return false
    const level = curriculumLevel(session.id)
    const core = bridge.core
    const state = core?.state
    const utils = core?.utils
    const mix = core?.mix?.randomizeTree
    if (!level || !state || !utils || !window.d3 || typeof mix !== 'function') return false
    const cards = curriculumCardPool(state.root?.data, level.tree)
    if (!cards.length) return false
    const previous = curriculumStructureKey(curriculumAnswerTree(state.root?.data) || {})
    // Seed the level words only. The layout Ashley likes is randomizeTree,
    // the same Mix a normal map uses. It refuses body.logyq-curriculum, so
    // the class is lifted for that call and put back before paint.
    const seed = {
      name: cards[0].name,
      children: cards.slice(1).map((card) => {
        const node = { name: card.name }
        if (card._uid != null && String(card._uid) !== '') node._uid = card._uid
        return node
      }),
    }
    if (cards[0]._uid != null && String(cards[0]._uid) !== '') seed._uid = cards[0]._uid
    utils.assignUids(seed)
    try { core.editing?.closeNodeEditor?.(false, false) } catch (_error) {}
    state.wordBank = []
    state.history = []
    state.redo = []
    state.selectedUid = null
    try { core.selection?.clearGroup?.() } catch (_error) {}
    try { core.selection?.clearSelection?.() } catch (_error) {}
    state.root = window.d3.hierarchy(seed)
    utils.assignIds(state.root)
    const before = curriculumStructureKey(state.root.data)
    const locked = document.body.classList.contains('logyq-curriculum')
    const runMix = () => {
      if (locked) document.body.classList.remove('logyq-curriculum')
      try { mix(false) } finally {
        if (locked) document.body.classList.add('logyq-curriculum')
      }
    }
    runMix()
    const live = () => curriculumAnswerTree(state.root?.data)
    const solved = () => {
      const tree = live()
      return !!(tree && curriculumMatches(level.tree, tree))
    }
    let tries = 0
    while (tries < 6) {
      const key = curriculumStructureKey(state.root?.data)
      const sameBoard = key === before || (previous && key === previous)
      if (!solved() && !sameBoard) break
      runMix()
      tries += 1
    }
    state.wordBank = []
    state.history = []
    state.redo = []
    try { core.wordDock?.render?.() } catch (_error) {}
    const undo = document.getElementById('undoBtn')
    if (undo) undo.disabled = true
    const status = document.getElementById('logyq-curriculum-status')
    if (status && status.dataset.tone === 'wait') {
      delete status.dataset.tone
      status.textContent = level.title
    }
    return true
  }

  function beginCurriculumLevel(level) {
    if (!level) return
    app.curriculum = {
      id: level.id,
      title: level.title,
      startedAt: Date.now(),
      cleared: false,
    }
    app.current = { id: null, name: level.title }
    app.hasOpenMap = true
    document.body.classList.add('logyq-map-open')
    app.lastSnapshot = 'curriculum'
    updateMapName()
    hideLibrary()
    const status = document.getElementById('logyq-curriculum-status')
    if (status) {
      delete status.dataset.tone
      status.textContent = level.title
    }
    renderCurriculumChrome()
    mixCurriculum()
    setSaveState('saved')
  }

  function maybeCurriculumClear(snapshot) {
    const session = app.curriculum
    if (!session || session.cleared) return false
    const level = curriculumLevel(session.id)
    const live = curriculumAnswerTree(snapshot?.tree)
    if (!level || !live || !curriculumMatches(level.tree, live)) return false
    session.cleared = true
    const progress = readCurriculumProgress()
    const ms = Math.max(0, Date.now() - (session.startedAt || Date.now()))
    progress.levels[level.id] = { clearedAt: new Date().toISOString(), ms }
    writeCurriculumProgress(progress)
    const pack = curriculumPack()
    const next = pack[pack.findIndex((item) => item.id === level.id) + 1]
    const status = document.getElementById('logyq-curriculum-status')
    if (status) {
      status.dataset.tone = 'clear'
      status.textContent = next ? `${level.title} cleared. ${next.title} is open.` : `${level.title} cleared.`
    }
    return true
  }

  function checkCurriculum() {
    if (!app.curriculum) return false
    const snapshot = bridge.snapshot()
    if (maybeCurriculumClear(snapshot)) return true
    if (app.curriculum.cleared) return true
    const status = document.getElementById('logyq-curriculum-status')
    if (status) {
      status.dataset.tone = 'wait'
      status.textContent = 'Not yet. The parents have to match. Sibling order can differ.'
    }
    return false
  }

  function bindCurriculum() {
    document.getElementById('logyq-level-path')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-level]')
      if (!button || button.disabled) return
      const pack = curriculumPack()
      const index = pack.findIndex((level) => level.id === button.dataset.level)
      const level = pack[index]
      if (!level || !curriculumUnlocked(index, readCurriculumProgress(), pack)) return
      beginCurriculumLevel(level)
    })
    document.getElementById('logyq-curriculum-check')?.addEventListener('click', () => checkCurriculum())
    document.getElementById('logyq-curriculum-mix')?.addEventListener('click', () => mixCurriculum())
    document.getElementById('mixBtn')?.addEventListener('pointerdown', (event) => {
      if (!document.body.classList.contains('logyq-curriculum')) return
      event.preventDefault()
      event.stopImmediatePropagation()
      mixCurriculum()
    }, true)
    document.getElementById('logyq-curriculum-levels')?.addEventListener('click', () => {
      openLibrary().then(() => setHomeTab('curriculum'))
    })
    preview.curriculum = {
      key: CURRICULUM_KEY,
      pack: curriculumPack,
      words: curriculumWords,
      matches: curriculumMatches,
      structureKey: curriculumStructureKey,
      unlocked: curriculumUnlocked,
      read: readCurriculumProgress,
      begin: beginCurriculumLevel,
      check: checkCurriculum,
      mix: mixCurriculum,
      answerTree: curriculumAnswerTree,
    }
    window.__logyqCurriculumMix = mixCurriculum
  }

  bindCurriculum()
