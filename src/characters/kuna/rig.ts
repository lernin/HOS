import * as T from 'three'
import { conversationalHeadPose, type HeadPose, type KunaVoicePhase } from './expressions'

// World-agnostic animation driver for the exact Procedia fox-mascot.glb.
// Scene owns physical position/obstacle checking; this owns Sit/Walk/Idle,
// the Procedia Head and Chin joints, expression recipes, and audio jaw timing.
// A child-relative rehearsal: the native fox faces +Z toward the viewer in
// face-to-face mode, and turns to -Z to walk FORWARD with the viewer in
// alongside mode. Right/left changes position and attention, not gestures.
export function kunaStudioView(context:'face-to-face'|'alongside',side:'right'|'left'){
  const beside=context==='alongside'
  return {
    bodyYaw:beside?Math.PI:0,
    offsetX:beside?(side==='right'?.48:-.48):0,
    offsetZ:beside?-.38:0,
    cameraX:0,
    cameraY:beside?1.4:1.55,
    cameraZ:beside?3.5:3.8,
    attentionTurn:beside?(side==='right'?-.18:.18):0,
  }
}

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
  let demo:T.AnimationAction|null=null
  function restoreNativeAction(action:T.AnimationAction){
    // Procedia numbered previews can reuse the same mixer actions as our
    // persistent Sit/Walk/Idle layers. Restore them after a one-shot.
    if(action===idle){idle.reset().play()}
    if(action===walk){walk.reset().play()}
    if(action===sit){sit.reset().play();sit.paused=true}
  }
  const onDemoFinished=(event:{action:T.AnimationAction})=>{
    if(event.action!==demo)return
    const finished=demo
    demo=null
    finished.stop()
    restoreNativeAction(finished)
  }
  mixer.addEventListener('finished',onDemoFinished)
  function triggerDemoClip(name:string,timeScale=1):boolean{
    const clip=clips.find(c=>c.name===name)
    if(!clip||!Number.isFinite(timeScale)||timeScale<=.1||timeScale>3)return false
    if(demo){const previous=demo;demo=null;previous.stop();restoreNativeAction(previous)}
    demo=mixer.clipAction(clip)
    demo.reset()
    demo.setLoop(T.LoopOnce,1)
    demo.clampWhenFinished=true
    demo.setEffectiveWeight(1)
    demo.timeScale=timeScale
    demo.enabled=true
    demo.play()
    return true
  }
  function cancelDemo(){if(demo){const previous=demo;demo=null;previous.stop();restoreNativeAction(previous)}}
  // Procedia's real resting mouth comes from the native Idle Chin animation,
  // NOT from the raw GLB bind quaternion. The prior implementation removed
  // all Chin tracks then called that bind 'closed': on the phone it visibly
  // hung open even while displayedPose().jaw was zero.
  // Sample the original clip before we strip the procedural Head/Chin tracks,
  // and hold this closed Idle baseline during walking, listening and speech.
  // Preserve Procedia's original 0.381-radian spoken jaw relative to it.
  const neutralHead=head?.quaternion.clone(),neutralChin=chin?.quaternion.clone()
  const nativeIdle=rawClips.find(c=>c.name===idleClip?.name)
  const idleChinTrack=nativeIdle?.tracks.find(track=>
    /(?:^|[/.])Chin\.(?:quaternion|rotation)$/i.test(track.name))
  if(neutralChin&&idleChinTrack&&idleChinTrack.times.length){
    const sample=idleChinTrack.values
    if(idleChinTrack.getValueSize()===4){
      neutralChin.set(sample[0],sample[1],sample[2],sample[3]).normalize()
    }else if(idleChinTrack.getValueSize()===3){
      neutralChin.setFromEuler(new T.Euler(sample[0],sample[1],sample[2]))
    }
  }
  const neutralPosition=model.position.clone(),neutralRotation=model.quaternion.clone()
  let sitAmount=0,walkBlend=0,jawAmount=0,phaseElapsed=0
  let phase:KunaVoicePhase='idle',headPitch=0,headTurn=0,headTilt=0
  const headQuaternion=new T.Quaternion(),headTiltQuaternion=new T.Quaternion(),jawQuaternion=new T.Quaternion(),headEuler=new T.Euler(),tiltEuler=new T.Euler(),jawEuler=new T.Euler()
  const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n))
  const transitionDuration=sitClip?clamp(sitClip.duration,.85,2.25):.85

  function update(dt:number,options:{active:boolean;phase:KunaVoicePhase;speedFraction:number;jaw:number;turning?:boolean;manualPose?:HeadPose|null;manualJaw?:number;freezeIdle?:boolean;studioMode?:boolean;directPose?:boolean;attentionTurn?:number}){
    const elapsed=clamp(Number.isFinite(dt)?dt:0,0,.1)
    if(phase!==options.phase){phase=options.phase;phaseElapsed=0}else phaseElapsed+=elapsed
    const seated=options.active&&!!sit
    // Keep hands-off physics until rising has finished. The owner checks
    // isTransitioning() before asking the collision controller to walk.
    sitAmount=clamp(sitAmount+(seated?1:-1)*elapsed/transitionDuration,0,1)
    const sitWeight=sit?clamp(sitAmount*transitionDuration/.26,0,1):0
    // An animal steps its paws while rotating, rather than spinning
    // stiffly on planted feet. Slow footfalls even for in-place turns.
    const targetWalk=!options.active&&sitAmount===0?
      Math.max(clamp(options.speedFraction,0,1),options.turning?.34:0):0
    walkBlend=T.MathUtils.damp(walkBlend,targetWalk,5,elapsed)
    const demoWeight=demo?1:0
    if(walk&&walk!==demo){
      walk.setEffectiveWeight((1-demoWeight)*(1-sitWeight)*walkBlend)
      walk.timeScale=options.turning?.48:.68+.35*walkBlend
    }
    if(idle&&idle!==demo){
      idle.setEffectiveWeight((1-demoWeight)*(1-sitWeight)*(1-walkBlend))
      idle.timeScale=options.freezeIdle?0:.64
    }
    if(sit&&sit!==demo){
      sit.paused=true
      sit.time=clamp(sitAmount*sitClip!.duration,0,sitClip!.duration)
      sit.setEffectiveWeight((1-demoWeight)*sitWeight)
    }
    mixer.update(elapsed)
    // Strip GLB root motion; Kuna's swept collision body remains authoritative.
    model.position.copy(neutralPosition)
    model.quaternion.copy(neutralRotation)
    if(head&&neutralHead){
      // Use Procedia's Head axes, with a fixed original neutral quaternion.
      // A moving baseline from the GLB Sit clip was the source of wild turns.
      const target=options.manualPose??conversationalHeadPose(phase,phaseElapsed,sitAmount)
      const maximum=options.studioMode?{pitch:.63,turn:.56,tilt:.53}:{pitch:.28,turn:.20,tilt:.22}
      const follow=(was:number,goal:number)=>options.directPose?goal:T.MathUtils.damp(was,goal,6,elapsed)
      headPitch=follow(headPitch,T.MathUtils.clamp(target.pitch,-maximum.pitch,maximum.pitch))
      headTurn=follow(headTurn,T.MathUtils.clamp(target.turn+(options.attentionTurn??0),-maximum.turn,maximum.turn))
      headTilt=follow(headTilt,T.MathUtils.clamp(target.tilt,-maximum.tilt,maximum.tilt))
      // Procedia Desk Speaking: head turn is LOCAL Z, nod/pitch LOCAL X,
      // and curious side tilt is LOCAL Y with a small upward X offset.
      // Never add tilt and turn on Z; that makes the fox look contorted.
      headEuler.set(headPitch,0,headTurn)
      tiltEuler.set(-headTilt/6,headTilt,0)
      headQuaternion.setFromEuler(headEuler)
      headTiltQuaternion.setFromEuler(tiltEuler)
      head.quaternion.copy(neutralHead).multiply(headQuaternion).multiply(headTiltQuaternion)
    }
    if(chin&&neutralChin){
      // Preserve Procedia's 0.381rad jaw. No previous-frame quaternion drift.
      // Original Procedia Idle Chin animation is the ONLY resting baseline.
      // AI/listening/locomotion never keep a speaking jaw open. A deliberate
      // Studio jaw key still works, and speaking follows actual audio energy.
      const manualJaw=clamp(options.manualJaw??0,0,1)
      const speechJaw=phase==='speaking'?clamp(options.jaw,0,1):0
      const target=Math.max(manualJaw,speechJaw)
      jawAmount=options.directPose?target:T.MathUtils.damp(jawAmount,target,target>jawAmount?18:30,elapsed)
      if(target===0&&jawAmount<.002)jawAmount=0
      // Reset against the immutable original Idle pose each frame: never allow
      // animation blending or a previous open-mouth frame to accumulate.
      chin.quaternion.copy(neutralChin)
      if(jawAmount>0){
        jawEuler.set(.381*jawAmount,0,0)
        jawQuaternion.setFromEuler(jawEuler)
        chin.quaternion.multiply(jawQuaternion)
      }
    }
  }
  return {
    update,
    triggerDemoClip,
    cancelDemo,
    // The exact smoothed pose displayed on the rendered fox. Recording this
    // instead of raw key codes preserves the performed timing on replay.
    displayedPose:()=>({pitch:headPitch,turn:headTurn,tilt:headTilt,jaw:jawAmount}),
    hasWalk:!!walk,
    hasSit:!!sit,
    isTransitioning:()=>sitAmount>.001,
    sitProgress:()=>sitAmount,
    dispose(){mixer.removeEventListener('finished',onDemoFinished);cancelDemo();mixer.stopAllAction();mixer.uncacheRoot(model)},
  }
}
