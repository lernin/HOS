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
