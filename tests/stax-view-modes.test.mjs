import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'

const source=await readFile(new URL('../src/experiences/stax/view-modes.ts',import.meta.url),'utf8')
const js=ts.transpileModule(source,{compilerOptions:{
 target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022
}}).outputText
const {
 STAX_THEMES,nextStaxTheme,staxThemeName,staxBoardColor,staxShapeStroke,
 staxShapeFill,staxOmissionDash
}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'))

test('STAX cycles classic and three futuristic visual modes',()=>{
 assert.deepEqual(STAX_THEMES,['color','blueprint','black','white','arc-reactor','hologram','cosmic'])
 let mode='color'
 for(const next of ['blueprint','black','white','arc-reactor','hologram','cosmic','color']){
  mode=nextStaxTheme(mode)
  assert.equal(mode,next)
 }
})
test('blueprint mode renders all seven glyph strokes in the SAME blue',()=>{
 const originals=['#3379dc','#e45450','#d549a1','#9763cc','#ba930e','#e69131','#53844a']
 assert.equal(new Set(originals.map(c=>staxShapeStroke('blueprint',c))).size,1)
 assert.notEqual(staxBoardColor('blueprint'),staxShapeStroke('blueprint',originals[0]))
})
test('black mode offers white strokes on a dark board, white mode black strokes',()=>{
 assert.equal(staxShapeStroke('black','#e69131'),'#f5f7fa')
 assert.equal(staxShapeStroke('white','#e69131'),'#1c2733')
 assert.equal(staxThemeName('white'),'Black & white')
 assert.ok(staxShapeFill('black','#e69131').startsWith('#'))
})
test('color mode retains the original colors and same local fill transparency',()=>{
 assert.equal(staxShapeStroke('color','#e69131'),'#e69131')
 assert.equal(staxShapeStroke('color','#3379dc'),'#3379dc')
 assert.equal(staxShapeFill('color','#e69131'),'#e6913114')
})
test('dotted OMIT status changes only stroke pattern and can revert',()=>{
 assert.equal(staxOmissionDash(true),'4 8')
 assert.equal(staxOmissionDash(false),undefined)
 assert.equal(staxOmissionDash(undefined),undefined)
})
test('landscape palette is a single right-edge column with bounded height',async()=>{
 const css=await readFile(new URL('../src/experiences/stax/molecule-board.css',import.meta.url),'utf8')
 assert.match(css,/@media\(orientation:landscape\)/)
 assert.match(css,/grid-template-columns:44px/)
 assert.match(css,/max-height:calc\(100dvh - 16px\)/)
})
test('actual STAX board uses theme/omission inputs and persists existing document key',async()=>{
 const code=await readFile(new URL('../src/experiences/stax/MoleculeBoard.tsx',import.meta.url),'utf8')
 assert.match(code,/data-theme=\{theme\}/)
 assert.match(code,/strokeDasharray=\{staxOmissionDash\(a.omitted\)\}/)
 assert.match(code,/onClick=\{\(\)=>\{setOmitBrush/)
 assert.match(code,/const KEY='stax-free-molecules-v2'/)
})

test('experimental modes preserve source colors or apply one coherent luminous ink',()=>{
 assert.equal(staxThemeName('arc-reactor'),'Arc Reactor')
 assert.equal(staxThemeName('hologram'),'Holographic Glass')
 assert.equal(staxThemeName('cosmic'),'Cosmic Aurora')
 assert.equal(staxShapeStroke('arc-reactor','#e69131'),'#00f5ff')
 assert.equal(staxShapeStroke('hologram','#e69131'),'#f7c5ff')
 assert.equal(staxShapeStroke('cosmic','#e69131'),'#e69131')
 for(const theme of STAX_THEMES)assert.ok(staxBoardColor(theme).startsWith('#'))
})
test('immersive backgrounds remain visible beneath transparent SVG board',async()=>{
 const board=await readFile(new URL('../src/experiences/stax/MoleculeBoard.tsx',import.meta.url),'utf8')
 assert.match(board,/theme==='arc-reactor'\|\|theme==='hologram'\|\|theme==='cosmic'\?'transparent'/)
})
