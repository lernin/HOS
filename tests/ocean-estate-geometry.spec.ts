import test from 'node:test'
import assert from 'node:assert/strict'
import * as T from 'three'
import { createEstateKit } from '../src/experiences/estate/kit'
import { architecture, landscape, waters } from '../src/experiences/estate/environment'
import { createNavigator, walkable, clearLine } from '../src/experiences/estate/navigation'
import { estateSurfaces, estateEdges } from '../src/experiences/estate/site-edges'
import { coastPoint } from '../src/experiences/estate/site-layout'

// These are independently checked world footprints, not recomputed expectations.
const patios=[
  ['P1',-23,27,-24,-12],['P2',-15,-11,-60,-24],['P3',12,16,-60,-24],
  ['P4',-23,-6,14,33],['P5',39,44,-12,14],['P6',27,44,-24,-12],['P7',-31,-22,33,43],
  ['P8',-47,-23,-24,-17],['P9',-47,-39,-17,44],['P10',-39,-31,39,44],['P11',40,50,14,55],['P12',44,50,-24,14],['P13',24,40,51,55],['P14',-15,16,-70,-60.2],['P15',24,27,49,51],['P16',-31,-22,43,44],
] as const
test('rendered patio meshes keep their identity and exact world footprint after batching',()=>{
  const scene=new T.Scene(),kit=createEstateKit(scene)
  try {
    architecture(kit);kit.finish();scene.updateMatrixWorld(true)
    for(const [code,x1,x2,z1,z2] of patios){
      const mesh=scene.children.find(o=>o.userData.estatePlan?.code===code)
      assert.ok(mesh,`${code} must survive batching as an identifiable rendered slab`)
      const bounds=new T.Box3().setFromObject(mesh)
      for(const [actual,want] of [[bounds.min.x,x1],[bounds.max.x,x2],[bounds.min.z,z1],[bounds.max.z,z2]])assert.ok(Math.abs(actual-want)<.00001,`${code} world bounds ${actual} should be ${want}`)
      const ray=new T.Raycaster(new T.Vector3((x1+x2)/2,120,(z1+z2)/2),new T.Vector3(0,-1,0))
      assert.equal(ray.intersectObject(mesh)[0]?.object.userData.estatePlan?.code,code)
    }
    const ray=new T.Raycaster(new T.Vector3(0,120,-30),new T.Vector3(0,-1,0))
    assert.equal(ray.intersectObjects(scene.children).some(h=>h.object.userData.estatePlan?.kind==='floor'),false,'pool void must never acquire a patio')
  } finally {kit.dispose()}
})

test('rendered water and overflow extend together to the new north end',()=>{
  const scene=new T.Scene(),water=waters(scene)
  try {
    scene.updateMatrixWorld(true)
    const pool=scene.children.find(o=>o.position.y>5.8&&o.position.z<-24)!
    const b=new T.Box3().setFromObject(pool)
    for(const [actual,want] of [[b.min.x,-10.9],[b.max.x,11.9],[b.min.z,-60.1],[b.max.z,-24.3]])assert.ok(Math.abs(actual-want)<.001,`pool surface ${actual} should reach ${want}`)
    const lip=scene.children.find(o=>o.position.y<5.8&&o.position.y>4&&o.position.z<-24)!
    assert.ok(Math.abs(lip.position.z+60.05)<.001,'overflow moves with the far pool edge')
  } finally {water.dispose()}
})

test('both extended walks and the squared patio corner are reachable without crossing pool or guards',()=>{
  const navigator=createNavigator(),west={x:-13,z:-58},east={x:14,z:-58},corner={x:42,z:-22}
  for(const p of [west,east,corner])assert.equal(walkable(p),true,`new paving is standable ${JSON.stringify(p)}`)
  assert.equal(clearLine(west,east),false,'water separates the walks')
  const route=navigator.path(west,east)
  assert.ok(route,'A* grid covers the new far pool end')
  let current=west
  for(const p of route){assert.ok(clearLine(current,p),'every leg avoids water and guards');current=p}
  assert.ok(navigator.path({x:1,z:29},corner),'new patio connects to the house')
  for(const p of [{x:0,z:-58},{x:-16,z:-58},{x:17,z:-58},{x:50,z:-22},{x:42,z:-24}])assert.equal(walkable(p),false,'water, soil and outer guards cannot be walked through')
})

