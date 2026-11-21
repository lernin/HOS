import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'

// Run the exact production TypeScript geometry source, with no second JS
// reimplementation of the layout algorithm to accidentally diverge.
const src=await readFile(new URL('../src/experiences/stax/geometry.ts',import.meta.url),'utf8')
const js=ts.transpileModule(src,{compilerOptions:{
 target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022,
}}).outputText
const {STAX_SPACING,SMALL_BLUE_RATIO,positionChildren,positionRedOrangeCrossPair,horizontalFollower,redBlueMagnetDistance,positionRedRightNestedOrange,requiredFamilyFollowerShift}=
 await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'))
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`expected ${a} ≈ ${b}`)
const support=(parent,children,gap=STAX_SPACING.attachment)=>
 positionChildren(parent,children,{gap,belowGap:STAX_SPACING.attachment})

test('STAX source units are explicit independent relationship distances',()=>{
 close(STAX_SPACING.unit,.07)
 close(STAX_SPACING.attachment,4*STAX_SPACING.unit)
 close(STAX_SPACING.group,7*STAX_SPACING.unit)
 close(STAX_SPACING.connector,14*STAX_SPACING.unit)
 close(STAX_SPACING.row,29*STAX_SPACING.unit)
})
test('one child under ANY parent: child right edge = parent midline',()=>{
 for(const parent of [
  {x:10,y:20,width:3.5,height:3.5}, // blue noun
  {x:70,y:11,width:4.600,height:3.548}, // red verb
  {x:-30,y:7,width:3.786*.4056/.4716,height:2.070*.2196/.258}, // green parent
 ]){
  for(const child of [
   {id:'purple',width:2.521,height:1.566},
   {id:'orange',width:2.775*3787.2/4147.2,height:1.566*2332.8/2340.864},
  ]){
   const p=support(parent,[child]).get(child.id)
   close(p.x+child.width,parent.x+parent.width/2)
   close(p.y,parent.y+parent.height+.28)
  }
 }
})
test('two equally sized children form symmetrical centered group with exact gap',()=>{
 const parent={x:31,y:44,width:4.6,height:3.548}
 const kids=[{id:'one',width:2.5,height:1.56},{id:'two',width:2.5,height:1.56}]
 const result=support(parent,kids)
 const a=result.get('one'),b=result.get('two')
 close(b.x-(a.x+kids[0].width),.28)
 close((a.x+b.x+kids[1].width)/2,parent.x+parent.width/2)
 close(a.y,b.y)
})
test('mixed-size sibling shapes share exactly aligned vertical centers',()=>{
 const parent={x:0,y:0,width:3.5,height:3.5}
 const kids=[
  {id:'pink',width:2.251,height:2.251},
  {id:'purple',width:2.521,height:1.566},
  {id:'green',width:3.786*.4056/.4716,height:2.070*.2196/.258}
 ]
 const p=support(parent,kids)
 const centers=kids.map(c=>p.get(c.id).y+c.height/2)
 close(centers[0],centers[1]);close(centers[1],centers[2])
 close(centers[0],parent.y+parent.height+.28+2.251/2)
 close(p.get('purple').x-(p.get('pink').x+kids[0].width),.28)
 close(p.get('green').x-(p.get('purple').x+kids[1].width),.28)
})
test('nested mini-family overhang contributes to width of a multi-child row',()=>{
 const parent={x:3,y:1,width:3.5,height:3.5}
 const greenWidth=3.786*.4056/.4716
 const orangeWidth=2.775*3787.2/4147.2
 const nestedLeft=greenWidth/2-orangeWidth
 assert.ok(nestedLeft<0,'adverb extends left of adjective when right-edge anchored')
 const kids=[
  {id:'determiner',width:2.521,height:1.566},
  {id:'adjective',width:greenWidth,height:2.070*.2196/.258,
   extentLeft:nestedLeft,extentRight:greenWidth}
 ]
 const p=support(parent,kids)
 const first=p.get('determiner'),green=p.get('adjective')
 const left=first.x,right=green.x+greenWidth
 close((left+right)/2,parent.x+parent.width/2)
 close((green.x+nestedLeft)-(first.x+kids[0].width),.28)
 const orange={x:green.x+greenWidth/2-orangeWidth,width:orangeWidth}
 close(orange.x+orange.width,green.x+greenWidth/2)
})
test('removing a sibling restores singleton anchor instead of retaining multi-child centering',()=>{
 const parent={x:5,y:0,width:3.5,height:3.5}
 const purple={id:'purple',width:2.521,height:1.566}
 const green={id:'green',width:3.26,height:1.76}
 const before=support(parent,[purple,green]).get('purple')
 const after=support(parent,[purple]).get('purple')
 close(after.x+purple.width,parent.x+parent.width/2)
 assert.notEqual(before.x,after.x)
})
test('two under-red orange supporters snap symmetrically with exact .28 gap',()=>{
 const red={x:0,y:0,width:4.600,height:3.548}
 const smallHex={width:2.775*3787.2/4147.2,height:1.566*2332.8/2340.864}
 const a={id:'first',...smallHex},b={id:'second',...smallHex}
 const one=support(red,[a]).get(a.id)
 close(one.x+a.width,red.width/2)
 const pair=support(red,[a,b])
 close(pair.get(b.id).x-(pair.get(a.id).x+a.width),.28)
 close((pair.get(a.id).x+pair.get(b.id).x+b.width)/2,red.width/2)
 assert.notEqual(one.x,pair.get(a.id).x)
})
test('yellow diamond → blue circle uses .98, never .49',()=>{
 const yellow={x:20,y:7,width:2.374,height:3.498}
 const blue={width:3.5,height:3.5}
 const p=horizontalFollower(yellow,blue,STAX_SPACING.connector)
 close(p.x-(yellow.x+yellow.width),.98)
 close(p.y+blue.height/2,yellow.y+yellow.height/2)
})
test('small blue ratio is preserved as geometry, not assigned an unverified role',()=>{
 close(SMALL_BLUE_RATIO,.3353/.4359)
 assert.ok(SMALL_BLUE_RATIO>.76&&SMALL_BLUE_RATIO<.78)
})
test('refuse negative gaps and malformed child extents',()=>{
 assert.throws(()=>support({x:0,y:0,width:3.5,height:3.5},
  [{id:'x',width:2,height:1}],-.28),RangeError)
 assert.throws(()=>support({x:0,y:0,width:3.5,height:3.5},
  [{id:'x',width:2,height:1,extentLeft:1}]),RangeError)
})

