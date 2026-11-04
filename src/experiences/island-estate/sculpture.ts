import * as T from 'three'
import { type Kit, surface } from './geometry'
import { ATRIUM, contains, outlines, terrainHeight, westCourt, type WorldPoint } from './layout'

/** Editable spines of the continuous white shell. Coordinates are metres. */
type Section = WorldPoint & { width: number; depth: number }

export function sweptShell(sections: Section[], samples = 72): T.BufferGeometry {
  const spine = new T.CatmullRomCurve3(sections.map(p => new T.Vector3(p.x, p.y, p.z)), false, 'centripetal')
  const vertices: number[] = [], indices: number[] = []
  const sides = 12
  for (let i = 0; i <= samples; i++) {
    const t = i / samples, q = spine.getPoint(t), d = spine.getTangent(t)
    // The same lateral axis follows the curve even when a support rises nearly vertically.
    let hx = d.x, hz = d.z
    if (Math.hypot(hx, hz) < .045) {
      const first = sections[0], last = sections[sections.length - 1]
      hx = last.x - first.x; hz = last.z - first.z
    }
    const len = Math.hypot(hx, hz) || 1, nx = -hz / len, nz = hx / len
    const u = t * (sections.length - 1), j = Math.min(sections.length - 2, Math.floor(u)), f = u - j
    const width = T.MathUtils.lerp(sections[j].width, sections[j + 1].width, f)
    const depth = T.MathUtils.lerp(sections[j].depth, sections[j + 1].depth, f)
    for (let k = 0; k < sides; k++) {
      const a = 2 * Math.PI * k / sides
      // Oval cross-section: a proper underside, unlike a flat decorative ribbon.
      const across = Math.cos(a) * width / 2, rise = Math.sin(a) * depth / 2
      vertices.push(q.x + nx * across, q.y + rise, q.z + nz * across)
      if (i) {
        const prev = (i - 1) * sides + k, next = (i - 1) * sides + (k + 1) % sides
        const here = i * sides + k, after = i * sides + (k + 1) % sides
        indices.push(prev, here, next, next, here, after)
      }
    }
  }
  for (let k = 1; k < sides - 1; k++) {
    indices.push(0, k + 1, k)
    const end = samples * sides
    indices.push(end, end + k, end + k + 1)
  }
  return surface(vertices, indices)
}

const band = (p: number[][]): Section[] => p.map(([x,y,z,width,depth])=>({x,y,z,width,depth}))

function westGardenCanopy(kit:Kit) {
  const segments=96,bands=12,v:number[]=[],faces:number[]=[]
  const idx=(i:number,j:number,bottom=false)=>(bottom?segments*(bands+1):0)+(i%segments)*(bands+1)+j
  for(const bottom of [false,true])for(let i=0;i<segments;i++)for(let j=0;j<=bands;j++){
    const a=i/segments*Math.PI*2,t=j/bands
    const rx=westCourt.rx+(12.3-westCourt.rx)*t,rz=westCourt.rz+(9.2-westCourt.rz)*t
    const height=20+.08+1.7*Math.pow(1-t,1.7)+.3*Math.sin(a*2)*Math.sin(t*Math.PI)
    v.push(westCourt.center.x+rx*Math.sin(a),height-(bottom?.42:0),westCourt.center.z+rz*Math.cos(a))
  }
  for(let i=0;i<segments;i++)for(let j=0;j<bands;j++){
    const n=(i+1)%segments,a=idx(i,j),b=idx(i,j+1),c=idx(n,j),d=idx(n,j+1)
    faces.push(a,b,c,b,d,c)
    const e=idx(i,j,true),f=idx(i,j+1,true),g=idx(n,j,true),h=idx(n,j+1,true)
    faces.push(e,g,f,f,g,h)
  }
  for(let i=0;i<segments;i++)for(const j of [0,bands]){
    const n=(i+1)%segments
    faces.push(idx(i,j),idx(n,j),idx(i,j,true),idx(n,j),idx(n,j,true),idx(i,j,true))
  }
  kit.add(surface(v,faces),'shell')
}

/** A single continuous roof skin and its growing supports. The angular radial
 * grid leaves the atrium open, recedes from the pool and west sky garden, and
 * ends at the actual third-floor outline. Faces and supports share vertices.
 */