test('northern coastline moves beyond the pool while arrival coastline stays in place',()=>{
  assert.ok(coastPoint(-Math.PI/2,1)[1]<-62,'new north shore supports the longer pool')
  assert.ok(Math.abs(coastPoint(Math.PI/2,1)[1]-69.935)<.001,'arrival shore stays fixed')
  const scene=new T.Scene(),kit=createEstateKit(scene)
  try {
    landscape(kit);kit.finish();scene.updateMatrixWorld(true)
    const ray=new T.Raycaster(new T.Vector3(-13,6,-58),new T.Vector3(0,-1,0))
    assert.ok(ray.intersectObjects(scene.children).some(h=>h.point.y>4),'extended walk has terrain support near its far end')
  } finally {kit.dispose()}
})

test('northeast guards meet at one correctly inset corner post',()=>{
  const kit=createEstateKit(new T.Scene())
  try {
    architecture(kit);kit.root.updateMatrixWorld(true)
    const posts:T.Mesh[]=[],bases:T.Mesh[]=[]
    kit.root.traverse(o=>{
      if(!(o instanceof T.Mesh))return
      const p=o.getWorldPosition(new T.Vector3()),dimensions=o.geometry.parameters
      if(Math.abs(p.x-49.885)>.001||Math.abs(p.z+23.885)>.001)return
      if(dimensions?.width===.065&&dimensions?.depth===.065)posts.push(o)
      if(dimensions?.width===.115&&dimensions?.depth===.115)bases.push(o)
    })
    assert.equal(posts.length,1,'continuous corner has one post rather than two terminal posts')
    assert.equal(bases.length,1,'corner pedestal is not duplicated')
    const b=new T.Box3().setFromObject(bases[0])
    assert.ok(Math.abs(50-b.max.x-.0575)<.001&&Math.abs(b.min.z+24-.0575)<.001,'half-pedestal edge clearance survives the new corner')
  } finally {kit.dispose()}
})

test('spa tree has a real raised glass roof opening and the surrounding roof remains intact',()=>{
  const scene=new T.Scene(),kit=createEstateKit(scene)
  try {
    architecture(kit);kit.finish();scene.updateMatrixWorld(true)
    for(const [x,z] of [[-31.7,29.7],[-34,28]]){
      const ray=new T.Raycaster(new T.Vector3(x,9,z),new T.Vector3(0,1,0))
      const hit=ray.intersectObjects(scene.children)[0]
      assert.ok(hit&&hit.point.y>11.5,`raised roof above tree, got ${hit?.point.y}`)
      assert.equal((hit.object as T.Mesh<T.BufferGeometry,T.Material>).material.transparent,true,'tree sees sky through glazing')
    }
    const ray=new T.Raycaster(new T.Vector3(-38,9,36),new T.Vector3(0,1,0))
    assert.ok(ray.intersectObjects(scene.children)[0]?.point.y<10,'ordinary spa roof remains outside the dome')
    const down=new T.Raycaster(new T.Vector3(-31.7,7,29.7),new T.Vector3(0,-1,0))
    assert.equal(down.intersectObjects(scene.children).some(h=>h.object.userData.estatePlan?.kind==='floor'),false,'tree grows in a real opening in the spa slab')
  } finally {kit.dispose()}
})

test('dome curb and drainage channel sit visibly above the finished spa roof',()=>{
  const scene=new T.Scene(),kit=createEstateKit(scene)
  try {
    architecture(kit);kit.finish();scene.updateMatrixWorld(true)
    for(const x of [-26.95,-26.65]){
      const ray=new T.Raycaster(new T.Vector3(x,16,29.7),new T.Vector3(0,-1,0))
      const hit=ray.intersectObjects(scene.children)[0]
      assert.ok(hit&&hit.point.y>9.945,'perimeter metalwork is exposed above the roof finish')
      assert.equal((hit.object as T.Mesh<T.BufferGeometry,T.MeshStandardMaterial>).material.metalness,.8,'bronze perimeter trim is visible rather than buried under roofing')
    }
  } finally {kit.dispose()}
})

