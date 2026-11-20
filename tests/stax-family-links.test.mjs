import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'

const src=await readFile(new URL('../src/experiences/stax/family-links.ts',import.meta.url),'utf8')
const js=ts.transpileModule(src,{compilerOptions:{
 target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022,
}}).outputText
const {supportParent,supportChildOfKind,rootedSupportChain,canExtendSupportChain,
 canFollowBlueOrange,largestAssembledFamily}=
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

test('pink, purple and green can follow an orange directly supported by blue',()=>{
 const doc={atoms:[
  {id:'blue',kind:'circle'},{id:'not',kind:'hexagon'},
  {id:'pink',kind:'square'},{id:'purple',kind:'rectangle'},
  {id:'green',kind:'oval'},
 ],bonds:[sup('blue','not')]}
 for(const id of ['pink','purple','green'])assert.equal(canFollowBlueOrange(doc,id,'not'),'blue')
})
test('orange directly under red does NOT permit pink, purple or green following magnet',()=>{
 const doc={atoms:[
  {id:'red',kind:'triangle'},{id:'orange',kind:'hexagon'},
  {id:'pink',kind:'square'},{id:'purple',kind:'rectangle'},
  {id:'green',kind:'oval'},
 ],bonds:[sup('red','orange')]}
 for(const id of ['pink','purple','green'])assert.equal(canFollowBlueOrange(doc,id,'orange'),null)
})
test('an orange under green is NOT a blue-level orange sibling',()=>{
 const doc={atoms:[
  {id:'blue',kind:'circle'},{id:'green',kind:'oval'},
  {id:'very',kind:'hexagon'},{id:'purple',kind:'rectangle'}
 ],bonds:[sup('blue','green'),sup('green','very')]}
 assert.equal(canFollowBlueOrange(doc,'purple','very'),null)
})
test('new colors follow attachment order and cannot leapfrog an existing later sibling',()=>{
 const g={atoms:[
  {id:'blue',kind:'circle'},{id:'orange',kind:'hexagon'},
  {id:'pink',kind:'square'},{id:'purple',kind:'rectangle'}
 ],bonds:[sup('blue','orange'),sup('blue','pink')]}
 assert.equal(canFollowBlueOrange(g,'purple','orange'),null)
 const first={...g,bonds:[sup('blue','orange')]}
 assert.equal(canFollowBlueOrange(first,'purple','orange'),'blue')
})
test('already attached or duplicate determiner cannot be added after orange',()=>{
 const g={atoms:[
  {id:'blue',kind:'circle'},{id:'orange',kind:'hexagon'},
  {id:'existing',kind:'rectangle'},{id:'moving',kind:'rectangle'}
 ],bonds:[sup('blue','existing'),sup('blue','orange')]}
 assert.equal(canFollowBlueOrange(g,'moving','orange'),null)
 const attached={...g,bonds:[sup('blue','orange'),sup('blue','moving')]}
 assert.equal(canFollowBlueOrange(attached,'moving','orange'),null)
})
test('broom retains largest assembled map and removes disconnected loose pieces',()=>{
 const d={atoms:[
  {id:'red',kind:'triangle'},{id:'blue',kind:'circle'},
  {id:'green',kind:'oval'},{id:'orange',kind:'hexagon'},
  {id:'loose',kind:'square'},{id:'other',kind:'circle'},{id:'little',kind:'oval'}
 ],bonds:[sup('red','orange'),sup('blue','green'),sup('green','little'),
  {parent:'red',child:'blue',relation:'sequence'}]}
 const kept=largestAssembledFamily(d)
 assert.deepEqual([...kept].sort(),['blue','green','little','orange','red'].sort())
 assert.equal(kept.has('loose'),false)
 assert.equal(kept.has('other'),false)
})
test('broom never clears a board consisting only of loose pieces',()=>{
 const g={atoms:[{id:'a',kind:'circle'},{id:'b',kind:'oval'}],bonds:[]}
 assert.equal(largestAssembledFamily(g),null)
})
test('broom respects selection to resolve equal-size assembled maps',()=>{
 const g={atoms:[
  {id:'a',kind:'circle'},{id:'b',kind:'oval'},
  {id:'c',kind:'triangle'},{id:'d',kind:'hexagon'},
  {id:'loose',kind:'square'},
 ],bonds:[sup('a','b'),sup('c','d')]}
 assert.deepEqual([...largestAssembledFamily(g)].sort(),['a','b'])
 assert.deepEqual([...largestAssembledFamily(g,'d')].sort(),['c','d'])
})
test('broom traverses undirected bond graph, not the shape order',()=>{
 const g={atoms:[
  {id:'one',kind:'circle'},{id:'two',kind:'triangle'},
  {id:'three',kind:'oval'},{id:'free',kind:'rectangle'},
 ],bonds:[{parent:'three',child:'two',relation:'sequence'},
 {parent:'one',child:'two',relation:'support'}]}
 assert.deepEqual([...largestAssembledFamily(g)].sort(),['one','three','two'])
})
