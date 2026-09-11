import * as T from 'three'
import { FLOOR } from './plan'
import type { EstateKit } from './kit'

export type EstateArtChoice={
  id:string
  title:string
  artist:string
  date:string
  museum:string
  image:string
  source:string
  ratio:number
}

const catalog:EstateArtChoice[]=[
  {id:'museum-wave',title:'Under the Wave off Kanagawa (The Great Wave)',artist:'Katsushika Hokusai',date:'ca. 1830–32',museum:'The Met',ratio:1.472,image:'https://collectionapi.metmuseum.org/api/collection/v1/iiif/45434/134438/main-image',source:'https://www.metmuseum.org/art/collection/search/45434'},
  {id:'museum-shono',title:'Sudden Shower in Shōno',artist:'Utagawa Hiroshige',date:'ca. 1833–34',museum:'The Met',ratio:1.477,image:'https://collectionapi.metmuseum.org/api/collection/v1/iiif/36967/130851/main-image',source:'https://www.metmuseum.org/art/collection/search/36967'},
  {id:'museum-seine',title:'The Seine at Giverny',artist:'Claude Monet',date:'1897',museum:'National Gallery of Art',ratio:1.239,image:'https://api.nga.gov/iiif/9b536eb8-6b53-42d5-aa3c-5e8b02f0b37a/full/full/0/default.jpg',source:'https://www.nga.gov/artworks/46655-seine-giverny'},
  {id:'museum-garden',title:"The Artist's Garden at Vétheuil",artist:'Claude Monet',date:'1881',museum:'National Gallery of Art',ratio:.808,image:'https://api.nga.gov/iiif/9fc88734-2f9a-4da8-8d46-2b570b201223/full/full/0/default.jpg',source:'https://www.nga.gov/artworks/52189-artists-garden-vetheuil'},
  {id:'museum-parasol',title:'Woman with a Parasol – Madame Monet and Her Son',artist:'Claude Monet',date:'1875',museum:'National Gallery of Art',ratio:.808,image:'https://api.nga.gov/iiif/99758d9d-c10b-4d02-a198-7e49afb1f3a6/full/full/0/default.jpg',source:'https://www.nga.gov/artworks/61379-woman-parasol-madame-monet-and-her-son'},
  {id:'museum-roses',title:'Roses',artist:'Vincent van Gogh',date:'1890',museum:'National Gallery of Art',ratio:1.258,image:'https://api.nga.gov/iiif/bef8c58d-15ae-4649-b2ff-ae0ead24714e/full/full/0/default.jpg',source:'https://www.nga.gov/artworks/72328-roses'},
  {id:'museum-oleanders',title:'Oleanders',artist:'Vincent van Gogh',date:'1888',museum:'The Met',ratio:1.214,image:'https://collectionapi.metmuseum.org/api/collection/v1/iiif/436530/796038/main-image',source:'https://www.metmuseum.org/art/collection/search/436530'},
  {id:'museum-cezanne',title:'Mont Sainte-Victoire and the Viaduct of the Arc River Valley',artist:'Paul Cézanne',date:'1882–85',museum:'The Met',ratio:1.244,image:'https://collectionapi.metmuseum.org/api/collection/v1/iiif/435877/2006313/main-image',source:'https://www.metmuseum.org/art/collection/search/435877'},
  {id:'museum-breezing',title:'Breezing Up (A Fair Wind)',artist:'Winslow Homer',date:'1873–1876',museum:'National Gallery of Art',ratio:1.587,image:'https://api.nga.gov/iiif/406b5d56-d196-4bb0-b2e0-5a2f6fd52d0a/full/full/0/default.jpg',source:'https://www.nga.gov/artworks/30228-breezing-fair-wind'},
  {id:'museum-simplon',title:'Simplon Pass',artist:'John Singer Sargent',date:'1911',museum:'National Gallery of Art',ratio:1.294,image:'https://api.nga.gov/iiif/482e9978-5e15-4947-bf8b-67275347b13d/full/full/0/default.jpg',source:'https://www.nga.gov/artworks/166471-simplon-pass'},
  {id:'museum-still-life',title:'Still Life',artist:'Henri Fantin-Latour',date:'1866',museum:'National Gallery of Art',ratio:1.239,image:'https://api.nga.gov/iiif/d038e9a3-c6f1-459c-9662-522288a2f720/full/full/0/default.jpg',source:'https://www.nga.gov/artworks/46621-still-life'},
  {id:'museum-redon',title:'Flowers in a Vase',artist:'Odilon Redon',date:'c. 1910',museum:'National Gallery of Art',ratio:.705,image:'https://api.nga.gov/iiif/f6d58869-3d3a-480d-bf1b-0eeddee012a3/full/full/0/default.jpg',source:'https://www.nga.gov/artworks/52200-flowers-vase'},
]

const byId=new Map(catalog.map(a=>[a.id,a]))
const defaults=['museum-wave','museum-still-life','museum-roses'].map(id=>byId.get(id)!)

function storedId(value:unknown){
  if(typeof value==='string')return value
  if(value&&typeof value==='object'&&'id' in value&&typeof (value as {id?:unknown}).id==='string')return (value as {id:string}).id
  return null
}

