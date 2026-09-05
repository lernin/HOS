import * as Tone from 'tone'

export type TrackRating = 0|1|2|3
export type BackingFeel = 'swing'|'ballad'|'bossa'
export type MusicVoice = 'piano'|'synth'|'orchestra'
export type CompStyle = 'block'|'gentle'|'broken'|'pulse'
export type SynthPreset = 'warm'|'glass'|'velvet'
export type OrchestraPreset = 'strings'|'chamber'|'cinematic'

export type MusicSettings = {
  voice:MusicVoice
  style:CompStyle
  bpm:number
  register:number
  spread:number
  reverb:number
  bass:boolean
  synthPreset:SynthPreset
  orchestraPreset:OrchestraPreset
}

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
const SALAMANDER='https://tonejs.github.io/audio/salamander/'
const ORCHESTRA='https://nbrosowsky.github.io/tonejs-instruments/samples/'

const pianoUrls={
  A0:'A0.mp3',C1:'C1.mp3','D#1':'Ds1.mp3','F#1':'Fs1.mp3',A1:'A1.mp3',C2:'C2.mp3','D#2':'Ds2.mp3','F#2':'Fs2.mp3',
  A2:'A2.mp3',C3:'C3.mp3','D#3':'Ds3.mp3','F#3':'Fs3.mp3',A3:'A3.mp3',C4:'C4.mp3','D#4':'Ds4.mp3','F#4':'Fs4.mp3',
  A4:'A4.mp3',C5:'C5.mp3','D#5':'Ds5.mp3','F#5':'Fs5.mp3',A5:'A5.mp3',C6:'C6.mp3','D#6':'Ds6.mp3','F#6':'Fs6.mp3',A6:'A6.mp3',C7:'C7.mp3'
}
const violinUrls={G3:'G3.mp3',A3:'A3.mp3',C4:'C4.mp3',E4:'E4.mp3',G4:'G4.mp3',A4:'A4.mp3',C5:'C5.mp3',E5:'E5.mp3',G5:'G5.mp3',A5:'A5.mp3',C6:'C6.mp3'}
const celloUrls={C2:'C2.mp3',E2:'E2.mp3',G2:'G2.mp3',A2:'A2.mp3',C3:'C3.mp3',E3:'E3.mp3',G3:'G3.mp3',A3:'A3.mp3',C4:'C4.mp3',E4:'E4.mp3',G4:'G4.mp3'}
const hornUrls={A1:'A1.mp3',C2:'C2.mp3','D#2':'Ds2.mp3',G2:'G2.mp3',D3:'D3.mp3',F3:'F3.mp3',A3:'A3.mp3',C4:'C4.mp3',D5:'D5.mp3',F5:'F5.mp3'}
const fluteUrls={C4:'C4.mp3',E4:'E4.mp3',A4:'A4.mp3',C5:'C5.mp3',E5:'E5.mp3',A5:'A5.mp3',C6:'C6.mp3',E6:'E6.mp3',A6:'A6.mp3'}
const bassUrls={'F#1':'Fs1.mp3',G1:'G1.mp3','A#1':'As1.mp3',C2:'C2.mp3',D2:'D2.mp3',E2:'E2.mp3','F#2':'Fs2.mp3',A2:'A2.mp3','C#3':'Cs3.mp3',E3:'E3.mp3','G#3':'Gs3.mp3',B3:'B3.mp3'}

function note(midi:number){return Tone.Frequency(midi,'midi').toNote()}
function clamp(n:number,a:number,b:number){return Math.max(a,Math.min(b,n))}

