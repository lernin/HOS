import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'
const source=await readFile(new URL('../src/experiences/stax/quest-levels.ts',import.meta.url),'utf8')
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText
const {STAX_QUEST_LEVELS,staxQuestLevel}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'))
test('STAX Quest has precisely 100 unique consecutively numbered sentences',()=>{
 assert.equal(STAX_QUEST_LEVELS.length,100)
 assert.deepEqual(STAX_QUEST_LEVELS.map(x=>x.level),Array.from({length:100},(_,i)=>i+1))
 assert.ok(STAX_QUEST_LEVELS.every(x=>x.sentence.trim()))
 assert.equal(STAX_QUEST_LEVELS.filter(x=>x.youtubeUrl).length,95)
 assert.deepEqual(STAX_QUEST_LEVELS.filter(x=>!x.youtubeUrl).map(x=>x.level),[75,82,84,88,99])
})
test('original source sentence examples preserved',()=>{
 assert.equal(staxQuestLevel(1)?.sentence,"I'm happy.")
 assert.equal(staxQuestLevel(21)?.sentence,"She's buying a present for her best friend because her birthday is tomorrow.")
 assert.equal(staxQuestLevel(100)?.sentence,"She used to drink milk before school every day to make her mom happy and now she's grown into a tall healthy young woman.")
 assert.equal(staxQuestLevel(0),undefined)
 assert.equal(staxQuestLevel(101),undefined)
})
const parserSource=await readFile(new URL('../src/experiences/stax/quest-parser.ts',import.meta.url),'utf8')
const parserJs=ts.transpileModule(parserSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText
const {parseStaxSentence}=await import('data:text/javascript;base64,'+Buffer.from(parserJs).toString('base64'))
test('first ten original Quest sentences parse into editable STAX roles',()=>{
 const expected=[
  ['circle:I','triangle:\'m','oval:happy'],
  ['circle:I','triangle:\'m','oval:ok'],
  ['circle:I','triangle:have','circle:book','rectangle:a'],
  ['circle:She','triangle:\'s','oval:happy'],
  ['circle:She','triangle:has','circle:book','rectangle:a'],
  ['circle:name','rectangle:My','triangle:is','circle:Ashley'],
  ['circle:I','triangle:have','circle:ruler','rectangle:a','hexagon:do','hexagon:not'],
  ['circle:This','triangle:is','circle:map','rectangle:a'],
  ['circle:Deft','triangle:is','circle:box','square:on','rectangle:the'],
  ['circle:hat','rectangle:My','triangle:is','oval:pink'],
 ]
 STAX_QUEST_LEVELS.slice(0,10).forEach((item,i)=>{
  const parsed=parseStaxSentence(item.sentence,{learnerName:'Ashley'})
  assert.equal(parsed.supported,true,'Level '+item.level+' must be recognized')
  if(!parsed.supported)return
  assert.deepEqual(parsed.atoms.map(a=>a.kind+':'+a.word),expected[i],item.sentence)
  const ids=new Set(parsed.atoms.map(a=>a.id))
  assert.equal(ids.size,parsed.atoms.length)
  assert.ok(parsed.bonds.every(b=>ids.has(b.parent)&&ids.has(b.child)))
  assert.equal(parsed.bonds.filter(b=>b.relation==='sequence').length,2)
 })
})
test('SMR contraction produces blue pronoun and distinct RED copula',()=>{
 for(const sentence of ["I'm happy.","She's happy."]){
  const p=parseStaxSentence(sentence)
  assert.equal(p.supported,true)
  assert.equal(p.atoms[0].kind,'circle')
  assert.equal(p.atoms[1].kind,'triangle')
  assert.equal(p.atoms[1].role,'smr')
  assert.ok(["'m","'s"].includes(p.atoms[1].word))
 }
 assert.equal(parseStaxSentence('I have a book.').atoms[1].role,'verb')
 assert.equal(parseStaxSentence('My name is _________.').displaySentence,'My name is Ashley.')
})
test('unknown sentence is not assigned fabricated roles',()=>{
 const unknown=parseStaxSentence('Birds fly above the trees because they are hungry.')
 assert.equal(unknown.supported,false)
 assert.equal(unknown.displaySentence,'Birds fly above the trees because they are hungry.')
})
test('board loads first ten through parser and preserves level 21',async()=>{
 const board=await readFile(new URL('../src/experiences/stax/MoleculeBoard.tsx',import.meta.url),'utf8')
 assert.match(board,/STAX_QUEST_LEVELS\.map\(item=><option/)
 assert.match(board,/function layoutParsedQuest\(parsed:ParsedStax\)/)
 assert.match(board,/level<=10\?parseStaxSentence\(item.sentence/)
 assert.match(board,/function loadQuest\(level:number\)/)
 assert.match(board,/save\(next,before\)/)
 assert.match(board,/normalizeRoles\(quest21\(\)\)/)
 assert.match(board,/chosenQuestLevel<=10\|\|chosenQuestLevel===21\?'Load map':'Start blank map'/)
})

test('Quest scene uses the exact manual magnet sequence port, never approximate offsets',async()=>{
 const board=await readFile(new URL('../src/experiences/stax/MoleculeBoard.tsx',import.meta.url),'utf8')
 const helper=board.slice(board.indexOf('function snappedSequenceFollowerPosition('),board.indexOf('function sequenceHeadGap('))
 assert.match(helper,/horizontalFollower\(/)
 assert.match(helper,/height\(left\.kind\)\+\(left\.kind==='circle'\?4:7\)\*UNIT/)
 assert.match(helper,/x:left\.x\+atomWidth\(left\)\+RED_BLUE_GAP/)
 assert.match(helper,/y:left\.y\+atomHeight\(left\)\+BLUE_RED_GAP/)
 const magnetic=board.slice(board.indexOf('function bestSnap('),board.indexOf('function resolveMagnetBase('))
 const preset=board.slice(board.indexOf('function layoutParsedQuest('),board.indexOf('function quest21('))
 assert.match(magnetic,/const desired=snappedSequenceFollowerPosition\(left,right\)/)
 assert.match(preset,/coords\.set\(head\.id,snappedSequenceFollowerPosition\(source,follower\)\)/)
 assert.match(preset,/if\(head\.kind==='circle'&&blueSupportAtoms\(doc,head\.id\)\.length\)doc=alignSupporters\(doc,head\.id\)/)
 assert.match(preset,/if\(head\.kind==='triangle'&&orangeChildren\(doc,head\.id\)\.length\)doc=alignRedSupporters\(doc,head\.id\)/)
 assert.match(preset,/return alignSequenceFamilyClearance\(normalizeRoles\(doc\)\)/)
 assert.doesNotMatch(preset,/Math\.max\(80|height\(previous\.kind\)\*\.55|underSingleX\(/)
})

const quest2Source=await readFile(new URL('../src/experiences/stax/quest-two.ts',import.meta.url),'utf8')
const quest2Js=ts.transpileModule(quest2Source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText
const {advanceQuestTwo,harvestQuestTwo,QUEST_TWO_ORDER,QUEST_TWO_EXPRESSION}=
 await import('data:text/javascript;base64,'+Buffer.from(quest2Js).toString('base64'))
test('Quest 2 4B question harvests H → RED → BLUE on the original 5 map',()=>{
 assert.equal(QUEST_TWO_EXPRESSION.question,'4B')
 assert.deepEqual(QUEST_TWO_ORDER.question,['H','q2-a-q-2','q2-a-q-1'])
 let steps=[]
 assert.equal(harvestQuestTwo('question',steps),null)
 for(const token of QUEST_TWO_ORDER.question){
  const result=advanceQuestTwo('question',steps,token)
  assert.equal(result.accepted,true)
  steps=result.next
 }
 assert.equal(harvestQuestTwo('question',steps),'How are you?')
})
test('Quest 2 5 answer is composed from separate I + SMR + ok tokens',()=>{
 assert.equal(QUEST_TWO_EXPRESSION.answer,'5')
 assert.deepEqual(QUEST_TWO_ORDER.answer,['q2-a-q-1','q2-a-q-2','q2-a-q-3'])
 let progress=[]
 for(const token of QUEST_TWO_ORDER.answer)progress=advanceQuestTwo('answer',progress,token).next
 assert.equal(harvestQuestTwo('answer',progress,true),"I'm ok.")
 assert.equal(harvestQuestTwo('answer',progress,false),'I am ok.')
})
test('Quest 2 wrong order resets safely and never falsely harvests',()=>{
 const step=advanceQuestTwo('question',[],'q2-a-q-1')
 assert.equal(step.accepted,false)
 assert.deepEqual(step.next,[])
 assert.equal(harvestQuestTwo('question',['H','q2-a-q-1','q2-a-q-2']),null)
 const first=advanceQuestTwo('question',[],'H')
 assert.equal(first.accepted,true)
 const wrong=advanceQuestTwo('question',first.next,'q2-a-q-1')
 assert.deepEqual(wrong.next,[])
})
test('Quest 2 H floats above the ORIGINAL blue map without introducing a new scene',async()=>{
 const board=await readFile(new URL('../src/experiences/stax/MoleculeBoard.tsx',import.meta.url),'utf8')
 const segment=board.slice(board.indexOf('function questTwoAnswerDraft('),board.indexOf('function quest21('))
 assert.match(segment,/parseStaxSentence\("I'm ok\."\)/)
 assert.match(segment,/const blue=d\.atoms\.find\(a=>a\.id==='q2-a-q-1'&&a\.kind==='circle'\)/)
 assert.match(segment,/x:blue\.x\+atomWidth\(blue\)\/2,y:blue\.y-height\('circle'\)\*\.60/)
 assert.doesNotMatch(segment,/questTwoQuestionDraft|q2-question-|q2-unknown-complement|q2-virtual|slotX|slotY|fitQuestTwoQuestion/)
 assert.match(board,/const base=questTwoAnswerDraft\(\)/)
 assert.match(board,/setCamera\(fit\(base,aspect\(\)\)\)/)
 assert.match(board,/questTwoTap\('H'\)/)
 assert.match(board,/className="stax-quest2-h"/)
 assert.doesNotMatch(board,/stax-quest2-empty-slot/)
 const switcher=board.slice(board.indexOf('function changeQuestTwoSide('),board.indexOf('function toggleQuestTwoContraction('))
 assert.match(switcher,/setQuestTwoSide\(side\);setQuestTwoTaps\(\[\]\)/)
 assert.doesNotMatch(switcher,/save\(|setCamera\(|questTwoAnswerDraft\(|questTwoQuestionDraft\(/)
 assert.match(board,/if\(questActive&&activeQuestLevel===2\)\{lastTap\.current=null;questTwoTap\(d\.id\);return\}/)
})
test('H marker is plain text with a generous invisible hit target',async()=>{
 const css=await readFile(new URL('../src/experiences/stax/molecule-board.css',import.meta.url),'utf8')
 const styles=css.slice(css.lastIndexOf('.stax-quest2-h{'),css.lastIndexOf('.stax-quest2-h:active'))
 assert.match(styles,/width:54px;height:54px/)
 assert.match(styles,/border:0/)
 assert.match(styles,/background:transparent/)
 assert.doesNotMatch(styles,/box-shadow:0/)
 assert.doesNotMatch(css,/\.stax-quest2-empty-slot\{/)
})
test('contraction gesture only recognizes BLUE I + RED SMR and preserves pinch',async()=>{
 const board=await readFile(new URL('../src/experiences/stax/MoleculeBoard.tsx',import.meta.url),'utf8')
 assert.match(board,/atoms\.includes\('q2-a-q-1'\)&&atoms\.includes\('q2-a-q-2'\)/)
 assert.match(board,/Math\.max\(distanceA,distanceB\)<=14/)
 assert.match(board,/if\(a&&b\)twoFingerIntent\.current=startTwoFinger\(/)
 assert.match(board,/if\(Date\.now\(\)-pair\.started<=550\)toggleQuestTwoContraction\(\)/)
 assert.match(board,/return activeQuestLevel===2&&questActive&&questTwoSide==='answer'&&a\.id==='q2-a-q-2'/)
})
