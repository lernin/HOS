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
 assert.match(board,/theme==='pearlescent-glass'\?\(a.omitted\?'#e9ddf71f':'#ffffff01'\)/)
 assert.match(board,/onPointerDown=\{e=>onShapeDown\(e,a.id\)\}/)
 assert.match(board,/const KEY='stax-free-molecules-v2'/)
 assert.match(css,/stax-pearlescent\/background\.avif/)
 assert.match(css,/data-theme='pearlescent-glass'/)
})
