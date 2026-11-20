import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const read=(relative)=>readFile(new URL(relative,import.meta.url))
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')

test('seven real compressed pearlescent assets and quiet background are present and byte-verified',async()=>{
 const atlas=await read('../public/stax-pearlescent/atlas.avif')
 const background=await read('../public/stax-pearlescent/background.avif')
 assert.equal(sha(atlas),'366d45cc9efda240d4b76be38ae237990cad10280df6cbc9ed6f398752bd7e1d')
 assert.equal(sha(background),'30a6e3700160fb479cb24f1612168c12942ce871b64234b9a63a6113468e3f83')
 assert.equal(atlas.toString('ascii',4,8),'ftyp')
 assert.ok(atlas.toString('ascii',8,48).includes('avif'))
 assert.ok(atlas.length<50000,'mobile-friendly single atlas, not seven huge PNGs')
})
test('atlas maps all seven canonical shapes and scales world dimensions without modifying grammar',async()=>{
 const code=await read('../src/experiences/stax/pearlescent-atlas.tsx').then(x=>x.toString())
 for(const kind of ['circle','triangle','square','rectangle','diamond','hexagon','oval'])
  assert.match(code,new RegExp(kind+':\\d+'))
 assert.match(code,/const tileW=full\*w\/nativeW,tileH=full\*h\/nativeH/)
 assert.match(code,/if\(omitted\)return null/)
 assert.match(code,/const MAX_BODY=289\/384/)
 assert.match(code,/pointerEvents="none"/)
 assert.match(code,/stax-pearlescent\/atlas\.avif/)
})
test('Pearlescent Glass draws across workspace, palette and lift, with background and preserved native SVG hit targets',async()=>{
 const board=(await read('../src/experiences/stax/MoleculeBoard.tsx')).toString()
 const css=(await read('../src/experiences/stax/molecule-board.css')).toString()
 assert.match(board,/theme==='pearlescent-glass'&&<PearlescentGlass kind=\{a.kind\}/)
 assert.match(board,/theme==='pearlescent-glass'&&<PearlescentGlass kind=\{kind\}/)
 assert.match(board,/theme==='pearlescent-glass'&&<PearlescentGlass kind=\{paletteHover.kind\}/)
 assert.match(board,/theme==='pearlescent-glass'\|\|theme==='pearlescent-airglass'\|\|theme==='pearlescent-dusk'\)\?\(a.omitted\?'#e9ddf71f':'#ffffff01'\)/)
 assert.match(board,/onPointerDown=\{e=>onShapeDown\(e,a.id\)\}/)
 assert.match(board,/const KEY='stax-free-molecules-v2'/)
 assert.match(css,/stax-pearlescent\/background\.avif/)
 assert.match(css,/data-theme='pearlescent-glass'/)
})

test('nested glass texture SVG is NOT sized to the workspace: a regression that showed all seven tiles',async()=>{
 const css=(await read('../src/experiences/stax/molecule-board.css')).toString()
 const art=(await read('../src/experiences/stax/pearlescent-atlas.tsx')).toString()
 assert.match(css,/\.stax-molecule-canvas > svg \{/,'size only the outer board, not each glass tile')
 assert.doesNotMatch(css,/\.stax-molecule-canvas svg \{/,'no generic descendant SVG sizing')
 assert.match(css,/\.stax-molecule-palette button > svg \{/,'palette sizing must not override its nested glass tile')
 assert.doesNotMatch(css,/\.stax-molecule-palette button svg \{/)
 assert.match(css,/\.stax-lifted-ghost > svg \{/,'drag preview styles scoped to outer svg')
 assert.match(css,/svg\.stax-pearlescent-art \{[\s\S]*?overflow:hidden!important/)
 assert.match(css,/\.stax-pearlescent-art image \{[\s\S]*?pointer-events:none!important/)
 assert.match(art,/width=\{tileW\} height=\{tileH\}/,'each glass tile sizes to one shape only')
 assert.match(art,/viewBox=\{\x60\$\{\(i%4\)\*CELL\}/,'each tile chooses its own atlas offset')
 assert.match(art,/overflow="hidden" pointerEvents="none"/)
})
test('glass tile atlas explicitly contains hexagon tile index 5, not an empty or swapped region',async()=>{
 const art=(await read('../src/experiences/stax/pearlescent-atlas.tsx')).toString()
 assert.match(art,/circle:0,triangle:1,square:2,rectangle:3,[\s\S]*?diamond:4,hexagon:5,oval:6/)
 assert.match(art,/const CELL=320/)
 assert.match(art,/const i=atlasIndex\[kind\]/)
})
test('dragging is bond-connected only; a loose shape moves alone and artwork is not a hit target',async()=>{
 const board=(await read('../src/experiences/stax/MoleculeBoard.tsx')).toString()
 const css=(await read('../src/experiences/stax/molecule-board.css')).toString()
 assert.match(board,/const ids=new Set<string>\(\[id\]\);let change=true/,'molecule begins at picked shape')
 assert.match(board,/const proposed=translate\(d.before,molecule\(d.before,d.id\),dx,dy\+lift\)/)
 assert.match(board,/onPointerDown=\{e=>onShapeDown\(e,a.id\)\}/)
 assert.match(css,/\.stax-pearlescent-art,[\s\S]*?pointer-events:none!important/)
})
