export type EstateRailPoint = readonly [number, number]
export type EstateRail = {
  id: string
  code: string
  label: string
  points: readonly EstateRailPoint[]
  height?: number
  glass?: boolean
  curb?: boolean
  family: 'guard' | 'garden'
  audit?: 'review'
}

export const RAIL_BASE = .115
export const RAIL_EDGE_GAP = RAIL_BASE / 2
export const RAIL_EDGE_INSET = RAIL_BASE / 2 + RAIL_EDGE_GAP
export const RAIL_POST = .065
export const RAIL_CAP_OVERHANG = RAIL_POST
export const RAIL_END_GAP = RAIL_EDGE_INSET - RAIL_CAP_OVERHANG

const p = (x:number,z:number):EstateRailPoint => [x,z]

export const estateRailings: EstateRail[] = [
  {
    id:'west-ocean',
    code:'R1',
    label:'West ocean terrace',
    family:'guard',
    glass:true,
    points:[
      p(-23+RAIL_EDGE_INSET,-17.08),
      p(-23+RAIL_EDGE_INSET,-24+RAIL_EDGE_INSET),
      p(-15+RAIL_EDGE_INSET,-24+RAIL_EDGE_INSET),
      p(-15+RAIL_EDGE_INSET,-36+RAIL_END_GAP),
    ],
  },
  {
    id:'east-ocean',
    code:'R2',
    label:'East ocean terrace & lookout',
    family:'guard',
    glass:true,
    points:[
      p(16-RAIL_EDGE_INSET,-36+RAIL_END_GAP),
      p(16-RAIL_EDGE_INSET,-24+RAIL_EDGE_INSET),
      p(27-RAIL_EDGE_INSET,-24+RAIL_EDGE_INSET),
      p(27-RAIL_EDGE_INSET,-23+RAIL_EDGE_INSET),
      p(40-RAIL_END_GAP,-23+RAIL_EDGE_INSET),
    ],
  },
  {
    id:'sunrise-cliff',
    code:'R3',
    label:'Sunrise terrace',
    family:'guard',
    glass:true,
    points:[p(44-RAIL_EDGE_INSET,-14+RAIL_END_GAP),p(44-RAIL_EDGE_INSET,14-RAIL_END_GAP)],
  },
  {
    id:'courtyard-drop',
    code:'R4',
    label:'Garden courtyard drop',
    family:'guard',
    glass:true,
    points:[p(-22,33-RAIL_EDGE_INSET),p(-6.5,33-RAIL_EDGE_INSET)],
  },
  {
    id:'east-gallery-drop',
    code:'R5',
    label:'East gallery drop',
    family:'guard',
    glass:true,
    points:[p(20+RAIL_EDGE_INSET,31.1),p(20+RAIL_EDGE_INSET,40-RAIL_END_GAP)],
  },
  {
    id:'arrival-garden-west',
    code:'R6',
    label:'Arrival garden west',
    family:'garden',
    audit:'review',
    height:.82,
    glass:false,
    points:[p(-18.15+RAIL_EDGE_INSET,34.5),p(-18.15+RAIL_EDGE_INSET,47.2)],
  },
  {
    id:'arrival-garden-east',
    code:'R7',
    label:'Arrival garden east',
    family:'garden',
    audit:'review',
    height:.82,
    glass:false,
    points:[p(20.15-RAIL_EDGE_INSET,40.2),p(20.15-RAIL_EDGE_INSET,48.4)],
  },
  {
    id:'foyer-garden-west-a',
    code:'R8',
    label:'Foyer garden west',
    family:'garden',
    height:.82,
    glass:false,
    curb:true,
    points:[p(-10.92-RAIL_EDGE_INSET,8.35),p(-10.92-RAIL_EDGE_INSET,13.65)],
  },
  {
    id:'foyer-garden-west-b',
    code:'R9',
    label:'Foyer garden west',
    family:'garden',
    height:.82,
    glass:false,
    curb:true,
    points:[p(-10.72,13.92+RAIL_EDGE_INSET),p(-6.28,13.92+RAIL_EDGE_INSET)],
  },
  {
    id:'foyer-garden-east-a',
    code:'R10',
    label:'Foyer garden east',
    family:'garden',
    height:.82,
    glass:false,
    curb:true,
    points:[p(8.02-RAIL_EDGE_INSET,10.18),p(8.02-RAIL_EDGE_INSET,13.82)],
  },
  {
    id:'foyer-garden-east-b',
    code:'R11',
    label:'Foyer garden east',
    family:'garden',
    height:.82,
    glass:false,
    curb:true,
    points:[p(13.02+RAIL_EDGE_INSET,8.35),p(13.02+RAIL_EDGE_INSET,14.65)],
  },
]
