import type { ProcediaClip } from './procediaKeyboard'
import type { HeadPose } from './expressions'

export type KunaPerformanceContext='face-to-face'|'alongside'
export const KUNA_PERFORMANCE_CONTEXTS=['face-to-face','alongside'] as const
export function contextLabel(value:KunaPerformanceContext):string{
  return value==='alongside'?'Walking alongside':'Face-to-face'
}
export type KunaMotionFrame=HeadPose&{at:number;jaw:number}
export type KunaClipEvent={at:number;name:string;timeScale?:number}
export type KunaStudioTake={
  version:2;id:string;label:string;tags:string[];duration:number
  frames:KunaMotionFrame[];clips:KunaClipEvent[]
  // Optional to preserve every existing v2 recording and v1 migration.
  emotions?:Record<string,number>;playbackIntensity?:number
  // One take may be usable in one or both contexts. No separate left/right
  // meanings are necessary: the alongside viewpoint is mirrored in Studio.
  contexts?:KunaPerformanceContext[]
}
export type RecorderMode='idle'|'armed'|'recording'|'paused'
const clipNames=new Set(['Death','Fall','Rest Pose','Sit','Idle Alert','Walk','Run','Fetch','Jump','Bite'])
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n))
const round=(n:number)=>Math.round(n*1000)/1000
export const KUNA_STARTER_EMOTIONS=[
  'enthusiasm','curiosity','agreement','uncertainty','attentiveness','disagreement',
] as const
export function normalizeKunaEmotion(value:string):string{
  return value.trim().toLowerCase().replace(/\s+/g,' ').slice(0,32)
}
export function validKunaEmotion(value:unknown):value is string{
  return typeof value==='string'&&value.length>0&&value.length<=32&&
    value===normalizeKunaEmotion(value)&&/^[\p{L}][\p{L}\p{N} -]*$/u.test(value)
}
export function validateKunaTake(value:unknown):value is KunaStudioTake {
  if(!value||typeof value!=='object')return false
  const t=value as KunaStudioTake
  if(t.version!==2||typeof t.id!=='string'||t.id.length>100||
    typeof t.label!=='string'||t.label.length>100||!Array.isArray(t.tags)||t.tags.length>12||
    t.tags.some(x=>typeof x!=='string'||x.length>48)||!Number.isFinite(t.duration)||t.duration<.1||t.duration>12||
    !Array.isArray(t.frames)||t.frames.length<2||t.frames.length>800||
    !Array.isArray(t.clips)||t.clips.length>40)return false
  if(t.contexts!==undefined&&(
    !Array.isArray(t.contexts)||t.contexts.length<1||t.contexts.length>2||
    new Set(t.contexts).size!==t.contexts.length||
    t.contexts.some(c=>!KUNA_PERFORMANCE_CONTEXTS.includes(c))
  ))return false
  if(t.playbackIntensity!==undefined&&(!Number.isInteger(t.playbackIntensity)||t.playbackIntensity<0||t.playbackIntensity>100))return false
  if(t.emotions!==undefined){
    if(!t.emotions||typeof t.emotions!=='object'||Array.isArray(t.emotions))return false
    const ratings=Object.entries(t.emotions)
    if(ratings.length>24||ratings.some(([name,strength])=>!validKunaEmotion(name)||!Number.isInteger(strength)||strength<0||strength>100))return false
  }
  let last=-.001
  for(const f of t.frames){
    if(!f||!['at','pitch','turn','tilt','jaw'].every(k=>Number.isFinite(f[k as keyof KunaMotionFrame])))return false
    if(f.at<last||f.at>t.duration+.001||Math.abs(f.pitch)>.8||Math.abs(f.turn)>.8||
      Math.abs(f.tilt)>.8||f.jaw<0||f.jaw>1)return false
    last=f.at
  }
  return t.clips.every(c=>c&&Number.isFinite(c.at)&&c.at>=0&&c.at<=t.duration+.001&&
    clipNames.has(c.name)&&(c.timeScale===undefined||Number.isFinite(c.timeScale)&&c.timeScale>.1&&c.timeScale<=3))
}
export function sampleKunaTake(t:KunaStudioTake,seconds:number,intensity=100,mirrored=false):KunaMotionFrame {
  const at=clamp(Number.isFinite(seconds)?seconds:0,0,t.duration)
  const frames=t.frames
  let lo=0,hi=frames.length-1
  while(lo<hi){
    const mid=(lo+hi)>>1
    if(frames[mid].at<at)lo=mid+1
    else hi=mid
  }
  const b=frames[lo],a=frames[Math.max(0,lo-1)]
  const u=clamp((at-a.at)/Math.max(.00001,b.at-a.at),0,1)
  const lerp=(x:number,y:number)=>x+(y-x)*u
  const strength=clamp(Number.isFinite(intensity)?intensity:100,0,100)/100
  // Only lateral head channels mirror; timing, nod/pitch and mouth do not.
  // The same authored take can work alongside either shoulder.
  const sign=mirrored?-1:1
  return {at,pitch:lerp(a.pitch,b.pitch)*strength,turn:lerp(a.turn,b.turn)*strength*sign,
    tilt:lerp(a.tilt,b.tilt)*strength*sign,jaw:lerp(a.jaw,b.jaw)*strength}
}
export function createKunaRecorder(){
  let mode:RecorderMode='idle',began=0,pausedAt=0,pausedTime=0
  let frames:KunaMotionFrame[]=[],clips:KunaClipEvent[]=[]
  let lastSample=-Infinity
  const duration=(now:number)=>mode==='armed'?0:clamp(( (mode==='paused'?pausedAt:now)-began-pausedTime)/1000,0,12)
  const capture=(now:number,pose:Omit<KunaMotionFrame,'at'>,force=false)=>{
    if(mode!=='recording')return
    const at=round(duration(now))
    if(!force&&at-lastSample<.025)return
    const f:KunaMotionFrame={at,pitch:clamp(pose.pitch,-.8,.8),
      turn:clamp(pose.turn,-.8,.8),tilt:clamp(pose.tilt,-.8,.8),
      jaw:clamp(pose.jaw,0,1)}
    if(frames.length&&frames[frames.length-1].at===at)frames[frames.length-1]=f
    else frames.push(f)
    lastSample=at
  }
  return {
    mode:()=>mode,
    arm(){mode='armed';began=0;pausedTime=0;pausedAt=0;frames=[];clips=[];lastSample=-Infinity},
    beginOnInput(now:number,pose:Omit<KunaMotionFrame,'at'>){
      if(mode==='armed'){mode='recording';began=now;capture(now,pose,true)}
    },
    capture,
    clip(now:number,c:ProcediaClip){
      if(mode!=='recording'||clips.length>=40)return
      clips.push({at:round(duration(now)),name:c.name,timeScale:c.timeScale})
    },
    pause(now:number){if(mode==='recording'){capture(now,frames.at(-1)??{pitch:0,turn:0,tilt:0,jaw:0},true);pausedAt=now;mode='paused'}},
    resume(now:number){if(mode==='paused'){pausedTime+=now-pausedAt;mode='recording';lastSample=-Infinity}},
    discard(){mode='idle';frames=[];clips=[]},
    finish(now:number,pose:Omit<KunaMotionFrame,'at'>,id:string):KunaStudioTake|null{
      if(mode==='armed'){mode='idle';return null}
      if(mode==='idle')return null
      const stoppedAt=mode==='paused'?pausedAt:now
      if(mode==='paused'){mode='recording'}
      capture(stoppedAt,pose,true)
      const length=round(clamp((stoppedAt-began-pausedTime)/1000,.1,12))
      const end:KunaMotionFrame={at:length,
        pitch:clamp(pose.pitch,-.8,.8),turn:clamp(pose.turn,-.8,.8),
        tilt:clamp(pose.tilt,-.8,.8),jaw:clamp(pose.jaw,0,1)}
      if(frames.length<2||frames.at(-1)!.at<length)frames.push(end)
      else frames[frames.length-1]=end
      const take:KunaStudioTake={version:2,id,label:'',tags:[],duration:length,frames:frames.slice(0,800),clips:clips.slice()}
      mode='idle';frames=[];clips=[]
      return validateKunaTake(take)?take:null
    },
  }
}
