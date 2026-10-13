import * as T from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { pools } from './layout'
import { flatGeometry } from './geometry'

export type Lighting='day'|'sunset'
const waterVertex=`
varying vec3 ieP;varying vec3 ieNormal;uniform float time;
void main(){vec3 p=position;float a=sin(p.x*.16+time*.32)*cos(p.z*.11+time*.23);p.y+=a*.045;ieP=(modelMatrix*vec4(p,1.)).xyz;ieNormal=normalize(vec3(-cos(p.x*.16+time*.32)*.035,1.,sin(p.z*.11+time*.23)*.03));gl_Position=projectionMatrix*viewMatrix*vec4(ieP,1.);}
`
const waterFragment=`
varying vec3 ieP;varying vec3 ieNormal;uniform float time;uniform float sunset;uniform float ocean;
float noise(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){vec3 view=normalize(cameraPosition-ieP);vec2 uv=ieP.xz;
float wave=sin(dot(uv,vec2(.74,.23))-time*.6+sin(dot(uv,vec2(.04,.06)))*.9)*.05;
vec3 n=normalize(ieNormal+vec3(wave*.18,0.,sin(dot(uv,vec2(-.47,.96))+time*.38)*.008));
float f=pow(1.-max(dot(view,n),0.),3.5);float main=length((uv-vec2(-3.,-2.))/vec2(69.,57.));float pen=length((uv-vec2(43.,68.))/vec2(36.,41.));float shore=min(main,pen);
float depth=ocean>.5?smoothstep(.75,1.48,shore):.26;
vec3 shallow=vec3(.10,.55,.55),deep=vec3(.018,.16,.245);vec3 water=mix(shallow,deep,depth);
float ripples=sin(dot(uv,vec2(.79,.25))+sin(uv.y*.047)*2.+time*.4)*.65+sin(dot(uv,vec2(-.25,.66))-time*.32)*.35;
water+=ripples*.012;vec3 sky=mix(vec3(.45,.64,.71),vec3(.72,.59,.46),sunset);
vec3 c=mix(water,sky,f*.73);vec3 sun=normalize(mix(vec3(-.5,.8,.3),vec3(-.65,.38,-.4),sunset));
float glitter=pow(max(dot(reflect(-sun,n),view),0.),110.)*(.9+.3*ripples);c+=mix(vec3(1.,.95,.82),vec3(1.,.73,.37),sunset)*glitter*.75;
if(ocean>.5){float foam=(1.-smoothstep(.0,.08,abs(shore-1.0)))*(.14+.12*sin(time*.7+uv.x*.18+uv.y*.18));c=mix(c,vec3(.71,.9,.85),foam);}
gl_FragColor=vec4(c,1.);#include <tonemapping_fragment>
#include <colorspace_fragment>
}
`.replace(';#include',';\n#include')

