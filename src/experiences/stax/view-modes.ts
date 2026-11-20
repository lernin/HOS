/** STAX visual-only modes. These never change grammar, geometry or saved
 * world coordinates. 'Omit' is a per-shape stroke style, not a new shape type.
 */
export type StaxTheme = 'color'|'blueprint'|'black'|'white'|'arc-reactor'|'hologram'|'cosmic'|'golden-line'|'golden-pollen'|'jelly-bloom'|'glassmorph'|'glass-beads'|'pearlescent-glass'|'pearlescent-airglass'|'pearlescent-dusk'|'classroom-foam'
export const STAX_THEMES: readonly StaxTheme[] = ['color','blueprint','black','white','arc-reactor','hologram','cosmic','golden-line','golden-pollen','jelly-bloom','glassmorph','glass-beads','pearlescent-glass','pearlescent-airglass','pearlescent-dusk','classroom-foam'] as const

export function nextStaxTheme(current:StaxTheme):StaxTheme {
 const i=STAX_THEMES.indexOf(current)
 return STAX_THEMES[(i+1)%STAX_THEMES.length]
}
export function staxThemeName(theme:StaxTheme):string {
 return ({color:'Color',blueprint:'Blueprint',black:'Black',white:'Black & white','arc-reactor':'Arc Reactor',hologram:'Holographic Glass',cosmic:'Cosmic Aurora','golden-line':'Golden Line','golden-pollen':'Golden Pollen','jelly-bloom':'Jelly Bloom','glassmorph':'Glassmorph','glass-beads':'Glass Beads','pearlescent-glass':'Pearlescent Glass','pearlescent-airglass':'Pearlescent Airglass','pearlescent-dusk':'Pearlescent Dusk','classroom-foam':'Classroom Foam Table'})[theme]
}
export function staxBoardColor(theme:StaxTheme):string {
 return ({
  color:'#faf9f6',blueprint:'#082a45',
  black:'#090b10',white:'#fbfaf7','arc-reactor':'#020b12',hologram:'#19172f',cosmic:'#090b22','golden-line':'#08090c','golden-pollen':'#07101e','jelly-bloom':'#24112f','glassmorph':'#181e45','glass-beads':'#031c33','pearlescent-glass':'#f1edf8','pearlescent-airglass':'#f1edf8','pearlescent-dusk':'#29243e','classroom-foam':'#8b6339'
 })[theme]
}
export function staxShapeStroke(theme:StaxTheme,original:string):string {
 return ({
  color:original,blueprint:'#78d9ff',
  black:'#f5f7fa',white:'#1c2733','arc-reactor':'#00f5ff',hologram:'#f7c5ff',cosmic:original,'golden-line':'#f7d35c','golden-pollen':'#ffe29e','jelly-bloom':'#ffe2fc','glassmorph':'#d3f7ff','glass-beads':'#b4fbff','pearlescent-glass':'#d8c9f6','pearlescent-airglass':'#ebdbff','pearlescent-dusk':'#fff3ff','classroom-foam':'#fff5df'
 })[theme]
}
export function staxShapeFill(theme:StaxTheme,original:string):string {
 return ({
  color:original+'14',blueprint:'#2a678844',
  black:'#f5f7fa10',white:'#1c273307','arc-reactor':'#00d9ff21',hologram:'#ad80ff31',cosmic:original+'42','golden-line':'#c995241c','golden-pollen':'#ffce5b0b','jelly-bloom':'#f66dc550','glassmorph':'#d1f8ff3d','glass-beads':'#40bfec5c','pearlescent-glass':'#e9ddf71f','pearlescent-airglass':'#ffffff0b','pearlescent-dusk':'#ffffff14','classroom-foam':'#ffffff0b'
 })[theme]
}
/** Dotted stroke signifies omission; the original word/role is retained. */
export function staxOmissionDash(omitted?:boolean):string|undefined {
 return omitted?'4 8':undefined
}
