import { useCallback, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'

export type CardinalSwipeDirection = 'up' | 'down' | 'left' | 'right'
export type DiagonalSwipeDirection = 'up-left' | 'up-right' | 'down-left' | 'down-right'
export type SwipeDirection = CardinalSwipeDirection | DiagonalSwipeDirection

export type SwipeMotion = {
  x: number
  y: number
  dragging: boolean
  throwing: boolean
}

type SwipeOptions = {
  disabled?: boolean
  threshold?: number
  allowDiagonals?: boolean
  onCommit: (direction: SwipeDirection) => void
  onTap?: () => void
  shouldThrow?: (direction: SwipeDirection) => boolean
}

const cardinalDirectionFromDelta = (x: number, y: number): CardinalSwipeDirection => {
  if (Math.abs(x) > Math.abs(y)) return x >= 0 ? 'right' : 'left'
  return y >= 0 ? 'down' : 'up'
}

const detailedDirectionFromDelta = (x: number, y: number): SwipeDirection => {
  const angle = Math.atan2(y, x) * 180 / Math.PI

  if (angle >= -22.5 && angle < 22.5) return 'right'
  if (angle >= 22.5 && angle < 67.5) return 'down-right'
  if (angle >= 67.5 && angle < 112.5) return 'down'
  if (angle >= 112.5 && angle < 157.5) return 'down-left'
  if (angle >= 157.5 || angle < -157.5) return 'left'
  if (angle >= -157.5 && angle < -112.5) return 'up-left'
  if (angle >= -112.5 && angle < -67.5) return 'up'
  return 'up-right'
}

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export const styleForSwipeMotion = (motion: SwipeMotion): CSSProperties => {
  const tilt = Math.max(-8, Math.min(8, motion.x / 18))
  return {
    transform: `translate3d(${motion.x}px, ${motion.y}px, 0) rotate(${tilt}deg)`,
    opacity: motion.throwing ? 0.08 : 1,
    transition: motion.dragging
      ? 'none'
      : 'transform 190ms cubic-bezier(.18,.82,.22,1), opacity 160ms ease-out',
    touchAction: 'none',
    willChange: 'transform, opacity',
  }
}

export const useSwipe = ({
  disabled = false,
  threshold = 44,
  allowDiagonals = false,
  onCommit,
  onTap,
  shouldThrow = () => true,
}: SwipeOptions) => {
  const origin = useRef<{ x: number; y: number; pointerId: number } | null>(null)
  const locked = useRef(false)
  const [motion, setMotion] = useState<SwipeMotion>({ x: 0, y: 0, dragging: false, throwing: false })

  const reset = useCallback(() => {
    origin.current = null
    locked.current = false
    setMotion({ x: 0, y: 0, dragging: false, throwing: false })
  }, [])

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (disabled || locked.current) return
    origin.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId }
    event.currentTarget.setPointerCapture(event.pointerId)
    setMotion({ x: 0, y: 0, dragging: true, throwing: false })
  }, [disabled])

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (!origin.current || origin.current.pointerId !== event.pointerId || locked.current) return
    setMotion({
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
      setMotion({ x: 0, y: 0, dragging: false, throwing: false })
      onTap?.()
      return
    }

    const direction = allowDiagonals
      ? detailedDirectionFromDelta(x, y)
      : cardinalDirectionFromDelta(x, y)

    locked.current = true
    origin.current = null

    if (!shouldThrow(direction)) {
      setMotion({ x: x * 0.2, y: y * 0.2, dragging: false, throwing: false })
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
    const diagonalDistance = throwDistance * 0.78
    const throwVector: Record<SwipeDirection, { x: number; y: number }> = {
      up: { x: x * 0.35, y: -throwDistance },
      down: { x: x * 0.35, y: throwDistance },
      left: { x: -throwDistance, y: y * 0.35 },
      right: { x: throwDistance, y: y * 0.35 },
      'up-left': { x: -diagonalDistance, y: -diagonalDistance },
      'up-right': { x: diagonalDistance, y: -diagonalDistance },
      'down-left': { x: -diagonalDistance, y: diagonalDistance },
      'down-right': { x: diagonalDistance, y: diagonalDistance },
    }

    const vector = throwVector[direction]
    setMotion({ x: vector.x, y: vector.y, dragging: false, throwing: true })

    const delay = reducedMotion() ? 0 : 190
    window.setTimeout(() => {
      onCommit(direction)
      reset()
    }, delay)
  }, [allowDiagonals, onCommit, onTap, reset, shouldThrow, threshold])

  const cancel = useCallback(() => {
    if (locked.current) return
    origin.current = null
    setMotion({ x: 0, y: 0, dragging: false, throwing: false })
  }, [])

  return {
    motion,
    style: styleForSwipeMotion(motion),
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: cancel,
    },
  }
}
