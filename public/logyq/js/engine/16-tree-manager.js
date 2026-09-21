/* ======================= TREE MANAGER ======================= */
const treeManager = {
  initialize(){
    const { state, elements, config: CONFIG, utils } = logyq
    elements.gRoot = elements.svg.append("g");
    elements.gLinks= elements.gRoot.append("g").attr("class","links");
    elements.gNodes= elements.gRoot.append("g").attr("class","nodes");
    elements.gOverlay=elements.gRoot.append("g").attr("class","overlay");
    elements.gDetectors = elements.gOverlay.append('g').attr('class','detector-layer');
    elements.dragMiniG= elements.gOverlay.append("g").attr("class","drag-mini").style("opacity",0);
    elements.dragMiniRect=elements.dragMiniG.append("rect").attr("width",CONFIG.CARD_WIDTH).attr("height",CONFIG.CARD_HEIGHT).attr("rx",10).attr("ry",10).node();
    elements.dragMiniTitle=elements.dragMiniG.append("text").attr("class","title");
    elements.caretDot=elements.gOverlay.append("circle").attr("class","caret-dot").attr("r", CONFIG.CARET_DOT_RADIUS);


// Ensure the flag exists
if (typeof state.isPanning === "undefined") state.isPanning = false;

state.zoom = d3.zoom()
  .scaleExtent([0.4, 2.4])
  .filter((event) => {
    // Allow wheel-zoom anywhere; block drags that start on nodes
    if (event.type === "wheel") return true;
    const t = event.target;
    const onNode = !!(t && t.closest && t.closest("g.node"));
    return !onNode;
  })

  // Mark panning only for drag gestures (mouse/touch), not wheel or programmatic zooms
  .on("start", (event) => {
    const t = event?.sourceEvent?.type;
    if (t === "mousedown" || t === "mousemove" ||
        t === "pointerdown" || t === "pointermove" ||
        t === "touchstart"  || t === "touchmove") {
      state.isPanning = true;
    }
  })

  .on("zoom", (e) => {
    elements.gRoot.attr("transform", e.transform);
    if (state.editingUid) logyq.editing.updateNodeEditorPosition();
    logyq.layout.refreshLaneOnZoom();
    logyq.detectors.draw();

    // Run moat check after paint, but not while panning
    setTimeout(() => {
      if (!state.isPanning) logyq.camera.checkMoatAndAutoFit('zoom');
    }, 0);
  })

  .on("end", () => {
    state.isPanning = false;
  });

elements.svg.call(state.zoom);

// --- Smooth wheel zoom override ---
elements.svg.on("wheel.zoom", null); // disable default instant wheel
elements.svg.on("wheel.smooth", function (event) {
  event.preventDefault();
  const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;  // zoom step
  const p = d3.pointer(event);                       // zoom to cursor
  d3.select(this)
    .transition()
    .duration(140)
    .ease(d3.easeCubicOut)
    .call(state.zoom.scaleBy, factor, p);
}, { passive: false });



// ========== [NEW] Z / Shift+Z keyboard zoom (one wheel notch) ==========
(() => {
  // Adjust this if you want a bigger/smaller step.
  const ZOOM_STEP = 1.20;

  function zoomByStep(direction){
    // direction: +1 = in, -1 = out
    const svgEl = elements.svg.node();
    if (!svgEl || !state.zoom) return;

    // Zoom around the viewport center so it’s stable & predictable
    const center = [svgEl.clientWidth / 2, svgEl.clientHeight / 2];
    const factor = direction > 0 ? ZOOM_STEP : 1 / ZOOM_STEP;

    // No easing here—same behavior as wheel/pinch so it won’t jitter
    elements.svg.call(state.zoom.scaleBy, factor, center);
  }


window.addEventListener('keydown', (e) => {
    // Don’t hijack Undo/Redo or when typing in inputs
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (logyq.input.isTextField(e.target)) return;

    // Z = zoom in, Shift+Z = zoom out
    if (e.key === 'z' || e.key === 'Z') {
      e.preventDefault();
      zoomByStep(e.shiftKey ? -1 : +1);
    }
  }, { passive: false });

})();




   elements.svg.on("dblclick.zoom", null);

// [NEW] Silence node double-click-to-edit across the SVG
(() => {
  const svgEl = elements.svg.node();
  if (!svgEl) return;
  const mute = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation?.();
  };
  // Use capture so we stop it BEFORE any node dblclick handler runs
  svgEl.addEventListener('dblclick', mute, true);
})();





    elements.svg.on("click", e=>{ if(e.target===elements.svg.node()){ logyq.selection.clearSelection(); logyq.wordDock.clearChipSelection(); } });

    state.layout=d3.tree();
    const data=logyq.data.generateTree(30);
    state.root=d3.hierarchy(data);
    logyq.utils.assignIds(state.root);

    this.layoutAndRender(false);
    this.autoFit();

    elements.fitBtn.addEventListener('click', ()=> this.autoFit());
    elements.undoBtn.addEventListener('click', logyq.history.undo);

    /* ========== Mix / Save / Maps ========== */
// Fire Mix on press instead of click
elements.mixBtn && elements.mixBtn.addEventListener('pointerdown', (e) => {
  // Left mouse press (or any touch/pen) triggers; ignore right/middle mouse
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  logyq.mix.randomizeTree(!!e.shiftKey);   // Shift = include WordBank
  e.preventDefault();            // avoid follow-up click / selection jitter
}, { passive: false });

elements.mixBtn && elements.mixBtn.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  // Right-click forces include WordBank
  logyq.mix.randomizeTree(true);
});

