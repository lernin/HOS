import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const source=await readFile(new URL('../src/experiences/stax/two-finger-intent.ts',import.meta.url),'utf8')
const javascript=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
const {startTwoFinger,advanceTwoFinger}=await import('data:text/javascript;base64,'+Buffer.from(javascript).toString('base64'))
const p=(id,x,y)=>({id,x,y})
const first=[p(1,100,100),p(2,250,100)]
const begin=()=>startTwoFinger(...first)
const at=(session,a,b)=>advanceTwoFinger(session,a,b)

test('the initial micro-jitter never moves or zooms the STAX board',()=>{
 let state=begin()
 for(const [a,b] of [[p(1,102,99),p(2,250,101)],[p(1,101,102),p(2,251,100)],[p(1,100,100),p(2,250,100)]]){
  const result=at(state,a,b)
  assert.equal(result.session.mode,'pending')
  assert.equal(result.frame,null)
  state=result.session
 }
})

test('async finger updates do not confuse two-finger scrolling with pinch',()=>{
 let state=begin()
 let result=at(state,p(1,120,100),p(2,250,100))
 assert.equal(result.session.mode,'pending','first moving finger must not trigger zoom')
 state=result.session
 result=at(state,p(1,120,100),p(2,269,102))
 assert.equal(result.session.mode,'pan')
 assert.equal(result.lockedNow,true)
 assert.equal(result.frame,null)
 state=result.session
 // Now both fingers keep sliding, with ordinary separation noise.
 result=at(state,p(1,134,102),p(2,283,105))
 assert.equal(result.session.mode,'pan')
 assert.ok(result.frame.dx>10)
 assert.equal(result.frame.scale,1)
 assert.ok(result.frame.dy>0)
})

test('panning keeps scale exactly one even if thumb positions drift apart',()=>{
 let state=begin()
 state=at(state,p(1,116,100),p(2,267,100)).session
 assert.equal(state.mode,'pan')
 const result=at(state,p(1,133,101),p(2,291,99))
 assert.equal(result.session.mode,'pan')
 assert.equal(result.frame.scale,1)
 assert.ok(result.frame.dx>10)
})

test('opposing finger movement enters pinch, locks camera translation at zero',()=>{
 let state=begin()
 state=at(state,p(1,82,100),p(2,267,100)).session
 assert.equal(state.mode,'pinch')
 let result=at(state,p(1,73,101),p(2,278,99))
 assert.equal(result.session.mode,'pinch')
 assert.equal(result.frame.dx,0)
 assert.equal(result.frame.dy,0)
 assert.ok(result.frame.scale>1)
 state=result.session
 result=at(state,p(1,84,104),p(2,268,102))
 assert.ok(result.frame.scale<1)
 assert.equal(result.frame.dx,0)
})

test('zoom jitter below threshold is suppressed and accumulated',()=>{
 let state=begin()
 state=at(state,p(1,82,100),p(2,269,100)).session
 assert.equal(state.mode,'pinch')
 const noise=at(state,p(1,81.8,102),p(2,269.2,102))
 assert.equal(noise.frame,null)
 const real=at(noise.session,p(1,72,103),p(2,279,103))
 assert.ok(real.frame.scale>1)
 assert.equal(real.frame.dx,0)
 assert.equal(real.frame.dy,0)
})

test('the gesture stays locked until released even if later finger movement changes character',()=>{
 let state=begin()
 state=at(state,p(1,114,100),p(2,265,100)).session
 assert.equal(state.mode,'pan')
 const attemptedPinch=at(state,p(1,80,100),p(2,300,100))
 assert.equal(attemptedPinch.session.mode,'pan')
 assert.equal(attemptedPinch.frame.scale,1)

 state=at(begin(),p(1,80,100),p(2,270,100)).session
 assert.equal(state.mode,'pinch')
 const attemptedPan=at(state,p(1,100,130),p(2,290,130))
 assert.equal(attemptedPan.session.mode,'pinch')
 assert.equal(attemptedPan.frame?.dx??0,0)
 assert.equal(attemptedPan.frame?.dy??0,0)
})

test('the first-finger-only motion never triggers a false zoom',()=>{
 let state=begin()
 for(const x of [107,116,130,145]){
  const result=at(state,p(1,x,100),p(2,250,100))
  assert.equal(result.session.mode,'pending')
  assert.equal(result.frame,null)
  state=result.session
 }
})

test('changed contact identities reset recognition rather than carrying over stale pan',()=>{
 let state=at(begin(),p(1,120,100),p(2,270,100)).session
 assert.equal(state.mode,'pan')
 const changed=at(state,p(1,120,100),p(3,270,100))
 assert.equal(changed.session.mode,'pending')
 assert.equal(changed.frame,null)
})

test('A/B modifier thumb is excluded from camera classification and three fingers retain shortcut',async()=>{
 const source=await readFile(new URL('../src/experiences/stax/RemoteCircleTest.tsx',import.meta.url),'utf8')
 assert.match(source,/function surfaceContacts\(\)\{return \[\.\.\.state\.current\.contacts\.values\(\)\]\.filter\(p=>p\.role==='surface'\)\}/)
 assert.match(source,/startTwoFinger\(surfaces\[0\],surfaces\[1\]\)/)
 assert.match(source,/advanceTwoFinger\(before,surfaces\[0\],surfaces\[1\]\)/)
 assert.match(source,/if\(maximum>=3\)/)
 assert.match(source,/if\(item\.role==='surface'\)\{state\.current\.twoFinger=null/)
})
