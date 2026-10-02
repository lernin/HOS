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

test('thumb movement targets the lifted card consistently during hover and release', () => {
  const engine = read('../public/logyq/js/engine/14-word-dock.js')
  assert.equal((engine.match(/hoverMap\(aim\.x, aim\.y\)/g) || []).length, 2)
  assert.match(engine, /!overDock\(aim\.x, aim\.y\)/)
  assert.doesNotMatch(engine, /hoverMap\(event\.clientX, event\.clientY\)/)
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
  assert.equal(music.source, '/logyq/audio/my_street.ogg')
  assert.equal(music.enabled(), true)
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
  music.setEnabled(false)
  assert.equal(music.enabled(), false)
  assert.equal(values.get('logyq_game_music_enabled_v1'), 'off')
  assert.equal(calls.at(-1), 'pause')
  music.setEnabled(true)
  assert.equal(calls.at(-1), 'play')
  music.leave()
  assert.equal(calls.at(-1), 'pause')
})


test('solved game centering reserves the visible Next button safe area', () => {
  const engine = read('../public/logyq/js/engine/16-tree-manager.js')
  const preview = read('../public/logyq/js/preview.js')
  assert.match(engine, /shownRect\('logyq-game-next'\)/)
  assert.match(engine, /bottom = Math\.min\(bottom, next\.top - gap\)/)
  assert.match(preview, /if \(upcoming\) scheduleGameCameraFit\(40\)/)
})


test('game settings use a gear and expose explicit music on-off control', () => {
  const shell = read('../public/logyq/js/game-shell.js')
  assert.match(shell, /'⚙', 'Game settings'/)
  assert.match(shell, /logyq-game-music-toggle/)
  assert.match(shell, /Music: ' \+ \(enabled \? 'On' : 'Off'\)/)
  assert.match(shell, /music\.setEnabled/)
  assert.doesNotMatch(shell, /const openPause = \(\) => \{[^}]*music\?\.pause\(\)/s)
})

test('game interaction uses forgiving bank grab and return targets plus double-tap subtree return', () => {
  const dock = read('../public/logyq/js/engine/14-word-dock.js')
  const preview = read('../public/logyq/js/preview.js')
  assert.match(dock, /const halo = 26/)
  assert.match(preview, /const slack = directPuzzlePlay\(doc\) \\? 58 : 28/)
  assert.match(preview, /if \(directPuzzlePlay\(doc\)\\) \{\s*drag\.bankArmed = true/s)
  assert.match(preview, /win\.__logyqGameReturnToBank\?\.\(uid\)/)
})


test('forest trail puzzle entry starts music on the user gesture', () => {
  const shell = read('../public/logyq/js/game-shell.js')
  assert.match(shell, /\[data-game-level\], \[data-trail-level\], #logyq-trail-continue/)
  assert.match(shell, /music\?\.enter\(\)/)
})


test('curriculum uses the same direct puzzle gesture path as Game', () => {
  const gestures = read('../public/logyq/js/preview/05-v162-gestures.js')
  const dock = read('../public/logyq/js/engine/14-word-dock.js')
  assert.match(gestures, /function directPuzzlePlay\(doc\)/)
  assert.match(gestures, /logyq-curriculum-frozen/)
  assert.match(gestures, /if \(directPuzzlePlay\(doc\)\) return/)
  assert.match(gestures, /if \(directPuzzlePlay\(doc\) && state\.hold\?\.pointerId/)
  assert.match(gestures, /if \(directPuzzlePlay\(doc\)\) \{\s*drag\.bankArmed = true/s)
  assert.match(gestures, /const slack = directPuzzlePlay\(doc\) \? 58 : 28/)
  assert.match(gestures, /returnDirectPuzzleToBank\(doc, win, uid\)/)
  assert.match(dock, /function directPuzzleShelf\(\)/)
  assert.match(dock, /logyq-curriculum-frozen/)
  assert.match(dock, /if \(directPuzzleShelf\(\)\) \{\s*if \(Math\.hypot\(dx, dy\) < 6\) return/s)
  assert.match(dock, /if \(!directPuzzleShelf\(\)\) return null/)
})

test('curriculum suppresses editor selection decoration', () => {
  const selection = read('../public/logyq/js/engine/10-selection.js')
  const styles = read('../public/logyq/js/preview/02-styles.js')
  assert.match(selection, /const puzzle = typeof curriculumPlayLocked === 'function' && curriculumPlayLocked\(\)/)
  assert.match(selection, /!phone && !puzzle/)
  assert.match(styles, /body\.logyq-curriculum svg#canvas g\.node rect:not\(\.grabzone\)[^{]*\{[^}]*stroke:#fff!important/s)
})


test('curriculum double-tap return detaches the whole branch into the Word Bank', () => {
  const source = read('../public/logyq/js/preview/07-curriculum.js')
  const start = source.indexOf('  function returnCurriculumBranch(')
  const end = source.indexOf('  function beginCurriculumLevel(', start)
  assert.ok(start >= 0 && end > start)
  const fn = new Function(source.slice(start, end) + '; return returnCurriculumBranch;')()
  const tree = {
    name: 'food', _uid: 'r', children: [
      { name: 'fruit', _uid: 'f', children: [
        { name: 'apple', _uid: 'a' },
        { name: 'banana', _uid: 'b' },
      ] },
      { name: 'meat', _uid: 'm' },
    ],
  }
  const branch = fn(tree, ['spare'], 'f')
  assert.equal(branch.tree.children.length, 1)
  assert.equal(branch.tree.children[0].name, 'meat')
  assert.deepEqual(branch.bank, ['spare', 'fruit', 'apple', 'banana'])
  const root = fn(tree, [], 'r')
  assert.equal(root.tree, null)
  assert.deepEqual(root.bank, ['food', 'fruit', 'apple', 'banana', 'meat'])
  assert.equal(fn(tree, [], 'missing'), null)
  assert.match(source, /window\.__logyqCurriculumReturnToBank = \(uid\) =>/)
})
