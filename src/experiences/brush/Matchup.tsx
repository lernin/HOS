import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { faceShift, faceZoom, focusBox } from './face'
import { levelOf, levelProgress, levelTier, type Standing } from './level'
import { PLACEMENT_GAMES } from './pair'
import type { BrushImage, Margin } from './types'
import { clampInRanges, clampZoom, contentSpan, faceAimPan, facePanRange, facePanToPoint, imagePointAt, imagePointFromFace, panZoom, REST_ZOOM, restTranslate, zoomAround, type Zoom } from './zoom'

export type { Zoom }
export { REST_ZOOM }

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

function pictureAim(stage: HTMLElement, x: number, y: number) {
  const hits = visibleHits(stage)
  let best: HTMLElement | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const hit of hits) {
    const rect = hit.getBoundingClientRect()
    const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0
    const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0
    const distance = Math.hypot(dx, dy)
    if (distance < bestDistance) {
      bestDistance = distance
      best = hit
    }
  }
  if (!best) return null
  const rect = best.getBoundingClientRect()
  if (rect.width < 2 || rect.height < 2) return null
  return {
    x: clamp((x - rect.left) / rect.width, 0, 1),
    y: clamp((y - rect.top) / rect.height, 0, 1),
  }
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
  const [faceMotion, setFaceMotion] = useState<false | 'settle' | 'follow'>(false)
  const [faceAim, setFaceAim] = useState<{ x: number, y: number } | null>(null)
  const [facePan, setFacePan] = useState({ x: 0, y: 0, scale: 1 })
  const hitRefs = useRef<{ left: HTMLDivElement | null, right: HTMLDivElement | null }>({ left: null, right: null })
  const faceHeldRef = useRef(false)
  const [entering, setEntering] = useState<'left' | 'right' | 'both' | null>(null)
  const [matchCount, setMatchCount] = useState(1)
  const [glow, setGlow] = useState<'left' | 'right' | null>(null)
  const [farewell, setFarewell] = useState<{ winner: 'left' | 'right', loser: 'left' | 'right' } | null>(null)
  const [stripOpen, setStripOpen] = useState({ left: false, right: false })
  const previousIds = useRef<{ left: string, right: string } | null>(null)
  const leftSrc = srcFor(left)
  const rightSrc = srcFor(right)
  const leftRatio = useImageRatio(leftSrc)
  const rightRatio = useImageRatio(rightSrc)
  const zoomRef = useRef(zoom)
  const pairRef = useRef({ left, right })
  const lockRef = useRef(0)
  const aliveRef = useRef(true)
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
      if (faceHeldRef.current) {
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
      if (faceHeldRef.current) {
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
    let pinch: { dist: number, scale: number, imageX: number, imageY: number, hit: HTMLElement, side: 'left' | 'right' } | null = null
    let aimPoint: { x: number, y: number } | null = null
    const pan = { x: 0, y: 0, scale: 1 }
    const block: AddEventListenerOptions = { passive: false, capture: true }
    const publish = (aim: { x: number, y: number } | null, glide: false | 'settle' | 'follow') => {
      setFaceMotion(glide)
      setFaceAim(aim)
      setFacePan({ x: pan.x, y: pan.y, scale: pan.scale })
    }
    const heldBounds = (pinchScale: number) => {
      const stage = stageRef.current
      if (!stage) return { x: [] as { min: number, max: number }[], y: [] as { min: number, max: number }[] }
      const ranges = { x: [] as { min: number, max: number }[], y: [] as { min: number, max: number }[] }
      for (const side of ['left', 'right'] as const) {
        const hit = stage.querySelector<HTMLElement>(`[data-side="${side}"] .brush-photo-hit`)
        if (!hit) continue
        const rect = hit.getBoundingClientRect()
        if (rect.width < 2 || rect.height < 2) continue
        const focus = faceShift(faceZoom(focusBox(pairRef.current[side].face_box)))
        const scale = focus.scale * pinchScale
        ranges.x.push(facePanRange(focus.tx, rect.width, scale))
        ranges.y.push(facePanRange(focus.ty, rect.height, scale))
      }
      return ranges
    }
    const clampHeld = (x: number, y: number, pinchScale: number) => {
      const ranges = heldBounds(pinchScale)
      return { x: clampInRanges(x, ranges.x), y: clampInRanges(y, ranges.y) }
    }
    const apply = () => {
      const points = [...pointers.values()]
      if (points.length >= 2) {
        const [a, b] = points
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1
        const cx = (a.x + b.x) / 2
        const cy = (a.y + b.y) / 2
        const stage = stageRef.current
        if (!pinch && stage) {
          const hit = hitAt(stage, cx, cy)
          const side = hit?.closest<HTMLElement>('[data-side]')?.dataset.side === 'right' ? 'right' : 'left'
          if (hit) {
            const focus = faceShift(faceZoom(focusBox(pairRef.current[side].face_box)))
            const screen = screenOn(hit, cx, cy)
            if (aimPoint) {
              const img = hit.querySelector('img')
              const ratio = img && img.naturalWidth > 0 && img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 9 / 16
              const aimed = faceAimPan({
                faceTx: focus.tx,
                faceTy: focus.ty,
                scale: focus.scale * pan.scale,
                width: hit.clientWidth || screen.width,
                height: hit.clientHeight || screen.height,
                imageX: aimPoint.x,
                imageY: aimPoint.y,
                span: contentSpan(hit.clientWidth || screen.width, hit.clientHeight || screen.height, ratio, 'contain'),
              })
              pan.x = aimed.x
              pan.y = aimed.y
              aimPoint = null
            }
            const image = imagePointFromFace({
              faceTx: focus.tx,
              faceTy: focus.ty,
              scale: focus.scale * pan.scale,
              panX: pan.x,
              panY: pan.y,
              width: hit.clientWidth || screen.width,
              height: hit.clientHeight || screen.height,
              screenX: screen.x,
              screenY: screen.y,
            })
            pinch = { dist, scale: pan.scale, imageX: image.x, imageY: image.y, hit, side }
          }
        }
        if (pinch) {
          const focus = faceShift(faceZoom(focusBox(pairRef.current[pinch.side].face_box)))
          const nextScale = clamp(pinch.scale * (dist / pinch.dist), 0.55, 2.6)
          const screen = screenOn(pinch.hit, cx, cy)
          const next = facePanToPoint({
            faceTx: focus.tx,
            faceTy: focus.ty,
            scale: focus.scale * nextScale,
            width: screen.width,
            height: screen.height,
            imageX: pinch.imageX,
            imageY: pinch.imageY,
            screenX: screen.x,
            screenY: screen.y,
          })
          const fitted = clampHeld(next.x, next.y, nextScale)
          pan.scale = nextScale
          pan.x = fitted.x
          pan.y = fitted.y
          moved = true
          publish(null, false)
        }
        return
      }
      pinch = null
      if (holdId === null || !origin) return
      const point = pointers.get(holdId)
      if (!point) return
      if (!moved && Math.hypot(point.x - origin.x, point.y - origin.y) < 8) return
      const stage = stageRef.current
      const aim = stage ? pictureAim(stage, point.x, point.y) : null
      if (!aim) return
      moved = true
      aimPoint = aim
      pan.x = 0
      pan.y = 0
      publish(aim, 'follow')
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
        aimPoint = null
        pan.x = 0
        pan.y = 0
        pan.scale = 1
        pointers.set(event.pointerId, origin)
        faceHeldRef.current = true
        setFaceHeld(true)
        setFaceMotion('settle')
        setFaceAim(null)
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
        moved = false
        return
      }
      holdId = null
      origin = null
      pointers.clear()
      aimPoint = null
      pan.x = 0
      pan.y = 0
      pan.scale = 1
      faceHeldRef.current = false
      setFaceHeld(false)
      setFaceMotion('settle')
      setFaceAim(null)
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
        setFaceAim(null)
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
    if (!leftChanged && !rightChanged) return
    setMatchCount(count => count + 1)
    const side = leftChanged && rightChanged ? 'both' : leftChanged ? 'left' : 'right'
    setEntering(side)
    const timer = window.setTimeout(() => setEntering(current => current === side ? null : current), 280)
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
    const rested = restTranslate(zoom)
    const scale = focus ? focus.scale * facePan.scale : rested.scale
    const tx = focus ? focus.tx : rested.tx
    const ty = focus ? focus.ty : rested.ty
    const side = image.id === right.id ? 'right' : 'left'
    const hit = hitRefs.current[side]
    const width = hit?.clientWidth || (frame ? (side === 'left' ? frame.left : frame.right) : 0)
    const height = hit?.clientHeight || frameRef.current?.clientHeight || 0
    const heldFit = faceAim ? 'contain' as const : fit
    let px = focus ? facePan.x : 0
    let py = focus ? facePan.y : 0
    if (focus && width > 1 && height > 1) {
      if (faceAim) {
        const aimed = faceAimPan({
          faceTx: focus.tx,
          faceTy: focus.ty,
          scale,
          width,
          height,
          imageX: faceAim.x,
          imageY: faceAim.y,
          span: contentSpan(width, height, side === 'left' ? leftRatio : rightRatio, 'contain'),
        })
        px = aimed.x
        py = aimed.y
      } else {
        px = clampInRanges(px, [facePanRange(focus.tx, width, scale)])
        py = clampInRanges(py, [facePanRange(focus.ty, height, scale)])
      }
    }
    return {
      transform: `translate(${px}px, ${py}px) translate(${tx}%, ${ty}%) scale(${scale})`,
      transformOrigin: '50% 50%',
      transition: faceMotion === 'settle' ? 'transform 250ms ease' : faceMotion === 'follow' ? 'transform 120ms ease-out' : undefined,
      objectFit: heldFit as 'contain' | 'cover',
    }
  }

  function pictureStats(image: BrushImage, layout: 'strip' | 'portrait', side: 'left' | 'right' = 'left') {
    const standing = rankFor(image.id)
    const ranked = image.games >= PLACEMENT_GAMES
    const level = levelOf(image.elo)
    const progress = ranked ? levelProgress(image.elo) : Math.min(1, image.games / PLACEMENT_GAMES)
    const closeWins = image.close_wins || 0
    const closeLosses = image.close_losses || 0
    const traits = (image.prompt_text || '').split(/[,·|;]/).map(item => item.trim()).filter(Boolean).slice(0, 3)
    const percent = Math.round(progress * 100)
    const badge = ranked ? (
      <div className={`brush-level-badge is-${levelTier(level)}${celebrateId === image.id ? ' is-rising' : ''}`} data-level={level}>
        <span>Level</span>
        <strong className="brush-num">{level}</strong>
      </div>
    ) : (
      <div className={`brush-level-badge is-unranked${celebrateId === image.id ? ' is-rising' : ''}`} data-unranked data-challenger>
        <strong>Unranked</strong>
      </div>
    )
    const track = (
      <div className="brush-level-track">
        <div className="brush-level-meta">
          <span>{ranked ? 'Next level' : 'Placement'}</span>
          <span className="brush-num">{ranked ? `${percent}%` : `${image.games}/${PLACEMENT_GAMES}`}</span>
        </div>
        <div className="brush-level-bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={ranked ? `Progress to level ${level + 1}` : `Placement ${image.games} of ${PLACEMENT_GAMES}`}>
          <span style={{ width: `${percent}%` }} />
        </div>
      </div>
    )
    if (layout === 'strip') {
      const open = stripOpen[side]
      return (
        <div className="brush-stats is-strip" data-stats="strip" data-open={open ? 'true' : 'false'}>
          <div className="brush-strip-id">
            <strong>{image.country || image.name || 'Untitled'}</strong>
          </div>
          <button
            type="button"
            className="brush-strip-toggle"
            aria-expanded={open}
            aria-label={`${image.country || image.name || 'Untitled'}, ${ranked ? `level ${level}` : 'unranked'}`}
            onClick={event => {
              event.stopPropagation()
              setStripOpen(current => ({ ...current, [side]: !current[side] }))
            }}
          >
            {badge}
            <span className="brush-strip-glance">
              <span data-stat="rank" title={standing ? `#${standing.rank} of ${standing.total} ranked` : 'Unranked'}>{standing ? `#${standing.rank}` : '—'}</span>
              <span aria-hidden="true"> · </span>
              <span className="brush-num">{image.wins}–{image.losses}</span>
            </span>
          </button>
          <div className="brush-strip-more">
            <small>{image.name}</small>
            {track}
            <div className="brush-strip-stat" data-stat="rating">
              <span>Rating</span>
              <strong className="brush-num">{Math.round(image.elo)}</strong>
            </div>
            <div className="brush-strip-stat" data-stat="close">
              <span>Close calls</span>
              <strong className="brush-num">{closeWins}–{closeLosses}</strong>
            </div>
            {traits.length > 0 && <p className="brush-strip-traits">{traits.join(' · ')}</p>}
          </div>
        </div>
      )
    }
    return (
      <div className={`brush-stats is-${layout}`} data-stats={layout}>
        <div className="brush-strip-id">
          <strong>{image.country || image.name || 'Untitled'}</strong>
          <small>{image.name}</small>
        </div>
        {badge}
        {track}
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

  function playFarewell(kind: 'pick' | 'close' | 'trash', side: 'left' | 'right', act: () => void) {
    if (Date.now() < lockRef.current) return
    lockRef.current = Date.now() + 700
    const other = side === 'left' ? 'right' : 'left'
    setGlow(null)
    setFarewell(kind === 'trash' ? { winner: other, loser: side } : { winner: side, loser: other })
    window.setTimeout(() => {
      if (aliveRef.current) setFarewell(null)
      act()
    }, 280)
  }

  function choose(event: React.MouseEvent, id: string, margin: Margin) {
    if (locked(event)) return
    const side = id === left.id ? 'left' : 'right'
    playFarewell(margin === 'close' ? 'close' : 'pick', side, () => onPick(id, margin))
  }

  function discard(event: React.MouseEvent, id: string) {
    if (locked(event)) return
    const side = id === left.id ? 'left' : 'right'
    playFarewell('trash', side, () => onTrash(id))
  }

  function swipeCommit(kind: 'pick' | 'close' | 'trash', side: 'left' | 'right') {
    const image = side === 'left' ? left : right
    playFarewell(kind, side, () => {
      if (kind === 'trash') onTrash(image.id)
      else onPick(image.id, kind === 'close' ? 'close' : 'clear')
    })
  }

  function onAim(side: 'left' | 'right' | null) {
    if (farewell) return
    setGlow(side)
  }

  return (
    <div className="brush-stage" data-screen="match" ref={frameRef}>
      {!portrait && (
        <aside className="brush-info-strip is-left" data-strip="left">
          <div className="brush-strip-tools">{leftChrome}</div>
          <div className="brush-strip-body">{pictureStats(left, 'strip', 'left')}</div>
        </aside>
      )}
      <div className="brush-photos" ref={stageRef}>
        {cards.map(({ image, side }) => {
          const src = side === 'left' ? leftSrc : rightSrc
          const sized = !portrait && frame ? { width: side === 'left' ? frame.left : frame.right, aspectRatio: 'auto' } : undefined
          return (
            <article key={image.id} className={`brush-card${front === side ? ' is-front' : ''}${glow === side ? ' is-glow' : ''}${glow && glow !== side ? ' is-dim' : ''}${farewell?.winner === side ? ' is-shimmer' : ''}${farewell?.loser === side ? ' is-farewell' : ''}`} data-side={side} data-image={image.id} data-name={image.name} style={sized}>
              <div className="brush-photo-hit" ref={node => { hitRefs.current[side] = node }} onClick={onPhotoClick}>
                {src ? (
                  <div className={`brush-slide${entering === side || entering === 'both' ? ' is-entering' : ''}`}>
                    <img className="brush-photo" src={src} alt={image.name} style={photoStyle(image)} draggable={false} />
                  </div>
                ) : <div className="brush-photo" />}
                <div className="brush-photo-glow" />
              </div>
              {portrait && <div className="brush-portrait-stats">{pictureStats(image, 'portrait')}</div>}
            </article>
          )
        })}
      </div>
      {!portrait && (
        <aside className="brush-info-strip is-right" data-strip="right">
          <div className="brush-strip-tools">{rightChrome}</div>
          <div className="brush-strip-body">{pictureStats(right, 'strip', 'right')}</div>
        </aside>
      )}
      {!portrait && (
        <aside className="brush-controls" data-gutter="controls">
          <p key={matchCount} className="brush-match-count" data-match-count>Match {matchCount}</p>
          {notice}
          <div className="brush-gutter-actions">
            <div className="brush-control-row">
              <SwipePad kind="pick" label="WINNER" leftName={left.country || left.name} rightName={right.country || right.name} onCommit={swipeCommit} onAim={onAim} />
            </div>
            <div className="brush-control-row">
              <SwipePad kind="trash" label="Trash" leftName={left.country || left.name} rightName={right.country || right.name} onCommit={swipeCommit} onAim={onAim} />
              <SwipePad kind="close" label="Close call" leftName={left.country || left.name} rightName={right.country || right.name} onCommit={swipeCommit} onAim={onAim} />
            </div>
            <div className="brush-control-row">
              <FaceHoldButton pressed={faceHeld} />
            </div>
          </div>
        </aside>
      )}
      {portrait && (
        <p key={matchCount} className="brush-match-count" data-match-count>Match {matchCount}</p>
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
      <PadIcon kind="face" />
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
