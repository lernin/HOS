/** STAX visual-only modes. These never change grammar, geometry or saved
 * world coordinates. 'Omit' is a per-shape stroke style, not a new shape type.
 */
export type StaxTheme = 'color'|'blueprint'|'black'|'white'
export const STAX_THEMES: readonly StaxTheme[] = ['color','blueprint','black','white'] as const

export function nextStaxTheme(current:StaxTheme):StaxTheme {
 const i=STAX_THEMES.indexOf(current)
 return STAX_THEMES[(i+1)%STAX_THEMES.length]
}
export function staxThemeName(theme:StaxTheme):string {
 return ({color:'Color',blueprint:'Blueprint',black:'Black',white:'Black & white'})[theme]
}
export function staxBoardColor(theme:StaxTheme):string {
 return ({
  color:'#faf9f6',blueprint:'#082a45',
  black:'#090b10',white:'#fbfaf7'
 })[theme]
}
export function staxShapeStroke(theme:StaxTheme,original:string):string {
 return ({
  color:original,blueprint:'#78d9ff',
  black:'#f5f7fa',white:'#1c2733'
 })[theme]
}
export function staxShapeFill(theme:StaxTheme,original:string):string {
 return ({
  color:original+'14',blueprint:'#2a678844',
  black:'#f5f7fa10',white:'#1c273307'
 })[theme]
}
/** Dotted stroke signifies omission; the original word/role is retained. */
export function staxOmissionDash(omitted?:boolean):string|undefined {
 return omitted?'4 8':undefined
}
