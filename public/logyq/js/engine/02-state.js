/* ======================= STATE & ELEMENTS ======================= */
const state = {

  root:null, lastNodes:[], zoom:null, layout:null,
  dragState:{ trashZone:'far', drop:null, solo:false, groupAbandon:false },
  history:[], wordBank:[], selectedUid:null, /* [patch] multiselect-state */ selectedUids:new Set(),
  chipDrag:{ active:false, word:null, words:[], drop:null },
  editingUid:null, editorEl:null, prevZoom:null,
  detectors:[], tabHold:false, /* [patch] tab-hold-flag */
  repositionMode: null, /* [patch] mix-reposition-flag */
  _pendingSelectUndo: null, /* [patch] pending-select */
  _lastMoat: 0,   /* [patch] mote-cooldown timestamp */
  focusUid: null, /* [patch] focus state */
   dockSide: 'bottom',   /* 'bottom' | 'left' | 'hidden' */
  vHold: false, /* V-hold focus-only visuals */
 isPanning: false,
};






  // --- helper so global hotkeys don't swallow Enter in inputs ---
const isTextField = (el) =>
  !!el && (
    el.matches?.('input, textarea, [contenteditable="true"]') ||
    el.getAttribute?.('role') === 'textbox'
  );


  // Keys that move selection (arrows + J/K/L/I)
function keyIsNav(e){
  const k = e.key;
  if (!k) return false;
  const base = ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','j','k','l','i','J','K','L','I'];
  return base.includes(k);
}


  const elements = {
    svg: d3.select("#canvas"),
    trash: document.getElementById("trash"),
    undoBtn: document.getElementById("undoBtn"),
    fitBtn: document.getElementById("fitBtn"),
    mixBtn: document.getElementById("mixBtn"),
    /* [patch] saved-refs start */
    saveBtn: document.getElementById("saveBtn"),
    mapsBtn: document.getElementById("mapsBtn"),
    /* [patch] saved-refs end */


    wordInput: document.getElementById("wordInput"),
    addWordBtn: document.getElementById("addWordBtn"),
    Dock: document.getElementById("Dock"),
    Hint: document.getElementById("Hint"),
    Toast: document.getElementById("Toast"),
    userBadge: document.getElementById("userBadge"),
    settings: {
      backdrop: document.getElementById("settingsBackdrop"),
      close: document.getElementById("settingsClose"),
      btn: document.getElementById("settingsBtn"),
      vGap: document.getElementById("verticalGap"),
      vGapVal: document.getElementById("verticalGapVal"),
      vGapValHidden: document.getElementById("verticalGapValHidden"),
      gapUp: document.getElementById("gapUp"),
      gapDown: document.getElementById("gapDown"),
      gapReset: document.getElementById("gapReset"),
      showDetectors: document.getElementById("showDetectors"),
      detDepth: document.getElementById("detDepth"),
      detDepthVal: document.getElementById("detDepthVal"),
      /* >>> NEW: export button ref <<< */
      exportPngBtn: document.getElementById("exportPngBtn"),
/* [patch] export-btn-refs start */      exportBackdrop: document.getElementById("exportBackdrop"),      exportClose: document.getElementById("exportClose"),      doExportPng: document.getElementById("doExportPng"),      doExportSvg: document.getElementById("doExportSvg"),      exportModeFull: document.getElementById("exportModeFull"),      exportModeView: document.getElementById("exportModeView"),      exportPadding: document.getElementById("exportPadding"),      exportMinLabel: document.getElementById("exportMinLabel"),      exportBackground: document.getElementById("exportBackground"),      exportAddTitle: document.getElementById("exportAddTitle"),      exportTitleText: document.getElementById("exportTitleText"),      /* [patch] export-btn-refs end */
    },
    // created later:
    gRoot:null, gLinks:null, gNodes:null, gOverlay:null,
    gDetectors:null, // detector overlay layer
    dragMiniG:null, dragMiniRect:null, dragMiniTitle:null,
    caretDot:null
  };



// ---- ONE TRUE COMMIT ----
// mode rules we want:
// - Enter in #wordInput  -> Word Bank
// - Shift+Enter in #wordInput -> Children of selected node (only if exactly one selected), else Word Bank
// - Left-click Add -> Word Bank
// - Right-click Add -> Children of selected node (only if exactly one selected), else Word Bank
// - While editing an inline node: Enter confirms rename; Shift+Enter adds right-sibling (your editor handler already stops propagation)

