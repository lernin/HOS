
const queries=['piano instrumental','acoustic guitar instrumental','jazz instrumental','game music instrumental','ambient background music']
const out=[]
for(const q of queries){
 const u=new URL('https://api.openverse.org/v1/audio/')
 u.searchParams.set('q',q);u.searchParams.set('page_size','20')
 try{
  const r=await fetch(u,{headers:{'User-Agent':'HOS-Curation/1.4'},signal:AbortSignal.timeout(30000)})
  console.log('STATUS',q,r.status)
  if(!r.ok){console.log('ERR',await r.text());continue}
  const d=await r.json()
  const x=(d.results||[]).find(x=>{
   const lic=String(x.license||'').toLowerCase()
   const provider=String(x.provider||x.source||'')
   return x.url&&x.foreign_landing_url&&['cc0','pdm','by','by-sa'].includes(lic)&&(!x.category||x.category==='music')&&(!x.duration||Number(x.duration)>=30000)&&!/wikimedia/i.test(provider)
  })
  if(x) out.push({query:q,creator:x.creator||'Unknown creator',title:x.title||q,provider:x.provider||x.source||'unknown',source_url:x.foreign_landing_url,recording_url:x.url,license:String(x.license||'').toUpperCase()+(x.license_version&&x.license_version!=='N/A'?' '+x.license_version:''),license_url:x.license_url||null})
 }catch(e){console.log('FETCH_ERR',q,String(e))}
 await new Promise(r=>setTimeout(r,1500))
}
console.log('FINAL_FIVE='+JSON.stringify(out))
