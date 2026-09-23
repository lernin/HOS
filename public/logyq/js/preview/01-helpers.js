  const SUPABASE_URL = 'https://jzaghifuhinkzzhiojre.supabase.co'
  const SUPABASE_KEY = 'sb_publishable_rQDzA5bYlbzvaTjyo-uTXw_LiiIAddI'
  const MAP_FORMAT_VERSION = 2

  function clonePreserving(value) {
    if (value == null) return value
    try { return JSON.parse(JSON.stringify(value)) } catch (_error) { return value }
  }

  function encodeMapTree(tree) {
    const next = clonePreserving(tree) || { name: '' }
    if (next && typeof next === 'object' && !Array.isArray(next)) next.formatVersion = MAP_FORMAT_VERSION
    return next
  }

  function decodeMapTree(tree) {
    return clonePreserving(tree) || { name: '' }
  }

  function encodeMapRecord({ name, tree, wordBank } = {}) {
    return {
      name: String(name || DEFAULT_NAME).trim() || DEFAULT_NAME,
      tree: encodeMapTree(tree),
      word_bank: Array.isArray(wordBank) ? wordBank.slice() : [],
    }
  }

  function isBlankDraft({ id, name, tree, wordBank } = {}) {
    if (id) return false
    const rootName = String(tree?.name ?? '').trim().toLowerCase()
    const title = String(name ?? '').trim().toLowerCase()
    const children = Array.isArray(tree?.children) ? tree.children : []
    const bank = Array.isArray(wordBank) ? wordBank : []
    if (children.length || bank.length) return false
    if (tree?.color) return false
    const untitled = (value) => !value || value === DEFAULT_NAME.toLowerCase() || ['new', 'new card', 'untitled', 'untitled map', '…', '...'].includes(value) || /^untitled \d+$/.test(value)
    return untitled(rootName) && untitled(title)
  }

  function nextUntitledName(names) {
    const used = new Set()
    for (const name of names || []) {
      const value = String(name || '').trim().toLowerCase()
      if (value) used.add(value)
    }
    let n = 1
    while (used.has(`untitled ${n}`)) n += 1
    return `Untitled ${n}`
  }

  function formatUpdatedAt(iso) {
    const stamp = iso ? new Date(iso).getTime() : NaN
    if (!Number.isFinite(stamp)) return ''
    const delta = Date.now() - stamp
    if (delta < 45_000) return 'Just now'
    if (delta < 3_600_000) return `${Math.max(1, Math.round(delta / 60_000))}m ago`
    if (delta < 86_400_000) return `${Math.max(1, Math.round(delta / 3_600_000))}h ago`
    return new Date(stamp).toLocaleDateString()
  }

  function revisionMillis(iso) {
    const stamp = iso ? Date.parse(iso) : NaN
    return Number.isFinite(stamp) ? stamp : 0
  }

  function findUid(node, uid) {
    if (!node || uid == null || uid === '') return null
    if (String(node._uid) === String(uid)) return node
    for (const child of node.children || []) {
      const found = findUid(child, uid)
      if (found) return found
    }
    return null
  }

  function sameJson(a, b) {
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
  }

  function childUids(node) {
    return (Array.isArray(node?.children) ? node.children : []).map((child) => (child?._uid == null ? '' : String(child._uid)))
  }

  function pickField(base, local, remote, localWins) {
    const localChanged = !sameJson(local ?? null, base ?? null)
    const remoteChanged = !sameJson(remote ?? null, base ?? null)
    if (localChanged && remoteChanged) return localWins ? local : remote
    if (localChanged) return local
    if (remoteChanged) return remote
    return remote !== undefined ? remote : local
  }

  function mergeNode(acked, local, remote, localWinsUids) {
    if (!remote && !local) return null
    if (!remote) return clonePreserving(local)
    if (!local) return clonePreserving(remote)
    const base = acked || {}
    const uid = remote._uid ?? local._uid
    const localWins = !!(uid != null && localWinsUids && localWinsUids.has(String(uid)))
    const localStruct = !sameJson(childUids(local), childUids(acked))
    const remoteStruct = !sameJson(childUids(remote), childUids(acked))
    const shape = localStruct && !remoteStruct ? local : remote
    const merged = clonePreserving(shape) || {}
    merged.name = pickField(base.name ?? '', local.name ?? '', remote.name ?? '', localWins) ?? ''
    const color = pickField(base.color ?? null, local.color ?? null, remote.color ?? null, false)
    if (color) merged.color = color
    else delete merged.color
    for (const key of ['label', 'text', 'title', 'value']) {
      const picked = pickField(base[key] ?? null, local[key] ?? null, remote[key] ?? null, false)
      if (picked) merged[key] = picked
      else delete merged[key]
    }
    const kids = Array.isArray(shape.children) ? shape.children : []
    const nextKids = kids.map((child) => {
      const id = child?._uid
      if (id == null || id === '') return clonePreserving(child)
      return mergeNode(findUid(acked, id), findUid(local, id), findUid(remote, id), localWinsUids) || clonePreserving(child)
    }).filter(Boolean)
    if (nextKids.length) merged.children = nextKids
    else delete merged.children
    return merged
  }

  function mergeMapTrees({ acked, local, remote, localWinsUids } = {}) {
    const wins = localWinsUids instanceof Set ? localWinsUids : new Set((localWinsUids || []).map((uid) => String(uid)))
    return mergeNode(acked || null, local || null, remote || null, wins)
  }

  function mergeWordBank(acked, local, remote) {
    const base = Array.isArray(acked) ? acked : []
    const nextLocal = Array.isArray(local) ? local : []
    const nextRemote = Array.isArray(remote) ? remote : []
    if (!sameJson(nextLocal, base) && sameJson(nextRemote, base)) return nextLocal.slice()
    return nextRemote.slice()
  }

  // Row authority is logiq_maps.updated_at. Nodes have no timestamps.
  // ignore: remote is not newer, or we have no server baseline and the trees differ (let a real local save proceed).
  // ack: same tree, learn the server stamp.
  // apply: remote is newer and this tab has not edited since the last ack.
  // hold: a rename field is open — do not overwrite it.
  // merge: both sides changed and the user is not mid-edit.
  function planRemoteSync({
    localAckAt,
    remoteUpdatedAt,
    localContent,
    ackedContent,
    remoteContent,
    editing,
  } = {}) {
    if (!remoteUpdatedAt) return { action: 'ignore' }
    const remoteMs = revisionMillis(remoteUpdatedAt)
    const ackMs = revisionMillis(localAckAt)
    if (!localAckAt) {
      return remoteContent === localContent ? { action: 'ack' } : { action: 'ignore' }
    }
    if (remoteMs <= ackMs) return { action: 'ignore' }
    if (remoteContent === localContent) return { action: 'ack' }
    if (editing) return { action: 'hold' }
    if (localContent === ackedContent) return { action: 'apply' }
    return { action: 'merge' }
  }

  const REMOTE_POLL_MS = 2000

  preview.maps = {
    SUPABASE_URL,
    MAP_FORMAT_VERSION,
    REMOTE_POLL_MS,
    clonePreserving,
    encodeMapTree,
    decodeMapTree,
    encodeMapRecord,
    isBlankDraft,
    nextUntitledName,
    formatUpdatedAt,
    revisionMillis,
    planRemoteSync,
    mergeMapTrees,
    mergeWordBank,
  }

  function readJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null')
      return value ?? fallback
    } catch (_error) {
      return fallback
    }
  }

  function stableSnapshot(snapshot) {
    return JSON.stringify({
      tree: snapshot?.tree || null,
      word_bank: Array.isArray(snapshot?.wordBank) ? snapshot.wordBank : [],
    })
  }

  function contentKey(tree, wordBank) {
    const encoded = encodeMapRecord({ name: DEFAULT_NAME, tree, wordBank })
    return stableSnapshot({ tree: encoded.tree, wordBank: encoded.word_bank })
  }

  preview.maps.contentKey = contentKey

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;')
  }