function commitWordInput(domEvent, opts = {}){
  const el = elements.wordInput;
  if (!el) return;
  const raw = (el.value || '').trim();
  if (!raw) { showToast('Type something first'); return; }

  // If it looks like JSON/GIQ, keep your old importer behavior.
  // (If you want to force-bank instead, remove this early return.)
  const looksLikeJSON = raw.startsWith('{') || raw.startsWith('[') || raw.includes('\n###\n');
  if (looksLikeJSON){
    handleAddBox();       // uses your existing JSON/GIQ handler
    el.value = '';
    el.focus();
    return;
  }





const isShift = !!(domEvent && domEvent.shiftKey);
const forceToSelected = !!opts.forceToSelected;

// We only target the tree when:
//  - user asked to (Shift or right-click), AND
//  - there is NO group selection, AND
//  - there IS a focused node (state.selectedUid)
const groupEmpty = !(state.selectedUids && state.selectedUids.size > 0);
const focusedUid = state.selectedUid || null;
const toTree = (forceToSelected || isShift) && groupEmpty && !!focusedUid;

if (toTree) {
  const uid = focusedUid;
  // support comma-separated words just like bank does
  const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) {
    showToast('Type something first');
  } else {
    parts.forEach(p => addChildOf(uid, p, { noEdit: true }));

    const node = utils.findByUid(state.root?.data, uid);
    showToast(node ? `Added under "${node.name}"` : 'Added under selected');
  }
} else {
  // Split like the toTree branch so "a, b, c" makes three chips
  const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
  parts.forEach(p => addWords(p, 'bank'));
  showToast('Added to Word Dock');
}








  el.value = '';
  el.focus();
  const L = el.value.length;
  el.setSelectionRange?.(L, L);
}

// ---- ONE TRUE WIRING ----
elements.wordInput.addEventListener('keydown', (e) => {
  // Don’t steal typing except Enter/Escape
  if (e.key === 'Escape'){
    e.preventDefault();
    try { elements.wordInput.blur(); } catch(_e){}
    return;
  }
  if (e.key !== 'Enter') return;

  // Enter or Shift+Enter inside the input
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation?.();
  commitWordInput(e);
});

// Left-click Add -> bank
elements.addWordBtn.addEventListener('click', (e) => {
  e.preventDefault();
  // left click should not act like Shift; forceToSelected=false
  commitWordInput(e, { forceToSelected: false });
});

// Right-click Add -> selected (if exactly one), else bank
elements.addWordBtn.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  commitWordInput(e, { forceToSelected: true });
});




/* ---------- Add box handler: JSON / GIQ / comma-words ---------- */
function handleAddBox(){
  const el = elements.wordInput;
  if (!el) return;
  const raw = (el.value || '').trim();
  if (!raw) return;

  const parsed = parseIncoming(raw);

  if (parsed && parsed.tree){
    // 1) JSON/GIQ → make subtree under selected or root (rightmost)
    const target =
      (__selectedUid && __selectedUid()) ||       // selected node
      (state.root && state.root.data && state.root.data._uid) || // root
      null;

    // add subtree under target (or become new root if none)
    addSubtreeChildOf(target, parsed.tree);

    // (optional) merge word bank into Dock (front)
    if (Array.isArray(parsed.wordBank) && parsed.wordBank.length){
      parsed.wordBank.forEach(w => addWords && addWords(w, 'bank'));
    }

    showToast('Imported tree', 900);
  } else {
    // 2) Fallback: comma-separated words → add to the right, one by one
    const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length){
      const base = (__selectedUid && __selectedUid()) ||
                   (state.root && state.root.data && state.root.data._uid) ||
                   null;

      if (!state.root && parts.length){
        // If no map yet: first word becomes root; rest as its children
        const rootData = { name: parts[0] };
        utils.assignUids(rootData);
        state.root = d3.hierarchy(rootData); utils.assignIds(state.root);
        treeManager.layoutAndRender(false);
        setSelected(state.root.data._uid);
        parts.slice(1).forEach(p => addChildOf(state.root.data._uid, p, { noEdit: true }));
      } else if (base){
        // Append as rightmost children under base
        parts.forEach(p => addChildOf(base, p, { noEdit: true }));
      }
      showToast('Added words', 900);
    }
  }

  el.value = '';
}









// Clear selection when clicking empty canvas (no modifiers)
elements.svg.on('click.bgClear', (event) => {
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  if (event.button !== 0) return;

  // Ignore if the click hit a node (or its children)
  const t = event.target;
  if (t && t.closest && t.closest('g.node')) return;

  clearGroup();
  clearSelection();
});




/* [patch] dock-bounds-fn start */
function updateDockBounds(){
  try{
    var t = document.getElementById("trash");
    var r = t && t.getBoundingClientRect ? t.getBoundingClientRect() : null;
    var safe = 16;
    if (r){
      var safeCalc = Math.max(16, Math.ceil(window.innerWidth - r.left + 12));
      safe = safeCalc;
    }
    document.documentElement.style.setProperty("--dock-right-safe", safe + "px");
    document.documentElement.style.setProperty("--dock-right-pad", "8px");
  }catch(_e){}
}



window.addEventListener("resize", updateDockBounds, { passive: true });








  /* ======================= UTILS ======================= */



/* --- Dock side applier (bottom ↔ left ↔ hidden) --- */
function applyDockSide(){
  const el = elements.Dock;
  if (!el) return;
  el.classList.remove('dock-left','dock-hidden');
  if (state.dockSide === 'left')      el.classList.add('dock-left');
  else if (state.dockSide === 'hidden') el.classList.add('dock-hidden');
}

/* call once so the current state is applied on load */
applyDockSide();



