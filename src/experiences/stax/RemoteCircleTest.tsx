import { useEffect, useReducer, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { FoamSlideAudio, safeFoamSoundId, normalizeFoamSoundTuning } from './foam-slide-audio'
import { initialRemoteBoard, reduceRemoteBoard, type RemoteGesture, type RemoteInput, type RemoteDirection, type RemoteKind } from './remote-gesture-model'
import { startTwoFinger, advanceTwoFinger, type TwoFingerSession } from './two-finger-intent'
import { scanSwipeSteps, scanStrideForSpeed, normalizeScanSpeed, SCAN_SPEED_KEY, DEFAULT_SCAN_SPEED } from './sequential-scan'
import './remote-circle-test.css'

type Ping = { type:'ping'|'pong';seq:number }
type DataMessage = RemoteInput|Ping
type Signal = { from:'host'|'pad';type:'hello'|'offer'|'answer'|'candidate'|'bye';data?:RTCSessionDescriptionInit|RTCIceCandidateInit }
type LinkState = 'connecting'|'direct'|'relay'|'offline'
const ROOM_FORMAT=/^[a-f0-9]{32}$/
const channelName=(room:string)=>'stax-circle-trackpad-'+room
function newRoom(){
 const bytes=new Uint8Array(16);crypto.getRandomValues(bytes)
 return [...bytes].map(b=>b.toString(16).padStart(2,'0')).join('')
}
type Contact={id:number;role:'surface'|'corner';corner?:'A'|'B';shift:boolean;startX:number;startY:number;x:number;y:number;moved:boolean;swipeFired:boolean;skinStep?:number;skinOriginX?:number;scanStep?:number;scanOriginX?:number;scanStarted?:boolean;thumbMode?:'skins'|'scan'|'add'|'view'}
const THRESHOLD=54
const urls:Record<RemoteKind,string>={
 circle:'/stax-foam/cleaned/circle.webp',triangle:'/stax-foam/cleaned/triangle.webp',
 rectangle:'/stax-foam/cleaned/rectangle.webp',oval:'/stax-foam/cleaned/oval.webp',
 square:'/stax-foam/cleaned/square.webp',diamond:'/stax-foam/cleaned/diamond.webp',
 hexagon:'/stax-foam/cleaned/hexagon.webp',
}
const verboseName:Record<RemoteKind,string>={circle:'Blue circle',triangle:'Red triangle',
 rectangle:'Purple rectangle',oval:'Green oval',square:'Pink square',
 diamond:'Yellow diamond',hexagon:'Orange hexagon'}

export function RemoteCircleTest({onExit,onHostInput}:{onExit:()=>void;onHostInput?:(input:RemoteInput)=>void}) {
 const query=new URLSearchParams(window.location.search)
 const mode=query.get('remote')==='pad'?'pad':'host'
 const [room]=useState(()=>mode==='host'?newRoom():query.get('room')||'')
 const valid=ROOM_FORMAT.test(room)
 const [link,setLink]=useState<LinkState>('connecting')
 const [peerReady,setPeerReady]=useState(false)
 const [boardState,boardDispatch]=useReducer(reduceRemoteBoard,undefined,initialRemoteBoard)
 const [rtt,setRtt]=useState<number|null>(null)
 const [pressed,setPressed]=useState(false)
 const [hand,setHand]=useState<'right'|'left'>(()=>{try{return localStorage.getItem('stax-remote-hand-v1')==='left'?'left':'right'}catch{return 'right'}})
 const [cornerMode,setCornerMode]=useState<'A'|'B'|'A-shift'|'B-shift'|null>(null)
 const [twoFingerMode,setTwoFingerMode]=useState<'pan'|'pinch'|null>(null)
 const [skinMode,setSkinMode]=useState(false)
 const [scanActive,setScanActive]=useState(false)
 const [scanMode,setScanMode]=useState<'directional'|'sequential'>(()=>{try{return localStorage.getItem('stax-remote-scan-mode-v1')==='sequential'?'sequential':'directional'}catch{return 'directional'}})
 const [scanSpeed,setScanSpeed]=useState(()=>{try{return normalizeScanSpeed(localStorage.getItem(SCAN_SPEED_KEY))}catch{return DEFAULT_SCAN_SPEED}})
 const [scanSettingsOpen,setScanSettingsOpen]=useState(false)
 const hostInputRef=useRef(onHostInput)
 hostInputRef.current=onHostInput
 const [landscape,setLandscape]=useState(()=>window.innerWidth>window.innerHeight)
 const foamSound=useRef<FoamSlideAudio|null>(null)
 const fullscreenRequest=useRef(false)
 const state=useRef({last:{x:0,y:0},dragging:false,seq:0,started:new Map<number,number>(),
  contacts:new Map<number,Contact>(),maxSurface:0,twoFinger:null as TwoFingerSession|null,
  skinScroll:null as {owner:number}|null,scanScroll:null as {owner:number}|null,tapTime:0,
  tapTimer:null as ReturnType<typeof setTimeout>|null})
 const sendData=useRef<(payload:DataMessage)=>void>(()=>{})
 const board=useRef<HTMLDivElement>(null)
 useEffect(()=>{try{localStorage.setItem('stax-remote-hand-v1',hand)}catch{/* optional */}},[hand])
 useEffect(()=>{try{localStorage.setItem('stax-remote-scan-mode-v1',scanMode)}catch{/* optional */}},[scanMode])
 useEffect(()=>{try{localStorage.setItem(SCAN_SPEED_KEY,String(scanSpeed))}catch{/* optional */}},[scanSpeed])
 useEffect(()=>{
  if(mode!=='pad')return
  const update=()=>setLandscape(window.innerWidth>window.innerHeight)
  const onFullscreenChange=()=>{fullscreenRequest.current=false}
  window.addEventListener('resize',update)
  window.addEventListener('orientationchange',update)
  document.addEventListener('fullscreenchange',onFullscreenChange)
  return ()=>{window.removeEventListener('resize',update);window.removeEventListener('orientationchange',update);document.removeEventListener('fullscreenchange',onFullscreenChange);if(state.current.tapTimer)clearTimeout(state.current.tapTimer);foamSound.current?.dispose();foamSound.current=null}
 },[mode])
 function sound(){
  if(!foamSound.current){
   const audio=new FoamSlideAudio()
   try{
    audio.setPreset(safeFoamSoundId(localStorage.getItem('stax-foam-slide-preset-v2')))
    audio.setTuning(normalizeFoamSoundTuning(JSON.parse(localStorage.getItem('stax-foam-synth-tuning-v1')||'null')))
   }catch{/* use safe plastic skitter default */}
   foamSound.current=audio
  }
  return foamSound.current
 }
 function enterFullscreenOnTouch(){
  // Must be invoked synchronously from a real pointer gesture; waiting for an
  // effect or a network response loses browser fullscreen user activation.
  if(document.fullscreenElement||fullscreenRequest.current)return
  const target=document.documentElement
  if(!target.requestFullscreen)return
  fullscreenRequest.current=true
  try{
   void target.requestFullscreen().then(()=>{
    // Orientation locking is optional. The user may already be in landscape;
    // failing to lock must never block the controller or its local audio.
    if(window.innerWidth>window.innerHeight)return
    const orientation=screen.orientation as ScreenOrientation&{lock?:(mode:'landscape')=>Promise<void>}
    if(orientation?.lock)void orientation.lock('landscape').catch(()=>{})
   }).catch(()=>{fullscreenRequest.current=false})
  }catch{fullscreenRequest.current=false}
 }
 const url=valid?`${window.location.origin}/stax-shape-lab?remote=pad&room=${room}`:''
 // The QR endpoint receives only a short-lived, random experimental room URL;
 // never send authentication credentials or student data through this room.
 const qr=valid?`https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=${encodeURIComponent(url)}`:''
 useEffect(()=>{
  if(!valid){setLink('offline');return}
  let live=true, joined=false, rtc:RTCPeerConnection|null=null, wire:RTCDataChannel|null=null
  let timer:ReturnType<typeof setInterval>|undefined
  let handshake=false
  const pending:RTCIceCandidateInit[]=[]
  const channel=supabase.channel(channelName(room),{config:{broadcast:{ack:false,self:false}}})
  function signal(type:Signal['type'],data?:Signal['data']){
   if(joined)void channel.send({type:'broadcast',event:'signal',payload:{from:mode,type,data} satisfies Signal})
  }
  function apply(data:DataMessage){
   if((data.type==='move'||data.type==='gesture'||data.type==='view')&&mode==='host'){
    if(hostInputRef.current)hostInputRef.current(data)
    else boardDispatch(data)
   }else if(data.type==='ping'&&mode==='host')sendData.current({type:'pong',seq:data.seq})
   else if(data.type==='pong'&&mode==='pad'){
    const before=state.current.started.get(data.seq)
    if(before!==undefined){setRtt(Math.round(performance.now()-before));state.current.started.delete(data.seq)}
   }
  }
  function deliver(data:DataMessage){
   if(wire?.readyState==='open'){wire.send(JSON.stringify(data));return}
   if(joined)void channel.send({type:'broadcast',event:'motion',payload:data})
  }
  sendData.current=deliver
  function acceptWire(dc:RTCDataChannel){
   wire=dc
   dc.onopen=()=>{if(live){setLink('direct');setPeerReady(true)}}
   dc.onclose=()=>{if(live){setLink('relay');setPeerReady(true)}}
   dc.onmessage=e=>{try{apply(JSON.parse(e.data) as DataMessage)}catch{/* malformed test packet */}}
  }
  function makePeer(){
   rtc?.close()
   rtc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]})
   const pc=rtc
   pc.onicecandidate=e=>{if(e.candidate)signal('candidate',e.candidate.toJSON())}
   pc.onconnectionstatechange=()=>{
    if(pc.connectionState==='failed'||pc.connectionState==='disconnected')setLink('relay')
   }
   if(mode==='pad')pc.ondatachannel=e=>acceptWire(e.channel)
   return pc
  }
  async function flush(pc:RTCPeerConnection){
   while(pending.length){const c=pending.shift()!;try{await pc.addIceCandidate(c)}catch{/* stale candidate */}}
  }
  async function process(message:Signal){
   if(!live||message.from===mode)return
   if(mode==='host'&&message.type==='hello'){
    if(handshake)return
    handshake=true;setLink('relay');setPeerReady(true)
    try{
     const pc=makePeer();acceptWire(pc.createDataChannel('trackpad',{ordered:true}))
     const offer=await pc.createOffer();await pc.setLocalDescription(offer)
     signal('offer',pc.localDescription?.toJSON())
    }catch{setLink('relay')}
   }
   if(mode==='pad'&&message.type==='offer'&&message.data){
    try{
     const pc=makePeer()
     await pc.setRemoteDescription(message.data as RTCSessionDescriptionInit)
     await flush(pc)
     const answer=await pc.createAnswer();await pc.setLocalDescription(answer)
     signal('answer',pc.localDescription?.toJSON())
     setPeerReady(true);setLink('relay')
    }catch{setLink('relay')}
   }
   if(mode==='host'&&message.type==='answer'&&message.data&&rtc){
    try{await rtc.setRemoteDescription(message.data as RTCSessionDescriptionInit);await flush(rtc)}catch{setLink('relay')}
   }
   if(message.type==='candidate'&&message.data){
    const candidate=message.data as RTCIceCandidateInit
    if(rtc?.remoteDescription){try{await rtc.addIceCandidate(candidate)}catch{/* stale candidate */}}
    else pending.push(candidate)
   }
   if(message.type==='bye'){setLink('offline');setPeerReady(false)}
  }
  channel.on('broadcast',{event:'signal'},e=>{void process(e.payload as Signal)})
   .on('broadcast',{event:'motion'},e=>{if(wire?.readyState!=='open')apply(e.payload as DataMessage)})
   .subscribe(status=>{
    if(!live)return
    if(status==='SUBSCRIBED'){
     joined=true;setLink('connecting')
     if(mode==='pad')signal('hello')
    }else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT')setLink('offline')
   })
  if(mode==='pad')timer=setInterval(()=>{
   if(joined&&!peerReady)signal('hello')
   if(joined){
    const seq=++state.current.seq
    state.current.started.set(seq,performance.now())
    if(state.current.started.size>12)state.current.started.delete(state.current.started.keys().next().value!)
    deliver({type:'ping',seq})
   }
  },900)
  return ()=>{live=false;signal('bye');if(timer)clearInterval(timer);wire?.close();rtc?.close();void supabase.removeChannel(channel);sendData.current=()=>{}}
 },[mode,room,valid])
 function pulse(pattern:number|number[]){
  try{(navigator as Navigator&{vibrate?:(p:number|number[])=>boolean}).vibrate?.(pattern)}catch{/* optional haptic */ }
 }
 function announce(label:string){
  // Browser-generated accessibility cue, independent of the network.
  try{
   if(!window.speechSynthesis||typeof SpeechSynthesisUtterance==='undefined')return
   window.speechSynthesis.cancel()
   const words=new SpeechSynthesisUtterance(label)
   words.rate=1.25;words.volume=.55
   window.speechSynthesis.speak(words)
  }catch{/* audible labels are best effort */}
 }
 function scanTick(count:number){
  if(!count)return
  pulse(count===1?10:Array.from({length:2*count-1},(_,i)=>i%2===0?10:15))
 }
 function send(action:RemoteGesture['action'],dir?:RemoteDirection){
  sendData.current({type:'gesture',action,dir,seq:++state.current.seq})
 }
 function surfaceContacts(){return [...state.current.contacts.values()].filter(p=>p.role==='surface')}
 function activeCorner(){
  const corners=[...state.current.contacts.values()].filter(p=>p.role==='corner')
  const p=corners.at(-1)
  return p?.corner?(p.corner+(p.shift?'-shift':'')) as 'A'|'B'|'A-shift'|'B-shift':null
 }
 function direction(dx:number,dy:number):RemoteDirection{
  return Math.abs(dx)>Math.abs(dy)?dx<0?'left':'right':dy<0?'up':'down'
 }
 function performSwipe(mode:'A'|'B'|'A-shift'|'B-shift'|null,dir:RemoteDirection){
  pulse(16)
  if(mode==='A-shift'){
   // A stays a free grab; A-Shift is a separate chord.
   if(dir==='left'){send('detach');pulse([20,30,25]);announce('Detach selected branch')}
   else if(dir==='right')send('undo')
   else if(dir==='down'){send('delete_arm');pulse([18,40,30]);announce('Delete branch? Tap to confirm')}
   else {send('delete_cancel');announce('Cancel deletion')}
   }else if(mode==='B'){
   // Only the focused grammar atom decides how a swipe modifies the molecule.
   send('modify',dir)
  }else if(mode==='B-shift'){
   if(dir==='up')send('fit')
   else if(dir==='down')send('center')
   else if(dir==='left')send('zoom_out')
   else send('zoom_in')
  }else if(mode===null)send(scanMode==='sequential'?'navigate_seq':'navigate',dir)
 }
 function pointerDown(e:ReactPointerEvent<HTMLDivElement>){
  if(!valid)return
  e.preventDefault()
  if(mode==='pad'){
   if(window.innerWidth>window.innerHeight)enterFullscreenOnTouch()
  }
  try{e.currentTarget.setPointerCapture(e.pointerId)}catch{/* browser may cancel touch capture */}
  const zone=(e.target as HTMLElement).closest('[data-zone]')?.getAttribute('data-zone')
  const corner=zone==='A'||zone==='B'?zone:undefined
  state.current.contacts.set(e.pointerId,{id:e.pointerId,role:corner?'corner':'surface',corner,
   shift:false,startX:e.clientX,startY:e.clientY,x:e.clientX,y:e.clientY,moved:false,swipeFired:false})
  if(corner){setCornerMode(corner);pulse(11);return}
  const surfaces=surfaceContacts()
  if(state.current.scanScroll){const surface=surfaces.at(-1)!
   surface.scanOriginX=surface.x;surface.scanStep=0;surface.swipeFired=true}
  state.current.maxSurface=Math.max(state.current.maxSurface,surfaces.length)
  setPressed(true)
  if(surfaces.length===1&&activeCorner()==='A'){
   state.current.dragging=true
   state.current.last={x:e.clientX,y:e.clientY}
   send('move_start')
   sound().start(e.clientX,e.clientY)
  }else if(surfaces.length===2){
   if(state.current.dragging){send('move_end');foamSound.current?.stop();state.current.dragging=false}
   state.current.twoFinger=startTwoFinger(surfaces[0],surfaces[1])
   setTwoFingerMode(null)
  }else if(surfaces.length>=3){
   // Reserved for future program-level commands; no camera or skins.
   state.current.twoFinger=null;setTwoFingerMode(null)
  }
 }
 function pointerMove(e:ReactPointerEvent<HTMLDivElement>){
  const contact=state.current.contacts.get(e.pointerId)
  if(!contact)return
  e.preventDefault()
  const dx=e.clientX-contact.x,dy=e.clientY-contact.y
  contact.x=e.clientX;contact.y=e.clientY
  if(Math.hypot(contact.x-contact.startX,contact.y-contact.startY)>9)contact.moved=true
  if(contact.role==='corner'){
   if(contact.corner==='B'){
    if(contact.thumbMode)return
    // Direction on the B thumb selects a temporary, mutually exclusive mode.
    // A separate surface finger does the actual work.
    const thumbX=contact.x-contact.startX,thumbY=contact.y-contact.startY
    const horizontal=Math.abs(thumbX)>Math.abs(thumbY)*1.2
    const vertical=Math.abs(thumbY)>Math.abs(thumbX)*1.2
    if(vertical&&thumbY<=-24){
     contact.thumbMode='skins';state.current.skinScroll={owner:contact.id}
     setSkinMode(true);pulse([14,24,14]);announce('Skins')
     for(const surface of surfaceContacts()){
      surface.skinOriginX=surface.x;surface.skinStep=0;surface.swipeFired=true
     }
    }else if(horizontal&&thumbX<=-24){
     contact.thumbMode='scan';state.current.scanScroll={owner:contact.id}
     setScanActive(true);pulse([10,22,10]);announce('Sequential scan')
     for(const surface of surfaceContacts()){
      surface.scanOriginX=surface.x;surface.scanStep=0;surface.swipeFired=true
     }
    }else if(vertical&&thumbY>=24){
     contact.thumbMode='add';pulse(16)
    }else if(horizontal&&thumbX>=24){
     contact.thumbMode='view';contact.shift=true
     setCornerMode('B-shift');pulse([15,25,26])
    }
    return
   }
   if(!contact.shift){
    const outward=hand==='right'?contact.startX-e.clientX:e.clientX-contact.startX
    if(outward>22){
     contact.shift=true
     const mode=activeCorner();setCornerMode(mode);pulse([15,25,26])
     if(state.current.dragging){send('move_end');state.current.dragging=false;foamSound.current?.stop()}
    }
   }
   return
  }
  const surfaces=surfaceContacts()
  const maximum=state.current.maxSurface
  // Three fingers intentionally do nothing; reserved for major navigation.
  if(maximum>=3)return
  if(state.current.skinScroll){
   // B stays held, but the OTHER finger controls the visual preset strip.
   const step=Math.trunc((contact.x-(contact.skinOriginX??contact.startX))/48)
   const delta=step-(contact.skinStep??0)
   if(delta){
    for(let i=0;i<Math.min(16,Math.abs(delta));i++)send(delta>0?'theme_next':'theme_prev')
    contact.skinStep=step;pulse(12)
   }
   return
  }
  // Stream every crossed shape in a single swipe; reverse movement reverses
  // the scan. B-left is momentary, while Scan: Sequential is a saved option.
  const scanChord=!!state.current.scanScroll
  const freeScan=scanMode==='sequential'&&activeCorner()===null
  const travelX=contact.x-contact.startX,travelY=contact.y-contact.startY
  if(scanChord&&surfaces.length!==1)return
  if(surfaces.length===1&&(scanChord||(freeScan&&
    (contact.scanStarted||Math.abs(travelX)>Math.max(12,Math.abs(travelY)*1.2))))){
   contact.scanStarted=true
   const result=scanSwipeSteps(contact.scanStep??0,contact.x-(contact.scanOriginX??contact.startX),scanStrideForSpeed(scanSpeed))
   if(result.directions.length){
    for(const dir of result.directions)send('navigate_seq',dir)
    contact.scanStep=result.step;contact.swipeFired=true
    scanTick(result.directions.length)
   }
   return
  }
  if(surfaces.length===2){
   // The A/B thumb contacts are excluded from surfaceContacts(). Identify pan
   // versus pinch once per two-finger gesture and never mix camera channels.
   const before=state.current.twoFinger??startTwoFinger(surfaces[0],surfaces[1])
   const result=advanceTwoFinger(before,surfaces[0],surfaces[1])
   state.current.twoFinger=result.session
   if(result.lockedNow){
    setTwoFingerMode(result.session.mode==='pan'?'pan':'pinch')
    pulse(result.session.mode==='pan'?11:[11,25,13])
   }
   if(result.frame)sendData.current({type:'view',...result.frame,seq:++state.current.seq})
   return
  }
  if(surfaces.length!==1)return
  const modeNow=activeCorner()
  if(modeNow==='A'){
   if(!state.current.dragging){state.current.dragging=true;state.current.last={x:e.clientX-dx,y:e.clientY-dy};send('move_start');sound().start(e.clientX-dx,e.clientY-dy)}
   if(dx||dy){
    foamSound.current?.move(e.clientX,e.clientY)
    sendData.current({type:'move',dx,dy,seq:++state.current.seq})
   }
   return
  }
  if(state.current.dragging){send('move_end');state.current.dragging=false;foamSound.current?.stop()}
  if(Math.hypot(travelX,travelY)>=THRESHOLD&&!contact.swipeFired){
   performSwipe(modeNow,direction(travelX,travelY))
   // Exactly one command per physical flick, regardless of travel distance
   // or pointermove frequency. A new finger-down starts a new gesture.
   contact.swipeFired=true
  }
 }
 function pointerUp(e:ReactPointerEvent<HTMLDivElement>){
  const contact=state.current.contacts.get(e.pointerId)
  if(!contact)return
  e.preventDefault()
  const modeNow=activeCorner()
  const highest=state.current.maxSurface
  if(contact.role==='corner'&&contact.corner==='B'){
   if(state.current.skinScroll?.owner===contact.id){state.current.skinScroll=null;setSkinMode(false)}
   if(state.current.scanScroll?.owner===contact.id){state.current.scanScroll=null;setScanActive(false)}
  }
  if(contact.role==='corner'&&contact.corner==='A'&&state.current.dragging){send('move_end');state.current.dragging=false;foamSound.current?.stop()}
  if(contact.role==='surface'){
   if(state.current.dragging){send('move_end');state.current.dragging=false;foamSound.current?.stop()}
   if(!contact.moved&&!contact.swipeFired&&highest===1&&!state.current.skinScroll&&!state.current.scanScroll){
    if(modeNow==='B'){send('spine');pulse([15,30,26])}
    else if(modeNow==='A-shift'){send('delete_confirm');pulse([20,30,20])}
    else if(modeNow==='B-shift'){announce('View commands')}
    else if(modeNow===null){
     if(performance.now()-state.current.tapTime<280){send('center');pulse([18,20,18]);state.current.tapTime=0}
     else {send('select');pulse(22);state.current.tapTime=performance.now()}
    }
   }
  }
  state.current.contacts.delete(e.pointerId)
  if(contact.role==='corner')setCornerMode(activeCorner())
  const remaining=surfaceContacts()
  setPressed(remaining.length>0)
  if(contact.role==='surface'){
   state.current.twoFinger=null
   setTwoFingerMode(null)
  }
  if(remaining.length===0){
   state.current.maxSurface=0;state.current.twoFinger=null;
   foamSound.current?.stop()
  }else if(remaining.length===2&&state.current.maxSurface===2&&!state.current.twoFinger){
   state.current.twoFinger=startTwoFinger(remaining[0],remaining[1])
  }
 }
 function pointerCancel(e:ReactPointerEvent<HTMLDivElement>){
  const item=state.current.contacts.get(e.pointerId)
  if(!item)return
  state.current.contacts.delete(e.pointerId)
  if(item.role==='corner'&&item.corner==='B'){
   state.current.skinScroll=null;setSkinMode(false);state.current.scanScroll=null;setScanActive(false)
  }
  if(state.current.dragging){send('move_end');state.current.dragging=false}
  if(item.role==='corner')setCornerMode(activeCorner())
  const remaining=surfaceContacts()
  if(item.role==='surface'){state.current.twoFinger=null;setTwoFingerMode(null)}
  if(remaining.length===0){state.current.maxSurface=0;state.current.twoFinger=null}
  setPressed(remaining.length>0);foamSound.current?.stop()
 }
 if(mode==='pad')return <div className="stax-remote-pad" data-hand={hand}
  onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp}
  onPointerCancel={pointerCancel} onContextMenu={e=>e.preventDefault()}
  aria-label="Black STAX eyes-free landscape controller">
   <div className="stax-remote-pad-status" aria-live="polite">{!valid?'Invalid pairing session':link==='direct'?'Direct connection':link==='relay'?'Relay connection':link==='offline'?'Connection unavailable':'Connecting…'}</div>
   <button className="stax-remote-scan-toggle" type="button" onPointerDown={e=>e.stopPropagation()}
    onClick={()=>{setScanMode(m=>m==='directional'?'sequential':'directional');pulse([12,20,12])}}
    aria-label={'Navigation mode: '+(scanMode==='sequential'?'sequential family scan':'directional nearest shape')+'. Tap to change.'}
    title="Switch between nearest-direction and continuous family scanning">
    {scanMode==='sequential'?'Scan: Sequential':'Scan: Directional'}
   </button>
   <button className="stax-remote-scan-speed-button" type="button" onPointerDown={e=>e.stopPropagation()}
    onClick={()=>setScanSettingsOpen(open=>!open)} aria-expanded={scanSettingsOpen} aria-controls="stax-remote-scan-speed-settings"
    title="Set how many shapes one swipe crosses">Scan speed {scanSpeed}×</button>
   {scanSettingsOpen&&<div id="stax-remote-scan-speed-settings" className="stax-remote-scan-speed-settings"
    role="group" aria-label="Sequential scanner speed settings" onPointerDown={e=>e.stopPropagation()}>
    <label htmlFor="stax-remote-scan-speed">Sequential scanner <output htmlFor="stax-remote-scan-speed">{scanSpeed}×</output></label>
    <input id="stax-remote-scan-speed" type="range" min="1" max="6" step="1"
     value={scanSpeed} onChange={e=>setScanSpeed(normalizeScanSpeed(e.target.value))}
     aria-valuetext={scanSpeed+' times original scan speed'}/>
    <div className="stax-remote-scan-speed-scale"><span>Precise · 1×</span><span>Fast · 6×</span></div>
    <small>Also controls B ← scanning. Saved on this device.</small>
   </div>}
   <button className="stax-remote-hand-toggle" type="button" onPointerDown={e=>e.stopPropagation()}
    onClick={()=>{setHand(h=>h==='right'?'left':'right');pulse([15,25,15])}}
    title="Mirror A and B for handedness">{hand==='right'?'Right-handed':'Left-handed'} · Switch</button>
   {valid&&<>{!landscape&&<div className="stax-remote-rotate" role="status">
    <span className="stax-remote-rotate-icon" aria-hidden="true">↻</span>
    <strong>Rotate your phone to landscape</strong>
    <p>Keep your eyes on the larger STAX board.</p>
    <button type="button" onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();enterFullscreenOnTouch()}}>Try landscape fullscreen</button>
   </div>}
   <div className="stax-remote-corner stax-remote-corner-b" data-zone="B" data-active={cornerMode?.startsWith('B')?'true':'false'} aria-label="B thumb controls: up skins, left continuous scan, down add, right view. Keep holding while another finger uses the pad.">
    <strong>B</strong><small>{skinMode?'SKINS':scanActive?'SCAN':cornerMode==='B-shift'?'VIEW':'ADD'}</small>
   </div>
   <div className="stax-remote-corner stax-remote-corner-a" data-zone="A" data-active={cornerMode?.startsWith('A')?'true':'false'} aria-label="A: hold to move, pull outward for editing">
    <strong>A</strong><small>{cornerMode==='A-shift'?'EDIT':'MOVE'}</small>
   </div>
   <div className="stax-remote-pad-cross" aria-hidden="true">{pressed?'·':'+'}</div>
   {twoFingerMode&&<div className="stax-remote-intent-status" aria-label={twoFingerMode==='pan'?'Pan locked':'Pinch zoom locked'}>
    {twoFingerMode==='pan'?'PAN · zoom locked':'PINCH · pan locked'}
   </div>}
   <div className="stax-remote-pad-instruction">B ↑ skins · B ← scan · B ↓ add · B → view</div>
   <div className="stax-remote-pad-rtt">{rtt===null?'Measuring connection…':`Round trip: ${rtt} ms`}</div></>}
  </div>
 return <div className="stax-remote-host" data-canonical={onHostInput?"true":"false"}>
  {!onHostInput&&<div className="stax-remote-wood" ref={board} aria-label="Isolated foam STAX gesture workspace">
   <div className="stax-remote-stage" style={{transform:`translate(${boardState.panX}px,${boardState.panY}px) scale(${boardState.zoom})`}}>
    {boardState.pieces.map(piece=><div key={piece.id}
     className={`stax-remote-piece${piece.id===boardState.focus?' is-focused':''}${piece.id===boardState.selected?' is-selected':''}`}
     style={{left:piece.x,top:piece.y}} data-kind={piece.kind}>
      <img className="stax-remote-blue-circle" src={urls[piece.kind]} draggable={false}
       alt={verboseName[piece.kind]}/>
     </div>)}
   </div>
  </div>}
  <aside className="stax-remote-host-panel">
   <div className="stax-remote-host-heading"><strong>STAX · Eyes-Free Controller</strong><button type="button" onClick={onExit} aria-label="Turn remote test off and return to STAX">Remote · On — Turn off</button></div>
   <p>Scan to control real STAX magnetic geometry on a temporary board. B + tap builds the blue–red–blue spine; B + swipe modifies the focused shape.</p>
   <img className="stax-remote-qr" src={qr} alt="QR code to join the STAX phone trackpad"/>
   <div className="stax-remote-connection" aria-live="polite">{link==='direct'?'Direct peer-to-peer · connected':peerReady?'Internet relay connected':link==='offline'?'Connection unavailable':'Waiting for phone…'}</div>
   {onHostInput?<div className="stax-remote-board-status" aria-live="polite">
    <strong>Canonical STAX grammar mode</strong>
    <span>B + tap: blue → red (+ yellow predecessor) → blue → more blues</span>
    <span>On blue: B + ← pink · ↑ purple · → green · ↓ orange</span>
    <span>On red: B + ↓ oranges 2 → 3 → 4 → 6 → 7</span>
    <span>On pink/green/purple: B + ↓ add modifier · ↑ remove last</span>
    <span>A + drag: move the entire connected molecule</span>
    <span>A-Shift + ← detach · ↓ delete request · tap confirm · ↑ cancel · → undo</span>
    <span>Swipe to select · two fingers pan/pinch</span>
    <small>Normal STAX is preserved. Yellow positioning is provisional; later red-orange tiers remain to be agreed.</small>
   </div>:<div className="stax-remote-board-status" aria-live="polite">
    <strong>{boardState.notice}</strong>
    <span>{boardState.pieces.length} shapes · {Math.round(boardState.zoom*100)}% zoom · {boardState.updates} drag packets</span>
    <span>Focused: {verboseName[boardState.pieces.find(p=>p.id===boardState.focus)?.kind||'circle']}</span>
    <span>Next shape: {verboseName[boardState.palette]} · Placement: {boardState.port}</span>
    {boardState.deleteArmed&&<span className="stax-remote-delete-warning">Deletion armed: A-Shift + tap to confirm</span>}
   </div>}
   <div className="stax-remote-host-buttons">
    {onHostInput?<button type="button" onClick={()=>onHostInput({type:'gesture',action:'reset',seq:0})}>Reset remote experiment</button>:<>
     <button type="button" onClick={()=>boardDispatch({type:'gesture',action:'seed',seq:0})}>Try 3 pieces</button>
     <button type="button" onClick={()=>boardDispatch({type:'gesture',action:'reset',seq:0})}>Reset to 1 circle</button>
    </>}
   </div>
   {!onHostInput&&<div className="stax-remote-legend">
    <strong>Eyes-free gesture map</strong>
    <p>Swipe: directional selection, or choose Sequential for continuous scanning and a tick per shape · Tap: select · Double tap: center</p>
    <p>Hold A + drag: move piece · B up: skins · B left: continuous scan · B down: add · B right: view · Hold B + tap: add spine</p>
    <p>A pull outward + hold: Detach / Undo / Delete · B swipe right + hold: Fit / Center / Zoom</p>
    <p>Two fingers: pan and pinch · Three fingers: reserved · A-Shift right: undo</p>
   </div>}
  </aside>
 </div>
}
