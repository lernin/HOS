import assert from 'node:assert/strict'
const base='https://hos-t7r8-git-feature-ocean-estate-8e3c73-ashley-taits-projects.vercel.app'
const model=await fetch(base+'/models/fox-mascot.glb',{signal:AbortSignal.timeout(20000)})
const bytes=new Uint8Array(await model.arrayBuffer())
const header=String.fromCharCode(...bytes.slice(0,4))
assert.equal(model.status,200,'the preview serves the original Procedia asset')
assert.equal(header,'glTF','the asset is a binary glTF, not a fallback HTML page')
assert.ok(bytes.byteLength>100000&&bytes.byteLength<5000000,'GLB size is plausible')
console.log('Procedia Kuna GLB delivered by HOS preview; bytes',bytes.byteLength)
for(const p of ['/api/kuna/chat','/api/kuna/tts','/api/kuna/speech-to-text']){
  const res=await fetch(base+p,{method:'GET',signal:AbortSignal.timeout(15000)})
  assert.equal(res.status,405,p+' must reach the original Procedia POST-only API without making a billable request')
  console.log('Procedia voice route responds with expected GET 405:',p)
}
