import * as T from 'three'
import { createKit } from '../src/experiences/island-estate/geometry'
import { architecture } from '../src/experiences/island-estate/architecture'
import { landscape } from '../src/experiences/island-estate/landscape'

/** Reuse the preview's exact meshes so the portable GLB and web scene stay aligned. */
export function buildEstateModel() {
  const scene = new T.Scene(), kit = createKit(scene)
  architecture(kit)
  landscape(kit)
  kit.finish()
  return {scene,kit}
}
