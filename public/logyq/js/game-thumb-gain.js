/* Saved touch sensitivity for game-piece placement. */
(() => {
  'use strict'

  const KEY = 'logyq_game_thumb_gain_v1'
  const MIN = 1
  const MAX = 6
  const STEP = 0.2
  const STEPS = Math.round((MAX - MIN) / STEP)
  const normalize = (input) => {
    const value = Number(input)
    if (!Number.isFinite(value)) return null
    const index = Math.max(0, Math.min(STEPS, Math.round((value - MIN) / STEP)))
    return Number((MIN + index * STEP).toFixed(1))
  }
  const read = () => {
    try {
      const raw = localStorage.getItem(KEY)
      return raw == null ? 2.4 : (normalize(raw) ?? 2.4)
    } catch (_error) {
      return 2.4
    }
  }
  let gain = read()
  const set = (value) => {
    gain = normalize(value) ?? gain
    try { localStorage.setItem(KEY, gain.toFixed(1)) } catch (_error) {}
    return gain
  }
  window.LOGYQGameThumbGain = Object.freeze({
    value: () => gain,
    set,
    step(direction) {
      const sign = Number(direction)
      if (!Number.isFinite(sign) || sign === 0) return gain
      return set(gain + Math.sign(sign) * STEP)
    },
    min: MIN,
    max: MAX,
    stepSize: STEP,
  })
})()
