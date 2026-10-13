import { useEffect,useMemo,useRef,useState } from 'react'
import { createIslandScene,type IslandEngine,type IslandState,type Input,type Mode } from './island-estate/scene'
import { destinations,viewpoints,clamp } from './island-estate/layout'
import { createDrawing,type Drawing } from './island-estate/plans'
import type { Lighting } from './island-estate/environment'
import './island-estate/island-estate.css'

const reference='/assets/island-estate/reference.png'
const initial:IslandState={mode:'overview',position:{x:0,y:8,z:21},location:'A private island, a world of its own',floor:'Ground floor · ±0 m',moving:false,destination:'',navReady:false,fps:0,drawCalls:0,triangles:0}
const drawings:{id:Drawing;label:string}[]=[{id:'all',label:'Full sheet'},{id:'ground',label:'Ground'},{id:'first',label:'First'},{id:'roof',label:'Roof'},{id:'section',label:'Section'},{id:'island',label:'Island'}]
function Icon({kind}:{kind:string}) {
  const p:Record<string,string>={back:'M15 5 8 12l7 7',grid:'M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z',walk:'m9 6 4 2 2 4 4 1M13 8l-3 5-4 3m4-3 4 3 1 5M8 3h.01',plans:'M4 3h16v18H4zM4 10h7V3m0 7v11m0-7h9',compare:'M3 4h18v16H3zM12 4v16m-6-4 3-4 3 3m3 1 2-3 3 3',menu:'M5 12h.01M12 12h.01M19 12h.01',close:'m6 6 12 12M6 18 18 6',sun:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M19 5l-1.5 1.5m-11 11L5 19',reset:'M4 11a8 8 0 1 1 1 6M4 4v7h7',download:'M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4',north:'m12 3-6 17 6-4 6 4z'}
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={p[kind]||p.grid}/></svg>
}
export function IslandEstate() {
  const canvas=useRef<HTMLCanvasElement>(null),engine=useRef<IslandEngine|null>(null)
  const input=useRef<Input>({x:0,z:0,yaw:0,pitch:.07,paused:false,fast:false,lookedAt:0})
  const look=useRef<{id:number;x:number;y:number;sx:number;sy:number;dragged:boolean}|null>(null)
  const stick=useRef<{id:number;x:number;y:number}|null>(null),keys=useRef(new Set<string>())
  const planDialog=useRef<HTMLDialogElement>(null),menuDialog=useRef<HTMLDialogElement>(null)
  const [state,setState]=useState(initial),[ready,setReady]=useState(false),[error,setError]=useState(''),[attempt,setAttempt]=useState(0)
  const [lighting,setLighting]=useState<Lighting>('day'),[compare,setCompare]=useState(false),[notice,setNotice]=useState(''),[drawing,setDrawing]=useState<Drawing>('all'),[thumb,setThumb]=useState({x:0,y:0}),[view,setView]=useState('aerial'),[help,setHelp]=useState(true)
  const svg=useMemo(()=>createDrawing(drawing),[drawing])
  useEffect(()=>{
    let gone=false
    setReady(false);setError('')
    // Let the loading state paint before assembling the local architectural model.
    const timer=window.setTimeout(()=>{
      if(gone||!canvas.current)return
      try {
        const next=createIslandScene(canvas.current,input.current,s=>{if(!gone)setState(s)},s=>{if(!gone)setNotice(s)})
        engine.current=next;next.setLighting(lighting);setReady(true)
      }catch(e){if(!gone)setError(e instanceof Error?e.message:'The graphics scene could not open.')}
    },20)
    return ()=>{gone=true;clearTimeout(timer);engine.current?.dispose();engine.current=null}
  },[attempt])
  function clearMovement(){keys.current.clear();stick.current=null;look.current=null;input.current.x=0;input.current.z=0;input.current.fast=false;setThumb({x:0,y:0})}
  function stop(){clearMovement();engine.current?.stop()}
  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{
      const k=e.key.toLowerCase(),up=e.type==='keyup'
      if(!['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','shift','escape'].includes(k))return
      const apply=()=>{input.current.x=Number(keys.current.has('d')||keys.current.has('arrowright'))-Number(keys.current.has('a')||keys.current.has('arrowleft'));input.current.z=Number(keys.current.has('w')||keys.current.has('arrowup'))-Number(keys.current.has('s')||keys.current.has('arrowdown'));input.current.fast=keys.current.has('shift')}
      if(up){keys.current.delete(k);apply();return}
      if(k==='escape'){stop();return}
      if((e.target as HTMLElement)?.closest('input,select,textarea,dialog'))return
      e.preventDefault()
      if(!up&&!input.current.paused)keys.current.add(k)
      apply()
    }
    const blur=()=>{clearMovement();engine.current?.stop()}
    const hidden=()=>{if(document.hidden)blur()}
    window.addEventListener('keydown',key);window.addEventListener('keyup',key);window.addEventListener('blur',blur);document.addEventListener('visibilitychange',hidden)
    const worldCanvas=canvas.current
    const contextLost=(e:Event)=>{e.preventDefault();if(canvas.current!==worldCanvas)return;blur();setReady(false);setError('Graphics paused. Reopen the island to continue.')}
    worldCanvas?.addEventListener('webglcontextlost',contextLost)
    return()=>{window.removeEventListener('keydown',key);window.removeEventListener('keyup',key);window.removeEventListener('blur',blur);document.removeEventListener('visibilitychange',hidden);worldCanvas?.removeEventListener('webglcontextlost',contextLost)}
  },[attempt])
  useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),4200);return()=>clearTimeout(timer)},[notice])
  function mode(next:Mode){stop();engine.current?.setMode(next);canvas.current?.focus({preventScroll:true});setHelp(true);if(next==='overview')setView('aerial')}
  function changeLight(next:Lighting){setLighting(next);engine.current?.setLighting(next)}
  function viewpoint(id:string){stop();engine.current?.setViewpoint(id);setView(id);setHelp(false)}
  function openPlans(){stop();input.current.paused=true;planDialog.current?.showModal()}
  function openMenu(){stop();input.current.paused=true;menuDialog.current?.showModal()}
  function closeDialog(){input.current.paused=false;clearMovement();canvas.current?.focus({preventScroll:true})}
  function visit(id:string){menuDialog.current?.close();input.current.paused=false;void engine.current?.goTo(id);setHelp(false)}
  function downloadPlans(){const blob=new Blob([createDrawing(drawing)],{type:'image/svg+xml'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`The-Island-Estate-${drawing}.svg`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
  function pointerDown(e:React.PointerEvent<HTMLCanvasElement>){
    if(state.mode!=='walk'||input.current.paused||look.current)return
    e.currentTarget.setPointerCapture(e.pointerId);look.current={id:e.pointerId,x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,dragged:false}
  }
  function pointerMove(e:React.PointerEvent<HTMLCanvasElement>){
    const p=look.current;if(!p||p.id!==e.pointerId||input.current.paused)return
    if(Math.hypot(e.clientX-p.sx,e.clientY-p.sy)>7)p.dragged=true
    if(p.dragged){input.current.yaw+=(e.clientX-p.x)*-.0037;input.current.pitch=clamp(input.current.pitch-(e.clientY-p.y)*.0037,-1.15,1.1);input.current.lookedAt=performance.now();setHelp(false)}
    p.x=e.clientX;p.y=e.clientY
  }
  function pointerEnd(e:React.PointerEvent<HTMLCanvasElement>,tap=true){const p=look.current;if(!p||p.id!==e.pointerId)return;look.current=null;if(tap&&!p.dragged)void engine.current?.pick(e.clientX,e.clientY)}
  function stickStart(e:React.PointerEvent<HTMLDivElement>){e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);engine.current?.stop();keys.current.clear();const r=e.currentTarget.getBoundingClientRect();stick.current={id:e.pointerId,x:r.left+r.width/2,y:r.top+r.height/2};stickMove(e);setHelp(false)}
  function stickMove(e:React.PointerEvent<HTMLDivElement>){const p=stick.current;if(!p||p.id!==e.pointerId)return;const dx=e.clientX-p.x,dy=e.clientY-p.y,len=Math.hypot(dx,dy),s=Math.min(1,38/(len||1)),x=dx*s,y=dy*s;setThumb({x,y});input.current.x=x/38;input.current.z=-y/38}
  function stickEnd(e:React.PointerEvent<HTMLDivElement>){if(stick.current?.id!==e.pointerId)return;stick.current=null;input.current.x=0;input.current.z=0;setThumb({x:0,y:0})}
  return <main className={`ie-root${compare?' ie-with-reference':''}`} aria-label="The Island Estate" data-ready={ready?'true':'false'} data-mode={state.mode} data-player-x={state.position.x.toFixed(3)} data-player-y={state.position.y.toFixed(3)} data-player-z={state.position.z.toFixed(3)} data-nav-ready={state.navReady?'true':'false'} data-draw-calls={state.drawCalls} data-triangles={state.triangles}>
    <div className="ie-viewport"><canvas key={attempt} ref={canvas} className="ie-canvas" tabIndex={0} aria-label="Explorable three-level island mansion" onContextMenu={e=>e.preventDefault()} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={e=>pointerEnd(e)} onPointerCancel={e=>pointerEnd(e,false)} onLostPointerCapture={e=>pointerEnd(e,false)}/></div>
    <div className="ie-vignette"/>
    <header className="ie-header">
      <a href="/" className="ie-icon-button" aria-label="Back to The Lab"><Icon kind="back"/></a>
      <div className="ie-brand"><span>THE LAB · SCULPTURAL FUTURISM</span><h1>The Island Estate</h1></div>
      <div className="ie-header-actions"><button className={`ie-icon-button${compare?' active':''}`} onClick={()=>setCompare(!compare)} aria-label={compare?'Close reference comparison':'Compare with reference image'} title="Reference"><Icon kind="compare"/></button><button className="ie-icon-button" onClick={openMenu} aria-label="Estate menu"><Icon kind="menu"/></button></div>
    </header>
    {!ready&&!error&&<div className="ie-loading"><div className="ie-loading-mark">IE</div><p>Opening your island…</p><small>Sculptural architecture, surrounded by the ocean.</small></div>}
    {error&&<section className="ie-error" role="alert"><h2>The island could not open</h2><p>{error}</p><button onClick={()=>setAttempt(attempt+1)}>Reopen the island</button><a href="/">Back to The Lab</a></section>}
    {ready&&<>
      {state.mode==='overview'&&<div className="ie-view-selector" aria-label="Architectural viewpoints">{viewpoints.map(p=><button key={p.id} className={view===p.id?'selected':''} onClick={()=>viewpoint(p.id)}>{p.label}</button>)}</div>}
      {state.mode==='walk'&&<div className="ie-location"><span>{state.floor}</span><strong>{state.location}</strong></div>}
      <div className="ie-light-switch" aria-label="Lighting"><button className={lighting==='day'?'selected':''} onClick={()=>changeLight('day')}>Day</button><button className={lighting==='sunset'?'selected':''} onClick={()=>changeLight('sunset')}>Sunset</button></div>
      {help&&<p className="ie-hint">{state.mode==='overview'?'Drag to orbit · scroll or pinch to zoom':'Drag to look · joystick or WASD to walk · tap a clear floor'}</p>}
      <nav className="ie-nav" aria-label="Experience modes"><button className={state.mode==='overview'?'selected':''} onClick={()=>mode('overview')}><Icon kind="grid"/><span>Overview</span></button><button className={state.mode==='walk'?'selected':''} onClick={()=>mode('walk')}><Icon kind="walk"/><span>Explore</span></button><button onClick={openPlans}><Icon kind="plans"/><span>Plans</span></button></nav>
      {state.mode==='walk'&&<>
        <div className="ie-joystick" role="group" aria-label="Touch movement joystick" onPointerDown={stickStart} onPointerMove={stickMove} onPointerUp={stickEnd} onPointerCancel={stickEnd} onLostPointerCapture={stickEnd}><div className="ie-stick-cross"/><div className="ie-stick-thumb" style={{transform:`translate(${thumb.x}px,${thumb.y}px)`}}/></div>
        <button className="ie-places" onClick={openMenu}>Walk to…</button>
        {(state.moving||state.destination)&&<button className="ie-stop" onClick={stop}>Stop{state.destination?` · ${state.destination}`:''}</button>}
      </>}
      <span className="ie-study-note">Reference-based architectural study</span>
    </>}
    {compare&&<aside className="ie-reference" aria-label="Architectural reference comparison"><header><div><span>PRIMARY DESIGN REFERENCE</span><h2>Sculptural Futurism</h2></div><button className="ie-icon-button" onClick={()=>setCompare(false)} aria-label="Close reference comparison"><Icon kind="close"/></button></header><a href={reference} target="_blank" rel="noreferrer"><img src={reference} alt="Original architectural presentation showing the sculptural white island mansion, all three floor plans, atrium, ocean wing and rooftop infinity pool"/></a><p>Select a matching camera view to compare the model.</p><div className="ie-reference-views">{viewpoints.map(v=><button key={v.id} className={view===v.id?'selected':''} onClick={()=>viewpoint(v.id)}>{v.label}</button>)}</div><a className="ie-reference-full" href={reference} target="_blank" rel="noreferrer">Open the full reference ↗</a></aside>}
    {notice&&<div className="ie-toast" role="status">{notice}</div>}
    <dialog ref={planDialog} className="ie-plan-dialog" onClose={closeDialog}><header><div><span>COORDINATED ARCHITECTURAL STUDY</span><h2>Plans &amp; sections</h2></div><button className="ie-dialog-close" onClick={()=>planDialog.current?.close()} aria-label="Close plans"><Icon kind="close"/></button></header><div className="ie-drawing-tabs">{drawings.map(d=><button key={d.id} className={drawing===d.id?'selected':''} onClick={()=>setDrawing(d.id)}>{d.label}</button>)}<button className="ie-plan-download" onClick={downloadPlans}><Icon kind="download"/>Download SVG</button></div><div className="ie-drawing" dangerouslySetInnerHTML={{__html:svg}}/><footer>One coordinate system, three connected levels. Dimensions are in metres; this is a concept study.</footer></dialog>
    <dialog ref={menuDialog} className="ie-menu-dialog" onClose={closeDialog}><header><div><span>THE ISLAND ESTATE</span><h2>Explore the island</h2></div><button className="ie-dialog-close" onClick={()=>menuDialog.current?.close()} aria-label="Close estate menu"><Icon kind="close"/></button></header><p>Choose a place and walk there through the connected floors, stairs and island paths.</p><div className="ie-destinations">{destinations.map(d=><button key={d.id} onClick={()=>visit(d.id)}><span>{d.label}</span><small>{d.level===2?'Rooftop':d.level===1?'First floor':d.id==='dock'||d.id==='beach'?'Island':'Ground floor'}</small><b>↗</b></button>)}</div><div className="ie-menu-tools"><button onClick={()=>{engine.current?.reset();menuDialog.current?.close()}}><Icon kind="reset"/>Return to entrance</button><button onClick={()=>{menuDialog.current?.close();setCompare(true)}}><Icon kind="compare"/>Reference comparison</button><button onClick={()=>{menuDialog.current?.close();openPlans()}}><Icon kind="plans"/>Dimensioned plans</button></div><div className="ie-help"><strong>Moving around</strong><p>On a phone, hold the left joystick to move and drag anywhere else to look. On desktop, drag to look and use WASD or arrow keys. Tap a clear floor to follow a walking route. Escape stops walking.</p><p>In Overview, drag to orbit and pinch or scroll to zoom.</p></div><footer>Three levels · +0 / +6 / +12 m · Experimental preview</footer></dialog>
  </main>
}
