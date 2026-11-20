import { useId } from 'react'
import type {Kind} from './model'
import {Glyph} from './SymbolCanvas'

/** Classroom Foam trial: a reversible vector rendering of Ashley's original
 * seven foam colors. Keeps canonical STAX hit geometry independent of material.
 * The source-photo PNG cutouts are maintained as a separate downloadable
 * high-fidelity asset pack for subsequent binary upload to this branch. */
const foam:{[K in Kind]:{face:string;edge:string}}={
 circle:{face:'#218fee',edge:'#0966bb'},
 triangle:{face:'#d82379',edge:'#982058'},
 square:{face:'#df8fe0',edge:'#a55da9'},
 rectangle:{face:'#8962e2',edge:'#563cb0'},
 diamond:{face:'#fff52b',edge:'#baa416'},
 hexagon:{face:'#dd704d',edge:'#a14832'},
 oval:{face:'#32c9b4',edge:'#1c937e'},
}
export function ClassroomFoam({kind,w,h,omitted=false}:{
 kind:Kind;w:number;h:number;omitted?:boolean
}){
 if(omitted)return null
 const c=foam[kind]
 const key=useId().replace(/:/g,'-')+'-foam-'+kind
 return <g className="stax-foam-asset" pointerEvents="none" aria-hidden="true">
  <defs>
   <filter id={key+'-rough'} x="-9%" y="-12%" width="118%" height="130%">
    <feTurbulence type="fractalNoise" baseFrequency=".068" numOctaves="3" seed="8" result="noise"/>
    <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.3" xChannelSelector="R" yChannelSelector="G"/>
   </filter>
   <filter id={key+'-grain'} x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency=".18" numOctaves="3" seed="4" result="noise"/>
    <feColorMatrix in="noise" type="saturate" values="0"/>
   </filter>
   <clipPath id={key+'-clip'}>
    <Glyph kind={kind} w={w} h={h} fill="white" stroke="none" strokeWidth={0}/>
   </clipPath>
  </defs>
  <Glyph kind={kind} w={w} h={h} fill={c.edge} stroke={c.edge}
   strokeWidth={2} filter={`url(#${key}-rough)`}/>
  <g clipPath={`url(#${key}-clip)`}>
   <rect x="2" y="1" width={Math.max(0,w-3)} height={Math.max(0,h-3)} fill={c.face}/>
   <rect x="0" y="0" width={w} height={h} fill="#ffffff" opacity=".13"
    filter={`url(#${key}-grain)`}/>
  </g>
  <Glyph kind={kind} w={w} h={h} fill="none" stroke="#ffffff"
   strokeWidth={.9} opacity={.28}/>
 </g>
}
