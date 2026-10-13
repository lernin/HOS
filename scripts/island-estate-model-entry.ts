import * as T from 'three'
import { createKit } from '../src/experiences/island-estate/geometry'
import { architecture } from '../src/experiences/island-estate/architecture'
import { cliffPromenade } from '../src/experiences/island-estate/sculpture'
import { paths, groundHeight } from '../src/experiences/island-estate/layout'

/** Reuse the preview's exact meshes so the portable GLB and web scene stay aligned. */
export function buildEstateModel() {
  const scene = new T.Scene(), kit = createKit(scene)
  architecture(kit)
  const route = new T.CatmullRomCurve3(paths[1].map(p => new T.Vector3(p.x, 0, p.z)), false, 'centripetal')
  const walk = route.getPoints(Math.ceil(route.getLength() / .8)).map(p => ({
    x: p.x, z: p.z, y: (groundHeight({x:p.x,z:p.z}) ?? 0) + .038,
  }))
  cliffPromenade(kit, walk)
  kit.finish()
  return {scene,kit}
}
