import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as T from 'three'
import { countEstateFrustumCandidates, formatEstateDiagnosticsReport } from '../src/experiences/estate/sceneDiagnostics.ts'

test('frustum estimates count nearby visible mesh candidates, not obscured geometry', () => {
  const scene = new T.Scene()
  const camera = new T.PerspectiveCamera(70, 1, .1, 100)
  camera.position.set(0, 1, 0)
  camera.lookAt(0, 1, -3)
  camera.updateMatrixWorld()
  const mesh = (x, z) => {
    const m = new T.Mesh(new T.BoxGeometry(1, 1, 1), new T.MeshBasicMaterial())
    m.position.set(x, 1, z)
    scene.add(m)
    return m
  }
  const front = mesh(0, -5)
  mesh(0, 5)
  mesh(200, -5)
  const hidden = mesh(0, -3)
  hidden.visible = false
  scene.updateMatrixWorld(true)
  const result = countEstateFrustumCandidates(scene, camera)
  assert.deepEqual(result, { sceneMeshes: 3, frustumCandidates: 1 })
  front.frustumCulled = false
  assert.deepEqual(countEstateFrustumCandidates(scene, camera), result)
})

test('diagnostic report makes scene vs GPU metrics and sampling context explicit', () => {
  const captured = {
    at: '2026-11-25T02:00:00.000Z', location: 'Pool', x: 3, z: -22,
    fps: 41, calls: 125, triangles: 234567, sceneMeshes: 310,
    frustumCandidates: 72, geometries: 88, textures: 9, pixelRatio: .6, renderScale: .6,
  }
  const report = formatEstateDiagnosticsReport([captured])
  assert.match(report, /Pool/)
  assert.match(report, /234567/)
  assert.match(report, /125/)
  assert.match(report, /72\/310/)
  assert.match(report, /0\.60/)
  assert.match(report, /estimates, not wall occlusion/)
  assert.match(report, /loaded in GPU memory/i)
  assert.match(report, /2026-11-25/)
  assert.doesNotMatch(report, /undefined|NaN/)
})

test('a copy report works without captured samples', () => {
  assert.match(formatEstateDiagnosticsReport([]), /No snapshots yet/)
})
