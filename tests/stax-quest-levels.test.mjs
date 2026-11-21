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
test('board offers all Quest levels with a functional first and twenty-first map',async()=>{
 const board=await readFile(new URL('../src/experiences/stax/MoleculeBoard.tsx',import.meta.url),'utf8')
 assert.match(board,/STAX_QUEST_LEVELS\.map\(item=><option/)
 assert.match(board,/function quest1\(\):Draft/)
 assert.match(board,/id:'q1-i',kind:'circle',word:'I'/)
 assert.match(board,/id:'q1-am',kind:'triangle',word:"'m"/)
 assert.match(board,/id:'q1-happy',kind:'oval',word:'happy'/)
 assert.match(board,/function loadQuest\(level:number\)/)
 assert.match(board,/save\(next,before\)/)
 assert.match(board,/chosenQuestLevel===1\|\|chosenQuestLevel===21\?'Load example':'Start blank map'/)
})