function chosenArt(){
  const ids:string[]=[]
  try{
    const value=JSON.parse(localStorage.getItem('ocean-estate-active-art-v1')||'null')
    const id=storedId(value);if(id&&byId.has(id))ids.push(id)
  }catch{}
  try{
    const value=JSON.parse(localStorage.getItem('materials-studio-art-favorites-v1')||'[]')
    if(Array.isArray(value))for(const item of value){const id=storedId(item);if(id&&byId.has(id)&&!ids.includes(id))ids.push(id)}
  }catch{}
  for(const art of defaults)if(!ids.includes(art.id))ids.push(art.id)
  return ids.slice(0,3).map(id=>byId.get(id)!)
}

function removeLegacySculptures(k:EstateKit){
  const old=[[-5.78,11],[19.78,25],[24.23,0]]
  for(const child of [...k.root.children]){
    if(!(child instanceof T.Group))continue
    if(old.some(([x,z])=>Math.abs(child.position.x-x)<.02&&Math.abs(child.position.z-z)<.02&&Math.abs(child.position.y-(FLOOR+2.2))<.03))k.root.remove(child)
  }
}

function fit(ratio:number,maxW:number,maxH:number){
  let w=maxW,h=w/ratio
  if(h>maxH){h=maxH;w=h*ratio}
  return {w,h}
}

export function decorateArt(scene:T.Scene,k:EstateKit){
  removeLegacySculptures(k)
  const collection=new T.Group();collection.name='Ocean Estate museum art';scene.add(collection)
  const loader=new T.TextureLoader();loader.setCrossOrigin('anonymous')
  const geometries:T.BufferGeometry[]=[],materials:T.Material[]=[],textures:T.Texture[]=[],lights:T.Light[]=[]
  const placements=[
    {x:-5.78,z:11,y:FLOOR+2.25,maxW:2.28,maxH:1.58},
    {x:19.78,z:25,y:FLOOR+2.24,maxW:1.92,maxH:1.50},
    {x:24.23,z:0,y:FLOOR+2.24,maxW:1.86,maxH:1.48},
  ]
  const selected=chosenArt()

  placements.forEach((p,i)=>{
    const art=selected[i]||defaults[i]
    const {w,h}=fit(art.ratio,p.maxW,p.maxH)
    const g=new T.Group();g.position.set(p.x,p.y,p.z);g.rotation.y=Math.PI/2;collection.add(g)

    const frameGeometry=new T.BoxGeometry(w+.20,h+.20,.075),frameMaterial=new T.MeshStandardMaterial({color:'#5c432f',roughness:.48,metalness:.04})
    const frame=new T.Mesh(frameGeometry,frameMaterial);g.add(frame);geometries.push(frameGeometry);materials.push(frameMaterial)

    const matGeometry=new T.PlaneGeometry(w+.075,h+.075),matMaterial=new T.MeshStandardMaterial({color:'#e7dece',roughness:.92,metalness:0,side:T.DoubleSide})
    const mat=new T.Mesh(matGeometry,matMaterial);mat.position.z=.041;g.add(mat);geometries.push(matGeometry);materials.push(matMaterial)

    const texture=loader.load(art.image,loaded=>{loaded.colorSpace=T.SRGBColorSpace;loaded.anisotropy=4;loaded.needsUpdate=true},undefined,()=>console.warn(`Ocean Estate art image failed: ${art.title}`))
    texture.colorSpace=T.SRGBColorSpace;textures.push(texture)
    const artGeometry=new T.PlaneGeometry(w,h),artMaterial=new T.MeshStandardMaterial({map:texture,roughness:.76,metalness:0,side:T.DoubleSide})
    const artMesh=new T.Mesh(artGeometry,artMaterial);artMesh.position.z=.054;artMesh.name=`${art.title} — ${art.artist}`;g.add(artMesh);geometries.push(artGeometry);materials.push(artMaterial)

    const barW=Math.min(.78,w*.48),barGeometry=new T.BoxGeometry(barW,.055,.07),barMaterial=new T.MeshStandardMaterial({color:'#6b563d',roughness:.32,metalness:.7})
    const bar=new T.Mesh(barGeometry,barMaterial);bar.position.set(0,h/2+.16,.13);g.add(bar);geometries.push(barGeometry);materials.push(barMaterial)
    const glowGeometry=new T.BoxGeometry(barW*.82,.018,.024),glowMaterial=new T.MeshStandardMaterial({color:'#ffe3b3',emissive:'#ffce83',emissiveIntensity:2.6,roughness:.5})
    const glow=new T.Mesh(glowGeometry,glowMaterial);glow.position.set(0,h/2+.132,.169);g.add(glow);geometries.push(glowGeometry);materials.push(glowMaterial)

    const target=new T.Object3D();target.position.set(0,0,.07);g.add(target)
    const light=new T.SpotLight('#ffd9a0',10,3.2,Math.PI*.26,.88,2);light.position.set(0,h/2+.16,.42);light.target=target;light.castShadow=false;g.add(light);lights.push(light)
  })

  return ()=>{
    scene.remove(collection)
    lights.forEach(l=>l.dispose?.())
    textures.forEach(t=>t.dispose())
    materials.forEach(m=>m.dispose())
    geometries.forEach(g=>g.dispose())
    collection.clear()
  }
}
