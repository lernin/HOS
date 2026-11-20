import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import vm from 'node:vm'

const engine=await readFile(new URL('../public/stax-letterz-original/magical_stroke_engine.js',import.meta.url),'utf8')
const registryCode=await readFile(new URL('../public/stax-letterz-original/stroke_material_registry.js',import.meta.url),'utf8')
const adapter=await readFile(new URL('../src/experiences/stax/letterz-golden-pollen.tsx',import.meta.url),'utf8')
const board=await readFile(new URL('../src/experiences/stax/MoleculeBoard.tsx',import.meta.url),'utf8')
const css=await readFile(new URL('../src/experiences/stax/molecule-board.css',import.meta.url),'utf8')
const materials=await readFile(new URL('../src/experiences/stax/materials.tsx',import.meta.url),'utf8')
function gitBlob(text){
 const data=Buffer.from(text)
 return createHash('sha1').update(Buffer.from('blob '+data.length+'\0')).update(data).digest('hex')
}
test('STAX vendors the ORIGINAL Letterz engine and registry, byte for byte',()=>{
 assert.equal(gitBlob(engine),'a1b756648c15816b096b84f2450858640d0cb400')
 assert.equal(gitBlob(registryCode),'2d77a99eefd96b5364ee30547b5c315205c509b0')
 assert.match(engine,/case 9:flowing\(160,\.008,2\.9,\.55,\.77\)/)
 assert.match(engine,/j<28/)
 assert.match(engine,/sourceVersion:'original-75-shared-v1'/)
})
test('real Letterz #10 Golden Pollen draws moving frames and registers same original material',()=>{
 const sample={style:{},setAttribute(){},appendChild(){}}
 const sandbox={window:{},document:{createElementNS:()=>sample,body:{appendChild(){}}}}
 vm.runInNewContext(engine,sandbox)
 vm.runInNewContext(registryCode,sandbox)
 const registration=sandbox.window.LetterzMaterialRegistry
 assert.ok(registration.has(10))
 assert.equal(registration.list().length,75)
 assert.equal(registration.list()[9].name,'Golden Pollen')
 const ops=[]
 const c={
  save(){},restore(){},setTransform(){},beginPath(){},stroke(){},fill(){},
  arc(x,y,r){ops.push({x,y,r})},fillRect(){},
  createRadialGradient(){return {addColorStop(){}}},
  clearRect(){},
 }
 const part={path:{},pts:Array.from({length:181},(_,i)=>({
  x:i/180*120,y:Math.sin(i/180*Math.PI)*14,
  tx:1,ty:0,nx:0,ny:1
 }))}
 const host={canvas:{},c,i:9,t:1,gameplay:true,
  materialScale:1,coreScale:1,liveParts:[part],
  setGameplayTransform(){}}
 const scene=registration.instantiate(10,host)
 scene.draw(.033)
 const first=ops.map(({x,y})=>[x,y])
 assert.ok(first.length>=160,'full source grain count, not an SVG imitation with 16–42 fixed dots')
 ops.length=0
 scene.draw(.30)
 const second=ops.map(({x,y})=>[x,y])
 assert.equal(second.length,first.length)
 assert.notDeepEqual(second.slice(0,30),first.slice(0,30),'same stroke animates the original source particle paths')
})
test('STAX adapter supplies all seven geometry outlines to original #10 with one canvas',()=>{
 assert.match(adapter,/GOLDEN_POLLEN_ID=10/)
 assert.match(adapter,/REGISTRY_URL=/)
 assert.match(adapter,/registry\.instantiate\(GOLDEN_POLLEN_ID,host\)/)
 assert.match(adapter,/scene\.draw\(dt\)/)
 assert.match(adapter,/requestAnimationFrame/)
 assert.match(adapter,/const scenes=new Map/)
 assert.match(adapter,/const canvasRef=useRef<HTMLCanvasElement>/)
 assert.match(adapter,/const scale=Math\.min\(pixelW\/camera\.width,pixelH\/camera\.height\)/)
 for(const kind of ['circle','oval','square','rectangle','triangle','diamond','hexagon'])
  assert.match(adapter,new RegExp("'"+kind+"'"))
 assert.match(adapter,/path\.getTotalLength\(\)/)
 assert.match(adapter,/getPointAtLength/)
 assert.match(adapter,/prefers-reduced-motion/)
 assert.match(adapter,/if\(atom\.omitted\)continue/)
 assert.match(adapter,/if\(document\.hidden\)return/)
})
test('real animation replaces static imitation only after first painted frame',()=>{
 assert.match(board,/<LetterzGoldenPollenCanvas/)
 assert.match(board,/setPollenAnimated/)
 assert.match(board,/data-original-pollen=\{pollenAnimated\?'true':'false'\}/)
 assert.match(board,/animated=\{pollenAnimated\}/)
 assert.match(materials,/if\(animated\)return null/)
 assert.match(css,/stax-letterz-original-pollen-canvas/)
 assert.match(css,/pointer-events:none!important/)
 assert.match(css,/data-original-pollen='true'/)
 assert.match(css,/data-omitted='false'/)
 assert.match(board,/const KEY='stax-free-molecules-v2'/)
})