// Keep keyboard accessibility (Enter/Space on the focused button)
elements.mixBtn && elements.mixBtn.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    logyq.mix.randomizeTree(!!e.shiftKey);
  }
});

    setupSettings();
    /* [patch] help-init start */
    setupHelp();
    /* [/patch] help-init end */

    // Other global keys. Look up at event time: initialize() runs
    // before attach('keyboard') in 17-keyboard.js.
    document.addEventListener('keydown', (e) => {
      logyq.keyboard?.keyDispatcher?.(e);
    }, true);



    

    logyq.wordDock.render();
    /* [patch] dock-bounds-init start */
    try{ logyq.dock.updateDockBounds(); }catch(_e){}
    /* [/patch] dock-bounds-init end */
    elements.undoBtn.disabled = state.history.length===0;
  },

  renderEmpty(){
    const { state, elements } = logyq
    elements.gLinks.selectAll("path.link").remove();
    elements.gNodes.selectAll("g.node").remove();
    state.lastNodes = [];
    state.detectors=[];
    logyq.detectors.draw();
  },

  layoutAndRender(isDelete=false){
    const { state, config: CONFIG } = logyq
    if (!state.root) { this.renderEmpty(); return; }
    state.layout.nodeSize([CONFIG.CARD_WIDTH+CONFIG.HORIZONTAL_GAP, CONFIG.CARD_HEIGHT+CONFIG.VERTICAL_GAP]).separation((a,b)=>{
      let A=a,B=b; while(A.depth>B.depth)A=A.parent; while(B.depth>A.depth)B=B.parent; while(A!==B){A=A.parent;B=B.parent;}
      const l=A.depth, up=Math.max(1,a.depth-l);
      const base=(up===1)?0.9:0.75, inc=(up>1)?0.35*(up-1):0;
      const bonus=0.2*Math.max(0,(a.children?.length??0)-1)+0.2*Math.max(0,(b.children?.length??0)-1);
      return Math.max(0.1, base+inc+bonus);
    });
    state.layout(state.root);
    this.render(isDelete);
    if (state.repositionMode === "mix") { /* [patch] mix-reposition-run */
      (function(){
        /* wait for render transitions to finish, then fit using final bbox */
        const done = ()=>{ if(state.repositionMode==="mix"){ state.repositionMode=null; logyq.treeManager.autoFit(); } };
        try{ clearTimeout(window.__mixFitT); }catch(_e){}
        try{ window.__mixFitT = setTimeout(done, 190); }catch(_e){ setTimeout(done, 190); }
      })();
    }

    state.detectors = logyq.detectors.build(state.root);
    logyq.detectors.draw();
  },

  render(isDelete=false){
    const { state, elements, config: CONFIG } = logyq
    const nodes=state.root.descendants();
    const links=state.root.links();

    const selLinks=elements.gLinks.selectAll("path.link").data(links, d=>d.target.data._uid);
    selLinks.enter().append("path").attr("class","link").style("stroke-width", 2.8).style("opacity", 0.5)
      .attr("d", d=> logyq.visual.vLink({source:d.source, target:d.source}))
      .transition().duration(260).attr("d", d=> logyq.visual.vLink(d));
    selLinks.transition().duration(260).style("stroke-width", 2.8).style("opacity", 0.5).attr("d", d=> logyq.visual.vLink(d));
    selLinks.exit().transition().duration(isDelete?50:180).style("opacity",0).remove();




const selNodes = elements.gNodes.selectAll("g.node").data(nodes, d => d.data._uid);

// prepare drag (left-only per logyq.drag.behavior().filter)
const nodeDrag = logyq.drag.behavior();

// —— UPDATE selection (existing nodes): bind/refresh all handlers ——
selNodes
  .on("contextmenu", logyq.mix.onNodeContextMenu)  // right-click menu on existing nodes
  .on("mousedown",  logyq.selection.onNodeMouseDown)     // left-click selection on existing nodes
  .call(nodeDrag);                       // drag on existing nodes

// —— ENTER selection (new nodes): same bindings ——
const nEnter = selNodes.enter()
  .append("g").attr("class","node")
  .attr("transform", d => `translate(${d.x},${d.y})`)
  .style("opacity", 1)
  .on("contextmenu", logyq.mix.onNodeContextMenu)  // right-click menu on new nodes
  .on("mousedown",  logyq.selection.onNodeMouseDown)     // left-click selection on new nodes
  .call(nodeDrag);                       // drag on new nodes







    /* [patch] grabzone-behind start */
    nEnter.insert("rect",":first-child")
      .attr("class","grabzone")
      .attr("x",-CONFIG.CARD_WIDTH/2)
      .attr("y",-CONFIG.CARD_HEIGHT*0.5)
      .attr("width",CONFIG.CARD_WIDTH)
      .attr("height",CONFIG.CARD_HEIGHT*1.5)
      .style("fill","transparent")
      .style("cursor","grab").style("pointer-events","all");
    /* [patch] grabzone-behind end */
    nEnter.append("rect").attr("x", -CONFIG.CARD_WIDTH/2).attr("y", -CONFIG.CARD_HEIGHT/2).attr("width", CONFIG.CARD_WIDTH).attr("height", CONFIG.CARD_HEIGHT);
    nEnter.append("text").attr("class","label").attr("x",0).attr("y",0).style("font-size", `${CONFIG.FONT_SIZE}px`).text(d=>d.data.name);

    selNodes.transition().duration(260).attr("transform", d=>`translate(${d.x},${d.y})`);
    selNodes.select("text.label").text(d=>d.data.name).style("font-size", `${CONFIG.FONT_SIZE}px`);
    selNodes.exit().transition().duration(isDelete?50:180).style("opacity",0).remove();

    state.lastNodes=state.root.descendants();
    logyq.layout.LabelWrap.apply();
  },


