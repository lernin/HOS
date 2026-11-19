/**
 * STAX source geometry, expressed in design units, not screen pixels.
 *
 * Sources: staxBLUEPRINT Level 13 measurement diagram and shape comparison,
 * plus Ashley's confirmed child-family invariants (2026-11-20).
 * This module contains geometry only. STAX POS 'n' is a family boundary;
 * eligibility/grammar rules must be handled by the calling code.
 */
export const STAX_SPACING = Object.freeze({
 unit: .07,
 attachment: .28,
 group: .49,
 connector: .98,
 row: 2.03,
} as const)

/** Observed small-blue circle diameter ratio on source slide 24.
 * Preserved for future role-aware rendering; no grammatical use is inferred.
 */
export const SMALL_BLUE_RATIO = .3353 / .4359

export type Box = { x: number; y: number; width: number; height: number }
export type FamilyChild = {
 id: string
 width: number
 height: number
 /** Leftmost descendant extent relative to the child's own left edge. */
 extentLeft?: number
 /** Rightmost descendant extent relative to the child's own left edge. */
 extentRight?: number
}
export type ChildPosition = { x: number; y: number }
export type FamilyOptions = { gap: number; belowGap: number }

/**
 * One child: the right edge of its own shape touches the parent centerline.
 * Two or more: the bounding widths of complete child subfamilies form a
 * horizontally centered row, with an exact gap between adjacent subfamilies.
 * Direct child SHAPE centers align vertically, regardless of subtree height.
 * Coordinates are deterministic and invariant under zoom/display size.
 */
export function positionChildren(
 parent: Box,
 children: readonly FamilyChild[],
 options: FamilyOptions,
): Map<string,ChildPosition> {
 const result=new Map<string,ChildPosition>()
 if(!children.length)return result
 const {gap,belowGap}=options
 if(![parent.x,parent.y,parent.width,parent.height,gap,belowGap].every(Number.isFinite)||gap<0||belowGap<0){
  throw new RangeError('STAX geometry requires finite coordinates and nonnegative gaps')
 }
 for(const c of children){
  const left=c.extentLeft??0,right=c.extentRight??c.width
  if(!c.id||![c.width,c.height,left,right].every(Number.isFinite)||c.width<=0||c.height<=0||left>0||right<c.width){
   throw new RangeError('Invalid child geometry in STAX family')
  }
 }
 if(children.length===1){
  const child=children[0]
  result.set(child.id,{
   x:parent.x+parent.width/2-child.width,
   y:parent.y+parent.height+belowGap,
  })
  return result
 }
 const spans=children.map(c=>(c.extentRight??c.width)-(c.extentLeft??0))
 const width=spans.reduce((s,w)=>s+w,0)+gap*(children.length-1)
 let cursor=parent.x+(parent.width-width)/2
 const tallest=Math.max(...children.map(c=>c.height))
 for(let i=0;i<children.length;i++){
  const c=children[i]
  result.set(c.id,{
   x:cursor-(c.extentLeft??0),
   y:parent.y+parent.height+belowGap+(tallest-c.height)/2,
  })
  cursor+=spans[i]+gap
 }
 return result
}

/** Source-specified head-to-next gap (e.g. yellow diamond -> blue = 0.98).
 * Aligns vertical midpoints unless the caller overrides y for a staircase.
 */
export function horizontalFollower(
 left:Box,right:{width:number;height:number},gap:number
):ChildPosition {
 if(!Number.isFinite(gap)||gap<0)throw new RangeError('Invalid STAX horizontal gap')
 return {x:left.x+left.width+gap,y:left.y+(left.height-right.height)/2}
}
