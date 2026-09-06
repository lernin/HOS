
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const openLic=v=>['cc0','pdm','by','by-sa'].includes(String(v||'').toLowerCase())
const commonsSeeds=[
['Grieg piano concerto adagio','Edvard Grieg','Orchestral / Piano','Hearth, Wonder'],
['Chopin Krakowiak Rondo Op 14','Frédéric Chopin','Orchestral / Piano','Adventure, Triumph'],
['Beethoven Pastoral Symphony 6','Ludwig van Beethoven','Orchestral','Hearth, Wonder, Vastness'],
['Scott Joplin Original Rags','Scott Joplin','Piano / Ragtime','Wonder, Triumph, Playful'],
['Scott Joplin Euphonic Sounds','Scott Joplin','Piano / Ragtime','Wonder, Playful'],
['Mozart Piano Concerto 25 K 503','Wolfgang Amadeus Mozart','Orchestral / Piano','Guide, Triumph'],
['Saint-Saens Aquarium Carnival Animals','Camille Saint-Saëns','Orchestral','Wonder, Mystery'],
['Dvorak New World Symphony Largo','Antonín Dvořák','Orchestral','Vastness, Homeward'],
['Mendelssohn Hebrides Overture','Felix Mendelssohn','Orchestral','Vastness, Adventure'],
['Vivaldi Winter Largo Four Seasons','Antonio Vivaldi','Orchestral','Hearth, Homeward'],
['Tchaikovsky Dance Sugar Plum Fairy','Pyotr Ilyich Tchaikovsky','Orchestral','Wonder, Mystery, Playful'],
['Bizet Carmen Intermezzo','Georges Bizet','Orchestral','Hearth, Wonder'],
['Rossini William Tell Overture','Gioachino Rossini','Orchestral','Adventure, Triumph'],
['Grieg Hall Mountain King','Edvard Grieg','Orchestral','Peril, Adventure'],
['Saint-Saens Danse macabre','Camille Saint-Saëns','Orchestral','Mystery, Peril'],
['Bach Cello Suite 1 Prelude','Johann Sebastian Bach','Cello / Classical','Hearth, Guide'],
['Debussy Arabesque piano','Claude Debussy','Piano','Wonder, Hearth'],
['Liszt Liebestraum 3 piano','Franz Liszt','Piano','Homeward, Wonder'],
['Pachelbel Canon D','Johann Pachelbel','Orchestral','Hearth, Homeward'],
['Brahms Hungarian Dance 5','Johannes Brahms','Orchestral','Adventure, Triumph']
]
const openverseSeeds=[
['beautiful ambient instrumental','Ambient / Atmospheric','Hearth, Wonder'],
['cinematic orchestral instrumental','Orchestral / Cinematic','Adventure, Vastness'],
['electronic ambient instrumental','Synth / Electronic','Wonder, Mystery'],
['8 bit chiptune game music','8-bit / Chiptune','Playful, Adventure'],
['jazz instrumental playful','Jazz / Swing','Playful, Guide'],
['funk groove instrumental','Funky / Groovy','Playful, Triumph'],
['acoustic guitar instrumental warm','Guitar / Acoustic','Hearth, Homeward'],
['minimal piano instrumental','Piano / Minimal','Hearth, Guide'],
['synthwave instrumental','Synth / Electronic','Adventure, Vastness'],
['melodic techno instrumental','Techno / Driving','Adventure, Triumph'],
['dubstep instrumental cinematic','Dubstep / Heavy','Peril, Triumph'],
['whimsical game music instrumental','Playful / Whimsical','Wonder, Playful'],
['retro game music instrumental','Retro Game','Playful, Adventure'],
['mystery ambient instrumental','Ambient / Atmospheric','Mystery, Vastness'],
['uplifting cinematic instrumental','Orchestral / Cinematic','Calling, Triumph'],
['forest ambient instrumental','Ambient / Nature','Hearth, Wonder'],
['space ambient instrumental','Ambient / Synth','Vastness, Wonder'],
['playful ukulele instrumental','Playful / Acoustic','Playful, Triumph'],
['world folk instrumental','World / Folk','Adventure, Hearth'],
['lofi instrumental background','Background / Lo-fi','Guide, Hearth']
]
async function fetchJson(url,init={}){
 for(let i=0;i<3;i++){
  try{
   const r=await fetch(url,{...init,signal:AbortSignal.timeout(10000)})
   if(r.status===429){await sleep(1200*(i+1));continue}
   if(!r.ok)return null
   return await r.json()
  }catch{await sleep(700*(i+1))}
 }
 return null
}
const strip=v=>String(v||'').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim()
async function pickCommons(seed,chosen){
 const [q,composer,style,emotion]=seed
 const u=new URL('https://commons.wikimedia.org/w/api.php')
 ;[['action','query'],['format','json'],['formatversion','2'],['generator','search'],['gsrsearch',q],['gsrnamespace','6'],['gsrlimit','30'],['prop','imageinfo|categories'],['iiprop','url|mime|size|extmetadata'],['cllimit','20'],['origin','*']].forEach(([k,v])=>u.searchParams.set(k,v))
 const data=await fetchJson(u,{headers:{'User-Agent':'HOS-Curation/1.0'}})
 for(const p of data?.query?.pages||[]){
  const info=p.imageinfo?.[0],meta=info?.extmetadata||{}
  if(!info?.url||!String(info.mime||'').startsWith('audio/'))continue
  if(Number(info.size||0)<500000)continue
  const lic=strip(meta.LicenseShortName?.value)
  if(!/public domain|cc0|cc by|creative commons attribution|attribution-sharealike/i.test(lic)||/\bnc\b|\bnd\b|noncommercial|no derivatives/i.test(lic))continue
  const page=info.descriptionurl||('https://commons.wikimedia.org/wiki/'+encodeURIComponent(p.title||''))
  if(chosen.has(page))continue
  chosen.add(page)
  return {composer,work_title:strip(meta.ObjectName?.value)||String(p.title||'').replace(/^File:/,'').replace(/\.(ogg|oga|mp3|flac|wav)$/i,''),movement_title:null,performer:strip(meta.Artist?.value)||'Wikimedia Commons contributor',source_name:'Wikimedia Commons',source_url:page,recording_url:info.url,license:lic,license_url:strip(meta.LicenseUrl?.value)||null,license_notes:'Direct Wikimedia Commons audio file; license read from file metadata.',rights_verified:true,status:'candidate',taste_notes:'Styles: '+style+'. Emotions: '+emotion+'. Curated Commons batch 2026-09-06.'}
 }
 return null
}
async function pickOpenverse(seed,chosen){
 const [q,style,emotion]=seed
 const u=new URL('https://api.openverse.org/v1/audio/')
 u.searchParams.set('q',q);u.searchParams.set('page_size','50')
 const data=await fetchJson(u,{headers:{'User-Agent':'HOS-Curation/1.0'}})
 for(const x of data?.results||[]){
  if(!x?.url||!x?.foreign_landing_url||!openLic(x.license))continue
  if(x.category&&x.category!=='music')continue
  if(x.duration&&Number(x.duration)<45000)continue
  const provider=String(x.provider||x.source||'unknown')
  if(/wikimedia/i.test(provider)||/wikimedia/i.test(String(x.source||'')))continue
  if(chosen.has(x.foreign_landing_url))continue
  chosen.add(x.foreign_landing_url)
  return {composer:x.creator||'Unknown creator',work_title:x.title||q,movement_title:null,performer:x.creator||'Unknown creator',source_name:'Openverse / '+provider,source_url:x.foreign_landing_url,recording_url:x.url,license:String(x.license||'').toUpperCase()+(x.license_version&&x.license_version!=='N/A'?' '+x.license_version:''),license_url:x.license_url||null,license_notes:'Direct media URL supplied by Openverse. Exact upstream license should be rechecked before bundling.',rights_verified:false,status:'candidate',taste_notes:'Styles: '+style+'. Emotions: '+emotion+'. Search seed: '+q+'. Curated Openverse batch 2026-09-06.'}
 }
 return null
}
const commons=[],openverse=[],chosen=new Set()
for(const s of commonsSeeds){const x=await pickCommons(s,chosen);if(x)commons.push(x);await sleep(150)}
for(const s of openverseSeeds){const x=await pickOpenverse(s,chosen);if(x)openverse.push(x);await sleep(200)}
console.log('CURATION_RESULT='+JSON.stringify({commons,openverse}))
console.log('COUNTS commons='+commons.length+' openverse='+openverse.length)
if(commons.length<20||openverse.length<20)process.exitCode=2
