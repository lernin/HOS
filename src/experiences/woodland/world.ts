export type Point = { x: number; z: number }
export const LIMIT = 194
export const heightAt = (x: number, z: number) => 2.4*Math.sin(x*.018)*Math.cos(z*.021)+1.3*Math.sin(z*.035+x*.012)
export const loopAt = (t: number): Point => ({x:128*Math.cos(t)+8*Math.sin(t*3),z:108*Math.sin(t)+6*Math.cos(t*2)})
export const mainLoop = Array.from({length:257},(_,i)=>loopAt(i/256*Math.PI*2))
function branch(start:number,end:number,bend:number):Point[]{
  const a=loopAt(start),b=loopAt(end),dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz)
  return Array.from({length:81},(_,i)=>{const t=i/80,s=Math.sin(t*Math.PI)*bend;return {x:a.x+dx*t-dz/len*s,z:a.z+dz*t+dx/len*s}})
}
export const paths=[mainLoop,branch(.15,1.75,28),branch(2.25,3.95,-24),branch(4.35,5.95,30)]
export const spawn={...loopAt(Math.PI/2),yaw:-Math.PI/2,pitch:0}
export function pathDistance(x:number,z:number){let d=Infinity;for(const line of paths)for(let i=1;i<line.length;i++){const a=line[i-1],b=line[i],dx=b.x-a.x,dz=b.z-a.z;const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));d=Math.min(d,Math.hypot(x-a.x-dx*t,z-a.z-dz*t))}return d}
export function seeded(seed=6247){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}}
export type Placement=Point & {kind:string;height:number;angle:number;solid:number}
export function placements(){
  const r=seeded(),out:Placement[]=[]
  for(let i=0;i<2100;i++){
    const x=(r()-.5)*420,z=(r()-.5)*420,d=pathDistance(x,z)
    if(Math.hypot(x,z)>208||d<6)continue
    const kind=r()<.22?'pine':r()<.5?'tree':'tree-b',h=9+r()*9
    out.push({x,z,kind,height:h,angle:r()*Math.PI*2,solid:.65})
  }
  for(let i=0;i<5400;i++){
    const x=(r()-.5)*400,z=(r()-.5)*400,d=pathDistance(x,z)
    if(Math.hypot(x,z)>200||d<4.8)continue
    const n=r(),kind=n<.12?'rock':n<.32?'bush':n<.52?'fern':n<.75?'clover':'grass'
    out.push({x,z,kind,height:kind==='rock'?.6+r()*1.4:kind==='bush'?.8+r()*.8:.25+r()*.55,angle:r()*Math.PI*2,solid:kind==='rock'?.65:0})
  }
  // Keep a generous plant-free shoulder around every trail so foliage never spills onto the road.
  // A lighter, more distant edge planting still gives the paths a natural frame without visual clutter.
  for(const line of paths)for(let i=0;i<line.length;i+=4){const p=line[i],q=line[Math.min(i+1,line.length-1)],dx=q.x-p.x,dz=q.z-p.z,l=Math.hypot(dx,dz)||1;for(const side of [-1,1]){const off=5.4+r()*2.2;out.push({x:p.x-dz/l*off*side,z:p.z+dx/l*off*side,kind:r()<.38?'bush':'fern',height:.38+r()*.48,angle:r()*6.28,solid:0})}}
  return out
}
export const normalizeMove=(x:number,z:number)=>{const d=Math.max(1,Math.hypot(x,z));return {x:x/d,z:z/d}}
export function move(pos:Point,x:number,z:number,yaw:number,dt:number,solids:Placement[],speed=3.1):Point{
  const v=normalizeMove(x,z),step=Math.min(.05,Math.max(0,dt))*Math.max(0,speed),dx=(v.x*Math.cos(yaw)+v.z*Math.sin(yaw))*step,dz=(v.z*Math.cos(yaw)-v.x*Math.sin(yaw))*step
  const clear=(a:number,b:number)=>Math.hypot(a,b)<LIMIT&&!solids.some(p=>p.solid>0&&Math.hypot(p.x-a,p.z-b)<p.solid+.3)
  const nx=clear(pos.x+dx,pos.z)?pos.x+dx:pos.x
  return {x:nx,z:clear(nx,pos.z+dz)?pos.z+dz:pos.z}
}