export function createEnvironment(scene:T.Scene,renderer:T.WebGLRenderer) {
  const pmrem=new T.PMREMGenerator(renderer),room=new RoomEnvironment()
  const env=pmrem.fromScene(room,.045)
  scene.environment=env.texture;scene.environmentIntensity=.45
  room.dispose();pmrem.dispose()
  const hemisphere=new T.HemisphereLight('#d7e8f0','#727e58',1.25);scene.add(hemisphere)
  const sun=new T.DirectionalLight('#fff0d2',3.1);sun.position.set(-65,90,45);sun.castShadow=true
  sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-85;sun.shadow.camera.right=85;sun.shadow.camera.top=100;sun.shadow.camera.bottom=-85;sun.shadow.camera.near=1;sun.shadow.camera.far=250;sun.shadow.bias=-.0004;sun.shadow.normalBias=.14;sun.shadow.radius=3
  sun.target.position.set(0,5,13);scene.add(sun,sun.target)
  const fill=new T.DirectionalLight('#a9dfe4',.65);fill.position.set(55,25,35);scene.add(fill)
  const skyMat=new T.ShaderMaterial({side:T.BackSide,depthWrite:false,uniforms:{sunset:{value:0}},vertexShader:'varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`varying vec3 p;uniform float sunset;void main(){float h=normalize(p).y;vec3 zenith=mix(vec3(.24,.46,.61),vec3(.28,.37,.47),sunset);vec3 horizon=mix(vec3(.72,.83,.84),vec3(.92,.76,.60),sunset);vec3 c=mix(horizon,zenith,smoothstep(-.03,.75,h));float glow=pow(max(dot(normalize(p),normalize(vec3(-.65,.3,-.4))),0.),20.);c+=vec3(.17,.08,.01)*glow*sunset;gl_FragColor=vec4(c,1.);}`})
  const skyGeo=new T.SphereGeometry(450,32,16),sky=new T.Mesh(skyGeo,skyMat);sky.renderOrder=-10;scene.add(sky)
  const waters:T.Mesh[]=[],uniformSets:{time:{value:number};sunset:{value:number};ocean:{value:number}}[]=[]
  const makeWater=(geometry:T.BufferGeometry,y:number,ocean:number)=>{
    const uniforms={time:{value:0},sunset:{value:0},ocean:{value:ocean}},mat=new T.ShaderMaterial({uniforms,vertexShader:waterVertex,fragmentShader:waterFragment})
    const mesh=new T.Mesh(geometry,mat);mesh.position.y=y;mesh.renderOrder=-1;scene.add(mesh);waters.push(mesh);uniformSets.push(uniforms);return mesh
  }
  const seaGeometry=new T.PlaneGeometry(850,850,150,150);seaGeometry.rotateX(-Math.PI/2);makeWater(seaGeometry,.02,1)
  for(const pool of pools)makeWater(flatGeometry(pool.outline),pool.y-.08,0)
  // Atrium water curtain: an open, translucent cylinder around the skylight axis.
  const fallMat=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,uniforms:{time:{value:0}},vertexShader:'varying vec2 uvP;void main(){uvP=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`varying vec2 uvP;uniform float time;void main(){float streak=pow(.5+.5*sin(uvP.x*370.+sin(uvP.x*51.)*3.),5.);float flow=.5+.5*sin(uvP.y*95.+time*3.+uvP.x*15.);gl_FragColor=vec4(mix(vec3(.51,.84,.84),vec3(.89,.96,.93),streak),.09+streak*.21+flow*.026);}`})
  const fallGeo=new T.CylinderGeometry(1.27,1.44,14.05,48,1,true),fall=new T.Mesh(fallGeo,fallMat);fall.position.set(0,15,-7);scene.add(fall)
  function setLighting(light:Lighting) {
    const warm=light==='sunset'?1:0
    skyMat.uniforms.sunset.value=warm
    for(const u of uniformSets)u.sunset.value=warm
    sun.position.set(warm?-80:-65,warm?46:90,warm?-50:45)
    sun.color.set(warm?'#ffd4a1':'#fff3db');sun.intensity=warm?2.8:3.1
    hemisphere.color.set(warm?'#dacbc0':'#d7e8f0');hemisphere.intensity=warm?.95:1.25
    renderer.toneMappingExposure=warm?.86:.9
    scene.fog=new T.Fog(warm?'#aebcb9':'#9ac8d1',180,430)
  }
  function update(time:number){for(const u of uniformSets)u.time.value=time;fallMat.uniforms.time.value=time}
  function dispose(){env.dispose();skyGeo.dispose();skyMat.dispose();sky.removeFromParent();for(const w of waters){w.geometry.dispose();(w.material as T.Material).dispose();w.removeFromParent()}fallGeo.dispose();fallMat.dispose();fall.removeFromParent();hemisphere.removeFromParent();sun.shadow.dispose();sun.removeFromParent();sun.target.removeFromParent();fill.removeFromParent()}
  setLighting('day')
  return {setLighting,update,dispose}
}
