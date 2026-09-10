import * as T from 'three'
import { houses, paths, docks, groundHeight, tree, type Path } from './world'
import { palette as c, vec, geometry, bevelBox, type Kit } from './kit'

function roofHeight(x:number) { const t=Math.abs(x)/4.05;return 6.25-2.85*t+1.08*t*t }
export function addArchitecture(k:Kit) {
  const {box,beam,add}=k
  function archShape(width:number,height:number) {
    const s=new T.Shape(),r=width/2;s.moveTo(-r,0);s.lineTo(-r,height-r);s.absarc(0,height-r,r,Math.PI,0,true);s.lineTo(r,0);s.closePath();return s
  }
  function archedWindow(group:T.Group,x:number,y:number,z:number,w=1.15,h=1.6) {
    const pane=new T.ExtrudeGeometry(archShape(w,h),{depth:.1,bevelEnabled:false});add(pane,'#ffd58a',x,y,z,group)
    const points=[vec(x-w/2,y,z+.14),vec(x-w/2,y+h-w/2,z+.14)]
    for(let i=0;i<=12;i++){const a=Math.PI-i/12*Math.PI;points.push(vec(x+Math.cos(a)*w/2,y+h-w/2+Math.sin(a)*w/2,z+.14))}
    points.push(vec(x+w/2,y,z+.14));beam(points,.065,c.timber,group)
    box(x,y+h*.43,z+.18,.055,h*.8,.06,c.timber,group);box(x,y+h*.4,z+.18,w,.055,.06,c.timber,group)
    box(x,y-.05,z+.05,w+.2,.12,.3,c.honey,group,true)
  }
  function cottage(h:typeof houses[number]) {
    const g=new T.Group();g.position.set(h.x,h.y,h.z);k.root.add(g)
    box(0,-.09,0,6.8,.16,6.8,c.wood,g)
    for(let i=0;i<14;i++)box(-3.25+i*.5,.005,0,.018,.016,6.6,c.timber,g)
    box(-3.4,1.9,0,.28,3.8,6.8,c.plaster,g,true);box(3.4,1.9,0,.28,3.8,6.8,c.plaster,g,true)
    box(0,1.9,-3.4,6.8,3.8,.28,c.plaster,g,true)
    // Real south-facing aperture. Neither pane nor door mesh fills the walking opening.
    for(const side of [-1,1])box(side*2.28,1.9,3.4,2.24,3.8,.28,c.plaster,g,true)
    box(0,3.45,3.4,2.34,.7,.28,c.plaster,g)
    for(const z of [-3.42,3.42]) {
      const vertices=[-3.4,3.65,z,3.4,3.65,z,0,6.2,z]
      add(geometry(vertices,z>0?[0,1,2]:[2,1,0]),c.plaster,0,0,0,g)
      for(const dx of [-3.4,3.4])beam([vec(dx,0,z),vec(dx*.995,2,z),vec(dx,3.85,z)],.12,c.timber,g)
      box(0,3.73,z,6.9,.18,.21,c.timber,g)
      beam([vec(-3.9,roofHeight(3.9)-.12,z+.16),vec(-2.7,roofHeight(2.7),z+.16),vec(-1.3,roofHeight(1.3),z+.16),vec(0,6.35,z+.16),vec(1.3,roofHeight(1.3),z+.16),vec(2.7,roofHeight(2.7),z+.16),vec(3.9,roofHeight(3.9)-.12,z+.16)],.12,c.honey,g)
      for(const side of [-1,1])beam([vec(side*2.9,3.82,z+.1),vec(side*1.9,4.55,z+.1)],.065,c.timber,g)
      box(0,4.75,z+.03,.15,1.9,.16,c.timber,g)
    }
    // Shingled, swept eaves: original curved roof with staggered softened slates.
    const colors=[h.roof,h.roof,'#587487','#688391']
    for(const side of [-1,1]) {
      const verts:number[]=[],inds:number[]=[]
      for(let i=0;i<=20;i++){const x=side*i/20*4.12;verts.push(x,roofHeight(x),-3.98,x,roofHeight(x),4.02);if(i<20){const a=i*2;inds.push(a,a+1,a+3,a,a+3,a+2)}}
      const mat=k.material(h.roof);mat.side=T.DoubleSide;add(geometry(verts,inds),mat,0,0,0,g)
      for(let row=0;row<8;row++)for(let col=0;col<11;col++) {
        const x=side*(.28+row*.51),z=-3.65+col*.72+(row%2)*.16,angle=side*(-2.85+2.16*Math.abs(x)/4.05)/4.05
        const tile=add(bevelBox(.57,.065,.76,.035),colors[(row+col*3)%colors.length],x,roofHeight(x)+.065,z,g);tile.rotation.z=Math.atan(angle);tile.rotation.y=(k.rand()-.5)*.025
      }
      beam([vec(side*4.08,roofHeight(4.08),-4),vec(side*4.15,roofHeight(4.08)-.07,0),vec(side*4.08,roofHeight(4.08),4.12)],.11,c.timber,g)
    }
    beam([vec(0,6.32,-4.12),vec(0,6.3,0),vec(0,6.38,4.15)],.14,h.roof,g)
    // Stone chimney, grouped blocks soften its silhouette.
    for(let row=0;row<7;row++)for(let col=0;col<2;col++)box(2+col*.38,5+row*.29,-1.7,.34,.25,.65,row%3?'#a1a397':'#8f978e',g,true)
    box(2.18,7.02,-1.7,1,.16,.92,c.stone,g,true)
    for(const x of [-2.3,2.3]) {
      archedWindow(g,x,1.35,3.57)
      for(const side of [-1,1]) {
        const shutter=box(x+side*.8,2,3.63,.33,1.3,.1,'#5b7c69',g,true);shutter.rotation.y=side*.2
        for(let j=0;j<4;j++)box(x+side*.8,1.52+j*.28,3.73,.33,.055,.04,c.honey,g)
      }
      box(x,1.16,3.78,1.65,.28,.58,c.honey,g,true)
      for(let f=0;f<9;f++)k.flower(x-.65+f*.16,1.3,3.78+(k.rand()-.5)*.2,.75,f%2?c.cream:c.pink,g)
    }
    archedWindow(g,0,4.5,3.52,.83,1.16)
    // Curved lintel and a swung-open door tucked alongside the wall.
    beam([vec(-1.13,.06,3.61),vec(-1.13,2.45,3.61),vec(-.78,3.04,3.61),vec(0,3.17,3.61),vec(.78,3.04,3.61),vec(1.13,2.45,3.61),vec(1.13,.06,3.61)],.095,c.honey,g)
    const door=new T.Group();door.position.set(-1.22,0,3.59);door.rotation.y=-2.25;g.add(door)
    box(.48,1.25,0,.88,2.5,.13,'#55796b',door,true)
    for(let i=0;i<5;i++)box(.12+i*.17,1.25,.078,.018,2.42,.035,c.timber,door)
    add(new T.SphereGeometry(.055,7,5),c.gold,.76,1.1,.12,door)
    // Porch fits the same physical floor aperture, supported from the terrain.
    for(let i=0;i<8;i++)box(-1.4+i*.4,-.035,4.05,.38,.1,1.34,c.honey,g,true)
    for(const side of [-1,1])beam([vec(side*1.51,-.12,4.55),vec(side*1.49,2.9,4.55)],.08,c.timber,g)
    k.lantern(1.7,2.4,3.8,g,false)
    // Clear central aisle, with collision-matched bed, desk and bookcase.
    box(-2.1,.31,-.05,1.55,.58,2.4,c.timber,g,true)
    box(-2.1,.67,-.05,1.52,.18,2.34,c.cream,g,true);box(-2.1,.79,.33,1.55,.11,1.42,'#738f83',g,true)
    box(-2.1,.84,-.84,1.12,.21,.52,c.cream,g,true)
    box(0,1.05,-2.65,2.3,.14,.92,c.honey,g,true)
    for(const side of [-1,1])box(side*.9,.5,-2.65,.12,1,.65,c.timber,g)
    box(0,1.15,-2.65,.5,.05,.4,c.cream,g)
    box(2.8,1.3,-.9,.58,2.6,2.8,c.timber,g)
    for(let shelf=0;shelf<3;shelf++) {
      box(2.43,.32+shelf*.76,-.9,.12,.1,2.7,c.honey,g)
      for(let b=0;b<9;b++)box(2.4,.57+shelf*.76,-2.02+b*.26,.24,.35+k.rand()*.12,.15,[c.slate,c.pink,c.gold,'#76927b'][b%4],g)
    }
    box(0,.024,.45,1.6,.025,2.4,'#637f76',g)
    for(const x of [-.73,.73])box(x,.045,.45,.045,.02,2.3,c.gold,g)
    k.lantern(0,2.7,0,g,false)
    // Foundation is buried into terrain, avoiding the naked-platform effect.
    if(h===houses[1]) {
      for(const x of [-2.9,2.9])for(const z of [-2.9,2.9])beam([vec(x,groundHeight(h.x+x,h.z+z)-h.y,z),vec(x,-.08,z)],.16,c.timber,g)
      beam([vec(tree.x-h.x,tree.y-h.y+1,tree.z-h.z),vec(-.8,-.1,3)],.22,c.timber,g)
    } else for(let i=0;i<12;i++)for(const side of [-1,1]) {
      const x=-3.2+i*.57,z=side*3.38;if(z>0&&Math.abs(x)<1.4)continue
      k.rock(x,-.16,z,.34,.24,.24,'#949b89',g)
    }
  }
  houses.forEach(cottage)
  // Ground trails use irregular flagstones embedded in a continuous gravel bed.
  const used=new Set<string>()
  for(const path of paths) {
    if(path.kind==='trail') {
      for(let i=0;i<path.points.length;i+=2) {
        const q=path.points[i],prev=path.points[Math.max(0,i-1)],next=path.points[Math.min(path.points.length-1,i+1)]
        const angle=Math.atan2(next.x-prev.x,next.z-prev.z)
        for(let col=-1;col<=1;col++) {
          const offset=col*path.width*.27+(k.rand()-.5)*.17,x=q.x+Math.cos(angle)*offset,z=q.z-Math.sin(angle)*offset
          const key=`${Math.round(x*2)},${Math.round(z*2)}`;if(used.has(key))continue;used.add(key)
          const stone=k.rock(x,q.y+.035,z,.28+k.rand()*.12,.045,.22+k.rand()*.06,['#baa984','#c5b795','#b1a483','#d1c09a'][i%4]);stone.rotation.y=angle+k.rand()*.6
        }
      }
    }else addDeck(path)
  }
  function addDeck(path:Path) {
    const posts:T.Vector3[][]=[[],[]]
    for(let i=0;i<path.points.length-1;i+=2) {
      const a=path.points[i],b=path.points[Math.min(i+2,path.points.length-1)],angle=Math.atan2(b.x-a.x,b.z-a.z),len=Math.hypot(b.x-a.x,b.z-a.z)
      const plank=box((a.x+b.x)/2,(a.y+b.y)/2-.075,(a.z+b.z)/2,path.width,.14,len+.015,i%6?c.honey:c.wood,k.root,true)
      plank.rotation.y=angle;plank.rotation.x=-Math.atan2(b.y-a.y,len)
      if(i%10===0||i+3>=path.points.length)for(const [j,side]of [-1,1].entries())posts[j].push(vec(a.x+Math.cos(angle)*path.width*.48*side,a.y,a.z-Math.sin(angle)*path.width*.48*side))
    }
    if(path.rails)posts.forEach(q=>k.fence(q))
    // Curved load-bearing timbers under the planks; visibly anchored piers.
    for(const side of [-1,1]) {
      const pts=path.points.filter((_,i)=>i%6===0).map((q,i,arr)=>{
        const b=path.points[Math.min(path.points.length-1,i*6+1)],a=path.points[Math.max(0,i*6-1)],angle=Math.atan2(b.x-a.x,b.z-a.z)
        return vec(q.x+Math.cos(angle)*path.width*.38*side,q.y-.3-Math.sin(i/(arr.length-1)*Math.PI)*.16,q.z-Math.sin(angle)*path.width*.38*side)
      });beam(pts,.12,c.timber)
    }
    if(path.name==='garden-bridge')for(const q of [path.points[4],path.points.at(-5)!])for(const s of [-1,1]) {
      beam([vec(q.x,q.y-.15,q.z+s),vec(q.x,groundHeight(q.x,q.z+s)-.2,q.z+s)],.14,c.timber)
      k.lantern(q.x,q.y,q.z+s*1.35)
    }
  }
  for(const d of docks) {
    for(let i=0;i<11;i++)box(d.x,d.y-.08,d.z-1.9+i*.38,3.2,.16,.36,c.honey,k.root,true)
    for(const x of [-1.48,1.48])for(const z of [-1.75,1.75])beam([vec(d.x+x,.05,d.z+z),vec(d.x+x,d.y+.55,d.z+z)],.105,c.timber)
    k.lantern(d.x-1.48,d.y,d.z+1.65)
  }
  // Low garden fences follow the planted edges, leaving entrances fully open.
  for(const pts of [[[-17,12],[-18,10],[-19,7]],[[-7.5,12.5],[-5.8,11],[-4.9,9.6]],[[16,-6],[18,-7.5],[19,-10]]])k.fence(pts.map(([x,z])=>vec(x,groundHeight(x,z),z)))
  k.fence([vec(5.5,groundHeight(5.5,-3.8),-3.8),vec(6.6,3.6,-4),vec(7.8,groundHeight(7.8,-4),-4)])
}
