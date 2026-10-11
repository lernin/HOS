import { contains, doorways, floorAt, obstacles, floors, type Point } from './plan'
export const RADIUS=.31
export const CELL=.4
const MINX=Math.floor(Math.min(...floors.map(f=>f.x1)))-2,MINZ=Math.floor(Math.min(...floors.map(f=>f.z1)))-2
const COLS=Math.ceil((Math.max(...floors.map(f=>f.x2))+2-MINX)/CELL)+1,ROWS=Math.ceil((Math.max(...floors.map(f=>f.z2))+2-MINZ)/CELL)+1
export function walkable(p:Point,r=RADIUS){const y=floorAt(p);if(y===null||obstacles.some(o=>contains(o,p,r)))return false;const onRoundCourt=y===4.8&&Math.hypot(p.x-1,p.z-41)<=19;const edge=onRoundCourt?Math.min(r,.06):r;return [[-edge,0],[edge,0],[0,-edge],[0,edge]].every(([x,z])=>floorAt({x:p.x+x,z:p.z+z})!==null)}
function safeGrade(a:Point,b:Point){const ya=floorAt(a),yb=floorAt(b);return ya!==null&&yb!==null&&Math.abs(yb-ya)<=Math.max(.045,Math.hypot(b.x-a.x,b.z-a.z)*.65)}
export function clearLine(a:Point,b:Point){const n=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.12);let prev=a;for(let i=0;i<=n;i++){const t=i/Math.max(1,n),p={x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t};if(!walkable(p)||!safeGrade(prev,p))return false;prev=p}return true}
export function moveSafely(p:Point,dx:number,dz:number):Point {
  const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.12));let q={...p}
  for(let i=0;i<steps;i++) { const x=dx/steps,z=dz/steps,next={x:q.x+x,z:q.z+z}
    if(walkable(next)&&safeGrade(q,next))q=next
    else if(walkable({x:q.x+x,z:q.z})&&safeGrade(q,{x:q.x+x,z:q.z}))q.x+=x
    else if(walkable({x:q.x,z:q.z+z})&&safeGrade(q,{x:q.x,z:q.z+z}))q.z+=z
  } return q
}

// A traversable opening is not automatically a comfortable entrance.
// Check the precise intersection with each architectural opening: the route
// must go through its central corridor, never scrape a doorjamb.
function entrancePenalty(a:Point,b:Point):number {
  let penalty=0
  for(const door of doorways){
    const av=door.axis==='x'?a.x:a.z,bv=door.axis==='x'?b.x:b.z
    const ad=av-door.at,bd=bv-door.at
    if(ad*bd>=0||Math.abs(bv-av)<1e-6)continue
    const t=(door.at-av)/(bv-av)
    const cross=door.axis==='x'?a.z+(b.z-a.z)*t:a.x+(b.x-a.x)*t
    if(cross<door.from-.01||cross>door.to+.01)continue
    const half=(door.to-door.from)/2,center=(door.from+door.to)/2
    const deviation=Math.abs(cross-center)
    const allowed=Math.max(.6,Math.min(1.3,half*.42))
    if(deviation>allowed)return Infinity
    penalty+=12*Math.pow(deviation/Math.max(.6,half),2)
  }
  return penalty
}
// Guided walks enter a wide doorway on its central axis, well before the
// wall plane. This prevents the apparent approach toward a doorway jamb.
function centeredGatewayPoint(p:Point){
  for(const door of doorways){
    const half=(door.to-door.from)/2
    if(half<1.8)continue
    const axial=door.axis==='x'?p.x:p.z
    const lateral=door.axis==='x'?p.z:p.x
    if(Math.abs(axial-door.at)>1.15||lateral<=door.from||lateral>=door.to)continue
    const allowed=Math.max(.6,Math.min(1.3,half*.42))
    if(Math.abs(lateral-(door.from+door.to)/2)>allowed)return false
  }
  return true
}
function centeredLine(a:Point,b:Point){
  if(!Number.isFinite(entrancePenalty(a,b)))return false
  const n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.22))
  for(let i=0;i<=n;i++){
    const t=i/n,p={x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t}
    if(!centeredGatewayPoint(p))return false
  }
  return true
}

// Prefer breathing room around walls and furniture, while preserving narrow
// doorway access and the original collision/grade safeguards.
const COMFORT_RADIUS=.85
function comfortableLine(a:Point,b:Point){
  if(!clearLine(a,b)||!centeredLine(a,b))return false
  const length=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.ceil(length/.2)
  for(let i=1;i<steps;i++){
    const distance=Math.min(i*.2,length-i*.2)
    // Don't reject routes simply because the requested start/end hugs furniture.
    if(distance<.9)continue
    const t=i/steps,p={x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t}
    if(!walkable(p,COMFORT_RADIUS))return false
  }
  return true
}

