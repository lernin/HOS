export type Zoom = { scale: number, x: number, y: number }

export const REST_ZOOM: Zoom = { scale: 1, x: 0.5, y: 0.5 }

export type ContentSpan = { x0: number, x1: number, y0: number, y1: number }

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function imagePointAt(zoom: Zoom, screenX: number, screenY: number) {
  return {
    x: zoom.x + (screenX - 0.5) / zoom.scale,
    y: zoom.y + (screenY - 0.5) / zoom.scale,
  }
}

export function zoomAround(scale: number, imageX: number, imageY: number, screenX: number, screenY: number): Zoom {
  return {
    scale,
    x: imageX - (screenX - 0.5) / scale,
    y: imageY - (screenY - 0.5) / scale,
  }
}

export function clampZoom(zoom: Zoom): Zoom {
  const scale = clamp(zoom.scale, 1, 4)
  const inset = (scale - 1) / (2 * scale)
  return {
    scale,
    x: clamp(zoom.x, 0.5 - inset, 0.5 + inset),
    y: clamp(zoom.y, 0.5 - inset, 0.5 + inset),
  }
}

export function panZoom(zoom: Zoom, dx: number, dy: number, width: number, height: number): Zoom {
  return clampZoom({
    scale: zoom.scale,
    x: zoom.x - dx / Math.max(1, width) / zoom.scale,
    y: zoom.y - dy / Math.max(1, height) / zoom.scale,
  })
}

export function restTranslate(zoom: Zoom) {
  const fitted = clampZoom(zoom)
  return {
    tx: (0.5 - fitted.x) * fitted.scale * 100,
    ty: (0.5 - fitted.y) * fitted.scale * 100,
    scale: fitted.scale,
  }
}

export function facePanRange(basePercent: number, size: number, scale: number) {
  const limit = Math.max(0, (scale - 1) * Math.max(0, size) / 2)
  const base = (basePercent / 100) * size
  return { min: -limit - base, max: limit - base }
}

export function clampInRanges(value: number, ranges: { min: number, max: number }[]) {
  if (!ranges.length) return value
  let min = Number.NEGATIVE_INFINITY
  let max = Number.POSITIVE_INFINITY
  let unionMin = Number.POSITIVE_INFINITY
  let unionMax = Number.NEGATIVE_INFINITY
  for (const range of ranges) {
    const low = Math.min(range.min, range.max)
    const high = Math.max(range.min, range.max)
    min = Math.max(min, low)
    max = Math.min(max, high)
    unionMin = Math.min(unionMin, low)
    unionMax = Math.max(unionMax, high)
  }
  if (min > max) {
    if (value > max && value < min) return value - max <= min - value ? max : min
    return clamp(value, unionMin, unionMax)
  }
  return clamp(value, min, max)
}

export function facePanToPoint(input: {
  faceTx: number
  faceTy: number
  scale: number
  width: number
  height: number
  imageX: number
  imageY: number
  screenX: number
  screenY: number
}) {
  return {
    x: (input.screenX - 0.5 - (input.imageX - 0.5) * input.scale - input.faceTx / 100) * input.width,
    y: (input.screenY - 0.5 - (input.imageY - 0.5) * input.scale - input.faceTy / 100) * input.height,
  }
}

export function contentSpan(elementWidth: number, elementHeight: number, imageRatio: number, fit: 'contain' | 'cover'): ContentSpan {
  const full: ContentSpan = { x0: 0, x1: 1, y0: 0, y1: 1 }
  if (fit === 'cover' || elementWidth <= 1 || elementHeight <= 1 || !(imageRatio > 0)) return full
  const elementRatio = elementWidth / elementHeight
  if (Math.abs(elementRatio - imageRatio) < 0.01) return full
  if (imageRatio > elementRatio) {
    const inset = (1 - elementRatio / imageRatio) / 2
    return { x0: 0, x1: 1, y0: inset, y1: 1 - inset }
  }
  const inset = (1 - imageRatio / elementRatio) / 2
  return { x0: inset, x1: 1 - inset, y0: 0, y1: 1 }
}

