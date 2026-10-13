import * as T from 'three'
import { islandOutline, terrainHeight, groundHeight, outlines, contains, boundaryDistance,
  palms, paths, dock, gangwayPoint, planters, roofBeds, circle, type Palm, type WorldPoint } from './layout'
import { type Kit, ribbon, surface } from './geometry'

const rand=(seed:number)=>{const a=Math.sin(seed*127.1+58.3)*43758.5453;return a-Math.floor(a)}
function palm(kit:Kit,p:Palm) {
  const lean=(rand(p.seed+20)-.5)*1.4,a=rand(p.seed+17)*Math.PI*2
  const crown={x:p.x+Math.sin(a)*lean,y:p.y+p.height,z:p.z+Math.cos(a)*lean}
  const trunk=Array.from({length:9},(_,i)=>{
    const t=i/8;return {x:p.x+Math.sin(a)*lean*t*t,y:p.y+t*p.height,z:p.z+Math.cos(a)*lean*t*t}
  })
  kit.tube(trunk,.14+p.height*.005,'bark',false,18,8)
  kit.sphere({...crown,y:crown.y-.18},.27,.37,.26,'bark',9)
  const length=p.height*.42+1.35
  for(let leaf=0;leaf<11;leaf++) {
    const angle=leaf/11*Math.PI*2+rand(p.seed+leaf)*.4
    const forward={x:Math.sin(angle),z:Math.cos(angle)},side={x:Math.cos(angle),z:-Math.sin(angle)}
    const spine=Array.from({length:13},(_,i)=>{
      const t=i/12,r=length*t
      return {x:crown.x+forward.x*r,y:crown.y+Math.sin(t*Math.PI)*1.1-t*t*(leaf%3===0?1.6:.7),z:crown.z+forward.z*r}
    })
    kit.tube(spine,.025,'leafLight',false,18,4)
    const vertices:number[]=[],indices:number[]=[]
    for(let i=1;i<12;i++) {
      const base=spine[i],t=i/12,w=Math.sin(Math.PI*t)*length*.16+.025
      for(const sign of [-1,1]) {
        const tip={x:base.x+side.x*w*sign+forward.x*w*.5,y:base.y-.18-w*.22,z:base.z+side.z*w*sign+forward.z*w*.5}
        const index=vertices.length/3
        vertices.push(base.x-forward.x*.11,base.y,base.z-forward.z*.11,tip.x,tip.y,tip.z,base.x+forward.x*.13,base.y+.03,base.z+forward.z*.13)
        indices.push(index,index+1,index+2,index+2,index+1,index)
      }
    }
    kit.add(surface(vertices,indices),leaf%4===0?'leafLight':leaf%3===0?'leafDark':'leaf')
  }
}
function shrub(kit:Kit,p:WorldPoint,seed:number,size=1) {
  for(let i=0;i<5;i++) {
    const a=i/5*Math.PI*2,r=size*.38
    kit.sphere({x:p.x+Math.sin(a)*r,y:p.y+size*(.25+rand(seed+i)*.36),z:p.z+Math.cos(a)*r},size*.6,size*.47,size*.6,i%3===0?'leafLight':i%3===1?'leaf':'leafDark',10)
  }
  for(let i=0;i<6;i++) {
    const a=rand(seed+i*7)*Math.PI*2,b={x:p.x+Math.sin(a)*size*.75,y:p.y+size*.58,z:p.z+Math.cos(a)*size*.75}
    kit.sphere(b,.12*size,.1*size,.12*size,seed%3===0?'clay':'ceramic',6)
  }
}
function rock(kit:Kit,p:WorldPoint,rx:number,ry:number,rz:number,seed:number) {
  const g=new T.IcosahedronGeometry(1,2),v=g.getAttribute('position')
  for(let i=0;i<v.count;i++) {
    const x=v.getX(i),y=v.getY(i),z=v.getZ(i)
    const n=1+.15*Math.sin(x*7+y*5+seed)+.08*Math.cos(y*12+z*7+seed)
    v.setXYZ(i,x*n*rx,y*n*ry,z*n*rz)
  }
  g.computeVertexNormals();kit.add(g,seed%3===0?'rockDark':seed%3===1?'rockLight':'rock',p,new T.Euler(.13*rand(seed),rand(seed+1)*6.28,.12))
}
export function landscape(kit:Kit) {
  const vertices:number[]=[],indices:number[]=[],colors:number[]=[],nx=108,nz=118
  const green=new T.Color('#76805a'),stone=new T.Color('#8c8874'),sand=new T.Color('#dfcfaa')
  for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++) {
    const p={x:-68+i/nx*146,z:-59+j/nz*164},inside=contains(p,islandOutline),height=contains(p,outlines[0])?7.32:inside?terrainHeight(p):-.45
    vertices.push(p.x,height,p.z)
    const d=boundaryDistance(p,islandOutline),beach=p.x<-10&&p.z>28&&height<2.2
    const color=(beach?sand:d<9?stone:green).clone().multiplyScalar(.88+rand(i*143+j)*.24)
    colors.push(color.r,color.g,color.b)
    if(i&&j) {
      const k=j*(nx+1)+i
      const corners=[{x:p.x,z:p.z},{x:p.x-146/nx,z:p.z},{x:p.x,z:p.z-164/nz},{x:p.x-146/nx,z:p.z-164/nz}]
      if(corners.some(q=>contains(q,islandOutline)))indices.push(k-nx-2,k-1,k-nx-1,k-1,k,k-nx-1)
    }
  }
  const terrain=surface(vertices,indices);terrain.setAttribute('color',new T.Float32BufferAttribute(colors,3))
  const mat=new T.MeshStandardMaterial({vertexColors:true,roughness:.99})
  mat.onBeforeCompile=s=>{
    s.vertexShader='varying vec3 terrainP;\n'+s.vertexShader
    s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nterrainP=transformed;')
    s.fragmentShader='varying vec3 terrainP;\n'+s.fragmentShader
    s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nfloat surfaceNoise=sin(terrainP.x*4.+sin(terrainP.z*2.4))*sin(terrainP.z*5.1)+sin(terrainP.y*13.+terrainP.x*.2)*.3;diffuseColor.rgb*=.95+surfaceNoise*.075;')
  }
  const mesh=new T.Mesh(terrain,mat);mesh.receiveShadow=true;mesh.castShadow=true;mesh.userData.walkSurface=true;mesh.name='Island terrain';kit.root.add(mesh);kit.navMeshes.push(mesh)
  kit.keep(terrain)
  // Dispose the terrain's independent vertex-color material with its owner.
  const original=kit.dispose;kit.dispose=()=>{mat.dispose();original()}
  for(let i=0;i<islandOutline.length;i+=3) {
    const p=islandOutline[i],inset={x:p.x*.98,z:(p.z-12)*.98+12},h=terrainHeight(inset)
    if(inset.x<-12&&inset.z>25)continue
    const r=1.2+rand(i+1)*2.8
    rock(kit,{...inset,y:Math.max(.15,h*.45)},r,r*.9+1,r*.8,i)
    if(i%6===0)rock(kit,{x:p.x*1.05,y:.35,z:(p.z-12)*1.05+12},r*.7,1.1,r*.65,i+71)
  }
  for(const path of paths) {
    const curve=new T.CatmullRomCurve3(path.map(p=>new T.Vector3(p.x,0,p.z)),false,'centripetal')
    const points=curve.getPoints(Math.ceil(curve.getLength()/.8)).map(p=>({x:p.x,z:p.z,y:(groundHeight({x:p.x,z:p.z})??0)+.038}))
    const m=kit.add(ribbon(points,2.4),'stone',{x:0,y:0,z:0},new T.Euler(),true)
    if(m)m.name='Continuous island path'
    for(let i=8;i<points.length;i+=12) {
      const p=points[i],a=points[i-1],b=points[i+1]||p,angle=Math.atan2(b.z-a.z,b.x-a.x)
      for(const side of [-1,1]) {
        const q={x:p.x-Math.sin(angle)*side*1.5,z:p.z+Math.cos(angle)*side*1.5,y:p.y}
        kit.cylinder(q,{...q,y:q.y+.55},.044,.044,'bronze',6)
        kit.sphere({...q,y:q.y+.52},.1,.055,.1,'glow',8)
      }
    }
  }
  for(const tree of palms)palm(kit,tree)
  for(let i=0;i<130;i++) {
    const p={x:-55+rand(i*9+71)*122,z:-45+rand(i*9+72)*138}
    if(!contains(p,islandOutline)||contains(p,outlines[0])||boundaryDistance(p,islandOutline)<4)continue
    const h=terrainHeight(p)
    if(h<1.1)continue
    shrub(kit,{...p,y:h},i,.7+rand(i+301)*1.1)
  }
  for(const planter of planters) {
    const radius=planter.radius!
    for(let i=0;i<8;i++) {
      const a=i/8*6.28,r=radius*.5
      shrub(kit,{x:planter.center.x+Math.sin(a)*r,y:planter.y+planter.height-.05,z:planter.center.z+Math.cos(a)*r},i+14,.5+radius*.07)
    }
    if(radius>3)for(let i=0;i<3;i++) {
      const a=i*2.1
      palm(kit,{x:planter.center.x+Math.sin(a)*radius*.42,z:planter.center.z+Math.cos(a)*radius*.42,y:planter.y+planter.height,height:3.8+i*.5,seed:1000+i+Math.round(planter.center.x)})
    }
    else palm(kit,{...planter.center,y:planter.y+planter.height,height:4.5,seed:1100+Math.round(planter.center.x)})
  }
  for(const [index,bed] of roofBeds.entries()) {
    const polygon=bed.outline!,minX=Math.min(...polygon.map(p=>p.x)),maxX=Math.max(...polygon.map(p=>p.x)),minZ=Math.min(...polygon.map(p=>p.z)),maxZ=Math.max(...polygon.map(p=>p.z))
    let count=0
    for(let i=0;i<80;i++) {
      const p={x:minX+rand(i*11+index*97)*(maxX-minX),z:minZ+rand(i*13+index*93+2)*(maxZ-minZ)}
      if(!contains(p,polygon)||boundaryDistance(p,polygon)<.5)continue
      shrub(kit,{...p,y:bed.y+bed.height},i+index*80,.62+rand(i+731)*.8)
      if(count++%7===0)palm(kit,{...p,y:bed.y+bed.height,height:3.6+rand(i+811)*2.5,seed:2000+i+index*90})
    }
  }
  const ramp=Array.from({length:40},(_,i)=>{const p=gangwayPoint(i/39);return {...p,y:p.y+.025}})
  kit.add(ribbon(ramp,2.8),'teak',{x:0,y:0,z:0},new T.Euler(),true)
  kit.floor(dock.outline,[],dock.y,.32,'teak')
  for(let x=53;x<75;x+=1.4)for(const z of [104.2,111.8])kit.cylinder({x,y:-.1,z},{x,y:dock.y+.85,z},.13,.13,'wood',8)
  for(const side of [-1,1])kit.tube(ramp.map(p=>({x:p.x+side*1.15,y:p.y+.97,z:p.z-side*.54})),.055,'shell')
  for(let x=53;x<75;x+=.24)kit.box({x,y:dock.y+.011,z:108},.014,.016,7.8,'wood')
  // Small sculptural yacht at the southeast pier, as in the reference master plan.
  const hull=circle({x:81,z:109},3.0,9.2,64)
  kit.floor(hull,[],1.28,1.2,'shell')
  kit.box({x:81,y:1.52,z:108},4.1,.55,9.3,'teak',0,.5)
  kit.box({x:81,y:2.15,z:107},3.3,1.1,5.0,'shell',0,.45)
  kit.box({x:81,y:2.74,z:107},3.35,.07,4.5,'glass',0,.05)
  kit.box({x:81,y:2.81,z:107},3.55,.12,4.6,'shell',0,.08)
  kit.tube(hull.map(p=>({...p,y:1.98})),.025,'bronze',true)
  return {palms:palms.length}
}
