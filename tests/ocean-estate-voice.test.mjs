import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8')
const npc=read('../src/experiences/estate/npcs.ts')
const rig=read('../src/characters/kuna/rig.ts')
const expressions=read('../src/characters/kuna/expressions.ts')
const scene=read('../src/experiences/estate/scene.ts')
const ui=read('../src/experiences/OceanEstate.tsx')
const voice=read('../src/experiences/estate/useKunaVoice.ts')
const config=JSON.parse(read('../vercel.json'))
const originalVoice=read('../src/lib/ttsVoices.ts')
const style=read('../src/lib/voiceStyle.ts')

test('Ocean Estate loads the exact active Procedia fox GLB and native animation clips',()=>{
  assert.match(npc,/PROCEDIA_KUNA_MODEL='\/models\/fox-mascot\.glb'/)
  assert.match(npc,/new GLTFLoader\(\)\.load\(PROCEDIA_KUNA_MODEL/)
  assert.match(npc,/KUNA_HEIGHT\/size\.y/)
  assert.match(rig,/new T\.AnimationMixer\(model\)/)
  assert.match(rig,/getObjectByName\('Chin'\)/)
  assert.match(npc,/KUNA_HEIGHT\/size\.y/,'scale the actual Procedia model for the Estate')
  assert.match(npc,/export const KUNA_HEIGHT=\.78/,'Kuna is smaller than the chat room avatar')
  assert.doesNotMatch(npc,/new T\.ConeGeometry\(/,'no procedural lookalike fox geometry')
  const match=config.rewrites.find(x=>x.source==='/models/fox-mascot.glb')
  assert.deepEqual(match,{source:'/models/fox-mascot.glb',destination:'https://procedia-two.vercel.app/models/fox-mascot.glb'})
})
test('tap on Kuna uses dedicated 3D ray hit, not a floor tap or text bubble',()=>{
  assert.match(npc,/hit\(ray:T\.Ray\)/)
  assert.match(scene,/if\(kuna\?\.hit\(raycaster\.ray\)\)\{stop\(\);return \{kind:'kuna'\}\}/)
  assert.match(scene,/setKunaTalking\(active:boolean,jaw=0\)/)
  assert.match(ui,/picked\.kind==='kuna'\)\{setHelp\(false\);kunaVoice\.tap\(\)\}/)
  assert.doesNotMatch(ui,/kuna-chat-bubble|oe-kuna-dialogue/)
})
test('Kuna voice uses same Procedia STT/chat/TTS contracts and verse voice styling',()=>{
  const expected=[
    ['/api/kuna/speech-to-text','https://procedia-two.vercel.app/api/speech-to-text'],
    ['/api/kuna/chat','https://procedia-two.vercel.app/api/chat'],
    ['/api/kuna/tts','https://procedia-two.vercel.app/api/tts'],
  ]
  for(const [source,destination] of expected)assert.equal(config.rewrites.find(x=>x.source===source)?.destination,destination)
  assert.match(voice,/fetch\('\/api\/kuna\/speech-to-text'/)
  assert.match(voice,/fetch\('\/api\/kuna\/chat'/)
  assert.match(voice,/fetch\('\/api\/kuna\/tts'/)
  assert.match(voice,/getVoiceStyle\(answer\)/)
  assert.match(voice,/voice:DEFAULT_TTS_VOICE/)
  assert.match(originalVoice,/DEFAULT_TTS_VOICE[^\n]*'verse'/)
  assert.match(style,/function getVoiceStyle\(text: string\)/)
  assert.match(voice,/new MediaRecorder\(/)
  assert.match(voice,/heardSpeech\.current&&at-startAt\.current>1000&&at-lastSound\.current>1250/)
})
test('no new student data endpoints or chat transcripts and no new API secrets',()=>{
  assert.doesNotMatch(voice,/localStorage|sessionStorage|supabase|console\.log\(said|setHistory|setMessages/)
  assert.doesNotMatch(config.rewrites.map(x=>x.source).join('\n'),/\/api\/student|\/auth/)
  assert.match(ui,/oe-kuna-status/)
  assert.doesNotMatch(ui,/kunaVoice\.transcript|kunaVoice\.reply/)
})

test('Kuna uses a collision-first state machine and blends feet with actual ground velocity',()=>{
  assert.match(npc,/createKunaNavigator\(\)/)
  assert.match(npc,/createKunaBehavior\(nav,KUNA_HOME\)/)
  assert.match(npc,/behavior\.update\(elapsed,player,holding\)/)
  assert.match(rig,/walkBlend=T\.MathUtils\.damp\(walkBlend,targetWalk,5,elapsed\)/)
  assert.match(rig,/walk\?\.setEffectiveWeight\(\(1-sitWeight\)\*walkBlend\)/)
  assert.match(rig,/idle\?\.setEffectiveWeight\(\(1-sitWeight\)\*\(1-walkBlend\)\)/)
  assert.doesNotMatch(npc,/walk\?\.reset\(\)|idle\?\.reset\(\)/)
  assert.match(rig,/model\.position\.copy\(neutralPosition\)/,'model-root motion never drifts relative to collision body')
  assert.match(scene,/const kunaInterval=cameraMoving\?0:33/,'Kuna tracks the viewer frame rate during walking')
  assert.match(npc,/KUNA_HEIGHT\*\.56/,'tap target tracks accepted fox scale')
})

test('Kuna shares an authentic Sit/Head/Chin expression rig rather than inventing new animated assets',()=>{
  assert.match(npc,/import \{ createKunaRig \} from '\.\.\/\.\.\/characters\/kuna\/rig'/)
  assert.match(npc,/rig=createKunaRig\(model,gltf\.animations\)/)
  assert.match(rig,/clips\.find\(c=>c\.name==='Sit'\)/)
  assert.match(rig,/sit\.paused=true/,'the original Sit pose must hold while listening')
  assert.match(rig,/sit\.time=clamp\(sitAmount\*sitClip!\.duration/)
  assert.match(rig,/getObjectByName\('Head'\)/)
  assert.match(rig,/getObjectByName\('Chin'\)/)
  assert.match(rig,/jawEuler\.set\(\.381\*jawAmount,0,0\)/,'match Procedia jaw rotation')
  assert.match(rig,/head\.quaternion\.copy\(neutralHead\)\.multiply\(headQuaternion\)/,'no rolling baseline under Sit/Idle')
  assert.match(rig,/conversationalHeadPose\(phase,phaseElapsed,sitAmount\)/)
  assert.match(npc,/holding=focus\|\|Boolean\(rig\?\.isTransitioning\(\)\)/,'keep collision body stationary through sit/stand')
  assert.match(npc,/setPhase\(next:KunaVoicePhase\)/)
  assert.match(voice,/visual\.current\(next!=='idle',0,next\)/)
  assert.match(scene,/setKunaPhase\(phase:KunaVoicePhase\)/)
  assert.match(ui,/engine\.current\?\.setKunaPhase\(phase\)/)
  assert.match(expressions,/listen\.curious/)
  assert.doesNotMatch(ui,/kuna-chat-bubble|oe-kuna-dialogue/)
})
