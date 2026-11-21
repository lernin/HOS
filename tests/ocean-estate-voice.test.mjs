import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8')
const npc=read('../src/experiences/estate/npcs.ts')
const scene=read('../src/experiences/estate/scene.ts')
const ui=read('../src/experiences/OceanEstate.tsx')
const voice=read('../src/experiences/estate/useKunaVoice.ts')
const config=JSON.parse(read('../vercel.json'))
const originalVoice=read('../src/lib/ttsVoices.ts')
const style=read('../src/lib/voiceStyle.ts')

test('Ocean Estate loads the exact active Procedia fox GLB and native animation clips',()=>{
  assert.match(npc,/PROCEDIA_KUNA_MODEL='\/models\/fox-mascot\.glb'/)
  assert.match(npc,/new GLTFLoader\(\)/)
  assert.match(npc,/loader\.load\(PROCEDIA_KUNA_MODEL/)
  assert.match(npc,/new T\.AnimationMixer\(model\)/)
  assert.match(npc,/getObjectByName\('Chin'\)/)
  assert.match(npc,/1\.29\/size\.y/,'preserve Procedia Avatar target height')
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
