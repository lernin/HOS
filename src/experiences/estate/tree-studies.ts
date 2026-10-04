import * as T from 'three'
import { type EstateKit, random, v } from './kit'

export type TreeForm = 'airy' | 'courtyard' | 'shade'
type TreeOptions = { x:number; y:number; z:number; size?:number; seed?:number; form?:TreeForm }

// These three silhouettes share bark, tapered branching and individual leaves.
// Keep the builder independent of terrain so another world can use the same family.
export const treeStudies = [
  {form:'airy',name:'1 · Airy Ornamental',detail:'Slender curved trunk, fine leaves and open branching. Used beneath the spa dome.'},
  {form:'courtyard',name:'2 · Branching Courtyard',detail:'A low fork, rounded leaves and a relaxed, spreading crown.'},
  {form:'shade',name:'3 · Broad Shade',detail:'A taller clear stem with wide, layered shelter for paths and coastal gardens.'},
] as const

function geometry(vertices:number[],indices:number[]){
  const g=new T.BufferGeometry()
  g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals()
  return g
}

// A closed, tapering surface rather than a constant-width, open-ended hose.
function wood(k:EstateKit,parent:T.Group,points:T.Vector3[],radii:number[],seed:number){
  const curve=new T.CatmullRomCurve3(points),steps=24,sides=10,frames=curve.computeFrenetFrames(steps,false)
  const vertices:number[]=[],indices:number[]=[]
  for(let i=0;i<=steps;i++){
    const t=i/steps,u=t*(radii.length-1),j=Math.min(radii.length-2,Math.floor(u)),r=T.MathUtils.lerp(radii[j],radii[j+1],u-j),p=curve.getPointAt(t)
    for(let s=0;s<sides;s++){
      const a=s/sides*Math.PI*2,rr=r*(1+.055*Math.sin(a*3+seed)+.025*Math.sin(t*9+a*2))
      const q=p.clone().addScaledVector(frames.normals[i],Math.cos(a)*rr).addScaledVector(frames.binormals[i],Math.sin(a)*rr)
      vertices.push(q.x,q.y,q.z)
      if(i<steps){const a0=i*sides+s,b0=i*sides+(s+1)%sides;indices.push(a0,b0,a0+sides,b0,b0+sides,a0+sides)}
    }
  }
  for(const [ring,point,reverse] of [[0,curve.getPointAt(0),true],[steps,curve.getPointAt(1),false]] as const){
    const c=vertices.length/3;vertices.push(point.x,point.y,point.z)
    for(let s=0;s<sides;s++){const a=ring*sides+s,b=ring*sides+(s+1)%sides;indices.push(c,reverse?b:a,reverse?a:b)}
  }
  k.mesh(geometry(vertices,indices),'treeBark',0,0,0,parent)
}

class Leaves {
  vertices:number[][]=[[],[],[]]
  indices:number[][]=[[],[],[]]
  add(p:T.Vector3,length:number,width:number,yaw:number,tilt:number,color:number){
    const verts=this.vertices[color],idx=this.indices[color],base=verts.length/3
    const q=new T.Quaternion().setFromEuler(new T.Euler(tilt,yaw,.12*Math.sin(yaw*3),'YXZ'))
    for(const point of [v(0,0,0),v(length*.2,0,width*.65),v(length*.45,0,width),v(length*.72,0,width*.7),v(length,0,0),v(length*.72,0,-width*.7),v(length*.45,0,-width),v(length*.2,0,-width*.65),v(length*.48,length*.035,0)]){
      point.applyQuaternion(q).add(p);verts.push(point.x,point.y,point.z)
    }
    for(let i=0;i<8;i++)idx.push(base+i,base+(i+1)%8,base+8)
  }
  finish(k:EstateKit,parent:T.Group){
    for(let i=0;i<3;i++){
      const mat=['treeLeaf','treeLeafLight','treeLeafDark'][i]
      k.material(mat).side=T.DoubleSide
      if(this.vertices[i].length)k.mesh(geometry(this.vertices[i],this.indices[i]),mat,0,0,0,parent)
    }
  }
}

