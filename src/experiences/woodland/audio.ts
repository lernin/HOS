/** Original, deliberately sparse D-major ambient composition; no microphone use. */
export function forestAudio(){
  const context=new AudioContext(),music=context.createGain(),nature=context.createGain()
  music.connect(context.destination);nature.connect(context.destination)
  const birds=new Audio('/woodland/forest-birds.mp3');birds.loop=true;birds.preload='auto'
  context.createMediaElementSource(birds).connect(nature)
  const reverb=context.createConvolver(),wet=context.createGain();wet.gain.value=.22
  const impulse=context.createBuffer(2,context.sampleRate*3,context.sampleRate)
  for(let ch=0;ch<2;ch++){const data=impulse.getChannelData(ch);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*Math.pow(1-i/data.length,3)*.35}
  reverb.buffer=impulse;reverb.connect(wet);wet.connect(music)
  let phrase=0,active=false,next=0
  const chords=[[50,57,61,64,69],[47,54,57,62,66],[43,50,57,59,66],[45,52,57,59,64]]
  function note(midi:number,time:number,duration:number,volume:number){
    const osc=context.createOscillator(),gain=context.createGain();osc.type='sine';osc.frequency.value=440*Math.pow(2,(midi-69)/12)
    gain.gain.setValueAtTime(0,time);gain.gain.linearRampToValueAtTime(volume,time+.8);gain.gain.exponentialRampToValueAtTime(.0001,time+duration)
    osc.connect(gain);gain.connect(music);gain.connect(reverb);osc.start(time);osc.stop(time+duration+.1);osc.onended=()=>{osc.disconnect();gain.disconnect()}
  }
  const timer=window.setInterval(()=>{if(!active||context.state!=='running'||context.currentTime<next-1)return
    const start=Math.max(context.currentTime+.1,next),chord=chords[phrase++%4]
    chord.slice(0,4).forEach((n,i)=>note(n,start+i*.09,11,.055))
    ;[chord[4],chord[2]+12,chord[3]+12].forEach((n,i)=>note(n,start+2+i*2.7,5,.032))
    next=start+12
  },400)
  return {
    levels:(n:number,m:number)=>{nature.gain.setTargetAtTime(n,context.currentTime,.25);music.gain.setTargetAtTime(m,context.currentTime,.25)},
    start:async()=>{active=true;await Promise.all([context.resume(),birds.play()])},
    pause:()=>{active=false;birds.pause();void context.suspend()},
    dispose:()=>{active=false;clearInterval(timer);birds.pause();birds.removeAttribute('src');birds.load();void context.close()},
  }
}
