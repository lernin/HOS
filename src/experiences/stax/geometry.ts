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

/**
 * Two LARGE orange hexagons directly under a red verb form an X where
 * their inner tips meet and cross in Ashley's Blueprint reference.
 * This is not ordinary sibling spacing: use a slight, symmetric overlap.
 * The stroke outlines then visibly cross instead of leaving an empty gap.
 * Only use for exactly two direct red children with no deeper orange tier.
 */
export function positionRedOrangeCrossPair(
 parent:Box, children:readonly [FamilyChild,FamilyChild],belowGap:number
):Map<string,ChildPosition> {
 const [left,right]=children
 if(![parent.x,parent.y,parent.width,parent.height,left.width,left.height,right.width,right.height,belowGap].every(Number.isFinite)||
   parent.width<=0||parent.height<=0||left.width<=0||right.width<=0||
   left.height<=0||right.height<=0||belowGap<0||!left.id||!right.id||left.id===right.id)
  throw new RangeError('Invalid red-orange pair geometry')
 // A 2.5% inner-tip overlap recreates the reference's X, not a separated gap.
 const overlap=Math.min(left.width,right.width)*.025
 const total=left.width+right.width-overlap
 const leftX=parent.x+(parent.width-total)/2
 const y=parent.y+parent.height+belowGap
 return new Map([
  [left.id,{x:leftX,y:y+(Math.max(left.height,right.height)-left.height)/2}],
  [right.id,{x:leftX+left.width-overlap,y:y+(Math.max(left.height,right.height)-right.height)/2}],
 ])
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

/** Red's third orange is a special second-level adverb on the RIGHT orange.
 * Unlike a default single-child support (right edge at parent center), its
 * horizontal CENTER follows the right-hand orange's center. This is an
 * isolated, testable red-family adjustment; vertical attachment remains .28.
 */
export function positionRedRightNestedOrange(
 parent:Box,child:{width:number;height:number},belowGap:number
):ChildPosition {
 if(![parent.x,parent.y,parent.width,parent.height,child.width,child.height,belowGap].every(Number.isFinite)||
    parent.width<=0||parent.height<=0||child.width<=0||child.height<=0||belowGap<0)
  throw new RangeError('Invalid nested red-family coordinates')
 return {
  x:parent.x+(parent.width-child.width)/2,
  y:parent.y+parent.height+belowGap,
 }
}


/**
 * Minimal RIGHT shift for a following sentence family.
 *
 * Blueprint head spacing is measured separately from the clearance between
 * hanging supporters of adjacent families. A direct .28 support attachment
 * is NOT the clearance between different word families: those get the .98
 * group boundary when their vertical bands intersect. No extra space is
 * consumed when their descendants do not share a vertical band.
 *
 * Return a shift (>= 0), never mutate a shape, so camera/zoom and animation
 * cannot alter the canonical geometry.
 */
export function requiredFamilyFollowerShift(
 leftHead:Box,rightHead:Box,
 leftMembers:readonly Box[],rightMembers:readonly Box[],
 headGap:number,familyGap:number,
):number {
 const boxes=[leftHead,rightHead,...leftMembers,...rightMembers]
 if(![headGap,familyGap,...boxes.flatMap(b=>[b.x,b.y,b.width,b.height])].every(Number.isFinite)||
    headGap<0||familyGap<0||boxes.some(b=>b.width<=0||b.height<=0))
  throw new RangeError('Invalid STAX sequence family geometry')
 let shift=Math.max(0,leftHead.x+leftHead.width+headGap-rightHead.x)
 for(const a of leftMembers)for(const b of rightMembers){
  // A finite overlap, not a shared exact baseline: vertical neighbors do
  // not need a horizontal displacement merely to clear one another.
  if(a.y < b.y+b.height && b.y < a.y+a.height)
   shift=Math.max(shift,a.x+a.width+familyGap-b.x)
 }
 return Math.max(0,shift)
}
