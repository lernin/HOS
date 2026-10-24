import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { faceZoom, focusBox } from './face'
import { PLACEMENT_GAMES } from './pair'
import type { BrushImage, Margin } from './types'

const PHOTO_GAP = 8
const MIN_GUTTER = 88

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
  left, right, front, portrait, zoom, onZoom, onFlip, onPick, onTrash, srcFor, leftChrome = null, rightChrome = null,
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
}) {
  const stageRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const [infoId, setInfoId] = useState<string | null>(null)
  const [frame, setFrame] = useState<{ left: number, right: number, scale: number } | null>(null)
  const [faceHold, setFaceHold] = useState<'left' | 'right' | null>(null)
  const [releasing, setReleasing] = useState<'left' | 'right' | null>(null)
  const [entering, setEntering] = useState<'left' | 'right' | null>(null)
  const faceHoldRef = useRef<'left' | 'right' | null>(null)
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
      const budget = rect.width - PHOTO_GAP - MIN_GUTTER * 2
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

  function holdFace(side: 'left' | 'right') {
    faceHoldRef.current = side
    setReleasing(null)
    setFaceHold(side)
  }

  function releaseFace(side: 'left' | 'right') {
    if (faceHoldRef.current !== side) return
    faceHoldRef.current = null
    setFaceHold(null)
    setReleasing(side)
    window.setTimeout(() => setReleasing(current => current === side ? null : current), 320)
  }

  const cards = [
    { image: left, side: 'left' as const },
    { image: right, side: 'right' as const },
  ]
  const frontImage = front === 'left' ? left : right
  const fit = !portrait && frame && frame.scale < 0.999 ? 'cover' : 'contain'

  function photoStyle(image: BrushImage, side: 'left' | 'right') {
    const focus = faceHold === side ? faceZoom(focusBox(image.face_box)) : null
    const view = focus || zoom
    const animate = Boolean(focus) || releasing === side
    return {
      transform: `scale(${view.scale})`,
      transformOrigin: `${view.x * 100}% ${view.y * 100}%`,
      transition: animate ? 'transform 300ms ease' : undefined,
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

  function gutter(image: BrushImage, side: 'left' | 'right') {
    return (
      <aside className={`brush-gutter is-${side}`} data-gutter={side}>
        <div className="brush-gutter-top">{side === 'left' ? leftChrome : rightChrome}</div>
        <div className="brush-gutter-stack">
          {captionFor(image)}
          <button className="brush-pick-arrow" type="button" data-action="pick" onClick={event => choose(event, image.id, 'clear')}>{side === 'left' ? 'WINNER →' : '← WINNER'}</button>
          <button className="brush-choice close" type="button" data-action="close" onClick={event => choose(event, image.id, 'close')}>Close call</button>
          <button className="brush-choice danger" type="button" data-action="trash" onClick={event => discard(event, image.id)}>Trash</button>
        </div>
        <FaceHoldButton side={side} pressed={faceHold === side} onHold={holdFace} onRelease={releaseFace} />
      </aside>
    )
  }

  return (
    <div className="brush-stage" data-screen="match" ref={frameRef}>
      {!portrait && gutter(left, 'left')}
      <div className="brush-photos" ref={stageRef}>
        {cards.map(({ image, side }) => {
          const src = side === 'left' ? leftSrc : rightSrc
          const sized = !portrait && frame ? { width: side === 'left' ? frame.left : frame.right, aspectRatio: 'auto' } : undefined
          return (
            <article key={image.id} className={`brush-card${front === side ? ' is-front' : ''}`} data-side={side} data-image={image.id} data-name={image.name} style={sized}>
              <div className="brush-photo-hit" onClick={onPhotoClick}>
                {src ? (
                  <div className={`brush-slide${entering === side ? ' is-entering' : ''}`}>
                    <img className="brush-photo" src={src} alt={image.name} style={photoStyle(image, side)} draggable={false} />
                  </div>
                ) : <div className="brush-photo" />}
              </div>
              {portrait && captionFor(image)}
            </article>
          )
        })}
      </div>
      {!portrait && gutter(right, 'right')}
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
  side, pressed, onHold, onRelease,
}: {
  side: 'left' | 'right'
  pressed: boolean
  onHold: (side: 'left' | 'right') => void
  onRelease: (side: 'left' | 'right') => void
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const api = useRef({ side, onHold, onRelease })
  api.current = { side, onHold, onRelease }
  useEffect(() => {
    const node = ref.current
    if (!node) return
    let active = false
    const block: AddEventListenerOptions = { passive: false }
    const stop = (event: Event) => {
      if (event.cancelable && event.currentTarget === node) event.preventDefault()
      if (!active) return
      active = false
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
      window.removeEventListener('touchend', stop)
      window.removeEventListener('touchcancel', stop)
      api.current.onRelease(api.current.side)
    }
    const start = (event: Event) => {
      if (event.cancelable) event.preventDefault()
      if (active) return
      active = true
      api.current.onHold(api.current.side)
      window.addEventListener('pointerup', stop)
      window.addEventListener('pointercancel', stop)
      window.addEventListener('touchend', stop, block)
      window.addEventListener('touchcancel', stop, block)
    }
    const blockMenu = (event: Event) => {
      event.preventDefault()
    }
    node.addEventListener('pointerdown', start, block)
    node.addEventListener('touchstart', start, block)
    node.addEventListener('contextmenu', blockMenu)
    return () => {
      node.removeEventListener('pointerdown', start)
      node.removeEventListener('touchstart', start)
      node.removeEventListener('contextmenu', blockMenu)
      if (active) stop(new Event('pointercancel'))
    }
  }, [])
  return (
    <button ref={ref} className="brush-face-hold" type="button" data-action="face" aria-pressed={pressed}>Hold for face</button>
  )
}
