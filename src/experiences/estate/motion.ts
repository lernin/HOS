// Small, renderer-independent movement helpers, shared by walking and tour routes.
export type MotionPoint={x:number;z:number}
export function skipReachedWaypoints<T extends MotionPoint>(path:T[],position:MotionPoint,radius=.16):T[]{
  let reached=0
  while(reached<path.length&&Math.hypot(path[reached].x-position.x,path[reached].z-position.z)<radius)reached++
  return reached?path.slice(reached):path
}
export function easeGuidedPace(current:number,target:number,dt:number){
  const pace=Math.max(.22,Math.min(1,current)),goal=Math.max(.22,Math.min(1,target))
  // Slow down responsively for turns; recover gently to avoid visible surges.
  const rate=goal<pace?5.5:2.4
  return pace+(goal-pace)*(1-Math.exp(-Math.max(0,dt)*rate))
}
