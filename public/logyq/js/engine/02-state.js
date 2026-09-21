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
  layoutSettling: false,
  layoutFlushQueued: false,
  layoutGeneration: 0,
  layoutOverlapCount: 0,
  layoutSettleTimer: 0,
  layoutAfterFlush: null,
  lastCreatedUid: null,
};
attach('state', state)






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
    wordInput: document.getElementById("wordInput"),
    addWordBtn: document.getElementById("addWordBtn"),
    Dock: document.getElementById("Dock"),
    Toast: document.getElementById("Toast"),
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
attach('elements', elements)



// ---- ONE TRUE COMMIT ----
// mode rules we want:
// - Enter in #wordInput  -> Word Bank
// - Shift+Enter in #wordInput -> Children of selected node (only if exactly one selected), else Word Bank
// - Left-click Add -> Word Bank
// - Right-click Add -> Children of selected node (only if exactly one selected), else Word Bank
// - While editing an inline node: Enter confirms rename; Shift+Enter adds right-sibling (your editor handler already stops propagation)

function commitWordInput(domEvent, opts = {}){
  const { state, elements } = logyq
  const el = elements.wordInput;
  if (!el) return;
  const raw = (el.value || '').trim();
  if (!raw) { logyq.selection.showToast('Type something first'); return; }

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
    logyq.selection.showToast('Type something first');
  } else {
    parts.forEach(p => logyq.treeOps.addChildOf(uid, p, { noEdit: true }));

    const node = logyq.utils.findByUid(state.root?.data, uid);
    logyq.selection.showToast(node ? `Added under "${node.name}"` : 'Added under selected');
  }
} else {
  // Split like the toTree branch so "a, b, c" makes three chips
  const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
  parts.forEach(p => logyq.wordDock.addWords(p, 'bank'));
  logyq.selection.showToast('Added to Word Dock');
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
  const { state, elements } = logyq
  const el = elements.wordInput;
  if (!el) return;
  const raw = (el.value || '').trim();
  if (!raw) return;

  const parsed = logyq.treeOps.parseIncoming(raw);
  const focused =
    state.selectedUid ||
    (state.selectedUids && state.selectedUids.size === 1 ? [...state.selectedUids][0] : null);

  if (parsed && parsed.tree){
    const target = focused || (state.root && state.root.data && state.root.data._uid) || null;

    logyq.treeOps.addSubtreeChildOf(target, parsed.tree);

    if (Array.isArray(parsed.wordBank) && parsed.wordBank.length){
      parsed.wordBank.forEach(w => logyq.wordDock?.addWords?.(w, 'bank'));
    }

    logyq.selection.showToast('Imported tree', 900);
  } else {
    const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length){
      const base = focused ||
                   (state.root && state.root.data && state.root.data._uid) ||
                   null;

      if (!state.root && parts.length){
        const rootData = { name: parts[0] };
        logyq.utils.assignUids(rootData);
        state.root = d3.hierarchy(rootData); logyq.utils.assignIds(state.root);
        logyq.treeManager.layoutAndRender(false);
        logyq.selection.setSelected(state.root.data._uid);
        parts.slice(1).forEach(p => logyq.treeOps.addChildOf(state.root.data._uid, p, { noEdit: true }));
      } else if (base){
        parts.forEach(p => logyq.treeOps.addChildOf(base, p, { noEdit: true }));
      }
      logyq.selection.showToast('Added words', 900);
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

  logyq.selection.clearGroup();
  logyq.selection.clearSelection();
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



/* --- Dock side: one CSS-class API (bottom → left → hidden).
   Hide is `#Dock.dock-hidden { display: none !important }`.
   Do not toggle `style.display`; a second hide path fights this cycle. --- */
const DOCK_SIDES = ['bottom', 'left', 'hidden'];

function applyDockSide(){
  const { state, elements } = logyq
  const el = elements.Dock;
  if (!el) return;
  el.classList.remove('dock-left','dock-hidden');
  if (state.dockSide === 'left')      el.classList.add('dock-left');
  else if (state.dockSide === 'hidden') el.classList.add('dock-hidden');
}

function setSide(side){
  const { state } = logyq
  if (!DOCK_SIDES.includes(side)) return state.dockSide;
  state.dockSide = side;
  applyDockSide();
  return state.dockSide;
}

function cycleDockSide(){
  const { state } = logyq
  const i = DOCK_SIDES.indexOf(state.dockSide);
  const next = DOCK_SIDES[(i < 0 ? 0 : i + 1) % DOCK_SIDES.length];
  return setSide(next);
}

function sideLabel(side){
  return side === 'bottom' ? 'Word Bank → Bottom' :
         side === 'left'   ? 'Word Bank → Left'   :
                             'Word Bank → Hidden';
}

  attach('input', {
    isTextField,
    keyIsNav,
    commitWordInput,
    handleAddBox,
  });

  attach('dock', {
    applyDockSide,
    setSide,
    cycleDockSide,
    sideLabel,
    updateDockBounds,
  });

/* call once so the current state is applied on load */
applyDockSide();



