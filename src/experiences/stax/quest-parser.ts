/** Conservative STAX sentence-to-shape parser.
 * Recognizes documented Quest 1–10 grammatical patterns ONLY.
 * No LLM inference: unknown sentence structures return unsupported.
 * SMR (is/am/are family: S/M/R) uses the red verbal head, including contracted 'm / 's.
 */
export type ParsedKind='circle'|'triangle'|'square'|'rectangle'|'diamond'|'hexagon'|'oval'
export type ParsedRole='nominal'|'smr'|'verb'|'determiner'|'preposition'|'complement'|'gate'|'negation'
export type ParsedAtom={id:string;kind:ParsedKind;word:string;role:ParsedRole}
export type ParsedBond={parent:string;child:string;relation:'sequence'|'support'}
export type ParsedStax={supported:true;atoms:ParsedAtom[];bonds:ParsedBond[];displaySentence:string;rule:string}
export type UnsupportedStax={supported:false;reason:string;displaySentence:string}
export type StaxParseResult=ParsedStax|UnsupportedStax
export type StaxParseOptions={learnerName?:string}
const unsupported=(sentence:string):UnsupportedStax=>({
 supported:false,reason:'This grammar pattern has not yet been mapped and needs teacher review.',
 displaySentence:sentence
})
export function parseStaxSentence(sentence:string,options:StaxParseOptions={}):StaxParseResult{
 const actual=sentence.trim().replace(/\s+/g,' ')
 const displaySentence=actual.replace(/\u2019/g,"'")
 let serial=0
 const atoms:ParsedAtom[]=[],bonds:ParsedBond[]=[]
 const add=(kind:ParsedKind,word:string,role:ParsedRole):string=>{
  const id='q-'+(++serial);atoms.push({id,kind,word,role});return id
 }
 const bond=(parent:string,child:string,relation:ParsedBond['relation'])=>{
  bonds.push({parent,child,relation})
 }
 const seq=(ids:string[])=>{for(let i=0;i<ids.length-1;i++)bond(ids[i],ids[i+1],'sequence')}
 const head=(word:string)=>add('circle',word,'nominal')
 const verb=(word:string)=>add('triangle',word,/^(am|is|are|'m|'s|'re)$/i.test(word)?'smr':'verb')
 const det=(parent:string,word:string)=>bond(parent,add('rectangle',word,'determiner'),'support')
 const finish=(rule:string,visible=displaySentence):ParsedStax=>({
  supported:true,atoms,bonds,displaySentence:visible,rule
 })
 // Name answer is a teacher-supplied demonstration, not a rewrite of the source sheet.
 const name=(options.learnerName||'Ashley').trim()||'Ashley'
 if(/^My name is _+\.$/i.test(displaySentence)||/^My name is [A-Za-z][A-Za-z '-]*\.$/i.test(displaySentence)){
  const subject=head('name');det(subject,'My')
  const copula=verb('is');const answer=head(name)
  seq([subject,copula,answer]);return finish('possessive-subject-copula-name','My name is '+name+'.')
 }
 // Split contractions into a blue pronoun and red SMR; never combine in one shape.
 const complement=displaySentence.match(/^(I'm|She's|I am|She is) (happy|ok|pink)\.$/i)
 if(complement){
  const subject= complement[1].toLowerCase().startsWith('she')?'She':'I'
  const contracted=/^(She's|I'm) /i.test(displaySentence)
  const verbWord=contracted?(subject==='She'?"'s":"'m"):subject==='I'?'am':'is'
  seq([head(subject),verb(verbWord),add('oval',complement[2],'complement')])
  return finish('smr-copula-complement')
 }
 const possession=displaySentence.match(/^(I|She|He|We|They) (have|has) (a|the) ([A-Za-z]+)\.$/i)
 if(possession){
  const subject=head(possession[1]);const action=verb(possession[2]);const object=head(possession[4])
  det(object,possession[3]);seq([subject,action,object]);return finish('smr-transitive-determiner')
 }
 const negation=displaySentence.match(/^(I|She|He|We|They) (don't|doesn't) (have) (a|the) ([A-Za-z]+)\.$/i)
 if(negation){
  const subject=head(negation[1]);const action=verb(negation[3]);const object=head(negation[5])
  seq([subject,action,object]);det(object,negation[4])
  const gate=add('hexagon',negation[2].toLowerCase()==="don't"?'do':'does','gate')
  const not=add('hexagon','not','negation')
  bond(action,gate,'support');bond(action,not,'support')
  return finish('smr-gate-negation-transitive')
 }
 const demonstrative=displaySentence.match(/^(This|That) is (a|the) ([A-Za-z]+)\.$/i)
 if(demonstrative){
  const subject=head(demonstrative[1]);const copula=verb('is');const complementNoun=head(demonstrative[3])
  det(complementNoun,demonstrative[2]);seq([subject,copula,complementNoun])
  return finish('demonstrative-copula-nominal')
 }
 const location=displaySentence.match(/^([A-Z][a-zA-Z]*) is (on|in|at|under) (a|the) ([A-Za-z]+)\.$/)
 if(location){
  const subject=head(location[1]),copula=verb('is'),place=head(location[4])
  bond(place,add('square',location[2],'preposition'),'support')
  det(place,location[3]);seq([subject,copula,place])
  return finish('smr-copula-locative-nominal')
 }
 const possessiveComplement=displaySentence.match(/^(My|Your|His|Her) ([A-Za-z]+) is ([A-Za-z]+)\.$/i)
 if(possessiveComplement){
  const subject=head(possessiveComplement[2]);det(subject,possessiveComplement[1])
  const copula=verb('is'),description=add('oval',possessiveComplement[3],'complement')
  seq([subject,copula,description]);return finish('possessive-copula-complement')
 }
 return unsupported(sentence)
}
