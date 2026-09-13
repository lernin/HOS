
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const openLic=v=>['cc0','pdm','by','by-sa'].includes(String(v||'').toLowerCase())
const commonsSeeds=[
['Mozart Eine kleine Nachtmusik Allegro','Wolfgang Amadeus Mozart','Orchestral','Adventure, Triumph, Playful'],
['Handel Water Music Suite F Air','George Frideric Handel','Orchestral','Hearth, Guide'],
['Chopin Minute Waltz','Frédéric Chopin','Piano','Playful, Triumph'],
['Debussy Reverie piano','Claude Debussy','Piano','Wonder, Hearth'],
['Schubert Serenade D 889','Franz Schubert','Classical','Hearth, Homeward'],
['Rachmaninoff Prelude C sharp minor','Sergei Rachmaninoff','Piano','Mystery, Peril'],
['Strauss Blue Danube','Johann Strauss II','Orchestral / Waltz','Wonder, Triumph'],
['Mozart Turkish March piano','Wolfgang Amadeus Mozart','Piano','Playful, Adventure'],
['Bach Jesu Joy Mans Desiring','Johann Sebastian Bach','Classical','Hearth, Guide, Triumph'],
['Mendelssohn Songs without Words duet','Felix Mendelssohn','Piano','Hearth, Homeward'],
['Tchaikovsky Swan Lake waltz','Pyotr Ilyich Tchaikovsky','Orchestral','Wonder, Adventure'],
['Schumann Traumerei piano','Robert Schumann','Piano','Hearth, Homeward'],
['Brahms Waltz A flat Op 39','Johannes Brahms','Piano','Hearth, Wonder'],
['Mozart Clarinet Quintet','Wolfgang Amadeus Mozart','Classical / Chamber','Guide, Wonder'],
['Bach Goldberg Variations Aria','Johann Sebastian Bach','Piano / Minimal','Hearth, Guide, Wonder']
]
const ovSeeds=[
['gentle piano loop','Piano / Minimal','Hearth, Guide'],
['acoustic guitar loop','Guitar / Acoustic','Hearth, Homeward'],
['jazz loop instrumental','Jazz / Swing','Playful, Guide'],
['happy game music loop','Game / Playful','Playful, Triumph'],
['chiptune loop','8-bit / Chiptune','Playful, Adventure'],
['ambient drone music','Ambient / Atmospheric','Mystery, Vastness'],
['orchestral loop cinematic','Orchestral / Cinematic','Adventure, Triumph'],
['funky bass groove','Funky / Groovy','Playful, Triumph']
]
async function fetchJson(url){
 for(let i=0;i<2;i++){try{const r=await fetch(url,{headers:{'User-Agent':'HOS-Curation/1.2'},signal:AbortSignal.timeout(6000)});if(r.status===429){await sleep(1000*(i+1));continue}if(!r.ok)return null;return await r.json()}catch{await sleep(500)}}return null
}
const strip=v=>String(v||'').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim()
async function commons(seed){
 const [q,composer,style,emotion]=seed; const u=new URL('https://commons.wikimedia.org/w/api.php')
 ;[['action','query'],['format','json'],['formatversion','2'],['generator','search'],['gsrsearch',q],['gsrnamespace','6'],['gsrlimit','30'],['prop','imageinfo|categories'],['iiprop','url|mime|size|extmetadata'],['cllimit','20'],['origin','*']].forEach(([k,v])=>u.searchParams.set(k,v))
 const d=await fetchJson(u)
 for(const p of d?.query?.pages||[]){const i=p.imageinfo?.[0],m=i?.extmetadata||{};if(!i?.url||!String(i.mime||'').startsWith('audio/'))continue;if(Number(i.size||0)<300000)continue;const lic=strip(m.LicenseShortName?.value);if(!/public domain|cc0|cc by|creative commons attribution|attribution-sharealike/i.test(lic)||/\bnc\b|\bnd\b|noncommercial|no derivatives/i.test(lic))continue;return {composer,work_title:strip(m.ObjectName?.value)||String(p.title||'').replace(/^File:/,'').replace(/\.(ogg|oga|mp3|flac|wav)$/i,''),performer:strip(m.Artist?.value)||'Wikimedia Commons contributor',source_name:'Wikimedia Commons',source_url:i.descriptionurl||('https://commons.wikimedia.org/wiki/'+encodeURIComponent(p.title||'')),recording_url:i.url,license:lic,license_url:strip(m.LicenseUrl?.value)||null,license_notes:'Direct Wikimedia Commons audio file; license read from file metadata.',rights_verified:true,status:'candidate',taste_notes:'Styles: '+style+'. Emotions: '+emotion+'. Curated Commons supplement 2026-09-06.'}}
 return null
}
async function openverse(seed){
 const [q,style,emotion]=seed;const u=new URL('https://api.openverse.org/v1/audio/');u.searchParams.set('q',q);u.searchParams.set('page_size','20')
 const d=await fetchJson(u)
 for(const x of d?.results||[]){if(!x?.url||!x?.foreign_landing_url||!openLic(x.license))continue;if(x.category&&x.category!=='music')continue;if(x.duration&&Number(x.duration)<30000)continue;const p=String(x.provider||x.source||'unknown');if(/wikimedia/i.test(p)||/wikimedia/i.test(String(x.source||'')))continue;return {composer:x.creator||'Unknown creator',work_title:x.title||q,performer:x.creator||'Unknown creator',source_name:'Openverse / '+p,source_url:x.foreign_landing_url,recording_url:x.url,license:String(x.license||'').toUpperCase()+(x.license_version&&x.license_version!=='N/A'?' '+x.license_version:''),license_url:x.license_url||null,license_notes:'Direct media URL supplied by Openverse. Exact upstream license should be rechecked before bundling.',rights_verified:false,status:'candidate',taste_notes:'Styles: '+style+'. Emotions: '+emotion+'. Search seed: '+q+'. Curated Openverse supplement 2026-09-06.'}}
 return null
}
const c=(await Promise.all(commonsSeeds.map(commons))).filter(Boolean)
await sleep(800)
const o=(await Promise.all(ovSeeds.map(openverse))).filter(Boolean)
console.log('SUPPLEMENT_RESULT='+JSON.stringify({commons:c,openverse:o}))
console.log('COUNTS commons='+c.length+' openverse='+o.length)
