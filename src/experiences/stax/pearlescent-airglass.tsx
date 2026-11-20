import type { Kind } from './model'
import { Glyph } from './SymbolCanvas'
import { PearlescentGlass } from './pearlescent-atlas'

/**
 * A new opt-in SEE-THROUGH pearlescent material (not a replacement).
 *
 * Reuses the original seven precisely masked optical-glass atlas tiles,
 * retaining their spectral highlights and shadows. The body is blended at
 * 38% alpha while independent crisp, translucent SVG bevels preserve the
 * original premium rim even over a second atom. No new geometry, hit targets,
 * drag handlers, or backend assets. Works in the palette and lifted preview.
 *
 * Transparent overlapping elements are genuinely visible through the tile.
 * This is alpha-translucency, not computational refraction; the latter would
 * require a live backdrop shader and is intentionally not introduced to the
 * Android magnetic interaction at this stage.
 */
export function PearlescentAirglass({kind,w,h,omitted=false}:{
 kind:Kind;w:number;h:number;omitted?:boolean
}){
 if(omitted)return null
 return <g className="stax-airglass-asset" aria-hidden="true" pointerEvents="none">
  {/* A very faint lens substrate — opacity stays below 10%. */}
  <Glyph kind={kind} w={w} h={h} fill="#ffffff14"
    stroke="#d8bff1" strokeWidth={3.6} opacity={.42}/>
  {/* Original high-resolution rainbow caustics and shadows remain present,
      but their alpha lets every underlying glyph show through. */}
  <g opacity=".38" pointerEvents="none">
   <PearlescentGlass kind={kind} w={w} h={h}/>
  </g>
  {/* Independent rim reflections keep the result crisp rather than washed out. */}
  <Glyph kind={kind} w={w} h={h} fill="none"
    stroke="#fef8ff" strokeWidth={2.2} opacity={.88}/>
  <Glyph kind={kind} w={w} h={h} fill="none"
    stroke="#b7c9fc" strokeWidth={.75} opacity={.78}/>
 </g>
}
