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
const {STAX_SPACING,SMALL_BLUE_RATIO,positionChildren,horizontalFollower}=
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
