import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'

const src=await readFile(new URL('../src/experiences/stax/family-links.ts',import.meta.url),'utf8')
const js=ts.transpileModule(src,{compilerOptions:{
 target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022,
}}).outputText
const {supportParent,supportChildOfKind,rootedSupportChain,canExtendSupportChain,
 canFollowBlueOrange,canAttachOrangeUnderObjectBlue,canAttachAdverbUnderPreposition,largestAssembledFamily,normalizeBlueSiblingOrder,canNestPossessive,
 withRedCompanion,canNestRightRedOrange,canAttachOrangeUnderBlue,
 orangeTierChildren,orangeRootedInRed,eligibleOrangeTierSlot}=
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

test('purple inserted BEFORE green regardless of later attachment',()=>{
 const row=[
  {id:'green',kind:'oval'},{id:'purple',kind:'rectangle'}
 ]
 assert.deepEqual(normalizeBlueSiblingOrder(row).map(a=>a.id),['purple','green'])
 assert.deepEqual(row.map(a=>a.id),['green','purple'],'does not mutate graph order')
})
test('orange-first assembly keeps orange ahead of purple and green',()=>{
 const row=[
  {id:'orange',kind:'hexagon'},
  {id:'green',kind:'oval'},
  {id:'purple',kind:'rectangle'},
  {id:'pink',kind:'square'}
 ]
 assert.deepEqual(normalizeBlueSiblingOrder(row).map(a=>a.id),[
  'orange','pink','purple','green'
 ])
})
test('nested purple possession may grow under a blue-rooted purple',()=>{
 const g={atoms:[
  {id:'dog',kind:'circle'},{id:'mom',kind:'rectangle'},
  {id:'my',kind:'rectangle'},{id:'friend',kind:'rectangle'}
 ],bonds:[sup('dog','mom')]}
 assert.equal(canNestPossessive(g,'my','mom'),true)
 const deeper={...g,bonds:[...g.bonds,sup('mom','my')]}
 assert.equal(canNestPossessive(deeper,'friend','my'),true)
 assert.equal(canNestPossessive(deeper,'friend','mom'),false)
})
test('an isolated purple cannot start a fake possessive family',()=>{
 const g={atoms:[{id:'loose',kind:'rectangle'},{id:'other',kind:'rectangle'}],bonds:[]}
 assert.equal(canNestPossessive(g,'other','loose'),false)
})
test('purple cannot nest beneath green or orange or form a cycle',()=>{
 const g={atoms:[
  {id:'blue',kind:'circle'},{id:'purple',kind:'rectangle'},
  {id:'green',kind:'oval'},{id:'orange',kind:'hexagon'},
  {id:'another',kind:'rectangle'}
 ],bonds:[sup('blue','purple'),sup('purple','another')]}
 assert.equal(canNestPossessive(g,'another','purple'),false)
 assert.equal(canNestPossessive(g,'purple','another'),false)
 assert.equal(canNestPossessive(g,'green','purple'),false)
 assert.equal(canNestPossessive(g,'orange','purple'),false)
})
test('first orange under red creates exactly one unassigned companion',()=>{
 const g={atoms:[{id:'red',kind:'triangle'},{id:'aux',kind:'hexagon'}],
 bonds:[sup('red','aux')]}
 const result=withRedCompanion(g,'red',id=>({id,kind:'hexagon'}))
 assert.equal(result.atoms.length,3)
 assert.equal(result.bonds.length,2)
 assert.equal(result.bonds[1].child,'red-companion-aux')
 assert.equal(result.atoms[2].word,undefined)
 assert.deepEqual(result.bonds.map(b=>b.parent),['red','red'])
})
test('red pair completion is stable and preserves an existing second orange',()=>{
 const g={atoms:[{id:'red',kind:'triangle'},{id:'aux',kind:'hexagon'}],
 bonds:[sup('red','aux')]}
 const one=withRedCompanion(g,'red',id=>({id,kind:'hexagon'}))
 const two=withRedCompanion(one,'red',id=>({id,kind:'hexagon'}))
 assert.equal(two,one,'do not create duplicate companion on repeat')
})
test('red requires a direct orange before companion can be added',()=>{
 const g={atoms:[{id:'red',kind:'triangle'},{id:'blue',kind:'circle'}],
 bonds:[sup('red','blue')]}
 assert.equal(withRedCompanion(g,'red',id=>({id,kind:'hexagon'})),g)
})
test('the third orange can attach only beneath the RIGHT red child',()=>{
 const initial={atoms:[
  {id:'red',kind:'triangle'},{id:'left',kind:'hexagon'},
  {id:'third',kind:'hexagon'}
 ],bonds:[sup('red','left')]}
 const pair=withRedCompanion(initial,'red',id=>({id,kind:'hexagon'}))
 assert.equal(canNestRightRedOrange(pair,'third','left'),false)
 assert.equal(canNestRightRedOrange(pair,'third','red-companion-left'),true)
})
test('right red child accepts one nested orange, never two side by side',()=>{
 const initial={atoms:[
  {id:'red',kind:'triangle'},{id:'left',kind:'hexagon'},
  {id:'third',kind:'hexagon'},{id:'fourth',kind:'hexagon'}
 ],bonds:[sup('red','left')]}
 const pair=withRedCompanion(initial,'red',id=>({id,kind:'hexagon'}))
 const grown={...pair,bonds:[...pair.bonds,sup('red-companion-left','third')]}
 assert.equal(canNestRightRedOrange(grown,'fourth','red-companion-left'),false)
 assert.equal(canNestRightRedOrange(grown,'third','red-companion-left'),false)
})

