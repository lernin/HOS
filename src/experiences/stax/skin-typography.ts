import { STAX_THEMES, type StaxTheme } from './view-modes'
import type { Kind } from './model'

/** Text appearance is presentation-only: never change atom words or geometry. */
export type TextTarget=Kind|'interface'
export type TextStyle={font:string;color:string;bold:boolean;size:number}
export type SkinTypography=Record<TextTarget,TextStyle>
export type TypographyBook=Record<StaxTheme,SkinTypography>
export const TYPOGRAPHY_STORAGE_KEY='stax-skin-typography-v1'
export const TEXT_TARGETS:readonly TextTarget[]=['circle','triangle','rectangle','oval','square','diamond','hexagon','interface'] as const
export const FONT_CHOICES=[
 {id:'rounded',stack:'"Baloo 2","Trebuchet MS",system-ui,sans-serif',sample:'Hello, world!'},
 {id:'modern',stack:'"DM Sans","Trebuchet MS",system-ui,sans-serif',sample:'Hello, world!'},
 {id:'literary',stack:'"Playfair Display",Georgia,serif',sample:'Hello, world!'},
 {id:'geometric',stack:'"Orbitron","Trebuchet MS",sans-serif',sample:'HELLO, WORLD!'},
 {id:'classic',stack:'"Cormorant Garamond",Georgia,serif',sample:'Hello, world!'},
 {id:'friendly',stack:'"Nunito",system-ui,sans-serif',sample:'Hello, world!'},
 {id:'handwritten',stack:'"Caveat","Comic Sans MS",cursive',sample:'Hello, world!'},
 {id:'script',stack:'"Pacifico","Brush Script MT",cursive',sample:'Hello, world!'},
 {id:'lobster',stack:'"Lobster Two",Georgia,serif',sample:'Hello, world!'},
 {id:'display',stack:'"Bangers",Impact,sans-serif',sample:'HELLO, WORLD!'},
] as const
export type FontId=typeof FONT_CHOICES[number]['id']
export const FONT_STACKS:Record<string,string>=Object.fromEntries(FONT_CHOICES.map(f=>[f.id,f.stack]))
export const TEXT_TARGET_LABELS:Record<TextTarget,string>={
 circle:'Blue circle',triangle:'Red triangle',rectangle:'Purple rectangle',
 oval:'Green oval',square:'Pink square',diamond:'Yellow diamond',
 hexagon:'Orange hexagon',interface:'Interface'
}
const DARK=new Set<StaxTheme>(['blueprint','black','arc-reactor','hologram','cosmic','golden-line','golden-pollen','jelly-bloom','glassmorph','glass-beads','pearlescent-dusk'])
const GOLD=new Set<StaxTheme>(['golden-line','golden-pollen'])
export function defaultTextStyle(theme:StaxTheme,target:TextTarget):TextStyle{
 const dark=DARK.has(theme)
 const font:FontId=theme==='classroom-foam'?'friendly':
  GOLD.has(theme)?'classic':
  theme==='arc-reactor'||theme==='hologram'?'geometric':
  theme==='cosmic'||theme==='pearlescent-dusk'?'literary':
  theme==='jelly-bloom'?'rounded':
  theme==='pearlescent-glass'||theme==='pearlescent-airglass'?'literary':
  theme==='blueprint'?'modern':theme==='black'?'modern':
  theme==='white'?'classic':'friendly'
 const color=theme==='classroom-foam'?'#3b2d22':
  GOLD.has(theme)?'#fff0c8':
  theme.startsWith('pearlescent-')?(theme==='pearlescent-dusk'?'#f8edff':'#3f354c'):
  dark?'#edf9ff':'#253c55'
 return {font:target==='interface'?'modern':font,color,bold:target==='interface'?false:theme==='classroom-foam'||theme==='color'||theme==='jelly-bloom',size:target==='interface'?14:21}
}
export function defaultTypographyBook():TypographyBook{
 return Object.fromEntries(STAX_THEMES.map(theme=>[theme,Object.fromEntries(TEXT_TARGETS.map(target=>[target,defaultTextStyle(theme,target)]))])) as TypographyBook
}
export function sanitizeTypographyBook(candidate:unknown):TypographyBook{
 const defaults=defaultTypographyBook()
 if(!candidate||typeof candidate!=='object')return defaults
 for(const theme of STAX_THEMES){
  const themeInput=(candidate as Record<string,unknown>)[theme]
  if(!themeInput||typeof themeInput!=='object')continue
  for(const target of TEXT_TARGETS){
   const input=(themeInput as Record<string,unknown>)[target]
   if(!input||typeof input!=='object')continue
   const proposed=input as Record<string,unknown>,fallback=defaults[theme][target]
   defaults[theme][target]={
    font:typeof proposed.font==='string'&&FONT_STACKS[proposed.font]?proposed.font:fallback.font,
    color:typeof proposed.color==='string'&&/^#[0-9a-fA-F]{6}$/.test(proposed.color)?proposed.color:fallback.color,
    bold:typeof proposed.bold==='boolean'?proposed.bold:fallback.bold,
    size:typeof proposed.size==='number'&&Number.isFinite(proposed.size)?Math.max(12,Math.min(32,proposed.size)):fallback.size,
   }
  }
 }
 return defaults
}
