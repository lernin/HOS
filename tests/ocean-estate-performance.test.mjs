import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  clampResolutionCeiling,
  effectivePixelRatio,
  initialAdaptiveScale,
  advanceAdaptiveScale,
} from '../src/experiences/estate/performance.ts'

test('resolution preference clamps malformed and legacy saved values', () => {
  assert.equal(clampResolutionCeiling(undefined), .8)
  assert.equal(clampResolutionCeiling(NaN), .8)
  assert.equal(clampResolutionCeiling('0.65'), .8)
  assert.equal(clampResolutionCeiling(1.4), 1)
  assert.equal(clampResolutionCeiling(.2), .5)
  assert.equal(clampResolutionCeiling(.65), .65)
})

test('pixel ratio uses existing graphics preset and manual resolution ceiling', () => {
  assert.equal(effectivePixelRatio(2, 0, .5), .425)
  assert.equal(effectivePixelRatio(1, 1, .6), .6)
  assert.equal(effectivePixelRatio(2, 2, .6), .81)
  assert.equal(effectivePixelRatio(1, 2, 1), 1)
})

test('automatic adjustment never exceeds manual ceiling and starts conservatively', () => {
  assert.equal(initialAdaptiveScale(1, true), .8)
  assert.equal(initialAdaptiveScale(.6, true), .6)
  assert.equal(initialAdaptiveScale(.6, false), .6)
  const reduced = advanceAdaptiveScale(.8, .6, 16, 0)
  assert.equal(reduced.scale, .48)
  assert.equal(reduced.goodWindows, 0)
  assert.equal(advanceAdaptiveScale(.45, 1, 9, 0).scale, .4)
  assert.equal(advanceAdaptiveScale(.4, 1, 9, 0).scale, .4)
})

test('automatic adjustment descends quickly when slow and rises slowly when stable', () => {
  const slow = advanceAdaptiveScale(.8, 1, 27, 3)
  assert.equal(slow.scale, .68)
  assert.equal(slow.goodWindows, 0)
  const marginal = advanceAdaptiveScale(.68, 1, 48, 2)
  assert.equal(marginal.scale, .62)
  assert.equal(marginal.goodWindows, 0)
  let current = .6, goodWindows = 0
  for (let i = 0; i < 3; i++) {
    const next = advanceAdaptiveScale(current, 1, 60, goodWindows)
    current = next.scale
    goodWindows = next.goodWindows
  }
  assert.equal(current, .6)
  const recovered = advanceAdaptiveScale(current, 1, 60, goodWindows)
  assert.equal(recovered.scale, .64)
  assert.equal(recovered.goodWindows, 0)
})

test('middle-range frame rates preserve scale to avoid flickering', () => {
  const sample = advanceAdaptiveScale(.7, .9, 54, 2)
  assert.equal(sample.scale, .7)
  assert.equal(sample.goodWindows, 0)
})
