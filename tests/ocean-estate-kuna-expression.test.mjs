import test from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
import {readFileSync} from 'node:fs'

const source=readFileSync(new URL('../src/characters/kuna/expressions.ts',import.meta.url),'utf8')
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const {KUNA_EXPRESSIONS,validateKunaRecipe,sampleKunaRecipe,conversationalHeadPose}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'))

test('Kuna expression recipes are reusable, valid and safe for a child-facing avatar',()=>{
  for(const [phase,recipe] of Object.entries(KUNA_EXPRESSIONS)){
    assert.equal(validateKunaRecipe(recipe),true,phase)
    assert.equal(recipe.version,1)
    assert.equal(recipe.keys[0].at,0)
    assert.equal(recipe.keys.at(-1).at,recipe.duration)
    for(let t=0;t<recipe.duration*5;t+=.035){
      const p=conversationalHeadPose(phase,t,1)
      assert.ok(Number.isFinite(p.pitch)&&Number.isFinite(p.turn)&&Number.isFinite(p.tilt))
      assert.ok(Math.abs(p.pitch)<=.32&&Math.abs(p.turn)<=.28&&Math.abs(p.tilt)<=.32)
    }
  }
  assert.equal(KUNA_EXPRESSIONS.listening.id,'listen.curious')
  assert.equal(KUNA_EXPRESSIONS.thinking.id,'think.puzzled')
  assert.equal(KUNA_EXPRESSIONS.speaking.id,'reply.gentle-enthusiasm')
})
test('recorded recipes interpolate deterministically independent of 30/60 FPS',()=>{
  const recipe=KUNA_EXPRESSIONS.listening
  for(const t of [0,.04,.35,.42,.9,1.4,2.5,3.19,3.2,8.2]){
    const direct=sampleKunaRecipe(recipe,t)
    const same=sampleKunaRecipe(recipe,t)
    assert.deepEqual(direct,same)
    assert.deepEqual(direct,sampleKunaRecipe(recipe,t+recipe.duration*3))
  }
  const sample=(fps)=>{
    let time=0
    for(let i=0;i<fps*6;i++)time+=1/fps
    return sampleKunaRecipe(recipe,time)
  }
  const a=sample(30),b=sample(60)
  assert.ok(Math.abs(a.pitch-b.pitch)<1e-9&&Math.abs(a.tilt-b.tilt)<1e-9)
})
test('neutral and seated look-up remain smooth and non-exaggerated',()=>{
  assert.deepEqual(conversationalHeadPose('idle',0,0),{pitch:0,turn:0,tilt:0})
  const look=conversationalHeadPose('idle',0,1)
  assert.ok(look.pitch<-.12&&look.pitch>-.3)
  assert.equal(look.turn,0);assert.equal(look.tilt,0)
  const partial=conversationalHeadPose('idle',0,.5)
  assert.ok(partial.pitch<0&&partial.pitch>look.pitch)
})
test('invalid or out-of-range imported recipes fail closed',()=>{
  const base=KUNA_EXPRESSIONS.listening
  assert.equal(validateKunaRecipe({...base,duration:30}),false)
  assert.equal(validateKunaRecipe({...base,keys:[...base.keys.slice(0,-1),{...base.keys.at(-1),pitch:1.9}]}),false)
  assert.equal(validateKunaRecipe({...base,keys:[{...base.keys[0],at:.2},...base.keys.slice(1)]}),false)
  assert.deepEqual(sampleKunaRecipe({...base,duration:30},1),{pitch:0,turn:0,tilt:0})
})
