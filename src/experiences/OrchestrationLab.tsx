import {useEffect,useMemo,useRef,useState} from 'react'
import {
  chordChoices,orchestrationCharacters,orchestrationPlayer,
  type BuiltInSource,type ChordId,type OrchestrationCharacter
} from './orchestrationLab/audio'
import './orchestration-lab.css'

type SourceId=BuiltInSource|'berlin'|'muse'
type Rating=0|1|2|3
type Imported={url:string;name:string}
const RATING_KEY='orchestration-lab-ratings-v1'

const sources:{id:SourceId;name:string;note:string;builtIn:boolean}[]=[
  {id:'vsco',name:'VSCO 2 CE',note:'CC0 raw orchestral samples · built in',builtIn:true},
  {id:'legacy',name:'Legacy open',note:'our previous lightweight orchestral samples · built in',builtIn:true},
  {id:'piano',name:'Salamander',note:'real Yamaha C5 piano benchmark · built in',builtIn:true},
  {id:'berlin',name:'Berlin Free Orchestra',note:'professional benchmark · load your rendered reference',builtIn:false},
  {id:'muse',name:'MuseSounds',note:'notation-playback benchmark · load your rendered reference',builtIn:false}
]

function readRatings():Record<string,Rating>{
  try{return JSON.parse(localStorage.getItem(RATING_KEY)||'{}')}catch{return {}}
}
function comboKey(chord:ChordId,character:OrchestrationCharacter,source:SourceId){return chord+'|'+character+'|'+source}

