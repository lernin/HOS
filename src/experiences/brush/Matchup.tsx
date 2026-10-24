import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { faceShift, faceZoom, focusBox } from './face'
import { PLACEMENT_GAMES } from './pair'
import type { BrushImage, Margin } from './types'

const PHOTO_GAP = 8
const LEFT_RAIL = 44
const RIGHT_MIN = 168
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
  left, right, front, portrait, zoom, onZoom, onFlip, onPick, onTrash, srcFor, leftChrome = null, rightChrome = null, notice = null,
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
}) {
  const stageRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const [infoId, setInfoId] = useState<string | null>(null)
  const [frame, setFrame] = useState<{ left: number, right: number, scale: number } | null>(null)
  const [faceHeld, setFaceHeld] = useState(false)
  const [faceMotion, setFaceMotion] = useState(false)
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

  useLayoutEffect(() => {
    const frameNode = frameRef.current
    if (!frameNode || portrait) return
    const apply = () => {
      const rect = frameNode.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      const naturalLeft = rect.height * leftRatio
      const naturalRight = rect.height * rightRatio
      const natural = naturalLeft + naturalRight
      const budget = rect.width - PHOTO_GAP - LEFT_RAIL - RIGHT_MIN
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

  function holdFace() {
    faceHeldRef.current = true
    setFaceHeld(true)
    setFaceMotion(true)
  }

  function releaseFace() {
    faceHeldRef.current = false
    setFaceHeld(false)
    setFaceMotion(true)
    onZoom(REST_ZOOM)
    window.setTimeout(() => {
      if (!faceHeldRef.current) setFaceMotion(false)
    }, 280)
  }

  const cards = [
    { image: left, side: 'left' as const },
    { image: right, side: 'right' as const },
  ]
  const frontImage = front === 'left' ? left : right
  const fit = !portrait && frame && frame.scale < 0.999 ? 'cover' : 'contain'

  function photoStyle(image: BrushImage) {
    const focus = faceHeld ? faceShift(faceZoom(focusBox(image.face_box))) : null
    const scale = focus ? focus.scale : zoom.scale
    const tx = focus ? focus.tx : (zoom.x - 0.5) * (1 - zoom.scale) * 100
    const ty = focus ? focus.ty : (zoom.y - 0.5) * (1 - zoom.scale) * 100
    return {
      transform: `translate(${tx}%, ${ty}%) scale(${scale})`,
      transformOrigin: '50% 50%',
      transition: faceMotion ? 'transform 250ms ease' : undefined,
      objectFit: fit as 'contain' | 'cover',
    }
  }

  function toggleInfo(id: string) {
    setInfoId(current => current === id ? null : id)
  }

  function captionFor(image: BrushImage) {
    const open = infoId === image.id
    return (
      <div className="brush-caption">
        <strong>{image.country || 'Untitled'}</strong>
        {image.games < PLACEMENT_GAMES && <em className="brush-challenger" data-challenger>New</em>}
        {open && <small data-caption-detail>{image.name} · {Math.round(image.elo)} · {image.games} played</small>}
        <button className="brush-info" type="button" data-action="info" aria-expanded={open} aria-label={open ? 'Hide filename and rating' : 'Show filename and rating'} onClick={() => toggleInfo(image.id)}>i</button>
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

  function pairName(image: BrushImage, side: 'left' | 'right') {
    const open = infoId === image.id
    const label = open ? image.name : (image.country || 'Untitled')
    return (
      <div className={`brush-pair-name is-${side}`} data-name-side={side}>
        <strong>{label}</strong>
        {image.games < PLACEMENT_GAMES && <em className="brush-challenger" data-challenger>NEW</em>}
        <button className="brush-info" type="button" data-action="info" aria-expanded={open} aria-label={open ? 'Hide filename and rating' : 'Show filename and rating'} title={open ? `${Math.round(image.elo)} · ${image.games} played` : image.name} onClick={() => toggleInfo(image.id)}>i</button>
      </div>
    )
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
        <aside className="brush-gutter is-left" data-gutter="left">
          <div className="brush-gutter-top">{leftChrome}</div>
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
              {portrait && captionFor(image)}
            </article>
          )
        })}
      </div>
      {!portrait && (
        <aside className="brush-gutter is-right" data-gutter="right">
          <div className="brush-gutter-top">{rightChrome}</div>
          {notice}
          <div className="brush-pair-names">
            {pairName(left, 'left')}
            {pairName(right, 'right')}
          </div>
          <div className="brush-gutter-actions">
            <SwipePad kind="pick" label="WINNER" leftName={left.country || left.name} rightName={right.country || right.name} onCommit={swipeCommit} />
            <SwipePad kind="close" label="Close call" leftName={left.country || left.name} rightName={right.country || right.name} onCommit={swipeCommit} />
            <SwipePad kind="trash" label="Trash" leftName={left.country || left.name} rightName={right.country || right.name} onCommit={swipeCommit} />
            <FaceHoldButton pressed={faceHeld} onHold={holdFace} onRelease={releaseFace} />
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

function FaceHoldButton({
  pressed, onHold, onRelease,
}: {
  pressed: boolean
  onHold: () => void
  onRelease: () => void
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const api = useRef({ onHold, onRelease })
  api.current = { onHold, onRelease }
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const pointers = new Set<number>()
    const block: AddEventListenerOptions = { passive: false }
    const begin = (pointerId: number) => {
      const empty = pointers.size === 0
      pointers.add(pointerId)
      if (empty) api.current.onHold()
    }
    const end = (pointerId: number) => {
      if (!pointers.delete(pointerId)) return
      if (pointers.size === 0) api.current.onRelease()
    }
    const start = (event: PointerEvent) => {
      if (event.cancelable) event.preventDefault()
      event.stopPropagation()
      begin(event.pointerId)
    }
    const stop = (event: PointerEvent) => {
      end(event.pointerId)
    }
    const touchStart = (event: TouchEvent) => {
      if (event.cancelable) event.preventDefault()
      event.stopPropagation()
    }
    const touchEnd = (event: TouchEvent) => {
      if (event.cancelable && event.currentTarget === node) event.preventDefault()
    }
    const blockMenu = (event: Event) => {
      event.preventDefault()
    }
    node.addEventListener('pointerdown', start, block)
    node.addEventListener('touchstart', touchStart, block)
    node.addEventListener('pointerup', stop)
    node.addEventListener('pointercancel', stop)
    node.addEventListener('touchend', touchEnd, block)
    node.addEventListener('touchcancel', touchEnd, block)
    node.addEventListener('contextmenu', blockMenu)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    return () => {
      node.removeEventListener('pointerdown', start)
      node.removeEventListener('touchstart', touchStart)
      node.removeEventListener('pointerup', stop)
      node.removeEventListener('pointercancel', stop)
      node.removeEventListener('touchend', touchEnd)
      node.removeEventListener('touchcancel', touchEnd)
      node.removeEventListener('contextmenu', blockMenu)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
      if (pointers.size) api.current.onRelease()
    }
  }, [])
  return (
    <button ref={ref} className="brush-face-hold" type="button" data-action="face" data-face="both" aria-pressed={pressed} aria-label="Hold for face">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="9" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.7" /><path d="M6.5 19.2c1.1-2.8 3-4.2 5.5-4.2s4.4 1.4 5.5 4.2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
    </button>
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
    const block: AddEventListenerOptions = { passive: false }
    const aimOf = (dx: number) => dx <= -SWIPE_THRESHOLD ? 'left' as const : dx >= SWIPE_THRESHOLD ? 'right' as const : null
    const show = (dx: number, snapping: boolean) => {
      const clamped = Math.max(-SWIPE_TRAVEL, Math.min(SWIPE_TRAVEL, dx))
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
      show(side === 'left' ? -SWIPE_TRAVEL : SWIPE_TRAVEL, true)
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
      <span className="brush-swipe-hint is-left" aria-hidden="true">←</span>
      <span className="brush-swipe-hint is-right" aria-hidden="true">→</span>
      <div className="brush-swipe-face" style={{ transform: `translateX(${drag.dx}px)`, transition: drag.snapping ? 'transform 160ms ease' : undefined }}>
        <strong>{label}</strong>
        {aimed && <em>{aimed}</em>}
      </div>
    </div>
  )
}
