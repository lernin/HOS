import * as T from 'three'
import { createEstateKit } from './kit'
import './design-lab.css'

type Study={name:string;detail:string;build:(x:number,z:number)=>void}
const mount=document.querySelector<HTMLDivElement>('#design-lab')!
mount.innerHTML=`<main class="design-lab-shell"><canvas class="design-lab-canvas" aria-label="Ocean Estate Design Lab"></canvas><header class="design-lab-header"><div><span>OCEAN ESTATE</span><h1>Design Lab</h1><p>Real buildable studies using the same geometry, materials and lighting language as the estate.</p></div><a href="/ocean-estate">Back to estate</a></header><section class="design-lab-panel"><div class="design-lab-tabs"><button class="active">Pillars</button><button disabled>Trees</button><button disabled>Doors</button><button disabled>Seating</button><button disabled>Lighting</button><button disabled>Materials</button></div><div class="design-lab-grid"></div><div class="design-lab-hint">Tap a pillar study to inspect it. Nothing here is concept art.</div></section></main>`
const canvas=mount.querySelector<HTMLCanvasElement>('.design-lab-canvas')!
const renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'})
renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.setPixelRatio(Math.min(devicePixelRatio,1.2))
const scene=new T.Scene();scene.background=new T.Color('#171b19');scene.fog=new T.Fog('#171b19',25,55)
const camera=new T.PerspectiveCamera(48,1,.1,100);camera.position.set(0,11.5,24)
scene.add(new T.HemisphereLight('#c8d9d3','#5d4d3d',1.3))
const key=new T.DirectionalLight('#ffe1b6',4.1);key.position.set(-12,18,11);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-18;key.shadow.camera.right=18;key.shadow.camera.top=18;key.shadow.camera.bottom=-18;scene.add(key,key.target)
const fill=new T.PointLight('#ffc978',28,24,2);fill.position.set(0,8,10);scene.add(fill)
const k=createEstateKit(scene)
k.box(0,-.22,0,25,.44,25,'travertine',k.root,.08);k.box(0,.015,0,24.2,.03,24.2,'limestone')
for(const x of [-8,0,8])for(const z of [-7.5,0,7.5]){k.box(x,.11,z,4.6,.22,4.6,'basalt',k.root,.09);k.box(x,.24,z,4.15,.06,4.15,'travertine',k.root,.08)}
const h=5.9
const glow=(x:number,z:number,y:number,height:number,parent=k.root)=>k.box(x,y,z,.085,height,.07,'glow',parent,.025)
const bronze=(x:number,z:number,y:number,height:number,parent=k.root)=>k.box(x,y,z,.055,height,.055,'bronze',parent,.015)
const base=(x:number,z:number,w:number,d:number)=>k.box(x,.42,z,w,.52,d,'travertine',k.root,.08)
const top=(x:number,z:number,w:number,d:number)=>k.box(x,h+.17,z,w,.34,d,'bronze',k.root,.06)
const studies:Study[]=[
{name:'1 · Light Spine',detail:'Warm stone with one recessed vertical light blade.',build(x,z){base(x,z,1.18,1.18);k.box(x,3.2,z,1.02,h,1.02,'travertine',k.root,.08);k.box(x,3.2,z+.515,.22,h-.55,.07,'bronze',k.root,.025);glow(x,z+.555,3.2,h-.9);top(x,z,1.18,1.18)}},
{name:'2 · Walnut Core',detail:'Stone shell, walnut core, twin warm seams.',build(x,z){base(x,z,1.38,1.12);k.box(x-.37,3.2,z,.48,h,.98,'limestone',k.root,.07);k.box(x+.37,3.2,z,.48,h,.98,'limestone',k.root,.07);k.box(x,3.2,z+.02,.25,h-.18,1.04,'walnut',k.root,.04);glow(x-.17,z+.555,3.2,h-1);glow(x+.17,z+.555,3.2,h-1);top(x,z,1.4,1.16)}},
{name:'3 · Bronze Reveal',detail:'Quiet limestone, dark shadow gap and bronze reveal.',build(x,z){base(x,z,1.2,1.2);k.box(x,3.2,z,1.08,h,1.08,'limestone',k.root,.09);k.box(x,3.2,z+.56,.34,h-.45,.045,'black',k.root,.01);bronze(x,z+.59,3.2,h-.72);glow(x,z+.62,3.2,h-1.35);top(x,z,1.22,1.22)}},
{name:'4 · Fluted Stone',detail:'Vertical stone fins with a lit center flute.',build(x,z){base(x,z,1.42,1.12);k.box(x,3.2,z,1.28,h,1,'travertine',k.root,.05);for(const dx of [-.48,-.24,0,.24,.48])k.box(x+dx,3.2,z+.53,.11,h-.4,.09,'limestone',k.root,.025);glow(x,z+.6,3.2,h-1.1);top(x,z,1.45,1.15)}},
{name:'5 · Twin Blades',detail:'Two stone blades with a glowing slot between.',build(x,z){base(x,z,1.52,1.12);k.box(x-.38,3.2,z,.58,h,1.02,'limestone',k.root,.055);k.box(x+.38,3.2,z,.58,h,1.02,'limestone',k.root,.055);k.box(x,3.2,z+.03,.16,h-.2,1.06,'black',k.root,.02);glow(x,z+.57,3.2,h-.9);top(x,z,1.55,1.16)}},
{name:'6 · Bronze Halo',detail:'Stone body framed by a subtle bronze perimeter.',build(x,z){base(x,z,1.28,1.28);k.box(x,3.2,z,1.08,h,1.08,'travertine',k.root,.09);for(const dx of [-.55,.55])bronze(x+dx,z+.54,3.2,h-.38);k.box(x,h-.02,z+.55,1.12,.06,.06,'bronze',k.root,.015);glow(x,z+.59,3.2,h-1.4);top(x,z,1.3,1.3)}},
{name:'7 · Timber Lantern',detail:'Walnut-wrapped pillar with a lit inner recess.',build(x,z){base(x,z,1.42,1.32);k.box(x,3.2,z,1.22,h,1.12,'walnut',k.root,.08);k.box(x,3.2,z+.58,.32,h-.5,.06,'black',k.root,.02);glow(x,z+.62,3.2,h-1);for(const dx of [-.52,.52])bronze(x+dx,z+.58,3.2,h-.5);top(x,z,1.45,1.35)}},
{name:'8 · Layered Portal',detail:'Stepped limestone frame around a travertine core.',build(x,z){base(x,z,1.58,1.32);k.box(x,3.2,z,1.42,h,1.18,'limestone',k.root,.08);k.box(x,3.2,z+.08,1.1,h-.26,1.26,'travertine',k.root,.06);k.box(x,3.2,z+.64,.34,h-.7,.06,'bronze',k.root,.02);glow(x,z+.68,3.2,h-1.15);top(x,z,1.62,1.36)}},
{name:'9 · Split Lantern',detail:'Offset stone masses with an illuminated inner edge.',build(x,z){base(x,z,1.55,1.28);const g=k.group(x,0,z,0);k.box(-.28,3.18,-.04,.72,h,1.02,'travertine',g,.08);k.box(.34,3.18,.08,.68,h-.35,1.02,'limestone',g,.08);k.box(.05,3.2,.56,.16,h-.65,.06,'black',g,.015);glow(.05,.605,3.2,h-1.05,g);k.box(0,h+.16,0,1.58,.32,1.3,'bronze',g,.05)}}]
const positions=[[-8,7.5],[0,7.5],[8,7.5],[-8,0],[0,0],[8,0],[-8,-7.5],[0,-7.5],[8,-7.5]] as const
studies.forEach((s,i)=>s.build(positions[i][0],positions[i][1]));k.finish()
const grid=mount.querySelector<HTMLDivElement>('.design-lab-grid')!;grid.innerHTML=`<button class="active" data-study="-1"><strong>Overview</strong><span>See all nine studies</span></button>`+studies.map((s,i)=>`<button data-study="${i}"><strong>${s.name}</strong><span>${s.detail}</span></button>`).join('')
const buttons=[...mount.querySelectorAll<HTMLButtonElement>('[data-study]')];let selected=-1;let goalPos=new T.Vector3(0,11.5,24),goalTarget=new T.Vector3(0,3.1,0),target=goalTarget.clone()
function choose(index:number){selected=index;buttons.forEach(b=>b.classList.toggle('active',Number(b.dataset.study)===index));if(index<0){goalPos.set(0,11.5,24);goalTarget.set(0,3.1,0)}else{const [x,z]=positions[index];goalPos.set(x+5.7,6.2,z+8.2);goalTarget.set(x,3,z)}}
buttons.forEach(b=>b.addEventListener('click',()=>choose(Number(b.dataset.study))))
let dragging=false,lastX=0,orbit=.55
canvas.addEventListener('pointerdown',e=>{dragging=true;lastX=e.clientX;canvas.setPointerCapture(e.pointerId)})
canvas.addEventListener('pointermove',e=>{if(!dragging||selected<0)return;orbit+=(e.clientX-lastX)*.006;lastX=e.clientX;const [x,z]=positions[selected];goalPos.set(x+Math.sin(orbit)*9,5.8,z+Math.cos(orbit)*9)})
canvas.addEventListener('pointerup',()=>dragging=false);canvas.addEventListener('pointercancel',()=>dragging=false)
function resize(){const w=canvas.clientWidth,hgt=canvas.clientHeight;if(!w||!hgt)return;renderer.setSize(w,hgt,false);camera.aspect=w/hgt;camera.updateProjectionMatrix()}new ResizeObserver(resize).observe(canvas);resize()
function tick(){requestAnimationFrame(tick);camera.position.lerp(goalPos,.055);target.lerp(goalTarget,.07);camera.lookAt(target);renderer.render(scene,camera)}tick()
