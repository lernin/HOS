import * as T from 'three'
import { ATRIUM, levels, outlines, pools, circle, stair, stairPoint, landings, glazing, partitions, planters, roofBeds, supports, structuralColumns, pavilionCenter, crownHeight, crownProfile, type PointXZ } from './layout'
import { type Kit, slabGeometry, surface } from './geometry'
import { sculpturalShell } from './sculpture'

function perimeter(kit:Kit,p:PointXZ[],y:number,height=1.12,gaps:(p:PointXZ)=>boolean=()=>false) {
  for(let i=0;i<p.length;i++) {
    const a=p[i],b=p[(i+1)%p.length]
    if(gaps(a))continue
    kit.wall(a,b,y+.04,height,'glass',.018)
    if(i%4===0)kit.cylinder({...a,y:y+.01},{...a,y:y+height},.025,.025,'bronze',5)
    kit.cylinder({...a,y:y+height},{...b,y:y+height},.024,.024,'bronze',5)
  }
}
function crown(kit:Kit) {
  const v:number[]=[],idx:number[]=[],n=128
  for(let i=0;i<=n;i++) {
    const a=i/n*Math.PI*2,y=crownHeight(a)
    for(const [r,h] of crownProfile)v.push(Math.sin(a)*r,y+h,ATRIUM.z+Math.cos(a)*r)
    if(i){const k=i*5;for(let j=0;j<5;j++){const next=(j+1)%5;idx.push(k+j-5,k+next-5,k+j,k+j,k+next-5,k+next)}}
  }
  kit.add(surface(v,idx),'shell')
  const cap=circle(pavilionCenter,14.6,7.6,96)
  kit.add(slabGeometry(cap,[],.24,.18),'shell',{x:0,y:23.8,z:0})
  kit.tube(cap.map(p=>({...p,y:23.65})),.028,'glow',true)
}
function shellEdges(kit:Kit,points:PointXZ[],y:number,level:number) {
  const vertices:number[]=[],indices:number[]=[],center={x:0,z:-7},n=points.length
  for(let i=0;i<=n;i++) {
    const p=points[i%n],dx=p.x-center.x,dz=p.z-center.z,len=Math.hypot(dx,dz),a=Math.atan2(dx,dz)
    const dip=level===2?.85+1.35*(.5+.5*Math.sin(a*3+.4)):level===1?.55:.3
    const profile=[[.65,y+.07],[.06,y-.04],[-.16,y-.35],[.38,y-.55-dip],[1.25,y-.63]]
    for(const [inset,h] of profile)vertices.push(p.x-dx/len*inset,h,p.z-dz/len*inset)
    if(i){const k=i*5;for(let j=0;j<4;j++)indices.push(k+j-5,k+j,k+j-4,k+j,k+j+1,k+j-4)}
  }
  kit.add(surface(vertices,indices),'shell')
  kit.tube(points.map(p=>({...p,y:y-.19})),.027,'glow',true)
}
function flowingSupport(kit:Kit,sections:typeof supports[number]) {
  const vertices:number[]=[],indices:number[]=[],n=48
  for(let s=0;s<sections.length;s++)for(let i=0;i<=n;i++) {
    const {y,x,z,rx,rz}=sections[s],a=i/n*Math.PI*2
    vertices.push(x+Math.sin(a)*rx,y,z+Math.cos(a)*rz)
    if(s&&i){const k=s*(n+1)+i;indices.push(k-n-2,k-n-1,k-1,k-n-1,k,k-1)}
  }
  const g=surface(vertices,indices);kit.add(g,'shell')
}
function stairs(kit:Kit) {
  for(const flight of [0,1] as const) {
    const underside:number[]=[],indices:number[]=[],n=96
    for(let i=0;i<=n;i++) {
      const inner=stairPoint(flight,i/n,stair.radius-stair.width/2),outer=stairPoint(flight,i/n,stair.radius+stair.width/2)
      underside.push(inner.x,inner.y-.23,inner.z,outer.x,outer.y-.23,outer.z,outer.x,outer.y-.48,outer.z,inner.x,inner.y-.48,inner.z)
      if(i){const k=i*4;for(let j=0;j<4;j++){const next=(j+1)%4;indices.push(k+j-4,k+next-4,k+j,k+j,k+next-4,k+next)}}
    }
    kit.add(surface(underside,indices),'shell')
    for(let i=0;i<stair.risers;i++) {
      const a=stair.start+flight*stair.sweep+i/stair.risers*stair.sweep,b=a+stair.sweep/stair.risers+.001
      const poly:PointXZ[]=[],r0=stair.radius-stair.width/2,r1=stair.radius+stair.width/2
      for(let j=0;j<=3;j++){const t=a+(b-a)*j/3;poly.push({x:Math.sin(t)*r1,z:ATRIUM.z+Math.cos(t)*r1})}
      for(let j=3;j>=0;j--){const t=a+(b-a)*j/3;poly.push({x:Math.sin(t)*r0,z:ATRIUM.z+Math.cos(t)*r0})}
      kit.floor(poly,[],8+flight*6+(i+1)/stair.risers*6,.185,'stone')
      const edge=[stairPoint(flight,(i+1)/stair.risers,r0+.06),stairPoint(flight,(i+1)/stair.risers,r1-.06)].map(p=>({...p,y:p.y+.012}))
      kit.cylinder(edge[0],edge[1],.02,.02,'glow',4)
    }
    for(const radius of [stair.radius-stair.width/2,stair.radius+stair.width/2]) {
      const points=Array.from({length:97},(_,i)=>stairPoint(flight,i/96,radius))
      for(let i=0;i<points.length-1;i++) {
        const a=points[i],b=points[i+1]
        const g=surface([a.x,a.y+.1,a.z,b.x,b.y+.1,b.z,a.x,a.y+1.04,a.z,b.x,b.y+1.04,b.z],[0,1,2,1,3,2])
        kit.add(g,'glass')
      }
      kit.tube(points.map(p=>({...p,y:p.y+1.08})),.038,'bronze',false,140,6)
      // A continuous underside reads as the sculptural stair in the reference.
      kit.tube(points.map(p=>({...p,y:p.y-.21})),.15,'shell',false,140,8)
    }
  }
  for(const landing of landings.slice(1))kit.floor(landing.outline,[],landing.y,.24,'stone')
}

