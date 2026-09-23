  /* ======================= EDITOR ======================= */
 function mobileQuietEdit(){
  try { return document.body.classList.contains('logyq-mobile-v162') } catch (_e) { return false }
 }

 // The phone field is a full-width bar on the keyboard. It never follows the card.
 // Keyboard inset is the covered height only. Subtracting the visual
 // viewport's scroll offset made the bar hop while the keyboard rose.
 // The bar stays hidden until that inset has been still, or until
 // PHONE_BAR_CAP_MS. It then slides up from under the keyboard.
 const PHONE_BAR_QUIET_MS = 80
 const PHONE_BAR_CAP_MS = 500
 const PHONE_BAR_SLIDE_MS = 600
 function keyboardInset(){
  const vv = window.visualViewport
  return vv ? Math.max(0, Math.round(window.innerHeight - vv.height)) : 0
 }
 function mobileLift(inset){
  return inset ? 'translate3d(0,' + (-inset) + 'px,0)' : 'translate3d(0,0,0)'
 }
 function applyMobileInset(stack, inset, slide){
  if (stack._logyqInset === inset && stack.classList.contains('is-placed') && stack.dataset.drawer === 'open') return
  stack._logyqInset = inset
  stack.style.bottom = '0px'
  if (slide && stack.dataset.drawer !== 'open') {
    stack.style.transition = 'none'
    stack.style.transform = 'translate3d(0,100%,0)'
    void stack.offsetWidth
    stack.dataset.drawerFrom = String(Math.round(stack.getBoundingClientRect().bottom))
    stack.style.transition = 'transform ' + PHONE_BAR_SLIDE_MS + 'ms cubic-bezier(0.22, 1, 0.36, 1)'
    stack.style.transform = mobileLift(inset)
    stack.dataset.drawer = 'open'
    delete stack.dataset.drawerSettled
    const settle = (event) => {
      if (event.propertyName !== 'transform') return
      stack.dataset.drawerSettled = '1'
      stack.removeEventListener('transitionend', settle)
    }
    stack.addEventListener('transitionend', settle)
    return
  }
  stack.style.transform = mobileLift(inset)
 }
 function dockMobileEditor(){
  const { state } = logyq
  const el = state.editorEl
  const stack = el?.closest?.('.node-edit-stack')
  if (!stack || !stack.classList.contains('is-placed')) return
  applyMobileInset(stack, keyboardInset())
 }

 function updateNodeEditorPosition(){
  const { state, elements, config: CONFIG } = logyq
  if (mobileQuietEdit()) {
    dockMobileEditor()
    return
  }
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
    const uid = state.editorEl?.dataset?.editUid || state.editingUid; const el = state.editorEl;
    if (state._editFocusTimer) { try { clearTimeout(state._editFocusTimer); } catch (_e) {} state._editFocusTimer = 0; }
    if (state._editPlaceTimer) { try { clearTimeout(state._editPlaceTimer); } catch (_e) {} state._editPlaceTimer = 0; }
    if (typeof state._editViewportOff === 'function') { try { state._editViewportOff(); } catch (_e) {} state._editViewportOff = null; }
    state.editingUid = null; state.editorEl = null;
    if(el && el.parentNode && !el.closest?.('.node-edit-stack')) el.parentNode.removeChild(el);
    if(apply){
      const target = utils.findByUid(state.root.data, uid);
      if(target){
        const prev = target.name ?? "";
        const next = (el && typeof el.value === "string") ? el.value.trim() : prev;
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
    if (!mobileQuietEdit()) {
      const svg = elements.svg?.node?.();
      if (svg) d3.select(svg).interrupt();
      const shouldRestore = state.prevZoom && (restoreZoom || state.editFocusArmed) && !state.editUserZoom;
      if(shouldRestore){
        const t = state.prevZoom;
        elements.svg.transition().duration(360).ease(d3.easeCubicOut).call(state.zoom.transform, t);
      }
    }
    const host = el?.closest?.('.node-edit-stack') || el?.closest?.('.node-edit-dock')
    if (host && host.parentNode) host.parentNode.removeChild(host)
    state.prevZoom = null;
    state.editZoom = null;
    state.editFocusArmed = false;
    state.editUserZoom = false;
  }



  function openNodeEditor(d){
    const { state, elements } = logyq
    try{ closeNodeEditor(false,false); }catch(_e){}
    const uid = d?.data?._uid;
    if(!d || uid == null || String(uid) === '') return;
    state.editingUid = uid;
    state.editZoom = null;
    state.editFocusArmed = false;
    state.editUserZoom = false;
    if (mobileQuietEdit()) {
      state.prevZoom = null;
    } else {
      const current = d3.zoomTransform(elements.svg.node());
      state.prevZoom = d3.zoomIdentity.translate(current.x, current.y).scale(current.k);
    }
    const input = document.createElement("input");
    input.type = "text"; input.className = "node-edit-input";
    input.enterKeyHint = "done";
    input.setAttribute("autocomplete", "off");
    input.setAttribute("autocorrect", "off");
    input.setAttribute("spellcheck", "false");
    input.value = (d.data && d.data.name) ? d.data.name : "";
    input.dataset.editUid = String(uid);
    if (mobileQuietEdit()) {
      const stack = document.createElement("div");
      stack.className = "node-edit-stack";
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "node-edit-cancel";
      cancel.setAttribute("aria-label", "Cancel rename");
      cancel.textContent = "\u00d7";
      const dock = document.createElement("div");
      dock.className = "node-edit-dock";
      dock.appendChild(input);
      stack.appendChild(cancel);
      stack.appendChild(dock);
      document.body.appendChild(stack);
      // preventDefault on touchstart keeps the field focused, but it also
      // swallows the click. Close on pointerup / touchend, and keep click
      // for a plain mouse activation.
      let cancelArmed = false;
      const armCancel = function(event){
        if (event.button != null && event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        cancelArmed = true;
      };
      const fireCancel = function(event){
        if (!cancelArmed) return;
        cancelArmed = false;
        event.preventDefault();
        event.stopPropagation();
        closeNodeEditor(false, true);
      };
      cancel.addEventListener("pointerdown", armCancel);
      cancel.addEventListener("mousedown", armCancel);
      cancel.addEventListener("touchstart", armCancel, { passive: false });
      cancel.addEventListener("pointerup", fireCancel);
      cancel.addEventListener("touchend", fireCancel, { passive: false });
      cancel.addEventListener("pointercancel", function(){ cancelArmed = false; });
      cancel.addEventListener("click", function(event){
        event.preventDefault();
        event.stopPropagation();
        closeNodeEditor(false, true);
      });
    } else {
      document.body.appendChild(input);
    }
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
    closeNodeEditor(false, true);
  }
});






    input.addEventListener("blur", function(){
      // A phone tap on the map must not save and close. Enter commits.
      // The X and Escape cancel. Desktop still commits on blur.
      if (mobileQuietEdit()) return;
      closeNodeEditor(true, true);
    });
    updateNodeEditorPosition();
    state._editFocusTimer = setTimeout(function(){
      try { input.focus({ preventScroll: true }); var L=input.value.length; input.setSelectionRange(L,L); } catch (_e) {}
    }, 0);
    if (mobileQuietEdit()) {
      const vv = window.visualViewport;
      let dockFrame = 0;
      let lastInset = keyboardInset();
      let lastChange = performance.now();
      const started = lastChange;
      const placeTick = () => {
        state._editPlaceTimer = 0;
        if (state.editingUid !== uid) return;
        const stack = input.closest?.('.node-edit-stack');
        if (!stack || stack.classList.contains('is-placed')) {
          dockMobileEditor();
          return;
        }
        const inset = keyboardInset();
        const now = performance.now();
        if (inset !== lastInset) {
          lastInset = inset;
          lastChange = now;
        }
        const quiet = now - lastChange >= PHONE_BAR_QUIET_MS;
        const capped = now - started >= PHONE_BAR_CAP_MS;
        // A zero inset is the gap under a rising keyboard, not a resting spot.
        if ((inset > 0 && quiet) || capped) {
          stack.classList.add('is-placed');
          applyMobileInset(stack, inset, true);
          return;
        }
        state._editPlaceTimer = setTimeout(placeTick, 40);
      };
      state._editPlaceTimer = setTimeout(placeTick, 40);
      const onViewport = () => {
        if (state.editingUid !== uid) return;
        if (dockFrame) return;
        dockFrame = requestAnimationFrame(() => {
          dockFrame = 0;
          if (state.editingUid !== uid) return;
          const stack = input.closest?.('.node-edit-stack');
          if (stack && !stack.classList.contains('is-placed')) {
            if (!state._editPlaceTimer) state._editPlaceTimer = setTimeout(placeTick, 0);
            return;
          }
          dockMobileEditor();
        });
      };
      const keepMapFocus = (event) => {
        if (state.editingUid !== uid) return;
        const stack = input.closest?.('.node-edit-stack');
        if (stack && stack.contains(event.target)) return;
        const canvas = document.getElementById('canvas');
        if (!canvas || (event.target !== canvas && !canvas.contains(event.target))) return;
        if (event.cancelable) event.preventDefault();
      };
      if (vv) {
        vv.addEventListener('resize', onViewport);
        vv.addEventListener('scroll', onViewport);
      }
      document.addEventListener('touchstart', keepMapFocus, { capture: true, passive: false });
      document.addEventListener('mousedown', keepMapFocus, { capture: true, passive: false });
      state._editViewportOff = () => {
        if (dockFrame) cancelAnimationFrame(dockFrame);
        dockFrame = 0;
        if (vv) {
          vv.removeEventListener('resize', onViewport);
          vv.removeEventListener('scroll', onViewport);
        }
        document.removeEventListener('touchstart', keepMapFocus, { capture: true });
        document.removeEventListener('mousedown', keepMapFocus, { capture: true });
      };
    }
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



