import * as T from 'three'
import { createEstateKit, v } from './kit'
import './design-lab.css'

type Study={name:string;detail:string;build:(x:number,z:number)=>void}
type Gallery={key:string;label:string;subtitle:string;studies:Study[]}

const mount=document.querySelector<HTMLDivElement>('#design-lab')!
mount.innerHTML=`<main class="design-lab-shell"><canvas class="design-lab-canvas" aria-label="Ocean Estate Design Lab"></canvas><header class="design-lab-header"><div><span>OCEAN ESTATE</span><h1>Design Lab</h1><p>Real buildable 3D studies using the same geometry, materials and lighting language as the estate.</p></div><a href="/ocean-estate">Back to estate</a></header><section class="design-lab-panel"><div class="design-lab-tabs"></div><div class="design-lab-grid"></div><div class="design-lab-hint"></div></section></main>`
const canvas=mount.querySelector<HTMLCanvasElement>('.design-lab-canvas')!
const renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'})
renderer.outputColorSpace=T.SRGBColorSpace
renderer.toneMapping=T.ACESFilmicToneMapping
renderer.toneMappingExposure=1.08
renderer.shadowMap.enabled=true
renderer.shadowMap.type=T.PCFSoftShadowMap
renderer.setPixelRatio(Math.min(devicePixelRatio,1.15))
const scene=new T.Scene()
scene.background=new T.Color('#171b19')
scene.fog=new T.Fog('#171b19',28,82)
const camera=new T.PerspectiveCamera(48,1,.1,180)
scene.add(new T.HemisphereLight('#d5e0da','#5d4d3d',1.35))
const key=new T.DirectionalLight('#ffe1b6',3.6)
key.position.set(-18,23,15)
key.castShadow=true
key.shadow.mapSize.set(2048,2048)
key.shadow.camera.left=-24;key.shadow.camera.right=24;key.shadow.camera.top=24;key.shadow.camera.bottom=-24
scene.add(key,key.target)
const fill=new T.PointLight('#ffc978',24,30,2)
scene.add(fill)

const k=createEstateKit(scene)
const platform=(x:number,z:number,w=5.2,d=5.2)=>{k.box(x,.08,z,w,.16,d,'basalt',k.root,.09);k.box(x,.19,z,w-.28,.06,d-.28,'travertine',k.root,.08)}
const glow=(x:number,z:number,y:number,height:number,parent=k.root)=>k.box(x,y,z,.065,height,.055,'glow',parent,.018)
const bronze=(x:number,z:number,y:number,height:number,parent=k.root)=>k.box(x,y,z,.05,height,.05,'bronze',parent,.012)

function leafBlade(parent:T.Group,angle:number,length:number,width=.32,y=0){
  const m=k.ellipsoid(Math.cos(angle)*length*.48,y,Math.sin(angle)*length*.48,length*.62,.065,width,'leaf',parent,10)
  m.rotation.y=-angle
  m.rotation.z=.08*Math.sin(angle*2)
}
function palmCrown(parent:T.Group,y:number,count:number,length:number,fan=false){
  for(let i=0;i<count;i++){
    const a=fan?(-1.15+i*(2.3/Math.max(1,count-1))):i*Math.PI*2/count
    const m=k.ellipsoid(Math.cos(a)*length*.42,y,Math.sin(a)*length*.42,length*.58,.07,.24,'leaf',parent,10)
    m.rotation.y=-a
    m.rotation.z=fan?.22*Math.sin(a):.14*Math.sin(a*2)
  }
}
function trunk(parent:T.Group,h:number,r=.16,bend=.28){
  k.beam([v(0,0,0),v(bend*.25,h*.34,.05),v(bend*.7,h*.7,.08),v(bend,h,.1)],r,'bark',parent,8)
}
function canopy(parent:T.Group,y:number,r=1.25,mat='leaf'){
  for(let i=0;i<8;i++){
    const a=i*2.399
    const m=k.ellipsoid(Math.cos(a)*r*.48,y+Math.sin(i*1.7)*.22,Math.sin(a)*r*.48,r*.72,r*.42,r*.65,mat,parent,10)
    m.rotation.y=a
  }
}
function chairFrame(g:T.Group,w=.76,d=.82,h=.86,mat='walnut'){
  for(const sx of [-1,1])for(const sz of [-1,1])k.box(sx*w*.4,.38,sz*d*.38,.075,.72,.075,mat,g,.02)
  k.box(0,.72,d*.34,w*.88,.07,.07,mat,g,.02)
}
function cushion(g:T.Group,y=.52,z=0,w=.74,d=.66,mat='linen'){k.box(0,y,z,w,.13,d,mat,g,.08)}

