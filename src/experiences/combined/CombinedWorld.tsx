import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import './combined.css'

const Estate=lazy(()=>import('../OceanEstate').then(module=>({default:module.OceanEstate})))
const Woodland=lazy(()=>import('../WoodlandWalk').then(module=>({default:module.WoodlandWalk})))

type ActiveWorld='estate'|'woodland'

// The world value is deliberately null between transitions. This gives the
// outgoing WebGL effect a chance to dispose the canvas, meshes, audio and
// textures before mounting the next renderer.
export function CombinedWorld(){
  const [world,setWorld]=useState<ActiveWorld|null>('estate')
  const [destination,setDestination]=useState<ActiveWorld|null>(null)
  const [returningToEstate,setReturningToEstate]=useState(false)
  const timer=useRef<number|null>(null)
  const changeWorld=useCallback((next:ActiveWorld)=>{
    if(timer.current!==null)return
    setDestination(next)
    setWorld(null)
    timer.current=window.setTimeout(()=>{
      setReturningToEstate(next==='estate')
      setWorld(next)
      setDestination(null)
      timer.current=null
    },420)
  },[])
  useEffect(()=>()=>{if(timer.current!==null)window.clearTimeout(timer.current)},[])

  const exit=()=>{window.location.assign('/')}
  return <main className="combined-world" data-combined-world={world??'crossing'}>
    <Suspense fallback={<section className="combined-crossing"><strong>Growing your surroundings…</strong><small>Only one world is being rendered</small></section>}>
      {world==='estate'&&<Estate key={returningToEstate?'estate-return':'estate-start'} combined combinedArrival={returningToEstate} onForest={()=>changeWorld('woodland')} onBack={exit} onPlan={exit}/>}
      {world==='woodland'&&<Woodland key="woodland" combined onEstate={()=>changeWorld('estate')} onBack={exit}/>}
    </Suspense>
    {destination&&<section className="combined-crossing" aria-label="Switching environments"><span>COMBINED</span><strong>{destination==='woodland'?'Following the woodland path…':'Returning along the driveway…'}</strong><small>Leaving one 3D scene before loading the other</small></section>}
    <div className="combined-brand" aria-label="Combined worlds preview">
      <span>COMBINED</span>
      <small>{world==='estate'?'OCEAN ESTATE + WOODLAND':world==='woodland'?'WOODLAND + OCEAN ESTATE':'CROSSING'}</small>
      {world&&<button type="button" className="combined-preview-jump" aria-label={world==='estate'?'Preview jump to Woodland':'Preview jump to Estate'} onClick={()=>changeWorld(world==='estate'?'woodland':'estate')}>{world==='estate'?'Preview forest →':'Preview estate →'}</button>}
    </div>
  </main>
}
