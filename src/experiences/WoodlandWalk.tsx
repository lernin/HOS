import {useEffect,useRef,useState} from 'react'
import {createWoodland,type Input} from './woodland/scene'
import {spawn} from './woodland/world'
import {forestAudio} from './woodland/audio'
import './woodland/woodland.css'

export function WoodlandWalk({onBack}:{onBack:()=>void}){
  const canvas=useRef<HTMLCanvasElement>(null),dialog=useRef<HTMLDialogElement>(null)
  const input=useRef<Input>({x:0,z:0,yaw:spawn.yaw,pitch:0,paused:true})
  const world=useRef<Awaited<ReturnType<typeof createWoodland>>|null>(null),audio=useRef<ReturnType<typeof forestAudio>|null>(null)
  const [loaded,setLoaded]=useState(0),[error,setError]=useState(''),[started,setStarted]=useState(false),[attempt,setAttempt]=useState(0),[soundError,setSoundError]=useState(false)
  const [nature,setNature]=useState(.55),[music,setMusic]=useState(.35),[sensitivity,setSensitivity]=useState(1)
  const stick=useRef<{id:number;x:number;y:number}|null>(null),look=useRef<{id:number;x:number;y:number}|null>(null),nub=useRef<HTMLSpanElement>(null)
  const stopMove=()=>{input.current.x=0;input.current.z=0;stick.current=null;if(nub.current)nub.current.style.transform='translate(0,0)'}
  const stop=()=>{stopMove();look.current=null}
  useEffect(()=>{const controller=new AbortController();setError('');setLoaded(0)
    void createWoodland(canvas.current!,input.current,controller.signal,setLoaded).then(value=>{if(controller.signal.aborted)value.dispose();else world.current=value}).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'This device could not open the woodland.')})
    return()=>{controller.abort();world.current=null}
  },[attempt])
  useEffect(()=>()=>audio.current?.dispose(),[])
  useEffect(()=>{audio.current?.levels(nature,music)},[nature,music])
  useEffect(()=>{
    const keys=new Set<string>(),update=()=>{input.current.x=Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft'));input.current.z=Number(keys.has('s')||keys.has('arrowdown'))-Number(keys.has('w')||keys.has('arrowup'))}
    const key=(e:KeyboardEvent)=>{const k=e.key.toLowerCase();if(input.current.paused){keys.clear();return}if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(k)){e.preventDefault();if(e.type==='keydown')keys.add(k);else keys.delete(k);update()}}
    const pause=()=>{keys.clear();stop();input.current.paused=true;audio.current?.pause();setStarted(false)}
    const visibility=()=>{if(document.hidden)pause()}
    window.addEventListener('keydown',key);window.addEventListener('keyup',key);window.addEventListener('blur',pause);document.addEventListener('visibilitychange',visibility)
    return()=>{window.removeEventListener('keydown',key);window.removeEventListener('keyup',key);window.removeEventListener('blur',pause);document.removeEventListener('visibilitychange',visibility)}
  },[])
  function begin(){input.current.paused=false;setStarted(true);try{if(!audio.current)audio.current=forestAudio();audio.current.levels(nature,music);void audio.current.start().catch(()=>setSoundError(true))}catch{setSoundError(true)}}
  function settings(){stop();input.current.paused=true;dialog.current?.showModal()}
  return <main className="woodland">
    <canvas ref={canvas} aria-label="Immersive woodland with looping walking trails" onContextMenu={e=>e.preventDefault()}/>
    <div className="woodland-look" aria-label="Drag to look around" onPointerDown={e=>{if(input.current.paused||look.current)return;e.currentTarget.setPointerCapture(e.pointerId);look.current={id:e.pointerId,x:e.clientX,y:e.clientY}}} onPointerMove={e=>{const p=look.current;if(!p||p.id!==e.pointerId||input.current.paused)return;input.current.yaw-=(e.clientX-p.x)*.003*sensitivity;input.current.pitch=Math.max(-1.25,Math.min(1.25,input.current.pitch-(e.clientY-p.y)*.003*sensitivity));p.x=e.clientX;p.y=e.clientY}} onPointerUp={()=>{look.current=null}} onPointerCancel={()=>{look.current=null}}/>
    <header className="woodland-bar"><button onClick={onBack}>← The Lab</button><span>WOODLAND <small>A place to wander</small></span><button onClick={settings}>Sound & settings</button></header>
    {started&&<><div className="woodland-stick" role="application" aria-label="Movement joystick: drag your left thumb" onPointerDown={e=>{if(input.current.paused||stick.current)return;e.currentTarget.setPointerCapture(e.pointerId);const r=e.currentTarget.getBoundingClientRect();stick.current={id:e.pointerId,x:r.left+r.width/2,y:r.top+r.height/2}}} onPointerMove={e=>{const p=stick.current;if(!p||p.id!==e.pointerId||input.current.paused)return;const dx=e.clientX-p.x,dy=e.clientY-p.y,d=Math.max(42,Math.hypot(dx,dy));input.current.x=dx/d;input.current.z=dy/d;if(nub.current)nub.current.style.transform=`translate(${dx/d*36}px,${dy/d*36}px)`}} onPointerUp={stopMove} onPointerCancel={stopMove} onLostPointerCapture={stopMove}><span ref={nub}/><small>MOVE</small></div><div className="woodland-look-hint">DRAG TO LOOK</div></>}
    {!started&&<section className="woodland-intro"><div className="woodland-panel"><span className="woodland-eyebrow">THE LAB · FIELD EXPERIMENT</span><h1>Take the long way.</h1><p>A spacious woodland, a winding circuit, and quieter paths that always find their way back.</p><p className="woodland-controls">Left thumb to walk · Right thumb to look<br/>On a computer: WASD or arrows · Drag to look</p>{error?<><p role="alert">{error}</p><button onClick={()=>setAttempt(x=>x+1)}>Try again</button></>:<button disabled={loaded<1} onClick={begin}>{loaded<1?`Growing your woodland… ${Math.round(loaded*100)}%`:'Enter the woodland'}</button>}<small>Best enjoyed sideways. Headphones optional.</small></div></section>}
    <dialog ref={dialog} className="woodland-dialog" onClose={()=>{stop();input.current.paused=!started}}><h2>Make yourself at home.</h2><label>Forest recording <input type="range" min="0" max="1" step=".01" value={nature} onChange={e=>setNature(Number(e.target.value))}/></label><label>Gentle music <input type="range" min="0" max="1" step=".01" value={music} onChange={e=>setMusic(Number(e.target.value))}/></label><label>Look sensitivity <input type="range" min=".4" max="2" step=".1" value={sensitivity} onChange={e=>setSensitivity(Number(e.target.value))}/></label>{soundError&&<p>Audio could not start. Walking is still available.</p>}<p>Recorded forest birds by Pierre SIBANARCO / BigSoundBank (CC0). Original synthesized ambient music. Nature models by Quaternius (CC0).</p><button onClick={()=>{world.current?.reset();dialog.current?.close()}}>Return to the trail entrance</button><button onClick={()=>dialog.current?.close()}>Done</button></dialog>
  </main>
}
