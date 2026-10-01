import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('Game shell is isolated after the main preview boot and leaves PIN handling alone', () => {
  const html = read('../public/logyq/index.html')
  const shell = read('../public/logyq/js/game-shell.js')

  assert.ok(html.indexOf('/logyq/js/preview.js') < html.indexOf('/logyq/js/game-shell.js'))
  assert.match(shell, /function installGameShell\(\)/)
  assert.match(shell, /logyq-game-back/)
  assert.match(shell, /logyq-game-pause-panel/)
  assert.match(shell, /logyq-game-resume/)
  assert.match(shell, /logyq-game-pause-levels/)
  assert.doesNotMatch(shell, /logiq-pin|observe\(document\.documentElement/)
  assert.doesNotMatch(shell, /opengameart|my_street/)
})

test('the shell preserves level selection, automatic completion, and the existing sound control', () => {
  const game = read('../public/logyq/js/preview/10-game.js')
  const ui = read('../public/logyq/js/preview/03-ui.js')
  const shell = read('../public/logyq/js/game-shell.js')

  assert.match(game, /function maybeGameClear\(snapshot\)/)
  assert.match(game, /logyq-game-next'\)\.hidden = !upcoming/)
  assert.match(game, /logyq-game-levels-button'\)\?\.addEventListener\('click'/)
  assert.match(ui, /data-game-sound/)
  assert.match(shell, /legacyLevels\.click\(\)/)
  assert.match(shell, /LOGYQGameSound/)
  assert.match(shell, /logyq-game-soundchange/)
})

test('sound effects expose a persistent adjustable volume for the pause panel', () => {
  const sound = read('../public/logyq/js/game-sound.js')
  const shell = read('../public/logyq/js/game-shell.js')

  assert.match(sound, /function setVolume\(/)
  assert.match(sound, /volume:\(\) =>/)
  assert.match(sound, /setVolume,/)
  assert.match(shell, /logyq-game-sfx-volume/)
  assert.match(shell, /sound\.setVolume/)
})

test('thumb movement control lives in settings and uses the saved multiplier while dragging', () => {
  const shell = read('../public/logyq/js/game-shell.js')
  const engine = read('../public/logyq/js/engine/14-word-dock.js')
  const html = read('../public/logyq/index.html')
  assert.match(html, /game-thumb-gain\.js/)
  assert.match(shell, /logyq-game-thumb-gain-down/)
  assert.match(shell, /logyq-game-thumb-gain-up/)
  assert.match(shell, /logyq-game-thumb-gain-value/)
  assert.match(shell, /thumbGain\?\.step\(-1\)/)
  assert.match(shell, /thumbGain\?\.step\(1\)/)
  assert.match(engine, /window\.LOGYQGameThumbGain\?\.value\?\.\(\)/)
})

test('thumb movement gain starts at 2.4x, persists, steps by 0.2x, and stays in range', () => {
  const source = read('../public/logyq/js/game-thumb-gain.js')
  const create = (initial = null) => {
    const values = new Map(initial == null ? [] : [['logyq_game_thumb_gain_v1', String(initial)]])
    const window = {}
    runInNewContext(source, {
      window,
      localStorage: {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)),
      },
    })
    return { gain: window.LOGYQGameThumbGain, values }
  }
  const first = create()
  assert.equal(first.gain.value(), 2.4)
  assert.equal(first.gain.step(1), 2.6)
  assert.equal(first.values.get('logyq_game_thumb_gain_v1'), '2.6')
  assert.equal(first.gain.step(-1), 2.4)
  assert.equal(first.gain.set(50), 6)
  assert.equal(first.gain.step(1), 6)
  assert.equal(first.gain.set(-1), 1)
  assert.equal(first.gain.step(-1), 1)
  assert.equal(create('not a number').gain.value(), 2.4)
  assert.equal(create('3.8').gain.value(), 3.8)
})

test('effects volume survives reload and the existing sound toggle restores the chosen level', () => {
  const source = read('../public/logyq/js/game-sound.js')
  const load = (initial = {}) => {
    const values = new Map(Object.entries(initial))
    const window = { AudioContext: function AudioContext() {}, dispatchEvent() {} }
    runInNewContext(source, {
      window,
      Event: function Event(type) { this.type = type },
      localStorage: {
        getItem: (key) => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, String(value)),
      },
    })
    return { sound: window.LOGYQGameSound, values }
  }

  const first = load()
  assert.equal(first.sound.volume(), 0.55)
  first.sound.setVolume(0.31)
  first.sound.setEnabled(false)
  assert.equal(first.sound.volume(), 0)
  first.sound.setEnabled(true)
  assert.equal(first.sound.volume(), 0.31)

  const reloaded = load(Object.fromEntries(first.values))
  assert.equal(reloaded.sound.volume(), 0.31)
  assert.equal(reloaded.sound.enabled(), true)
})

test('game music is a quiet persistent loop that starts on entry and stops on exit', async () => {
  const source = read('../public/logyq/js/game-sound.js')
  const values = new Map()
  const calls = []
  const player = {
    loop: false,
    volume: 1,
    preload: '',
    play() { calls.push('play'); return Promise.resolve() },
    pause() { calls.push('pause') },
  }
  const window = {
    Audio: function Audio(url) { calls.push(url); return player },
    AudioContext: function AudioContext() {},
    dispatchEvent() {},
  }
  runInNewContext(source, {
    window,
    document: { readyState: 'loading', addEventListener() {} },
    Event: function Event(type) { this.type = type },
    localStorage: {
      getItem: (key) => values.has(key) ? values.get(key) : null,
      setItem: (key, value) => values.set(key, String(value)),
    },
    setTimeout,
  })

  const music = window.LOGYQGameMusic
  assert.equal(music.volume(), 0.16)
  assert.equal(music.source, 'https://opengameart.org/sites/default/files/my_street.ogg')
  music.enter()
  assert.equal(player.loop, true)
  assert.equal(player.volume, 0.16)
  assert.equal(calls.filter((call) => call === 'play').length, 1)
  music.pause()
  assert.equal(calls.at(-1), 'pause')
  music.resume()
  assert.equal(calls.at(-1), 'play')
  music.setVolume(0.23)
  assert.equal(player.volume, 0.23)
  assert.equal(values.get('logyq_game_music_volume_v1'), '0.23')
  music.leave()
  assert.equal(calls.at(-1), 'pause')
})
