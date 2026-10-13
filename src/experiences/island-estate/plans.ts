import { ATRIUM, levels, outlines, pools, glazing, partitions, planters, roofBeds, furnitureSolids,
  stair, stairPoint, landings, structuralColumns, islandOutline, paths, dock, crownHeight, crownProfile, type PointXZ, type Level } from './layout'

export type Drawing = 'all' | 'island' | 'ground' | 'first' | 'roof' | 'section'
const points=(p:PointXZ[])=>p.map(q=>`${q.x.toFixed(2)},${q.z.toFixed(2)}`).join(' ')
const poly=(p:PointXZ[],fill:string,stroke='#7c8379',width=.22)=>`<polygon points="${points(p)}" fill="${fill}" stroke="${stroke}" stroke-width="${width}"/>`
const line=(a:PointXZ,b:PointXZ,stroke='#63786b',width=.2)=>`<line x1="${a.x}" y1="${a.z}" x2="${b.x}" y2="${b.z}" stroke="${stroke}" stroke-width="${width}"/>`
const text=(x:number,z:number,s:string,size=1.8,color='#42534a')=>`<text x="${x}" y="${z}" text-anchor="middle" font-size="${size}" fill="${color}">${s}</text>`
const ring=(p:PointXZ,r:number,fill:string,stroke='#879c82')=>`<circle cx="${p.x}" cy="${p.z}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width=".2"/>`
function dimension(a:PointXZ,b:PointXZ,label:string,horizontal=true) {
  const tick=horizontal?{x:0,z:1.1}:{x:1.1,z:0}
  return line(a,b,'#43534d',.17)+line({x:a.x-tick.x,z:a.z-tick.z},{x:a.x+tick.x,z:a.z+tick.z},'#43534d',.17)+line({x:b.x-tick.x,z:b.z-tick.z},{x:b.x+tick.x,z:b.z+tick.z},'#43534d',.17)+text((a.x+b.x)/2+(horizontal?0:2.5),(a.z+b.z)/2+(horizontal?-1.3:0),label,1.8)
}
function floor(level:Level) {
  let s=poly(outlines[level],'#efece1','#455f56',.38)
  if(level>0)s+=ring(ATRIUM,ATRIUM.radius,'#faf9f4','#8c9a92')
  for(const p of pools.filter(p=>p.y===levels[level].y))s+=poly(p.outline,'#afdad8','#488b8f',.25)
  for(const p of planters.filter(p=>p.y===levels[level].y))s+=ring(p.center,p.radius!,'#d5ddc5')
  for(const p of roofBeds.filter(p=>p.y===levels[level].y))s+=poly(p.outline!,'#d5ddc5','#78927a',.18)
  for(const column of structuralColumns)if(level<2)s+=ring(column,.5,'#647c72')
  for(const w of glazing.filter(w=>w.y===levels[level].y))s+=line(w.a,w.b,'#69a5b0',.36)
  for(const w of partitions.filter(w=>w.y===levels[level].y))s+=line(w.a,w.b,'#4e6158',.5)
  for(const p of furnitureSolids.filter(p=>p.y===levels[level].y)){if(p.outline)s+=poly(p.outline,'#cfc6b3','#9a9282',.17);else if(p.radius)s+=ring(p.center,p.radius,'#cfc6b3')}
  for(const l of landings.filter(l=>l.level===level))s+=poly(l.outline,'#e0d8c6','#9b9589',.18)
  for(let i=0;i<=stair.risers;i++) {
    const flight=(level===2?1:0) as 0|1,t=i/stair.risers
    const a=stairPoint(flight,t,stair.radius-stair.width/2),b=stairPoint(flight,t,stair.radius+stair.width/2)
    s+=line(a,b,'#a8a18f',.13)
  }
  s+=`<path d="M ${points(Array.from({length:65},(_,i)=>stairPoint((level===2?1:0) as 0|1,i/64))).replaceAll(' ',' L ')}" fill="none" stroke="#7a877a" stroke-width=".3"/>`
  if(level===0) {
    s+=text(0,-9,'GRAND ATRIUM',1.65)+text(-27,-3,'LIVING',1.6)+text(27,-2,'OCEAN LOUNGE',1.5)
    s+=text(-19,-25,'DINING',1.6)+text(20,-26,'KITCHEN',1.6)+text(0,19,'MAIN ENTRANCE',1.5)
    s+=line({x:0,z:34},{x:0,z:25},'#69796a',.28)+text(0,37,'ARRIVAL',1.55)
  } else if(level===1) {
    s+=text(0,-11,'OPEN TO BELOW',1.65)+text(-25,-3,'PRIMARY SUITE',1.45)+text(27,-3,'GUEST SUITE',1.45)
    s+=text(-22,25,'GUEST SUITE',1.5)+text(25,23,'PRIVATE TERRACE',1.3)+text(0,12,'GALLERY',1.45)
  } else {
    s+=text(-26,-12,'SKY GARDEN',1.45)+text(28,7,'INFINITY POOL',1.5,'#306e75')
    s+=text(0,-20,'OBSERVATION',1.5)+text(0,-17.5,'PAVILION',1.5)+text(-25,12,'LOUNGE',1.5)+text(14,27,'POOL TERRACE',1.45)
  }
  const xs=outlines[level].map(p=>p.x),zs=outlines[level].map(p=>p.z),x0=Math.min(...xs),x1=Math.max(...xs),z0=Math.min(...zs),z1=Math.max(...zs)
  s+=dimension({x:x0,z:-41},{x:x1,z:-41},`${(x1-x0).toFixed(1)} m`)
  s+=dimension({x:52,z:z0},{x:52,z:z1},`${(z1-z0).toFixed(1)} m`,false)
  s+=dimension({x:-ATRIUM.radius,z:0},{x:ATRIUM.radius,z:0},'19.6 m ATRIUM')
  s+=`<path d="M -49,-23 L -49,-33 L -51,-29 M -49,-33 L -47,-29" fill="none" stroke="#596f64" stroke-width=".24"/>`+text(-49,-35,'N',1.8)
  return s
}
function section() {
  const x0=-44,x1=45,fy=(h:number)=>23.8-h
  let s=''
  for(const l of levels) {
    const y=fy(l.y)
    if(l.id===0)s+=`<rect x="${x0}" y="${y}" width="89" height=".6" fill="#dad3c1" stroke="#647c70" stroke-width=".2"/>`
    else for(const [x,w] of [[x0,44-ATRIUM.radius],[ATRIUM.radius,45-ATRIUM.radius]])s+=`<rect x="${x}" y="${y}" width="${w}" height=".6" fill="#e1dccf" stroke="#647c70" stroke-width=".2"/>`
    s+=line({x:-49,z:y},{x:58,z:y},'#aab3ab',.12)+text(53,y-.9,l.datum,1.9)+text(53,y+1.7,l.label,1.65)
  }
  for(const x of [-34,-26,-18,18,26,34]) {
    s+=line({x,z:fy(8)},{x,z:fy(19.2)},'#7aadb4',.22)
  }
  for(const flight of [0,1] as const) {
    const p=Array.from({length:73},(_,i)=>{const q=stairPoint(flight,i/72);return {x:q.x,z:fy(q.y)}})
    s+=`<polyline points="${points(p)}" fill="none" stroke="#7d7f6e" stroke-width=".45"/>`
    s+=`<polyline points="${points(p.map(q=>({...q,z:q.z-1.08})))}" fill="none" stroke="#91afb0" stroke-width=".18"/>`
  }
  for(const sign of [-1,1])s+=`<polyline points="${points(crownProfile.map(([r,h])=>({x:r*sign,z:fy(crownHeight(Math.PI/2)+h)})))}" fill="none" stroke="#b9bba9" stroke-width=".65"/>`
  s+=`<rect x="-1.35" y="1.55" width="2.7" height="14.2" fill="#bededa" opacity=".7"/>`
  s+=text(0,21,'OPEN ATRIUM · TWO CONNECTED STAIR FLIGHTS',1.9)+text(0,24.2,'2.8 m stair width · 36 risers per flight · 6.0 m rise',1.6)
  s+=dimension({x:-47,z:fy(8)},{x:-47,z:fy(20)},'12.0 m',false)
  s+=dimension({x:x0,z:28},{x:x1,z:28},'89 m COORDINATED BUILDING WIDTH')
  return s
}
function master() {
  let s=poly(islandOutline,'#dfe3ce','#788d76',.35)+poly(outlines[2],'#faf8ef','#526c63',.4)
  for(const p of pools.filter(p=>p.y===20))s+=poly(p.outline,'#acd6d6','#628f90',.3)
  s+=ring(ATRIUM,ATRIUM.radius,'#e4e7d9')
  for(const path of paths)s+=`<polyline points="${points(path)}" fill="none" stroke="#b6a789" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`
  s+=poly(dock.outline,'#c7af89')+line({x:47,z:86},{x:57,z:107},'#b49d7f',2.4)
  s+=text(0,-15,'MANSION',3.4)+text(-37,39,'PRIVATE BEACH',2.5)+text(47,64,'CLIFF WALK',2.5)+text(64,119,'YACHT DOCK',2.5)
  s+=dimension({x:-65,z:-65},{x:74,z:-65},'139 m APPROXIMATE ISLAND WIDTH')
  return s
}
const baseStyle=`<style>text{font-family:Arial,sans-serif;letter-spacing:.025em}*{vector-effect:non-scaling-stroke}</style>`
function frame(width:number,height:number,body:string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Dimensioned architectural plans of The Island Estate">${baseStyle}<rect width="100%" height="100%" fill="#faf9f4"/>${body}</svg>`
}
export function createDrawing(view:Drawing='all'):string {
  if(view==='all') {
    let s=`<text x="42" y="48" font-size="25" fill="#273f37">THE ISLAND ESTATE</text><text x="42" y="73" font-size="11" fill="#798577">COORDINATED ARCHITECTURAL STUDY · METRES · REFERENCE-BASED GEOMETRY</text>`
    for(const l of levels) {
      const x=48+l.id*390
      s+=`<text x="${x}" y="116" font-size="17" fill="#374c42">0${l.id+1} · ${l.label.toUpperCase()}</text><text x="${x}" y="137" font-size="11" fill="#788577">${l.datum} · sea-level datum ${(l.y).toFixed(2)} m</text><g transform="translate(${x+155} 305) scale(3.15)">${floor(l.id)}</g>`
    }
    s+=`<line x1="42" y1="465" x2="1160" y2="465" stroke="#d0d6c9"/><text x="42" y="506" font-size="17" fill="#374c42">04 · SECTION A–A · ATRIUM PROJECTION</text><g transform="translate(530 586) scale(9)">${section()}</g>`
    s+=`<text x="42" y="880" font-size="11" fill="#7b887b">X EAST · Z SOUTH · Y UP | FLOWING PLATES SHARE ONE LAYOUT WITH THE 3D MODEL | CONCEPT STUDY, NOT A CONSTRUCTION DOCUMENT</text>`
    return frame(1200,920,s)
  }
  const body=view==='island'?master():view==='section'?section():floor(view==='ground'?0:view==='first'?1:2)
  const title=view==='island'?'ISLAND MASTER PLAN':view==='section'?'SECTION A–A':`${view.toUpperCase()} FLOOR PLAN`
  const transform=view==='island'?'translate(380 310) scale(3.6)':view==='section'?'translate(405 275) scale(7.1)':'translate(360 350) scale(6.15)'
  return frame(920,790,`<text x="35" y="48" font-size="21" fill="#273f37">THE ISLAND ESTATE · ${title}</text><text x="35" y="73" font-size="11" fill="#778577">COORDINATED CONCEPT STUDY · ALL DIMENSIONS IN METRES</text><g transform="${transform}">${body}</g><text x="35" y="754" font-size="11" fill="#778577">Derived from the same geometry as the explorable model. Conceptual architectural interpretation.</text>`)
}
