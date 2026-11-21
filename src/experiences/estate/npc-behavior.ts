import type { Point } from './plan'

export type KunaPhase='idle'|'turn'|'walk'|'yield'|'blocked'|'talk'
export type KunaFollow={active:boolean;yaw:number}
export type KunaNav={
  goals:readonly Point[]
  isSafe:(p:Point)=>boolean
  clear:(a:Point,b:Point)=>boolean
  path:(a:Point,b:Point)=>Point[]|null
}
export type KunaFrame={
  position:Point
  yaw:number
  speed:number
  phase:KunaPhase
  goal:Point|null
  route:readonly Point[]
}

export const KUNA_MAX_SPEED=.52
export const KUNA_STEP=1/60
const ACCEL=.62,DECEL=.95,TURN_RATE=1.6,PERSONAL_SPACE=1.35
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z)
const angleDelta=(a:number,b:number)=>Math.atan2(Math.sin(a-b),Math.cos(a-b))
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n))
const heading=(a:Point,b:Point)=>Math.atan2(b.x-a.x,b.z-a.z)

export function createKunaBehavior(nav:KunaNav,start:Point,initialYaw=0){
  let position:Point={...start},yaw=initialYaw,speed=0,phase:KunaPhase='idle'
  let target:Point|null=null,route:Point[]=[],dwell=3.4,nextGoal=1,accumulator=0
  let lastTalking=false,wasFollowing=false,followClock=0,followSide=1
  let followGoal:Point|null=null
  const safeHome=nav.isSafe(position)
  if(!safeHome)phase='blocked'
  let previous:KunaFrame={position:{...position},yaw,speed,phase,goal:null,route:[]}
  let rendered:KunaFrame=previous

  function settle(seconds:number,mode:KunaPhase='idle'){
    speed=0;phase=mode;route=[];target=null;dwell=seconds
  }
  function chooseGoal(){
    if(nav.goals.length<2){settle(6);return}
    for(let attempt=0;attempt<nav.goals.length;attempt++){
      const index=(nextGoal+attempt)%nav.goals.length,goal=nav.goals[index]
      if(distance(position,goal)<2.2)continue
      const candidate=nav.path(position,goal)
      if(!candidate?.length)continue
      // Every segment must have the same fox clearance as every waypoint.
      let prev=position
      if(!candidate.every(p=>{const valid=nav.clear(prev,p);prev=p;return valid}))continue
      route=[...candidate];target={...goal};nextGoal=index+1
      phase='turn';return
    }
    settle(6,'blocked')
  }
  function tick(player:Point,interacting:boolean,dt:number,follow?:KunaFollow){
    if(!safeHome)return
    if(interacting){
      if(!lastTalking){settle(0,'talk');lastTalking=true}
      wasFollowing=false;followGoal=null
      // A seated fox does not rotate his whole body like a turntable.
      return
    }
    const following=Boolean(follow?.active)
    if(lastTalking){lastTalking=false;settle(following?0:3.2)}
    const toPlayer=distance(position,player)
    if(following){
      followClock-=dt
      // A reachable position ahead and to one side, inside the viewer's FOV.
      const angle=follow!.yaw
      const forward={x:-Math.sin(angle),z:-Math.cos(angle)}
      const right={x:Math.cos(angle),z:-Math.sin(angle)}
      const anchor=(side:number):Point=>({
        x:player.x+forward.x*1.75+right.x*.78*side,
        z:player.z+forward.z*1.75+right.z*.78*side,
      })
      let goal=anchor(followSide)
      if(!nav.isSafe(goal)){
        const other=anchor(-followSide)
        if(nav.isSafe(other)){followSide=-followSide;goal=other}
      }
      if(!nav.isSafe(goal)||toPlayer<PERSONAL_SPACE){
        speed=0;phase='yield';return
      }
      if(distance(position,goal)<.48){
        speed=0;phase='idle';route=[];target={...goal}
        followGoal={...goal};return
      }
      const shifted=!followGoal||distance(followGoal,goal)>.72
      if(!wasFollowing||(followClock<=0&&shifted)||(!route.length&&phase!=='turn'&&phase!=='walk')){
        const proposed=nav.path(position,goal)
        let prior=position
        if(proposed?.length&&proposed.every(p=>{const clear=nav.clear(prior,p);prior=p;return clear})){
          route=[...proposed];target={...goal};followGoal={...goal}
          if(phase!=='walk')phase='turn'
        }else{
          speed=0;phase='blocked';route=[];followClock=.9
          wasFollowing=true;return
        }
        followClock=.85
      }
      wasFollowing=true
    }else{
      wasFollowing=false;followGoal=null;followClock=0
    }
    if(!following&&toPlayer<PERSONAL_SPACE+0.20){
      // A person is dynamic: do not push, slide or repeatedly replan around them.
      // Resume only when they have clearly moved away (hysteresis).
      speed=0;phase='yield';return
    }
    if(phase==='yield'){
      if(toPlayer<PERSONAL_SPACE+.75)return
      if(!following)settle(3)
      else {phase='idle';followClock=0}
    }
    if(phase==='idle'||phase==='blocked'){
      if(following)return
      dwell-=dt
      if(dwell<=0)chooseGoal()
      return
    }
    while(route.length&&distance(position,route[0])<.11)route.shift()
    if(!route.length){settle(following?.7:3.8+(nextGoal%3)*.7);return}
    const waypoint=route[0],remaining=distance(position,waypoint)
    const desiredYaw=heading(position,waypoint)
    const turn=angleDelta(desiredYaw,yaw)
    const turnLimit=(phase==='turn'?TURN_RATE:1.05)*dt
    yaw+=clamp(turn,-turnLimit,turnLimit)

    if(phase==='turn'){
      speed=0
      if(Math.abs(turn)<.13)phase='walk'
      return
    }
    if(Math.abs(turn)>.60){
      // Brake, then deliberately rotate in place. No crab-walk into cabinetry.
      speed=Math.max(0,speed-DECEL*dt)
      if(speed<.035){speed=0;phase='turn'}
      return
    }
    const isFinal=route.length===1
    const following=route[1]
    const bend=following?Math.abs(angleDelta(heading(waypoint,following),desiredYaw)):0
    // Brake for the goal, or ahead of a sharp corner. Do not reverse in motion.
    const stopDistance=isFinal?remaining:(bend>.48?remaining:Math.max(remaining,.5))
    const arrivalSpeed=Math.sqrt(Math.max(0,2*DECEL*stopDistance))
    const bendSpeed=bend>.48?Math.min(.26,arrivalSpeed):KUNA_MAX_SPEED
    let desiredSpeed=Math.min(KUNA_MAX_SPEED,arrivalSpeed,bendSpeed)
    // Begin yielding before entering the child's personal space.
    desiredSpeed=Math.min(desiredSpeed,clamp((toPlayer-PERSONAL_SPACE)*.65,0,KUNA_MAX_SPEED))
    speed=clamp(desiredSpeed,speed-DECEL*dt,speed+ACCEL*dt)
    if(speed<=.0001)return
    const step=Math.min(remaining,speed*dt)
    const next={x:position.x+(waypoint.x-position.x)/remaining*step,
                z:position.z+(waypoint.z-position.z)/remaining*step}
    // Swept collision against the *actual model's* radius with extra padding.
    if(!nav.isSafe(next)||!nav.clear(position,next)){settle(5,'blocked');return}
    if(distance(next,player)<PERSONAL_SPACE){speed=0;phase='yield';return}
    position=next
    if(distance(position,waypoint)<.11){
      route.shift()
      if(!route.length){settle(following?.7:3.8+(nextGoal%3)*.7);return}
      const cornerAngle=Math.abs(angleDelta(heading(position,route[0]),yaw))
      if(cornerAngle>.38){phase='turn';speed=0}
    }
  }
  function simulationState():KunaFrame{
    return {position:{...position},yaw,speed,phase,goal:target?{...target}:null,
      route:route.map(p=>({...p}))}
  }
  function update(dt:number,player:Point,interacting=false,follow?:KunaFollow):KunaFrame{
    const frameDt=Number.isFinite(dt)?clamp(dt,0,.10):0
    if(interacting&&!lastTalking){
      // A tap freezes the actor at the *visible* interpolated pose,
      // not a hidden physics step ahead (which would create a tiny jerk).
      position={...rendered.position};yaw=rendered.yaw;speed=0
      previous=simulationState()
    }
    accumulator=Math.min(.13,accumulator+frameDt)
    let steps=0
    while(accumulator+1e-9>=KUNA_STEP&&steps++<8){
      previous=simulationState()
      tick(player,interacting,KUNA_STEP,follow);accumulator-=KUNA_STEP
    }
    // Interpolate *rendered* motion between simulation ticks. Without this,
    // irregular phone frames may execute two fixed steps at once, causing a
    // visible double-angle jump even though physical yaw is rate limited.
    const current=simulationState(),alpha=clamp(accumulator/KUNA_STEP,0,1)
    const yawStep=angleDelta(current.yaw,previous.yaw)
    rendered={
      ...current,
      position:{x:previous.position.x+(current.position.x-previous.position.x)*alpha,
                z:previous.position.z+(current.position.z-previous.position.z)*alpha},
      yaw:previous.yaw+yawStep*alpha,
      speed:previous.speed+(current.speed-previous.speed)*alpha,
    }
    return snapshot()
  }
  function snapshot():KunaFrame{
    return {...rendered,position:{...rendered.position},
      goal:rendered.goal?{...rendered.goal}:null,
      route:rendered.route.map(p=>({...p}))}
  }
  return {update,snapshot}
}
