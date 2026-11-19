/** STAX visual grammar v1. All values are relative design units, on a .07 grid. */
export const RULES = Object.freeze({ unit: .07, attachment: .28, group: .49, connector: .98, row: 2.03 })
export const SYMBOLS = {
  circle: { label: 'Circle', role: 'Noun / pronoun', w: 3.5, h: 3.5, color: '#3379dc' },
  triangle: { label: 'Triangle', role: 'Verb / predicate', w: 4.62, h: 3.5, color: '#e45450' },
  square: { label: 'Square', role: 'Preposition', w: 2.24, h: 2.24, color: '#d549a1' },
  rectangle: { label: 'Rectangle', role: 'Determiner', w: 2.52, h: 1.54, color: '#9763cc' },
  diamond: { label: 'Diamond', role: 'Conjunction / interjection', w: 2.38, h: 3.5, color: '#ba930e' },
  hexagon: { label: 'Hexagon', role: 'Supporting verb element', w: 2.8, h: 1.54, color: '#e69131' },
  oval: { label: 'Oval', role: 'Adjective / complement', w: 3.78, h: 2.1, color: '#53844a' },
} as const
export type Kind = keyof typeof SYMBOLS
export type SymbolNode = { id: string; kind: Kind; omitted: boolean; below: SymbolNode[]; next?: SymbolNode }
export type MapDraft = { version: 1; roots: SymbolNode[] }
export type Placement = 'auto' | 'below' | 'next'
export type Point = { x: number; y: number }
export type PlacedNode = SymbolNode & { x: number; y: number; w: number; h: number }
export type Dimension = { axis: 'x' | 'y'; a: Point; b: Point; at: number; value: number; rule: string }
export type Scene = { nodes: PlacedNode[]; dimensions: Dimension[]; width: number; height: number }
type Bounds = { left: number; top: number; right: number; bottom: number }
type Group = { nodes: PlacedNode[]; dimensions: Dimension[]; bounds: Bounds }
export const KINDS = Object.keys(SYMBOLS) as Kind[]
export const MAX_SYMBOLS = 80
const small = new Set<Kind>(['square','rectangle','hexagon','oval'])
const node = (id: string, kind: Kind, below: SymbolNode[] = [], next?: SymbolNode, omitted = false): SymbolNode => ({ id, kind, below, omitted, ...(next ? { next } : {}) })

export function preset(name: string): MapDraft {
  if (name === 'blank') return { version: 1, roots: [] }
  const object = node('object','circle')
  const verb = node('verb','triangle',[],object)
  const subject = node('subject','circle',[],verb)
  if (name !== 'simple') {
    verb.below = [node('aux-1','hexagon'),node('aux-2','hexagon')]
    object.below = [node('det-1','rectangle')]
  }
  if (name === 'expanded') object.below = [node('prep-1','square'),node('det-1','rectangle'),node('adj-1','oval')]
  if (name === 'joined' || name === 'omission') {
    const omitted = name === 'omission'
    object.next = node('join','diamond',[],node('subject-2','circle',[],node('verb-2','triangle',[
      node('aux-3','hexagon',[],undefined,omitted),node('aux-4','hexagon',[],undefined,omitted)
    ],node('object-2','circle',[node('det-2','rectangle')])),omitted))
  }
  return { version: 1, roots: [subject] }
}
export function findNode(doc: MapDraft, id: string | null): SymbolNode | undefined {
  if (!id) return undefined
  function search(n: SymbolNode): SymbolNode | undefined {
    if (n.id === id) return n
    for (const b of n.below) { const match = search(b); if (match) return match }
    return n.next ? search(n.next) : undefined
  }
  for (const n of doc.roots) { const match = search(n); if (match) return match }
}
export function countSymbols(doc: MapDraft): number {
  const count = (n: SymbolNode): number => 1 + n.below.reduce((s,b)=>s+count(b),0) + (n.next ? count(n.next) : 0)
  return doc.roots.reduce((sum,n)=>sum+count(n),0)
}
/** Resolve a selected direct modifier to the noun it supports. */
export function findSupportingCircle(doc: MapDraft, target: string | null): SymbolNode | undefined {
  if (!target) return undefined
  function visit(n: SymbolNode): SymbolNode | undefined {
    if (n.kind === 'circle' && n.below.some(b => b.id === target && (b.kind === 'rectangle' || b.kind === 'oval'))) return n
    for (const child of n.below) { const owner = visit(child); if (owner) return owner }
    return n.next ? visit(n.next) : undefined
  }
  for (const root of doc.roots) { const owner = visit(root); if (owner) return owner }
}

