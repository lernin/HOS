import test from 'node:test'
import assert from 'node:assert/strict'
import * as T from 'three'
import { createEstateKit } from '../src/experiences/estate/kit'
import { architecture } from '../src/experiences/estate/environment'

// These are independently checked world footprints, not recomputed expectations.
const patios=[
  ['P1',-23,27,-24,-12],['P2',-15,-11,-36,-24],['P3',12,16,-36,-24],
  ['P4',-23,-6,14,33],['P5',39,44,-14,14],['P6',27,40,-23,-12],['P7',-31,-22,33,43],
] as const
test('rendered patio meshes keep their identity and exact world footprint after batching',()=>{
  const scene=new T.Scene(),kit=createEstateKit(scene)
  try {
    architecture(kit);kit.finish();scene.updateMatrixWorld(true)
    for(const [code,x1,x2,z1,z2] of patios){
      const mesh=scene.children.find(o=>o.userData.estatePlan?.code===code)
      assert.ok(mesh,`${code} must survive batching as an identifiable rendered slab`)
      const bounds=new T.Box3().setFromObject(mesh)
      assert.deepEqual([bounds.min.x,bounds.max.x,bounds.min.z,bounds.max.z],[x1,x2,z1,z2],code)
      const ray=new T.Raycaster(new T.Vector3((x1+x2)/2,120,(z1+z2)/2),new T.Vector3(0,-1,0))
      assert.equal(ray.intersectObject(mesh)[0]?.object.userData.estatePlan?.code,code)
    }
    const ray=new T.Raycaster(new T.Vector3(0,120,-30),new T.Vector3(0,-1,0))
    assert.equal(ray.intersectObjects(scene.children).some(h=>h.object.userData.estatePlan?.kind==='floor'),false,'pool void must never acquire a patio')
  } finally {kit.dispose()}
})
test('overhead geometry remains in the shared model and can be hidden independently of floors',()=>{
  const scene=new T.Scene(),kit=createEstateKit(scene)
  try {
    architecture(kit);kit.finish()
    const overhead=scene.children.filter(o=>o.userData.estatePlanOccluder)
    assert.ok(overhead.length>0,'roofs and lintels retain cutaway identity after batching')
    assert.ok(overhead.every(o=>!o.userData.estatePlan),'cutaway cannot remove any floor slab')
    const ray=new T.Raycaster(new T.Vector3(1,120,16),new T.Vector3(0,-1,0))
    scene.updateMatrixWorld(true)
    assert.equal(ray.intersectObjects(scene.children)[0]?.object.userData.estatePlanOccluder,true,'full estate includes the foyer roof')
    const visible=scene.children.filter(o=>!o.userData.estatePlanOccluder)
    assert.equal(ray.intersectObjects(visible)[0]?.object.userData.estatePlan?.name,'Grand foyer','cutaway exposes the same actual foyer slab')
  } finally {kit.dispose()}
})
