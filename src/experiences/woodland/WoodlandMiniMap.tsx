import {useState} from 'react'
import {paths,spawn,type Point} from './world'

function line(points:Point[]){return points.map(p=>`${p.x.toFixed(1)},${p.z.toFixed(1)}`).join(' ')}
function nearestTrailPoint(point:Point){
  let best=paths[0][0],distance=Infinity
  for(const path of paths)for(const p of path){
    const d=Math.hypot(point.x-p.x,point.z-p.z)
    if(d<distance){distance=d;best=p}
  }
  return best
}

export function WoodlandMiniMap({position,yaw,onBack,onTeleport}:{position:Point;yaw:number;onBack:()=>void;onTeleport:(point:Point)=>void}){
  const [expanded,setExpanded]=useState(false)
  function chooseDestination(event:React.PointerEvent<SVGSVGElement>){
    if(!expanded){setExpanded(true);return}
    const rect=event.currentTarget.getBoundingClientRect()
    const x=-205+(event.clientX-rect.left)/rect.width*410
    const z=-205+(event.clientY-rect.top)/rect.height*410
    onTeleport(nearestTrailPoint({x,z}))
    setExpanded(false)
  }
  return <aside className={`woodland-map-cluster${expanded?' expanded':''}`} aria-label="Woodland map">
    {expanded&&<button type="button" className="woodland-map-backdrop" aria-label="Close map" onClick={()=>setExpanded(false)}/>}
    <div className="woodland-minimap">
      <svg viewBox="-205 -205 410 410" role="img" aria-label={expanded?'Expanded map. Tap a trail to move there.':'Map showing your position on the woodland trails. Tap to expand.'} onPointerDown={chooseDestination}>
        <circle className="woodland-map-ground" cx="0" cy="0" r="194"/>
        {paths.map((path,i)=><polyline key={i} className={i===0?'woodland-map-main':'woodland-map-branch'} points={line(path)}/>)}
        <circle className="woodland-map-home" cx={spawn.x} cy={spawn.z} r="7"/>
        <g className="woodland-map-you" transform={`translate(${position.x} ${position.z}) rotate(${-yaw*180/Math.PI})`}>
          <circle r="9"/>
          <path d="M 0 -15 L 7 6 L 0 3 L -7 6 Z"/>
        </g>
      </svg>
      <span>{expanded?'TAP A TRAIL TO GO THERE':'YOU ARE HERE · TAP MAP'}</span>
      {expanded&&<button type="button" className="woodland-map-close" onClick={()=>setExpanded(false)} aria-label="Close expanded map">×</button>}
    </div>
    {!expanded&&<button className="woodland-back" onClick={onBack}>← The Lab</button>}
  </aside>
}