const pillarH=5.2
const pillars:Study[]=[
{name:'1 · Light Spine',detail:'Warm stone with one recessed vertical light blade.',build(x,z){platform(x,z);k.box(x,.38,z,1.05,.38,.92,'travertine',k.root,.07);k.box(x,3.02,z,.82,pillarH,.72,'travertine',k.root,.05);k.box(x,3.02,z+.39,.18,pillarH-.55,.045,'bronze',k.root,.018);glow(x,z+.425,3.02,pillarH-.9);k.box(x,5.69,z,.94,.16,.82,'bronze',k.root,.04)}},
{name:'2 · Walnut Core',detail:'Stone shell, walnut core, twin warm seams.',build(x,z){platform(x,z);k.box(x,.38,z,1.12,.38,.94,'travertine',k.root,.07);k.box(x-.27,3.02,z,.34,pillarH,.72,'limestone',k.root,.05);k.box(x+.27,3.02,z,.34,pillarH,.72,'limestone',k.root,.05);k.box(x,3.02,z,.18,pillarH-.2,.75,'walnut',k.root,.03);glow(x-.12,z+.4,3.02,pillarH-1);glow(x+.12,z+.4,3.02,pillarH-1)}},
{name:'3 · Bronze Reveal',detail:'Limestone with a dark reveal and fine bronze line.',build(x,z){platform(x,z);k.box(x,.38,z,1.02,.38,.92,'travertine',k.root,.07);k.box(x,3.02,z,.8,pillarH,.72,'limestone',k.root,.055);k.box(x,3.02,z+.39,.24,pillarH-.5,.04,'black',k.root,.01);bronze(x,z+.425,3.02,pillarH-.72);glow(x,z+.45,3.02,pillarH-1.35)}},
{name:'4 · Fluted Stone',detail:'Slim fluted stone with a recessed warm center light.',build(x,z){platform(x,z);k.box(x,.33,z,1.06,.28,.92,'travertine',k.root,.07);k.box(x,.56,z,.9,.18,.8,'limestone',k.root,.05);k.box(x,3.12,z,.82,4.95,.72,'travertine',k.root,.045);for(const dx of [-.28,-.14,.14,.28])k.box(x+dx,3.12,z+.385,.065,4.55,.055,'limestone',k.root,.018);glow(x,z+.42,3.12,4.25);k.box(x,5.64,z,.92,.14,.82,'bronze',k.root,.035)}},
{name:'5 · Twin Blades',detail:'Two stone blades with a glowing slot between.',build(x,z){platform(x,z);k.box(x,.38,z,1.14,.38,.92,'travertine',k.root,.07);k.box(x-.24,3.02,z,.34,pillarH,.72,'limestone',k.root,.045);k.box(x+.24,3.02,z,.34,pillarH,.72,'limestone',k.root,.045);k.box(x,3.02,z+.39,.12,pillarH-.25,.04,'black',k.root,.012);glow(x,z+.425,3.02,pillarH-.9)}},
{name:'6 · Bronze Halo',detail:'Stone body framed by a subtle bronze perimeter.',build(x,z){platform(x,z);k.box(x,.38,z,1.02,.38,.92,'travertine',k.root,.07);k.box(x,3.02,z,.8,pillarH,.72,'travertine',k.root,.055);for(const dx of [-.42,.42])bronze(x+dx,z+.37,3.02,pillarH-.38);k.box(x,5.52,z+.37,.86,.05,.05,'bronze',k.root,.012);glow(x,z+.41,3.02,pillarH-1.4)}},
{name:'7 · Timber Lantern',detail:'Walnut wrapped column with a lit inner recess.',build(x,z){platform(x,z);k.box(x,.38,z,1.08,.38,.94,'travertine',k.root,.07);k.box(x,3.02,z,.88,pillarH,.76,'walnut',k.root,.06);k.box(x,3.02,z+.405,.24,pillarH-.5,.04,'black',k.root,.014);glow(x,z+.44,3.02,pillarH-1);for(const dx of [-.37,.37])bronze(x+dx,z+.41,3.02,pillarH-.5)}},
{name:'8 · Layered Portal',detail:'Stepped limestone frame around a travertine core.',build(x,z){platform(x,z);k.box(x,.38,z,1.14,.38,.98,'travertine',k.root,.07);k.box(x,3.02,z,.94,pillarH,.82,'limestone',k.root,.055);k.box(x,3.02,z+.05,.74,pillarH-.25,.86,'travertine',k.root,.045);glow(x,z+.48,3.02,pillarH-1.15)}},
{name:'9 · Split Lantern',detail:'Offset stone masses with an illuminated inner edge.',build(x,z){platform(x,z);const g=k.group(x,0,z);k.box(-.18,3.02,-.03,.48,pillarH,.72,'travertine',g,.055);k.box(.24,3.02,.05,.42,pillarH-.35,.72,'limestone',g,.055);k.box(.02,3.02,.39,.1,pillarH-.65,.04,'black',g,.012);glow(.02,.425,3.02,pillarH-1.05,g)}}]

