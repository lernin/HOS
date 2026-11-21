import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp,rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
const dir=await mkdtemp(path.resolve('node_modules/.kuna-session-test-'))
const file=path.join(dir,'companion.mjs')
const behaviorFile=path.join(dir,'behavior.mjs')
const navFile=path.join(dir,'nav.mjs')
const rig=readFileSync(new URL('../src/characters/kuna/rig.ts',import.meta.url),'utf8')
const npc=readFileSync(new URL('../src/experiences/estate/npcs.ts',import.meta.url),'utf8')
const scene=readFileSync(new URL('../src/experiences/estate/scene.ts',import.meta.url),'utf8')
const ui=readFileSync(new URL('../src/experiences/OceanEstate.tsx',import.meta.url),'utf8')
try{
  await Promise.all([
    build({entryPoints:['src/characters/kuna/companion-session.ts'],outfile:file,bundle:true,platform:'node',format:'esm'}),
    build({entryPoints:['src/experiences/estate/npc-behavior.ts'],outfile:behaviorFile,bundle:true,platform:'node',format:'esm'}),
    build({entryPoints:['src/experiences/estate/npc-navigation.ts'],outfile:navFile,bundle:true,platform:'node',format:'esm'}),
  ])
  const {createKunaCompanionSession,KUNA_FOLLOW_START_DISTANCE}=await import(pathToFileURL(file).href)
  const {createKunaBehavior,KUNA_FOLLOW_SPEED}=await import(pathToFileURL(behaviorFile).href)
  const {createKunaNavigator,KUNA_HOME,KUNA_KITCHEN_GOALS}=await import(pathToFileURL(navFile).href)
  test('one tap holds a seated session through all voice phases, until child physically moves',()=>{
    const child={x:-12.8,z:8.6},session=createKunaCompanionSession()
    assert.equal(session.mode(),'roaming')
    session.engage(child)
    for(const phase of ['listening','thinking','speaking','idle']){
      assert.equal(session.update({...child}),'engaged','voice stage '+phase+' must not cause standing')
    }
    assert.equal(session.update({x:child.x+.4,z:child.z}),'engaged')
    assert.equal(session.update({x:child.x+KUNA_FOLLOW_START_DISTANCE+.12,z:child.z}),'following')
    assert.equal(session.update(child),'following','do not oscillate back to sit')
    session.engage(child)
    assert.equal(session.mode(),'engaged','tap again to sit and speak')
    session.end();assert.equal(session.mode(),'roaming')
  })
  test('follow target remains collision-safe, keeps physical clearance and stops without teleporting',()=>{
    const nav=createKunaNavigator(),child={x:-12.4,z:7.7},target=KUNA_KITCHEN_GOALS[1]
    assert.ok(nav.isSafe(target))
    const walker=createKunaBehavior(nav,KUNA_HOME)
    let last=walker.snapshot(),travel=0,walking=0
    for(let i=0;i<1200;i++){
      const s=walker.update(1/60,child,false,target)
      assert.ok(nav.isSafe(s.position),'Kuna entered furniture or wall')
      assert.ok(nav.clear(last.position,s.position),'Kuna crossed obstacle')
      const step=Math.hypot(s.position.x-last.position.x,s.position.z-last.position.z)
      assert.ok(step<=KUNA_FOLLOW_SPEED/60+.018,'no teleport')
      travel+=step
      if(s.speed>.09)walking++
      last=s
    }
    assert.ok(travel>1,'Kuna physically walks toward the follow anchor')
    assert.ok(walking>10)
    assert.ok(Math.hypot(last.position.x-target.x,last.position.z-target.z)<.95,'Kuna reaches safe follow anchor')
  })
  test('Kuna takes footstep cycles during turns and can use the authentic Run clip to follow',()=>{
    assert.match(rig,/options\.turning\?\.38:0/)
    assert.match(rig,/const runClip=clips\.find\(c=>c\.name==='Run'\)/)
    assert.match(rig,/run\?\.setEffectiveWeight/)
    assert.match(npc,/turnSteps=frame\.phase==='turn'&&!holding/)
    assert.match(npc,/speedFraction:rig\.hasWalk/)
  })
  test('Estate keeps engagement separate from mic status and publishes movement mode',()=>{
    assert.match(npc,/const session=createKunaCompanionSession\(\)/)
    assert.match(npc,/session\.update\(player\)/)
    assert.match(npc,/active:engaged,phase/)
    assert.match(npc,/setTalking\(_active:boolean,jaw=0\)/)
    assert.match(scene,/engageKuna\(\)\{kuna\?\.engage\(position\)/)
    assert.match(scene,/getKunaMode:/)
    assert.match(ui,/engine\.current\?\.engageKuna\(\);kunaVoice\.tap\(\)/)
    assert.match(ui,/data-kuna-mode/)
  })
}finally{await rm(dir,{recursive:true,force:true})}
