import * as T from 'three'
import { type EstateKit, v } from './kit'
import { spaDome, spaTreeBed } from './site-layout'
import type { Rect } from './plan'

type Opening={cx:number;cz:number;rx:number;rz:number}
const ellipse=(o:Opening)=>new T.Path().absellipse(o.cx,-o.cz,o.rx,o.rz,0,Math.PI*2,true)

/** Real openings through every slab layer, including its underside. */
export function slabWithOpening(k:EstateKit,r:Rect,y:number,height:number,material:string,parent:T.Group,opening:Opening){
  const shape=new T.Shape()
  shape.moveTo(r.x1,-r.z1);shape.lineTo(r.x2,-r.z1);shape.lineTo(r.x2,-r.z2);shape.lineTo(r.x1,-r.z2);shape.closePath()
  shape.holes.push(ellipse(opening))
  const geometry=new T.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false,curveSegments:64})
  geometry.rotateX(-Math.PI/2)
  return k.mesh(geometry,material,0,y-height/2,0,parent)
}

function ring(k:EstateKit,o:Opening,width:number,y:number,height:number,material:string,parent:T.Group){
  const shape=new T.Shape().absellipse(o.cx,-o.cz,o.rx+width,o.rz+width,0,Math.PI*2,false)
  shape.holes.push(ellipse(o))
  const geometry=new T.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false,curveSegments:64})
  geometry.rotateX(-Math.PI/2)
  k.mesh(geometry,material,0,y-height/2,0,parent)
}

export function buildSpaDome(k:EstateKit,overhead:T.Group){
  const {cx,cz,rx,rz,base,rise}=spaDome
  // A raised stone upstand carries the frame; the outer bronze channel reads
  // as a continuous drainage gutter at the roof junction.
  ring(k,spaDome,.23,base-.15,.30,'travertine',overhead)
  ring(k,spaDome,.11,base+.035,.07,'bronze',overhead)
  ring(k,{...spaDome,rx:rx+.29,rz:rz+.29},.09,base-.22,.055,'bronze',overhead)
  const at=(a:number,p:number)=>v(cx+rx*Math.sin(p)*Math.cos(a),base+rise*Math.cos(p),cz+rz*Math.sin(p)*Math.sin(a))
  const bands=[.13,.37,.61,.85,1.09,1.33,Math.PI/2],sectors=16
  for(let i=0;i<sectors;i++){
    const a=i/sectors*Math.PI*2
    k.beam(Array.from({length:19},(_,j)=>at(a,.13+(Math.PI/2-.13)*j/18)),.037,'bronze',overhead,8)
    for(let j=0;j<bands.length-1;j++){
      // Four corners form each individually framed glass panel.
      const corners=[at(a+.005,bands[j]+.004),at(a+Math.PI*2/sectors-.005,bands[j]+.004),at(a+Math.PI*2/sectors-.005,bands[j+1]-.004),at(a+.005,bands[j+1]-.004)]
      const g=new T.BufferGeometry()
      g.setAttribute('position',new T.Float32BufferAttribute(corners.flatMap(p=>p.toArray()),3));g.setIndex([0,1,2,0,2,3]);g.computeVertexNormals()
      k.mesh(g,'domeGlass',0,0,0,overhead)
    }
  }
  for(const p of bands)k.beam(Array.from({length:97},(_,i)=>at(i/96*Math.PI*2,p)),.026,'bronze',overhead,6)
  // Raised crown cover leaves a discreet ventilation gap around the oculus.
  const crownY=base+rise*Math.cos(.13)
  const cover=k.mesh(new T.CircleGeometry(.76,48),'domeGlass',cx,crownY+.15,cz,overhead);cover.rotation.x=-Math.PI/2;cover.scale.y=rz/rx
  k.beam(Array.from({length:65},(_,i)=>v(cx+Math.cos(i/64*Math.PI*2)*.76,crownY+.15,cz+Math.sin(i/64*Math.PI*2)*.76*rz/rx)),.025,'bronze',overhead,6)
  for(let i=0;i<4;i++){const a=i*Math.PI/2,p=at(a,.13);k.cylinder(p.x,crownY+.075,p.z,.023,.15,'bronze',overhead)}
}

export function buildSpaTreeBed(k:EstateKit){
  ring(k,spaTreeBed,.15,6.035,.13,'travertine',k.root)
  const soil=k.mesh(new T.CircleGeometry(1,64),'soil',spaTreeBed.cx,5.95,spaTreeBed.cz);soil.rotation.x=-Math.PI/2;soil.scale.set(spaTreeBed.rx,spaTreeBed.rz,1)
  // Low planting leaves the tree trunk and treatment circulation legible.
  for(let i=0;i<15;i++){
    const a=i*2.4,r=.67+.09*(i%3),x=spaTreeBed.cx+Math.cos(a)*spaTreeBed.rx*r,z=spaTreeBed.cz+Math.sin(a)*spaTreeBed.rz*r
    k.ellipsoid(x,6.06,z,.16,.14,.18,i%3?'leafDark':'leafLight',k.root,8)
  }
}
