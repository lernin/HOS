import * as T from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { FLOOR, furnishings, type Furnishing } from './plan'
import { type EstateKit, v } from './kit'
export function furnish(k:EstateKit){
  const {box:b,cylinder:c,ellipsoid:e,beam,lathe}=k
  function cushion(x:number,y:number,z:number,w:number,h:number,d:number,tone:string,g:T.Group){
    const geo=new RoundedBoxGeometry(w,h,d,3,Math.min(.13,h*.42)),p=geo.attributes.position
    for(let i=0;i<p.count;i++){const px=p.getX(i),py=p.getY(i),pz=p.getZ(i),puff=Math.max(0,1-(px/(w*.5))**2)*Math.max(0,1-(pz/(d*.5))**2);p.setY(i,py+Math.sign(py)*puff*.028)}geo.computeVertexNormals()
    return k.mesh(geo,tone,x,y,z,g)
  }
  function vase(x:number,y:number,z:number,g:T.Group,scale=1){const m=lathe([[.12,0],[.2,.04],[.22,.23],[.16,.4],[.085,.45],[.09,.5]],'ceramic',x,y,z,g);m.scale.setScalar(scale);for(let j=0;j<3;j++)beam([v(x,y+.3,z),v(x+(j-1)*.09,y+.7,z+.03*j),v(x+(j-1)*.17,y+1+.1*j,z+.08)],.012,'bark',g)}
  function lamp(x:number,y:number,z:number,g:T.Group){c(x,y+.04,z,.19,.08,'bronze',g);c(x,y+.31,z,.025,.52,'bronze',g);c(x,y+.6,z,.28,.32,'linen',g,.21);c(x,y+.44,z,.2,.025,'glow',g)}
  function book(x:number,y:number,z:number,g:T.Group,tone='sage',a=0){const m=b(x,y,z,.32,.055,.24,tone,g,.012);m.rotation.y=a;b(x,y,z+.122,.28,.035,.008,'linen',g)}
  function chair(x:number,z:number,g:T.Group,a=0,tone='linen') {const q=new T.Group();q.position.set(x,0,z);q.rotation.y=a;g.add(q)
    for(const s of [-1,1])for(const t of [-1,1]){const leg=b(s*.27,.24,t*.24,.045,.46,.045,'walnut',q,.015);leg.rotation.z=s*-.05}
    cushion(0,.48,0,.67,.13,.67,tone,q)
    const back=new T.LatheGeometry([[.39,.57],[.44,.64],[.43,.91],[.4,.95],[.36,.9],[.35,.62],[.39,.57]].map(([r,y])=>new T.Vector2(r,y)),18,-Math.PI/2,Math.PI);k.mesh(back,tone,0,0,0,q)
    for(const s of [-1,1])beam([v(s*.34,.6,-.22),v(s*.34,.73,-.02),v(s*.32,.75,.28)],.032,'walnut',q)
  }
  function sofa(g:T.Group,tone='linen'){b(0,.23,0,3.4,.26,1.1,'walnut',g,.06)
    for(const x of [-1.1,0,1.1]){cushion(x,.49,-.07,1.06,.3,.94,tone,g);const back=cushion(x,.9,.37,1.07,.68,.3,tone,g);back.rotation.x=-.11}
    for(const x of [-1.65,1.65])b(x,.66,0,.22,.52,1.07,tone,g,.1)
    for(const x of [-1.35,1.35]){const p=cushion(x,.88,.06,.49,.5,.22,'clay',g);p.rotation.set(-.22,0,x*.12)}
    const cloth=new T.PlaneGeometry(.62,1.3,7,14),p=cloth.attributes.position
    for(let i=0;i<p.count;i++){const t=(p.getY(i)+.65)/1.3;p.setXYZ(i,p.getX(i),.66-Math.max(0,t-.63)*.87+Math.sin(p.getX(i)*24+t*2)*.014,.39-t*1.3)}cloth.computeVertexNormals();k.mesh(cloth,'sage',.7,0,0,g)
  }
  function lounge(g:T.Group,tone='linen'){c(0,.12,0,.35,.12,'bronze',g);c(0,.27,0,.12,.22,'walnut',g);cushion(0,.46,-.04,.99,.25,1.01,tone,g)
    const shell=new T.LatheGeometry([[.4,.38],[.55,.54],[.57,.81],[.52,1.02],[.45,1.06],[.38,.9],[.36,.56],[.4,.38]].map(([r,y])=>new T.Vector2(r,y)),24,-Math.PI/2,Math.PI);k.mesh(shell,tone,0,0,0,g)
    for(const s of [-1,1])e(s*.465,.74,0,.09,.27,.11,tone,g)
  }
  function dining(g:T.Group,outdoor=false){b(0,.79,0,1.4,.16,outdoor?4.2:4.8,outdoor?'travertine':'walnut',g,.12)
    for(const z of [-1.4,1.4])b(0,.39,z,.65,.72,.3,'walnut',g,.12)
    for(const z of [-1.5,0,1.5]){chair(-1.15,z,g,-Math.PI/2);chair(1.15,z,g,Math.PI/2)}chair(0,-2.55,g,Math.PI);chair(0,2.55,g)
    vase(0,.88,0,g,.65);for(const z of [-1.3,1.2]){c(0,.9,z,.22,.045,'bronze',g);e(0,.96,z,.15,.04,.15,'ceramic',g)}
    if(!outdoor){for(const z of [-1.5,0,1.5]){c(0,2.9,z,.008,2.2,'bronze',g);const ring=new T.TorusGeometry(.53,.027,7,32);const m=k.mesh(ring,'bronze',0,2.4,z,g);m.rotation.x=Math.PI/2;const n=k.mesh(new T.TorusGeometry(.49,.018,6,32),'glow',0,2.38,z,g);n.rotation.x=Math.PI/2}}
  }
  function bed(g:T.Group,tone='linen'){b(0,.26,0,2.35,.38,2.6,'walnut',g,.13);b(0,.59,-.12,2.28,.3,2.46,'linen',g,.12);b(0,.79,.02,2.35,.14,2.18,'white',g,.08)
    b(0,1.03,1.2,3.05,1.64,.18,tone,g,.12)
    for(const x of [-.56,.56]){const p=b(x,.94,.68,.89,.22,.55,'white',g,.1);p.rotation.x=-.1;const q=b(x,.89,.26,.7,.2,.4,tone,g,.1);q.rotation.y=x*.2}
    b(0,.88,-.55,2.36,.05,.75,tone,g,.04)
    for(const x of [-1.65,1.65]){c(x,.34,1.03,.37,.65,'walnut',g);lamp(x,.69,1.03,g)}
    b(0,.43,-1.78,1.6,.19,.42,tone,g,.08);for(const x of [-.6,.6])b(x,.2,-1.78,.045,.4,.32,'bronze',g)
  }
  function rug(f:Furnishing,g:T.Group){const size=f.kind==='bed'?[4.6,5.4]:f.kind==='coffee'?[6.7,7.4]:f.kind==='desk'?[5,5]:null;if(size){b(0,.015,0,size[0],.024,size[1],'rug',g,.035);b(0,.03,0,size[0]-.22,.012,size[1]-.22,'rug',g,.01)}}
  function piano(g:T.Group){const shape=new T.Shape();shape.moveTo(-.85,-1);shape.lineTo(.9,-1);shape.bezierCurveTo(1.1,-.3,.65,.05,.7,.8);shape.bezierCurveTo(.8,1.7,-.9,1.3,-.9,.4);shape.closePath()
    const geo=new T.ExtrudeGeometry(shape,{depth:.24,bevelEnabled:true,bevelSize:.055,bevelThickness:.03,bevelSegments:2});geo.rotateX(-Math.PI/2);k.mesh(geo,'black',0,.83,0,g)
    const lid=geo.clone();const m=k.mesh(lid,'black',-.3,1.25,0,g);m.rotation.z=.3
    for(const [x,z]of [[-.65,-.8],[.7,-.8],[0,.8]])b(x,.43,z,.11,.85,.11,'black',g,.02)
    b(0,.8,-1.04,1.6,.13,.33,'white',g,.025)
    for(let i=0;i<28;i++){b(-.75+i*.056,.872,-1.02,.007,.006,.3,'black',g);if(i%7!==2&&i%7!==6)b(-.72+i*.056,.895,-.95,.026,.04,.16,'black',g)}
    b(0,.46,-1.6,.9,.13,.45,'black',g,.06);for(const x of [-.32,.32])b(x,.22,-1.6,.06,.44,.3,'black',g)
  }
  for(const f of furnishings){const g=k.group(f.x,FLOOR,f.z,f.angle);g.scale.setScalar(f.scale||1);rug(f,g)
    switch(f.kind){case 'sofa':sofa(g,f.tone);break;case 'lounge':lounge(g,f.tone);break;case 'dining':dining(g);break;case 'outdoorDining':dining(g,true);break;case 'bed':bed(g,f.tone);break;case 'piano':piano(g);break
      case 'coffee':b(0,.32,0,1.86,.16,1.28,'travertine',g,.17);for(const x of [-.55,.55])c(x,.15,0,.25,.25,'travertine',g);vase(.5,.41,0,g,.5);book(-.3,.45,-.2,g);book(-.27,.505,-.16,g,'clay',.15);break
      case 'sideTable':c(0,.26,0,.15,.52,'bronze',g);c(0,.53,0,.39,.07,'marble',g,.39,32);book(.05,.61,.02,g);break
      case 'floorLamp':c(0,.045,0,.29,.09,'bronze',g);beam([v(0,.05,0),v(0,1.45,0),v(.22,1.68,0)],.022,'bronze',g);c(.22,1.59,0,.34,.42,'linen',g,.24,32);c(.22,1.375,0,.3,.015,'glow',g);break
      case 'console':b(0,.58,0,3.65,.65,.72,'walnut',g,.07);for(const x of [-1.35,1.35])b(x,.14,0,.035,.28,.6,'bronze',g);b(0,.935,0,3.68,.06,.74,'travertine',g,.025);for(let i=0;i<25;i++)b(-1.73+i*.145,.58,-.365,.045,.58,.04,'oak',g,.013);vase(.95,.98,0,g,.8);book(-.9,1,0,g);lamp(-1.2,.98,0,g);break
      case 'island':b(0,.48,0,1.9,.96,4.7,'walnut',g,.02);b(0,1.01,0,2.08,.1,4.92,'marble',g,.035);for(const z of [-2.4,2.4])b(0,.52,z,2.08,1.04,.09,'marble',g,.035)
        b(0,1.07,.8,.74,.025,1.14,'black',g,.025);for(const z of [.52,1.12]){const m=k.mesh(new T.TorusGeometry(.16,.008,5,22),'basalt',0,1.088,z,g);m.rotation.x=Math.PI/2}
        b(0,1.07,-1,.5,.025,.72,'bronze',g,.05);beam([v(.3,1.05,-1.1),v(.3,1.47,-1.1),v(0,1.47,-1.1),v(0,1.3,-1.1)],.025,'bronze',g)
        for(const z of [-1.4,0,1.4]){for(const x of [1.4,1.8])for(const a of [-.2,.2])b(x,.41,z+a,.035,.78,.035,'walnut',g,.01);cushion(1.6,.83,z,.65,.13,.65,'clay',g);const foot=k.mesh(new T.TorusGeometry(.23,.015,6,20),'bronze',1.6,.28,z,g);foot.rotation.x=Math.PI/2;c(0,2.9,z,.25,.36,'bronze',g);c(0,2.7,z,.2,.015,'glow',g);c(0,3.2,z,.01,.6,'bronze',g)}
        {const bowl=lathe([[0,0],[.1,0],[.26,.13],[.28,.17],[.25,.18],[.08,.05],[0,.05]],'ceramic',0,1.065,1.8,g);bowl.scale.z=1.3;for(let i=0;i<3;i++)e((i-1)*.11,1.21,1.8+(i%2)*.12,.095,.09,.085,i%2?'leafLight':'clay',g)}break
      case 'bath':{const bowl=lathe([[0,.13],[.3,.08],[.5,.15],[.65,.45],[.66,.65],[.6,.7],[.53,.63],[.51,.36],[.3,.24],[0,.23]],'white',0,.03,0,g);bowl.scale.x=1.85;beam([v(1.12,0,.7),v(1.12,.93,.7),v(.8,.93,.7),v(.8,.83,.7)],.028,'bronze',g);break}
      case 'wardrobeIsland':b(0,.5,0,1.5,1,2.6,'walnut',g,.035);b(0,1.03,0,1.54,.05,2.64,'travertine',g,.03);for(const z of [-.7,0,.7])b(.765,.62,z,.02,.015,.23,'bronze',g);break
      case 'desk':b(0,.77,0,3.2,.12,1.15,'walnut',g,.1);for(const x of [-1.1,1.1])b(x,.36,0,.45,.7,.92,'walnut',g,.07);chair(0,.85,g);chair(-.8,-1,g,Math.PI);chair(.8,-1,g,Math.PI);lamp(-1,.85,0,g);book(.9,.87,0,g);b(0,.94,0,.6,.015,.42,'black',g,.02);break
      case 'treadmill':b(0,.18,0,1,.3,2.2,'bronze',g,.1);b(0,.35,0,.75,.03,1.8,'black',g);for(const x of [-.48,.48])beam([v(x,.25,-.7),v(x,1.2,-.7),v(x,1.15,-.2)],.035,'bronze',g);b(0,1.2,-.7,.7,.25,.15,'black',g,.045);break
      case 'treatment':b(0,.62,0,1.35,.2,2.4,'linen',g,.12);b(0,.32,0,.65,.55,1.4,'oak',g,.07);cushion(0,.8,.75,.6,.2,.55,'white',g);break
      case 'fire':b(0,.3,0,2.2,.6,1.3,'travertine',g,.07);b(0,.62,0,1.75,.05,.65,'basalt',g,.04);for(let i=0;i<9;i++)e(-.72+i*.18,.75,0,.035,.14+Math.sin(i)*.05,.04,'glow',g,8);break
      case 'lounger':b(0,.32,0,.88,.17,2.15,'oak',g,.06);cushion(0,.47,-.2,.82,.15,1.5,'linen',g);{const m=b(0,.73,.74,.83,.12,.7,'linen',g,.08);m.rotation.x=.6}for(const z of [-.7,.7])b(0,.17,z,.73,.27,.05,'bronze',g);break
    }
  }
  // Built-ins are deliberately architectural: toe kicks, reveals, timber bays.
  for(let i=0;i<11;i++){const z=3.5+i*.82;b(-22.45,FLOOR+1.15,z,.85,2.28,.79,'walnut',k.root,.025);b(-21.99,FLOOR+1.2,z,.015,.46,.025,'bronze');if(i===3||i===4)b(-21.98,FLOOR+1.45,z,.018,.48,.66,'black')}
  for(const x of [24.7,30.3])for(let i=0;i<6;i++){const z=3.7+i*1.38;b(x,FLOOR+1.25,z,.7,2.5,1.32,'walnut');b(x+(x<27?.36:-.36),FLOOR+2.35,z,.025,.028,1.19,'glow');for(const y of [.12,.55,1.9,2.5])b(x,FLOOR+y,z,.75,.05,1.32,'oak');for(let j=0;j<4;j++){const q=b(x,FLOOR+1.25,z-.43+j*.28,.35,1,.19,['linen','sage','indigo'][j%3],k.root,.06);q.rotation.z=.03*(j-2)}}
  b(34.6,FLOOR+.7,12.25,6.2,.46,.9,'walnut',k.root,.05);b(34.6,FLOOR+.98,12.25,6.3,.1,1,'travertine',k.root,.035)
  for(const x of [33,36.2]){c(x,FLOOR+1.08,12.1,.34,.16,'white',k.root,.4);b(x,FLOOR+2.1,12.83,1.65,1.65,.03,'bronze',k.root,.08);b(x,FLOOR+2.1,12.8,1.55,1.55,.03,'glass',k.root,.08);beam([v(x,FLOOR+1,12.55),v(x,FLOOR+1.4,12.55),v(x,FLOOR+1.4,12.25)],.025,'bronze')}
  for(let i=0;i<10;i++){const x=10.5+i*.84;b(x,FLOOR+1.55,27.45,.8,3.1,.65,'walnut');for(const y of [.45,1.15,1.9,2.65]){b(x,FLOOR+y,27.08,.78,.04,.73,'oak');for(let j=0;j<5;j++){const h=.18+((i+j)%3)*.06;b(x-.28+j*.125,FLOOR+y+h/2+.04,26.94,.09,h,.2,['linen','sage','clay'][j%3])}}}
  // Quiet media wall, yoga mats, cedar sauna and towel stacks.
  b(-32.7,FLOOR+1.9,-1.72,5.4,2.6,.11,'black',k.root,.04);b(-32.7,FLOOR+.4,-1.55,6.8,.5,.55,'walnut',k.root,.05)
  for(let i=0;i<3;i++)b(-36+i*2.1,FLOOR+.025,21,1.1,.04,2.3,'sage',k.root,.06)
  for(let i=0;i<14;i++)b(-38.6+i*.23,FLOOR+1.2,38.7,.18,2.4,.1,'oak')
  for(const z of [35.2,37.6])b(-37,FLOOR+.5,z,3.2,.28,.75,'oak',k.root,.045)
  for(let i=0;i<4;i++)b(-28.5,FLOOR+.65+i*.09,36,.8,.085,.46,'white',k.root,.04)
  // Original sculptural wall art: physical stone disks, no texture downloads.
  for(const [x,z] of [[-5.78,11],[19.78,25],[24.23,0]]){const g=k.group(x,FLOOR+2.2,z,Math.PI/2);b(0,0,0,2.1,2.1,.06,'walnut',g);for(let i=0;i<3;i++){const m=c((i-1)*.42,0,.06,.45,.06,['ceramic','basalt','travertine'][i],g);m.rotation.x=Math.PI/2}}
}
