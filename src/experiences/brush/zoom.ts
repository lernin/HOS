export type Zoom = { scale: number, x: number, y: number }

export const REST_ZOOM: Zoom = { scale: 1, x: 0.5, y: 0.5 }
export const FACE_PAN_GAIN = 2

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