test('auto-red pair refuses exceeding the 80-shape persisted document limit',()=>{
 const atoms=[{id:'red',kind:'triangle'},{id:'aux',kind:'hexagon'}]
 for(let i=0;i<78;i++)atoms.push({id:'loose-'+i,kind:'square'})
 const doc={atoms,bonds:[sup('red','aux')]}
 assert.equal(doc.atoms.length,80)
 assert.equal(withRedCompanion(doc,'red',id=>({id,kind:'hexagon'})),doc)
})

test('orange may start a blue family when no green adjective exists',()=>{
 const d={atoms:[{id:'blue',kind:'circle'},{id:'orange',kind:'hexagon'}],bonds:[]}
 assert.equal(canAttachOrangeUnderBlue(d,'blue'),true)
})
test('late object-level not can be inserted and reordered ahead of green',()=>{
 const d={atoms:[{id:'blue',kind:'circle'},{id:'green',kind:'oval'},{id:'orange',kind:'hexagon'}],
  bonds:[sup('blue','green')]}
 assert.equal(canAttachOrangeUnderBlue(d,'blue'),true)
 assert.deepEqual(normalizeBlueSiblingOrder([d.atoms[1],d.atoms[2]]).map(a=>a.id),['orange','green'])
})
test('a loose green does not prevent an independent orange-blue family',()=>{
 const d={atoms:[{id:'blue',kind:'circle'},{id:'green',kind:'oval'},{id:'orange',kind:'hexagon'}],bonds:[]}
 assert.equal(canAttachOrangeUnderBlue(d,'blue'),true)
})
test('orange already preceding green stays in the map without destructive cleanup',()=>{
 const d={atoms:[{id:'blue',kind:'circle'},{id:'orange',kind:'hexagon'},
  {id:'green',kind:'oval'}],bonds:[sup('blue','orange'),sup('blue','green')]}
 assert.equal(canAttachOrangeUnderBlue(d,'blue'),false)
 assert.equal(d.bonds.length,2,'existing valid family data remains intact')
})
test('orange after green cannot be mistaken for an under-red orange',()=>{
 const d={atoms:[{id:'red',kind:'triangle'},{id:'blue',kind:'circle'},
  {id:'green',kind:'oval'}],bonds:[sup('blue','green')]}
 assert.equal(canAttachOrangeUnderBlue(d,'red'),false)
})

