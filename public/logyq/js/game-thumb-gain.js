/* Progressive touch movement amplification for LOGYQ game-piece placement. */
(() => {
  'use strict'

  const KEY = 'logyq_game_thumb_gain_v1'
  const MODE_KEY = 'logyq_game_thumb_gain_mode_v1'
  const MIN = 1
  const MAX = 5
  const STEP = 0.2
  const STEPS = Math.round((MAX - MIN) / STEP)
  const normalize = (input) => {
    const value = Number(input)
    if (!Number.isFinite(value)) return null
    const index = Math.max(0, Math.min(STEPS, Math.round((value - MIN) / STEP)))
    return Number((MIN + index * STEP).toFixed(1))
  }
  const autoValue = (levelNumber) => normalize(MIN + Math.max(0, (Number(levelNumber) || 1) - 1) * STEP) ?? MIN
  const readMode = () => {
    try { return localStorage.getItem(MODE_KEY) === 'manual' ? 'manual' : 'auto' } catch (_error) { return 'auto' }
  }
  const readManual = () => {
    try { return normalize(localStorage.getItem(KEY)) ?? MIN } catch (_error) { return MIN }
  }
  let mode = readMode()
  let gain = mode === 'manual' ? readManual() : MIN
  let level = 1
  const announce = () => window.dispatchEvent(new CustomEvent('logyq-game-thumb-gainchange', { detail: { value: gain, mode, level } }))
  const saveManual = () => {
    try {
      localStorage.setItem(KEY, gain.toFixed(1))
      localStorage.setItem(MODE_KEY, 'manual')
    } catch (_error) {}
  }
  const setManual = (value) => {
    gain = normalize(value) ?? gain
    mode = 'manual'
    saveManual()
    announce()
    return gain
  }
  const setLevel = (levelNumber) => {
    level = Math.max(1, Math.round(Number(levelNumber) || 1))
    if (mode === 'auto') gain = autoValue(level)
    announce()
    return gain
  }
  const resetAutomatic = () => {
    mode = 'auto'
    gain = autoValue(level)
    try {
      localStorage.setItem(MODE_KEY, 'auto')
      localStorage.removeItem(KEY)
    } catch (_error) {}
    announce()
    return gain
  }
  window.LOGYQGameThumbGain = Object.freeze({
    value: () => gain,
    mode: () => mode,
    level: () => level,
    automatic: () => mode === 'auto',
    automaticValue: autoValue,
    set: setManual,
    setLevel,
    resetAutomatic,
    step(direction) {
      const sign = Number(direction)
      if (!Number.isFinite(sign) || sign === 0) return gain
      return setManual(gain + Math.sign(sign) * STEP)
    },
    min: MIN,
    max: MAX,
    stepSize: STEP,
  })
})()
