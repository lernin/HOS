/* Progressive touch movement amplification for LOGYQ game-piece placement. */
(() => {
  'use strict'

  const KEY = 'logyq_game_thumb_gain_v1'
  const MODE_KEY = 'logyq_game_thumb_gain_mode_v1'
  const EXPERIENCE_KEY = 'logyq_game_thumb_gain_experience_v1'
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
  const autoValue = (experienceSteps) => normalize(MIN + Math.max(0, Number(experienceSteps) || 0) * STEP) ?? MIN
  const readMode = () => {
    try { return localStorage.getItem(MODE_KEY) === 'manual' ? 'manual' : 'auto' } catch (_error) { return 'auto' }
  }
  const readManual = () => {
    try { return normalize(localStorage.getItem(KEY)) ?? MIN } catch (_error) { return MIN }
  }
  const readExperience = () => {
    try {
      const value = Number(localStorage.getItem(EXPERIENCE_KEY) || 0)
      return Number.isFinite(value) ? Math.max(0, Math.min(STEPS, Math.floor(value))) : 0
    } catch (_error) { return 0 }
  }
  let mode = readMode()
  let experience = readExperience()
  let gain = mode === 'manual' ? readManual() : autoValue(experience)
  const announce = () => window.dispatchEvent(new CustomEvent('logyq-game-thumb-gainchange', {
    detail: { value: gain, mode, experience }
  }))
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
  const advance = () => {
    if (mode !== 'auto') return gain
    experience = Math.min(STEPS, experience + 1)
    gain = autoValue(experience)
    try { localStorage.setItem(EXPERIENCE_KEY, String(experience)) } catch (_error) {}
    announce()
    return gain
  }
  const resetAutomatic = () => {
    mode = 'auto'
    gain = autoValue(experience)
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
    experience: () => experience,
    automatic: () => mode === 'auto',
    automaticValue: autoValue,
    set: setManual,
    advance,
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
