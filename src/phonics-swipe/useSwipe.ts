import { useCallback, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'

export type SwipeDirection = 'up' | 'down' | 'left' | 'right'

type SwipeOptions = {
  disabled?: boolean
  threshold?: number
  onCommit: (direction: SwipeDirection) => void
  onTap?: () => void
  shouldThrow?: (direction: SwipeDirection) => boolean
}

type DragState = {
  x: number
  y: number
  dragging: boolean
  throwing: boolean
}

const directionFromDelta = (x: number, y: number): SwipeDirection => {
  if (Math.abs(x) > Math.abs(y)) return x >= 0 ? 'right' : 'left'
  return y >= 0 ? 'down' : 'up'
}

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export const useSwipe = ({
  disabled = false,
  threshold = 44,
  onCommit,
  onTap,
  shouldThrow = () => true,
}: SwipeOptions) => {
  const origin = useRef<{ x: number; y: number; pointerId: number } | null>(null)
  const locked = useRef(false)
  const [drag, setDrag] = useState<DragState>({ x: 0, y: 0, dragging: false, throwing: false })

  const reset = useCallback(() => {
    origin.current = null
    locked.current = false
    setDrag({ x: 0, y: 0, dragging: false, throwing: false })
  }, [])

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (disabled || locked.current) return
    origin.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId }
    event.currentTarget.setPointerCapture(event.pointerId)
    setDrag({ x: 0, y: 0, dragging: true, throwing: false })
  }, [disabled])

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (!origin.current || origin.current.pointerId !== event.pointerId || locked.current) return
    setDrag({
      x: event.clientX - origin.current.x,
      y: event.clientY - origin.current.y,
      dragging: true,
      throwing: false,
    })
  }, [])

  const finish = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (!origin.current || origin.current.pointerId !== event.pointerId || locked.current) return

    const x = event.clientX - origin.current.x
    const y = event.clientY - origin.current.y
    const distance = Math.hypot(x, y)

    if (distance < threshold) {
      origin.current = null
      setDrag({ x: 0, y: 0, dragging: false, throwing: false })
      onTap?.()
      return
    }

    const direction = directionFromDelta(x, y)
    locked.current = true
    origin.current = null

    if (!shouldThrow(direction)) {
      setDrag({ x: x * 0.2, y: y * 0.2, dragging: false, throwing: false })
      const delay = reducedMotion() ? 0 : 90
      window.setTimeout(() => {
        onCommit(direction)
        reset()
      }, delay)
      return
    }

    const viewport = Math.max(
      typeof window === 'undefined' ? 900 : window.innerWidth,
      typeof window === 'undefined' ? 900 : window.innerHeight,
    )
    const throwDistance = Math.max(720, viewport * 1.35)
    const throwVector = {
      up: { x: x * 0.35, y: -throwDistance },
      down: { x: x * 0.35, y: throwDistance },
      left: { x: -throwDistance, y: y * 0.35 },
      right: { x: throwDistance, y: y * 0.35 },
    }[direction]

    setDrag({ x: throwVector.x, y: throwVector.y, dragging: false, throwing: true })

    const delay = reducedMotion() ? 0 : 190
    window.setTimeout(() => {
      onCommit(direction)
      reset()
    }, delay)
  }, [onCommit, onTap, reset, shouldThrow, threshold])

  const cancel = useCallback(() => {
    if (locked.current) return
    origin.current = null
    setDrag({ x: 0, y: 0, dragging: false, throwing: false })
  }, [])

  const tilt = Math.max(-8, Math.min(8, drag.x / 18))
  const style: CSSProperties = {
    transform: `translate3d(${drag.x}px, ${drag.y}px, 0) rotate(${tilt}deg)`,
    opacity: drag.throwing ? 0.08 : 1,
    transition: drag.dragging
      ? 'none'
      : 'transform 190ms cubic-bezier(.18,.82,.22,1), opacity 160ms ease-out',
    touchAction: 'none',
    willChange: 'transform, opacity',
  }

  return {
    style,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: cancel,
    },
  }
}