test('subject blue above red cannot acquire direct orange; object blue can',()=>{
 const g={atoms:[
  {id:'subject',kind:'circle'},{id:'verb',kind:'triangle'},
  {id:'object',kind:'circle'},{id:'not',kind:'hexagon'}
 ],bonds:[
  {parent:'subject',child:'verb',relation:'sequence'},
  {parent:'verb',child:'object',relation:'sequence'}
 ]}
 assert.equal(canAttachOrangeUnderObjectBlue(g,'subject'),false)
 assert.equal(canAttachOrangeUnderObjectBlue(g,'object'),true)
 const supported={...g,bonds:[...g.bonds,sup('object','not')]}
 assert.equal(canAttachOrangeUnderObjectBlue(supported,'object'),false)
})
test('a pink preposition supported by object blue can take an orange adverb',()=>{
 const g={atoms:[
  {id:'subject',kind:'circle'},{id:'verb',kind:'triangle'},
  {id:'object',kind:'circle'},{id:'on',kind:'square'},
  {id:'always',kind:'hexagon'}
 ],bonds:[
  {parent:'subject',child:'verb',relation:'sequence'},
  {parent:'verb',child:'object',relation:'sequence'},
  sup('object','on')
 ]}
 assert.equal(canAttachAdverbUnderPreposition(g,'on'),true)
 assert.equal(canAttachAdverbUnderPreposition(g,'subject'),false)
 assert.equal(canAttachAdverbUnderPreposition({...g,bonds:[...g.bonds,sup('on','always')]},'on'),false)
})
test('pink added last inserts between object orange and purple, before green',()=>{
 const row=[
  {id:'not',kind:'hexagon'},{id:'the',kind:'rectangle'},
  {id:'big',kind:'oval'},{id:'on',kind:'square'}
 ]
 assert.deepEqual(normalizeBlueSiblingOrder(row).map(n=>n.id),
  ['not','on','the','big'])
 assert.deepEqual(row.map(n=>n.id),['not','the','big','on'])
})

test('late orange precedes pink, purple and green; never pink then orange',()=>{
 const row=[{id:'in',kind:'square'},{id:'the',kind:'rectangle'},
  {id:'big',kind:'oval'},{id:'not',kind:'hexagon'}]
 assert.deepEqual(normalizeBlueSiblingOrder(row).map(a=>a.id),['not','in','the','big'])
 assert.deepEqual(normalizeBlueSiblingOrder([{id:'in',kind:'square'},{id:'not',kind:'hexagon'}]).map(a=>a.id),['not','in'])
 assert.deepEqual(row.map(a=>a.id),['in','the','big','not'])
})
test('direct blue not slot differs from orange nested below pink',()=>{
 const d={atoms:[{id:'blue',kind:'circle'},{id:'pink',kind:'square'},
  {id:'usually',kind:'hexagon'},{id:'not',kind:'hexagon'}],
 bonds:[sup('blue','pink'),sup('pink','usually')]}
 assert.equal(canAttachAdverbUnderPreposition(d,'pink'),false)
 assert.equal(canAttachOrangeUnderObjectBlue(d,'blue'),true)
 assert.equal(canAttachOrangeUnderObjectBlue({...d,bonds:[...d.bonds,sup('blue','not')]},'blue'),false)
})
test('pink-near orange insertion magnet and nested pink reflow have direct rules',async()=>{
 const src=await readFile(new URL('../src/experiences/stax/MoleculeBoard.tsx',import.meta.url),'utf8')
 assert.match(src,/Orange arriving beside a pink support inserts BEFORE pink/)
 assert.match(src,/if\(child\.kind==='square'\)next=alignNestedChain\(next,child\.id,'hexagon'\)/)
})

