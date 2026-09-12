import { useEffect, useRef, useState } from 'react'
import { createWaterfallVillageV2, type VillageV2Input, type VillageV2State } from './waterfall-v2/scene'
import { conceptById, concepts, spawnFor, type ConceptId } from './waterfall-v2/world'
import './waterfall-v2/waterfall-v2.css'

export function WaterfallVillageV2({ onBack }: { onBack: () => void }) {
  const canvas=useRef<HTMLCanvasElement>(null),world=useRef<Awaited<ReturnType<typeof createWaterfallVillageV2>>|null>(null)
  const input=useRef<VillageV2Input>({x:0,z:0,yaw:.18,pitch:-.04,paused:true}),keys=useRef(new Set<string>())
  const stick=useRef<{id:number;x:number;y:number}|null>(null),look=useRef<{id:number;x:number;y:number}|null>(null),nub=useRef<HTMLSpanElement>(null)
  const [concept,setConcept]=useState<ConceptId>('cascade'),[started,setStarted]=useState(false),[ready,setReady]=useState(false),[error,setError]=useState('')
  const [state,setState]=useState<VillageV2State>({position:spawnFor('cascade'),zone:'Lower River Walk',fps:0})
  const startedRef=useRef(false);useEffect(()=>{startedRef.current=started},[started])
  const stopInput=()=>{keys.current.clear();input.current.x=0;input.current.z=0;stick.current=null;look.current=null;if(nub.current)nub.current.style.transform=''}

  useEffect(()=>{
    const controller=new AbortController();setReady(false);setError('');stopInput();input.current.paused=true
    void createWaterfallVillageV2(canvas.current!,input.current,concept,controller.signal,setState).then(v=>{if(controller.signal.aborted)v.dispose();else{world.current=v;setReady(true);input.current.paused=!startedRef.current}}).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Could not open this blockout.')})
    return()=>{controller.abort();world.current?.dispose();world.current=null}
  },[concept])

  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{if(input.current.paused)return;const k=e.key.toLowerCase();if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','escape'].includes(k))e.preventDefault();if(k==='escape'&&e.type==='keydown'){stopInput();input.current.paused=true;setStarted(false);return}if(e.type==='keydown')keys.current.add(k);else keys.current.delete(k);input.current.x=Number(keys.current.has('d')||keys.current.has('arrowright'))-Number(keys.current.has('a')||keys.current.has('arrowleft'));input.current.z=Number(keys.current.has('s')||keys.current.has('arrowdown'))-Number(keys.current.has('w')||keys.current.has('arrowup'))}
    const blur=()=>{stopInput();input.current.paused=true};window.addEventListener('keydown',key);window.addEventListener('keyup',key);window.addEventListener('blur',blur);return()=>{window.removeEventListener('keydown',key);window.removeEventListener('keyup',key);window.removeEventListener('blur',blur)}
  },[])

  const begin=()=>{stopInput();setStarted(true);startedRef.current=true;input.current.paused=false}
  const choose=(id:ConceptId)=>{if(id===concept)return;stopInput();input.current.paused=true;setConcept(id)}
  const current=conceptById(concept)

  return <main className="wv2-root">
    <canvas ref={canvas} className="wv2-canvas" />
    {started&&ready&&!error&&<>
      <div className="wv2-look" onPointerDown={e=>{if(input.current.paused||look.current)return;e.currentTarget.setPointerCapture(e.pointerId);look.current={id:e.pointerId,x:e.clientX,y:e.clientY}}} onPointerMove={e=>{const p=look.current;if(!p||p.id!==e.pointerId||input.current.paused)return;input.current.yaw-=(e.clientX-p.x)*.003;input.current.pitch=Math.max(-1.05,Math.min(1.05,input.current.pitch-(e.clientY-p.y)*.003));p.x=e.clientX;p.y=e.clientY}} onPointerUp={e=>{if(look.current?.id===e.pointerId)look.current=null}} onPointerCancel={()=>look.current=null}/>
      <header className="wv2-hud">
        <div><button className="wv2-pill" onClick={onBack}>← The Lab</button><div className="wv2-kicker">WATERFALL VILLAGE V2 · BLOCKOUT</div><h1>{current.name}</h1><p>{state.zone}</p></div>
        <div className="wv2-concepts" aria-label="Terrain concepts">{concepts.map(c=><button key={c.id} className={c.id===concept?'active':''} onClick={()=>choose(c.id)}><b>{c.shortName}</b><span>{c.name}</span></button>)}</div>
      </header>
      <aside className="wv2-legend"><strong>15 future sites</strong><span>River · grand arch · upper/lower loop</span><button onClick={()=>world.current?.reset()}>Reset position</button></aside>
      <div className="wv2-bottom">
        <div className="wv2-stick-wrap"><div className="wv2-stick" onPointerDown={e=>{if(input.current.paused||stick.current)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);stick.current={id:e.pointerId,x:e.clientX,y:e.clientY}} onPointerMove={e=>{const s=stick.current;if(!s||s.id!==e.pointerId||input.current.paused)return;const dx=e.clientX-s.x,dz=e.clientY-s.y,length=Math.hypot(dx,dz),d=Math.min(46,length),gain=length>6?(d-6)/40/(length||1):0;input.current.x=dx*gain;input.current.z=dz*gain;if(nub.current)nub.current.style.transform=`translate(${dx/(length||1)*d}px,${dz/(length||1)*d}px)`}} onPointerUp={stopInput} onPointerCancel={stopInput}><span className="wv2-ring"/><span ref={nub} className="wv2-nub"/></div><span>WALK</span></div>
        <div className="wv2-center-note"><b>Spatial workshop</b><span>Ignore materials and detail. Judge the terrain, river, bridge, levels, paths, and building-site placement.</span></div>
        <div className="wv2-look-label"><span>✧</span>LOOK</div>
      </div>
    </>}
    {(!started||!ready||error)&&<div className="wv2-overlay"><section>
      <div className="wv2-kicker">TERRAIN-FIRST WORKSHOP · ITERATION 01</div><h1>Waterfall<br/>Village V2</h1>
      <p>{error||'Three rough spatial concepts. No buildings. No finished art. Walk the land first and decide what deserves to become beautiful.'}</p>
      <div className="wv2-preset-row">{concepts.map(c=><button key={c.id} className={c.id===concept?'active':''} onClick={()=>choose(c.id)}><b>{c.shortName}</b><span>{c.name}</span><small>{c.description}</small></button>)}</div>
      {error?<button className="wv2-primary" onClick={()=>location.reload()}>Reload workshop</button>:ready?<button className="wv2-primary" onClick={begin}>Walk {current.name} →</button>:<div className="wv2-loading">Shaping terrain…</div>}
      <button className="wv2-backlink" onClick={onBack}>← Back to The Lab</button>
    </section></div>}
    <div className="wv2-portrait">Rotate to landscape for the terrain workshop.</div>
  </main>
}
