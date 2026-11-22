import { useEffect, useReducer, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { FoamSlideAudio, safeFoamSoundId, normalizeFoamSoundTuning } from './foam-slide-audio'
import { initialRemoteBoard, reduceRemoteBoard, REMOTE_KINDS, type RemoteGesture, type RemoteInput, type RemoteDirection, type RemoteKind } from './remote-gesture-model'
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
type Contact={id:number;role:'surface'|'corner';corner?:'A'|'B';shift:boolean;startX:number;startY:number;x:number;y:number;moved:boolean}
type MultiPoint={x:number;y:number;distance:number}
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

export function RemoteCircleTest({onExit}:{onExit:()=>void}) {
 const query=new URLSearchParams(window.location.search)
 const mode=query.get('remote')==='pad'?'pad':'host'
 const [room]=useState(()=>mode==='host'?newRoom():query.get('room')||'')
 const valid=ROOM_FORMAT.test(room)
 const [link,setLink]=useState<LinkState>('connecting')
 const [peerReady,setPeerReady]=useState(false)
 const [boardState,boardDispatch]=useReducer(reduceRemoteBoard,undefined,initialRemoteBoard)
 const [rtt,setRtt]=useState<number|null>(null)
 const [count,setCount]=useState(0)
 const [pressed,setPressed]=useState(false)
 const [hand,setHand]=useState<'right'|'left'>(()=>{try{return localStorage.getItem('stax-remote-hand-v1')==='left'?'left':'right'}catch{return 'right'}})
 const [cornerMode,setCornerMode]=useState<'A'|'B'|'A-shift'|'B-shift'|null>(null)
 const [phonePalette,setPhonePalette]=useState<RemoteKind>('triangle')
 const [landscape,setLandscape]=useState(()=>window.innerWidth>window.innerHeight)
 const foamSound=useRef<FoamSlideAudio|null>(null)
 const fullscreenRequest=useRef(false)
 const state=useRef({last:{x:0,y:0},dragging:false,seq:0,started:new Map<number,number>(),
  contacts:new Map<number,Contact>(),maxSurface:0,multi:null as MultiPoint|null,
  multiStart:null as MultiPoint|null,threeFired:false,tapTime:0,
  tapTimer:null as ReturnType<typeof setTimeout>|null})
 const sendData=useRef<(payload:DataMessage)=>void>(()=>{})
 const board=useRef<HTMLDivElement>(null)
 useEffect(()=>{try{localStorage.setItem('stax-remote-hand-v1',hand)}catch{/* optional */}},[hand])
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
    boardDispatch(data)
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
     const pc=makePeer();acceptWire(pc.createDataChannel('trackpad',{ordered:false,maxRetransmits:0}))
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
 function pointerDown(e:ReactPointerEvent<HTMLDivElement>){
  if(!valid)return
  e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId)
  state.current.dragging=true
  state.current.last={x:e.clientX,y:e.clientY}
  setPressed(true)
  if(mode==='pad'){
   if(window.innerWidth>window.innerHeight)enterFullscreenOnTouch()
   sound().start(e.clientX,e.clientY)
  }
 }
 function pointerMove(e:ReactPointerEvent<HTMLDivElement>){
  if(!state.current.dragging)return
  e.preventDefault()
  const dx=e.clientX-state.current.last.x,dy=e.clientY-state.current.last.y
  state.current.last={x:e.clientX,y:e.clientY}
  if(dx||dy){
   if(mode==='pad')foamSound.current?.move(e.clientX,e.clientY)
   sendData.current({type:'move',dx,dy,seq:++state.current.seq})
  }
 }
 function pointerUp(){state.current.dragging=false;setPressed(false);foamSound.current?.stop()}
 if(mode==='pad')return <div className="stax-remote-pad" onPointerDown={pointerDown}
  onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}
  onContextMenu={e=>e.preventDefault()} aria-label="Black STAX phone trackpad">
  <div className="stax-remote-pad-status" aria-live="polite">{!valid?'Invalid session':link==='direct'?'Direct Wi-Fi peer connection':link==='relay'?'Connected via relay':link==='offline'?'Connection unavailable':'Connecting to board…'}</div>
  {valid&&<>{!landscape&&<div className="stax-remote-rotate" role="status">
    <span className="stax-remote-rotate-icon" aria-hidden="true">↻</span>
    <strong>Rotate your phone to landscape</strong>
    <p>Use the trackpad with your phone sideways.</p>
    <button type="button" onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();enterFullscreenOnTouch()}}>Try landscape fullscreen</button>
   </div>}
   <div className="stax-remote-pad-cross" aria-hidden="true">{pressed?'●':'+'}</div>
   <div className="stax-remote-pad-instruction">Touch anywhere and drag · foam sound plays here</div>
   <div className="stax-remote-pad-rtt">{rtt===null?'Measuring latency…':`Round trip: ${rtt} ms`}</div></>}
 </div>
 return <div className="stax-remote-host">
  <div className="stax-remote-wood" ref={board} aria-label="One blue foam circle on a wooden board">
   <img className="stax-remote-blue-circle" src="/stax-foam/cleaned/circle.webp"
    draggable={false} alt="One blue STAX foam circle"
    style={{transform:`translate(calc(-50% + ${circle.x}px),calc(-50% + ${circle.y}px))`}}/>
  </div>
  <aside className="stax-remote-host-panel">
   <div className="stax-remote-host-heading"><strong>STAX · Phone Trackpad Test</strong><button type="button" onClick={onExit} aria-label="Turn remote test off and return to STAX">Remote · On — Turn off</button></div>
   <p>Scan with your phone. Touch the black screen to drag the circle.</p>
   <img className="stax-remote-qr" src={qr} alt="QR code to join the STAX phone trackpad" />
   <div className="stax-remote-connection" aria-live="polite">{link==='direct'?'Direct peer-to-peer · connected':peerReady?'Internet relay connected':link==='offline'?'Connection unavailable':'Waiting for phone…'}</div>
   <small>{count} position updates received</small>
  </aside>
 </div>
}
