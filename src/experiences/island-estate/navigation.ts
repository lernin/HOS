import { ATRIUM, PLAYER_RADIUS, colliders, glazing, partitions, pools, outlines, levels,
  contains, segmentDistance, supportedHeight, stairHeight, stairPoint, groundHeight, structuralColumns, supports, palms,
  type WorldPoint, type PointXZ } from './layout'

const finite=(p:WorldPoint)=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z)
const walls=[...glazing,...partitions]
const waterBounds=pools.map(pool=>({pool,minX:Math.min(...pool.outline.map(p=>p.x)),maxX:Math.max(...pool.outline.map(p=>p.x)),minZ:Math.min(...pool.outline.map(p=>p.z)),maxZ:Math.max(...pool.outline.map(p=>p.z))}))
function solid(p: WorldPoint, radius: number): boolean {
  for(const {pool,minX,maxX,minZ,maxZ} of waterBounds) {
    if(Math.abs(pool.y-p.y)>.55||p.x<minX-radius||p.x>maxX+radius||p.z<minZ-radius||p.z>maxZ+radius)continue
    if(contains(p,pool.outline)||pool.outline.some((a,i)=>segmentDistance(p,a,pool.outline[(i+1)%pool.outline.length])<radius))return true
  }
  for(const c of colliders) {
    if(p.y<c.y-.2 || p.y>c.y+c.height+.1) continue
    if(c.radius!==undefined&&Math.hypot(p.x-c.center.x,p.z-c.center.z)<c.radius+radius) return true
    if(c.outline&&(contains(p,c.outline)||c.outline.some((a,i)=>segmentDistance(p,a,c.outline![(i+1)%c.outline!.length])<radius)))return true
  }
  if(p.y>=7.8&&p.y<19.7&&structuralColumns.some(c=>Math.hypot(p.x-c.x,p.z-c.z)<.54+radius))return true
  for(const profile of supports)for(let i=1;i<profile.length;i++) {
    const a=profile[i-1],b=profile[i]
    if(p.y>b.y||p.y+1.7<a.y)continue
    const h=Math.max(a.y,Math.min(b.y,p.y+.7)),t=(h-a.y)/(b.y-a.y)
    const x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,rx=a.rx+(b.rx-a.rx)*t,rz=a.rz+(b.rz-a.rz)*t
    if(Math.hypot((p.x-x)/(rx+radius),(p.z-z)/(rz+radius))<1)return true
  }
  if(palms.some(t=>Math.abs(t.y-p.y)<.6&&Math.hypot(t.x-p.x,t.z-p.z)<.18+radius))return true
  for(const wall of walls) {
    if(p.y<wall.y-.25||p.y>wall.y+wall.height)continue
    if(p.x<Math.min(wall.a.x,wall.b.x)-radius||p.x>Math.max(wall.a.x,wall.b.x)+radius||p.z<Math.min(wall.a.z,wall.b.z)-radius||p.z>Math.max(wall.a.z,wall.b.z)+radius)continue
    if(segmentDistance(p,wall.a,wall.b)<radius+.035)return true
  }
  // Headroom beneath the sculptural stair is solid, rather than a walk-through.
  for(const flight of [0,1] as const) {
    const h=stairHeight(p,flight)
    if(h!==null&&h>p.y+.27&&h<p.y+1.9)return true
  }
  return false
}
export function isWalkable(p: WorldPoint, radius=PLAYER_RADIUS): boolean {
  if(!finite(p)||solid(p,radius))return false
  const y=supportedHeight(p,p.y)
  if(y===null||Math.abs(y-p.y)>.28)return false
  for(const [dx,dz] of [[radius,0],[-radius,0],[0,radius],[0,-radius]]) {
    const h=supportedHeight({x:p.x+dx,z:p.z+dz},y)
    if(h===null||Math.abs(h-y)>.4)return false
  }
  return true
}
export function moveSafely(p: WorldPoint,dx:number,dz:number): WorldPoint {
  if(!finite(p)||!Number.isFinite(dx)||!Number.isFinite(dz))return {...p}
  const n=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.09));let q={...p}
  for(let i=0;i<n;i++) {
    const x=dx/n,z=dz/n
    for(const [sx,sz] of [[x,z],[x,0],[0,z]]) {
      if(sx===0&&sz===0)continue
      const a={x:q.x+sx,z:q.z+sz},y=supportedHeight(a,q.y)
      if(y!==null&&Math.abs(y-q.y)<=Math.max(.10,Math.hypot(sx,sz)*.75)&&isWalkable({...a,y})) {
        q={...a,y};break
      }
    }
  }
  return q
}
export function clearLine(a: WorldPoint,b: WorldPoint): boolean {
  const n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.085))
  let p=a
  for(let i=1;i<=n;i++) {
    const t=i/n,q={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t}
    const moved=moveSafely(p,q.x-p.x,q.z-p.z)
    // A line must be traversable by the same walker, not just a succession of
    // individually valid points floating up beside the staircase.
    if(Math.hypot(moved.x-q.x,moved.z-q.z)>.025||Math.abs(moved.y-q.y)>.19)return false
    p=moved
  }
  return true
}

