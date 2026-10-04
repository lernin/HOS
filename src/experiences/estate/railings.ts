import { poolWalkNorth, poolWalkSouth } from './site-layout'
export type EstateRailPoint = readonly [number, number]
export type EstateRail = {
  id: string
  code: string
  label: string
  points: readonly EstateRailPoint[]
  levels?: readonly number[]
  level?: number
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
      p(-47+RAIL_EDGE_INSET,poolWalkSouth+RAIL_EDGE_INSET),
      p(-15+RAIL_EDGE_INSET,poolWalkSouth+RAIL_EDGE_INSET),
      p(-15+RAIL_EDGE_INSET,poolWalkNorth+RAIL_EDGE_INSET),
    ],
  },
  {
    id:'east-ocean',
    code:'R2',
    label:'East ocean terrace & lookout',
    family:'guard',
    glass:true,
    points:[
      p(16-RAIL_EDGE_INSET,poolWalkNorth+RAIL_EDGE_INSET),
      p(16-RAIL_EDGE_INSET,poolWalkSouth+RAIL_EDGE_INSET),
      p(50-RAIL_EDGE_INSET,poolWalkSouth+RAIL_EDGE_INSET),
    ],
  },
  {
    id:'sunrise-cliff',
    code:'R3',
    label:'Sunrise terrace',
    family:'guard',
    glass:true,
    points:[p(50-RAIL_EDGE_INSET,poolWalkSouth+RAIL_EDGE_INSET),p(50-RAIL_EDGE_INSET,55-RAIL_EDGE_INSET),p(24+RAIL_EDGE_INSET,55-RAIL_EDGE_INSET),p(24+RAIL_EDGE_INSET,51+RAIL_EDGE_INSET)],
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
    level:4.8,
    code:'R6',
    label:'Arrival garden west',
    family:'garden',
    audit:'review',
    height:.82,
    glass:false,
    points:[p(-18.15+RAIL_EDGE_INSET,34.5),p(-18.15+RAIL_EDGE_INSET,38.7)],
  },
  {
    id:'arrival-garden-east',
    level:4.8,
    code:'R7',
    label:'Arrival garden east',
    family:'garden',
    audit:'review',
    height:.82,
    glass:false,
    points:[p(20.15-RAIL_EDGE_INSET,40.2),p(20.15-RAIL_EDGE_INSET,46.8)],
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
  {id:'west-family-garden-edge',code:'R24',label:'West promenade garden edge',family:'guard',glass:true,points:[p(-35-RAIL_END_GAP,-17-RAIL_EDGE_INSET),p(-39-RAIL_EDGE_INSET,-17-RAIL_EDGE_INSET),p(-39-RAIL_EDGE_INSET,-2-RAIL_END_GAP)]},
  {id:'east-suite-garden-edge',code:'R25',label:'East promenade garden edge',family:'guard',glass:true,points:[p(40+RAIL_EDGE_INSET,14+RAIL_EDGE_INSET),p(40+RAIL_EDGE_INSET,17-RAIL_END_GAP)]},
  {id:'west-promende-edge',code:'R12',label:'West cliff promenade',family:'guard',glass:true,points:[p(-47+RAIL_EDGE_INSET,-24+RAIL_EDGE_INSET),p(-47+RAIL_EDGE_INSET,44-RAIL_EDGE_INSET),p(-22-RAIL_END_GAP,44-RAIL_EDGE_INSET)]},
  {id:'west-arrival-drop',code:'R23',label:'West arrival terrace edge',family:'guard',glass:true,points:[p(-22-RAIL_EDGE_INSET,33+RAIL_EDGE_INSET),p(-22-RAIL_EDGE_INSET,39+RAIL_EDGE_INSET)]},
  {id:'pool-tip-edge',code:'R13',label:'Pool-tip terrace',family:'guard',glass:true,level:5.2,points:[p(-15+RAIL_EDGE_INSET,-64),p(-15+RAIL_EDGE_INSET,-70+RAIL_EDGE_INSET),p(16-RAIL_EDGE_INSET,-70+RAIL_EDGE_INSET),p(16-RAIL_EDGE_INSET,-64)]},
  {id:'pool-tip-water-edge',code:'R14',label:'Pool overflow edge',family:'guard',glass:true,level:5.2,points:[p(-11+RAIL_END_GAP,-60.2-RAIL_EDGE_INSET),p(12-RAIL_END_GAP,-60.2-RAIL_EDGE_INSET)]},
  {id:'west-pool-stair-outer',code:'R15',label:'West pool stair',family:'guard',glass:true,levels:[5.2,6],points:[p(-15+RAIL_EDGE_INSET,-64),p(-15+RAIL_EDGE_INSET,poolWalkNorth+RAIL_EDGE_INSET)]},
  {id:'west-pool-stair-inner',code:'R16',label:'West pool stair',family:'guard',glass:true,levels:[5.2,6],points:[p(-11-RAIL_EDGE_INSET,-64),p(-11-RAIL_EDGE_INSET,poolWalkNorth+RAIL_EDGE_INSET)]},
  {id:'east-pool-stair-outer',code:'R17',label:'East pool stair',family:'guard',glass:true,levels:[5.2,6],points:[p(16-RAIL_EDGE_INSET,-64),p(16-RAIL_EDGE_INSET,poolWalkNorth+RAIL_EDGE_INSET)]},
  {id:'east-pool-stair-inner',code:'R18',label:'East pool stair',family:'guard',glass:true,levels:[5.2,6],points:[p(12+RAIL_EDGE_INSET,-64),p(12+RAIL_EDGE_INSET,poolWalkNorth+RAIL_EDGE_INSET)]},
  {id:'arrival-stair-one-north',code:'R19',label:'Arrival staircase 1',family:'guard',glass:true,levels:[6,4.8],points:[p(-22-RAIL_END_GAP,39+RAIL_EDGE_INSET),p(-15-RAIL_END_GAP,39+RAIL_EDGE_INSET)]},
  {id:'arrival-stair-one-south',code:'R20',label:'Arrival staircase 1',family:'guard',glass:true,levels:[6,4.8],points:[p(-22-RAIL_END_GAP,44-RAIL_EDGE_INSET),p(-15-RAIL_END_GAP,44-RAIL_EDGE_INSET)]},
  {id:'arrival-stair-two-north',code:'R21',label:'Arrival staircase 2',family:'guard',glass:true,levels:[4.8,6],points:[p(15+RAIL_END_GAP,47+RAIL_EDGE_INSET),p(24+RAIL_END_GAP,47+RAIL_EDGE_INSET)]},
  {id:'arrival-stair-two-south',code:'R22',label:'Arrival staircase 2',family:'guard',glass:true,levels:[4.8,6],points:[p(15+RAIL_END_GAP,51-RAIL_EDGE_INSET),p(24+RAIL_END_GAP,51-RAIL_EDGE_INSET)]},
]
