export type TrackRating = 0|1|2|3
export type BackingFeel = 'swing'|'ballad'|'bossa'

export type BackingTrack = {
  id:string
  name:string
  roman:string
  chordNames:string[]
  chords:number[][]
  roots:number[]
  bpm:number
  feel:BackingFeel
  mood:string
}

export const backingTracks:BackingTrack[] = [
  {id:'major-251',name:'Clear Arrival',roman:'ii–V–I',chordNames:['Dm9','G13','Cmaj9','Cmaj9'],chords:[[50,60,64,69,76],[55,65,69,76,81],[48,59,64,71,74],[48,59,64,71,76]],roots:[38,43,36,36],bpm:112,feel:'swing',mood:'warm resolution'},
  {id:'turnaround',name:'Warm Turnaround',roman:'I–vi–ii–V',chordNames:['Cmaj9','Am9','Dm9','G13'],chords:[[48,59,64,71,74],[45,55,59,64,71],[50,60,64,69,76],[55,65,69,76,81]],roots:[36,45,38,43],bpm:118,feel:'swing',mood:'flowing and familiar'},
  {id:'long-home',name:'Long Homecoming',roman:'iii–VI–ii–V–I',chordNames:['Em9','A13','Dm9','G13','Cmaj9'],chords:[[52,62,67,71,78],[57,67,73,76,83],[50,60,64,69,76],[55,65,69,76,81],[48,59,64,71,74]],roots:[40,45,38,43,36],bpm:104,feel:'swing',mood:'travel then arrival'},
  {id:'minor-251',name:'Midnight Resolve',roman:'iiø–V–i',chordNames:['Dm7♭5','G7alt','CmMaj9','CmMaj9'],chords:[[50,60,63,68,75],[55,65,68,71,75],[48,59,63,67,74],[48,59,63,67,74]],roots:[38,43,36,36],bpm:82,feel:'ballad',mood:'dark but tender'},
  {id:'backdoor',name:'Wistful Return',roman:'ivm–♭VII–I',chordNames:['Fm9','B♭13','Cmaj9','Cmaj9'],chords:[[53,63,68,72,79],[58,68,72,79,84],[48,59,64,71,74],[48,59,64,71,76]],roots:[41,46,36,36],bpm:92,feel:'ballad',mood:'wistful homecoming'},
  {id:'tritone',name:'Velvet Turn',roman:'ii–♭II–I',chordNames:['Dm9','D♭13','Cmaj9','Cmaj9'],chords:[[50,60,64,69,76],[49,59,65,68,75],[48,59,64,71,74],[48,59,64,71,76]],roots:[38,37,36,36],bpm:108,feel:'swing',mood:'slippery and elegant'},
  {id:'minor-plagal',name:'Soft Lantern',roman:'I–ivm–I',chordNames:['Cmaj9','Fm9','Cmaj9','C6/9'],chords:[[48,59,64,71,74],[53,63,68,72,79],[48,59,64,71,74],[48,57,62,64,69]],roots:[36,41,36,36],bpm:76,feel:'ballad',mood:'gentle ache'},
  {id:'bossa-cycle',name:'Evening Coast',roman:'I–VI–ii–V',chordNames:['Cmaj9','A7alt','Dm9','G13'],chords:[[48,59,64,71,74],[57,67,73,76,82],[50,60,64,69,76],[55,65,69,76,81]],roots:[36,45,38,43],bpm:126,feel:'bossa',mood:'light motion'}
]

const trackById=new Map(backingTracks.map(track=>[track.id,track]))

