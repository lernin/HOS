  const CURRICULUM_KEY = 'logyq_curriculum_progress_v1'

  // CURRICULUM_PURE_START
  function curriculumNode(name, ...children) {
    return children.length ? { name, children } : { name }
  }

  function curriculumPack() {
    return [
      { id: 'fruit', title: 'Fruit', tree: curriculumNode('fruit', curriculumNode('apple')) },
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

  // Haze is only the pre-Start gate. Start fades it off as the tumble
  // begins, then the layer leaves the stack so nothing sits on the cards.
  function showCurriculumHaze(gate) {
    gate._hazeToken = (gate._hazeToken || 0) + 1
    gate.classList.remove('is-clearing')
    gate.hidden = false
  }

  function fadeCurriculumHaze(gate) {
    if (!gate || gate.hidden || gate.classList.contains('is-clearing')) return
    gate.classList.add('is-clearing')
    const token = (gate._hazeToken || 0) + 1
    gate._hazeToken = token
    window.setTimeout(() => {
      if (gate._hazeToken !== token) return
      if (app.curriculum?.phase === 'gate') return
      gate.hidden = true
      gate.classList.remove('is-clearing')
    }, CURRICULUM_HAZE_FADE_MS)
  }

  function renderCurriculumChrome() {
    const playing = !!app.curriculum
    const phase = app.curriculum?.phase || ''
    document.body.classList.toggle('logyq-curriculum', playing)
    document.body.classList.toggle('logyq-curriculum-gate', false)
    document.body.classList.toggle('logyq-curriculum-frozen', playing)
    if (playing) document.body.dataset.curriculumPhase = phase
    else delete document.body.dataset.curriculumPhase
    const gate = document.getElementById('logyq-curriculum-gate')
    if (gate) {
      if (!playing) {
        gate._hazeToken = (gate._hazeToken || 0) + 1
        gate.classList.remove('is-clearing')
        gate.hidden = true
      } else gate.hidden = true
    }
    const start = document.getElementById('logyq-curriculum-start')
    if (start) start.hidden = true
    const status = document.getElementById('logyq-curriculum-status')
    if (status && playing && !status.dataset.tone) status.textContent = app.curriculum.title || ''
  }

  function leaveCurriculumPlay() {
    delete window.__logyqCurriculumReturnToBank
    const state = bridge.core?.state
    if (state) state.curriculumCameraLock = false
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

  function settleCurriculumTree(duration = 260) {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        try {
          bridge.core?.treeManager?.settleRootAnchored?.({ force: true, duration })
        } catch (_error) {}
      })
    })
  }

  function seedCurriculumRoot(level) {
    const core = bridge.core
    const state = core?.state
    if (!level?.tree || !state || !window.d3) return false
    const root = { name: String(level.tree.name ?? '').trim() }
    core.utils.assignUids(root)
    state.root = window.d3.hierarchy(root)
    core.utils.assignIds(state.root)
    state.wordBank = curriculumWords(level.tree).slice(1)
    state.selectedUid = null
    state.history = []
    state.redo = []
    state.repositionMode = null
    state.curriculumCameraLock = true
    try { core.selection?.clearGroup?.() } catch (_error) {}
    try { core.selection?.clearSelection?.() } catch (_error) {}
    core.treeManager.layoutAndRender(false)
    core.wordDock.render()
    settleCurriculumTree(0)
    return true
  }

  function returnCurriculumBranch(tree, bank, uid) {
    if (!tree || !uid) return null
    const nextTree = structuredClone(tree)
    let removed = null
    if (nextTree._uid === uid) removed = nextTree
    else {
      const detach = node => {
        const index = (node.children || []).findIndex(child => child?._uid === uid)
        if (index >= 0) {
          removed = node.children.splice(index, 1)[0]
          return true
        }
        return (node.children || []).some(detach)
      }
      detach(nextTree)
    }
    if (!removed) return null
    const nextBank = Array.isArray(bank) ? bank.slice() : []
    const restore = node => {
      const name = String(node?.name ?? '').trim()
      if (name) nextBank.push(name)
      ;(node.children || []).forEach(restore)
    }
    restore(removed)
    return { tree: removed === nextTree ? null : nextTree, bank: nextBank }
  }

  function showCurriculumFirstGuide(level) {
    if (level?.id !== 'fruit') return
    const guideLevel = {
      guide: 'below',
      tree: { name: 'fruit' },
      bank: ['apple'],
      bankCards: { apple: { name: 'apple' } },
    }
    window.LOGYQGameGuide?.show(guideLevel, bridge.core)
  }

  function beginCurriculumLevel(level) {
    if (!level) return
    leaveGamePlay()
    app.curriculum = {
      id: level.id,
      title: level.title,
      startedAt: Date.now(),
      cleared: false,
      phase: 'play',
      released: true,
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
    if (bridge.core?.state) bridge.core.state.curriculumCameraLock = true
    window.__logyqCurriculumReturnToBank = (uid) => {
      const engine = bridge.core
      const session = app.curriculum
      if (!engine?.state || !session || session.id !== level.id || session.phase !== 'play') return false
      const result = returnCurriculumBranch(engine.state.root?.data, engine.state.wordBank || [], uid)
      if (!result) return false
      engine.state.wordBank = result.bank
      engine.state.root = result.tree ? d3.hierarchy(result.tree) : null
      try { engine.selection?.clearGroup?.() } catch (_error) {}
      try { engine.selection?.clearSelection?.() } catch (_error) {}
      if (engine.state.root) {
        engine.utils.assignIds(engine.state.root)
        engine.treeManager.layoutAndRender(false)
      } else {
        engine.state.lastNodes = []
        engine.treeManager.renderEmpty()
      }
      engine.wordDock.render()
      settleCurriculumTree()
      const status = document.getElementById('logyq-curriculum-status')
      if (status && !session.cleared) {
        delete status.dataset.tone
        status.textContent = 'Piece back in the Word Bank. Keep arranging!'
      }
      bridge.notifyChange?.()
      return true
    }
    renderCurriculumChrome()
    seedCurriculumRoot(level)
    showCurriculumFirstGuide(level)
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
      answerTree: curriculumAnswerTree,
      returnBranch: returnCurriculumBranch,
    }
  }

  bindCurriculum()