test('third orange uses a modest stagger, lower red pair crosses, and uncle has space',async()=>{
 const code=await readFile(new URL('../src/experiences/stax/MoleculeBoard.tsx',import.meta.url),'utf8')
 const nested=code.slice(code.indexOf('function nestedChildPosition('),code.indexOf('function alignOrangeTierChildren('))
 assert.match(nested,/return positionChildren\(/)
 const tier=code.slice(code.indexOf('function alignOrangeTierChildren('),code.indexOf('function miniFamilyPosition('))
 assert.match(tier,/children\.length===2[\s\S]*?positionRedOrangeCrossPair\(/)
 assert.match(tier,/rightDirectRedOrange[\s\S]*?redRightModifierPosition\(parent\):nestedChildPosition\(parent,children\[0\]\)/)
 assert.match(tier,/next=alignOrangeTierChildren\(next,child\.id,seen\)/)
 const magnet=code.slice(code.indexOf('function bestSnap('),code.indexOf('function resolveMagnet('))
 assert.match(magnet,/slot==='left-pair'\?positionRedOrangeCrossPair\(/)
 assert.match(magnet,/slot==='right-modifier'\?redRightModifierPosition\(b\):nestedChildPosition\(b,a\)/)
 const direct=code.slice(code.indexOf('function alignRedSupporters('),code.indexOf('/** Visual size follows'))
 assert.match(direct,/const hasLeftLowerPair=orange\.length===2&&orangeChildren\(doc,orange\[0\]\.id\)\.length===2/)
 assert.match(direct,/const upperGap=hasLeftLowerPair\?11\*UNIT:GAP/)
 assert.match(direct,/positionChildren\(parent,children,\{gap:upperGap,belowGap:VERTICAL\}\)/)
 assert.doesNotMatch(direct,/extentLeft:-halfOverhang|extentRight:w\+halfOverhang/)
 const chain=code.slice(code.indexOf('function alignNestedChain('),code.indexOf('function alignSupporters('))
 assert.match(chain,/const target=nestedChildPosition\(parent,child\)/,'purple and non-red chains remain unchanged')
})
test('large green complements follow red verbs as sequences, never noun supporters',async()=>{
 const src=await readFile(new URL('../src/experiences/stax/MoleculeBoard.tsx',import.meta.url),'utf8')
 const section=src.slice(src.indexOf('function bestSnap('),src.indexOf('function resolveMagnet('))
 assert.match(section,/a\.kind==='oval'&&b\.kind==='triangle'/,'drag green toward red')
 assert.match(section,/a\.kind==='triangle'&&b\.kind==='oval'/,'drag red toward green')
 assert.match(section,/parent:b\.id,child:a\.id,relation:'sequence'/)
 assert.match(section,/parent:a\.id,child:b\.id,relation:'sequence'/)
 assert.match(section,/z\.parent===b\.id\|\|z\.child===a\.id/,'reject occupied follower slot')
 assert.match(src,/if\(a\.kind==='oval'\)return owner&&byId\(d,owner\.parent\)\?\.kind==='circle'\?'small':'large'/,
  'a green complement not supported by blue stays large')
 assert.match(src,/if\(snap\.relation!=='support'\)return typed/,'following complement must not enter blue supporter reflow')
})

test('Blueprint red-to-large-green complement uses 2.03 horizontal and 0.49 vertical offsets in both drag directions',async()=>{
 const src=await readFile(new URL('../src/experiences/stax/MoleculeBoard.tsx',import.meta.url),'utf8')
 const start=src.indexOf('A large green complement can follow')
 const end=src.indexOf('Sequence ports accept noun',start)
 const code=src.slice(start,end)
 assert.ok(start>=0&&end>start)
 assert.match(code,/x:b\.x\+atomWidth\(b\)\+RED_BLUE_GAP,\s*y:b\.y\+atomHeight\(b\)\+BLUE_RED_GAP\}/)
 assert.match(code,/x:b\.x-atomWidth\(a\)-RED_BLUE_GAP,\s*y:b\.y-atomHeight\(a\)-BLUE_RED_GAP\}/)
 assert.doesNotMatch(code,/y:b\.y\+atomHeight\(b\)\+RED_BLUE_GAP/)
 assert.doesNotMatch(code,/y:b\.y-atomHeight\(a\)-RED_BLUE_GAP/)
 assert.match(src,/const BLUE_RED_GAP=SCALE\*STAX_SPACING\.group, RED_BLUE_GAP=SCALE\*STAX_SPACING\.row/)
})

test('orange red pair supports right modifier and left bridge tier independently',()=>{
 const g={atoms:[
  {id:'red',kind:'triangle'},{id:'do',kind:'hexagon'},{id:'really',kind:'hexagon'},
  {id:'not',kind:'hexagon'},{id:'bridge',kind:'hexagon'},{id:'to',kind:'hexagon'}
 ],bonds:[sup('red','do'),sup('red','really')]}
 assert.deepEqual(orangeTierChildren(g,'red'),['do','really'])
 assert.equal(orangeRootedInRed(g,'do'),true)
 assert.equal(orangeRootedInRed(g,'really'),true)
 assert.equal(eligibleOrangeTierSlot(g,'not','really'),'right-modifier')
 assert.equal(eligibleOrangeTierSlot(g,'bridge','do'),'left-pair')
 const withModifier={...g,bonds:[...g.bonds,sup('really','not')]}
 assert.equal(eligibleOrangeTierSlot(withModifier,'to','really'),null)
 const withTier={...g,bonds:[...g.bonds,sup('do','bridge'),sup('do','to')]}
 assert.equal(eligibleOrangeTierSlot(withTier,'not','bridge'),'left-pair')
 assert.equal(eligibleOrangeTierSlot(withTier,'not','to'),'right-modifier')
 assert.equal(eligibleOrangeTierSlot(withTier,'not','do'),null,'do not add a third direct child')
})
test('orange below second orange attaches without swapping existing pieces',()=>{
 const g={atoms:[
  {id:'verb',kind:'triangle'},{id:'left',kind:'hexagon'},
  {id:'right',kind:'hexagon'},{id:'bottom',kind:'hexagon'},
  {id:'extra',kind:'hexagon'}
 ],bonds:[sup('verb','left'),sup('verb','right')]}
 assert.equal(eligibleOrangeTierSlot(g,'bottom','right'),'right-modifier')
 const next={...g,bonds:[...g.bonds,sup('right','bottom')]}
 assert.deepEqual(orangeTierChildren(next,'verb'),['left','right'])
 assert.deepEqual(orangeTierChildren(next,'right'),['bottom'])
 assert.equal(eligibleOrangeTierSlot(next,'extra','right'),null,'no swapping or implicit reorder')
 assert.equal(eligibleOrangeTierSlot(next,'extra','bottom'),'modifier-chain')
 assert.equal(g.bonds.length,2,'existing arrangement is unchanged')
})
test('orange tiers never grow from loose oranges, blue modifiers, or cycles',()=>{
 const loose={atoms:[{id:'a',kind:'hexagon'},{id:'b',kind:'hexagon'}],bonds:[]}
 assert.equal(eligibleOrangeTierSlot(loose,'b','a'),null)
 const green={atoms:[{id:'blue',kind:'circle'},{id:'green',kind:'oval'},
  {id:'a',kind:'hexagon'},{id:'b',kind:'hexagon'}],
  bonds:[sup('blue','green'),sup('green','a')]}
 assert.equal(eligibleOrangeTierSlot(green,'b','a'),null)
 assert.equal(orangeRootedInRed(green,'a'),false)
 const cyclic={atoms:[{id:'a',kind:'hexagon'},{id:'b',kind:'hexagon'}],
  bonds:[sup('a','b'),sup('b','a')]}
 assert.equal(orangeRootedInRed(cyclic,'a'),false)
})
test('red-orange bridge insertion reflows recursively and auto-creates only its intended companion',async()=>{
 const code=await readFile(new URL('../src/experiences/stax/MoleculeBoard.tsx',import.meta.url),'utf8')
 assert.match(code,/if\(slot==='left-pair'&&joined\.atoms\.length<80\)/)
 assert.match(code,/const id='orange-companion-'\+snap\.child/)
 assert.doesNotMatch(code,/promoteOrangeIntoRightSlot|insertOrangeBeforeExisting/)
 assert.match(code,/if\(orangeRootedInRed\(typed,owner\.id\)\)/)
 assert.match(code,/return alignRedSupporters\(typed,parentId\)/)
 assert.match(code,/for\(const child of orange\)next=alignOrangeTierChildren\(next,child\.id\)/)
})

test('orange shapes are blank locations, never auto-renamed or reparented during snap',async()=>{
 const code=await readFile(new URL('../src/experiences/stax/MoleculeBoard.tsx',import.meta.url),'utf8')
 const resolve=code.slice(code.indexOf('function resolveMagnetBase('),code.indexOf('function resolveMagnet('))
 assert.match(resolve,/let joined:Draft=\{\.\.\.translated,bonds:/)
 assert.doesNotMatch(resolve,/promoteOrangeIntoRightSlot|insertOrangeBeforeExisting/)
})

test('sentence family footprint clearance runs after all snaps and support-removal reflow',async()=>{
 const board=await readFile(new URL('../src/experiences/stax/MoleculeBoard.tsx',import.meta.url),'utf8')
 assert.match(board,/function supportFootprint\(d:Draft,headId:string\)/)
 assert.match(board,/edge\.relation==='support'/)
 assert.match(board,/edge\.relation==='pair'/)
 assert.match(board,/function alignSequenceFamilyClearance\(doc:Draft\)/)
 assert.match(board,/requiredFamilyFollowerShift\(/)
 assert.match(board,/return alignSequenceFamilyClearance\(resolveMagnetBase\(d,moving,snap\)\)/)
 assert.match(board,/return alignSequenceFamilyClearance\(next\)/)
 assert.match(board,/if\(left\.kind==='circle'&&right\.kind==='triangle'\)return BLUE_RED_GAP/)
 assert.match(board,/return RED_BLUE_GAP/)
})

test('red pair uses large forms until a third orange makes the family compact',async()=>{
 const board=await readFile(new URL('../src/experiences/stax/MoleculeBoard.tsx',import.meta.url),'utf8')
 assert.match(board,/function redOrangeFamilySize\(d:Draft,redId:string\):number/)
 assert.match(board,/function orangeRedRoot\(d:Draft,orangeId:string\)/)
 assert.match(board,/if\(redRoot\)return redOrangeFamilySize\(d,redRoot\)>2\?'small':'large'/)
 assert.ok(board.includes("const children=orange.map(a=>({id:a.id,width:atomWidth(a),height:atomHeight(a)}))"))
 assert.match(board,/const hasLeftLowerPair=orange\.length===2&&orangeChildren\(doc,orange\[0\]\.id\)\.length===2/)
 assert.match(board,/const childW=compact\?smallWidth\('hexagon'\):width\('hexagon'\)/)
 assert.match(board,/const childH=compact\?height\('hexagon'\)\*SMALL_ORANGE_Y:height\('hexagon'\)/)
 assert.match(board,/return alignRedSupporters\(paired,owner\.id\)/)
 assert.match(board,/for\(const child of orange\)next=alignOrangeTierChildren/)
})

test('direct red two-orange X is isolated from compact tiers and all other families',async()=>{
 const board=await readFile(new URL('../src/experiences/stax/MoleculeBoard.tsx',import.meta.url),'utf8')
 const start=board.indexOf('function redOrangePosition(')
 const end=board.indexOf('/** Visual size follows',start)
 const pair=board.slice(start,end)
 assert.match(pair,/items\.length===2&&!compact[\s\S]*?positionRedOrangeCrossPair\(/)
 assert.match(pair,/orange\.length===2&&redOrangeFamilySize\(doc,redId\)===2[\s\S]*?positionRedOrangeCrossPair\(/)
 assert.match(pair,/positionChildren\(parent,children,\{gap:upperGap,belowGap:VERTICAL\}\)/)
 assert.match(board,/if\(redRoot\)return redOrangeFamilySize\(d,redRoot\)>2\?'small':'large'/)
});

test('saved four-orange arrangement is reflowed at load; approved three-orange layout remains untouched',async()=>{
 const board=await readFile(new URL('../src/experiences/stax/MoleculeBoard.tsx',import.meta.url),'utf8')
 assert.ok(board.includes("useState<Draft>(()=>ensureFourOrangeBlueprint(normalizeRoles(load())))"))
 const start=board.indexOf('function ensureFourOrangeBlueprint(')
 const end=board.indexOf('/** Visual size follows',start)
 const rule=board.slice(start,end)
 assert.match(rule,/redOrangeFamilySize\(next,red.id\)!==4/)
 assert.match(rule,/orangeChildren\(next,top\[0\]\.id\)\.length!==2/)
 assert.match(rule,/gap:11\*UNIT,belowGap:VERTICAL/)
 assert.match(rule,/if\(stale\)next=alignRedSupporters\(next,red.id\)/)
})


test('six red-rooted oranges extend as three paired tiers; seventh nests under middle-right',()=>{
 const atoms=['red','topL','topR','middleL','middleR','bottomL','bottomR','seventh'].map(id=>({id,kind:id==='red'?'triangle':'hexagon'}))
 const bonds=[
  ['red','topL'],['red','topR'],
  ['topL','middleL'],['topL','middleR'],
  ['middleL','bottomL'],['middleL','bottomR']
 ].map(([parent,child])=>({parent,child,relation:'support'}))
 const graph={atoms,bonds}
 assert.deepEqual(orangeTierChildren(graph,'topL'),['middleL','middleR'])
 assert.deepEqual(orangeTierChildren(graph,'middleL'),['bottomL','bottomR'])
 assert.equal(eligibleOrangeTierSlot(graph,'seventh','middleR'),'right-modifier')
 assert.equal(eligibleOrangeTierSlot(graph,'seventh','middleL'),null,'bottom pair already occupies left tier')
 assert.equal(eligibleOrangeTierSlot(graph,'seventh','topR'),'right-modifier')
})

test('six-orange bottom pair is crossed/touching and seventh uses right paired stagger',async()=>{
 const board=await readFile(new URL('../src/experiences/stax/MoleculeBoard.tsx',import.meta.url),'utf8')
 const tier=board.slice(board.indexOf('function alignOrangeTierChildren('),board.indexOf('function miniFamilyPosition('))
 assert.ok(tier.includes('children.length===2'))
 assert.ok(tier.includes('middleOfDeepFamily'))
 assert.ok(tier.includes('?positionChildren(parentBox,pair,{gap:GAP,belowGap:VERTICAL})'))
 assert.ok(tier.includes(':positionRedOrangeCrossPair(parentBox,[pair[0],pair[1]],VERTICAL)'))
 assert.ok(tier.includes("owner?.kind==='hexagon'&&siblings.length===2&&siblings[1].id===parentId"))
 assert.ok(tier.includes('?redRightModifierPosition(parent):nestedChildPosition(parent,children[0])'))
 assert.ok(board.includes("slot==='right-modifier'?redRightModifierPosition(b):nestedChildPosition(b,a)"))
})

test('six has touching bottom; seven opens bottom gap while both separate middle',async()=>{
 const board=await readFile(new URL('../src/experiences/stax/MoleculeBoard.tsx',import.meta.url),'utf8')
 const tier=board.slice(board.indexOf('function alignOrangeTierChildren('),board.indexOf('function miniFamilyPosition('))
 assert.ok(tier.includes('familySize>=6'))
 assert.ok(tier.includes('familySize>=7&&children.length===2'))
 assert.ok(tier.includes('middleOfDeepFamily||bottomOfSeven'))
 assert.ok(tier.includes("owner?.kind==='triangle'"))
 assert.ok(tier.includes('orangeChildren(doc,children[0].id).length===2'))
 assert.ok(tier.includes('gap:GAP,belowGap:VERTICAL'))
 assert.ok(tier.includes('positionRedOrangeCrossPair(parentBox,[pair[0],pair[1]],VERTICAL)'))
 const reflow=board.slice(board.indexOf('function ensureFourOrangeBlueprint('),board.indexOf('/** Visual size follows'))
 assert.ok(reflow.includes('if(redOrangeFamilySize(next,red.id)<6)continue'))
 assert.ok(reflow.includes('middle.some('))
 assert.ok(reflow.includes('staleBottom=bottom.some('))
 assert.ok(reflow.includes('next=alignRedSupporters(next,red.id)'))
})


test('blue circle centers its immediate supporters, never the recursive descendant chain',async()=>{
 const board=await readFile(new URL('../src/experiences/stax/MoleculeBoard.tsx',import.meta.url),'utf8')
 const row=board.slice(board.indexOf('function blueSupportPositions('),board.indexOf('/** A single orange beneath'))
 assert.ok(row.includes('const blue=byId(doc,blueId),items=blueSupportAtoms(doc,blueId)'))
 assert.ok(row.includes('return {id:a.id,width:w,height:h}'))
 assert.ok(row.includes('return positionChildren('))
 assert.doesNotMatch(row,/nestedFamilyLeftExtent|extentLeft|descendants\(/)
 const align=board.slice(board.indexOf('function alignSupporters('),board.indexOf('function miniFamilyPosition('))
 // Parent/child bond topology, not the shape chain's rendered bounding box,
 // is the only source of sibling membership for centering.
 assert.ok(board.includes("doc.bonds.filter(b=>b.relation==='support'&&b.parent===blueId)"))
})
