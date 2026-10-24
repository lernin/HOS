import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { faceShift, faceZoom, focusBox } from './face'
import { levelOf, levelProgress, levelTier, type Standing } from './level'
import { PLACEMENT_GAMES } from './pair'
import type { BrushImage, Margin } from './types'

const PHOTO_GAP = 8
const INFO_MIN = 84
const CONTROLS_MIN = 196
const SWIPE_THRESHOLD = 56
const SWIPE_TRAVEL = 88

function useImageRatio(src: string | null) {
  const [ratio, setRatio] = useState(9 / 16)
  useEffect(() => {
    if (!src) return
    let gone = false
    const img = new Image()
    img.onload = () => {
      if (!gone && img.naturalWidth > 0 && img.naturalHeight > 0) setRatio(img.naturalWidth / img.naturalHeight)
    }
    img.src = src
    return () => { gone = true }
  }, [src])
  return ratio
}

export type Zoom = { scale: number, x: number, y: number }

export const REST_ZOOM: Zoom = { scale: 1, x: 0.5, y: 0.5 }

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function Matchup({
  left, right, front, portrait, zoom, onZoom, onFlip, onPick, onTrash, srcFor, leftChrome = null, rightChrome = null, notice = null, rankFor = () => null, celebrateId = null,
}: {
  left: BrushImage
  right: BrushImage
  front: 'left' | 'right'
  portrait: boolean
  zoom: Zoom
  onZoom: (zoom: Zoom) => void
  onFlip: () => void
  onPick: (id: string, margin: Margin) => void
  onTrash: (id: string) => void
  srcFor: (image: BrushImage) => string | null
  leftChrome?: ReactNode
  rightChrome?: ReactNode
  notice?: ReactNode
  rankFor?: (id: string) => Standing | null
  celebrateId?: string | null
}) {
  const stageRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const [frame, setFrame] = useState<{ left: number, right: number, scale: number } | null>(null)
  const [faceHeld, setFaceHeld] = useState(false)
  const [faceMotion, setFaceMotion] = useState(false)
  const [facePan, setFacePan] = useState({ x: 0, y: 0, scale: 1 })
  const faceHeldRef = useRef(false)
  const [entering, setEntering] = useState<'left' | 'right' | null>(null)
  const previousIds = useRef<{ left: string, right: string } | null>(null)
  const leftSrc = srcFor(left)
  const rightSrc = srcFor(right)
  const leftRatio = useImageRatio(leftSrc)
  const rightRatio = useImageRatio(rightSrc)
  const zoomRef = useRef(zoom)
  const lockRef = useRef(0)
  const portraitRef = useRef(portrait)
  const actions = useRef({ onZoom, onFlip, onPick })
  zoomRef.current = zoom
  portraitRef.current = portrait
  actions.current = { onZoom, onFlip, onPick }

  useEffect(() => {
    const node = stageRef.current
    if (!node) return
    const stage = node
    let origin: { x: number, y: number } | null = null
    let pinch: { distance: number, scale: number } | null = null
    let moved = false
    let pinching = false
    let suppressUntil = 0

    function box() {
      return stage.getBoundingClientRect()
    }

    function onTouchStart(event: TouchEvent) {
      if (faceHeldRef.current) {
        if (event.cancelable) event.preventDefault()
        return
      }
      if (event.touches.length >= 2) {
        event.preventDefault()
        pinching = true
        const [a, b] = [event.touches[0], event.touches[1]]
        pinch = { distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1, scale: zoomRef.current.scale }
        return
      }
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest('button')) return
      const touch = event.touches[0]
      origin = { x: touch.clientX, y: touch.clientY }
      moved = false
    }

    function onTouchMove(event: TouchEvent) {
      if (faceHeldRef.current) {
        if (event.cancelable) event.preventDefault()
        return
      }
      if (event.touches.length >= 2 && pinch) {
        event.preventDefault()
        pinching = true
        const [a, b] = [event.touches[0], event.touches[1]]
        const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1
        const rect = box()
        actions.current.onZoom({
          scale: clamp(pinch.scale * (distance / pinch.distance), 1, 4),
          x: clamp(((a.clientX + b.clientX) / 2 - rect.left) / rect.width, 0, 1),
          y: clamp(((a.clientY + b.clientY) / 2 - rect.top) / rect.height, 0, 1),
        })
        return
      }
      if (event.touches.length !== 1 || !origin) return
      const touch = event.touches[0]
      const dx = touch.clientX - origin.x
      const dy = touch.clientY - origin.y
      if (Math.hypot(dx, dy) > 12) moved = true
      if (zoomRef.current.scale > 1 && moved) {
        event.preventDefault()
        const rect = box()
        actions.current.onZoom({
          ...zoomRef.current,
          x: clamp(zoomRef.current.x - dx / rect.width / zoomRef.current.scale, 0, 1),
          y: clamp(zoomRef.current.y - dy / rect.height / zoomRef.current.scale, 0, 1),
        })
        origin = { x: touch.clientX, y: touch.clientY }
      }
    }

    function onTouchEnd(event: TouchEvent) {
      if (faceHeldRef.current) return
      if (pinching || pinch) {
        if (event.touches.length < 2) {
          pinching = false
          pinch = null
          origin = null
          suppressUntil = Date.now() + 400
        }
        return
      }
      if (event.touches.length > 0) return
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest('button')) return
      const began = origin
      origin = null
      if (!began || Date.now() < suppressUntil || Date.now() < lockRef.current) return
      const end = event.changedTouches[0]
      const dx = end ? end.clientX - began.x : 0
      const dy = end ? end.clientY - began.y : 0
      if (moved || Math.hypot(dx, dy) > 12) {
        if (portraitRef.current && Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) && zoomRef.current.scale === 1) actions.current.onFlip()
        return
      }
      if (zoomRef.current.scale > 1) return
      if (portraitRef.current) actions.current.onFlip()
    }

    stage.addEventListener('touchstart', onTouchStart, { passive: false })
    stage.addEventListener('touchmove', onTouchMove, { passive: false })
    stage.addEventListener('touchend', onTouchEnd, { passive: false })
    stage.addEventListener('touchcancel', onTouchEnd, { passive: false })
    return () => {
      stage.removeEventListener('touchstart', onTouchStart)
      stage.removeEventListener('touchmove', onTouchMove)
      stage.removeEventListener('touchend', onTouchEnd)
      stage.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [])

  useEffect(() => {
    const pointers = new Map<number, { x: number, y: number }>()
    let holdId: number | null = null
    let origin: { x: number, y: number } | null = null
    let moved = false
    let pinch: { dist: number, scale: number, cx: number, cy: number, x: number, y: number } | null = null
    const pan = { x: 0, y: 0, scale: 1 }
    const block: AddEventListenerOptions = { passive: false, capture: true }
    const publish = () => {
      setFaceMotion(false)
      setFacePan({ x: pan.x, y: pan.y, scale: pan.scale })
    }
    const apply = () => {
      const points = [...pointers.values()]
      if (points.length >= 2) {
        const [a, b] = points
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1
        const cx = (a.x + b.x) / 2
        const cy = (a.y + b.y) / 2
        if (!pinch) pinch = { dist, scale: pan.scale, cx, cy, x: pan.x, y: pan.y }
        pan.scale = clamp(pinch.scale * (dist / pinch.dist), 0.55, 2.6)
        pan.x = pinch.x + (cx - pinch.cx)
        pan.y = pinch.y + (cy - pinch.cy)
        moved = true
        publish()
        return
      }
      pinch = null
      if (holdId === null || !origin) return
      const point = pointers.get(holdId)
      if (!point) return
      if (!moved && Math.hypot(point.x - origin.x, point.y - origin.y) < 8) return
      moved = true
      pan.x += point.x - origin.x
      pan.y += point.y - origin.y
      origin = { x: point.x, y: point.y }
      publish()
    }
    const down = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null
      const onFace = Boolean(target?.closest('[data-action="face"]'))
      if (onFace && holdId === null) {
        if (event.cancelable) event.preventDefault()
        holdId = event.pointerId
        origin = { x: event.clientX, y: event.clientY }
        moved = false
        pinch = null
        pan.x = 0
        pan.y = 0
        pan.scale = 1
        pointers.set(event.pointerId, origin)
        faceHeldRef.current = true
        setFaceHeld(true)
        setFaceMotion(true)
        setFacePan({ x: 0, y: 0, scale: 1 })
        return
      }
      if (holdId === null) return
      if (event.cancelable) event.preventDefault()
      event.stopPropagation()
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      pinch = null
    }
    const move = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId)) return
      if (event.cancelable) event.preventDefault()
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      apply()
    }
    const up = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId)) return
      pointers.delete(event.pointerId)
      pinch = null
      if (event.pointerId !== holdId) {
        const rest = holdId === null ? undefined : pointers.get(holdId)
        if (rest) origin = { x: rest.x, y: rest.y }
        return
      }
      holdId = null
      origin = null
      pointers.clear()
      pan.x = 0
      pan.y = 0
      pan.scale = 1
      faceHeldRef.current = false
      setFaceHeld(false)
      setFaceMotion(true)
      setFacePan({ x: 0, y: 0, scale: 1 })
      actions.current.onZoom(REST_ZOOM)
      window.setTimeout(() => {
        if (!faceHeldRef.current) setFaceMotion(false)
      }, 280)
    }
    window.addEventListener('pointerdown', down, block)
    window.addEventListener('pointermove', move, block)
    window.addEventListener('pointerup', up, block)
    window.addEventListener('pointercancel', up, block)
    return () => {
      window.removeEventListener('pointerdown', down, block)
      window.removeEventListener('pointermove', move, block)
      window.removeEventListener('pointerup', up, block)
      window.removeEventListener('pointercancel', up, block)
      if (holdId !== null) {
        faceHeldRef.current = false
        setFaceHeld(false)
      }
    }
  }, [])

  useLayoutEffect(() => {
    const frameNode = frameRef.current
    if (!frameNode || portrait) return
    const apply = () => {
      const rect = frameNode.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      const naturalLeft = rect.height * leftRatio
      const naturalRight = rect.height * rightRatio
      const natural = naturalLeft + naturalRight
      const budget = rect.width - PHOTO_GAP - INFO_MIN * 2 - CONTROLS_MIN
      const scale = natural > budget ? Math.max(0, budget) / natural : 1
      const next = {
        left: scale < 1 ? Math.floor(naturalLeft * scale) : naturalLeft,
        right: scale < 1 ? Math.floor(naturalRight * scale) : naturalRight,
        scale,
      }
      setFrame(current => current && Math.abs(current.left - next.left) < 0.5 && Math.abs(current.right - next.right) < 0.5 && Math.abs(current.scale - next.scale) < 0.001 ? current : next)
    }
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(frameNode)
    return () => observer.disconnect()
  }, [portrait, leftRatio, rightRatio])

  useLayoutEffect(() => {
    const previous = previousIds.current
    previousIds.current = { left: left.id, right: right.id }
    if (!previous) return
    const leftChanged = previous.left !== left.id
    const rightChanged = previous.right !== right.id
    if (leftChanged === rightChanged) return
    const side = leftChanged ? 'left' : 'right'
    setEntering(side)
    const timer = window.setTimeout(() => setEntering(current => current === side ? null : current), 300)
    return () => window.clearTimeout(timer)
  }, [left.id, right.id])

  function locked(event: React.MouseEvent) {
    if (Date.now() < lockRef.current) {
      event.preventDefault()
      event.stopPropagation()
      return true
    }
    return false
  }

  function onPhotoClick(event: React.MouseEvent<HTMLDivElement>) {
    if (locked(event)) return
    const pointer = event.nativeEvent instanceof PointerEvent ? event.nativeEvent.pointerType : 'mouse'
    if (pointer === 'touch') return
    if (zoomRef.current.scale > 1) return
    if (portrait) onFlip()
  }

  const cards = [
    { image: left, side: 'left' as const },
    { image: right, side: 'right' as const },
  ]
  const frontImage = front === 'left' ? left : right
  const fit = !portrait && frame && frame.scale < 0.999 ? 'cover' : 'contain'

  function photoStyle(image: BrushImage) {
    const focus = faceHeld ? faceShift(faceZoom(focusBox(image.face_box))) : null
    const scale = focus ? focus.scale * facePan.scale : zoom.scale
    const tx = focus ? focus.tx : (zoom.x - 0.5) * (1 - zoom.scale) * 100
    const ty = focus ? focus.ty : (zoom.y - 0.5) * (1 - zoom.scale) * 100
    const px = focus ? facePan.x : 0
    const py = focus ? facePan.y : 0
    return {
      transform: `translate(${px}px, ${py}px) translate(${tx}%, ${ty}%) scale(${scale})`,
      transformOrigin: '50% 50%',
      transition: faceMotion ? 'transform 250ms ease' : undefined,
      objectFit: fit as 'contain' | 'cover',
    }
  }

  function pictureStats(image: BrushImage, layout: 'strip' | 'portrait') {
    const standing = rankFor(image.id)
    const ranked = image.games >= PLACEMENT_GAMES
    const level = levelOf(image.elo)
    const progress = ranked ? levelProgress(image.elo) : Math.min(1, image.games / PLACEMENT_GAMES)
    const closeWins = image.close_wins || 0
    const closeLosses = image.close_losses || 0
    const traits = (image.prompt_text || '').split(/[,·|;]/).map(item => item.trim()).filter(Boolean).slice(0, 3)
    const percent = Math.round(progress * 100)
    return (
      <div className={`brush-stats is-${layout}`} data-stats={layout}>
        <div className="brush-strip-id">
          <strong>{image.country || image.name || 'Untitled'}</strong>
          <small>{image.name}</small>
        </div>
        {ranked ? (
          <div className={`brush-level-badge is-${levelTier(level)}${celebrateId === image.id ? ' is-rising' : ''}`} data-level={level}>
            <span>Level</span>
            <strong className="brush-num">{level}</strong>
          </div>
        ) : (
          <div className={`brush-level-badge is-unranked${celebrateId === image.id ? ' is-rising' : ''}`} data-unranked data-challenger>
            <strong>Unranked</strong>
          </div>
        )}
        <div className="brush-level-track">
          <div className="brush-level-meta">
            <span>{ranked ? 'Next level' : 'Placement'}</span>
            <span className="brush-num">{ranked ? `${percent}%` : `${image.games}/${PLACEMENT_GAMES}`}</span>
          </div>
          <div className="brush-level-bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={ranked ? `Progress to level ${level + 1}` : `Placement ${image.games} of ${PLACEMENT_GAMES}`}>
            <span style={{ width: `${percent}%` }} />
          </div>
        </div>
        <div className="brush-stat-grid">
          <div className="brush-strip-stat" data-stat="rank">
            <span>Rank</span>
            <strong className="brush-num" title={standing ? `#${standing.rank} of ${standing.total} ranked` : 'Unranked'}>{standing ? `#${standing.rank} of ${standing.total}` : '—'}</strong>
          </div>
          <div className="brush-strip-stat" data-stat="record">
            <span>Record</span>
            <strong className="brush-num">{image.wins}–{image.losses}</strong>
            {(closeWins > 0 || closeLosses > 0) && <em className="brush-close-mark">{closeWins}–{closeLosses} close</em>}
          </div>
          <div className="brush-strip-stat" data-stat="rating">
            <span>Rating</span>
            <strong className="brush-num">{Math.round(image.elo)}</strong>
          </div>
        </div>
        {traits.length > 0 && <p className="brush-strip-traits">{traits.join(' · ')}</p>}
      </div>
    )
  }

  function choose(event: React.MouseEvent, id: string, margin: Margin) {
    if (locked(event)) return
    lockRef.current = Date.now() + 450
    onPick(id, margin)
  }

  function discard(event: React.MouseEvent, id: string) {
    if (locked(event)) return
    lockRef.current = Date.now() + 450
    onTrash(id)
  }

  function swipeCommit(kind: 'pick' | 'close' | 'trash', side: 'left' | 'right') {
    if (Date.now() < lockRef.current) return
    lockRef.current = Date.now() + 450
    const image = side === 'left' ? left : right
    if (kind === 'trash') onTrash(image.id)
    else onPick(image.id, kind === 'close' ? 'close' : 'clear')
  }

  return (
    <div className="brush-stage" data-screen="match" ref={frameRef}>
      {!portrait && (
        <aside className="brush-info-strip is-left" data-strip="left">
          <div className="brush-strip-tools">{leftChrome}</div>
          <div className="brush-strip-body">{pictureStats(left, 'strip')}</div>
        </aside>
      )}
      <div className="brush-photos" ref={stageRef}>
        {cards.map(({ image, side }) => {
          const src = side === 'left' ? leftSrc : rightSrc
          const sized = !portrait && frame ? { width: side === 'left' ? frame.left : frame.right, aspectRatio: 'auto' } : undefined
          return (
            <article key={image.id} className={`brush-card${front === side ? ' is-front' : ''}`} data-side={side} data-image={image.id} data-name={image.name} style={sized}>
              <div className="brush-photo-hit" onClick={onPhotoClick}>
                {src ? (
                  <div className={`brush-slide${entering === side ? ' is-entering' : ''}`}>
                    <img className="brush-photo" src={src} alt={image.name} style={photoStyle(image)} draggable={false} />
                  </div>
                ) : <div className="brush-photo" />}
              </div>
              {portrait && <div className="brush-portrait-stats">{pictureStats(image, 'portrait')}</div>}
            </article>
          )
        })}
      </div>
      {!portrait && (
        <aside className="brush-info-strip is-right" data-strip="right">
          <div className="brush-strip-tools">{rightChrome}</div>
          <div className="brush-strip-body">{pictureStats(right, 'strip')}</div>
        </aside>
      )}
      {!portrait && (
        <aside className="brush-controls" data-gutter="controls">
          {notice}
          <div className="brush-gutter-actions">
            <div className="brush-control-row">
              <SwipePad kind="pick" label="WINNER" leftName={left.country || left.name} rightName={right.country || right.name} onCommit={swipeCommit} />
            </div>
            <div className="brush-control-row">
              <SwipePad kind="trash" label="Trash" leftName={left.country || left.name} rightName={right.country || right.name} onCommit={swipeCommit} />
              <SwipePad kind="close" label="Close call" leftName={left.country || left.name} rightName={right.country || right.name} onCommit={swipeCommit} />
            </div>
            <div className="brush-control-row">
              <FaceHoldButton pressed={faceHeld} />
            </div>
          </div>
        </aside>
      )}
      {portrait && (
        <div className="brush-footer">
          <button className="brush-choice" type="button" data-action="pick" onClick={event => choose(event, frontImage.id, 'clear')}>Pick</button>
          <button className="brush-choice close" type="button" data-action="close" onClick={event => choose(event, frontImage.id, 'close')}>Close</button>
          <button className="brush-choice danger" type="button" data-action="trash" onClick={event => discard(event, frontImage.id)}>Trash</button>
        </div>
      )}
    </div>
  )
}

