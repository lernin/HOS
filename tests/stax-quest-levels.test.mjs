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