/** Consume exact route vertices; early advancement can miss a stair landing. */
export function advanceRoute(start:WorldPoint,route:WorldPoint[],distance:number) {
  let position={...start},budget=Math.max(0,distance),moved=false
  for(let i=0;route.length&&i<8;i++) {
    const goal=route[0],dx=goal.x-position.x,dz=goal.z-position.z,len=Math.hypot(dx,dz)
    if(len<.0001&&Math.abs(goal.y-position.y)<.22){route.shift();continue}
    if(budget<.0001||len<.0001)break
    const step=Math.min(len,budget),next=moveSafely(position,dx/len*step,dz/len*step)
    const actual=Math.hypot(next.x-position.x,next.z-position.z)
    moved=moved||actual>.00001;position=next;budget-=step
    if(actual<step-.0001)break
    if(Math.hypot(goal.x-position.x,goal.z-position.z)<.0001&&Math.abs(goal.y-position.y)<.22)route.shift()
  }
  return {position,moving:moved}
}

const CELL=1.15,MINX=-67,MINZ=-58,COLS=125,ROWS=153
type Node = {p:WorldPoint;links:number[]}
/** Layered grid plus physical helical stair links; no floor teleports. */
export function createNavigator() {
  const nodes:Node[]=[],layers:Map<number,number>[]=[new Map(),new Map(),new Map()]
  const index=(x:number,z:number)=>z*COLS+x
  const coord=(x:number,z:number):PointXZ=>({x:MINX+x*CELL,z:MINZ+z*CELL})
  for(const level of [0,1,2] as const) {
    for(let z=0;z<ROWS;z++)for(let x=0;x<COLS;x++) {
      const c=coord(x,z)
      if(level>0 && (!contains(c,outlines[level])||Math.hypot(c.x,c.z+7)<ATRIUM.radius-1.7))continue
      const y=level===0?groundHeight(c):levels[level].y
      if(y===null)continue
      const p={...c,y};if(!isWalkable(p,PLAYER_RADIUS+.03))continue
      layers[level].set(index(x,z),nodes.length);nodes.push({p,links:[]})
    }
    for(const [key,id] of layers[level]) {
      const x=key%COLS,z=Math.floor(key/COLS)
      for(const [dx,dz] of [[1,0],[0,1],[1,1],[1,-1]]) {
        const j=layers[level].get(index(x+dx,z+dz));if(j===undefined)continue
        if(dx&&dz&&(!layers[level].has(index(x+dx,z))||!layers[level].has(index(x,z+dz))))continue
        if(Math.abs(nodes[id].p.y-nodes[j].p.y)>CELL*.72)continue
        const a=nodes[id].p,b=nodes[j].p
        const middle={x:(a.x+b.x)/2,y:(a.y+b.y)/2,z:(a.z+b.z)/2}
        if(!isWalkable(middle))continue
        if([.25,.75].some(t=>solid({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t},PLAYER_RADIUS)))continue
        if(!clearLine(a,b)||!clearLine(b,a))continue
        nodes[id].links.push(j);nodes[j].links.push(id)
      }
    }
  }
  const link=(a:number,b:number)=>{if(!nodes[a].links.includes(b))nodes[a].links.push(b);if(!nodes[b].links.includes(a))nodes[b].links.push(a)}
  let previous=-1
  for(const flight of [0,1] as const) {
    for(let i=0;i<=144;i++) {
      const p=stairPoint(flight,i/144),id=nodes.length
      nodes.push({p,links:[]});if(previous>=0)link(previous,id);previous=id
      if(i===0||i===144) {
        const level=(flight+(i===144?1:0)) as 0|1|2
        // Radial landings span the atrium void and physically meet each gallery.
        let last=id
        for(const r of [8.5,9.2,9.9,10.6,11.3,12]) {
          const a=stairPoint(flight,i/144,r),j=nodes.length
          if(!isWalkable(a))continue
          nodes.push({p:a,links:[]});link(last,j);last=j
        }
        for(const j of layers[level].values()) {
          const a=nodes[j].p,b=nodes[last].p
          if(Math.hypot(a.x-b.x,a.z-b.z)<CELL*1.8&&Math.abs(a.y-b.y)<.3&&clearLine(a,b))link(last,j)
        }
      }
    }
  }
  function nearest(p: WorldPoint):number {
    let best=-1,distance=Infinity
    for(let i=0;i<nodes.length;i++) {
      const q=nodes[i].p,dy=Math.abs(q.y-p.y)
      if(dy>1.2)continue
      const d=Math.hypot(q.x-p.x,q.z-p.z,dy*2)
      if(d>distance||d>CELL*2.5)continue
      if(clearLine(p,q)){distance=d;best=i}
    }
    return best
  }
  const distance=(a:WorldPoint,b:WorldPoint)=>Math.hypot(a.x-b.x,a.z-b.z,(a.y-b.y)*1.5)
  function path(start:WorldPoint,end:WorldPoint):WorldPoint[]|null {
    if(!isWalkable(start)||!isWalkable(end))return null
    if(clearLine(start,end))return [{...end}]
    const a=nearest(start),b=nearest(end);if(a<0||b<0)return null
    const costs=new Float64Array(nodes.length).fill(Infinity),parents=new Int32Array(nodes.length).fill(-1),closed=new Uint8Array(nodes.length)
    const heap:{id:number;score:number}[]=[]
    function push(id:number,score:number) {
      heap.push({id,score});let i=heap.length-1
      while(i>0){const p=(i-1)>>1;if(heap[p].score<=score)break;[heap[i],heap[p]]=[heap[p],heap[i]];i=p}
    }
    function pop() {
      const result=heap[0],last=heap.pop()!
      if(heap.length){heap[0]=last;let i=0;for(;;){let j=i,l=i*2+1,r=l+1;if(l<heap.length&&heap[l].score<heap[j].score)j=l;if(r<heap.length&&heap[r].score<heap[j].score)j=r;if(j===i)break;[heap[i],heap[j]]=[heap[j],heap[i]];i=j}}
      return result.id
    }
    costs[a]=0;push(a,distance(nodes[a].p,nodes[b].p))
    while(heap.length) {
      const i=pop();if(closed[i])continue
      if(i===b) {
        const route:WorldPoint[]=[end];let j=b
        while(j!==a){route.push(nodes[j].p);j=parents[j]}
        route.push(nodes[a].p);route.reverse()
        const smoothed:WorldPoint[]=[];let current=start,k=0
        while(k<route.length) {
          let far=k
          // Preserve the stair's vertical curve. Straightening across it cuts a void.
          while(far+1<route.length&&far-k<28&&clearLine(current,route[far+1]))far++
          smoothed.push({...route[far]});current=route[far];k=far+1
        }
        return smoothed
      }
      closed[i]=1
      for(const j of nodes[i].links) {
        if(closed[j])continue
        const cost=costs[i]+distance(nodes[i].p,nodes[j].p)
        if(cost<costs[j]){costs[j]=cost;parents[j]=i;push(j,cost+distance(nodes[j].p,nodes[b].p))}
      }
    }
    return null
  }
  return {path,nodeCount:nodes.length}
}
