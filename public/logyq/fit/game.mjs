import { makeLevel, canPlace, place, detach, isSolved } from './rules.mjs'

const $ = (id) => document.getElementById(id)
const palette = { orange: '#ef9243', blue: '#4b91e5', mint: '#55c5a5', violet: '#ad78d5' }
const storageKey = 'logyq_fit_progress_v1'
let saved
try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}') } catch { saved = {} }
const cleared = new Set(Array.isArray(saved.cleared) ? saved.cleared.filter((i) => Number.isInteger(i) && i >= 0 && i < 100) : [])
const unlocked = () => Math.min(99, Math.max(-1, ...cleared) + 1)
let number = Math.min(Math.max(Number(new URLSearchParams(location.search).get('level')) - 1 || 0, 0), unlocked())
let level = makeLevel(number)
let placed = { 0: true }
let selected = null
let hint = null
let quietClick = false

function persist() {
  try { localStorage.setItem(storageKey, JSON.stringify({ cleared: [...cleared] })) } catch { /* play continues without storage */ }
}

function pattern(key) {
  if (!key) return '#e6edf5'
  const [cut, list] = key.split(':')
  const colors = list.split(',').map((name) => palette[name])
  if (colors.length === 1) return colors[0]
  if (cut === 'diagonal') return `linear-gradient(135deg,${colors[0]} 49%,#f8fcff 49%,#f8fcff 51%,${colors[1]} 51%)`
  const stops = colors.flatMap((color, i) => [`${color} ${i * 100 / colors.length}%`, `${color} ${(i + 1) * 100 / colors.length}%`])
  return `linear-gradient(90deg,${stops.join(',')})`
}

function bottomPattern(piece) {
  if (!piece.outputs.length) return '#e6edf5'
  if (piece.outputs.length === 1) return pattern(piece.outputs[0])
  return `linear-gradient(90deg,${piece.outputs.flatMap((key, i) => {
    const color = palette[key.split(':')[1].split(',')[0]]
    return [`${color} ${i * 100 / piece.outputs.length}%`, `${color} ${(i + 1) * 100 / piece.outputs.length}%`]
  }).join(',')})`
}

function card(piece, root = false) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = `tile ${root ? 'root' : ''} ${piece.outputs.length ? '' : 'leaf'} ${selected === piece.id ? 'selected' : ''} ${hint?.piece === piece.id ? 'is-hint' : ''}`
  button.dataset.piece = String(piece.id)
  button.setAttribute('aria-label', root ? 'Fixed root tile' : placed[piece.id] ? 'Placed tile. Tap to return this branch to the tray.' : 'Loose tile. Tap or drag to a matching space.')
  button.innerHTML = `<span class="top-pattern"></span><span class="bottom-pattern"></span><span class="seam"></span><span class="glyph"></span>`
  button.querySelector('.top-pattern').style.background = pattern(piece.incoming)
  button.querySelector('.bottom-pattern').style.background = bottomPattern(piece)
  if (root) button.disabled = true
  return button
}

function branch(piece) {
  const node = document.createElement('div')
  node.className = 'tree'
  node.append(card(piece, piece.id === 0))
  if (piece.outputs.length) {
    const row = document.createElement('div')
    row.className = 'children'
    piece.outputs.forEach((key, slot) => {
      const cell = document.createElement('div')
      cell.className = 'child'
      const socket = document.createElement('button')
      socket.type = 'button'
      socket.className = 'socket'
      socket.dataset.parent = String(piece.id)
      socket.dataset.slot = String(slot)
      socket.setAttribute('aria-label', `Matching space ${slot + 1} below this tile`)
      const flag = document.createElement('span')
      flag.className = 'flag'
      flag.style.display = 'block'
      flag.style.background = pattern(key)
      socket.append(flag)
      const occupant = level.pieces.find((candidate) => placed[candidate.id] && candidate.parent === piece.id && candidate.incoming === key)
      if (selected !== null && canPlace(level, placed, selected, piece.id, slot)) socket.classList.add('is-match')
      if (hint?.parent === piece.id && hint.slot === slot) socket.classList.add('is-hint')
      cell.append(socket)
      if (occupant) {
        const child = branch(occupant)
        child.classList.add('placed')
        cell.append(child)
      }
      row.append(cell)
    })
    node.append(row)
  }
  return node
}

function render(recenter = false) {
  const viewport = $('board').parentElement
  const left = viewport.scrollLeft
  const top = viewport.scrollTop
  $('level-heading').textContent = `Level ${number + 1} · ${level.title}`
  $('progress-fill').style.width = `${(cleared.size / 100) * 100}%`
  $('board').replaceChildren(branch(level.pieces[0]))
  $('tray').replaceChildren(...level.pieces.filter((piece) => !placed[piece.id]).map((piece) => card(piece)))
  const remaining = level.pieces.filter((piece) => !placed[piece.id]).length
  $('tile-count').textContent = `${remaining} left`
  if (!remaining) $('tray').innerHTML = '<span class="tray-empty">All tiles found a home.</span>'
  viewport.scrollLeft = recenter ? Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2) : left
  viewport.scrollTop = recenter ? 0 : top
}