const palms:Study[]=[
{name:'1 · Slender Coconut',detail:'Tall, slightly leaning trunk with a loose crown.',build(x,z){platform(x,z);const g=k.group(x,.2,z,.08);trunk(g,4.8,.13,.48);palmCrown(g,4.95,9,2.05)}},
{name:'2 · Resort Fan Palm',detail:'Straight trunk and broad architectural fan crown.',build(x,z){platform(x,z);const g=k.group(x,.2,z);trunk(g,3.9,.18,.08);palmCrown(g,4.05,11,1.75,true)}},
{name:'3 · Date Palm',detail:'Heavier textured trunk with a dense symmetric crown.',build(x,z){platform(x,z);const g=k.group(x,.2,z);trunk(g,4.25,.22,.12);for(let y=.55;y<4.15;y+=.34)k.cylinder(0,y,.02,.23,.08,'walnut',g,.21,10);palmCrown(g,4.45,14,1.65)}},
{name:'4 · Cluster Palm',detail:'Three slim stems for lush poolside planting.',build(x,z){platform(x,z);const g=k.group(x,.2,z);for(const [dx,dz,h,a] of [[-.28,.1,3.8,-.18],[.25,.12,4.3,.14],[.05,-.18,3.45,.02]] as const){const stem=new T.Group();stem.position.set(dx,0,dz);stem.rotation.z=a;g.add(stem);trunk(stem,h,.1,.18);palmCrown(stem,h+.1,7,1.25)}}},
{name:'5 · Sculptural Bent Palm',detail:'A dramatic curved trunk for a focal landscape moment.',build(x,z){platform(x,z);const g=k.group(x,.2,z,-.25);k.beam([v(0,0,0),v(.3,1.1,.06),v(.75,2.2,.1),v(1.15,3.25,.08),v(1.35,4.25,0)],.16,'bark',g,9);const crown=new T.Group();crown.position.set(1.35,4.25,0);g.add(crown);palmCrown(crown,.08,9,1.65)}},
{name:'6 · Dwarf Patio Palm',detail:'Compact palm sized for planters and sheltered terraces.',build(x,z){platform(x,z);k.lathe([[.42,0],[.52,.08],[.46,.62],[.4,.7]],'ceramic',x,.2,z);const g=k.group(x,.85,z);trunk(g,1.45,.11,.12);palmCrown(g,1.58,8,1.05)}}]

