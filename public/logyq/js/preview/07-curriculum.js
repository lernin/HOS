  const CURRICULUM_KEY = 'logyq_curriculum_progress_v1'

  // CURRICULUM_PURE_START
  function curriculumNode(name, ...children) {
    return children.length ? { name, children } : { name }
  }

  // Teach one relationship until it feels ordinary: three below moves first,
  // then introduce above, mix both vertical directions, build chains, and only
  // then introduce the new sibling/beside relationship.
  function curriculumPack() {
    return [
      { id: 'fruit', title: 'Fruit', tree: curriculumNode('fruit', curriculumNode('apple')),
        start: curriculumNode('fruit'), bank: ['apple'], guide: 'below', direction: 'below' },
      { id: 'fruit-banana', title: 'Fruit + Banana', tree: curriculumNode('fruit', curriculumNode('banana')),
        start: curriculumNode('fruit'), bank: ['banana'], direction: 'below' },
      { id: 'animal-dog', title: 'Animal + Dog', tree: curriculumNode('animal', curriculumNode('dog')),
        start: curriculumNode('animal'), bank: ['dog'], direction: 'below' },

      { id: 'food-above-fruit', title: 'Food above Fruit', tree: curriculumNode('food', curriculumNode('fruit')),
        start: curriculumNode('fruit'), bank: ['food'], guide: 'above', direction: 'above' },
      { id: 'animal-above-mammal', title: 'Animal above Mammal', tree: curriculumNode('animal', curriculumNode('mammal')),
        start: curriculumNode('mammal'), bank: ['animal'], direction: 'above' },

      { id: 'plant-flower', title: 'Plant + Flower', tree: curriculumNode('plant', curriculumNode('flower')),
        start: curriculumNode('plant'), bank: ['flower'], direction: 'below' },
      { id: 'school-above-classroom', title: 'School above Classroom', tree: curriculumNode('school', curriculumNode('classroom')),
        start: curriculumNode('classroom'), bank: ['school'], direction: 'above' },
      { id: 'vehicle-car', title: 'Vehicle + Car', tree: curriculumNode('vehicle', curriculumNode('car')),
        start: curriculumNode('vehicle'), bank: ['car'], direction: 'below' },

      { id: 'food-fruit-apple-chain', title: 'Food → Fruit → Apple',
        tree: curriculumNode('food', curriculumNode('fruit', curriculumNode('apple'))),
        start: curriculumNode('food'), bank: ['fruit', 'apple'], kind: 'chain', depth: 3 },
      { id: 'animal-mammal-dog-chain', title: 'Animal → Mammal → Dog',
        tree: curriculumNode('animal', curriculumNode('mammal', curriculumNode('dog'))),
        start: curriculumNode('animal'), bank: ['mammal', 'dog'], kind: 'chain', depth: 3 },
      { id: 'living-animal-mammal-dog-chain', title: 'Living → Animal → Mammal → Dog',
        tree: curriculumNode('living', curriculumNode('animal', curriculumNode('mammal', curriculumNode('dog')))),
        start: curriculumNode('living'), bank: ['animal', 'mammal', 'dog'], kind: 'chain', depth: 4 },

      { id: 'fruit-siblings', title: 'Fruit siblings',
        tree: curriculumNode('fruit', curriculumNode('apple'), curriculumNode('banana')),
        start: curriculumNode('fruit', curriculumNode('apple')), bank: ['banana'], guide: 'sibling', kind: 'branch' },

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
    window.LOGYQGameGuide?.hide()
    puzzleCamera.deactivate('curriculum')
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

  function curriculumGuideLevel(level) {
    if (!level?.guide || !Array.isArray(level.bank) || !level.bank.length) return null
    const key = level.bank[0]
    return {
      guide: level.guide,
      tree: structuredClone(level.start || { name: String(level.tree?.name ?? '').trim() }),
      bank: [key],
      bankCards: { [key]: { name: key } },
    }
  }

  function curriculumCameraTarget(root) {
    const level = curriculumLevel(app.curriculum?.id)
    const guideLevel = app.curriculum?.guide ? curriculumGuideLevel(level) : null
    return guideLevel ? window.LOGYQGameGuide?.target(guideLevel, root.descendants()) : null
  }

  function cancelCurriculumCameraFit() {
    puzzleCamera.cancel('curriculum')
  }

  function fitCurriculumCamera(duration = 0) {
    return puzzleCamera.fitNow('curriculum', duration)
  }

  function scheduleCurriculumCameraFit(delay = 280) {
    puzzleCamera.schedule('curriculum', delay)
  }

  function refitCurriculumCamera() {
    puzzleCamera.refit('curriculum')
  }

  function seedCurriculumRoot(level) {
    const core = bridge.core
    const state = core?.state
    if (!level?.tree || !state) return false
    const root = structuredClone(level.start || { name: String(level.tree.name ?? '').trim() })
    const bank = Array.isArray(level.bank) ? level.bank.slice() : curriculumWords(level.tree).slice(1)
    state.curriculumCameraLock = true
    bridge.loadMap(root, bank, { fit: false })
    state.curriculumCameraLock = true
    fitCurriculumCamera(0)
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

  function showCurriculumGuide(level) {
    if (!level?.guide || !Array.isArray(level.bank) || !level.bank.length) {
      window.LOGYQGameGuide?.hide()
      return
    }
    const guideLevel = curriculumGuideLevel(level)
    if (!guideLevel) {
      window.LOGYQGameGuide?.hide()
      return
    }
    const draw = () => {
      const session = app.curriculum
      if (!session || session.id !== level.id || session.cleared) return
      window.LOGYQGameGuide?.show(guideLevel, bridge.core)
      window.setTimeout(() => window.LOGYQGameGuide?.refresh?.(), 160)
    }
    window.requestAnimationFrame(() => window.requestAnimationFrame(draw))
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
      guide: level.guide || null,
    }
    app.current = { id: null, name: level.title }
    app.hasOpenMap = true
    document.body.classList.add('logyq-map-open')
    app.lastSnapshot = 'curriculum'
    updateMapName()
    hideLibrary()
    const lessonNumber = app.curriculum?.stage || Math.max(1, curriculumPack().findIndex((item) => item.id === level.id) + 1)
    const lesson = document.getElementById('logyq-curriculum-lesson')
    if (lesson) lesson.textContent = `Lesson ${lessonNumber}`
    const status = document.getElementById('logyq-curriculum-status')
    if (status) {
      delete status.dataset.tone
      status.textContent = level.title
    }
    const nextButton = document.getElementById('logyq-curriculum-next')
    if (nextButton) nextButton.hidden = true
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
      scheduleCurriculumCameraFit()
      const status = document.getElementById('logyq-curriculum-status')
      if (status && !session.cleared) {
        delete status.dataset.tone
        status.textContent = 'Piece back in the Word Bank. Keep arranging!'
      }
      bridge.notifyChange?.()
      return true
    }
    renderCurriculumChrome()
    puzzleCamera.activate('curriculum', {
      target: curriculumCameraTarget,
      afterFit: () => window.LOGYQGameGuide?.refresh?.(),
    })
    seedCurriculumRoot(level)
    showCurriculumGuide(level)
    setSaveState('saved')
  }

  function maybeCurriculumClear(snapshot) {
    const session = app.curriculum
    if (!session || session.cleared) return false
    const level = curriculumLevel(session.id)
    const live = curriculumAnswerTree(snapshot?.tree)
    if (level && live && level.start && curriculumStructureKey(live) !== curriculumStructureKey(level.start)) {
      session.guide = null
      window.LOGYQGameGuide?.hide()
    }
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
      status.textContent = `${level.title} cleared.`
    }
    const nextButton = document.getElementById('logyq-curriculum-next')
    if (nextButton) {
      if (next) {
        nextButton.hidden = false
        nextButton.dataset.nextLevel = next.id
        scheduleCurriculumCameraFit(40)
      } else {
        nextButton.hidden = true
        nextButton.dataset.nextLevel = ''
      }
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
    document.getElementById('logyq-curriculum-next')?.addEventListener('click', (event) => {
      const id = event.currentTarget?.dataset?.nextLevel
      const next = id ? curriculumLevel(id) : null
      if (app.curriculum?.cleared && next) beginCurriculumLevel(next)
    })
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
      refit: refitCurriculumCamera,
      showGuide: () => {
        const level = curriculumLevel(app.curriculum?.id)
        if (level) showCurriculumGuide(level)
      },
    }
  }

  bindCurriculum()
