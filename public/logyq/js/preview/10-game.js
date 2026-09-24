  // A small, fixed-orientation fitting puzzle on the real LOGYQ canvas.
  // Paint is visible on the node; gameId and paint carry the contact rules.
  const GAME_KEY = 'logyq_game_progress_v1'
  const gameGrammar = window.LOGYQGameGrammar
  const gameLevels = [
    {
      id: 'chain', title: '1 · One child at a time', hint: 'Move the blue card beneath the two-color card.',
      ids: ['root', 'middle', 'leaf'],
      tree: { name: '', gameId: 'root', paint: 'orange', children: [
        { name: '', gameId: 'leaf', paint: 'blue', children: [
          { name: '', gameId: 'middle', paint: 'orange-blue' },
        ] },
      ] },
    },
    {
      id: 'branch', title: '2 · Two children', hint: 'Both children fit the parent. Check where they touch each other.',
      ids: ['root', 'left', 'right'],
      tree: { name: '', gameId: 'root', paint: 'blue', children: [
        { name: '', gameId: 'right', paint: 'blue-green-up' },
        { name: '', gameId: 'left', paint: 'pink-blue-down' },
      ] },
    },
  ]

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
        `${level.title}${done ? ' ✓' : ''}<span>${unlocked ? level.hint : 'Clear the previous level first.'}</span></button></li>`
    }).join('')
  }

  function ensureGamePaint() {
    const svg = document.getElementById('canvas')
    if (!svg || svg.querySelector('#logyq-game-orange-blue')) return
    const ns = 'http://www.w3.org/2000/svg'
    const defs = document.createElementNS(ns, 'defs')
    const gradients = [
      ['orange-blue', '0%', '0%', '0%', '100%', '#fb923c', '#60a5fa'],
      // First child: pink at lower left, blue at upper right.
      ['pink-blue-down', '0%', '100%', '100%', '0%', '#f0abfc', '#60a5fa'],
      // Second child: blue at upper left, green at lower right.
      ['blue-green-up', '0%', '0%', '100%', '100%', '#60a5fa', '#86efac'],
    ]
    for (const [id, x1, y1, x2, y2, first, second] of gradients) {
      const gradient = document.createElementNS(ns, 'linearGradient')
      gradient.id = `logyq-game-${id}`
      for (const [key, value] of Object.entries({ x1, y1, x2, y2 })) gradient.setAttribute(key, value)
      for (const [offset, color] of [['0%', first], ['49.9%', first], ['50%', second], ['100%', second]]) {
        const stop = document.createElementNS(ns, 'stop')
        stop.setAttribute('offset', offset)
        stop.setAttribute('stop-color', color)
        gradient.appendChild(stop)
      }
      defs.appendChild(gradient)
    }
    svg.insertBefore(defs, svg.firstChild)
  }

  function gameColor(paint) {
    if (paint === 'orange') return '#fb923c'
    if (paint === 'blue') return '#60a5fa'
    return `url(#logyq-game-${paint})`
  }

  function paintGameTree(node) {
    node.color = gameColor(node.paint)
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
      const allowed = gameGrammar.canDrop(tree, movingUid, drop, 'root')
      if (!allowed && drop) gameStatus('Those edges do not fit. Try another connection.')
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
    if (!level || !gameGrammar.complete(snapshot?.tree, level.ids, 'root')) return false
    session.cleared = true
    const progress = gameProgress()
    progress[level.id] = Date.now()
    try { localStorage.setItem(GAME_KEY, JSON.stringify(progress)) } catch (_error) {}
    const next = gameLevels[gameLevels.indexOf(level) + 1]
    gameStatus(next ? 'It fits! The branch level is open.' : 'It fits! Both children meet the parent and each other.', true)
    document.getElementById('logyq-game-next').hidden = !next
    return true
  }

  function checkGame() {
    if (!app.game) return
    if (maybeGameClear(bridge.snapshot())) return
    if (app.game.cleared) return
    gameStatus('A contact still clashes. Each card has one parent; neighboring children must match too.')
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
