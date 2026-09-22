// Timer — one rounded-rect stroke. Isolated from Smite.
//
// Direction: the path itself winds counter-clockwise from 12. The first
// command leaves noon toward the left, and every corner uses SVG sweep-flag
// 0 (negative / counter-clockwise). There is no scaleX(-1) and no negative
// dashoffset.
//
// One lap: `timerDash` builds a single pattern whose dash + gap equals
// `pathLength` exactly. Progress is clamped to 0..1. Nothing repeats it.
//
// Tap cycle: idle → red → amber → idle. Each arm paints a full ring, holds
// it for 3s, then drains that same ring for 12s. A retarget starts the hold
// over. There is no CSS duration.

export const TIMER_HOLD_MS = 3000
export const TIMER_DRAIN_MS = 12000
export const TIMER_MS = TIMER_DRAIN_MS
export const TIMER_RED = '#ff0000'
export const TIMER_AMBER = '#ffa100'

const SVG = 'http://www.w3.org/2000/svg'

function num(value) {
  const n = Number(value) || 0
  return Math.round(n * 1000) / 1000
}

function clamp01(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

// Open path: noon → left → bottom → right → noon. Not closed with Z, so the
// measured length is exactly one orbit and the closepath cannot add a second.
export function timerPath(x, y, width, height, rx = 22, ry = 22) {
  const w = Math.max(0, Number(width) || 0)
  const h = Math.max(0, Number(height) || 0)
  if (w <= 0 || h <= 0) return ''
  const left = Number(x) || 0
  const top = Number(y) || 0
  const right = left + w
  const bottom = top + h
  const noon = left + w / 2
  const capX = Math.min(Math.max(0, Number(rx) || 0), w / 2)
  const capY = Math.min(Math.max(0, Number(ry) || 0), h / 2)
  if (capX <= 0 || capY <= 0) {
    return `M ${num(noon)} ${num(top)} H ${num(left)} V ${num(bottom)} H ${num(right)} V ${num(top)} H ${num(noon)}`
  }
  return [
    `M ${num(noon)} ${num(top)}`,
    `H ${num(left + capX)}`,
    `A ${num(capX)} ${num(capY)} 0 0 0 ${num(left)} ${num(top + capY)}`,
    `V ${num(bottom - capY)}`,
    `A ${num(capX)} ${num(capY)} 0 0 0 ${num(left + capX)} ${num(bottom)}`,
    `H ${num(right - capX)}`,
    `A ${num(capX)} ${num(capY)} 0 0 0 ${num(right)} ${num(bottom - capY)}`,
    `V ${num(top + capY)}`,
    `A ${num(capX)} ${num(capY)} 0 0 0 ${num(right - capX)} ${num(top)}`,
    `H ${num(noon)}`,
  ].join(' ')
}

// Remaining fraction `progress` (1 = full, 0 = empty).
// The gap consumes the counter-clockwise prefix; the dash is the suffix
// that still ends at 12. Offset is the remaining length, so the pattern
// begins on the gap. Dash + gap = pathLength, so the pattern cannot tile
// a second time along the same path.
export function timerDash(progress, pathLength) {
  const total = Math.max(0, Number(pathLength) || 0)
  const p = clamp01(progress)
  if (total <= 0 || p <= 0) return { array: '0 1', offset: 0 }
  if (p >= 1) return { array: String(total), offset: 0 }
  const visible = total * p
  const eaten = total - visible
  return { array: `${visible} ${eaten}`, offset: visible }
}

// 1 while the hold is still running, then the drain still left / 12s.
// At 0 the stroke is empty and the arm is finished.
export function timerProgress(elapsedMs, holdMs = TIMER_HOLD_MS, drainMs = TIMER_DRAIN_MS) {
  const elapsed = Math.max(0, Number(elapsedMs) || 0)
  const hold = Number(holdMs) > 0 ? Number(holdMs) : TIMER_HOLD_MS
  const drain = Number(drainMs) > 0 ? Number(drainMs) : TIMER_DRAIN_MS
  if (elapsed <= hold) return 1
  const into = elapsed - hold
  if (into >= drain) return 0
  return 1 - into / drain
}

// idle arms red, red retargets to amber, amber shuts off.
export function timerNextFate(fate) {
  if (fate === 'red') return 'amber'
  if (fate === 'amber') return 'idle'
  return 'red'
}

export function timerColor(fate) {
  return fate === 'amber' ? TIMER_AMBER : TIMER_RED
}

// True when distance `d` along the path is inside the one visible dash.
export function timerStrokeOn(distance, progress, pathLength) {
  const total = Math.max(0, Number(pathLength) || 0)
  const p = clamp01(progress)
  if (total <= 0 || p <= 0) return false
  const d = Number(distance)
  if (!Number.isFinite(d) || d < 0 || d >= total) return false
  if (p >= 1) return true
  const dash = timerDash(p, total)
  const parts = dash.array.trim().split(/[\s,]+/).map(Number)
  const pattern = parts.length === 1 ? [parts[0], parts[0]] : parts
  const span = pattern.reduce((sum, n) => sum + n, 0)
  if (span <= 0) return false
  let pos = (d + dash.offset) % span
  if (pos < 0) pos += span
  let cursor = 0
  for (let i = 0; i < pattern.length; i++) {
    const next = cursor + pattern[i]
    if (pos < next) return i % 2 === 0
    cursor = next
  }
  return false
}

export function mountTimer(svg, options = {}) {
  const box = options.box || { x: 18, y: 18, w: 244, h: 148, rx: 28 }
  const holdMs = options.holdMs || TIMER_HOLD_MS
  const drainMs = options.drainMs || TIMER_DRAIN_MS
  const path = document.createElementNS(SVG, 'path')
  path.id = 'timer-stroke'
  path.setAttribute('d', timerPath(box.x, box.y, box.w, box.h, box.rx, box.rx))
  path.setAttribute('fill', '#163024')
  path.setAttribute('stroke', 'none')
  path.setAttribute('stroke-width', '8')
  path.setAttribute('stroke-linecap', 'butt')
  path.setAttribute('stroke-linejoin', 'round')
  path.style.animation = 'none'
  path.style.transition = 'none'
  path.style.filter = 'none'
  path.style.stroke = 'none'
  svg.appendChild(path)

  // One length, measured once. The pathLength attribute is set to that same
  // number so dash units and path units are one space. It is never animated.
  const length = path.getTotalLength()
  path.setAttribute('pathLength', String(length))

  let fate = 'idle'
  let progress = 0
  let token = 0
  let raf = 0
  svg.dataset.fate = 'idle'

  function paint(nextProgress, nextFate) {
    const color = timerColor(nextFate)
    const dash = timerDash(nextProgress, length)
    path.setAttribute('stroke', color)
    path.style.stroke = color
    path.style.animation = 'none'
    path.style.transition = 'none'
    // Dash stays on the SVG attributes, in this one path length.
    // A CSS pixel length would finish the stroke before the 12s drain.
    path.setAttribute('stroke-dasharray', dash.array)
    path.setAttribute('stroke-dashoffset', String(dash.offset))
    path.style.removeProperty('stroke-dasharray')
    path.style.removeProperty('stroke-dashoffset')
  }

  function clear() {
    token += 1
    fate = 'idle'
    progress = 0
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    path.setAttribute('stroke', 'none')
    path.style.stroke = 'none'
    path.setAttribute('stroke-dasharray', 'none')
    path.setAttribute('stroke-dashoffset', '0')
    path.style.removeProperty('stroke-dasharray')
    path.style.removeProperty('stroke-dashoffset')
    svg.classList.remove('is-running')
    svg.dataset.fate = 'idle'
  }

  function arm(next) {
    token += 1
    const mine = token
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    fate = next
    progress = 1
    svg.classList.add('is-running')
    svg.dataset.fate = next
    paint(1, next)
    const t0 = performance.now()
    const step = (now) => {
      if (mine !== token) return
      const nextProgress = timerProgress(now - t0, holdMs, drainMs)
      progress = nextProgress
      if (nextProgress <= 0) {
        clear()
        return
      }
      paint(nextProgress, next)
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
  }

  function tap() {
    const next = timerNextFate(fate)
    if (next === 'idle') clear()
    else arm(next)
  }

  function start() {
    if (fate !== 'idle') return
    arm('red')
  }

  svg.addEventListener('pointerdown', (event) => {
    event.preventDefault()
    tap()
  })

  return {
    start,
    tap,
    clear,
    arm,
    path,
    length,
    paint,
    get fate() { return fate },
    get progress() { return progress },
  }
}