test('entire spa tree canopy clears the dome and the planted pocket cannot be walked through',()=>{
  const kit=createEstateKit(new T.Scene())
  try {
    landscape(kit);kit.root.updateMatrixWorld(true)
    const tree=kit.root.children.find(o=>o instanceof T.Group&&Math.abs(o.position.x+31.7)<.01&&Math.abs(o.position.z-29.7)<.01&&new T.Box3().setFromObject(o).max.y>9.8)
    assert.ok(tree,'spa tree is deliberately positioned beneath its dome')
    let checked=0
    tree.traverse(o=>{
      if(!(o instanceof T.Mesh))return
      const positions=o.geometry.attributes.position,p=new T.Vector3()
      for(let i=0;i<positions.count;i++){
        p.fromBufferAttribute(positions,i).applyMatrix4(o.matrixWorld)
        if(p.y<9.8)continue
        checked++
        const radius=((p.x+31.7)/4.7)**2+((p.z-29.7)/5.15)**2
        assert.ok(radius<1,'branches stay inside roof opening')
        assert.ok(p.y<10.18+4.6*Math.sqrt(1-radius)-.3,'branches keep clearance beneath glazing')
      }
    })
    assert.ok(checked>100,'clearance must check the real canopy, not the soil underneath')
    assert.equal(walkable({x:-31.7,z:29.7}),false,'planted tree pocket blocks walking')
    assert.equal(walkable({x:-28.5,z:30}),true,'spa destination remains clear')
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


test('four stair flights survive batching with physical risers and their real floor identity',()=>{
 const scene=new T.Scene(),kit=createEstateKit(scene)
 try {
  architecture(kit);kit.finish();scene.updateMatrixWorld(true)
  const flights=[['ST1',-22,-15,39,44,6,4.8,8,'x'],['ST2',15,24,47,51,4.8,6,8,'x'],['ST3',-15,-11,-64,-60,5.2,6,5,'z'],['ST4',12,16,-64,-60,5.2,6,5,'z']] as const
  for(const [code,x1,x2,z1,z2,start,end,count,axis] of flights){
   const meshes=scene.children.filter(m=>m.userData.estatePlan?.code===code)
   assert.ok(meshes.length,code+' is a selectable real mesh')
   for(let i=0;i<count;i++){
    const x=axis==='x'?x1+(x2-x1)*(i+.5)/count:(x1+x2)/2,z=axis==='z'?z1+(z2-z1)*(i+.5)/count:(z1+z2)/2
    const hit=new T.Raycaster(new T.Vector3(x,10,z),new T.Vector3(0,-1,0)).intersectObjects(meshes)[0]
    const top=Math.min(start,end)+Math.abs(end-start)*(end>start?i+1:count-i)/count
    assert.ok(hit&&Math.abs(hit.point.y-top)<.00001,code+' tread elevation')
   }
  }
  const court=scene.children.filter(o=>o.userData.estatePlan?.name==='Arrival court')
  const hit=new T.Raycaster(new T.Vector3(10,8,48),new T.Vector3(0,-1,0)).intersectObjects(court)[0]
  assert.ok(hit&&Math.abs(hit.point.y-4.8)<.001,'stone court stays at arrival level')
  assert.equal((hit.object as T.Mesh<T.BufferGeometry,T.Material>).material,kit.material('cobblestone'))
 } finally {kit.dispose()}
})

test('pool-tip paving remains above the island terrain across the entire lower terrace',()=>{
 const scene=new T.Scene(),kit=createEstateKit(scene)
 try {
  architecture(kit);landscape(kit);kit.finish();scene.updateMatrixWorld(true)
  for(const x of [-13,-8,-3,3,8,14])for(const z of [-68,-66,-64.5,-61]){
   if(z===-61&&(x===-13||x===14))continue
   const hits=new T.Raycaster(new T.Vector3(x,9,z),new T.Vector3(0,-1,0)).intersectObjects(scene.children)
   const floor=hits.find(h=>h.object.userData.estatePlan?.code==='P14')
   assert.ok(floor,'terrace slab under sample')
   assert.ok(hits.filter(h=>(h.object as T.Mesh).material===kit.material('soil')).every(h=>h.point.y<floor.point.y-.01),'terrain never protrudes through the lower terrace at '+JSON.stringify({x,z}))
  }
 } finally {kit.dispose()}
})


test('plan audit keeps unique surface codes and includes the lower pool terrace perimeter',()=>{
 assert.equal(new Set(estateSurfaces.map(s=>s.code)).size,estateSurfaces.length,'stairs do not reuse existing room codes')
 const north=estateEdges.filter(e=>Math.abs(e.a[1]+70)<.001&&Math.abs(e.b[1]+70)<.001)
 assert.ok(north.length,'lower terrace north perimeter is audited')
 assert.ok(north.every(e=>e.kind==='railing'&&e.audit==='covered'),'lower terrace perimeter follows its real guard')
 assert.equal(estateEdges.some(e=>e.kind==='open'&&Math.abs(e.a[1]+64)<.001&&Math.abs(e.b[1]+64)<.001),false,'joined lower landings are not reported as exposed edges')
})
