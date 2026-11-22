import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'

const source=await readFile(new URL('../src/experiences/stax/sequential-scan.ts',import.meta.url),'utf8')
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText
const {sequentialScanOrder,sequentialScanNext}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'))
const atom=(id,kind,x,y)=>({id,kind,x,y})
const bond=(parent,child,relation)=>({parent,child,relation})

test('scan starts with yellow then visits each family bottom left to right then its head',()=>{
 const graph={
  atoms:[
   atom('yellow','diamond',0,0),atom('subject','circle',100,0),
   atom('red','triangle',240,0),atom('orangeLeft','hexagon',235,70),
   atom('orangeRight','hexagon',305,70),atom('object','circle',430,0),
   atom('laterBlue','circle',600,0),atom('purple','rectangle',665,80),
   atom('pink','square',580,80),
  ],
  bonds:[
   bond('yellow','subject','sequence'),bond('subject','red','sequence'),
   bond('red','object','sequence'),bond('object','laterBlue','sequence'),
   bond('red','orangeRight','support'),bond('red','orangeLeft','support'),
   bond('laterBlue','purple','support'),bond('laterBlue','pink','support'),
  ],
 }
 assert.deepEqual(sequentialScanOrder(graph),[
  'yellow','subject','orangeLeft','orangeRight','red','object',
  'pink','purple','laterBlue',
 ])
 assert.equal(sequentialScanNext(graph,'subject','right'),'orangeLeft')
 assert.equal(sequentialScanNext(graph,'orangeRight','right'),'red')
 assert.equal(sequentialScanNext(graph,'red','right'),'object')
 assert.equal(sequentialScanNext(graph,'pink','right'),'purple')
 assert.equal(sequentialScanNext(graph,'purple','right'),'laterBlue')
 assert.equal(sequentialScanNext(graph,'red','left'),'orangeRight')
 assert.equal(sequentialScanNext(graph,'laterBlue','right'),'yellow','wraps after final head')
 assert.equal(sequentialScanNext(graph,null,'right'),'yellow')
 assert.equal(sequentialScanNext(graph,null,'left'),'laterBlue')
})
test('nested descendants scan before higher support levels regardless of absolute y',()=>{
 const g={atoms:[
  atom('blue','circle',100,100),atom('purple','rectangle',140,145),
  atom('nested','rectangle',155,160),atom('pink','square',70,143),
  atom('red','triangle',240,105),
  atom('orange','hexagon',240,155),atom('pair','hexagon',300,155),
 ],bonds:[
  bond('blue','red','sequence'),bond('blue','purple','support'),
  bond('purple','nested','support'),bond('blue','pink','support'),
  bond('red','orange','support'),bond('orange','pair','pair'),
 ]}
 assert.deepEqual(sequentialScanOrder(g),['nested','pink','purple','blue','pair','orange','red'])
})
test('cycles in malformed graphs are bounded and never duplicate shapes',()=>{
 const g={atoms:[atom('a','circle',0,0),atom('b','circle',100,0)],
 bonds:[bond('a','b','sequence'),bond('b','a','sequence'),bond('a','b','support')]}
 assert.deepEqual(new Set(sequentialScanOrder(g)),new Set(['a','b']))
 assert.equal(sequentialScanOrder(g).length,2)
 assert.equal(sequentialScanNext({atoms:[],bonds:[]},null,'right'),null)
})
test('remote navigation modes preserve existing spatial mode and use scan action for sequential',async()=>{
 const remote=await readFile(new URL('../src/experiences/stax/RemoteCircleTest.tsx',import.meta.url),'utf8')
 const board=await readFile(new URL('../src/experiences/stax/MoleculeBoard.tsx',import.meta.url),'utf8')
 const model=await readFile(new URL('../src/experiences/stax/remote-gesture-model.ts',import.meta.url),'utf8')
 assert.match(remote,/stax-remote-scan-mode-v1/)
 assert.match(remote,/Scan: Sequential/)
 assert.match(remote,/Scan: Directional/)
 assert.match(remote,/scanMode==='sequential'\?'navigate_seq':'navigate'/)
 assert.match(board,/case 'navigate_seq':if\(input\.dir\)remoteSequentialNavigate\(input\.dir\)/)
 assert.match(board,/sequentialScanNext\(d,remoteFocus\.current,dir\)/)
 assert.match(model,/\|'navigate_seq'/)
})

test('B sits at the middle of the left side, A stays at bottom, both mirror for left-handed mode',async()=>{
 const css=await readFile(new URL('../src/experiences/stax/remote-circle-test.css',import.meta.url),'utf8')
 const rightB=css.match(/\.stax-remote-pad\[data-hand="right"\] \.stax-remote-corner-b\{([^}]*)\}/)?.[1]
 const leftB=css.match(/\.stax-remote-pad\[data-hand="left"\] \.stax-remote-corner-b\{([^}]*)\}/)?.[1]
 const rightA=css.match(/\.stax-remote-pad\[data-hand="right"\] \.stax-remote-corner-a\{([^}]*)\}/)?.[1]
 const leftA=css.match(/\.stax-remote-pad\[data-hand="left"\] \.stax-remote-corner-a\{([^}]*)\}/)?.[1]
 assert.match(rightB,/left:calc\(/)
 assert.match(rightB,/top:50%;transform:translateY\(-50%\)/)
 assert.match(leftB,/right:calc\(/)
 assert.match(leftB,/top:50%;transform:translateY\(-50%\)/)
 assert.match(rightA,/bottom:calc\(/)
 assert.match(leftA,/bottom:calc\(/)
})
