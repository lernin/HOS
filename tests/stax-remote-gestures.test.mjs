import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const source=await readFile(new URL('../src/experiences/stax/remote-gesture-model.ts',import.meta.url),'utf8')
const javascript=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
const model=await import('data:text/javascript;base64,'+Buffer.from(javascript).toString('base64'))
const {initialRemoteBoard,reduceRemoteBoard}=model
let id=1
const gesture=(action,dir)=>({type:'gesture',action,dir,seq:id++})
const motion=(dx,dy)=>({type:'move',dx,dy,seq:id++})
const view=(dx,dy,scale)=>({type:'view',dx,dy,scale,seq:id++})

test('remote starts as exactly one blue foam circle with an isolated model',()=>{
 const state=initialRemoteBoard()
 assert.deepEqual(state.pieces.map(p=>p.kind),['circle'])
 assert.equal(state.selected,1)
 assert.equal(state.palette,'triangle')
})

test('B swipes change the next shape and insertion port; B tap adds without altering prior foam',()=>{
 let state=initialRemoteBoard()
 state=reduceRemoteBoard(state,gesture('cycle_kind','right'))
 assert.equal(state.palette,'rectangle')
 state=reduceRemoteBoard(state,gesture('cycle_port','down'))
 assert.equal(state.port,'below')
 state=reduceRemoteBoard(state,gesture('add'))
 assert.equal(state.pieces.length,2)
 assert.equal(state.pieces[1].kind,'rectangle')
 assert.ok(state.pieces[1].y>0)
 assert.equal(state.focus,state.pieces[1].id)
})

test('eyes-free direction navigation selects actual neighbor, not an arbitrary pointer',()=>{
 let state=reduceRemoteBoard(initialRemoteBoard(),gesture('seed'))
 assert.equal(state.pieces.length,3)
 state=reduceRemoteBoard(state,gesture('navigate','right'))
 assert.equal(state.focus,2)
 assert.equal(state.selected,null)
 state=reduceRemoteBoard(state,gesture('select'))
 assert.equal(state.selected,2)
 state=reduceRemoteBoard(state,gesture('navigate','up'))
 assert.equal(state.focus,2)
})

test('A drag is one undoable edit rather than one undo per movement packet',()=>{
 let state=initialRemoteBoard()
 state=reduceRemoteBoard(state,gesture('move_start'))
 state=reduceRemoteBoard(state,motion(10,12))
 state=reduceRemoteBoard(state,motion(20,15))
 state=reduceRemoteBoard(state,gesture('move_end'))
 assert.deepEqual([state.pieces[0].x,state.pieces[0].y],[30,27])
 assert.equal(state.undo.length,1)
 state=reduceRemoteBoard(state,gesture('undo'))
 assert.deepEqual([state.pieces[0].x,state.pieces[0].y],[0,0])
 state=reduceRemoteBoard(state,gesture('redo'))
 assert.deepEqual([state.pieces[0].x,state.pieces[0].y],[30,27])
})

test('A-shift delete requires arm and confirm and can undo',()=>{
 let state=initialRemoteBoard()
 state=reduceRemoteBoard(state,gesture('delete_confirm'))
 assert.equal(state.pieces.length,1)
 state=reduceRemoteBoard(state,gesture('delete_arm'))
 assert.equal(state.deleteArmed,true)
 state=reduceRemoteBoard(state,gesture('delete_cancel'))
 assert.equal(state.deleteArmed,false)
 state=reduceRemoteBoard(state,gesture('delete_arm'))
 state=reduceRemoteBoard(state,gesture('delete_confirm'))
 assert.equal(state.pieces.length,0)
 state=reduceRemoteBoard(state,gesture('undo'))
 assert.equal(state.pieces.length,1)
})

test('two-finger pan and pinch adjust only the sandbox camera',()=>{
 let state=initialRemoteBoard()
 state=reduceRemoteBoard(state,view(24,-12,1.25))
 assert.equal(state.zoom,1.25)
 assert.equal(state.panX,24)
 assert.equal(state.panY,-12)
 state=reduceRemoteBoard(state,gesture('fit'))
 assert.ok(state.zoom>0)
 state=reduceRemoteBoard(state,gesture('zoom_out'))
 assert.ok(state.zoom<3.6)
})

test('host-only seed and reset make the proof of concept repeatable',()=>{
 let state=reduceRemoteBoard(initialRemoteBoard(),gesture('seed'))
 assert.deepEqual(state.pieces.map(p=>p.kind),['circle','triangle','circle'])
 state=reduceRemoteBoard(state,gesture('reset'))
 assert.deepEqual(state.pieces.map(p=>p.kind),['circle'])
 assert.equal(state.undo.length,0)
})
