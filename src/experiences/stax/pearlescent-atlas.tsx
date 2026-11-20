import type { Kind } from './model'
import { SYMBOLS } from './model'
import { SCALE } from './SymbolCanvas'

/**
 * The actual seven pearlescent assets, packed into one RGBA AVIF texture atlas.
 * Every source silhouette was masked to canonical STAX shape proportions.
 * Rendering maps the 320px atlas cells back onto live world-space geometry;
 * positioning, magnetic connections and shape hit tests stay SVG-native.
 *
 * Production shape body occupies 289/384 of each atlas cell, the remainder
 * reserving soft shadows, bevel highlights and colored caustics.
 */
export const PEARLESCENT_ATLAS='/stax-pearlescent/atlas.avif'
const CELL=320
const MAX_BODY=289/384
const atlasIndex:Record<Kind,number>={
 circle:0,triangle:1,square:2,rectangle:3,
 diamond:4,hexagon:5,oval:6,
}

/** The art never changes the canonical width and height of any STAX atom. */
export function PearlescentGlass({kind,w,h,omitted=false}:{
 kind:Kind;w:number;h:number;omitted?:boolean
}){
 if(omitted)return null
 const original=SYMBOLS[kind],nativeW=original.w*SCALE,nativeH=original.h*SCALE
 const bodyMax=Math.max(nativeW,nativeH)
 const full=bodyMax/MAX_BODY
 const tileW=full*w/nativeW,tileH=full*h/nativeH
 const x=(w-tileW)/2,y=(h-tileH)/2
 const i=atlasIndex[kind]
 return <svg x={x} y={y} width={tileW} height={tileH}
   viewBox={`${(i%4)*CELL} ${Math.floor(i/4)*CELL} ${CELL} ${CELL}`}
   preserveAspectRatio="none" overflow="hidden" pointerEvents="none"
   aria-hidden="true" className="stax-pearlescent-art">
   <image href={PEARLESCENT_ATLAS} x="0" y="0" width={CELL*4}
    height={CELL*2} preserveAspectRatio="none" pointerEvents="none"/>
  </svg>
}
