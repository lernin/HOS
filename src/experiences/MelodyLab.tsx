import {useEffect,useMemo,useRef,useState} from 'react'
import {melodyCandidates,moods,type MoodId} from './woodland/musicWorld'
import {woodlandWorldScore} from './woodland/musicWorldAudio'
import './melody-lab.css'

type Rating=0|1|2|3
const KEY='woodland-melody-ratings-v1'
function readRatings():Record<string,Rating>{
  try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch{return {}}
}

export function MelodyLab({onExit}:{onExit:()=>void}){
  const player=useRef<ReturnType<typeof woodlandWorldScore>|null>(null)
  const [mood,setMood]=useState<MoodId>('hearth')
  const [ratings,setRatings]=useState<Record<string,Rating>>(readRatings)
  const [active,setActive]=useState<string|null>(null)
  const [loading,setLoading]=useState<string|null>(null)
  const [error,setError]=useState('')
  const [volume,setVolume]=useState(.68)
  const info=moods.find(item=>item.id===mood)!
  const ranked=useMemo(()=>melodyCandidates(mood).map((item,index)=>({item,index,rating:ratings[mood+'|'+item.id]??0})).sort((a,b)=>b.rating-a.rating||a.index-b.index),[mood,ratings])
  useEffect(()=>()=>player.current?.dispose(),[])
  useEffect(()=>{player.current?.setVolume(volume)},[volume])

  function ensure(){if(!player.current){player.current=woodlandWorldScore();player.current.setVolume(volume)}return player.current}
  function stop(){player.current?.stop();setActive(null);setLoading(null)}
  async function play(id:string){
    if(active===id){stop();return}
    stop();setError('');setLoading(id)
    try{
      const p=ensure(),seconds=await p.preview(mood,id);setActive(id)
      window.setTimeout(()=>setActive(current=>current===id?null:current),(seconds+.8)*1000)
    }catch(e){setError(e instanceof Error?e.message:'Could not load the orchestra.')}finally{setLoading(null)}
  }
  function rate(id:string,value:Rating){
    const key=mood+'|'+id,next={...ratings,[key]:value};setRatings(next);localStorage.setItem(KEY,JSON.stringify(next))
  }

  return <main className="melody-lab">
    <header className="melody-top"><button onClick={()=>{stop();onExit()}}>← The Lab</button><div><span>MELODY LAB</span><small>Teach the composer your taste</small></div><button onClick={stop}>Stop</button></header>
    <section className="melody-intro"><span>ONE WORLD · MANY THEMES</span><h1>Choose what each feeling sings.</h1><p>Every candidate shares compatible musical DNA, so the winning themes can transform into one another inside Woodland instead of sounding like unrelated songs.</p></section>
    <nav className="melody-moods" aria-label="Emotional colors">{moods.map(item=><button key={item.id} className={mood===item.id?'selected':''} onClick={()=>{stop();setMood(item.id)}}><span>{item.emoji}</span><strong>{item.label}</strong></button>)}</nav>
    <section className="melody-current"><div><span>{info.emoji}</span><div><small>CURRENT COLOR</small><h2>{info.label}</h2><p>{info.meaning}</p></div></div><label>Orchestra <strong>{Math.round(volume*100)}</strong><input type="range" min="0" max="1" step=".01" value={volume} onChange={e=>setVolume(Number(e.target.value))}/></label></section>
    {error&&<p className="melody-error" role="alert">{error}</p>}
    <section className="melody-bank">
      {ranked.map(({item,rating},rank)=><article key={item.id} className={active===item.id?'active':''}>
        <div className="melody-title"><span className="melody-rank">{rank+1}</span><div><strong>{item.name}</strong><small>Full VSCO orchestral accompaniment</small></div><button onClick={()=>void play(item.id)} aria-pressed={active===item.id}>{loading===item.id?'Loading…':active===item.id?'■ Stop':'▶ Orchestra'}</button></div>
        <div className="melody-rating" role="group" aria-label={'Rate '+item.name}>{([0,1,2,3] as Rating[]).map(value=><button key={value} className={rating===value?'selected':''} onClick={()=>rate(item.id,value)}>{value===0?'0':'★'.repeat(value)}</button>)}</div>
      </article>)}
    </section>
    <footer>Your ratings stay on this device. Woodland reads the highest-ranked melody for each emotional color, so your choices directly become the game composer’s preferences.</footer>
  </main>
}