// Place a picture point at the zoom center, then stop at the picture edges.
// Finger fraction 0 is the top or left of the picture; 1 is the bottom or right.
export function faceAimPan(input: {
  faceTx: number
  faceTy: number
  scale: number
  width: number
  height: number
  imageX: number
  imageY: number
  span?: ContentSpan
}) {
  const span = input.span ?? { x0: 0, x1: 1, y0: 0, y1: 1 }
  const ex = span.x0 + clamp(input.imageX, 0, 1) * (span.x1 - span.x0)
  const ey = span.y0 + clamp(input.imageY, 0, 1) * (span.y1 - span.y0)
  const baseX = input.faceTx / 100 * input.width
  const baseY = input.faceTy / 100 * input.height
  const centerX = -(ex - 0.5) * input.scale * input.width
  const centerY = -(ey - 0.5) * input.scale * input.height
  const edgeX = (edge: number, screen: number) => (screen - 0.5 - (edge - 0.5) * input.scale) * input.width - baseX
  const edgeY = (edge: number, screen: number) => (screen - 0.5 - (edge - 0.5) * input.scale) * input.height - baseY
  const minX = Math.min(edgeX(span.x0, 0), edgeX(span.x1, 1))
  const maxX = Math.max(edgeX(span.x0, 0), edgeX(span.x1, 1))
  const minY = Math.min(edgeY(span.y0, 0), edgeY(span.y1, 1))
  const maxY = Math.max(edgeY(span.y0, 0), edgeY(span.y1, 1))
  return {
    x: clamp(centerX - baseX, minX, maxX),
    y: clamp(centerY - baseY, minY, maxY),
  }
}

export function faceEdgePan(input: {
  faceTx: number
  faceTy: number
  scale: number
  width: number
  height: number
  span?: ContentSpan
}) {
  const top = faceAimPan({ ...input, imageX: 0.5, imageY: 0 })
  const bottom = faceAimPan({ ...input, imageX: 0.5, imageY: 1 })
  const left = faceAimPan({ ...input, imageX: 0, imageY: 0.5 })
  const right = faceAimPan({ ...input, imageX: 1, imageY: 0.5 })
  return {
    minX: Math.min(left.x, right.x),
    maxX: Math.max(left.x, right.x),
    minY: Math.min(top.y, bottom.y),
    maxY: Math.max(top.y, bottom.y),
  }
}

export function faceDragGain(travel: number, min: number, max: number) {
  return Math.max(1, (max - min) / Math.max(1, travel))
}

// Drag down and right reveal lower and righter parts of the picture.
export function faceDragPan(input: {
  originX: number
  originY: number
  x: number
  y: number
  startX: number
  startY: number
  gainX: number
  gainY: number
  minX: number
  maxX: number
  minY: number
  maxY: number
}) {
  return {
    x: clamp(input.startX - (input.x - input.originX) * input.gainX, input.minX, input.maxX),
    y: clamp(input.startY - (input.y - input.originY) * input.gainY, input.minY, input.maxY),
  }
}

export function approach(current: number, target: number, amount: number) {
  if (!(amount > 0)) return current
  if (amount >= 1) return target
  const next = current + (target - current) * amount
  return Math.abs(target - next) <= 0.35 ? target : next
}

export function imagePointFromFace(input: {
  faceTx: number
  faceTy: number
  scale: number
  panX: number
  panY: number
  width: number
  height: number
  screenX: number
  screenY: number
}) {
  return {
    x: 0.5 + (input.screenX - 0.5 - input.faceTx / 100 - input.panX / Math.max(1, input.width)) / input.scale,
    y: 0.5 + (input.screenY - 0.5 - input.faceTy / 100 - input.panY / Math.max(1, input.height)) / input.scale,
  }
}