// Round open-space waypoint corners into short diagonal transitions.
// Retain the original bend wherever clearance or slope makes rounding unsafe.
function softenCorners(start:Point,route:Point[]):Point[]{
  const points=[start,...route],out:Point[]=[start]
  for(let i=1;i<points.length-1;i++){
    const a=points[i-1],b=points[i],c=points[i+1]
    const ab=Math.hypot(b.x-a.x,b.z-a.z),bc=Math.hypot(c.x-b.x,c.z-b.z)
    if(ab>.2&&bc>.2){
      const ux=(b.x-a.x)/ab,uz=(b.z-a.z)/ab,vx=(c.x-b.x)/bc,vz=(c.z-b.z)/bc
      const bend=ux*vx+uz*vz
      if(bend<.97&&bend>-.85){
        const setback=Math.min(.88,ab*.32,bc*.32)
        const entry={x:b.x-ux*setback,z:b.z-uz*setback}
        const exit={x:b.x+vx*setback,z:b.z+vz*setback}
        if(clearLine(out[out.length-1],entry)&&clearLine(entry,exit)&&centeredLine(out[out.length-1],entry)&&centeredLine(entry,exit)&&walkable(entry,.6)&&walkable(exit,.6)){
          out.push(entry,exit);continue
        }
      }
    }
    out.push(b)
  }
  out.push(points[points.length-1])
  return out.slice(1)
}

// A* over a clearance-eroded grid, followed by comfort-aware visibility smoothing.
// The same plan drives rendering and navigation. No corner cutting or wall teleports.
export function createNavigator(){
  const grid=new Uint8Array(COLS*ROWS)
  const point=(i:number)=>({x:MINX+(i%COLS)*CELL,z:MINZ+Math.floor(i/COLS)*CELL})
  const comfort=new Uint8Array(grid.length)
  for(let i=0;i<grid.length;i++){
    const p=point(i);grid[i]=Number(walkable(p,RADIUS+.04)&&centeredGatewayPoint(p))
    if(grid[i])comfort[i]=Number(walkable(p,COMFORT_RADIUS))
  }
  function nearest(p:Point){const c=Math.round((p.x-MINX)/CELL),r=Math.round((p.z-MINZ)/CELL);let best=-1,dist=Infinity
    for(let z=-3;z<=3;z++)for(let x=-3;x<=3;x++){const cx=c+x,rz=r+z,i=rz*COLS+cx;if(cx<0||cx>=COLS||rz<0||rz>=ROWS||!grid[i])continue;const q=point(i),d=Math.hypot(q.x-p.x,q.z-p.z);if(d<dist&&clearLine(p,q)&&centeredLine(p,q)){dist=d;best=i}}return best}
  function path(start:Point,end:Point):Point[]|null {
    if(!walkable(start)||!walkable(end))return null
    if(comfortableLine(start,end))return [{...end}]
    const a=nearest(start),b=nearest(end);if(a<0||b<0)return null
    const costs=new Float32Array(grid.length).fill(Infinity),parents=new Int32Array(grid.length).fill(-1),closed=new Uint8Array(grid.length)
    const heap:{id:number;score:number}[]=[]
    const heuristic=(i:number)=>{const p=point(i),q=point(b);return Math.hypot(p.x-q.x,p.z-q.z)/CELL}
    function push(id:number,score:number){heap.push({id,score});let i=heap.length-1;while(i>0){const p=(i-1)>>1;if(heap[p].score<=score)break;[heap[p],heap[i]]=[heap[i],heap[p]];i=p}}
    function pop(){const out=heap[0],last=heap.pop()!;if(heap.length){heap[0]=last;let i=0;for(;;){let n=i,l=i*2+1,r=l+1;if(l<heap.length&&heap[l].score<heap[n].score)n=l;if(r<heap.length&&heap[r].score<heap[n].score)n=r;if(n===i)break;[heap[n],heap[i]]=[heap[i],heap[n]];i=n}}return out.id}
    costs[a]=0;push(a,heuristic(a))
    while(heap.length){const i=pop();if(closed[i])continue;if(i===b){const route:Point[]=[end];let p=i;while(p!==a){route.push(point(p));p=parents[p]}route.push(point(a));route.reverse();const smooth:Point[]=[];let current=start,k=0;while(k<route.length){let far=k;while(far+1<route.length&&comfortableLine(current,route[far+1]))far++;
        // Narrow doorways must remain traversable even when comfort clearance fails.
        if(far===k&&(!clearLine(current,route[far])||!centeredLine(current,route[far])))return null;smooth.push(route[far]);current=route[far];k=far+1}return softenCorners(start,smooth)}closed[i]=1
      const col=i%COLS,row=Math.floor(i/COLS)
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){const x=col+dx,z=row+dz,j=z*COLS+x;if(x<0||x>=COLS||z<0||z>=ROWS||!grid[j]||closed[j])continue;if(dx&&dz&&(!grid[i+dx]||!grid[i+dz*COLS]))continue
        if(!safeGrade(point(i),point(j)))continue
        const gate=entrancePenalty(point(i),point(j));if(!Number.isFinite(gate))continue
        const step=dx&&dz?Math.SQRT2:1
        // A small detour through open space is preferable to scraping along walls.
        const cost=costs[i]+step*(comfort[j]?1:1.65)+gate;if(cost<costs[j]){costs[j]=cost;parents[j]=i;push(j,cost+heuristic(j))}}
    } return null
  }return {path}
}
