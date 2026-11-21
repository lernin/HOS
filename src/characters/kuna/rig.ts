import * as T from 'three'
import { conversationalHeadPose, type HeadPose, type KunaVoicePhase } from './expressions'

// World-agnostic animation driver for the exact Procedia fox-mascot.glb.
// Scene owns physical position/obstacle checking; this owns Sit/Walk/Idle,
// the Procedia Head and Chin joints, expression recipes, and audio jaw timing.
export function createKunaRig(model:T.Group,rawClips:readonly T.AnimationClip[]){
  const mixer=new T.AnimationMixer(model)
  // CRITICAL: Imported Sit/Idle can also animate the Head bone. Mixing that
  // orientation with our procedural head gestures produces the "exorcist"
  // rotation seen on the phone. Own Head/Chin channels in ONE layer, like
  // Procedia's speaking avatar. Keep all body/leg Sit/Walk animation intact.
  const HEAD_JAW_TRACK=/(?:^|[/.])(Head|Chin|Chin_Tip)\.(?:quaternion|rotation|position)$/i
  const clips=rawClips.map(c=>{
    const copy=c.clone()
    copy.tracks=copy.tracks.filter(track=>!HEAD_JAW_TRACK.test(track.name))
    return copy
  })
  const idleClip=clips.find(c=>c.name==='Idle')??clips.find(c=>/idle/i.test(c.name))??clips.find(c=>/survey/i.test(c.name))??clips[0]
  const walkClip=clips.find(c=>c.name==='Walk')??clips.find(c=>/walk/i.test(c.name))
  const sitClip=clips.find(c=>c.name==='Sit')??clips.find(c=>/^sit$/i.test(c.name))
  const runClip=clips.find(c=>c.name==='Run')??clips.find(c=>/^run$/i.test(c.name))
  const idle=idleClip?mixer.clipAction(idleClip):null
  const walk=walkClip?mixer.clipAction(walkClip):null
  const sit=sitClip?mixer.clipAction(sitClip):null
  const run=runClip?mixer.clipAction(runClip):null
  if(idle){idle.setLoop(T.LoopRepeat,Infinity);idle.timeScale=.64;idle.setEffectiveWeight(1);idle.play()}
  if(walk){walk.setLoop(T.LoopRepeat,Infinity);walk.timeScale=.78;walk.setEffectiveWeight(0);walk.play()}
  if(run){run.setLoop(T.LoopRepeat,Infinity);run.timeScale=.9;run.setEffectiveWeight(0);run.play()}
  if(sit){
    sit.setLoop(T.LoopOnce,1)
    sit.clampWhenFinished=true
    sit.setEffectiveWeight(0);sit.play()
    // Freeze at time explicitly controlled by our seated transition state.
    // A reversed animation doesn't require a second stand-up asset.
    sit.paused=true
  }
  const head=model.getObjectByName('Head'),chin=model.getObjectByName('Chin')
  // Immutable bind-pose references; never capture a pose after playing Sit.
  const neutralHead=head?.quaternion.clone(),neutralChin=chin?.quaternion.clone()
  const neutralPosition=model.position.clone(),neutralRotation=model.quaternion.clone()
  let sitAmount=0,walkBlend=0,runBlend=0,jawAmount=0,phaseElapsed=0
  let phase:KunaVoicePhase='idle',headPitch=0,headTurn=0,headTilt=0
  const headQuaternion=new T.Quaternion(),jawQuaternion=new T.Quaternion(),headEuler=new T.Euler(),jawEuler=new T.Euler()
  const headTiltQuaternion=new T.Quaternion(),headTiltEuler=new T.Euler()
  const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n))
  const transitionDuration=sitClip?clamp(sitClip.duration,.85,2.25):.85

  function update(dt:number,options:{active:boolean;phase:KunaVoicePhase;speedFraction:number;jaw:number;turning?:boolean;runFraction?:number;manualPose?:HeadPose|null}){
    const elapsed=clamp(Number.isFinite(dt)?dt:0,0,.1)
    if(phase!==options.phase){phase=options.phase;phaseElapsed=0}else phaseElapsed+=elapsed
    const seated=options.active&&!!sit
    // Keep hands-off physics until rising has finished. The owner checks
    // isTransitioning() before asking the collision controller to walk.
    sitAmount=clamp(sitAmount+(seated?1:-1)*elapsed/transitionDuration,0,1)
    const sitWeight=sit?clamp(sitAmount*transitionDuration/.26,0,1):0
    // A stationary 180° turn still needs paw stepping. Play a subdued Walk
    // cycle while rotating, then blend to a trot using the original Run clip.
    const targetWalk=!options.active&&sitAmount===0?
      Math.max(clamp(options.speedFraction,0,1),options.turning?.38:0):0
    const targetRun=run&&!options.active&&sitAmount===0?clamp(options.runFraction??0,0,1):0
    walkBlend=T.MathUtils.damp(walkBlend,targetWalk,5,elapsed)
    runBlend=T.MathUtils.damp(runBlend,targetRun,5,elapsed)
    walk?.setEffectiveWeight((1-sitWeight)*walkBlend*(1-runBlend))
    run?.setEffectiveWeight((1-sitWeight)*runBlend)
    idle?.setEffectiveWeight((1-sitWeight)*(1-walkBlend)*(1-runBlend))
    if(walk)walk.timeScale=options.turning?.57:.68+.35*walkBlend
    if(run)run.timeScale=.85+.3*targetRun
    if(sit){
      sit.paused=true
      sit.time=clamp(sitAmount*sitClip!.duration,0,sitClip!.duration)
      sit.setEffectiveWeight(sitWeight)
    }
    mixer.update(elapsed)
    // Strip GLB root motion; Kuna's swept collision body remains authoritative.
    model.position.copy(neutralPosition)
    model.quaternion.copy(neutralRotation)
    if(head&&neutralHead){
      // Use Procedia's Head axes, with a fixed original neutral quaternion.
      // A moving baseline from the GLB Sit clip was the source of wild turns.
      const target=options.manualPose??conversationalHeadPose(phase,phaseElapsed,sitAmount)
      headPitch=T.MathUtils.damp(headPitch,T.MathUtils.clamp(target.pitch,-.28,.28),6,elapsed)
      headTurn=T.MathUtils.damp(headTurn,T.MathUtils.clamp(target.turn,-.20,.20),6,elapsed)
      headTilt=T.MathUtils.damp(headTilt,T.MathUtils.clamp(target.tilt,-.22,.22),6,elapsed)
      // Match Procedia's composition: turn about local Z, then look
      // up/down about X, then a side-tilt with slight counter-pitch.
      // Bound combined Z motion; never compound a new rotation onto
      // the previous frame or onto a head pose from the Sit clip.
      const turnZ=T.MathUtils.clamp(headTurn+headTilt,-.21,.21)
      headEuler.set(headPitch,0,0)
      headQuaternion.setFromEuler(headEuler)
      headTiltEuler.set(-headTilt/6,0,turnZ)
      headTiltQuaternion.setFromEuler(headTiltEuler)
      head.quaternion.copy(neutralHead).multiply(headQuaternion).multiply(headTiltQuaternion)
    }
    if(chin&&neutralChin){
      // Preserve Procedia's 0.381rad jaw. No previous-frame quaternion drift.
      const target=phase==='speaking'?clamp(options.jaw,0,1):0
      jawAmount=T.MathUtils.damp(jawAmount,target,target>jawAmount?18:30,elapsed)
      jawEuler.set(.381*jawAmount,0,0)
      jawQuaternion.setFromEuler(jawEuler)
      chin.quaternion.copy(neutralChin).multiply(jawQuaternion)
    }
  }
  return {
    update,
    hasWalk:!!walk,
    hasRun:!!run,
    hasSit:!!sit,
    isTransitioning:()=>sitAmount>.001,
    sitProgress:()=>sitAmount,
    dispose(){mixer.stopAllAction();mixer.uncacheRoot(model)},
  }
}
