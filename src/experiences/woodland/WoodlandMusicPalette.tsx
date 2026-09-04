import {useMemo} from 'react'
import {woodlandProgressions,type MusicRating,type WoodlandSoundMode} from './audio'

export type MusicRatings=Record<string,MusicRating>

export function rankedMusic(ratings:MusicRatings){
  return woodlandProgressions
    .map((item,index)=>({item,index,rating:ratings[item.id]??0}))
    .sort((a,b)=>b.rating-a.rating||a.index-b.index)
}

export function WoodlandMusicPalette({
  ratings,activeId,mode,onRate,onToggle,onMode
}:{
  ratings:MusicRatings
  activeId:string|null
  mode:WoodlandSoundMode
  onRate:(id:string,rating:MusicRating)=>void
  onToggle:(id:string)=>void
  onMode:(value:WoodlandSoundMode)=>void
}){
  const ranked=useMemo(()=>rankedMusic(ratings),[ratings])
  const playing=ranked.filter(entry=>entry.rating>0).length
  return <section className="woodland-music">
    <div className="woodland-music-heading">
      <div><h3>Harmony lab</h3><p>Piano mode plays the progression exactly like a teacher demonstrating the chords. Game mode brings back the atmospheric arrangement.</p></div>
      <span>{playing} enabled</span>
    </div>

    <div className="woodland-mode-toggle" role="group" aria-label="Harmony playback mode">
      <button type="button" className={mode==='piano'?'selected':''} onClick={()=>onMode('piano')}>Piano mode</button>
      <button type="button" className={mode==='game'?'selected':''} onClick={()=>onMode('game')}>Game mode</button>
    </div>

    <div className="woodland-progressions">
      {ranked.map(({item,rating})=>{
        const active=activeId===item.id
        return <article key={item.id} className={(rating===0?'muted ':'')+(active?'auditioning':'')}>
          <div className="woodland-progression-title">
            <div>
              <strong>{item.name}</strong>
              <span>{item.emojis}</span>
            </div>
            <button type="button" className={'woodland-audition '+(active?'active':'')} aria-label={(active?'Stop ':'Play ')+item.name} aria-pressed={active} onClick={()=>onToggle(item.id)}><span aria-hidden="true">{active?'■':'▶'}</span></button>
          </div>
          <div className="woodland-harmony-meta">
            <span>{item.roman}</span>
            <small>{item.chordNames.join(' → ')}</small>
            {mode==='piano'&&<em>Teacher demo · chords only · no melody</em>}
          </div>
          <div className="woodland-rating" role="group" aria-label={'Rate '+item.name}>
            {([0,1,2,3] as MusicRating[]).map(value=><button type="button" key={value} className={rating===value?'selected':''} aria-pressed={rating===value} onClick={()=>onRate(item.id,value)}>{value===0?'0':'★'.repeat(value)}</button>)}
          </div>
        </article>
      })}
    </div>
  </section>
}