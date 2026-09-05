import {useEffect,useMemo,useRef,useState} from 'react'
import {createWoodland,type Input} from './woodland/scene'
import {spawn} from './woodland/world'
import {forestAudio,woodlandProgressions,type MusicRating,type WoodlandSoundMode} from './woodland/audio'
import {WoodlandMusicPalette,rankedMusic,type MusicRatings} from './woodland/WoodlandMusicPalette'
import {WoodlandMiniMap} from './woodland/WoodlandMiniMap'
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
function smoothstep(a:number,b:number,x:number){const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)}
function pitchDelta(current:number,delta:number){
  const limit=1.08
  const normalized=Math.min(1,Math.abs(current)/limit)
  const edge=smoothstep(.52,1,normalized)
  const scaled=delta*(1-.86*edge)
  return Math.max(-limit,Math.min(limit,current+scaled))
}
function shapedPointerDelta(delta:number){
  const sign=Math.sign(delta),amount=Math.abs(delta),dead=1.2
  if(amount<=dead)return 0
  const live=amount-dead
  const softened=live<6?live*(.35+.108*live):live
  return sign*softened
}
function wanderFromDrag(dx:number,dy:number){
  const rx=dx/74,rz=dy/74,d=Math.min(1,Math.hypot(rx,rz))
  if(d<.12)return {turn:0,speed:0,x:0,z:0}
  const scale=(d-.12)/(.88*d),x=Math.max(-1,Math.min(1,rx*scale)),z=Math.max(-1,Math.min(1,rz*scale))
  return {turn:x,speed:Math.min(1,Math.hypot(x,z)),x,z}
}

