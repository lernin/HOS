// Pure, renderer-independent movement for ambient Estate characters.
export type WalkPoint={x:number;z:number}
export function advanceWalker<T extends WalkPoint>(position:WalkPoint,route:readonly T[],speed:number,dt:number){
  let budget=Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0))*Math.max(0,Math.min(2,Number.isFinite(speed)?speed:0))
  let x=position.x,z=position.z,i=0
  while(i<route.length){
    const next=route[i],dx=next.x-x,dz=next.z-z,d=Math.hypot(dx,dz)
    if(d<.075){i++;continue}
    if(budget<=0)break
    const step=Math.min(d,budget)
    x+=dx/d*step;z+=dz/d*step;budget-=step
    if(step>=d-1e-7)i++
  }
  return {point:{x,z},remaining:route.slice(i),moved:Math.hypot(x-position.x,z-position.z)}
}
