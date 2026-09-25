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

  // Levels 40–139. Every tier from 4 up still mixes a short chain, a long
  // chain, a fork, a deep branch, a three-wide tree, and a distractor.
  // Colours are a seeded shuffle of the whole grammar palette. A candidate
  // is kept only when the physical solver finds exactly one arrangement,
  // no two pieces share a face, and no card is a solid wildcard. Distractors
  // use a contact the finished tree never offers, so they have no seat.
  const CLIMB_COLORS = ['A', 'B', 'C', 'D']
  const CLIMB_SHAPES = ['L', 'DL', 'DR']
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
  const CLIMB_CHAINS = {
    chain4: [['A', 'B', 'C', 'D', 'B'], ['A', 'B', 'C', 'D', 'C']],
    chain5: [['A', 'B', 'C', 'D', 'C', 'B'], ['A', 'B', 'A', 'C', 'D', 'C']],
  }

  function climbRng(seed) {
    let state = seed >>> 0
    return (span) => {
      state = (state + 0x6D2B79F5) >>> 0
      let mixed = Math.imul(state ^ (state >>> 15), 1 | state)
      mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed
      return Math.floor((((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296) * span)
    }
  }
  function climbNode(id, shape, top, bottom, children) {
    return { name: '', gameId: id, paint: shape + ':' + top + ':' + bottom, children: children || [] }
  }
  function climbNodes(node, out) {
    out.push(node)
    for (const child of node.children || []) climbNodes(child, out)
    return out
  }
  function climbPermute(rng) {
    const colors = CLIMB_COLORS.slice()
    for (let i = colors.length - 1; i > 0; i--) {
      const j = rng(i + 1)
      const held = colors[i]
      colors[i] = colors[j]
      colors[j] = held
    }
    return colors
  }
  function climbRelabel(tree, perm) {
    const map = { A: perm[0], B: perm[1], C: perm[2], D: perm[3] }
    const walk = (node) => {
      const parsed = gameGrammar.parsePaint(node.paint)
      return {
        name: '',
        gameId: node.gameId,
        paint: parsed.shape + ':' + map[parsed.a] + ':' + map[parsed.b],
        children: (node.children || []).map(walk),
      }
    }
    return walk(tree)
  }
  // Canonical faces. Renaming colours keeps the same contact graph, and the
  // solver below rejects any shape mix that opens a second arrangement.
  function climbCandidate(kind, rng, safe) {
    const shape = () => safe ? 'L' : CLIMB_SHAPES[rng(CLIMB_SHAPES.length)]
    if (kind === 'chain4' || kind === 'chain5') {
      const patterns = CLIMB_CHAINS[kind]
      const colors = patterns[safe ? 0 : rng(patterns.length)]
      let tree = null
      for (let i = colors.length - 2; i >= 0; i--) {
        tree = climbNode('p' + i, shape(), colors[i], colors[i + 1], tree ? [tree] : [])
      }
      return tree
    }
    if (kind === 'fork' || kind === 'deep') {
      const tailBottom = kind === 'deep' ? 'A' : 'D'
      const tailKids = kind === 'deep' ? [climbNode('g', shape(), 'A', 'D')] : []
      return climbNode('r', shape(), 'A', 'B', [
        climbNode('c0', 'DL', 'B', 'C', [climbNode('t', shape(), 'C', tailBottom, tailKids)]),
        climbNode('c1', 'DR', 'B', 'D'),
      ])
    }
    if (kind === 'decoy-deep') {
      return climbNode('r', shape(), 'A', 'B', [
        climbNode('c0', 'DL', 'B', 'C', [
          climbNode('t', shape(), 'C', 'B', [climbNode('g', 'L', 'B', 'D')]),
        ]),
        climbNode('c1', 'DR', 'B', 'D'),
      ])
    }
    const mid = kind === 'mixed' || kind === 'decoy' ? [climbNode('m', shape(), 'C', 'D')] : []
    return climbNode('r', shape(), 'A', 'B', [
      climbNode('c0', 'DL', 'B', 'C', mid),
      climbNode('c1', 'DR', 'B', 'D'),
      climbNode('c2', 'DL', 'B', 'D'),
    ])
  }
  function climbUnique(tree) {
    if (!gameGrammar.contacts(tree)) return false
    const nodes = climbNodes(tree, [])
    const paints = nodes.map((node) => node.paint)
    if (new Set(paints).size !== paints.length) return false
    if (nodes.some((node) => {
      const parsed = gameGrammar.parsePaint(node.paint)
      return !parsed || parsed.shape === 'W' || parsed.a === parsed.b
    })) return false
    const pieces = nodes.map((node) => ({ gameId: node.gameId, paint: node.paint }))
    return gameGrammar.physicalSolutions(pieces, 2).length === 1
  }
  function climbDecoy(tree) {
    const nodes = climbNodes(tree, [])
    const tops = new Set(nodes.map((node) => gameGrammar.edge(node.paint, 'top')))
    const bottoms = new Set(nodes.map((node) => gameGrammar.edge(node.paint, 'bottom')))
    const missingTop = CLIMB_COLORS.find((color) => !tops.has(color))
    const missingBottom = CLIMB_COLORS.find((color) => !bottoms.has(color))
    if (!missingTop || !missingBottom) return null
    const paint = missingBottom === missingTop
      ? 'W:' + missingBottom
      : 'DL:' + missingBottom + ':' + missingTop
    if (nodes.some((node) => node.paint === paint)) return null
    const card = { gameId: 'decoy', paint, children: [] }
    if (gameGrammar.validSeats(tree, card, 1) !== 0) return null
    return card
  }

  for (const [tier, count] of CLIMB_TIER_SIZES) {
    for (let slot = 0; slot < count; slot++) {
      const number = gameLevels.length + 1
      const variant = slot >= CLIMB_ARCHETYPES.length ? 1 : 0
      const extraHard = slot === CLIMB_ARCHETYPES.length
      const arch = extraHard ? ['decoy-deep', 'Decoy Deep'] : CLIMB_ARCHETYPES[slot % CLIMB_ARCHETYPES.length]
      const kind = arch[0]
      const wantDecoy = kind === 'decoy' || kind === 'decoy-deep'
      const rng = climbRng((0x4C4F4759 + tier * 10007 + slot * 97) >>> 0)
      let tree = null
      let decoy = null
      for (let attempt = 0; attempt < 12 && !tree; attempt++) {
        const candidate = climbRelabel(climbCandidate(kind, rng, attempt === 11), climbPermute(rng))
        if (!climbUnique(candidate)) continue
        const extra = wantDecoy ? climbDecoy(candidate) : null
        if (wantDecoy && !extra) continue
        tree = candidate
        decoy = extra
      }
      if (!tree) throw new Error('Could not build a unique level ' + number)
      const nodes = climbNodes(tree, [])
      const anchor = nodes[(number + tier + slot) % nodes.length]
      const name = variant && CLIMB_ALT[kind] ? CLIMB_ALT[kind] : arch[1]
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
