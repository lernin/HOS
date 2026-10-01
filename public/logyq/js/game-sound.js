/* LOGYQ game audio + minimal game shell. Music: "My Street" by congusbongus, CC0. */
(() => {
  'use strict'

  const SFX_KEY = 'logyq_game_sfx_volume_v1'
  const LEGACY_SFX_KEY = 'logyq_game_sound_v1'
  const MUSIC_KEY = 'logyq_game_music_volume_v1'
  const MUSIC_URL = 'https://opengameart.org/sites/default/files/my_street.ogg'
  const DEFAULT_SFX = 0.55
  const DEFAULT_MUSIC = 0.16
  const clamp = (value) => Math.max(0, Math.min(1, Number(value) || 0))
  const readVolume = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key)
      if (raw !== null && Number.isFinite(Number(raw))) return clamp(raw)
    } catch (_error) {}
    return fallback
  }

  // --- synthesized sound effects -------------------------------------------------
  let sfxVolume = readVolume(SFX_KEY, DEFAULT_SFX)
  try {
    if (localStorage.getItem(SFX_KEY) === null && localStorage.getItem(LEGACY_SFX_KEY) === 'off') sfxVolume = 0
  } catch (_error) {}
  let lastSfxVolume = sfxVolume > 0 ? sfxVolume : DEFAULT_SFX
  let context = null, master = null, lastDrop = -Infinity
  const voices = new Set()
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext

  function stopSfx() {
    for (const voice of voices) { try { voice.stop() } catch (_error) {} }
    voices.clear()
  }
  function applySfxVolume() {
    if (master && context) master.gain.setValueAtTime(sfxVolume, context.currentTime)
  }
  function setSfxVolume(value) {
    sfxVolume = clamp(value)
    if (sfxVolume > 0) lastSfxVolume = sfxVolume
    try {
      localStorage.setItem(SFX_KEY, String(sfxVolume))
      localStorage.setItem(LEGACY_SFX_KEY, sfxVolume > 0 ? 'on' : 'off')
    } catch (_error) {}
    if (sfxVolume === 0) stopSfx()
    applySfxVolume()
    return sfxVolume
  }
  function setSfxEnabled(value) {
    return setSfxVolume(value ? (lastSfxVolume || DEFAULT_SFX) : 0)
  }
  async function unlockSfx() {
    if (sfxVolume <= 0 || !AudioContextCtor) return false
    try {
      if (!context) {
        context = new AudioContextCtor()
        master = context.createGain()
        master.gain.value = sfxVolume
        master.connect(context.destination)
      }
      if (context.state === 'suspended') await context.resume()
      applySfxVolume()
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
  function playSfx(kind) {
    if (sfxVolume <= 0 || context?.state !== 'running') return false
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
    supported: !!AudioContextCtor,
    enabled: () => sfxVolume > 0,
    volume: () => sfxVolume,
    setVolume: setSfxVolume,
    setEnabled: setSfxEnabled,
    unlock: unlockSfx,
    stop: stopSfx,
    drop: () => playSfx('drop'),
    complete: () => playSfx('complete'),
  })

  // --- CC0 gameplay music ---------------------------------------------------------
  let musicVolume = readVolume(MUSIC_KEY, DEFAULT_MUSIC)
  let music = null
  let musicActive = false

  function ensureMusic() {
    if (music || typeof window.Audio !== 'function') return music
    music = new window.Audio(MUSIC_URL)
    music.loop = true
    music.preload = 'none'
    music.volume = musicVolume
    return music
  }
  function playMusic() {
    const player = ensureMusic()
    if (!player || !musicActive || musicVolume <= 0) return false
    player.volume = musicVolume
    try {
      const result = player.play()
      result?.catch?.(() => {})
      return true
    } catch (_error) { return false }
  }
  function setMusicVolume(value) {
    musicVolume = clamp(value)
    try { localStorage.setItem(MUSIC_KEY, String(musicVolume)) } catch (_error) {}
    if (music) music.volume = musicVolume
    if (musicVolume <= 0) music?.pause()
    else if (musicActive) playMusic()
    return musicVolume
  }
  function musicEnter() {
    musicActive = true
    return playMusic()
  }
  function musicLeave() {
    musicActive = false
    music?.pause()
    return true
  }

  window.LOGYQGameMusic = Object.freeze({
    supported: typeof window.Audio === 'function',
    source: MUSIC_URL,
    volume: () => musicVolume,
    setVolume: setMusicVolume,
    enter: musicEnter,
    leave: musicLeave,
    unlock: playMusic,
  })

  // --- game-only shell ------------------------------------------------------------
  function installGameShell() {
    if (document.getElementById('logyq-game-pause-panel')) return
    const bar = document.getElementById('logyq-game-bar')
    if (!bar) return

    const legacyName = document.getElementById('logyq-game-name')
    const legacyTier = document.getElementById('logyq-game-tier')
    const legacyStatus = document.getElementById('logyq-game-status')
    const legacyCheck = document.getElementById('logyq-game-check')
    const legacyNext = document.getElementById('logyq-game-next')
    const legacyLevels = document.getElementById('logyq-game-levels-button')
    if (!legacyName || !legacyStatus || !legacyNext || !legacyLevels) return

    const makeButton = (id, label, aria) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.id = id
      button.textContent = label
      if (aria) button.setAttribute('aria-label', aria)
      return button
    }
    const back = makeButton('logyq-game-back', 'Back', 'Back to levels')
    const puzzle = document.createElement('strong')
    puzzle.id = 'logyq-game-puzzle'
    puzzle.textContent = 'Puzzle'
    const pause = makeButton('logyq-game-pause', 'Ⅱ', 'Pause and settings')
    pause.setAttribute('aria-expanded', 'false')

    bar.replaceChildren(back, puzzle, pause)
    legacyName.hidden = true
    legacyName.className = 'logyq-game-source-name'
    legacyTier?.remove()
    legacyCheck?.remove()
    legacyLevels.remove()
    legacyNext.hidden = true
    bar.after(legacyName, legacyStatus, legacyNext)

    const panel = document.createElement('div')
    panel.id = 'logyq-game-pause-panel'
    panel.hidden = true
    panel.setAttribute('aria-hidden', 'true')
    panel.innerHTML = `
      <section class="logyq-game-pause-card" role="dialog" aria-modal="true" aria-labelledby="logyq-game-pause-title">
        <h2 id="logyq-game-pause-title">Paused</h2>
        <button type="button" id="logyq-game-resume">Resume</button>
        <button type="button" id="logyq-game-pause-levels">Levels</button>
        <label class="logyq-game-volume">Music
          <input id="logyq-game-music-volume" type="range" min="0" max="100" step="1" aria-label="Music volume">
        </label>
        <label class="logyq-game-volume">Sound effects
          <input id="logyq-game-sfx-volume" type="range" min="0" max="100" step="1" aria-label="Sound effects volume">
        </label>
        <p class="logyq-game-track">Music: “My Street” · congusbongus · CC0</p>
      </section>`
    document.body.appendChild(panel)

    document.querySelectorAll('.logyq-game-sound-control').forEach((node) => node.remove())

    const style = document.createElement('style')
    style.id = 'logyq-game-shell-style'
    style.textContent = `
      body.logyq-game #logiq-mobile-header{display:none!important}
      body.logyq-game>header,body.logyq-game #logyq-map-title,body.logyq-game #logiq-mobile-panel,body.logyq-game #logyq-paint-strip,body.logyq-game #logyq-warehouse,body.logyq-game #logyq-bank-trash,body.logyq-game #trash{display:none!important}
      body.logyq-game #logyq-game-bar{position:fixed;z-index:80;top:max(10px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);width:min(420px,calc(100vw - 24px));height:48px;box-sizing:border-box;padding:5px 6px;display:grid;grid-template-columns:86px 1fr 86px;align-items:center;gap:6px;border:1px solid rgba(226,232,240,.92);border-radius:17px;background:rgba(255,255,255,.94);box-shadow:0 6px 22px rgba(15,23,42,.12);backdrop-filter:blur(12px)}
      body.logyq-game #logyq-game-bar button{height:36px;border:0;border-radius:12px;background:transparent;color:#334155;font:650 14px/1 system-ui;touch-action:manipulation}
      body.logyq-game #logyq-game-back{text-align:left;padding:0 10px}
      body.logyq-game #logyq-game-pause{justify-self:end;width:42px;padding:0;font-size:18px}
      body.logyq-game #logyq-game-puzzle{text-align:center;color:#0f172a;font:750 16px/1 system-ui;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      body.logyq-game #logyq-game-status{position:fixed;z-index:72;top:calc(max(10px,env(safe-area-inset-top)) + 54px);left:18px;right:18px;margin:0;text-align:center;pointer-events:none;color:#64748b;font:600 12px/1.25 system-ui;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #logyq-game-next{position:fixed;z-index:85;left:50%;transform:translateX(-50%);bottom:calc(32px + env(safe-area-inset-bottom));min-width:190px;min-height:56px;padding:0 30px;border:0;border-radius:18px;background:#0f172a;color:white;font:750 18px/1 system-ui;box-shadow:0 10px 30px rgba(15,23,42,.28);touch-action:manipulation}
      #logyq-game-next[hidden]{display:none!important}
      #logyq-game-pause-panel{position:fixed;inset:0;z-index:5000;display:grid;place-items:center;padding:22px;background:rgba(15,23,42,.28);backdrop-filter:blur(10px)}
      #logyq-game-pause-panel[hidden]{display:none!important}
      .logyq-game-pause-card{box-sizing:border-box;width:min(360px,100%);padding:20px;display:grid;gap:12px;border:1px solid rgba(226,232,240,.95);border-radius:24px;background:rgba(255,255,255,.97);box-shadow:0 22px 60px rgba(15,23,42,.25)}
      .logyq-game-pause-card h2{margin:0 0 2px;text-align:center;color:#0f172a;font:750 22px/1.2 system-ui}
      .logyq-game-pause-card>button{min-height:48px;border:1px solid #e2e8f0;border-radius:15px;background:#fff;color:#0f172a;font:700 16px/1 system-ui}
      .logyq-game-pause-card>button:first-of-type{background:#0f172a;color:#fff;border-color:#0f172a}
      .logyq-game-volume{display:grid;grid-template-columns:110px 1fr;align-items:center;gap:12px;color:#334155;font:650 14px/1.2 system-ui}
      .logyq-game-volume input{width:100%;accent-color:#334155}
      .logyq-game-track{margin:2px 0 0;text-align:center;color:#94a3b8;font:500 11px/1.3 system-ui}
      body.logyq-game.logyq-game-paused svg#canvas,body.logyq-game.logyq-game-paused #Dock{pointer-events:none}
      @media (orientation:landscape) and (max-height:600px){.logyq-game-pause-card{padding:14px;gap:8px}.logyq-game-pause-card>button{min-height:42px}}
    `
    document.head.appendChild(style)

    const syncPuzzle = () => {
      const match = String(legacyName.textContent || '').match(/^\s*(\d+)/)
      puzzle.textContent = match ? 'Puzzle ' + match[1] : 'Puzzle'
    }
    new MutationObserver(syncPuzzle).observe(legacyName, { childList: true, characterData: true, subtree: true })
    syncPuzzle()

    const musicInput = document.getElementById('logyq-game-music-volume')
    const sfxInput = document.getElementById('logyq-game-sfx-volume')
    musicInput.value = String(Math.round(musicVolume * 100))
    sfxInput.value = String(Math.round(sfxVolume * 100))
    musicInput.addEventListener('input', () => setMusicVolume(Number(musicInput.value) / 100))
    sfxInput.addEventListener('input', () => setSfxVolume(Number(sfxInput.value) / 100))

    const openPause = () => {
      if (!document.body.classList.contains('logyq-game')) return
      panel.hidden = false
      panel.setAttribute('aria-hidden', 'false')
      pause.setAttribute('aria-expanded', 'true')
      document.body.classList.add('logyq-game-paused')
      document.getElementById('logyq-game-resume')?.focus()
    }
    const closePause = () => {
      panel.hidden = true
      panel.setAttribute('aria-hidden', 'true')
      pause.setAttribute('aria-expanded', 'false')
      document.body.classList.remove('logyq-game-paused')
    }
    const openLevels = () => {
      closePause()
      legacyLevels.click()
    }
    back.addEventListener('click', openLevels)
    pause.addEventListener('click', openPause)
    document.getElementById('logyq-game-resume').addEventListener('click', closePause)
    document.getElementById('logyq-game-pause-levels').addEventListener('click', openLevels)
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !panel.hidden) { event.preventDefault(); closePause() }
    })

    let wasPlaying = false
    const syncMusicState = () => {
      const shouldPlay = document.body.classList.contains('logyq-game') && !document.body.classList.contains('logyq-home')
      if (shouldPlay && !wasPlaying) musicEnter()
      if (!shouldPlay && wasPlaying) musicLeave()
      if (!document.body.classList.contains('logyq-game')) closePause()
      wasPlaying = shouldPlay
    }
    new MutationObserver(syncMusicState).observe(document.body, { attributes: true, attributeFilter: ['class'] })
    syncMusicState()

    document.addEventListener('pointerdown', (event) => {
      const openingLevel = event.target?.closest?.('[data-game-level]')
      if (openingLevel) musicEnter()
      if (document.body.classList.contains('logyq-game')) {
        playMusic()
        unlockSfx()
      }
    }, true)
  }

  const bootShell = () => setTimeout(installGameShell, 0)
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootShell, { once: true })
  else bootShell()
})()