export function backingTrackPlayer(){
  const reverb=new Tone.Reverb({decay:2.8,preDelay:.025,wet:.2}).toDestination()
  const master=new Tone.Gain(.82).connect(reverb)
  const readyReverb=reverb.generate()
  let piano:Tone.Sampler|null=null
  let violin:Tone.Sampler|null=null,cello:Tone.Sampler|null=null,horn:Tone.Sampler|null=null,flute:Tone.Sampler|null=null,bassSampler:Tone.Sampler|null=null
  let synth:Tone.PolySynth<Tone.Synth<Tone.SynthOptions>>|Tone.PolySynth<any>|null=null
  let synthPreset:SynthPreset|null=null
  let loop:Tone.Loop|null=null
  let endTimer:number|null=null
  let playingId:string|null=null

  function clearTimer(){if(endTimer!==null){window.clearTimeout(endTimer);endTimer=null}}
  function stop(){
    clearTimer()
    loop?.stop().dispose();loop=null
    const transport=Tone.getTransport();transport.stop();transport.cancel(0);transport.position=0
    piano?.releaseAll();violin?.releaseAll();cello?.releaseAll();horn?.releaseAll();flute?.releaseAll();bassSampler?.releaseAll()
    synth?.releaseAll()
    playingId=null
  }

  async function preparePiano(){
    if(!piano){
      piano=new Tone.Sampler({urls:pianoUrls,baseUrl:SALAMANDER,attack:.004,release:1.35}).connect(master)
      await Tone.loaded()
    }
  }

  async function prepareOrchestra(){
    if(!violin){
      violin=new Tone.Sampler({urls:violinUrls,baseUrl:ORCHESTRA+'violin/',attack:.05,release:1.7}).connect(master)
      cello=new Tone.Sampler({urls:celloUrls,baseUrl:ORCHESTRA+'cello/',attack:.06,release:1.8}).connect(master)
      horn=new Tone.Sampler({urls:hornUrls,baseUrl:ORCHESTRA+'french-horn/',attack:.08,release:2}).connect(master)
      flute=new Tone.Sampler({urls:fluteUrls,baseUrl:ORCHESTRA+'flute/',attack:.04,release:1.4}).connect(master)
      bassSampler=new Tone.Sampler({urls:bassUrls,baseUrl:ORCHESTRA+'contrabass/',attack:.035,release:1.25}).connect(master)
      await Tone.loaded()
    }
  }

  async function prepareBass(){if(!bassSampler){bassSampler=new Tone.Sampler({urls:bassUrls,baseUrl:ORCHESTRA+'contrabass/',attack:.035,release:1.25}).connect(master);await Tone.loaded()}}

  function prepareSynth(preset:SynthPreset){
    if(synth&&synthPreset===preset)return
    synth?.dispose();synthPreset=preset
    if(preset==='glass'){
      synth=new Tone.PolySynth(Tone.FMSynth,{harmonicity:2.8,modulationIndex:8,envelope:{attack:.01,decay:.7,sustain:.25,release:1.6},modulationEnvelope:{attack:.02,decay:.5,sustain:.15,release:1.1}}).connect(master)
    }else if(preset==='velvet'){
      synth=new Tone.PolySynth(Tone.AMSynth,{harmonicity:1.5,envelope:{attack:.45,decay:1.2,sustain:.65,release:2.8},modulationEnvelope:{attack:.6,decay:1.1,sustain:.45,release:2.4}}).connect(master)
    }else{
      synth=new Tone.PolySynth(Tone.Synth,{oscillator:{type:'triangle8'},envelope:{attack:.025,decay:.55,sustain:.42,release:1.5}}).connect(master)
    }
  }

  function shifted(chord:number[],settings:MusicSettings){const shift=Math.round(settings.register)*12;return chord.map(n=>note(n+shift))}
  function playPianoChord(chord:number[],time:number,duration:number,velocity:number,settings:MusicSettings){
    if(!piano)return
    const notes=shifted(chord,settings)
    const spread=clamp(settings.spread,0,1)*.045
    if(settings.style==='broken')notes.forEach((n,i)=>piano!.triggerAttackRelease(n,duration*.72,time+i*(.08+spread),velocity*(.94-i*.035)))
    else if(settings.style==='gentle'){
      piano.triggerAttackRelease(notes,duration,time,velocity)
      piano.triggerAttackRelease(notes.slice(-2),duration*.42,time+duration*.53,velocity*.55)
    }else if(settings.style==='pulse'){
      piano.triggerAttackRelease(notes,duration*.42,time,velocity)
      piano.triggerAttackRelease(notes,duration*.38,time+duration*.52,velocity*.72)
    }else piano.triggerAttackRelease(notes,duration,time,velocity)
  }

  function playSynthChord(chord:number[],time:number,duration:number,velocity:number,settings:MusicSettings){
    if(!synth)return
    const notes=shifted(chord,settings)
    if(settings.style==='broken')notes.forEach((n,i)=>synth!.triggerAttackRelease(n,duration*.72,time+i*(.075+settings.spread*.035),velocity))
    else if(settings.style==='pulse'){
      synth.triggerAttackRelease(notes,duration*.38,time,velocity)
      synth.triggerAttackRelease(notes,duration*.34,time+duration*.5,velocity*.82)
    }else synth.triggerAttackRelease(notes,duration,time,velocity)
  }

  function playOrchestraChord(chord:number[],time:number,duration:number,velocity:number,settings:MusicSettings){
    if(!violin||!cello||!horn||!flute)return
    const shift=Math.round(settings.register)*12
    const notes=chord.map(n=>n+shift).sort((a,b)=>a-b)
    const low=notes.slice(0,2).map(note),mid=notes.slice(1,Math.max(3,notes.length-1)).map(note),high=notes.slice(-2).map(note)
    cello.triggerAttackRelease(low,duration,time,velocity*.78)
    violin.triggerAttackRelease(high,duration,time+.025,velocity*.72)
    if(settings.orchestraPreset!=='strings')horn.triggerAttackRelease(mid,duration*.95,time+.04,velocity*.48)
    if(settings.orchestraPreset==='chamber')flute.triggerAttackRelease([note(notes[notes.length-1]+12)],duration*.72,time+.1,velocity*.32)
    if(settings.orchestraPreset==='cinematic'){
      violin.triggerAttackRelease(mid,duration*.92,time+.06,velocity*.45)
      horn.triggerAttackRelease(low.map(n=>Tone.Frequency(n).transpose(-12).toNote()),duration,time+.02,velocity*.4)
    }
  }

  function schedulePass(track:BackingTrack,start:number,settings:MusicSettings){
    const beat=60/clamp(settings.bpm,48,180),slot=beat*2
    track.chords.forEach((chord,i)=>{
      const time=start+i*slot+(i%2?settings.spread*.012:0),duration=slot*(settings.voice==='orchestra'?.94:.78)
      if(settings.voice==='piano')playPianoChord(chord,time,duration,.72,settings)
      else if(settings.voice==='orchestra')playOrchestraChord(chord,time,duration,.68,settings)
      else playSynthChord(chord,time,duration,.58,settings)
      if(settings.bass&&bassSampler){
        const root=track.roots[i]+Math.round(settings.register)*12
        bassSampler.triggerAttackRelease(note(root),slot*.72,time,.58)
        if(track.feel==='swing')bassSampler.triggerAttackRelease(note(root+7),slot*.26,time+beat,.36)
      }
    })
    return slot*track.chords.length
  }

  async function play(id:string,settings:MusicSettings,{repeat=false}:{repeat?:boolean}={}){
    const track=trackById.get(id);if(!track)return
    stop();playingId=id
    await Tone.start();await readyReverb
    reverb.wet.value=clamp(settings.reverb,0,.75)
    if(settings.voice==='piano')await preparePiano()
    if(settings.voice==='orchestra')await prepareOrchestra()
    if(settings.voice==='synth')prepareSynth(settings.synthPreset)
    if(settings.bass)await prepareBass()
    const start=Tone.now()+.08
    const cycle=schedulePass(track,start,settings)
    if(repeat){
      const transport=Tone.getTransport();transport.stop();transport.cancel(0);transport.position=0
      loop=new Tone.Loop(time=>{schedulePass(track,time+.03,settings)},cycle).start(cycle)
      transport.start()
    }else endTimer=window.setTimeout(()=>{if(playingId===id)playingId=null},(cycle+.5)*1000)
  }

  return {
    play,stop,getPlayingId:()=>playingId,
    dispose:()=>{stop();piano?.dispose();violin?.dispose();cello?.dispose();horn?.dispose();flute?.dispose();bassSampler?.dispose();synth?.dispose();master.dispose();reverb.dispose()}
  }
}
