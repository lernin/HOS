// World-independent engagement state for every Kuna environment.
// Voice playback ending never releases the character. Only a real change
// in the player's position (or explicit end of session) can do that.
export type KunaCompanionMode='roaming'|'engaged'|'following'
export type KunaPoint={x:number;z:number}
export const KUNA_FOLLOW_START_DISTANCE=.68
export function createKunaCompanionSession(){
  let mode:KunaCompanionMode='roaming'
  let anchor:KunaPoint|null=null
  function engage(point:KunaPoint){
    mode='engaged';anchor={x:point.x,z:point.z}
  }
  function update(player:KunaPoint):KunaCompanionMode{
    if(mode==='engaged'&&anchor&&
      Math.hypot(player.x-anchor.x,player.z-anchor.z)>KUNA_FOLLOW_START_DISTANCE){
      mode='following'
    }
    return mode
  }
  function end(){mode='roaming';anchor=null}
  return {engage,update,end,mode:()=>mode}
}
