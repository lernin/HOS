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

  // Open playtest expansion: chains first, then branches. Every level stays
  // selectable so the learning sequence can be sampled and tuned out of order.
  function addOpenLevel(id, title, tree, anchorId, extra) {
    const nodes = []
    ;(function walk(n){ nodes.push(n); for (const x of n.children || []) walk(x) })(tree)
    const anchor = nodes.find(n => n.gameId === anchorId) || nodes[0]
    const bankCards = {}, bank = []
    for (const n of nodes) if (n.gameId !== anchor.gameId) {
      const key = '__TREE_CARD__:' + id + ':' + n.gameId
      bank.push(key); bankCards[key] = { ...n, children: [] }
    }
    const decoy = extra && extra.decoy
    if (decoy) {
      const key = '__TREE_CARD__:' + id + ':' + decoy.gameId
      bank.push(key)
      bankCards[key] = { name: '', gameId: decoy.gameId, paint: decoy.paint, children: [] }
    }
    gameLevels.push({
      id, title, tier: extra && extra.tier, hint: decoy ? 'One piece does not fit.' : '',
      ids: nodes.map(n => n.gameId),
      tree: { ...anchor, children: [] }, bank, bankCards,
      solution: tree,
    })
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

  gameLevels.forEach((level, index) => {
    const number = index + 1
    level.tier = number <= 15 ? 1 : number <= 27 ? 2 : 3
  })

  // Levels 40–139. Fixed recipes, not a slow ramp: every tier from 4 up
  // mixes chains, forks, deep branches, three-wide trees, and a distractor.
  // Color D is reserved for the distractor so it has no visible-contact seat.
  const CLIMB_COLORS = ['A', 'B', 'C']
  const CLIMB_ROOTS = [
    ['L', 'A', 'B'], ['DL', 'A', 'B'], ['DR', 'A', 'B'],
    ['L', 'B', 'C'], ['DL', 'B', 'C'], ['DR', 'B', 'C'],
    ['L', 'C', 'A'], ['DL', 'C', 'A'], ['DR', 'C', 'A'],
    ['L', 'A', 'C'], ['DL', 'B', 'A'], ['DR', 'C', 'B'],
  ]
  const CLIMB_ARCHETYPES = [
    ['chain4', 'Four Chain'],
    ['chain5', 'Long Chain'],
    ['fork', 'Fork Tail'],
    ['deep', 'Deep Branch'],
    ['wide', 'Three Wide'],
    ['mixed', 'Mixed Wide'],
    ['decoy', 'Decoy'],
  ]
  const CLIMB_ALT = {
    chain4: 'Chain Link', chain5: 'Five Chain', fork: 'Branch Chain',
    deep: 'Grandchild', wide: 'Wide Fork', mixed: 'Wide Mix', decoy: 'Decoy Mix',
  }
  const CLIMB_TIER_SIZES = [[4, 14], [5, 14], [6, 14], [7, 15], [8, 15], [9, 14], [10, 14]]

  function climbEdge(paint, side) {
    return gameGrammar.edge(paint, side)
  }
  function climbNode(id, paint, children) {
    return { name: '', gameId: id, paint, children: children || [] }
  }
  function climbSingle(shape, parentBottom, bias) {
    const bottom = CLIMB_COLORS[(bias + parentBottom.charCodeAt(0)) % 3]
    if (shape === 'W') return 'W:' + parentBottom
    return shape + ':' + parentBottom + ':' + bottom
  }
  function climbWide(shapes, parentBottom, bias) {
    const paints = []
    let prevRight = null
    for (let i = 0; i < shapes.length; i++) {
      const shape = shapes[i]
      let paint = null
      for (let k = 0; k < 3 && !paint; k++) {
        const bottom = CLIMB_COLORS[(bias + i + k) % 3]
        if (shape === 'DL') {
          const b = prevRight == null ? bottom : prevRight
          if (CLIMB_COLORS.includes(b)) paint = 'DL:' + parentBottom + ':' + b
        } else if (shape === 'DR') {
          if (prevRight == null || prevRight === parentBottom) paint = 'DR:' + parentBottom + ':' + bottom
        } else if (shape === 'L') {
          const left = parentBottom + '|' + bottom
          if (prevRight == null || prevRight === left) paint = 'L:' + parentBottom + ':' + bottom
        } else if (shape === 'W') {
          if (prevRight == null || prevRight === parentBottom) paint = 'W:' + parentBottom
        }
        if (paint && (climbEdge(paint, 'top') !== parentBottom || (prevRight != null && climbEdge(paint, 'left') !== prevRight))) {
          paint = null
        }
      }
      if (!paint) return null
      paints.push(paint)
      prevRight = climbEdge(paint, 'right')
    }
    return paints
  }
  function climbChain(shapes, top, bottom) {
    const paints = []
    let parentBottom = null
    for (let i = 0; i < shapes.length; i++) {
      const shape = shapes[i]
      const paint = i === 0
        ? (shape === 'W' ? 'W:' + top : shape + ':' + top + ':' + bottom)
        : climbSingle(shape, parentBottom, i + top.charCodeAt(0))
      paints.push(paint)
      parentBottom = climbEdge(paint, 'bottom')
    }
    let node = null
    for (let i = paints.length - 1; i >= 0; i--) node = climbNode('p' + i, paints[i], node ? [node] : [])
    return node
  }
  function climbRooted(rootSpec, childShapes, bias) {
    const paints = climbWide(childShapes, rootSpec[2], bias)
    if (!paints) return null
    return climbNode('r', rootSpec[0] + ':' + rootSpec[1] + ':' + rootSpec[2], paints.map((paint, i) => climbNode('c' + i, paint)))
  }
  function climbHang(tree, childIndex, shape, id, bias) {
    const parent = tree.children[childIndex] || tree.children[0]
    parent.children = [climbNode(id, climbSingle(shape, climbEdge(parent.paint, 'bottom'), bias))]
    return parent.children[0]
  }
  const CLIMB_PAIRS = [['DL', 'DR'], ['DR', 'DL'], ['L', 'L'], ['DL', 'L'], ['DR', 'L'], ['DL', 'W']]
  const CLIMB_TRIOS = [['DL', 'DR', 'DL'], ['DR', 'DL', 'DR'], ['L', 'L', 'L'], ['DL', 'DR', 'W'], ['DL', 'W', 'DR'], ['L', 'DL', 'DR']]
  const CLIMB_CHAINS = [
    ['L', 'DL', 'DR', 'L'],
    ['DL', 'L', 'DR', 'DL'],
    ['DR', 'DL', 'L', 'DR'],
    ['L', 'DR', 'DL', 'W'],
    ['DL', 'DR', 'L', 'W'],
    ['DR', 'L', 'DL', 'W'],
    ['L', 'DL', 'L', 'DR'],
  ]
  function climbBuild(kind, salt) {
    const root = CLIMB_ROOTS[salt % CLIMB_ROOTS.length]
    const bias = salt * 3 + 1
    if (kind === 'chain4' || kind === 'chain5') {
      const shapes = CLIMB_CHAINS[salt % CLIMB_CHAINS.length].slice()
      if (kind === 'chain5') shapes.push(['W', 'DL', 'DR', 'L'][salt % 4])
      return climbChain(shapes, root[1], root[2])
    }
    if (kind === 'fork' || kind === 'deep') {
      const pair = CLIMB_PAIRS[salt % CLIMB_PAIRS.length]
      let tree = null
      for (let shift = 0; shift < CLIMB_ROOTS.length && !tree; shift++) {
        tree = climbRooted(CLIMB_ROOTS[(salt + shift) % CLIMB_ROOTS.length], pair, bias + shift)
      }
      if (!tree) return null
      const tail = climbHang(tree, salt % 2, ['L', 'DL', 'DR', 'W'][salt % 4], 't', bias)
      if (kind === 'deep') {
        tail.children = [climbNode('g', climbSingle(['DL', 'DR', 'L', 'W'][(salt + 1) % 4], climbEdge(tail.paint, 'bottom'), bias + 2))]
      }
      return tree
    }
    const trio = CLIMB_TRIOS[salt % CLIMB_TRIOS.length]
    let tree = null
    for (let shift = 0; shift < CLIMB_ROOTS.length && !tree; shift++) {
      tree = climbRooted(CLIMB_ROOTS[(salt + shift) % CLIMB_ROOTS.length], trio, bias + shift)
    }
    if (!tree) return null
    if (kind === 'mixed' || kind === 'decoy' || kind === 'decoy-deep') {
      const mid = climbHang(tree, 1, ['DL', 'DR', 'L', 'W'][salt % 4], 'm', bias + 4)
      if (kind === 'decoy-deep') {
        mid.children = [climbNode('g', climbSingle(['DR', 'L', 'DL', 'W'][(salt + 2) % 4], climbEdge(mid.paint, 'bottom'), bias + 5))]
      }
    }
    return tree
  }
  function climbNodes(node, out) {
    out.push(node)
    for (const child of node.children || []) climbNodes(child, out)
    return out
  }
  function climbDecoyFits(tree) {
    const card = { gameId: 'decoy', paint: 'W:D', children: [] }
    const drops = [{ type: 'rootAbove' }]
    const walk = (node) => {
      drops.push({ type: 'node', targetUid: node.gameId })
      const kids = node.children || []
      for (let i = 0; i <= kids.length; i++) {
        const drop = { type: 'gap', parentUid: node.gameId }
        if (kids[i - 1]) drop.prevUid = kids[i - 1].gameId
        if (kids[i]) drop.nextUid = kids[i].gameId
        drops.push(drop)
      }
      for (const child of kids) walk(child)
    }
    walk(tree)
    return drops.some((drop) => gameGrammar.canAdd(tree, card, drop))
  }

  for (const [tier, count] of CLIMB_TIER_SIZES) {
    for (let slot = 0; slot < count; slot++) {
      const number = gameLevels.length + 1
      const variant = slot >= CLIMB_ARCHETYPES.length ? 1 : 0
      const extraHard = slot === CLIMB_ARCHETYPES.length
      const arch = extraHard ? ['decoy-deep', 'Decoy Deep'] : CLIMB_ARCHETYPES[slot % CLIMB_ARCHETYPES.length]
      const kind = arch[0]
      const salt = tier * 17 + slot * 5 + 3
      let tree = null
      for (let attempt = 0; attempt < 8 && !tree; attempt++) {
        const built = climbBuild(kind === 'decoy' ? 'decoy' : kind, salt + attempt * 11)
        if (!built || !gameGrammar.contacts(built)) continue
        const ids = climbNodes(built, []).map((node) => node.gameId)
        if (new Set(ids).size !== ids.length) continue
        if ((kind === 'decoy' || kind === 'decoy-deep') && climbDecoyFits(built)) continue
        tree = built
      }
      if (!tree) throw new Error('Could not build level ' + number)
      const nodes = climbNodes(tree, [])
      const anchor = nodes[(number + tier + slot) % nodes.length]
      const name = variant && CLIMB_ALT[kind] ? CLIMB_ALT[kind] : arch[1]
      const decoy = kind === 'decoy' || kind === 'decoy-deep' ? { gameId: 'decoy', paint: 'W:D' } : null
      addOpenLevel('climb-' + number, number + ' · ' + name, tree, anchor.gameId, { tier, decoy })
    }
  }

  const GAME_ADAPTIVE = '_adaptive'

  function gameProgress() {
    const value = readJson(GAME_KEY, {})
    return value && typeof value === 'object' ? value : {}
  }

  function adaptiveState(progress) {
    const raw = progress && progress[GAME_ADAPTIVE]
    const clean = Number.isInteger(raw?.clean) && raw.clean > 0 ? raw.clean : 0
    const tier = Number.isInteger(raw?.tier) && raw.tier > 0 ? raw.tier : 1
    const played = raw?.played && typeof raw.played === 'object' ? raw.played : {}
    return { clean, tier, played }
  }

  function writeProgress(progress) {
    try { localStorage.setItem(GAME_KEY, JSON.stringify(progress)) } catch (_error) {}
    return progress
  }

  function pickInTier(tier, progress, played, avoidId) {
    const group = gameLevels.filter((level) => level.tier === tier)
    const unsolved = group.filter((level) => !progress[level.id])
    if (unsolved.length) {
      const others = avoidId ? unsolved.filter((level) => level.id !== avoidId) : unsolved
      return (others.length ? others : unsolved)[0]
    }
    const pool = avoidId ? group.filter((level) => level.id !== avoidId) : group.slice()
    const list = (pool.length ? pool : group).slice()
    list.sort((a, b) => (played[a.id] || 0) - (played[b.id] || 0))
    return list[0] || null
  }

  // One JSON object: solved level ids stay as timestamps, streak lives under
  // _adaptive, so the blob can later hang off a user without a second store.
  function recordSolve(progress, levelId, wrongDrops) {
    const level = gameLevels.find((item) => item.id === levelId)
    const state = adaptiveState(progress)
    const clean = wrongDrops > 0 ? 0 : state.clean + 1
    const now = Date.now()
    const next = { ...(progress || {}), [levelId]: now }
    next[GAME_ADAPTIVE] = {
      clean,
      tier: level ? level.tier : state.tier,
      played: { ...state.played, [levelId]: now },
    }
    return next
  }

  function chooseNext(progress, justSolvedId) {
    const state = adaptiveState(progress)
    const level = gameLevels.find((item) => item.id === justSolvedId)
    const tier = level ? level.tier : state.tier
    if (state.clean >= 3 && gameLevels.some((item) => item.tier === tier + 1)) {
      return {
        level: pickInTier(tier + 1, progress, state.played, null),
        leveledUp: true,
        adaptive: { clean: 0, tier: tier + 1, played: state.played },
      }
    }
    return {
      level: pickInTier(tier, progress, state.played, justSolvedId),
      leveledUp: false,
      adaptive: { clean: state.clean, tier, played: state.played },
    }
  }

  function renderGamePath() {
    const path = document.getElementById('logyq-game-path')
    if (!path) return
    const progress = gameProgress()
    let html = ''
    let seen = 0
    for (const level of gameLevels) {
      if (level.tier !== seen) {
        seen = level.tier
        html += '<li class="logyq-tier-head">Tier ' + level.tier + '</li>'
      }
      const done = !!progress[level.id]
      html += '<li><button type="button" data-game-level="' + level.id + '"' +
        (done ? ' class="is-cleared"' : '') + '>' +
        level.title + (done ? ' ✓' : '') + '<span>' + level.hint + '</span></button></li>'
    }
    path.innerHTML = html
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

  function gameColor(paint) {
    const spec = gameGrammar.paintSpec(paint)
    if (!spec) return '#cbd5e1'
    if (spec.solid) return spec.solid
    ensureGamePaint()
    const svg = document.getElementById('canvas')
    const defs = svg?.querySelector('#logyq-game-defs')
    const safe = String(paint).replace(/[^A-Za-z0-9_-]/g, '-')
    const id = 'logyq-game-' + safe
    if (!defs?.querySelector('#' + id)) {
      const ns = 'http://www.w3.org/2000/svg'
      const gradient = document.createElementNS(ns, 'linearGradient')
      gradient.id = id
      for (const [key, value] of Object.entries(spec.split)) gradient.setAttribute(key, value)
      for (const [offset, color] of spec.stops) {
        const stop = document.createElementNS(ns, 'stop')
        stop.setAttribute('offset', offset)
        stop.setAttribute('stop-color', color)
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

  function noteWrongDrop() {
    if (!app.game || app.game.cleared) return
    app.game.wrongDrops = (app.game.wrongDrops || 0) + 1
  }

  function showGameTier(level, levelUp) {
    const tierEl = document.getElementById('logyq-game-tier')
    if (!tierEl) return
    tierEl.textContent = 'Tier ' + level.tier
    if (tierEl.classList) tierEl.classList.toggle('is-up', !!levelUp)
  }

  function beginGameLevel(level, opts) {
    if (!level || !gameGrammar) return
    const origin = app.game?.origin || (app.curriculum ? {
      current: { id: null, name: DEFAULT_NAME }, hasOpenMap: false,
      lastSnapshot: '', snapshot: { tree: null, wordBank: [] },
    } : {
      current: { ...app.current }, hasOpenMap: app.hasOpenMap,
      lastSnapshot: app.lastSnapshot, snapshot: bridge.snapshot(),
    })
    leaveCurriculumPlay()
    const progress = gameProgress()
    const state = adaptiveState(progress)
    const levelUp = !!opts?.levelUp
    const clean = !levelUp && state.tier !== level.tier ? 0 : state.clean
    writeProgress({
      ...progress,
      [GAME_ADAPTIVE]: {
        clean,
        tier: level.tier,
        played: { ...state.played, [level.id]: Date.now() },
      },
    })
    app.game = { id: level.id, origin, cleared: false, wrongDrops: 0 }
    app.current = { id: null, name: level.title }
    app.hasOpenMap = true
    app.lastSnapshot = 'game'
    document.body.classList.add('logyq-game', 'logyq-map-open')
    document.getElementById('logyq-game-next').hidden = true
    showGameTier(level, levelUp)
    window.__logyqGameDropAllowed = ({ tree, movingUid, drop, trash, multi }) => {
      if (trash || multi) return false
      const allowed = gameGrammar.canDrop(tree, movingUid, drop)
      if (!allowed && drop) {
        noteWrongDrop()
        gameStatus('Those visible edges do not fit. Try the other order.')
      }
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
      if (!allowed && drop) {
        noteWrongDrop()
        gameStatus('That card does not fit there. Try the other side of the tree.')
      }
      return allowed
    }
    ensureGamePaint()
    updateMapName()
    hideLibrary()
    gameStatus(levelUp ? 'Level up!' : level.hint)
    bridge.loadMap(paintGameTree(structuredClone(level.tree)), level.bank.slice())
    setSaveState('saved')
  }

  function maybeGameClear(snapshot) {
    const session = app.game
    if (!session || session.cleared) return false
    const level = gameLevels.find((item) => item.id === session.id)
    if (!level || !gameGrammar.complete(snapshot?.tree, level.ids)) return false
    session.cleared = true
    const progress = writeProgress(recordSolve(gameProgress(), level.id, session.wrongDrops || 0))
    const solvedCount = gameLevels.filter((item) => progress[item.id]).length
    const upcoming = chooseNext(progress, level.id).level
    gameStatus(solvedCount >= gameLevels.length ? 'All ' + gameLevels.length + ' levels cleared.' : 'It fits!', true)
    document.getElementById('logyq-game-next').hidden = !upcoming
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
    if (!button) return
    const index = gameLevels.findIndex((level) => level.id === button.dataset.gameLevel)
    if (index < 0) return
    beginGameLevel(gameLevels[index])
  })
  document.getElementById('logyq-game-check')?.addEventListener('click', checkGame)
  document.getElementById('logyq-game-next')?.addEventListener('click', () => {
    if (!app.game?.cleared) return
    const progress = gameProgress()
    const choice = chooseNext(progress, app.game.id)
    if (!choice.level) return
    writeProgress({ ...progress, [GAME_ADAPTIVE]: choice.adaptive })
    beginGameLevel(choice.level, { levelUp: choice.leveledUp })
  })
  document.getElementById('logyq-game-levels-button')?.addEventListener('click', () => {
    openLibrary().then(() => setHomeTab('game'))
  })
  preview.game = {
    levels: gameLevels, begin: beginGameLevel, check: checkGame, leave: leaveGamePlay, render: renderGamePath,
    recordSolve, chooseNext,
  }
