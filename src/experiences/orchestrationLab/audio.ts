import * as Tone from 'tone'

export type BuiltInSource='vsco'|'legacy'|'piano'
export type OrchestrationCharacter='air'|'voices'|'luminous'|'color'|'sacred'|'pulse'|'cinematic'
export type ChordId='cmaj9'|'dm9'|'amadd9'|'fmaj7a'

export const chordChoices:{id:ChordId;label:string;notes:number[]}[]=[
  {id:'cmaj9',label:'Cmaj9 · open',notes:[48,55,59,62,64]},
  {id:'dm9',label:'Dm9 · warm',notes:[50,57,60,64,69]},
  {id:'amadd9',label:'Am(add9) · wistful',notes:[45,52,59,60,64]},
  {id:'fmaj7a',label:'Fmaj7/A · floating',notes:[45,53,57,60,64]}
]

export const orchestrationCharacters:{id:OrchestrationCharacter;name:string;reference:string;description:string}[]=[
  {id:'air',name:'Air & Space',reference:'Satie reference',description:'Sparse voicing, soft entrances, lots of room, almost nothing unnecessary.'},
  {id:'voices',name:'Clear Voices',reference:'Bach reference',description:'Independent registers enter clearly so every voice can be heard.'},
  {id:'luminous',name:'Luminous Lines',reference:'Palestrina reference',description:'Balanced sustained voices with smooth spacing and no heavy dominance.'},
  {id:'color',name:'Orchestral Color',reference:'Ravel reference',description:'Wide register, contrasting timbres, and a small bright color above the chord.'},
  {id:'sacred',name:'Sacred Bells',reference:'sparse sacred minimalism',description:'Pure intervals, restrained density, long decay, and bell-like stillness.'},
  {id:'pulse',name:'Minimal Pulse',reference:'repetitive minimalism',description:'The same harmony breathes through gentle repeated entrances and gradual layering.'},
  {id:'cinematic',name:'Cinematic Layers',reference:'modern cinematic scoring',description:'Low foundation, broad middle, high air, and a slow emotional rise.'}
]

const VSCO='https://raw.githubusercontent.com/sgossner/VSCO-2-CE/1.1.0/'
const LEGACY='https://nbrosowsky.github.io/tonejs-instruments/samples/'
const SALAMANDER='https://tonejs.github.io/audio/salamander/'

function raw(path:string){return VSCO+path.split('/').map(encodeURIComponent).join('/')}
function note(midi:number){return Tone.Frequency(midi,'midi').toNote()}
function chordFor(id:ChordId){return chordChoices.find(c=>c.id===id)!.notes}
function clamp(n:number,a:number,b:number){return Math.max(a,Math.min(b,n))}
function fit(midi:number,min:number,max:number){let n=midi;while(n<min)n+=12;while(n>max)n-=12;return n}
function unique(notes:number[]){return [...new Set(notes)]}
function voice(notes:number[],index:number,octave=0){const n=notes[Math.max(0,Math.min(notes.length-1,index))];return n+octave*12}