export function WoodlandWalk({onBack}:{onBack:()=>void}){
  const canvas=useRef<HTMLCanvasElement>(null),dialog=useRef<HTMLDialogElement>(null)
  const input=useRef<Input>({x:0,z:0,yaw:spawn.yaw,pitch:0,paused:true,moveAcceleration:2,viewMode:0})
  const targetLook=useRef({yaw:spawn.yaw,pitch:0}),lookVelocity=useRef({yaw:0,pitch:0}),flickVelocity=useRef({yaw:0,pitch:0})
  const world=useRef<Awaited<ReturnType<typeof createWoodland>>|null>(null),audio=useRef<ReturnType<typeof forestAudio>|null>(null)
  const auditionTimer=useRef<number|null>(null)
  const [loaded,setLoaded]=useState(0),[error,setError]=useState(''),[started,setStarted]=useState(false),[attempt,setAttempt]=useState(0),[soundError,setSoundError]=useState(false)
  const [nature,setNature]=useState(.42),[music,setMusic]=useState(.35)
  const [soundMode,setSoundMode]=useState<WoodlandSoundMode>('piano')
  const [lookGain,setLookGain]=useState(1),[cameraMass,setCameraMass]=useState(.28),[flickGlide,setFlickGlide]=useState(3),[moveAcceleration,setMoveAcceleration]=useState(2),[viewMode,setViewMode]=useState(0),[hybridControls,setHybridControls]=useState(false),[showMap,setShowMap]=useState(false),[showViewRail,setShowViewRail]=useState(true)
  const [activeAudition,setActiveAudition]=useState<string|null>(null)
  const [mapPosition,setMapPosition]=useState({x:spawn.x,z:spawn.z}),[mapYaw,setMapYaw]=useState(spawn.yaw)
  const [musicRatings,setMusicRatings]=useState<MusicRatings>(readMusicRatings)
  const enabledProgressions=useMemo(()=>rankedMusic(musicRatings).filter(entry=>entry.rating>0).map(entry=>entry.item.id),[musicRatings])
  const stick=useRef<{id:number;x:number;y:number}|null>(null),look=useRef<{id:number;x:number;y:number;ax:number;ay:number;t:number;vyaw:number;vpitch:number}|null>(null),nub=useRef<HTMLSpanElement>(null)
  const wander=useRef({turn:0,speed:0,x:0,z:0})
  const clearWander=()=>{wander.current={turn:0,speed:0,x:0,z:0}}
  const clearMove=()=>{input.current.x=0;input.current.z=0;stick.current=null;if(nub.current)nub.current.style.transform='translate(0,0)'}
  const releaseMove=()=>{clearMove();if(hybridControls&&look.current){const p=look.current;wander.current=wanderFromDrag(p.x-p.ax,p.y-p.ay);p.vyaw=0;p.vpitch=0}}
  const stop=()=>{clearMove();clearWander();look.current=null}
  const resetLook=()=>{targetLook.current={yaw:spawn.yaw,pitch:0};lookVelocity.current={yaw:0,pitch:0};flickVelocity.current={yaw:0,pitch:0};input.current.yaw=spawn.yaw;input.current.pitch=0}

  useEffect(()=>{const controller=new AbortController();setError('');setLoaded(0)
    void createWoodland(canvas.current!,input.current,controller.signal,setLoaded).then(value=>{if(controller.signal.aborted)value.dispose();else world.current=value}).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'This device could not open the woodland.')})
    return()=>{controller.abort();world.current=null}
  },[attempt])
  useEffect(()=>()=>{if(auditionTimer.current)window.clearTimeout(auditionTimer.current);audio.current?.dispose()},[])
  useEffect(()=>{audio.current?.levels(nature,music)},[nature,music])
  useEffect(()=>{audio.current?.setMode(soundMode);clearAudition()},[soundMode])
  useEffect(()=>{localStorage.setItem(MUSIC_RATINGS_KEY,JSON.stringify(musicRatings));audio.current?.setProgressions(enabledProgressions)},[musicRatings,enabledProgressions])
  useEffect(()=>{input.current.moveAcceleration=moveAcceleration},[moveAcceleration])
  useEffect(()=>{input.current.viewMode=viewMode;if(hybridControls){targetLook.current.pitch=0;flickVelocity.current.pitch=0}else if(viewMode>=7){flickVelocity.current={yaw:0,pitch:0};look.current=null}},[viewMode,hybridControls])
  useEffect(()=>{const timer=window.setInterval(()=>{const p=world.current?.getPosition();if(p)setMapPosition(p);setMapYaw(input.current.viewMode>=5?(world.current?.getHeading()??input.current.yaw):input.current.yaw)},100);return()=>window.clearInterval(timer)},[])

  useEffect(()=>{
    let frame=0,last=performance.now()
    const tick=(now:number)=>{
      const dt=Math.min(.033,Math.max(.001,(now-last)/1000));last=now
      if(!input.current.paused){
        if(hybridControls){
          targetLook.current.pitch=0
          flickVelocity.current.pitch=0
          if(look.current&&!stick.current){
            const w=wander.current,direct=smoothstep(3,7,viewMode)
            // Pointer right is +turn, but camera yaw-right is negative in this coordinate system.\n            targetLook.current.yaw-=w.turn*1.65*(1-direct)*dt
            input.current.x=w.x*direct
            input.current.z=-w.speed*(1-direct)+w.z*direct
          }
        }
        if(!look.current){
          if(flickGlide===0)flickVelocity.current={yaw:0,pitch:0}
          else{
            targetLook.current.yaw+=flickVelocity.current.yaw*dt
            targetLook.current.pitch=pitchDelta(targetLook.current.pitch,flickVelocity.current.pitch*dt)
            const normalized=flickGlide/10
            const drag=7.5-6.9*normalized
            const decay=Math.exp(-drag*dt)
            flickVelocity.current.yaw*=decay;flickVelocity.current.pitch*=decay
            if(Math.abs(flickVelocity.current.yaw)<.01)flickVelocity.current.yaw=0
            if(Math.abs(flickVelocity.current.pitch)<.01)flickVelocity.current.pitch=0
          }
        }
        const mass=.4+cameraMass*4.2
        const stiffness=210
        const damping=2*Math.sqrt(stiffness*mass)*1.04
        const yawError=targetLook.current.yaw-input.current.yaw,pitchError=targetLook.current.pitch-input.current.pitch
        lookVelocity.current.yaw+=(stiffness*yawError-damping*lookVelocity.current.yaw)/mass*dt
        lookVelocity.current.pitch+=(stiffness*pitchError-damping*lookVelocity.current.pitch)/mass*dt
        input.current.yaw+=lookVelocity.current.yaw*dt
        input.current.pitch=Math.max(-1.08,Math.min(1.08,input.current.pitch+lookVelocity.current.pitch*dt))
      }
      frame=requestAnimationFrame(tick)
    }
    frame=requestAnimationFrame(tick)
    return()=>cancelAnimationFrame(frame)
  },[cameraMass,flickGlide,hybridControls,viewMode])

  useEffect(()=>{
    const keys=new Set<string>(),update=()=>{input.current.x=Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft'));input.current.z=Number(keys.has('s')||keys.has('arrowdown'))-Number(keys.has('w')||keys.has('arrowup'))}
    const key=(e:KeyboardEvent)=>{const k=e.key.toLowerCase();if(input.current.paused){keys.clear();return}if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(k)){e.preventDefault();if(e.type==='keydown')keys.add(k);else keys.delete(k);update()}}
    const pause=()=>{keys.clear();stop();input.current.paused=true;audio.current?.pause();setStarted(false)}
    const visibility=()=>{if(document.hidden)pause()}
    window.addEventListener('keydown',key);window.addEventListener('keyup',key);window.addEventListener('blur',pause);document.addEventListener('visibilitychange',visibility)
    return()=>{window.removeEventListener('keydown',key);window.removeEventListener('keyup',key);window.removeEventListener('blur',pause);document.removeEventListener('visibilitychange',visibility)}
  },[])

  function ensureAudio(){
    if(!audio.current){audio.current=forestAudio();audio.current.levels(nature,music);audio.current.setProgressions(enabledProgressions);audio.current.setMode(soundMode)}
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
  function endLook(){
    const p=look.current
    if(hybridControls&&p&&!stick.current){
      clearWander();input.current.x=0;input.current.z=0;flickVelocity.current={yaw:0,pitch:0};look.current=null;return
    }
    if(p&&flickGlide>0){
      const threshold=.22,maxSpeed=2.6
      const yaw=Math.abs(p.vyaw)>=threshold?Math.max(-maxSpeed,Math.min(maxSpeed,p.vyaw)):0
      const pitch=Math.abs(p.vpitch)>=threshold?Math.max(-maxSpeed,Math.min(maxSpeed,p.vpitch)):0
      flickVelocity.current={yaw:yaw*(flickGlide/10),pitch:pitch*(flickGlide/10)}
    }else flickVelocity.current={yaw:0,pitch:0}
    look.current=null
  }
  return <main className="woodland">
    <canvas ref={canvas} aria-label="Immersive woodland with looping walking trails" onContextMenu={e=>e.preventDefault()}/>
    <div className="woodland-look" aria-label="Drag to look or wander" onPointerDown={e=>{if(input.current.paused||look.current||(!hybridControls&&viewMode>=7))return;e.currentTarget.setPointerCapture(e.pointerId);flickVelocity.current={yaw:0,pitch:0};look.current={id:e.pointerId,x:e.clientX,y:e.clientY,ax:e.clientX,ay:e.clientY,t:performance.now(),vyaw:0,vpitch:0};clearWander()}} onPointerMove={e=>{const p=look.current;if(!p||p.id!==e.pointerId||input.current.paused)return;const now=performance.now();if(hybridControls&&!stick.current){wander.current=wanderFromDrag(e.clientX-p.ax,e.clientY-p.ay);p.x=e.clientX;p.y=e.clientY;p.t=now;return}const dt=Math.max(.016,(now-p.t)/1000),rawDx=e.clientX-p.x,rawDy=e.clientY-p.y,dx=shapedPointerDelta(rawDx),dy=shapedPointerDelta(rawDy),lookMix=Math.max(0,1-viewMode/8),yawDelta=-dx*.003*lookGain*lookMix,pitchMove=hybridControls?0:-dy*.003*lookGain*lookMix;targetLook.current.yaw+=yawDelta;const before=targetLook.current.pitch;targetLook.current.pitch=pitchDelta(before,pitchMove);const appliedPitch=targetLook.current.pitch-before;const sampleYaw=yawDelta/dt,samplePitch=appliedPitch/dt;p.vyaw=p.vyaw*.72+sampleYaw*.28;p.vpitch=p.vpitch*.72+samplePitch*.28;p.x=e.clientX;p.y=e.clientY;p.t=now}} onPointerUp={endLook} onPointerCancel={()=>{clearWander();input.current.x=0;input.current.z=0;flickVelocity.current={yaw:0,pitch:0};look.current=null}}/>
    {showMap&&<WoodlandMiniMap position={mapPosition} yaw={mapYaw} onTeleport={point=>{world.current?.setPosition(point);setMapPosition(point)}}/>}<header className="woodland-bar"><span>WOODLAND <small>A place to wander</small></span><button onClick={settings}>Sound & settings</button></header>
    {started&&<>{showViewRail&&<div className="woodland-view-rail" aria-label="View height"><span>SKY</span><input aria-label="First person to overhead view" type="range" min="0" max="10" step=".1" value={viewMode} onChange={e=>setViewMode(Number(e.target.value))}/><span>1P</span></div>}<div className="woodland-stick" role="application" aria-label="Movement joystick: drag your left thumb" onPointerDown={e=>{if(input.current.paused||stick.current)return;e.currentTarget.setPointerCapture(e.pointerId);const r=e.currentTarget.getBoundingClientRect();stick.current={id:e.pointerId,x:r.left+r.width/2,y:r.top+r.height/2};if(hybridControls){clearWander();input.current.x=0;input.current.z=0}}} onPointerMove={e=>{const p=stick.current;if(!p||p.id!==e.pointerId||input.current.paused)return;const dx=e.clientX-p.x,dy=e.clientY-p.y,d=Math.max(42,Math.hypot(dx,dy));input.current.x=dx/d;input.current.z=dy/d;if(nub.current)nub.current.style.transform=`translate(${dx/d*36}px,${dy/d*36}px)`}} onPointerUp={releaseMove} onPointerCancel={releaseMove} onLostPointerCapture={releaseMove}><span ref={nub}/><small>{hybridControls?'FEET':'MOVE'}</small></div><div className="woodland-look-hint">{hybridControls?'RIGHT: WANDER · BOTH: LOOK':'DRAG TO LOOK'}</div></>}
    {!started&&<section className="woodland-intro"><div className="woodland-panel"><span className="woodland-eyebrow">THE LAB · FIELD EXPERIMENT</span><h1>Take the long way.</h1><p>A spacious woodland, a winding circuit, and quieter paths that always find their way back.</p><p className="woodland-controls">Left thumb to walk · Right thumb to look<br/>On a computer: WASD or arrows · Drag to look</p>{error?<><p role="alert">{error}</p><button onClick={()=>setAttempt(x=>x+1)}>Try again</button></>:<button disabled={loaded<1} onClick={begin}>{loaded<1?`Growing your woodland… ${Math.round(loaded*100)}%`:'Enter the woodland'}</button>}<small>Best enjoyed sideways. Headphones optional.</small></div></section>}
    <dialog ref={dialog} className="woodland-dialog" onClose={closeSettings}>
      <h2>Make yourself at home.</h2>
      <p className="woodland-settings-note">The walking soundscape pauses here so you can tune one thing at a time.</p>
      <label>Forest recording <input type="range" min="0" max="1" step=".01" value={nature} onChange={e=>setNature(Number(e.target.value))}/></label>
      <label>Gentle music <input type="range" min="0" max="1" step=".01" value={music} onChange={e=>setMusic(Number(e.target.value))}/></label>
      <WoodlandMusicPalette ratings={musicRatings} activeId={activeAudition} mode={soundMode} onRate={rateMusic} onToggle={toggleAudition} onMode={setSoundMode}/>
      <section className="woodland-camera">
        <h3>Controls</h3>
        <p>Try the experimental contextual controls. Right thumb alone wanders; left alone moves the feet; both thumbs give independent movement and looking.</p>
        <div className="woodland-mode-toggle" role="group" aria-label="Control style">
          <button className={!hybridControls?'selected':''} onClick={()=>{stop();setHybridControls(false)}}>Classic dual-stick</button>
          <button className={hybridControls?'selected':''} onClick={()=>{stop();targetLook.current.pitch=0;flickVelocity.current.pitch=0;setHybridControls(true)}}>Hybrid wander</button>
        </div>
        <h3>View</h3>
        <p>The first-person ↔ overhead view slider lives on the left edge of the walking screen.</p>
        <label className="woodland-map-setting"><input type="checkbox" checked={showMap} onChange={e=>setShowMap(e.target.checked)}/> Show map while walking</label>
        <label className="woodland-map-setting"><input type="checkbox" checked={showViewRail} onChange={e=>setShowViewRail(e.target.checked)}/> Show first-person ↔ sky slider</label>
        <h3>Movement feel</h3>
        <p>Acceleration changes both how quickly you pick up speed and how fast your top walking speed can become.</p>
        <label>Acceleration <strong>{moveAcceleration.toFixed(1)}</strong><input type="range" min="0" max="10" step=".1" value={moveAcceleration} onChange={e=>setMoveAcceleration(Number(e.target.value))}/><small>0 = gentle walking. 10 = very fast travel.</small></label>
        <h3>Look feel</h3>
        <p>Horizontal turning is free. Vertical looking gradually resists near the sky and ground so the useful horizon band gets most of your finger travel.</p>
        <label>Turn multiplier <strong>{lookGain.toFixed(2)}×</strong><input type="range" min=".25" max="22" step=".25" value={lookGain} onChange={e=>setLookGain(Number(e.target.value))}/><small>Low = precise. High = owl mode.</small></label>
        <label>Camera weight <strong>{Math.round(cameraMass*100)}</strong><input type="range" min="0" max="1" step=".01" value={cameraMass} onChange={e=>setCameraMass(Number(e.target.value))}/><small>Higher = heavier following, without spring-back.</small></label>
        <label>Flick glide <strong>{flickGlide.toFixed(1)}</strong><input type="range" min="0" max="10" step=".1" value={flickGlide} onChange={e=>setFlickGlide(Number(e.target.value))}/><small>0 = stops immediately. 10 = longest glide. Tiny release movements are ignored.</small></label>
      </section>
      {soundError&&<p>Audio could not start. Walking is still available.</p>}
      <p>Recorded forest birds by Pierre SIBANARCO / BigSoundBank (CC0). Original synthesized ambient music. Nature models by Quaternius (CC0).</p>
      <button onClick={onBack}>← Return to The Lab</button><button onClick={()=>{world.current?.reset();resetLook();dialog.current?.close()}}>Return to the trail entrance</button><button onClick={()=>dialog.current?.close()}>Done</button>
    </dialog>
  </main>
}