centerOnSelected(opts = {}) {
  logyq.camera.centerOnSelected(opts)
},


  autoFit(pad=24){
    const { state, elements } = logyq
    const nb=elements.gNodes.node()?.getBBox();
    const lb=elements.gLinks.node()?.getBBox();
    const merge=(a,b)=>{ if(!a||!a.width||!a.height) return b; if(!b||!b.width||!b.height) return a;
      const x=Math.min(a.x,b.x), y=Math.min(a.y,b.y);
      const r=Math.max(a.x+a.width,b.x+b.width), bt=Math.max(a.y+a.height,b.y+b.height);
      return {x, y, width:r-x, height:bt-y};
    };
    const b=merge(nb,lb);
    const fullW=elements.svg.node().clientWidth, fullH=elements.svg.node().clientHeight;
    if(!b||!b.width||!b.height) return;
    const scale=Math.min(1, (fullW-pad)/b.width, (fullH-pad)/b.height);
    if(!isFinite(scale) || scale<=0) return;
    const tx=(fullW/2)-scale*(b.x+b.width/2), ty=(fullH/2)-scale*(b.y+b.height/2);
  const el = elements.svg.node();
const t0 = d3.zoomTransform(el);
const dx = tx - t0.x, dy = ty - t0.y, dk = Math.abs(scale - t0.k);
const dist = Math.hypot(dx, dy) + dk * 600;
const ms = Math.max(320, Math.min(1200, dist * 0.5));
elements.svg.interrupt()
  .transition()
  .duration(ms) // loading speed
  .ease(d3.easeCubicInOut)
  .call(state.zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
 }
};
attach('treeManager', treeManager)




  /* ======================= SETTINGS ======================= */
  function setupSettings(){
    const { state, elements, config: CONFIG } = logyq
    const s = elements.settings;
    function open(){ s.backdrop && s.backdrop.classList.add('show'); }
    function close(){ s.backdrop && s.backdrop.classList.remove('show'); }
    s.btn && s.btn.addEventListener('click', open);


    s.backdrop && s.backdrop.addEventListener('click', (e)=>{ if(e.target===s.backdrop) close(); });
    document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') close(); });

    if(s.vGap){
      const seed = Number(CONFIG.VERTICAL_GAP)||78;
      s.vGap.value = seed;
      if(s.vGapVal) s.vGapVal.textContent = seed+'px';
      s.vGap.addEventListener('input', (e)=>{
        const v = Math.max(20, Math.min(300, parseInt(e.target.value,10)||seed));
        CONFIG.VERTICAL_GAP = v;
        if(s.vGapVal) s.vGapVal.textContent = v+'px';
        if(s.vGapValHidden) s.vGapValHidden.textContent = v+'px';
        logyq.treeManager.layoutAndRender(false);
      });
    }

    const STEP = 6;
    const defaultGap = Number(CONFIG.VERTICAL_GAP) || 78;
    function clamp(v){ return Math.max(20, Math.min(300, v)); }
    function renderVal(){ const el=document.getElementById("verticalGapVal"); if(el) el.textContent=(Number(CONFIG.VERTICAL_GAP)||0)+"px"; }
    function adjust(delta){ CONFIG.VERTICAL_GAP = clamp((Number(CONFIG.VERTICAL_GAP)||defaultGap)+delta); renderVal(); logyq.treeManager.layoutAndRender(false); }

    s.gapUp && s.gapUp.addEventListener("click", ()=>adjust(-STEP));
    s.gapDown && s.gapDown.addEventListener("click", ()=>adjust(+STEP));
    s.gapReset && s.gapReset.addEventListener("click", ()=>{ CONFIG.VERTICAL_GAP=defaultGap; renderVal(); logyq.treeManager.layoutAndRender(false); });
    renderVal();

    if(s.showCarets){
      s.showCarets.checked = !!CONFIG.SHOW_CARETS;
      s.showCarets.addEventListener("change", (e)=>{
        CONFIG.SHOW_CARETS = !!e.target.checked;
        if(!CONFIG.SHOW_CARETS && elements.caretDot){ elements.caretDot.style("opacity",0); }
      });
    }
    if(s.showDetectors){
      if(s.detDepth){
        const seed = Number(CONFIG.DETECTOR_DEPTH_FACTOR)||1.2;
        s.detDepth.value = String(seed);
        if(s.detDepthVal) s.detDepthVal.textContent = seed.toFixed(1)+"×";
        s.detDepth.addEventListener("input", (e)=>{
          let v = parseFloat(e.target.value); if(!isFinite(v)) v = 1.2; if(v < 1) v = 1;
          CONFIG.DETECTOR_DEPTH_FACTOR = v;
          if(s.detDepthVal) s.detDepthVal.textContent = v.toFixed(1)+"×";
          logyq.treeManager.layoutAndRender(false);
        });
      }
      s.showDetectors.checked = !!CONFIG.SHOW_DETECTORS;
      s.showDetectors.addEventListener('change', (e)=>{
        CONFIG.SHOW_DETECTORS = !!e.target.checked;
        logyq.detectors.draw();
      });
    }

    // >>> NEW: PNG Export button
    if (s.exportPngBtn){
      s.exportPngBtn.addEventListener('click', ()=> {
        elements.settings.exportBackdrop && elements.settings.exportBackdrop.classList.add("show");
/* [patch] export-btn-handlers start */      if (!window.__exportUIInit) {        window.__exportUIInit = true;        const s = elements.settings;        const close = ()=>{ s.exportBackdrop && s.exportBackdrop.classList.remove('show'); };        s.exportClose && s.exportClose.addEventListener('click', close);        s.exportBackdrop && s.exportBackdrop.addEventListener('click', (e)=>{ if(e.target===s.exportBackdrop) close(); });        const readOpts = ()=>({          pad: parseInt(s.exportPadding?.value||'24',10)||24,          minLabelPx: parseInt(s.exportMinLabel?.value||'0',10)||0,          withBackground: !!(s.exportBackground && s.exportBackground.checked),          addTitle: !!(s.exportAddTitle && s.exportAddTitle.checked),          titleText: (s.exportTitleText?.value||'LOGiC').trim() || 'LOGiC'        });        s.doExportPng && s.doExportPng.addEventListener('click', ()=>{          const o = readOpts();          if (s.exportModeView && s.exportModeView.checked) {            logyq.export.exportCurrentView({ scale: 2, withBackground: o.withBackground });          } else {            logyq.export.exportFullPNG({ pad: o.pad, withBackground: o.withBackground, minLabelPx: o.minLabelPx, addTitle: o.addTitle, titleText: o.titleText });          }          close();        });        s.doExportSvg && s.doExportSvg.addEventListener('click', ()=>{          const o = readOpts();          logyq.export.exportSVG({ pad: o.pad, addTitle: o.addTitle, titleText: o.titleText });          close();        });      }      /* [patch] export-btn-handlers end */
      });
    }
  }

  /* [patch] help-setup start */
  function setupHelp(){
    const hb=document.getElementById("helpBackdrop");
    const btn=document.getElementById("helpBtn");
    const close=hb?hb.querySelector(".settings-close"):null;
    if(!hb||!btn) return; /* [patch] help-no-x-guard */
    btn.addEventListener("click",()=>hb.classList.add("show"));
    /* [patch] help-no-x-rmclose */
    /* [patch] help-esc start */
    document.addEventListener("keydown",(e)=>{if(e.key==="Escape")hb.classList.remove("show");},true);
    /* [/patch] help-esc end */
    hb.addEventListener("click",(e)=>{if(e.target===hb)hb.classList.remove("show");});
  }
  /* [/patch] help-setup end */