test('third orange beneath right red supporter uses pink-style offset, not centered',()=>{
 const parent={x:135,y:240,width:2.525,height:1.559}
 const child={id:'third',width:2.525,height:1.559}
 const pos=support(parent,[child]).get('third')
 // A single supporter touches its parent midpoint with its RIGHT edge.
 close(pos.x+child.width,parent.x+parent.width/2)
 close(pos.y,parent.y+parent.height+STAX_SPACING.attachment)
 assert.ok(pos.x+child.width/2<parent.x+parent.width/2,
  'third orange shifts left, just as an orange nested beneath pink')
})

test('source head-to-head family minimum is 2.03, not 0.49 staircase gap',()=>{
 const left={x:0,y:0,width:3.5,height:3.5}
 const right={x:5.53,y:0,width:3.5,height:3.5}
 close(requiredFamilyFollowerShift(left,right,[left],[right],STAX_SPACING.row,STAX_SPACING.connector),0)
 const tooClose={...right,x:4}
 close(requiredFamilyFollowerShift(left,tooClose,[left],[tooClose],STAX_SPACING.row,STAX_SPACING.connector),1.53)
})
test('overhanging children force greater spacing between distinct sentence families',()=>{
 const left={x:0,y:0,width:3.5,height:3.5}
 const right={x:5.53,y:0,width:3.5,height:3.5}
 const leftChild={x:4.2,y:4.0,width:2.2,height:1.6}
 const rightChild={x:4.7,y:4.1,width:2.5,height:1.6}
 const dx=requiredFamilyFollowerShift(left,right,[left,leftChild],[right,rightChild],
  STAX_SPACING.row,STAX_SPACING.connector)
 close(dx,6.4+.98-4.7)
 assert.ok(dx>0)
 close(rightChild.x+dx-(leftChild.x+leftChild.width),STAX_SPACING.connector)
})
test('children in nonintersecting rows do not create unnecessary horizontal space',()=>{
 const l={x:0,y:0,width:3.5,height:3.5},r={x:5.53,y:0,width:3.5,height:3.5}
 const high={x:4.9,y:4,width:3,height:1}
 const low={x:4.4,y:6,width:3,height:1}
 close(requiredFamilyFollowerShift(l,r,[l,high],[r,low],2.03,.98),0)
})
test('family clearance is deterministic, zoom-independent and validates extents',()=>{
 const l={x:0,y:0,width:3,height:3},r={x:4,y:0,width:3,height:3}
 const kids=[{x:0,y:4,width:1,height:1}]
 assert.throws(()=>requiredFamilyFollowerShift(l,r,[l,...kids],[r],-1,.98),RangeError)
 assert.throws(()=>requiredFamilyFollowerShift(l,r,[l,...kids],[{x:4,y:0,width:0,height:2}],2.03,.98),RangeError)
 const original=JSON.stringify([l,r,kids])
 assert.ok(requiredFamilyFollowerShift(l,r,[l,...kids],[r],2.03,.98)>0)
 assert.equal(JSON.stringify([l,r,kids]),original)
})


