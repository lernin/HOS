import * as T from 'three'

// This measures frustum candidates, NOT occlusion through solid room walls.
// The meshes have already been spatially merged by the Estate kit. One candidate
// is therefore a mesh batch, not an individual bed or furniture item.
export type EstateSceneMetrics = {
  calls: number
  triangles: number
  sceneMeshes: number
  frustumCandidates: number
  geometries: number
  textures: number
  pixelRatio: number
}
export type EstateDiagnosticSnapshot = EstateSceneMetrics & {
  at: string
  location: string
  x: number
  z: number
  fps: number
  renderScale: number
}

export function countEstateFrustumCandidates(scene: T.Scene, camera: T.Camera): {
  sceneMeshes: number
  frustumCandidates: number
} {
  // Only called on-demand once per diagnostic sample, never per rendered frame.
  camera.updateMatrixWorld()
  scene.updateMatrixWorld()
  const frustum = new T.Frustum().setFromProjectionMatrix(
    new T.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
  )
  let sceneMeshes = 0
  let frustumCandidates = 0
  scene.traverseVisible(object => {
    if (!(object instanceof T.Mesh)) return
    sceneMeshes += 1
    if (!object.frustumCulled || frustum.intersectsObject(object)) frustumCandidates += 1
  })
  return { sceneMeshes, frustumCandidates }
}

export function formatEstateDiagnosticsReport(samples: readonly EstateDiagnosticSnapshot[]): string {
  const rows = [
    'Ocean Estate — scene visibility diagnostic',
    'Frustum mesh counts are estimates, not wall occlusion. Geometry and texture counts are loaded in GPU memory, not drawn.',
    'Recorded FPS is rendered frames per second while moving; compare scenes with the same window size and graphics settings.',
    '',
  ]
  if (!samples.length) return [...rows, 'No snapshots yet. Walk to a location and tap Capture.'].join('\n')
  rows.push('Time | Location | Position X,Z | Rendered FPS | Draw calls | Drawn triangles | Frustum / scene meshes | Loaded geometries | Loaded textures | GPU pixel ratio | Render scale')
  for (const s of samples) {
    rows.push([
      s.at, s.location, `${s.x.toFixed(1)},${s.z.toFixed(1)}`, s.fps,
      s.calls, s.triangles, `${s.frustumCandidates}/${s.sceneMeshes}`,
      s.geometries, s.textures, s.pixelRatio.toFixed(2),
      `${Math.round(s.renderScale * 100)}%`,
    ].join(' | '))
  }
  return rows.join('\n')
}