/* [patch] esc-clears-selection start */
document.addEventListener('keydown', function(e){
  const { state, elements } = logyq
  if (e.key !== 'Escape') return;

  // If you’re editing a node name, let that Esc be handled by the editor.
  if (state.editingUid) return;

  // If any modal/popup is open, let that Esc close the modal instead.
  const modalsOpen =
    (elements.settings?.backdrop?.classList?.contains('show')) ||
    (elements.settings?.exportBackdrop?.classList?.contains('show')) ||
    (document.getElementById('helpBackdrop')?.classList?.contains('show'));
  if (modalsOpen) return;

  // Otherwise: clear the node selection set.
  logyq.selection.clearSelection();
}, true);
/* [patch] esc-clears-selection end */



// --- Clean Tab behavior: press to exit typing + hold to navigate ---
function tabDown(e){
  const { state, elements } = logyq
  if (e.key !== 'Tab') return;
  // If any modal is open, keep native tabbing unless we're in the node editor
  const modalOpen =
    (elements.settings.backdrop?.classList.contains('show')) ||
    (elements.settings.exportBackdrop?.classList.contains('show')) ||
    (document.getElementById('helpBackdrop')?.classList.contains('show'));

  // If the inline node editor is open, commit and close on Tab
  if (state.editingUid && state.editorEl){
    e.preventDefault();
    e.stopPropagation();
    // Commit (true) and restore zoom (true)
    logyq.editing.closeNodeEditor(true, true);
    state.tabHold = true;   // immediately enable navigation mode
    return;
  }

  // If typing in the bottom Word input, blur so arrows/J/K/L can move selection
  if (document.activeElement === elements.wordInput){
    e.preventDefault();
    elements.wordInput.blur();
    state.tabHold = true;
    return;
  }

  // If a modal is open (settings/export/help) we let Tab do normal focus traversal
  if (modalOpen){
    state.tabHold = false;
    return;
  }

  // Canvas/global: use Tab as a “navigation modifier”
  e.preventDefault();
  state.tabHold = true;
}

function tabUp(e){
  const { state } = logyq
  if (e.key !== 'Tab') return;
  state.tabHold = false;
}

window.addEventListener('keydown', tabDown, true);
window.addEventListener('keyup', tabUp, true);
