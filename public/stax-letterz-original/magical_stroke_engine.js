/* Exact 50 + 25 original lab renderers embedded in Champions preview strips.
 * Code source: experiments/letterz-magical-strokes-50/index.html and
 * experiments/letterz-magical-strokes-75/curation.js.
 * Shared source algorithms for lab, gallery and handwriting.
 * Only geometry, progress, transform and lifecycle vary between contexts.
 */
(function(){
"use strict";
const effects=[
["Electric Filament","Living current with tiny branching arcs","Electric","#57dcff","#a0f7ff","#eaffff"],
["Particle Handwriting","Hundreds of independent luminous grains","Particles","#68d8ff","#bafff2","#ffffff"],
["Starlight Dust","Individual stars twinkle asynchronously","Starlight","#b8a5ff","#fff2c2","#ffffff"],
["Liquid Light","Narrow streams curl through the stroke","Liquid","#46eac9","#9fdaff","#e9ffff"],
["Aurora Thread","Layered spectral filaments drift softly","Aurora","#6affbb","#b28cff","#fbebff"],
["Firefly Drift","Little lights gather and wander apart","Fireflies","#78ffa8","#efffa5","#ffffff"],
["Ion Sparks","Momentary charged sparks jump locally","Electric","#63baff","#e4faff","#ffffff"],
["Comet River","Tiny radiant comets with fading tails","Comets","#75b4ff","#c8d3ff","#fffcd1"],
["Pearl Sheen","Micro-pearls ripple in iridescent light","Pearlescent","#e3a9ff","#95ecee","#ffffff"],
["Golden Pollen","Warm floating grains on a narrow trail","Pollen","#ffc06b","#ffe29e","#fff9d9"],
["Plasma Braid","Two luminous strands weave in motion","Plasma","#76efff","#fa9fff","#ffffff"],
["Frost Crystals","Tiny crystalline branches grow and fade","Frost","#a3dfff","#e7faff","#ffffff"],
["Rose Embers","Soft incandescent sparks drift upward","Embers","#ff7b6e","#ffca80","#fff4d5"],
["Molecular Chain","Minute beads and living connected links","Molecular","#a0d8ff","#c4ffde","#ffffff"],
["Vapor Silk","Fine wavering luminous smoke threads","Silk","#89a9ff","#e6b8ff","#f8ffff"],
["Bio Sparkle","Plankton-like specks swim inside text","Bioluminescence","#5bffc3","#c5ffe8","#faffda"],
["Prismatic Flow","Rainbow microcurrents travel together","Spectrum","#78eeed","#d7acff","#fff2b8"],
["Micro Vortices","Whirlpools spin around tiny stroke knots","Vortices","#61e3ff","#a9c2ff","#ffffff"],
["Whispering Mist","Delicate wisps peel off and dissolve","Mist","#a3c5ff","#e4dcff","#ffffff"],
["Constellation Script","Star nodes form a delicate connected line","Constellations","#97b8ff","#f8e6b3","#ffffff"],
["Magnetic Motes","Small grains orbit shifting attractors","Magnetism","#81fff1","#a2bfff","#fffbe5"],
["Micro Fireworks","Pinprick sparks bloom and disappear","Fireworks","#ffc87d","#f5abff","#ffffff"],
["Moon Dust","Cool silver grains glitter almost silently","Moonlight","#c0cfff","#e3f2ff","#ffffff"],
["Traveling Glow","Gentle independent light waves run along","Waves","#6feadf","#ffd38c","#ffffff"],
["Enchanted Ink","Tiny stars, filaments and motes combined","Hybrid","#7bfbec","#b6a5ff","#fff6cf"]
,
["Prismatic River","Rainbow color actually travels through ink","Chromatic","#fc6acb","#64ddfa","#fff4a1"],
["Neon Roulette","Rapid shifting multicolor neon current","Chromatic","#ff5ad0","#b7ff61","#49e8ff"],
["Candy Flux","Warm and cool bands trade places","Chromatic","#ff9acb","#ffe394","#7ff2e7"],
["Spectrum Braid","Colorful fine filaments twist together","Chromatic","#a3fb72","#ff81d1","#83b9ff"],
["Prism Cascade","Moving waves of spectral micro-grains","Chromatic","#61eeff","#febb73","#da87ff"],
["Hypercolor Reactor","Glowing hue pulses with spark ejections","Chromatic","#ff69bb","#60ffd0","#fff59d"],
["Liquid Rainbow","Fluid dye streaks meander through ink","Chromatic","#54e2ff","#ff71be","#ffee82"],
["Disco Starlight","Rainbow stars twinkle and circulate","Chromatic","#fc86ff","#8efbdb","#ffe17d"],
["Luminous Pollen","Multicolor floating pollen escapes","Escape","#89fbce","#f8d57b","#ff9dd1"],
["Chromatic Fire","Iridescent flames lick the fine stroke","Escape","#ff9d4d","#77edfa","#f684db"],
["Holographic Fringe","Spectral shimmer rolls past both edges","Surface","#62f2ef","#c396ff","#fff4b4"],
["Orbiting Moons","Tiny pearls orbit the fixed letter line","Escape","#a5dbff","#f5c3ff","#fff8d2"],
["Solar Winds","Little currents trail into surrounding air","Escape","#81f5ff","#e0afff","#ffdcaf"],
["Pixie Halo","Bright starlets appear beyond the border","Escape","#9eeaff","#ffbbe3","#fff7c9"],
["Fairy Vortices","Small colorful spirals orbit the core","Escape","#91ffa3","#8ec3ff","#ffb1fa"],
["Comet Sprays","Miniature multicolor meteors escape","Escape","#a7e3ff","#ffd2a1","#fa9de5"],
["Ribbon Escape","Silken color ribbons peel and rejoin","Filament","#8dedeb","#f4a0ff","#fff0ae"],
["Living Beads","Liquid droplets travel and softly merge","Liquid","#7bf5c8","#ffb5f5","#ffee9e"],
["Electric Confetti","Little bursts of sparks in many hues","Sparks","#ffe58d","#fb92dd","#7fe9ff"],
["Coral Bloom","Tiny branching structures grow and fade","Growth","#a1ffdb","#caa2ff","#ffca9c"],
["Plasma Jelly","Luminous micro-blob currents","Liquid","#8ef4ff","#f78dd9","#ffd78d"],
["Silk Smoke","Thin smoke wisps weave outside the core","Filament","#a4bcff","#f3b5ef","#b5ffed"],
["Neon Constellation","Moving stars link up around the line","Constellation","#a3d8ff","#ffc3e3","#fff6b8"],
["Prism Fireworks","Rainbow pinprick bursts come and go","Sparks","#ff86c2","#86ffe5","#ffd47f"],
["Grand Enchantment","Color rivers, sparks, wisps and starlight","Hybrid","#9df7e5","#f2a0ff","#ffe3a0"]];
const glyphs={
"S":["M 48 -46 C 21 -61 -39 -57 -45 -23 C -54 8 46 -2 42 29 C 39 62 -22 63 -49 46"],
"X":["M -49 -51 L 48 51","M 48 -51 L -49 51"],
"a":["M 23 -32 C 3 -57 -42 -36 -43 -3 C -45 29 -3 46 24 14 C 34 1 28 -31 23 -32","M 26 -34 C 21 -11 19 17 36 34"],
"ㄱ":["M -50 -42 L 48 -42 L 48 50"]
};

const TAU=Math.PI*2,PI=Math.PI,fract=x=>x-Math.floor(x),clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),lerp=(a,b,t)=>a+(b-a)*t;
function hash(v){return fract(Math.sin(v*127.1+78.233)*43758.5453)}
function rgba(h,a){return "rgba("+parseInt(h.slice(1,3),16)+","+parseInt(h.slice(3,5),16)+","+parseInt(h.slice(5,7),16)+","+clamp(a,0,1)+")"}

let activeLetter="S";
const sampler=document.createElementNS("http://www.w3.org/2000/svg","svg");sampler.setAttribute("width","0");sampler.setAttribute("height","0");sampler.style.cssText="position:absolute;overflow:hidden;left:-9999px;top:-9999px";document.body.appendChild(sampler);
const sampled={};
function buildGlyph(letter){if(sampled[letter])return sampled[letter];let parts=[];for(let d of glyphs[letter]){let element=document.createElementNS("http://www.w3.org/2000/svg","path");element.setAttribute("d",d);sampler.appendChild(element);let length=element.getTotalLength(),count=Math.max(110,Math.ceil(length*1.8)),pts=[];for(let i=0;i<=count;i++){let pos=element.getPointAtLength(length*i/count),prev=element.getPointAtLength(Math.max(0,length*i/count-.7)),next=element.getPointAtLength(Math.min(length,length*i/count+.7)),dx=next.x-prev.x,dy=next.y-prev.y,m=Math.hypot(dx,dy)||1;pts.push({x:pos.x,y:pos.y,tx:dx/m,ty:dy/m,nx:-dy/m,ny:dx/m})}parts.push({pts:pts,path:new Path2D(d)})}sampled[letter]=parts;return parts}
function at(part,u){if(part.revealed!==undefined&&u>part.revealed)return {x:NaN,y:NaN,nx:0,ny:0,tx:0,ty:0};let pts=part.pts,f=clamp(u,0,.999999)* (pts.length-1),i=Math.floor(f),a=pts[i],b=pts[i+1],z=f-i;return {x:lerp(a.x,b.x,z),y:lerp(a.y,b.y,z),nx:lerp(a.nx,b.nx,z),ny:lerp(a.ny,b.ny,z),tx:lerp(a.tx,b.tx,z),ty:lerp(a.ty,b.ty,z)}}
function pos(part,u,offset){let p=at(part,u);return {x:p.x+p.nx*offset,y:p.y+p.ny*offset,base:p}}
function dot(c,x,y,r,h,a){if(a<=0||!Number.isFinite(x)||!Number.isFinite(y))return;c.fillStyle=rgba(h,a);c.beginPath();c.arc(x,y,Math.max(.15,r),0,TAU);c.fill()}
function halo(c,x,y,r,h,a){if(a<=0||!Number.isFinite(x)||!Number.isFinite(y))return;let g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,rgba(h,a));g.addColorStop(.33,rgba(h,a*.35));g.addColorStop(1,rgba(h,0));c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2)}
function joinLine(c,coords,h,width,opacity){if(coords.length<2)return;c.beginPath();let started=false;for(const p of coords){if(!Number.isFinite(p.x)||!Number.isFinite(p.y))break;if(!started){c.moveTo(p.x,p.y);started=true}else c.lineTo(p.x,p.y)}if(!started)return;c.lineWidth=width;c.lineCap="round";c.lineJoin="round";c.strokeStyle=rgba(h,opacity);c.stroke()}
function star(c,x,y,r,h,a){if(!Number.isFinite(x)||!Number.isFinite(y))return;c.strokeStyle=rgba(h,a);c.lineWidth=.55;c.beginPath();c.moveTo(x-r,y);c.lineTo(x+r,y);c.moveTo(x,y-r);c.lineTo(x,y+r);c.stroke();dot(c,x,y,.8,h,Math.min(1,a*1.2))}

