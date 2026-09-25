  // FOLDER_PURE_START
  function cloneFolderIndex(index) {
    return {
      folders: (index?.folders || []).map((folder) => ({
        id: folder.id,
        name: folder.name,
        parentId: folder.parentId || null,
      })),
      placements: { ...(index?.placements || {}) },
    }
  }

  function parentChainLoops(folders, folderId, parentId) {
    const byId = new Map((folders || []).map((folder) => [folder.id, folder]))
    let cursor = parentId || null
    const seen = new Set()
    while (cursor) {
      if (cursor === folderId || seen.has(cursor)) return true
      seen.add(cursor)
      cursor = byId.get(cursor)?.parentId || null
    }
    return false
  }

  function normalizeFolderIndex(raw) {
    const folders = []
    const seen = new Set()
    for (const row of Array.isArray(raw?.folders) ? raw.folders : []) {
      const id = String(row?.id || '').trim()
      if (!id || seen.has(id)) continue
      seen.add(id)
      const name = String(row?.name || '').trim().slice(0, 80) || 'Folder'
      const parentId = row?.parentId ? String(row.parentId) : null
      folders.push({ id, name, parentId })
    }
    const ids = new Set(folders.map((folder) => folder.id))
    for (const folder of folders) {
      if (!folder.parentId || !ids.has(folder.parentId)) folder.parentId = null
    }
    for (const folder of folders) {
      if (parentChainLoops(folders, folder.id, folder.parentId)) folder.parentId = null
    }
    const placements = {}
    const source = raw?.placements && typeof raw.placements === 'object' ? raw.placements : {}
    for (const [mapId, folderId] of Object.entries(source)) {
      const id = String(mapId || '').trim()
      const parent = String(folderId || '').trim()
      if (!id || !ids.has(parent)) continue
      placements[id] = parent
    }
    return { folders, placements }
  }

  function newFolderId() {
    if (globalThis.crypto?.randomUUID) return crypto.randomUUID()
    return `folder-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }

  function nextFolderName(folders, parentId) {
    const used = new Set(
      (folders || [])
        .filter((folder) => (folder.parentId || null) === (parentId || null))
        .map((folder) => String(folder.name || '').trim().toLowerCase()),
    )
    const base = 'New folder'
    if (!used.has(base.toLowerCase())) return base
    let n = 2
    while (used.has(`${base} ${n}`.toLowerCase())) n += 1
    return `${base} ${n}`
  }

  function createFolder(index, { name, parentId, id } = {}) {
    const next = cloneFolderIndex(normalizeFolderIndex(index))
    const parent = parentId && next.folders.some((folder) => folder.id === parentId) ? parentId : null
    const trimmed = String(name || '').trim().slice(0, 80) || nextFolderName(next.folders, parent)
    const folderId = String(id || newFolderId())
    if (next.folders.some((folder) => folder.id === folderId)) return { index: next, ok: false, folder: null }
    const folder = { id: folderId, name: trimmed, parentId: parent }
    next.folders.push(folder)
    return { index: next, ok: true, folder }
  }

  function renameFolder(index, id, name) {
    const next = cloneFolderIndex(normalizeFolderIndex(index))
    const folder = next.folders.find((item) => item.id === id)
    const trimmed = String(name || '').trim().slice(0, 80)
    if (!folder || !trimmed) return { index: next, ok: false }
    folder.name = trimmed
    return { index: next, ok: true }
  }

  // blank: 'cancel' drops an empty folder name. blank: 'fallback' is a map file name.
  function libraryRenameDecision(current, typed, options = {}) {
    const max = Number.isFinite(options.max) ? options.max : 80
    const name = String(typed ?? '').trim().slice(0, max)
    const previous = String(current ?? '')
    if (!name) {
      if (options.blank === 'fallback') {
        const fallback = String(options.fallback ?? '')
        if (!fallback || fallback === previous) return { action: 'keep' }
        return { action: 'save', name: fallback }
      }
      return { action: 'cancel' }
    }
    if (name === previous) return { action: 'keep' }
    return { action: 'save', name }
  }

  function moveFolder(index, id, parentId) {
    const next = cloneFolderIndex(normalizeFolderIndex(index))
    const folder = next.folders.find((item) => item.id === id)
    if (!folder) return { index: next, ok: false }
    const target = parentId || null
    if (target === (folder.parentId || null)) return { index: next, ok: true }
    if (target && !next.folders.some((item) => item.id === target)) return { index: next, ok: false }
    if (parentChainLoops(next.folders, id, target)) return { index: next, ok: false }
    folder.parentId = target
    return { index: next, ok: true }
  }

  function deleteFolder(index, id) {
    const next = cloneFolderIndex(normalizeFolderIndex(index))
    const folder = next.folders.find((item) => item.id === id)
    if (!folder) return { index: next, removed: false, lifted: false }
    const parentId = folder.parentId || null
    let lifted = false
    for (const child of next.folders) {
      if (child.parentId === id) {
        child.parentId = parentId
        lifted = true
      }
    }
    for (const mapId of Object.keys(next.placements)) {
      if (next.placements[mapId] === id) {
        if (parentId) next.placements[mapId] = parentId
        else delete next.placements[mapId]
        lifted = true
      }
    }
    next.folders = next.folders.filter((item) => item.id !== id)
    return { index: next, removed: true, lifted }
  }

  function placeMap(index, mapId, folderId) {
    const next = cloneFolderIndex(normalizeFolderIndex(index))
    const id = String(mapId || '').trim()
    if (!id) return next
    if (!folderId || !next.folders.some((folder) => folder.id === folderId)) {
      delete next.placements[id]
      return next
    }
    next.placements[id] = folderId
    return next
  }

  function libraryView(index, rows, folderId) {
    const clean = normalizeFolderIndex(index)
    const open = folderId && clean.folders.some((folder) => folder.id === folderId) ? folderId : null
    const folders = clean.folders
      .filter((folder) => (folder.parentId || null) === open)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
    const maps = (Array.isArray(rows) ? rows : []).filter((row) => {
      const placed = clean.placements[row?.id] || null
      return placed === open
    })
    return { folderId: open, folders, maps }
  }

  function folderCrumbs(index, folderId) {
    const clean = normalizeFolderIndex(index)
    const crumbs = []
    let cursor = folderId || null
    const seen = new Set()
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor)
      const folder = clean.folders.find((item) => item.id === cursor)
      if (!folder) break
      crumbs.unshift({ id: folder.id, name: folder.name })
      cursor = folder.parentId || null
    }
    return crumbs
  }

  function moveTargets(index, { kind, id } = {}) {
    const clean = normalizeFolderIndex(index)
    const blocked = new Set()
    if (kind === 'folder' && id) {
      const stack = [id]
      while (stack.length) {
        const current = stack.pop()
        if (!current || blocked.has(current)) continue
        blocked.add(current)
        for (const folder of clean.folders) {
          if (folder.parentId === current) stack.push(folder.id)
        }
      }
    }
    const targets = [{ id: null, label: 'My maps' }]
    const walk = (parentId, prefix) => {
      const children = clean.folders
        .filter((folder) => (folder.parentId || null) === (parentId || null) && !blocked.has(folder.id))
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
      for (const folder of children) {
        const label = prefix ? `${prefix} / ${folder.name}` : folder.name
        targets.push({ id: folder.id, label })
        walk(folder.id, label)
      }
    }
    walk(null, '')
    return targets
  }

  function moveChoices(index, { kind, id, currentParentId } = {}) {
    const current = currentParentId || null
    return moveTargets(index, { kind, id }).filter((target) => (target.id || null) !== current)
  }

  function directCount(index, rows, folderId) {
    const clean = normalizeFolderIndex(index)
    if (!folderId || !clean.folders.some((folder) => folder.id === folderId)) return 0
    const folders = clean.folders.filter((folder) => folder.parentId === folderId).length
    const maps = (Array.isArray(rows) ? rows : []).filter((row) => clean.placements[row?.id] === folderId).length
    return folders + maps
  }

  function insideLabel(count) {
    const n = Number(count) || 0
    if (n === 1) return '1 inside'
    if (n > 1) return `${n} inside`
    return 'Empty'
  }

  function prunePlacements(index, rows) {
    const next = cloneFolderIndex(normalizeFolderIndex(index))
    const ids = new Set((Array.isArray(rows) ? rows : []).map((row) => row?.id).filter(Boolean))
    for (const mapId of Object.keys(next.placements)) {
      if (!ids.has(mapId)) delete next.placements[mapId]
    }
    return next
  }
  // FOLDER_PURE_END

  const FOLDERS_KEY = 'logyq_map_folders_v1'

  function readFolderIndex() {
    return normalizeFolderIndex(readJson(FOLDERS_KEY, null))
  }

  function writeFolderIndex(index) {
    const clean = normalizeFolderIndex(index)
    try { localStorage.setItem(FOLDERS_KEY, JSON.stringify(clean)) } catch (_error) {}
    return clean
  }

  preview.folders = {
    key: FOLDERS_KEY,
    normalizeFolderIndex,
    createFolder,
    renameFolder,
    libraryRenameDecision,
    moveFolder,
    deleteFolder,
    placeMap,
    libraryView,
    folderCrumbs,
    moveChoices,
    directCount,
    insideLabel,
    prunePlacements,
    read: readFolderIndex,
    write: writeFolderIndex,
  }

  bootSession()
})()
