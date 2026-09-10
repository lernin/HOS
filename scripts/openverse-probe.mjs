
const qs=['ambient instrumental','chiptune game music','jazz instrumental','electronic instrumental'];
for (const q of qs) {
  const u=new URL('https://api.openverse.org/v1/audio/');
  u.searchParams.set('q',q);u.searchParams.set('page_size','50');
  const r=await fetch(u,{headers:{'User-Agent':'HOS-Curation/1.1'},signal:AbortSignal.timeout(10000)});
  console.log('STATUS',q,r.status,'remaining',r.headers.get('x-ratelimit-remaining'),'retry',r.headers.get('retry-after'));
  const t=await r.text();
  console.log('BODY',q,t.slice(0,12000));
  if(r.status===429) break;
  await new Promise(res=>setTimeout(res,1200));
}
