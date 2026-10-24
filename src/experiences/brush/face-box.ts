export type FaceBox = { x: number, y: number, w: number, h: number }

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export const UPPER_FACE: FaceBox = { x: 0.3, y: 0, w: 0.4, h: 0.4 }

export function focusBox(box: FaceBox | null | undefined) {
  if (!box || box.w <= 0.02 || box.h <= 0.02 || box.x + box.w > 1.05 || box.y + box.h > 1.05) return UPPER_FACE
  return box
}

export function boxFromPixels(width: number, height: number, topLeft: number[], bottomRight: number[]): FaceBox | null {
  if (width < 8 || height < 8) return null
  const x0 = Number(topLeft[0])
  const y0 = Number(topLeft[1])
  const x1 = Number(bottomRight[0])
  const y1 = Number(bottomRight[1])
  if (![x0, y0, x1, y1].every(Number.isFinite) || x1 <= x0 || y1 <= y0) return null
  const padX = (x1 - x0) * 0.2
  const padY = (y1 - y0) * 0.28
  const x = clamp((x0 - padX) / width, 0, 0.9)
  const y = clamp((y0 - padY * 1.15) / height, 0, 0.9)
  const right = clamp((x1 + padX) / width, x + 0.05, 1)
  const bottom = clamp((y1 + padY * 0.7) / height, y + 0.05, 1)
  const box = { x, y, w: right - x, h: bottom - y }
  if (box.w > 0.9 || box.h > 0.9) return null
  return box
}
