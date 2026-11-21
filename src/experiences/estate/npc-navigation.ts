import { floorAt, locationAt, obstacles, type Point } from './plan'
import { walkable } from './navigation'

// The real fox is 0.78 world units high. Its conservative body+personal
// furniture margin is 0.46 m; do not silently fall back to the player's 0.31 m.
export const KUNA_RADIUS=.46
export const KUNA_HOME:Point={x:-13.35,z:8.15}

// A loop *around* the island rather than a 1.6m ping-pong in its side aisle.
// These are candidate resting places, never unconditional teleport targets.
// Unsafe or disconnected candidates are rejected when the nav is created.
export const KUNA_KITCHEN_GOALS:readonly Point[]=[
  KUNA_HOME,
  {x:-13.35,z:11.65}, // north / near the visitor's Kitchen viewpoint
  {x:-19.60,z:11.70}, // beyond the north end of the island
  {x:-19.60,z:3.90},  // west of the island, clear of the kitchen run
  {x:-13.35,z:3.90},  // south aisle, returns around the island
]

export function kunaSafe(p:Point,r=KUNA_RADIUS):boolean {
  if(locationAt(p)!=='Kitchen'||!walkable(p,r))return false
  // The global floor checker tests axial support. Verify the entire fox
  // footprint remains in the kitchen (including diagonal room boundaries).
  for(let i=0;i<8;i++){
    const a=i*Math.PI/4,q={x:p.x+Math.cos(a)*r,z:p.z+Math.sin(a)*r}
    if(locationAt(q)!=='Kitchen'||floorAt(q)===null)return false
  }
  return true
}
export function kunaClearSegment(a:Point,b:Point,r=KUNA_RADIUS):boolean {
  if(!kunaSafe(a,r)||!kunaSafe(b,r))return false
  const d=Math.hypot(b.x-a.x,b.z-a.z)
  const n=Math.max(1,Math.ceil(d/.075))
  for(let i=1;i<n;i++){
    const t=i/n
    if(!kunaSafe({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t},r))return false
  }
  return true
}
export function createKunaNavigator(radius=KUNA_RADIUS){
  const cell=.32,xmin=-22.5,xmax=-11.5,zmin=2.5,zmax=13.5
  const cols=Math.ceil((xmax-xmin)/cell)+1,rows=Math.ceil((zmax-zmin)/cell)+1
  const point=(i:number):Point=>({x:xmin+(i%cols)*cell,z:zmin+Math.floor(i/cols)*cell})
  const allowed=new Uint8Array(cols*rows)
  for(let i=0;i<allowed.length;i++)allowed[i]=Number(kunaSafe(point(i),radius))
  function nearest(p:Point){
    const ci=Math.round((p.x-xmin)/cell),ri=Math.round((p.z-zmin)/cell)
    let best=-1,d=Infinity
    for(let dz=-3;dz<=3;dz++)for(let dx=-3;dx<=3;dx++){
      const x=ci+dx,z=ri+dz
      if(x<0||x>=cols||z<0||z>=rows)continue
      const index=z*cols+x,q=point(index)
      const distance=Math.hypot(q.x-p.x,q.z-p.z)
      if(allowed[index]&&distance<d&&kunaClearSegment(p,q,radius)){best=index;d=distance}
    }
    return best
  }
  function path(a:Point,b:Point):Point[]|null {
    if(!kunaSafe(a,radius)||!kunaSafe(b,radius))return null
    if(kunaClearSegment(a,b,radius))return [{...b}]
    const start=nearest(a),goal=nearest(b)
    if(start<0||goal<0)return null
    const scores=new Float64Array(allowed.length).fill(Infinity),prev=new Int32Array(allowed.length).fill(-1)
    const used=new Uint8Array(allowed.length)
    const open:number[]=[start]
    scores[start]=0
    while(open.length){
      let best=0,bestScore=Infinity
      for(let i=0;i<open.length;i++){
        const n=open[i],q=point(n),g=point(goal)
        const f=scores[n]+Math.hypot(q.x-g.x,q.z-g.z)
        if(f<bestScore){bestScore=f;best=i}
      }
      const current=open.splice(best,1)[0]
      if(used[current])continue
      if(current===goal){
        const reverse:Point[]=[b]
        for(let i=current;i!==start;i=prev[i]){
          if(i<0)return null
          reverse.push(point(i))
        }
        reverse.push(point(start))
        reverse.reverse()
        const route:Point[]=[]
        let from=a,i=0
        while(i<reverse.length){
          let far=i
          for(let j=i;j<reverse.length;j++){
            if(kunaClearSegment(from,reverse[j],radius))far=j
          }
          if(far<i||!kunaClearSegment(from,reverse[far],radius))return null
          route.push(reverse[far]);from=reverse[far];i=far+1
        }
        if(!kunaClearSegment(from,b,radius))return null
        if(Math.hypot(from.x-b.x,from.z-b.z)>.03)route.push({...b})
        return route
      }
      used[current]=1
      const cx=current%cols,cz=Math.floor(current/cols)
      for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
        if(!dx&&!dz)continue
        const x=cx+dx,z=cz+dz
        if(x<0||x>=cols||z<0||z>=rows)continue
        const n=z*cols+x
        if(!allowed[n]||used[n]||!kunaClearSegment(point(current),point(n),radius))continue
        const cost=scores[current]+Math.hypot(dx,dz)*cell
        if(cost<scores[n]){scores[n]=cost;prev[n]=current;open.push(n)}
      }
    }
    return null
  }
  // Reject unreachable destinations at startup rather than bouncing off walls.
  const goals=KUNA_KITCHEN_GOALS.filter(p=>kunaSafe(p,radius)&&!!path(KUNA_HOME,p))
  return {radius,goals,path,isSafe:(p:Point)=>kunaSafe(p,radius),
    clear:(a:Point,b:Point)=>kunaClearSegment(a,b,radius),
    // Exposed only for developer ?kunaDebug=1 visualization.
    debugObstacles:obstacles.filter(o=>o.x2>-23&&o.x1<-11&&o.z2>2&&o.z1<14),
  }
}
