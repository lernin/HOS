import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import * as T from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { createKunaRig } from '../characters/kuna/rig'
import { KUNA_EXPRESSIONS, KUNA_NEUTRAL, sampleKunaRecipe, validateKunaRecipe, type ExpressionRecipe, type HeadPose, type KunaVoicePhase } from '../characters/kuna/expressions'
import './kuna-lab.css'

type Preview={recipe:ExpressionRecipe;since:number}
const deg=(n:number)=>n*Math.PI/180
const degrees=(n:number)=>Math.round(n*180/Math.PI)
const limit=(n:number,a:number,b:number)=>Math.min(b,Math.max(a,n))
const STORAGE='hos-kuna-expression-lab-v1'
const templates:ExpressionRecipe[]=[
  KUNA_EXPRESSIONS.listening,KUNA_EXPRESSIONS.thinking,KUNA_EXPRESSIONS.speaking,
  {version:1,id:'agree.soft-nod',category:'response',repeat:false,duration:1.6,keys:[
    {at:0,pitch:0,turn:0,tilt:0},{at:.35,pitch:-.07,turn:0,tilt:0},
    {at:.67,pitch:.045,turn:0,tilt:0},{at:1.0,pitch:-.05,turn:0,tilt:0},
    {at:1.6,pitch:0,turn:0,tilt:0}]},
  {version:1,id:'disagree.gentle-shake',category:'response',repeat:false,duration:1.6,keys:[
    {at:0,pitch:0,turn:0,tilt:0},{at:.32,pitch:0,turn:-.095,tilt:0},
    {at:.68,pitch:0,turn:.105,tilt:0},{at:1,pitch:0,turn:-.07,tilt:0},
    {at:1.6,pitch:0,turn:0,tilt:0}]},
]
const phrase="Hello! I'm Kuna. I'm listening to you. What would you like to explore today?"
export function KunaLab({onBack}:{onBack:()=>void}){
  const canvas=useRef<HTMLCanvasElement>(null)
  const rigRef=useRef<ReturnType<typeof createKunaRig>|null>(null)
  const phaseRef=useRef<KunaVoicePhase>('idle')
  const manualRef=useRef<HeadPose>({...KUNA_NEUTRAL})
  const previewRef=useRef<Preview|null>(null)
  const scenarioRef=useRef<number|null>(null)
  const speechRef=useRef(false)
  const recordingRef=useRef<{started:number;samples:ExpressionRecipe['keys'] extends readonly (infer U)[]?U[]:never[];last:number}|null>(null)
  const [phase,setPhase]=useState<KunaVoicePhase>('idle')
  const [pose,setPose]=useState<HeadPose>({...KUNA_NEUTRAL})
  const [recording,setRecording]=useState(false)
  const [selected,setSelected]=useState('listen.curious')
  const [category,setCategory]=useState<ExpressionRecipe['category']>('listening')
  const [custom,setCustom]=useState<ExpressionRecipe[]>([])
  const [status,setStatus]=useState('Loading Procedia’s original fox model…')
  const [playing,setPlaying]=useState(false)
  const [assetReady,setAssetReady]=useState(false)
  const [name,setName]=useState('my-curious-listening')
  const allRecipes=[...templates,...custom]
  const choosePhase=(next:KunaVoicePhase)=>{phaseRef.current=next;setPhase(next)}
  const changePose=(next:HeadPose)=>{manualRef.current=next;setPose(next);previewRef.current=null;setPlaying(false)}
  const reset=()=>{changePose({...KUNA_NEUTRAL});choosePhase('idle');scenarioRef.current=null}
  const playRecipe=(recipe:ExpressionRecipe)=>{
    previewRef.current={recipe,since:performance.now()}
    scenarioRef.current=null
    setPlaying(true);setStatus('Previewing '+recipe.id)
    choosePhase('idle')
  }
  useEffect(()=>{
    try{
      const raw=JSON.parse(localStorage.getItem(STORAGE)??'[]') as unknown
      if(Array.isArray(raw))setCustom(raw.filter((r):r is ExpressionRecipe=>
        r!==null&&typeof r==='object'&&validateKunaRecipe(r as ExpressionRecipe)).slice(0,30))
    }catch{/* Developer device storage may be unavailable */}
  },[])
  useEffect(()=>{
    const node=canvas.current;if(!node)return
    let disposed=false,frame=0,last=performance.now()
    const renderer=new T.WebGLRenderer({canvas:node,alpha:true,antialias:true,powerPreference:'high-performance'})
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5))
    renderer.outputColorSpace=T.SRGBColorSpace
    renderer.toneMapping=T.ACESFilmicToneMapping
    renderer.toneMappingExposure=1.12
    const scene=new T.Scene()
    const camera=new T.PerspectiveCamera(38,1,.05,30)
    camera.position.set(2,1.55,3.8);camera.lookAt(0,.65,0)
    scene.add(new T.HemisphereLight('#f5f6ff','#6d4931',2.3))
    const key=new T.DirectionalLight('#ffe3ad',3);key.position.set(3,6,5);scene.add(key)
    const back=new T.DirectionalLight('#9fd0ff',1.5);back.position.set(-4,3,-2);scene.add(back)
    const floorGeo=new T.CircleGeometry(1.5,64)
    floorGeo.rotateX(-Math.PI/2)
    const floorMat=new T.MeshStandardMaterial({color:'#c5b5a0',roughness:.96})
    const ground=new T.Mesh(floorGeo,floorMat);ground.position.y=-.015;scene.add(ground)
    let glb:T.Group|null=null
    let aliveRig:ReturnType<typeof createKunaRig>|null=null
    const loader=new GLTFLoader()
    loader.load('/models/fox-mascot.glb',asset=>{
      if(disposed)return
      glb=asset.scene
      glb.updateMatrixWorld(true)
      const bounds=new T.Box3().setFromObject(glb)
      const h=bounds.getSize(new T.Vector3()).y
      if(h>.001){
        // Studio shows a larger *close-up*; the Ocean Estate fox stays 0.78m.
        glb.scale.setScalar(1.25/h)
        glb.updateMatrixWorld(true)
        bounds.setFromObject(glb)
        const middle=bounds.getCenter(new T.Vector3())
        glb.position.set(-middle.x,-bounds.min.y,-middle.z)
      }
      scene.add(glb);aliveRig=createKunaRig(glb,asset.animations);rigRef.current=aliveRig
      setAssetReady(true)
      setStatus(aliveRig.hasSit?'Original Procedia Sit, Head and Chin ready.':'Sit clip unavailable; check the model.')
    },undefined,()=>{if(!disposed)setStatus('Cannot load Procedia’s fox model.')})
    const resize=()=>{
      const w=node.clientWidth,h=node.clientHeight
      if(w>0&&h>0){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}
    }
    const observer=new ResizeObserver(resize);observer.observe(node);resize()
    const draw=(now:number)=>{
      if(disposed)return
      const dt=limit((now-last)/1000,0,.08);last=now
      let actualPhase=phaseRef.current
      const scenario=scenarioRef.current
      if(scenario!==null){
        const elapsed=(now-scenario)/1000
        const next:KunaVoicePhase=elapsed<2.9?'listening':elapsed<4.25?'thinking':elapsed<8.2?'speaking':'idle'
        if(actualPhase!==next){actualPhase=next;choosePhase(next)}
        if(elapsed>=8.2){scenarioRef.current=null;setStatus('Speaking simulation completed.')}
      }
      const rec=recordingRef.current
      if(rec&&now-rec.last>=100&&now-rec.started<11500){
        const p=manualRef.current
        rec.samples.push({at:Math.round((now-rec.started)/10)/100,pitch:p.pitch,turn:p.turn,tilt:p.tilt})
        rec.last=now
      }
      const playingNow=previewRef.current
      let expression:HeadPose|undefined
      if(playingNow){
        const elapsed=(now-playingNow.since)/1000
        expression=sampleKunaRecipe(playingNow.recipe,elapsed)
        if(!playingNow.recipe.repeat&&elapsed>=playingNow.recipe.duration){
          previewRef.current=null;setPlaying(false)
        }
      }else if(actualPhase==='idle'){
        expression=manualRef.current
      }
      const elapsed=now*.001
      const jaw=actualPhase==='speaking'?
        Math.max(.05,Math.min(.85,.36+.21*Math.sin(elapsed*17)+.19*Math.sin(elapsed*27))):0
      aliveRig?.update(dt,{active:true,phase:actualPhase,speedFraction:0,jaw,manualPose:expression})
      renderer.render(scene,camera)
      frame=requestAnimationFrame(draw)
    }
    frame=requestAnimationFrame(draw)
    return ()=>{
      disposed=true;cancelAnimationFrame(frame);observer.disconnect()
      if(window.speechSynthesis&&speechRef.current)window.speechSynthesis.cancel()
      aliveRig?.dispose();rigRef.current=null
      scene.remove(glb??ground)
      glb?.traverse(o=>{const m=o as T.Mesh;if(m.isMesh){m.geometry.dispose();for(const mat of Array.isArray(m.material)?m.material:[m.material])mat?.dispose()}})
      floorGeo.dispose();floorMat.dispose();renderer.dispose()
    }
  },[])
  useEffect(()=>{
    function key(e:KeyboardEvent){
      if(e.altKey||e.ctrlKey||e.metaKey||/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName??''))return
      const angle=deg(3),p=manualRef.current
      const keys:Record<string,HeadPose>={KeyJ:{...p,turn:limit(p.turn-angle,-.20,.20)},KeyL:{...p,turn:limit(p.turn+angle,-.20,.20)},
        KeyI:{...p,pitch:limit(p.pitch-angle,-.28,.28)},KeyK:{...p,pitch:limit(p.pitch+angle,-.28,.28)},
        KeyD:{...p,tilt:limit(p.tilt-angle,-.22,.22)},KeyF:{...p,tilt:limit(p.tilt+angle,-.22,.22)},
        KeyA:{...KUNA_NEUTRAL}}
      if(keys[e.code]){e.preventDefault();changePose(keys[e.code])}
      if(e.code==='KeyW'){e.preventDefault();playRecipe(templates[3])}
      if(e.code==='KeyQ'){e.preventDefault();playRecipe(templates[4])}
    }
    window.addEventListener('keydown',key)
    return()=>window.removeEventListener('keydown',key)
  },[])
  function beginRecord(){
    if(recording)return
    scenarioRef.current=null;previewRef.current=null;choosePhase('idle')
    const now=performance.now(),p=manualRef.current
    recordingRef.current={started:now,last:now,samples:[{at:0,...p}]}
    setRecording(true);setPlaying(false);setStatus('Recording head movements. Use J/L, I/K, D/F or sliders.')
  }
  function finishRecord(){
    const rec=recordingRef.current;if(!rec)return
    recordingRef.current=null;setRecording(false)
    const duration=limit(Math.round((performance.now()-rec.started)/10)/100,.5,12)
    const samples=rec.samples.filter(s=>s.at>0&&s.at<duration)
    const keys=[{...rec.samples[0]},...samples.filter((_,i)=>i%Math.max(1,Math.ceil(samples.length/40))===0),
      {at:duration,...manualRef.current}]
    const ordered=keys.filter((k,i)=>!i||k.at>keys[i-1].at)
    const recipe:ExpressionRecipe={version:1,id:'custom.'+name.trim().toLowerCase().replace(/[^a-z0-9-]/g,'-').slice(0,42),
      category,repeat:false,duration,keys:ordered}
    if(!validateKunaRecipe(recipe)){setStatus('Invalid recording. Try a movement lasting 1–10 seconds.');return}
    const updated=[...custom.filter(x=>x.id!==recipe.id),recipe].slice(-30)
    setCustom(updated);setSelected(recipe.id);setStatus('Saved '+recipe.id+' locally. Export JSON to transfer it.')
    try{localStorage.setItem(STORAGE,JSON.stringify(updated))}catch{/* Export still available */}
  }
  function exportSelected(){
    const r=allRecipes.find(x=>x.id===selected);if(!r)return
    const blob=new Blob([JSON.stringify(r,null,2)],{type:'application/json'})
    const url=URL.createObjectURL(blob),a=document.createElement('a')
    a.href=url;a.download=r.id+'.json';a.click()
    setTimeout(()=>URL.revokeObjectURL(url),1000)
  }
  async function importRecipe(event:ChangeEvent<HTMLInputElement>){
    const file=event.target.files?.[0];event.target.value='';if(!file)return
    try{
      if(file.size>20000)throw Error('Recipe file is too large.')
      const parsed=JSON.parse(await file.text()) as ExpressionRecipe
      if(!validateKunaRecipe(parsed)||!parsed.id.startsWith('custom.'))throw Error('Not a valid Kuna recipe.')
      const updated=[...custom.filter(r=>r.id!==parsed.id),parsed].slice(-30)
      setCustom(updated);setSelected(parsed.id);setStatus('Imported '+parsed.id)
      try{localStorage.setItem(STORAGE,JSON.stringify(updated))}catch{}
    }catch(e){setStatus(e instanceof Error?e.message:'Could not import recipe.')}
  }
  function runSimulation(){
    if(recording)return
    if(window.speechSynthesis&&speechRef.current){speechRef.current=false;window.speechSynthesis.cancel()}
    previewRef.current=null;setPlaying(false)
    scenarioRef.current=performance.now();choosePhase('listening')
    setStatus('Local simulation: listening → thinking → speaking → ready. No AI requests.')
  }
  function speakSample(){
    if(recording)return
    scenarioRef.current=null;previewRef.current=null
    choosePhase('speaking');setStatus('Device-voice example only, not Procedia verse. No API request.')
    if('speechSynthesis' in window){
      window.speechSynthesis.cancel()
      const utterance=new SpeechSynthesisUtterance(phrase)
      utterance.lang='en-US';utterance.rate=.88
      utterance.onend=()=>{speechRef.current=false;choosePhase('idle')}
      utterance.onerror=()=>{speechRef.current=false;choosePhase('idle');setStatus('Device speech not available. Use silent simulation.')}
      speechRef.current=true
      window.speechSynthesis.speak(utterance)
    }
  }
  const preset=allRecipes.find(r=>r.id===selected)
  return <main className="kl-root" aria-label="Kuna Expression Lab">
    <header className="kl-header"><div><span className="kl-eyebrow">PROCEDIA CHARACTER SYSTEM</span><h1>Kuna Lab</h1><p>Head motion, expressions, and speaking simulation</p></div><button onClick={onBack} className="kl-back">Back to Lab</button></header>
    <div className="kl-layout">
      <section className="kl-stage" aria-label="Animated Procedia Kuna preview">
        <canvas ref={canvas} aria-label="Original 3D Kuna model"/>
        <div className="kl-stage-caption"><b>Original Procedia Kuna</b><span>Native Sit pose · stable head reference · 0.78m in Estate</span></div>
        <div className="kl-indicator">{assetReady?'Model ready':status}</div>
      </section>
      <section className="kl-panel">
        <div className="kl-section"><h2>Speaking simulator</h2><p>Test gestures and mouth movement without a microphone or AI charges.</p>
          <div className="kl-row">{(['idle','listening','thinking','speaking'] as KunaVoicePhase[]).map(v=><button key={v} onClick={()=>{scenarioRef.current=null;previewRef.current=null;choosePhase(v)}} className={phase===v?'selected':''}>{v}</button>)}</div>
          <div className="kl-row"><button className="kl-primary" onClick={runSimulation}>Run full simulation</button><button onClick={speakSample}>Speak sample (device voice)</button></div>
          <small>Real conversations in Ocean Estate still use Procedia’s original voice and speech pipeline. This Lab simulator uses no backend.</small>
        </div>
        <div className="kl-section"><h2>Expression menus</h2>
          <select value={selected} aria-label="Choose Kuna expression" onChange={e=>setSelected(e.target.value)}>
            {allRecipes.map(r=><option key={r.id} value={r.id}>{r.id}</option>)}
          </select>
          <div className="kl-row"><button className="kl-primary" disabled={!preset} onClick={()=>preset&&playRecipe(preset)}>{playing?'Replay expression':'Preview expression'}</button><button onClick={reset}>Neutral</button><button onClick={exportSelected}>Export JSON</button></div>
        </div>
        <div className="kl-section"><h2>Live head controls</h2>
          <p>Procedia controls: J/L turn · I/K look · D/F tilt · W yes · Q no · A reset.</p>
          {([{key:'turn',label:'Head turn',bound:11},{key:'pitch',label:'Look up / down',bound:16},{key:'tilt',label:'Side tilt',bound:13}] as const).map(s=>
            <label className="kl-slider" key={s.key}>{s.label}<output>{degrees(pose[s.key])}°</output>
              <input aria-label={s.label} type="range" min={-s.bound} max={s.bound} step="1" value={degrees(pose[s.key])}
                onChange={e=>changePose({...manualRef.current,[s.key]:deg(Number(e.target.value))})}/>
            </label>)}
        </div>
        <div className="kl-section"><h2>Record a movement</h2>
          <label>Recipe name<input type="text" value={name} maxLength={42} onChange={e=>setName(e.target.value)} placeholder="my-curious-listening"/></label>
          <label>Menu<select value={category} onChange={e=>setCategory(e.target.value as ExpressionRecipe['category'])}>
            {(['listening','thinking','response','social'] as const).map(x=><option key={x} value={x}>{x}</option>)}
          </select></label>
          <div className="kl-row"><button className={recording?'kl-danger':'kl-primary'} onClick={recording?finishRecord:beginRecord}>{recording?'Stop & Save':'Record'}</button><label className="kl-import">Import JSON<input type="file" accept=".json,application/json" onChange={e=>void importRecipe(e)}/></label></div>
          <small>Records head controls as timestamped, limited-angle JSON—not videos or children's voices. Saved locally until exported.</small>
        </div>
        <p className="kl-status" role="status">{status}</p>
      </section>
    </div>
  </main>
}
