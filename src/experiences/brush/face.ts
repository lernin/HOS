import type { FaceBox } from './types'
import { focusBox as focusKnown, UPPER_FACE } from './face-box.ts'

export { UPPER_FACE }
export const focusBox = focusKnown

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function skin(r: number, g: number, b: number) {
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b
  return cr > 133 && cr < 173 && cb > 77 && cb < 127 && r > 60 && g > 30 && r > g && r > b - 15
}

export function faceBoxFromPixels(width: number, height: number, data: Uint8ClampedArray): FaceBox | null {
  if (width < 8 || height < 8 || data.length < width * height * 4) return null
  const mask = new Uint8Array(width * height)
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4
    mask[index] = skin(data[offset], data[offset + 1], data[offset + 2]) ? 1 : 0
  }
  const seen = new Uint8Array(width * height)
  let best: { area: number, minX: number, minY: number, maxX: number, maxY: number, score: number } | null = null
  const stack: number[] = []
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue
    let area = 0
    let minX = width
    let minY = height
    let maxX = 0
    let maxY = 0
    stack.push(start)
    seen[start] = 1
    while (stack.length) {
      const index = stack.pop() as number
      const x = index % width
      const y = (index - x) / width
      area += 1
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
      const neighbors = [index - 1, index + 1, index - width, index + width]
      for (const next of neighbors) {
        if (next < 0 || next >= mask.length || seen[next] || !mask[next]) continue
        const nextX = next % width
        if (Math.abs(nextX - x) > 1) continue
        seen[next] = 1
        stack.push(next)
      }
    }
    const boxW = maxX - minX + 1
    const boxH = maxY - minY + 1
    const shape = boxH / boxW
    if (area < width * height * 0.01 || shape < 0.7 || shape > 2.4) continue
    const centerY = (minY + maxY) / 2 / height
    if (centerY > 0.72) continue
    const centerX = (minX + maxX) / 2 / width
    const score = area * (1.2 - Math.abs(centerX - 0.5)) * (1.15 - Math.abs(centerY - 0.32))
    if (!best || score > best.score) best = { area, minX, minY, maxX, maxY, score }
  }
  if (!best) return null
  const padX = (best.maxX - best.minX + 1) * 0.18
  const padY = (best.maxY - best.minY + 1) * 0.22
  const x = clamp((best.minX - padX) / width, 0, 0.9)
  const y = clamp((best.minY - padY) / height, 0, 0.9)
  const right = clamp((best.maxX + 1 + padX) / width, x + 0.05, 1)
  const bottom = clamp((best.maxY + 1 + padY) / height, y + 0.05, 1)
  return { x, y, w: right - x, h: bottom - y }
}

type NativeFace = { boundingBox: { x: number, y: number, width: number, height: number } }
type NativeDetector = { detect: (source: CanvasImageSource) => Promise<NativeFace[]> }

function nativeDetector() {
  const factory = (globalThis as { FaceDetector?: new (options?: { fastMode?: boolean, maxDetectedFaces?: number }) => NativeDetector }).FaceDetector
  if (!factory) return null
  try { return new factory({ fastMode: true, maxDetectedFaces: 1 }) } catch { return null }
}

export async function detectFaceBox(source: CanvasImageSource): Promise<FaceBox | null> {
  const sized = 'naturalWidth' in source
    ? { width: source.naturalWidth, height: source.naturalHeight }
    : 'videoWidth' in source
      ? { width: source.videoWidth, height: source.videoHeight }
      : 'width' in source && typeof source.width === 'number' && 'height' in source && typeof source.height === 'number'
        ? { width: source.width, height: source.height }
        : null
  if (!sized?.width || !sized.height) return null
  const { width, height } = sized
  const detector = nativeDetector()
  if (detector) {
    try {
      const faces = await detector.detect(source)
      const box = faces[0]?.boundingBox
      if (box && box.width > 0 && box.height > 0) {
        const x = clamp(box.x / width, 0, 0.95)
        const y = clamp(box.y / height, 0, 0.95)
        const w = clamp(box.width / width, 0.05, 1 - x)
        const h = clamp(box.height / height, 0.05, 1 - y)
        return { x, y, w, h }
      }
    } catch { /* fall through to the pixel scan */ }
  }
  const sampleW = Math.max(24, Math.min(96, width))
  const sampleH = Math.max(24, Math.round(sampleW * height / width))
  const canvas = document.createElement('canvas')
  canvas.width = sampleW
  canvas.height = sampleH
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  context.drawImage(source, 0, 0, sampleW, sampleH)
  return faceBoxFromPixels(sampleW, sampleH, context.getImageData(0, 0, sampleW, sampleH).data)
}

export type FaceFrame = { scale: number, x: number, y: number, tx: number, ty: number }

// Place the eye line about a third of the way down, with the whole head and a
// little hair in frame. A bit closer than the first pass. If the head already
// touches the top, keep the image edge pinned instead of opening a gap.
export function faceZoom(box: FaceBox): FaceFrame {
  const eyeX = clamp(box.x + box.w * 0.5, 0, 1)
  const eyeY = clamp(box.y + box.h * 0.36, 0, 1)
  const above = Math.max(0.025, eyeY - box.y + box.h * 0.08)
  const below = Math.max(0.025, box.y + box.h - eyeY + box.h * 0.04)
  const half = Math.max(0.025, box.w * 0.54)
  const scale = clamp(Math.min(0.36 / above, 0.68 / below, 0.52 / half, 3.5), 1.35, 3.5)
  const targetY = clamp(0.33, 1 - (1 - eyeY) * scale, eyeY * scale)
  const targetX = clamp(0.5, 1 - (1 - eyeX) * scale, eyeX * scale)
  return {
    scale,
    x: eyeX,
    y: eyeY,
    tx: (targetX - eyeX) * 100,
    ty: (targetY - eyeY) * 100,
  }
}

// Eyes sit about a third of the way down a face box. With no box, assume a
// centered face on that same line. This is a point on the picture, not a zoom.
export const EYE_LINE = 0.33

export function faceEye(box: FaceBox | null | undefined) {
  if (!box || box.w <= 0.02 || box.h <= 0.02 || box.x < -0.02 || box.y < -0.02 || box.x + box.w > 1.05 || box.y + box.h > 1.05) {
    return { x: 0.5, y: EYE_LINE }
  }
  return {
    x: clamp(box.x + box.w * 0.5, 0, 1),
    y: clamp(box.y + box.h * 0.36, 0, 1),
  }
}

// Same framing, written as translate+scale around the center so a pinch zoom
// and a face zoom can ease into each other.
export function faceShift(frame: FaceFrame) {
  const targetX = frame.x + frame.tx / 100
  const targetY = frame.y + frame.ty / 100
  return {
    scale: frame.scale,
    tx: (targetX - 0.5 - (frame.x - 0.5) * frame.scale) * 100,
    ty: (targetY - 0.5 - (frame.y - 0.5) * frame.scale) * 100,
  }
}