const trees:Study[]=[
{name:'1 · Umbrella Canopy',detail:'Broad horizontal shade tree for courtyards.',build(x,z){platform(x,z);const g=k.group(x,.2,z,.1);trunk(g,3.05,.22,.18);for(const a of [-1.0,-.45,.4,.95])k.beam([v(.18,2.1,.05),v(Math.cos(a)*.75,2.75,Math.sin(a)*.75),v(Math.cos(a)*1.35,3.15,Math.sin(a)*1.35)],.08,'bark',g,7);canopy(g,3.45,1.75)}},
{name:'2 · Olive Form',detail:'Pale sculptural trunk and airy silver-green crown.',build(x,z){platform(x,z);const g=k.group(x,.2,z);k.beam([v(0,0,0),v(-.18,1.2,.08),v(.14,2.2,.02),v(-.05,3,.06)],.2,'bark',g,8);canopy(g,3.35,1.45,'leafLight')}},
{name:'3 · Courtyard Tree',detail:'Compact rounded canopy for enclosed garden spaces.',build(x,z){platform(x,z);const g=k.group(x,.2,z);trunk(g,2.65,.19,.08);canopy(g,3.02,1.35)}},
{name:'4 · Coastal Pine',detail:'Layered flat crowns with an asymmetric trunk.',build(x,z){platform(x,z);const g=k.group(x,.2,z,-.2);trunk(g,4.2,.16,.4);for(const [y,r] of [[2.7,1.25],[3.35,1.55],[4.05,1.15]] as const)for(let i=0;i<5;i++){const a=i*1.256+(y%1);const m=k.ellipsoid(Math.cos(a)*r*.42,y,Math.sin(a)*r*.42,r*.65,.22,r*.52,'leafDark',g,9);m.rotation.y=a}}},
{name:'5 · Sculptural Branch',detail:'Sparse architectural branching for a gallery-like garden.',build(x,z){platform(x,z);const g=k.group(x,.2,z,.2);k.beam([v(0,0,0),v(.18,1.4,.1),v(-.1,2.7,.12),v(.3,4,.06)],.2,'bark',g,8);for(let i=0;i<5;i++){const a=i*1.35;k.beam([v(0,2+i*.28,0),v(Math.cos(a)*.65,2.8+i*.25,Math.sin(a)*.65),v(Math.cos(a)*1.2,3.2+i*.18,Math.sin(a)*1.2)],.065,'bark',g,7);const m=k.ellipsoid(Math.cos(a)*1.28,3.25+i*.18,Math.sin(a)*1.28,.75,.34,.7,'leaf',g,9);m.rotation.y=a}}},
{name:'6 · Flowering Tree',detail:'Soft green canopy with restrained warm blossoms.',build(x,z){platform(x,z);const g=k.group(x,.2,z);trunk(g,2.85,.2,.12);canopy(g,3.15,1.45);for(let i=0;i<14;i++){const a=i*2.1;k.ellipsoid(Math.cos(a)*1.15,3.15+Math.sin(i)*.5,Math.sin(a)*1.15,.12,.08,.12,'pink',g,7)}}}]

