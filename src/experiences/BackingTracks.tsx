import {useEffect,useMemo,useRef,useState} from 'react'
import {
  backingTrackPlayer,backingTracks,type TrackRating,type MusicSettings,type MusicVoice,type CompStyle,type SynthPreset,type OrchestraPreset
} from './backingTracks/audio'
import './backing-tracks.css'

type Ratings=Record<string,TrackRating>
type Recipe={trackId:string;settings:MusicSettings}
const RATINGS_KEY='music-lab-ratings-v2'
const RECIPE_KEY='music-lab-recipes-v1'

function readRatings():Ratings{
  const defaults=Object.fromEntries(backingTracks.map(track=>[track.id,1])) as Ratings
  try{
    const saved=JSON.parse(localStorage.getItem(RATINGS_KEY)||'{}') as Record<string,number>
    for(const track of backingTracks){const value=saved[track.id];if(value===0||value===1||value===2||value===3)defaults[track.id]=value}
  }catch{}
  return defaults
}
function readRecipes():{a:Recipe|null;b:Recipe|null}{
  try{return {...{a:null,b:null},...JSON.parse(localStorage.getItem(RECIPE_KEY)||'{}')}}catch{return {a:null,b:null}}
}

const voiceCopy:Record<MusicVoice,{title:string;sub:string}> = {
  piano:{title:'Real piano',sub:'Salamander Yamaha C5 recordings. No oscillator pretending to be a piano.'},
  synth:{title:'Synth playground',sub:'This is where synthesis belongs: warm analog, glassy FM, and slow velvet pads.'},
  orchestra:{title:'Orchestral sketch',sub:'Layered violin, cello, horn, flute and contrabass samples for broad emotional color.'}
}
const styles:{id:CompStyle;label:string}[]=[
  {id:'block',label:'Block'},{id:'gentle',label:'Gentle'},{id:'broken',label:'Broken'},{id:'pulse',label:'Pulse'}
]