const vscoMaps={
  violin:{
    C4:raw('Strings/Violin Section/susVib/VlnEns_susVib_C4_v1.wav'),
    E4:raw('Strings/Violin Section/susVib/VlnEns_susVib_E4_v1.wav'),
    G4:raw('Strings/Violin Section/susVib/VlnEns_susVib_G4_v1.wav'),
    B4:raw('Strings/Violin Section/susVib/VlnEns_susVib_B4_v1.wav'),
    D5:raw('Strings/Violin Section/susVib/VlnEns_susVib_D5_v1.wav')
  },
  viola:{
    C4:raw('Strings/Viola Section/susvib/ViolaEns_susvib_C4_v1_1.wav'),
    E4:raw('Strings/Viola Section/susvib/ViolaEns_susvib_E4_v1_1.wav'),
    G4:raw('Strings/Viola Section/susvib/ViolaEns_susvib_G4_v1_1.wav'),
    B4:raw('Strings/Viola Section/susvib/ViolaEns_susvib_B4_v1_1.wav'),
    D3:raw('Strings/Viola Section/susvib/ViolaEns_susvib_D3_v1_1.wav')
  },
  cello:{
    C3:raw('Strings/Cello Section/susvib/susvib_C3_v1_1.wav'),
    E3:raw('Strings/Cello Section/susvib/susvib_E3_v1_1.wav'),
    G3:raw('Strings/Cello Section/susvib/susvib_G3_v1_1.wav'),
    B3:raw('Strings/Cello Section/susvib/susvib_B3_v1_1.wav'),
    D4:raw('Strings/Cello Section/susvib/susvib_D4_v1_1.wav')
  },
  horn:{
    C3:raw('Brass/F Horn/sus/MOHorn_sus_C3_v1_1.wav'),
    A3:raw('Brass/F Horn/sus/MOHorn_sus_A2_v1_1.wav'),
    D4:raw('Brass/F Horn/sus/MOHorn_sus_D4_v1_1.wav'),
    F4:raw('Brass/F Horn/sus/MOHorn_sus_F4_v1_1.wav')
  },
  flute:{
    C4:raw('Woodwinds/Flute/susNV/LDFlute_susNV_C4_v1_1.wav'),
    E4:raw('Woodwinds/Flute/susNV/LDFlute_susNV_E4_v1_1.wav'),
    A4:raw('Woodwinds/Flute/susNV/LDFlute_susNV_A4_v1_1.wav'),
    C5:raw('Woodwinds/Flute/susNV/LDFlute_susNV_C5_v1_1.wav'),
    E5:raw('Woodwinds/Flute/susNV/LDFlute_susNV_E5_v1_1.wav')
  }
}

const legacyMaps={
  violin:{G3:'G3.mp3',A3:'A3.mp3',C4:'C4.mp3',E4:'E4.mp3',G4:'G4.mp3',A4:'A4.mp3',C5:'C5.mp3',E5:'E5.mp3',G5:'G5.mp3'},
  cello:{C2:'C2.mp3',E2:'E2.mp3',G2:'G2.mp3',A2:'A2.mp3',C3:'C3.mp3',E3:'E3.mp3',G3:'G3.mp3',A3:'A3.mp3',C4:'C4.mp3',E4:'E4.mp3',G4:'G4.mp3'},
  horn:{A1:'A1.mp3',C2:'C2.mp3','D#2':'Ds2.mp3',G2:'G2.mp3',D3:'D3.mp3',F3:'F3.mp3',A3:'A3.mp3',C4:'C4.mp3',D5:'D5.mp3',F5:'F5.mp3'},
  flute:{C4:'C4.mp3',E4:'E4.mp3',A4:'A4.mp3',C5:'C5.mp3',E5:'E5.mp3',A5:'A5.mp3',C6:'C6.mp3',E6:'E6.mp3'}
}

const pianoUrls={
  A0:'A0.mp3',C1:'C1.mp3','D#1':'Ds1.mp3','F#1':'Fs1.mp3',A1:'A1.mp3',C2:'C2.mp3','D#2':'Ds2.mp3','F#2':'Fs2.mp3',
  A2:'A2.mp3',C3:'C3.mp3','D#3':'Ds3.mp3','F#3':'Fs3.mp3',A3:'A3.mp3',C4:'C4.mp3','D#4':'Ds4.mp3','F#4':'Fs4.mp3',
  A4:'A4.mp3',C5:'C5.mp3','D#5':'Ds5.mp3','F#5':'Fs5.mp3',A5:'A5.mp3',C6:'C6.mp3'
}

type Samplers={
  violin:Tone.Sampler
  viola?:Tone.Sampler
  cello:Tone.Sampler
  horn:Tone.Sampler
  flute:Tone.Sampler
}