export function sculpturalShell(kit: Kit) {
  westGardenCanopy(kit)
  const sectors=192, bands=28, inner=ATRIUM.radius+.35, depth=.72
  const vertices:number[]=[], indices:number[]=[], radii:number[]=[]
  const smooth=(lo:number,hi:number,v:number)=>{const t=T.MathUtils.clamp((v-lo)/(hi-lo),0,1);return t*t*(3-2*t)}
  const angleDistance=(a:number,b:number)=>Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)))
  const supportZones=[
    {theta:5.58,spread:.17,foot:{x:-27,z:16},edge:'outer'},
    {theta:2.27,spread:.16,foot:{x:27,z:-14},edge:'outer'},
    {theta:3.92,spread:.14,foot:{x:-21,z:-23},edge:'outer'},
    // These two structural arches rise beside the glazed three-storey hall.
    {theta:.90,spread:.34,foot:{x:18,z:17},edge:'inner'},
    {theta:Math.PI*2-.90,spread:.34,foot:{x:-18,z:17},edge:'inner'},
  ]
  const shellRadius=(a:number)=>{
    let lo=inner,hi=61
    for(let k=0;k<13;k++) {
      const r=(lo+hi)/2,p={x:ATRIUM.x+Math.sin(a)*r,z:ATRIUM.z+Math.cos(a)*r}
      if(contains(p,outlines[2]))lo=r;else hi=r
    }
    // The east pool is a deep opening in the canopy, the left court a
    // smaller one. Gradual transitions make proper free-form scallops.
    const pool=1-smooth(.24,.70,angleDistance(a,.86))
    const garden=1-smooth(.33,.82,angleDistance(a,4.60))
    return Math.max(inner+.65,Math.min(lo-.18,lo-(lo-16)*pool*.94-(lo-16)*garden*.99))
  }
  const top=(a:number,u:number)=>{
    const crest=5.6+1.5*Math.cos(a-Math.PI)+.6*Math.sin(3*a+.2)
    const westRim=1.6*(1-smooth(.4,.9,angleDistance(a,4.75)))
    const eastRim=1.2*(1-smooth(.3,.8,angleDistance(a,2.35)))
    return 20+crest*Math.pow(1-u,1.8)+.75*Math.sin(u*Math.PI)+(westRim+eastRim)*u*u
  }
  const at=(i:number,j:number,below=false)=>{
    const a=i/sectors*Math.PI*2,u=j/bands,r=inner+(radii[i]-inner)*u
    return {x:ATRIUM.x+Math.sin(a)*r,y:top(a,u)-(below?depth:0),z:ATRIUM.z+Math.cos(a)*r}
  }
  for(let i=0;i<sectors;i++)radii.push(shellRadius(i/sectors*Math.PI*2))
  const index=(i:number,j:number,below=false)=>(below?sectors*(bands+1):0)+(i%sectors)*(bands+1)+j
  for(const below of [false,true])for(let i=0;i<sectors;i++)for(let j=0;j<=bands;j++){
    const p=at(i,j,below);vertices.push(p.x,p.y,p.z)
  }
  const quad=(a:number,b:number,c:number,d:number,reverse=false)=>{
    if(reverse)indices.push(a,c,b,b,c,d);else indices.push(a,b,c,b,d,c)
  }
  for(let i=0;i<sectors;i++)for(let j=0;j<bands;j++){
    const n=(i+1)%sectors
    quad(index(i,j),index(i,j+1),index(n,j),index(n,j+1))
    quad(index(i,j,true),index(n,j,true),index(i,j+1,true),index(n,j+1,true))
  }
  for(let i=0;i<sectors;i++){
    const n=(i+1)%sectors
    const middle=(i+.5)/sectors*Math.PI*2
    if(!supportZones.some(z=>z.edge==='inner'&&angleDistance(middle,z.theta)<z.spread))
      quad(index(i,0),index(n,0),index(i,0,true),index(n,0,true))
    if(!supportZones.some(z=>z.edge==='outer'&&angleDistance(middle,z.theta)<z.spread))
      quad(index(i,bands),index(i,bands,true),index(n,bands),index(n,bands,true))
  }
  // Each tapered arch grows directly from the shared outer edge vertices.
  // At its foot it is narrow; it widens into the underside of the roof.
  for(const zone of supportZones) {
    const edge=zone.edge==='inner'?0:bands
    const span:number[]=[]
    for(let i=0;i<sectors;i++)if(angleDistance(i/sectors*Math.PI*2,zone.theta)<zone.spread)span.push(i)
    span.sort((a,b)=>Math.atan2(Math.sin(a/sectors*Math.PI*2-zone.theta),Math.cos(a/sectors*Math.PI*2-zone.theta))-
      Math.atan2(Math.sin(b/sectors*Math.PI*2-zone.theta),Math.cos(b/sectors*Math.PI*2-zone.theta)))
    if(span.length<2)continue
    const rows=18, front:number[][]=[],back:number[][]=[]
    const tangent={x:Math.cos(zone.theta),z:-Math.sin(zone.theta)}
    for(const [below,grid] of [[false,front],[true,back]] as const)for(let s=0;s<=rows;s++){
      const row:number[]=[],t=s/rows
      for(const i of span) {
        if(s===0){row.push(index(i,edge,below));continue}
        const p=at(i,edge,below),arc=Math.atan2(Math.sin(i/sectors*Math.PI*2-zone.theta),Math.cos(i/sectors*Math.PI*2-zone.theta))/zone.spread
        const narrowing=Math.pow(t,1.15)
        const x=p.x*(1-t)+zone.foot.x*t+tangent.x*arc*1.4*narrowing+Math.sin(t*Math.PI)*Math.sin(zone.theta)*1.6
        const z=p.z*(1-t)+zone.foot.z*t+tangent.z*arc*1.4*narrowing+Math.sin(t*Math.PI)*Math.cos(zone.theta)*1.6
        const y=p.y*(1-t)+8.15*t+1.25*Math.sin(t*Math.PI)-(below?depth:0)
        row.push(vertices.length/3);vertices.push(x,y,z)
      }
      grid.push(row)
    }
    for(let s=0;s<rows;s++)for(let k=0;k<span.length-1;k++){
      quad(front[s][k],front[s+1][k],front[s][k+1],front[s+1][k+1])
      quad(back[s][k],back[s][k+1],back[s+1][k],back[s+1][k+1])
    }
    for(let s=0;s<rows;s++)for(const k of [0,span.length-1])
      quad(front[s][k],back[s][k],front[s+1][k],back[s+1][k])
    for(let k=0;k<span.length-1;k++)
      quad(front[rows][k],front[rows][k+1],back[rows][k],back[rows][k+1])
  }
  kit.add(surface(vertices,indices),'shell')
}