export function addSymbol(doc: MapDraft, target: string | null, kind: Kind, placement: Placement = 'auto', id = crypto.randomUUID()): MapDraft {
  if (countSymbols(doc) >= MAX_SYMBOLS) return doc
  const result = structuredClone(doc), requestedParent = findNode(result,target), owner = (kind === 'rectangle' || kind === 'oval') && placement === 'auto' ? findSupportingCircle(result,target) : undefined, resolvedParent = owner || requestedParent, parent = kind === 'rectangle' && resolvedParent?.kind !== 'circle' ? undefined : resolvedParent, added = node(id,kind)
  if (!parent) result.roots.push(added)
  else if (placement === 'below' || (placement === 'auto' && small.has(kind) && !small.has(parent.kind))) parent.below.push(added)
  else { added.next = parent.next; parent.next = added }
  return result
}
/** 
 * Shape-only trial: position one noun/pronoun circle relative to one verb triangle.
 * This is a layout relationship, not a claim that a sentence is grammatical.
 * Left/right refer to where the NEW symbol was dropped relative to the existing one.
 */
export type DropSide = 'left' | 'right'

/** A relationship is proposed only for shapes whose association is known. */
export function locateDropTarget(scene: Scene, kind: Kind, x: number, y: number): {target: string; side?: DropSide} | null {
  // A drop *on* an unrelated shape must not borrow a nearby noun's anchor.
  const directlyUnder = scene.nodes.find(n => x >= n.x && x <= n.x+n.w && y >= n.y && y <= n.y+n.h)
  // Any support shape can join a blue circle already embedded in a sequence.
  // This is an orthogonal under-head relationship, never another next item.
  const nounSupport = kind === 'square' || kind === 'rectangle' || kind === 'oval'
  if (nounSupport && directlyUnder && directlyUnder.kind !== 'circle') {
    const owner = scene.nodes.find(n => n.kind === 'circle' && n.below.some(b => b.id === directlyUnder.id))
    return owner ? {target:owner.id} : null
  }
  const circleTriangle = scene.nodes.length === 1 &&
    ((scene.nodes[0].kind === 'circle' && kind === 'triangle') ||
     (scene.nodes[0].kind === 'triangle' && kind === 'circle'))
  // Once ○→△ is established, the next ○ completes the 1–5–9 spine.
  // The first-pair-only lookup previously returned no target and started a new row.
  // A drop anywhere to the right of the subject centre chooses the vacant
  // object slot; a deliberate left-side drop can still begin an independent row.
  const subject = scene.nodes.find(n => n.kind === 'circle' && n.next?.kind === 'triangle')
  const verb = scene.nodes.find(n => n.kind === 'triangle' && !n.next)
  if (kind === 'circle' && scene.nodes.length === 2 && subject && verb &&
      x >= subject.x + subject.w / 2) {
    return {target: verb.id}
  }
  const candidates = scene.nodes.filter(n => (nounSupport && n.kind === 'circle') ||
    (circleTriangle && n.id === scene.nodes[0].id))
  const near = candidates.map(n => ({n, dx: x - (n.x + n.w / 2), dy: y - (n.y + n.h / 2)}))
    .filter(c => Math.abs(c.dx) <= c.n.w / 2 + 5 && Math.abs(c.dy) <= c.n.h / 2 + 5)
    .sort((a, b) => Math.hypot(a.dx, a.dy) - Math.hypot(b.dx, b.dy))
  if (!near.length) return null
  const nearest = near[0]
  return circleTriangle ? {target: nearest.n.id, side: nearest.dx < 0 ? 'left' : 'right'} : {target: nearest.n.id}
}
export function addBasicPair(doc: MapDraft, targetId: string, kind: Kind, side: DropSide, id = crypto.randomUUID()): MapDraft | null {
  if (countSymbols(doc) !== 1 || doc.roots.length !== 1) return null
  const original = doc.roots[0]
  if (original.id !== targetId || original.next || original.below.length || original.omitted) return null
  if (!((original.kind === 'circle' && kind === 'triangle') || (original.kind === 'triangle' && kind === 'circle'))) return null
  const existing = structuredClone(original), added = node(id, kind)
  // Subject -> verb -> object flows diagonally from upper left to lower right.
  const first = side === 'left' ? added : existing
  const last = side === 'left' ? existing : added
  first.next = last
  return {version: 1, roots: [first]}
}

