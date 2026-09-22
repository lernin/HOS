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
    const untitled = (value) => !value || value === DEFAULT_NAME.toLowerCase() || ['new', 'new card', 'untitled', 'untitled map', '…', '...'].includes(value)
    return untitled(rootName) && untitled(title)
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

  preview.maps = {
    SUPABASE_URL,
    MAP_FORMAT_VERSION,
    clonePreserving,
    encodeMapTree,
    decodeMapTree,
    encodeMapRecord,
    isBlankDraft,
    formatUpdatedAt,
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

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;')
  }

