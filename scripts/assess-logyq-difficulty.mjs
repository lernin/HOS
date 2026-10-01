// Read-only assessment of the playable catalog and addition-only search space.
import {readFileSync,writeFileSync} from 'node:fs'
import {runInNewContext} from 'node:vm'
import * as d3 from 'd3'
const root=new URL('../public/logyq/js/',import.meta.url)
const source=readFileSync(new URL('../tests/logyq-game.test.mjs',import.meta.url),'utf8')
const helper=source.slice(source.indexOf('function loadGameFragment()'),source.indexOf("test('every game level is selectable"))
const load=new Function('readFileSync','runInNewContext','root','d3',helper+'\nreturn loadGameFragment()')
const {sandbox}=load(readFileSync,runInNewContext,root,d3)
const game=sandbox.preview.game,g=sandbox.window.LOGYQGameGrammar
const nodes=tree=>[tree,...(tree.children||[]).flatMap(nodes)]
const key=tree=>tree.gameId+'('+(tree.children||[]).map(key).join(',')+')'
const clone=tree=>({...tree,children:(tree.children||[]).map(clone)})
function assess(level){
 const pool=[level.tree,...Object.values(level.bankCards)].map(p=>({...p,children:[]}))
 const memo=new Map();let edges=0,deadEnds=0,maxChoices=0
 function visit(tree){
  const k=key(tree);if(memo.has(k))return memo.get(k)
  const used=new Set(nodes(tree).map(p=>p.gameId))
  const entry={win:g.complete(tree,level.ids),children:[],complete:false};memo.set(k,entry)
  if(entry.win){entry.complete=true;return entry}
  const next=new Map()
  for(const card of pool.filter(p=>!used.has(p.gameId))){
   const drops=[{type:'rootAbove'}]
   for(const p of nodes(tree))for(let i=0;i<=(p.children||[]).length;i++)drops.push({type:'gap',parentUid:p.gameId,nextUid:p.children?.[i]?.gameId,prevUid:p.children?.[i-1]?.gameId})
   for(const drop of drops){
    if(!g.canAdd(tree,card,drop))continue
    let copy=clone(tree)
    if(drop.type==='rootAbove')copy={...card,children:[copy]}
    else{const p=nodes(copy).find(p=>p.gameId===drop.parentUid);const index=drop.nextUid?p.children.findIndex(p=>p.gameId===drop.nextUid):p.children.length;p.children.splice(index,0,{...card,children:[]})}
    next.set(key(copy),copy)
   }
  }
  maxChoices=Math.max(maxChoices,next.size);edges+=next.size
  for(const t of next.values())entry.children.push(visit(t))
  entry.complete=entry.children.some(x=>x.complete)
  if(!next.size)deadEnds++
  return entry
 }
 visit(clone(level.tree))
 const misleading=[...memo.values()].reduce((n,e)=>n+e.children.filter(c=>!c.complete).length,0)
 const solved=g.physicalSolutions(pool.filter(p=>level.ids.includes(p.gameId)),1)[0]
 const branch=nodes(solved).reduce((n,p)=>n+Math.max(0,(p.children||[]).length-1),0)
 // A transparent design estimate, not a score calibrated on children.
 const score=2*(level.ids.length-1)+branch+Math.log2(1+misleading)+0.5*Math.log2(1+maxChoices)
 const colors=[...new Set(pool.flatMap(p=>{const x=g.parsePaint(p.paint);return[x.a,x.b]}))]
 const renames=[]
 function perm(a,left){if(!left.length){renames.push(a);return}for(const c of left)perm([...a,c],left.filter(x=>x!==c))}
 perm([],colors)
 const bagKey=renames.map(a=>{const map=Object.fromEntries(a.map((x,i)=>[x,i+1]));return pool.map(p=>{const x=g.parsePaint(p.paint);return x.shape+':'+map[x.a]+(x.shape==='W'?'':':'+map[x.b])}).sort().join('|')}).sort()[0]
 return {id:level.id,title:level.title,tier:level.tier,pieces:level.ids.length,decoys:pool.length-level.ids.length,branching:branch,states:memo.size,legalAdditions:edges,misleadingAdditions:misleading,deadEnds,maxChoices,score:+score.toFixed(2),bagKey}
}
const rows=game.levels.map(assess)
const tiers=[...new Set(rows.map(r=>r.tier))].map(tier=>{const rs=rows.filter(r=>r.tier===tier);return{tier,count:rs.length,min:Math.min(...rs.map(r=>r.score)),max:Math.max(...rs.map(r=>r.score)),average:+(rs.reduce((n,r)=>n+r.score,0)/rs.length).toFixed(2),misleading:rs.filter(r=>r.misleadingAdditions>0).length}})
const result={version:'design-estimate-v1',scope:'Current parent/sibling seat grammar; exhaustive additions from the presented anchor, including decoys. Repositioning excluded. Not a measured human difficulty or geometric uniqueness certificate.',tiers,uniqueBags:new Set(rows.map(r=>r.bagKey)).size,levels:rows}
if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n')
console.log(JSON.stringify({tiers,uniqueBags:result.uniqueBags,forced:rows.filter(r=>!r.misleadingAdditions).length,hardest:[...rows].sort((a,b)=>b.score-a.score).slice(0,8),easiest:rows.slice(0,3)},null,2))
