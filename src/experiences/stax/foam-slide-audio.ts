/**
 * Ten locally synthesized tactile tabletop friction textures.
 * No downloads, copyrighted recordings, network calls, or background music.
 * AudioContext is created only after a real pointer/click gesture.
 */
export const FOAM_SLIDE_SOUNDS=[
 {id:'felt',label:'1 · Felt on wood',frequency:500,lowpass:1250,q:.50,colour:.83,gain:.70,grain:.04},
 {id:'foam',label:'2 · Soft foam glide',frequency:760,lowpass:1950,q:.55,colour:.72,gain:.65,grain:.07},
 {id:'cardboard',label:'3 · Cardboard rub',frequency:1040,lowpass:2900,q:.65,colour:.55,gain:.83,grain:.16},
 {id:'rubber',label:'4 · Rubber drag',frequency:310,lowpass:960,q:1.10,colour:.9,gain:.82,grain:.28},
 {id:'cork',label:'5 · Cork on wood',frequency:560,lowpass:1600,q:1.45,colour:.74,gain:.90,grain:.32},
 {id:'paper',label:'6 · Paper shuffle',frequency:1690,lowpass:4400,q:.75,colour:.38,gain:.63,grain:.22},
 {id:'suede',label:'7 · Suede brush',frequency:850,lowpass:2050,q:.48,colour:.79,gain:.61,grain:.09},
 {id:'plastic',label:'8 · Plastic skitter',frequency:1940,lowpass:4800,q:1.6,colour:.25,gain:.55,grain:.54},
 {id:'wood',label:'9 · Wood scrape',frequency:640,lowpass:2400,q:1.15,colour:.59,gain:.89,grain:.41},
 {id:'grit',label:'10 · Fine grit',frequency:1320,lowpass:3700,q:1.0,colour:.42,gain:.64,grain:.65},
] as const
export type FoamSlideSoundId=typeof FOAM_SLIDE_SOUNDS[number]['id']
const DEFAULT_SOUND:FoamSlideSoundId='felt'
export function safeFoamSoundId(value:string|null):FoamSlideSoundId {
 return FOAM_SLIDE_SOUNDS.find(p=>p.id===value)?.id??DEFAULT_SOUND
}

export class FoamSlideAudio {
 private context:AudioContext|null=null
 private noise:AudioBufferSourceNode|null=null
 private band:BiquadFilterNode|null=null
 private low:BiquadFilterNode|null=null
 private gain:GainNode|null=null
 private enabled=true
 private active=false
 private preset:FoamSlideSoundId=DEFAULT_SOUND
 private last:{x:number;y:number;time:number}|null=null
 private previewTimers:Array<ReturnType<typeof setTimeout>>=[]

 setEnabled(value:boolean){this.enabled=value;if(!value)this.stop()}
 setPreset(value:FoamSlideSoundId){
  this.preset=safeFoamSoundId(value)
  this.applyPreset()
 }
 private profile(){return FOAM_SLIDE_SOUNDS.find(p=>p.id===this.preset)??FOAM_SLIDE_SOUNDS[0]}
 private applyPreset(){
  if(!this.context||!this.band||!this.low)return
  const p=this.profile(),t=this.context.currentTime
  this.band.frequency.setTargetAtTime(p.frequency,t,.035)
  this.band.Q.setTargetAtTime(p.q,t,.035)
  this.low.frequency.setTargetAtTime(p.lowpass,t,.035)
 }

 start(x:number,y:number){
  if(!this.enabled)return
  this.stopPreviewTimers()
  this.active=true
  this.last={x,y,time:performance.now()}
  try{
   const AudioApi=window.AudioContext
   if(!AudioApi)return
   if(!this.context){
    this.context=new AudioApi()
    const rate=this.context.sampleRate
    const buffer=this.context.createBuffer(1,rate,rate)
    const samples=buffer.getChannelData(0)
    let previous=0
    for(let i=0;i<samples.length;i++){
     // Filtered random noise has the tactile sound of surfaces rubbing.
     previous=previous*.78+(Math.random()*2-1)*.22
     samples[i]=previous
    }
    this.noise=this.context.createBufferSource()
    this.noise.buffer=buffer
    this.noise.loop=true
    const band=this.context.createBiquadFilter()
    band.type='bandpass';band.frequency.value=700;band.Q.value=.55
    const low=this.context.createBiquadFilter()
    low.type='lowpass';low.frequency.value=1550
    this.band=band;this.low=low
    this.gain=this.context.createGain()
    this.gain.gain.value=0
    this.noise.connect(band).connect(low).connect(this.gain).connect(this.context.destination)
    this.noise.start()
   }
   this.applyPreset()
   if(this.context.state==='suspended')void this.context.resume().catch(()=>{})
  }catch{
   this.enabled=false
   this.active=false
  }
 }

 move(x:number,y:number){
  if(!this.active||!this.enabled||!this.context||!this.gain)return
  const time=performance.now(),p=this.last
  this.last={x,y,time}
  if(!p)return
  const distance=Math.hypot(x-p.x,y-p.y),elapsed=Math.max(8,time-p.time)
  if(distance<1)return
  const speed=distance/elapsed
  const profile=this.profile()
  // All ten styles are capped well below normal UI sounds.
  const texture=1+profile.grain*Math.abs(Math.sin(time*.071))
  const level=Math.min(.055,(.005+speed*.011)*profile.gain*texture)
  const gain=this.gain.gain,now=this.context.currentTime
  gain.cancelScheduledValues(now)
  gain.setTargetAtTime(level,now,.018)
  gain.setTargetAtTime(0,now+.075,.065)
 }

 /** Play a 0.4-second demo from a real click on the Settings preview button. */
 preview(preset:FoamSlideSoundId){
  if(!this.enabled)return
  this.stop()
  this.setPreset(preset)
  this.start(0,0)
  for(let i=1;i<=5;i++)this.previewTimers.push(setTimeout(()=>{
   this.move(i*28,0)
  },i*65))
  this.previewTimers.push(setTimeout(()=>this.stop(),440))
 }

 private stopPreviewTimers(){
  for(const id of this.previewTimers)clearTimeout(id)
  this.previewTimers=[]
 }
 stop(){
  this.stopPreviewTimers()
  this.active=false
  this.last=null
  if(!this.context||!this.gain)return
  const now=this.context.currentTime
  this.gain.gain.cancelScheduledValues(now)
  this.gain.gain.setTargetAtTime(0,now,.025)
 }
 dispose(){
  this.stop()
  try{this.noise?.stop()}catch{/* already stopped */}
  this.noise?.disconnect();this.noise=null
  this.band?.disconnect();this.band=null
  this.low?.disconnect();this.low=null
  this.gain?.disconnect();this.gain=null
  const ctx=this.context;this.context=null
  if(ctx)void ctx.close().catch(()=>{})
 }
}