function feedback(message) { $('feedback').textContent = message }

function fit(pieceId, parentId, slot) {
  if (!canPlace(level, placed, pieceId, parentId, slot)) {
    feedback('Those patterns do not match. Try another space.')
    return false
  }
  placed = place(level, placed, pieceId, parentId, slot)
  selected = null
  hint = null
  render()
  if (isSolved(level, placed)) {
    cleared.add(number)
    persist()
    $('progress-fill').style.width = `${(cleared.size / 100) * 100}%`
    feedback('Every tile found its home!')
    $('next-button').textContent = number === 99 ? 'Choose a level' : 'Next level'
    $('win-dialog').showModal()
  } else feedback('Nice fit. Find the next matching space.')
  return true
}

function openLevel(index) {
  if (index < 0 || index > unlocked()) return
  number = index
  level = makeLevel(index)
  placed = { 0: true }
  selected = null
  hint = null
  history.replaceState(null, '', `?level=${index + 1}`)
  render(true)
  feedback('Tap a loose tile, then its matching space. Or drag it there.')
}

function showLevels() {
  const grid = $('level-grid')
  grid.replaceChildren(...Array.from({ length: 100 }, (_, i) => {
    const button = document.createElement('button')
    button.textContent = String(i + 1)
    button.type = 'button'
    button.disabled = i > unlocked()
    button.className = `${i === number ? 'current' : ''} ${cleared.has(i) ? 'cleared' : ''}`
    button.setAttribute('aria-label', `Level ${i + 1}${button.disabled ? ', locked' : cleared.has(i) ? ', complete' : ''}`)
    button.onclick = () => { $('level-picker').close(); openLevel(i) }
    return button
  }))
  $('level-picker').showModal()
}

$('tray').addEventListener('click', (event) => {
  const tile = event.target.closest('[data-piece]')
  if (!tile) return
  if (quietClick) { quietClick = false; return }
  selected = Number(tile.dataset.piece)
  hint = null
  render()
  feedback('Now tap a space with exactly the same pattern.')
})
$('board').addEventListener('click', (event) => {
  const socket = event.target.closest('[data-parent]')
  if (socket) {
    if (selected === null) feedback('Choose a loose tile first, then this space.')
    else fit(selected, Number(socket.dataset.parent), Number(socket.dataset.slot))
    return
  }
  const tile = event.target.closest('[data-piece]')
  if (tile && Number(tile.dataset.piece) !== 0) {
    placed = detach(level, placed, Number(tile.dataset.piece))
    selected = null
    hint = null
    render()
    feedback('That branch is back in the tray. You can fit it again.')
  }
})

let drag = null
$('tray').addEventListener('pointerdown', (event) => {
  const tile = event.target.closest('[data-piece]')
  if (!tile) return
  drag = { id: Number(tile.dataset.piece), x: event.clientX, y: event.clientY, ghost: null }
})
window.addEventListener('pointermove', (event) => {
  if (!drag) return
  if (!drag.ghost && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 9) {
    drag.ghost = card(level.pieces[drag.id])
    drag.ghost.classList.add('ghost')
    document.body.append(drag.ghost)
  }
  if (drag.ghost) {
    event.preventDefault()
    drag.ghost.style.left = `${event.clientX - 56}px`
    drag.ghost.style.top = `${event.clientY - 37}px`
  }
}, { passive: false })
window.addEventListener('pointerup', (event) => {
  if (!drag) return
  if (drag.ghost) {
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-parent]')
    drag.ghost.remove()
    quietClick = true
    setTimeout(() => { quietClick = false }, 100)
    if (target) fit(drag.id, Number(target.dataset.parent), Number(target.dataset.slot))
    else feedback('Drop a tile on a matching space, or tap tile then space.')
  }
  drag = null
})
window.addEventListener('pointercancel', () => { drag?.ghost?.remove(); drag = null })

$('hint-button').onclick = () => {
  for (const parent of level.pieces) {
    if (!placed[parent.id]) continue
    for (let slot = 0; slot < parent.outputs.length; slot++) {
      const piece = level.pieces.find((candidate) => canPlace(level, placed, candidate.id, parent.id, slot))
      if (!piece) continue
      hint = { parent: parent.id, slot, piece: piece.id }
      selected = null
      render()
      feedback('The glowing tile fits the glowing space.')
      return
    }
  }
}
$('reset-button').onclick = () => openLevel(number)
$('levels-button').onclick = showLevels
$('close-levels').onclick = () => $('level-picker').close()
$('next-button').onclick = () => {
  $('win-dialog').close()
  if (number < 99) openLevel(number + 1)
  else showLevels()
}
$('replay-button').onclick = () => { $('win-dialog').close(); openLevel(number) }
openLevel(number)
