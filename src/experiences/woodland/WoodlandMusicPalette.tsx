import {useMemo} from 'react'
import {woodlandProgressions,type MusicRating,type WoodlandInstrument,type WoodlandVoicing} from './audio'

export type MusicRatings=Record<string,MusicRating>

export function rankedMusic(ratings:MusicRatings){
  return woodlandProgressions
    .map((item,index)=>({item,index,rating:ratings[item.id]??0}))
    .sort((a,b)=>b.rating-a.rating||a.index-b.index)
}

export function WoodlandMusicPalette({
  ratings,activeId,instrument,voicing,melody,onRate,onToggle,onInstrument,onVoicing,onMelody
}:{
  ratings:MusicRatings
  activeId:string|null
  instrument:WoodlandInstrument
  voicing:WoodlandVoicing
  melody:boolean
  onRate:(id:string,rating:MusicRating)=>void
  onToggle:(id:string)=>void
  onInstrument:(value:WoodlandInstrument)=>void
  onVoicing:(value:WoodlandVoicing)=>void
  onMelody:(value:boolean)=>void
}){
  const ranked=useMemo(()=>rankedMusic(ratings),[ratings])
  const playing=ranked.filter(entry=>entry.rating>0).length
  return <section className="woodland-music">
    <div className="woodland-music-heading">
      <div><h3>Harmony lab</h3><p>Judge the harmony cleanly first. Melody is off by default.</p></div>
      <span>{playing} enabled</span>
    </div>

    <div className="woodland-sound-modes">
      <div>
        <small>Instrument</small>
        <div className="woodland-segmented">
          <button type="button" className={instrument==='piano'?'selected':''} onClick={()=>onInstrument('piano')}>Piano</button>
          <button type="button" className={instrument==='synth'?'selected':''} onClick={()=>onInstrument('synth')}>Synth</button>
        </div>
      </div>
      <div>
        <small>Voicing</small>
        <div className="woodland-segmented">
          <button type="button" className={voicing==='jazz'?'selected':''} onClick={()=>onVoicing('jazz')}>Jazz</button>
          <button type="button" className={voicing==='orchestral'?'selected':''} onClick={()=>onVoicing('orchestral')}>Wide</button>
        </div>
      </div>
      <div>
        <small>Melody</small>
        <div className="woodland-segmented">
          <button type="button" className={!melody?'selected':''} onClick={()=>onMelody(false)}>Off</button>
          <button type="button" className={melody?'selected':''} onClick={()=>onMelody(true)}>On</button>
        </div>
      </div>
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
          </div>
          <div className="woodland-rating" role="group" aria-label={'Rate '+item.name}>
            {([0,1,2,3] as MusicRating[]).map(value=><button type="button" key={value} className={rating===value?'selected':''} aria-pressed={rating===value} onClick={()=>onRate(item.id,value)}>{value===0?'0':'★'.repeat(value)}</button>)}
          </div>
        </article>
      })}
    </div>
  </section>
}
