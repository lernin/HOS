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
const filters=[['all','All'],['0','0'],['1','1'],['2','2'],['3','3'],['2+','2+']] as const

export function ConceptInteractionReview({pin,onExit}:Props){
  const [rows,setRows]=useState<Row[]>([])
  const [idx,setIdx]=useState(0)
  const [filter,setFilter]=useState('0')
  const [note,setNote]=useState('')
  const [msg,setMsg]=useState('')
  const [toast,setToast]=useState('')
  const [recording,setRecording]=useState(false)
  const rec=useRef<RecordingSession|null>(null)
  const touchX=useRef<number|null>(null)
  const advanceTimer=useRef<number|null>(null)

  useEffect(()=>{
    supabase.rpc('lab_concept_interaction_read',{pin}).then(({data,error})=>{
      if(error)setMsg(error.message)
      else setRows(data as Row[])
    })
    return ()=>{ if(advanceTimer.current) window.clearTimeout(advanceTimer.current) }
  },[pin])

  const visible=useMemo(
    ()=>rows.filter(r=>filter==='all'||(filter==='2+'?r.ashley_confidence>=2:String(r.ashley_confidence)===filter)),
    [rows,filter]
  )
  useEffect(()=>setIdx(i=>Math.min(i,Math.max(0,visible.length-1))),[visible.length])
  const row=visible[idx]
  useEffect(()=>setNote(row?.review_note||''),[row?.id])

  async function save(conf?:number,newNote?:string){
    if(!row)return false
    const {data,error}=await supabase.rpc('lab_concept_interaction_review',{
      pin,
      interaction_id:row.id,
      new_confidence:conf??null,
      new_note:newNote??null,
      set_note:newNote!==undefined
    })
    if(error){setMsg(error.message);return false}
    setRows(rs=>rs.map(r=>r.id===row.id?data as Row:r))
    return true
  }

  function go(delta:number){
    setIdx(i=>Math.max(0,Math.min(visible.length-1,i+delta)))
  }

  async function choose(n:number){
    if(!row)return
    const code=row.interaction_code
    if(!(await save(n)))return
    setToast(`${code} · confidence ${n} saved`)
    if(advanceTimer.current) window.clearTimeout(advanceTimer.current)
    advanceTimer.current=window.setTimeout(()=>{
      setToast('')
      go(1)
    },850)
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
    <nav>{filters.map(([v,l])=><button className={filter===v?'on':''} onClick={()=>{setFilter(v);setIdx(0)}} key={v}>{l}</button>)}</nav>
    <section
      className="ci-card"
      onTouchStart={e=>{touchX.current=e.changedTouches[0].clientX}}
      onTouchEnd={e=>{
        if(touchX.current===null)return
        const d=e.changedTouches[0].clientX-touchX.current
        touchX.current=null
        if(Math.abs(d)>55)go(d<0?1:-1)
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
        <button className={recording?'ci-mic rec':'ci-mic'} onClick={mic}>{recording?'■ Stop':'● Mic'}</button>
        <div className="ci-confidence">
          <div className="ci-ai"><span>AI confidence</span><b>{row.ai_confidence??'—'}</b><span>Use {row.usefulness??'—'} · Diff {row.difficulty??'—'}</span></div>
          <div className="ci-ashley"><small>Your confidence</small>{[0,1,2,3].map(n=><button className={row.ashley_confidence===n?'selected':''} onClick={()=>void choose(n)} key={n}>{n}</button>)}</div>
        </div>
      </div>
    </section>
    <footer><button onClick={()=>go(-1)}>‹</button><span>{msg||`${rows.filter(r=>r.ashley_confidence===0).length} unconfirmed · swipe ↔`}</span><button onClick={()=>go(1)}>›</button></footer>
    {toast&&<div className="ci-toast" role="status">{toast}</div>}
  </main>
}
