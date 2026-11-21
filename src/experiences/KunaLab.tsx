import {useEffect,useRef,useState,type ChangeEvent} from 'react'
import * as T from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {createKunaRig} from '../characters/kuna/rig'
import {KUNA_EXPRESSIONS,KUNA_NEUTRAL,sampleKunaRecipe,validateKunaRecipe,type ExpressionRecipe,type HeadPose,type KunaVoicePhase} from '../characters/kuna/expressions'
import {PROCEDIA_KEY_ROWS,PROCEDIA_CLIP_KEYS,PROCEDIA_GESTURE_CODES,getProcediaClip,isProcediaKey,sampleProcediaKeys} from '../characters/kuna/procediaKeyboard'
import {createKunaRecorder,sampleKunaTake,validateKunaTake,KUNA_STARTER_EMOTIONS,normalizeKunaEmotion,validKunaEmotion,type KunaStudioTake,type RecorderMode} from '../characters/kuna/studioRecorder'
import './kuna-lab.css'

type Playback={recipe?:ExpressionRecipe;take?:KunaStudioTake;since:number;lastClipAt:number}
const phrase="Hello! I'm Kuna. I'm listening to you. What would you like to explore today?"
const deg=(n:number)=>n*Math.PI/180
const degrees=(n:number)=>Math.round(n*180/Math.PI)
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n))
const STORAGE='hos-kuna-motion-studio-v2'
const EMOTION_STORE='hos-kuna-emotion-catalog-v1'
function emotionNames(values:unknown,recordings:KunaStudioTake[]=[]):string[]{
  const names:string[]=[...KUNA_STARTER_EMOTIONS]
  const add=(name:unknown)=>{
    if(validKunaEmotion(name)&&!names.includes(name)&&names.length<48)names.push(name)
  }
  if(Array.isArray(values))values.forEach(add)
  recordings.forEach(t=>Object.keys(t.emotions??{}).forEach(add))
  return names
}
function readEmotionNames(recordings:KunaStudioTake[]):string[]{
  try{return emotionNames(JSON.parse(localStorage.getItem(EMOTION_STORE)??'[]'),recordings)}
  catch{return emotionNames([],recordings)}
}
function motionTrace(take:KunaStudioTake,axis:'turn'|'pitch'):string{
  const step=Math.max(1,Math.ceil(take.frames.length/48))
  return take.frames.filter((_,i)=>i%step===0||i===take.frames.length-1)
    .map((f,i)=>(i?'L':'M')+(100*f.at/take.duration).toFixed(2)+' '+(24-f[axis]*27).toFixed(2)).join(' ')
}
const presets:ExpressionRecipe[]=[
  ...Object.values(KUNA_EXPRESSIONS),
  {version:1,id:'agree.soft-nod',category:'response',duration:1.6,repeat:false,keys:[
    {at:0,pitch:0,turn:0,tilt:0},{at:.35,pitch:-.07,turn:0,tilt:0},
    {at:.67,pitch:.045,turn:0,tilt:0},{at:1,pitch:-.05,turn:0,tilt:0},
    {at:1.6,pitch:0,turn:0,tilt:0}]},
  {version:1,id:'disagree.gentle-shake',category:'response',duration:1.6,repeat:false,keys:[
    {at:0,pitch:0,turn:0,tilt:0},{at:.32,pitch:0,turn:-.095,tilt:0},
    {at:.68,pitch:0,turn:.105,tilt:0},{at:1,pitch:0,turn:-.07,tilt:0},
    {at:1.6,pitch:0,turn:0,tilt:0}]},
]
const names=['Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8','Digit9','Digit0']
const printable=(id:string)=>id.replace(/^take-/,'Take ')
function downloadJson(filename:string,data:unknown){
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'})
  const url=URL.createObjectURL(blob),a=document.createElement('a')
  a.href=url;a.download=filename;a.click()
  window.setTimeout(()=>URL.revokeObjectURL(url),1000)
}
function readStoredTakes():KunaStudioTake[]{
  try{
    const raw=JSON.parse(localStorage.getItem(STORAGE)??'[]') as unknown
    if(Array.isArray(raw)&&raw.length)return raw.filter(validateKunaTake).slice(-60)
    // Preserve recordings made in the first Kuna Lab, without requiring
    // manually rebuilding a gesture that already worked.
    const legacy=JSON.parse(localStorage.getItem('hos-kuna-expression-lab-v1')??'[]') as unknown
    if(Array.isArray(legacy))return legacy.flatMap((v,i)=>{
      const old=v as ExpressionRecipe
      if(!validateKunaRecipe(old))return []
      const take:KunaStudioTake={version:2,id:'take-legacy-'+i,label:old.id,tags:[old.category],
        duration:old.duration,frames:old.keys.map(k=>({...k,jaw:0})),clips:[]}
      return validateKunaTake(take)?[take]:[]
    })
  }catch{/* Gracefully support private browsing / disabled device storage. */}
  return []
}
export function KunaLab({onBack}:{onBack:()=>void}){
  const canvas=useRef<HTMLCanvasElement>(null)
  const rigRef=useRef<ReturnType<typeof createKunaRig>|null>(null)
  const phaseRef=useRef<KunaVoicePhase>('idle')
  const slidersRef=useRef<HeadPose>({...KUNA_NEUTRAL})
  const pressedRef=useRef(new Set<string>())
  const playbackRef=useRef<Playback|null>(null)
  const simRef=useRef<number|null>(null)
  const voiceRef=useRef(false)
  const recorderRef=useRef(createKunaRecorder())
  const lastPoseRef=useRef({pitch:0,turn:0,tilt:0,jaw:0})
  const takeSeqRef=useRef(0)
  const [phase,setPhase]=useState<KunaVoicePhase>('idle')
  const [pose,setPose]=useState<HeadPose>({...KUNA_NEUTRAL})
  const [pressed,setPressed]=useState<string[]>([])
  const [mode,setMode]=useState<RecorderMode>('idle')
  const [takes,setTakes]=useState<KunaStudioTake[]>([])
  const [selected,setSelected]=useState('')
  const [emotionCatalog,setEmotionCatalog]=useState<string[]>([...KUNA_STARTER_EMOTIONS])
  const [emotionDraft,setEmotionDraft]=useState('')
  const [emotionFilter,setEmotionFilter]=useState('all')
  const [presetId,setPresetId]=useState('listen.curious')
  const [playing,setPlaying]=useState(false)
  const [status,setStatus]=useState('Loading Procedia’s original fox model…')
  const [assetReady,setAssetReady]=useState(false)
  const [isSitting,setIsSitting]=useState(false)
  const sittingRef=useRef(false)

  const choosePhase=(next:KunaVoicePhase)=>{phaseRef.current=next;setPhase(next)}
  const setSit=(next:boolean)=>{sittingRef.current=next;setIsSitting(next)}
  const setManual=(next:HeadPose)=>{
    slidersRef.current=next;setPose(next)
    playbackRef.current=null;setPlaying(false)
    if(mode==='armed'){
      recorderRef.current.beginOnInput(performance.now(),lastPoseRef.current)
      setMode(recorderRef.current.mode())
    }
  }
  const reset=()=>{
    pressedRef.current.clear();setPressed([])
    setManual({...KUNA_NEUTRAL});choosePhase('idle')
    simRef.current=null;playbackRef.current=null;setPlaying(false)
    rigRef.current?.cancelDemo()
  }
  function setLibrary(next:KunaStudioTake[]){
    setTakes(next)
    try{localStorage.setItem(STORAGE,JSON.stringify(next))}catch{/* Export still works. */}
  }
  function saveEmotionCatalog(next:string[]){
    setEmotionCatalog(next)
    try{localStorage.setItem(EMOTION_STORE,JSON.stringify(next))}catch{/* JSON export remains available. */}
  }
  function registerEmotion(){
    const name=normalizeKunaEmotion(emotionDraft)
    if(!validKunaEmotion(name)){
      setStatus('Use an emotion name of 1–32 letters, numbers, spaces or hyphens.');return
    }
    if(!emotionCatalog.includes(name)){
      if(emotionCatalog.length>=48){setStatus('Emotion catalog limit reached (48).');return}
      saveEmotionCatalog([...emotionCatalog,name])
    }
    setEmotionDraft('')
    setStatus(name+' is registered. Select a recording and give it a strength rating.')
  }
  function toggleEmotion(take:KunaStudioTake,name:string){
    const emotions={...take.emotions}
    if(emotions[name]!==undefined)delete emotions[name]
    else {
      if(Object.keys(emotions).length>=24){setStatus('Use at most 24 ratings per take.');return}
      emotions[name]=50
    }
    updateTake(take.id,{emotions})
  }
  function arm(){
    if(mode==='recording'||mode==='paused')return
    recorderRef.current.arm();setMode('armed')
    pressedRef.current.clear();setPressed([])
    playbackRef.current=null;simRef.current=null;setPlaying(false);choosePhase('idle')
    setStatus('Armed. Recording begins when you press your first Procedia movement key or move a slider.')
  }
  function pause(){
    recorderRef.current.pause(performance.now())
    setMode(recorderRef.current.mode());setStatus('Recording paused. Press Resume to continue this take.')
  }
  function resume(){
    recorderRef.current.resume(performance.now())
    setMode(recorderRef.current.mode());setStatus('Recording resumed.')
  }
  function stopAndSave(armNext=false){
    const id='take-'+String(++takeSeqRef.current).padStart(3,'0')
    const take=recorderRef.current.finish(performance.now(),lastPoseRef.current,id)
    if(take){
      setLibrary([...takes,take].slice(-60));setSelected(take.id)
      setStatus('Saved custom.'+take.id+' — replay it, then name the feeling. '+take.frames.length+' motion frames captured.')
    }else setStatus('No movement recorded. Press Arm, then perform a gesture.')
    pressedRef.current.clear();setPressed([])
    if(armNext){recorderRef.current.arm();setMode('armed')}
    else setMode('idle')
  }
  function applyKey(code:string,down:boolean,repeat=false){
    if(!isProcediaKey(code))return
    const clip=getProcediaClip(code)
    if(clip){
      if(!down||repeat)return
      if(recorderRef.current.mode()==='armed'){
        recorderRef.current.beginOnInput(performance.now(),lastPoseRef.current)
        setMode('recording')
      }
      const worked=rigRef.current?.triggerDemoClip(clip.name,clip.timeScale)
      if(!worked)setStatus('Original Procedia clip '+clip.name+' is not available on this model.')
      if(worked)recorderRef.current.clip(performance.now(),clip)
      return
    }
    if(!PROCEDIA_GESTURE_CODES.has(code))return
    if(down){
      if(pressedRef.current.has(code)||repeat)return
      if(recorderRef.current.mode()==='armed'){
        recorderRef.current.beginOnInput(performance.now(),lastPoseRef.current)
        setMode('recording')
      }
      pressedRef.current.add(code)
    }else pressedRef.current.delete(code)
    setPressed([...pressedRef.current])
  }
  function playPreset(recipe:ExpressionRecipe){
    if(!validateKunaRecipe(recipe))return
    if(mode==='recording'||mode==='paused')return
    playbackRef.current={recipe,since:performance.now(),lastClipAt:-1}
    simRef.current=null;setPlaying(true);choosePhase('idle')
    setStatus('Previewing '+recipe.id+' on the original Procedia fox.')
  }
  function playTake(take:KunaStudioTake){
    if(!validateKunaTake(take)||mode==='recording'||mode==='paused')return
    rigRef.current?.cancelDemo()
    playbackRef.current={take,since:performance.now(),lastClipAt:-1}
    simRef.current=null;setPlaying(true);choosePhase('idle')
    setStatus('Replaying '+(take.label||printable(take.id))+' at '+(take.playbackIntensity??100)+'% head/jaw movement; timing remains original.')
  }
  function updateTake(id:string,changes:Partial<Pick<KunaStudioTake,'label'|'tags'|'emotions'|'playbackIntensity'>>){
    const updated=takes.map(t=>t.id===id?{...t,...changes}:t)
    setLibrary(updated)
  }
  function exportSelected(){
    const take=takes.find(t=>t.id===selected)
    if(take)downloadJson((take.label.trim()||take.id).replace(/[^a-z0-9-_]/gi,'-')+'.json',take)
    else downloadJson('kuna-expression-'+presetId+'.json',presets.find(r=>r.id===presetId))
  }
  async function importRecipe(event:ChangeEvent<HTMLInputElement>){
    const file=event.target.files?.[0];event.target.value='';if(!file)return
    try{
      if(file.size>1500000)throw Error('Recording file is too large.')
      const data=JSON.parse(await file.text()) as unknown
      const pack=data&&typeof data==='object'&&!Array.isArray(data)&&'takes' in data
        ?data as {version?:unknown;type?:unknown;takes?:unknown;emotions?:unknown}:null
      if(pack&&(pack.version!==3||pack.type!=='kuna-motion-library'))
        throw Error('Unrecognized Kuna gallery library format.')
      const source=pack?pack.takes:data
      const rawItems=Array.isArray(source)?source:[source]
      if(!rawItems.length||rawItems.length>60||!rawItems.every(validateKunaTake))
        throw Error('Invalid Kuna Studio recording JSON.')
      const items=rawItems as KunaStudioTake[]
      const previous=new Map(takes.map(x=>[x.id,x]))
      for(const t of items)previous.set(t.id,t)
      const next=[...previous.values()].slice(-60)
      setLibrary(next);setSelected(items[0].id)
      const importedNames=Array.isArray(pack?.emotions)?pack.emotions:[]
      saveEmotionCatalog(emotionNames([...emotionCatalog,...importedNames],next))
      setStatus('Imported '+items.length+' Kuna gesture recording(s) with emotional ratings.')
    }catch(e){setStatus(e instanceof Error?e.message:'Could not import recordings.')}
  }
  function runSimulation(){
    if(mode==='recording'||mode==='paused')return
    playbackRef.current=null;setPlaying(false);simRef.current=performance.now()
    choosePhase('listening');setSit(true)
    setStatus('Local speaking simulation: listen → think → speak → neutral. No AI requests.')
  }
  function speakSample(){
    if(mode==='recording'||mode==='paused')return
    if(!('speechSynthesis' in window)){setStatus('Device speech is unavailable. Use the silent speaking simulator.');return}
    window.speechSynthesis.cancel()
    playbackRef.current=null;simRef.current=null
    choosePhase('speaking');setSit(true)
    setStatus('Device-voice sample only: the real Procedia verse voice is still used in Ocean Estate. No API request.')
    const utterance=new SpeechSynthesisUtterance(phrase)
    utterance.lang='en-US';utterance.rate=.88
    voiceRef.current=true
    utterance.onend=()=>{voiceRef.current=false;choosePhase('idle')}
    utterance.onerror=()=>{voiceRef.current=false;choosePhase('idle')}
    window.speechSynthesis.speak(utterance)
  }
  useEffect(()=>{
    const stored=readStoredTakes()
    setTakes(stored)
    if(stored.length)setSelected(stored.at(-1)!.id)
    takeSeqRef.current=stored.reduce((n,t)=>Math.max(n,Number(t.id.match(/^take-(\d+)$/)?.[1]??0)),0)
    setEmotionCatalog(readEmotionNames(stored))
  },[])
  useEffect(()=>{
    const node=canvas.current;if(!node)return
    let disposed=false,frame=0,last=performance.now()
    const renderer=new T.WebGLRenderer({canvas:node,alpha:true,antialias:true,powerPreference:'high-performance'})
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5))
    renderer.outputColorSpace=T.SRGBColorSpace
    renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12
    const scene=new T.Scene()
    const camera=new T.PerspectiveCamera(38,1,.05,30)
    camera.position.set(2,1.55,3.8);camera.lookAt(0,.65,0)
    scene.add(new T.HemisphereLight('#f5f6ff','#6d4931',2.3))
    const key=new T.DirectionalLight('#ffe3ad',3);key.position.set(3,6,5);scene.add(key)
    const back=new T.DirectionalLight('#9fd0ff',1.5);back.position.set(-4,3,-2);scene.add(back)
    const floorGeo=new T.CircleGeometry(1.5,64);floorGeo.rotateX(-Math.PI/2)
    const floorMat=new T.MeshStandardMaterial({color:'#c5b5a0',roughness:.96})
    const ground=new T.Mesh(floorGeo,floorMat);ground.position.y=-.015;scene.add(ground)
    let fox:T.Group|null=null
    let aliveRig:ReturnType<typeof createKunaRig>|null=null
    new GLTFLoader().load('/models/fox-mascot.glb',asset=>{
      if(disposed)return
      fox=asset.scene;fox.updateWorldMatrix(true,true)
      const bounds=new T.Box3().setFromObject(fox),h=bounds.getSize(new T.Vector3()).y
      if(h>.001){
        // Close-up studio view only; Estate stays at the approved 0.78m.
        fox.scale.setScalar(1.25/h);fox.updateWorldMatrix(true,true)
        bounds.setFromObject(fox);const middle=bounds.getCenter(new T.Vector3())
        fox.position.set(-middle.x,-bounds.min.y,-middle.z)
      }
      scene.add(fox);aliveRig=createKunaRig(fox,asset.animations);rigRef.current=aliveRig
      setAssetReady(true)
      setStatus('Procedia Kuna loaded. All head, mouth and numbered animation controls are ready.')
    },undefined,()=>{if(!disposed)setStatus('Could not load the original Procedia fox model.')})
    const resize=()=>{
      const w=node.clientWidth,h=node.clientHeight
      if(w&&h){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}
    }
    const observer=new ResizeObserver(resize);observer.observe(node);resize()
    const draw=(now:number)=>{
      if(disposed)return
      const dt=clamp((now-last)/1000,0,.08);last=now
      let currentPhase=phaseRef.current
      if(simRef.current!==null){
        const t=(now-simRef.current)/1000
        const next:KunaVoicePhase=t<2.8?'listening':t<4.2?'thinking':t<8.2?'speaking':'idle'
        if(next!==currentPhase){choosePhase(next);currentPhase=next}
        if(t>=8.2){simRef.current=null;setStatus('Speaking simulation completed.')}
      }
      const keys=sampleProcediaKeys(pressedRef.current,now/1000)
      const sliders=slidersRef.current
      const useManual=pressedRef.current.size>0||
        Math.abs(sliders.pitch)+Math.abs(sliders.turn)+Math.abs(sliders.tilt)>.0001
      let manual:HeadPose|undefined=useManual?{
        pitch:clamp(sliders.pitch+keys.pitch,-.63,.63),
        turn:clamp(sliders.turn+keys.turn,-.56,.56),
        tilt:clamp(sliders.tilt+keys.tilt,-.53,.53),
      }:undefined
      let jaw=keys.jaw,instant=false
      const preview=playbackRef.current
      if(preview){
        const time=(now-preview.since)/1000
        if(preview.take){
          const frameValue=sampleKunaTake(preview.take,time,preview.take.playbackIntensity??100)
          manual=frameValue;jaw=frameValue.jaw;instant=true
          for(const event of preview.take.clips){
            if(event.at>preview.lastClipAt&&event.at<=time)aliveRig?.triggerDemoClip(event.name,event.timeScale)
          }
          preview.lastClipAt=time
          if(time>=preview.take.duration){playbackRef.current=null;setPlaying(false)}
        }else if(preview.recipe){
          manual=sampleKunaRecipe(preview.recipe,time);instant=true
          if(!preview.recipe.repeat&&time>=preview.recipe.duration){
            playbackRef.current=null;setPlaying(false)
          }
        }
      }
      const t=now*.001
      const speechJaw=currentPhase==='speaking'?
        clamp(.38+.21*Math.sin(t*17)+.16*Math.sin(t*27),.07,.9):0
      const seated=sittingRef.current||currentPhase!=='idle'
      aliveRig?.update(dt,{active:seated,phase:currentPhase,speedFraction:0,
        jaw:speechJaw,manualJaw:jaw,freezeIdle:keys.freeze,manualPose:manual,
        studioMode:true,directPose:instant})
      if(aliveRig&&recorderRef.current.mode()==='recording'){
        const actual=aliveRig.displayedPose()
        lastPoseRef.current=actual
        recorderRef.current.capture(now,actual)
      }else if(aliveRig)lastPoseRef.current=aliveRig.displayedPose()
      renderer.render(scene,camera)
      frame=requestAnimationFrame(draw)
    }
    frame=requestAnimationFrame(draw)
    return()=>{
      disposed=true;cancelAnimationFrame(frame);observer.disconnect()
      if(voiceRef.current&&'speechSynthesis' in window)window.speechSynthesis.cancel()
      aliveRig?.dispose();rigRef.current=null
      fox?.traverse(o=>{const mesh=o as T.Mesh;if(mesh.isMesh){
        mesh.geometry?.dispose()
        for(const mat of Array.isArray(mesh.material)?mesh.material:[mesh.material])mat?.dispose()
      }})
      floorGeo.dispose();floorMat.dispose();renderer.dispose()
    }
  },[])
  useEffect(()=>{
    function keyDown(e:KeyboardEvent){
      if(e.altKey||e.ctrlKey||e.metaKey||/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName??''))return
      if(!isProcediaKey(e.code))return
      e.preventDefault();applyKey(e.code,true,e.repeat)
    }
    function keyUp(e:KeyboardEvent){
      if(!isProcediaKey(e.code))return
      e.preventDefault();applyKey(e.code,false)
    }
    function releaseAll(){pressedRef.current.clear();setPressed([])}
    window.addEventListener('keydown',keyDown)
    window.addEventListener('keyup',keyUp)
    window.addEventListener('blur',releaseAll)
    return()=>{window.removeEventListener('keydown',keyDown);window.removeEventListener('keyup',keyUp);window.removeEventListener('blur',releaseAll)}
  },[mode])
  const current=takes.find(t=>t.id===selected)
  const selectedPreset=presets.find(r=>r.id===presetId)
  const gallery=takes.filter(t=>emotionFilter==='all'||t.emotions?.[emotionFilter]!==undefined).reverse()
  return <main className="kl-root" aria-label="Kuna Motion Studio">
    <header className="kl-header"><div><span className="kl-eyebrow">PROCEDIA CHARACTER SYSTEM · REUSABLE WORLD PACKAGE</span>
      <h1>Kuna Lab</h1><p>Motion Studio · perform first, name the feeling afterward</p></div>
      <button className="kl-back" onClick={onBack}>Back to Lab</button>
    </header>
    <div className="kl-layout">
      <section className="kl-stage" aria-label="Animated Procedia Kuna preview">
        <canvas ref={canvas} aria-label="Original 3D Kuna model"/>
        <div className="kl-stage-caption"><b>Original Procedia Kuna</b><span>Same GLB, Head and Chin bones · 0.78 m in Ocean Estate</span></div>
        <div className="kl-indicator">{assetReady?'Model ready':status}</div>
      </section>
      <section className="kl-panel">
        <div className="kl-section kl-recorder">
          <h2>Motion Studio</h2><p>Arm, then press any Procedia movement key. Recording starts with your first action—not before. Capture several takes, then decide what they mean.</p>
          <div className="kl-record-indicator" aria-live="polite"><span className={'kl-record-dot kl-record-dot--'+mode}/>
            {mode==='armed'?'Armed · perform a movement':mode==='recording'?'Recording the visible animation':mode==='paused'?'Paused · timing stopped':'Ready to capture'}
          </div>
          <div className="kl-row">
            {(mode==='idle'||mode==='armed')&&<button className="kl-primary" onClick={arm}>{mode==='armed'?'Re-arm':'Record'}</button>}
            {(mode==='recording'||mode==='paused')&&<button className="kl-danger" onClick={()=>stopAndSave(false)}>Stop & Save</button>}
            {mode==='recording'&&<button onClick={pause}>Pause</button>}
            {mode==='paused'&&<button onClick={resume}>Resume</button>}
            {(mode==='recording'||mode==='paused')&&<button onClick={()=>stopAndSave(true)}>Save & next take</button>}
            {mode==='armed'&&<button onClick={()=>{recorderRef.current.discard();setMode('idle')}}>Cancel</button>}
          </div>
          <small>Automatic capture records the smoothed movement on the actual model, including jaw motion and native animation triggers. Each take remains unlabeled until you review it.</small>
        </div>
        <div className="kl-section">
          <h2>Procedia keyboard</h2><p>Press and hold—release to stop. The same keyboard controls as Procedia Chat, including all three nods and shakes.</p>
          <div className="kl-keys">
            {PROCEDIA_KEY_ROWS.map(item=><button type="button" key={item.code}
              className={pressed.includes(item.code)?'kl-key-active':''}
              onPointerDown={e=>{e.preventDefault();applyKey(item.code,true)}}
              onPointerUp={()=>applyKey(item.code,false)}
              onPointerCancel={()=>applyKey(item.code,false)}
              onPointerLeave={()=>applyKey(item.code,false)}>
              <kbd>{item.key}</kbd><span>{item.name}</span>
            </button>)}
          </div>
          <h3>Native Procedia animation clips · 1–0</h3>
          <div className="kl-clip-keys">
            {names.map(code=><button type="button" key={code} onClick={()=>applyKey(code,true)}><kbd>{code.slice(-1)}</kbd>{PROCEDIA_CLIP_KEYS[code].name}</button>)}
          </div>
          <div className="kl-row"><button onClick={reset}>Neutral / release keys</button>
            <button onClick={()=>setSit(!isSitting)}>{isSitting?'Stand':'Sit and look up'}</button></div>
        </div>
        <div className="kl-section">
          <h2>Head fine-tuning</h2><p>Optional touch sliders; keyboard performance remains the main recording method.</p>
          {([{key:'turn',label:'Head turn',bound:30},{key:'pitch',label:'Look up / down',bound:35},{key:'tilt',label:'Side tilt',bound:30}] as const).map(s=>
            <label className="kl-slider" key={s.key}>{s.label}<output>{degrees(pose[s.key])}°</output>
              <input aria-label={s.label} type="range" min={-s.bound} max={s.bound} step="1"
                value={degrees(pose[s.key])} onChange={e=>setManual({...slidersRef.current,[s.key]:deg(Number(e.target.value))})}/>
            </label>)}
        </div>
        <div className="kl-section kl-gallery-section">
          <h2>Expression gallery <span className="kl-count">{takes.length}</span></h2>
          <p>Every card is a recorded performance. Tap to replay. The two traces show head turn and pitch—not emotion.</p>
          <div className="kl-gallery-toolbar">
            <label>Show recordings
              <select aria-label="Filter takes by registered emotion" value={emotionFilter} onChange={e=>setEmotionFilter(e.target.value)}>
                <option value="all">All emotions / unrated</option>
                {emotionCatalog.map(name=><option key={name} value={name}>{name}</option>)}
              </select>
            </label>
            <span>{gallery.length} of {takes.length} takes</span>
          </div>
          {gallery.length===0?<p className="kl-empty">{takes.length?'No takes registered with this emotion yet.':'No takes yet. Press Record and perform a gesture.'}</p>:
          <div className="kl-gallery">
            {gallery.map(t=><button type="button" key={t.id}
              className={'kl-gallery-card'+(selected===t.id?' kl-gallery-card--selected':'')}
              onClick={()=>{setSelected(t.id);playTake(t)}}
              aria-label={'Select and replay '+(t.label||printable(t.id))}>
              <svg className="kl-motion-trace" viewBox="0 0 100 48" preserveAspectRatio="none" aria-hidden="true">
                <path className="kl-trace-baseline" d="M0 24 H100"/>
                <path className="kl-trace-turn" d={motionTrace(t,'turn')}/>
                <path className="kl-trace-pitch" d={motionTrace(t,'pitch')}/>
              </svg>
              <span className="kl-card-title"><b>{t.label||printable(t.id)}</b><span>▶</span></span>
              <span className="kl-card-meta">{t.duration.toFixed(1)} sec · {t.frames.length} frames · motion {t.playbackIntensity??100}%</span>
              <span className="kl-card-emotions">
                {Object.entries(t.emotions??{}).length===0?<i>Not emotionally rated</i>:
                  Object.entries(t.emotions??{}).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([name,value])=>
                    <span className="kl-emotion-chip" key={name}>{name} {value}%</span>)}
              </span>
            </button>)}
          </div>}
          {current&&<div className="kl-label-editor">
            <h3>Register this expression · {current.label||printable(current.id)}</h3>
            <label>Short name (optional)
              <input type="text" maxLength={100} placeholder="Curious head tilt"
                value={current.label} onChange={e=>updateTake(current.id,{label:e.target.value})}/>
            </label>
            <p>Which emotions does the gesture communicate? Add any that are present, then rate their strength. Unselected means not rated; 0% means explicitly none.</p>
            <div className="kl-emotion-palette" aria-label="Registered emotions">
              {emotionCatalog.map(name=><button type="button" key={name}
                aria-pressed={current.emotions?.[name]!==undefined}
                className={current.emotions?.[name]!==undefined?'selected':''}
                onClick={()=>toggleEmotion(current,name)}>
                {current.emotions?.[name]!==undefined?'✓ ':'+ '}{name}
              </button>)}
            </div>
            {Object.entries(current.emotions??{}).length>0&&<div className="kl-emotion-ratings">
              {Object.entries(current.emotions??{}).sort((a,b)=>emotionCatalog.indexOf(a[0])-emotionCatalog.indexOf(b[0]))
                .map(([name,value])=><div className="kl-rating-row" key={name}>
                  <label className="kl-slider">{name}<output>{value}%</output>
                    <input aria-label={name+' emotional strength'} type="range" min="0" max="100" step="5"
                      value={value} onChange={e=>updateTake(current.id,{emotions:{...current.emotions,[name]:Number(e.target.value)}})}/>
                  </label>
                  <button type="button" onClick={()=>toggleEmotion(current,name)} aria-label={'Remove '+name+' rating'}>Remove</button>
                </div>)}
            </div>}
            <div className="kl-emotion-register">
              <label>Register a new emotion
                <input type="text" maxLength={32} placeholder="e.g. reassurance"
                  value={emotionDraft} onChange={e=>setEmotionDraft(e.target.value)}
                  onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();registerEmotion()}}}/>
              </label>
              <button type="button" onClick={registerEmotion}>Add emotion</button>
            </div>
            <h3>Playback intensity · independent of emotional meaning</h3>
            <label className="kl-slider">Head and jaw movement <output>{current.playbackIntensity??100}%</output>
              <input aria-label="Playback intensity" type="range" min="0" max="100" step="5"
                value={current.playbackIntensity??100}
                onChange={e=>updateTake(current.id,{playbackIntensity:Number(e.target.value)})}/>
            </label>
            <small>Original recording stays unchanged. This controls head/jaw amplitude, not the emotional ratings or playback speed. Native full-body one-shot clips still play at their recorded strength.</small>
            <label>Legacy free-text tags (optional)
              <input type="text" value={current.tags.join(', ')} placeholder="notes, other interpretations"
                onChange={e=>updateTake(current.id,{tags:e.target.value.split(',').map(x=>x.trim()).filter(Boolean).slice(0,12)})}/>
            </label>
            <div className="kl-row"><button className="kl-primary" onClick={()=>playTake(current)}>Replay at {current.playbackIntensity??100}%</button>
              <button onClick={exportSelected}>Export this take</button></div>
          </div>}
          <div className="kl-row">
            <button disabled={!takes.length} onClick={()=>downloadJson('kuna-motion-expression-gallery-v3.json',
              {type:'kuna-motion-library',version:3,emotions:emotionCatalog,takes})}>Export gallery + vocabulary</button>
            <label className="kl-import">Import JSON<input type="file" accept=".json,application/json" onChange={e=>void importRecipe(e)}/></label>
          </div>
          <small>Local-only ratings; no child emotion inference or AI gesture selection yet. Export includes take ratings, original motion, and registered vocabulary. Old v2 take files still import.</small>
        </div>
        <div className="kl-section">
          <h2>Expression menus</h2><p>Built-in recipes are starting points. Your recorded takes remain independent until you choose labels.</p>
          <select aria-label="Choose Kuna expression" value={presetId} onChange={e=>setPresetId(e.target.value)}>
            {presets.map(r=><option key={r.id} value={r.id}>{r.id}</option>)}
          </select>
          <div className="kl-row"><button className="kl-primary" onClick={()=>selectedPreset&&playPreset(selectedPreset)}>
            {playing?'Replay expression':'Preview expression'}</button>
            <button onClick={()=>{downloadJson('kuna-expression-'+presetId+'.json',selectedPreset)}}>Export preset</button></div>
        </div>
        <div className="kl-section">
          <h2>Speaking simulator</h2><p>Preview the actual Procedia Head/Chin rig during listening, thinking and speaking. No backend calls.</p>
          <div className="kl-row">
            {(['idle','listening','thinking','speaking'] as KunaVoicePhase[]).map(p=><button key={p} className={phase===p?'selected':''}
              onClick={()=>{simRef.current=null;playbackRef.current=null;choosePhase(p)}}>{p}</button>)}
          </div>
          <div className="kl-row"><button className="kl-primary" onClick={runSimulation}>Run full simulation</button>
            <button onClick={speakSample}>Speak sample (device voice)</button></div>
          <small>This sample uses the device voice, not Procedia's verse voice. Ocean Estate's real conversations still use Procedia's original STT, chat, TTS and audio-driven mouth movement.</small>
        </div>
        <p className="kl-status" role="status">{status}</p>
      </section>
    </div>
  </main>
}