const plants:Study[]=[
{name:'1 · Agave Rosette',detail:'Low sculptural blue-green blades for stone beds.',build(x,z){platform(x,z);const g=k.group(x,.22,z);for(let i=0;i<15;i++){const a=i*2.4;const m=k.ellipsoid(Math.cos(a)*.38,.42+Math.sin(i)*.06,Math.sin(a)*.38,.72,.055,.16,i%3===0?'leafLight':'leaf',g,8);m.rotation.y=-a;m.rotation.z=.32}}},
{name:'2 · Fountain Grass',detail:'Soft fine blades with a loose wind-shaped silhouette.',build(x,z){platform(x,z);const g=k.group(x,.22,z);for(let i=0;i<18;i++){const a=i*2.17,h=.75+(i%5)*.12;k.beam([v(0,0,0),v(Math.cos(a)*.18,h*.55,Math.sin(a)*.18),v(Math.cos(a)*.52,h,Math.sin(a)*.52)],.018,i%3===0?'leafLight':'leaf',g,5)}}},
{name:'3 · Fern Mass',detail:'Layered fronds for shaded spa and courtyard planting.',build(x,z){platform(x,z);const g=k.group(x,.22,z);for(let i=0;i<12;i++)leafBlade(g,i*Math.PI*2/12,1.25,.22,.38+Math.sin(i)*.08)}},
{name:'4 · Bird of Paradise',detail:'Tall tropical leaves with a clean modern profile.',build(x,z){platform(x,z);const g=k.group(x,.22,z);for(let i=0;i<8;i++){const a=-.9+i*.25,h=1.4+(i%3)*.22;k.beam([v(0,0,0),v(Math.sin(a)*.12,h*.6,Math.cos(a)*.12),v(Math.sin(a)*.2,h,Math.cos(a)*.2)],.028,'leafDark',g,6);const m=k.ellipsoid(Math.sin(a)*.3,h+.18,Math.cos(a)*.3,.28,.055,.72,'leaf',g,8);m.rotation.y=a}}},
{name:'5 · Low Hedge',detail:'Clipped evergreen mass for crisp architectural edges.',build(x,z){platform(x,z);for(let i=-2;i<=2;i++)for(let j=-1;j<=1;j++)k.ellipsoid(x+i*.48,.62,z+j*.42,.45,.44,.4,(i+j)%2?'leaf':'leafDark',k.root,8)}},
{name:'6 · Succulent Cluster',detail:'Rounded dry-garden planting with varied heights.',build(x,z){platform(x,z);for(const [dx,dz,s] of [[-.45,.1,.75],[.1,.2,1],[.42,-.15,.62],[-.1,-.38,.55]] as const){const g=k.group(x+dx,.22,z+dz);for(let i=0;i<9;i++){const a=i*.698;const m=k.ellipsoid(Math.cos(a)*.25,.25+Math.sin(i)*.02,Math.sin(a)*.25,.36*s,.06,.14*s,'sage',g,7);m.rotation.y=-a;m.rotation.z=.4}}}}]

const chairs:Study[]=[
{name:'1 · Teak Sling',detail:'Slim timber frame with a relaxed linen sling.',build(x,z){platform(x,z);const g=k.group(x,.2,z);chairFrame(g,.76,.84,.86,'walnut');cushion(g,.5,0,.68,.62,'linen');const back=k.box(0,.86,.31,.68,.52,.09,'linen',g,.06);back.rotation.x=-.15}},
{name:'2 · Pool Lounger',detail:'Low teak chaise with a long pale cushion.',build(x,z){platform(x,z);const g=k.group(x,.2,z);for(const sx of [-1,1])for(const sz of [-1,1])k.box(sx*.38,.24,sz*.75,.07,.34,.07,'walnut',g,.02);k.box(0,.42,0,.82,.1,1.62,'walnut',g,.03);cushion(g,.51,0,.76,1.48,'linen');const back=k.box(0,.85,-.58,.76,.1,.88,'linen',g,.06);back.rotation.x=-.55}},
{name:'3 · Woven Club',detail:'Deep low chair with dark frame and soft seat.',build(x,z){platform(x,z);const g=k.group(x,.2,z);k.box(0,.48,0,.94,.12,.78,'bronze',g,.12);cushion(g,.58,-.02,.76,.62,'linen');for(const sx of [-1,1])k.box(sx*.43,.78,.05,.1,.54,.72,'bronze',g,.07);const b=k.box(0,.83,.31,.76,.54,.1,'linen',g,.09);b.rotation.x=-.12}},
{name:'4 · Cantilever Chair',detail:'Bronze loop frame with a floating upholstered seat.',build(x,z){platform(x,z);const g=k.group(x,.2,z);for(const sx of [-1,1]){k.beam([v(sx*.35,.05,-.36),v(sx*.35,.05,.36),v(sx*.35,.82,.34)],.045,'bronze',g,7)}cushion(g,.5,0,.7,.62,'linen');const b=k.box(0,.83,.3,.68,.48,.09,'linen',g,.07);b.rotation.x=-.1}},
{name:'5 · Patio Dining',detail:'Upright teak chair for outdoor dining tables.',build(x,z){platform(x,z);const g=k.group(x,.2,z);chairFrame(g,.68,.68,.95,'oak');cushion(g,.53,-.02,.6,.52,'linen');for(let y=.7;y<1.08;y+=.12)k.box(0,y,.29,.58,.045,.045,'oak',g,.015)}},
{name:'6 · Sculpted Pool Chair',detail:'Rounded stone-toned shell with a removable cushion.',build(x,z){platform(x,z);const g=k.group(x,.2,z);k.box(0,.52,0,.9,.5,.78,'travertine',g,.2);k.box(0,.83,.3,.82,.58,.16,'travertine',g,.15);cushion(g,.7,-.06,.7,.54,'linen')}}]