function FaceHoldButton({ pressed }: { pressed: boolean }) {
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const block: AddEventListenerOptions = { passive: false }
    const touchStart = (event: TouchEvent) => {
      if (event.cancelable) event.preventDefault()
      event.stopPropagation()
    }
    const blockMenu = (event: Event) => event.preventDefault()
    node.addEventListener('touchstart', touchStart, block)
    node.addEventListener('contextmenu', blockMenu)
    return () => {
      node.removeEventListener('touchstart', touchStart)
      node.removeEventListener('contextmenu', blockMenu)
    }
  }, [])
  return (
    <button ref={ref} className="brush-face-hold" type="button" data-action="face" data-face="both" aria-pressed={pressed} aria-label="Hold for face">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="9" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.7" /><path d="M6.5 19.2c1.1-2.8 3-4.2 5.5-4.2s4.4 1.4 5.5 4.2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
      <span>Face</span>
    </button>
  )
}

function SwipeHint({ side, shift }: { side: 'left' | 'right', shift: number }) {
  const toward = side === 'left' ? Math.min(0, shift) : Math.max(0, shift)
  return (
    <span
      className={`brush-swipe-hint is-${side}`}
      aria-hidden="true"
      style={{ transform: `translateX(${toward * 5}px)`, opacity: 0.5 + Math.abs(toward) * 0.25 }}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d={side === 'left' ? 'M10.25 3.25 5.5 8l4.75 4.75' : 'M5.75 3.25 10.5 8 5.75 12.75'} fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}

function vibrate(ms: number) {
  navigator.vibrate?.(ms)
}

function SwipePad({
  kind, label, leftName, rightName, onCommit,
}: {
  kind: 'pick' | 'close' | 'trash'
  label: string
  leftName: string
  rightName: string
  onCommit: (kind: 'pick' | 'close' | 'trash', side: 'left' | 'right') => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const api = useRef({ onCommit, kind })
  api.current = { onCommit, kind }
  const [drag, setDrag] = useState<{ dx: number, aim: 'left' | 'right' | null, snapping: boolean }>({ dx: 0, aim: null, snapping: false })
  useEffect(() => {
    const node = ref.current
    if (!node) return
    let pointerId: number | null = null
    let startX = 0
    let lastAim: 'left' | 'right' | null = null
    let timer = 0
    let threshold = SWIPE_THRESHOLD
    let travel = SWIPE_TRAVEL
    const block: AddEventListenerOptions = { passive: false }
    const aimOf = (dx: number) => dx <= -threshold ? 'left' as const : dx >= threshold ? 'right' as const : null
    const show = (dx: number, snapping: boolean) => {
      const clamped = Math.max(-travel, Math.min(travel, dx))
      const aim = aimOf(dx)
      if (aim && aim !== lastAim) vibrate(12)
      if (!aim) lastAim = null
      else lastAim = aim
      setDrag({ dx: clamped, aim, snapping })
    }
    const down = (event: PointerEvent) => {
      if (pointerId !== null) return
      if (event.cancelable) event.preventDefault()
      event.stopPropagation()
      window.clearTimeout(timer)
      pointerId = event.pointerId
      startX = event.clientX
      lastAim = null
      const width = node.getBoundingClientRect().width || 160
      threshold = Math.min(SWIPE_THRESHOLD, Math.max(32, width * 0.32))
      travel = Math.min(SWIPE_TRAVEL, Math.max(threshold + 12, width * 0.4))
      show(0, false)
    }
    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return
      if (event.cancelable) event.preventDefault()
      show(event.clientX - startX, false)
    }
    const up = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return
      pointerId = null
      const dx = event.clientX - startX
      const side = aimOf(dx)
      if (!side) {
        show(0, true)
        timer = window.setTimeout(() => setDrag({ dx: 0, aim: null, snapping: false }), 180)
        return
      }
      show(side === 'left' ? -travel : travel, true)
      vibrate(20)
      timer = window.setTimeout(() => {
        api.current.onCommit(api.current.kind, side)
        setDrag({ dx: 0, aim: null, snapping: false })
      }, 150)
    }
    const touchStart = (event: TouchEvent) => {
      if (event.cancelable) event.preventDefault()
      event.stopPropagation()
    }
    const blockMenu = (event: Event) => event.preventDefault()
    node.addEventListener('pointerdown', down, block)
    node.addEventListener('touchstart', touchStart, block)
    node.addEventListener('contextmenu', blockMenu)
    window.addEventListener('pointermove', move, block)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.clearTimeout(timer)
      node.removeEventListener('pointerdown', down)
      node.removeEventListener('touchstart', touchStart)
      node.removeEventListener('contextmenu', blockMenu)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [])
  const hint = kind === 'pick'
    ? `Swipe left ← WINNER for ${leftName}. Swipe right WINNER → for ${rightName}.`
    : `Swipe left for ${leftName}. Swipe right for ${rightName}.`
  const aimed = drag.aim === 'left' ? leftName : drag.aim === 'right' ? rightName : ''
  const shift = Math.max(-1, Math.min(1, drag.dx / SWIPE_TRAVEL))
  return (
    <div
      ref={ref}
      className={`brush-swipe is-${kind}`}
      data-swipe={kind}
      data-action={kind === 'pick' ? 'pick' : kind === 'close' ? 'close' : 'trash'}
      data-aim={drag.aim || 'none'}
      role="group"
      tabIndex={0}
      aria-label={hint}
      onKeyDown={event => {
        if (event.key === 'ArrowLeft') api.current.onCommit(kind, 'left')
        if (event.key === 'ArrowRight') api.current.onCommit(kind, 'right')
      }}
    >
      <div className="brush-swipe-wash" style={{ width: `${Math.min(100, Math.abs(drag.dx) / SWIPE_TRAVEL * 100)}%` }} />
      <SwipeHint side="left" shift={shift} />
      <SwipeHint side="right" shift={shift} />
      <div className="brush-swipe-face" style={{ transform: `translateX(${drag.dx}px)`, transition: drag.snapping ? 'transform 160ms ease' : undefined }}>
        <strong>{label}</strong>
        {aimed && <em>{aimed}</em>}
      </div>
    </div>
  )
}
