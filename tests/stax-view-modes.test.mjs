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

test('STAX cycles classic, futuristic and four new materials without touching grammar',()=>{
 assert.deepEqual(STAX_THEMES,['color','blueprint','black','white','arc-reactor','hologram','cosmic','golden-line','golden-pollen','jelly-bloom','glassmorph','glass-beads'])
 let mode='color'
 for(const next of ['blueprint','black','white','arc-reactor','hologram','cosmic','golden-line','golden-pollen','jelly-bloom','glassmorph','glass-beads','color']){
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
 assert.match(board,/theme==='arc-reactor'\|\|theme==='hologram'\|\|theme==='cosmic'\|\|theme==='golden-line'\|\|hasStaxMaterial\(theme\)\?'transparent'/)
})

test('Golden Line reuses Letterz gold colors without changing STAX semantic data',()=>{
 assert.equal(staxThemeName('golden-line'),'Golden Line')
 assert.equal(staxShapeStroke('golden-line','#3379dc'),'#f7d35c')
 assert.equal(staxShapeStroke('golden-line','#e69131'),'#f7d35c')
 assert.equal(staxBoardColor('golden-line'),'#08090c')
 assert.equal(staxShapeFill('golden-line','#3379dc'),'#c995241c')
 assert.equal(staxOmissionDash(true),'4 8')
})
test('Golden Line uses metallic SVG strokes on the board, palette and lifted ghost',async()=>{
 const code=await readFile(new URL('../src/experiences/stax/MoleculeBoard.tsx',import.meta.url),'utf8')
 const css=await readFile(new URL('../src/experiences/stax/molecule-board.css',import.meta.url),'utf8')
 assert.match(code,/function MetallicGoldStroke/)
 assert.match(code,/<linearGradient id=\{id\}/)
 assert.match(code,/stax-golden-board/)
 assert.match(code,/stax-golden-palette-/)
 assert.match(code,/stax-golden-lifted/)
 assert.match(code,/STAX_THEMES\.map\(staxThemeName\)/)
 assert.match(css,/data-theme='golden-line'/)
 assert.match(css,/#fff1ac/)
 assert.match(css,/#ce921d/)
 assert.match(code,/const KEY='stax-free-molecules-v2'/)
})

test('four material themes have distinct palette and board colors',()=>{
 assert.equal(staxThemeName('golden-pollen'),'Golden Pollen')
 assert.equal(staxThemeName('jelly-bloom'),'Jelly Bloom')
 assert.equal(staxThemeName('glassmorph'),'Glassmorph')
 assert.equal(staxThemeName('glass-beads'),'Glass Beads')
 assert.equal(staxBoardColor('golden-pollen'),'#07101e')
 assert.equal(new Set(['golden-pollen','jelly-bloom','glassmorph','glass-beads'].map(staxBoardColor)).size,4)
 assert.equal(staxThemeName('golden-line'),'Golden Line','original gold stroke remains distinct')
 assert.equal(new Set(['golden-line','golden-pollen','jelly-bloom','glassmorph','glass-beads'].map(t=>staxShapeStroke(t,'#3379dc'))).size,5)
})
test('Golden Pollen material traces Letterz #10 colors and moving pollen grains, but uses bounded SVG',async()=>{
 const mat=await readFile(new URL('../src/experiences/stax/materials.tsx',import.meta.url),'utf8')
 const board=await readFile(new URL('../src/experiences/stax/MoleculeBoard.tsx',import.meta.url),'utf8')
 const css=await readFile(new URL('../src/experiences/stax/molecule-board.css',import.meta.url),'utf8')
 for(const tone of ['#ffc06b','#ffe29e','#fff9d9'])assert.match(mat,new RegExp(tone))
 assert.match(mat,/Golden Pollen palette/)
 assert.match(mat,/const hash=/)
 assert.match(mat,/const off=/)
 assert.match(mat,/Math.min\(42,Math.max\(24/)
 assert.match(mat,/if\(omitted\)return null/)
 assert.match(board,/<StaxMaterialEffect theme=\{theme\}/)
 assert.match(board,/<StaxMaterialDefs prefix="stax-mat-board"/)
 assert.match(css,/@keyframes stax-golden-pollen-drift/)
 assert.match(css,/prefers-reduced-motion:reduce/)
 assert.doesNotMatch(mat,/requestAnimationFrame/)
})
test('jelly and both glasses use genuinely different radial or layered gradients on board and palette',async()=>{
 const mat=await readFile(new URL('../src/experiences/stax/materials.tsx',import.meta.url),'utf8')
 const css=await readFile(new URL('../src/experiences/stax/molecule-board.css',import.meta.url),'utf8')
 const board=await readFile(new URL('../src/experiences/stax/MoleculeBoard.tsx',import.meta.url),'utf8')
 for(const id of ['jelly','jelly-edge','frost','frost-edge','bead','bead-edge'])assert.ok(mat.includes('${prefix}-'+id))
 for(const mode of ['golden-pollen','jelly-bloom','glassmorph','glass-beads'])assert.ok(css.includes("data-theme='"+mode+"'"))
 assert.match(board,/materialStroke\(theme,'stax-mat-board'/)
 assert.match(board,/materialFill\(theme,'stax-mat-board'/)
 assert.match(board,/StaxMaterialDefs prefix=\{`stax-mat-palette-/)
 assert.match(board,/StaxMaterialEffect theme=\{theme\} kind=\{paletteHover.kind\}/)
 assert.match(board,/const KEY='stax-free-molecules-v2'/)
})
