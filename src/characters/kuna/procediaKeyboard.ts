/**
 * Original Procedia Desk Speaking manual controls.
 * Verified against lernin/Procedia/src/hooks/useDeskSpeaking.ts,
 * src/pages/desk-speaking/deskSpeakingClipHotkeys.ts and
 * src/components/Avatar.tsx (main, 2026-11-21).
 * Hold keys are momentary: keyup releases the effect. Number keys trigger
 * a ONE-SHOT native GLB animation, never a persistent pose toggle.
 */
import type { HeadPose } from './expressions'

export type ProcediaChannels=HeadPose&{jaw:number;freeze:boolean}
export type ProcediaClip={name:string;timeScale?:number}
export const PROCEDIA_KEY_ROWS=[
  {key:'J',code:'KeyJ',name:'Turn right',group:'Head'},
  {key:'L',code:'KeyL',name:'Turn left',group:'Head'},
  {key:'I',code:'KeyI',name:'Look up',group:'Head'},
  {key:'K',code:'KeyK',name:'Look down',group:'Head'},
  {key:'D',code:'KeyD',name:'Tilt right',group:'Head'},
  {key:'F',code:'KeyF',name:'Tilt left',group:'Head'},
  {key:'Q',code:'KeyQ',name:'Shake no',group:'Express'},
  {key:'C',code:'KeyC',name:'Slow disapproval',group:'Express'},
  {key:'V',code:'KeyV',name:'Vigorous no',group:'Express'},
  {key:'W',code:'KeyW',name:'Nod yes',group:'Express'},
  {key:'R',code:'KeyR',name:'Slow nod',group:'Express'},
  {key:'T',code:'KeyT',name:'Vigorous yes',group:'Express'},
  {key:'SPACE',code:'Space',name:'Open jaw',group:'Mouth'},
  {key:'A',code:'KeyA',name:'Freeze idle',group:'Body'},
] as const
export const PROCEDIA_CLIP_KEYS:Readonly<Record<string,ProcediaClip>>={
  Digit1:{name:'Death'},Digit2:{name:'Fall'},Digit3:{name:'Rest Pose'},
  Digit4:{name:'Sit'},Digit5:{name:'Idle Alert',timeScale:.55},
  Digit6:{name:'Walk'},Digit7:{name:'Run'},Digit8:{name:'Fetch'},
  Digit9:{name:'Jump'},Digit0:{name:'Bite'},
}
export const PROCEDIA_GESTURE_CODES=new Set<string>(PROCEDIA_KEY_ROWS.map(k=>k.code))
export function getProcediaClip(code:string):ProcediaClip|null{
  if(code.startsWith('Numpad'))return PROCEDIA_CLIP_KEYS['Digit'+code.slice(6)]??null
  return PROCEDIA_CLIP_KEYS[code]??null
}
export function isProcediaKey(code:string):boolean{
  return PROCEDIA_GESTURE_CODES.has(code)||getProcediaClip(code)!==null
}
const rad=(deg:number)=>deg*Math.PI/180
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value))
const pressed=(keys:ReadonlySet<string>,key:string)=>keys.has(key)?1:0
export function sampleProcediaKeys(keys:ReadonlySet<string>,elapsedSeconds:number):ProcediaChannels{
  const t=Number.isFinite(elapsedSeconds)?elapsedSeconds:0
  const turn=pressed(keys,'KeyJ')-pressed(keys,'KeyL')
  const pitch=pressed(keys,'KeyK')-pressed(keys,'KeyI')
  const tilt=pressed(keys,'KeyD')-pressed(keys,'KeyF')
  // Exact frequency and amplitude families in Procedia's Avatar.tsx:
  // 7.5rad/s shake, 7rad/s nod, slow x.34 at .52 amplitude and
  // vigorous x1.95 at 1.85 amplitude; held controls return to neutral on release.
  const shake=rad(8)*(
    Math.sin(t*7.5)*pressed(keys,'KeyQ')
    +.52*Math.sin(t*7.5*.34)*pressed(keys,'KeyC')
    +1.85*Math.sin(t*7.5*1.95)*pressed(keys,'KeyV')
  )
  const nod=rad(8)*(
    Math.sin(t*7)*pressed(keys,'KeyW')
    +Math.sin(t*7*.34)*.52*pressed(keys,'KeyR')
    +Math.sin(t*7*1.95)*1.85*pressed(keys,'KeyT')
  )
  return {
    turn:clamp(rad(10)*turn+shake,-rad(32),rad(32)),
    pitch:clamp(rad(30)*pitch+nod-rad(5)*tilt,-rad(36),rad(36)),
    tilt:clamp(rad(30)*tilt,-rad(30),rad(30)),
    jaw:pressed(keys,'Space'),
    freeze:keys.has('KeyA'),
  }
}
