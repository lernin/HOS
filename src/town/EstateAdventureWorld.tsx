import { useEffect, useRef, useState } from 'react'
import { createEstate, type EstateInput, type EstateState } from '../experiences/estate/scene'
import { destinations, spawn, type Point } from '../experiences/estate/plan'

type Props = {
  target: number
  stage: 'ready' | 'rolling' | 'walking' | 'question'
  stageTime: number
  onArrival: () => void
  onRouteError: (message: string) => void
}

export const ESTATE_STOPS = [
  { id: 1, name: 'Entrance', icon: '🚪', prompts: ['Introduce yourself to the owner of this beautiful home.'] },
  { id: 2, name: 'Great room', icon: '🛋️', prompts: ['You discover a very unusual object in the great room. Describe it and explain why it is here.', 'Welcome a visitor and give three interesting facts about this house.'] },
  { id: 3, name: 'Pool', icon: '🏊', prompts: ['A mysterious splash appears in the empty pool. Explain three possible causes.', 'Invent three safety rules for an underwater birthday party.'] },
  { id: 4, name: 'Courtyard', icon: '🌳', prompts: ['A talking tree wants to move to the beach. Convince it to stay or help it go.', 'Describe what could happen in this courtyard at night.'] },
  { id: 5, name: 'Kitchen', icon: '🍳', prompts: ['A robot chef made toothpaste soup. Tell it how to fix the recipe.', 'Explain how to prepare a delicious meal using first, then, next, and finally.'] },
  { id: 6, name: 'Primary suite', icon: '🛏️', prompts: ['The bedroom belongs to an invisible superhero. Describe the clues you found.', 'A visitor lost their suitcase. Ask three questions to find it.'] },
  { id: 7, name: 'Spa', icon: '🧖', prompts: ['A dragon wants a relaxing spa day. Make a safe schedule for it.', 'Explain how someone can feel calm and comfortable here.'] },
  { id: 8, name: 'Library', icon: '📚', prompts: ['A magical book refuses to open. Ask the book three questions.', 'Describe the most mysterious book you can imagine.'] },
  { id: 9, name: 'Guest suites', icon: '🧳', prompts: ['An alien guest has arrived. Explain five important things about staying in this house.', 'Make a polite conversation between a guest and the host.'] },
  { id: 10, name: 'Ocean lookout', icon: '🌊', prompts: ['You spot something impossible in the ocean. Describe it and what happens next.', 'Describe the view using at least five adjectives.'] },
  { id: 11, name: 'West promenade', icon: '🚶', prompts: ['A lost explorer needs directions back to the house. Help them.', 'Tell an exciting story about a walk along the ocean.'] },
  { id: 12, name: 'East promenade', icon: '🌅', prompts: ['You find an unusual treasure on this path. What is it and who owns it?', 'Compare morning and evening walks along the promenade.'] },
] as const

function destinationFor(stop: number) {
  if(stop <= 1) return destinations[0]
  return destinations[stop - 1] ?? destinations[0]
}
const initialInput = (): EstateInput => ({
  yaw: spawn.yaw,
  pitch: -.025,
  x: 0,
  z: 0,
  paused: false,
  speed: 2.0,
  quality: 1,
  lighting: 'daylight',
  lookedAt: 0,
  looking: false,
  fast: false,
  maxTurnSpeed: 28 * Math.PI / 180,
})

