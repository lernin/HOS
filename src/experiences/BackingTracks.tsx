import {useEffect,useMemo,useRef,useState} from 'react'
import {backingTrackPlayer,backingTracks,type TrackRating} from './backingTracks/audio'
import './backing-tracks.css'

type Ratings=Record<string,TrackRating>
const KEY='backing-track-ratings-v1'
function readRatings():Ratings{
  const defaults=Object.fromEntries(backingTracks.map(track=>[track.id,1])) as Ratings
  try{
    const saved=JSON.parse(localStorage.getItem(KEY)||'{}') as Record<string,number>
    for(const track of backingTracks){const value=saved[track.id];if(value===0||value===1||value===2||value===3)defaults[track.id]=value}
  }catch{}
  return defaults
}

export function BackingTracks({onExit}:{onExit:()=>void}){
  const player=useRef<ReturnType<typeof backingTrackPlayer>|null>(null)
  const [ratings,setRatings]=useState<Ratings>(readRatings)
  const [active,setActive]=useState<string|null>(null)
  const [mode,setMode]=useState<'preview'|'loop'|null>(null)
  const [bass,setBass]=useState(true),[drums,setDrums]=useState(true)
  const ranked=useMemo(()=>backingTracks.map((track,index)=>({track,index,rating:ratings[track.id]??0})).sort((a,b)=>b.rating-a.rating||a.index-b.index),[ratings])
  useEffect(()=>()=>player.current?.dispose(),[])

  function ensure(){if(!player.current)player.current=backingTrackPlayer();return player.current}
  function stop(){player.current?.stop();setActive(null);setMode(null)}
  function rate(id:string,value:TrackRating){const next={...ratings,[id]:value};setRatings(next);localStorage.setItem(KEY,JSON.stringify(next))}
  async function playPreview(id:string){
    if(active===id&&mode==='preview'){stop();return}
    stop();setActive(id);setMode('preview')
    await ensure().preview(id)
    window.setTimeout(()=>{if(ensure().getPlayingId()!==id){setActive(current=>current===id?null:current);setMode(current=>current==='preview'?null:current)}},9000)
  }
  async function playLoop(id:string){
    if(active===id&&mode==='loop'){stop();return}
    stop();setActive(id);setMode('loop')
    await ensure().loop(id,{bass,drums})
  }

  return <main className="backing-lab">
    <header className="backing-top">
      <button onClick={()=>{stop();onExit()}}>← The Lab</button>
      <div><span>BACKING TRACKS</span><small>Find harmony worth keeping.</small></div>
      <button onClick={stop}>Stop all</button>
    </header>

    <section className="backing-intro">
      <h1>Hear the chords. Then hear them breathe.</h1>
      <p><strong>Preview</strong> is a plain piano-teacher demonstration: one chord, then the next. <strong>Loop</strong> turns the same harmony into an original practice rhythm section.</p>
      <div className="backing-mix">
        <button className={bass?'on':''} onClick={()=>{setBass(v=>!v);stop()}}>Bass {bass?'on':'off'}</button>
        <button className={drums?'on':''} onClick={()=>{setDrums(v=>!v);stop()}}>Drums {drums?'on':'off'}</button>
      </div>
    </section>

    <section className="backing-grid">
      {ranked.map(({track,rating})=>{
        const isPreview=active===track.id&&mode==='preview',isLoop=active===track.id&&mode==='loop'
        return <article key={track.id} className={(rating===0?'muted ':'')+((isPreview||isLoop)?'active':'')}>
          <div className="backing-card-head">
            <div><h2>{track.name}</h2><span>{track.roman}</span></div>
            <small>{track.bpm} BPM · {track.feel}</small>
          </div>
          <div className="backing-chords">{track.chordNames.map((name,i)=><span key={name+i}>{name}</span>)}</div>
          <p>{track.mood}</p>
          <div className="backing-play-row">
            <button className={isPreview?'playing':''} onClick={()=>void playPreview(track.id)}>{isPreview?'■ Stop':'▶ Preview chords'}</button>
            <button className={isLoop?'playing':''} onClick={()=>void playLoop(track.id)}>{isLoop?'■ Stop loop':'↻ Loop backing'}</button>
          </div>
          <div className="backing-rating" role="group" aria-label={'Rate '+track.name}>
            {([0,1,2,3] as TrackRating[]).map(value=><button key={value} className={rating===value?'selected':''} onClick={()=>rate(track.id,value)}>{value===0?'0':'★'.repeat(value)}</button>)}
          </div>
        </article>
      })}
    </section>
    <footer>Original practice tracks inspired by the play-along teaching idea: clear harmony, repeatable groove, and a rhythm section you can isolate.</footer>
  </main>
}