export function orchestrationPlayer(){
  const reverb=new Tone.Reverb({decay:4.5,preDelay:.03,wet:.3}).toDestination()
  const limiter=new Tone.Limiter(-1).connect(reverb)
  const master=new Tone.Gain(.76).connect(limiter)
  const readyReverb=reverb.generate()
  let vsco:Samplers|null=null,legacy:Samplers|null=null,piano:Tone.Sampler|null=null
  let timer:number|null=null

  function clearTimer(){if(timer!==null){window.clearTimeout(timer);timer=null}}
  function releaseAll(){for(const set of [vsco,legacy])if(set){set.violin.releaseAll();set.viola?.releaseAll();set.cello.releaseAll();set.horn.releaseAll();set.flute.releaseAll()}piano?.releaseAll()}
  function stop(){clearTimer();releaseAll()}

  async function loadVsco(){
    if(vsco)return
    const violin=new Tone.Sampler({urls:vscoMaps.violin,attack:.05,release:2.2}).connect(master)
    const viola=new Tone.Sampler({urls:vscoMaps.viola,attack:.055,release:2.15}).connect(master)
    const cello=new Tone.Sampler({urls:vscoMaps.cello,attack:.06,release:2.3}).connect(master)
    const horn=new Tone.Sampler({urls:vscoMaps.horn,attack:.08,release:2.4}).connect(master)
    const flute=new Tone.Sampler({urls:vscoMaps.flute,attack:.045,release:1.8}).connect(master)
    vsco={violin,viola,cello,horn,flute}
    await Tone.loaded()
  }

  async function loadLegacy(){
    if(legacy)return
    const violin=new Tone.Sampler({urls:legacyMaps.violin,baseUrl:LEGACY+'violin/',attack:.05,release:1.8}).connect(master)
    const cello=new Tone.Sampler({urls:legacyMaps.cello,baseUrl:LEGACY+'cello/',attack:.06,release:1.9}).connect(master)
    const horn=new Tone.Sampler({urls:legacyMaps.horn,baseUrl:LEGACY+'french-horn/',attack:.08,release:2.1}).connect(master)
    const flute=new Tone.Sampler({urls:legacyMaps.flute,baseUrl:LEGACY+'flute/',attack:.045,release:1.5}).connect(master)
    legacy={violin,cello,horn,flute}
    await Tone.loaded()
  }

  async function loadPiano(){if(!piano){piano=new Tone.Sampler({urls:pianoUrls,baseUrl:SALAMANDER,attack:.004,release:2}).connect(master);await Tone.loaded()}}

  function hit(sampler:Tone.Sampler|undefined,midi:number,time:number,duration:number,velocity:number){
    sampler?.triggerAttackRelease(note(midi),duration,time,clamp(velocity,.08,1))
  }

  function playPiano(character:OrchestrationCharacter,notes:number[],start:number,duration:number){
    if(!piano)return
    const n=notes.map(x=>fit(x,45,84))
    if(character==='air'){
      n.forEach((m,i)=>hit(piano,m,start+i*.07,duration*(.88-i*.035),.5-i*.035))
    }else if(character==='voices'){
      n.forEach((m,i)=>hit(piano,m,start+i*.14,duration*.82,.5))
    }else if(character==='luminous'){
      hit(piano,n[0],start,duration,.48);hit(piano,n[2],start+.03,duration,.43);hit(piano,n[n.length-1]+12,start+.06,duration*.9,.34)
    }else if(character==='color'){
      n.forEach((m,i)=>hit(piano,m+(i===n.length-1?12:0),start+i*.035,duration*.9,.48-i*.025))
    }else if(character==='sacred'){
      hit(piano,n[0],start,duration,.42);hit(piano,n[1],start+.12,duration*.92,.33);hit(piano,n[n.length-1]+12,start+.22,duration*.78,.28)
    }else if(character==='pulse'){
      for(let p=0;p<4;p++)n.slice(1).forEach((m,i)=>hit(piano,m,start+p*1.15+i*.025,.72,.32+p*.035))
      hit(piano,n[0],start,duration,.34)
    }else{
      hit(piano,n[0]-12,start,duration,.4);n.forEach((m,i)=>hit(piano,m,start+.12+i*.03,duration*.92,.43));hit(piano,n[n.length-1]+12,start+.28,duration*.75,.27)
    }
  }

  function playOrchestra(set:Samplers,character:OrchestrationCharacter,source:BuiltInSource,notes:number[],start:number,duration:number){
    const celloLow=fit(voice(notes,0,-1),36,60)
    const celloMid=fit(voice(notes,1,0),43,67)
    const violaMid=fit(voice(notes,2,0),48,74)
    const violinHigh=fit(voice(notes,notes.length-1,1),60,91)
    const violinMid=fit(voice(notes,3,0),55,84)
    const hornMid=fit(voice(notes,2,-1),43,69)
    const fluteHigh=fit(voice(notes,notes.length-1,1),60,96)
    const viola=set.viola||set.violin

    if(character==='air'){
      hit(set.cello,celloLow,start,duration,.32)
      hit(viola,violaMid,start+.14,duration*.88,.24)
      hit(set.violin,violinHigh,start+.28,duration*.72,.2)
    }else if(character==='voices'){
      hit(set.cello,celloLow,start,duration*.92,.37)
      hit(set.cello,celloMid,start+.12,duration*.84,.28)
      hit(viola,violaMid,start+.24,duration*.78,.3)
      hit(set.violin,violinMid,start+.36,duration*.72,.3)
      hit(set.violin,violinHigh,start+.48,duration*.65,.24)
    }else if(character==='luminous'){
      hit(set.cello,celloLow,start,duration,.31)
      hit(viola,fit(voice(notes,1,0),48,72),start+.04,duration*.96,.28)
      hit(viola,violaMid,start+.07,duration*.93,.25)
      hit(set.violin,violinMid,start+.1,duration*.9,.24)
      hit(set.violin,violinHigh,start+.14,duration*.82,.19)
    }else if(character==='color'){
      hit(set.cello,celloLow,start,duration,.34)
      hit(viola,violaMid,start+.03,duration*.9,.27)
      hit(set.horn,hornMid,start+.08,duration*.88,.22)
      hit(set.violin,violinHigh,start+.12,duration*.82,.22)
      hit(set.flute,fluteHigh,start+.2,duration*.6,.14)
    }else if(character==='sacred'){
      hit(set.cello,celloLow,start,duration,.28)
      hit(viola,fit(notes[1],48,72),start+.16,duration*.9,.2)
      hit(set.violin,violinHigh,start+.3,duration*.76,.17)
      if(source==='vsco')hit(set.flute,fluteHigh,start+.48,duration*.5,.08)
    }else if(character==='pulse'){
      hit(set.cello,celloLow,start,duration,.27)
      for(let p=0;p<4;p++){
        const t=start+p*1.12
        hit(viola,violaMid,t,.66,.19+p*.02)
        hit(set.violin,violinMid,t+.08,.58,.16+p*.02)
        if(p>1)hit(set.flute,fluteHigh,t+.16,.42,.07)
      }
    }else{
      hit(set.cello,celloLow,start,duration,.42)
      hit(set.cello,fit(celloLow+12,43,67),start+.02,duration*.95,.31)
      hit(set.horn,hornMid,start+.1,duration*.9,.29)
      hit(viola,violaMid,start+.16,duration*.86,.25)
      hit(set.violin,violinMid,start+.22,duration*.8,.24)
      hit(set.violin,violinHigh,start+.3,duration*.72,.18)
      hit(set.flute,fluteHigh,start+.42,duration*.54,.09)
    }
  }

  async function play(source:BuiltInSource,character:OrchestrationCharacter,chord:ChordId,{room=.32,duration=6}:{room?:number;duration?:number}={}){
    stop();await Tone.start();await readyReverb;reverb.wet.value=clamp(room,0,.72)
    const notes=unique(chordFor(chord)).sort((a,b)=>a-b),start=Tone.now()+.08
    if(source==='piano'){await loadPiano();playPiano(character,notes,start,duration)}
    else if(source==='vsco'){await loadVsco();playOrchestra(vsco!,character,source,notes,start,duration)}
    else {await loadLegacy();playOrchestra(legacy!,character,source,notes,start,duration)}
    timer=window.setTimeout(()=>{releaseAll();timer=null},(duration+1.2)*1000)
  }

  return {
    play,stop,
    dispose:()=>{stop();for(const set of [vsco,legacy])if(set){set.violin.dispose();set.viola?.dispose();set.cello.dispose();set.horn.dispose();set.flute.dispose()}piano?.dispose();master.dispose();limiter.dispose();reverb.dispose()}
  }
}
