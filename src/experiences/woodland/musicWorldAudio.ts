import * as Tone from 'tone'
import {
  chordNotes,melodyCandidates,melodyNotes,moodDefinition,
  type MelodyCandidate,type MoodId
} from './musicWorld'

const VSCO='https://raw.githubusercontent.com/sgossner/VSCO-2-CE/1.1.0/'
function raw(path:string){return VSCO+path.split('/').map(encodeURIComponent).join('/')}
const maps={
  violin:{C4:raw('Strings/Violin Section/susVib/VlnEns_susVib_C4_v1.wav'),E4:raw('Strings/Violin Section/susVib/VlnEns_susVib_E4_v1.wav'),G4:raw('Strings/Violin Section/susVib/VlnEns_susVib_G4_v1.wav'),B4:raw('Strings/Violin Section/susVib/VlnEns_susVib_B4_v1.wav'),D5:raw('Strings/Violin Section/susVib/VlnEns_susVib_D5_v1.wav')},
  viola:{D3:raw('Strings/Viola Section/susvib/ViolaEns_susvib_D3_v1_1.wav'),C4:raw('Strings/Viola Section/susvib/ViolaEns_susvib_C4_v1_1.wav'),E4:raw('Strings/Viola Section/susvib/ViolaEns_susvib_E4_v1_1.wav'),G4:raw('Strings/Viola Section/susvib/ViolaEns_susvib_G4_v1_1.wav'),B4:raw('Strings/Viola Section/susvib/ViolaEns_susvib_B4_v1_1.wav')},
  cello:{C3:raw('Strings/Cello Section/susvib/susvib_C3_v1_1.wav'),E3:raw('Strings/Cello Section/susvib/susvib_E3_v1_1.wav'),G3:raw('Strings/Cello Section/susvib/susvib_G3_v1_1.wav'),B3:raw('Strings/Cello Section/susvib/susvib_B3_v1_1.wav'),D4:raw('Strings/Cello Section/susvib/susvib_D4_v1_1.wav')},
  horn:{A2:raw('Brass/F Horn/sus/MOHorn_sus_A2_v1_1.wav'),C3:raw('Brass/F Horn/sus/MOHorn_sus_C3_v1_1.wav'),D4:raw('Brass/F Horn/sus/MOHorn_sus_D4_v1_1.wav'),F4:raw('Brass/F Horn/sus/MOHorn_sus_F4_v1_1.wav')},
  flute:{C4:raw('Woodwinds/Flute/susNV/LDFlute_susNV_C4_v1_1.wav'),E4:raw('Woodwinds/Flute/susNV/LDFlute_susNV_E4_v1_1.wav'),A4:raw('Woodwinds/Flute/susNV/LDFlute_susNV_A4_v1_1.wav'),C5:raw('Woodwinds/Flute/susNV/LDFlute_susNV_C5_v1_1.wav'),E5:raw('Woodwinds/Flute/susNV/LDFlute_susNV_E5_v1_1.wav')}
}
type Set={violin:Tone.Sampler;viola:Tone.Sampler;cello:Tone.Sampler;horn:Tone.Sampler;flute:Tone.Sampler}
const note=(midi:number)=>Tone.Frequency(midi,'midi').toNote()
const fit=(midi:number,min:number,max:number)=>{let n=midi;while(n<min)n+=12;while(n>max)n-=12;return n}
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n))

function readRatings():Record<string,0|1|2|3>{
  if(typeof localStorage==='undefined')return {}
  try{return JSON.parse(localStorage.getItem('woodland-melody-ratings-v1')||'{}')}catch{return {}}
}
function preferredCandidate(mood:MoodId){
  const ratings=readRatings(),items=melodyCandidates(mood)
  return items.map((item,index)=>({item,index,rating:ratings[mood+'|'+item.id]??0}))
    .sort((a,b)=>b.rating-a.rating||a.index-b.index)[0].item
}

