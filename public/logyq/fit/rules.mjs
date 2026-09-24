// The visible connector is the entire placement rule. IDs identify tiles for
// the UI; they are never compared with a target position during placement.
const COLORS = ['orange', 'blue', 'mint', 'violet']

function colorOrder(index) {
  const available = [...COLORS]
  let rank = (index * 7) % 24
  return [6, 2, 1, 1].map((factor) => available.splice(Math.floor(rank / factor) % available.length, 1)[0])
}

function random(seed) {
  let value = seed >>> 0
  return () => {
    value ^= value << 13
    value ^= value >>> 17
    value ^= value << 5
    return (value >>> 0) / 4294967296
  }
}

function connector(number, width, diagonal, palette) {
  let value = number
  const colors = Array(width).fill(palette[0])
  for (let i = width - 1; i >= 0; i--) {
    colors[i] = palette[value % palette.length]
    value = Math.floor(value / COLORS.length)
  }
  return `${diagonal ? 'diagonal' : 'bands'}:${colors.join(',')}`
}

export function makeLevel(index) {
  if (!Number.isInteger(index) || index < 0 || index >= 100) throw new RangeError('Level must be 0–99')
  const chapter = Math.floor(index / 10)
  const step = index % 10
  const count = Math.min(14, 3 + chapter + Math.floor(step / 3))
  const dice = random((index + 1) * 7919)
  const palette = colorOrder(index)
  const pieces = Array.from({ length: count }, (_, id) => ({ id, parent: null, incoming: null, outputs: [] }))
  const width = count - 1 <= 4 ? 1 : count - 1 <= 16 ? 2 : 3

  for (let id = 1; id < count; id++) {
    let parent
    if (chapter < 2) parent = id - 1
    else if (chapter === 2) parent = id === 2 ? 0 : id - 1
    else {
      const capacity = chapter < 5 ? 2 : 3
      const possible = pieces.slice(0, id).filter((piece) => piece.outputs.length < capacity)
      const favored = chapter === 8 ? possible.slice(0, Math.max(1, Math.ceil(possible.length / 2))) : possible
      parent = favored[Math.floor(dice() * favored.length)].id
    }
    const diagonal = chapter >= 4 && id % 3 === 0
    const key = connector(id - 1, width, diagonal, palette)
    pieces[id].parent = parent
    pieces[id].incoming = key
    pieces[parent].outputs.push(key)
  }
  return {
    index,
    chapter,
    title: ['First fit', 'Longer paths', 'First branches', 'Branch out', 'Diagonal cuts',
      'Deep connections', 'Three children', 'Many paths', 'Wide trees', 'Master builds'][chapter],
    pieces,
  }
}

export function canPlace(level, placed, pieceId, parentId, slot) {
  const piece = level.pieces[pieceId]
  const parent = level.pieces[parentId]
  if (!piece || !parent || pieceId === 0 || placed[pieceId] || !placed[parentId]) return false
  const needed = parent.outputs[slot]
  if (!needed || piece.incoming !== needed) return false
  return !level.pieces.some((other) => placed[other.id] && other.parent === parentId && other.incoming === needed)
}

export function place(level, placed, pieceId, parentId, slot) {
  return canPlace(level, placed, pieceId, parentId, slot) ? { ...placed, [pieceId]: true } : placed
}

export function detach(level, placed, pieceId) {
  if (pieceId === 0 || !placed[pieceId]) return placed
  const next = { ...placed }
  function remove(id) {
    delete next[id]
    for (const child of level.pieces) if (child.parent === id) remove(child.id)
  }
  remove(pieceId)
  return next
}

export function isSolved(level, placed) {
  return level.pieces.every((piece) => placed[piece.id])
}
