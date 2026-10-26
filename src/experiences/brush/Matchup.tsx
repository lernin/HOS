import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { faceEye, faceShift, faceZoom, focusBox } from './face'
import type { Standing } from './level'
import { PLACEMENT_GAMES } from './pair'
import type { BrushImage, Margin } from './types'
import { approach, clampZoom, contentSpan, coverEdgeHold, coverFrame, coverPosition, engageTravel, faceEdgePan, facePanToPoint, faceRelativePan, faceTravelClutch, imagePointAt, imagePointFromFace, panZoom, REST_ZOOM, restTranslate, zoomAround, type Zoom } from './zoom'

export type { Zoom }
export { REST_ZOOM }

const PHOTO_GAP = 8
const CONTROLS_MIN = 196
const SWIPE_THRESHOLD = 56
const SWIPE_TRAVEL = 88
const EXPLORE_HOLD_MS = 250
const EXPLORE_MOVE_PX = 12
const PUSH_MS = 620

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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function visibleHits(stage: HTMLElement) {
  return [...stage.querySelectorAll<HTMLElement>('.brush-photo-hit')].filter(hit => {
    const rect = hit.getBoundingClientRect()
    return rect.width > 2 && rect.height > 2
  })
}

function hitAt(stage: HTMLElement, x: number, y: number) {
  const hits = visibleHits(stage)
  const inside = hits.find(hit => {
    const rect = hit.getBoundingClientRect()
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
  })
  if (inside) return inside
  let best: HTMLElement | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const hit of hits) {
    const rect = hit.getBoundingClientRect()
    const distance = Math.hypot(x - (rect.left + rect.width / 2), y - (rect.top + rect.height / 2))
    if (distance < bestDistance) {
      bestDistance = distance
      best = hit
    }
  }
  return best
}

function screenOn(hit: HTMLElement, x: number, y: number) {
  const rect = hit.getBoundingClientRect()
  return {
    x: rect.width ? (x - rect.left) / rect.width : 0.5,
    y: rect.height ? (y - rect.top) / rect.height : 0.5,
    width: rect.width,
    height: rect.height,
  }
}

