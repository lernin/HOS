/* Quiet synthesized game feedback; no network audio assets. */
(() => {
  'use strict'
  const KEY = 'logyq_game_sound_v1'
  const VOLUME_KEY = 'logyq_game_sfx_volume_v1'
  const MUSIC_VOLUME_KEY = 'logyq_game_music_volume_v1'
  const MUSIC_SOURCE = 'https://opengameart.org/sites/default/files/my_street.ogg'
  const DEFAULT_VOLUME = 0.55
  const DEFAULT_MUSIC_VOLUME = 0.16
  let volume = DEFAULT_VOLUME, context = null, master = null, lastDrop = -Infinity
  const voices = new Set()
  try {
    const savedVolume = localStorage.getItem(VOLUME_KEY)
    if (savedVolume !== null && Number.isFinite(Number(savedVolume))) volume = Math.max(0, Math.min(1, Number(savedVolume)))
    else if (localStorage.getItem(KEY) === 'off') volume = 0
  } catch (_error) {}
  let previousVolume = volume > 0 ? volume : DEFAULT_VOLUME
  const on = () => volume > 0
  const Audio = window.AudioContext || window.webkitAudioContext
  function stop() {
    for (const voice of voices) { try { voice.stop() } catch (_error) {} }
    voices.clear()
  }
  function setEnabled(value) {
    setVolume(value ? (previousVolume || DEFAULT_VOLUME) : 0)
  }
  function setVolume(value) {
    const next = Number(value)
    volume = Number.isFinite(next) ? Math.max(0, Math.min(1, next)) : DEFAULT_VOLUME
    if (volume > 0) previousVolume = volume
    try {
      localStorage.setItem(VOLUME_KEY, String(volume))
      localStorage.setItem(KEY, volume > 0 ? 'on' : 'off')
    } catch (_error) {}
    if (!volume) stop()
    if (master) master.gain.setValueAtTime(volume, context.currentTime)
    window.dispatchEvent(new Event('logyq-game-soundchange'))
    return volume
  }
  // Called inside a user gesture; autoplay policy never blocks the puzzle.
  async function unlock() {
    if (!on() || !Audio) return false
    try {
      if (!context) {
        context = new Audio()
        master = context.createGain()
        master.gain.value = volume
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
    if (!on() || context?.state !== 'running') return false
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
    supported:!!Audio, enabled:on, volume:() => volume, setVolume, setEnabled, unlock, stop,
    drop:() => play('drop'), complete:() => play('complete'),
  })

  let musicVolume = DEFAULT_MUSIC_VOLUME
  try {
    const savedMusicVolume = localStorage.getItem(MUSIC_VOLUME_KEY)
    if (savedMusicVolume !== null && Number.isFinite(Number(savedMusicVolume))) {
      musicVolume = Math.max(0, Math.min(1, Number(savedMusicVolume)))
    }
  } catch (_error) {}
  let musicPlayer = null
  let musicActive = false
  let musicPaused = false

  function getMusicPlayer() {
    if (musicPlayer || typeof window.Audio !== 'function') return musicPlayer
    musicPlayer = new window.Audio(MUSIC_SOURCE)
    musicPlayer.loop = true
    musicPlayer.preload = 'none'
    musicPlayer.volume = musicVolume
    return musicPlayer
  }
  function playMusic() {
    const player = getMusicPlayer()
    if (!player || !musicActive || musicPaused || musicVolume <= 0) return false
    player.volume = musicVolume
    try {
      const result = player.play()
      result?.catch?.(() => {})
      return true
    } catch (_error) { return false }
  }
  function setMusicVolume(value) {
    const next = Number(value)
    musicVolume = Number.isFinite(next) ? Math.max(0, Math.min(1, next)) : DEFAULT_MUSIC_VOLUME
    try { localStorage.setItem(MUSIC_VOLUME_KEY, String(musicVolume)) } catch (_error) {}
    if (musicPlayer) musicPlayer.volume = musicVolume
    if (musicVolume === 0) musicPlayer?.pause()
    else playMusic()
    return musicVolume
  }
  function enterMusic() {
    musicActive = true
    musicPaused = false
    return playMusic()
  }
  function pauseMusic() {
    musicPaused = true
    musicPlayer?.pause()
  }
  function resumeMusic() {
    musicPaused = false
    return playMusic()
  }
  function leaveMusic() {
    musicActive = false
    musicPaused = false
    musicPlayer?.pause()
  }
  window.LOGYQGameMusic = Object.freeze({
    supported: typeof window.Audio === 'function',
    source: MUSIC_SOURCE,
    volume: () => musicVolume,
    setVolume: setMusicVolume,
    enter: enterMusic,
    pause: pauseMusic,
    resume: resumeMusic,
    leave: leaveMusic,
  })
})()
