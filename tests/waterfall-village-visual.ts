// Dev-only rendering harness. This entry is never included in the production build.
import { createVillage } from '../src/experiences/village/scene'
import { spawn, pathNamed, houses } from '../src/experiences/village/world'
if(import.meta.env.DEV) {
  const input={x:0,z:0,yaw:spawn.yaw,pitch:.02,paused:false,quality:1}
  const controller=new AbortController()
  const api=await createVillage(document.querySelector('canvas')!,input,controller.signal,()=>{})
  const views={
    spawn:{position:{x:spawn.x,y:spawn.y+1.62,z:spawn.z},target:{x:-8,y:5.2,z:1}},
    cottage:{position:{x:-8,y:4.42,z:14.4},target:{x:-11,y:5.2,z:6}},
    water:{position:{x:7.5,y:4.12,z:8.6},target:{x:0,y:3.7,z:-3}},
    elevated:{position:{x:34,y:32,z:40},target:{x:-3,y:6,z:-4}},
    interior:{position:{x:-11,y:4.42,z:7.4},target:{x:-11,y:4.1,z:3.7}},
  }
  const key=new URLSearchParams(location.search).get('view') as keyof typeof views
  if(key&&views[key])api.inspect(views[key])
  let tourError=''
  function follow(points:{x:number;y:number;z:number}[]) {
    for(const target of points){for(let i=0;i<5000;i++){
      const p=api.getPosition(),d=Math.hypot(target.x-p.x,target.z-p.z);if(d<.08)break
      const step=Math.min(.05,d),q=api.advance((target.x-p.x)/d*step,(target.z-p.z)/d*step)
      if(Math.hypot(q.x-p.x,q.z-p.z)<.00001)throw Error(`Route blocked at ${JSON.stringify(q)}`)
    }}
  }
  function tour(){
    try{
      // Starts at the existing spawn and never assigns a position or resets the player.
      follow(pathNamed('entrance-to-willow').points)
      for(const [index,next]of [[0,['willow-to-tree','winding-tree-walk','tree-to-library']],[1,['library-to-fern']],[2,['fern-to-lake']]] as const){
        const outside=api.getPosition();follow([houses[index]]);follow([outside]);for(const name of next)follow(pathNamed(name).points)
      }
      return {position:api.getPosition(),error:tourError}
    }catch(e){tourError=String(e);throw e}
  }
  Object.assign(window,{villageQA:{view:(name:keyof typeof views)=>api.inspect(views[name]),diagnostics:api.diagnostics,tour}})
  document.body.classList.add('ready')
}