export function Matchup({
  left, right, front, portrait, zoom, onZoom, onFlip, onPick, onTrash, srcFor, menu = null, notice = null, playing = '', rankFor = () => null, celebrateId = null,
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
  menu?: ReactNode
  notice?: ReactNode
  playing?: string
  rankFor?: (id: string) => Standing | null
  celebrateId?: string | null
}) {
  const stageRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const [frame, setFrame] = useState<{ left: number, right: number, scale: number } | null>(null)
  const [faceSide, setFaceSide] = useState<'left' | 'right' | null>(null)
  const [slots, setSlots] = useState({ left: { w: 0, h: 0 }, right: { w: 0, h: 0 } })
  const [exploreSide, setExploreSide] = useState<'left' | 'right' | null>(null)
  const [faceMotion, setFaceMotion] = useState<false | 'settle'>(false)
  const [facePan, setFacePan] = useState({ sx: 0, sy: 0, scale: 1 })
  const hitRefs = useRef<{ left: HTMLDivElement | null, right: HTMLDivElement | null }>({ left: null, right: null })
  const faceHeldRef = useRef(false)
  const heldSideRef = useRef<'left' | 'right' | null>(null)
  const coverRef = useRef({ left: { x: 0.5, y: 0.33 }, right: { x: 0.5, y: 0.33 } })
  const exploreRef = useRef<'left' | 'right' | null>(null)
  const suppressRef = useRef(0)
  const leadRef = useRef<'left' | 'right'>('left')
  const [matchCount, setMatchCount] = useState(1)
  const [push, setPush] = useState<{
    left: { from: { id: string, src: string | null, image: BrushImage }, to: { id: string, src: string | null, image: BrushImage } } | null
    right: { from: { id: string, src: string | null, image: BrushImage }, to: { id: string, src: string | null, image: BrushImage } } | null
    late: 'left' | 'right' | null
  } | null>(null)
  const previousView = useRef<{ left: { id: string, src: string | null, image: BrushImage }, right: { id: string, src: string | null, image: BrushImage } } | null>(null)
  const seenSrc = useRef(new Map<string, string>())
  const leftSrc = srcFor(left)
  const rightSrc = srcFor(right)
  if (leftSrc) seenSrc.current.set(left.id, leftSrc)
  if (rightSrc) seenSrc.current.set(right.id, rightSrc)
  const leftRatio = useImageRatio(leftSrc)
  const rightRatio = useImageRatio(rightSrc)
  const zoomRef = useRef(zoom)
  const pairRef = useRef({ left, right })
  const lockRef = useRef(0)
  const aliveRef = useRef(true)
  const layoutRef = useRef({ fit: 'contain' as 'contain' | 'cover', leftRatio: 9 / 16, rightRatio: 9 / 16 })
  const portraitRef = useRef(portrait)
  const actions = useRef({ onZoom, onFlip, onPick })
  zoomRef.current = zoom
  pairRef.current = { left, right }
  portraitRef.current = portrait
  actions.current = { onZoom, onFlip, onPick }

  useEffect(() => {
    aliveRef.current = true
    return () => { aliveRef.current = false }
  }, [])

  useEffect(() => {
    const node = stageRef.current
    if (!node) return
    const stage = node
    let origin: { x: number, y: number, hit: HTMLElement } | null = null
    let pinch: { distance: number, scale: number, imageX: number, imageY: number, hit: HTMLElement } | null = null
    let moved = false
    let pinching = false
    let suppressUntil = 0

    function onTouchStart(event: TouchEvent) {
      if (faceHeldRef.current || exploreRef.current) {
        if (event.cancelable) event.preventDefault()
        return
      }
      if (event.touches.length >= 2) {
        event.preventDefault()
        pinching = true
        const [a, b] = [event.touches[0], event.touches[1]]
        const midX = (a.clientX + b.clientX) / 2
        const midY = (a.clientY + b.clientY) / 2
        const hit = hitAt(stage, midX, midY)
        if (!hit) return
        const screen = screenOn(hit, midX, midY)
        const image = imagePointAt(zoomRef.current, screen.x, screen.y)
        pinch = { distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1, scale: zoomRef.current.scale, imageX: image.x, imageY: image.y, hit }
        return
      }
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest('button')) return
      const touch = event.touches[0]
      const hit = hitAt(stage, touch.clientX, touch.clientY)
      if (!hit) return
      origin = { x: touch.clientX, y: touch.clientY, hit }
      moved = false
    }

    function onTouchMove(event: TouchEvent) {
      if (faceHeldRef.current || exploreRef.current) {
        if (event.cancelable) event.preventDefault()
        return
      }
      if (event.touches.length >= 2 && pinch) {
        event.preventDefault()
        pinching = true
        const [a, b] = [event.touches[0], event.touches[1]]
        const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1
        const screen = screenOn(pinch.hit, (a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2)
        const scale = clamp(pinch.scale * (distance / pinch.distance), 1, 4)
        actions.current.onZoom(clampZoom(zoomAround(scale, pinch.imageX, pinch.imageY, screen.x, screen.y)))
        return
      }
      if (event.touches.length !== 1 || !origin) return
      const touch = event.touches[0]
      const dx = touch.clientX - origin.x
      const dy = touch.clientY - origin.y
      if (Math.hypot(dx, dy) > 12) moved = true
      if (zoomRef.current.scale > 1 && moved) {
        event.preventDefault()
        const rect = origin.hit.getBoundingClientRect()
        actions.current.onZoom(panZoom(zoomRef.current, dx, dy, rect.width, rect.height))
        origin = { x: touch.clientX, y: touch.clientY, hit: origin.hit }
      }
    }

    function onTouchEnd(event: TouchEvent) {
      if (faceHeldRef.current || exploreRef.current || Date.now() < suppressRef.current) return
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
    let exploreId: number | null = null
    let drag: {
      id: number
      originX: number
      originY: number
      startSx: number
      startSy: number
      travel: { left: number, right: number, up: number, down: number }
      engaged: boolean
    } | null = null
    let pinch: { dist: number, scale: number, imageX: number, imageY: number, hit: HTMLElement, side: 'left' | 'right' } | null = null
    let arm: { id: number, x: number, y: number, side: 'left' | 'right', timer: number } | null = null
    const target = { sx: 0, sy: 0, scale: 1 }
    const shown = { sx: 0, sy: 0, scale: 1 }
    let frame = 0
    let epoch = 0
    const block: AddEventListenerOptions = { passive: false, capture: true }
    const stop = () => {
      epoch += 1
      if (frame) cancelAnimationFrame(frame)
      frame = 0
    }
    const kick = () => {
      if (frame) return
      const token = epoch
      const step = () => {
        if (token !== epoch || !aliveRef.current) {
          frame = 0
          return
        }
        shown.sx = approach(shown.sx, target.sx, 0.42, 0.0015)
        shown.sy = approach(shown.sy, target.sy, 0.42, 0.0015)
        shown.scale = approach(shown.scale, target.scale, 0.42, 0.01)
        setFaceMotion(false)
        setFacePan({ sx: shown.sx, sy: shown.sy, scale: shown.scale })
        if (shown.sx === target.sx && shown.sy === target.sy && shown.scale === target.scale) {
          frame = 0
          return
        }
        frame = requestAnimationFrame(step)
      }
      frame = requestAnimationFrame(step)
    }
    const clearArm = () => {
      if (!arm) return
      window.clearTimeout(arm.timer)
      arm = null
    }
    const thumbTravel = (fromX: number, fromY: number) => {
      const margin = 8
      const width = window.innerWidth
      const height = window.innerHeight
      return {
        left: Math.max(1, fromX - margin),
        right: Math.max(1, width - fromX - margin),
        up: Math.max(1, fromY - margin),
        down: Math.max(1, height - fromY - margin),
      }
    }
    const relativeFromPan = (px: number, min: number, max: number) => {
      if (px <= 0) {
        if (!(min < 0)) return 0
        return clamp(px / min, 0, 1)
      }
      if (!(max > 0)) return 0
      return -clamp(px / max, 0, 1)
    }
    const edgeOf = (side: 'left' | 'right', pinchScale: number) => {
      const stage = stageRef.current
      const hit = stage?.querySelector<HTMLElement>(`[data-side="${side}"] .brush-photo-hit`)
      if (!hit) return null
      const rect = hit.getBoundingClientRect()
      if (rect.width < 2 || rect.height < 2) return null
      const focus = faceShift(faceZoom(focusBox(pairRef.current[side].face_box)))
      const width = hit.clientWidth || rect.width
      const height = hit.clientHeight || rect.height
      const ratio = side === 'left' ? layoutRef.current.leftRatio : layoutRef.current.rightRatio
      return faceEdgePan({
        faceTx: focus.tx,
        faceTy: focus.ty,
        scale: focus.scale * pinchScale,
        width,
        height,
        span: contentSpan(width, height, ratio, layoutRef.current.fit),
      })
    }
    const ensureDrag = (id: number, point: { x: number, y: number }) => {
      if (drag?.id === id) return drag
      target.sx = shown.sx
      target.sy = shown.sy
      target.scale = shown.scale
      drag = {
        id,
        originX: point.x,
        originY: point.y,
        startSx: target.sx,
        startSy: target.sy,
        travel: thumbTravel(point.x, point.y),
        engaged: false,
      }
      return drag
    }
    const releaseGesture = () => {
      holdId = null
      exploreId = null
      drag = null
      pinch = null
      pointers.clear()
      stop()
      target.sx = 0
      target.sy = 0
      target.scale = 1
      shown.sx = 0
      shown.sy = 0
      shown.scale = 1
      faceHeldRef.current = false
      heldSideRef.current = null
      exploreRef.current = null
      setFaceSide(null)
      setExploreSide(null)
      setFaceMotion('settle')
      setFacePan({ sx: 0, sy: 0, scale: 1 })
      actions.current.onZoom(REST_ZOOM)
      window.setTimeout(() => {
        if (!faceHeldRef.current && !exploreRef.current) setFaceMotion(false)
      }, 280)
    }
    const apply = () => {
      if (holdId === null && exploreId === null) return
      const owner = holdId ?? exploreId
      if (owner === null) return
      const extra = [...pointers.entries()].filter(([id]) => id !== holdId && id !== exploreId)
      const pinching = holdId === null && (exploreId !== null ? extra.length >= 1 : extra.length >= 2)
      if (pinching) {
        drag = null
        const primary = pointers.get(owner)
        const partner = exploreId !== null ? extra[0]?.[1] : extra[1]?.[1]
        const first = exploreId !== null ? primary : extra[0]?.[1]
        if (!first || !partner) return
        const dist = Math.hypot(first.x - partner.x, first.y - partner.y) || 1
        const cx = (first.x + partner.x) / 2
        const cy = (first.y + partner.y) / 2
        const stage = stageRef.current
        if (!pinch && stage) {
          const preferred = exploreRef.current
          const hit = preferred
            ? stage.querySelector<HTMLElement>(`[data-side="${preferred}"] .brush-photo-hit`)
            : hitAt(stage, cx, cy)
          if (!hit) return
          const side = hit.closest<HTMLElement>('[data-side]')?.dataset.side === 'right' ? 'right' : 'left'
          const focus = faceShift(faceZoom(focusBox(pairRef.current[side].face_box)))
          const screen = screenOn(hit, cx, cy)
          const width = hit.clientWidth || screen.width
          const height = hit.clientHeight || screen.height
          const edge = edgeOf(side, shown.scale)
          const image = imagePointFromFace({
            faceTx: focus.tx,
            faceTy: focus.ty,
            scale: focus.scale * shown.scale,
            panX: edge ? faceRelativePan(shown.sx, edge.minX, edge.maxX) : 0,
            panY: edge ? faceRelativePan(shown.sy, edge.minY, edge.maxY) : 0,
            width,
            height,
            screenX: screen.x,
            screenY: screen.y,
          })
          pinch = { dist, scale: shown.scale, imageX: image.x, imageY: image.y, hit, side }
        }
        if (!pinch) return
        const focus = faceShift(faceZoom(focusBox(pairRef.current[pinch.side].face_box)))
        const nextScale = clamp(pinch.scale * (dist / pinch.dist), 0.55, 2.6)
        const screen = screenOn(pinch.hit, cx, cy)
        const next = facePanToPoint({
          faceTx: focus.tx,
          faceTy: focus.ty,
          scale: focus.scale * nextScale,
          width: pinch.hit.clientWidth || screen.width,
          height: pinch.hit.clientHeight || screen.height,
          imageX: pinch.imageX,
          imageY: pinch.imageY,
          screenX: screen.x,
          screenY: screen.y,
        })
        const edge = edgeOf(pinch.side, nextScale) || { minX: -400, maxX: 400, minY: -800, maxY: 800 }
        target.scale = nextScale
        target.sx = relativeFromPan(clamp(next.x, edge.minX, edge.maxX), edge.minX, edge.maxX)
        target.sy = relativeFromPan(clamp(next.y, edge.minY, edge.maxY), edge.minY, edge.maxY)
        kick()
        return
      }
      pinch = null
      const active = extra[0] ?? (pointers.get(owner) ? [owner, pointers.get(owner)!] as const : null)
      if (!active) return
      const [id, point] = active
      const current = ensureDrag(id, point)
      if (!current.engaged) {
        const dx = point.x - current.originX
        const dy = point.y - current.originY
        if (Math.hypot(dx, dy) < 6) return
        current.engaged = true
        current.travel = engageTravel(current.travel, dx, dy)
        current.originX = point.x
        current.originY = point.y
        current.startSx = target.sx
        current.startSy = target.sy
      }
      const next = faceTravelClutch({
        originX: current.originX,
        originY: current.originY,
        x: point.x,
        y: point.y,
        startSx: current.startSx,
        startSy: current.startSy,
        left: current.travel.left,
        right: current.travel.right,
        up: current.travel.up,
        down: current.travel.down,
        invertY: holdId !== null,
      })
      const rest = holdId !== null && heldSideRef.current ? coverRef.current[heldSideRef.current] : null
      const holdX = rest ? coverEdgeHold({ s: next.sx, rest: rest.x, point: point.x }) : null
      const holdY = rest ? coverEdgeHold({ s: next.sy, rest: rest.y, point: point.y }) : null
      current.originX = holdX ? holdX.origin : next.originX
      current.originY = holdY ? holdY.origin : next.originY
      current.startSx = holdX ? holdX.start : next.startSx
      current.startSy = holdY ? holdY.start : next.startSy
      target.sx = holdX ? holdX.s : next.sx
      target.sy = holdY ? holdY.s : next.sy
      kick()
    }
    const engage = (id: number, x: number, y: number, side: 'left' | 'right') => {
      clearArm()
      exploreId = id
      drag = null
      pinch = null
      stop()
      target.sx = 0
      target.sy = 0
      target.scale = 1
      shown.sx = 0
      shown.sy = 0
      shown.scale = 1
      pointers.set(id, { x, y })
      ensureDrag(id, { x, y })
      exploreRef.current = side
      suppressRef.current = Date.now() + 700
      setExploreSide(side)
      setFaceMotion('settle')
      setFacePan({ sx: 0, sy: 0, scale: 1 })
    }
    const down = (event: PointerEvent) => {
      if (event.button !== 0) return
      const targetNode = event.target instanceof Element ? event.target : null
        const faceNode = targetNode?.closest('[data-action="face"]')
      const faceTarget = faceNode instanceof HTMLElement
        ? (faceNode.dataset.face === 'right' ? 'right' : faceNode.dataset.face === 'left' ? 'left' : null)
        : null
      if (faceTarget && holdId === null && exploreId === null) {
        if (Date.now() < lockRef.current) return
        clearArm()
        if (event.cancelable) event.preventDefault()
        holdId = event.pointerId
        drag = null
        pinch = null
        stop()
        target.sx = 0
        target.sy = 0
        target.scale = 1
        shown.sx = 0
        shown.sy = 0
        shown.scale = 1
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
        ensureDrag(event.pointerId, { x: event.clientX, y: event.clientY })
        faceHeldRef.current = true
        heldSideRef.current = faceTarget
        setFaceSide(faceTarget)
        setExploreSide(null)
        setFaceMotion('settle')
        setFacePan({ sx: 0, sy: 0, scale: 1 })
        return
      }
      if (holdId !== null || exploreId !== null) {
        if (targetNode?.closest('[data-swipe], button:not([data-action="face"])')) return
        clearArm()
        if (event.cancelable) event.preventDefault()
        event.stopPropagation()
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
        pinch = null
        drag = null
        ensureDrag(event.pointerId, { x: event.clientX, y: event.clientY })
        return
      }
      if (arm && event.pointerId !== arm.id) {
        clearArm()
        return
      }
      if (Date.now() < lockRef.current) return
      if (targetNode?.closest('button, [data-swipe]')) return
      const hit = targetNode?.closest('.brush-photo-hit')
      if (!hit) return
      const sideNode = hit.closest('[data-side]')
      const side = sideNode instanceof HTMLElement && sideNode.dataset.side === 'right' ? 'right' : 'left'
      clearArm()
      const timer = window.setTimeout(() => {
        if (!arm || holdId !== null || exploreId !== null) return
        engage(arm.id, arm.x, arm.y, arm.side)
      }, EXPLORE_HOLD_MS)
      arm = { id: event.pointerId, x: event.clientX, y: event.clientY, side, timer }
    }
    const move = (event: PointerEvent) => {
      if (arm && event.pointerId === arm.id && exploreId === null && holdId === null) {
        if (Math.hypot(event.clientX - arm.x, event.clientY - arm.y) > EXPLORE_MOVE_PX) clearArm()
        return
      }
      if (!pointers.has(event.pointerId)) return
      if (event.cancelable) event.preventDefault()
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      apply()
    }
    const up = (event: PointerEvent) => {
      if (arm && event.pointerId === arm.id && event.pointerId !== holdId && exploreId === null) {
        clearArm()
        return
      }
      if (!pointers.has(event.pointerId)) return
      pointers.delete(event.pointerId)
      pinch = null
      if (event.pointerId !== holdId) {
        if (exploreId !== null && event.pointerId === exploreId) {
          releaseGesture()
          return
        }
        drag = null
        const owner = holdId ?? exploreId
        const extra = [...pointers.entries()].filter(([id]) => id !== holdId && id !== exploreId)
        const next = extra[0] ?? (owner !== null && pointers.get(owner) ? [owner, pointers.get(owner)!] as const : null)
        if (next) ensureDrag(next[0], next[1])
        return
      }
      releaseGesture()
    }
    const blockMenu = (event: Event) => {
      event.preventDefault()
    }
    const photos = stageRef.current
    photos?.addEventListener('contextmenu', blockMenu, true)
    window.addEventListener('pointerdown', down, block)
    window.addEventListener('pointermove', move, block)
    window.addEventListener('pointerup', up, block)
    window.addEventListener('pointercancel', up, block)
    return () => {
      clearArm()
      stop()
      photos?.removeEventListener('contextmenu', blockMenu, true)
      window.removeEventListener('pointerdown', down, block)
      window.removeEventListener('pointermove', move, block)
      window.removeEventListener('pointerup', up, block)
      window.removeEventListener('pointercancel', up, block)
      if (holdId !== null || exploreId !== null) {
        faceHeldRef.current = false
        heldSideRef.current = null
        exploreRef.current = null
        setFaceSide(null)
        setExploreSide(null)
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
      const budget = rect.width - PHOTO_GAP - CONTROLS_MIN
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
    const measure = (side: 'left' | 'right') => {
      const hit = hitRefs.current[side]
      if (!hit) return { w: 0, h: 0 }
      const rect = hit.getBoundingClientRect()
      return { w: rect.width, h: rect.height }
    }
    const read = () => {
      const next = { left: measure('left'), right: measure('right') }
      setSlots(current => (
        Math.abs(current.left.w - next.left.w) < 0.5
        && Math.abs(current.left.h - next.left.h) < 0.5
        && Math.abs(current.right.w - next.right.w) < 0.5
        && Math.abs(current.right.h - next.right.h) < 0.5
      ) ? current : next)
    }
    read()
    const observer = new ResizeObserver(read)
    const stage = stageRef.current
    if (stage) observer.observe(stage)
    if (hitRefs.current.left) observer.observe(hitRefs.current.left)
    if (hitRefs.current.right) observer.observe(hitRefs.current.right)
    return () => observer.disconnect()
  }, [left.id, right.id, portrait, faceSide])

  useLayoutEffect(() => {
    const view = {
      left: { id: left.id, src: leftSrc || seenSrc.current.get(left.id) || null, image: left },
      right: { id: right.id, src: rightSrc || seenSrc.current.get(right.id) || null, image: right },
    }
    const previous = previousView.current
    if (!previous) {
      previousView.current = view
      return
    }
    const leftChanged = previous.left.id !== view.left.id
    const rightChanged = previous.right.id !== view.right.id
    if (!leftChanged && !rightChanged) {
      previousView.current = view
      return
    }
    previousView.current = view
    if ((frameRef.current?.clientHeight ?? 0) < 8) return
    if (!faceHeldRef.current && !exploreRef.current) {
      setFacePan({ sx: 0, sy: 0, scale: 1 })
      setFaceMotion(false)
    }
    setMatchCount(count => count + 1)
    const late = leftChanged && rightChanged ? (leadRef.current === 'right' ? 'left' : 'right') : null
    const pane = (
      changed: boolean,
      from: { id: string, src: string | null, image: BrushImage },
      to: { id: string, src: string | null, image: BrushImage },
    ) => changed ? { from, to: { ...to, src: to.src || from.src } } : null
    setPush({
      left: pane(leftChanged, previous.left, view.left),
      right: pane(rightChanged, previous.right, view.right),
      late,
    })
    const timer = window.setTimeout(() => setPush(null), 760)
    return () => window.clearTimeout(timer)
  }, [left.id, right.id])

  useEffect(() => {
    setPush(current => {
      if (!current) return current
      const fill = (motion: NonNullable<typeof push>['left'], src: string | null) => {
        if (!motion || motion.to.src || !src) return motion
        return { ...motion, to: { ...motion.to, src } }
      }
      const nextLeft = fill(current.left, leftSrc)
      const nextRight = fill(current.right, rightSrc)
      if (nextLeft === current.left && nextRight === current.right) return current
      return { ...current, left: nextLeft, right: nextRight }
    })
  }, [leftSrc, rightSrc])

  function locked(event: React.MouseEvent) {
    if (Date.now() < lockRef.current) {
      event.preventDefault()
      event.stopPropagation()
      return true
    }
    return false
  }

  function onPhotoClick(event: React.MouseEvent<HTMLDivElement>) {
    if (locked(event) || Date.now() < suppressRef.current || exploreRef.current) return
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
  const fit = 'contain' as const
  layoutRef.current = { fit, leftRatio, rightRatio }

  function framedCover(image: BrushImage, side: 'left' | 'right') {
    const eye = faceEye(image.face_box)
    const framed = coverFrame({
      elementWidth: slots[side].w,
      elementHeight: slots[side].h,
      imageRatio: side === 'left' ? leftRatio : rightRatio,
      eyeX: eye.x,
      eyeY: eye.y,
    })
    coverRef.current[side] = { x: framed.positionX, y: framed.positionY }
    return framed
  }

  function photoStyle(image: BrushImage, side: 'left' | 'right') {
    const framed = framedCover(image, side)
    if (faceSide === side) {
      const x = coverPosition(framed.positionX, facePan.sx)
      const y = coverPosition(framed.positionY, facePan.sy)
      return {
        objectFit: 'cover' as const,
        objectPosition: `${x * 100}% ${y * 100}%`,
      }
    }
    const exploring = exploreSide === side
    const focus = exploring ? faceShift(faceZoom(focusBox(image.face_box))) : null
    const rested = restTranslate(zoom)
    const scale = focus ? focus.scale * facePan.scale : rested.scale
    const tx = focus ? focus.tx : rested.tx
    const ty = focus ? focus.ty : rested.ty
    const hit = hitRefs.current[side]
    const width = hit?.clientWidth || (frame ? (side === 'left' ? frame.left : frame.right) : 0)
    const height = hit?.clientHeight || frameRef.current?.clientHeight || 0
    let px = 0
    let py = 0
    if (focus && width > 1 && height > 1) {
      const edge = faceEdgePan({
        faceTx: focus.tx,
        faceTy: focus.ty,
        scale,
        width,
        height,
        span: contentSpan(width, height, side === 'left' ? leftRatio : rightRatio, fit),
      })
      px = faceRelativePan(facePan.sx, edge.minX, edge.maxX)
      py = faceRelativePan(facePan.sy, edge.minY, edge.maxY)
    }
    return {
      transform: `translate(${px}px, ${py}px) translate(${tx}%, ${ty}%) scale(${scale})`,
      transformOrigin: '50% 50%',
      transition: faceMotion === 'settle' ? 'transform 250ms ease, object-position 250ms ease' : undefined,
      objectFit: fit,
      objectPosition: 'center',
    }
  }

  function portraitLine(image: BrushImage) {
    const standing = rankFor(image.id)
    const ranked = image.games >= PLACEMENT_GAMES
    const place = image.country || 'Unknown'
    const placementRound = Math.min(image.games + 1, PLACEMENT_GAMES)
    const rising = celebrateId === image.id ? ' is-rising' : ''
    if (!ranked) {
      return (
        <p className={`brush-portrait-line${rising}`} data-portrait-line data-placement="pending" data-challenger>
          {`${place} · Round ${placementRound}/${PLACEMENT_GAMES} · ${image.wins}–${image.losses}`}
        </p>
      )
    }
    return (
      <p className={`brush-portrait-line${rising}`} data-portrait-line>
        {`${place} · ${standing ? `#${standing.rank}` : 'Ranked'} · ${Math.round(image.elo)}`}
      </p>
    )
  }


  function commitNow(side: 'left' | 'right', act: () => void) {
    if (Date.now() < lockRef.current) return
    leadRef.current = side
    lockRef.current = Date.now() + PUSH_MS
    act()
  }

  function choose(event: React.MouseEvent, id: string, margin: Margin) {
    if (locked(event)) return
    const side = id === left.id ? 'left' : 'right'
    commitNow(side, () => onPick(id, margin))
  }

  function discard(event: React.MouseEvent, id: string) {
    if (locked(event)) return
    const side = id === left.id ? 'left' : 'right'
    commitNow(side, () => onTrash(id))
  }

  function swipeCommit(kind: 'pick' | 'close' | 'trash', side: 'left' | 'right') {
    const image = side === 'left' ? left : right
    commitNow(side, () => {
      if (kind === 'trash') onTrash(image.id)
      else onPick(image.id, kind === 'close' ? 'close' : 'clear')
    })
  }

  function restPhotoStyle() {
    const rested = restTranslate(zoom)
    return {
      transform: `translate(0px, 0px) translate(${rested.tx}%, ${rested.ty}%) scale(${rested.scale})`,
      transformOrigin: '50% 50%',
      objectFit: fit,
    }
  }

  function framePhoto(image: BrushImage, side: 'left' | 'right', src: string | null, live: boolean) {
    const shown = src || seenSrc.current.get(image.id) || null
    if (!shown) return <div className="brush-photo brush-photo-empty" />
    return <img className="brush-photo" src={shown} alt={image.name} style={live ? photoStyle(image, side) : restPhotoStyle()} draggable={false} onContextMenu={blockPictureMenu} onDragStart={blockPictureMenu} />
  }

  function matchCountNode() {
    if (!push) return <p className="brush-match-count" data-match-count>Match {matchCount}</p>
    return (
      <div className="brush-count-clip">
        <PushFrames late={false}>
          <p className="brush-push-pane is-from brush-match-count" data-match-count aria-hidden="true">Match {Math.max(1, matchCount - 1)}</p>
          <p className="brush-push-pane is-to brush-match-count" data-match-count>Match {matchCount}</p>
        </PushFrames>
      </div>
    )
  }

  return (
    <div className="brush-stage" data-screen="match" ref={frameRef}>
      <div className={`brush-photos${faceSide === 'left' ? ' is-face-left' : ''}${faceSide === 'right' ? ' is-face-right' : ''}`} ref={stageRef}>
        {cards.map(({ image, side }) => {
          const src = side === 'left' ? leftSrc : rightSrc
          const motion = side === 'left' ? push?.left : push?.right
          return (
            <article key={side} className={`brush-card${front === side ? ' is-front' : ''}`} data-side={side} data-image={image.id} data-name={image.name} data-face-known={image.face_box ? 'yes' : 'no'} data-explore={exploreSide === side ? 'true' : 'false'} data-photo-slot>
              <div className="brush-photo-hit" ref={node => { hitRefs.current[side] = node }} onClick={onPhotoClick} onContextMenu={blockPictureMenu}>
                {motion ? (
                  <PushFrames late={push?.late === side}>
                    <div className="brush-push-pane is-from" aria-hidden="true">{framePhoto(motion.from.image, side, motion.from.src, false)}</div>
                    <div className="brush-push-pane is-to">{framePhoto(image, side, motion.to.src || src, true)}</div>
                  </PushFrames>
                ) : (
                  <div className="brush-slide">{framePhoto(image, side, src, true)}</div>
                )}
              </div>
            </article>
          )
        })}
      </div>
      {!portrait && (
        <aside className="brush-controls" data-gutter="controls">
          <div className="brush-controls-tools">{menu}</div>
          {playing && <p className="brush-playing" data-playing>{playing}</p>}
          {matchCountNode()}
          {notice}
          <div className="brush-gutter-actions">
            <div className="brush-control-row">
              <SwipePad kind="pick" label="WINNER" leftName={left.country || left.name} rightName={right.country || right.name} onCommit={swipeCommit} onAim={() => { if (Date.now() < lockRef.current) return }} />
            </div>
            <div className="brush-control-row">
              <SwipePad kind="trash" label="Trash" leftName={left.country || left.name} rightName={right.country || right.name} onCommit={swipeCommit} onAim={() => { if (Date.now() < lockRef.current) return }} />
              <SwipePad kind="close" label="Close call" leftName={left.country || left.name} rightName={right.country || right.name} onCommit={swipeCommit} onAim={() => { if (Date.now() < lockRef.current) return }} />
            </div>
            <div className="brush-control-row">
              <FaceHoldButton side="left" pressed={faceSide === 'left'} />
              <FaceHoldButton side="right" pressed={faceSide === 'right'} />
            </div>
          </div>
        </aside>
      )}
      {portrait && (
        <div className="brush-portrait-dock">
          {playing && <p className="brush-playing" data-playing>{playing}</p>}
          {portraitLine(frontImage)}
          <div className="brush-footer">
            <button className="brush-choice" type="button" data-action="pick" onClick={event => choose(event, frontImage.id, 'clear')}>Pick</button>
            <button className="brush-choice close" type="button" data-action="close" onClick={event => choose(event, frontImage.id, 'close')}>Close</button>
            <button className="brush-choice danger" type="button" data-action="trash" onClick={event => discard(event, frontImage.id)}>Trash</button>
          </div>
        </div>
      )}
    </div>
  )
}

function blockPictureMenu(event: { preventDefault: () => void }) {
  event.preventDefault()
}

function PushFrames({ late, children }: { late: boolean, children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    let hidden = document.visibilityState === 'hidden'
    const finish = () => setSettled(true)
    const onEnd = (event: AnimationEvent) => {
      if (event.target === node) finish()
    }
    const onVis = () => {
      if (document.visibilityState === 'hidden') hidden = true
      else if (hidden) finish()
    }
    node.addEventListener('animationend', onEnd)
    node.addEventListener('animationcancel', onEnd)
    document.addEventListener('visibilitychange', onVis)
    const timer = window.setTimeout(finish, 700)
    if (node.getBoundingClientRect().height < 8) finish()
    return () => {
      node.removeEventListener('animationend', onEnd)
      node.removeEventListener('animationcancel', onEnd)
      document.removeEventListener('visibilitychange', onVis)
      window.clearTimeout(timer)
    }
  }, [])
  return <div ref={ref} className={`brush-push${late ? ' is-late' : ''}${settled ? ' is-settled' : ''}`}>{children}</div>
}

function FaceHoldButton({ pressed, side }: { pressed: boolean, side: 'left' | 'right' }) {
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
    <button ref={ref} className="brush-face-hold" type="button" data-action="face" data-face={side} aria-pressed={pressed} aria-label={side === 'left' ? 'Hold for left face' : 'Hold for right face'}>
      <PadIcon kind="face" />
      <span>{side === 'left' ? 'Left' : 'Right'}</span>
    </button>
  )
}

function PadIcon({ kind }: { kind: 'pick' | 'close' | 'trash' | 'face' }) {
  const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <svg className="brush-pad-icon" viewBox="0 0 24 24" aria-hidden="true">
      {kind === 'pick' && <path {...stroke} d="M4.5 16.8h15M5.2 16.8 4 8.2l4.3 3.1L12 4.8l3.7 6.5L20 8.2l-1.2 8.6" />}
      {kind === 'close' && (
        <>
          <path {...stroke} d="M12 3.8v16.4M8 20.2h8M4.8 8.2h14.4" />
          <path {...stroke} d="M4.8 8.2c.2 2.5 1.8 3.8 3.4 3.8s3.2-1.3 3.4-3.8" />
          <path {...stroke} d="M12.4 8.2c.2 2.5 1.8 3.8 3.4 3.8s3.2-1.3 3.4-3.8" />
        </>
      )}
      {kind === 'trash' && (
        <>
          <path {...stroke} d="M5 7.6h14M9.2 7.6V5.6h5.6v2M7.4 7.6l.7 11.2h7.8l.7-11.2M10.2 10.4v5.6M13.8 10.4v5.6" />
        </>
      )}
      {kind === 'face' && (
        <>
          <circle {...stroke} cx="12" cy="9" r="3.4" />
          <path {...stroke} d="M6.5 19.2c1.1-2.8 3-4.2 5.5-4.2s4.4 1.4 5.5 4.2" />
        </>
      )}
    </svg>
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
  kind, label, leftName, rightName, onCommit, onAim,
}: {
  kind: 'pick' | 'close' | 'trash'
  label: string
  leftName: string
  rightName: string
  onCommit: (kind: 'pick' | 'close' | 'trash', side: 'left' | 'right') => void
  onAim: (side: 'left' | 'right' | null) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const api = useRef({ onCommit, kind, onAim })
  api.current = { onCommit, kind, onAim }
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
      api.current.onAim(aim)
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
        api.current.onAim(null)
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
      api.current.onAim(null)
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
    : `${label}. Swipe left for ${leftName}. Swipe right for ${rightName}.`
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
        <PadIcon kind={kind} />
        {aimed && <em>{aimed}</em>}
      </div>
    </div>
  )
}
