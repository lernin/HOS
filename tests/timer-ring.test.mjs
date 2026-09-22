import assert from 'node:assert/strict'
import test from 'node:test'
import { timerArmState, timerColor, timerDash, timerNextFate, timerPath, timerProgress, timerStrokeOn, TIMER_AMBER, TIMER_RED } from '../public/timer/timer.js'

const d = timerPath(18, 18, 244, 148, 28, 28)

test('the path leaves 12 toward the left and only sweeps counter-clockwise', () => {
  assert.match(d, /^M 140 18 H 46 /)
  assert.equal(d.includes(' 0 0 1 '), false)
  assert.equal((d.match(/ 0 0 0 /g) || []).length, 4)
  assert.equal(d.endsWith('Z'), false)
  assert.equal(d.includes('scale'), false)
})

test('one dash plus one gap equals pathLength, and progress cannot leave 0..1', () => {
  const length = 800
  const full = timerDash(1, length)
  assert.equal(full.array, '800 0')
  assert.equal(full.offset, 0)

  for (const progress of [0.92, 0.75, 0.5, 0.25, 0.08]) {
    const dash = timerDash(progress, length)
    const [visible, gap] = dash.array.split(' ').map(Number)
    assert.equal(visible + gap, length)
    assert.equal(dash.offset, visible)
    assert.equal(dash.array.split(' ').length, 2)
  }

  assert.deepEqual(timerDash(1.4, length), { array: '800 0', offset: 0 })
  assert.deepEqual(timerDash(-0.2, length), { array: '0 1', offset: 0 })
  assert.deepEqual(timerDash(0, length), { array: '0 1', offset: 0 })
})

test('the ink is one suffix, so the tip travels counter-clockwise and cannot paint a second lap', () => {
  const length = 800
  for (const progress of [0.92, 0.75, 0.5, 0.33, 0.1]) {
    const eaten = length * (1 - progress)
    const on = []
    let run = false
    for (let d = 0; d < length; d += 1) {
      const ink = timerStrokeOn(d, progress, length)
      if (ink && !run) on.push(d)
      run = ink
    }
    assert.equal(on.length, 1, `progress ${progress} painted ${on.length} dashes`)
    assert.ok(Math.abs(on[0] - eaten) <= 1)
    assert.equal(timerStrokeOn(eaten / 2, progress, length), false)
    assert.equal(timerStrokeOn(eaten + (length - eaten) / 2, progress, length), true)
  }
  assert.equal(timerStrokeOn(10, 0, length), false)
  assert.equal(timerStrokeOn(10, 1, length), true)
})

test('each arm holds a full ring for 3s, then drains for 12s', () => {
  assert.equal(timerProgress(0), 1)
  assert.equal(timerProgress(3000), 1)
  assert.equal(timerProgress(2999), 1)
  assert.equal(timerProgress(9000), 0.5)
  assert.equal(timerProgress(15000), 0)
  assert.equal(timerProgress(16000), 0)
  const intoDrain = 3000 + 6000
  assert.equal(timerProgress(intoDrain), 0.5)
})

test('taps cycle red, then amber, then off', () => {
  assert.equal(timerNextFate('idle'), 'red')
  assert.equal(timerNextFate('red'), 'amber')
  assert.equal(timerNextFate('amber'), 'idle')
  assert.equal(timerNextFate(undefined), 'red')
  assert.equal(timerColor('red'), TIMER_RED)
  assert.equal(timerColor('amber'), TIMER_AMBER)
  assert.equal(TIMER_RED, '#ff0000')
  assert.equal(TIMER_AMBER, '#ffa100')
})

test('arming amber during a red drain starts a new full hold', () => {
  const draining = { fate: 'red', armedAt: 0 }
  assert.ok(timerProgress(9000) < 1)
  const amber = timerArmState(draining.fate, 9000)
  assert.equal(amber.fate, 'amber')
  assert.equal(amber.armedAt, 9000)
  assert.equal(amber.progress, 1)
  assert.equal(timerProgress(9000 + 2500 - amber.armedAt), 1)
  assert.equal(timerProgress(9000 + 3000 - amber.armedAt), 1)
  assert.ok(timerProgress(9000 + 3001 - amber.armedAt) < 1)
  const off = timerArmState(amber.fate, 20000)
  assert.deepEqual(off, { fate: 'idle', armedAt: 0, progress: 0 })
  const red = timerArmState(off.fate, 20000)
  assert.deepEqual(red, { fate: 'red', armedAt: 20000, progress: 1 })
})