const counters:Study[]=[
{name:'1 · Waterfall Stone',detail:'Cream stone island with full waterfall ends.',build(x,z){platform(x,z,6.2,5.4);k.box(x,.72,z,3.3,.98,1.25,'marble',k.root,.045);k.box(x-1.56,.72,z,.18,.98,1.25,'marble',k.root,.035);k.box(x+1.56,.72,z,.18,.98,1.25,'marble',k.root,.035)}},
{name:'2 · Fluted Oak Island',detail:'Warm timber base with fine vertical rhythm and stone top.',build(x,z){platform(x,z,6.2,5.4);k.box(x,.64,z,3.15,.82,1.16,'oak',k.root,.06);for(let dx=-1.42;dx<=1.42;dx+=.16)k.box(x+dx,.64,z+.6,.055,.72,.045,'walnut',k.root,.012);k.box(x,1.1,z,3.35,.16,1.3,'marble',k.root,.04)}},
{name:'3 · Dark Monolith',detail:'Basalt island with a thin pale stone worktop.',build(x,z){platform(x,z,6.2,5.4);k.box(x,.65,z,3.05,.86,1.18,'basalt',k.root,.055);k.box(x,1.12,z,3.3,.12,1.34,'limestone',k.root,.035)}},
{name:'4 · Bronze + Stone',detail:'Travertine body with a bronze shadow plinth.',build(x,z){platform(x,z,6.2,5.4);k.box(x,.32,z,3.1,.16,1.14,'bronze',k.root,.03);k.box(x,.73,z,3.0,.72,1.08,'travertine',k.root,.06);k.box(x,1.13,z,3.28,.16,1.3,'marble',k.root,.04)}},
{name:'5 · Curved Island',detail:'Soft rounded island for a more resort-like kitchen.',build(x,z){platform(x,z,6.2,5.4);k.box(x,.72,z,3.1,.95,1.22,'plaster',k.root,.28);k.box(x,1.18,z,3.28,.12,1.36,'marble',k.root,.12)}},
{name:'6 · Split-level Bar',detail:'Prep surface plus a raised walnut social ledge.',build(x,z){platform(x,z,6.2,5.4);k.box(x,.68,z,3.0,.86,1.12,'travertine',k.root,.05);k.box(x,1.13,z-.18,3.18,.12,1.2,'marble',k.root,.04);k.box(x,1.34,z+.48,3.05,.12,.38,'walnut',k.root,.025);for(const dx of [-1.25,1.25])k.box(x+dx,1.13,z+.48,.06,.42,.06,'bronze')}}]

const galleries:Gallery[]=[
{key:'pillars',label:'Pillars',subtitle:'Entrance architecture',studies:pillars},
{key:'palms',label:'Palms',subtitle:'Pool and arrival palms',studies:palms},
{key:'trees',label:'Trees',subtitle:'Canopy and specimen trees',studies:trees},
{key:'plants',label:'Plants',subtitle:'Beds, pots and tropical planting',studies:plants},
{key:'chairs',label:'Patio Chairs',subtitle:'Pool and terrace seating',studies:chairs},
{key:'counters',label:'Kitchen Counters',subtitle:'Island and counter concepts',studies:counters},
]

