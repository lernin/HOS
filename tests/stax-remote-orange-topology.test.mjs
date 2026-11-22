import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'

const source=await readFile(new URL('../src/experiences/stax/remote-orange-topology.ts',import.meta.url),'utf8')
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
const {nextRedOrangeRemoteStep,countRedOranges,redOrangeChildren}=
 await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'))
const red={id:'red',kind:'triangle',x:50,y:20}
const initial=()=>({atoms:[red],bonds:[]})
let number=0
const add=()=>({id:'o'+(++number),kind:'hexagon',x:0,y:0})

test('B-down on red walks through 2,3,4,6,7 with no surprise count',()=>{
 number=0
 let graph=initial()
 const counts=[2,3,4,6,7]
 for(const count of counts){
  const result=nextRedOrangeRemoteStep(graph,'red',add)
  assert.ok(result,'step to '+count)
  assert.equal(result.after,count)
  assert.equal(countRedOranges(result.graph,'red'),count)
  assert.equal(result.graph.atoms.length,count+1)
  graph=result.graph
 }
 assert.equal(nextRedOrangeRemoteStep(graph,'red',add),null,'no unapproved eighth piece')
})

test('the third is below the top-right, then moves into the four-piece lower-left pair',()=>{
 number=0
 let graph=nextRedOrangeRemoteStep(initial(),'red',add).graph
 const top=redOrangeChildren(graph,'red')
 assert.deepEqual(top,['o1','o2'])
 graph=nextRedOrangeRemoteStep(graph,'red',add).graph
 assert.deepEqual(redOrangeChildren(graph,top[1]),['o3'])
 assert.deepEqual(redOrangeChildren(graph,top[0]),[])
 const beforeThree=graph.atoms.find(x=>x.id==='o3')
 const fourth=nextRedOrangeRemoteStep(graph,'red',add)
 assert.equal(fourth.before,3)
 assert.equal(fourth.after,4)
 assert.equal(fourth.added,1)
 assert.equal(fourth.reparented,true)
 graph=fourth.graph
 assert.deepEqual(redOrangeChildren(graph,top[0]),['o3','o4'])
 assert.deepEqual(redOrangeChildren(graph,top[1]),[])
 assert.equal(graph.atoms.find(x=>x.id==='o3'),beforeThree,'third piece identity is preserved')
})

test('six creates the bottom pair below middle-left, seven adds a modifier under middle-right',()=>{
 number=0
 let graph=initial()
 for(let i=0;i<4;i++)graph=nextRedOrangeRemoteStep(graph,'red',add).graph
 const [topLeft]=redOrangeChildren(graph,'red')
 const [middleLeft,middleRight]=redOrangeChildren(graph,topLeft)
 assert.deepEqual(redOrangeChildren(graph,middleLeft),['o5','o6'])
 assert.deepEqual(redOrangeChildren(graph,middleRight),[])
 const seven=nextRedOrangeRemoteStep(graph,'red',add)
 assert.equal(seven.after,7)
 assert.equal(seven.reparented,false)
 assert.deepEqual(redOrangeChildren(seven.graph,middleRight),['o7'])
})

test('invalid topologies and unknown red targets are rejected without changing the graph',()=>{
 number=0
 const root=initial()
 assert.equal(nextRedOrangeRemoteStep(root,'unknown',add),null)
 const corrupt={atoms:[red,{id:'orange',kind:'hexagon',x:0,y:0}],
  bonds:[{parent:'red',child:'orange',relation:'support'}]}
 assert.equal(nextRedOrangeRemoteStep(corrupt,'red',add),null)
 assert.equal(corrupt.atoms.length,2)
 assert.equal(corrupt.bonds.length,1)
})

