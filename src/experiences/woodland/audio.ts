export type MusicRating = 0|1|2|3
export type WoodlandSoundMode = 'piano'|'game'
export type WoodlandProgression = {
  id:string
  name:string
  emojis:string
  roman:string
  chordNames:string[]
  jazz:number[][]
  orchestral:number[][]
  melody:number[]
}

export const woodlandProgressions: WoodlandProgression[] = [
  {
    id:'two-five-one',name:'Clear arrival',emojis:'🌿✨🏡',roman:'ii–V–I',
    chordNames:['Dm9','G13','Cmaj9','Cmaj9'],
    jazz:[[38,48,52,57,64],[43,53,57,64,69],[36,47,52,59,62],[36,47,52,59,64]],
    orchestral:[[38,45,52,57,64,69],[43,50,57,64,69,76],[36,43,52,59,64,71],[36,43,52,59,64,76]],
    melody:[69,71,74,71,69,67,64,62]
  },
  {
    id:'one-six-two-five',name:'Warm circle',emojis:'☀️🍂🕯️',roman:'I–vi–ii–V',
    chordNames:['Cmaj9','Am9','Dm9','G13'],
    jazz:[[36,47,52,59,62],[45,55,59,64,71],[38,48,52,57,64],[43,53,57,64,69]],
    orchestral:[[36,43,52,59,64,71],[45,52,57,64,71,76],[38,45,52,57,64,69],[43,50,57,64,69,76]],
    melody:[64,67,71,69,64,62,59,57]
  },
  {
    id:'three-six-two-five-one',name:'Long homecoming',emojis:'🛤️🌅🏡',roman:'iii–VI–ii–V–I',
    chordNames:['Em9','A13','Dm9','G13','Cmaj9'],
    jazz:[[40,50,55,59,66],[45,55,61,64,71],[38,48,52,57,64],[43,53,57,64,69],[36,47,52,59,62]],
    orchestral:[[40,47,55,59,66,71],[45,52,57,61,67,71],[38,45,52,57,64,69],[43,50,57,64,69,76],[36,43,52,59,64,71]],
    melody:[71,69,67,66,64,62,59,60]
  },
  {
    id:'minor-two-five-one',name:'Midnight resolve',emojis:'🌙🌫️🕯️',roman:'iiø–V–i',
    chordNames:['Dm7♭5','G7alt','CmMaj9','CmMaj9'],
    jazz:[[38,48,51,56,63],[43,53,56,59,63],[36,47,51,55,62],[36,47,51,55,62]],
    orchestral:[[38,44,51,56,63,68],[43,50,56,59,63,68],[36,43,51,55,62,67],[36,43,51,55,62,71]],
    melody:[63,62,59,56,55,59,62,63]
  },
  {
    id:'backdoor',name:'Wistful return',emojis:'🍁💛🏠',roman:'ivm–♭VII–I',
    chordNames:['Fm9','B♭13','Cmaj9','Cmaj9'],
    jazz:[[41,51,56,60,67],[46,56,60,67,72],[36,47,52,59,62],[36,47,52,59,64]],
    orchestral:[[41,48,56,60,67,72],[46,53,60,67,72,77],[36,43,52,59,64,71],[36,43,52,59,64,76]],
    melody:[67,68,72,70,67,64,62,60]
  },
  {
    id:'tritone-home',name:'Velvet turn',emojis:'🪩🌌✨',roman:'ii–♭II–I',
    chordNames:['Dm9','D♭13','Cmaj9','Cmaj9'],
    jazz:[[38,48,52,57,64],[37,47,53,56,63],[36,47,52,59,62],[36,47,52,59,64]],
    orchestral:[[38,45,52,57,64,69],[37,44,53,56,63,68],[36,43,52,59,64,71],[36,43,52,59,64,76]],
    melody:[69,68,65,63,62,60,59,60]
  },
]

const byId = new Map(woodlandProgressions.map(item=>[item.id,item]))

