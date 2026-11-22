import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { addBasicPair, addSymbol, findNode, findSupportingCircle, locateDropTarget, countSymbols, KINDS, layoutMap, MAX_SYMBOLS, parseDraft, preset, removeSymbol, RULES, setOmitted, studyScene, SYMBOLS, type Kind, type MapDraft, type Placement, type DropSide } from './stax/model'
import { SymbolCanvas, SymbolIcon } from './stax/SymbolCanvas'
import { MoleculeBoard } from './stax/MoleculeBoard'
import { RemoteCircleTest } from './stax/RemoteCircleTest'
import type { RemoteInput } from './stax/remote-gesture-model'
import './stax/stax.css'

const STORAGE='stax-visual-grammar-v1'
type History={past:MapDraft[];present:MapDraft;future:MapDraft[]}
type Mode='compose'|'symbols'|'construction'
type DragGesture={kind:Kind;pointerId:number;startX:number;startY:number;moved:boolean}
type DragPreview={kind:Kind;x:number;y:number}
function initial():MapDraft {try{return parseDraft(localStorage.getItem(STORAGE)||'')||preset('blank')}catch{return preset('blank')}}
function download(text:string,type:string,name:string){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
export function StaxLab({onExit}: {onExit:()=>void}) {
 const [history,setHistory]=useState<History>(()=>({past:[],present:initial(),future:[]}))
 const [selected,setSelected]=useState<string|null>(null),[blueprint,setBlueprint]=useState(false),[mode,setMode]=useState<Mode>('compose')
 const [placement,setPlacement]=useState<Placement>('auto'),[zoom,setZoom]=useState(1),[rulesOpen,setRulesOpen]=useState(false)
 const [notice,setNotice]=useState(''),[saveError,setSaveError]=useState(false)
 const [freeBoard,setFreeBoard]=useState(true)
 const [remoteExperiment,setRemoteExperiment]=useState(()=>new URLSearchParams(window.location.search).get('remote')==='host')
 const remoteInputRef=useRef<((input:RemoteInput)=>void)|null>(null)
 const svgRef=useRef<SVGSVGElement>(null), doc=history.present
 const dragRef=useRef<DragGesture|null>(null), suppressClickRef=useRef<Kind|null>(null)
 const [dragPreview,setDragPreview]=useState<DragPreview|null>(null)
 const scene=useMemo(()=>mode==='compose'?layoutMap(doc):studyScene(mode==='construction'),[doc,mode])
 const active=scene.nodes.find(n=>n.id===selected), count=countSymbols(doc)
 useEffect(()=>{try{localStorage.setItem(STORAGE,JSON.stringify(doc));setSaveError(false)}catch{setSaveError(true)}},[doc])
 function commit(next:MapDraft){setHistory(h=>({past:[...h.past,h.present].slice(-40),present:next,future:[]}))}
 function undo(){setHistory(h=>h.past.length?{past:h.past.slice(0,-1),present:h.past[h.past.length-1],future:[h.present,...h.future]}:h);setSelected(null)}
 function redo(){setHistory(h=>h.future.length?{past:[...h.past,h.present],present:h.future[0],future:h.future.slice(1)}:h);setSelected(null)}
 function add(kind:Kind,target=selected,side?:DropSide) {
  if(mode!=='compose'){setNotice('Switch to Compose to add shapes.');return}
  if(count>=MAX_SYMBOLS){setNotice(`This study holds up to ${MAX_SYMBOLS} shapes.`);return}
  const id=crypto.randomUUID()
  // A determiner does not support a verb: it can attach only under a blue circle.
  const owner = (kind==='rectangle'||kind==='oval') ? findSupportingCircle(doc,target) : undefined
  const safeTarget = owner?.id ?? (kind==='rectangle' && findNode(doc,target)?.kind!=='circle' ? null : target)
  const completingSpine=kind==='circle' && count===2 && doc.roots.length===1 && doc.roots[0].kind==='circle' && doc.roots[0].next?.kind==='triangle' && !doc.roots[0].next.next && doc.roots[0].next.id===safeTarget && placement!=='below'
  const snapped=side && safeTarget?addBasicPair(doc,safeTarget,kind,side,id):null
  commit(snapped??addSymbol(doc,safeTarget,kind,placement,id));setSelected(id)
  if(snapped)setNotice(`Snapped ${SYMBOLS[kind].label} ${side} of the first shape. Undo and try the opposite side.`)
  else if(completingSpine)setNotice('Third blue circle snapped below and right of the red triangle. One connected composition.')
  else if(!count)setNotice(`${SYMBOLS[kind].label} added. Drag a ${kind==='circle'?'triangle':'circle'} to either side to try the first snap.`)
  else setNotice(`${SYMBOLS[kind].label} added${safeTarget?' to the selected group':' on a new row'}.`)
 }
 function dropFromPalette(kind:Kind,clientX:number,clientY:number) {
  const svg=svgRef.current, board=svg?.closest('.stax-board')
  if(!svg||!board)return
  const bounds=board.getBoundingClientRect()
  if(clientX<bounds.left||clientX>bounds.right||clientY<bounds.top||clientY>bounds.bottom){
   setNotice('Drop the shape onto the canvas.');return
  }
  const matrix=svg.getScreenCTM()
  if(!matrix)return
  const point=svg.createSVGPoint();point.x=clientX;point.y=clientY
  const local=point.matrixTransform(matrix.inverse())
  const snap=locateDropTarget(scene,kind,local.x/32,local.y/32)
  add(kind,snap?.target??null,snap?.side)
 }
 function startGesture(kind:Kind,e:ReactPointerEvent<HTMLButtonElement>){
  if(mode!=='compose'||count>=MAX_SYMBOLS||(e.pointerType==='mouse'&&e.button!==0))return
  suppressClickRef.current=null
  dragRef.current={kind,pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,moved:false}
  e.currentTarget.setPointerCapture(e.pointerId)
 }
 function moveGesture(e:ReactPointerEvent<HTMLButtonElement>){
  const gesture=dragRef.current
  if(!gesture||gesture.pointerId!==e.pointerId)return
  if(Math.hypot(e.clientX-gesture.startX,e.clientY-gesture.startY)>8)gesture.moved=true
  if(gesture.moved)setDragPreview({kind:gesture.kind,x:e.clientX,y:e.clientY})
 }
 function finishGesture(e:ReactPointerEvent<HTMLButtonElement>){
  const gesture=dragRef.current
  if(!gesture||gesture.pointerId!==e.pointerId)return
  dragRef.current=null;setDragPreview(null)
  if(gesture.moved){
   suppressClickRef.current=gesture.kind
   dropFromPalette(gesture.kind,e.clientX,e.clientY)
  }
 }
 function cancelGesture(){dragRef.current=null;setDragPreview(null)}
 function changeMode(next:Mode){setMode(next);setSelected(null);setZoom(1);setNotice('')}
 function chooseExample(name:string){commit(preset(name));setSelected(null);setMode('compose');setZoom(1);setNotice('Example loaded. Undo restores your previous composition.')}
 function exportSvg(){
  const source=svgRef.current;if(!source)return
  const copy=source.cloneNode(true) as SVGSVGElement
  copy.querySelectorAll('.stax-selection,title').forEach(n=>n.remove())
  copy.querySelectorAll('[tabindex]').forEach(n=>{n.removeAttribute('tabindex');n.removeAttribute('role');n.removeAttribute('aria-pressed')})
  copy.removeAttribute('style');copy.setAttribute('width',String(scene.width*32));copy.setAttribute('height',String(scene.height*32))
  download(new XMLSerializer().serializeToString(copy),'image/svg+xml',`stax-${mode}-${blueprint?'blueprint':'clean'}.svg`)
 }
 if(new URLSearchParams(window.location.search).get('remote')==='pad')return <RemoteCircleTest onExit={()=>window.location.assign('/stax-shape-lab')}/>
 if(freeBoard)return <main className="stax-lab">
  <header className="stax-header"><div className="stax-identity"><button className="stax-back" onClick={onExit} aria-label="Back to The Lab">←</button><div><h1>STAX <span>Magnetic Molecules</span></h1><p>Free shape assembly · experimental</p></div></div>
   <div className="stax-header-actions"/>
  </header>
  <section className="stax-main" style={{maxWidth:1200,margin:'0 auto',width:'100%'}}>
    <MoleculeBoard onBack={onExit} onRemoteTest={()=>setRemoteExperiment(true)}/>
    {remoteExperiment&&<>
     <div className="stax-remote-canonical-board"><MoleculeBoard remoteSandbox remoteInputRef={remoteInputRef}/></div>
     <RemoteCircleTest onHostInput={input=>remoteInputRef.current?.(input)} onExit={()=>{setRemoteExperiment(false);if(new URLSearchParams(window.location.search).get('remote')==='host')window.history.replaceState({},'', '/stax-shape-lab')}}/>
    </>}
  </section>
 </main>
 return <main className={`stax-lab${blueprint?' is-blueprint':''}`}>
  <header className="stax-header">
   <div className="stax-identity"><button className="stax-back" onClick={onExit} aria-label="Back to The Lab">←</button><div className="stax-mark" aria-hidden="true">△<span>○</span></div><div><h1>STAX <span>Shape Lab</span></h1><p>Visual grammar · Study 01</p></div></div>
   <div className="stax-header-actions"><button className="stax-text-button" onClick={()=>setRulesOpen(!rulesOpen)} aria-expanded={rulesOpen}>The rules <span aria-hidden="true">↗</span></button><button className="stax-export" onClick={exportSvg}>Export SVG <span aria-hidden="true">↓</span></button></div>
  </header>
  <div className="stax-workspace">
   <aside className="stax-palette" aria-label="Symbol palette">
    <div className="stax-section-label">01 / SYMBOLS</div><h2>Seven shapes.<br/>One system.</h2><p className="stax-palette-hint">Drag a shape onto the canvas, or tap to add. Drop a triangle to either side of a circle.</p>
    <div className="stax-symbol-list">{KINDS.map(kind=><button key={kind} className="stax-symbol-option" aria-label={`Add ${SYMBOLS[kind].label}`} disabled={mode!=='compose'||count>=MAX_SYMBOLS}
     onPointerDown={e=>startGesture(kind,e)} onPointerMove={moveGesture} onPointerUp={finishGesture} onPointerCancel={cancelGesture} onClick={()=>{if(suppressClickRef.current===kind){suppressClickRef.current=null;return}add(kind)}}>
     <SymbolIcon kind={kind}/><span><strong>{SYMBOLS[kind].label}</strong><small>{SYMBOLS[kind].role}</small></span><span className="stax-add" aria-hidden="true">+</span>
    </button>)}</div>
    <label className="stax-placement">Place new shapes<select aria-label="Placement rule" value={placement} onChange={e=>setPlacement(e.target.value as Placement)}><option value="auto">Automatically</option><option value="below">Below selection</option><option value="next">After selection</option></select></label>
    <button className="stax-new-row" onClick={()=>{changeMode('compose');setSelected(null);setNotice('Choose a symbol to begin a new row.')}}>+ Begin a new row</button>
    <div className="stax-palette-footer"><span className="stax-save-dot"/>{saveError?'Save unavailable · export your draft':'Composition saved on this device'}</div>
   </aside>
   <section className="stax-main" aria-label="Visual grammar workbench">
    <div className="stax-toolbar">
     <button className="stax-export" onClick={()=>setFreeBoard(true)}>Magnetic Molecules ↗</button>
     <nav className="stax-tabs" aria-label="Study view">{(['compose','symbols','construction'] as Mode[]).map(v=><button key={v} aria-pressed={mode===v} onClick={()=>changeMode(v)}>{v==='compose'?'Compose':v==='symbols'?'Symbol set':'Construction'}</button>)}</nav>
     <div className="stax-mode-switch" aria-label="Display mode"><button aria-pressed={!blueprint} onClick={()=>setBlueprint(false)}>Clean</button><button aria-pressed={blueprint} onClick={()=>setBlueprint(true)}>Blueprint</button></div>
    </div>
    <div className="stax-examplebar"><div><span className="stax-section-label">{mode==='compose'?'02 / COMPOSITION':mode==='symbols'?'02 / SYMBOL SET':'02 / SHARED GEOMETRY'}</span><p>{mode==='compose'?'Build a blue circle → red triangle → blue circle. Drag to choose a position.':mode==='symbols'?'One proportion for every symbol.':'A shared centre. A common baseline.'}</p></div>
     {mode==='compose'&&<label className="stax-example-picker">Start from<select aria-label="Load an example" value="" onChange={e=>{if(e.target.value)chooseExample(e.target.value)}}><option value="" disabled>Choose an example</option><option value="simple">Simple spine</option><option value="supported">With supporting shapes</option><option value="expanded">Expanded group</option><option value="joined">Joined groups</option><option value="omission">With omissions</option><option value="blank">Empty canvas</option></select></label>}
    </div>
    <div className="stax-board" data-testid="stax-board">
     <div className="stax-board-caption"><span>{blueprint?'SPACING & PROPORTION':'SHAPES ONLY'}</span><span>{mode==='compose'?String(count).padStart(2,'0')+' SYMBOLS':'V1.0'}</span></div>
     <div className="stax-viewport"><SymbolCanvas scene={scene} blueprint={blueprint} selected={selected} onSelect={setSelected} onDropSymbol={add} svgRef={svgRef} construction={mode==='construction'} zoom={zoom}/></div>
     {mode==='compose'&&<div className="stax-mobile-dock" aria-label="Drag shapes onto the canvas">{KINDS.map(kind=><button key={kind} className="stax-dock-symbol" aria-label={`Drag ${SYMBOLS[kind].label}`} disabled={count>=MAX_SYMBOLS}
       onPointerDown={e=>startGesture(kind,e)} onPointerMove={moveGesture} onPointerUp={finishGesture} onPointerCancel={cancelGesture} onClick={()=>{if(suppressClickRef.current===kind){suppressClickRef.current=null;return}add(kind)}}>
       <SymbolIcon kind={kind}/></button>)}</div>}
     {!scene.nodes.length&&<div className="stax-empty"><span aria-hidden="true">○ △ ◇</span><h3>Begin with a shape</h3><p>Choose one from the palette.</p></div>}
     <div className="stax-board-bottom"><span>{blueprint?'Measurements use relative units.':'Select any shape to inspect it.'}</span><div className="stax-zoom"><button aria-label="Zoom out" disabled={zoom<=.5} onClick={()=>setZoom(z=>Math.max(.5,z-.25))}>−</button><button aria-label="Fit composition" onClick={()=>setZoom(1)}>{Math.round(zoom*100)}%</button><button aria-label="Zoom in" disabled={zoom>=3} onClick={()=>setZoom(z=>Math.min(3,z+.25))}>+</button></div></div>
    </div>
    <div className="stax-inspector">
     {active?<><div className="stax-inspector-symbol"><SymbolIcon kind={active.kind}/><div><strong>{SYMBOLS[active.kind].label}</strong><small>{active.w.toFixed(2)} × {active.h.toFixed(2)} units</small></div></div>
      {mode==='compose'&&<><label className="stax-omit"><input type="checkbox" checked={active.omitted} onChange={e=>commit(setOmitted(doc,active.id,e.target.checked))}/>Omitted <span>Keep its place</span></label><button className="stax-delete" onClick={()=>{commit(removeSymbol(doc,active.id));setSelected(null)}}>Remove</button></>}
      {mode!=='compose'&&<p>{SYMBOLS[active.kind].role}</p>}
     </>:<p className="stax-selection-hint">{mode==='compose'?'Select a symbol to attach shapes or mark an omission.':'Select a symbol to inspect its dimensions in Blueprint.'}</p>}
     <div className="stax-history"><button onClick={undo} disabled={!history.past.length} aria-label="Undo">↶</button><button onClick={redo} disabled={!history.future.length} aria-label="Redo">↷</button></div>
    </div>
    <div className="stax-footnote"><span>One shape size · predictable spacing · visible relationships</span><span>Working standard v1</span></div>
    <div className="stax-status" role="status" aria-live="polite">{notice}</div>
   </section>
  </div>
  {dragPreview&&<div className="stax-drag-ghost" aria-hidden="true" style={{left:dragPreview.x,top:dragPreview.y,background:'transparent',border:'none',boxShadow:'none',padding:0}}><SymbolIcon kind={dragPreview.kind}/></div>}
  {rulesOpen&&<div className="stax-rules-shade" onClick={()=>setRulesOpen(false)}><section className="stax-rules" role="dialog" aria-modal="true" aria-label="Visual grammar rules" onClick={e=>e.stopPropagation()}>
   <button className="stax-rules-close" onClick={()=>setRulesOpen(false)} aria-label="Close rules">×</button><div className="stax-section-label">STAX / WORKING STANDARD V1</div><h2>The same rules,<br/>every time.</h2><p>One chosen system for this experiment. The original slides are inspiration; these values govern the canvas.</p>
   <dl>{[[RULES.attachment,'Attachments','Within a supporting row, and below a parent.'],[RULES.group,'Main groups','Between the bounds of neighbouring groups.'],[RULES.connector,'Connectors','On either side of a diamond.'],[RULES.row,'Independent rows','Between the full bounds of separate rows.']].map(([value,label,detail])=><div key={label}><dt>{Number(value).toFixed(2)}</dt><dd><strong>{label}</strong><span>{detail}</span></dd></div>)}</dl>
   <p>Circle, triangle, and diamond share a height of 3.50. All sizes and gaps use a 0.07 unit grid. Zoom changes the whole drawing together.</p><p>A circle followed by a triangle steps down by 0.28. A triangle followed by another main symbol steps down by 0.49. One purple determiner aligns its right edge to the noun centreline; two or more supporters centre as a group; larger groups reserve enough room to avoid overlap.</p><p>Dashed outlines mean omission. Omitted symbols retain their full space. For the first circle and triangle, dropping left or right proposes the object-side or subject-side geometry. Other automatic placements are geometric proposals, not sentence correctness checks.</p>
   <button className="stax-export" onClick={()=>download(JSON.stringify({standard:'stax-visual-v1',rules:RULES,symbols:SYMBOLS,draft:doc},null,2),'application/json','stax-visual-v1.json')}>Export rules & composition ↓</button>
  </section></div>}
 </main>
}