function sofa(kit:Kit,x:number,z:number,y:number,name='linen') {
  kit.box({x,y:y+.16,z},5.5,.27,1.3,'wood',0,.08)
  kit.box({x,y:y+.48,z},5.4,.45,1.28,name,0,.16)
  kit.box({x,y:y+.92,z:z-.5},5.4,.76,.3,name,0,.12)
  for(const dx of [-2.7,2.7])kit.box({x:x+dx,y:y+.72,z},.25,.7,1.34,name,0,.08)
  for(const dx of [-1.9,-.5,.9,2])kit.box({x:x+dx,y:y+.79,z:z-.34},.62,.52,.17,dx<0?'sage':'linen',-.13,.08)
  kit.box({x,y:y+.34,z:z+2.45},3.0,.14,1.0,'stone',0,.14)
  kit.cylinder({x,y:y+.05,z:z+2.45},{x,y:y+.32,z:z+2.45},.6,.4,'bronze',12)
  kit.add(new T.CylinderGeometry(.18,.19,.18,12),'ceramic',{x:x+.7,y:y+.5,z:z+2.5})
}
function bed(kit:Kit,x:number,z:number,y:number,width:number) {
  kit.box({x,y:y+.22,z},width,.4,3.7,'wood',0,.07)
  kit.box({x,y:y+.58,z},width-.18,.45,3.5,'linen',0,.12)
  kit.box({x,y:y+.72,z:z+.5},width-.15,.17,2.3,'sage',0,.1)
  kit.box({x,y:y+1.2,z:z-1.83},width+.2,1.6,.17,'wood',0,.06)
  for(const dx of [-width*.23,width*.23])kit.box({x:x+dx,y:y+.86,z:z-1.12},1.2,.26,.7,'linen',0,.1)
  for(const dx of [-width/2-.65,width/2+.65]) {
    kit.box({x:x+dx,y:y+.38,z:z-1.2},.85,.68,.85,'wood',0,.06)
    kit.cylinder({x:x+dx,y:y+.72,z:z-1.2},{x:x+dx,y:y+1.25,z:z-1.2},.04,.04,'bronze')
    kit.add(new T.CylinderGeometry(.32,.22,.45,16),'linen',{x:x+dx,y:y+1.2,z:z-1.2})
  }
}
function chaise(kit:Kit,x:number,z:number,y:number,yaw:number) {
  const group=[{z:0,y:.3,w:.85,h:.14,d:2.1,mat:'teak'},{z:0,y:.44,w:.78,h:.16,d:1.9,mat:'linen'}]
  for(const g of group)kit.box({x,y:y+g.y,z},g.w,g.h,g.d,g.mat,yaw,.05)
  for(const dx of [-.32,.32])for(const dz of [-.76,.76]) {
    const px=x+Math.cos(yaw)*dx+Math.sin(yaw)*dz,pz=z-Math.sin(yaw)*dx+Math.cos(yaw)*dz
    kit.cylinder({x:px,y:y+.04,z:pz},{x:px,y:y+.28,z:pz},.038,.035,'bronze')
  }
}
export function architecture(kit:Kit) {
  for(const level of levels) {
    const holes=pools.filter(p=>p.y===level.y).map(p=>p.outline)
    if(level.id>0)holes.push(circle(ATRIUM,ATRIUM.radius))
    kit.floor(outlines[level.id],holes,level.y,.58,level.id===2?'stone':'stone')
    shellEdges(kit,outlines[level.id],level.y,level.id)
  }
  for(const support of supports)flowingSupport(kit,support)
  sculpturalShell(kit)
  for(const {x,z} of structuralColumns) {
    kit.cylinder({x,y:8,z},{x,y:19.7,z},.5,.31,'shell',14)
    kit.sphere({x,y:19.2,z},2.2,.65,2.1,'shell',24)
  }
  for(let i=0;i<glazing.length;i++) {
    const w=glazing[i];kit.wall(w.a,w.b,w.y+.08,w.height)
    if(i%4===0)kit.cylinder({...w.a,y:w.y},{...w.a,y:w.y+w.height},.035,.035,'bronze',6)
    kit.cylinder({...w.a,y:w.y+w.height},{...w.b,y:w.y+w.height},.05,.05,'bronze',6)
    kit.cylinder({...w.a,y:w.y+.07},{...w.b,y:w.y+.07},.025,.025,'bronze',5)
  }
  for(const p of partitions)kit.wall(p.a,p.b,p.y,p.height,'shell',.22)
  stairs(kit);crown(kit)
  for(const level of [1,2] as const) {
    perimeter(kit,outlines[level].map(p=>({x:p.x*.991,z:(p.z+7)*.991-7})),levels[level].y)
    const ends=landings.filter(l=>l.level===level)
    perimeter(kit,circle(ATRIUM,ATRIUM.radius+.08),levels[level].y,1.1,p=>ends.some(l=>l.outline.some(q=>Math.hypot(p.x-q.x,p.z-q.z)<1.9)))
  }
  for(const pool of pools) {
    kit.floor(pool.outline,[],pool.y-pool.depth,.18,'waterTile')
    kit.tube(pool.outline.map(p=>({...p,y:pool.y-.05})),.09,'shell',true)
  }
  for(const planter of planters) {
    const r=planter.radius!
    const outline=circle(planter.center,r),inner=circle(planter.center,r-.22)
    kit.add(slabGeometry(outline,[inner],planter.height,.06),'shell',{x:0,y:planter.y,z:0})
    kit.floor(inner,[],planter.y+planter.height-.06,.12,'soil')
  }
  for(const bed of roofBeds) {
    const outline=bed.outline!,inner=outline.map(p=>({x:bed.center.x+(p.x-bed.center.x)*.945,z:bed.center.z+(p.z-bed.center.z)*.945}))
    kit.add(slabGeometry(outline,[inner],bed.height,.06),'shell',{x:0,y:bed.y,z:0})
    kit.floor(inner,[],bed.y+bed.height-.06,.12,'soil')
  }
  sofa(kit,-27,-8,8);sofa(kit,26,-6,8)
  bed(kit,-24,-10,14,4.3);bed(kit,27,-10,14,3.4);bed(kit,-22,19,14,3.4)
  for(const [x,z] of [[-27,-4],[26,-2],[-24,-8],[27,-8]])kit.box({x,y:x<0&&z<-7?14.013:8.013,z},7,.014,5,'sand',0,.025)
  kit.box({x:-19,y:8.79,z:-21},5,.12,1.6,'wood',0,.08)
  for(const dx of [-2,2])kit.box({x:-19+dx,y:8.37,z:-21},.23,.72,1.2,'bronze')
  for(const dx of [-1.7,-.55,.55,1.7])for(const dz of [-1.35,1.35]) {
    kit.box({x:-19+dx,y:8.5,z:-21+dz},.7,.12,.68,'linen',0,.06)
    kit.box({x:-19+dx,y:8.85,z:-21+dz+(dz>0?.28:-.28)},.7,.7,.12,'wood',0,.07)
    for(const sx of [-.25,.25])kit.cylinder({x:-19+dx+sx,y:8,z:-21+dz},{x:-19+dx+sx,y:8.47,z:-21+dz},.035,.035,'bronze')
  }
  kit.box({x:18,y:8.5,z:-20},5.5,1,2.2,'wood',0,.08)
  kit.box({x:18,y:9.04,z:-20},5.7,.12,2.3,'stone',0,.06)
  kit.box({x:20,y:9.11,z:-20},1.1,.026,.6,'metal',0,.04)
  kit.tube([{x:20,y:9.1,z:-20.38},{x:20,y:9.5,z:-20.38},{x:20,y:9.56,z:-20.1}],.03,'bronze')
  for(const z of [3,6,9,12])chaise(kit,39,z,20,-.1)
  for(const x of [-32,-29,-26])chaise(kit,x,2,20,.28)
  // A curved conversation lounge in the observation pavilion.
  const lounge=circle({x:0,z:-21},4.5,3.0,24)
  for(let i=0;i<lounge.length;i++)if(i<8||i>16) {
    const p=lounge[i];kit.box({...p,y:20.48},1.4,.52,1.2,'linen',-i/lounge.length*Math.PI*2,.15)
  }
  kit.add(new T.CylinderGeometry(1.25,1.25,.13,32),'stone',{x:0,y:20.43,z:-21})
}
