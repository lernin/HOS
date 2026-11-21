/** Level 2 STAX Quest 4B → 5 interaction.
 * This is an activity/expression layer over the existing shape grammar.
 * H is a tappable interrogative marker floating over the unchanged 5 map,
 * not a word-shape or written "How". Both modes tap the same atom IDs.
 */
export type QuestTwoSide='question'|'answer'
export const QUEST_TWO_ORDER:Record<QuestTwoSide,readonly string[]>={
 question:['H','q2-a-q-2','q2-a-q-1'],
 answer:['q2-a-q-1','q2-a-q-2','q2-a-q-3'],
}
export const QUEST_TWO_EXPRESSION:Record<QuestTwoSide,'4B'|'5'>={question:'4B',answer:'5'}
export function advanceQuestTwo(side:QuestTwoSide,progress:readonly string[],token:string):{
 next:string[];accepted:boolean;complete:boolean
}{
 const order=QUEST_TWO_ORDER[side]
 if(progress.length>=order.length)return {next:[...progress],accepted:false,complete:true}
 if(token!==order[progress.length])return {next:[],accepted:false,complete:false}
 const next=[...progress,token]
 return {next,accepted:true,complete:next.length===order.length}
}
export function harvestQuestTwo(side:QuestTwoSide,progress:readonly string[],contracted=true):string|null{
 const sequence=QUEST_TWO_ORDER[side]
 if(progress.length!==sequence.length||sequence.some((token,i)=>progress[i]!==token))return null
 if(side==='question')return 'How are you?'
 return contracted?"I'm ok.":'I am ok.'
}