class Scene{
constructor(canvas,i){this.canvas=canvas;this.i=i;this.c=canvas.getContext("2d",{alpha:false});this.t=hash(i+6)*8;this.visible=false;this.resize();this.draw(0)}
resize(){let b=this.canvas.getBoundingClientRect(),d=Math.min(window.devicePixelRatio||1,1.6);this.canvas.width=Math.round(Math.max(1,b.width)*d);this.canvas.height=Math.round(Math.max(1,b.height)*d);this.c.setTransform(this.canvas.width/340,0,0,this.canvas.height/160,0,0)}
coords(part){return part}
draw(delta){this.t+=delta;const t=this.t,i=this.i,e=effects[i],cs=e.slice(3),c=this.c,parts=this.liveParts||buildGlyph(activeLetter);
if(this.gameplay){this.setGameplayTransform(c)}else{
 c.setTransform(this.canvas.width/340,0,0,this.canvas.height/160,0,0);
 c.fillStyle="#07101e";c.fillRect(0,0,340,160);
}
c.save();if(!this.gameplay){c.translate(170,80);c.scale(1.12,1.12)}
const coreWidth=this.gameplay?this.coreScale/this.materialScale:1;
for(const part of parts){c.save();c.lineCap="round";c.lineJoin="round";c.shadowBlur=11;c.shadowColor=cs[0];c.lineWidth=8.8*coreWidth;c.strokeStyle=rgba(cs[0],.23);c.stroke(part.revealPath||part.path);c.shadowBlur=0;c.lineWidth=5.4*coreWidth;c.strokeStyle=rgba(cs[0],.30);c.stroke(part.revealPath||part.path);c.lineWidth=2.1*coreWidth;c.strokeStyle=rgba(cs[1],.42);c.stroke(part.revealPath||part.path);c.restore()}
c.globalCompositeOperation="lighter";
const forpart=(fn)=>parts.forEach((part,k)=>fn(part,k));
const flowing=(count,speed,spread,size,opacity,colors=cs,kind="dot")=>{for(let j=0;j<count;j++){let k=j%parts.length,part=parts[k],seed=hash(j*7.131+i*31.47),u=fract(seed+t*speed*(.65+hash(j*13+i)*.7)),off=spread*Math.sin(j*9.4+t*(.9+hash(j+19)*1.8)),p=pos(part,u,off),a=opacity*(.45+.55*Math.sin(j*13.7+t*2.1)**2),r=size*(.7+hash(j*43+2)*.9);if(kind==="star"){if(j%7===0)star(c,p.x,p.y,r*2,colors[j%colors.length],a);else dot(c,p.x,p.y,r*.45,colors[j%colors.length],a)}else{dot(c,p.x,p.y,r,colors[j%colors.length],a);if(j%11===0)halo(c,p.x,p.y,3+r*2,colors[j%colors.length],a*.27)}}};
const filament=(n,amp,freq,speed,width,alpha,palette=cs)=>{forpart((part,k)=>{for(let f=0;f<n;f++){let list=[],samples=115;for(let j=0;j<=samples;j++){let u=j/samples,p=at(part,u),o=amp*Math.sin(u*freq+t*speed+f*TAU/n)+amp*.32*Math.sin(u*freq*2.2-t*speed*.77+f*1.3);list.push({x:p.x+p.nx*o,y:p.y+p.ny*o})}joinLine(c,list,palette[f%palette.length],width,alpha)}})};
const flicker=(count,r=2)=>{for(let j=0;j<count;j++){let part=parts[j%parts.length],u=hash(j*13.47+i*9.4),p=pos(part,u,Math.sin(t*1.4+j*3.2)*1.8),v=Math.pow(Math.max(0,Math.sin(t*(.5+hash(j+7)*2.7)+j*11.38)),7);if(v>.04)star(c,p.x,p.y,r*(.4+v),cs[j%3],v*.85)}};
const sparks=(count,length=11)=>{for(let j=0;j<count;j++){let seed=hash(j*11.9+i*6),part=parts[j%parts.length],cycle=t*(.6+hash(j+3)*1.2)+seed*8,phase=fract(cycle),bright=Math.pow(Math.max(0,1-phase),3);if(bright<.09)continue;let u=hash(j*18.1+i*16.3),p=at(part,u),coords=[{x:p.x,y:p.y}];let dir=j%2?1:-1;for(let z=1;z<=4;z++){let d=dir*length*z/4,o=hash(j*311+z*9+Math.floor(cycle)*5)-.5;coords.push({x:p.x+p.nx*d+p.tx*o*3,y:p.y+p.ny*d+p.ty*o*3})}joinLine(c,coords,cs[j%3],.65,bright*.7);dot(c,p.x,p.y,1.35,cs[2],bright)}};
const burst=(count)=>{for(let j=0;j<count;j++){let age=fract(t*.35+j*.371),part=parts[j%parts.length],p=at(part,hash(j*21+i*19)),a=(1-age)**2;for(let k=0;k<7;k++){let angle=k*TAU/7+hash(j*7+i),r=age*7,xx=p.x+Math.cos(angle)*r,yy=p.y+Math.sin(angle)*r;dot(c,xx,yy,.4+1.1*a,cs[k%3],a*.68)}}};

const RAINBOW=["#ff58ae","#ffab55","#ffe273","#88ff9b","#55ddff","#8c8aff","#e278ff"];
const prismaticCore=(speed=1.2,width=2.8,alpha=.85)=>{forpart(part=>{for(let j=0;j<125;j++){let u=j/125,p=at(part,u),q=at(part,(j+1)/125),hue=((u*640-t*speed*94+7200)%360);c.strokeStyle="hsla("+hue+",96%,67%,"+alpha+")";c.lineWidth=width;c.lineCap="round";c.beginPath();c.moveTo(p.x,p.y);c.lineTo(q.x,q.y);c.stroke()}})};
const colorWisps=(n=12,reach=7,speed=.6)=>{for(let j=0;j<n;j++){let part=parts[j%parts.length],u=fract(hash(j*16.7+i)+t*.02*speed),p=at(part,u),phase=j*2.42+t*(.45+hash(j+6)*.6)*speed,sgn=j%2?1:-1,points=[];for(let z=0;z<14;z++){let v=z/13,off=sgn*reach*v+Math.sin(phase+v*7)*v*2.4,long=v*4.2;points.push({x:p.x+p.nx*off+p.tx*long,y:p.y+p.ny*off+p.ty*long})}joinLine(c,points,RAINBOW[j%7],.44,.19+ .25*Math.sin(phase)**2)}};
const orbitMotes=(n=75,reach=6,speed=1,stars=false)=>{for(let j=0;j<n;j++){let part=parts[j%parts.length],u=hash(j*27.4+i*9),base=at(part,u),phase=t*(.35+hash(j*2+3)*.9)*speed+j*6.79,r=1.8+hash(j*5)*reach,x=base.x+Math.cos(phase)*r,y=base.y+Math.sin(phase)*r,co=RAINBOW[j%7],a=.32+.55*(.5+.5*Math.sin(phase*.63));if(stars&&j%5===0)star(c,x,y,.8+hash(j)*1.5,co,a);else dot(c,x,y,.35+hash(j*3)*.7,co,a)}};
const rainbowComets=(count=24,spread=5)=>{for(let j=0;j<count;j++){let part=parts[j%parts.length],speed=.009+hash(j*11)*.024,u=fract(hash(j*6.5)+t*speed),offset=Math.sin(j*3.3+t)*spread,trail=[];for(let k=8;k>=0;k--){let v=clamp(u-k*.0027,0,1);trail.push(pos(part,v,offset+Math.sin(k*.42+j)*.5))}joinLine(c,trail,RAINBOW[j%7],.65,.26);let p=trail[trail.length-1];dot(c,p.x,p.y,1.05,RAINBOW[j%7],.92);if(j%4===0)halo(c,p.x,p.y,4,RAINBOW[j%7],.26)}};
const rainbowFountains=(count=20,len=10)=>{for(let j=0;j<count;j++){let part=parts[j%parts.length],p=at(part,hash(j*18+i*3)),age=fract(t*(.13+hash(j*7)*.14)+hash(j*19)),direction=j%2?1:-1,fade=Math.pow(1-age,1.2),off=direction*age*len,drift=Math.sin(j*2.1+age*7)*age*2,q={x:p.x+p.nx*off+p.tx*drift,y:p.y+p.ny*off+p.ty*drift},co=RAINBOW[j%7];dot(c,q.x,q.y,.45+fade*.75,co,fade*.8);if(j%8===0)halo(c,q.x,q.y,4,co,fade*.2)}};
const slidingGlints=(count=17,bright=1)=>{for(let j=0;j<count;j++){let part=parts[j%parts.length],u=fract(hash(j*7+i*3)+t*(.012+hash(j+3)*.02)),p=at(part,u),v=Math.pow(Math.abs(Math.sin(t*.85+j*5.1)),3),co=RAINBOW[j%7];star(c,p.x,p.y,(.8+v*2.1)*bright,co,.2+v*.8)}};
const microBlobs=(n=24,reach=3)=>{for(let j=0;j<n;j++){let part=parts[j%parts.length],u=fract(hash(j*7.5+i*6)+t*(.006+.008*hash(j+77))),p=at(part,u),o=Math.sin(t*.6+j)*reach,co=RAINBOW[j%7];halo(c,p.x+p.nx*o,p.y+p.ny*o,2.4+Math.sin(j+t)*1.2+hash(j)*2.2,co,.34);dot(c,p.x+p.nx*o,p.y+p.ny*o,.65,co,.58)}};

switch(i){
case 0:filament(3,1.55,44,1.2,.65,.75);sparks(13,8);flowing(38,.035,1.2,.6,.7);break;
case 1:flowing(330,.005,2.25,.45,.78);flicker(22,1.4);break;
case 2:flowing(85,.003,2.3,.5,.6,cs,"star");flicker(44,2.1);break;
case 3:filament(4,1.4,19,.65,1,.48);flowing(68,.027,1.9,.8,.6);flicker(12,1.2);break;
case 4:filament(5,1.7,29,.48,.65,.63);flowing(32,.014,1.4,.65,.38);break;
case 5:flowing(72,.014,3.4,1.0,.7);for(let j=0;j<17;j++){let part=parts[j%parts.length],u=hash(j*13+i),p=pos(part,u,Math.sin(t*.75+j)* (2+hash(j)*4));halo(c,p.x,p.y,4.8,cs[j%3],.36)}break;
case 6:filament(1,.8,58,2.1,.55,.55);sparks(32,11);flowing(35,.062,1.3,.45,.7);break;
case 7:for(let j=0;j<22;j++){let part=parts[j%parts.length],u=fract(hash(j*17.7)+t*(.038+hash(j*7)*.026)),trail=[];for(let z=9;z>=0;z--){let vv=clamp(u-z*.003,0,1),p=pos(part,vv,Math.sin(j*2+t)*.8);trail.push(p)}joinLine(c,trail,cs[j%3],.75,.24);let p=trail[trail.length-1];halo(c,p.x,p.y,3.8,cs[j%3],.27);dot(c,p.x,p.y,1.1,cs[2],.88)}break;
case 8:filament(3,.9,14,.44,.7,.34);flowing(105,.009,2.2,.55,.64);for(let j=0;j<24;j++){let p=pos(parts[j%parts.length],fract(hash(j*31)+t*.009),Math.sin(t*.42+j)*2);halo(c,p.x,p.y,3.3,cs[j%3],.22)}break;
case 9:flowing(160,.008,2.9,.55,.77);for(let j=0;j<28;j++){let p=at(parts[j%parts.length],hash(j*12+7)),v=fract(t*.2+hash(j*7));dot(c,p.x+p.nx*v*6,p.y+p.ny*v*6,.75,cs[j%3],(1-v)*.53)}break;
case 10:filament(2,2.05,63,1.5,.8,.8,[cs[0],cs[1]]);flowing(48,.035,1.15,.52,.65);sparks(8,5);break;
case 11:for(let j=0;j<48;j++){let part=parts[j%parts.length],p=at(part,hash(j*13.6)),growth=Math.pow(Math.max(0,Math.sin(t*.35+j*.71)),2),reach=1.5+growth*3.6;for(let sign of [-1,1]){let q={x:p.x+p.nx*reach*sign,y:p.y+p.ny*reach*sign};joinLine(c,[p,q],cs[j%3],.47,.25+growth*.5);dot(c,q.x,q.y,.5,cs[2],growth*.6)}}flicker(20,1.5);break;
case 12:flowing(76,.014,2.9,.65,.65);for(let j=0;j<64;j++){let part=parts[j%parts.length],u=hash(j*51+i),p=at(part,u),cycle=fract(t*.23+hash(j*9)),off=cycle*9;dot(c,p.x+p.nx*Math.sin(j)*2+p.tx*off*.4,p.y+p.ny*Math.sin(j)*2-off,.3+(.8*(1-cycle)),cs[j%3],(1-cycle)*.55)}break;
case 13:forpart((part,k)=>{let nodes=[];for(let j=0;j<=34;j++){let p=pos(part,j/34,Math.sin(t*.9+j*.83+k)*1.15);nodes.push(p);dot(c,p.x,p.y,1.1,cs[j%3],.75)}joinLine(c,nodes,cs[0],.55,.4)});flowing(28,.015,1.8,.4,.7);break;
case 14:filament(7,2.1,15,.4,.38,.28);flowing(110,.003,3.8,.45,.26);break;
case 15:flowing(205,.011,2.9,.54,.73);for(let j=0;j<22;j++){let p=pos(parts[j%parts.length],fract(t*.009+hash(j*17)),2*Math.sin(j*1.2+t));halo(c,p.x,p.y,4,cs[j%3],.25)}break;
case 16:filament(7,1.75,39,.7,.37,.58,["#ff8a91","#ffd36b","#fff0a1","#86ffd2","#73c9ff","#a99cff","#fa9eff"]);flowing(45,.026,1.5,.5,.48);break;
case 17:for(let j=0;j<23;j++){let part=parts[j%parts.length],center=at(part,hash(j*13.4)),radius=1.1+hash(j+7)*3.3;for(let k=0;k<5;k++){let a=t*(.55+hash(j*4)*.6)+k*TAU/5+j,xx=center.x+Math.cos(a)*radius,yy=center.y+Math.sin(a)*radius;dot(c,xx,yy,.56,cs[k%3],.49)}}flicker(14,1.3);break;
case 18:filament(4,2.25,13,.3,.35,.23);for(let j=0;j<125;j++){let part=parts[j%parts.length],u=fract(hash(j*9)+t*.002),p=at(part,u),a=Math.sin(t*.5+j*3.8),off=3.3*a;dot(c,p.x+p.nx*off,p.y+p.ny*off,.55,cs[j%3],.16+Math.abs(a)*.3)}break;
case 19:forpart(part=>{let pts=[];for(let j=0;j<=30;j++){let p=pos(part,j/30,Math.sin(j*13)*.75);pts.push(p);dot(c,p.x,p.y,j%5===0?1.2:.47,cs[j%3],j%5===0?.9:.45);if(j%6===0)star(c,p.x,p.y,1.7+Math.abs(Math.sin(t+j))*1.8,cs[2],.3+.5*Math.abs(Math.sin(t*.8+j)))}joinLine(c,pts,cs[0],.4,.18)});flowing(18,.015,1,.35,.7);break;
case 20:for(let j=0;j<130;j++){let part=parts[j%parts.length],u=hash(j*12.6),p=at(part,u),a=t*(.3+hash(j*4)*.55)+j*8.7,r=1.1+3.6*hash(j+7),q={x:p.x+Math.cos(a)*r,y:p.y+Math.sin(a)*r};dot(c,q.x,q.y,.3+hash(j*19)*.6,cs[j%3],.54)}flicker(15,1.4);break;
case 21:burst(21);flicker(35,1.4);break;
case 22:flowing(240,.002,2.7,.33,.44);flicker(26,1.8);break;
case 23:forpart(part=>{for(let j=0;j<7;j++){let center=fract(hash(j*22.7)+t*(.035+.01*hash(j+5))),list=[];for(let k=0;k<34;k++){let u=center-.06+k*.0035;if(u<0||u>1)continue;let p=at(part,u),o=1.2*Math.sin((u-center)*65+t*.5),q={x:p.x+p.nx*o,y:p.y+p.ny*o};list.push(q)}joinLine(c,list,cs[j%3],1.5,.23+Math.abs(Math.sin(t+j))*.34);let p=at(part,center);halo(c,p.x,p.y,5,cs[j%3],.35)}});flowing(32,.01,1.1,.4,.5);break;
case 24:filament(3,1.4,31,.67,.6,.6);flowing(140,.016,2.4,.52,.63);flicker(30,1.8);sparks(11,6);break;

case 25:prismaticCore(1.2,3.15,.9);rainbowComets(28,1.3);slidingGlints(12);break;
case 26:prismaticCore(3.3,3.1,.92);orbitMotes(80,2,1.5,true);slidingGlints(22);break;
case 27:prismaticCore(.55,3.2,.81);filament(3,1.25,25,.8,.49,.52,RAINBOW);microBlobs(33,2);break;
case 28:prismaticCore(.95,2.2,.67);filament(7,1.75,44,.9,.42,.62,RAINBOW);orbitMotes(54,2.5,.85);break;
case 29:prismaticCore(1.7,2.65,.8);rainbowComets(52,3);orbitMotes(68,4,1.2);break;
case 30:prismaticCore(2.15,2.9,.86);rainbowFountains(40,7);slidingGlints(20,1.2);break;
case 31:prismaticCore(.7,3.1,.72);filament(4,2.1,20,.43,.6,.7,RAINBOW);microBlobs(37,2.4);break;
case 32:prismaticCore(1.15,2.55,.7);orbitMotes(170,5,1.7,true);slidingGlints(29,1.2);break;
case 33:prismaticCore(.7,2.6,.56);rainbowFountains(150,12);orbitMotes(65,7,.55);break;
case 34:prismaticCore(1.45,2.55,.79);colorWisps(37,9,1.1);rainbowFountains(65,10);break;
case 35:prismaticCore(.65,3.45,.77);filament(6,2.9,30,.47,.43,.33,RAINBOW);slidingGlints(24);break;
case 36:prismaticCore(.4,2.4,.61);orbitMotes(64,8,1.1,true);microBlobs(17,1);break;
case 37:prismaticCore(.7,2.6,.53);colorWisps(60,12,1.25);orbitMotes(54,6,1);break;
case 38:prismaticCore(.8,2.55,.76);orbitMotes(120,8,1.5,true);rainbowFountains(27,10);slidingGlints(15);break;
case 39:prismaticCore(.77,2.5,.68);orbitMotes(155,8,2);for(let j=0;j<28;j++){let part=parts[j%parts.length],p=at(part,hash(j*17.6)),phase=t*(.8+hash(j)*.8)+j*7;for(let k=0;k<5;k++){let a=phase+k*.8,r=1.3+k*1.5;dot(c,p.x+Math.cos(a)*r,p.y+Math.sin(a)*r,.35,RAINBOW[(j+k)%7],.42)}}break;
case 40:prismaticCore(1.2,2.4,.72);rainbowComets(50,10);rainbowFountains(50,9);break;
case 41:prismaticCore(.6,2.4,.64);filament(5,3.6,18,.7,.43,.55,RAINBOW);colorWisps(72,12,.7);break;
case 42:prismaticCore(.55,2.45,.7);microBlobs(125,2.6);orbitMotes(28,3,.6);break;
case 43:prismaticCore(1.1,2.55,.72);rainbowFountains(95,14);slidingGlints(32,1.25);break;
case 44:prismaticCore(.4,2.4,.63);for(let j=0;j<130;j++){let part=parts[j%parts.length],p=at(part,hash(j*16.1)),growth=Math.pow(Math.max(0,Math.sin(t*.55+j*.72)),2),len=growth*(2+hash(j)*7),d=j%2?1:-1,q={x:p.x+p.nx*len*d,y:p.y+p.ny*len*d},q2={x:q.x+p.tx*len*.35,y:q.y+p.ty*len*.35};joinLine(c,[p,q],RAINBOW[j%7],.53,growth*.54);if(j%3===0)joinLine(c,[q,q2],RAINBOW[(j+2)%7],.38,growth*.35)}break;
case 45:prismaticCore(.6,2.8,.68);microBlobs(145,3.4);rainbowComets(14,1);break;
case 46:prismaticCore(.35,2.35,.56);colorWisps(110,13,.7);filament(4,2.2,13,.43,.4,.25,RAINBOW);break;
case 47:prismaticCore(.65,2.5,.69);orbitMotes(45,7,.75,true);for(let j=0;j<38;j++){let part=parts[j%parts.length],a=at(part,hash(j*11.5)),b=at(part,hash(j*11.5)+.034),phase=t*.43+j,off=3+4*Math.sin(phase),p={x:a.x+a.nx*off,y:a.y+a.ny*off},q={x:b.x+b.nx*off,y:b.y+b.ny*off};joinLine(c,[p,q],RAINBOW[j%7],.4,.35)}break;
case 48:prismaticCore(1.5,2.65,.75);for(let j=0;j<55;j++){let part=parts[j%parts.length],p=at(part,hash(j*12.8+i)),age=fract(t*(.2+.12*hash(j))+hash(j*3)),r=age*(3+hash(j)*11),fade=Math.pow(1-age,2);for(let k=0;k<6;k++){let a=k*TAU/6+j,x=p.x+Math.cos(a)*r,y=p.y+Math.sin(a)*r;dot(c,x,y,.4+fade*.65,RAINBOW[(j+k)%7],fade*.65)}}slidingGlints(24);break;
case 49:prismaticCore(.95,3.2,.82);filament(3,2,29,.8,.5,.57,RAINBOW);rainbowComets(33,5);orbitMotes(115,7,1.3,true);rainbowFountains(48,11);slidingGlints(20,1.3);break;
}
c.restore();c.globalCompositeOperation="source-over";
}
}


