(() => {
  'use strict'

  const frame = document.getElementById('app')
  const loading = document.getElementById('loading')
  const C = {
    doubleTap: 360,
    tapMove: 11,
    holdMs: 280,
    holdSlop: 8,
    edgeZone: 84,
    edgeStep: 14,
    pinKey: 'logiq_lab_pin_v1',
  }

  frame.addEventListener('load', () => {
    loading.style.display = 'none'
    const win = frame.contentWindow
    const doc = frame.contentDocument
    if (!win || !doc || !win.LOGiQBridge || !mobile(win)) return

    const bridge = win.LOGiQBridge
    win.__logiqV2ConsumedPointers ||= new Set()

    const state = {
      active: new Set(), pointers: new Map(), lastTap: null, hold: null, gesture: null,
      edgeRaf: 0, actionRaf: 0, actionUid: null, editorUid: null,
      recorder: null, recordingUid: null, recordingStream: null, chunks: [], toastTimer: 0,
    }

    injectStyles(doc)
    state.rail = makeRail(doc)
    state.action = makeAction(doc)
    state.editor = makeEditor(doc)
    state.toast = makeToast(doc)
    bindRail(doc, win, state)
    bindAction(doc, win, bridge, state)
    bindEditor(win, bridge, state)
    bindGestures(doc, win, bridge, state)
    doc.body.classList.add('logiq-mobile-v2')
    actionLoop(doc, win, state)
  })

  function mobile(win) {
    return win.matchMedia('((pointer:coarse) and (max-width:1200px)),((hover:none) and (max-width:1200px))').matches
  }

  function injectStyles(doc) {
    const style = doc.createElement('style')
    style.textContent = `
      @media (pointer:coarse) and (max-width:1200px),(hover:none) and (max-width:1200px){
        body.logiq-mobile-v2 #logiq-mobile-context,
        body.logiq-mobile-v2 #logiq-voice-bar{display:none!important}
        body.logiq-mobile-v2 svg#canvas g.node{pointer-events:none!important}
        body.logiq-mobile-v2 #Dock{bottom:8px}
        body.logiq-mobile-v2 #Hint{bottom:16px}
        body.logiq-mobile-v2 #Toast{display:none!important}
        body.logiq-mobile-v2 #logiq-mobile-panel{top:max(8px,env(safe-area-inset-top));left:58px;right:8px;width:auto;max-width:330px}
        body.logiq-mobile-v2 #logiq-mobile-panel button[data-tool="add"],
        body.logiq-mobile-v2 #logiq-mobile-panel button[data-tool="add-selected"]{display:none!important}
        #logiq-v2-rail{position:fixed;z-index:3900;left:max(6px,env(safe-area-inset-left));top:max(8px,env(safe-area-inset-top));display:flex;flex-direction:column;gap:6px;padding:5px;border:1px solid #e2e8f0;border-radius:14px;background:rgba(255,255,255,.9);box-shadow:0 10px 28px rgba(15,23,42,.16);backdrop-filter:blur(8px)}
        #logiq-v2-rail button{width:38px;height:38px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;color:#334155;font:750 15px/1 system-ui;padding:0;touch-action:manipulation}
        #logiq-v2-rail button:active{transform:scale(.95);background:#f1f5f9}
        #logiq-v2-rail button[data-v2="delete"]{color:#dc2626}
        #logiq-v2-rail .divider{height:1px;background:#e2e8f0;margin:1px 4px}
        #logiq-v2-action{position:fixed;z-index:3950;display:none;place-items:center;width:40px;height:40px;padding:0;border:2px solid #fff;border-radius:50%;background:#16a34a;color:#fff;box-shadow:0 7px 20px rgba(15,23,42,.26);font:800 10px/1 system-ui;touch-action:none}
        #logiq-v2-action.show{display:grid}#logiq-v2-action.rec{background:#ef4444}
        #logiq-v2-action.rec::before{content:"";position:absolute;inset:-5px;border:2px solid rgba(239,68,68,.35);border-radius:50%;animation:v2pulse 1.05s ease-out infinite}
        @keyframes v2pulse{0%{transform:scale(.72);opacity:.95}100%{transform:scale(1.28);opacity:0}}
        #logiq-v2-editor{position:fixed;z-index:3975;display:none;box-sizing:border-box;min-width:120px;height:44px;border:2px solid #22c55e;border-radius:10px;background:#fff;color:#0f172a;box-shadow:0 10px 28px rgba(15,23,42,.2);padding:0 10px;font:650 16px/1 system-ui;outline:none}
        #logiq-v2-editor.show{display:block}
        #logiq-v2-toast{position:fixed;z-index:4000;left:50%;bottom:max(16px,env(safe-area-inset-bottom));transform:translateX(-50%) translateY(8px);max-width:calc(100vw - 28px);padding:8px 11px;border-radius:999px;background:rgba(15,23,42,.92);color:#fff;font:700 12px/1.25 system-ui;opacity:0;pointer-events:none;transition:.16s;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        #logiq-v2-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
        body.logiq-mobile-v2.v2-drag svg#canvas{cursor:grabbing}
        body.logiq-mobile-v2.v2-drag g.node.is-outlined rect:not(.grabzone){stroke:#2563eb!important;stroke-width:3px!important}
        body.logiq-mobile-v2.v2-cancel g.node.is-outlined rect:not(.grabzone){stroke:#ef4444!important;stroke-width:3px!important}
        @media (orientation:landscape){
          #logiq-v2-rail{top:50%;transform:translateY(-50%)}
          body.logiq-mobile-v2 #logiq-mobile-panel{top:8px;bottom:8px;left:58px;right:auto;width:min(300px,42vw);overflow:auto}
        }
      }`
    doc.head.appendChild(style)
  }

  function makeRail(doc) {
    const el = doc.createElement('nav')
    el.id = 'logiq-v2-rail'
    el.setAttribute('aria-label','LOGiQ mobile tools')
    el.innerHTML = '<button data-v2="undo" aria-label="Undo">↶</button><button data-v2="fit" aria-label="Fit map">◎</button><button data-v2="maps" aria-label="Maps">▤</button><div class="divider"></div><button data-v2="more" aria-label="More">⋯</button><button data-v2="delete" aria-label="Delete selected card">×</button>'
    doc.body.appendChild(el)
    return el
  }

  function makeAction(doc) {
    const el = doc.createElement('button')
    el.id = 'logiq-v2-action'; el.type = 'button'; el.textContent = 'MIC'; el.setAttribute('aria-label','Record card')
    doc.body.appendChild(el); return el
  }

  function makeEditor(doc) {
    const el = doc.createElement('input')
    el.id = 'logiq-v2-editor'; el.type = 'text'; el.autocomplete = 'off'; el.autocapitalize = 'sentences'; el.enterKeyHint = 'done'; el.setAttribute('aria-label','Edit card text')
    doc.body.appendChild(el); return el
  }

  function makeToast(doc) {
    const el = doc.createElement('div')
    el.id = 'logiq-v2-toast'; el.setAttribute('role','status'); el.setAttribute('aria-live','polite')
    doc.body.appendChild(el); return el
  }

  function bindRail(doc, win, state) {
    state.rail.addEventListener('pointerdown', e => e.stopPropagation())
    state.rail.addEventListener('click', e => {
      const b = e.target.closest('button[data-v2]'); if (!b) return
      const a = b.dataset.v2
      if (a === 'undo' || a === 'fit' || a === 'maps') return clickTool(doc,a)
      if (a === 'more') return doc.getElementById('logiq-mobile-menu-btn')?.click()
      if (a === 'delete') {
        const d = doc.querySelector('#logiq-mobile-context button[data-action="delete"]')
        if (d) d.click(); else toast(win,state,'Select a card first')
      }
    })
  }

  function clickTool(doc, name) {
    (doc.querySelector(`#logiq-mobile-header [data-tool="${name}"]`) || doc.querySelector(`#logiq-mobile-panel [data-tool="${name}"]`) || doc.querySelector(`[data-tool="${name}"]`))?.click()
  }

  function bindAction(doc, win, bridge, state) {
    state.action.addEventListener('pointerdown', e => { e.preventDefault(); e.stopImmediatePropagation() }, {passive:false})
    state.action.addEventListener('click', async e => {
      e.preventDefault(); e.stopImmediatePropagation(); if (!state.actionUid) return
      if (state.recorder) stopRecording(state)
      else await startRecording(win,bridge,state,state.actionUid)
    })
  }

  function bindEditor(win, bridge, state) {
    const save = () => {
      if (!state.editorUid) return
      const uid = state.editorUid, value = state.editor.value.trim()
      closeEditor(state); bridge.selectByUid(uid); bridge.renameNode(uid,value); state.actionUid = value ? null : uid
    }
    state.editor.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); save() }
      else if (e.key === 'Escape') { e.preventDefault(); closeEditor(state) }
    })
    state.editor.addEventListener('blur', () => { if (state.editorUid) save() })
    state.editor.addEventListener('pointerdown', e => e.stopImmediatePropagation())
  }

  function bindGestures(doc, win, bridge, state) {
    const canvas = doc.getElementById('canvas'); if (!canvas) return

    const down = e => {
      if (e.pointerType === 'mouse') return
      const had = state.active.size > 0
      if (had) {
        state.pointers.forEach(p => { p.multi = true })
        cancelHold(win,state)
      }

      state.active.add(e.pointerId)
      const node = hitNode(doc,e.clientX,e.clientY), uid = nodeUid(node)
      state.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,uid,multi:had,moved:false})

      if (state.gesture && e.pointerId !== state.gesture.pointerId) {
        e.preventDefault(); e.stopImmediatePropagation()
        if (!node) {
          state.gesture.cancel = true
          doc.body.classList.add('v2-cancel')
          win.navigator.vibrate?.([10,24,10])
        }
        return
      }

      if (had || !uid) return
      const before = captureState(bridge)
      const hold = {
        pointerId:e.pointerId, uid, node,
        x:e.clientX, y:e.clientY, lastX:e.clientX, lastY:e.clientY,
        before, moved:false, timer:0,
      }
      hold.timer = win.setTimeout(() => latchHold(doc,win,bridge,state,hold), C.holdMs)
      state.hold = hold
    }

    const move = e => {
      const p = state.pointers.get(e.pointerId)
      if (p && Math.hypot(e.clientX-p.x,e.clientY-p.y) > C.tapMove) p.moved = true

      const hold = state.hold
      if (hold && hold.pointerId === e.pointerId) {
        hold.lastX=e.clientX; hold.lastY=e.clientY
        if (Math.hypot(e.clientX-hold.x,e.clientY-hold.y) > C.holdSlop) {
          hold.moved = true
          cancelHold(win,state)
        }
        return
      }

      const g = state.gesture
      if (!g || g.pointerId !== e.pointerId) return
      e.preventDefault(); e.stopImmediatePropagation()
      g.lastX=e.clientX; g.lastY=e.clientY
      mouse(win,win,'mousemove',e.clientX,e.clientY,1)
    }

    const up = e => {
      const p = state.pointers.get(e.pointerId)
      state.active.delete(e.pointerId)
      state.pointers.delete(e.pointerId)

      if (state.hold?.pointerId === e.pointerId) cancelHold(win,state)

      const g = state.gesture
      if (g && g.pointerId === e.pointerId) {
        finishDrag(doc,win,state,g,e.clientX,e.clientY)
        win.setTimeout(() => settleDrag(win,bridge,g),0)
        return
      }

      if (!p || p.multi || p.moved) return
      const node = hitNode(doc,e.clientX,e.clientY), uid = nodeUid(node)
      if (!uid || uid !== p.uid) {
        state.lastTap = null
        if (!state.recorder) state.actionUid = null
        return
      }

      const now = win.performance.now()
      if (state.lastTap?.uid === uid && now-state.lastTap.time <= C.doubleTap) {
        state.lastTap = null
        const live = nodeByUid(doc,uid)
        if (live) openEditor(win,bridge,state,live,uid)
        return
      }

      bridge.selectByUid(uid)
      state.lastTap = {uid,time:now}
      state.actionUid = blank(node) ? uid : null
    }

    const cancel = e => {
      state.active.delete(e.pointerId)
      state.pointers.delete(e.pointerId)
      if (state.hold?.pointerId === e.pointerId) cancelHold(win,state)
      if (!state.gesture || state.gesture.pointerId !== e.pointerId) return
      const g = state.gesture
      finishDrag(doc,win,state,g,g.lastX,g.lastY)
      win.setTimeout(() => restoreExact(bridge,g),0)
    }

    canvas.addEventListener('pointerdown',down,true)
    canvas.addEventListener('pointermove',move,true)
    canvas.addEventListener('pointerup',up,true)
    canvas.addEventListener('pointercancel',cancel,true)

    const suppress = e => {
      if (!state.gesture) return
      e.preventDefault(); e.stopImmediatePropagation()
    }
    canvas.addEventListener('touchmove',suppress,{capture:true,passive:false})
  }

  function latchHold(doc,win,bridge,state,hold) {
    if (state.hold !== hold || hold.moved) return
    const pointer = state.pointers.get(hold.pointerId)
    if (!pointer || pointer.multi || state.active.size !== 1) return cancelHold(win,state)

    state.hold = null
    if (hold.timer) win.clearTimeout(hold.timer)
    bridge.selectByUid(hold.uid)
    state.actionUid = null
    closeEditor(state)

    const node = nodeByUid(doc,hold.uid) || hold.node
    if (!node) return

    state.gesture = {
      pointerId:hold.pointerId, uid:hold.uid, node,
      x:hold.x, y:hold.y, lastX:hold.lastX, lastY:hold.lastY,
      before:hold.before, cancel:false,
    }
    win.__logiqV2ConsumedPointers.add(hold.pointerId)
    win.__logiqV2DragActive = true
    doc.body.classList.add('v2-drag')
    mouse(node,win,'mousedown',hold.x,hold.y,1)
    edgeLoop(doc,win,state)
    win.navigator.vibrate?.(12)
  }

  function cancelHold(win,state) {
    const hold = state.hold
    if (!hold) return
    if (hold.timer) win.clearTimeout(hold.timer)
    state.hold = null
  }

  function finishDrag(doc,win,state,g,x,y) {
    mouse(win,win,'mouseup',x,y,0)
    state.gesture = null
    win.__logiqV2DragActive = false
    doc.body.classList.remove('v2-drag','v2-cancel')
    if (state.edgeRaf) win.cancelAnimationFrame(state.edgeRaf)
    state.edgeRaf = 0
  }

  function settleDrag(win,bridge,g) {
    const after = bridge.snapshot()
    const changed = stableState(after) !== stableState(g.before)
    const missing = !treeHasUid(after?.tree,g.uid)
    if (g.cancel || missing) {
      if (changed) bridge.undo()
      if (stableState(bridge.snapshot()) !== stableState(g.before)) bridge.loadMap(g.before.tree,g.before.wordBank)
      bridge.selectByUid(g.uid)
    }
    win.setTimeout(() => win.__logiqV2ConsumedPointers.delete(g.pointerId),0)
  }

  function restoreExact(bridge,g) {
    const changed = stableState(bridge.snapshot()) !== stableState(g.before)
    if (changed) bridge.undo()
    if (stableState(bridge.snapshot()) !== stableState(g.before)) bridge.loadMap(g.before.tree,g.before.wordBank)
    bridge.selectByUid(g.uid)
  }

  function mouse(target,win,type,x,y,buttons) {
    try { target.dispatchEvent(new win.MouseEvent(type,{bubbles:true,cancelable:true,view:win,clientX:x,clientY:y,screenX:x,screenY:y,button:0,buttons})) } catch (_) {}
  }

  function edgeLoop(doc,win,state) {
    if (state.edgeRaf) win.cancelAnimationFrame(state.edgeRaf)
    const tick = () => {
      const g = state.gesture
      if (!g) { state.edgeRaf=0; return }
      if (edgePan(doc,win,g.lastX,g.lastY)) mouse(win,win,'mousemove',g.lastX,g.lastY,1)
      state.edgeRaf = win.requestAnimationFrame(tick)
    }
    state.edgeRaf = win.requestAnimationFrame(tick)
  }

  function actionLoop(doc,win,state) {
    const tick = () => {
      const uid = state.recordingUid || state.actionUid, node = uid ? nodeByUid(doc,uid) : null, r = node?.getBoundingClientRect()
      const visible = r && r.width>1 && r.height>1 && r.right>0 && r.left<win.innerWidth && r.bottom>0 && r.top<win.innerHeight
      if (visible && !state.editorUid) {
        const right = r.right+46<=win.innerWidth, left = right ? r.right+5 : r.left-45
        state.action.style.left = `${Math.max(4,Math.min(win.innerWidth-44,left))}px`
        state.action.style.top = `${Math.max(4,Math.min(win.innerHeight-44,r.top+Math.max(0,(r.height-40)/2)))}px`
        state.action.classList.add('show'); state.action.classList.toggle('rec',!!state.recorder); state.action.textContent = state.recorder ? '■' : 'MIC'; state.action.setAttribute('aria-label',state.recorder?'Stop recording':'Record card')
      } else state.action.classList.remove('show')
      state.actionRaf = win.requestAnimationFrame(tick)
    }
    state.actionRaf = win.requestAnimationFrame(tick)
  }

  async function startRecording(win,bridge,state,uid) {
    if (state.recorder) return
    if (!win.navigator.mediaDevices?.getUserMedia || typeof win.MediaRecorder === 'undefined') return toast(win,state,'Voice recording is unavailable')
    const pin = voicePin(win); if (!pin) return
    try {
      const stream = await win.navigator.mediaDevices.getUserMedia({audio:true}), rec = new win.MediaRecorder(stream)
      state.recorder=rec; state.recordingUid=uid; state.recordingStream=stream; state.chunks=[]
      rec.addEventListener('dataavailable',e=>{if(e.data?.size) state.chunks.push(e.data)})
      rec.addEventListener('stop',()=>transcribe(win,bridge,state,rec,pin),{once:true})
      rec.start(); win.navigator.vibrate?.(10); toast(win,state,'Recording… tap MIC to stop')
    } catch (_) { toast(win,state,'Microphone permission is needed') }
  }

  function stopRecording(state) { if (state.recorder && state.recorder.state!=='inactive') state.recorder.stop() }

  async function transcribe(win,bridge,state,rec,pin) {
    const uid=state.recordingUid, chunks=state.chunks.slice(); state.recordingStream?.getTracks?.().forEach(t=>t.stop()); state.recordingStream=null; state.chunks=[]
    try {
      const audio=new win.Blob(chunks,{type:rec?.mimeType||'audio/webm'}), form=new win.FormData(); form.append('audio',audio,'logiq-card.webm')
      const response=await win.fetch('/api/transcribe',{method:'POST',headers:{'x-review-pin':pin},body:form}), result=await response.json()
      if(!response.ok || !result?.text?.trim()){if(response.status===401||response.status===403) win.sessionStorage.removeItem(C.pinKey); throw new Error('transcribe')}
      const text=result.text.trim(); bridge.renameNode(uid,text); state.actionUid=null; toast(win,state,`Added “${text}”`)
    } catch (_) { state.actionUid=uid; toast(win,state,'Could not transcribe — card left blank') }
    finally { state.recorder=null; state.recordingUid=null }
  }

  function voicePin(win) {
    const stored=win.sessionStorage.getItem(C.pinKey); if(stored) return stored
    const value=win.prompt('Enter the Lab PIN for voice transcription'); if(!value?.trim()) return null
    const pin=value.trim(); win.sessionStorage.setItem(C.pinKey,pin); return pin
  }

  function openEditor(win,bridge,state,node,uid) {
    state.editorUid=uid; state.actionUid=null; bridge.selectByUid(uid)
    const r=node.getBoundingClientRect(), input=state.editor, width=Math.max(128,Math.min(win.innerWidth-16,Math.max(r.width,160)))
    input.value=cardText(node); input.style.width=`${width}px`; input.style.left=`${Math.max(8,Math.min(win.innerWidth-width-8,r.left))}px`; input.style.top=`${Math.max(8,Math.min(win.innerHeight-52,r.top+Math.max(0,(r.height-44)/2)))}px`; input.classList.add('show')
    win.requestAnimationFrame(()=>{input.focus();input.setSelectionRange?.(input.value.length,input.value.length)})
  }

  function closeEditor(state){state.editorUid=null;state.editor.classList.remove('show')}
  function toast(win,state,msg){clearTimeout(state.toastTimer);state.toast.textContent=msg;state.toast.classList.add('show');state.toastTimer=win.setTimeout(()=>state.toast.classList.remove('show'),1800)}
  function nodeUid(n){return n?.__data__?.data?._uid||null}
  function nodeByUid(doc,uid){return Array.from(doc.querySelectorAll('g.node')).find(n=>nodeUid(n)===uid)||null}
  function hitNode(doc,x,y){return Array.from(doc.querySelectorAll('g.node')).filter(n=>{const r=n.getBoundingClientRect();return x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom}).sort((a,b)=>{const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect();return ar.width*ar.height-br.width*br.height})[0]||null}
  function cardText(node){const d=node?.__data__?.data||{};for(const k of ['label','text','name','title','value'])if(typeof d[k]==='string'&&d[k].trim())return d[k].trim();return Array.from(node?.querySelectorAll?.('text')||[]).map(e=>e.textContent?.trim()||'').filter(Boolean).join(' ').trim()}
  function blank(node){const t=cardText(node).toLowerCase();return !t||['new','new card','untitled','…','...'].includes(t)}
  function captureState(bridge){const s=bridge.snapshot();return {tree:JSON.parse(JSON.stringify(s?.tree||null)),wordBank:Array.isArray(s?.wordBank)?s.wordBank.slice():[]}}
  function stableState(s){return JSON.stringify({tree:s?.tree||null,wordBank:Array.isArray(s?.wordBank)?s.wordBank:[]})}
  function treeHasUid(node,uid){if(!node)return false;if(node._uid===uid)return true;return Array.isArray(node.children)&&node.children.some(child=>treeHasUid(child,uid))}

  function edgePan(doc,win,x,y) {
    const svg=doc.getElementById('canvas'); if(!svg||!win.d3)return false
    const portrait=win.matchMedia('(orientation:portrait)').matches
    const leftInset=portrait?4:54, topInset=portrait?54:4
    const step=(p,min,max)=>{if(p<min+C.edgeZone){const q=Math.max(0,Math.min(1,(min+C.edgeZone-p)/C.edgeZone));return C.edgeStep*q*q}if(p>max-C.edgeZone){const q=Math.max(0,Math.min(1,(p-(max-C.edgeZone))/C.edgeZone));return -C.edgeStep*q*q}return 0}
    const dx=step(x,leftInset,win.innerWidth),dy=step(y,topInset,win.innerHeight-4);if(!dx&&!dy)return false
    const t=win.d3.zoomTransform(svg),next=win.d3.zoomIdentity.translate(t.x+dx,t.y+dy).scale(t.k);svg.__zoom=next
    const root=Array.from(svg.children).find(c=>c.tagName?.toLowerCase()==='g');if(root)root.setAttribute('transform',next.toString());return true
  }
})()