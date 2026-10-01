import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('Game uses a minimal puzzle shell with pause controls instead of mapper chrome', () => {
  const ui = read('../public/logyq/js/preview/03-ui.js')
  const styles = read('../public/logyq/js/preview/02-styles.js')
  const gameBar = ui.slice(ui.indexOf('id="logyq-game-bar"'), ui.indexOf('id="logyq-curriculum-gate"'))

  assert.match(gameBar, /id="logyq-game-back"/)
  assert.match(gameBar, /id="logyq-game-puzzle"/)
  assert.match(gameBar, /id="logyq-game-pause"/)
  assert.match(gameBar, /id="logyq-game-next"[^>]*hidden/)
  assert.doesNotMatch(gameBar, /id="logyq-game-tier"/)
  assert.doesNotMatch(gameBar, /id="logyq-game-check"/)
  assert.doesNotMatch(gameBar, /id="logyq-game-levels-button"/)

  assert.match(ui, /id="logyq-game-pause-panel"/)
  assert.match(ui, /id="logyq-game-resume"/)
  assert.match(ui, /id="logyq-game-pause-levels"/)
  assert.match(ui, /id="logyq-game-music-volume"[^>]*type="range"/)
  assert.match(ui, /id="logyq-game-sfx-volume"[^>]*type="range"/)

  assert.match(styles, /body\.logyq-game #logiq-mobile-header[^{}]*\{[^}]*display:none!important/)
  assert.match(styles, /#logyq-game-next[^{}]*\{[^}]*min-height:/)
})

test('Game music is a persistent quiet loop and effects expose independent volume', () => {
  const musicPath = new URL('../public/logyq/js/game-music.js', import.meta.url)
  assert.equal(existsSync(musicPath), true, 'game-music.js should exist')
  const music = read('../public/logyq/js/game-music.js')
  const sound = read('../public/logyq/js/game-sound.js')
  const index = read('../public/logyq/index.html')

  assert.match(index, /\/logyq\/js\/game-music\.js/)
  assert.match(music, /my_street\.ogg/)
  assert.match(music, /loop\s*=\s*true/)
  assert.match(music, /logyq_game_music_volume_v1/)
  assert.match(music, /setVolume/)
  assert.match(music, /enter/)
  assert.match(music, /leave/)

  assert.match(sound, /logyq_game_sfx_volume_v1/)
  assert.match(sound, /setVolume/)
  assert.match(sound, /volume/)
})

test('Game flow automatically owns completion and only exposes Next after solve', () => {
  const game = read('../public/logyq/js/preview/10-game.js')
  assert.match(game, /logyq-game-puzzle/)
  assert.match(game, /LOGYQGameMusic\?\.enter\(\)/)
  assert.match(game, /LOGYQGameMusic\?\.leave\(\)/)
  assert.match(game, /logyq-game-pause/)
  assert.match(game, /logyq-game-resume/)
  assert.match(game, /logyq-game-pause-levels/)
  assert.match(game, /logyq-game-music-volume/)
  assert.match(game, /logyq-game-sfx-volume/)
  assert.match(game, /next\.hidden\s*=\s*false/)
  assert.doesNotMatch(game, /getElementById\('logyq-game-check'\)\.addEventListener/)
})
