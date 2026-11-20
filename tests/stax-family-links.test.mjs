import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'

const src=await readFile(new URL('../src/experiences/stax/family-links.ts',import.meta.url),'utf8')
const js=ts.transpileModule(src,{compilerOptions:{
 target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022,
}}).outputText
const {supportParent,supportChildOfKind,rootedSupportChain,canExtendSupportChain}=
 await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'))

const atoms=[
 {id:'dog',kind:'circle'},{id:'little',kind:'oval'},
 {id:'very',kind:'hexagon'},{id:'really',kind:'hexagon'},
 {id:'extremely',kind:'hexagon'}, {id:'red',kind:'triangle'},
 {id:'gate',kind:'hexagon'},{id:'orphan',kind:'hexagon'},
 {id:'looseGreen',kind:'oval'},{id:'purple',kind:'rectangle'},
]
const sup=(parent,child)=>({parent,child,relation:'support'})
const base=()=>({atoms:[...atoms],bonds:[sup('dog','little')]})
const chain=(more=[])=>({atoms:[...atoms],bonds:[
 sup('dog','little'),sup('little','very'),...more
]})
const can=(g,id)=>canExtendSupportChain(g,id,'hexagon','oval','circle')
const root=(g,id)=>rootedSupportChain(g,id,'hexagon','oval','circle')

test('loose shape is a valid isolated atom without any family bond',()=>{
 for(const kind of ['circle','triangle','square','rectangle','diamond','hexagon','oval']){
  const d={atoms:[{id:kind,kind}],bonds:[]}
  assert.equal(d.atoms.length,1)
  assert.equal(supportParent(d,kind),undefined)
 }
})
test('green rooted in a blue head can receive its first modifier',()=>{
 const g=base()
 assert.equal(root(g,'little'),'little')
 assert.equal(supportChildOfKind(g,'little','hexagon'),undefined)
})
test('one orange under green can parent another orange, not a separate orange type',()=>{
 const g=chain()
 assert.equal(supportParent(g,'very'),'little')
 assert.equal(root(g,'very'),'little')
 assert.equal(can(g,'very'),true)
 assert.equal(can(g,'gate'),false)
})
test('arbitrary-depth orange→orange chains are rooted in the same green family',()=>{
 const g=chain([sup('very','really'),sup('really','extremely')])
 assert.equal(root(g,'extremely'),'little')
 assert.equal(can(g,'extremely'),true)
 assert.equal(can(g,'really'),false,'occupied modifier cannot take a second direct orange')
 assert.equal(can(g,'very'),false)
})
test('isolated orange/green must stay loose until their actual parent is known',()=>{
 const g=base()
 assert.equal(root(g,'orphan'),null)
 assert.equal(root(g,'looseGreen'),null)
 assert.equal(can(g,'orphan'),false)
})
test('orange gate under red is not silently treated as an adjective adverb chain',()=>{
 const g=chain([sup('red','gate')])
 assert.equal(root(g,'gate'),null)
 assert.equal(can(g,'gate'),false)
})
test('reading-order sequence or n boundary is not a support bond',()=>{
 const g={atoms:[...atoms],bonds:[sup('dog','little'),{
  parent:'very',child:'really',relation:'sequence'
 }]}
 assert.equal(root(g,'really'),null)
 assert.equal(can(g,'really'),false)
})
test('no chains from a loose adjective; blue/pronoun head required',()=>{
 const g={atoms:[...atoms],bonds:[sup('looseGreen','very')]}
 assert.equal(root(g,'very'),null)
 assert.equal(can(g,'very'),false)
})
test('recursive traversal safely rejects corrupt cycles',()=>{
 const g={atoms:[...atoms],bonds:[sup('very','really'),sup('really','very')]}
 assert.equal(root(g,'very'),null)
 assert.equal(can(g,'very'),false)
})
test('detach one support bond returns its descendants to a loose family',()=>{
 const g=chain([sup('very','really')])
 assert.equal(root(g,'really'),'little')
 const detached={...g,bonds:g.bonds.filter(b=>b.child!=='very')}
 assert.equal(root(detached,'really'),null)
 assert.equal(can(detached,'really'),false)
})
test('family traversal is generic and does not hard-code an orange engine',()=>{
 const g={atoms:[
  {id:'noun',kind:'circle'},{id:'modifier',kind:'oval'},
  {id:'one',kind:'rectangle'},{id:'two',kind:'rectangle'},
 ],bonds:[sup('noun','modifier'),sup('modifier','one'),sup('one','two')]}
 assert.equal(rootedSupportChain(g,'two','rectangle','oval','circle'),'modifier')
 // This checks generic traversal only, not permission to build that grammar.
})
