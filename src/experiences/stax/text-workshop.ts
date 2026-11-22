import type { Kind } from './model'
import type { StaxTheme } from './view-modes'

/** Visible font samples, rather than a list of technical typeface names. */
export const TEXT_FONTS=[
 {id:'trebuchet',family:'"Trebuchet MS","Noto Sans",system-ui,sans-serif'},
 {id:'baloo',family:'"Baloo 2","Trebuchet MS",sans-serif'},
 {id:'almendra',family:'"Almendra",Georgia,serif'},
 {id:'orbitron',family:'"Orbitron","Trebuchet MS",sans-serif'},
 {id:'lobster',family:'"Lobster Two",Georgia,serif'},
 {id:'pacifico',family:'"Pacifico",cursive'},
 {id:'bangers',family:'"Bangers",Impact,sans-serif'},
 {id:'georgia',family:'Georgia,"Times New Roman",serif'},
 {id:'scomic',family:'"Comic Sans MS",cursive'},
] as const
export type FontId=typeof TEXT_FONTS[number]['id']
export type TextTarget=Kind|'interface'
export const TEXT_TARGETS:{id:TextTarget;label:string;sample:string}[]=[
 {id:'circle',label:'Blue · noun',sample:'I'},
 {id:'triangle',label:'Red · verb',sample:'play'},
 {id:'rectangle',label:'Purple · determiner',sample:'my'},
 {id:'oval',label:'Green · adjective',sample:'happy'},
 {id:'square',label:'Pink · preposition',sample:'with'},
 {id:'diamond',label:'Yellow · conjunction',sample:'and'},
 {id:'hexagon',label:'Orange · gate',sample:'can'},
 {id:'interface',label:'Menus and controls',sample:'STAX'},
]
export type TextTreatment={font:FontId;color:string;bold:boolean;scale:number}
export type TextTreatments=Partial<Record<StaxTheme,Partial<Record<TextTarget,TextTreatment>>>>
export const TEXT_TREATMENTS_KEY='stax-text-workshop-v1'
const fontIds=new Set<string>(TEXT_FONTS.map(f=>f.id))
const ink:Partial<Record<StaxTheme,string>>={
 blueprint:'#effbff',black:'#f4f7fb',white:'#1b2633',
 'arc-reactor':'#d8ffff',hologram:'#fff4ff',cosmic:'#f2f0ff',
 'golden-line':'#fff0c8','golden-pollen':'#fff0c8','jelly-bloom':'#fff5ff',
 glassmorph:'#e9faff','glass-beads':'#eaffff',
 'pearlescent-glass':'#3f354c','pearlescent-airglass':'#3f354c','pearlescent-dusk':'#3f354c',
 'classroom-foam':'#3b2d22',
}
const fonts:Partial<Record<StaxTheme,FontId>>={
 blueprint:'orbitron',black:'trebuchet',white:'georgia',
 'arc-reactor':'orbitron',hologram:'orbitron',cosmic:'almendra',
 'golden-line':'almendra','golden-pollen':'almendra',
 'jelly-bloom':'baloo',glassmorph:'trebuchet','glass-beads':'baloo',
 'pearlescent-glass':'almendra','pearlescent-airglass':'almendra','pearlescent-dusk':'almendra',
 'classroom-foam':'trebuchet',
}
export function defaultTextTreatment(theme:StaxTheme,target:TextTarget):TextTreatment{
 return {font:target==='interface'?'trebuchet':fonts[theme]??'trebuchet',
  color:ink[theme]??'#253c55',bold:target==='interface'?false:true,scale:100}
}
export function textTreatment(styles:TextTreatments,theme:StaxTheme,target:TextTarget):TextTreatment{
 return styles[theme]?.[target]??defaultTextTreatment(theme,target)
}
export function fontFamily(id:FontId):string{
 return TEXT_FONTS.find(f=>f.id===id)?.family??TEXT_FONTS[0].family
}
/** Fail closed on malformed or unknown older settings. No HTML/CSS injection. */
export function parseTextTreatments(raw:string|null):TextTreatments{
 if(!raw)return {}
 try{
  const value:unknown=JSON.parse(raw)
  if(!value||typeof value!=='object'||Array.isArray(value))return {}
  const result:TextTreatments={}
  for(const [theme,targets] of Object.entries(value)){
   if(!targets||typeof targets!=='object'||Array.isArray(targets))continue
   const next:Partial<Record<TextTarget,TextTreatment>>={}
   for(const {id} of TEXT_TARGETS){
    const data=(targets as Record<string,unknown>)[id]
    if(!data||typeof data!=='object'||Array.isArray(data))continue
    const s=data as Record<string,unknown>
    if(typeof s.font!=='string'||!fontIds.has(s.font)||typeof s.color!=='string'||
       !/^#[0-9a-fA-F]{6}$/.test(s.color)||typeof s.bold!=='boolean'||
       typeof s.scale!=='number'||!Number.isFinite(s.scale))continue
    next[id]={font:s.font as FontId,color:s.color,bold:s.bold,scale:Math.max(65,Math.min(135,s.scale))}
   }
   if(Object.keys(next).length)(result as Record<string,typeof next>)[theme]=next
  }
  return result
 }catch{return {}}
}
export const copyTreatments=(s:TextTreatments):TextTreatments=>JSON.parse(JSON.stringify(s)) as TextTreatments
