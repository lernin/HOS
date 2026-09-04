// Reproducible download of the selected CC0 Quaternius models; no Blender required.
const fs = require('node:fs/promises')
const path = require('node:path')
const { promisify } = require('node:util')
const exec = promisify(require('node:child_process').execFile)
const sharp = require('sharp')
const assets = [['tree','QVOop92WmG'],['tree-b','YWjGDJ9F7g'],['pine','igSu0cPoBz'],['bush','U1ymDy8tbY'],['fern','jqcanvH7D6'],['grass','vUJjrRsFp4'],['rock','KZdEP3uUpa'],['clover','IQ9NVyVpUw']]
const root = path.resolve('public/woodland')
async function get(url) {
  const {stdout} = await exec('curl',['-sSL','--fail','--compressed','--max-time','60',url],{encoding:'buffer',maxBuffer:25*1024*1024})
  return stdout
}
async function optimize(b) {
  if (b.toString('ascii',0,4)!=='glTF' || b.readUInt32LE(8)!==b.length) throw Error('Invalid GLB')
  const jl=b.readUInt32LE(12), j=JSON.parse(b.subarray(20,20+jl)), bin=b.subarray(28+jl)
  const imageViews=new Map((j.images||[]).map(i=>[i.bufferView,i]))
  const parts=[]; let offset=0
  for(let n=0;n<j.bufferViews.length;n++) {
    const view=j.bufferViews[n]; let bytes=bin.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength)
    if(imageViews.has(n)) { bytes=await sharp(bytes).resize({width:512,height:512,fit:'inside',withoutEnlargement:true}).png({compressionLevel:9}).toBuffer(); imageViews.get(n).mimeType='image/png' }
    view.byteOffset=offset;view.byteLength=bytes.length;parts.push(bytes);offset+=bytes.length
    const pad=(4-offset%4)%4;parts.push(Buffer.alloc(pad));offset+=pad
  }
  for(const m of j.materials||[]) { if(m.pbrMetallicRoughness)m.pbrMetallicRoughness.metallicFactor=0; if(m.alphaMode==='BLEND'){m.alphaMode='MASK';m.alphaCutoff=.4;m.doubleSided=true} }
  j.buffers[0].byteLength=offset
  let json=Buffer.from(JSON.stringify(j));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)])
  const header=Buffer.alloc(20);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+offset,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16)
  const bh=Buffer.alloc(8);bh.writeUInt32LE(offset);bh.writeUInt32LE(0x004e4942,4)
  return Buffer.concat([header,json,bh,...parts])
}
async function run([name,id]) {
  const page=`https://poly.pizza/m/${id}`, html=(await get(page)).toString()
  const match=html.match(/https:\/\/static\.poly\.pizza\/[^"<> ]+\.glb\.br/)
  if(!match)throw Error(`No public GLB for ${id}`)
  const bytes=await optimize(await get(match[0]));await fs.writeFile(path.join(root,`${name}.glb`),bytes)
  console.log(name,bytes.length)
  return {name,source:page,url:match[0],author:'Quaternius',license:'CC0-1.0',bytes:bytes.length}
}
(async()=>{await fs.mkdir(root,{recursive:true});const credits=[];for(let i=0;i<assets.length;i+=4)credits.push(...await Promise.all(assets.slice(i,i+4).map(run)));await fs.writeFile(path.join(root,'models.json'),JSON.stringify(credits,null,2)+'\n')})().catch(e=>{console.error(e.message);process.exitCode=1})
