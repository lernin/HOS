  /* ======================= EDITOR ======================= */
 function updateNodeEditorPosition(){
  const { state, elements, config: CONFIG } = logyq
  if(!state.editingUid || !state.editorEl || !elements.gRoot) return;
  try{
    const h = state.root?.descendants().find(n => n.data?._uid === state.editingUid);
    if(!h) return;

    const m = elements.gRoot.node().getScreenCTM();
    if(!m) return;
    const k = m.a || 1;

    // Screen-space top-left of the node's FILL box
    const tl = new DOMPoint(
      h.x - CONFIG.CARD_WIDTH/2,
      h.y - CONFIG.CARD_HEIGHT/2
    ).matrixTransform(m);

    // SVG selected look: 2px stroke that scales and is centered on the edge
    const svgStrokePx = 2 * k;
    const half = svgStrokePx / 2;

    const el = state.editorEl;
    const cs = getComputedStyle(el);
    const isBorderBox = (cs.boxSizing === 'border-box');

    // We want the editor’s OUTER box to equal: fill-box + centered stroke
    // => targetOuter = CARD*k + (2px*k)  (half on each side)
    const targetOuterW = CONFIG.CARD_WIDTH  * k + svgStrokePx;
    const targetOuterH = CONFIG.CARD_HEIGHT * k + svgStrokePx;

    // Position so the centered ring sits on the rect edge
    el.style.left = (tl.x - half) + 'px';
    el.style.top  = (tl.y - half) + 'px';

    // Scale the ring and radius like the SVG
    el.style.borderStyle  = 'solid';
    el.style.borderWidth  = svgStrokePx + 'px';
    el.style.borderRadius = (10 * k) + 'px';
    el.style.fontSize     = (CONFIG.FONT_SIZE * k) + 'px';

    // Width/height depend on box-sizing:
    //  - border-box: width/height ARE outer size
    //  - content-box: width/height are inner, so subtract borders
    if (isBorderBox){
      el.style.width  = targetOuterW + 'px';
      el.style.height = targetOuterH + 'px';
    } else {
      el.style.width  = (targetOuterW - 2*svgStrokePx) + 'px';
      el.style.height = (targetOuterH - 2*svgStrokePx) + 'px';
    }
  }catch(_e){}
}

 
 
 
 
 
 
 
 
  function closeNodeEditor(apply, restoreZoom){
    const { state, elements, utils } = logyq
    if(!state.editingUid) return;
    const uid = state.editingUid; const el = state.editorEl;
    state.editingUid = null; state.editorEl = null;
    if(el && el.parentNode) el.parentNode.removeChild(el);
    if(apply){
      const target = utils.findByUid(state.root.data, uid);
      if(target){
        const prev = target.name || "";
        let next = (el && typeof el.value==="string" ? el.value.trim() : prev) || prev;
        if(next !== prev){
          logyq.history.pushHistory({ type:"rename", uid, prev, next });
          target.name = next;
          state.root = d3.hierarchy(state.root.data);
          utils.assignIds(state.root);
          logyq.treeManager.layoutAndRender(false);
          setSelected(uid);
        }
      }
    }
    if(restoreZoom && state.prevZoom){
      const t = state.prevZoom;
      elements.svg.transition().duration(360).call(state.zoom.transform, t);
      state.prevZoom = null;
      setTimeout(updateNodeEditorPosition, 20);
    }
  }



  function openNodeEditor(d){
    const { state, elements } = logyq
    try{ closeNodeEditor(false,false); }catch(_e){}
    if(!d) return;
    state.editingUid = d.data._uid;
    state.prevZoom = d3.zoomTransform(elements.svg.node());
    const input = document.createElement("input");
    input.type = "text"; input.className = "node-edit-input";
    input.value = (d.data && d.data.name) ? d.data.name : "";
    document.body.appendChild(input);
    state.editorEl = input;


    input.addEventListener("keydown", function(e){
  if (e.key === "Enter"){
    e.preventDefault();
    const curUid = state.editingUid;
    const withShift = e.shiftKey;

    // Save current edit and recentre (your existing behavior)
    closeNodeEditor(true, true);

    // NEW: Shift+Enter => add a sibling to the right and start editing it
    if (withShift && curUid){
      addSiblingRightOf(curUid, '');
    }
  } else if (e.key === "Escape"){
    e.preventDefault();
    closeNodeEditor(false, false);
  }
});






    input.addEventListener("blur", function(){ closeNodeEditor(true, false); });
    updateNodeEditorPosition();
    setTimeout(function(){ try{ input.focus(); var L=input.value.length; input.setSelectionRange(L,L); }catch(_e){} }, 0);
  }

// --- Auto-fit + sticky-multiselect when nav keys move focus ---
window.addEventListener('keydown', (e) => { //red
  const { state } = logyq
  // Ignore if not a nav key, or if user is typing in a field, or using modifiers
  if (!logyq.input.keyIsNav(e)) return;
if (state.vHold) return; 
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (logyq.input.isTextField(e.target)) return;





  
  // If sticky multi-select is on, freeze current set before nav runs
  const frozen = (state.kbdStickySelect && state.selectedUids)
    ? new Set(state.selectedUids)
    : null;

  // Hide cursor while navigating with keys
  document.body.classList.add('global-hide-cursor');

  // Defer so your existing selection-move handler runs first,
  // then we restore sticky set and do mote check.
  setTimeout(() => {
    try {
      // --- restore sticky set after your nav code has moved focus ---
      if (frozen) {
        const focused = logyq.selection.getSelectedUid();        // whatever your nav selected
        const merged = new Set(frozen);
        if (focused) merged.add(focused);       // ensure focus stays in set
        setSelectionSet(merged);
      }

      // --- mote behavior (unchanged) ---
      logyq.camera.checkMoatAndAutoFit('kbd');
    } catch(_e){}
  }, 0);
}, { passive: true });


  
  window.addEventListener("resize", updateNodeEditorPosition);
// Any real mouse movement restores the cursor
window.addEventListener('mousemove', () => {
  document.body.classList.remove('global-hide-cursor');
}, { passive: true });





window.addEventListener('keydown', (e) => { //purple
  const { state } = logyq
  if (e.key !== 'Escape') return;

  // If inline editor is open, let its own ESC logic run
  if (state.editingUid) return;

 

  // Otherwise: clear group AND focus (same as Shift+G)
  clearGroup();
  clearFocus();
  showToast('Group cleared', 900);




}, { passive: true });









  attach('editing', {
    updateNodeEditorPosition,
    closeNodeEditor,
    openNodeEditor,
  })



