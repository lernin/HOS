import type { Kind } from './model'

/** Each classroom foam chip has its own transparent photo-derived image.
 * Never load the seven-piece atlas here: mobile SVG overflow previously
 * painted adjacent atlas cells beyond the intended silhouette.
 * Appearance only: STAX's world geometry and magnetic graph are unchanged.
 */
export const CLASSROOM_FOAM_FILES:Record<Kind,string>={
 circle:'/stax-foam/chips/circle.webp',
 triangle:'/stax-foam/chips/triangle.webp',
 square:'/stax-foam/chips/square.webp',
 rectangle:'/stax-foam/chips/rectangle.webp',
 diamond:'/stax-foam/chips/diamond.webp',
 hexagon:'/stax-foam/chips/hexagon.webp',
 oval:'/stax-foam/chips/oval.webp',
}

/** One image, one chip: no nested atlas SVG, clipping, or accidental groups. */
export function FoamChip({kind,w,h,omitted=false}:{
 kind:Kind;w:number;h:number;omitted?:boolean
}){
 if(omitted)return null
 return <image href={CLASSROOM_FOAM_FILES[kind]}
  x={0} y={0} width={w} height={h}
  preserveAspectRatio="none" pointerEvents="none"
  aria-hidden="true" className="stax-authentic-foam-chip"/>
}