export function forestAudio(){
  const context=new AudioContext(),music=context.createGain(),nature=context.createGain()
  music.connect(context.destination);nature.connect(context.destination)
  const birds=new Audio('/woodland/forest-birds.mp3');birds.loop=true;birds.preload='auto'
  context.createMediaElementSource(birds).connect(nature)

  const reverb=context.createConvolver(),wet=context.createGain();wet.gain.value=.18
  const impulse=context.createBuffer(2,context.sampleRate*2.8,context.sampleRate)
  for(let ch=0;ch<2;ch++){const data=impulse.getChannelData(ch);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*Math.pow(1-i/data.length,3.2)*.28}
  reverb.buffer=impulse;reverb.connect(wet);wet.connect(music)

  let chordStep=0,progressionStep=0,active=false,next=0,enabled=['two-five-one']
  let mode:WoodlandSoundMode='piano'
  const auditionNodes=new Set<OscillatorNode>(),ambientNodes=new Set<OscillatorNode>()

  function hz(midi:number){return 440*Math.pow(2,(midi-69)/12)}
  function voice(midi:number,time:number,duration:number,volume:number,tracking?:Set<OscillatorNode>,teacher=false){
    const gain=context.createGain()
    const oscillators:OscillatorNode[]=[]
    if(teacher){
      const fundamental=context.createOscillator(),upper=context.createOscillator()
      fundamental.type='triangle';upper.type='sine'
      fundamental.frequency.value=hz(midi);upper.frequency.value=hz(midi)*2.01
      const attack=.012,release=Math.max(.3,duration*.72)
      gain.gain.setValueAtTime(.0001,time)
      gain.gain.exponentialRampToValueAtTime(volume,time+attack)
      gain.gain.exponentialRampToValueAtTime(Math.max(.0002,volume*.16),time+Math.min(.8,duration*.28))
      gain.gain.exponentialRampToValueAtTime(.0001,time+release)
      fundamental.connect(gain);upper.connect(gain);upper.detune.value=4
      oscillators.push(fundamental,upper)
    }else{
      const a=context.createOscillator(),b=context.createOscillator()
      a.type='sine';b.type='triangle';a.frequency.value=hz(midi);b.frequency.value=hz(midi);b.detune.value=7
      gain.gain.setValueAtTime(.0001,time);gain.gain.linearRampToValueAtTime(volume,time+.45);gain.gain.exponentialRampToValueAtTime(.0001,time+duration)
      a.connect(gain);b.connect(gain);oscillators.push(a,b)
    }
    gain.connect(music);if(!teacher)gain.connect(reverb)
    for(const osc of oscillators){tracking?.add(osc);osc.start(time);osc.stop(time+duration+.12);osc.onended=()=>{tracking?.delete(osc);osc.disconnect()}}
  }

  function playChord(chord:number[],start:number,duration:number,tracking?:Set<OscillatorNode>,teacher=false){
    chord.forEach(n=>voice(n,start,duration,teacher?.05:.034,tracking,teacher))
  }
  function playMelody(notes:number[],start:number,total:number,tracking?:Set<OscillatorNode>){
    if(mode!=='game')return
    const step=total/notes.length
    notes.forEach((n,i)=>voice(n,start+i*step,Math.max(.45,step*.78),.018,tracking,false))
  }
  function stopNodes(nodes:Set<OscillatorNode>){for(const osc of nodes){try{osc.stop()}catch{}}nodes.clear()}
  function stopAudition(){stopNodes(auditionNodes)}
  function stopAmbient(){active=false;birds.pause();stopNodes(ambientNodes);next=0}
  function selectedChords(p:WoodlandProgression){return mode==='piano'?p.jazz:p.orchestral}

  const timer=window.setInterval(()=>{if(!active||context.state!=='running'||context.currentTime<next-1)return
    const available=enabled.map(id=>byId.get(id)).filter((item):item is WoodlandProgression=>Boolean(item))
    if(!available.length){next=context.currentTime+1;return}
    const progression=available[progressionStep%available.length],chords=selectedChords(progression)
    const start=Math.max(context.currentTime+.1,next),chord=chords[chordStep%chords.length]
    playChord(chord,start,9.8,ambientNodes,false)
    if(chordStep%chords.length===0)playMelody(progression.melody,start,Math.max(8,chords.length*9),ambientNodes)
    chordStep++
    if(chordStep%chords.length===0)progressionStep++
    next=start+10.5
  },350)

  return {
    levels:(n:number,m:number)=>{nature.gain.setTargetAtTime(n,context.currentTime,.25);music.gain.setTargetAtTime(m,context.currentTime,.25)},
    setProgressions:(ids:string[])=>{enabled=ids.filter(id=>byId.has(id));chordStep=0;progressionStep=0;next=0},
    setMode:(nextMode:WoodlandSoundMode)=>{mode=nextMode},
    audition:async(id:string)=>{const progression=byId.get(id);if(!progression)return;stopAudition();await context.resume();const chords=selectedChords(progression),teacher=mode==='piano',step=teacher?1.55:1.8,start=context.currentTime+.06;chords.forEach((chord,i)=>playChord(chord,start+i*step,teacher?1.3:1.65,auditionNodes,teacher));playMelody(progression.melody,start,chords.length*step,auditionNodes)},
    stopAudition,
    start:async()=>{stopAudition();active=true;await Promise.all([context.resume(),birds.play()])},
    pause:()=>{stopAmbient();stopAudition();void context.suspend()},
    pauseAmbient:stopAmbient,
    dispose:()=>{stopAmbient();stopAudition();clearInterval(timer);birds.removeAttribute('src');birds.load();void context.close()},
  }
}