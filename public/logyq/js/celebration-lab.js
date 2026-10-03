/* LOGYQ Celebration Lab: real uploaded recordings backed by Supabase Storage. */
(() => {
  'use strict'
  const BASE='https://jzaghifuhinkzzhiojre.supabase.co'
  const KEY='sb_publishable_rQDzA5bYlbzvaTjyo-uTXw_LiiIAddI'
  const BUCKET='logyq-celebrations'
  const API=BASE+'/functions/v1/logyq-celebrations'
  const CATALOG=BASE+'/rest/v1/logyq_celebration_sounds?select=*&active=eq.true&order=created_at.desc'
  const MODE_KEY='logyq_celebration_mode_v1'
  const PIN_KEY='logyq_lab_pin'
  let catalog=[], loaded=false, currentAudio=null, recentIds=[]

  const publicUrl=(path)=>BASE+'/storage/v1/object/public/'+BUCKET+'/'+encodeURIComponent(path).replace(/%2F/g,'/')
  const mode=()=>{ try{return localStorage.getItem(MODE_KEY)||'auto'}catch{return 'auto'} }
  const setMode=(value)=>{ try{localStorage.setItem(MODE_KEY,value)}catch{} renderMode() }
  async function load(force=false){
    if(loaded&&!force)return catalog
    try{
      const res=await fetch(CATALOG,{headers:{apikey:KEY,Authorization:'Bearer '+KEY},cache:'no-store'})
      catalog=res.ok?await res.json():[]
    }catch{catalog=[]}
    loaded=true
    renderList()
    return catalog
  }
  function stop(){
    if(currentAudio){ try{currentAudio.pause();currentAudio.currentTime=0}catch{} currentAudio=null }
  }
  function play(sound){
    if(!sound)return false
    stop()
    try{
      currentAudio=new Audio(publicUrl(sound.storage_path))
      currentAudio.volume=0.9
      currentAudio.play().catch(()=>{})
      return true
    }catch{return false}
  }
  function chooseAuto(context={}){
    if(!catalog.length)return null
    const difficulty=String(context.difficulty||'any')
    const achievement=String(context.achievement||'solve')
    const achievementIntensity={promotion:5,perfect:5,efficient:4,persistence:4}[achievement]
    const desired=achievementIntensity||({easy:1,medium:2,hard:4,vicious:5}[difficulty]||2)
    let pool=(achievement==='promotion'||achievement==='perfect')
      ? [...catalog]
      : catalog.filter(s=>s.difficulty==='any'||s.difficulty===difficulty)
    if(!pool.length)pool=[...catalog]
    // Weighted shuffle: personal achievement is the strongest signal, while
    // puzzle difficulty and the user's intensity tags still shape the odds.
    const weighted=pool.map(s=>{
      const intensityGap=Math.abs(Number(s.intensity||2)-desired)
      const exact=s.difficulty===difficulty
      const any=s.difficulty==='any'
      const recentIndex=recentIds.indexOf(s.id)
      let weight=1/(1+intensityGap*0.7)
      if(exact)weight*=2.0
      else if(any)weight*=1.15
      if(achievement==='promotion'&&['big_cheer','applause'].includes(s.category))weight*=3.2
      else if(achievement==='perfect'&&['big_cheer','applause'].includes(s.category))weight*=2.7
      else if(achievement==='efficient'&&['applause','yay'].includes(s.category))weight*=1.9
      else if(achievement==='persistence'&&['warm','applause','big_cheer'].includes(s.category))weight*=2.2
      else {
        if(difficulty==='easy'&&['yay','warm'].includes(s.category))weight*=1.6
        if(difficulty==='hard'&&['applause','big_cheer'].includes(s.category))weight*=1.5
        if(difficulty==='vicious'&&['big_cheer','applause'].includes(s.category))weight*=1.9
      }
      if(recentIndex===0)weight*=0.03
      else if(recentIndex===1)weight*=0.16
      else if(recentIndex===2)weight*=0.45
      return {s,weight}
    })
    const total=weighted.reduce((sum,x)=>sum+x.weight,0)
    let roll=Math.random()*total
    let chosen=weighted[weighted.length-1]?.s||null
    for(const item of weighted){roll-=item.weight;if(roll<=0){chosen=item.s;break}}
    if(chosen){
      recentIds=[chosen.id,...recentIds.filter(id=>id!==chosen.id)].slice(0,4)
    }
    return chosen
  }
  async function playAuto(context={}){
    const selected=mode()
    if(selected==='off')return true
    await load()
    if(selected.startsWith('id:')){
      const chosen=catalog.find(s=>s.id===selected.slice(3))
      return chosen?play(chosen):false
    }
    const chosen=chooseAuto(context)
    return chosen?play(chosen):false
  }

  function ensureUi(){
    if(document.getElementById('logyq-celebration-lab'))return
    const wrap=document.createElement('div')
    wrap.id='logyq-celebration-lab'
    wrap.hidden=true
    wrap.innerHTML=`
      <section class="logyq-celebration-card" role="dialog" aria-modal="true" aria-labelledby="logyq-celebration-title">
        <header><h2 id="logyq-celebration-title">Celebration Lab</h2><button type="button" data-celebration-close aria-label="Close">×</button></header>
        <p class="logyq-celebration-note">Upload real cheers/applause, audition them, and tell the game when to use them.</p>
        <div class="logyq-celebration-upload">
          <input id="logyq-celebration-files" type="file" accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.webm" multiple>
          <div class="logyq-celebration-grid">
            <label>Type<select id="logyq-celebration-category"><option value="unclassified" selected>Unclassified</option><option value="yay">Yay</option><option value="applause">Applause</option><option value="big_cheer">Big cheer</option><option value="warm">Warm</option><option value="funny">Funny</option></select></label>
            <label>Best for<select id="logyq-celebration-difficulty"><option value="any">Any level</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option><option value="vicious">Vicious</option></select></label>
            <label>Intensity<select id="logyq-celebration-intensity"><option>1</option><option selected>2</option><option>3</option><option>4</option><option>5</option></select></label>
          </div>
          <button type="button" id="logyq-celebration-upload">Upload selected files</button>
          <span id="logyq-celebration-status" aria-live="polite"></span>
        </div>
        <label class="logyq-celebration-mode">Game mode<select id="logyq-celebration-mode"><option value="auto">Automatic</option><option value="off">Off</option></select></label>
        <div id="logyq-celebration-list"></div>
      </section>`
    document.body.appendChild(wrap)
    const style=document.createElement('style')
    style.textContent=`
      #logyq-celebration-lab{position:fixed;inset:0;z-index:6000;display:grid;place-items:center;padding:16px;background:rgba(15,23,42,.38);backdrop-filter:blur(8px)}
      #logyq-celebration-lab[hidden]{display:none!important}.logyq-celebration-card{box-sizing:border-box;width:min(680px,100%);max-height:min(820px,calc(100vh - 32px));overflow:auto;padding:18px;border-radius:24px;background:#fff;color:#0f172a;box-shadow:0 24px 70px rgba(15,23,42,.3);font:14px/1.35 system-ui}
      .logyq-celebration-card header{display:flex;align-items:center;justify-content:space-between}.logyq-celebration-card h2{margin:0;font-size:23px}.logyq-celebration-card header button{width:42px;height:42px;border:0;border-radius:12px;background:#f1f5f9;font-size:26px}.logyq-celebration-note{color:#64748b}
      .logyq-celebration-upload{display:grid;gap:10px;padding:14px;border-radius:17px;background:#f8fafc}.logyq-celebration-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.logyq-celebration-grid label,.logyq-celebration-mode{display:grid;gap:5px;font-weight:700}.logyq-celebration-card select,.logyq-celebration-card input[type=file]{min-height:42px;border:1px solid #cbd5e1;border-radius:11px;background:#fff;padding:8px}.logyq-celebration-upload>button{min-height:46px;border:0;border-radius:13px;background:#0f172a;color:#fff;font-weight:800}
      .logyq-celebration-mode{margin:14px 0}.logyq-celebration-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:11px 0;border-top:1px solid #e2e8f0}.logyq-celebration-row strong{display:block;overflow:hidden;text-overflow:ellipsis}.logyq-celebration-tags{font-size:12px;color:#64748b}.logyq-celebration-edit{display:flex;gap:5px;margin-top:7px;flex-wrap:wrap}.logyq-celebration-edit select{min-height:34px;padding:4px 6px;font-size:12px}.logyq-celebration-actions{display:flex;gap:6px;align-items:center}.logyq-celebration-actions button{min-height:38px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;padding:0 11px;font-weight:700}.logyq-celebration-actions button[data-delete]{color:#991b1b}
      @media(max-width:520px){.logyq-celebration-grid{grid-template-columns:1fr}.logyq-celebration-row{grid-template-columns:1fr}.logyq-celebration-actions{flex-wrap:wrap}}
    `
    document.head.appendChild(style)
    wrap.addEventListener('click',e=>{if(e.target===wrap||e.target.closest('[data-celebration-close]'))close()})
    document.getElementById('logyq-celebration-upload')?.addEventListener('click',upload)
    document.getElementById('logyq-celebration-mode')?.addEventListener('change',e=>setMode(e.target.value))
  }
  function renderMode(){
    const sel=document.getElementById('logyq-celebration-mode')
    if(!sel)return
    const value=mode()
    for(const old of [...sel.querySelectorAll('option[data-sound]')])old.remove()
    for(const s of catalog){
      const o=document.createElement('option');o.value='id:'+s.id;o.dataset.sound='1';o.textContent='Always: '+s.name;sel.appendChild(o)
    }
    sel.value=[...sel.options].some(o=>o.value===value)?value:'auto'
  }
  function renderList(){
    ensureUi();renderMode()
    const list=document.getElementById('logyq-celebration-list')
    if(!list)return
    list.innerHTML=catalog.length?'':'<p>No recordings yet. Upload a few above.</p>'
    for(const s of catalog){
      const row=document.createElement('div');row.className='logyq-celebration-row'
      row.innerHTML=`<div><strong></strong><span class="logyq-celebration-tags"></span><div class="logyq-celebration-edit"><select data-category><option value="unclassified">Unclassified</option><option value="yay">Yay</option><option value="applause">Applause</option><option value="big_cheer">Big cheer</option><option value="warm">Warm</option><option value="funny">Funny</option></select><select data-difficulty><option value="any">Any level</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option><option value="vicious">Vicious</option></select><select data-intensity><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option></select></div></div><div class="logyq-celebration-actions"><button type="button" data-play>▶ Play</button><button type="button" data-save>Save</button><button type="button" data-default>Use this</button><button type="button" data-delete>Delete</button></div>`
      row.querySelector('strong').textContent=s.name
      row.querySelector('.logyq-celebration-tags').textContent=`${s.category.replace('_',' ')} · intensity ${s.intensity} · ${s.difficulty}`
      row.querySelector('[data-category]').value=s.category
      row.querySelector('[data-difficulty]').value=s.difficulty
      row.querySelector('[data-intensity]').value=String(s.intensity)
      row.querySelector('[data-play]').onclick=()=>play(s)
      row.querySelector('[data-save]').onclick=()=>saveMeta(s,row)
      row.querySelector('[data-default]').onclick=()=>setMode('id:'+s.id)
      row.querySelector('[data-delete]').onclick=()=>remove(s)
      list.appendChild(row)
    }
  }
  function pin(){
    try{const saved=localStorage.getItem(PIN_KEY);if(saved)return saved}catch{}
    const value=prompt('Lab PIN')
    if(value){try{localStorage.setItem(PIN_KEY,value)}catch{}}
    return value||''
  }
  async function upload(){
    const input=document.getElementById('logyq-celebration-files')
    const files=[...(input?.files||[])]
    if(!files.length)return
    const status=document.getElementById('logyq-celebration-status')
    const p=pin();if(!p)return
    let done=0
    for(const file of files){
      status.textContent=`Uploading ${done+1} of ${files.length}…`
      const form=new FormData();form.append('audio',file);form.append('name',file.name.replace(/\.[^.]+$/,''))
      form.append('category',document.getElementById('logyq-celebration-category').value)
      form.append('difficulty',document.getElementById('logyq-celebration-difficulty').value)
      form.append('intensity',document.getElementById('logyq-celebration-intensity').value)
      const res=await fetch(API,{method:'POST',headers:{'x-review-pin':p},body:form})
      const body=await res.json().catch(()=>({}))
      if(res.status===401){try{localStorage.removeItem(PIN_KEY)}catch{};status.textContent='Wrong Lab PIN.';return}
      if(!res.ok){
        const detail = typeof body?.error === 'string' ? body.error :
          body?.error?.message ? body.error.message :
          (() => { try { return JSON.stringify(body?.error || body) } catch { return 'Upload failed.' } })()
        status.textContent = detail || 'Upload failed.'
        return
      }
      done++
    }
    status.textContent=`Uploaded ${done} file${done===1?'':'s'}.`;input.value='';loaded=false;await load(true)
  }
  async function saveMeta(sound,row){
    const p=pin();if(!p)return
    const body={id:sound.id,category:row.querySelector('[data-category]').value,difficulty:row.querySelector('[data-difficulty]').value,intensity:Number(row.querySelector('[data-intensity]').value)}
    const res=await fetch(API,{method:'PATCH',headers:{'content-type':'application/json','x-review-pin':p},body:JSON.stringify(body)})
    if(res.status===401){try{localStorage.removeItem(PIN_KEY)}catch{};alert('Wrong Lab PIN.');return}
    if(!res.ok){alert('Save failed.');return}
    loaded=false;await load(true)
  }
  async function remove(sound){
    if(!confirm('Delete “'+sound.name+'”?'))return
    const p=pin();if(!p)return
    const res=await fetch(API,{method:'DELETE',headers:{'content-type':'application/json','x-review-pin':p},body:JSON.stringify({id:sound.id})})
    if(res.status===401){try{localStorage.removeItem(PIN_KEY)}catch{};alert('Wrong Lab PIN.');return}
    if(!res.ok){alert('Delete failed.');return}
    loaded=false;await load(true)
  }
  async function open(){ensureUi();document.getElementById('logyq-celebration-lab').hidden=false;await load(true)}
  function close(){stop();const el=document.getElementById('logyq-celebration-lab');if(el)el.hidden=true}
  ensureUi()
  load()
  window.LOGYQCelebrations=Object.freeze({open,close,load,play,playAuto,stop,mode,setMode})
})()
