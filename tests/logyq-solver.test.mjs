import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
const env = { window: {} }
runInNewContext(readFileSync(new URL('../public/logyq/js/game-grammar.js', import.meta.url), 'utf8'), env)
const g = env.window.LOGYQGameGrammar

test('physical objects with identical faces give two solutions', () => {
  const pieces = ['a', 'b'].map(gameId => ({gameId, paint:'W:A'}))
  assert.equal(g.physicalSolutions(pieces, 2).length, 2)
})

test('duplicate physical IDs and unsupported inventories are rejected', () => {
  assert.throws(() => g.physicalSolutions([{gameId:'a',paint:'W:A'}, {gameId:'a',paint:'L:A:B'}]), /unique/)
  assert.throws(() => g.physicalSolutions(Array.from({length:31}, (_,i) => ({gameId:String(i),paint:'W:A'}))), /size/)
})

test('independent ordered-tree oracle agrees for all three-piece bags', () => {
  const faces = ['W:A', 'W:B', 'L:A:B', 'L:B:A', 'DL:A:B', 'DR:A:B']
  function oracle(p) {
    let count=0
    for(let a=0;a<3;a++) for(let b=0;b<3;b++) for(let c=0;c<3;c++) {
      if(new Set([a,b,c]).size!==3) continue
      const node=(i,children=[])=>({...p[i],children})
      for(const t of [node(a,[node(b,[node(c)])]),node(a,[node(b),node(c)])]) if(g.contacts(t)) count++
    }
    return Math.min(2,count)
  }
  for(const a of faces) for(const b of faces) for(const c of faces) {
    const p=[a,b,c].map((paint,i)=>({gameId:String(i),paint}))
    const sols=g.physicalSolutions(p,2)
    assert.equal(sols.length,oracle(p),[a,b,c].join(','))
    for(const s of sols) assert.equal(g.complete(s,p.map(x=>x.gameId)),true)
  }
})
