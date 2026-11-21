import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp,rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import * as THREE from 'three'

const source=readFileSync(new URL('../src/characters/kuna/rig.ts',import.meta.url),'utf8')
const ui=readFileSync(new URL('../src/experiences/KunaLab.tsx',import.meta.url),'utf8')
const main=readFileSync(new URL('../src/main.tsx',import.meta.url),'utf8')
const estate=readFileSync(new URL('../src/experiences/OceanEstate.tsx',import.meta.url),'utf8')
const dir=await mkdtemp(path.resolve('node_modules/.kuna-lab-test-'))
const output=path.join(dir,'rig.mjs')
try{
  await build({entryPoints:['src/characters/kuna/rig.ts'],outfile:output,bundle:true,platform:'node',format:'esm',packages:'external'})
  const {createKunaRig}=await import(pathToFileURL(output).href)
  test('Procedia Head orientation stays bounded despite wildly rotating imported Sit clip',()=>{
    const model=new THREE.Group()
    const head=new THREE.Object3D();head.name='Head';model.add(head)
    const chin=new THREE.Object3D();chin.name='Chin';head.add(chin)
    const body=new THREE.Object3D();body.name='Body';model.add(body)
    const wild=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),Math.PI)
    const rest=new THREE.Quaternion()
    const sit=new THREE.AnimationClip('Sit',2,[
      new THREE.QuaternionKeyframeTrack('Head.quaternion',[0,1,2],[...rest.toArray(),...wild.toArray(),...wild.toArray()]),
      new THREE.VectorKeyframeTrack('Body.position',[0,1,2],[0,0,0,0,-.15,0,0,-.25,0])
    ])
    const idle=new THREE.AnimationClip('Idle',2,[
      new THREE.QuaternionKeyframeTrack('Head.quaternion',[0,2],[...wild.toArray(),...wild.toArray()])
    ])
    const walk=new THREE.AnimationClip('Walk',1,[])
    const rig=createKunaRig(model,[idle,sit,walk])
    assert.equal(rig.hasSit,true)
    assert.equal(rig.hasWalk,true)
    let maxAngle=0
    for(let i=0;i<600;i++){
      const phase=i<180?'listening':i<400?'speaking':'idle'
      rig.update(1/60,{active:i<430,phase,speedFraction:0,jaw:phase==='speaking'?.65:0})
      maxAngle=Math.max(maxAngle,head.quaternion.angleTo(rest))
    }
    assert.ok(maxAngle<.37,'head must never flip or inherit a 180° Sit motion; max='+maxAngle)
    assert.ok(chin.quaternion.angleTo(rest)<.02,'jaw returns to neutral after speaking')
    rig.dispose()
  })
  test('head gestures keep Procedia Z-turn, X-pitch and Y-tilt axes separate',()=>{
    const fox=new THREE.Group(),head=new THREE.Object3D();head.name='Head';fox.add(head)
    const rig=createKunaRig(fox,[new THREE.AnimationClip('Idle',1,[])])
    for(let i=0;i<180;i++)rig.update(1/60,{active:false,phase:'idle',speedFraction:0,jaw:0,
      manualPose:{pitch:0,turn:0,tilt:.15}})
    const e=new THREE.Euler().setFromQuaternion(head.quaternion,'XYZ')
    assert.ok(Math.abs(e.y)>.10,'curious tilt rotates on original Procedia Y axis')
    assert.ok(Math.abs(e.z)<.03,'tilt does not accidentally spin around the turn axis')
    rig.dispose()
  })
  test('Kuna Lab uses original GLB, bounded controls and local speaking simulator',()=>{
    assert.match(ui,/\/models\/fox-mascot\.glb/)
    assert.match(ui,/createKunaRig\(glb,asset\.animations\)/)
    assert.match(ui,/runSimulation\(\)/)
    assert.match(ui,/window\.speechSynthesis\.speak\(utterance\)/)
    assert.match(ui,/No AI requests|No API request/)
    assert.match(ui,/validateKunaRecipe\(recipe\)/)
    assert.match(ui,/Record|Stop & Save/)
    assert.match(ui,/Export JSON/)
    assert.doesNotMatch(ui,/fetch\('\/api\/kuna\//,'local simulation never makes a billable call')
    assert.match(source,/HEAD_JAW_TRACK/)
    assert.match(source,/neutralHead=head\?\.quaternion\.clone\(\)/)
  })
  test('Kuna Lab is a reusable route available from Lab hub and Ocean Estate',()=>{
    assert.match(main,/const KunaLab = lazy/)
    assert.match(main,/window\.location\.pathname === '\/kuna-lab'/)
    assert.match(main,/navigate\('kuna-lab'\)/)
    assert.match(main,/view === 'kuna-lab'/)
    assert.match(estate,/window\.location\.assign\('\/kuna-lab'\)/)
    assert.match(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'),/"source": "\/kuna-lab", "destination": "\/"/)
  })
}finally{await rm(dir,{recursive:true,force:true})}
