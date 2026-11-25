import { useEffect, useRef, useState } from 'react'
import { createEstate, type EstateInput, type EstateState } from './estate/scene'
import type { EstateArtChoice } from './estate/art'
import { estateAudio } from './estate/audio'
import { canonicalTourViews, destinations, spawn, type EstateTourView, type EstateTourViews } from './estate/plan'
import type { LightPreset } from './estate/environment'
import { estateEditorMaterials, estateEditorPreview, type EditableRoomId, type EditableSurface } from './estate/editor'
import { loadEstateMaterialCatalog } from './estate/catalog'
import './estate/estate.css'
import './estate/performance.css'
import { EstateRemoteQR, useEstateTvRemote } from './estate/remote'
import { BASE_WALK_SPEED, MAX_WALK_SPEED, clampWalkingSpeed } from './estate/walkingSpeed'
import { findRemoteDestination } from './estate/remoteNavigation'
import { readPortraitPreference } from './estate/portraitMode'
import { formatEstateDiagnosticsReport, type EstateDiagnosticSnapshot } from './estate/sceneDiagnostics'
type Prefs={speed:number;sensitivity:number;turnSpeed:number;quality:number;lighting:LightPreset;mode:'explore'|'walk';volume:number;resolutionCeiling:number;adaptiveResolution:boolean;shadows:boolean;accentLights:boolean;showFps:boolean;portraitExplore:boolean;showSceneDiagnostics:boolean}
const defaults:Prefs={speed:BASE_WALK_SPEED,sensitivity:1,turnSpeed:28,quality:1,lighting:'golden',mode:'explore',volume:.35,resolutionCeiling:1,adaptiveResolution:true,shadows:true,accentLights:true,showFps:true,portraitExplore:false,showSceneDiagnostics:false}
function readPrefs():Prefs{try{const p=JSON.parse(localStorage.getItem('ocean-estate-v1')||'{}'),num=(key:'speed'|'sensitivity'|'turnSpeed'|'quality'|'volume'|'resolutionCeiling',lo:number,hi:number)=>typeof p[key]==='number'&&Number.isFinite(p[key])?Math.max(lo,Math.min(hi,p[key])):defaults[key];return {speed:clampWalkingSpeed(p.speed),sensitivity:num('sensitivity',.3,2) as number,turnSpeed:num('turnSpeed',15,60) as number,quality:[0,1,2].includes(p.quality)?p.quality:1,lighting:['daylight','golden','evening'].includes(p.lighting)?p.lighting:'golden',mode:p.mode==='walk'?'walk':'explore',volume:num('volume',0,1) as number,resolutionCeiling:num('resolutionCeiling',.5,1) as number,adaptiveResolution:p.adaptiveResolution!==false,shadows:p.shadows!==false,accentLights:p.accentLights!==false,showFps:p.showFps!==false,portraitExplore:readPortraitPreference(p.portraitExplore),showSceneDiagnostics:p.showSceneDiagnostics===true}}catch{return defaults}}
type RoomSelections=Record<EditableRoomId,Record<EditableSurface,string|null>>
type TouchPoint={side:'left'|'right';x:number;y:number;startX:number;startY:number;dragged:boolean;hadMulti:boolean}
const selectionDefaults:RoomSelections={foyer:{floor:null,walls:null},'great-room':{floor:null,walls:null}}
function readSelections():RoomSelections{try{const raw=JSON.parse(localStorage.getItem('ocean-estate-room-materials-v1')||'{}');return {foyer:{...selectionDefaults.foyer,...raw.foyer},'great-room':{...selectionDefaults['great-room'],...raw['great-room']}}}catch{return selectionDefaults}}
const roomName=(room:EditableRoomId)=>room==='foyer'?'Grand foyer':'Great room'
const tourStorageKey='ocean-estate-tour-views-v1'
// Viewpoints persist in this browser; account-wide sync is not yet configured.
function readTourViews():EstateTourViews{
  try{
    const raw:unknown=JSON.parse(localStorage.getItem(tourStorageKey)||'{}')
    if(!raw||typeof raw!=='object'||Array.isArray(raw))return {}
    const views:EstateTourViews={}
    for(const [name,item] of Object.entries(raw)){
      if(!destinations.some(d=>d.name===name)||!item||typeof item!=='object')continue
      const v=item as Partial<EstateTourView>
      if([v.x,v.z,v.yaw,v.pitch].every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<10000)&&Math.abs(v.pitch!)<=1.05)
        views[name]={x:v.x!,z:v.z!,yaw:v.yaw!,pitch:v.pitch!}
    }
    return {...canonicalTourViews,...views}
  }catch{return {...canonicalTourViews}}
}
const axis=(n:number)=>Math.abs(n)<.12?0:Math.max(-1,Math.min(1,n))
export function OceanEstate({onBack,onPlan}:{onBack:()=>void;onPlan:()=>void}){
  const canvas=useRef<HTMLCanvasElement>(null),engine=useRef<Awaited<ReturnType<typeof createEstate>>|null>(null),audio=useRef<ReturnType<typeof estateAudio>|null>(null),dialog=useRef<HTMLDialogElement>(null)
  const input=useRef<EstateInput>({yaw:spawn.yaw,pitch:-.025,x:0,z:0,paused:true,speed:BASE_WALK_SPEED,quality:1,lighting:'golden',lookedAt:0,looking:false,fast:false,maxTurnSpeed:28*Math.PI/180,resolutionCeiling:defaults.resolutionCeiling,adaptiveResolution:defaults.adaptiveResolution,shadows:defaults.shadows,accentLights:defaults.accentLights,showDiagnostics:defaults.showSceneDiagnostics})
  const pointer=useRef<{id:number;x:number;y:number;startX:number;startY:number;dragged:boolean}|null>(null),keys=useRef(new Set<string>())
  const touchPointers=useRef(new Map<number,TouchPoint>())
  const lastRightTap=useRef<{time:number;x:number;y:number}|null>(null)
  const artPointers=useRef(new Map<number,{x:number;y:number}>()),pinchDistance=useRef<number|null>(null),artOpen=useRef(false),artClosingRef=useRef(false)
  const [prefs,setPrefs]=useState(readPrefs),[ready,setReady]=useState(false),[progress,setProgress]=useState('Opening Ocean Estate…'),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),[started,setStarted]=useState(false),[paused,setPaused]=useState(false),[sound,setSound]=useState(false),[notice,setNotice]=useState(''),[help,setHelp]=useState(true),[showLocation,setShowLocation]=useState(true)
  const [state,setState]=useState<EstateState>({location:'Arrival steps',position:spawn,moving:false,destination:'',fps:0,touring:false})
  const [diagnosticCaptures,setDiagnosticCaptures]=useState<EstateDiagnosticSnapshot[]>([])
  const [art,setArt]=useState<EstateArtChoice|null>(null),[artInfo,setArtInfo]=useState(false),[artZoom,setArtZoom]=useState(1),[artClosing,setArtClosing]=useState(false)
  const [editMode,setEditMode]=useState(false),[editTour,setEditTour]=useState(()=>{try{return localStorage.getItem('ocean-estate-edit-tour-v1')==='on'}catch{return false}}),[editTarget,setEditTarget]=useState<string|null>(null),[tourViews,setTourViews]=useState(readTourViews),[selections,setSelections]=useState<RoomSelections>(readSelections),[picker,setPicker]=useState<{room:EditableRoomId;surface:EditableSurface;original:string|null;current:string|null}|null>(null)
  const [materialCatalog,setMaterialCatalog]=useState(estateEditorMaterials)
  const [remoteEnabled,setRemoteEnabled]=useState(false)
  const [markers,setMarkers]=useState<Record<EditableSurface,{x:number;y:number;visible:boolean}>>({floor:{x:0,y:0,visible:false},walls:{x:0,y:0,visible:false}})
  function captureSceneSample(){
    const metrics=state.sceneDiagnostics
    if(!metrics){setNotice('Walk or look around to collect a render sample.');return}
    const sample:EstateDiagnosticSnapshot={
      ...metrics,at:new Date().toISOString(),location:state.location,
      x:state.position.x,z:state.position.z,fps:state.fps,
      renderScale:state.renderScale??prefs.resolutionCeiling,
    }
    setDiagnosticCaptures(previous=>[...previous.slice(-11),sample])
    setNotice('Scene sample captured: '+state.location)
  }
  function copySceneReport(){
    const report=formatEstateDiagnosticsReport(diagnosticCaptures)
    if(!navigator.clipboard?.writeText){setNotice('Copy not supported in this browser.');return}
    void navigator.clipboard.writeText(report).then(
      ()=>setNotice('Scene diagnostics copied.'),
      ()=>setNotice('Copy failed; try a secure browser tab.'),
    )
  }
  const clearTouch=()=>{touchPointers.current.clear();input.current.x=0;input.current.z=0;input.current.looking=false}
  const stop=()=>{input.current.x=0;input.current.z=0;input.current.fast=false;keys.current.clear();pointer.current=null;clearTouch();engine.current?.stop()}
  const activeRoom:EditableRoomId|null=state.location==='Grand foyer'?'foyer':state.location==='Great room'?'great-room':null
  const updateTouchMovement=()=>{const touches=[...touchPointers.current.values()],left=touches.find(t=>t.side==='left'),right=touches.find(t=>t.side==='right');if(!left){input.current.x=0;input.current.z=0;return}input.current.z=axis((left.y-left.startY)/72);input.current.x=right?axis((left.x-left.startX)/72):0}
  function handleWorldTap(x:number,y:number){if(input.current.paused)return;if(editMode){if(picker){if(prefs.mode==='explore'){const picked=engine.current?.pick(x,y);if(picked?.kind==='floor')setHelp(false)}}else{const hit=engine.current?.pickEditSurface(x,y);if(hit){openPicker(hit.room,hit.surface);setHelp(false)}else setNotice('Tap a floor or wall in the Grand foyer or Great room.')}}else if(prefs.mode==='explore'){const picked=engine.current?.pick(x,y);if(!picked)setNotice('Tap a clear spot on the floor or a painting.');else if(picked.kind==='art')enterArt(picked.art);else setHelp(false)}}
  useEffect(()=>{const controller=new AbortController();void loadEstateMaterialCatalog(controller.signal).then(setMaterialCatalog).catch(()=>{});return()=>controller.abort()},[])
  useEffect(()=>{const controller=new AbortController();setReady(false);setError('');void createEstate(canvas.current!,input.current,controller.signal,setState,setProgress,tourViews).then(e=>{if(controller.signal.aborted)e.dispose();else{engine.current=e;e.registerRoomMaterials(materialCatalog);for(const room of ['foyer','great-room'] as EditableRoomId[])for(const surface of ['floor','walls'] as EditableSurface[])e.setRoomMaterial(room,surface,selections[room][surface]);setReady(true)}}).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'This device could not open the estate.')});return()=>{controller.abort();engine.current?.dispose();engine.current=null}},[attempt])
  useEffect(()=>{const e=engine.current;if(!e)return;e.registerRoomMaterials(materialCatalog);for(const room of ['foyer','great-room'] as EditableRoomId[])for(const surface of ['floor','walls'] as EditableSurface[])e.setRoomMaterial(room,surface,selections[room][surface])},[materialCatalog])
  useEffect(()=>()=>audio.current?.dispose(),[])
  useEffect(()=>{Object.assign(input.current,{speed:prefs.speed,maxTurnSpeed:prefs.turnSpeed*Math.PI/180,quality:prefs.quality,lighting:prefs.lighting,resolutionCeiling:prefs.resolutionCeiling,adaptiveResolution:prefs.adaptiveResolution,shadows:prefs.shadows,accentLights:prefs.accentLights,showDiagnostics:prefs.showSceneDiagnostics});audio.current?.volume(prefs.volume);try{localStorage.setItem('ocean-estate-v1',JSON.stringify(prefs))}catch{/* In-memory preferences still work. */}},[prefs])
  useEffect(()=>{const pause=()=>{if(artOpen.current)void exitArt();stop();input.current.paused=true;audio.current?.pause();setPaused(true)};const visibility=()=>{if(document.hidden)pause()}
    const key=(e:KeyboardEvent)=>{const k=e.key.toLowerCase();if(e.type==='keyup')keys.current.delete(k);if(input.current.paused)return;if(e.target instanceof HTMLElement&&['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return
      if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','escape','shift'].includes(k))e.preventDefault();else return
      if(k==='escape'){if(e.type==='keydown'){if(artOpen.current)void exitArt();else pause()}return}if(artOpen.current)return;if(e.type==='keydown')keys.current.add(k)
      input.current.x=Number(keys.current.has('d')||keys.current.has('arrowright'))-Number(keys.current.has('a')||keys.current.has('arrowleft'));input.current.z=Number(keys.current.has('s')||keys.current.has('arrowdown'))-Number(keys.current.has('w')||keys.current.has('arrowup'));input.current.fast=keys.current.has('shift')
    };window.addEventListener('keydown',key);window.addEventListener('keyup',key);window.addEventListener('blur',pause);document.addEventListener('visibilitychange',visibility)
    const lost=(e:Event)=>{e.preventDefault();pause();setReady(false);setError('The graphics connection paused. Reopen the estate to continue.')} ;canvas.current?.addEventListener('webglcontextlost',lost)
    return()=>{window.removeEventListener('keydown',key);window.removeEventListener('keyup',key);window.removeEventListener('blur',pause);document.removeEventListener('visibilitychange',visibility);canvas.current?.removeEventListener('webglcontextlost',lost)}
  },[])
  useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(''),2400);return()=>clearTimeout(t)},[notice])
  useEffect(()=>{if(!started||art)return;setShowLocation(true);const t=setTimeout(()=>setShowLocation(false),1800);return()=>clearTimeout(t)},[state.location,started,art])
  useEffect(()=>{if(!editMode||!activeRoom||!started||paused||picker||art){setMarkers({floor:{x:0,y:0,visible:false},walls:{x:0,y:0,visible:false}});return}
    const update=()=>{const e=engine.current;if(!e)return;setMarkers({floor:e.projectEditMarker(activeRoom,'floor'),walls:e.projectEditMarker(activeRoom,'walls')})};update();const t=window.setInterval(update,80);return()=>window.clearInterval(t)
  },[editMode,activeRoom,started,paused,picker,art])
  async function beginSound(){try{if(!audio.current)audio.current=estateAudio();audio.current.volume(prefs.volume);await audio.current.play()}catch{setSound(false);setNotice('Sound could not start. You can keep exploring.')}}
  function begin(){stop();input.current.paused=false;setStarted(true);setPaused(false);if(sound)void beginSound()}
  function openSettings(){stop();input.current.paused=true;audio.current?.pause();dialog.current?.showModal()}
  function goFromMenu(d:(typeof destinations)[number]){
    if(engine.current?.go(d,d.name)){
      setEditTarget(editTour?d.name:null);dialog.current?.close();setHelp(false)
    }else setNotice('That route is unavailable from here.')
  }
  function tourFromMenu(){
    if(editTour){
      const first=destinations[1]
      if(!engine.current?.go(first,first.name)){setNotice('That tour stop is unavailable from here.');return}
      setEditTarget(first.name)
    }else{setEditTarget(null);engine.current?.tour()}
    dialog.current?.close();setHelp(false)
  }
  function nextTourStop(){
    if(!editTarget)return
    const index=destinations.findIndex(d=>d.name===editTarget),next=destinations[(index+1)%destinations.length]
    if(engine.current?.go(next,next.name)){setEditTarget(next.name);setHelp(false)}
    else setNotice('The next stop is unavailable from here.')
  }
  function saveTourView(){
    if(!editTarget)return
    if(state.moving||state.destination){setNotice('Stop moving before saving this view.');return}
    const view=engine.current?.getTourViewpoint()
    if(!view||!engine.current?.walkable(view)){setNotice('Stand in a clear place before saving.');return}
    const updated={...tourViews,[editTarget]:view}
    setTourViews(updated);engine.current?.setTourViews(updated)
    try{localStorage.setItem(tourStorageKey,JSON.stringify(updated));setNotice(editTarget+' tour view saved on this device.')}
    catch{setNotice('Saved for this session; device storage is unavailable.')}
  }
  function exportTourViews(){
    const saved=readTourViews()
    if(!Object.keys(saved).length){setNotice('No saved tour viewpoints found in this browser.');return}
    const json=JSON.stringify({format:'ocean-estate-tour-views',version:1,viewpoints:saved},null,2)
    const file=new Blob([json],{type:'application/json'})
    const url=URL.createObjectURL(file)
    const link=document.createElement('a')
    link.href=url;link.download='ocean-estate-tour-views.json';document.body.appendChild(link);link.click();link.remove()
    setTimeout(()=>URL.revokeObjectURL(url),1000)
    setNotice(Object.keys(saved).length+' tour viewpoints exported. Keep this file for the shared defaults.')
  }
  function resetTourView(){
    if(!editTarget)return
    const updated={...tourViews};if(canonicalTourViews[editTarget])updated[editTarget]=canonicalTourViews[editTarget];else delete updated[editTarget]
    setTourViews(updated);engine.current?.setTourViews(updated)
    try{localStorage.setItem(tourStorageKey,JSON.stringify(updated));setNotice(editTarget+' restored to the shared tour viewpoint.')}
    catch{setNotice('Original view restored for this session.')}
  }
  function toggleEditTour(enabled:boolean){
    setEditTour(enabled);if(!enabled)setEditTarget(null)
    try{localStorage.setItem('ocean-estate-edit-tour-v1',enabled?'on':'off')}catch{/* Session still works. */}
  }
  function openPlan(){
    try{localStorage.setItem('ocean-estate-plan-last-view-v1',JSON.stringify({x:state.position.x,z:state.position.z,yaw:input.current.yaw,at:Date.now()}))}catch{/* Planner still opens without persisted view context. */}
    dialog.current?.close();stop();onPlan()
  }
  function closeSettings(){if(started&&!paused&&!picker&&!artOpen.current){input.current.paused=false;if(sound)void beginSound()}}
  function back(){stop();input.current.paused=true;audio.current?.pause();onBack()}
  function openPicker(room:EditableRoomId,surface:EditableSurface){stop();input.current.paused=false;engine.current?.setEditSelection(room,surface);setPicker({room,surface,original:selections[room][surface],current:selections[room][surface]})}
  function previewMaterial(id:string|null){if(!picker)return;engine.current?.setRoomMaterial(picker.room,picker.surface,id);setPicker({...picker,current:id})}
  function finishPicker(keep:boolean){if(!picker)return;const value=keep?picker.current:picker.original;engine.current?.setRoomMaterial(picker.room,picker.surface,value);engine.current?.setEditSelection(null,null);if(keep){const next={...selections,[picker.room]:{...selections[picker.room],[picker.surface]:value}} as RoomSelections;setSelections(next);try{localStorage.setItem('ocean-estate-room-materials-v1',JSON.stringify(next))}catch{/* Keep in memory. */};setNotice(`${roomName(picker.room)} ${picker.surface==='floor'?'floor':'walls'} saved.`)}setPicker(null);if(started&&!paused)input.current.paused=false}
  function enterArt(next:EstateArtChoice){artOpen.current=true;artClosingRef.current=false;artPointers.current.clear();pinchDistance.current=null;clearTouch();setArt(next);setArtInfo(false);setArtZoom(1);setArtClosing(false);setHelp(false)}
  async function exitArt(){
    if(!artOpen.current||artClosingRef.current)return
    artClosingRef.current=true;setArtClosing(true);artPointers.current.clear();pinchDistance.current=null
    try{await engine.current?.closeArt()}finally{artOpen.current=false;artClosingRef.current=false;setArt(null);setArtInfo(false);setArtZoom(1);setArtClosing(false);setHelp(false)}
  }
  function artPointerDown(e:React.PointerEvent<HTMLDivElement>){if((e.target as HTMLElement).closest('button,a,.oe-art-info-card'))return;e.currentTarget.setPointerCapture(e.pointerId);artPointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});if(artPointers.current.size===2){const [a,b]=[...artPointers.current.values()];pinchDistance.current=Math.hypot(a.x-b.x,a.y-b.y)}}
  function artPointerMove(e:React.PointerEvent<HTMLDivElement>){const old=artPointers.current.get(e.pointerId);if(!old)return;const dx=e.clientX-old.x,dy=e.clientY-old.y;artPointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});if(artPointers.current.size>=2){const [a,b]=[...artPointers.current.values()],distance=Math.hypot(a.x-b.x,a.y-b.y);if(pinchDistance.current&&distance>0){const zoom=engine.current?.zoomArt(distance/pinchDistance.current);if(typeof zoom==='number')setArtZoom(zoom)}pinchDistance.current=distance}else{engine.current?.panArt(dx,dy)}}
  function artPointerEnd(e:React.PointerEvent<HTMLDivElement>){artPointers.current.delete(e.pointerId);if(artPointers.current.size<2)pinchDistance.current=null}
  function resetArt(){const zoom=engine.current?.resetArtView();setArtZoom(typeof zoom==='number'?zoom:1)}
  function worldPointerDown(e:React.PointerEvent<HTMLCanvasElement>){if(input.current.paused||artOpen.current)return;e.currentTarget.setPointerCapture(e.pointerId);if(e.pointerType==='touch'){const rect=e.currentTarget.getBoundingClientRect(),side=e.clientX<rect.left+rect.width/2?'left':'right';if(side==='left')engine.current?.stop();if(side==='right'){input.current.looking=true;input.current.lookedAt=performance.now()}touchPointers.current.set(e.pointerId,{side,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,dragged:false,hadMulti:false});if(touchPointers.current.size>1)for(const t of touchPointers.current.values())t.hadMulti=true;updateTouchMovement();return}if(pointer.current)return;pointer.current={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,dragged:false};input.current.looking=true;if(prefs.mode==='walk'&&e.clientY>innerHeight*.58)input.current.z=-1}
  function worldPointerMove(e:React.PointerEvent<HTMLCanvasElement>){if(input.current.paused||artOpen.current)return;if(e.pointerType==='touch'){const t=touchPointers.current.get(e.pointerId);if(!t)return;const dx=e.clientX-t.x,dy=e.clientY-t.y;if(Math.hypot(e.clientX-t.startX,e.clientY-t.startY)>8)t.dragged=true;t.x=e.clientX;t.y=e.clientY;const hasRight=[...touchPointers.current.values()].some(p=>p.side==='right');if(t.dragged&&(t.side==='right'||(t.side==='left'&&!hasRight))){input.current.yaw-=dx*.003*prefs.sensitivity;if(t.side==='right')input.current.pitch=Math.max(-1.05,Math.min(.95,input.current.pitch-dy*.003*prefs.sensitivity));input.current.lookedAt=performance.now();setHelp(false)}updateTouchMovement();return}const p=pointer.current;if(!p||p.id!==e.pointerId)return;const dx=e.clientX-p.x,dy=e.clientY-p.y;if(Math.hypot(e.clientX-p.startX,e.clientY-p.startY)>8)p.dragged=true;if(p.dragged){input.current.yaw-=dx*.003*prefs.sensitivity;input.current.pitch=Math.max(-1.05,Math.min(.95,input.current.pitch-dy*.003*prefs.sensitivity));input.current.lookedAt=performance.now();setHelp(false)}p.x=e.clientX;p.y=e.clientY}
  function worldPointerEnd(e:React.PointerEvent<HTMLCanvasElement>,allowTap=true){if(e.pointerType==='touch'){const t=touchPointers.current.get(e.pointerId);if(!t)return;touchPointers.current.delete(e.pointerId);if(t.side==='right'){input.current.looking=false;input.current.lookedAt=performance.now()}updateTouchMovement();if(allowTap&&!t.dragged&&!t.hadMulti&&touchPointers.current.size===0){
      if(t.side==='right'&&(state.moving||state.touring)){
        const last=lastRightTap.current,now=performance.now()
        if(last&&now-last.time<330&&Math.hypot(last.x-e.clientX,last.y-e.clientY)<45){
          input.current.lookedAt=0;lastRightTap.current=null;return
        }
        lastRightTap.current={time:now,x:e.clientX,y:e.clientY}
      }else handleWorldTap(e.clientX,e.clientY)
    }return}const p=pointer.current;if(!p||p.id!==e.pointerId)return;if(allowTap&&!p.dragged)handleWorldTap(e.clientX,e.clientY);pointer.current=null;input.current.looking=false;input.current.lookedAt=performance.now();input.current.z=0}
  const remote = useEstateTvRemote(remoteEnabled, packet => {
    if (packet.kind === 'move') {
      if (input.current.paused || artOpen.current) { input.current.x = 0; input.current.z = 0; return }
      if ((packet.x || packet.z) && !input.current.x && !input.current.z) { engine.current?.stop(); setHelp(false) }
      input.current.x = packet.x; input.current.z = packet.z
    } else if (packet.kind === 'look') {
      if (input.current.paused || artOpen.current) return
      input.current.yaw -= packet.dx * .003 * prefs.sensitivity
      input.current.pitch = Math.max(-1.05, Math.min(.95, input.current.pitch - packet.dy * .003 * prefs.sensitivity))
      input.current.lookedAt = performance.now(); setHelp(false)
    } else if (packet.kind === 'destination') {
      const target = findRemoteDestination(destinations, packet.name)
      if (!target || !engine.current) return
      if (artOpen.current) { setNotice('Close artwork before choosing a destination.'); return }
      dialog.current?.close()
      if (!started || paused) begin()
      else { input.current.paused = false; stop() }
      if (engine.current.go(target, target.name)) { setHelp(false); setNotice('Heading to ' + target.name) }
      else setNotice('That route is unavailable from here.')
    } else if (packet.kind === 'action') {
      if (packet.action === 'start') { dialog.current?.close(); if (!started || paused) begin() }
      if (packet.action === 'menu') { if (dialog.current?.open) dialog.current.close(); else openSettings() }
      if (packet.action === 'select' && !dialog.current?.open && !artOpen.current) handleWorldTap(innerWidth / 2, innerHeight / 2)
      if (packet.action === 'back') {
        if (dialog.current?.open) dialog.current.close()
        else if (artOpen.current) void exitArt()
        else { stop(); input.current.paused = true; setPaused(true) }
      }
    }
  })
  return <main className="oe-root" aria-label="Ocean Estate" data-portrait-explore={prefs.portraitExplore?"on":"off"} data-player-x={state.position.x.toFixed(3)} data-player-z={state.position.z.toFixed(3)} data-camera-yaw={input.current.yaw.toFixed(3)} data-touch-help={help?'on':'off'}>
    <canvas ref={canvas} className="oe-canvas" aria-label="Explorable oceanfront estate" onContextMenu={e=>e.preventDefault()}
      onPointerDown={worldPointerDown}
      onPointerMove={worldPointerMove}
      onPointerUp={e=>worldPointerEnd(e)}
      onPointerCancel={e=>worldPointerEnd(e,false)}
      onLostPointerCapture={e=>worldPointerEnd(e,false)}/>
    {!prefs.portraitExplore&&<section className="oe-portrait-gate" aria-label="Portrait exploration choice">
      <div><span className="oe-portrait-eyebrow">OCEAN ESTATE · PREVIEW</span>
        <h2>Explore your way.</h2>
        <p>Turn sideways for the original wide view, or try walking through the house with your phone upright.</p>
        <button type="button" onClick={()=>setPrefs(p=>({...p,portraitExplore:true}))}>Explore in portrait</button>
        <small>You can change this later in Estate Settings.</small>
      </div>
    </section>}
    <header className="oe-header"><button className="oe-back" onClick={back} aria-label="Back to The Lab">←</button><div className="oe-wordmark">{!started||paused?'OCEAN ESTATE':''}</div><button className="oe-icon" aria-label="Estate menu" onClick={openSettings}>☷</button></header>
    {started&&!error&&!art&&prefs.showFps&&<aside className="oe-performance-hud" aria-label="Frame rate and render resolution"><strong>{state.fps} FPS</strong><span>{Math.round((state.renderScale??prefs.resolutionCeiling)*100)}% render</span></aside>}
    {started&&!error&&!art&&prefs.showSceneDiagnostics&&<details className="oe-scene-diagnostics" open>
      <summary>Scene diagnostics · {state.location}</summary>
      {state.sceneDiagnostics?<>
        <div className="oe-diagnostics-stats">
          <span>Rendered FPS</span><strong>{state.fps}</strong>
          <span>Draw calls</span><strong>{state.sceneDiagnostics.calls.toLocaleString()}</strong>
          <span>Drawn triangles</span><strong>{state.sceneDiagnostics.triangles.toLocaleString()}</strong>
          <span>Frustum mesh batches</span><strong>{state.sceneDiagnostics.frustumCandidates} / {state.sceneDiagnostics.sceneMeshes}</strong>
          <span>Loaded geometries</span><strong>{state.sceneDiagnostics.geometries}</strong>
          <span>Loaded textures</span><strong>{state.sceneDiagnostics.textures}</strong>
          <span>Pixel ratio</span><strong>{state.sceneDiagnostics.pixelRatio.toFixed(2)}</strong>
        </div>
        <p>Frustum counts estimate camera visibility, not what walls block. Draw calls and triangles are renderer counts; geometries and textures are loaded, not all drawn.</p>
        <div className="oe-diagnostics-actions">
          <button type="button" onClick={captureSceneSample}>Capture</button>
          <button type="button" disabled={!diagnosticCaptures.length} onClick={copySceneReport}>Copy report ({diagnosticCaptures.length})</button>
          <button type="button" disabled={!diagnosticCaptures.length} onClick={()=>setDiagnosticCaptures([])}>Clear</button>
        </div>
        {diagnosticCaptures.length>0&&<ol className="oe-diagnostics-samples">{diagnosticCaptures.map((entry,i)=>
          <li key={entry.at+i}>{entry.location}: {entry.calls} calls · {entry.triangles.toLocaleString()} triangles</li>
        )}</ol>}
      </>:<p>Walk or look around to collect your first sample.</p>}
    </details>}
    {started&&!error&&!art&&<>
      <div className={`oe-location oe-location-fade${showLocation?' visible':''}`}><h1>{state.location}</h1></div>
      {editMode&&<div className="oe-edit-badge"><span>EDIT MODE</span>{activeRoom?<strong>{roomName(activeRoom)} · tap a floor or wall</strong>:<strong>Walk into the foyer or great room</strong>}</div>}
      {editMode&&activeRoom&&!picker&&(['floor','walls'] as EditableSurface[]).map(surface=>{const p=markers[surface];return p.visible?<button key={surface} className={`oe-surface-marker oe-surface-${surface}`} style={{left:p.x,top:p.y}} onClick={()=>openPicker(activeRoom,surface)} aria-label={`Edit ${surface}`}><span>⚙</span><strong>{surface==='floor'?'Floor':'Walls'}</strong></button>:null})}
      {(state.touring||Boolean(state.destination))&&<button className="oe-stop" onClick={stop}>Stop {state.destination?`· ${state.destination}`:''}</button>}
      {editTour&&editTarget&&!picker&&!state.moving&&!state.destination&&<aside className="oe-tour-editor" aria-label={`Edit tour viewpoint for ${editTarget}`}>
        <strong className="oe-tour-target" title={`Tour stop: ${editTarget}`}>{editTarget}</strong>
        <div className="oe-tour-editor-actions">
          <button type="button" className="oe-tour-save" onClick={saveTourView} aria-label={`Save viewpoint for ${editTarget}`} title="Save this position and camera view">Save</button>
          <button type="button" onClick={nextTourStop} aria-label="Next tour stop" title="Next tour stop">Next ›</button>
          {tourViews[editTarget]&&<button type="button" onClick={resetTourView} aria-label="Reset tour viewpoint" title="Restore original viewpoint">↺</button>}
        </div>
      </aside>}
    </>}
    {picker&&<section className="oe-material-picker" aria-label={`${roomName(picker.room)} ${picker.surface} materials`}>
      <header><div><span>{roomName(picker.room)}</span><h2>{picker.surface==='floor'?'Floor material':'Main wall material'}</h2></div><button onClick={()=>finishPicker(false)} aria-label="Undo and close">×</button></header>
      <div className="oe-material-options">{materialCatalog.map(m=><button key={m.id} className={picker.current===m.id?'selected':''} onClick={()=>previewMaterial(m.id)}><i style={{backgroundImage:`url(${estateEditorPreview(m)})`}}/><span><strong>{m.label}</strong><small>{m.category?`${m.category} · ${m.use}`:m.use}</small></span>{picker.current===m.id&&<b>✓</b>}</button>)}</div>
      <div className="oe-picker-actions"><button onClick={()=>previewMaterial(null)}>Original finish</button><button onClick={()=>finishPicker(false)}>Undo</button><button className="keep" onClick={()=>finishPicker(true)}>Keep this finish</button></div>
    </section>}
    {art&&<div className={`oe-art-view ${artClosing?'closing':''}`} aria-label={`Examining ${art.title} by ${art.artist}`} onPointerDown={artPointerDown} onPointerMove={artPointerMove} onPointerUp={artPointerEnd} onPointerCancel={artPointerEnd} onWheel={e=>{e.preventDefault();const zoom=engine.current?.zoomArt(Math.exp(-e.deltaY*.0015));if(typeof zoom==='number')setArtZoom(zoom)}} onDoubleClick={resetArt}>
      <div className="oe-art-chrome oe-art-top"><button className="oe-art-round" aria-label="About this artwork" onClick={()=>setArtInfo(v=>!v)}>ⓘ</button><div className="oe-art-heading"><small>{art.artist} · {art.date}</small><strong>{art.title}</strong></div><button className="oe-art-round oe-art-x" aria-label="Return to the room" onClick={()=>void exitArt()}>×</button></div>
      <div className="oe-art-gesture">{artZoom>1.02?`${artZoom.toFixed(1)}× · drag to explore`:'Pinch or scroll to examine · double-tap to reset'}</div>
      {artZoom>1.02&&<button className="oe-art-reset" onClick={resetArt}>Reset {artZoom.toFixed(1)}×</button>}
      {artInfo&&<aside className="oe-art-info-card"><span>ON THE WALL</span><h2>{art.title}</h2><p><strong>{art.artist}</strong><br/>{art.date}</p><p>{art.museum}</p><a href={art.source} target="_blank" rel="noopener noreferrer">View museum record ↗</a></aside>}
    </div>}
    {notice&&<div className="oe-notice" role="status">{notice}</div>}
    {(!started||paused||error)&&<div className="oe-entry"><section><span className="oe-eyebrow">THE HORIZON RESIDENCE</span><h1>{started&&paused?'Stay a while.':<>A home.<br/>An ocean.<br/>All yours to explore.</>}</h1><p>{error||(started&&paused?'Your walk is paused.':'Warm stone, quiet gardens, and a view that never ends.')}</p>{error?<button className="oe-primary" onClick={()=>{setStarted(false);setPaused(false);setAttempt(n=>n+1)}}>Reopen estate ↗</button>:ready?<button className="oe-primary" onClick={begin}>{started?'Continue exploring':'Step inside'} <span>↗</span></button>:<div className="oe-loading" role="status"><i/>{progress}</div>}<div className="oe-entry-note">Left thumb moves. Right thumb looks. Tap the floor to walk.</div></section></div>}
    <dialog ref={dialog} className="oe-settings" onClose={closeSettings}><form method="dialog"><header><span>YOUR STAY</span><button aria-label="Close settings">×</button></header></form><h2>A little more comfortable.</h2>
      <section className="oe-portrait-setting" aria-label="Screen orientation">
        <h3>Screen orientation</h3>
        <label className="oe-portrait-switch"><span>Portrait exploration<small>Walk and look around with your phone upright, or rotate it sideways any time.</small></span>
          <input type="checkbox" checked={prefs.portraitExplore} onChange={e=>{const enabled=e.target.checked;setPrefs(p=>({...p,portraitExplore:enabled}));if(!enabled)dialog.current?.close()}}/>
        </label>
      </section>
      <section className="oe-remote-panel" aria-label="Phone remote pairing"><h3>Phone remote</h3>
        {!remoteEnabled ? <><p>Use your phone as a controller while Ocean Estate stays on the TV.</p><button type="button" className="oe-remote-toggle" onClick={()=>setRemoteEnabled(true)}>Connect Phone · Show QR code</button></> : <>
          <p className={remote.paired?'oe-remote-connected':''} role="status">{remote.status}</p>
          <EstateRemoteQR value={location.origin + '/estate-remote#' + remote.room}/>
          <p>Scan with your phone camera. On your phone, drag MOVE to walk and LOOK to turn. Use Menu to return to the estate.</p>
          <a href={location.origin + '/estate-remote#' + remote.room} target="_blank" rel="noopener noreferrer">Open phone controller link</a>
          <div className="oe-remote-actions"><button type="button" onClick={remote.rotate}>New pairing code</button><button type="button" onClick={()=>setRemoteEnabled(false)}>Disconnect phone</button></div>
        </>}
      </section>
      <section className="oe-menu-section"><h3>Go somewhere</h3><div className="oe-menu-places">{destinations.map((d,i)=><button type="button" className="oe-menu-place" key={d.name} onClick={()=>goFromMenu(d)}><span>{String(i+1).padStart(2,'0')}</span>{d.name}</button>)}</div><button type="button" className="oe-menu-tour" onClick={tourFromMenu}>{editTour?'Start editing tour stops':'Take a quiet tour'} <span>→</span></button><button type="button" className="oe-menu-tour" onClick={openPlan}>Open Estate Plan <span>→</span></button></section>
      <div className="oe-menu-sound"><span><strong>Ocean sound</strong><small>Ambient water and coast</small></span><button type="button" onClick={()=>{const next=!sound;setSound(next);if(!next)audio.current?.pause()}}>{sound?'On':'Off'}</button></div>
      <label>Tour editing<select aria-label="Tour editing" value={editTour?'on':'off'} onChange={e=>toggleEditTour(e.target.value==='on')}><option value="off">Off · enjoy the tour</option><option value="on">On · adjust and save tour stops</option></select></label>
      {<button type="button" className="oe-tour-export" onClick={exportTourViews}>SAVE YOUR TOUR FOR EVERYONE <span>↓ Export viewpoints</span></button>}
      {editTour&&<p className="oe-tour-storage-note">Choose a destination or start the tour. At each stop, move and look around, then tap Save viewpoint. Saved stops are remembered on this device.</p>}
      <label>Design editing<select aria-label="Design editing" value={editMode?'on':'off'} onChange={e=>{const on=e.target.value==='on';setEditMode(on);engine.current?.setEditSelection(null,null);setHelp(false)}}><option value="off">Off · just explore</option><option value="on">On · tap walls or floors</option></select></label>
      <label>Light<select aria-label="Light" value={prefs.lighting} onChange={e=>setPrefs(p=>({...p,lighting:e.target.value as LightPreset}))}><option value="daylight">Daylight</option><option value="golden">Golden hour</option><option value="evening">Evening</option></select></label>

      <label>Navigation<select aria-label="Navigation" value={prefs.mode} onChange={e=>setPrefs(p=>({...p,mode:e.target.value as Prefs['mode']}))}><option value="explore">Explore · tap to walk</option><option value="walk">Walk · hold to move</option></select></label>
      <label>Walking pace<output>{(prefs.speed/BASE_WALK_SPEED).toFixed(1)}× · {prefs.speed.toFixed(1)} m/s</output><input type="range" min="1" max={MAX_WALK_SPEED} step=".1" value={prefs.speed} onChange={e=>setPrefs(p=>({...p,speed:clampWalkingSpeed(+e.target.value)}))}/></label>
      <label>Guided turn speed<output>{Math.round(prefs.turnSpeed)}°/s maximum</output><input type="range" min="15" max="60" step="1" value={prefs.turnSpeed} onChange={e=>setPrefs(p=>({...p,turnSpeed:+e.target.value}))}/></label>
      <label>Look sensitivity<output>{prefs.sensitivity.toFixed(1)}×</output><input type="range" min=".3" max="2" step=".1" value={prefs.sensitivity} onChange={e=>setPrefs(p=>({...p,sensitivity:+e.target.value}))}/></label>
      <section className="oe-performance-menu" aria-label="Performance tuning">
        <h3>Performance</h3>
        <p>Keep the house fullscreen while drawing fewer pixels. Lower percentages usually improve smoothness.</p>
        <label className="oe-perf-switch"><span>Automatic resolution</span><input type="checkbox" checked={prefs.adaptiveResolution} onChange={e=>setPrefs(p=>({...p,adaptiveResolution:e.target.checked}))}/></label>
        <label>Render resolution ceiling <output>{Math.round(prefs.resolutionCeiling*100)}%</output>
          <input type="range" min=".5" max="1" step=".05" value={prefs.resolutionCeiling} onChange={e=>setPrefs(p=>({...p,resolutionCeiling:+e.target.value}))}/>
        </label>
        <small>{prefs.adaptiveResolution?'Auto may reduce below this ceiling to keep motion smooth.':'Manual: always use this percentage of the graphics preset.'}</small>
        <label className="oe-perf-switch"><span>Sun shadows</span><input type="checkbox" checked={prefs.shadows} onChange={e=>setPrefs(p=>({...p,shadows:e.target.checked}))}/></label>
        <label className="oe-perf-switch"><span>Interior accent lights</span><input type="checkbox" checked={prefs.accentLights} onChange={e=>setPrefs(p=>({...p,accentLights:e.target.checked}))}/></label>
        <label className="oe-perf-switch"><span>Show FPS overlay</span><input type="checkbox" checked={prefs.showFps} onChange={e=>setPrefs(p=>({...p,showFps:e.target.checked}))}/></label>
        <label className="oe-perf-switch"><span>Scene diagnostics (preview)</span><input type="checkbox" checked={prefs.showSceneDiagnostics} onChange={e=>setPrefs(p=>({...p,showSceneDiagnostics:e.target.checked}))}/></label>
        <small>Measure pool, spa, garage, and bedroom views. Tap Capture, then Copy report to compare.</small>
        <p className="oe-perf-readout">Recent rendering: <strong>{state.fps} FPS</strong> · actual resolution {Math.round((state.renderScale??prefs.resolutionCeiling)*100)}% of preset</p>
      </section>
      <label>Graphics<select aria-label="Graphics" value={prefs.quality} onChange={e=>setPrefs(p=>({...p,quality:+e.target.value}))}><option value={0}>Lighter</option><option value={1}>Balanced</option><option value={2}>Detailed</option></select></label>
      <label>Ocean volume<output>{Math.round(prefs.volume*100)}%</output><input type="range" min="0" max="1" step=".05" value={prefs.volume} onChange={e=>setPrefs(p=>({...p,volume:+e.target.value}))}/></label>
      <button className="oe-reset" onClick={()=>{engine.current?.reset();setEditTarget(null);dialog.current?.close()}}>Return to the entrance</button><form method="dialog"><button className="oe-primary">Back to exploring ↗</button></form>
    </dialog>
  </main>
}