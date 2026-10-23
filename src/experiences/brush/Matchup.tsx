import { useRef } from 'react'
import type { BrushImage } from './types'

export type Zoom = { scale: number, x: number, y: number }

export const REST_ZOOM: Zoom = { scale: 1, x: 0.5, y: 0.5 }

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function Matchup({
  left, right, front, portrait, zoom, onZoom, onFlip, onChoose, onTrash, onTrashBoth, srcFor,
}: {
  left: BrushImage
  right: BrushImage
  front: 'left' | 'right'
  portrait: boolean
  zoom: Zoom
  onZoom: (zoom: Zoom) => void
  onFlip: () => void
  onChoose: (id: string) => void
  onTrash: (id: string) => void
  onTrashBoth: () => void
  srcFor: (image: BrushImage) => string | null
}) {
  const pointers = useRef(new Map<number, { x: number, y: number }>())
  const pinch = useRef<{ distance: number, scale: number } | null>(null)
  const start = useRef<{ x: number, y: number } | null>(null)
  const tap = useRef<{ at: number, x: number, y: number } | null>(null)
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom

  function origin(event: React.PointerEvent, box: DOMRect) {
    return {
      x: clamp((event.clientX - box.left) / box.width, 0, 1),
      y: clamp((event.clientY - box.top) / box.height, 0, 1),
    }
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size === 1) start.current = { x: event.clientX, y: event.clientY }
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, scale: zoomRef.current.scale }
    }
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()]
      const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1
      const box = event.currentTarget.getBoundingClientRect()
      onZoom({
        scale: clamp(pinch.current.scale * (distance / pinch.current.distance), 1, 4),
        x: clamp(((a.x + b.x) / 2 - box.left) / box.width, 0, 1),
        y: clamp(((a.y + b.y) / 2 - box.top) / box.height, 0, 1),
      })
      return
    }
    if (zoomRef.current.scale > 1 && start.current && pointers.current.size === 1) {
      const box = event.currentTarget.getBoundingClientRect()
      const dx = event.clientX - start.current.x
      const dy = event.clientY - start.current.y
      start.current = { x: event.clientX, y: event.clientY }
      onZoom({
        ...zoomRef.current,
        x: clamp(zoomRef.current.x - dx / box.width / zoomRef.current.scale, 0, 1),
        y: clamp(zoomRef.current.y - dy / box.height / zoomRef.current.scale, 0, 1),
      })
    }
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const began = start.current
    pointers.current.delete(event.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    if (pointers.current.size === 0 && began && zoomRef.current.scale === 1) {
      const dx = event.clientX - began.x
      const dy = event.clientY - began.y
      if (portrait && Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy)) onFlip()
      else if (Math.abs(dx) < 12 && Math.abs(dy) < 12) {
        const now = Date.now()
        const point = origin(event, event.currentTarget.getBoundingClientRect())
        if (tap.current && now - tap.current.at < 280) {
          tap.current = null
          onZoom(zoomRef.current.scale > 1 ? REST_ZOOM : { scale: 2.5, x: point.x, y: point.y })
        } else {
          const pending = { at: now, x: point.x, y: point.y }
          tap.current = pending
          window.setTimeout(() => {
            if (tap.current !== pending) return
            tap.current = null
            if (portrait) onFlip()
          }, 280)
        }
      }
    }
    if (pointers.current.size === 0) start.current = null
  }

  const cards = [
    { image: left, side: 'left' as const },
    { image: right, side: 'right' as const },
  ]
  const zoomStyle = { transform: `scale(${zoom.scale})`, transformOrigin: `${zoom.x * 100}% ${zoom.y * 100}%` }

  return (
    <div className="brush-stage" data-screen="match">
      {cards.map(({ image, side }) => {
        const src = srcFor(image)
        return (
          <article key={image.id} className={`brush-card${front === side ? ' is-front' : ''}`} data-side={side}>
            <div className="brush-photo-hit" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
              {src ? <img className="brush-photo" src={src} alt={image.name} style={zoomStyle} draggable={false} /> : <div className="brush-photo" />}
            </div>
            <div className="brush-card-meta">
              <strong>{image.country || 'Untitled'}</strong>
              <small>{image.name}<br />{Math.round(image.elo)} · {image.games} played</small>
            </div>
            <div className="brush-card-actions">
              <button className="brush-choice" type="button" onClick={() => onChoose(image.id)}>Choose</button>
              <button className="brush-choice danger" type="button" onClick={() => onTrash(image.id)}>Trash</button>
            </div>
          </article>
        )
      })}
      {portrait && <button className="brush-text-button" type="button" data-action="flip" style={{ position: 'absolute', top: 58, right: 10, zIndex: 4 }} onClick={onFlip}>Flip</button>}
      <button className="brush-text-button" type="button" style={{ position: 'absolute', bottom: 78, left: '50%', transform: 'translateX(-50%)', zIndex: 4 }} onClick={onTrashBoth}>Trash both</button>
    </div>
  )
}
