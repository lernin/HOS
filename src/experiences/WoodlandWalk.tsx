import {useEffect,useMemo,useRef,useState} from 'react'
import {createWoodland,type Input} from './woodland/scene'
import {spawn} from './woodland/world'
import {forestAudio,woodlandProgressions,type MusicRating} from './woodland/audio'
import {WoodlandMusicPalette,rankedMusic,type MusicRatings} from './woodland/WoodlandMusicPalette'
import './woodland/woodland.css'

const MUSIC_RATINGS_KEY='woodland-music-ratings-v1'
function readMusicRatings():MusicRatings{
  const defaults=Object.fromEntries(woodlandProgressions.map((item,index)=>[item.id,index===0?3:1])) as MusicRatings
  try{
    const saved=JSON.parse(localStorage.getItem(MUSIC_RATINGS_KEY)||'{}') as Record<string,number>
    for(const item of woodlandProgressions){
      const value=saved[item.id]
      if(value===0||value===1||value===2||value===3)defaults[item.id]=value
    }
  }catch{}
  return defaults
}

export function WoodlandWalk({onBack}:{onBack:()=>void}){
  const canvas=useRef<HTMLCanvasElement>(null),dialog=useRef<HTMLDialogElement>(null)
  const input=useRef<Input>({x:0,z:0,yaw:spawn.yaw,pitch:0,paused:true})
  const targetLook=useRef({yaw:spawn.yaw,pitch:0}),lookVelocity=useRef({yaw:0,pitch:0})
  const world=useRef<Awaited<ReturnType<typeof createWoodland>>|null>(null),audio=useRef<ReturnType<typeof forestAudio>|null>(null)
  const auditionTimer=useRef<number|null>(null)
  const [loaded,setLoaded]=useState(0),[error,setError]=useState(''),[started,setStarted]=useState(false),[attempt,setAttempt]=useState(0),[soundError,setSoundError]=useState(false)
  const [nature,setNature]=useState(.55),[music,setMusic]=useState(.35)
  const [lookGain,setLookGain]=useState(1),[cameraMass,setCameraMass]=useState(.28),[handleSoftness,setHandleSoftness]=useState(.18)
  const [activeAudition,setActiveAudition]=useState<string|null>(null)
  const [musicRatings,setMusicRatings]=useState<MusicRatings>(readMusicRatings)
  const enabledProgressions=useMemo(()=>rankedMusic(musicRatings).filter(entry=>entry.rating>0).map(entry=>entry.item.id),[musicRatings])
  const stick=useRef<{id:number;x:number;y:number}|null>(null),look=useRef<{id:number;x:number;y:number}|null>(null),nub=useRef<HTMLSpanElement>(null)
  const stopMove=()=>{input.current.x=0;input.current.z=0;stick.current=null;if(nub.current)nub.current.style.transform='translate(0,0)'}
  const stop=()=>{stopMove();look.current=null}
  const resetLook=()=>{targetLook.current={yaw:spawn.yaw,pitch:0};lookVelocity.current={yaw:0,pitch:0};input.current.yaw=spawn.yaw;input.current.pitch=0}

  useEffect(()=>{const controller=new AbortController();setError('');setLoaded(0)
    void createWoodland(canvas.current!,input.current,controller.signal,setLoaded).then(value=>{if(controller.signal.aborted)value.dispose();else world.current=value}).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'This device could not open the woodland.')})
    return()=>{controller.abort();world.current=null}
  },[attempt])
  useEffect(()=>()=>{if(auditionTimer.current)window.clearTimeout(auditionTimer.current);audio.current?.dispose()},[])
  useEffect(()=>{audio.current?.levels(nature,music)},[nature,music])
  useEffect(()=>{localStorage.setItem(MUSIC_RATINGS_KEY,JSON.stringify(musicRatings));audio.current?.setProgressions(enabledProgressions)},[musicRatings,enabledProgressions])

  useEffect(()=>{
    let frame=0,last=performance.now()
    const tick=(now:number)=>{
      const dt=Math.min(.033,Math.max(.001,(now-last)/1000));last=now
      if(!input.current.paused){
        const mass=.35+cameraMass*3.65
        const stiffness=220*(1-handleSoftness*.94)
        const dampingRatio=1.05-cameraMass*.55
        const damping=2*Math.sqrt(stiffness*mass)*dampingRatio
        const yawError=targetLook.current.yaw-input.current.yaw,pitchError=targetLook.current.pitch-input.current.pitch
        lookVelocity.current.yaw+=(stiffness*yawError-damping*lookVelocity.current.yaw)/mass*dt
        lookVelocity.current.pitch+=(stiffness*pitchError-damping*lookVelocity.current.pitch)/mass*dt
        input.current.yaw+=lookVelocity.current.yaw*dt
        input.current.pitch=Math.max(-1.25,Math.min(1.25,input.current.pitch+lookVelocity.current.pitch*dt))
      }
      frame=requestAnimationFrame(tick)
    }
    frame=requestAnimationFrame(tick)
    return()=>cancelAnimationFrame(frame)
  },[cameraMass,handleSoftness])

  useEffect(()=>{
    const keys=new Set<string>(),update=()=>{input.current.x=Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft'));input.current.z=Number(keys.has('s')||keys.has('arrowdown'))-Number(keys.has('w')||keys.has('arrowup'))}
    const key=(e:KeyboardEvent)=>{const k=e.key.toLowerCase();if(input.current.paused){keys.clear();return}if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(k)){e.preventDefault();if(e.type==='keydown')keys.add(k);else keys.delete(k);update()}}
    const pause=()=>{keys.clear();stop();input.current.paused=true;audio.current?.pause();setStarted(false)}
    const visibility=()=>{if(document.hidden)pause()}
    window.addEventListener('keydown',key);window.addEventListener('keyup',key);window.addEventListener('blur',pause);document.addEventListener('visibilitychange',visibility)
    return()=>{window.removeEventListener('keydown',key);window.removeEventListener('keyup',key);window.removeEventListener('blur',pause);document.removeEventListener('visibilitychange',visibility)}
  },[])

  function ensureAudio(){
    if(!audio.current){audio.current=forestAudio();audio.current.levels(nature,music);audio.current.setProgressions(enabledProgressions)}
    return audio.current
  }
  function clearAudition(){
    if(auditionTimer.current){window.clearTimeout(auditionTimer.current);auditionTimer.current=null}
    audio.current?.stopAudition();setActiveAudition(null)
  }
  function begin(){input.current.paused=false;setStarted(true);try{void ensureAudio().start().catch(()=>setSoundError(true))}catch{setSoundError(true)}}
  function settings(){stop();input.current.paused=true;clearAudition();audio.current?.pauseAmbient();dialog.current?.showModal()}
  function closeSettings(){clearAudition();input.current.paused=!started;if(started){try{void ensureAudio().start().catch(()=>setSoundError(true))}catch{setSoundError(true)}}}
  function rateMusic(id:string,rating:MusicRating){setMusicRatings(current=>({...current,[id]:rating}))}
  function toggleAudition(id:string){
    if(activeAudition===id){clearAudition();return}
    clearAudition()
    try{
      const player=ensureAudio();player.pauseAmbient();setActiveAudition(id)
      void player.audition(id).catch(()=>{setSoundError(true);setActiveAudition(null)})
      auditionTimer.current=window.setTimeout(()=>{player.stopAudition();setActiveAudition(null);auditionTimer.current=null},6900)
    }catch{setSoundError(true);setActiveAudition(null)}
  }
  return <main className="woodland">
    <canvas ref={canvas} aria-label="Immersive woodland with looping walking trails" onContextMenu={e=>e.preventDefault()}/>
    <div className="woodland-look" aria-label="Drag to look around" onPointerDown={e=>{if(input.current.paused||look.current)return;e.currentTarget.setPointerCapture(e.pointerId);look.current={id:e.pointerId,x:e.clientX,y:e.clientY}}} onPointerMove={e=>{const p=look.current;if(!p||p.id!==e.pointerId||input.current.paused)return;const dx=e.clientX-p.x,dy=e.clientY-p.y;targetLook.current.yaw-=dx*.003*lookGain;targetLook.current.pitch=Math.max(-1.25,Math.min(1.25,targetLook.current.pitch-dy*.003*lookGain));p.x=e.clientX;p.y=e.clientY}} onPointerUp={()=>{look.current=null}} onPointerCancel={()=>{look.current=null}}/>
    <header className="woodland-bar"><button onClick={onBack}>← The Lab</button><span>WOODLAND <small>A place to wander</small></span><button onClick={settings}>Sound & settings</button></header>
    {started&&<><div className="woodland-stick" role="application" aria-label="Movement joystick: drag your left thumb" onPointerDown={e=>{if(input.current.paused||stick.current)return;e.currentTarget.setPointerCapture(e.pointerId);const r=e.currentTarget.getBoundingClientRect();stick.current={id:e.pointerId,x:r.left+r.width/2,y:r.top+r.height/2}}} onPointerMove={e=>{const p=stick.current;if(!p||p.id!==e.pointerId||input.current.paused)return;const dx=e.clientX-p.x,dy=e.clientY-p.y,d=Math.max(42,Math.hypot(dx,dy));input.current.x=dx/d;input.current.z=dy/d;if(nub.current)nub.current.style.transform=`translate(${dx/d*36}px,${dy/d*36}px)`}} onPointerUp={stopMove} onPointerCancel={stopMove} onLostPointerCapture={stopMove}><span ref={nub}/><small>MOVE</small></div><div className="woodland-look-hint">DRAG TO LOOK</div></>}
    {!started&&<section className="woodland-intro"><div className="woodland-panel"><span className="woodland-eyebrow">THE LAB · FIELD EXPERIMENT</span><h1>Take the long way.</h1><p>A spacious woodland, a winding circuit, and quieter paths that always find their way back.</p><p className="woodland-controls">Left thumb to walk · Right thumb to look<br/>On a computer: WASD or arrows · Drag to look</p>{error?<><p role="alert">{error}</p><button onClick={()=>setAttempt(x=>x+1)}>Try again</button></>:<button disabled={loaded<1} onClick={begin}>{loaded<1?`Growing your woodland… ${Math.round(loaded*100)}%`:'Enter the woodland'}</button>}<small>Best enjoyed sideways. Headphones optional.</small></div></section>}
    <dialog ref={dialog} className="woodland-dialog" onClose={closeSettings}>
      <h2>Make yourself at home.</h2>
      <p className="woodland-settings-note">The walking soundscape pauses here so you can tune one thing at a time.</p>
      <label>Forest recording <input type="range" min="0" max="1" step=".01" value={nature} onChange={e=>setNature(Number(e.target.value))}/></label>
      <label>Gentle music <input type="range" min="0" max="1" step=".01" value={music} onChange={e=>setMusic(Number(e.target.value))}/></label>
      <WoodlandMusicPalette ratings={musicRatings} activeId={activeAudition} onRate={rateMusic} onToggle={toggleAudition}/>
      <section className="woodland-camera">
        <h3>Look feel</h3>
        <p>These three controls separate how far your finger turns you from how the camera physically follows.</p>
        <label>Turn multiplier <strong>{lookGain.toFixed(2)}×</strong><input type="range" min=".25" max="22" step=".25" value={lookGain} onChange={e=>setLookGain(Number(e.target.value))}/><small>Low = precise. High = owl mode.</small></label>
        <label>Camera weight <strong>{Math.round(cameraMass*100)}</strong><input type="range" min="0" max="1" step=".01" value={cameraMass} onChange={e=>setCameraMass(Number(e.target.value))}/><small>Higher = more inertia and carry.</small></label>
        <label>Handle softness <strong>{Math.round(handleSoftness*100)}</strong><input type="range" min="0" max="1" step=".01" value={handleSoftness} onChange={e=>setHandleSoftness(Number(e.target.value))}/><small>Higher = softer, springier response.</small></label>
      </section>
      {soundError&&<p>Audio could not start. Walking is still available.</p>}
      <p>Recorded forest birds by Pierre SIBANARCO / BigSoundBank (CC0). Original synthesized ambient music. Nature models by Quaternius (CC0).</p>
      <button onClick={()=>{world.current?.reset();resetLook();dialog.current?.close()}}>Return to the trail entrance</button><button onClick={()=>dialog.current?.close()}>Done</button>
    </dialog>
  </main>
}
