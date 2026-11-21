// Reusable Kuna expression recipes. Channels match Procedia's Head bone:
// pitch is local X; head turn / tilt are local Z. Radians, never pixels.
// A later recording Lab can save the same versioned data without changing playback.
export type KunaVoicePhase='idle'|'listening'|'thinking'|'speaking'
export type HeadKey={at:number;pitch:number;turn:number;tilt:number}
export type ExpressionRecipe={
  version:1
  id:string
  category:'listening'|'thinking'|'response'|'social'
  duration:number
  repeat:boolean
  keys:readonly HeadKey[]
}

export const KUNA_EXPRESSIONS:Readonly<Record<Exclude<KunaVoicePhase,'idle'>,ExpressionRecipe>>={
  listening:{
    version:1,id:'listen.curious',category:'listening',duration:3.2,repeat:true,
    keys:[
      {at:0,pitch:0,turn:0,tilt:0},
      {at:.42,pitch:-.025,turn:.012,tilt:.085},
      {at:1.18,pitch:-.058,turn:.020,tilt:.12},
      {at:2.15,pitch:-.035,turn:-.017,tilt:.057},
      {at:3.2,pitch:0,turn:0,tilt:0},
    ],
  },
  thinking:{
    version:1,id:'think.puzzled',category:'thinking',duration:2.8,repeat:true,
    keys:[
      {at:0,pitch:0,turn:0,tilt:0},
      {at:.48,pitch:.014,turn:-.024,tilt:-.09},
      {at:1.5,pitch:.023,turn:.02,tilt:-.10},
      {at:2.8,pitch:0,turn:0,tilt:0},
    ],
  },
  speaking:{
    version:1,id:'reply.gentle-enthusiasm',category:'response',duration:2.4,repeat:true,
    keys:[
      {at:0,pitch:0,turn:0,tilt:0},
      {at:.34,pitch:-.035,turn:0,tilt:.035},
      {at:.62,pitch:.022,turn:0,tilt:.015},
      {at:.92,pitch:-.045,turn:.011,tilt:-.012},
      {at:1.42,pitch:.005,turn:-.01,tilt:.035},
      {at:2.4,pitch:0,turn:0,tilt:0},
    ],
  },
}

export type HeadPose={pitch:number;turn:number;tilt:number}
export const KUNA_NEUTRAL:HeadPose={pitch:0,turn:0,tilt:0}
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n))
const ease=(t:number)=>t*t*(3-2*t)

export function validateKunaRecipe(recipe:ExpressionRecipe):boolean{
  if(recipe.version!==1||!recipe.id||!Number.isFinite(recipe.duration)||recipe.duration<=0||recipe.duration>12)return false
  if(recipe.keys.length<2||recipe.keys.length>48||recipe.keys[0].at!==0||
     recipe.keys[recipe.keys.length-1].at!==recipe.duration)return false
  for(let i=0;i<recipe.keys.length;i++){
    const k=recipe.keys[i]
    if(!Number.isFinite(k.at)||!Number.isFinite(k.pitch)||!Number.isFinite(k.turn)||!Number.isFinite(k.tilt))return false
    if(Math.abs(k.pitch)>.32||Math.abs(k.turn)>.28||Math.abs(k.tilt)>.32)return false
    if(i&&k.at<=recipe.keys[i-1].at)return false
  }
  return true
}
export function sampleKunaRecipe(recipe:ExpressionRecipe,elapsed:number):HeadPose{
  if(!validateKunaRecipe(recipe))return {...KUNA_NEUTRAL}
  const t=recipe.repeat?
    ((Number.isFinite(elapsed)?elapsed:0)%recipe.duration+recipe.duration)%recipe.duration:
    clamp(Number.isFinite(elapsed)?elapsed:0,0,recipe.duration)
  for(let i=1;i<recipe.keys.length;i++){
    const a=recipe.keys[i-1],b=recipe.keys[i]
    if(t>b.at&&i<recipe.keys.length-1)continue
    const u=ease(clamp((t-a.at)/(b.at-a.at),0,1))
    return {
      pitch:a.pitch+(b.pitch-a.pitch)*u,
      turn:a.turn+(b.turn-a.turn)*u,
      tilt:a.tilt+(b.tilt-a.tilt)*u,
    }
  }
  return {...KUNA_NEUTRAL}
}

export function conversationalHeadPose(phase:KunaVoicePhase,elapsed:number,sitAmount:number):HeadPose{
  const recipe=phase==='idle'?null:KUNA_EXPRESSIONS[phase]
  const expression=recipe?sampleKunaRecipe(recipe,elapsed):KUNA_NEUTRAL
  // Eye level for a first-person child is above the seated 0.78m fox.
  // This is local pitch rather than whole-body tilting; keep the body planted.
  const lookUp=-.155*clamp(sitAmount,0,1)
  return {
    pitch:clamp(expression.pitch+lookUp,-.32,.32),
    turn:expression.turn,
    tilt:expression.tilt,
  }
}
