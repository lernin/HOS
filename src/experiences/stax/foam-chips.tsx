import type { Kind } from './model'

/** Photo-derived foam sprites, masked from Ashley's seven real classroom chips.
 * One transparent atlas keeps seven mobile images on a single request.
 * Art only: dimensions, drag hit targets and magnetic grammar stay in the model.
 */
export const CLASSROOM_FOAM_ATLAS = '/stax-foam/foam-atlas.webp'
export const CLASSROOM_WOOD_DESK = '/stax-foam/wood-desk.webp'
const CELL = 192
const INDEX: Record<Kind,number> = {
 circle:0,triangle:1,square:2,rectangle:3,
 diamond:4,hexagon:5,oval:6
}
export function FoamChip({kind,w,h,omitted=false}:{
 kind:Kind;w:number;h:number;omitted?:boolean
}){
 if(omitted)return null
 const tile=INDEX[kind]
 return <svg x={0} y={0} width={w} height={h}
  viewBox={`${(tile%4)*CELL} ${Math.floor(tile/4)*CELL} ${CELL} ${CELL}`}
  preserveAspectRatio="none" overflow="hidden" pointerEvents="none"
  aria-hidden="true" className="stax-authentic-foam-chip">
  <image href={CLASSROOM_FOAM_ATLAS} x="0" y="0" width={CELL*4} height={CELL*2}
   preserveAspectRatio="none" pointerEvents="none"/>
 </svg>
}