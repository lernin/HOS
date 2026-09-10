import * as T from 'three'
import { groundHeight, waterHeight, riverWidth, riverCenter, nearestPath, obstacles, paths, tree, smooth } from './world'
import { geometry, palette as c, vec, type Kit } from './kit'

export function addLandscape(scene:T.Scene,k:Kit) {
  const size=88,n=240,vertices:number[]=[],indices:number[]=[],colors:number[]=[]
  const green=new T.Color(),grassA=new T.Color('#577b36'),grassB=new T.Color('#91a64f'),rockColor=new T.Color('#838e86')
  for(let iz=0;iz<=n;iz++)for(let ix=0;ix<=n;ix++) {
    const x=(ix/n-.5)*size,z=(iz/n-.5)*size,y=groundHeight(x,z)
    vertices.push(x,y,z)
    const gradient=Math.hypot(groundHeight(x+.15,z)-y,groundHeight(x,z+.15)-y)/.15
    green.copy(grassA).lerp(grassB,.5+.24*Math.sin(x*.61)*Math.sin(z*.36)+.18*Math.sin(x*2.4+z*.74))
    green.lerp(rockColor,smooth(.55,1.9,gradient)*.75)
    const q=nearestPath(x,z,true),pathBlend=1-smooth(q.width*.46,q.width*.5+.2,q.distance)
    green.lerp(new T.Color('#b4a37a'),pathBlend)
    colors.push(green.r,green.g,green.b)
    if(ix<n&&iz<n){const a=iz*(n+1)+ix,b=a+n+1;indices.push(a,b,a+1,a+1,b,b+1)}
  }
  const material=new T.MeshStandardMaterial({vertexColors:true,roughness:1})
  const ground=new T.Mesh(geometry(vertices,indices,undefined,colors),material);ground.receiveShadow=true;ground.castShadow=true;scene.add(ground)
  // Weathered boulder groups follow the channel's curved edge and steep elevation change.
  for(let z=-29;z<31;z+=.9)for(const side of [-1,1]) {
    const x=riverCenter(z)+side*(riverWidth(z)+.48+k.rand()*.28)
    const q=nearestPath(x,z,true);if(q.distance<q.width*.5+.32)continue
    const y=groundHeight(x,z),scale=.35+k.rand()*.42
    k.rock(x,y-.07,z,scale,.26+k.rand()*.38,scale*.8,['#818f8a','#969e8e','#727f7e'][Math.floor(k.rand()*3)])
    if(k.rand()>.44)k.rock(x,y+.13,z,.4,.09,.32,c.moss)
  }
  for(const o of obstacles){const y=groundHeight(o.x,o.z);k.rock(o.x,y+.48,o.z,o.r,o.r*.95,o.r*.81);k.rock(o.x-.12,y+o.r*.88,o.z,o.r*.74,.14,o.r*.61,c.moss)}
  for(let z=-20;z<-1;z+=1.4)for(const side of [-1,1]) {
    const x=riverCenter(z)+side*(riverWidth(z)+1.1),y=groundHeight(x,z)
    if(nearestPath(x,z,true).distance<1.8)continue
    k.rock(x,y-.7,z,.85,1.45,1.3,['#7b8988','#89928d','#94988c'][Math.floor(k.rand()*3)])
  }
  // Moss and fern pockets will hide these buried feet, leaving irregular rock faces exposed.
  for(let i=0;i<32;i++) {
    const x=(i%2?1:-1)*(25+k.rand()*7),z=-28+k.rand()*56,y=groundHeight(x,z)
    k.rock(x,y-.5,z,2+k.rand()*2,2.6+k.rand()*3.6,2+k.rand()*3,'#7d8e89')
  }
  // Alpine ridges are continuous irregular meshes with broken snowlines, never isolated cones.
  for(let layer=0;layer<3;layer++) {
    const verts:number[]=[],inds:number[]=[],cols:number[]=[],col=new T.Color()
    for(let row=0;row<8;row++)for(let i=0;i<=90;i++) {
      const x=(i/90-.5)*290,z=-66-layer*34-row*3.5
      const peak=17+layer*9+Math.pow(.5+.5*Math.sin(x*.1+layer),2)*22+Math.sin(x*.39+layer)*3
      const y=-5+Math.sin(row/7*Math.PI)*peak
      verts.push(x,y,z)
      col.set(layer===0?'#7d9c99':layer===1?'#8facb2':'#b5cbd2')
      if(y>peak*.68 && layer>0)col.set('#d9e7e5')
      cols.push(col.r,col.g,col.b)
      if(row<7&&i<90){const a=row*91+i;inds.push(a,a+91,a+1,a+1,a+91,a+92)}
    }
    const m=new T.Mesh(geometry(verts,inds,undefined,cols),new T.MeshStandardMaterial({vertexColors:true,roughness:1,side:T.DoubleSide}));scene.add(m)
  }
  // Great tree: tapered, twisting trunk and real sweeping roots support the library.
  function branch(points:T.Vector3[],radius:number,end:number) {
    const curve=new T.CatmullRomCurve3(points),frames=curve.computeFrenetFrames(24,false),verts:number[]=[],idx:number[]=[]
    for(let i=0;i<=24;i++) {
      const q=curve.getPoint(i/24),r=radius+(end-radius)*i/24
      for(let j=0;j<12;j++) {
        const a=j/12*Math.PI*2,rr=r*(1+.09*Math.sin(j*2.5+i*.3))
        const off=frames.normals[i].clone().multiplyScalar(Math.cos(a)*rr).addScaledVector(frames.binormals[i],Math.sin(a)*rr)
        verts.push(q.x+off.x,q.y+off.y,q.z+off.z)
        if(i<24){const a=i*12+j,b=i*12+(j+1)%12;idx.push(a,b,a+12,b,b+12,a+12)}
      }
    }
    k.add(geometry(verts,idx),c.timber)
  }
  branch([vec(tree.x,tree.y-.3,tree.z),vec(tree.x-.4,tree.y+5,tree.z),vec(tree.x+.4,tree.y+10,tree.z-.4),vec(tree.x-.6,tree.y+14,tree.z)],1.65,.55)
  for(let i=0;i<9;i++) {
    const a=i*2.4,r=3.2+k.rand()*.4
    const x=tree.x+Math.cos(a)*r,z=tree.z+Math.sin(a)*r
    branch([vec(tree.x,tree.y+1.1,tree.z),vec(tree.x+Math.cos(a)*1.7,tree.y+.5,tree.z+Math.sin(a)*1.7),vec(x,groundHeight(x,z)+.05,z)],.36,.08)
    branch([vec(tree.x,tree.y+8+i*.5,tree.z),vec(tree.x+Math.cos(a)*3,tree.y+12,tree.z+Math.sin(a)*3),vec(tree.x+Math.cos(a)*6.4,tree.y+14+k.rand()*3,tree.z+Math.sin(a)*6.4)],.52,.085)
  }
  // Fine longitudinal bark folds soften the large trunk without texture downloads.
  for(let i=0;i<16;i++) {
    const a=i/16*Math.PI*2,pts=[]
    for(let j=0;j<7;j++){const t=j/6,r=1.64-t;pts.push(vec(tree.x+Math.cos(a+t*.23)*r,tree.y+t*11,tree.z+Math.sin(a+t*.23)*r))}
    k.beam(pts,.035,i%2?'#846040':'#765036')
  }
  // Lanterns mark decisions, while unlit paths remain visually clear.
  for(const name of ['entrance-to-willow','willow-to-tree','bridge-to-fern']) {
    const path=paths.find(q=>q.name===name)!
    for(let i=10;i<path.points.length;i+=30) {
      const a=path.points[i],b=path.points[i+1],angle=Math.atan2(b.x-a.x,b.z-a.z),x=a.x+Math.cos(angle)*(path.width*.5+.4),z=a.z-Math.sin(angle)*(path.width*.5+.4)
      k.lantern(x,groundHeight(x,z),z)
    }
  }
  return ground
}

