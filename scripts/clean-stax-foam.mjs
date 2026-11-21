import {mkdir} from 'node:fs/promises'
import {dirname,join} from 'node:path'
import {fileURLToPath} from 'node:url'
import sharp from 'sharp'

// The original seven photographed WebPs remain untouched. Build a second set
// with the pale premultiplied-alpha fringe gently removed at image boundaries.
// Run before development and build, so the app always uses clean transparency.
const root=join(dirname(fileURLToPath(import.meta.url)),'..')
const sourceDir=join(root,'public/stax-foam/chips')
const cleanDir=join(root,'public/stax-foam/cleaned')
const kinds=['circle','triangle','square','rectangle','diamond','hexagon','oval']

function cleanEdgePixels(data,width,height){
 const output=Buffer.from(data)
 const at=(x,y)=>(y*width+x)*4
 const opaqueInside=(x,y)=>{
  if(x<=0||y<=0||x>=width-1||y>=height-1)return false
  const i=at(x,y)
  return data[i+3]>=245&&
   data[at(x-1,y)+3]>=235&&data[at(x+1,y)+3]>=235&&
   data[at(x,y-1)+3]>=235&&data[at(x,y+1)+3]>=235
 }
 let adjusted=0
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=at(x,y),a=data[i+3]
  if(a===0)continue
  let touchesClear=false
  for(let dy=-2;dy<=2&&!touchesClear;dy++)
   for(let dx=-2;dx<=2;dx++){
    const nx=x+dx,ny=y+dy
    if(nx<0||ny<0||nx>=width||ny>=height||data[at(nx,ny)+3]<18){
     touchesClear=true;break
    }
   }
  if(a>=245&&!touchesClear)continue
  let sample=-1
  for(let radius=1;radius<=7&&sample<0;radius++)
   for(let dy=-radius;dy<=radius&&sample<0;dy++)
    for(let dx=-radius;dx<=radius;dx++){
     if(Math.max(Math.abs(dx),Math.abs(dy))!==radius)continue
     const nx=x+dx,ny=y+dy
     if(opaqueInside(nx,ny)){sample=at(nx,ny);break}
    }
  if(sample<0)continue
  if(a<245){
   // Replace edge RGB with the nearby real foam colour, not the white matte.
   for(let channel=0;channel<3;channel++)output[i+channel]=data[sample+channel]
   output[i+3]=a<20?0:Math.round(a*(a<180?.82:.96))
   adjusted++
  }else if(touchesClear){
   // Also handle almost-opaque pale pixels directly against transparency.
   const edgeMin=Math.min(data[i],data[i+1],data[i+2])
   const insideMin=Math.min(data[sample],data[sample+1],data[sample+2])
   if(edgeMin>190&&edgeMin>insideMin+35){
    for(let channel=0;channel<3;channel++)
     output[i+channel]=Math.round(data[i+channel]*.15+data[sample+channel]*.85)
    adjusted++
   }
  }
 }
 return {output,adjusted}
}

await mkdir(cleanDir,{recursive:true})
for(const kind of kinds){
 const source=join(sourceDir,kind+'.webp')
 const target=join(cleanDir,kind+'.webp')
 const {data,info}=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true})
 if(info.channels!==4)throw new Error('Expected RGBA foam chip: '+kind)
 const {output,adjusted}=cleanEdgePixels(data,info.width,info.height)
 await sharp(output,{raw:{width:info.width,height:info.height,channels:4}})
  .webp({lossless:true,effort:4}).toFile(target)
 console.log('Cleaned foam '+kind+': '+adjusted+' fringe pixels')
}
