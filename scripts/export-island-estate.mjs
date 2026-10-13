import { build } from 'esbuild'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

// Three's browser exporter needs the FileReader contract to assemble GLB chunks.
globalThis.FileReader ??= class {
  result = null
  onloadend = null
  async readAsArrayBuffer(blob) { this.result = await blob.arrayBuffer(); this.onloadend?.() }
  async readAsDataURL(blob) {
    this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`
    this.onloadend?.()
  }
}

const temporary = await mkdtemp(path.resolve('node_modules/.island-export-'))
let model
try {
  const outfile = path.join(temporary,'entry.mjs')
  await build({entryPoints:['scripts/island-estate-model-entry.ts'],outfile,bundle:true,platform:'node',format:'esm',packages:'external'})
  model = (await import(pathToFileURL(outfile).href)).buildEstateModel()
  const inventory = model.kit.root.children.map(node => ({
    name:node.name || node.material?.name || node.material?.color?.getHexString(),
    vertices:node.geometry?.getAttribute('position')?.count || 0,
  }))
  console.log('Mesh inventory:',JSON.stringify(inventory.reduce((result,item)=>{
    const old=result[item.name]||{count:0,vertices:0}
    result[item.name]={count:old.count+1,vertices:old.vertices+item.vertices};return result
  },{})))
  const buffer = await new GLTFExporter().parseAsync(model.kit.root,{binary:true,onlyVisible:true,maxTextureSize:1024})
  const output = path.resolve('public/assets/island-estate/structure.glb')
  await mkdir(path.dirname(output),{recursive:true})
  await writeFile(output,Buffer.from(buffer))
  console.log(JSON.stringify({output,bytes:buffer.byteLength,parts:model.kit.root.children.length}))
} finally {
  model?.kit.dispose()
  await rm(temporary,{recursive:true,force:true})
}
