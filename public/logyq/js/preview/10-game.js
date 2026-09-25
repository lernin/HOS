  // First LOGYQ fitting curriculum: every unique two-card ordered geometry
  // except Whole/Whole, which is excluded because swapping the two whole cards
  // gives another valid solution. Fixed orientation; color names are canonical.
  const GAME_KEY = 'logyq_game_progress_v2'
  const gameGrammar = window.LOGYQGameGrammar
  const GAME_SHAPES = [
    ['W', 'Whole'],
    ['L', 'Layer Cake'],
    ['DL', 'Diagonal Left'],
    ['DR', 'Diagonal Right'],
  ]

  function rootPaint(shape) {
    return shape === 'W' ? 'W:A' : shape + ':A:B'
  }
  function childPaint(rootShape, childShape) {
    const contact = rootShape === 'W' ? 'A' : 'B'
    if (childShape === 'W') return 'W:' + contact
    const next = contact === 'A' ? 'B' : 'C'
    return childShape + ':' + contact + ':' + next
  }

  const gameLevels = []
  for (const [rootShape, rootName] of GAME_SHAPES) {
    for (const [childShape, childName] of GAME_SHAPES) {
      if (rootShape === 'W' && childShape === 'W') continue
      const number = gameLevels.length + 1
      const intendedRoot = { name: '', gameId: 'piece-r', paint: rootPaint(rootShape) }
      const intendedChild = { name: '', gameId: 'piece-c', paint: childPaint(rootShape, childShape) }
      // One card starts on the canvas and the other in the existing Word Bank.
      // Alternate the anchor so "always drop below" / "always make root" is not a clue.
      const rootStarts = number % 2 === 1
      const anchor = rootStarts ? intendedRoot : intendedChild
      const loose = rootStarts ? intendedChild : intendedRoot
      const bankKey = '__LOGYQ_GAME_CARD__'
      gameLevels.push({
        id: 'two-' + rootShape.toLowerCase() + '-' + childShape.toLowerCase(),
        title: number + ' · ' + rootName + ' → ' + childName,
        hint: 'Drag the loose card from the bank and find where it fits.',
        ids: ['piece-r', 'piece-c'],
        tree: { ...anchor, children: [] },
        bank: [bankKey],
        bankCards: { [bankKey]: { ...loose, children: [] } },
      })
    }
  }

  // Open playtest expansion: chains first, then branches. These are deliberately
  // unlocked so the learning sequence can be sampled and tuned out of order.
  function addOpenLevel(id, title, tree, anchorId) {
    const nodes = []
    ;(function walk(n){ nodes.push(n); for (const x of n.children || []) walk(x) })(tree)
    const anchor = nodes.find(n => n.gameId === anchorId) || nodes[0]
    const bankCards = {}, bank = []
    for (const n of nodes) if (n.gameId !== anchor.gameId) {
      const key = '__TREE_CARD__:' + id + ':' + n.gameId
      bank.push(key); bankCards[key] = { ...n, children: [] }
    }
    gameLevels.push({ id, title, hint: '', ids: nodes.map(n => n.gameId),
      tree: { ...anchor, children: [] }, bank, bankCards })
  }
  const chainSets = [
    ['L:A:B','DL:B:C','DR:C:D'], ['DL:A:B','L:B:C','DR:C:D'],
    ['DR:A:B','DL:B:C','L:C:D'], ['L:A:B','DR:B:C','DL:C:D']
  ]
  for (let round=0; round<3; round++) chainSets.forEach((p,i) => {
    const t={name:'',gameId:'a',paint:p[0],children:[{name:'',gameId:'b',paint:p[1],children:[{name:'',gameId:'c',paint:p[2],children:[]}]}]}
    addOpenLevel('chain-'+round+'-'+i, (16+round*4+i)+' · Chain', t, ['a','b','c'][(round+i)%3])
  })
  const branches = [
    ['L:A:B','DL:B:C','DR:B:D'], ['DL:A:B','DR:B:C','DL:B:D'],
    ['DR:A:B','DL:B:C','DR:B:D'], ['L:A:B','DR:B:C','DL:B:D']
  ]
  for (let round=0; round<3; round++) branches.forEach((p,i) => {
    const t={name:'',gameId:'a',paint:p[0],children:[
      {name:'',gameId:'b',paint:p[1],children:[]},{name:'',gameId:'c',paint:p[2],children:[]}]}
    addOpenLevel('branch-'+round+'-'+i, (28+round*4+i)+' · Branch', t, ['a','b','c'][(round+i)%3])
  })

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
      return '<li><button type="button" data-game-level="' + level.id + '" ' + (unlocked ? '' : 'disabled') + '>' +
        level.title + (done ? ' ✓' : '') + '<span>' + level.hint + '</span></button></li>'
    }).join('')
  }

  function ensureGamePaint() {
    const svg = document.getElementById('canvas')
    if (!svg) return
    let defs = svg.querySelector('#logyq-game-defs')
    if (!defs) {
      defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs')
      defs.id = 'logyq-game-defs'
      svg.insertBefore(defs, svg.firstChild)
    }
  }

  const GAME_COLORS = { A: '#60a5fa', B: '#fb923c', C: '#86efac', D: '#f0abfc' }

  function gameColor(paint) {
    const parsed = gameGrammar.parsePaint(paint)
    if (!parsed) return '#cbd5e1'
    if (parsed.shape === 'W') return GAME_COLORS[parsed.a] || '#cbd5e1'
    ensureGamePaint()
    const svg = document.getElementById('canvas')
    const defs = svg?.querySelector('#logyq-game-defs')
    const safe = paint.replace(/[^A-Za-z0-9_-]/g, '-')
    const id = 'logyq-game-' + safe
    if (!defs?.querySelector('#' + id)) {
      const ns = 'http://www.w3.org/2000/svg'
      const gradient = document.createElementNS(ns, 'linearGradient')
      gradient.id = id
      const vector = parsed.shape === 'L'
        ? { x1: '0%', y1: '0%', x2: '0%', y2: '100%' }
        : parsed.shape === 'DL'
          ? { x1: '100%', y1: '0%', x2: '0%', y2: '100%' }
          : { x1: '0%', y1: '0%', x2: '100%', y2: '100%' }
      for (const [key, value] of Object.entries(vector)) gradient.setAttribute(key, value)
      for (const [offset, letter] of [['0%', parsed.a], ['49.9%', parsed.a], ['50%', parsed.b], ['100%', parsed.b]]) {
        const stop = document.createElementNS(ns, 'stop')
        stop.setAttribute('offset', offset)
        stop.setAttribute('stop-color', GAME_COLORS[letter] || '#cbd5e1')
        gradient.appendChild(stop)
      }
      defs?.appendChild(gradient)
    }
    return 'url(#' + id + ')'
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
    delete window.__logyqGameBankNode
    delete window.__logyqGameBankDropAllowed
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
      if (!allowed && drop) gameStatus('Those visible edges do not fit. Try the other order.')
      return allowed
    }
    window.__logyqGameBankNode = (word) => {
      const card = level.bankCards?.[word]
      return card ? paintGameTree(structuredClone(card)) : null
    }
    window.__logyqGameBankDropAllowed = ({ tree, words, drop }) => {
      if (words.length !== 1) return false
      const card = level.bankCards?.[words[0]]
      const allowed = !!card && gameGrammar.canAdd(tree, card, drop)
      if (!allowed) gameStatus('That card does not fit there. Try the other side of the tree.')
      return allowed
    }
    ensureGamePaint()
    updateMapName()
    hideLibrary()
    gameStatus(level.hint)
    bridge.loadMap(paintGameTree(structuredClone(level.tree)), level.bank.slice())
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
    gameStatus(next ? 'It fits! Next level unlocked.' : 'All 15 two-card levels cleared.', true)
    document.getElementById('logyq-game-next').hidden = !next
    return true
  }

  function checkGame() {
    if (!app.game) return
    if (maybeGameClear(bridge.snapshot())) return
    if (app.game.cleared) return
    gameStatus('Not yet. Only the physical color contacts count.')
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