export function woodlandWorldScore(){
  const reverb=new Tone.Reverb({decay:5.2,preDelay:.035,wet:.42}).toDestination()
  const limiter=new Tone.Limiter(-1.2).connect(reverb)
  const master=new Tone.Gain(.58).connect(limiter)
  const readyReverb=reverb.generate()
  let set:Set|null=null,loading:Promise<void>|null=null,timer:number|null=null
  let active=false,currentMood:MoodId='hearth',volume=.58,generation=0

  function load(){
    if(set)return Promise.resolve()
    if(loading)return loading
    loading=(async()=>{
      set={
        violin:new Tone.Sampler({urls:maps.violin,attack:.05,release:2.1}).connect(master),
        viola:new Tone.Sampler({urls:maps.viola,attack:.055,release:2.05}).connect(master),
        cello:new Tone.Sampler({urls:maps.cello,attack:.06,release:2.2}).connect(master),
        horn:new Tone.Sampler({urls:maps.horn,attack:.08,release:2.35}).connect(master),
        flute:new Tone.Sampler({urls:maps.flute,attack:.045,release:1.65}).connect(master),
      }
      await Tone.loaded();await readyReverb
    })()
    return loading
  }
  function releaseAll(){if(!set)return;for(const instrument of Object.values(set))instrument.releaseAll()}
  function clear(){if(timer!==null){window.clearTimeout(timer);timer=null};generation++;releaseAll()}
  function hit(instrument:Tone.Sampler|undefined,midi:number,time:number,duration:number,velocity:number){
    instrument?.triggerAttackRelease(note(midi),Math.max(.18,duration),time,clamp(velocity,.05,1))
  }

  function schedule(moodId:MoodId,candidate:MelodyCandidate,loop:boolean){
    if(!set)return 0
    const mood=moodDefinition(moodId),beat=60/mood.bpm,bar=beat*4,total=bar*4,start=Tone.now()+.12
    reverb.wet.rampTo(mood.room,.35)
    for(let b=0;b<4;b++){
      const chord=chordNotes(moodId,b),t=start+b*bar
      hit(set.cello,fit(chord[0]-12,36,55),t,bar*.96,.26+.025*mood.density)
      hit(set.viola,fit(chord[1],48,72),t+.05,bar*.88,.18+.022*mood.density)
      hit(set.violin,fit(chord[2]+12,60,88),t+.11,bar*.8,.14+.018*mood.density)
      if(mood.density>=3)hit(set.horn,fit(chord[0],43,67),t+.17,bar*.74,.11+.02*mood.density)
      if(mood.density>=4&&b%2===1)hit(set.flute,fit(chord[3]+12,67,92),t+.28,bar*.5,.08+.012*mood.density)
      if((moodId==='adventure'||moodId==='peril')&&mood.density>=4){
        for(let pulse=0;pulse<4;pulse++)hit(set.viola,fit(chord[1],48,72),t+pulse*beat,beat*.58,.12)
      }
    }
    const notes=melodyNotes(moodId,candidate.id)
    let cursor=0
    const lead=mood.lead==='flute'?set.flute:set.violin
    candidate.rhythm.forEach((beats,index)=>{
      const t=start+cursor*beat,dur=Math.max(.28,beats*beat*.78),midi=fit(notes[index],mood.lead==='flute'?64:58,mood.lead==='flute'?96:91)
      hit(lead,midi,t,dur,.24+(moodId==='triumph'?.08:0))
      if(moodId==='triumph'&&index>=4)hit(set.horn,fit(midi-12,48,72),t+.04,dur*.9,.15)
      cursor+=beats
    })
    if(loop){
      const token=++generation
      timer=window.setTimeout(()=>{if(active&&token===generation)schedule(currentMood,preferredCandidate(currentMood),true)},Math.max(1000,(total-.15)*1000))
    }
    return total
  }

  async function playMood(moodId:MoodId,candidate?:MelodyCandidate,loop=false){
    clear();await Tone.start();await load();master.gain.rampTo(volume,.22)
    return schedule(moodId,candidate??preferredCandidate(moodId),loop)
  }

  return {
    setVolume:(value:number)=>{volume=clamp(value,0,1);master.gain.rampTo(volume,.25)},
    setMood:(mood:MoodId)=>{if(mood===currentMood)return;currentMood=mood;if(active)void playMood(currentMood,undefined,true)},
    start:async()=>{active=true;await playMood(currentMood,undefined,true)},
    preview:async(mood:MoodId,candidateId:string)=>{active=false;const candidate=melodyCandidates(mood).find(x=>x.id===candidateId)??melodyCandidates(mood)[0];return playMood(mood,candidate,false)},
    stop:()=>{active=false;clear()},
    pause:()=>{active=false;clear()},
    dispose:()=>{active=false;clear();if(set)for(const instrument of Object.values(set))instrument.dispose();master.dispose();limiter.dispose();reverb.dispose()},
  }
}
