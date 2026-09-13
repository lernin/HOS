import * as T from 'three'
import { floors, walls, glass, lintels, furnishings, footprint, contains, FLOOR } from './plan'
import { type EstateKit, random, v } from './kit'
export function architecture(k:EstateKit){
  for(const f of floors){const w=f.x2-f.x1,d=f.z2-f.z1,x=(f.x1+f.x2)/2,z=(f.z1+f.z2)/2,y=f.level??FLOOR
    if(f.name==='Arrival steps'){for(let i=0;i<14;i++)k.box(x,FLOOR-i*1.2/14-.16,24+i*.5+.25,w,.32,.5,'travertine');continue}
    if(f.name==='Arrival court')k.cylinder(1,y-.2,41,19,.4,'basalt',k.root,19,96);else k.box(x,y-.2,z,w,.4,d,f.material==='oak'?'oakFloor':f.material)
    if(f.material==='limestone'||f.material==='travertine'){
      for(let a=f.x1+2.8;a<f.x2;a+=2.8)k.box(a,y+.004,z,.011,.005,d,'rug')
      for(let a=f.z1+1.65;a<f.z2;a+=1.65)k.box(x,y+.005,a,w,.005,.01,'rug')
    }
    if(f.roof){k.box(x,y+f.roof+.22,z,w+.65,.4,d+.65,'travertine');k.box(x,y+f.roof+.43,z,w-.25,.03,d-.25,'roof');k.box(x,y+f.roof-.02,z,w,.035,d,'plaster')
      // Roof fascia/reveal, warm soffit, clerestory scale instead of flat boxes.
      k.box(x,y+f.roof+.05,f.z1-.27,w+.7,.085,.14,'bronze')
      for(const a of [-1,1])k.box(x+a*(w/2-.32),y+f.roof-.05,z,.045,.025,d-.5,'glow')
    }
  }
  for(const w of lintels)k.box((w.x1+w.x2)/2,FLOOR+w.base+w.height/2,(w.z1+w.z2)/2,w.x2-w.x1,w.height,w.z2-w.z1,w.material)
  for(const w of walls)k.box((w.x1+w.x2)/2,FLOOR+w.height/2,(w.z1+w.z2)/2,w.x2-w.x1,w.height,w.z2-w.z1,w.material)
  for(const w of glass){const x=(w.x1+w.x2)/2,z=(w.z1+w.z2)/2,dx=w.x2-w.x1,dz=w.z2-w.z1,roof=floors.filter(f=>f.roof&&contains(f,{x,z},.15)).reduce((h,f)=>Math.max(h,f.roof!),w.height),height=roof-.035;k.box(x,FLOOR+height/2,z,dx,height,dz,'glass')
    for(const y of [.08,height])k.box(x,FLOOR+y,z,dx+.06,.055,dz+.06,'bronze')
    const count=Math.ceil(Math.max(dx,dz)/2.9)
    for(let i=0;i<=count;i++)k.box(w.x1+dx*i/count,FLOOR+height/2,w.z1+dz*i/count,.048,height,.048,'bronze')
  }
  // Great-room ceiling: floating timber fins and a tall stone hearth.
  for(let i=0;i<28;i++)k.box(-10.7+i*.84,FLOOR+5.28,-2,.085,.23,19.7,'oak')
  k.box(-10.76,FLOOR+2.7,0,.39,5.4,3.1,'travertine')
  k.box(-10.54,FLOOR+.75,0,.045,.6,2.4,'black')
  for(let i=0;i<11;i++)k.ellipsoid(-10.49,FLOOR+.58+.03*(i%3),-.95+i*.18,.02,.09,.06,'glow',k.root,8)
  for(const x of [-1.3,3.3]){const g=k.group(x,FLOOR,24,x<0?1.05:-1.05);k.box(x<0?1.04:-1.04,1.8,0,2.04,3.6,.13,'walnut',g,.035);k.box(x<0?1.8:-1.8,1.7,-.1,.03,1.1,.04,'bronze',g)}
  // Covered arrival portal: Design Lab study 4, Fluted Stone, scaled to the real stair approach.
  k.box(1,FLOOR+4,26.6,13,.28,6,'travertine')
  const arrivalGround=FLOOR-10*1.2/14,arrivalRoofBottom=FLOOR+4-.14
  const foundationH=.28,plinthH=.18,capH=.14,shaftBottom=arrivalGround+foundationH+plinthH,shaftTop=arrivalRoofBottom-capH,pillarH=shaftTop-shaftBottom,shaftY=shaftBottom+pillarH/2
  for(const x of [-5,7]){
    // Two-stage stone foundation lands visibly on the stair paving.
    k.box(x,arrivalGround+foundationH/2,29.2,1.06,foundationH,.92,'travertine',k.root,.07)
    k.box(x,arrivalGround+foundationH+plinthH/2,29.2,.90,plinthH,.80,'limestone',k.root,.045)
    // The chosen fluted column is deliberately slim relative to the roof span.
    k.box(x,shaftY,29.2,.82,pillarH,.72,'travertine',k.root,.045)
    for(const dx of [-.28,-.14,.14,.28])k.box(x+dx,shaftY,29.585,.065,pillarH-.24,.055,'limestone',k.root,.018)
    k.box(x,shaftY,29.62,.062,pillarH-.55,.05,'glow',k.root,.016)
    k.box(x,arrivalRoofBottom-capH/2,29.2,.92,capH,.82,'bronze',k.root,.035)
  }
  for(const [x,z] of [[-3,11],[5,11],[-3,21],[5,21]]){k.cylinder(x,FLOOR+.44,z,.22,.88,'travertine');k.ellipsoid(x,FLOOR+1.16,z,.32,.38,.19,'bronze')}
  for(let i=0;i<5;i++){const m=k.mesh(new T.TorusGeometry(1.1+i*.07,.025,6,32),'bronze',1,FLOOR+3.2+i*.12,17);m.rotation.x=1.05+i*.09}
  // Deep terrace edge and concealed waterline conceal intersections with cliffs.
  for(const x of [-15.1,16.1])k.box(x,FLOOR-1.7,-29.2,.35,3.4,13.8,'travertine')
  k.box(.5,FLOOR-1.54,-36.1,23.4,2.8,.25,'travertine')
  k.box(.5,FLOOR-1.5,-30.2,23,0.2,12,'waterTile')
  for(const x of [-10.95,11.95])k.box(x,FLOOR-.85,-30.2,.15,1.35,12,'waterTile')
  // Railings sit at the walkable perimeter, never across a route.
  for(const [a,b] of [[v(-23,FLOOR,-24),v(-15,FLOOR,-24)],[v(16,FLOOR,-24),v(27,FLOOR,-24)],[v(44,FLOOR,-14),v(44,FLOOR,14)],[v(27,FLOOR,-23),v(40,FLOOR,-23)]]){
    const mid=a.clone().lerp(b,.5),d=a.distanceTo(b),g=k.group(mid.x,FLOOR,mid.z,Math.atan2(b.x-a.x,b.z-a.z));k.box(0,.65,0,.035,1.24,d,'glass',g);k.box(0,1.28,0,.045,.04,d,'bronze',g);for(let i=0;i<=d/2;i++)k.box(0,.62,-d/2+i*2,.035,1.24,.035,'bronze',g)
  }
  // Pergola over outdoor dining, secondary circulation remains open.
  for(const x of [17,25])for(const z of [-21.6,-13.2])k.box(x,FLOOR+1.7,z,.17,3.4,.17,'bronze')
  for(let i=0;i<20;i++)k.box(17+i*.42,FLOOR+3.45,-17.4,.13,.2,9.3,'oak')
}
export function landscape(k:EstateKit){
  const rand=random(82031),b=k.box
  const coastZ=(a:number,r:number)=>7+Math.sin(a)*64*r*(Math.sin(a)<0?.7+.3*Math.min(1,Math.abs(Math.cos(a))*3):1)
  // All scattered planting excludes the constructed footprint, including the
  // pool void. The perimeter moved during art direction; scatter must follow it.
  const unbuilt=(x:number,z:number,pad=1)=>!floors.some(f=>contains(f,{x,z},pad))&&!contains({x1:-15,x2:16,z1:-38,z2:-23},{x,z},pad)
  function terrainHeight(x:number,z:number,r:number){const arrival=Math.max(0,Math.min(1,(z-24)/9));return 5.5-arrival*1.05-Math.pow(Math.max(0,(r-.7)/.3),1.3)*8+Math.sin(x*.14)*Math.sin(z*.18)*.24}
  const verts:number[]=[],ids:number[]=[],segments=100,rings=20
  for(let j=0;j<=rings;j++)for(let i=0;i<=segments;i++){const a=i/segments*Math.PI*2,r=j/rings,edge=1+.04*Math.sin(a*7)+.025*Math.sin(a*13),x=Math.cos(a)*58*r*edge,z=coastZ(a,r)*edge;verts.push(x,terrainHeight(x,z,r),z)}
  for(let j=0;j<rings;j++)for(let i=0;i<segments;i++){const a=j*(segments+1)+i,c=a+segments+1;ids.push(a,a+1,c,a+1,c+1,c)}
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(verts,3));geo.setIndex(ids);geo.computeVertexNormals();k.mesh(geo,'soil')
  function rock(x:number,y:number,z:number,sx:number,sy:number,sz:number,seed:number){const g=k.rockGeometry(seed),p=g.attributes.position;for(let i=0;i<p.count;i++){const yy=p.getY(i);p.setY(i,Math.round(yy*7)/7*.5+yy*.5)}g.computeVertexNormals();const m=k.mesh(g,seed%3===0?'basalt':'concrete',x,y,z);m.scale.set(sx,sy,sz);m.rotation.set(.1,seed,seed*.04)}
  for(let i=0;i<150;i++){const a=i/150*Math.PI*2,r=.9+rand()*.09,x=Math.cos(a)*58*r,z=coastZ(a,r);rock(x,(Math.abs(x)<22&&z<0?-3.8:-.8)+rand(),z,2+rand()*3,1.5+rand()*3,2+rand()*3,i+24)}
  // Courtyard garden, raised beds and water rill.
  b(-16,FLOOR+.17,22.5,8,.34,9,'travertine',k.root,.12);b(-16,FLOOR+.35,22.5,7.65,.03,8.65,'soil')
  k.lathe([[0,0],[1.5,0],[1.5,.38],[1.3,.5],[1.12,.38],[0,.28]],'travertine',-15.6,FLOOR+.37,25)
  k.cylinder(-15.6,FLOOR+.71,25,1.18,.025,'waterTile')
  k.lathe([[.55,0],[.6,.1],[.25,.7],[.22,.95],[.65,1.02],[.68,1.1],[.15,1.15]],'bronze',-15.6,FLOOR+.6,25)
  k.cylinder(1,4.91,41,4,.2,'travertine',k.root,4,48);k.cylinder(1,5.08,41,3.45,.17,'waterTile',k.root,3.45,48)
  k.lathe([[1.1,0],[1.2,.2],[.6,1],[.45,1.4],[1.1,1.6],[1.15,1.8]],'travertine',1,5.18,41)
  // Arrival court is encircled by planted edges, not an exposed square plane.
  for(let i=0;i<48;i++){const a=i/48*Math.PI*2;k.cylinder(1+Math.cos(a)*4.4,5,41+Math.sin(a)*4.4,.18,.18,'leafDark',k.root,.24,6)}
  function frond(g:T.Group,angle:number,length:number){const points=[v(0,0,0),v(Math.cos(angle)*length*.4,length*.28,Math.sin(angle)*length*.4),v(Math.cos(angle)*length,length*.03,Math.sin(angle)*length)];k.beam(points,.027,'leafLight',g,5)
    for(let i=1;i<=10;i++){const t=i/11,cx=Math.cos(angle)*length*t,cz=Math.sin(angle)*length*t,cy=Math.sin(t*Math.PI)*length*.25;for(const s of [-1,1]){
      const l=length*.34*Math.sin(t*Math.PI),dx=Math.cos(angle+s*.85)*l,dz=Math.sin(angle+s*.85)*l
      const p=[cx,cy,cz,cx+dx*.5,cy+.08,cz+dz*.5,cx+dx,cy-.2*t,cz+dz,cx+dx*.48+Math.sin(angle)*.16,cy-.035,cz+dz*.48-Math.cos(angle)*.16]
      const geom=new T.BufferGeometry();geom.setAttribute('position',new T.Float32BufferAttribute(p,3));geom.setIndex([0,1,2,0,2,3,2,1,0,3,2,0]);geom.computeVertexNormals();k.mesh(geom,i%3===0?'leafLight':'leaf',0,0,0,g)
    }}
  }
  function palm(x:number,y:number,z:number,height:number,seed:number){const g=k.group(x,y,z,seed);k.beam([v(0,0,0),v(.18,height*.3,.05),v(.45,height*.7,.12),v(.62,height,.15)],.14,'bark',g,8)
    for(let i=0;i<14;i++){const t=i/14;k.cylinder(t*.62,t*height,.15*t,.15,.045,'walnut',g,.145,8)}
    const top=new T.Group();top.position.set(.62,height,.15);g.add(top);for(let i=0;i<9;i++)frond(top,i*Math.PI*2/9,2.2+(seed%3)*.2)
  }
  function tree(x:number,y:number,z:number,size:number,seed:number){const g=k.group(x,y,z,seed);g.scale.setScalar(size)
    k.beam([v(0,-.15,0),v(.15,1.5,.1),v(-.1,3,.15),v(.5,4.6,.1)],.24,'bark',g,9)
    for(let i=0;i<5;i++){const a=i*2.4+seed,dx=Math.cos(a)*1.7,dz=Math.sin(a)*1.7;k.beam([v(0,1.6+i*.38,.1),v(dx*.5,3+i*.25,dz*.5),v(dx,4+i*.23,dz)],.08,'bark',g)
      for(let j=0;j<8;j++){const m=k.mesh(new T.IcosahedronGeometry(1,1),j%3===0?'leafLight':j%3===1?'leaf':'leafDark',dx+Math.cos(j*2.4)*.83,4+i*.23+Math.sin(j*1.4)*.32,dz+Math.sin(j*2.4)*.83,g);m.scale.set(.75,.4,.69);m.rotation.y=seed+j}
    }for(let i=0;i<5;i++){const a=i*1.256;k.beam([v(0,.4,0),v(Math.cos(a)*.45,.12,Math.sin(a)*.45),v(Math.cos(a)*.9,.01,Math.sin(a)*.9)],.1,'bark',g)}
  }
  function grasses(x:number,y:number,z:number,s=1){const g=k.group(x,y,z,rand()*6.28);g.scale.setScalar(s);for(let i=0;i<9;i++){const a=i*2.4,h=.45+rand()*.55,dx=Math.cos(a)*.4,dz=Math.sin(a)*.4;const p=[0,0,0,dx*.3-.03,h*.55,dz*.3,dx,h,dz,dx*.3+.03,h*.5,dz*.3];const geom=new T.BufferGeometry();geom.setAttribute('position',new T.Float32BufferAttribute(p,3));geom.setIndex([0,1,2,0,2,3,2,1,0,3,2,0]);geom.computeVertexNormals();k.mesh(geom,i%2?'leaf':'leafLight',0,0,0,g)}}
  tree(-17.6,FLOOR+.37,20.8,1.05,4);tree(-29,5.2,30,1.1,3);tree(46,4,-7,1.25,1);tree(-30,5.1,-25,1.5,8);tree(18,4.7,43,1.2,9)
  for(const [x,z,s] of [[-8,28,4.2],[10,28,4.7],[-21,-21,4],[25,-22,4.8],[-34,41,4.5],[44,21,4.2]])palm(x,Math.min(FLOOR,terrainHeight(x,z,.65)),z,s,x)
  for(let i=0;i<42;i++){const a=i/42*Math.PI*2,r=.75+rand()*.06,x=Math.cos(a)*58*r,z=coastZ(a,r);if(!unbuilt(x,z,2)||(x>42&&z<-12)||(Math.abs(x)<21&&z<-25))continue;if(i%4===0)tree(x,terrainHeight(x,z,r),z,.75+rand()*.45,i);else palm(x,terrainHeight(x,z,r),z,3.5+rand()*2,i)}
  for(let i=0;i<210;i++){const a=rand()*Math.PI*2,r=.7+rand()*.18,x=Math.cos(a)*58*r,z=coastZ(a,r);if(!unbuilt(x,z,.5))continue;grasses(x,terrainHeight(x,z,r)+.05,z,1+rand());if(i%6===0)rock(x,terrainHeight(x,z,r),z,.7,.5,.65,i)}
  for(let i=0;i<32;i++){const x=-19.5+rand()*6.8,z=18.5+rand()*8;if(Math.hypot(x+15.6,z-25)>1.8)grasses(x,FLOOR+.4,z,.55+rand()*.6)}
  // Pots have modeled lips and soil; crowns use the same coherent frond language.
  for(const [x,z]of [[-9,-10],[11,-10],[-9,6],[11,6],[25,-10],[38,0],[9,26],[-22,12],[-34,-3],[-27,27],[42,-12],[42,12],[-7,22]]){
    k.lathe([[.3,0],[.4,.06],[.49,.78],[.52,.82],[.49,.89],[.44,.88],[.42,.77]],'ceramic',x,FLOOR,z);k.cylinder(x,FLOOR+.79,z,.43,.03,'soil');const g=k.group(x,FLOOR+.85,z,x);for(let i=0;i<7;i++)frond(g,i*6.28/7,1.2)
  }
  // Garden lanterns: emissive diffusers, no costly point lights per fixture.
  for(const [x,z]of [[-4,29],[6,29],[-8,32],[10,32],[-22,18],[-22,30],[22,37],[18,-22],[-18,-22],[42,5]]){b(x,FLOOR+.23,z,.22,.46,.22,'bronze',k.root,.025);b(x,FLOOR+.26,z,.18,.17,.18,'glow')}
}
export type LightPreset='daylight'|'golden'|'evening'
export function atmosphere(scene:T.Scene){
  const mat=new T.ShaderMaterial({side:T.BackSide,depthWrite:false,uniforms:{night:{value:0}},vertexShader:'varying vec3 skyDirection;void main(){skyDirection=position;gl_Position=projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.);}',fragmentShader:`varying vec3 skyDirection;uniform float night;void main(){vec3 d=normalize(skyDirection);float h=pow(max(0.,d.y),.5);vec3 horizon=mix(vec3(.72,.69,.59),vec3(.15,.20,.28),night);vec3 zenith=mix(vec3(.13,.32,.43),vec3(.025,.065,.14),night);vec3 col=mix(horizon,zenith,smoothstep(0.,.7,h));float sun=pow(max(0.,dot(d,normalize(vec3(-.45,.19,-.85)))),900.);float halo=pow(max(0.,dot(d,normalize(vec3(-.45,.19,-.85)))),20.);col+=vec3(1.,.64,.3)*(sun*.65+halo*.13)*(1.-night);gl_FragColor=vec4(col,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>}`})
  const mesh=new T.Mesh(new T.SphereGeometry(2400,24,12),mat);mesh.frustumCulled=false;scene.add(mesh)
  return {preset(p:LightPreset){mat.uniforms.night.value=p==='evening'?1:0},dispose(){mesh.geometry.dispose();mat.dispose()}}
}
export function contactShadows(scene:T.Scene){
  const size=64,data=new Uint8Array(size*size*4)
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){const nx=(x/(size-1)-.5)*2,ny=(y/(size-1)-.5)*2,d=Math.pow(Math.abs(nx),4)+Math.pow(Math.abs(ny),4),i=(y*size+x)*4;data[i]=21;data[i+1]=28;data[i+2]=22;data[i+3]=Math.round(Math.pow(Math.max(0,1-d),2)*100)}
  const tex=new T.DataTexture(data,size,size);tex.needsUpdate=true;tex.magFilter=T.LinearFilter;tex.minFilter=T.LinearFilter
  const mat=new T.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,toneMapped:false}),geo=new T.PlaneGeometry(1,1)
  const mesh=new T.InstancedMesh(geo,mat,furnishings.length),dummy=new T.Object3D()
  furnishings.forEach((f,i)=>{const r=footprint(f);dummy.position.set(f.x,FLOOR+.047,f.z);dummy.rotation.x=-Math.PI/2;dummy.scale.set(r.x2-r.x1+.7,r.z2-r.z1+.7,1);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix)})
  mesh.renderOrder=1;scene.add(mesh);return {dispose(){tex.dispose();mat.dispose();geo.dispose()}}
}
export function waters(scene:T.Scene){
  const common={time:{value:0},evening:{value:0},sunColor:{value:new T.Color('#ffe0ab')}}
  const water=new T.ShaderMaterial({uniforms:{...common,pool:{value:0}},side:T.DoubleSide,vertexShader:`varying vec3 wp;uniform float time;uniform float pool;void main(){vec3 p=position;if(pool<.5)p.z+=sin(p.x*.055+time*.35)*.24+sin(p.y*.083-time*.3)*.19;vec4 w=modelMatrix*vec4(p,1.);wp=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,fragmentShader:`
    uniform float time;uniform float evening;uniform float pool;varying vec3 wp;
    void main(){
      vec2 p=wp.xz;
      float a=sin(p.x*.65+time*.65+sin(p.y*.5))*sin(p.y*.75-time*.45);
      float b=sin(p.x*3.3+p.y*1.4-time)*sin(p.y*2.7+time*.7);
      vec3 n=normalize(vec3(a*.075+b*.018,1.,cos(p.y*.7-time*.6)*.08));
      vec3 view=normalize(cameraPosition-wp);
      float fres=pow(1.-max(0.,dot(n,view)),4.);
      vec3 deep=mix(vec3(.012,.09,.14),vec3(.009,.125,.145),pool);
      vec3 sky=mix(vec3(.42,.57,.61),vec3(.15,.24,.32),evening);
      vec3 col=deep;
      if(pool>.5){
        // Refract the view ray onto a shallow analytical pool bed. This gives
        // tile parallax and depth without an extra scene render on phones.
        vec3 ray=refract(-view,n,.75);
        vec2 bed=p+ray.xz*(1.37/max(.16,-ray.y));
        vec2 uv=fract(bed*1.45),edge=min(uv,1.-uv);
        float grout=1.-smoothstep(.014,.038,min(edge.x,edge.y));
        float ribs=abs(sin(bed.x*4.+sin(bed.y*3.+time*.4))+sin(bed.y*3.7+time*.27));
        float caustic=1.-smoothstep(.03,.2,ribs);
        vec3 bedColor=vec3(.025,.23,.215)*(1.-grout*.16)+vec3(.02,.043,.034)*caustic;
        col=mix(col,bedColor,.5*max(.1,dot(view,n)));
      }
      col=mix(col,sky,fres*.4);
      float spec=pow(max(0.,dot(reflect(-normalize(vec3(-.5,.24,-.8)),n),view)),140.);
      col+=vec3(1.,.79,.45)*spec*.55*(1.-evening*.8);
      col+=a*.005+b*.003;
      float shore=(1.-smoothstep(54.,62.,length(vec2(p.x,(p.y-7.)*.91))))*smoothstep(48.,55.,length(vec2(p.x,(p.y-7.)*.91)));
      col+=(1.-pool)*shore*(.1+.06*sin(length(p)*3.-time));
      float haze=1.-exp(-distance(cameraPosition,wp)*.0016);
      col=mix(col,sky,haze);col*=1.-evening*.48;
      gl_FragColor=vec4(col,1.);#include <tonemapping_fragment>\n#include <colorspace_fragment>}
  `.replace(';#include',';\n#include')})
  const ocean=new T.Mesh(new T.PlaneGeometry(4500,4500,100,100),water);ocean.rotation.x=-Math.PI/2;ocean.position.set(0,-1.1,-400);scene.add(ocean)
  const poolMat=water.clone();poolMat.uniforms.pool.value=1
  const pool=new T.Mesh(new T.PlaneGeometry(22.8,11.8),poolMat);pool.rotation.x=-Math.PI/2;pool.position.set(.5,FLOOR-.13,-30.1);scene.add(pool)
  const spa=new T.Mesh(new T.PlaneGeometry(4.7,3.5),poolMat);spa.rotation.x=-Math.PI/2;spa.position.set(-32.5,FLOOR+.03,37);scene.add(spa)
  // Infinity overflow is a narrow, softly moving lip, not a chrome mirror.
  const lip=new T.Mesh(new T.PlaneGeometry(22.8,1.4),poolMat);lip.position.set(.5,FLOOR-.83,-36.05);scene.add(lip)
  return {update(t:number,p:LightPreset){for(const m of [water,poolMat]){m.uniforms.time.value=t;m.uniforms.evening.value=p==='evening'?1:0}},dispose(){for(const o of [ocean,pool,spa,lip])o.geometry.dispose();water.dispose();poolMat.dispose()}}
}
