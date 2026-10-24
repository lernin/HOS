import { useEffect, useRef } from 'react'
import type { BrushImage, Margin } from './types'

export type Zoom = { scale: number, x: number, y: number }

export const REST_ZOOM: Zoom = { scale: 1, x: 0.5, y: 0.5 }

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function Matchup({
  left, right, front, portrait, zoom, onZoom, onFlip, onPick, onTrash, srcFor,
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
}) {
  const stageRef = useRef<HTMLDivElement>(null)
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
      if (portraitRef.current) {
        actions.current.onFlip()
        return
      }
      const card = target?.closest('[data-image]')
      const id = card?.getAttribute('data-image')
      if (!id) return
      lockRef.current = Date.now() + 450
      actions.current.onPick(id, 'clear')
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

  function locked(event: React.MouseEvent) {
    if (Date.now() < lockRef.current) {
      event.preventDefault()
      event.stopPropagation()
      return true
    }
    return false
  }

  function onPhotoClick(event: React.MouseEvent<HTMLDivElement>, id: string) {
    if (locked(event)) return
    const pointer = event.nativeEvent instanceof PointerEvent ? event.nativeEvent.pointerType : 'mouse'
    if (pointer === 'touch') return
    if (zoomRef.current.scale > 1) return
    if (portrait) onFlip()
    else {
      lockRef.current = Date.now() + 450
      onPick(id, 'clear')
    }
  }

  const cards = [
    { image: left, side: 'left' as const },
    { image: right, side: 'right' as const },
  ]
  const zoomStyle = { transform: `scale(${zoom.scale})`, transformOrigin: `${zoom.x * 100}% ${zoom.y * 100}%` }

  return (
    <div className="brush-stage" data-screen="match" ref={stageRef}>
      {cards.map(({ image, side }) => {
        const src = srcFor(image)
        const showPick = portrait && front === side
        return (
          <article key={image.id} className={`brush-card${front === side ? ' is-front' : ''}`} data-side={side} data-image={image.id} data-name={image.name}>
            <div className="brush-photo-hit" onClick={event => onPhotoClick(event, image.id)}>
              {src ? <img className="brush-photo" src={src} alt={image.name} style={zoomStyle} draggable={false} /> : <div className="brush-photo" />}
            </div>
            <div className="brush-card-meta">
              <strong>{image.country || 'Untitled'}</strong>
              <small>{image.name}<br />{Math.round(image.elo)} · {image.games} played</small>
            </div>
            <div className="brush-card-actions">
              {showPick && <button className="brush-choice" type="button" data-action="pick" onClick={event => { if (!locked(event)) { lockRef.current = Date.now() + 450; onPick(image.id, 'clear') } }}>Pick</button>}
              {(showPick || !portrait) && <button className="brush-choice close" type="button" data-action="close" onClick={event => { if (!locked(event)) { lockRef.current = Date.now() + 450; onPick(image.id, 'close') } }}>Close</button>}
              {(showPick || !portrait) && <button className="brush-choice danger" type="button" data-action="trash" onClick={event => { if (!locked(event)) { lockRef.current = Date.now() + 450; onTrash(image.id) } }}>Trash</button>}
            </div>
          </article>
        )
      })}
      {portrait && <button className="brush-text-button" type="button" data-action="flip" style={{ position: 'absolute', top: 58, right: 10, zIndex: 4 }} onClick={onFlip}>Flip</button>}
      {zoom.scale > 1 && <button className="brush-text-button" type="button" data-action="fit" style={{ position: 'absolute', top: 58, left: 10, zIndex: 4 }} onClick={() => onZoom(REST_ZOOM)}>Fit</button>}
    </div>
  )
}