export function BackingTracks({onExit}:{onExit:()=>void}){
  const player=useRef<ReturnType<typeof backingTrackPlayer>|null>(null)
  const [ratings,setRatings]=useState<Ratings>(readRatings)
  const [active,setActive]=useState<string|null>(null)
  const [playMode,setPlayMode]=useState<'once'|'loop'|null>(null)
  const [loading,setLoading]=useState<string|null>(null)
  const [error,setError]=useState('')
  const [voice,setVoice]=useState<MusicVoice>('piano')
  const [style,setStyle]=useState<CompStyle>('gentle')
  const [bpm,setBpm]=useState(88)
  const [register,setRegister]=useState(0)
  const [spread,setSpread]=useState(.35)
  const [reverb,setReverb]=useState(.2)
  const [bass,setBass]=useState(false)
  const [synthPreset,setSynthPreset]=useState<SynthPreset>('warm')
  const [orchestraPreset,setOrchestraPreset]=useState<OrchestraPreset>('chamber')
  const initialRecipes=useMemo(readRecipes,[])
  const [slotA,setSlotA]=useState<Recipe|null>(initialRecipes.a),[slotB,setSlotB]=useState<Recipe|null>(initialRecipes.b)

  const ranked=useMemo(()=>backingTracks.map((track,index)=>({track,index,rating:ratings[track.id]??0})).sort((a,b)=>b.rating-a.rating||a.index-b.index),[ratings])
  useEffect(()=>()=>player.current?.dispose(),[])

  function ensure(){if(!player.current)player.current=backingTrackPlayer();return player.current}
  function currentSettings():MusicSettings{return {voice,style,bpm,register,spread,reverb,bass,synthPreset,orchestraPreset}}
  function stop(){player.current?.stop();setActive(null);setPlayMode(null);setLoading(null)}
  function rate(id:string,value:TrackRating){const next={...ratings,[id]:value};setRatings(next);localStorage.setItem(RATINGS_KEY,JSON.stringify(next))}
  function persistRecipes(a=slotA,b=slotB){localStorage.setItem(RECIPE_KEY,JSON.stringify({a,b}))}
  function saveRecipe(slot:'a'|'b',trackId:string){
    const recipe={trackId,settings:currentSettings()}
    if(slot==='a'){setSlotA(recipe);persistRecipes(recipe,slotB)}
    else{setSlotB(recipe);persistRecipes(slotA,recipe)}
  }
  async function playRecipe(recipe:Recipe,repeat=false){
    setError('');setLoading(recipe.trackId);setActive(recipe.trackId);setPlayMode(repeat?'loop':'once')
    try{await ensure().play(recipe.trackId,recipe.settings,{repeat})}
    catch(e){setError(e instanceof Error?e.message:'Could not load this sound.');stop()}
    finally{setLoading(null)}
  }
  async function playTrack(id:string,repeat:boolean){
    if(active===id&&((repeat&&playMode==='loop')||(!repeat&&playMode==='once'))){stop();return}
    await playRecipe({trackId:id,settings:currentSettings()},repeat)
  }
  function changeVoice(next:MusicVoice){stop();setVoice(next);setError('')}

  return <main className="backing-lab">
    <header className="backing-top">
      <button onClick={()=>{stop();onExit()}}>← The Lab</button>
      <div><span>MUSIC LAB</span><small>Find sounds worth keeping.</small></div>
      <button onClick={stop}>Stop all</button>
    </header>

    <section className="backing-intro">
      <h1>Make it beautiful first.</h1>
      <p>This room is for sound discovery, not the child experience. Keep the harmony fixed, change the instrument and performance, compare it, and save what actually works.</p>
    </section>

    <section className="music-engine">
      <div className="music-voice-tabs" role="group" aria-label="Sound world">
        {(['piano','synth','orchestra'] as MusicVoice[]).map(item=><button key={item} className={voice===item?'selected':''} onClick={()=>changeVoice(item)}>{item==='piano'?'Piano':item==='synth'?'Synthesizer':'Orchestral'}</button>)}
      </div>
      <div className="music-voice-copy"><strong>{voiceCopy[voice].title}</strong><span>{voiceCopy[voice].sub}</span></div>

      <div className="music-controls">
        {voice==='synth'&&<label>Sound<select value={synthPreset} onChange={e=>{stop();setSynthPreset(e.target.value as SynthPreset)}}>
          <option value="warm">Warm analog</option><option value="glass">Glass FM</option><option value="velvet">Velvet pad</option>
        </select></label>}
        {voice==='orchestra'&&<label>Color<select value={orchestraPreset} onChange={e=>{stop();setOrchestraPreset(e.target.value as OrchestraPreset)}}>
          <option value="strings">Strings</option><option value="chamber">Chamber</option><option value="cinematic">Cinematic</option>
        </select></label>}
        {voice==='piano'&&<label>Instrument<strong className="music-fixed-choice">Salamander Grand · Yamaha C5</strong></label>}

        <label>Tempo <strong>{bpm} BPM</strong><input type="range" min="54" max="144" step="1" value={bpm} onChange={e=>setBpm(Number(e.target.value))}/></label>
        <label>Register <strong>{register===0?'center':register<0?'lower':'higher'}</strong><input type="range" min="-1" max="1" step="1" value={register} onChange={e=>setRegister(Number(e.target.value))}/></label>
        <label>Spread <strong>{Math.round(spread*100)}</strong><input type="range" min="0" max="1" step=".01" value={spread} onChange={e=>setSpread(Number(e.target.value))}/></label>
        <label>Room <strong>{Math.round(reverb*100)}</strong><input type="range" min="0" max=".65" step=".01" value={reverb} onChange={e=>setReverb(Number(e.target.value))}/></label>
      </div>

      <div className="music-style-row"><span>Performance</span>{styles.map(item=><button key={item.id} className={style===item.id?'selected':''} onClick={()=>{stop();setStyle(item.id)}}>{item.label}</button>)}</div>
      <button className={bass?'music-bass selected':'music-bass'} onClick={()=>{stop();setBass(v=>!v)}}>Sampled contrabass {bass?'on':'off'}</button>
      <p className="music-source-note">{voice==='piano'?'Real Yamaha C5 samples load on first play.':voice==='orchestra'?'Orchestral samples are CC-BY and load only when you audition this mode.':'Synth mode intentionally uses synthesis; acoustic modes do not.'}</p>
    </section>

    <section className="music-ab">
      <div><strong>A/B comparison</strong><span>Save two recipes, then jump between them without relying on memory.</span></div>
      <button disabled={!slotA} onClick={()=>slotA&&void playRecipe(slotA,false)}>▶ A {slotA?backingTracks.find(t=>t.id===slotA.trackId)?.name:'empty'}</button>
      <button disabled={!slotB} onClick={()=>slotB&&void playRecipe(slotB,false)}>▶ B {slotB?backingTracks.find(t=>t.id===slotB.trackId)?.name:'empty'}</button>
    </section>

    {error&&<p className="music-error" role="alert">{error}</p>}

    <section className="backing-grid">
      {ranked.map(({track,rating})=>{
        const isOnce=active===track.id&&playMode==='once',isLoop=active===track.id&&playMode==='loop',isLoading=loading===track.id
        return <article key={track.id} className={(rating===0?'muted ':'')+((isOnce||isLoop)?'active':'')}>
          <div className="backing-card-head">
            <div><h2>{track.name}</h2><span>{track.roman}</span></div>
            <small>{track.feel} · original {track.bpm}</small>
          </div>
          <div className="backing-chords">{track.chordNames.map((name,i)=><span key={name+i}>{name}</span>)}</div>
          <p>{track.mood}</p>
          <div className="backing-play-row">
            <button className={isOnce?'playing':''} disabled={isLoading} onClick={()=>void playTrack(track.id,false)}>{isLoading?'Loading real sounds…':isOnce?'■ Stop':'▶ Hear recipe'}</button>
            <button className={isLoop?'playing':''} disabled={isLoading} onClick={()=>void playTrack(track.id,true)}>{isLoop?'■ Stop loop':'↻ Loop'}</button>
          </div>
          <div className="music-recipe-row"><button onClick={()=>saveRecipe('a',track.id)}>Save A</button><button onClick={()=>saveRecipe('b',track.id)}>Save B</button></div>
          <div className="backing-rating" role="group" aria-label={'Rate '+track.name}>
            {([0,1,2,3] as TrackRating[]).map(value=><button key={value} className={rating===value?'selected':''} onClick={()=>rate(track.id,value)}>{value===0?'0':'★'.repeat(value)}</button>)}
          </div>
        </article>
      })}
    </section>
    <footer>
      Piano: Salamander Grand Piano recordings. Orchestral samples: tonejs-instruments collection. Synthesizer: Tone.js. This preview streams the sample libraries; once we choose winners, we can self-host the small curated set.
    </footer>
  </main>
}
