import {paths,spawn,type Point} from './world'

function line(points:Point[]){return points.map(p=>`${p.x.toFixed(1)},${p.z.toFixed(1)}`).join(' ')}

export function WoodlandMiniMap({position,yaw,onBack}:{position:Point;yaw:number;onBack:()=>void}){
  return <aside className="woodland-map-cluster" aria-label="Woodland map">
    <div className="woodland-minimap">
      <svg viewBox="-205 -205 410 410" role="img" aria-label="Map showing your position on the woodland trails">
        <circle className="woodland-map-ground" cx="0" cy="0" r="194"/>
        {paths.map((path,i)=><polyline key={i} className={i===0?'woodland-map-main':'woodland-map-branch'} points={line(path)}/>)}
        <circle className="woodland-map-home" cx={spawn.x} cy={spawn.z} r="7"/>
        <g className="woodland-map-you" transform={`translate(${position.x} ${position.z}) rotate(${-yaw*180/Math.PI})`}>
          <circle r="9"/>
          <path d="M 0 -15 L 7 6 L 0 3 L -7 6 Z"/>
        </g>
      </svg>
      <span>YOU ARE HERE</span>
    </div>
    <button className="woodland-back" onClick={onBack}>← The Lab</button>
  </aside>
}
