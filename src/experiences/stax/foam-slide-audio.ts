/**
 * Quiet, texture-like foam sliding across wood. Sound is synthesized locally:
 * no samples, media downloads, speech, analytics or audio permission prompts.
 * Construct/resume AudioContext ONLY inside a user's pointer-down gesture.
 */
export class FoamSlideAudio {
 private context:AudioContext|null=null
 private noise:AudioBufferSourceNode|null=null
 private gain:GainNode|null=null
 private enabled=true
 private active=false
 private last:{x:number;y:number;time:number}|null=null

 setEnabled(value:boolean){
  this.enabled=value
  if(!value)this.stop()
 }

 start(x:number,y:number){
  if(!this.enabled)return
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
    // Slightly correlated noise sounds more like porous material than pure hiss.
    let previous=0
    for(let i=0;i<samples.length;i++){
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
    this.gain=this.context.createGain()
    this.gain.gain.value=0
    this.noise.connect(band).connect(low).connect(this.gain).connect(this.context.destination)
    this.noise.start()
   }
   if(this.context.state==='suspended')void this.context.resume().catch(()=>{})
  }catch{
   // A browser without supported Web Audio remains fully functional and silent.
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
  // Very low at slow motion; a little stronger when swept rapidly.
  // Fade quickly between movements rather than emitting a steady background loop.
  const level=Math.min(.035,.005+speed*.011)
  const gain=this.gain.gain,now=this.context.currentTime
  gain.cancelScheduledValues(now)
  gain.setTargetAtTime(level,now,.018)
  gain.setTargetAtTime(0,now+.075,.065)
 }

 stop(){
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
  this.noise?.disconnect()
  this.noise=null
  this.gain?.disconnect()
  this.gain=null
  const ctx=this.context
  this.context=null
  if(ctx)void ctx.close().catch(()=>{})
 }
}