const MAT=["Blob Necklace","Smoke Calligraphy","Velvet Fuzz","Neon Cells","Molten Marbles","Paper Confetti","Watercolor Bloom","Coral Bones","Crystal Tiles","Bubble Column","Ribbon Origami","Liquid Lava","Moss Letter","Ferrofluid","Pearl Garland","Cloud Cotton","Woven Tapestry","Scale Armor","Petal Cascade","Chromatic Droplets","Prism Pebbles","Satin Ruffles","Fire Opal","Microgalaxy Clusters","Glass Mosaic"];
const FAM=["Blob","Smoke","Fuzzy","Cell","Glass","Paper","Paint","Growth","Crystal","Bubble","Fold","Liquid","Plant","Magnetic","Pearl","Cloud","Woven","Scale","Petal","Color","Gem","Fabric","Fire","Cosmic","Mosaic"];
const COLORS=[["#ff8ab8","#6af1d5","#ffe198"],["#acbfff","#ffaedf","#b2ffdd"],["#ffb18d","#fadd82","#88d7ff"],["#83edff","#d69fff","#f9f3ae"]];
MAT.forEach((name,j)=>effects.push([name,"A different physical material forms the glyph",FAM[j],...COLORS[j%4]]));

const originalDraw=Scene.prototype.draw;
Scene.prototype.draw=function(dt){
 if(this.i<50)return originalDraw.call(this,dt);
 this.t+=dt;const i=this.i,k=i-50,t=this.t,c=this.c,cs=effects[i].slice(3);
 if(this.gameplay){this.setGameplayTransform(c)}else{
  c.setTransform(this.canvas.width/340,0,0,this.canvas.height/160,0,0);
  c.fillStyle="#07101e";c.fillRect(0,0,340,160);
 }
 c.save();if(!this.gameplay){c.translate(170,80);c.scale(1.12,1.12)}
 const circle=(x,y,r,col,a)=>dot(c,x,y,r,col,a);
 const glow=(x,y,r,col,a)=>halo(c,x,y,r,col,a);
 const polygon=(x,y,r,n,col,a,ang)=>{c.fillStyle=rgba(col,a);c.beginPath();for(let z=0;z<n;z++){let th=ang+z*Math.PI*2/n;z?c.lineTo(x+Math.cos(th)*r,y+Math.sin(th)*r):c.moveTo(x+Math.cos(th)*r,y+Math.sin(th)*r)}c.closePath();c.fill()};
 const segment=(p,q,w,col,a)=>joinLine(c,[p,q],col,w,a);
 (this.liveParts||buildGlyph(activeLetter)).forEach((part,h)=>{
  let n=Math.max(24,Math.ceil(part.pts.length/(k===2||k===16||k===23?2.4:5)));
  for(let j=0;j<n;j++){
   let u=(j+.5)/n;
   if(this.gameplay&&u>(part.revealed??1))break;
   let p=at(part,u),q=at(part,Math.min(.99999,u+.015)),col=cs[(j+h)%3],r=2.4+Math.sin(j*.67+t*.43)**2,ang=t*.2+j*.8;
   if([0,4,11,14,19,20,22].includes(k)){
    if(k===20)polygon(p.x,p.y,r+1,6,col,.8,ang*.2);
    else if(k===19){c.beginPath();c.ellipse(p.x,p.y,r+1,2,ang*.06,0,Math.PI*2);c.fillStyle="hsla("+((u*700-t*90+j*8+7200)%360)+",96%,68%,.85)";c.fill()}
    else {glow(p.x,p.y,5,col,.22);circle(p.x,p.y,r,col,.78)}
    circle(p.x-.7,p.y-.7,.65,"#ffffff",.6);
   }else if([1,6,15,23].includes(k)){
    glow(p.x+p.nx*Math.sin(j*.23+t)*2,p.y+p.ny*Math.sin(j*.23+t)*2,k===15?8:6,col,.28);
    if(k===6||k===23)circle(p.x,p.y,1.7,cs[(j+1)%3],.25);
   }else if([2,7,12,13].includes(k)){
    circle(p.x,p.y,1.7,col,.67);
    for(let z=0;z<(k===2?7:3);z++){let th=ang+z*Math.PI*2/(k===2?7:3),d=k===2?4.5:3.5;
     if(k===13)polygon(p.x+Math.cos(th)*d,p.y+Math.sin(th)*d,1.7,3,cs[z%3],.7,th);
     else segment(p,{x:p.x+Math.cos(th)*d,y:p.y+Math.sin(th)*d},k===2?.33:.85,cs[z%3],.66)}
   }else if([3,9].includes(k)){
    c.beginPath();c.arc(p.x,p.y,r+1,0,Math.PI*2);c.strokeStyle=rgba(col,.75);c.lineWidth=k===9?1:1.7;c.stroke();
    circle(p.x,p.y,1.3,cs[(j+1)%3],.5);
   }else if([5,8,17,18,24].includes(k)){
    polygon(p.x,p.y,k===18?2.8:3.7,k===5?4:k===8?6:k===17?5:3,col,.77,ang);
    if(k===24)polygon(p.x,p.y,1.7,4,cs[(j+1)%3],.75,-ang);
   }else if([10,16,21].includes(k)){
    segment({x:p.x+p.nx*3,y:p.y+p.ny*3},{x:p.x-p.nx*3,y:p.y-p.ny*3},k===21?3.5:1.5,col,.78);
    segment(p,{x:p.x+p.tx*2,y:p.y+p.ty*2},1,cs[(j+1)%3],.7);
   }
  }
 });
 c.restore();
};

// Public material API. All contexts call these same original 75 algorithms.
window.LetterzStrokeEngine={Scene,effects,glyphs,buildGlyph,
 setLetter(letter){if(!glyphs[letter])throw Error('Unknown lab glyph');activeLetter=letter},
 sourceVersion:'original-75-shared-v1'};
})();