export function buildTreeStudy(k:EstateKit,{x,y,z,size=1,seed=3,form='airy'}:TreeOptions){
  const g=k.group(x,y,z,seed*.73);g.scale.setScalar(size)
  const rand=random(seed*7919+41),leaves=new Leaves(),broad=form!=='airy',shade=form==='shade'
  const h=shade?5.6:broad?4.9:5.45,spread=shade?2.8:broad?2.35:1.85
  const stem=[v(0,-.18,0),v(-.07,.55,.03),v(.12,1.55,.03),v(-.06,2.65,.14),v(.12,h-1.45,.08)]
  wood(k,g,stem,[.29,.19,.145,.09,.018],seed)
  // The continuous trunk widens below the soil; no exposed root tubes or stubs.
  const stemCurve=new T.CatmullRomCurve3(stem)
  const branchCount=shade?7:broad?6:7
  for(let i=0;i<branchCount;i++){
    const a=i*2.399+rand()*.35,layer=i/(branchCount-1),r=spread*(.86-.3*layer+rand()*.14)
    const startY=shade?2.45+layer*1.4:broad?.9+layer*2.5:1.65+layer*2.3
    const tip=v(Math.cos(a)*r,h-1.25+layer*.8+(rand()-.5)*.3,Math.sin(a)*r)
    let lo=0,hi=1
    for(let n=0;n<20;n++){const t=(lo+hi)/2;if(stemCurve.getPoint(t).y<startY)lo=t;else hi=t}
    const origin=stemCurve.getPoint((lo+hi)/2),middle=origin.clone().lerp(tip,.55);middle.y-=.13
    wood(k,g,[origin,middle,tip],[broad?.105:.078,.044,.008],seed+i)
    for(let j=0;j<5;j++){
      const aa=a+(j-2)*.46,reach=.6+rand()*.35
      const start=middle.clone().lerp(tip,.3+j*.13)
      const end=start.clone().add(v(Math.cos(aa)*reach,.2+rand()*.4,Math.sin(aa)*reach))
      const bend=start.clone().lerp(end,.52);bend.y+=.12
      wood(k,g,[start,bend,end],[.025,.014,.0025],seed+j)
      // Add foliage without changing the existing branch/leaf random sequence.
      const extraLeaves=random(seed*7919+i*997+j*61+6029)
      for(let n=0;n<128;n++){
        const leafRand=n<64?rand:extraLeaves
        const t=.12+leafRand()*.92,center=start.clone().lerp(end,t)
        const offset=leafRand()*Math.PI*2,width=.14+Math.sin(t*Math.PI)*.34
        center.add(v(Math.cos(offset)*width,(leafRand()-.5)*.34,Math.sin(offset)*width))
        const length=(broad?.245:.205)*(.72+leafRand()*.55)
        leaves.add(center,length,length*(broad?.34:.23),leafRand()*Math.PI*2,(leafRand()-.5)*1.5,n%7===0?1:n%3===0?2:0)
      }
    }
  }
  leaves.finish(k,g)
  return g
}

export function buildTreeUnderplanting(k:EstateKit,x:number,y:number,z:number){
  const g=k.group(x,y,z),leaves=new Leaves(),rand=random(607)
  // Uneven fern drifts leave quiet areas of exposed soil and a clear trunk base.
  for(const [cx,cz,scale] of [[-.8,-.72,.9],[.64,-1.05,.8],[.97,.22,.7],[-.82,.73,1],[.25,1.24,.67],[-.2,-1.37,.6]] as const){
    for(let f=0;f<6;f++){
      const a=f*2.399+rand()*.4,length=(.34+rand()*.16)*scale
      const start=v(cx,.015,cz),end=v(cx+Math.cos(a)*length,.09+rand()*.06,cz+Math.sin(a)*length)
      const mid=start.clone().lerp(end,.5);mid.y=.2*scale
      const curve=new T.CatmullRomCurve3([start,mid,end])
      k.beam([start,mid,end],.006,'treeLeafDark',g,4)
      for(let n=1;n<9;n++)for(const side of [-1,1]){
        const t=n/10,p=curve.getPoint(t),l=.1*Math.sin(t*Math.PI)*scale
        leaves.add(p,l,l*.18,-a+side*1.05,-.12,n%5===0?1:0)
      }
    }
  }
  for(const [cx,cz] of [[.85,.8],[-1.05,-.05],[.1,-.87]]){
    for(let i=0;i<14;i++){
      const a=rand()*Math.PI*2,h=.13+rand()*.18
      leaves.add(v(cx+(rand()-.5)*.14,.015,cz+(rand()-.5)*.14),h,.008,a,-1.1-rand()*.3,i%4===0?1:0)
    }
  }
  leaves.finish(k,g)
  return g
}
