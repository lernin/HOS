import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdtemp,rm} from 'node:fs/promises'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import * as THREE from 'three'

const dir=await mkdtemp(path.resolve('node_modules/.kuna-studio-test-'))
try{
  const keyboardPath=path.join(dir,'keys.mjs'),recorderPath=path.join(dir,'recorder.mjs'),rigPath=path.join(dir,'rig.mjs')
  await Promise.all([
    build({entryPoints:['src/characters/kuna/procediaKeyboard.ts'],outfile:keyboardPath,bundle:true,platform:'node',format:'esm',packages:'external'}),
    build({entryPoints:['src/characters/kuna/studioRecorder.ts'],outfile:recorderPath,bundle:true,platform:'node',format:'esm',packages:'external'}),
    build({entryPoints:['src/characters/kuna/rig.ts'],outfile:rigPath,bundle:true,platform:'node',format:'esm',packages:'external'}),
  ])
  const keys=await import(pathToFileURL(keyboardPath).href)
  const motion=await import(pathToFileURL(recorderPath).href)
  const {createKunaRig,kunaStudioView}=await import(pathToFileURL(rigPath).href)
  const keysDown=(...codes)=>new Set(codes)
  const still={pitch:0,turn:0,tilt:0,jaw:0}

  test('Studio copies all 14 held Procedia controls plus all 10 one-shot clips',()=>{
    assert.equal(keys.PROCEDIA_KEY_ROWS.length,14)
    assert.equal(Object.keys(keys.PROCEDIA_CLIP_KEYS).length,10)
    for(const code of ['KeyJ','KeyL','KeyI','KeyK','KeyD','KeyF','KeyQ','KeyC','KeyV',
      'KeyW','KeyR','KeyT','Space','KeyA','Digit1','Digit4','Digit9','Numpad0']){
      assert.equal(keys.isProcediaKey(code),true,code)
    }
    assert.deepEqual(keys.getProcediaClip('Digit4'),{name:'Sit'})
    assert.deepEqual(keys.getProcediaClip('Digit5'),{name:'Idle Alert',timeScale:.55})
    assert.deepEqual(keys.getProcediaClip('Numpad0'),{name:'Bite'})
    assert.equal(keys.getProcediaClip('KeyZ'),null)
    const t=1
    assert.ok(keys.sampleProcediaKeys(keysDown('KeyJ'),t).turn>0)
    assert.ok(keys.sampleProcediaKeys(keysDown('KeyL'),t).turn<0)
    assert.ok(keys.sampleProcediaKeys(keysDown('KeyI'),t).pitch<0)
    assert.ok(keys.sampleProcediaKeys(keysDown('KeyK'),t).pitch>0)
    assert.ok(keys.sampleProcediaKeys(keysDown('KeyD'),t).tilt>0)
    assert.ok(keys.sampleProcediaKeys(keysDown('KeyF'),t).tilt<0)
    assert.equal(keys.sampleProcediaKeys(keysDown('Space'),t).jaw,1)
    assert.equal(keys.sampleProcediaKeys(keysDown('KeyA'),t).freeze,true)
    assert.deepEqual(keys.sampleProcediaKeys(new Set(),t),{pitch:0,turn:0,tilt:0,jaw:0,freeze:false})
  })

  test('Procedia slow/regular/vigorous nods and shakes are truly distinct while held',()=>{
    for(const row of [['KeyQ','KeyC','KeyV','turn'],['KeyW','KeyR','KeyT','pitch']]){
      const [ordinary,slow,vigorous,channel]=row
      const different=new Set([ordinary,slow,vigorous].map(code=>
        Array.from({length:10},(_,i)=>keys.sampleProcediaKeys(keysDown(code),.37+i*.17)[channel].toFixed(4)).join(',')))
      assert.equal(different.size,3)
    }
  })
  test('Recording arms and only starts on first key, excludes paused time and stores clip triggers',()=>{
    const r=motion.createKunaRecorder()
    r.arm();assert.equal(r.mode(),'armed')
    r.capture(500,still);assert.equal(r.mode(),'armed')
    r.beginOnInput(1000,still);assert.equal(r.mode(),'recording')
    r.capture(1120,{...still,tilt:.1,jaw:.2})
    r.clip(1120,{name:'Sit'})
    r.pause(1200);assert.equal(r.mode(),'paused')
    r.capture(1700,{...still,turn:.9})
    r.resume(2200);assert.equal(r.mode(),'recording')
    r.capture(2300,{...still,pitch:.1})
    const take=r.finish(2500,{...still,pitch:.15},'take-001')
    assert.ok(take)
    assert.equal(take.version,2)
    assert.equal(take.label,'','unlabeled takes are intentional')
    assert.deepEqual(take.tags,[])
    assert.equal(take.duration,.5,'one second pause not included')
    assert.equal(take.clips[0].name,'Sit')
    assert.ok(take.frames.length>=3)
    assert.equal(motion.validateKunaTake(take),true)
    assert.equal(r.mode(),'idle')
  })
  test('replay interpolates captured movement and failed imports never run',()=>{
    const take={version:2,id:'take-002',label:'',tags:[],duration:1,
      frames:[{at:0,...still},{at:.5,pitch:.2,turn:-.2,tilt:.2,jaw:.3},{at:1,...still}],
      clips:[{at:.4,name:'Jump'}]}
    assert.equal(motion.validateKunaTake(take),true)
    assert.equal(motion.sampleKunaTake(take,.5).jaw,.3)
    assert.ok(Math.abs(motion.sampleKunaTake(take,.25).pitch-.1)<1e-9)
    assert.deepEqual(motion.sampleKunaTake(take,.25),motion.sampleKunaTake(take,.25))
    assert.equal(motion.validateKunaTake({...take,clips:[{at:0,name:'ArbitraryUserCode'}]}),false)
    assert.equal(motion.validateKunaTake({...take,duration:200}),false)
    assert.equal(motion.validateKunaTake({...take,frames:[{...still,at:0,pitch:9}]}),false)
  })
  test('emotion catalog and per-take ratings are separate from playback intensity',()=>{
    assert.deepEqual([...motion.KUNA_STARTER_EMOTIONS],[
      'enthusiasm','curiosity','agreement','uncertainty','attentiveness','disagreement'])
    assert.equal(motion.normalizeKunaEmotion('  Gentle  Reassurance '),'gentle reassurance')
    assert.equal(motion.validKunaEmotion('gentle reassurance'),true)
    assert.equal(motion.validKunaEmotion('injected<script>'),false)
    const take={version:2,id:'take-003',label:'curious tilt',tags:[],duration:1,
      frames:[{at:0,...still},{at:.5,pitch:.4,turn:-.2,tilt:.1,jaw:.6},{at:1,...still}],
      clips:[],emotions:{curiosity:90,enthusiasm:0},playbackIntensity:25}
    assert.equal(motion.validateKunaTake(take),true)
    assert.equal(motion.sampleKunaTake(take,.5).pitch,.4,'recording remains unmodified')
    assert.equal(motion.sampleKunaTake(take,.5,25).pitch,.1,'head replay is scaled')
    assert.equal(motion.sampleKunaTake(take,.5,25).jaw,.15,'jaw replay is scaled')
    assert.equal(motion.sampleKunaTake(take,.5,0).pitch,0)
    assert.equal(motion.validateKunaTake({...take,emotions:{curiosity:101}}),false)
    assert.equal(motion.validateKunaTake({...take,emotions:{curiosity:-1}}),false)
    assert.equal(motion.validateKunaTake({...take,emotions:{curiosity:22.5}}),false)
    assert.equal(motion.validateKunaTake({...take,emotions:{'bad<>':50}}),false)
    assert.equal(motion.validateKunaTake({...take,playbackIntensity:101}),false)
    assert.equal(motion.validateKunaTake({...take,playbackIntensity:-5}),false)
    const legacy={...take};delete legacy.emotions;delete legacy.playbackIntensity
    assert.equal(motion.validateKunaTake(legacy),true,'existing v2 takes still validate')
    const contexts={...take,contexts:['face-to-face','alongside']}
    assert.equal(motion.validateKunaTake(contexts),true,'one take supports both views')
    assert.equal(motion.validateKunaTake({...take,contexts:['face-to-face','face-to-face']}),false)
    assert.equal(motion.validateKunaTake({...take,contexts:['left']}),false,'mirroring is not a separate emotional context')
    assert.equal(motion.validateKunaTake({...take,contexts:[]}),false)
    assert.equal(motion.sampleKunaTake(take,.5,25,true).turn,.05,'mirroring reverses horizontal turn')
    assert.equal(motion.sampleKunaTake(take,.5,25,true).tilt,-.025,'mirroring reverses side tilt')
    assert.equal(motion.sampleKunaTake(take,.5,25,true).pitch,.1,'mirroring retains pitch')
    assert.equal(motion.sampleKunaTake(take,.5,25,true).jaw,.15,'mirroring retains mouth')

  })
  test('gallery UI exposes recorded motion traces, explicit ratings, catalog and legacy import',()=>{
    const ui=readFileSync(new URL('../src/experiences/KunaLab.tsx',import.meta.url),'utf8')
    for(const label of ['Expression gallery','Register a new emotion','emotional strength',
      'Playback intensity','Filter takes by registered emotion','Export gallery + vocabulary']){
      assert.ok(ui.includes(label),label)
    }
    assert.match(ui,/sampleKunaTake\(preview.take,time,preview.take.playbackIntensity\?\?100,\s*beside&&auditionSideRef\.current==='left'\)/)
    assert.match(ui,/version:3,emotions:emotionCatalog,takes/)
    assert.match(ui,/Array.isArray\(source\)\?source:\[source\]/)
    assert.match(ui,/validKunaEmotion/)
    assert.match(ui,/Face-to-face/)
    assert.match(ui,/Walking alongside/)
    assert.match(ui,/Filter takes by performance context/)
    assert.match(ui,/Mirror view:/)
    assert.match(ui,/speedFraction:beside\s*\?\s*0\.58\s*:\s*0/)
    assert.match(ui,/studioRoot\.rotation\.y=placement\.bodyYaw/)
    assert.match(ui,/studioRoot\.position\.set\(placement\.offsetX/)
    assert.doesNotMatch(ui,/fetch\('\/api\/kuna\//)
  })
  test('rig plays native one-shot Sit and resets shared animation actions safely',()=>{
    const model=new THREE.Group()
    const head=new THREE.Object3D();head.name='Head';model.add(head)
    const chin=new THREE.Object3D();chin.name='Chin';head.add(chin)
    const k=()=>new THREE.AnimationClip('Idle',1,[])
    const rig=createKunaRig(model,[k(),new THREE.AnimationClip('Sit',.5,[]),
      new THREE.AnimationClip('Walk',.6,[]),new THREE.AnimationClip('Jump',.3,[])])
    assert.equal(rig.triggerDemoClip('Sit'),true)
    for(let i=0;i<45;i++)rig.update(1/60,{active:false,phase:'idle',speedFraction:0,jaw:0,studioMode:true})
    assert.equal(rig.triggerDemoClip('Walk'),true)
    for(let i=0;i<45;i++)rig.update(1/60,{active:false,phase:'idle',speedFraction:0,jaw:0,studioMode:true})
    assert.equal(rig.triggerDemoClip('Jump'),true)
    for(let i=0;i<30;i++)rig.update(1/60,{active:false,phase:'idle',speedFraction:0,jaw:0,studioMode:true})
    assert.equal(rig.triggerDemoClip('Invalid'),false)
    rig.update(1/60,{active:false,phase:'idle',speedFraction:0,jaw:0,manualPose:{pitch:.3,turn:.2,tilt:.15},manualJaw:.5,studioMode:true,directPose:true})
    assert.ok(Math.abs(rig.displayedPose().pitch-.3)<1e-9)
    assert.ok(Math.abs(rig.displayedPose().jaw-.5)<1e-9)
    rig.dispose()
  })
  test('Procedia Idle Chin animation supplies the closed-mouth baseline even while walking',()=>{
    const model=new THREE.Group()
    const chin=new THREE.Object3D();chin.name='Chin';model.add(chin)
    const open=chin.quaternion.clone()
    const closed=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-.23)
    const idleChin=new THREE.QuaternionKeyframeTrack('Chin.quaternion',[0,1],
      [...closed.toArray(),...closed.toArray()])
    const walkChin=new THREE.QuaternionKeyframeTrack('Chin.quaternion',[0,1],
      [...open.toArray(),...open.toArray()])
    const rig=createKunaRig(model,[
      new THREE.AnimationClip('Idle',1,[idleChin]),
      new THREE.AnimationClip('Walk',1,[walkChin])])
    for(let i=0;i<60;i++)rig.update(1/60,{active:false,phase:'idle',speedFraction:.58,jaw:0})
    assert.ok(chin.quaternion.angleTo(closed)<1e-5,'use native Procedia Idle jaw, not open GLB bind or Walk jaw')
    rig.update(1/60,{active:false,phase:'speaking',speedFraction:0,jaw:.8,directPose:true})
    assert.ok(chin.quaternion.angleTo(closed)>.1,'speaking may open from the correct neutral pose')
    for(let i=0;i<45;i++)rig.update(1/60,{active:false,phase:'idle',speedFraction:.58,jaw:1})
    assert.ok(chin.quaternion.angleTo(closed)<1e-5,'speaking closes completely while moving')
    rig.dispose()
  })

  test('walking rehearsal moves ahead on the child\'s side and faces the same travel direction',()=>{
    assert.equal(typeof kunaStudioView,'function')
    const front=kunaStudioView('face-to-face','right')
    assert.equal(front.bodyYaw,0)
    assert.equal(front.offsetX,0)
    const right=kunaStudioView('alongside','right')
    const left=kunaStudioView('alongside','left')
    assert.ok(right.offsetX>0&&left.offsetX<0,'Kuna should be beside, not in the center')
    assert.ok(right.offsetZ<0&&left.offsetZ<0,'Kuna should be ahead of the viewer')
    assert.equal(right.bodyYaw,Math.PI,'both advance in the same forward direction')
    assert.equal(left.bodyYaw,Math.PI)
    const facing=new THREE.Vector3(0,0,1).applyAxisAngle(new THREE.Vector3(0,1,0),right.bodyYaw)
    assert.ok(facing.z<-.99,'Kuna must move away with the child, not toward them')
    assert.equal(right.cameraX,0,'camera stays at child position rather than orbiting the fox')
    assert.equal(left.cameraX,0)
    assert.equal(right.offsetX,-left.offsetX,'mirrored position, one animation library')
    assert.equal(right.attentionTurn,-left.attentionTurn,'gaze mirrors toward child')
  })

  test('Procedure neutral jaw closes fully after speech and while walking',()=>{
    const model=new THREE.Group()
    const head=new THREE.Object3D();head.name='Head';model.add(head)
    const chin=new THREE.Object3D();chin.name='Chin';head.add(chin)
    chin.quaternion.setFromAxisAngle(new THREE.Vector3(0,0,1),.15)
    const original=chin.quaternion.clone()
    const rig=createKunaRig(model,[new THREE.AnimationClip('Idle',1,[]),new THREE.AnimationClip('Walk',1,[])])
    rig.update(1/60,{active:false,phase:'speaking',speedFraction:0,jaw:.9})
    assert.ok(chin.quaternion.angleTo(original)>.001,'real speech opens jaw')
    for(let i=0;i<40;i++)rig.update(1/60,{active:false,phase:'idle',speedFraction:.55,jaw:1})
    assert.ok(chin.quaternion.angleTo(original)<1e-8,'idle/walking cannot inherit stale audio jaw')
    assert.equal(rig.displayedPose().jaw,0)
    rig.update(1/60,{active:false,phase:'idle',speedFraction:.55,jaw:0,manualJaw:.5})
    assert.ok(chin.quaternion.angleTo(original)>.001,'deliberate Studio jaw remains available')
    for(let i=0;i<40;i++)rig.update(1/60,{active:false,phase:'idle',speedFraction:.55,jaw:0})
    assert.ok(chin.quaternion.angleTo(original)<1e-8)
    rig.dispose()
  })
  test('Studio UI records, replays, labels afterward, imports/exports, without billable requests',()=>{
    const ui=readFileSync(new URL('../src/experiences/KunaLab.tsx',import.meta.url),'utf8')
    assert.match(ui,/createKunaRecorder/)
    assert.match(ui,/recorderRef\.current\.beginOnInput/)
    assert.match(ui,/recorderRef\.current\.capture\(now,actual\)/)
    assert.match(ui,/Save & next take/)
    assert.match(ui,/Which emotions does the gesture communicate/)
    assert.match(ui,/Export all takes/)
    assert.match(ui,/sampleProcediaKeys/)
    assert.match(ui,/PROCEDIA_CLIP_KEYS/)
    assert.match(ui,/window\.speechSynthesis\.speak\(utterance\)/)
    assert.doesNotMatch(ui,/fetch\('\/api\/kuna\//)
  })
}finally{await rm(dir,{recursive:true,force:true})}