/** The southern cliff walk is a paved sculptural promenade with its own underside. */
export function cliffPromenade(kit: Kit, centerline: WorldPoint[]) {
  const sections: Section[] = centerline.map((p, i) => ({
    ...p, y: p.y - .08,
    width: i < 8 ? 3.3 : i > centerline.length - 9 ? 3.8 : 2.8 + .5 * Math.sin(i / centerline.length * Math.PI),
    depth: .42,
  }))
  kit.add(sweptShell(sections, Math.max(72, centerline.length)), 'shell')
  // Swept parapet is anchored to the outer side of the winding cliff path.
  const edge: WorldPoint[] = []
  for (let i = 1; i < centerline.length - 1; i += 3) {
    const p = centerline[i], a = centerline[i - 1], b = centerline[i + 1]
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1
    edge.push({x: p.x - dz / l * 1.5, y: p.y + .06, z: p.z + dx / l * 1.5})
  }
  if (edge.length > 2) kit.tube(edge, .09, 'shell', false, edge.length * 3, 8)
  // A few swept buttresses visibly tie the elevated walk to the rock instead of floating freely.
  for (let i = 18; i < centerline.length - 9; i += 21) {
    const p = centerline[i], foot = Math.min(p.y - 1.0, terrainHeight({x:p.x + 2,z:p.z}) - .45)
    if (foot < 1 || p.y - foot < .8) continue
    kit.add(sweptShell(band([
      [p.x + 2, foot, p.z, 1.4, .8],
      [p.x + 1.1, foot + (p.y - foot) * .65, p.z, 1.0, .55],
      [p.x, p.y - .3, p.z, 2.8, .65],
    ]), 20), 'shell')
  }
}
