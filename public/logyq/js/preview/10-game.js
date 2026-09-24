  // Fixed-orientation fitting puzzles on the real LOGYQ canvas.
  // shape + regions are logical data; the palette below is display-only.
  const GAME_KEY = 'logyq_game_progress_v2'
  const gameGrammar = window.LOGYQGameGrammar
  const GAME_SHAPES = ['whole', 'horizontal', 'diagonal_left', 'diagonal_right']
  const GAME_SHAPE_LABEL = {
    whole: 'Whole',
    horizontal: 'Layer cake',
    diagonal_left: 'Diagonal left',
    diagonal_right: 'Diagonal right',
  }
  const GAME_PALETTE = Object.freeze({
    1: '#60a5fa',
    2: '#facc15',
    3: '#f472b6',
    4: '#86efac',
  })

  function puzzleCard(gameId, shape, regions, children = []) {
    return { name: '', gameId, shape, regions: regions.slice(), children }
  }

  function makeN2Level(rootShape, childShape, index) {
    const rootRegions = rootShape === 'whole' ? [1] : [1, 2]
    const contact = rootShape === 'whole' ? 1 : 2
    const childRegions = childShape === 'whole' ? [contact] : [contact, contact === 1 ? 2 : 3]
    const intendedRoot = puzzleCard('p1', rootShape, rootRegions)
    const intendedChild = puzzleCard('p2', childShape, childRegions)
    // Start inverted. The player promotes p1 above p2 using LOGYQ's root-above gesture.
    const tree = puzzleCard('p2', childShape, childRegions, [puzzleCard('p1', rootShape, rootRegions)])
    return {
      id: `n2-${String(index).padStart(2, '0')}`,
      title: `${index} · ${GAME_SHAPE_LABEL[rootShape]} → ${GAME_SHAPE_LABEL[childShape]}`,
      hint: 'The two cards are upside down. Make the physical contact fit.',
      ids: ['p1', 'p2'],
      tree,
      solution: puzzleCard('p1', rootShape, rootRegions, [intendedChild]),
      cards: [intendedRoot, intendedChild],
    }
  }

  const gameLevels = (() => {
    const levels = []
    for (const rootShape of GAME_SHAPES) {
      for (const childShape of GAME_SHAPES) {
        if (rootShape === 'whole' && childShape === 'whole') continue
        levels.push(makeN2Level(rootShape, childShape, levels.length + 1))
      }
    }
    return levels
  })()

  function gameProgress() {
    const value = readJson(GAME_KEY, {})
    return value && typeof value === 'object' ? value : {}
  }

  function renderGamePath() {
    const path = document.getElementById('logyq-game-path')
    if (!path) return
    const progress = gameProgress()
    path.innerHTML = gameLevels.map((level, index) => {
      const unlocked = index === 0 || !!progress[gameLevels[index - 1].id]
      const done = !!progress[level.id]
      return `<li><button type="button" data-game-level="${level.id}" ${unlocked ? '' : 'disabled'}>` +
        `${level.title}${done ? ' ✓' : ''}<span>${unlocked ? level.hint : 'Clear the previous puzzle first.'}</span></button></li>`
    }).join('')
  }

  function gradientId(shape, regions) {
    return `logyq-game-${shape}-${regions.join('-')}`
  }

  function ensureGamePaint() {
    const svg = document.getElementById('canvas')
    if (!svg) return
    let defs = svg.querySelector('#logyq-game-defs')
    if (!defs) {
      const ns = 'http://www.w3.org/2000/svg'
      defs = document.createElementNS(ns, 'defs')
      defs.id = 'logyq-game-defs'
      svg.insertBefore(defs, svg.firstChild)
    }
    const ns = 'http://www.w3.org/2000/svg'
    for (const level of gameLevels) {
      for (const card of level.cards) {
        if (card.shape === 'whole') continue
        const id = gradientId(card.shape, card.regions)
        if (defs.querySelector(`#${id}`)) continue
        const gradient = document.createElementNS(ns, 'linearGradient')
        gradient.id = id
        const direction = card.shape === 'horizontal'
          ? { x1: '0%', y1: '0%', x2: '0%', y2: '100%' }
          : card.shape === 'diagonal_left'
            ? { x1: '100%', y1: '0%', x2: '0%', y2: '100%' }
            : { x1: '0%', y1: '0%', x2: '100%', y2: '100%' }
        for (const [key, value] of Object.entries(direction)) gradient.setAttribute(key, value)
        const [a, b] = card.regions
        for (const [offset, region] of [['0%', a], ['49.9%', a], ['50%', b], ['100%', b]]) {
          const stop = document.createElementNS(ns, 'stop')
          stop.setAttribute('offset', offset)
          stop.setAttribute('stop-color', GAME_PALETTE[region])
          gradient.appendChild(stop)
        }
        defs.appendChild(gradient)
      }
    }
  }

  function gameColor(card) {
    if (card.shape === 'whole') return GAME_PALETTE[card.regions[0]]
    return `url(#${gradientId(card.shape, card.regions)})`
  }

  function paintGameTree(node) {
    node.color = gameColor(node)
    for (const child of node.children || []) paintGameTree(child)
    return node
  }

  function gameStatus(message, cleared = false) {
    const status = document.getElementById('logyq-game-status')
    if (status) {
      status.textContent = message
      status.style.color = cleared ? '#166534' : ''
    }
  }

  function leaveGamePlay() {
    const session = app.game
    if (!session) return
    app.game = null
    document.body.classList.remove('logyq-game')
    delete window.__logyqGameDropAllowed
    document.getElementById('logyq-game-next').hidden = true
    if (session.origin) {
      app.current = session.origin.current
      app.hasOpenMap = session.origin.hasOpenMap
      document.body.classList.toggle('logyq-map-open', !!app.hasOpenMap)
      app.lastSnapshot = session.origin.lastSnapshot
      updateMapName()
      bridge.loadMap(session.origin.snapshot.tree || { name: '' }, session.origin.snapshot.wordBank || [])
    }
  }

  function beginGameLevel(level) {
    if (!level || !gameGrammar) return
    const origin = app.game?.origin || (app.curriculum ? {
      current: { id: null, name: DEFAULT_NAME }, hasOpenMap: false,
      lastSnapshot: '', snapshot: { tree: null, wordBank: [] },
    } : {
      current: { ...app.current }, hasOpenMap: app.hasOpenMap,
      lastSnapshot: app.lastSnapshot, snapshot: bridge.snapshot(),
    })
    leaveCurriculumPlay()
    app.game = { id: level.id, origin, cleared: false }
    app.current = { id: null, name: level.title }
    app.hasOpenMap = true
    app.lastSnapshot = 'game'
    document.body.classList.add('logyq-game', 'logyq-map-open')
    document.getElementById('logyq-game-next').hidden = true
    window.__logyqGameDropAllowed = ({ tree, movingUid, drop, trash, multi }) => {
      if (trash || multi) return false
      const allowed = gameGrammar.canDrop(tree, movingUid, drop)
      if (!allowed && drop) gameStatus('Those regions do not match at the contact. Try the other arrangement.')
      return allowed
    }
    ensureGamePaint()
    updateMapName()
    hideLibrary()
    gameStatus(level.hint)
    bridge.loadMap(paintGameTree(structuredClone(level.tree)), [])
    setSaveState('saved')
  }

  function maybeGameClear(snapshot) {
    const session = app.game
    if (!session || session.cleared) return false
    const level = gameLevels.find((item) => item.id === session.id)
    if (!level || !gameGrammar.complete(snapshot?.tree, level.ids)) return false
    session.cleared = true
    const progress = gameProgress()
    progress[level.id] = Date.now()
    try { localStorage.setItem(GAME_KEY, JSON.stringify(progress)) } catch (_error) {}
    const next = gameLevels[gameLevels.indexOf(level) + 1]
    gameStatus(next ? 'It fits! The next puzzle is open.' : 'It fits! All 15 two-card puzzles are complete.', true)
    document.getElementById('logyq-game-next').hidden = !next
    return true
  }

  function checkGame() {
    if (!app.game) return
    if (maybeGameClear(bridge.snapshot())) return
    if (app.game.cleared) return
    gameStatus('The contact still clashes. Match the physical regions; the root emerges from the fit.')
  }

  document.getElementById('logyq-game-path')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-game-level]')
    if (!button || button.disabled) return
    const index = gameLevels.findIndex((level) => level.id === button.dataset.gameLevel)
    if (index > 0 && !gameProgress()[gameLevels[index - 1].id]) return
    beginGameLevel(gameLevels[index])
  })
  document.getElementById('logyq-game-check')?.addEventListener('click', checkGame)
  document.getElementById('logyq-game-next')?.addEventListener('click', () => {
    const index = gameLevels.findIndex((level) => level.id === app.game?.id)
    if (app.game?.cleared && gameLevels[index + 1]) beginGameLevel(gameLevels[index + 1])
  })
  document.getElementById('logyq-game-levels-button')?.addEventListener('click', () => {
    openLibrary().then(() => setHomeTab('game'))
  })
  preview.game = { levels: gameLevels, begin: beginGameLevel, check: checkGame, leave: leaveGamePlay }
