import * as T from 'three'
import { conversationalHeadPose, type KunaVoicePhase } from './expressions'

// World-agnostic animation driver for the exact Procedia fox-mascot.glb.
// Scene owns physical position/obstacle checking; this owns Sit/Walk/Idle,
// the Procedia Head and Chin joints, expression recipes, and audio jaw timing.
export function createKunaRig(model:T.Group,rawClips:readonly T.AnimationClip[]){
  const mixer=new T.AnimationMixer(model)
  // Procedia excludes Chin/Chin_Tip rotation from Idle so the talking jaw
  // wins. Extend that principle to all clips, including Sit and Walk.
  const clips=rawClips.map(c=>{
    const copy=c.clone()
    copy.tracks=copy.tracks.filter(track=>!/^(Chin|Chin_Tip)\.rotation$/.test(track.name))
    return copy
  })
  const idleClip=clips.find(c=>c.name==='Idle')??clips.find(c=>/idle/i.test(c.name))??clips.find(c=>/survey/i.test(c.name))??clips[0]
  const walkClip=clips.find(c=>c.name==='Walk')??clips.find(c=>/walk/i.test(c.name))
  const sitClip=clips.find(c=>c.name==='Sit')??clips.find(c=>/^sit$/i.test(c.name))
  const idle=idleClip?mixer.clipAction(idleClip):null
  const walk=walkClip?mixer.clipAction(walkClip):null
  const sit=sitClip?mixer.clipAction(sitClip):null
  if(idle){idle.setLoop(T.LoopRepeat,Infinity);idle.timeScale=.64;idle.setEffectiveWeight(1);idle.play()}
  if(walk){walk.setLoop(T.LoopRepeat,Infinity);walk.timeScale=.78;walk.setEffectiveWeight(0);walk.play()}
  if(sit){
    sit.setLoop(T.LoopOnce,1)
    sit.clampWhenFinished=true
    sit.setEffectiveWeight(0);sit.play()
    // Freeze at time explicitly controlled by our seated transition state.
    // A reversed animation doesn't require a second stand-up asset.
    sit.paused=true
  }
  const head=model.getObjectByName('Head'),chin=model.getObjectByName('Chin')
  const neutralPosition=model.position.clone(),neutralRotation=model.quaternion.clone()
  let sitAmount=0,walkBlend=0,jawAmount=0,phaseElapsed=0
  let phase:KunaVoicePhase='idle',headPitch=0,headTurn=0,headTilt=0
  const headQuaternion=new T.Quaternion(),jawQuaternion=new T.Quaternion(),headEuler=new T.Euler(),jawEuler=new T.Euler()
  const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n))
  const transitionDuration=sitClip?clamp(sitClip.duration,.85,2.25):.85

  function update(dt:number,options:{active:boolean;phase:KunaVoicePhase;speedFraction:number;jaw:number}){
    const elapsed=clamp(Number.isFinite(dt)?dt:0,0,.1)
    if(phase!==options.phase){phase=options.phase;phaseElapsed=0}else phaseElapsed+=elapsed
    const seated=options.active&&!!sit
    // Keep hands-off physics until rising has finished. The owner checks
    // isTransitioning() before asking the collision controller to walk.
    sitAmount=clamp(sitAmount+(seated?1:-1)*elapsed/transitionDuration,0,1)
    const sitWeight=sit?clamp(sitAmount*transitionDuration/.26,0,1):0
    const targetWalk=!options.active&&sitAmount===0?clamp(options.speedFraction,0,1):0
    walkBlend=T.MathUtils.damp(walkBlend,targetWalk,5,elapsed)
    walk?.setEffectiveWeight((1-sitWeight)*walkBlend)
    idle?.setEffectiveWeight((1-sitWeight)*(1-walkBlend))
    if(walk)walk.timeScale=.68+.35*walkBlend
    if(sit){
      sit.paused=true
      sit.time=clamp(sitAmount*sitClip!.duration,0,sitClip!.duration)
      sit.setEffectiveWeight(sitWeight)
    }
    mixer.update(elapsed)
    // Strip GLB root motion; Kuna's swept collision body remains authoritative.
    model.position.copy(neutralPosition)
    model.quaternion.copy(neutralRotation)
    if(head){
      // Sample the bone's post-mixer pose as Procedia does, then apply the
      // bounded expression on top. No cumulative rotation or head snapping.
      const baseline=head.quaternion.clone()
      const target=conversationalHeadPose(phase,phaseElapsed,sitAmount)
      headPitch=T.MathUtils.damp(headPitch,target.pitch,7.5,elapsed)
      headTurn=T.MathUtils.damp(headTurn,target.turn,7.5,elapsed)
      headTilt=T.MathUtils.damp(headTilt,target.tilt,7.5,elapsed)
      headEuler.set(headPitch,0,headTurn+headTilt)
      headQuaternion.setFromEuler(headEuler)
      head.quaternion.copy(baseline).multiply(headQuaternion)
    }
    if(chin){
      // The talking jaw follows Procedia's 0.381rad bone rotation and the
      // current TTS amplitude. Listening never opens the jaw.
      const target=phase==='speaking'?clamp(options.jaw,0,1):0
      jawAmount=T.MathUtils.damp(jawAmount,target,target>jawAmount?18:30,elapsed)
      const baseline=chin.quaternion.clone()
      jawEuler.set(.381*jawAmount,0,0)
      jawQuaternion.setFromEuler(jawEuler)
      chin.quaternion.copy(baseline).multiply(jawQuaternion)
    }
  }
  return {
    update,
    hasWalk:!!walk,
    hasSit:!!sit,
    isTransitioning:()=>sitAmount>.001,
    sitProgress:()=>sitAmount,
    dispose(){mixer.stopAllAction();mixer.uncacheRoot(model)},
  }
}
