import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'

const source=await readFile(new URL('../src/experiences/stax/sequential-scan.ts',import.meta.url),'utf8')
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText
const {sequentialScanOrder,sequentialScanNext,scanSwipeSteps,scanStrideForSpeed,normalizeScanSpeed,DEFAULT_SCAN_SPEED,SCAN_SPEED_KEY}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'))
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
 assert.match(rightB,/top:57%;transform:translateY\(-50%\)/)
 assert.match(leftB,/right:calc\(/)
 assert.match(leftB,/top:57%;transform:translateY\(-50%\)/)
 assert.match(rightA,/bottom:calc\(/)
 assert.match(leftA,/bottom:calc\(/)
})

test('one long scan swipe crosses multiple shapes, each crossing has a reverse step',()=>{
 assert.deepEqual(scanSwipeSteps(0,165),{step:4,directions:['right','right','right','right']})
 assert.deepEqual(scanSwipeSteps(4,82),{step:2,directions:['left','left']})
 assert.deepEqual(scanSwipeSteps(0,-121),{step:-3,directions:['left','left','left']})
 assert.deepEqual(scanSwipeSteps(-3,-40),{step:-1,directions:['right','right']})
 assert.deepEqual(scanSwipeSteps(0,39),{step:0,directions:[]})
 assert.deepEqual(scanSwipeSteps(0,Number.NaN),{step:0,directions:[]})
 assert.equal(scanSwipeSteps(0,10_000).directions.length,80,'bound batched haptics and commands')
})
test('scan speed defaults 4×, persists safely, and covers four times as many pieces',()=>{
 assert.equal(DEFAULT_SCAN_SPEED,4)
 assert.equal(SCAN_SPEED_KEY,'stax-sequential-scan-speed-v1')
 assert.equal(normalizeScanSpeed(null),4)
 assert.equal(normalizeScanSpeed('garbage'),4)
 assert.equal(normalizeScanSpeed('1'),1)
 assert.equal(normalizeScanSpeed('6'),6)
 assert.equal(normalizeScanSpeed('300'),6)
 assert.equal(scanStrideForSpeed(4),10)
 assert.equal(scanStrideForSpeed(1),40)
 assert.equal(scanSwipeSteps(0,160,scanStrideForSpeed(1)).directions.length,4)
 assert.equal(scanSwipeSteps(0,160,scanStrideForSpeed(4)).directions.length,16)
 assert.equal(scanSwipeSteps(0,160,scanStrideForSpeed(6)).directions.length,24)
 assert.deepEqual(scanSwipeSteps(16,80,scanStrideForSpeed(4)),{step:8,directions:Array(8).fill('left')})
})
test('both scanner interfaces save speed and keep taps away from pad gesture events',async()=>{
 const remote=await readFile(new URL('../src/experiences/stax/RemoteCircleTest.tsx',import.meta.url),'utf8')
 const board=await readFile(new URL('../src/experiences/stax/MoleculeBoard.tsx',import.meta.url),'utf8')
 assert.match(remote,/scanSwipeSteps\(contact\.scanStep\?\?0,contact\.x-[^\n]*scanStrideForSpeed\(scanSpeed\)\)/)
 assert.match(board,/scanSwipeSteps\(style\.step,e\.clientX-style\.originX,scanStrideForSpeed\(scanSpeed\)\)/)
 assert.match(remote,/localStorage\.setItem\(SCAN_SPEED_KEY,String\(scanSpeed\)\)/)
 assert.match(board,/localStorage\.setItem\(SCAN_SPEED_KEY,String\(scanSpeed\)\)/)
 assert.match(remote,/onPointerDown=\{e=>e\.stopPropagation\(\)\}/)
 assert.match(remote,/id="stax-remote-scan-speed"/)
 assert.match(board,/id="stax-board-scan-speed"/)
 assert.match(remote,/min="1" max="6" step="1"/)
})
test('B-left enters momentary continuous scanning with haptic ticks; other gestures remain separate',async()=>{
 const remote=await readFile(new URL('../src/experiences/stax/RemoteCircleTest.tsx',import.meta.url),'utf8')
 const board=await readFile(new URL('../src/experiences/stax/MoleculeBoard.tsx',import.meta.url),'utf8')
 const move=remote.slice(remote.indexOf('function pointerMove('),remote.indexOf('function pointerUp('))
 const corner=move.slice(move.indexOf("if(contact.role==='corner'){"),move.indexOf('const surfaces=surfaceContacts()'))
 assert.match(corner,/vertical&&thumbY<=-24/)
 assert.match(corner,/contact\.thumbMode='skins'/)
 assert.match(corner,/horizontal&&thumbX<=-24/)
 assert.match(corner,/contact\.thumbMode='scan'/)
 assert.match(corner,/state\.current\.scanScroll=\{owner:contact\.id\}/)
 assert.match(corner,/vertical&&thumbY>=24/)
 assert.match(corner,/contact\.thumbMode='add'/)
 assert.match(corner,/horizontal&&thumbX>=24/)
 assert.match(corner,/contact\.thumbMode='view'/)
 assert.match(move,/scanSwipeSteps\(contact\.scanStep\?\?0,contact\.x-/)
 assert.match(move,/for\(const dir of result\.directions\)send\('navigate_seq',dir\)/)
 assert.match(move,/scanTick\(result\.directions\.length\)/)
 assert.match(remote,/count===1\?10:Array\.from\(/,'vibration pattern ticks for each piece')
 assert.match(remote,/state\.current\.scanScroll=null;setScanActive\(false\)/,'releasing B exits scanning')
 assert.match(remote,/send\('modify',dir\)/,'regular B + pad construction still exists')
 assert.match(board,/case 'navigate_seq':if\(input\.dir\)remoteSequentialNavigate\(input\.dir\)/)
})
test('standalone tray thumb-left also activates continuous scan, and handle is inset for both directions',async()=>{
 const board=await readFile(new URL('../src/experiences/stax/MoleculeBoard.tsx',import.meta.url),'utf8')
 const css=await readFile(new URL('../src/experiences/stax/molecule-board.css',import.meta.url),'utf8')
 const button=board.slice(board.indexOf('function skinButtonDown('),board.indexOf('const [fall,setFall]'))
 const move=board.slice(board.indexOf('function moveTouch('),board.indexOf('function endTouch('))
 assert.match(button,/horizontal&&dx<=-24/)
 assert.match(button,/hold\.mode='scan'/)
 assert.match(button,/scanCursor\.current=selected/)
 assert.match(button,/vertical&&dy<=-24/)
 assert.match(button,/hold\.mode='skins'/)
 assert.match(button,/vertical&&dy>=24/)
 assert.match(button,/hold\.mode='add'/)
 assert.match(button,/horizontal&&dx>=24/)
 assert.match(button,/hold\.mode='view'/)
 assert.match(move,/menuHold\.current\.mode==='scan'/)
 assert.match(move,/scanSwipeSteps\(style\.step,e\.clientX-style\.originX,scanStrideForSpeed\(scanSpeed\)\)/)
 assert.match(move,/sequentialScanNext\(currentDoc\.current,next,direction\)/)
 assert.match(move,/menuScanTick\(result\.directions\.length\)/)
 assert.match(button,/menuHold\.current=null;skinSurfaceSwipe\.current=null;scanCursor\.current=null/)
 assert.match(css,/left:calc\(env\(safe-area-inset-left,0px\) \+ 55px\)/)
 assert.match(css,/left:calc\(env\(safe-area-inset-left,0px\) \+ 104px\)/)
 assert.match(board,/data-scan-mode=\{scanButtonActive\?'true':'false'\}/)
})