test('two large orange supporters beneath red cross to form an actual X',()=>{
 const red={x:0,y:0,width:4.6,height:3.548}
 const children=[{id:'left',width:2.775,height:1.566},{id:'right',width:2.775,height:1.566}]
 const result=positionRedOrangeCrossPair(red,children,.28)
 const left=result.get('left'),right=result.get('right')
 const crossing=left.x+children[0].width-right.x
 assert.ok(crossing>0,'inner hexagon tips must overlap, not merely approach')
 close(crossing,2.775*.025)
 assert.ok(crossing<2.775*.05,'cross at tips, without stacking the hexagons')
 close((left.x+right.x+children[1].width)/2,red.x+red.width/2)
 close(left.y,right.y)
 close(left.y,red.y+red.height+.28)
 // The rest of STAX keeps its general nonnegative-gap sibling layout.
 const ordinary=support(red,children)
 assert.ok(ordinary.get('left').x+children[0].width<ordinary.get('right').x)
});

test('right red orange third is staggered but not as far left as pink-style anchor',()=>{
 const parent={x:135,y:240,width:2.525,height:1.559}
 const child={id:'third',width:2.525,height:1.559}
 const result=positionRedRightNestedOrange(parent,child,STAX_SPACING.attachment)
 const pinkLike=support(parent,[child]).get('third')
 const centeredX=parent.x+(parent.width-child.width)/2
 assert.ok(result.x>pinkLike.x,'move third rightward compared with the over-left old version')
 assert.ok(result.x<centeredX,'third must remain slightly left of center')
 close(result.x,centeredX-child.width*.2)
 close(result.y,parent.y+parent.height+STAX_SPACING.attachment)
})

test('four compact red oranges: centered upper pair with .77 gap and touching lower X',()=>{
 const w=2.775*(3787.2/4147.2),h=1.566*(2332.8/2340.864)
 const red={x:0,y:0,width:4.6,height:3.548}
 const bottom=[{id:'grandchild1',width:w,height:h},{id:'grandchild2',width:w,height:h}]
 const lower=positionRedOrangeCrossPair({x:0,y:0,width:w,height:h},bottom,.28)
 const first=lower.get('grandchild1'),second=lower.get('grandchild2')
 close(first.x+w-second.x,w*.025)
 // Blueprint: the two upper compact oranges have their own .77 gap.
 // The lower pair hangs under LEFT, and MUST NOT push the upper-right uncle away.
 const top=positionChildren(red,[
  {id:'parent',width:w,height:h},{id:'uncle',width:w,height:h}
 ],{gap:.77,belowGap:.28})
 const parent=top.get('parent'),uncle=top.get('uncle')
 close(uncle.x-(parent.x+w),.77)
 close((parent.x+uncle.x+w)/2,red.x+red.width/2)
 const lowerRightmost=parent.x+second.x+w
 assert.ok(lowerRightmost>uncle.x,'lower-right tip can extend horizontally beneath uncle')
 assert.ok(lowerRightmost<uncle.x+w,'lower X should not overrun the complete uncle')
 // Despite horizontal extent overlap, their vertical bands are separate.
 assert.ok(parent.y+first.y>uncle.y+h,'lower X is below the uncle, not on the same row')
 const three=positionChildren(red,[{id:'left',width:w,height:h},{id:'right',width:w,height:h}],{
  gap:.28,belowGap:.28
 })
 close(three.get('right').x-(three.get('left').x+w),.28)
})

test('red-blue size-aware magnetic zone forgives near edges but rejects remote placement',()=>{
 const shape={width:100,height:94}
 assert.equal(redBlueMagnetDistance(0,0,shape),0)
 assert.equal(redBlueMagnetDistance(55,55,shape),0,
  'head is welcomed near its rectangle, not just an exact top-left anchor')
 assert.ok(redBlueMagnetDistance(120,72,shape)<76,
  'red-blue accepts a forgiving near-drop that the old 76px radial rule rejected')
 assert.ok(redBlueMagnetDistance(300,200,shape)>76,
  'distant heads must remain loose')
 assert.equal(redBlueMagnetDistance(-120,-72,shape),redBlueMagnetDistance(120,72,shape),
  'both drag orientations have symmetric tolerance')
 assert.throws(()=>redBlueMagnetDistance(0,0,{width:0,height:40}),RangeError)
})
test('only red-blue sequences use generous magnet acceptance, never pink supporter or final coordinates',async()=>{
 const board=await readFile(new URL('../src/experiences/stax/MoleculeBoard.tsx',import.meta.url),'utf8')
 const magnet=board.slice(board.indexOf('function bestSnap('),board.indexOf('function resolveMagnetBase('))
 assert.match(magnet,/const redBlue=\(left.kind==='circle'&&right.kind==='triangle'\)\|\|/)
 assert.match(magnet,/\(left.kind==='triangle'&&right.kind==='circle'\)/)
 assert.match(magnet,/redBlueMagnetDistance\(delta.x,delta.y,\{width:atomWidth\(a\),height:atomHeight\(a\)\}\)/)
 assert.match(magnet,/const desired=snappedSequenceFollowerPosition\(left,right\)/)
 assert.match(magnet,/const offered=\(s:Snap\)=>\{if\(s.distance<=SNAP_RADIUS/)
 assert.match(magnet,/const desired=supportPosition\(blue,sup,d\)/)
})