export function OrchestrationLab({onExit}:{onExit:()=>void}){
  const player=useRef<ReturnType<typeof orchestrationPlayer>|null>(null)
  const externalAudio=useRef<HTMLAudioElement|null>(null)
  const fileInput=useRef<HTMLInputElement>(null)
  const pendingImport=useRef<string|null>(null)
  const clearTimer=useRef<number|null>(null)
  const imports=useRef<Record<string,Imported>>({})
  const [chord,setChord]=useState<ChordId>('amadd9')
  const [room,setRoom]=useState(.34)
  const [loading,setLoading]=useState<string|null>(null)
  const [active,setActive]=useState<string|null>(null)
  const [current,setCurrent]=useState<string|null>(null)
  const [ratings,setRatings]=useState<Record<string,Rating>>(readRatings)
  const [error,setError]=useState('')
  const [,setImportVersion]=useState(0)

  const currentParts=useMemo(()=>{
    if(!current)return null
    const [chordId,characterId,sourceId]=current.split('|') as [ChordId,OrchestrationCharacter,SourceId]
    return {
      chord:chordChoices.find(x=>x.id===chordId),
      character:orchestrationCharacters.find(x=>x.id===characterId),
      source:sources.find(x=>x.id===sourceId)
    }
  },[current])

  useEffect(()=>()=>{stop();player.current?.dispose();for(const item of Object.values(imports.current))URL.revokeObjectURL(item.url)},[])

  function ensure(){if(!player.current)player.current=orchestrationPlayer();return player.current}
  function stop(){
    if(clearTimer.current!==null){window.clearTimeout(clearTimer.current);clearTimer.current=null}
    player.current?.stop()
    if(externalAudio.current){externalAudio.current.pause();externalAudio.current.currentTime=0;externalAudio.current=null}
    setActive(null);setLoading(null)
  }
  function rate(value:Rating){
    if(!current)return
    const next={...ratings,[current]:value};setRatings(next);localStorage.setItem(RATING_KEY,JSON.stringify(next))
  }
  function requestImport(key:string){pendingImport.current=key;fileInput.current?.click()}
  function acceptImport(file:File){
    const key=pendingImport.current;if(!key)return
    const previous=imports.current[key];if(previous)URL.revokeObjectURL(previous.url)
    imports.current[key]={url:URL.createObjectURL(file),name:file.name}
    pendingImport.current=null;setImportVersion(x=>x+1)
    const [c,character,source]=key.split('|') as [ChordId,OrchestrationCharacter,SourceId]
    void playCell(c,character,source)
  }
  async function playCell(c:ChordId,character:OrchestrationCharacter,source:SourceId){
    const key=comboKey(c,character,source)
    if(active===key){stop();return}
    stop();setError('');setCurrent(key)
    if(source==='berlin'||source==='muse'){
      const imported=imports.current[key]
      if(!imported){requestImport(key);return}
      const audio=new Audio(imported.url);externalAudio.current=audio;setActive(key)
      audio.onended=()=>setActive(null);audio.onerror=()=>{setError('That reference audio could not be played.');setActive(null)}
      try{await audio.play()}catch(e){setError(e instanceof Error?e.message:'Could not play that reference.');setActive(null)}
      return
    }
    setLoading(key);setActive(key)
    try{
      await ensure().play(source as BuiltInSource,character,c,{room,duration:6})
      clearTimer.current=window.setTimeout(()=>{setActive(null);clearTimer.current=null},7200)
    }catch(e){
      setError(e instanceof Error?e.message:'Could not load this sound source.')
      setActive(null)
    }finally{setLoading(null)}
  }

  return <main className="orch-lab">
    <header className="orch-top">
      <button onClick={()=>{stop();onExit()}}>← The Lab</button>
      <div><span>MUSIC LAB II</span><small>Sound Source × Orchestration</small></div>
      <button onClick={stop}>Stop</button>
    </header>

    <section className="orch-intro">
      <span className="orch-kicker">ONE CHORD · MANY WORLDS</span>
      <h1>Keep the harmony. Change everything around it.</h1>
      <p>Hear the same chord through different sound sources and different orchestration ideas. The point is to separate <b>sample quality</b> from <b>orchestration quality</b>.</p>
    </section>

    <section className="orch-controls">
      <label>Chord
        <select value={chord} onChange={e=>{stop();setChord(e.target.value as ChordId)}}>
          {chordChoices.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
      <label>Room <strong>{Math.round(room*100)}</strong>
        <input type="range" min="0" max=".68" step=".01" value={room} onChange={e=>setRoom(Number(e.target.value))}/>
      </label>
      <p>For a fair sound-source comparison, leave the chord and room unchanged while moving across a row.</p>
    </section>

    <section className="orch-sources">
      {sources.map(source=><article key={source.id}>
        <strong>{source.name}</strong>
        <span>{source.note}</span>
        {!source.builtIn&&<small>Raw samples are not packaged here. Each cell accepts a WAV/MP3 render from that system.</small>}
      </article>)}
    </section>

    {currentParts&&<section className="orch-now">
      <div><small>LAST HEARD</small><strong>{currentParts.character?.name} · {currentParts.source?.name}</strong><span>{currentParts.chord?.label}</span></div>
      <div className="orch-rate" aria-label="Rate current combination">
        <span>Beauty</span>
        {([0,1,2,3] as Rating[]).map(value=><button key={value} className={(ratings[current!]??0)===value?'selected':''} onClick={()=>rate(value)}>{value===0?'0':'★'.repeat(value)}</button>)}
      </div>
    </section>}

    {error&&<p className="orch-error" role="alert">{error}</p>}

    <section className="orch-matrix">
      {orchestrationCharacters.map(character=><article className="orch-character" key={character.id}>
        <header>
          <div><small>{character.reference}</small><h2>{character.name}</h2></div>
          <p>{character.description}</p>
        </header>
        <div className="orch-source-row">
          {sources.map(source=>{
            const key=comboKey(chord,character.id,source.id)
            const imported=imports.current[key]
            const isActive=active===key,isLoading=loading===key
            return <button key={source.id} className={(isActive?'active ':'')+(imported?'imported':'')} onClick={()=>void playCell(chord,character.id,source.id)}>
              <strong>{isLoading?'Loading…':isActive?'■ Stop':imported?'▶ '+source.name:source.builtIn?'▶ '+source.name:'+ '+source.name}</strong>
              <small>{source.builtIn?'built in':imported?imports.current[key]?.name:'load render'}</small>
              {(ratings[key]??0)>0&&<em>{'★'.repeat(ratings[key])}</em>}
            </button>
          })}
        </div>
      </article>)}
    </section>

    <input ref={fileInput} className="orch-hidden-file" type="file" accept="audio/*" onChange={e=>{const file=e.target.files?.[0];if(file)acceptImport(file);e.currentTarget.value=''}}/>

    <footer>
      Built-in open orchestra: VSCO 2 Community Edition raw CC0 samples. Piano: Salamander Grand. “Sacred Bells,” “Minimal Pulse,” and “Cinematic Layers” use broad musical principles rather than trying to reproduce a living composer’s exact style. Berlin and MuseSounds remain external quality benchmarks because their raw libraries are not redistributed inside HOS.
    </footer>
  </main>
}