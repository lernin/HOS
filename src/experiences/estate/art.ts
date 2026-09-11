import * as T from 'three'
import { FLOOR } from './plan'
import type { EstateKit } from './kit'

export type EstateArtChoice={id:string;name:string;style:string;palette:string[];seed:number}

const fallback:EstateArtChoice[]=[
  {id:'estate-art-02',name:'Quiet Current',style:'Coastal',palette:['#efe8dc','#d5c2a7','#7697a0','#315a67','#1d3338'],seed:234},
  {id:'estate-art-16',name:'Measured Calm',style:'Geometry',palette:['#ece7dc','#c8b8a1','#8c8172','#4f4a43','#171b18'],seed:1592},
  {id:'estate-art-29',name:'Seed and Stone',style:'Organic',palette:['#e8e2d9','#b7c4b2','#6f856f','#425343','#1d2922'],seed:2853},
]

function random(seed:number){let s=seed>>>0;return()=>((s=Math.imul(1664525,s)+1013904223>>>0)/4294967296)}
function paint(canvas:HTMLCanvasElement,art:EstateArtChoice){
  const ctx=canvas.getContext('2d')!,w=canvas.width,h=canvas.height,r=random(art.seed),p=art.palette.length>=5?art.palette:fallback[0].palette
  ctx.fillStyle=p[0];ctx.fillRect(0,0,w,h)
  if(art.style==='Coastal'||art.style==='Horizon'){
    const bands=[p[0],p[2],p[3],p[1]];let y=0
    for(let i=0;i<4;i++){const hh=h*[.42,.22,.12,.3][i];ctx.fillStyle=bands[i];ctx.globalAlpha=i===1?.84:1;ctx.beginPath();ctx.moveTo(0,y);for(let x=0;x<=w;x+=36)ctx.lineTo(x,y+Math.sin(x*.014+i+r())*(10+i*4));ctx.lineTo(w,y+hh);ctx.lineTo(0,y+hh);ctx.closePath();ctx.fill();y+=hh*.85}
  }else if(art.style==='Geometry'||art.style==='Monolith'){
    for(let i=0;i<9;i++){ctx.globalAlpha=.3+r()*.45;ctx.fillStyle=p[1+i%4];const ww=w*(.14+r()*.28),hh=h*(.08+r()*.26),x=r()*(w-ww),y=r()*(h-hh);ctx.fillRect(x,y,ww,hh)}
  }else if(art.style==='Ink study'||art.style==='Line work'){
    ctx.strokeStyle=p[4];ctx.lineCap='round';for(let j=0;j<5;j++){ctx.globalAlpha=.2+j*.1;ctx.lineWidth=4+j*5;ctx.beginPath();let x=w*(.12+r()*.16),y=h*(.16+r()*.66);ctx.moveTo(x,y);for(let i=0;i<8;i++){x+=w*(.07+r()*.08);y+=h*(-.07+r()*.14);ctx.lineTo(x,y)}ctx.stroke()}
  }else{
    for(let i=0;i<12;i++){ctx.globalAlpha=.16+r()*.34;ctx.fillStyle=p[1+i%4];ctx.beginPath();ctx.ellipse(w*(.12+r()*.76),h*(.1+r()*.8),w*(.04+r()*.13),h*(.04+r()*.12),(r()-.5)*2,0,Math.PI*2);ctx.fill()}
  }
  ctx.globalAlpha=.08;ctx.fillStyle='#fff';for(let i=0;i<90;i++)ctx.fillRect(r()*w,r()*h,1+r()*2,1+r()*2);ctx.globalAlpha=1
}

function chosenArt(){
  let favs:EstateArtChoice[]=[];let active:EstateArtChoice|null=null
  try{favs=JSON.parse(localStorage.getItem('materials-studio-art-favorites-v1')||'[]')}catch{}
  try{active=JSON.parse(localStorage.getItem('ocean-estate-active-art-v1')||'null')}catch{}
  const result:EstateArtChoice[]=[]
  const add=(a:EstateArtChoice|null|undefined)=>{if(a&&Array.isArray(a.palette)&&!result.some(x=>x.id===a.id))result.push(a)}
  add(active);favs.forEach(add);fallback.forEach(add);return result.slice(0,3)
}

export function decorateArt(k:EstateKit){
  const old=[[-5.78,11],[19.78,25],[24.23,0]]
  for(const child of [...k.root.children])if(child instanceof T.Group&&old.some(([x,z])=>Math.abs(child.position.x-x)<.02&&Math.abs(child.position.z-z)<.02&&Math.abs(child.position.y-(FLOOR+2.2))<.03))k.root.remove(child)
  const resources:{geometry:T.BufferGeometry;material:T.Material;texture:T.Texture}[]=[]
  const placements=[{x:-5.78,z:11,w:1.55,h:1.9,y:FLOOR+2.18},{x:19.78,z:25,w:2.05,h:1.55,y:FLOOR+2.18},{x:24.23,z:0,w:1.48,h:1.86,y:FLOOR+2.2}]
  const selected=chosenArt()
  placements.forEach((p,i)=>{const g=k.group(p.x,p.y,p.z,Math.PI/2),art=selected[i%selected.length];k.box(0,0,0,p.w+.2,p.h+.2,.085,'walnut',g,.035);k.box(0,0,.055,p.w+.06,p.h+.06,.035,'linen',g,.012);const canvas=document.createElement('canvas');canvas.width=640;canvas.height=800;paint(canvas,art);const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=4;const geometry=new T.PlaneGeometry(p.w,p.h),material=new T.MeshStandardMaterial({map:texture,roughness:.72,metalness:0});const mesh=new T.Mesh(geometry,material);mesh.position.z=.076;g.add(mesh);resources.push({geometry,material,texture})})
  return ()=>resources.forEach(r=>{r.geometry.dispose();r.material.dispose();r.texture.dispose()})
}