test('the canonical STAX editor uses real geometry for new red orange tiers, detach and deletion',async()=>{
 const board=await readFile(new URL('../src/experiences/stax/MoleculeBoard.tsx',import.meta.url),'utf8')
 const phone=await readFile(new URL('../src/experiences/stax/RemoteCircleTest.tsx',import.meta.url),'utf8')
 const model=await readFile(new URL('../src/experiences/stax/remote-gesture-model.ts',import.meta.url),'utf8')
 assert.match(board,/const progress=nextRedOrangeRemoteStep\(before,parent\.id/)
 assert.match(board,/alignSequenceFamilyClearance\(alignRedSupporters\(normalizeRoles\(progress\.graph\),parent\.id\)\)/)
 assert.match(board,/function remoteDetachSelected\(\)/)
 assert.match(board,/function remotePairedRedOrange\(d:Draft,id:string\):boolean/)
 assert.match(board,/if\(remotePairedRedOrange\(before,id\)\)/)
 assert.match(board,/if\(remotePairedRedOrange\(d,id\)\)/)
 assert.match(board,/const branch=descendants\(before,id\)/)
 assert.match(board,/bonds:before\.bonds\.filter\(b=>!outside\.includes\(b\)\)/)
 assert.match(board,/const next=reflowAfterRemoval\(translate\(separated,branch,0,DROP_DISTANCE\)\)/)
 assert.match(board,/if\(!remoteDeleteArmed\.current\|\|remoteDeleteTarget\.current!==id\|\|!id\)return/)
 assert.match(board,/const branch=descendants\(d,id\)/)
 assert.match(phone,/send\('detach'\)/)
 assert.match(phone,/send\('delete_arm'\)/)
 assert.match(phone,/send\('delete_confirm'\)/)
 assert.match(model,/\|'detach'\|/)
})

test('selection is a white silhouette halo, not a dotted rectangular selection box',async()=>{
 const board=await readFile(new URL('../src/experiences/stax/MoleculeBoard.tsx',import.meta.url),'utf8')
 const css=await readFile(new URL('../src/experiences/stax/molecule-board.css',import.meta.url),'utf8')
 assert.match(board,/selected===a\.id\?'stax-selected-atom'/)
 assert.match(board,/className="stax-selection-glow-outline"/)
 assert.doesNotMatch(board,/selected===a\.id&&<rect/)
 assert.match(css,/\.stax-selected-atom image\.stax-authentic-foam-chip/)
 assert.match(css,/drop-shadow\(0 0 22px rgba\(241,248,255,\.62\)\)/)
 assert.match(css,/--stax-foam-shadow-contact/)
})

test('classroom foam starts zoomed out to about three wooden slats, without changing other themes',async()=>{
 const board=await readFile(new URL('../src/experiences/stax/MoleculeBoard.tsx',import.meta.url),'utf8')
 assert.match(board,/const CLASSROOM_WOOD_DEFAULT_ZOOM=2\.18/)
 assert.match(board,/width:W\*CLASSROOM_WOOD_DEFAULT_ZOOM/)
 assert.match(board,/height:H\*CLASSROOM_WOOD_DEFAULT_ZOOM/)
 assert.match(board,/remoteSandbox\|\|theme==='classroom-foam'\?classroomWoodDefaultView:defaultView/)
 assert.match(board,/case 'reset':remoteRedo\.current=\[\];remoteFocus\.current=null;setHistory\(\[\]\);update\(empty\(\)\);setCamera\(classroomWoodDefaultView\)/)
 const visibleSlats=570*2.18/411
 assert.ok(visibleSlats>2.8&&visibleSlats<3.2)
})

test('selected foam uses only white glow while ordinary foam keeps its dark shadow',async()=>{
 const css=await readFile(new URL('../src/experiences/stax/molecule-board.css',import.meta.url),'utf8')
 const selected=css.match(/svg g\[data-kind\]\.stax-selected-atom image\.stax-authentic-foam-chip\s*\{([^}]+)\}/)?.[1]
 const ordinary=css.match(/\[data-theme='classroom-foam'\] image\.stax-authentic-foam-chip\s*\{([^}]+)\}/)?.[1]
 assert.ok(selected,'selected foam rule must exist')
 assert.ok(ordinary,'ordinary foam rule must exist')
 assert.match(selected,/drop-shadow\(0 0 22px rgba\(241,248,255,\.62\)\)/)
 assert.doesNotMatch(selected,/rgba\(24,16,9/)
 assert.match(ordinary,/rgba\(24,16,9/)
})

test('red-orange growth never spreads bare blue sentence heads',async()=>{
 const board=await readFile(new URL('../src/experiences/stax/MoleculeBoard.tsx',import.meta.url),'utf8')
 const clearance=board.slice(board.indexOf('function alignSequenceFamilyClearance('),board.indexOf('function box('))
 assert.match(clearance,/const leftFamily=left\.kind==='circle'\?supportFootprint\(next,left\.id\):null/)
 assert.match(clearance,/const rightFamily=right\.kind==='circle'\?supportFootprint\(next,right\.id\):null/)
 assert.match(clearance,/if\(right\.kind==='circle'&&\(left\.kind==='triangle'\|\|left\.kind==='circle'\)&&/)
 assert.match(clearance,/\(leftFamily\?\.length\?\?1\)===1&&\(rightFamily\?\.length\?\?1\)===1\)continue/)
 assert.match(clearance,/const shift=requiredFamilyFollowerShift\(/)
 const remote=board.slice(board.indexOf('function remoteAttach('),board.indexOf('function remotePairedRedOrange('))
 assert.match(remote,/alignSequenceFamilyClearance\(alignRedSupporters\(normalizeRoles\(progress\.graph\),parent\.id\)\)/)
})
