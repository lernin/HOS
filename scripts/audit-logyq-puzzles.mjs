// Read-only audit of LOGYQ bags under the shipped parent/sibling contact seats.
// A second search supplies no-cousin certificates: their two trees cannot
// depend on an unresolved cousin-contact policy. Never certify uniqueness
// from this restricted search. Production writes are deliberately separate.
import { readFileSync, writeFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import assert from 'node:assert/strict'

const sandbox = {window:{}}
runInNewContext(readFileSync(new URL('../public/logyq/js/game-grammar.js',import.meta.url),'utf8'),sandbox)
const grammar = sandbox.window.LOGYQGameGrammar
const shapes=['W','L','DL','DR']
const palette=['A','B','C','D']
const perms = xs => xs.length ? xs.flatMap((x,i)=>perms(xs.filter((_,j)=>i!==j)).map(p=>[x,...p])) : [[]]
const renamings=perms(palette)
function canonical(pieces){
  return renamings.map(p=>pieces.map(x=>x.paint.split(':').map((v,i)=>i?p[palette.indexOf(v)]:v).join(':')).sort().join('|')).sort()[0]
}
function regression(n){
  const faces=shapes.flatMap(shape=>palette.flatMap(a=>shape==='W'?[shape+':'+a]:palette.filter(b=>b!==a).map(b=>shape+':'+a+':'+b)))
  const unique=new Map()
  function bag(start,paints){
    if(paints.length<n){for(let i=start;i<faces.length;i++) bag(i,[...paints,faces[i]]);return}
    const pieces=paints.map((paint,i)=>({gameId:String(i),paint}))
    const sols=grammar.physicalSolutions(pieces,2)
    if(sols.length!==1)return
    const chain=(tree)=>(tree.children||[]).length<=1&&(tree.children||[]).every(chain)
    unique.set(canonical(pieces),chain(sols[0])?'chain':'branch')
  }
  bag(0,[])
  const result={total:unique.size,chain:[...unique.values()].filter(x=>x==='chain').length,branch:[...unique.values()].filter(x=>x==='branch').length}
  assert.deepEqual(result,n===2?{total:15,chain:15,branch:0}:n===3?{total:103,chain:99,branch:4}:{total:624,chain:502,branch:122})
  return result
}
function noCousins(tree){
  return tree.children.filter(c=>c.children.length).length<=1&&tree.children.every(noCousins)
}
function constraints(tree,out=[]){
  tree.children.forEach((child,i)=>{
    out.push({a:tree.gameId,b:child.gameId,a_edge:'B',b_edge:'T'})
    if(i)out.push({a:tree.children[i-1].gameId,b:child.gameId,a_edge:'R',b_edge:'L'})
    constraints(child,out)
  });return out
}
function verifyWitness(tree,pieces){
  assert.equal(grammar.complete(tree,pieces.map(x=>x.gameId)),true)
  // Independently check edges and exact use of each physical object.
  const pool=new Map(pieces.map(x=>[x.gameId,x]))
  const sides={B:'bottom',T:'top',L:'left',R:'right'}
  for(const e of constraints(tree))assert.equal(grammar.edge(pool.get(e.a).paint,sides[e.a_edge]),grammar.edge(pool.get(e.b).paint,sides[e.b_edge]))
}
const input=process.argv[2]
const output=process.argv[3]
const regressions={N2:regression(2),N3:regression(3)}
if(process.argv.includes('--n4'))regressions.N4=regression(4)
console.log('Regressions',JSON.stringify(regressions))
if(input){
  const rows=JSON.parse(readFileSync(input,'utf8'))
  const summary={}
  const records=[]
  for(const row of rows){
    const pieces=row.pieces.map(p=>({gameId:p.id,paint:p.shape+':'+p.regions.map(x=>palette[x-1]).join(':')}))
    assert.equal(pieces.length,row.piece_count)
    const sides={B:'bottom',T:'top',L:'left',R:'right'}
    for(const p of row.pieces)for(const [s,side] of Object.entries(sides))assert.equal(p.edges[s].map(x=>palette[x-1]).join('|'),grammar.edge(pieces.find(x=>x.gameId===p.id).paint,side))
    const sols=grammar.physicalSolutions(pieces,2)
    sols.forEach(s=>verifyWitness(s,pieces))
    const certificates=sols.length>1?grammar.physicalSolutions(pieces,2,{singleSpine:true}):[]
    certificates.forEach(s=>{verifyWitness(s,pieces);assert.equal(noCousins(s),true)})
    const category=sols.length===0?'zero':sols.length===1?'one_in_game_grammar':certificates.length===2?'multiple_no_cousin_witnesses':'multiple_game_grammar_only'
    const stats=summary[row.piece_count]||={total:0}
    stats.total++;stats[category]=(stats[category]||0)+1
    records.push({id:row.id,puzzle_code:row.puzzle_code,piece_count:row.piece_count,updated_at:row.updated_at,status:row.status,physical_matching_only:row.physical_matching_only,category,solution_count_capped_at_2:sols.length,witnesses:(certificates.length===2?certificates:sols).map(tree=>({tree,contacts:constraints(tree)}))})
  }
  const report={model:'current-game-parent-sibling-seats-v1',limitations:'Database layouts contain no rectangle coordinates. Unique bags under the game contact seats require a separate physical-layout certificate, especially where cousins are present. Two no-cousin witnesses prove ambiguity without relying on any cousin rule.',regressions,summary,records}
  if(output)writeFileSync(output,JSON.stringify(report,null,2)+'\n')
  console.log('Audit',JSON.stringify(summary))
}
