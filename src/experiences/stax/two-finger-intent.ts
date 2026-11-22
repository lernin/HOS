/** Phone touchpad: classify a two-finger gesture before sending camera events.
 * A small dead zone, intent locking, and independent pan/pinch streams prevent
 * unintended zoom while scrolling. A/B thumb zones never enter this recognizer.
 */
export type TwoFingerMode='pending'|'pan'|'pinch'
export type FingerPoint={id:number;x:number;y:number}
export type TwoFingerInput=[FingerPoint,FingerPoint]
type Measurement={x:number;y:number;distance:number}
export type TwoFingerSession={
 ids:[number,number]
 start:TwoFingerInput
 initial:Measurement
 last:Measurement
 mode:TwoFingerMode
}
export type CameraDelta={dx:number;dy:number;scale:number}
export type TwoFingerResult={
 session:TwoFingerSession
 frame:CameraDelta|null
 lockedNow:boolean
}
const distance=(a:FingerPoint,b:FingerPoint)=>Math.hypot(a.x-b.x,a.y-b.y)
const travelled=(a:FingerPoint,b:FingerPoint)=>distance(a,b)
function measure(points:TwoFingerInput):Measurement{
 return {x:(points[0].x+points[1].x)/2,y:(points[0].y+points[1].y)/2,
  distance:distance(points[0],points[1])}
}
function ordered(a:FingerPoint,b:FingerPoint):TwoFingerInput{
 return a.id<b.id?[{...a},{...b}]:[{...b},{...a}]
}
export function startTwoFinger(a:FingerPoint,b:FingerPoint):TwoFingerSession{
 const points=ordered(a,b)
 const initial=measure(points)
 return {ids:[points[0].id,points[1].id],start:points,initial,last:initial,mode:'pending'}
}
export function advanceTwoFinger(session:TwoFingerSession,a:FingerPoint,b:FingerPoint):TwoFingerResult{
 const points=ordered(a,b)
 if(points[0].id!==session.ids[0]||points[1].id!==session.ids[1]){
  // Touch identities have changed: begin a new undecided gesture.
  return {session:startTwoFinger(a,b),frame:null,lockedNow:false}
 }
 const now=measure(points),baseline=session.initial
 if(session.mode==='pending'){
  const centerMove=Math.hypot(now.x-baseline.x,now.y-baseline.y)
  const spreadMove=Math.abs(now.distance-baseline.distance)
  const firstMove=travelled(points[0],session.start[0])
  const secondMove=travelled(points[1],session.start[1])
  const delta1={x:points[0].x-session.start[0].x,y:points[0].y-session.start[0].y}
  const delta2={x:points[1].x-session.start[1].x,y:points[1].y-session.start[1].y}
  const denominator=Math.max(firstMove*secondMove,.001)
  const parallel=(delta1.x*delta2.x+delta1.y*delta2.y)/denominator
  const baselineDx=session.start[1].x-session.start[0].x
  const baselineDy=session.start[1].y-session.start[0].y
  const baselineDistance=Math.max(1,baseline.distance)
  const axisX=baselineDx/baselineDistance,axisY=baselineDy/baselineDistance
  const proj1=delta1.x*axisX+delta1.y*axisY
  const proj2=delta2.x*axisX+delta2.y*axisY
  const opposed=(proj1<=-5&&proj2>=5)||(proj1>=5&&proj2<=-5)
  // Panning requires BOTH fingers to move reasonably together. Waiting avoids
  // calling the first finger's asynchronous pointermove a pinch.
  const isPan=centerMove>=11&&firstMove>=6&&secondMove>=6&&
   parallel>=.55&&spreadMove<=Math.max(10,centerMove*.68)
  // Zoom requires a meaningful separation change and opposing radial intent.
  // Two fingers travelling in parallel cannot accidentally trigger zoom.
  const isPinch=baseline.distance>=28&&spreadMove>=14&&
   spreadMove/baselineDistance>=.05&&opposed
  const locked:TwoFingerMode=isPan?'pan':isPinch?'pinch':'pending'
  return {session:{...session,mode:locked,last:locked==='pending'?session.last:now},
   frame:null,lockedNow:locked!=='pending'}
 }
 if(session.mode==='pan'){
  const dx=now.x-session.last.x,dy=now.y-session.last.y
  if(Math.hypot(dx,dy)<.6)return {session,frame:null,lockedNow:false}
  return {session:{...session,last:now},frame:{dx,dy,scale:1},lockedNow:false}
 }
 // Pinch is exclusively zoom. Ignore centroid drift so the world stays still.
 const scale=session.last.distance>1?now.distance/session.last.distance:1
 if(!Number.isFinite(scale)||Math.abs(scale-1)<.006)return {session,frame:null,lockedNow:false}
 return {session:{...session,last:{...session.last,distance:now.distance}},
  frame:{dx:0,dy:0,scale:Math.max(.85,Math.min(1.15,scale))},lockedNow:false}
}