export function setOmitted(doc: MapDraft, id: string, omitted: boolean): MapDraft {
  const result = structuredClone(doc), n = findNode(result,id)
  if (n) n.omitted = omitted
  return result
}
export function removeSymbol(doc: MapDraft, id: string): MapDraft {
  const result = structuredClone(doc)
  function remove(n: SymbolNode): SymbolNode | undefined {
    if (n.id === id) return n.next
    n.below = n.below.map(remove).filter((b): b is SymbolNode=>!!b)
    n.next = n.next ? remove(n.next) : undefined
    return n
  }
  result.roots = result.roots.map(remove).filter((n): n is SymbolNode=>!!n)
  return result
}
export function parseDraft(raw: string): MapDraft | null {
  try {
    if (raw.length > 60000) return null
    const value = JSON.parse(raw), ids = new Set<string>(); let count = 0
    function valid(n: unknown, depth: number): boolean {
      if (!n || typeof n !== 'object' || depth > MAX_SYMBOLS || ++count > MAX_SYMBOLS) return false
      const v = n as SymbolNode
      if (typeof v.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(v.id) || ids.has(v.id) || !KINDS.includes(v.kind) || typeof v.omitted !== 'boolean' || !Array.isArray(v.below)) return false
      ids.add(v.id)
      return v.below.every(b=>valid(b,depth+1)) && (v.next === undefined || valid(v.next,depth+1))
    }
    if (value?.version !== 1 || !Array.isArray(value.roots) || !value.roots.every((n: unknown)=>valid(n,0))) return null
    return value as MapDraft
  } catch { return null }
}
function bounds(nodes: PlacedNode[]): Bounds {
  return { left: Math.min(...nodes.map(n=>n.x)), top: Math.min(...nodes.map(n=>n.y)), right: Math.max(...nodes.map(n=>n.x+n.w)), bottom: Math.max(...nodes.map(n=>n.y+n.h)) }
}
function translate(group: Group, x: number, y: number): Group {
  return {
    nodes: group.nodes.map(n=>({...n,x:n.x+x,y:n.y+y})),
    dimensions: group.dimensions.map(d=>({...d,a:{x:d.a.x+x,y:d.a.y+y},b:{x:d.b.x+x,y:d.b.y+y},at:d.at+(d.axis==='x'?y:x)})),
    bounds: {left:group.bounds.left+x,top:group.bounds.top+y,right:group.bounds.right+x,bottom:group.bounds.bottom+y},
  }
}
function arrange(n: SymbolNode): Group {
  const {w,h} = SYMBOLS[n.kind]
  const own: PlacedNode = {...n,x:0,y:0,w,h}
  let nodes = [own], dimensions: Dimension[] = []
  if (n.below.length) {
    const groups = n.below.map(arrange)
    const total = groups.reduce((s,g)=>s+g.bounds.right-g.bounds.left,0) + RULES.attachment * (groups.length-1)
    // A single noun supporter is right-edge-aligned at the parent's centreline.
    // With two or more, centre the combined width below the noun instead.
    const loneSupport = n.kind === 'circle' && n.below.length === 1
    const rowHeight = Math.max(...groups.map(g => g.bounds.bottom - g.bounds.top))
    const rowTop = h + RULES.attachment
    let x = loneSupport ? w / 2 - total : (w - total) / 2
    for (let i=0;i<groups.length;i++) {
      const groupHeight = groups[i].bounds.bottom - groups[i].bounds.top
      const g = translate(groups[i],x-groups[i].bounds.left,rowTop+(rowHeight-groupHeight)/2-groups[i].bounds.top)
      if (i) dimensions.push({axis:'x',a:{x:x-RULES.attachment,y:h+RULES.attachment},b:{x,y:h+RULES.attachment},at:h+RULES.attachment+Math.max(...groups.map(g=>g.bounds.bottom-g.bounds.top))+.65,value:RULES.attachment,rule:'attachment-row'})
      nodes.push(...g.nodes); dimensions.push(...g.dimensions)
      x = g.bounds.right + RULES.attachment
    }
    dimensions.push({axis:'y',a:{x:0,y:h},b:{x:(w-total)/2,y:h+RULES.attachment},at:Math.min(0,(w-total)/2)-.7,value:RULES.attachment,rule:'attachment'})
  }
  let box = bounds(nodes)
  if (n.next) {
    const next = arrange(n.next)
    const connector = n.kind==='diamond' || n.next.kind==='diamond'
    const gap = connector ? RULES.connector : small.has(n.kind) ? RULES.attachment : RULES.group
    let y = (h-SYMBOLS[n.next.kind].h)/2
    if (!connector && n.kind==='circle' && n.next.kind==='triangle') y=h+RULES.attachment
    else if (!connector && n.kind==='triangle') y=h+RULES.group
    const g = translate(next,box.right+gap-next.bounds.left,y)
    const nextRoot = g.nodes[0]
    dimensions.push({axis:'x',a:{x:box.right,y:box.top},b:{x:g.bounds.left,y:g.bounds.top},at:Math.min(box.top,g.bounds.top)-.8,value:gap,rule:connector?'connector':'group'})
    if (nextRoot.y > h) dimensions.push({axis:'y',a:{x:w,y:h},b:{x:nextRoot.x,y:nextRoot.y},at:nextRoot.x-.6,value:nextRoot.y-h,rule:'step'})
    nodes.push(...g.nodes); dimensions.push(...g.dimensions); box=bounds(nodes)
  }
  return {nodes,dimensions,bounds:box}
}
export function layoutMap(doc: MapDraft): Scene {
  let nodes: PlacedNode[] = [], dimensions: Dimension[] = [], y=0, previous: Bounds | undefined
  for (const root of doc.roots) {
    const group = arrange(root), g=translate(group,-group.bounds.left,y-group.bounds.top)
    if (previous) dimensions.push({axis:'y',a:{x:0,y:previous.bottom},b:{x:0,y:g.bounds.top},at:-.8,value:RULES.row,rule:'row'})
    nodes.push(...g.nodes); dimensions.push(...g.dimensions); previous=g.bounds; y=g.bounds.bottom+RULES.row
  }
  if (!nodes.length) return {nodes:[],dimensions:[],width:22,height:14}
  const box=bounds(nodes), margin=2.4, all=translate({nodes,dimensions,bounds:box},margin-box.left,margin-box.top)
  return {nodes:all.nodes,dimensions:all.dimensions,width:box.right-box.left+margin*2,height:box.bottom-box.top+margin*2}
}
export function studyScene(construction = false): Scene {
  const nodes: PlacedNode[] = []
  let x = 2.4
  for (const [index,kind] of KINDS.entries()) {
    const {w,h} = SYMBOLS[kind]
    nodes.push({...node(`study-${kind}`,kind),x:construction?8-w/2:x,y:construction?5.8-h:2.4+(3.5-h)/2,w,h})
    x+=w+RULES.connector
    if (index===KINDS.length-1) break
  }
  return {nodes,dimensions:[],width:construction?16:x-RULES.connector+2.4,height:construction?9:8.3}
}