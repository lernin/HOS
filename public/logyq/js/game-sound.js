/* Quiet synthesized game feedback; no network audio assets. */
(() => {
  'use strict'
  const KEY = 'logyq_game_sound_v1'
  let on = true, context = null, master = null, lastDrop = -Infinity
  const voices = new Set()
  try { on = localStorage.getItem(KEY) !== 'off' } catch (_error) {}
  const Audio = window.AudioContext || window.webkitAudioContext
  function stop() {
    for (const voice of voices) { try { voice.stop() } catch (_error) {} }
    voices.clear()
  }
  function setEnabled(value) {
    on = !!value
    try { localStorage.setItem(KEY, on ? 'on' : 'off') } catch (_error) {}
    if (!on) stop()
    if (master) master.gain.setValueAtTime(on ? 0.55 : 0, context.currentTime)
  }
  // Called inside a user gesture; autoplay policy never blocks the puzzle.
  async function unlock() {
    if (!on || !Audio) return false
    try {
      if (!context) {
        context = new Audio()
        master = context.createGain()
        master.gain.value = 0.55
        master.connect(context.destination)
      }
      if (context.state === 'suspended') await context.resume()
      return context.state === 'running'
    } catch (_error) { return false }
  }
  function note(frequency, at, length, volume, type = 'sine') {
    const voice = context.createOscillator(), envelope = context.createGain()
    voice.type = type
    voice.frequency.setValueAtTime(frequency, at)
    envelope.gain.setValueAtTime(0.0001, at)
    envelope.gain.linearRampToValueAtTime(volume, at + 0.006)
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + length)
    voice.connect(envelope); envelope.connect(master)
    voices.add(voice)
    voice.onended = () => { voices.delete(voice); voice.disconnect(); envelope.disconnect() }
    voice.start(at); voice.stop(at + length + 0.01)
  }
  function play(kind) {
    if (!on || context?.state !== 'running') return false
    try {
      const now = context.currentTime + 0.005
      if (kind === 'drop') {
        if (now - lastDrop < 0.08) return false
        lastDrop = now
        note(620, now, 0.065, 0.04)
        note(180, now, 0.085, 0.025, 'triangle')
      } else {
        [523.25, 659.25, 783.99].forEach((frequency, i) => note(frequency, now + i * 0.12, 0.42, 0.06))
      }
      return true
    } catch (_error) { return false }
  }
  window.LOGYQGameSound = Object.freeze({
    supported:!!Audio, enabled:() => on, setEnabled, unlock, stop,
    drop:() => play('drop'), complete:() => play('complete'),
  })
})()