export function addWater(scene:T.Scene) {
  const verts:number[]=[],idx:number[]=[],uv:number[]=[]
  for(let i=0;i<=360;i++) {
    const z=-31+i/360*62,c=riverCenter(z),w=riverWidth(z)
    for(let j=0;j<=14;j++){const u=j/14;verts.push(c+(u-.5)*w*2,waterHeight(z)+.025,z);uv.push(u,i/360);if(i<360&&j<14){const a=i*15+j;idx.push(a,a+15,a+1,a+1,a+15,a+16)}}
  }
  const mat=new T.ShaderMaterial({side:T.DoubleSide,uniforms:{time:{value:0}},
    vertexShader:`varying vec3 w;varying vec2 v;uniform float time;void main(){v=uv;vec3 p=position;p.y+=.018*sin(p.x*5.+time)*sin(p.z*3.-time);w=p;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader:`varying vec3 w;varying vec2 v;uniform float time;
    float wave(vec2 q){return sin(q.x+sin(q.y*1.4))*.5+sin(q.y*.82+cos(q.x*.7))*.5;}
    void main(){float n=wave(w.xz*2.5+vec2(time*.24,-time*.9));float thin=pow(1.-abs(n),19.);
    float edge=pow(abs(v.x-.5)*2.,14.);float fall=smoothstep(-6.,-4.8,w.z)*(1.-smoothstep(-1.2,-.4,w.z));
    float fall2=smoothstep(-23.3,-22.5,w.z)*(1.-smoothstep(-19.8,-18.9,w.z));
    float lace=pow(.5+.5*sin(w.x*17.+sin(w.z*5.-time*6.)+sin(w.x*7.)*2.),3.);
    vec3 col=mix(vec3(.023,.29,.34),vec3(.12,.62,.65),.42+n*.1+edge*.4);
    col+=vec3(.33,.48,.45)*thin*.65;col=mix(col,vec3(.76,.92,.91),clamp(edge*.62+(fall+fall2)*(.36+lace*.64),0.,.96));
    float foam=(exp(-pow((w.z-.4)*1.6,2.))+exp(-pow((w.z+19.)*1.6,2.)))*(.45+.45*n);
    col=mix(col,vec3(.85,.97,.95),clamp(foam,0.,.85));gl_FragColor=vec4(col,1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`})
  const mesh=new T.Mesh(geometry(verts,idx,uv),mat);scene.add(mesh)
  return mat
}
