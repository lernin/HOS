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
  function shuffledGameBank(bank, id) {
    const mixed = bank.slice()
    let seed = 2166136261
    for (const char of id) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0
    const rng = climbRng(seed)
    for (let i = mixed.length - 1; i > 0; i--) {
      const j = rng(i + 1)
      ;[mixed[i], mixed[j]] = [mixed[j], mixed[i]]
    }
    if (mixed.length > 1 && mixed.every((key, index) => key === bank[index])) {
      mixed.push(mixed.shift())
    }
    return mixed
  }
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
      tree: { ...anchor, children: [] }, bank: shuffledGameBank(bank, id), bankCards,
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

  // Brief first-contact guides; keep the original puzzle IDs and inventory.
  gameLevels[0].guide = 'below'
  gameLevels[1].guide = 'above'
  const firstBranch = gameLevels[27]
  firstBranch.guide = 'sibling'
  const firstChild = firstBranch.solution.children[0]
  firstBranch.tree.children = [structuredClone({...firstChild, children:[]})]
  const mountedKey = firstBranch.bank.find(key => firstBranch.bankCards[key].gameId === firstChild.gameId)
  firstBranch.bank = firstBranch.bank.filter(key => key !== mountedKey)
  delete firstBranch.bankCards[mountedKey]

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
    chain4: 'Chain Link', chain5: 'Tall Chain', fork: 'Branch Chain',
    deep: 'Grandchild', wide: 'Wide Fork', mixed: 'Wide Mix', decoy: 'Decoy Mix',
  }
  const CLIMB_TIER_SIZES = [[4, 14], [5, 14], [6, 14], [7, 15], [8, 15], [9, 14], [10, 14]]
  const CLIMB_CHAINS = {
    chain4: [['A', 'B', 'C', 'D', 'B'], ['A', 'B', 'C', 'D', 'C']],
    // Four contacts, not five. A fifth row is 627px tall and cannot fit the
    // 360×640 safe area at the readable scale. These flows stay unique for
    // every Layer / Diagonal mix, and they are not the Four Chain flows.
    chain5: [['A', 'B', 'D', 'C', 'B'], ['A', 'B', 'D', 'C', 'D']],
  }
  // Same spacing as treeManager.applyLayout (card 140×63, gaps 20 and 78).
  // minScale is 70% of the 1.15 overview cap measured on a 390×844 phone,
  // where one card draws at 161×72. The safe box is a 360×640 portrait after
  // the 48px header, this 32px strip, the 56px Word Bank, and the 8px gaps
  // the game camera adds around that chrome.
  const GAME_LAYOUT = {
    cardWidth: 140,
    cardHeight: 63,
    nodeWidth: 160,
    nodeHeight: 141,
    minScale: 0.8,
    safeWidth: 344,
    safeHeight: 472,
    maxRows: 4,
    maxCardsWide: 3,
  }
  // Seven loose cards need two rows in the bank. Four-row challenge boards
  // still fit on a phone with cards at least 70% of their base size.
  const CHALLENGE_LAYOUT = { ...GAME_LAYOUT, minScale: 0.7 }

  function gameSeparation(a, b) {
    let A = a
    let B = b
    while (A.depth > B.depth) A = A.parent
    while (B.depth > A.depth) B = B.parent
    while (A !== B) { A = A.parent; B = B.parent }
    const up = Math.max(1, a.depth - A.depth)
    const base = up === 1 ? 0.9 : 0.75
    const inc = up > 1 ? 0.35 * (up - 1) : 0
    const bonus = 0.2 * Math.max(0, (a.children?.length ?? 0) - 1) + 0.2 * Math.max(0, (b.children?.length ?? 0) - 1)
    return Math.max(0.1, base + inc + bonus)
  }

  function layoutSolvedTree(tree) {
    const root = d3.hierarchy(tree)
    d3.tree().nodeSize([GAME_LAYOUT.nodeWidth, GAME_LAYOUT.nodeHeight]).separation(gameSeparation)(root)
    const positions = {}
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    let depth = 0
    root.each((node) => {
      if (node.data?.gameId) positions[node.data.gameId] = { x: node.x, y: node.y }
      minX = Math.min(minX, node.x - GAME_LAYOUT.cardWidth / 2)
      maxX = Math.max(maxX, node.x + GAME_LAYOUT.cardWidth / 2)
      minY = Math.min(minY, node.y - GAME_LAYOUT.cardHeight / 2)
      maxY = Math.max(maxY, node.y + GAME_LAYOUT.cardHeight / 2)
      if (node.depth > depth) depth = node.depth
    })
    return {
      positions,
      rows: depth + 1,
      bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
    }
  }

  function solvedTreeFits(tree) {
    const box = layoutSolvedTree(tree)
    return box.rows <= GAME_LAYOUT.maxRows
      && box.bounds.width * GAME_LAYOUT.minScale <= GAME_LAYOUT.safeWidth + 0.05
      && box.bounds.height * GAME_LAYOUT.minScale <= GAME_LAYOUT.safeHeight + 0.05
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
        if (!solvedTreeFits(candidate)) continue
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

  // Twenty fixed boards, pre-checked with the physical solver. Each nested
  // array is [paint, ...children]; no search runs while the game loads.
  const CHALLENGE_TREES = [
    ["DR:D:C",["DL:C:D",["DL:D:A"],["DR:D:E",["DL:E:A"],["DR:E:B"]]]],
    ["DL:D:B",["DL:B:C",["L:C:A",["L:A:E"]]],["DR:B:F"],["DL:B:F"]],
    ["L:C:A",["DL:A:D",["L:D:E",["DL:E:B"]]],["DR:A:B"],["DL:A:B"]],
    ["DL:B:C",["DR:C:E"],["DL:C:E"],["DR:C:B",["L:B:A",["DR:A:E"]]]],
    ["L:D:A",["DR:A:E",["DL:E:C",["DL:C:A"]],["DR:E:F"],["DL:E:F"]]],
    ["DL:F:D",["DL:D:A",["DL:A:B",["DR:B:C"]],["DR:A:E"],["DL:A:E"]]],
    ["DL:E:A",["L:A:B",["DR:B:D",["DR:D:F"],["DL:D:F"],["DR:D:B"]]]],
    ["DL:F:D",["DL:D:E",["L:E:B",["DR:B:E"],["DL:B:E"],["DR:B:A"]]],["DR:D:A"]],
    ["L:C:D",["DL:D:E",["DR:E:C",["DR:C:A"],["DL:C:A"],["DR:C:F"]]],["DR:D:F"]],
    ["L:C:F",["DL:F:E",["DL:E:C",["DR:C:A"],["DL:C:A"],["DR:C:B"]]],["DR:F:B"]],
    ["L:B:D",["DL:D:C",["DL:C:D",["L:D:A"]],["DR:C:F",["DL:F:E"]]],["DR:D:E"]],
    ["L:C:E",["DL:E:C",["DL:C:D",["DR:D:A"],["DL:D:A"],["DR:D:B"]]],["DR:E:A"]],
    ["L:D:F",["DL:F:B",["DR:B:D",["DL:D:C"],["DR:D:E"],["DL:D:E"]]],["DR:F:E"]],
    ["DL:A:C",["DL:C:A",["L:A:D",["DR:D:F"]]],["DR:C:B",["DR:B:E",["DR:E:F"]]]],
    ["L:E:D",["DL:D:E",["DL:E:D",["L:D:G"]],["DR:E:A",["DL:A:F"],["DR:A:B"]]],["DR:D:F"]],
    ["DR:G:C",["DL:C:E",["DR:E:A",["DL:A:B"]]],["DR:C:D",["DL:D:B"],["DR:D:C",["L:C:B"]]]],
    ["DL:B:F",["DL:F:C",["DL:C:B",["L:B:G"]],["DR:C:A",["DL:A:G"],["DR:A:D"]]],["DR:F:E"]],
    ["DR:C:A",["DL:A:C",["DL:C:B",["DL:B:E"]],["DR:C:F"]],["DR:A:G",["DR:G:D",["DL:D:G"]]]],
    ["DR:G:D",["DL:D:A",["DL:A:G",["DR:G:E"]],["DR:A:E"]],["DR:D:F",["DL:F:C",["L:C:E"]]]],
    ["DR:D:A",["DL:A:D",["DL:D:G",["L:G:B"]],["DR:D:F"]],["DR:A:E",["DR:E:C",["L:C:F"]]]],
  ]
  function challengeTree(spec, ids = { next: 0 }) {
    return {
      name: '', gameId: 'p' + ids.next++, paint: spec[0],
      children: spec.slice(1).map(child => challengeTree(child, ids)),
    }
  }
  CHALLENGE_TREES.forEach((spec, index) => {
    const number = 140 + index
    const tree = challengeTree(spec)
    const nodes = climbNodes(tree, [])
    const anchor = nodes[(number + index) % nodes.length]
    addOpenLevel('challenge-' + number, number + ' · ' + nodes.length + ' Pieces',
      tree, anchor.gameId, { tier: index < 10 ? 11 : 12 })
  })

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

  function trailWindow(progress) {
    const choice = chooseNext(progress, null)
    const current = choice.level || gameLevels[0]
    const group = gameLevels.filter((level) => level.tier === current.tier)
    const index = group.findIndex((level) => level.id === current.id)
    const start = Math.max(0, Math.min(index - 1, group.length - 3))
    return { current, levels: group.slice(start, start + 3), choice }
  }

  function renderGameTrail(progress) {
    const stars = document.getElementById('logyq-trail-stars')
    if (!stars) return
    const { current, levels } = trailWindow(progress)
    const solved = gameLevels.filter((level) => progress[level.id]).length
    const leaves = document.getElementById('logyq-trail-leaves')
    if (leaves) {
      leaves.textContent = '🍃 ' + solved
      leaves.setAttribute('aria-label', solved + ' puzzles solved')
    }
    const caption = document.getElementById('logyq-trail-caption')
    if (caption) caption.textContent = 'Next: Puzzle ' + (gameLevels.indexOf(current) + 1)
    stars.replaceChildren(...levels.map((level, slot) => {
      const number = gameLevels.indexOf(level) + 1
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'logyq-trail-star' + (progress[level.id] ? ' is-cleared' : '') +
        (level.id === current.id ? ' is-current' : '')
      button.dataset.trailLevel = level.id
      button.dataset.slot = String(slot)
      button.setAttribute('aria-label', 'Puzzle ' + number + (progress[level.id] ? ', completed' : ', ready'))
      if (level.id === current.id) button.setAttribute('aria-current', 'step')
      const icon = document.createElement('span')
      icon.className = 'star-icon'
      icon.setAttribute('aria-hidden', 'true')
      icon.textContent = '★'
      const label = document.createElement('span')
      label.className = 'star-number'
      label.setAttribute('aria-hidden', 'true')
      label.textContent = String(number)
      button.append(icon, label)
      return button
    }))
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
    renderGameTrail(progress)
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
      status.title = message
      status.style.color = cleared ? '#166534' : ''
    }
  }

  function solutionOf(level) {
    if (level.solution) return level.solution
    const ids = new Set(level.ids || [])
    const pieces = []
    const take = (node) => {
      if (!node?.gameId || !ids.has(node.gameId)) return
      if (!pieces.some((piece) => piece.gameId === node.gameId)) pieces.push({ gameId: node.gameId, paint: node.paint })
      for (const child of node.children || []) take(child)
    }
    take(level.tree)
    for (const card of Object.values(level.bankCards || {})) {
      if (ids.has(card.gameId) && !pieces.some((piece) => piece.gameId === card.gameId)) {
        pieces.push({ gameId: card.gameId, paint: card.paint })
      }
    }
    return gameGrammar.physicalSolutions(pieces, 1)[0] || null
  }

  let gameDropBefore = null
  function rememberGameDrop() {
    gameDropBefore = JSON.stringify(bridge.snapshot().tree)
  }
  function playGameDrop(snapshot) {
    const before = gameDropBefore
    gameDropBefore = null
    if (before !== null && before !== JSON.stringify(snapshot?.tree)) {
      window.LOGYQGameSound?.drop()
      window.LOGYQGameGuide?.hide()
      app.game.guide = null
    }
  }
  function setupGameSound() {
    const sound = window.LOGYQGameSound
    if (!sound) return
    const buttons = Array.from(document.querySelectorAll('[data-game-sound]'))
    const update = () => buttons.forEach(button => {
      button.disabled = !sound.supported
      button.textContent = sound.supported ? 'Sound: ' + (sound.enabled() ? 'On' : 'Off') : 'Sound unavailable'
      button.setAttribute('aria-pressed', String(sound.enabled()))
    })
    buttons.forEach(button => button.addEventListener('click', () => {
      sound.setEnabled(!sound.enabled())
      if (sound.enabled()) sound.unlock()
      update()
    }))
    update()
  }
  setupGameSound()

  let gameArtTimer = null
  let gameArtEpoch = 0
  let gameArtElement = null

  function clearGameCompletionArt() {
    gameArtEpoch++
    if (gameArtTimer !== null) clearTimeout(gameArtTimer)
    gameArtTimer = null
    if (gameArtElement) {
      d3.select(gameArtElement).selectAll('*').interrupt('completion')
      gameArtElement.remove()
      gameArtElement = null
    }
    document.body.classList.remove('logyq-game-completion')
  }

  function scheduleGameCompletionArt(delay = 700, animate = true) {
    if (!window.LOGYQCompletionArt || !app.game?.cleared) return
    if (gameArtTimer !== null) clearTimeout(gameArtTimer)
    const epoch = ++gameArtEpoch
    gameArtTimer = setTimeout(() => {
      gameArtTimer = null
      if (epoch !== gameArtEpoch || !app.game?.cleared || document.body.classList.contains('logyq-home')) return
      if (gamePointers.size || window.__logyqHoldDragFrozen?.()
          || bridge.core?.elements?.svg?.classed?.('dragging-mode')) {
        scheduleGameCompletionArt(150, animate)
        return
      }
      const width = window.innerWidth, height = window.innerHeight
      const cards = Array.from(document.querySelectorAll('svg#canvas g.node')).map(node => {
        const data = node.__data__?.data
        const rect = node.querySelector('rect:not(.grabzone)')?.getBoundingClientRect()
        return data && rect ? {gameId:data.gameId, paint:data.paint,
          x:rect.left, y:rect.top, width:rect.width, height:rect.height} : null
      }).filter(Boolean)
      const composition = window.LOGYQCompletionArt.build(cards, width, height)
      if (!composition.length) return
      if (gameArtElement) {
        d3.select(gameArtElement).selectAll('*').interrupt('completion')
        gameArtElement.remove()
      }
      const ns = 'http://www.w3.org/2000/svg'
      const svg = document.createElementNS(ns, 'svg')
      svg.id = 'logyq-completion-art'
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
      svg.setAttribute('aria-hidden', 'true')
      svg.dataset.phase = 'expanding'
      const defs = document.createElementNS(ns, 'defs')
      svg.appendChild(defs)
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      const duration = animate && !reduced ? 1400 : 0
      let remaining = composition.length
      for (const [i, card] of composition.entries()) {
        const clip = document.createElementNS(ns, 'clipPath')
        clip.id = `logyq-completion-reveal-${epoch}-${i}`
        clip.setAttribute('clipPathUnits', 'userSpaceOnUse')
        const reveal = document.createElementNS(ns, 'rect')
        for (const [key, value] of Object.entries({x:card.x, y:card.y, width:card.width, height:card.height})) reveal.setAttribute(key, value)
        clip.appendChild(reveal)
        defs.appendChild(clip)
        const group = document.createElementNS(ns, 'g')
        group.setAttribute('data-piece', card.gameId)
        group.setAttribute('clip-path', `url(#${clip.id})`)
        for (const region of card.regions) {
          const path = document.createElementNS(ns, 'path')
          path.setAttribute('d', 'M' + region.polygon.map(point => point.join(',')).join('L') + 'Z')
          path.setAttribute('fill', region.color)
          path.setAttribute('stroke', region.color)
          path.setAttribute('stroke-width', '0.5')
          group.appendChild(path)
        }
        svg.appendChild(group)
        const selection = d3.select(reveal)
        const finish = () => {
          if (epoch === gameArtEpoch && --remaining === 0) svg.dataset.phase = 'complete'
        }
        if (duration) selection.transition('completion').duration(duration).ease(d3.easeCubicInOut)
          .attr('x', 0).attr('y', 0).attr('width', width).attr('height', height).on('end', finish)
        else {
          selection.attr('x', 0).attr('y', 0).attr('width', width).attr('height', height)
          finish()
        }
      }
      document.body.insertBefore(svg, document.getElementById('canvas'))
      gameArtElement = svg
      if (animate) window.LOGYQGameSound?.complete()
      document.body.classList.add('logyq-game-completion')
    }, delay)
  }

  let gameFitTimer = null
  let gameFitPending = false
  const gamePointers = new Set()

  function cancelGameCameraFit() {
    if (gameFitTimer !== null) clearTimeout(gameFitTimer)
    gameFitTimer = null
    bridge.core?.elements?.svg?.interrupt?.('game-fit')
  }

  function levelForGuide() { return gameLevels.find(level => level.id === app.game?.id) }

  function fitGameCamera(duration = 0) {
    const engine = bridge.core
    const root = engine?.state?.root
    if (!app.game || !root || gamePointers.size) return
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity
    root.each(node => {
      left = Math.min(left, node.x - GAME_LAYOUT.cardWidth / 2)
      right = Math.max(right, node.x + GAME_LAYOUT.cardWidth / 2)
      top = Math.min(top, node.y - GAME_LAYOUT.cardHeight / 2)
      bottom = Math.max(bottom, node.y + GAME_LAYOUT.cardHeight / 2)
    })
    if (app.game.guide) {
      const target = window.LOGYQGameGuide?.target(levelForGuide(), root.descendants())
      if (target) {
        left = Math.min(left, target.x - GAME_LAYOUT.cardWidth / 2)
        right = Math.max(right, target.x + GAME_LAYOUT.cardWidth / 2)
        top = Math.min(top, target.y - GAME_LAYOUT.cardHeight / 2)
        bottom = Math.max(bottom, target.y + GAME_LAYOUT.cardHeight / 2)
      }
    }
    engine.treeManager?.fitGameBounds?.({x:left,y:top,width:right-left,height:bottom-top}, {duration})
  }

  function scheduleGameCameraFit(delay = 280) {
    if (!app.game || !bridge.core?.state?.root) return
    gameFitPending = true
    if (gameFitTimer !== null) clearTimeout(gameFitTimer)
    gameFitTimer = null
    if (gamePointers.size) return
    gameFitTimer = setTimeout(() => {
      gameFitTimer = null
      if (!app.game || document.body.classList.contains('logyq-home')) return
      if (gamePointers.size || window.__logyqHoldDragFrozen?.()
          || bridge.core?.elements?.svg?.classed?.('dragging-mode')) {
        scheduleGameCameraFit(100)
        return
      }
      gameFitPending = false
      fitGameCamera(280)
    }, delay)
  }

  function refitGameCamera() {
    scheduleGameCameraFit(80)
    if (gameArtElement) scheduleGameCompletionArt(700, false)
    window.LOGYQGameGuide?.refresh()
  }

  function leaveGamePlay() {
    const session = app.game
    if (!session) return
    clearGameCompletionArt()
    window.LOGYQGameGuide?.hide()
    window.LOGYQGameSound?.stop()
    gameDropBefore = null
    app.game = null
    cancelGameCameraFit()
    gamePointers.clear()
    gameFitPending = false
    document.body.classList.remove('logyq-game')
    delete window.__logyqGameDropAllowed
    delete window.__logyqGameBankNode
    delete window.__logyqGameBankDropAllowed
    delete window.__logyqGameReturnToBank
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
    if (tierEl) {
      tierEl.textContent = 'Tier ' + level.tier
      if (tierEl.classList) tierEl.classList.toggle('is-up', !!levelUp)
    }
    const nameEl = document.getElementById('logyq-game-name')
    if (nameEl) nameEl.textContent = level.title || ''
  }

  function returnGameBranch(tree, bank, bankCards, uid, levelId) {
    if (!tree || !uid) return null
    const nextTree = structuredClone(tree)
    let removed = null
    if (nextTree._uid === uid) removed = nextTree
    else {
      const detach = node => {
        const index = (node.children || []).findIndex(child => child._uid === uid)
        if (index >= 0) {
          removed = node.children.splice(index, 1)[0]
          return true
        }
        return (node.children || []).some(detach)
      }
      detach(nextTree)
    }
    if (!removed) return null
    const nextBank = bank.slice()
    const nextCards = { ...bankCards }
    const restore = node => {
      const key = Object.keys(nextCards).find(word => nextCards[word]?.gameId === node.gameId)
        || `__TREE_CARD__:${levelId}:${node.gameId}`
      nextCards[key] = { name: '', gameId: node.gameId, paint: node.paint, children: [] }
      if (!nextBank.includes(key)) nextBank.push(key)
      ;(node.children || []).forEach(restore)
    }
    restore(removed)
    return { tree: removed === nextTree ? null : nextTree, bank: nextBank, bankCards: nextCards }
  }

  function beginGameLevel(level, opts) {
    if (!level || !gameGrammar) return
    clearGameCompletionArt()
    window.LOGYQGameGuide?.hide()
    window.LOGYQGameSound?.stop()
    gameDropBefore = null
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
    app.game = { id: level.id, origin, cleared: false, wrongDrops: 0, guide:progress[level.id] ? null : level.guide,
      bankCards: { ...level.bankCards } }
    app.current = { id: null, name: level.title }
    app.hasOpenMap = true
    app.lastSnapshot = 'game'
    document.body.classList.add('logyq-game', 'logyq-map-open')
    document.getElementById('logyq-game-next').hidden = true
    showGameTier(level, levelUp)
    // Validate the mapper's resulting contacts, including root promotion.
    window.__logyqGameDropAllowed = ({ tree, movingUid, drop, trash, multi }) => {
      if (!drop || trash || multi) return false
      const allowed = gameGrammar.canDrop(tree, movingUid, drop)
      if (!allowed) gameStatus('Those colors do not match here. Try another position.')
      else rememberGameDrop()
      return allowed
    }
    window.__logyqGameBankNode = (word) => {
      const card = app.game?.bankCards?.[word]
      return card ? paintGameTree(structuredClone(card)) : null
    }
    window.__logyqGameBankDropAllowed = ({ tree, words, drop }) => {
      if (!drop || words.length !== 1) return false
      const card = app.game?.bankCards?.[words[0]]
      const allowed = !!card && (drop.type === 'newRootAt' && !tree
        ? true : gameGrammar.canAdd(tree, card, drop))
      if (!allowed) gameStatus('Those colors do not match here. Try another position.')
      else rememberGameDrop()
      return allowed
    }
    window.__logyqGameReturnToBank = (uid) => {
      const engine = bridge.core
      const session = app.game
      if (!engine?.state || !session || session.id !== level.id) return false
      const result = returnGameBranch(engine.state.root?.data, engine.state.wordBank || [], session.bankCards, uid, level.id)
      if (!result) return false
      session.bankCards = result.bankCards
      engine.state.wordBank = result.bank
      engine.state.root = result.tree ? d3.hierarchy(result.tree) : null
      if (engine.state.root) {
        engine.utils.assignIds(engine.state.root)
        engine.treeManager.layoutAndRender(false)
      } else {
        engine.state.lastNodes = []
        engine.treeManager.renderEmpty()
      }
      engine.wordDock.render()
      gameStatus('Piece back in the bank. Keep arranging!')
      bridge.notifyChange?.()
      return true
    }
    ensureGamePaint()
    updateMapName()
    hideLibrary()
    gameStatus(levelUp ? 'Level up!' : level.hint)
    cancelGameCameraFit()
    gamePointers.clear()
    gameFitPending = false
    bridge.loadMap(paintGameTree(structuredClone(level.tree)), level.bank.slice(), { fit: false })
    fitGameCamera()
    if (app.game.guide) window.LOGYQGameGuide?.show(level, bridge.core)
    setSaveState('saved')
  }

  function presentSolved(level) {
    beginGameLevel(level)
    window.LOGYQGameGuide?.hide()
    app.game.guide = null
    const solution = solutionOf(level)
    const engine = bridge.core
    if (!solution || !engine?.state) return
    engine.state.layoutMotionMs = 0
    bridge.loadMap(paintGameTree(structuredClone(solution)), level.bank.slice(), { fit: false })
    engine.state.layoutMotionMs = null
    fitGameCamera()
  }

  function maybeGameClear(snapshot) {
    const session = app.game
    if (!session) return false
    const level = gameLevels.find((item) => item.id === session.id)
    if (!level || !gameGrammar.complete(snapshot?.tree, level.ids)) {
      if (session.cleared) {
        session.cleared = false
        clearGameCompletionArt()
        document.getElementById('logyq-game-next').hidden = true
        gameStatus('Keep arranging the pieces, then check the contacts.')
      }
      return false
    }
    if (session.cleared) return true
    window.LOGYQGameGuide?.hide()
    session.guide = null
    session.cleared = true
    const progress = writeProgress(recordSolve(gameProgress(), level.id, session.wrongDrops || 0))
    const solvedCount = gameLevels.filter((item) => progress[item.id]).length
    const upcoming = chooseNext(progress, level.id).level
    gameStatus(solvedCount >= gameLevels.length ? 'All ' + gameLevels.length + ' levels cleared.' : 'It fits!', true)
    document.getElementById('logyq-game-next').hidden = !upcoming
    scheduleGameCompletionArt()
    return true
  }

  function checkGame() {
    if (!app.game) return
    if (app.game.cleared) {
      if (!gameArtElement && gameArtTimer === null) scheduleGameCompletionArt()
      return
    }
    if (maybeGameClear(bridge.snapshot())) return
    if (app.game.cleared) return
    noteWrongDrop()
    gameStatus('Not yet. Only the physical color contacts count.')
  }

  let trailOpening = false
  function openTrailLevel(level, opts) {
    if (!level || trailOpening) return
    const trail = document.getElementById('logyq-game-trail')
    const world = document.getElementById('logyq-trail-world')
    const star = Array.from(document.getElementById('logyq-trail-stars')?.children || [])
      .find((element) => element.dataset.trailLevel === level.id)
    if (star && trail && world) {
      const box = trail.getBoundingClientRect()
      const point = star.getBoundingClientRect()
      world.style.transformOrigin = (((point.left + point.width / 2 - box.left) / box.width) * 100) + '% ' +
        (((point.top + point.height / 2 - box.top) / box.height) * 100) + '%'
    }
    trailOpening = true
    trail?.classList.add('is-gliding')
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    setTimeout(() => {
      trailOpening = false
      trail?.classList.remove('is-gliding')
      if (document.getElementById('logiq-library')?.dataset.shelf !== 'game' ||
          !document.body.classList.contains('logyq-home')) return
      beginGameLevel(level, opts)
    }, reduced ? 0 : 760)
  }

  const trailDrawer = document.getElementById('logyq-trail-drawer')
  const allLevels = document.getElementById('logyq-trail-all-levels')
  function setTrailDrawer(open) {
    if (!trailDrawer || !allLevels) return
    trailDrawer.hidden = !open
    allLevels.setAttribute('aria-expanded', String(open))
    if (open) document.getElementById('logyq-trail-close-levels')?.focus()
    else allLevels.focus()
  }
  document.getElementById('logyq-trail-stars')?.addEventListener('click', (event) => {
    const star = event.target.closest('[data-trail-level]')
    const level = gameLevels.find((item) => item.id === star?.dataset.trailLevel)
    if (!level) return
    const choice = trailWindow(gameProgress()).choice
    openTrailLevel(level, { levelUp: choice.leveledUp && choice.level?.id === level.id })
  })
  document.getElementById('logyq-trail-continue')?.addEventListener('click', () => {
    const choice = trailWindow(gameProgress()).choice
    openTrailLevel(choice.level, { levelUp: choice.leveledUp })
  })
  allLevels?.addEventListener('click', () => setTrailDrawer(true))
  document.getElementById('logyq-trail-close-levels')?.addEventListener('click', () => setTrailDrawer(false))

  document.getElementById('logyq-game-path')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-game-level]')
    if (!button) return
    const index = gameLevels.findIndex((level) => level.id === button.dataset.gameLevel)
    if (index < 0) return
    setTrailDrawer(false)
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
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('pointerdown', event => {
      if (!app.game) return
      if (window.LOGYQGameSound?.enabled()) window.LOGYQGameSound.unlock()
      if (event.target?.closest?.('svg#canvas')) clearGameCompletionArt()
      gamePointers.add(event.pointerId)
      gameFitPending = true
      cancelGameCameraFit()
    }, true)
    const release = event => {
      gamePointers.delete(event.pointerId)
      if (!gamePointers.size && gameFitPending) scheduleGameCameraFit()
    }
    window.addEventListener('pointerup', release, true)
    window.addEventListener('pointercancel', release, true)
    window.addEventListener('blur', () => {
      gamePointers.clear()
      if (gameFitPending) scheduleGameCameraFit()
    })
    window.addEventListener('resize', refitGameCamera)
    window.addEventListener('orientationchange', refitGameCamera)
  }
  preview.game = {
    levels: gameLevels, begin: beginGameLevel, check: checkGame, leave: leaveGamePlay, render: renderGamePath,
    recordSolve, chooseNext, trailWindow, presentSolved, layoutBudget: GAME_LAYOUT,
    challengeLayoutBudget: CHALLENGE_LAYOUT, measureSolved: layoutSolvedTree, returnBranch: returnGameBranch,
  }
