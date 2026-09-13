
const u=new URL('https://api.openverse.org/v1/audio/')
u.searchParams.set('q','instrumental music')
u.searchParams.set('page_size','20')
try{
 const r=await fetch(u,{headers:{'User-Agent':'HOS-Curation/1.5'},signal:AbortSignal.timeout(60000)})
 console.log('STATUS',r.status)
 if(!r.ok){console.log('ERR',await r.text());process.exit(1)}
 const d=await r.json()
 const out=(d.results||[]).filter(x=>{
   const lic=String(x.license||'').toLowerCase()
   const provider=String(x.provider||x.source||'')
   return x.url&&x.foreign_landing_url&&['cc0','pdm','by','by-sa'].includes(lic)&&(!x.category||x.category==='music')&&(!x.duration||Number(x.duration)>=30000)&&!/wikimedia/i.test(provider)
 }).slice(0,10).map(x=>({creator:x.creator||'Unknown creator',title:x.title||'Untitled',provider:x.provider||x.source||'unknown',source_url:x.foreign_landing_url,recording_url:x.url,license:String(x.license||'').toUpperCase()+(x.license_version&&x.license_version!=='N/A'?' '+x.license_version:''),license_url:x.license_url||null}))
 console.log('FINAL_FIVE='+JSON.stringify(out))
}catch(e){console.log('FETCH_ERR',String(e));process.exit(1)}
