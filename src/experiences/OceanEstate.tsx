import { useEffect, useRef, useState } from 'react'
import { createEstate, type EstateInput, type EstateState } from './estate/scene'
import { estateAudio } from './estate/audio'
import { destinations, spawn } from './estate/plan'
import type { LightPreset } from './estate/environment'
import './estate/estate.css'
type Prefs={speed:number;sensitivity:number;quality:number;lighting:LightPreset;mode:'explore'|'walk';volume:number}
const defaults:Prefs={speed:2.4,sensitivity:1,quality:1,lighting:'golden',mode:'explore',volume:.35}
function readPrefs():Prefs{try{const p=JSON.parse(localStorage.getItem('ocean-estate-v1')||'{}'),num=(key:keyof Prefs,lo:number,hi:number)=>typeof p[key]==='number'&&Number.isFinite(p[key])?Math.max(lo,Math.min(hi,p[key])):defaults[key];return {speed:num('speed',1,4) as number,sensitivity:num('sensitivity',.3,2) as number,quality:[0,1,2].includes(p.quality)?p.quality:1,lighting:['daylight','golden','evening'].includes(p.lighting)?p.lighting:'golden',mode:p.mode==='walk'?'walk':'explore',volume:num('volume',0,1) as number}}catch{return defaults}}
export function OceanEstate({onBack}:{onBack:()=>void}){
  const canvas=useRef<HTMLCanvasElement>(null),engine=useRef<Awaited<ReturnType<typeof createEstate>>|null>(null),audio=useRef<ReturnType<typeof estateAudio>|null>(null),dialog=useRef<HTMLDialogElement>(null)
  const input=useRef<EstateInput>({yaw:spawn.yaw,pitch:-.025,x:0,z:0,paused:true,speed:2.4,quality:1,lighting:'golden',lookedAt:0,fast:false})
  const pointer=useRef<{id:number;x:number;y:number;startX:number;startY:number;dragged:boolean}|null>(null),keys=useRef(new Set<string>())
  const [prefs,setPrefs]=useState(readPrefs),[ready,setReady]=useState(false),[progress,setProgress]=useState('Opening Ocean Estate…'),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),[started,setStarted]=useState(false),[paused,setPaused]=useState(false),[sound,setSound]=useState(false),[places,setPlaces]=useState(false),[notice,setNotice]=useState(''),[help,setHelp]=useState(true)
  const [state,setState]=useState<EstateState>({location:'Arrival steps',position:spawn,moving:false,destination:'',fps:0,touring:false})
  const stop=()=>{input.current.x=0;input.current.z=0;input.current.fast=false;keys.current.clear();pointer.current=null;engine.current?.stop()}
  useEffect(()=>{const controller=new AbortController();setReady(false);setError('');void createEstate(canvas.current!,input.current,controller.signal,setState,setProgress).then(e=>{if(controller.signal.aborted)e.dispose();else{engine.current=e;setReady(true)}}).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'This device could not open the estate.')});return()=>{controller.abort();engine.current?.dispose();engine.current=null}},[attempt])
  useEffect(()=>()=>audio.current?.dispose(),[])
  useEffect(()=>{Object.assign(input.current,{speed:prefs.speed,quality:prefs.quality,lighting:prefs.lighting});audio.current?.volume(prefs.volume);try{localStorage.setItem('ocean-estate-v1',JSON.stringify(prefs))}catch{/* In-memory preferences still work. */}},[prefs])
  useEffect(()=>{const pause=()=>{stop();input.current.paused=true;audio.current?.pause();setPaused(true)};const visibility=()=>{if(document.hidden)pause()}
    const key=(e:KeyboardEvent)=>{const k=e.key.toLowerCase();if(e.type==='keyup')keys.current.delete(k);if(input.current.paused)return;if(e.target instanceof HTMLElement&&['INPUT','SELECT','TEXTAREA','BUTTON'].includes(e.target.tagName))return
      if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','escape','shift'].includes(k))e.preventDefault();else return
      if(k==='escape'){pause();return}if(e.type==='keydown')keys.current.add(k)
      input.current.x=Number(keys.current.has('d')||keys.current.has('arrowright'))-Number(keys.current.has('a')||keys.current.has('arrowleft'));input.current.z=Number(keys.current.has('s')||keys.current.has('arrowdown'))-Number(keys.current.has('w')||keys.current.has('arrowup'));input.current.fast=keys.current.has('shift')
    };window.addEventListener('keydown',key);window.addEventListener('keyup',key);window.addEventListener('blur',pause);document.addEventListener('visibilitychange',visibility)
    const lost=(e:Event)=>{e.preventDefault();pause();setReady(false);setError('The graphics connection paused. Reopen the estate to continue.')} ;canvas.current?.addEventListener('webglcontextlost',lost)
    return()=>{window.removeEventListener('keydown',key);window.removeEventListener('keyup',key);window.removeEventListener('blur',pause);document.removeEventListener('visibilitychange',visibility);canvas.current?.removeEventListener('webglcontextlost',lost)}
  },[])
  useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(''),2400);return()=>clearTimeout(t)},[notice])
  async function beginSound(){try{if(!audio.current)audio.current=estateAudio();audio.current.volume(prefs.volume);await audio.current.play()}catch{setSound(false);setNotice('Sound could not start. You can keep exploring.')}}
  function begin(){stop();input.current.paused=false;setStarted(true);setPaused(false);if(sound)void beginSound()}
  function openSettings(){stop();input.current.paused=true;audio.current?.pause();setPlaces(false);dialog.current?.showModal()}
  function closeSettings(){stop();if(started&&!paused){input.current.paused=false;if(sound)void beginSound()}}
  function back(){stop();input.current.paused=true;audio.current?.pause();onBack()}
  return <main className="oe-root" aria-label="Ocean Estate">
    <canvas ref={canvas} className="oe-canvas" aria-label="Explorable oceanfront estate" onContextMenu={e=>e.preventDefault()}
      onPointerDown={e=>{if(input.current.paused||pointer.current)return;e.currentTarget.setPointerCapture(e.pointerId);pointer.current={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,dragged:false};if(prefs.mode==='walk'&&e.clientY>innerHeight*.58)input.current.z=-1}}
      onPointerMove={e=>{const p=pointer.current;if(!p||p.id!==e.pointerId||input.current.paused)return;const dx=e.clientX-p.x,dy=e.clientY-p.y;if(Math.hypot(e.clientX-p.startX,e.clientY-p.startY)>8)p.dragged=true;if(p.dragged){input.current.yaw-=dx*.003*prefs.sensitivity;input.current.pitch=Math.max(-1.05,Math.min(.95,input.current.pitch-dy*.003*prefs.sensitivity));input.current.lookedAt=performance.now();setHelp(false)}p.x=e.clientX;p.y=e.clientY}}
      onPointerUp={e=>{const p=pointer.current;if(!p||p.id!==e.pointerId)return;if(!p.dragged&&prefs.mode==='explore'&&!input.current.paused){if(!engine.current?.pick(e.clientX,e.clientY))setNotice('Tap a clear spot on the floor.');else setHelp(false)}pointer.current=null;input.current.z=0}}
      onPointerCancel={()=>{pointer.current=null;input.current.z=0}}
      onLostPointerCapture={()=>{pointer.current=null;input.current.z=0}}/>
    <header className="oe-header"><button className="oe-back" onClick={back} aria-label="Back to The Lab">← <span>The Lab</span></button><div className="oe-wordmark">OCEAN ESTATE</div><button className="oe-icon" aria-label="Estate settings" onClick={openSettings}>☷</button></header>
    {started&&!error&&<>
      <div className="oe-location"><span>{prefs.lighting==='evening'?'AFTER THE SUN':'AT THE EDGE OF THE OCEAN'}</span><h1>{state.location}</h1></div>
      <div className="oe-controls"><button className={places?'active':''} onClick={()=>{setPlaces(v=>!v);if(!places)engine.current?.stop()}} aria-expanded={places}>Places <span>⌃</span></button><span className="oe-control-divider"/><button onClick={()=>{stop();setPrefs(p=>({...p,mode:p.mode==='explore'?'walk':'explore'}));setHelp(true)}}>{prefs.mode==='explore'?'Explore':'Walk'}</button><span className="oe-control-divider"/><button aria-label={sound?'Mute ocean sound':'Enable ocean sound'} onClick={()=>{setSound(v=>!v);if(!sound)void beginSound();else audio.current?.pause()}}>{sound?'Sound on':'Sound off'}</button></div>
      {places&&<nav className="oe-places" aria-label="Estate destinations"><header><strong>Make yourself at home</strong><button aria-label="Close places" onClick={()=>setPlaces(false)}>×</button></header>{destinations.map((d,i)=><button key={d.name} onClick={()=>{if(engine.current?.go(d,d.name)){setPlaces(false);setHelp(false)}else setNotice('That route is unavailable from here.')}}><span>{String(i+1).padStart(2,'0')}</span>{d.name}</button>)}<button className="oe-tour" onClick={()=>{engine.current?.tour();setPlaces(false);setHelp(false)}}>Take a quiet tour <span>→</span></button></nav>}
      {(state.moving||state.touring)&&<button className="oe-stop" onClick={stop}>Stop {state.destination?`· ${state.destination}`:''}</button>}
      {help&&!places&&!state.moving&&<div className="oe-hint">{prefs.mode==='explore'?'Tap the floor to walk · Drag to look':'Hold low on the screen to walk · Drag to steer'}<small>Keyboard: WASD · Shift to walk faster</small><button onClick={()=>setHelp(false)} aria-label="Dismiss controls hint">×</button></div>}
    </>}
    {notice&&<div className="oe-notice" role="status">{notice}</div>}
    {(!started||paused||error)&&<div className="oe-entry"><section><span className="oe-eyebrow">THE HORIZON RESIDENCE</span><h1>{started&&paused?'Stay a while.':<>A home.<br/>An ocean.<br/>All yours to explore.</>}</h1><p>{error||(started&&paused?'Your walk is paused.':'Warm stone, quiet gardens, and a view that never ends.')}</p>{error?<button className="oe-primary" onClick={()=>{setStarted(false);setPaused(false);setAttempt(n=>n+1)}}>Reopen estate ↗</button>:ready?<button className="oe-primary" onClick={begin}>{started?'Continue exploring':'Step inside'} <span>↗</span></button>:<div className="oe-loading" role="status"><i/>{progress}</div>}<div className="oe-entry-note">Tap to walk. Drag to look. Take your time.</div></section></div>}
    <dialog ref={dialog} className="oe-settings" onClose={closeSettings}><form method="dialog"><header><span>YOUR STAY</span><button aria-label="Close settings">×</button></header></form><h2>A little more comfortable.</h2>
      <label>Light<select value={prefs.lighting} onChange={e=>setPrefs(p=>({...p,lighting:e.target.value as LightPreset}))}><option value="daylight">Daylight</option><option value="golden">Golden hour</option><option value="evening">Evening</option></select></label>
      <label>Navigation<select value={prefs.mode} onChange={e=>setPrefs(p=>({...p,mode:e.target.value as Prefs['mode']}))}><option value="explore">Explore · tap to walk</option><option value="walk">Walk · hold to move</option></select></label>
      <label>Walking pace<output>{prefs.speed.toFixed(1)}</output><input type="range" min="1" max="4" step=".1" value={prefs.speed} onChange={e=>setPrefs(p=>({...p,speed:+e.target.value}))}/></label>
      <label>Look sensitivity<output>{prefs.sensitivity.toFixed(1)}×</output><input type="range" min=".3" max="2" step=".1" value={prefs.sensitivity} onChange={e=>setPrefs(p=>({...p,sensitivity:+e.target.value}))}/></label>
      <label>Graphics<select value={prefs.quality} onChange={e=>setPrefs(p=>({...p,quality:+e.target.value}))}><option value={0}>Lighter</option><option value={1}>Balanced</option><option value={2}>Detailed</option></select></label>
      <label>Ocean volume<output>{Math.round(prefs.volume*100)}%</output><input type="range" min="0" max="1" step=".05" value={prefs.volume} onChange={e=>setPrefs(p=>({...p,volume:+e.target.value}))}/></label>
      <button className="oe-reset" onClick={()=>{engine.current?.reset();dialog.current?.close()}}>Return to the entrance</button><form method="dialog"><button className="oe-primary">Back to exploring ↗</button></form>
    </dialog>
  </main>
}
