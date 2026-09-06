import fs from 'node:fs/promises'

const SUPABASE_URL = 'https://jzaghifuhinkzzhiojre.supabase.co'
const ANON_KEY = 'sb_publishable_rQDzA5bYlbzvaTjyo-uTXw_LiiIAddI'
const PIN = '3476'
const modalities = ['Piano','Orchestral','Jazz','Guitar','Synth','Ambient','Game','8-bit']
const terms = {
  Piano:['piano','pianist'],
  Orchestral:['orchestra','orchestral','symphonic'],
  Jazz:['jazz','swing'],
  Guitar:['guitar','acoustic guitar'],
  Synth:['synth','synthesizer','electronic'],
  Ambient:['ambient','atmospheric','soundscape'],
  Game:['video game','game soundtrack','videogame'],
  '8-bit':['8-bit','8 bit','chiptune']
}
const licenseOkay = v => ['cc0','pdm','by','by-sa'].includes(String(v||'').toLowerCase())
const norm = s => String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()
const stop = new Set(['the','and','for','suite','symphony','number','major','minor','music','version'])
const tokens = s => norm(s).split(' ').filter(t => t.length > 2 && !stop.has(t))
const sleep = ms => new Promise(r => setTimeout(r, ms))

function modalityFromEvidence(evidence) {
  const hay = norm(evidence)
  const found = []
  for (const m of modalities) if (terms[m].some(t => hay.includes(norm(t)))) found.push(m)
  return found
}
function pieceMatch(itemTitle, evidence, workTitle, movementTitle='') {
  const target = tokens([workTitle,movementTitle].filter(Boolean).join(' '))
  if (!target.length) return true
  const hay = norm(itemTitle + ' ' + evidence)
  const hits = target.filter(t => hay.includes(t)).length
  return hits >= Math.min(2, target.length)
}
async function fetchJson(url, init={}, tries=3) {
  for (let i=0;i<tries;i++) {
    try {
      const r = await fetch(url, init)
      if (r.status === 429) { await sleep(1200*(i+1)); continue }
      if (!r.ok) return null
      return await r.json()
    } catch {
      await sleep(600*(i+1))
    }
  }
  return null
}
async function getLibrary() {
  const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/lab_music_library_read', {
    method:'POST',
    headers:{ apikey:ANON_KEY, Authorization:'Bearer '+ANON_KEY, 'Content-Type':'application/json' },
    body:JSON.stringify({pin:PIN})
  })
  if (!r.ok) throw new Error('library read failed '+r.status+' '+await r.text())
  return await r.json()
}
async function openverse(query, work) {
  const u = new URL('https://api.openverse.org/v1/audio/')
  u.searchParams.set('q', query)
  u.searchParams.set('page_size','50')
  const data = await fetchJson(u, {headers:{'User-Agent':'HOS-ModalityResearch/1.0'}})
  return (data?.results||[]).flatMap(item => {
    if (!item?.url || !item?.foreign_landing_url || !licenseOkay(item.license)) return []
    const evidence = [item.title,item.creator,...(item.genres||[]),...(item.tags||[]).map(t=>t.name),item.source,item.provider].filter(Boolean).join(' ')
    if (!pieceMatch(item.title,evidence,work.work_title,work.movement_title)) return []
    const ms = modalityFromEvidence(evidence)
    return ms.map(modality => ({
      modality,
      title:item.title||work.work_title,
      performer:item.creator||'Unknown performer',
      license:(item.license||'').toUpperCase() + (item.license_version && item.license_version!=='N/A' ? ' '+item.license_version : ''),
      audioUrl:item.url,
      sourcePage:item.foreign_landing_url,
      source:item.provider||item.source||'Openverse',
      confidence:'confirmed',
      evidence:evidence.slice(0,500)
    }))
  })
}
async function commons(query, work) {
  const u = new URL('https://commons.wikimedia.org/w/api.php')
  u.searchParams.set('action','query'); u.searchParams.set('format','json'); u.searchParams.set('formatversion','2')
  u.searchParams.set('generator','search'); u.searchParams.set('gsrsearch',query); u.searchParams.set('gsrnamespace','6'); u.searchParams.set('gsrlimit','50')
  u.searchParams.set('prop','imageinfo|categories'); u.searchParams.set('iiprop','url|mime|extmetadata')
  u.searchParams.set('cllimit','50'); u.searchParams.set('origin','*')
  const data = await fetchJson(u, {headers:{'User-Agent':'HOS-ModalityResearch/1.0'}})
  return (data?.query?.pages||[]).flatMap(page => {
    const info=page.imageinfo?.[0]
    if (!info?.url || !String(info.mime||'').startsWith('audio/')) return []
    const meta=info.extmetadata||{}
    const lic=String(meta.LicenseShortName?.value||'').replace(/<[^>]*>/g,' ')
    if (!/public domain|cc0|cc by|creative commons attribution|attribution-sharealike/i.test(lic) || /\bnc\b|\bnd\b|noncommercial|no derivatives/i.test(lic)) return []
    const evidence=[page.title,(page.categories||[]).map(x=>x.title).join(' '),meta.Artist?.value,meta.ObjectName?.value].filter(Boolean).join(' ').replace(/<[^>]*>/g,' ')
    if (!pieceMatch(page.title,evidence,work.work_title,work.movement_title)) return []
    const ms=modalityFromEvidence(evidence)
    return ms.map(modality=>({
      modality,
      title:page.title||work.work_title,
      performer:String(meta.Artist?.value||'Wikimedia Commons contributor').replace(/<[^>]*>/g,' '),
      license:lic.replace(/\s+/g,' ').trim(),
      audioUrl:info.url,
      sourcePage:info.descriptionurl || 'https://commons.wikimedia.org/wiki/'+encodeURIComponent(page.title||''),
      source:'Wikimedia Commons',
      confidence:'confirmed',
      evidence:evidence.slice(0,500)
    }))
  })
}
async function scanOne(work,index,total) {
  const label=[work.work_title,work.movement_title].filter(Boolean).join(' ')
  const composer=work.composer||''
  const broad='"'+label+'" '+composer
  const isClassical = !['Scott Buckley','Kevin MacLeod'].includes(composer)
  const queries=[broad]
  if (isClassical) {
    for (const m of modalities) queries.push(broad+' '+terms[m][0])
  }
  const found=[]
  for (const q of queries) {
    const [ov,co]=await Promise.all([openverse(q,work),commons(q,work)])
    found.push(...ov,...co)
    await sleep(150)
  }
  const existing = new Set([work.source_url, work.recording_url].filter(Boolean))
  const seen=new Set()
  const unique=found.filter(c=>{
    if(existing.has(c.sourcePage)||existing.has(c.audioUrl)) return false
    const k=c.sourcePage+'|'+c.modality
    if(seen.has(k)) return false
    seen.add(k); return true
  })
  const byModality={}
  for (const m of modalities) byModality[m]=unique.filter(x=>x.modality===m).slice(0,4)
  process.stdout.write('['+(index+1)+'/'+total+'] '+composer+' — '+label+': '+modalities.map(m=>m+':'+byModality[m].length).join(' ')+'\n')
  return {
    id:work.id,composer,work_title:work.work_title,movement_title:work.movement_title,
    existing_source:work.source_url,existing_recording:work.recording_url,
    candidates:byModality
  }
}

const library=await getLibrary()
const deduped=[]
const seenWorks=new Set()
for (const row of library) {
  const key=norm(row.composer)+'|'+norm(row.work_title)+'|'+norm(row.movement_title||'')
  if(seenWorks.has(key)) continue
  seenWorks.add(key); deduped.push(row)
}
const out=[]
for(let i=0;i<deduped.length;i++) out.push(await scanOne(deduped[i],i,deduped.length))
await fs.mkdir('artifacts',{recursive:true})
await fs.writeFile('artifacts/music-modality-scan.json',JSON.stringify({generatedAt:new Date().toISOString(),works:out},null,2))
const summary={}
for(const m of modalities) summary[m]=out.reduce((n,w)=>n+(w.candidates[m]?.length||0),0)
await fs.writeFile('artifacts/music-modality-summary.json',JSON.stringify({works:out.length,summary},null,2))
console.log('SUMMARY',summary)
