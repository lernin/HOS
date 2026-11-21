import { useEffect, useRef, useState } from 'react'
import { getVoiceStyle } from '../../lib/voiceStyle'
import { DEFAULT_TTS_VOICE } from '../../lib/ttsVoices'

type Phase='idle'|'listening'|'thinking'|'speaking'
type Visual=(active:boolean,jaw:number,phase:Phase)=>void

// A deliberately tiny adaptation of Procedia's Desk Speaking pipeline.
// Same STT, Kuna chat prompt and verse voice/style backend, but no text composer,
// message bubbles, chat history, learner identity, or persistence inside The Lab.
export function useKunaVoice(onVisual:Visual){
  const visual=useRef(onVisual);visual.current=onVisual
  const [phase,setPhase]=useState<Phase>('idle'),[notice,setNotice]=useState('')
  const phaseRef=useRef<Phase>('idle'),sessionRef=useRef(0),mounted=useRef(true)
  const recorderRef=useRef<MediaRecorder|null>(null),streamRef=useRef<MediaStream|null>(null)
  const captureCtx=useRef<AudioContext|null>(null),listenFrame=useRef<number|null>(null)
  const playbackCtx=useRef<AudioContext|null>(null),playbackSource=useRef<AudioBufferSourceNode|null>(null),playFrame=useRef<number|null>(null)
  const pending=useRef<AbortController|null>(null),lastSpeed=useRef<number|null>(null)
  const startAt=useRef(0),lastSound=useRef(0),heardSpeech=useRef(false)

  function status(next:Phase){phaseRef.current=next;if(mounted.current)setPhase(next);visual.current(next!=='idle',0,next)}
  function info(s:string){if(mounted.current)setNotice(s)}
  function stopMicrophone(){
    if(listenFrame.current!==null){cancelAnimationFrame(listenFrame.current);listenFrame.current=null}
    const recorder=recorderRef.current
    if(recorder&&recorder.state==='recording'){recorder.onstop=null;recorder.stop()}
    recorderRef.current=null
    streamRef.current?.getTracks().forEach(t=>t.stop());streamRef.current=null
    void captureCtx.current?.close().catch(()=>{});captureCtx.current=null
  }
  function stopPlayback(){
    if(playFrame.current!==null){cancelAnimationFrame(playFrame.current);playFrame.current=null}
    if(playbackSource.current){playbackSource.current.onended=null;try{playbackSource.current.stop()}catch{/* Already finished. */};playbackSource.current.disconnect();playbackSource.current=null}
    visual.current(false,0,phaseRef.current)
  }
  function cancelAll(){
    sessionRef.current++
    pending.current?.abort();pending.current=null
    stopMicrophone();stopPlayback();status('idle')
  }
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;cancelAll();void playbackCtx.current?.close().catch(()=>{});playbackCtx.current=null}},[])

  async function exchangeAudio(blob:Blob,id:number){
    status('thinking')
    const controller=new AbortController();pending.current=controller
    try{
      // Identical endpoint contracts to Procedia. Vercel rewrites keep API calls same-origin.
      const form=new FormData()
      form.append('file',blob,blob.type.includes('mp4')?'speech.m4a':'speech.webm')
      const stt=await fetch('/api/kuna/speech-to-text',{method:'POST',body:form,signal:controller.signal})
      if(!stt.ok)throw new Error('Could not understand your voice.')
      const transcript=await stt.json()
      if(id!==sessionRef.current)return
      const said=typeof transcript.text==='string'?transcript.text.trim().slice(0,1200):''
      if(!said){info('Try speaking a little louder.');status('idle');return}
      const response=await fetch('/api/kuna/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:said,locale:'en'}),signal:controller.signal})
      if(!response.ok)throw new Error('Kuna could not reply. Please try again.')
      const data=await response.json()
      if(id!==sessionRef.current)return
      const answer=typeof data.text==='string'?data.text.trim().slice(0,2000):''
      if(!answer)throw new Error('Kuna could not think of a reply.')
      const styled=getVoiceStyle(answer)
      let speed=styled.speed
      if(lastSpeed.current!==null)speed=Math.round(Math.max(.25,Math.min(4,lastSpeed.current*.42+speed*.58))*1000)/1000
      const audio=await fetch('/api/kuna/tts',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({text:answer,voice:DEFAULT_TTS_VOICE,style:styled.style,speed}),
        signal:controller.signal,
      })
      if(!audio.ok)throw new Error('Kuna could not speak. Please try again.')
      const bytes=await audio.arrayBuffer()
      if(id!==sessionRef.current)return
      lastSpeed.current=speed
      const context=playbackCtx.current??new AudioContext();playbackCtx.current=context
      await context.resume()
      const buffer=await context.decodeAudioData(bytes.slice(0))
      if(id!==sessionRef.current)return
      stopPlayback()
      const source=context.createBufferSource(),analyser=context.createAnalyser()
      analyser.fftSize=512;analyser.smoothingTimeConstant=.2
      source.buffer=buffer;source.connect(analyser);analyser.connect(context.destination)
      playbackSource.current=source
      status('speaking');info('')
      const samples=new Uint8Array(analyser.fftSize)
      const trackJaw=()=>{
        if(id!==sessionRef.current||phaseRef.current!=='speaking')return
        analyser.getByteTimeDomainData(samples)
        let sum=0
        for(const s of samples){const v=(s-128)/128;sum+=v*v}
        const rms=Math.sqrt(sum/samples.length)
        visual.current(true,Math.min(1,Math.max(0,(rms-.018)*5)),phaseRef.current)
        playFrame.current=requestAnimationFrame(trackJaw)
      }
      source.onended=()=>{if(id!==sessionRef.current)return;stopPlayback();status('idle')}
      source.start(0);trackJaw()
    }catch(e){
      if(id!==sessionRef.current||controller.signal.aborted)return
      info(e instanceof Error?e.message:'Voice chat could not finish.')
      status('idle')
    }finally{if(pending.current===controller)pending.current=null}
  }

  function finishSpeaking(){
    const recorder=recorderRef.current
    if(!recorder||recorder.state!=='recording')return
    if(listenFrame.current!==null){cancelAnimationFrame(listenFrame.current);listenFrame.current=null}
    recorder.stop() // onstop sends one completed utterance
  }
  async function beginListening(){
    if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){info('Microphone recording needs a supported browser.');return}
    const id=++sessionRef.current
    // Unlock output audio during the original tap; mobiles may reject later autoplay.
    try{
      const output=playbackCtx.current??new AudioContext();playbackCtx.current=output
      void output.resume()
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}})
      if(id!==sessionRef.current){stream.getTracks().forEach(t=>t.stop());return}
      streamRef.current=stream
      const mime=MediaRecorder.isTypeSupported('audio/webm;codecs=opus')?'audio/webm;codecs=opus':MediaRecorder.isTypeSupported('audio/mp4')?'audio/mp4':''
      const recorder=mime?new MediaRecorder(stream,{mimeType:mime}):new MediaRecorder(stream)
      recorderRef.current=recorder
      const chunks:Blob[]=[]
      recorder.ondataavailable=e=>{if(e.data.size>0)chunks.push(e.data)}
      recorder.onerror=()=>{stopMicrophone();info('Recording failed. Tap Kuna to retry.');status('idle')}
      recorder.onstop=()=>{
        const blob=new Blob(chunks,{type:recorder.mimeType||'audio/webm'})
        recorderRef.current=null
        streamRef.current?.getTracks().forEach(t=>t.stop());streamRef.current=null
        if(listenFrame.current!==null){cancelAnimationFrame(listenFrame.current);listenFrame.current=null}
        void captureCtx.current?.close().catch(()=>{});captureCtx.current=null
        if(id!==sessionRef.current)return
        if(blob.size<900){info('I did not hear anything. Tap Kuna and try again.');status('idle');return}
        void exchangeAudio(blob,id)
      }
      recorder.start(150)
      const context=new AudioContext();captureCtx.current=context
      const source=context.createMediaStreamSource(stream),analyser=context.createAnalyser()
      analyser.fftSize=1024;source.connect(analyser)
      const samples=new Float32Array(analyser.fftSize)
      heardSpeech.current=false;startAt.current=performance.now();lastSound.current=startAt.current
      status('listening');info('')
      const detect=()=>{
        if(recorder.state!=='recording'||id!==sessionRef.current)return
        analyser.getFloatTimeDomainData(samples)
        let sum=0;for(const v of samples)sum+=v*v
        const rms=Math.sqrt(sum/samples.length),at=performance.now()
        if(rms>.027){heardSpeech.current=true;lastSound.current=at}
        if((heardSpeech.current&&at-startAt.current>1000&&at-lastSound.current>1250)||at-startAt.current>14000){finishSpeaking();return}
        listenFrame.current=requestAnimationFrame(detect)
      }
      detect()
    }catch(err){
      stopMicrophone()
      if(id!==sessionRef.current)return
      info('Microphone permission is needed to talk to Kuna.')
      status('idle')
    }
  }

  function tap(){
    if(phaseRef.current==='listening'){finishSpeaking();return}
    if(phaseRef.current==='thinking'){info('Kuna is thinking.');return}
    if(phaseRef.current==='speaking'){cancelAll();return}
    info('');void beginListening()
  }
  return {phase,notice,tap,cancel:cancelAll}
}
