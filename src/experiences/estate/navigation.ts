import { contains, floorAt, obstacles, type Point } from './plan'
export const RADIUS=.31
export const CELL=.4
const MINX=-42,MINZ=-38,COLS=221,ROWS=226
export function walkable(p:Point,r=RADIUS){return floorAt(p)!==null&&!obstacles.some(o=>contains(o,p,r))&&[[-r,0],[r,0],[0,-r],[0,r]].every(([x,z])=>floorAt({x:p.x+x,z:p.z+z})!==null)}
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
// A* over a clearance-eroded grid, followed by visibility smoothing. The same
// plan drives rendering and navigation. No corner cutting or wall teleports.
export function createNavigator(){
  const grid=new Uint8Array(COLS*ROWS)
  const point=(i:number)=>({x:MINX+(i%COLS)*CELL,z:MINZ+Math.floor(i/COLS)*CELL})
  for(let i=0;i<grid.length;i++)grid[i]=Number(walkable(point(i),RADIUS+.04))
  function nearest(p:Point){const c=Math.round((p.x-MINX)/CELL),r=Math.round((p.z-MINZ)/CELL);let best=-1,dist=Infinity
    for(let z=-3;z<=3;z++)for(let x=-3;x<=3;x++){const cx=c+x,rz=r+z,i=rz*COLS+cx;if(cx<0||cx>=COLS||rz<0||rz>=ROWS||!grid[i])continue;const q=point(i),d=Math.hypot(q.x-p.x,q.z-p.z);if(d<dist&&clearLine(p,q)){dist=d;best=i}}return best}
  function path(start:Point,end:Point):Point[]|null {
    if(!walkable(start)||!walkable(end))return null
    if(clearLine(start,end))return [{...end}]
    const a=nearest(start),b=nearest(end);if(a<0||b<0)return null
    const costs=new Float32Array(grid.length).fill(Infinity),parents=new Int32Array(grid.length).fill(-1),closed=new Uint8Array(grid.length)
    const heap:{id:number;score:number}[]=[]
    const heuristic=(i:number)=>{const p=point(i),q=point(b);return Math.hypot(p.x-q.x,p.z-q.z)/CELL}
    function push(id:number,score:number){heap.push({id,score});let i=heap.length-1;while(i>0){const p=(i-1)>>1;if(heap[p].score<=score)break;[heap[p],heap[i]]=[heap[i],heap[p]];i=p}}
    function pop(){const out=heap[0],last=heap.pop()!;if(heap.length){heap[0]=last;let i=0;for(;;){let n=i,l=i*2+1,r=l+1;if(l<heap.length&&heap[l].score<heap[n].score)n=l;if(r<heap.length&&heap[r].score<heap[n].score)n=r;if(n===i)break;[heap[n],heap[i]]=[heap[i],heap[n]];i=n}}return out.id}
    costs[a]=0;push(a,heuristic(a))
    while(heap.length){const i=pop();if(closed[i])continue;if(i===b){const route:Point[]=[end];let p=i;while(p!==a){route.push(point(p));p=parents[p]}route.push(point(a));route.reverse();const smooth:Point[]=[];let current=start,k=0;while(k<route.length){let far=k;while(far+1<route.length&&clearLine(current,route[far+1]))far++;smooth.push(route[far]);current=route[far];k=far+1}return smooth}closed[i]=1
      const col=i%COLS,row=Math.floor(i/COLS)
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){const x=col+dx,z=row+dz,j=z*COLS+x;if(x<0||x>=COLS||z<0||z>=ROWS||!grid[j]||closed[j])continue;if(dx&&dz&&(!grid[i+dx]||!grid[i+dz*COLS]))continue
        if(!safeGrade(point(i),point(j)))continue
        const cost=costs[i]+(dx&&dz?Math.SQRT2:1);if(cost<costs[j]){costs[j]=cost;parents[j]=i;push(j,cost+heuristic(j))}}
    } return null
  }return {path}
}
