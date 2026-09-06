import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { startRecordingSession, type RecordingSession } from '../lib/voiceCapture'
import './concept-interaction-review.css'

type Row = {
  id:string
  interaction_code:string
  source_coordinate:string
  target_coordinate:string
  source_language:string|null
  source_mode:string
  target_language:string|null
  target_mode:string
  derived_command:string
  technical_description:string
  teacher_asker_does:string
  teacher_asker_example:string|null
  teacher_natural_prompt:string|null
  student_responder_does:string
  expected_response:string|null
  usefulness:number|null
  difficulty:number|null
  prerequisites:string|null
  notes:string|null
  review_note:string|null
  ashley_confidence:number
  ai_confidence:number|null
}
type Props={pin:string;onExit:()=>void}
const confidenceLevels=[0,1,2,3] as const

export function ConceptInteractionReview({pin,onExit}:Props){
  const [rows,setRows]=useState<Row[]>([])
  const [idx,setIdx]=useState(0)
  const [filter,setFilter]=useState('0')
  const [note,setNote]=useState('')
  const [msg,setMsg]=useState('')
  const [toast,setToast]=useState('')
  const [pendingConfidence,setPendingConfidence]=useState<{id:string;value:number}|null>(null)
  const [recording,setRecording]=useState(false)
  const rec=useRef<RecordingSession|null>(null)
  const cardRef=useRef<HTMLElement|null>(null)
  const touchX=useRef<number|null>(null)
  const touchDx=useRef(0)
  const motionBusy=useRef(false)
  const advanceTimer=useRef<number|null>(null)

  useEffect(()=>{
    supabase.rpc('lab_concept_interaction_read',{pin}).then(({data,error})=>{
      if(error)setMsg(error.message)
      else setRows(data as Row[])
    })
    return ()=>{ if(advanceTimer.current) window.clearTimeout(advanceTimer.current) }
  },[pin])

  const bucketCounts=useMemo(()=>confidenceLevels.map(level=>rows.filter(r=>r.ashley_confidence===level).length),[rows])
  const availableLevels=confidenceLevels.filter(level=>bucketCounts[level]>0)
  const visible=useMemo(()=>rows.filter(r=>String(r.ashley_confidence)===filter),[rows,filter])
  useEffect(()=>{
    if(!rows.length||visible.length)return
    const next=confidenceLevels.find(level=>rows.some(r=>r.ashley_confidence===level))
    if(next!==undefined){setFilter(String(next));setIdx(0)}
  },[rows,visible.length,filter])
  useEffect(()=>setIdx(i=>Math.min(i,Math.max(0,visible.length-1))),[visible.length])
  const row=visible[idx]
  useEffect(()=>setNote(row?.review_note||''),[row?.id])

  async function save(conf?:number,newNote?:string,applyLocal=true){
    if(!row)return null
    const {data,error}=await supabase.rpc('lab_concept_interaction_review',{
      pin,
      interaction_id:row.id,
      new_confidence:conf??null,
      new_note:newNote??null,
      set_note:newNote!==undefined
    })
    if(error){setMsg(error.message);return null}
    const saved=data as Row
    if(applyLocal)setRows(rs=>rs.map(r=>r.id===row.id?saved:r))
    return saved
  }

  function nextFrame(){
    return new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())))
  }

  async function animateCard(delta:number,midpoint:()=>void,startX=0){
    if(motionBusy.current)return
    const card=cardRef.current
    if(!card){midpoint();return}
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){midpoint();return}
    motionBusy.current=true
    card.style.pointerEvents='none'
    const edge=delta>0?'-112%':'112%'
    const start=`translateX(${startX}px) scale(${1-Math.min(Math.abs(startX)/2400,.02)})`
    const out=card.animate(
      [{transform:start,opacity:1},{transform:`translateX(${edge}) scale(.97)`,opacity:.28}],
      {duration:startX?150:190,easing:'cubic-bezier(.4,0,.2,1)',fill:'forwards'}
    )
    try{
      await out.finished
      midpoint()
      await nextFrame()
      const incoming=cardRef.current
      if(incoming){
        const from=delta>0?'112%':'-112%'
        const enter=incoming.animate(
          [{transform:`translateX(${from}) scale(.97)`,opacity:.28},{transform:'translateX(0) scale(1)',opacity:1}],
          {duration:230,easing:'cubic-bezier(.2,.75,.2,1)',fill:'forwards'}
        )
        out.cancel()
        await enter.finished
        enter.cancel()
        incoming.style.transform=''
        incoming.style.opacity=''
        incoming.style.pointerEvents=''
      }
    }finally{
      motionBusy.current=false
      const active=cardRef.current
      if(active){active.style.transform='';active.style.opacity='';active.style.pointerEvents=''}
    }
  }

  function go(delta:number,startX=0){
    const target=Math.max(0,Math.min(visible.length-1,idx+delta))
    if(target===idx){
      const card=cardRef.current
      if(card&&startX){
        const snap=card.animate([{transform:`translateX(${startX}px)`},{transform:'translateX(0)'}],{duration:150,easing:'ease-out'})
        void snap.finished.finally(()=>{card.style.transform='';card.style.opacity=''})
      }
      return
    }
    void animateCard(delta,()=>setIdx(target),startX)
  }

  async function choose(n:number){
    if(!row)return
    const current=row
    setPendingConfidence({id:current.id,value:n})
    const saved=await save(n,undefined,false)
    if(!saved){setPendingConfidence(null);return}
    setToast(`${current.interaction_code} · confidence ${n} saved`)
    if(advanceTimer.current) window.clearTimeout(advanceTimer.current)
    advanceTimer.current=window.setTimeout(()=>{
      setToast('')
      void animateCard(1,()=>{
        const nextRows=rows.map(r=>r.id===saved.id?saved:r)
        const currentLevel=Number(filter)
        const currentBucket=nextRows.filter(r=>r.ashley_confidence===currentLevel)
        setRows(nextRows)
        setPendingConfidence(null)
        if(n===currentLevel){
          setIdx(i=>Math.min(i+1,Math.max(0,currentBucket.length-1)))
        }else if(currentBucket.length){
          setIdx(i=>Math.min(i,Math.max(0,currentBucket.length-1)))
        }else{
          const nextLevel=confidenceLevels.find(level=>nextRows.some(r=>r.ashley_confidence===level))
          if(nextLevel!==undefined){setFilter(String(nextLevel));setIdx(0)}
        }
      })
    },950)
  }

  async function mic(){
    if(recording){
      const s=rec.current
      if(!s)return
      s.stop()
      setRecording(false)
      setMsg('Transcribing…')
      const blob=await s.blobPromise
      const form=new FormData()
      form.append('audio',blob,'concept-note.webm')
      const res=await fetch('/api/transcribe',{method:'POST',headers:{'x-review-pin':pin},body:form})
      const out=await res.json()
      if(!res.ok){setMsg(out.error||'Transcription failed');return}
      const next=[note,out.text].filter(Boolean).join(' ').trim()
      setNote(next)
      if(await save(undefined,next)) setMsg('Note saved')
      return
    }
    try{
      rec.current=await startRecordingSession()
      setRecording(true)
      setMsg('Recording — tap again to stop')
    }catch(e){
      setMsg(e instanceof Error?e.message:'Microphone failed')
    }
  }

  if(!row)return <main className="ci">
    <header><button onClick={onExit}>‹ Lab</button><b>Concept Interactions</b></header>
    <div className="ci-empty">{rows.length?'No interactions in this filter.':'Loading…'} {msg}</div>
  </main>

  return <main className="ci">
    <header><button onClick={onExit}>‹ Lab</button><b>Concept Interactions</b><span>{idx+1}/{visible.length}</span></header>
    <div className="ci-bucket-area">
      <div className={availableLevels.length===1&&availableLevels[0]===3?'ci-bucket-label complete':'ci-bucket-label'}>
        {availableLevels.length===1&&availableLevels[0]===3?'✓ Everything is confidence 3':'YOUR CONFIDENCE · LOWER NUMBERS NEED REVIEW'}
      </div>
      <nav className="ci-buckets" aria-label="Your confidence review buckets">
        {availableLevels.map(level=><button className={`bucket bucket-${level}${filter===String(level)?' on':''}`} onClick={()=>{setFilter(String(level));setIdx(0)}} key={level}><b>{level}</b><span>{bucketCounts[level]} {bucketCounts[level]===1?'item':'items'}</span></button>)}
      </nav>
    </div>
    <section
      ref={cardRef}
      className="ci-card"
      onTouchStart={e=>{
        if((e.target as HTMLElement).closest('button,textarea,input,select')){touchX.current=null;return}
        touchX.current=e.changedTouches[0].clientX
        touchDx.current=0
      }}
      onTouchMove={e=>{
        if(touchX.current===null||motionBusy.current)return
        const d=e.changedTouches[0].clientX-touchX.current
        touchDx.current=d
        const card=cardRef.current
        if(card){
          card.style.transform=`translateX(${d}px) rotate(${d*.012}deg)`
          card.style.opacity=String(Math.max(.72,1-Math.abs(d)/700))
        }
      }}
      onTouchEnd={()=>{
        if(touchX.current===null)return
        const d=touchDx.current
        touchX.current=null
        touchDx.current=0
        if(Math.abs(d)>55)go(d<0?1:-1,d)
        else{
          const card=cardRef.current
          if(card){
            const snap=card.animate([{transform:`translateX(${d}px)`,opacity:card.style.opacity||'1'},{transform:'translateX(0)',opacity:1}],{duration:150,easing:'ease-out'})
            void snap.finished.finally(()=>{card.style.transform='';card.style.opacity=''})
          }
        }
      }}
    >
      <div className="ci-title"><strong>{row.interaction_code}</strong><span>{row.derived_command}</span></div>

      <div className="ci-flow">
        <div><small>Input</small><b>{row.source_coordinate}</b><span>{row.source_language||'—'} · {row.source_mode}</span></div>
        <div className="ci-arrow">→</div>
        <div><small>Output</small><b>{row.target_coordinate}</b><span>{row.target_language||'—'} · {row.target_mode}</span></div>
      </div>

      <p className="ci-tech">{row.technical_description}</p>

      <div className="ci-exchange">
        <div className="ci-role"><small>Teacher / AI</small><b>{row.teacher_asker_does}</b><p>{row.teacher_asker_example||'—'}</p></div>
        <div className="ci-arrow">→</div>
        <div className="ci-role"><small>Student</small><b>{row.student_responder_does}</b><p>{row.expected_response||'—'}</p></div>
      </div>

      <div className="ci-prompt">
        <small>Teacher / AI says</small>
        <b>{row.teacher_natural_prompt||'—'}</b>
        <p><small>Needs</small> {row.prerequisites||'TBD'}</p>
      </div>

      <label className="ci-note"><small>Ashley note</small><textarea value={note} onChange={e=>setNote(e.target.value)} onBlur={()=>void save(undefined,note)} placeholder="Optional note — type or use Mic…"/></label>

      <div className="ci-actions">
        <div className="ci-action-top">
          <button className={recording?'ci-mic rec':'ci-mic'} onClick={mic}>{recording?'■ Stop':'● Mic'}</button>
          <div className="ci-ai"><span>AI confidence</span><b>{row.ai_confidence??'—'}</b><span>Use {row.usefulness??'—'} · Diff {row.difficulty??'—'}</span></div>
        </div>
        <div className="ci-ashley">
          <small>Your confidence</small>
          <div className="ci-confidence-buttons">{[0,1,2,3].map(n=>{const shown=pendingConfidence?.id===row.id?pendingConfidence.value:row.ashley_confidence;return <button className={`confidence-${n}${shown===n?' selected':''}`} onClick={()=>void choose(n)} key={n}>{n}</button>})}</div>
        </div>
      </div>
    </section>
    <footer><button onClick={()=>go(-1)}>‹</button><span>{msg||`${rows.filter(r=>r.ashley_confidence===0).length} unconfirmed · swipe ↔`}</span><button onClick={()=>go(1)}>›</button></footer>
    {toast&&<div className="ci-toast" role="status">{toast}</div>}
  </main>
}