export default function EstateAdventureWorld({target,stage,stageTime,onArrival,onRouteError}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<Awaited<ReturnType<typeof createEstate>> | null>(null)
  const inputRef = useRef<EstateInput>(initialInput())
  const arrivalRef = useRef(onArrival)
  const errorRef = useRef(onRouteError)
  const journeyRef = useRef<{ target: Point; started: number; hadMovement: boolean; finished: boolean } | null>(null)
  const [ready,setReady]=useState(false)
  const [progress,setProgress]=useState('Opening Ocean Estate…')
  const [error,setError]=useState('')
  const [position,setPosition]=useState<Point>({x:spawn.x,z:spawn.z})
  const [fps,setFps]=useState(0)
  const keys=useRef(new Set<string>())
  const pointer=useRef<{x:number,y:number,id:number}|null>(null)

  useEffect(()=>{arrivalRef.current=onArrival;errorRef.current=onRouteError},[onArrival,onRouteError])

  useEffect(()=>{
    const controller=new AbortController()
    if(!canvasRef.current)return
    let disposed=false
    const report=(s:EstateState)=>{
      if(disposed)return
      setPosition(s.position)
      setFps(s.fps)
      const j=journeyRef.current
      if(!j||j.finished)return
      if(s.moving)j.hadMovement=true
      const distance=Math.hypot(s.position.x-j.target.x,s.position.z-j.target.z)
      if(!s.moving && distance<1.45 && (j.hadMovement || performance.now()-j.started>1100)){
        j.finished=true
        journeyRef.current=null
        arrivalRef.current()
      }
    }
    void createEstate(canvasRef.current,inputRef.current,controller.signal,report,setProgress)
      .then(engine=>{
        if(controller.signal.aborted){engine.dispose();return}
        engineRef.current=engine
        inputRef.current.paused=false
        setReady(true)
      }).catch(e=>{
        if(!controller.signal.aborted)setError(e instanceof Error?e.message:'The estate could not be loaded.')
      })
    const onKey=(e:KeyboardEvent)=>{
      const k=e.key.toLowerCase()
      if(e.target instanceof HTMLElement&&['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))return
      if(!['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(k))return
      e.preventDefault()
      if(e.type==='keydown')keys.current.add(k)
      else keys.current.delete(k)
      // Manual walking is only enabled between turns; it never cancels guided travel.
      if(journeyRef.current)return
      inputRef.current.x=Number(keys.current.has('d')||keys.current.has('arrowright'))-Number(keys.current.has('a')||keys.current.has('arrowleft'))
      inputRef.current.z=Number(keys.current.has('s')||keys.current.has('arrowdown'))-Number(keys.current.has('w')||keys.current.has('arrowup'))
    }
    const down=(e:PointerEvent)=>{if(e.button!==0)return;pointer.current={x:e.clientX,y:e.clientY,id:e.pointerId}}
    const move=(e:PointerEvent)=>{
      const p=pointer.current
      if(!p||e.pointerId!==p.id)return
      const dx=e.clientX-p.x,dy=e.clientY-p.y
      inputRef.current.yaw-=dx*.0036
      inputRef.current.pitch=Math.max(-.75,Math.min(.75,inputRef.current.pitch+dy*.003))
      inputRef.current.looking=true
      inputRef.current.lookedAt=performance.now()
      p.x=e.clientX;p.y=e.clientY
    }
    const up=()=>{pointer.current=null;inputRef.current.looking=false}
    window.addEventListener('keydown',onKey)
    window.addEventListener('keyup',onKey)
    const canvas=canvasRef.current
    canvas.addEventListener('pointerdown',down)
    canvas.addEventListener('pointermove',move)
    canvas.addEventListener('pointerup',up)
    canvas.addEventListener('pointercancel',up)
    return()=>{
      disposed=true;controller.abort()
      engineRef.current?.dispose()
      engineRef.current=null
      keys.current.clear()
      window.removeEventListener('keydown',onKey)
      window.removeEventListener('keyup',onKey)
      canvas.removeEventListener('pointerdown',down)
      canvas.removeEventListener('pointermove',move)
      canvas.removeEventListener('pointerup',up)
      canvas.removeEventListener('pointercancel',up)
    }
  },[])

  useEffect(()=>{
    if(!ready || stage!=='walking')return
    const engine=engineRef.current
    if(!engine)return
    const destination=destinationFor(target)
    const now=performance.now()
    inputRef.current.x=0
    inputRef.current.z=0
    keys.current.clear()
    const success=engine.go(destination,destination.name)
    if(!success){
      errorRef.current('No navigable path to '+destination.name+'. Try a new game or select another stop.')
      return
    }
    journeyRef.current={target:{x:destination.x,z:destination.z},started:now,hadMovement:false,finished:false}
    // This is a route activation, not a timed teleport. Only engine reports can finish.
  },[ready,stage,stageTime,target])

  useEffect(()=>{
    if(stage!=='walking'){
      if(stage==='ready' && engineRef.current) {
        journeyRef.current=null
        engineRef.current.stop()
      }
    }
  },[stage])

  return <div className="estate-adventure-scene">
    <canvas ref={canvasRef} tabIndex={0} aria-label="Real Ocean Estate 3D navigation; WASD to explore when not moving; drag to look" />
    {!ready && <div className="estate-adventure-loading">{error||progress}<small>{error?'The game cannot proceed until the scene loads.':'Loading original 3D estate and navigation…'}</small></div>}
    <div className="estate-adventure-location">Ocean Estate <span>·</span> {stage==='walking'?'Guided walking':stage==='question'?'Arrived': 'Explore'} <small>{Math.round(position.x)}, {Math.round(position.z)} · {fps} FPS</small></div>
    <div className="estate-adventure-controls">Drag to look around · WASD / arrows to explore between turns · Dice chooses a guided route</div>
  </div>
}
