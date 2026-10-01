import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('Game installs a minimal puzzle shell with pause controls instead of mapper chrome', () => {
  const shell = read('../public/logyq/js/game-sound.js')

  assert.match(shell, /function installGameShell\(\)/)
  assert.match(shell, /makeButton\('logyq-game-back'/)
  assert.match(shell, /puzzle\.id = 'logyq-game-puzzle'/)
  assert.match(shell, /makeButton\('logyq-game-pause'/)
  assert.match(shell, /id = 'logyq-game-pause-panel'/)
  assert.match(shell, /id="logyq-game-resume"/)
  assert.match(shell, /id="logyq-game-pause-levels"/)
  assert.match(shell, /id="logyq-game-music-volume"/)
  assert.match(shell, /id="logyq-game-sfx-volume"/)
  assert.match(shell, /bar\.replaceChildren\(back, puzzle, pause\)/)
  assert.match(shell, /body\.logyq-game #logiq-mobile-header\{display:none!important/)
  assert.match(shell, /#logyq-game-next\{[^}]*min-height:56px/)
})

test('Game music is a persistent quiet loop and effects expose independent volume', () => {
  const sound = read('../public/logyq/js/game-sound.js')

  assert.match(sound, /my_street\.ogg/)
  assert.match(sound, /loop = true/)
  assert.match(sound, /logyq_game_music_volume_v1/)
  assert.match(sound, /logyq_game_sfx_volume_v1/)
  assert.match(sound, /LOGYQGameMusic/)
  assert.match(sound, /setMusicVolume/)
  assert.match(sound, /setSfxVolume/)
  assert.match(sound, /musicEnter/)
  assert.match(sound, /musicLeave/)
})

test('Game keeps automatic completion and preserves the existing Next control after shell cleanup', () => {
  const game = read('../public/logyq/js/preview/10-game.js')
  const shell = read('../public/logyq/js/game-sound.js')

  assert.match(game, /function maybeGameClear\(snapshot\)/)
  assert.match(game, /document\.getElementById\('logyq-game-next'\)\.hidden = !upcoming/)
  assert.match(shell, /const legacyNext = document\.getElementById\('logyq-game-next'\)/)
  assert.match(shell, /const legacyCheck = document\.getElementById\('logyq-game-check'\)/)
  assert.match(shell, /legacyNext\.hidden = true/)
  assert.match(shell, /legacyCheck\?\.remove\(\)/)
})

test('LOGYQ removes the legacy PIN surface from the DOM entirely', () => {
  const shell = read('../public/logyq/js/game-sound.js')

  assert.match(shell, /function removePinUi\(\)/)
  assert.match(shell, /document\.getElementById\('logiq-pin'\)/)
  assert.match(shell, /document\.getElementById\('logiq-pin-cancel'\)\?\.click\(\)/)
  assert.match(shell, /pin\.remove\(\)/)
  assert.match(shell, /new MutationObserver\(\(\) => removePinUi\(\)\)/)
  assert.doesNotMatch(shell, /releaseInitialPinGate/)
})
