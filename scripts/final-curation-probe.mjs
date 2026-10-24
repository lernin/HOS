
const commonsTitles=[
'File:Goldberg Variations 01 Aria.ogg',
'File:Mozart - Eine kleine Nachtmusik - 1. Allegro.ogg',
'File:Chopin Minute Waltz.ogg',
'File:Fur Elise.ogg',
'File:Saint-Saens - The Carnival of the Animals - 07 Aquarium.ogg',
'File:Tchaikovsky Swan Lake Op.20 No.10. Scène.ogg',
'File:Pachelbel\'s Canon.ogg',
'File:Chopin - Waltz in A minor, B 150.ogg'
]
const u=new URL('https://commons.wikimedia.org/w/api.php')
u.searchParams.set('action','query');u.searchParams.set('format','json');u.searchParams.set('formatversion','2')
u.searchParams.set('titles',commonsTitles.join('|'));u.searchParams.set('prop','imageinfo')
u.searchParams.set('iiprop','url|mime|size|extmetadata');u.searchParams.set('origin','*')
const cr=await fetch(u,{headers:{'User-Agent':'HOS-Curation/1.3'},signal:AbortSignal.timeout(10000)})
console.log('COMMONS_STATUS',cr.status)
console.log('COMMONS_BODY',(await cr.text()).slice(0,30000))

const o=new URL('https://api.openverse.org/v1/audio/')
o.searchParams.set('q','instrumental music');o.searchParams.set('page_size','20')
const or=await fetch(o,{headers:{'User-Agent':'HOS-Curation/1.3'},signal:AbortSignal.timeout(10000)})
console.log('OPENVERSE_STATUS',or.status)
console.log('OPENVERSE_BODY',(await or.text()).slice(0,30000))
