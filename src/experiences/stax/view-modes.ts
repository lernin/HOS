/** STAX visual-only modes. These never change grammar, geometry or saved
 * world coordinates. 'Omit' is a per-shape stroke style, not a new shape type.
 */
export type StaxTheme = 'color'|'blueprint'|'black'|'white'|'arc-reactor'|'hologram'|'cosmic'|'golden-line'
export const STAX_THEMES: readonly StaxTheme[] = ['color','blueprint','black','white','arc-reactor','hologram','cosmic','golden-line'] as const

export function nextStaxTheme(current:StaxTheme):StaxTheme {
 const i=STAX_THEMES.indexOf(current)
 return STAX_THEMES[(i+1)%STAX_THEMES.length]
}
export function staxThemeName(theme:StaxTheme):string {
 return ({color:'Color',blueprint:'Blueprint',black:'Black',white:'Black & white','arc-reactor':'Arc Reactor',hologram:'Holographic Glass',cosmic:'Cosmic Aurora','golden-line':'Golden Line'})[theme]
}
export function staxBoardColor(theme:StaxTheme):string {
 return ({
  color:'#faf9f6',blueprint:'#082a45',
  black:'#090b10',white:'#fbfaf7','arc-reactor':'#020b12',hologram:'#19172f',cosmic:'#090b22','golden-line':'#08090c'
 })[theme]
}
export function staxShapeStroke(theme:StaxTheme,original:string):string {
 return ({
  color:original,blueprint:'#78d9ff',
  black:'#f5f7fa',white:'#1c2733','arc-reactor':'#00f5ff',hologram:'#f7c5ff',cosmic:original,'golden-line':'#f7d35c'
 })[theme]
}
export function staxShapeFill(theme:StaxTheme,original:string):string {
 return ({
  color:original+'14',blueprint:'#2a678844',
  black:'#f5f7fa10',white:'#1c273307','arc-reactor':'#00d9ff21',hologram:'#ad80ff31',cosmic:original+'42','golden-line':'#c995241c'
 })[theme]
}
/** Dotted stroke signifies omission; the original word/role is retained. */
export function staxOmissionDash(omitted?:boolean):string|undefined {
 return omitted?'4 8':undefined
}
