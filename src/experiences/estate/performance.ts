// Pure graphics-governor helpers. 1.0 means 100% of the existing Graphics preset.
export const MIN_AUTO_RESOLUTION = .4

export function clampResolutionCeiling(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return .8
  return Math.max(.5, Math.min(1, Math.round(value * 100) / 100))
}

function twoDecimals(value: number): number {
  return Math.round(value * 100) / 100
}

export function effectivePixelRatio(devicePixelRatio: number, quality: number, scale: number): number {
  const preset = quality === 0 ? .85 : quality === 2 ? 1.35 : 1
  const device = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1
  return twoDecimals(Math.min(device, preset) * Math.max(MIN_AUTO_RESOLUTION, Math.min(1, scale)))
}

export function initialAdaptiveScale(ceiling: number, enabled: boolean): number {
  const max = clampResolutionCeiling(ceiling)
  return enabled ? Math.min(max, .8) : max
}

export function advanceAdaptiveScale(
  scale: number,
  ceiling: number,
  fps: number,
  goodWindows: number,
): { scale: number; goodWindows: number } {
  const max = clampResolutionCeiling(ceiling)
  const current = Math.max(MIN_AUTO_RESOLUTION, Math.min(max, scale))
  if (!Number.isFinite(fps) || fps <= 0) return { scale: current, goodWindows: 0 }
  if (fps < 35) return { scale: twoDecimals(Math.max(MIN_AUTO_RESOLUTION, current - .12)), goodWindows: 0 }
  if (fps < 50) return { scale: twoDecimals(Math.max(MIN_AUTO_RESOLUTION, current - .06)), goodWindows: 0 }
  if (fps >= 58) {
    const nextWindows = goodWindows + 1
    if (nextWindows >= 4) return { scale: twoDecimals(Math.min(max, current + .04)), goodWindows: 0 }
    return { scale: current, goodWindows: nextWindows }
  }
  return { scale: current, goodWindows: 0 }
}
