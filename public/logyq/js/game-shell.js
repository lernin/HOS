/* Small, game-only controls layered over the existing LOGYQ game flow. */
(() => {
  'use strict'

  function installGameShell() {
    const bar = document.getElementById('logyq-game-bar')
    if (!bar || document.getElementById('logyq-game-pause-panel')) return

    const legacyName = document.getElementById('logyq-game-name')
    const legacyTier = document.getElementById('logyq-game-tier')
    const legacyStatus = document.getElementById('logyq-game-status')
    const legacyCheck = document.getElementById('logyq-game-check')
    const legacyNext = document.getElementById('logyq-game-next')
    const legacyLevels = document.getElementById('logyq-game-levels-button')
    if (!legacyName || !legacyStatus || !legacyCheck || !legacyNext || !legacyLevels) return

    const button = (id, label, ariaLabel) => {
      const element = document.createElement('button')
      element.type = 'button'
      element.id = id
      element.textContent = label
      element.setAttribute('aria-label', ariaLabel)
      return element
    }

    const back = button('logyq-game-back', 'Back', 'Back to levels')
    const title = document.createElement('strong')
    title.id = 'logyq-game-puzzle'
    title.textContent = 'Puzzle'
    const hint = button('logyq-game-hint', '?', 'Hint')
    const pause = button('logyq-game-pause', '⚙', 'Game settings')
    pause.setAttribute('aria-expanded', 'false')
    const actions = document.createElement('div')
    actions.id = 'logyq-game-actions'
    actions.append(hint, pause)
    bar.replaceChildren(back, title, actions)

    const hiddenControls = document.createElement('div')
    hiddenControls.id = 'logyq-game-legacy-controls'
    hiddenControls.hidden = true
    hiddenControls.append(legacyName)
    if (legacyTier) hiddenControls.append(legacyTier)
    hiddenControls.append(legacyCheck, legacyLevels)
    bar.after(legacyStatus, legacyNext, hiddenControls)

    const panel = document.createElement('div')
    panel.id = 'logyq-game-pause-panel'
    panel.hidden = true
    panel.setAttribute('aria-hidden', 'true')
    panel.innerHTML = `
      <section class="logyq-game-pause-card" role="dialog" aria-modal="true" aria-labelledby="logyq-game-pause-title">
        <h2 id="logyq-game-pause-title">Settings</h2>
        <button type="button" id="logyq-game-resume">Close</button>
        <button type="button" id="logyq-game-pause-levels">All levels</button>
        <button type="button" id="logyq-game-pause-reset">Reset progress</button>
        <button type="button" id="logyq-game-celebration-lab">Celebration Lab</button>
        <button type="button" id="logyq-game-test-learner">Test learner</button>
        <button type="button" id="logyq-game-music-toggle" aria-pressed="true">Music: On</button>
        <label class="logyq-game-volume">Music volume
          <input id="logyq-game-music-volume" type="range" min="0" max="100" step="1" aria-label="Music volume">
        </label>
        <button type="button" id="logyq-game-sfx-toggle" aria-pressed="true">Sound effects: On</button>
        <label class="logyq-game-volume">Sound volume
          <input id="logyq-game-sfx-volume" type="range" min="0" max="100" step="1" aria-label="Sound effects volume">
        </label>
        <div class="logyq-game-thumb-gain">
          <span>Thumb movement</span>
          <div class="logyq-game-thumb-gain-controls">
            <button type="button" id="logyq-game-thumb-gain-down" aria-label="Reduce thumb movement">−</button>
            <output id="logyq-game-thumb-gain-value" aria-live="polite">2.4×</output>
            <button type="button" id="logyq-game-thumb-gain-up" aria-label="Increase thumb movement">+</button>
          </div>
          <small id="logyq-game-thumb-gain-mode">Automatic</small>
          <button type="button" id="logyq-game-thumb-gain-auto" hidden>Reset to automatic</button>
        </div>
      </section>`
    document.body.appendChild(panel)

    const style = document.createElement('style')
    style.id = 'logyq-game-shell-style'
    style.textContent = `
      body.logyq-game #logiq-mobile-header,body.logyq-game>header,body.logyq-game #logyq-map-title,body.logyq-game #logiq-mobile-panel,body.logyq-game #logyq-paint-strip,body.logyq-game #logyq-warehouse,body.logyq-game #logyq-bank-trash,body.logyq-game #trash{display:none!important}
      body.logyq-game:not(.logyq-home) #logyq-game-bar{position:fixed;z-index:80;top:max(10px,env(safe-area-inset-top));left:50%;right:auto;transform:translateX(-50%);width:min(420px,calc(100vw - 24px));height:48px;box-sizing:border-box;padding:5px 6px;display:grid;grid-template-columns:90px minmax(0,1fr) 90px;align-items:center;gap:6px;border:1px solid rgba(226,232,240,.92);border-radius:17px;background:rgba(255,255,255,.96);color:#0f172a;box-shadow:0 6px 22px rgba(15,23,42,.12);backdrop-filter:blur(12px)}
      body.logyq-game #logyq-game-bar button{height:36px;border:0;border-radius:12px;background:transparent;color:#0f172a;font:650 14px/1 system-ui;touch-action:manipulation}
      body.logyq-game #logyq-game-back{justify-self:start;text-align:left;padding:0 10px}
      body.logyq-game #logyq-game-actions{justify-self:end;display:flex;align-items:center;gap:2px}
      body.logyq-game #logyq-game-hint,body.logyq-game #logyq-game-pause{width:42px;padding:0;font-size:18px}
      body.logyq-game #logyq-game-hint{font-weight:850;font-size:19px}
      body.logyq-game #logyq-game-puzzle{text-align:center;color:#0f172a;font:750 16px/1 system-ui;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      body.logyq-game #Dock .chip.logyq-hint-piece{box-shadow:0 0 0 4px rgba(15,23,42,.22),0 0 0 8px rgba(255,255,255,.85);animation:logyq-hint-pulse 900ms ease-in-out infinite}
      #logyq-game-hint-overlay{position:fixed;inset:0;z-index:78;pointer-events:none}
      #logyq-game-hint-overlay svg{width:100%;height:100%;overflow:visible}
      #logyq-game-hint-overlay .logyq-hint-target{fill:rgba(255,255,255,.2);stroke:#0f172a;stroke-width:4;stroke-dasharray:8 7;animation:logyq-hint-pulse 900ms ease-in-out infinite}
      #logyq-game-hint-overlay .logyq-hint-arrow{fill:none;stroke:#0f172a;stroke-width:4;stroke-linecap:round;stroke-dasharray:9 8}
      @keyframes logyq-hint-pulse{50%{opacity:.42}}
      body.logyq-game #logyq-game-status{display:none!important}
      body.logyq-game #Dock .chip{position:relative}
      body.logyq-game #Dock .chip::before{content:"";position:absolute;inset:-14px}
      body.logyq-game #logyq-game-next{position:fixed;z-index:85;left:50%;transform:translateX(-50%);bottom:calc(32px + env(safe-area-inset-bottom));min-width:190px;min-height:56px;padding:0 30px;border:0;border-radius:18px;background:#0f172a;color:white;font:750 18px/1 system-ui;box-shadow:0 10px 30px rgba(15,23,42,.28);touch-action:manipulation}
      body.logyq-game #logyq-game-next[hidden]{display:none!important}
      #logyq-game-pause-panel{position:fixed;inset:0;z-index:5000;display:grid;place-items:center;padding:22px;background:rgba(15,23,42,.28);backdrop-filter:blur(10px)}
      #logyq-game-pause-panel[hidden]{display:none!important}
      .logyq-game-pause-card{box-sizing:border-box;width:min(360px,100%);padding:20px;display:grid;gap:12px;border:1px solid rgba(226,232,240,.95);border-radius:24px;background:rgba(255,255,255,.97);box-shadow:0 22px 60px rgba(15,23,42,.25)}
      .logyq-game-pause-card h2{margin:0 0 2px;text-align:center;color:#0f172a;font:750 22px/1.2 system-ui}
      .logyq-game-pause-card>button{min-height:48px;border:1px solid #e2e8f0;border-radius:15px;background:#fff;color:#0f172a;font:700 16px/1 system-ui}
      .logyq-game-pause-card>button:first-of-type{background:#0f172a;color:#fff;border-color:#0f172a}
      .logyq-game-volume{display:grid;grid-template-columns:110px 1fr;align-items:center;gap:12px;color:#334155;font:650 14px/1.2 system-ui}
      .logyq-game-volume input{width:100%;accent-color:#334155}
      .logyq-game-thumb-gain{display:grid;grid-template-columns:110px 1fr;align-items:center;gap:12px;color:#334155;font:650 14px/1.2 system-ui}
      .logyq-game-thumb-gain-controls{display:flex;align-items:center;justify-content:flex-end;gap:12px}
      .logyq-game-thumb-gain-controls button{width:38px;height:38px;border:1px solid #cbd5e1;border-radius:12px;background:#fff;color:#0f172a;font:700 21px/1 system-ui;touch-action:manipulation}
      #logyq-game-thumb-gain-value{min-width:48px;text-align:center;color:#0f172a;font:750 16px/1 system-ui;font-variant-numeric:tabular-nums}
      #logyq-game-thumb-gain-mode{grid-column:2;color:#64748b;font:600 12px/1.2 system-ui}
      #logyq-game-thumb-gain-auto{grid-column:2;min-height:34px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;color:#334155;font:650 12px/1 system-ui}
      body.logyq-game.logyq-game-paused svg#canvas,body.logyq-game.logyq-game-paused #Dock{pointer-events:none}
      @media (orientation:landscape) and (max-height:600px){.logyq-game-pause-card{padding:14px;gap:8px}.logyq-game-pause-card>button{min-height:42px}}
    `
    document.head.appendChild(style)

    const syncTitle = () => {
      const match = String(legacyName.textContent || '').match(/^\s*(\d+)/)
      title.textContent = match ? 'Puzzle ' + match[1] : 'Puzzle'
    }
    new MutationObserver(syncTitle).observe(legacyName, { childList: true, characterData: true, subtree: true })
    syncTitle()

    const sound = window.LOGYQGameSound
    const soundToggle = document.getElementById('logyq-game-sfx-toggle')
    const volume = document.getElementById('logyq-game-sfx-volume')
    const music = window.LOGYQGameMusic
    const musicToggle = document.getElementById('logyq-game-music-toggle')
    const musicVolume = document.getElementById('logyq-game-music-volume')
    const thumbGain = window.LOGYQGameThumbGain
    const thumbGainDown = document.getElementById('logyq-game-thumb-gain-down')
    const thumbGainUp = document.getElementById('logyq-game-thumb-gain-up')
    const thumbGainValue = document.getElementById('logyq-game-thumb-gain-value')
    const thumbGainMode = document.getElementById('logyq-game-thumb-gain-mode')
    const thumbGainAuto = document.getElementById('logyq-game-thumb-gain-auto')
    const syncThumbGain = () => {
      const value = thumbGain?.value?.() ?? 1
      const automatic = thumbGain?.automatic?.() !== false
      if (thumbGainValue) thumbGainValue.textContent = value.toFixed(1) + '×'
      if (thumbGainMode) thumbGainMode.textContent = automatic ? 'Automatic · grows 0.2× per completed puzzle' : 'Manual · automatic growth paused'
      if (thumbGainAuto) thumbGainAuto.hidden = automatic
      if (thumbGainDown) thumbGainDown.disabled = value <= (thumbGain?.min ?? 1)
      if (thumbGainUp) thumbGainUp.disabled = value >= (thumbGain?.max ?? 5)
    }
    thumbGainDown?.addEventListener('click', () => { thumbGain?.step(-1); syncThumbGain() })
    thumbGainUp?.addEventListener('click', () => { thumbGain?.step(1); syncThumbGain() })
    thumbGainAuto?.addEventListener('click', () => { thumbGain?.resetAutomatic?.(); syncThumbGain() })
    window.addEventListener('logyq-game-thumb-gainchange', syncThumbGain)
    syncThumbGain()
    const syncSoundControls = () => {
      document.querySelectorAll('[data-game-sound]').forEach((control) => {
        control.disabled = !sound?.supported
        control.textContent = sound?.supported ? 'Sound: ' + (sound.enabled() ? 'On' : 'Off') : 'Sound unavailable'
        control.setAttribute('aria-pressed', String(!!sound?.enabled()))
      })
      if (soundToggle) {
        soundToggle.disabled = !sound?.supported
        soundToggle.textContent = sound?.supported ? 'Sound effects: ' + (sound.enabled() ? 'On' : 'Off') : 'Sound unavailable'
        soundToggle.setAttribute('aria-pressed', String(!!sound?.enabled()))
      }
      if (volume) {
        volume.disabled = !sound?.supported || !sound.enabled()
        volume.value = String(Math.round((sound?.volume?.() ?? 0) * 100))
      }
    }
    if (sound && volume) {
      soundToggle?.addEventListener('click', async () => {
        sound.setEnabled?.(!sound.enabled())
        if (sound.enabled()) {
          await sound.unlock?.()
          sound.test?.()
        }
        syncSoundControls()
      })
      volume.addEventListener('input', async () => {
        sound.setVolume?.(Number(volume.value) / 100)
        if (sound.enabled()) {
          await sound.unlock?.()
          sound.test?.()
        }
      })
      window.addEventListener('logyq-game-soundchange', syncSoundControls)
      syncSoundControls()
    }
    const syncMusic = () => {
      const enabled = !!music?.enabled?.()
      if (musicToggle) {
        musicToggle.disabled = !music?.supported
        musicToggle.textContent = 'Music: ' + (enabled ? 'On' : 'Off')
        musicToggle.setAttribute('aria-pressed', String(enabled))
      }
      if (musicVolume) {
        musicVolume.disabled = !music?.supported || !enabled
        musicVolume.value = String(Math.round((music?.volume?.() ?? 0) * 100))
      }
    }
    if (music && musicVolume) {
      musicVolume.addEventListener('input', () => music.setVolume(Number(musicVolume.value) / 100))
      musicToggle?.addEventListener('click', () => {
        music.setEnabled?.(!music.enabled?.())
        syncMusic()
      })
      syncMusic()
    }

    let focusReturn = null
    const closePause = () => {
      if (panel.hidden) return
      panel.hidden = true
      panel.setAttribute('aria-hidden', 'true')
      pause.setAttribute('aria-expanded', 'false')
      document.body.classList.remove('logyq-game-paused')
      focusReturn?.focus?.()
      focusReturn = null
    }
    const openPause = () => {
      if (!document.body.classList.contains('logyq-game')) return
      focusReturn = document.activeElement
      panel.hidden = false
      panel.setAttribute('aria-hidden', 'false')
      pause.setAttribute('aria-expanded', 'true')
      document.body.classList.add('logyq-game-paused')
      document.getElementById('logyq-game-resume')?.focus()
    }
    const openLevels = () => {
      music?.leave()
      closePause()
      legacyLevels.click()
    }
    const openAllLevels = () => {
      openLevels()
      requestAnimationFrame(() => document.getElementById('logyq-trail-all-levels')?.click())
    }
    const resetProgress = () => {
      closePause()
      if (window.LOGYQLearner?.current?.()?.id) {
        window.LOGYQLearner.resetCurrent?.().catch?.((error) => alert(error?.message || 'Reset failed'))
        return
      }
      document.getElementById('logyq-trail-reset-progress')?.click()
    }

    back.addEventListener('click', openLevels)
    hint.addEventListener('click', () => window.LOGYQGameHint?.request?.())
    pause.addEventListener('click', openPause)
    document.getElementById('logyq-game-resume').addEventListener('click', closePause)
    document.getElementById('logyq-game-pause-levels').addEventListener('click', openAllLevels)
    document.getElementById('logyq-game-pause-reset').addEventListener('click', resetProgress)
    document.getElementById('logyq-game-celebration-lab').addEventListener('click', () => {
      closePause()
      window.LOGYQCelebrations?.open?.()
    })
    document.getElementById('logyq-game-test-learner').addEventListener('click', () => {
      closePause()
      window.LOGYQLearner?.open?.()
    })
    legacyNext.addEventListener('click', () => music?.resume())
    document.addEventListener('pointerdown', (event) => {
      if (event.target?.closest?.('[data-game-level], [data-trail-level], #logyq-trail-continue')) music?.enter()
    }, true)
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !panel.hidden) { event.preventDefault(); closePause() }
    })
  }


  function installCurriculumShell() {
    const bar = document.getElementById('logyq-curriculum-bar')
    if (!bar || document.getElementById('logyq-curriculum-shell-panel')) return

    const legacyStatus = document.getElementById('logyq-curriculum-status')
    const legacyNext = document.getElementById('logyq-curriculum-next')
    const legacyLevels = document.getElementById('logyq-curriculum-levels')
    if (!legacyStatus || !legacyNext || !legacyLevels) return

    const button = (id, label, ariaLabel) => {
      const element = document.createElement('button')
      element.type = 'button'
      element.id = id
      element.textContent = label
      element.setAttribute('aria-label', ariaLabel)
      return element
    }

    const back = button('logyq-curriculum-back', 'Back', 'Back to curriculum levels')
    const title = document.createElement('strong')
    title.id = 'logyq-curriculum-lesson'
    title.textContent = 'Lesson'
    const pause = button('logyq-curriculum-pause', '⚙', 'Curriculum settings')
    pause.setAttribute('aria-expanded', 'false')
    bar.replaceChildren(back, title, pause)

    const hiddenControls = document.createElement('div')
    hiddenControls.id = 'logyq-curriculum-legacy-controls'
    hiddenControls.hidden = true
    hiddenControls.append(legacyLevels)
    bar.after(legacyStatus, legacyNext, hiddenControls)

    const panel = document.createElement('div')
    panel.id = 'logyq-curriculum-shell-panel'
    panel.hidden = true
    panel.setAttribute('aria-hidden', 'true')
    panel.innerHTML = `
      <section class="logyq-game-pause-card" role="dialog" aria-modal="true" aria-labelledby="logyq-curriculum-shell-title">
        <h2 id="logyq-curriculum-shell-title">Curriculum</h2>
        <button type="button" id="logyq-curriculum-resume">Close</button>
        <button type="button" id="logyq-curriculum-shell-levels">Levels</button>
      </section>`
    document.body.appendChild(panel)

    const style = document.createElement('style')
    style.id = 'logyq-curriculum-shell-style'
    style.textContent = `
      body.logyq-curriculum #logiq-mobile-header,body.logyq-curriculum>header,body.logyq-curriculum #logyq-map-title,body.logyq-curriculum #logiq-mobile-panel,body.logyq-curriculum #logyq-paint-strip,body.logyq-curriculum #logyq-warehouse,body.logyq-curriculum #logyq-bank-trash,body.logyq-curriculum #trash{display:none!important}
      body.logyq-curriculum:not(.logyq-home) #logyq-curriculum-bar{position:fixed;z-index:80;top:max(10px,env(safe-area-inset-top));left:50%;right:auto;transform:translateX(-50%);width:min(420px,calc(100vw - 24px));height:48px;box-sizing:border-box;padding:5px 6px;display:grid;grid-template-columns:86px minmax(0,1fr) 48px;align-items:center;gap:6px;border:1px solid rgba(226,232,240,.92);border-radius:17px;background:rgba(255,255,255,.94);box-shadow:0 6px 22px rgba(15,23,42,.12);backdrop-filter:blur(12px)}
      body.logyq-curriculum #logyq-curriculum-bar button{height:36px;border:0;border-radius:12px;background:transparent;color:#334155;font:650 14px/1 system-ui;touch-action:manipulation}
      body.logyq-curriculum #logyq-curriculum-back{text-align:left;padding:0 10px}
      body.logyq-curriculum #logyq-curriculum-pause{justify-self:end;width:42px;padding:0;font-size:18px}
      body.logyq-curriculum #logyq-curriculum-lesson{text-align:center;color:#0f172a;font:750 16px/1 system-ui;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      body.logyq-curriculum #logyq-curriculum-status{position:fixed;z-index:72;top:calc(max(10px,env(safe-area-inset-top)) + 54px);left:18px;right:18px;margin:0;text-align:center;pointer-events:none;color:#64748b;font:600 12px/1.25 system-ui;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      body.logyq-curriculum #logyq-curriculum-next{position:fixed;z-index:85;left:50%;transform:translateX(-50%);bottom:calc(32px + env(safe-area-inset-bottom));min-width:190px;min-height:56px;padding:0 30px;border:0;border-radius:18px;background:#0f172a;color:white;font:750 18px/1 system-ui;box-shadow:0 10px 30px rgba(15,23,42,.28);touch-action:manipulation}
      body.logyq-curriculum #logyq-curriculum-next[hidden]{display:none!important}
      #logyq-curriculum-shell-panel{position:fixed;inset:0;z-index:5000;display:grid;place-items:center;padding:22px;background:rgba(15,23,42,.28);backdrop-filter:blur(10px)}
      #logyq-curriculum-shell-panel[hidden]{display:none!important}
      body.logyq-curriculum.logyq-curriculum-paused svg#canvas,body.logyq-curriculum.logyq-curriculum-paused #Dock{pointer-events:none}
    `
    document.head.appendChild(style)

    let focusReturn = null
    const closePause = () => {
      if (panel.hidden) return
      panel.hidden = true
      panel.setAttribute('aria-hidden', 'true')
      pause.setAttribute('aria-expanded', 'false')
      document.body.classList.remove('logyq-curriculum-paused')
      focusReturn?.focus?.()
      focusReturn = null
    }
    const openPause = () => {
      if (!document.body.classList.contains('logyq-curriculum')) return
      focusReturn = document.activeElement
      panel.hidden = false
      panel.setAttribute('aria-hidden', 'false')
      pause.setAttribute('aria-expanded', 'true')
      document.body.classList.add('logyq-curriculum-paused')
      document.getElementById('logyq-curriculum-resume')?.focus()
    }
    const openLevels = () => {
      closePause()
      legacyLevels.click()
    }

    back.addEventListener('click', openLevels)
    pause.addEventListener('click', openPause)
    document.getElementById('logyq-curriculum-resume')?.addEventListener('click', closePause)
    document.getElementById('logyq-curriculum-shell-levels')?.addEventListener('click', openLevels)
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !panel.hidden) { event.preventDefault(); closePause() }
    })
  }

  installGameShell()
  installCurriculumShell()
})()
