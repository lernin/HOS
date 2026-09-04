import {useMemo} from 'react'
import {woodlandProgressions,type MusicRating} from './audio'

export type MusicRatings=Record<string,MusicRating>

export function rankedMusic(ratings:MusicRatings){
  return woodlandProgressions
    .map((item,index)=>({item,index,rating:ratings[item.id]??0}))
    .sort((a,b)=>b.rating-a.rating||a.index-b.index)
}

export function WoodlandMusicPalette({ratings,onRate,onAudition}:{ratings:MusicRatings;onRate:(id:string,rating:MusicRating)=>void;onAudition:(id:string)=>void}){
  const ranked=useMemo(()=>rankedMusic(ratings),[ratings])
  const playing=ranked.filter(entry=>entry.rating>0).length
  return <section className="woodland-music">
    <div className="woodland-music-heading">
      <div><h3>Music palette</h3><p>Hear one, then rate it. Three-star favorites rise to the top. Zero-star progressions never play.</p></div>
      <span>{playing} playing</span>
    </div>
    <div className="woodland-progressions">
      {ranked.map(({item,rating})=><article key={item.id} className={rating===0?'muted':''}>
        <div className="woodland-progression-title">
          <div><strong>{item.name}</strong><span>{item.emojis}</span></div>
          <button type="button" onClick={()=>onAudition(item.id)}>Hear</button>
        </div>
        <div className="woodland-rating" role="group" aria-label={`Rate ${item.name}`}>
          {([0,1,2,3] as MusicRating[]).map(value=><button type="button" key={value} className={rating===value?'selected':''} aria-pressed={rating===value} onClick={()=>onRate(item.id,value)}>{value===0?'0':'★'.repeat(value)}</button>)}
        </div>
      </article>)}
    </div>
  </section>
}
