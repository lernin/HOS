export type MoodId =
  | 'hearth' | 'wonder' | 'calling' | 'adventure' | 'guide'
  | 'mystery' | 'vastness' | 'peril' | 'homeward' | 'triumph'

export type MelodyCandidate = {
  id:string
  name:string
  degrees:number[]
  rhythm:number[]
}

export type MoodDefinition = {
  id:MoodId
  label:string
  emoji:string
  meaning:string
  bpm:number
  root:number
  scale:number[]
  progression:number[]
  lead:'flute'|'violin'
  density:number
  register:number
  room:number
}

export const moods:MoodDefinition[] = [
  {id:'hearth',label:'Hearth',emoji:'🏡',meaning:'Safety, belonging, warmth, and home.',bpm:66,root:60,scale:[0,2,4,5,7,9,11],progression:[0,3,5,4],lead:'violin',density:2,register:0,room:.34},
  {id:'wonder',label:'Wonder',emoji:'✨',meaning:'Curiosity, beauty, and the feeling that the world is larger than expected.',bpm:72,root:60,scale:[0,2,4,6,7,9,11],progression:[0,1,4,0],lead:'flute',density:2,register:1,room:.48},
  {id:'calling',label:'Calling',emoji:'🌅',meaning:'An invitation forward; possibility just beyond the familiar.',bpm:78,root:62,scale:[0,2,4,5,7,9,11],progression:[0,4,5,3],lead:'flute',density:3,register:1,room:.4},
  {id:'adventure',label:'Adventure',emoji:'🧭',meaning:'Movement, courage, daring, and forward momentum.',bpm:96,root:62,scale:[0,2,4,5,7,9,11],progression:[0,5,3,4],lead:'violin',density:4,register:0,room:.3},
  {id:'guide',label:'Guide',emoji:'🕯️',meaning:'Wisdom, reassurance, inspiration, and a trusted presence.',bpm:70,root:59,scale:[0,2,3,5,7,9,10],progression:[0,3,5,0],lead:'flute',density:3,register:0,room:.42},
  {id:'mystery',label:'Mystery',emoji:'🌙',meaning:'Unknown territory, ambiguity, and a door that may or may not open.',bpm:64,root:57,scale:[0,2,3,5,7,9,10],progression:[0,1,5,0],lead:'violin',density:2,register:-1,room:.56},
  {id:'vastness',label:'Vastness',emoji:'🏔️',meaning:'Awe, sky, distance, scale, and expansion.',bpm:60,root:60,scale:[0,2,4,6,7,9,11],progression:[0,4,1,0],lead:'flute',density:4,register:1,room:.62},
  {id:'peril',label:'Peril',emoji:'⚡',meaning:'Danger, challenge, instability, and the need to act.',bpm:104,root:57,scale:[0,1,3,5,7,8,10],progression:[0,1,4,0],lead:'violin',density:5,register:-1,room:.26},
  {id:'homeward',label:'Homeward',emoji:'🌄',meaning:'Recognition, relief, and the first sight of home after change.',bpm:76,root:60,scale:[0,2,4,5,7,9,11],progression:[5,3,4,0],lead:'flute',density:4,register:0,room:.42},
  {id:'triumph',label:'Triumph',emoji:'🌟',meaning:'Return, achievement, belonging transformed, and joyful resolution.',bpm:92,root:60,scale:[0,2,4,5,7,9,11],progression:[3,4,0,0],lead:'violin',density:5,register:1,room:.46},
]

const families:MelodyCandidate[] = [
  {id:'lantern',name:'Lantern',degrees:[0,2,4,3,2,1,0,2],rhythm:[2,2,2,2,2,2,2,2]},
  {id:'far-path',name:'Far Path',degrees:[0,1,3,4,5,3,2,0],rhythm:[1,1,2,2,2,2,3,3]},
  {id:'wing',name:'Wing',degrees:[0,3,4,6,5,4,2,3],rhythm:[2,1,1,2,2,2,3,3]},
  {id:'river',name:'River',degrees:[2,1,0,2,4,3,1,0],rhythm:[1,1,2,1,1,2,4,4]},
  {id:'star',name:'Star',degrees:[0,4,2,5,4,6,5,3],rhythm:[2,2,1,1,2,2,3,3]},
  {id:'return',name:'Return',degrees:[4,3,2,1,0,2,1,0],rhythm:[2,2,2,2,1,1,3,3]},
]

export const journeySigns:{mood:MoodId;t:number}[] = [
  'hearth','wonder','calling','adventure','guide','mystery','vastness','peril','homeward','triumph'
].map((mood,index)=>({mood:mood as MoodId,t:Math.PI/2+index*(Math.PI*2/10)}))

export function moodDefinition(id:MoodId){return moods.find(m=>m.id===id)!}
export function melodyCandidates(_mood:MoodId){return families.map(item=>({...item,id:item.id}))}

export function midiForDegree(mood:MoodDefinition,degree:number,octave=0){
  const len=mood.scale.length
  const wrapped=((degree%len)+len)%len
  const oct=Math.floor(degree/len)
  return mood.root+mood.scale[wrapped]+12*(oct+octave+mood.register)
}

export function melodyNotes(moodId:MoodId,candidateId:string){
  const mood=moodDefinition(moodId)
  const candidate=melodyCandidates(moodId).find(item=>item.id===candidateId)??families[0]
  return candidate.degrees.map((degree,index)=>{
    const lift=(moodId==='triumph'&&index>4)?1:0
    const drop=(moodId==='peril'&&index<3)?-1:0
    return midiForDegree(mood,degree,lift+drop)
  })
}

export function chordNotes(moodId:MoodId,bar:number){
  const mood=moodDefinition(moodId)
  const degree=mood.progression[bar%mood.progression.length]
  return [degree,degree+2,degree+4,degree+6].map((d,i)=>midiForDegree(mood,d,i===3?0:-1))
}
