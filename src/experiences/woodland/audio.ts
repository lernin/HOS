export type MusicRating = 0|1|2|3
export type WoodlandProgression = {id:string;name:string;emojis:string;chords:number[][]}

export const woodlandProgressions: WoodlandProgression[] = [
  {id:'sunlit',name:'Sunlit trail',emojis:'🌤️🌿✨',chords:[[50,57,61,64,69],[47,54,57,62,66],[43,50,57,59,66],[45,52,57,59,64]]},
  {id:'wide-sky',name:'Wide sky',emojis:'🌌🕊️💙',chords:[[50,57,61,64,69],[45,52,57,61,64],[47,54,57,62,66],[43,50,57,59,66]]},
  {id:'moss',name:'Soft moss',emojis:'🌿🍃🤎',chords:[[47,54,57,62,66],[43,50,57,59,66],[50,57,61,64,69],[45,52,57,59,64]]},
  {id:'river',name:'River bend',emojis:'💧🫧🌊',chords:[[43,50,57,59,66],[50,57,61,64,69],[45,52,57,61,64],[47,54,57,62,66]]},
  {id:'homeward',name:'Homeward',emojis:'🏡🔥🌙',chords:[[43,50,57,59,66],[47,54,57,62,66],[45,52,57,59,64],[50,57,61,64,69]]},
  {id:'dawn',name:'First light',emojis:'🌅🌱☀️',chords:[[50,57,61,66,69],[43,50,57,59,66],[50,57,61,64,69],[45,52,57,61,64]]},
  {id:'mystery',name:'Hidden path',emojis:'🌫️🦉🔮',chords:[[52,59,62,67,71],[43,50,57,59,66],[50,57,61,64,69],[45,52,57,59,64]]},
  {id:'campfire',name:'Afterglow',emojis:'🔥🌲🧡',chords:[[47,54,57,62,66],[45,52,57,61,64],[43,50,57,59,66],[50,57,61,64,69]]},
]

const byId = new Map(woodlandProgressions.map(item=>[item.id,item]))

/** Original synthesized woodland music expanded into a small user-curated palette. */
export function forestAudio(){
  const context=new AudioContext(),music=context.createGain(),nature=context.createGain()
  music.connect(context.destination);nature.connect(context.destination)
  const birds=new Audio('/woodland/forest-birds.mp3');birds.loop=true;birds.preload='auto'
  context.createMediaElementSource(birds).connect(nature)
  const reverb=context.createConvolver(),wet=context.createGain();wet.gain.value=.22
  const impulse=context.createBuffer(2,context.sampleRate*3,context.sampleRate)
  for(let ch=0;ch<2;ch++){const data=impulse.getChannelData(ch);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*Math.pow(1-i/data.length,3)*.35}
  reverb.buffer=impulse;reverb.connect(wet);wet.connect(music)
  let chordStep=0,progressionStep=0,active=false,next=0,enabled=['sunlit']
  const auditionNodes=new Set<OscillatorNode>(),ambientNodes=new Set<OscillatorNode>()
  function note(midi:number,time:number,duration:number,volume:number,tracking?:Set<OscillatorNode>){
    const osc=context.createOscillator(),gain=context.createGain();osc.type='sine';osc.frequency.value=440*Math.pow(2,(midi-69)/12)
    gain.gain.setValueAtTime(0,time);gain.gain.linearRampToValueAtTime(volume,time+.8);gain.gain.exponentialRampToValueAtTime(.0001,time+duration)
    osc.connect(gain);gain.connect(music);gain.connect(reverb);tracking?.add(osc);osc.start(time);osc.stop(time+duration+.1);osc.onended=()=>{tracking?.delete(osc);osc.disconnect();gain.disconnect()}
  }
  function playChord(chord:number[],start:number,duration=11,tracking?:Set<OscillatorNode>){
    chord.slice(0,4).forEach((n,i)=>note(n,start+i*.09,duration,.055,tracking))
    ;[chord[4],chord[2]+12,chord[3]+12].forEach((n,i)=>note(n,start+Math.min(2,duration*.25)+i*Math.max(.6,duration*.22),Math.max(1.4,duration*.45),.032,tracking))
  }
  function stopNodes(nodes:Set<OscillatorNode>){for(const osc of nodes){try{osc.stop()}catch{}}nodes.clear()}
  function stopAudition(){stopNodes(auditionNodes)}
  function stopAmbient(){active=false;birds.pause();stopNodes(ambientNodes);next=0}
  const timer=window.setInterval(()=>{if(!active||context.state!=='running'||context.currentTime<next-1)return
    const available=enabled.map(id=>byId.get(id)).filter((item):item is WoodlandProgression=>Boolean(item))
    if(!available.length){next=context.currentTime+1;return}
    const progression=available[progressionStep%available.length]
    const start=Math.max(context.currentTime+.1,next),chord=progression.chords[chordStep%progression.chords.length]
    playChord(chord,start,11,ambientNodes)
    chordStep++
    if(chordStep%progression.chords.length===0)progressionStep++
    next=start+12
  },400)
  return {
    levels:(n:number,m:number)=>{nature.gain.setTargetAtTime(n,context.currentTime,.25);music.gain.setTargetAtTime(m,context.currentTime,.25)},
    setProgressions:(ids:string[])=>{enabled=ids.filter(id=>byId.has(id));chordStep=0;progressionStep=0;next=0},
    audition:async(id:string)=>{const progression=byId.get(id);if(!progression)return;stopAudition();await context.resume();const start=context.currentTime+.08;progression.chords.forEach((chord,i)=>playChord(chord,start+i*1.55,2.2,auditionNodes))},
    stopAudition,
    start:async()=>{stopAudition();active=true;await Promise.all([context.resume(),birds.play()])},
    pause:()=>{stopAmbient();stopAudition();void context.suspend()},
    pauseAmbient:stopAmbient,
    dispose:()=>{stopAmbient();stopAudition();clearInterval(timer);birds.removeAttribute('src');birds.load();void context.close()},
  }
}
