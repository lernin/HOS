import { useState } from 'react'
import { STAX_THEMES, staxThemeName, type StaxTheme } from './view-modes'
import { SYMBOLS } from './model'
import { FONT_CHOICES, FONT_STACKS, TEXT_TARGETS, TEXT_TARGET_LABELS, defaultTextStyle, type TypographyBook, type TextTarget, type TextStyle } from './skin-typography'

export function SkinTypographyWorkshop({theme,setTheme,book,onChange,onCapture,onClose,dirty}:{theme:StaxTheme;setTheme:(theme:StaxTheme)=>void;book:TypographyBook;onChange:(next:TypographyBook)=>void;onCapture:()=>void;onClose:()=>void;dirty:boolean}){
 const [target,setTarget]=useState<TextTarget>('circle')
 const current=book[theme][target]
 function edit(patch:Partial<TextStyle>){
  onChange({...book,[theme]:{...book[theme],[target]:{...current,...patch}}})
 }
 function restoreSkin(){
  onChange({...book,[theme]:Object.fromEntries(TEXT_TARGETS.map(t=>[t,defaultTextStyle(theme,t)])) as TypographyBook[StaxTheme]})
 }
 return <section id="stax-text-workshop" className="stax-text-workshop" aria-label="Text workshop">
  <header className="stax-text-workshop-heading">
   <div><small>STAX · TEXT WORKSHOP</small><strong>{staxThemeName(theme)}</strong></div>
   <button type="button" onClick={onClose} aria-label="Close text workshop">×</button>
  </header>
  <label className="stax-text-workshop-theme">Current skin
   <select value={theme} onChange={e=>setTheme(e.target.value as StaxTheme)}>{STAX_THEMES.map(t=><option key={t} value={t}>{staxThemeName(t)}</option>)}</select>
  </label>
  <p className="stax-text-workshop-description">Choose fonts by appearance. Each shape and the interface can have independent lettering for every skin.</p>
  <div className="stax-text-targets" role="group" aria-label="Select text element">
   {TEXT_TARGETS.map(t=><button key={t} type="button" className={target===t?'is-active':''} aria-pressed={target===t} onClick={()=>setTarget(t)}>
    <span className="stax-text-target-mark" style={{background:t==='interface'?'#c6cdd6':SYMBOLS[t].color}}/>{TEXT_TARGET_LABELS[t]}
   </button>)}
  </div>
  <div className="stax-text-font-gallery" role="group" aria-label="Choose a font by looking at it">
   {FONT_CHOICES.map(item=><button key={item.id} type="button" className={current.font===item.id?'is-active':''} aria-pressed={current.font===item.id}
    aria-label={item.id+' style'} onClick={()=>edit({font:item.id})}>
    <span style={{fontFamily:item.stack}}>{item.sample}</span>
   </button>)}
  </div>
  <div className="stax-text-controls">
   <label>Ink <input type="color" value={current.color} onChange={e=>edit({color:e.target.value})}/></label>
   <button type="button" aria-pressed={current.bold} className={current.bold?'is-active':''} onClick={()=>edit({bold:!current.bold})}><strong>Bold</strong> {current.bold?'On':'Off'}</button>
   <label>Size <input type="range" min="12" max="32" value={current.size} onChange={e=>edit({size:Number(e.target.value)})}/><output>{current.size}</output></label>
  </div>
  <div className="stax-text-workshop-preview" style={{fontFamily:FONT_STACKS[current.font],fontWeight:current.bold?700:400,fontSize:current.size+8,color:current.color}}>Learn · Play · Grow</div>
  <footer className="stax-text-workshop-footer">
   <button type="button" onClick={restoreSkin}>Reset this skin</button>
   <button type="button" className="stax-text-capture" disabled={!dirty} onClick={onCapture}>Capture all edits {dirty?'· Unsaved':'· Saved'}</button>
  </footer>
  <small className="stax-text-storage-note">Capture saves all 16 skins locally on this device, not to production.</small>
 </section>
}