const galleryGap=58
const galleryOrigins=galleries.map((_,i)=>new T.Vector3(i*galleryGap,0,0))
const localPositions=[[-8,5.6],[0,5.6],[8,5.6],[-8,-3.2],[0,-3.2],[8,-3.2],[-8,-12],[0,-12],[8,-12]] as const
for(let gi=0;gi<galleries.length;gi++){
  const origin=galleryOrigins[gi]
  const gallery=galleries[gi]
  gallery.studies.forEach((study,i)=>{const [lx,lz]=localPositions[i];study.build(origin.x+lx,origin.z+lz)})
}
k.finish()

const tabs=mount.querySelector<HTMLDivElement>('.design-lab-tabs')!
const grid=mount.querySelector<HTMLDivElement>('.design-lab-grid')!
const hint=mount.querySelector<HTMLDivElement>('.design-lab-hint')!
tabs.innerHTML=galleries.map((g,i)=>`<button data-gallery="${i}" class="${i===0?'active':''}">${g.label}</button>`).join('')
let activeGallery=0,selected=-1,orbit=.55
let goalPos=new T.Vector3(0,10.5,22),goalTarget=new T.Vector3(0,2.6,0),target=goalTarget.clone()
function renderCards(){
  const g=galleries[activeGallery]
  grid.innerHTML=`<button class="${selected<0?'active':''}" data-study="-1"><strong>Overview</strong><span>${g.subtitle}</span></button>`+g.studies.map((s,i)=>`<button class="${selected===i?'active':''}" data-study="${i}"><strong>${s.name}</strong><span>${s.detail}</span></button>`).join('')
  ;[...grid.querySelectorAll<HTMLButtonElement>('[data-study]')].forEach(b=>b.addEventListener('click',()=>chooseStudy(Number(b.dataset.study))))
  hint.textContent=`${g.label}: tap a study to inspect it. Every item is native estate geometry, not concept art.`
}
function showGallery(index:number){
  activeGallery=index;selected=-1
  ;[...tabs.querySelectorAll<HTMLButtonElement>('[data-gallery]')].forEach(b=>b.classList.toggle('active',Number(b.dataset.gallery)===index))
  const o=galleryOrigins[index]
  goalPos.set(o.x,10.5,22);goalTarget.set(o.x,2.5,-2.8)
  fill.position.set(o.x,8,9);key.target.position.set(o.x,0,-2)
  renderCards()
}
function chooseStudy(index:number){
  selected=index;renderCards()
  const o=galleryOrigins[activeGallery]
  if(index<0){goalPos.set(o.x,10.5,22);goalTarget.set(o.x,2.5,-2.8);return}
  const [lx,lz]=localPositions[index]
  const x=o.x+lx,z=o.z+lz
  const tall=['palms','trees','pillars'].includes(galleries[activeGallery].key)
  const y=tall?5.2:3.25,dist=tall?8.7:6.2
  goalPos.set(x+Math.sin(orbit)*dist,y,z+Math.cos(orbit)*dist)
  goalTarget.set(x,tall?2.5:1.0,z)
}
;[...tabs.querySelectorAll<HTMLButtonElement>('[data-gallery]')].forEach(b=>b.addEventListener('click',()=>showGallery(Number(b.dataset.gallery))))
renderCards()

let dragging=false,lastX=0
canvas.addEventListener('pointerdown',e=>{dragging=true;lastX=e.clientX;canvas.setPointerCapture(e.pointerId)})
canvas.addEventListener('pointermove',e=>{if(!dragging||selected<0)return;orbit+=(e.clientX-lastX)*.006;lastX=e.clientX;chooseStudy(selected)})
canvas.addEventListener('pointerup',()=>dragging=false)
canvas.addEventListener('pointercancel',()=>dragging=false)
function resize(){const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}
new ResizeObserver(resize).observe(canvas);resize()
function tick(){requestAnimationFrame(tick);camera.position.lerp(goalPos,.06);target.lerp(goalTarget,.08);camera.lookAt(target);renderer.render(scene,camera)}
tick()
