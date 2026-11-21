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
  const {createKunaRig}=await import(pathToFileURL(rigPath).href)
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
  test('Studio UI records, replays, labels afterward, imports/exports, without billable requests',()=>{
    const ui=readFileSync(new URL('../src/experiences/KunaLab.tsx',import.meta.url),'utf8')
    assert.match(ui,/createKunaRecorder/)
    assert.match(ui,/recorderRef\.current\.beginOnInput/)
    assert.match(ui,/recorderRef\.current\.capture\(now,actual\)/)
    assert.match(ui,/Save & next take/)
    assert.match(ui,/What does this gesture feel like/)
    assert.match(ui,/Export all takes/)
    assert.match(ui,/sampleProcediaKeys/)
    assert.match(ui,/PROCEDIA_CLIP_KEYS/)
    assert.match(ui,/window\.speechSynthesis\.speak\(utterance\)/)
    assert.doesNotMatch(ui,/fetch\('\/api\/kuna\//)
  })
}finally{await rm(dir,{recursive:true,force:true})}