export function backingTrackPlayer(){
  const context=new AudioContext()
  const master=context.createGain()
  master.gain.value=.72
  master.connect(context.destination)
  const activeNodes=new Set<AudioScheduledSourceNode>()
  let timer:number|null=null
  let playingId:string|null=null
  let loopToken=0

  function stopNodes(){
    for(const node of activeNodes){try{node.stop()}catch{}}
    activeNodes.clear()
  }
  function stop(){
    loopToken++
    if(timer!==null){window.clearInterval(timer);timer=null}
    stopNodes()
    playingId=null
  }
  function hz(midi:number){return 440*Math.pow(2,(midi-69)/12)}
  function connectTracked(node:AudioScheduledSourceNode){activeNodes.add(node);node.addEventListener('ended',()=>activeNodes.delete(node))}

  function pianoNote(midi:number,time:number,duration:number,volume:number){
    const gain=context.createGain()
    const body=context.createOscillator(),spark=context.createOscillator(),air=context.createOscillator()
    body.type='triangle';spark.type='sine';air.type='sine'
    body.frequency.value=hz(midi);spark.frequency.value=hz(midi)*2.01;air.frequency.value=hz(midi)*3.98
    spark.detune.value=2;air.detune.value=-3
    gain.gain.setValueAtTime(.0001,time)
    gain.gain.exponentialRampToValueAtTime(volume,time+.008)
    gain.gain.exponentialRampToValueAtTime(volume*.24,time+.22)
    gain.gain.exponentialRampToValueAtTime(.0001,time+duration)
    body.connect(gain);spark.connect(gain);air.connect(gain);gain.connect(master)
    for(const osc of [body,spark,air]){connectTracked(osc);osc.start(time);osc.stop(time+duration+.05)}
  }
  function pianoChord(chord:number[],time:number,duration=1.25,volume=.055,spread=false){
    chord.forEach((note,i)=>pianoNote(note,time+(spread?i*.012:0),duration,volume*(i===0?1.05:.9)))
  }
  function bassNote(midi:number,time:number,duration:number,volume=.12){
    const osc=context.createOscillator(),gain=context.createGain()
    osc.type='triangle';osc.frequency.value=hz(midi)
    gain.gain.setValueAtTime(.0001,time);gain.gain.exponentialRampToValueAtTime(volume,time+.01);gain.gain.exponentialRampToValueAtTime(.0001,time+duration)
    osc.connect(gain);gain.connect(master);connectTracked(osc);osc.start(time);osc.stop(time+duration+.03)
  }
  function noiseHit(time:number,duration:number,volume:number,highpass:number){
    const length=Math.max(1,Math.floor(context.sampleRate*duration))
    const buffer=context.createBuffer(1,length,context.sampleRate),data=buffer.getChannelData(0)
    for(let i=0;i<length;i++)data[i]=(Math.random()*2-1)*Math.pow(1-i/length,2)
    const src=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain()
    src.buffer=buffer;filter.type='highpass';filter.frequency.value=highpass
    gain.gain.setValueAtTime(volume,time);gain.gain.exponentialRampToValueAtTime(.0001,time+duration)
    src.connect(filter);filter.connect(gain);gain.connect(master);connectTracked(src);src.start(time);src.stop(time+duration)
  }
  function kick(time:number){
    const osc=context.createOscillator(),gain=context.createGain()
    osc.type='sine';osc.frequency.setValueAtTime(110,time);osc.frequency.exponentialRampToValueAtTime(48,time+.12)
    gain.gain.setValueAtTime(.12,time);gain.gain.exponentialRampToValueAtTime(.0001,time+.18)
    osc.connect(gain);gain.connect(master);connectTracked(osc);osc.start(time);osc.stop(time+.2)
  }
  function scheduleBar(track:BackingTrack,index:number,start:number,bass:boolean,drums:boolean){
    const beat=60/track.bpm,chord=track.chords[index%track.chords.length],root=track.roots[index%track.roots.length]
    if(track.feel==='ballad'){
      pianoChord(chord,start,beat*2.8,.05,true)
      pianoChord(chord.slice(1),start+beat*2.45,beat*1.1,.032,true)
      if(bass){bassNote(root,start,beat*1.8,.1);bassNote(root+7,start+beat*2,beat*1.6,.075)}
      if(drums){kick(start);noiseHit(start+beat*2,beat*.16,.018,4200)}
    }else if(track.feel==='bossa'){
      pianoChord(chord,start,beat*.85,.047,true)
      pianoChord(chord.slice(1),start+beat*1.5,beat*.7,.035,true)
      pianoChord(chord,start+beat*2.5,beat*.75,.041,true)
      if(bass){bassNote(root,start,beat*.9,.11);bassNote(root+7,start+beat*2,beat*.85,.09)}
      if(drums){for(let b=0;b<4;b++)noiseHit(start+beat*b,beat*.09,.012,5000);kick(start);kick(start+beat*2)}
    }else{
      pianoChord(chord,start,beat*.72,.05,true)
      pianoChord(chord.slice(1),start+beat*1.62,beat*.55,.035,true)
      pianoChord(chord,start+beat*2.72,beat*.58,.039,true)
      if(bass){
        const walk=[root,root+4,root+7,root+9]
        walk.forEach((note,b)=>bassNote(note,start+beat*b,beat*.82,b===0?.115:.086))
      }
      if(drums){
        kick(start);kick(start+beat*2)
        for(let b=0;b<4;b++){noiseHit(start+beat*b,beat*.11,b===1||b===3?.022:.012,4800);noiseHit(start+beat*(b+.66),beat*.07,.008,6200)}
      }
    }
  }

  async function preview(id:string){
    const track=trackById.get(id);if(!track)return
    stop();playingId=id;await context.resume()
    const step=1.45,start=context.currentTime+.06
    track.chords.forEach((chord,i)=>pianoChord(chord,start+i*step,1.16,.062,false))
    window.setTimeout(()=>{if(playingId===id)playingId=null},track.chords.length*step*1000+250)
  }

  async function loop(id:string,{bass=true,drums=true}:{bass?:boolean;drums?:boolean}={}){
    const track=trackById.get(id);if(!track)return
    stop();playingId=id;await context.resume()
    const token=++loopToken,beat=60/track.bpm,bar=beat*4
    let barIndex=0,next=context.currentTime+.08
    const pump=()=>{
      if(token!==loopToken)return
      while(next<context.currentTime+1.2){
        scheduleBar(track,barIndex,next,bass,drums)
        barIndex=(barIndex+1)%track.chords.length
        next+=bar
      }
    }
    pump();timer=window.setInterval(pump,180)
  }

  return {preview,loop,stop,getPlayingId:()=>playingId,dispose:()=>{stop();void context.close()}}
}