(() => {
  /* ======================= LOGYQ API ======================= */
  // Mutable bag fragments register onto. Clusters should read shared
  // state and late-bound managers through `logyq` instead of hoping a
  // same-scope `const` exists. Unconverted fragments still use ambient
  // bindings; attach() keeps both views pointing at the same objects.
  const logyq = {
    config: null,
    moat: null,
    fly: null,
    camera: null,
    state: null,
    elements: null,
    utils: null,
    export: null,
    history: null,
    data: null,
    visual: null,
    detectors: null,
    layout: null,
    structure: null,
    editing: null,
    selection: null,
    treeOps: null,
    deletion: null,
    drag: null,
    wordDock: null,
    dock: null,
    input: null,
    mix: null,
    treeManager: null,
    keyboard: null,
    holdDrag: null,
  }

  function attach(name, value) {
    logyq[name] = value
    return value
  }

  /* ======================= CONFIG ======================= */
  const CONFIG = {
    CARD_WIDTH:140, CARD_HEIGHT:63, FONT_SIZE:18,
    HORIZONTAL_GAP:20, VERTICAL_GAP:78,
    LINK_INSET:30, CARET_DOT_RADIUS:8,
    HISTORY_LIMIT:50,
    DRAG_START_PX: 4,
    DETECTOR_OVERLAP_PX: 2,           // pixel seatbelt overlap
    DETECTOR_DEPTH_FACTOR: 10,       // >=1; broken? extend downward for easier hover from above
    SIBLING_SHARE_THRESHOLD: 0.60,
    COUSIN_SHARE_THRESHOLD:  0.66,
    FAMILY_MIN_LEVER: 2,              // famMin = cardWidth / lever  (siblings)
    COUSIN_MIN_LEVER: 2,              // cousins:  min = cardWidth / lever
    LAPEL_LEVER: 4,                   // lapelPad = cardWidth / lever
    EDGE_SIBLING_LEVER: 1.5,          // width in card widths
    SHOW_DETECTORS: false,
    DRAG_PROXY_MODE: "dot", /* [patch] drag-proxy-knob */
    DRAG_LATCH_PX: 5,      // distance before the proxy is allowed to move
    DRAG_SNAP_MS: 120,     // how quickly the proxy catches up once released

      };



const CONFIG_MOAT = {
  enabled: true,
  moatPct: 0.08,    // 10% band per side mote trigger
  cooldownMs: 500,
  durationMin: 260,
  durationMax: 650
};


// Smooth flight config (center only, no zoom)
const CONFIG_FLY = {
  hotkeyDuration: 420,  // Ctrl/Shift+F
  moatDuration:   360,  // when mote triggers
  moatDelayMs:    90    // small debounce for mote helper
};

attach('config', CONFIG)
attach('moat', CONFIG_MOAT)
attach('fly', CONFIG_FLY)


// === Nearest-wall % (single source of truth) ===
function computeNearestWallPct(){
  const { elements, state } = logyq
  if (!elements?.svg || !elements?.gRoot || !state?.root) return null;

  const uid =
    state.selectedUid
    || (state.selectedUids && state.selectedUids.size ? [...state.selectedUids][0] : null)
    || (state.root?.data?._uid ?? null);
  if (!uid) return null;

  const h = state.root.descendants().find(n => n?.data?._uid === uid);
  if (!h) return null;

  const m = elements.gRoot?.node()?.getScreenCTM();
  if (!m) return null;
  const p = new DOMPoint(h.x, h.y).matrixTransform(m);

  const svgEl = elements.svg.node();
  const W = svgEl?.clientWidth || 0, H = svgEl?.clientHeight || 0;
  if (!W || !H) return null;

  const leftPct   =  p.x / W;
  const rightPct  = (W - p.x) / W;
  const topPct    =  p.y / H;
  const bottomPct = (H - p.y) / H;

  return Math.min(leftPct, rightPct, topPct, bottomPct); // 0..0.5
}


// Current single selection (or null). Canonical logic lives on
// logyq.selection.getSelectedUid; this alias stays for camera/editing
// callers in this fragment. Fallback is only for eval-before-attach.
function __selectedUid(){
  if (typeof logyq.selection?.getSelectedUid === 'function') return logyq.selection.getSelectedUid();
  const { state } = logyq
  return state?.selectedUid
      || (state?.selectedUids && state.selectedUids.size === 1 ? [...state.selectedUids][0] : null)
      || null;
}

/* Phone has no select UX. Do not follow-focus / re-center from tap, moat,
   create-relative fly, or inline edit. Desktop keyboard IJKL-style
   center-on-select stays. */
function phoneNoFollowCamera(){
  try {
    if (typeof document !== 'undefined' && document.body?.classList?.contains('logyq-mobile-v162')) return true;
    return !!window.matchMedia?.('((pointer:coarse) and (max-width:1200px)),((hover:none) and (max-width:1200px))')?.matches;
  } catch (_e) {
    return false;
  }
}

/* Smoothly pan to a node's center, preserving current zoom. */
function flyCenterToUID(uid, { duration = logyq.fly.hotkeyDuration } = {}){
  if (phoneNoFollowCamera()) return;
  const { elements, state } = logyq
  const svg = elements.svg?.node();
  if (!svg || !state.root || !uid) return;

  const h = state.root.descendants().find(n => n?.data?._uid === uid);
  if (!h) return;

  // Keep current zoom; only translate
  const t = d3.zoomTransform(svg);
  const W = svg.clientWidth, H = svg.clientHeight;
  const target = d3.zoomIdentity
    .translate(W/2, H/2)
    .scale(t.k)
    .translate(-h.x, -h.y);

  // Cancel any in-flight tweens before ours
  d3.select(svg).interrupt();
  d3.select(elements.gRoot?.node()).interrupt?.();

  elements.svg
    .transition()
    .duration(duration)
    .ease(d3.easeCubicOut)
    .call(state.zoom.transform, target);
}

function copyZoom(t){
  if (!t) return null
  return d3.zoomIdentity.translate(t.x, t.y).scale(t.k)
}

/* Desktop-only leftover. Phone edit uses the keyboard field and must not
   move the map, so this returns immediately on a phone. */
function flyEditFocusToUID(uid, { duration = logyq.fly.hotkeyDuration } = {}){
  if (phoneNoFollowCamera()) return;
  const { elements, state } = logyq
  const svg = elements.svg?.node();
  if (!svg || !state.root || !uid) return;

  const h = state.root.descendants().find(n => n?.data?._uid === uid);
  if (!h) return;

  const t = d3.zoomTransform(svg);
  const vv = window.visualViewport;
  const W = (vv && vv.width) || svg.clientWidth;
  const H = (vv && vv.height) || svg.clientHeight;
  const ox = (vv && vv.offsetLeft) || 0;
  const oy = (vv && vv.offsetTop) || 0;
  const maxK = (state.zoom?.scaleExtent?.() || [0.02, 2.4])[1];
  const k = Math.min(maxK, Math.max(t.k, 1.35));
  const target = d3.zoomIdentity
    .translate(ox + W / 2, oy + H * 0.32)
    .scale(k)
    .translate(-h.x, -h.y);

  d3.select(svg).interrupt();
  d3.select(elements.gRoot?.node()).interrupt?.();

  elements.svg
    .transition()
    .duration(duration)
    .ease(d3.easeCubicOut)
    .call(state.zoom.transform, target)
    .on('end', () => {
      state.editZoom = copyZoom(d3.zoomTransform(svg));
      logyq.editing?.updateNodeEditorPosition?.();
    });
}

/* Center the *current* selection with a given duration (no zoom). */
function centerOnSelected({ duration = logyq.fly.hotkeyDuration } = {}){
  const uid = __selectedUid();
  if (!uid) return;
  flyCenterToUID(uid, { duration });
}




/// Debounced center-on-selected (no zoom), mirrors autoFitSoon style
function centerOnSelectedSoon(delay){
  if (phoneNoFollowCamera()) return;
  try { clearTimeout(window.__centerSoonT); } catch (_e) {}
  const d = Number.isFinite(delay) ? delay : logyq.fly.moatDelayMs;
  window.__centerSoonT = setTimeout(() => {
    try { centerOnSelected({ duration: logyq.fly.moatDuration }); } catch (_e) {}
  }, d);
}






// keep the name, change the behavior to "center on selected"
function checkMoatAndAutoFit(sourceTag = 'kbd'){
  if (phoneNoFollowCamera()) return;
  const { state, moat } = logyq

      // Don’t run the moat while the user is dragging/panning the map
  if (state.isPanning) return;

  // Keep the header readout fresh
  const pct = computeNearestWallPct();
  const el = document.getElementById('moatReadout');

  if (pct == null){
    if (el){ el.textContent = ''; el.style.display = 'none'; }
    return;
  }

 

  if (!moat?.enabled) return;
  const threshold = moat.moatPct ?? 0.10;  // e.g., 10%
  if (pct >= threshold) return;

  const now = Date.now();
  const cooldown = moat.cooldownMs ?? 500;
  if (now - (state._lastMoat || 0) < cooldown) return;

  // Center on selected (not fit)
  centerOnSelectedSoon(120);
  state._lastMoat = now;
}

  attach('camera', {
    computeNearestWallPct,
    phoneNoFollowCamera,
    flyCenterToUID,
    flyEditFocusToUID,
    centerOnSelected,
    centerOnSelectedSoon,
    checkMoatAndAutoFit,
  });

  // Hold-drag layout reservation: while a finger hold is latched, the
  // origin uid must stay in the hierarchy with its pre-latch metrics.
  // Dashed ghost is paint-only. Mutate + relayout only after an explicit
  // commit (real move drop or intentional Word Bank).
  function holdDragFrozen(){
    try {
      return !!(document.body?.classList?.contains('v2-branch-drag') && !window.__logyqHoldDragCommit)
    } catch (_e) {
      return false
    }
  }
  // Stay-still / in-flight hold must never chip a copy into Word Bank.
  // Only an explicit allow-bank commit (moved past STILL_PX + chip dwell)
  // may write the dock. Layout freeze stays independent of this gate.
  // Arming is included so a contextmenu that arrives before the 160ms
  // latch still cannot copy labels.
  function holdDragBlocksBank(){
    try {
      if (window.__logyqHoldDragAllowBank) return false
      return !!(window.__logyqHoldArming || window.__logyqHoldDragSession || document.body?.classList?.contains('v2-branch-drag'))
    } catch (_e) {
      return false
    }
  }

  // Phone / long-press contextmenu is not a Word Bank gesture.
  // Desktop right-click (button 2 on a fine pointer) stays explicit.
  function coarseBankSurface(){
    try {
      if (document.body?.classList?.contains('logyq-mobile-v162')) return true
      return !!window.matchMedia?.('((pointer:coarse) and (max-width:1200px)),((hover:none) and (max-width:1200px))')?.matches
    } catch (_e) {
      return false
    }
  }
  function incidentalBankContext(event){
    try {
      if (window.__logyqHoldArming || window.__logyqHoldDragSession) return true
      if (document.body?.classList?.contains('v2-branch-drag')) return true
      if (window.__logyqSuppressBankContextUntil && Date.now() < window.__logyqSuppressBankContextUntil) return true
      const type = event?.pointerType || event?.sourceEvent?.pointerType
      if (type === 'touch' || type === 'pen') return true
      if (coarseBankSurface()) return true
      if (event && typeof event.button === 'number' && event.button !== 2) return true
      return false
    } catch (_e) {
      return false
    }
  }
  function noteBankContextGrace(ms){
    try {
      const until = Date.now() + (Number(ms) || 900)
      if (!window.__logyqSuppressBankContextUntil || window.__logyqSuppressBankContextUntil < until) {
        window.__logyqSuppressBankContextUntil = until
      }
    } catch (_e) {}
  }
  window.__logyqHoldDragFrozen = holdDragFrozen
  window.__logyqHoldDragBlocksBank = holdDragBlocksBank
  window.incidentalBankContext = incidentalBankContext
  window.noteBankContextGrace = noteBankContextGrace
  attach('holdDrag', { frozen: holdDragFrozen, blocksBank: holdDragBlocksBank, incidentalBankContext, noteBankContextGrace })



/* ======================= STATE & ELEMENTS ======================= */
const state = {

  root:null, lastNodes:[], zoom:null, layout:null,
  dragState:{ trashZone:'far', drop:null, solo:false, groupAbandon:false },
  history:[], redo:[], wordBank:[], selectedUid:null, /* [patch] multiselect-state */ selectedUids:new Set(),
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



  const utils = (() => {
    let UID = 1;
    const usedUids = new Set();
    const noteUid = (id)=>{
      const key = String(id);
      usedUids.add(key);
      const match = /^n(\d+)$/.exec(key);
      if(match) UID = Math.max(UID, Number(match[1]) + 1);
    };
    const mintUid = ()=>{
      let id = `n${UID++}`;
      while(usedUids.has(id)) id = `n${UID++}`;
      usedUids.add(id);
      return id;
    };
    // Saved maps already carry n1, n2, … . A fresh counter would hand the
    // next blank the root's id, and Enter would rename the root.
    const assignUids = (n)=>{
      const seen = new Set();
      const walk = (node)=>{
        if(!node || typeof node !== 'object') return;
        if(!node._uid || seen.has(String(node._uid))) node._uid = mintUid();
        else noteUid(node._uid);
        seen.add(String(node._uid));
        (node.children||[]).forEach(walk);
      };
      walk(n);
    };
    const deepClone = (o)=> JSON.parse(JSON.stringify(o));
    const pathToUid = (data, target, path=[])=>{ if(!data) return null; path.push(data._uid); if(data._uid===target) return path.slice(); for(const c of (data.children||[])){ const p=pathToUid(c,target,path); if(p) return p; } path.pop(); return null; };
    const findByPath = (data, path)=>{ let cur = (path[0]===data._uid)? data : null; if(!cur) return null; for(let i=1;i<path.length;i++){ const u=path[i]; cur=(cur.children||[]).find(x=>x._uid===u); if(!cur) return null; } return cur; };
    const findByUid = (data, uid)=>{ if(!data) return null; if(data._uid===uid) return data; for(const c of (data.children||[])){ const r=findByUid(c, uid); if(r) return r; } return null; };
    const uidInSubtree = (root, uid)=>{ if(!root) return false; if(root._uid===uid) return true; for(const c of (root.children||[])) if(uidInSubtree(c, uid)) return true; return false; };
    const assignIds=(h)=>{ let id=0; h.descendants().forEach(d=>d.id=++id); };
    const clamp=(v,lo,hi)=> Math.max(lo, Math.min(hi, v));
    return { assignUids, deepClone, pathToUid, findByPath, findByUid, uidInSubtree, assignIds, clamp };
  })();
  attach('utils', utils)

  /* ======================= PNG EXPORTER ======================= */
  const PngExport = (() => {
    function copyInlineStylesRecursive(src, dst){
      // Copy a conservative set of presentation attributes so the snapshot matches the live view.
      const css = window.getComputedStyle(src);
      const set = (prop, attr = prop) => {
        const val = css.getPropertyValue(prop);
        if (val && val.trim()) dst.setAttribute(attr, val.trim());
      };
      // paint / geometry
      set('fill'); set('stroke'); set('stroke-width'); set('stroke-opacity'); set('fill-opacity'); set('opacity');
      // text
      set('font-size'); set('font-family'); set('font-weight');
      // svg-specific text layout (may not show up in all browsers via computedStyle; also set as attributes)
      const ta = css.getPropertyValue('text-anchor'); if (ta) dst.setAttribute('text-anchor', ta.trim());
      const db = css.getPropertyValue('dominant-baseline'); if (db) dst.setAttribute('dominant-baseline', db.trim());
      // remove any hidden measuring nodes
      if (dst.classList && dst.classList.contains('__measure')) dst.remove();

      // recurse
      const srcKids = Array.from(src.childNodes || []);
      const dstKids = Array.from(dst.childNodes || []);
      for (let i = 0; i < srcKids.length; i++){
        const s = srcKids[i], d = dstKids[i];
        if (s && d && s.nodeType === 1) copyInlineStylesRecursive(s, d);
      }
    }

    function cloneSvgForViewport(svgEl, width, height){
      // Deep clone and set explicit box
      const clone = svgEl.cloneNode(true);
      clone.removeAttribute('id');
      clone.setAttribute('width', String(width));
      clone.setAttribute('height', String(height));
      clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

      // Inline styles so classes/vars are baked
      copyInlineStylesRecursive(svgEl, clone);

      // Hide transient overlays that shouldn't appear unless visible
      // Ensure caret visibility matches live state (already baked via inline)
      return clone;
    }

    function svgString(svgNode){
      const serializer = new XMLSerializer();
      let str = serializer.serializeToString(svgNode);
      // Fix for Safari <foreignObject> xmlns (not used here, but harmless)
      if (!str.match(/^<svg[^>]+xmlns="http:\/\/www.w3.org\/2000\/svg"/)){
        str = str.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
      }
      if (!str.match(/^<svg[^>]+"http:\/\/www.w3.org\/1999\/xlink"/)){
        str = str.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
      }
      return str;
    }

    function drawPageGradient(ctx, W, H){
      // Mimic: radial-gradient(60rem 60rem at 50% -20%, #f7fafc 30%, var(--background-color) 100%)
      const root = getComputedStyle(document.documentElement);
      const outer = (root.getPropertyValue('--background-color') || '#eef1f5').trim();
      const inner = '#f7fafc';
      const cx = W / 2;
      const cy = -0.2 * H;       // center above the top, like CSS
      const r  = Math.max(W, H) * 0.9;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0.30, inner);
      g.addColorStop(1.00, outer);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    async function exportCurrentView({ scale = 2, filename, withBackground = true } = {}){
      const svgEl = elements.svg.node();
      if (!svgEl){ return; }

      // Use the visible viewport and keep the current d3-zoom’ed transform baked into the <g>
      const W = Math.max(1, svgEl.clientWidth);
      const H = Math.max(1, svgEl.clientHeight);

      const clone = cloneSvgForViewport(svgEl, W, H);
      const svgData = svgString(clone);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      const img = new Image();
      // Ensure crisp text on Safari
      img.decoding = 'async';
      img.onload = () => {
        try{
          const canvas = document.createElement('canvas');
          canvas.width  = Math.round(W * scale);
          canvas.height = Math.round(H * scale);
          const ctx = canvas.getContext('2d');
          ctx.setTransform(scale, 0, 0, scale, 0, 0);

          if (withBackground) drawPageGradient(ctx, W, H);

          ctx.drawImage(img, 0, 0, W, H);

          const out = canvas.toDataURL('image/png');
          const a = document.createElement('a');
          a.download = filename || `tree-${new Date().toISOString().replace(/[:.]/g,'-')}.png`;
          a.href = out;
          document.body.appendChild(a);
          a.click();
          a.remove();
          showToast('PNG exported', 1100);
        } finally {
          URL.revokeObjectURL(url);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        alert('Sorry, PNG export failed to render this view.');
      };
      img.src = url;
    }

  /* [patch] png-only exportFullPNG override start */
  exportFullPNG__legacy = function(opts){ /* [patch] legacy-exportFullPNG-rename */
    opts = opts||{}; const pad = (opts.pad!=null?opts.pad:24); let s = (opts.scale||2);
    const minLabelPx = (opts.minLabelPx||0); const maxSide = (opts.maxSide||8192); const filename = opts.filename; const withBackground = !!opts.withBackground;
    const svgEl = elements.svg.node(); if(!svgEl) return; const bbox = getContentBBox(pad); if(!bbox) return;
    const clone = svgEl.cloneNode(true); clone.removeAttribute("id");
    const g = clone.querySelector("svg > g"); if(g) g.setAttribute("transform","translate(0,0) scale(1)");
    copyInlineStylesRecursive(svgEl, clone);
    const vbX=bbox.x, vbY=bbox.y, vbW=bbox.width, vbH=bbox.height;
    clone.setAttribute("width", String(Math.max(1,vbW))); clone.setAttribute("height", String(Math.max(1,vbH)));
    clone.setAttribute("viewBox", vbX+" "+vbY+" "+vbW+" "+vbH);
    clone.setAttribute("xmlns","http://www.w3.org/2000/svg"); clone.setAttribute("xmlns:xlink","http://www.w3.org/1999/xlink");
    if(minLabelPx && CONFIG && CONFIG.FONT_SIZE){ s = Math.max(s, minLabelPx/CONFIG.FONT_SIZE); }
    let targetW = Math.round(vbW*s), targetH = Math.round(vbH*s); const max = Math.max(targetW,targetH);
    if(max>maxSide){ const f=maxSide/max; targetW=Math.round(targetW*f); targetH=Math.round(targetH*f); s*=f; }
    const svgData = svgString(clone); const svgBlob = new Blob([svgData], { type:"image/svg+xml;charset=utf-8" }); const url = URL.createObjectURL(svgBlob);
    const img = new Image(); img.decoding = "async";
    img.onload = ()=>{ try{
      const c=document.createElement("canvas"); c.width=targetW; c.height=targetH; const ctx=c.getContext("2d");
      /* translate so content bbox maps to canvas (fixes left black band/offset) */
      ctx.setTransform(s,0,0,s,0,0); /* [patch] export-full-no-double-offset-1 */
      if(withBackground){ /* fill whole canvas in page coords, not bbox coords */
        ctx.save(); ctx.setTransform(1,0,0,1,0,0); drawPageGradient(ctx, targetW, targetH); ctx.restore();
      }
      ctx.drawImage(img,0,0);
      const out=c.toDataURL("image/png"); const a=document.createElement("a");
      a.download = filename || ("tree-full-"+new Date().toISOString().replace(/[:.]/g,"-")+".png"); a.href=out; document.body.appendChild(a); a.click(); a.remove();
      showToast("Full PNG exported",1100);
    } finally { URL.revokeObjectURL(url); } };
    img.onerror = ()=>{ URL.revokeObjectURL(url); alert("Sorry, full-map PNG export failed."); };
    img.src = url;
  };
  /* [/patch] png-only exportFullPNG override end */
/* [patch] full-export-fns start */      function getContentBBox(pad){        pad = (typeof pad === "number" ? pad : 24);        try{          const nb = elements.gNodes.node() && elements.gNodes.node().getBBox();          const lb = elements.gLinks.node() && elements.gLinks.node().getBBox();          if(!nb && !lb) return null;          const merge = (a,b)=>{ if(!a||!a.width||!a.height) return b; if(!b||!b.width||!b.height) return a;             const x=Math.min(a.x,b.x), y=Math.min(a.y,b.y); const r=Math.max(a.x+a.width,b.x+b.width), bt=Math.max(a.y+a.height,b.y+b.height);             return { x:x-pad, y:y-pad, width:(r-x)+2*pad, height:(bt-y)+2*pad }; };          return merge(nb,lb);        }catch(_e){ return null; }      }      function injectTitleIntoClone(clone, bbox, opts){        const add = !!(opts && opts.addTitle); if(!add) return { vbX:bbox.x, vbY:bbox.y, vbW:bbox.width, vbH:bbox.height };        const title = (opts.titleText || 'LOGiC');        const baseSize = (CONFIG && CONFIG.FONT_SIZE ? CONFIG.FONT_SIZE : 18);        const fs = Math.max(18, Math.round(baseSize*1.25));        const extraTop = Math.round(fs*1.8);        const vbX = bbox.x, vbY = bbox.y - extraTop, vbW = bbox.width, vbH = bbox.height + extraTop;        const t = document.createElementNS('http://www.w3.org/2000/svg','text');        t.setAttribute('x', String(vbX + vbW/2));        t.setAttribute('y', String(vbY + Math.max(18, fs)));        t.setAttribute('text-anchor','middle');        t.setAttribute('font-weight','700');        t.setAttribute('font-size', String(fs));        t.setAttribute('fill', '#334155');        t.textContent = title;        clone.insertBefore(t, clone.firstChild);        return { vbX, vbY, vbW, vbH };      }      function exportFullPNG(opts){        opts = opts||{}; const pad = (opts.pad!=null?opts.pad:24); let s = (opts.scale||2);         const minLabelPx = (opts.minLabelPx||0), maxSide = (opts.maxSide||8192); const filename = opts.filename; const withBackground = !!opts.withBackground;         const svgEl = elements.svg.node(); if(!svgEl) return; const bbox = getContentBBox(pad); if(!bbox) return;         const clone = svgEl.cloneNode(true); clone.removeAttribute("id");        const g = clone.querySelector("svg > g"); if(g) g.setAttribute("transform","translate(0,0) scale(1)");        copyInlineStylesRecursive(svgEl, clone);        if(minLabelPx && CONFIG && CONFIG.FONT_SIZE){ s = Math.max(s, minLabelPx/CONFIG.FONT_SIZE); }        const titled = injectTitleIntoClone(clone, bbox, opts);        clone.setAttribute("width", String(Math.max(1,titled.vbW))); clone.setAttribute("height", String(Math.max(1,titled.vbH)));        clone.setAttribute("viewBox", titled.vbX+" "+titled.vbY+" "+titled.vbW+" "+titled.vbH);        clone.setAttribute("xmlns","http://www.w3.org/2000/svg"); clone.setAttribute("xmlns:xlink","http://www.w3.org/1999/xlink");        let targetW = Math.round(titled.vbW*s), targetH = Math.round(titled.vbH*s);        const max = Math.max(targetW,targetH); if(max>maxSide){ const f=maxSide/max; targetW=Math.round(targetW*f); targetH=Math.round(targetH*f); s*=f; }        const svgData = svgString(clone); const svgBlob = new Blob([svgData], { type:"image/svg+xml;charset=utf-8" }); const url = URL.createObjectURL(svgBlob);        const img = new Image(); img.decoding = "async";        img.onload = ()=>{ try{ const c=document.createElement("canvas"); c.width=targetW; c.height=targetH; const ctx=c.getContext("2d");          ctx.setTransform(s,0,0,s,0,0); /* [patch] export-full-no-double-offset-2 */
      /* [patch] png-bg-fix start */
      if(withBackground){ ctx.save(); ctx.setTransform(1,0,0,1,0,0); drawPageGradient(ctx, targetW, targetH); ctx.restore(); }
      /* [patch] png-bg-fix end */          ctx.drawImage(img,0,0); const out=c.toDataURL("image/png"); const a=document.createElement("a");          a.download = filename || ("tree-full-"+new Date().toISOString().replace(/[:.]/g,"-")+".png"); a.href=out; document.body.appendChild(a); a.click(); a.remove();          showToast("Full PNG exported",1100); } finally { URL.revokeObjectURL(url); } };        img.onerror = ()=>{ URL.revokeObjectURL(url); alert("Sorry, full-map PNG export failed."); };        img.src = url;      }      function exportSVG(opts){        opts = opts||{}; const pad = (opts.pad!=null?opts.pad:24); const filename = opts.filename;        const svgEl = elements.svg.node(); if(!svgEl) return; const bbox = getContentBBox(pad) || {x:0,y:0,width:svgEl.clientWidth||1000,height:svgEl.clientHeight||800};        const clone = svgEl.cloneNode(true); clone.removeAttribute("id"); const g=clone.querySelector("svg > g"); if(g) g.setAttribute("transform","translate(0,0) scale(1)");        copyInlineStylesRecursive(svgEl, clone);        const titled = injectTitleIntoClone(clone, bbox, opts);        clone.setAttribute("width", String(Math.max(1,titled.vbW))); clone.setAttribute("height", String(Math.max(1,titled.vbH)));        clone.setAttribute("viewBox", titled.vbX+" "+titled.vbY+" "+titled.vbW+" "+titled.vbH);        clone.setAttribute("xmlns","http://www.w3.org/2000/svg"); clone.setAttribute("xmlns:xlink","http://www.w3.org/1999/xlink");        const str = svgString(clone); const blob = new Blob([str], { type:"image/svg+xml;charset=utf-8" }); const url = URL.createObjectURL(blob);        const a=document.createElement("a"); a.download = filename || ("tree-"+new Date().toISOString().replace(/[:.]/g,"-")+".svg"); a.href=url; document.body.appendChild(a); a.click(); a.remove();        setTimeout(()=>URL.revokeObjectURL(url),0); showToast("SVG exported (vector)",1100);      }      /* [patch] full-export-fns end */
    return { exportCurrentView, exportFullPNG, exportSVG, getContentBBox };
  })();
  attach('export', PngExport)

  /* ======================= HISTORY ======================= */
  function pushHistory(action){
    const { state, elements, config: CONFIG } = logyq
    state.history.push(action);
    state.redo = [];
    if(state.history.length>CONFIG.HISTORY_LIMIT) state.history.shift();
      /* [patch] dock-bounds-init start */
      try{ logyq.dock.updateDockBounds(); }catch(_e){}
      /* [/patch] dock-bounds-init end */
    elements.undoBtn.disabled = state.history.length===0;
  }


/* [patch] undo-fit-helper start 3476 */
function autoFitSoon(delay){
  try{ clearTimeout(window.__undoFitT); }catch(_e){}
  try{
    var d = Number.isFinite(delay) ? delay : 220; // let transitions finish
    window.__undoFitT = setTimeout(function(){
      try{ logyq.treeManager.autoFit(); }catch(_e){}
    }, d);
  }catch(_e){}
}
/* [patch] undo-fit-helper end */




  function undo(){
    const { state, elements, utils } = logyq
    const a = state.history.pop();
      /* [patch] dock-bounds-init start */
      try{ logyq.dock.updateDockBounds(); }catch(_e){}
      /* [/patch] dock-bounds-init end */
    elements.undoBtn.disabled = state.history.length===0;
    if(!a) return;
    // Forward snapshot so redo puts the tree and the Word Bank back together.
    a.redoRoot = state.root ? utils.deepClone(state.root.data) : null;
    a.redoBank = Array.isArray(state.wordBank) ? state.wordBank.slice() : [];
    state.redo = state.redo || [];
    state.redo.push(a);

    if(a.type==='delete'){
      const parent = utils.findByPath(state.root.data, a.parentPath);
      if(parent){
        parent.children = parent.children || [];
        const insertAt = Math.min(a.index, parent.children.length);
        parent.children.splice(insertAt, 0, a.subtree);
        state.root = d3.hierarchy(state.root.data);
        utils.assignIds(state.root);
        logyq.treeManager.layoutAndRender(false);
      }
    } else if(a.type==='move'){
      const toParent = utils.findByPath(state.root.data, a.toParentPath);
      const fromParent = utils.findByPath(state.root.data, a.fromParentPath);
      if(toParent && fromParent){
        let node=null;
        if (Array.isArray(toParent.children)){
          const i = toParent.children.findIndex(c=>c._uid===a.uid);
          if(i>-1) node = toParent.children.splice(i,1)[0];
        }
        if(node){
          fromParent.children = fromParent.children || [];
          const at = Math.min(a.fromIndex, fromParent.children.length);
          fromParent.children.splice(at,0,node);
        }
        state.root = d3.hierarchy(state.root.data);
        utils.assignIds(state.root);
        logyq.treeManager.layoutAndRender(false);
        /* [patch] undo-fit-call move */ autoFitSoon();

      }
    } else if(a.type==='add'){
      const parent = utils.findByPath(state.root.data, a.parentPath);
      if(parent && Array.isArray(parent.children)){
        const i = parent.children.findIndex(c=>c._uid===a.uid);
        if(i>-1) parent.children.splice(i,1);
        if(parent.children.length===0) parent.children=null;
        state.root = d3.hierarchy(state.root.data);
        utils.assignIds(state.root);
        logyq.treeManager.layoutAndRender(true);
      }
    } else if(a.type==='rename'){
      const target = utils.findByUid(state.root.data, a.uid);
      if(target){
        target.name = a.prev;
        state.root = d3.hierarchy(state.root.data);
        utils.assignIds(state.root);
        logyq.treeManager.layoutAndRender(false);
      }
    } else if (a.type === 'randomize'){
      state.root = a.prev ? d3.hierarchy(a.prev) : null;
      if ('prevBank' in a) state.wordBank = (a.prevBank || []).slice();
      if(state.root) utils.assignIds(state.root);
      logyq.treeManager.layoutAndRender(false);
      logyq.wordDock.render();
      /* [patch] undo-fit-call randomize */ autoFitSoon();

    } else if (a.type === 'delete-root') {
      state.root = d3.hierarchy(a.subtree);
      utils.assignIds(state.root);
      logyq.treeManager.layoutAndRender(false);
    } else if (a.type === 'add-root') {
      state.root = null;
      logyq.treeManager.renderEmpty();
    } else if (a.type === 'replace-root') {
      state.root = d3.hierarchy(a.prev);
 if ('prevBank' in a) state.wordBank = (a.prevBank || []).slice();  // ← add this

      utils.assignIds(state.root);
      logyq.treeManager.layoutAndRender(false);
    }
    if ('prevBank' in a) {
      state.wordBank = (a.prevBank || []).slice();
      try { logyq.wordDock.render(); } catch (_e) {}
    }
  }

  function redo(){
    const { state, elements, utils } = logyq
    const a = (state.redo || []).pop();
    if (!a || !('redoRoot' in a)) return;
    state.history.push(a);
    if (elements.undoBtn) elements.undoBtn.disabled = state.history.length === 0;
    state.root = a.redoRoot ? d3.hierarchy(a.redoRoot) : null;
    if (state.root) utils.assignIds(state.root);
    state.wordBank = (a.redoBank || []).slice();
    if (state.root) logyq.treeManager.layoutAndRender(false);
    else logyq.treeManager.renderEmpty();
    try { logyq.wordDock.render(); } catch (_e) {}
  }

  attach('history', { pushHistory, undo, redo, autoFitSoon })

  /* ======================= SAMPLE DATA ======================= */
  const dataManager = {
    generateTree(n=30){
      let seq=1;
      const root={ name:`Node ${String(seq).padStart(2,'0')}`, children:[] };
      const q=[root]; let toggle=true;
      while(seq<n && q.length){
        const p=q.shift(); const rem=n-seq; const k=Math.min(rem, toggle?3:2); toggle=!toggle;
        if(k<=0) continue; p.children=[];
        for(let i=0;i<k;i++){
          if(seq>=n) break; seq++;
          p.children.push({ name:`Node ${String(seq).padStart(2,'0')}` });
          q.push(p.children[p.children.length-1]);
        }
      }
      utils.assignUids(root); return root;
    }
  };

  /* ======================= VISUALS ======================= */
  const visual = {
    vLink(d){
      const x0=d.source.x, y0=d.source.y + (CONFIG.CARD_HEIGHT/2 - CONFIG.LINK_INSET);
      const x1=d.target.x, y1=d.target.y - (CONFIG.CARD_HEIGHT/2 - CONFIG.LINK_INSET);
      const k=0.6, c0y=y0 + k*(y1-y0), c1y=y1 - k*(y1-y0);
      return `M${x0},${y0}C${x0},${c0y} ${x1},${c1y} ${x1},${y1}`;
    },
    layoutMini(title){
      const w=CONFIG.CARD_WIDTH;
      d3.select(elements.dragMiniRect).attr("width", w).attr("height", CONFIG.CARD_HEIGHT);
      elements.dragMiniTitle.text(title).attr("x", w/2).attr("y", CONFIG.CARD_HEIGHT/2).style("font-size", `${CONFIG.FONT_SIZE}px`);
    }
  };
  attach('data', dataManager)
  attach('visual', visual)

  /* ======================= LABEL WRAP ======================= */
  const LabelWrap = (() => {
    let measureEl = null;
    function measureText(s){
      const { elements, config: CONFIG } = logyq
      try{
        if(!measureEl){
          measureEl = elements.gOverlay.append("text").attr("class","__measure").style("visibility","hidden").style("font-size", CONFIG.FONT_SIZE + "px").node();
        }
        measureEl.style.fontSize = CONFIG.FONT_SIZE + "px";
        measureEl.textContent = s || "";
        if (measureEl.getComputedTextLength) return measureEl.getComputedTextLength();
        return String(s||"").length * 8;
      }catch(_e){
        return String(s||"").length * 8;
      }
    }
    function wrapToTwoLines(str, maxWidth){
      if(!str) return [""];
      const s=String(str);
      if(measureText(s) <= maxWidth) return [s];
      const words=s.split(/\s+/).filter(Boolean);
      let line1="", line2="";
      if(words.length<=1){
        const w=words[0]||s; let cut=1;
        while(cut<w.length && measureText(w.slice(0,cut+1))<=maxWidth) cut++;
        line1=w.slice(0,cut);
        let rest=w.slice(cut), j=1;
        while(j<=rest.length && measureText(rest.slice(0,j))<=maxWidth) j++;
        line2=rest.slice(0,j-1);
      } else {
        let i=0;
        for(;i<words.length;i++){
          const t=(line1?line1+" ":"")+words[i];
          if(measureText(t)<=maxWidth) line1=t; else break;
        }
        for(;i<words.length;i++){
          const t2=(line2?line2+" ":"")+words[i];
          if(measureText(t2)<=maxWidth) line2=t2; else break;
        }
      }
      const needsEll = measureText(line2) > maxWidth || (line2 && (line1+" "+line2).length < s.length);
      if(needsEll){
        let ell="…";
        while(line2 && measureText(line2+ell)>maxWidth){ line2=line2.slice(0,-1); }
        line2=(line2||"").trim()+ell;
      }
      if(!line2) return [line1];
      return [line1, line2];
    }
    function apply(){
      const { config: CONFIG } = logyq
      const pad = 20, maxW = CONFIG.CARD_WIDTH - pad;
      d3.selectAll("g.node text.label").each(function(d){
        const el = d3.select(this);
        const name = (d && d.data && d.data.name) ? d.data.name : "";
        const lines = wrapToTwoLines(name, maxW);
        el.text(""); el.selectAll("tspan").remove();
        if(lines.length===1){
          el.append("tspan").attr("x",0).attr("dy","0").text(lines[0]);
        } else {
          el.append("tspan").attr("x",0).attr("dy","-0.35em").text(lines[0]);
          el.append("tspan").attr("x",0).attr("dy","1.2em").text(lines[1]);
        }
      });
    }
    return { apply };
  })();

/* ======================= LANE API (no visuals) ======================= */
/* Compute per-depth row stats from current layout.
   We only need centers and a reasonable row height for detectors/carets. */
function __rowStats() {
  const { state, config: CONFIG } = logyq
  if (!state.root) return new Map();
  const byDepth = new Map();
  state.root.descendants().forEach(n => {
    const a = byDepth.get(n.depth) || [];
    a.push(n.y);
    byDepth.set(n.depth, a);
  });
  const rows = new Map();
  for (const [depth, ys] of byDepth.entries()) {
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const center = (minY + maxY) / 2;
    const top = minY - CONFIG.CARD_HEIGHT / 2;
    const bottom = maxY + CONFIG.CARD_HEIGHT / 2;
    rows.set(depth, { top, center, bottom });
  }
  return rows;
}

/* Return the vertical center for a given depth.
   Fallback: derive from root using nominal row spacing. */
function laneYForDepth(depth) {
  const { state, config: CONFIG } = logyq
  const rows = __rowStats();
  if (rows.has(depth)) return rows.get(depth).center;
  const base = state.root ? state.root.y : 0;
  const step = CONFIG.CARD_HEIGHT + CONFIG.VERTICAL_GAP;
  return base + (depth * step);
}

/* Return the row height (distance to next row center).
   Fallback to nominal card+gap if next row is missing. */
function laneHeightForDepth(depth) {
  const { config: CONFIG } = logyq
  const rows = __rowStats();
  if (rows.has(depth) && rows.has(depth + 1)) {
    const a = rows.get(depth).center;
    const b = rows.get(depth + 1).center;
    return Math.max(CONFIG.CARD_HEIGHT + CONFIG.VERTICAL_GAP, b - a);
  }
  return CONFIG.CARD_HEIGHT + CONFIG.VERTICAL_GAP;
}

/* Zoom still calls this; visuals were never drawn. */
function refreshLaneOnZoom() { /* no visuals */ }

  attach('layout', {
    LabelWrap,
    laneYForDepth,
    laneHeightForDepth,
    refreshLaneOnZoom,
  });









// --- Move the SINGLE focused node left/right (swap within parent, or hop to neighbor parent at same depth) ---
function moveSelectedHorizontally(dir){
  const { state, utils } = logyq
  // dir: -1 = left, +1 = right
  if (!state.root) return;

  // Focus-only: act on the currently focused node (ignore group)
  const uid = state.selectedUid;
  if (!uid) { logyq.selection.showToast('No focused node'); return; }

  // Live hierarchy node
  const selH = state.root.descendants().find(n => n?.data?._uid === uid);
  if (!selH) return;
  if (!selH.parent) { logyq.selection.showToast('Root has no siblings'); return; }

  // Take a snapshot for undo and work on a cloned tree
  const before = utils.deepClone(state.root.data);
  const work   = utils.deepClone(state.root.data);

  const parentUid  = selH.parent.data._uid;
  const parentData = utils.findByUid(work, parentUid);
  const nodeData   = utils.findByUid(work, uid);
  if (!parentData || !nodeData) return;

  parentData.children = parentData.children || [];
  const idx = parentData.children.findIndex(c => c && c._uid === uid);
  if (idx < 0) return;

  let changed = false;

  // 1) Try a simple in-parent swap
  if (dir < 0 && idx > 0){
    [parentData.children[idx-1], parentData.children[idx]] =
      [parentData.children[idx], parentData.children[idx-1]];
    changed = true;
  } else if (dir > 0 && idx < parentData.children.length - 1){
    [parentData.children[idx+1], parentData.children[idx]] =
      [parentData.children[idx], parentData.children[idx+1]];
    changed = true;
  } else {
    // 2) Edge: monkey-bar hop to adjacent parent at the SAME depth (by x-order)
    const parentH = selH.parent;
    const depth = parentH.depth;

    // All parents at this depth, ordered left→right by x
    const row = state.root.descendants()
      .filter(n => n.depth === depth)
      .sort((a,b) => a.x - b.x);

    const pIdx = row.findIndex(n => n.data?._uid === parentH.data._uid);
    if (pIdx < 0) return;

    const neighborH = row[pIdx + (dir < 0 ? -1 : 1)];
    if (!neighborH){
      logyq.selection.showToast(dir < 0 ? 'No group to the left' : 'No group to the right');
    } else {
      // Remove from current parent
      parentData.children.splice(idx, 1);
      if (parentData.children.length === 0) parentData.children = null;

      // Insert into neighbor (end for left, start for right)
      const neighborData = utils.findByUid(work, neighborH.data._uid);
      if (neighborData){
        neighborData.children = neighborData.children || [];
        if (dir < 0) neighborData.children.push(nodeData);
        else neighborData.children.unshift(nodeData);
        changed = true;
      }
    }
  }

  if (!changed) return;

  // Commit: push undo, rebuild hierarchy, render, keep focus on the same node
  logyq.history.pushHistory({ type: 'replace-root', prev: before });
  state.root = d3.hierarchy(work);
  utils.assignIds(state.root);
  logyq.treeManager.layoutAndRender(false);
  logyq.selection.setSelected(uid);

    // === Only recenter if we're near a viewport edge (moat rule) ===
  logyq.camera.checkMoatAndAutoFit('vhold');

}










// --- Move the SINGLE focused node vertically ---
// dir: -1 = Up (reparent to parent's parent’s lane), +1 = Down (drop to next depth)
function moveSelectedVertically(dir){
  const { state, utils, config: CONFIG } = logyq
  if (!state.root) return;
  const uid = state.selectedUid;
  if (!uid) { logyq.selection.showToast('No focused node'); return; }

  const live = state.root.descendants();
  const selH = live.find(n => n?.data?._uid === uid);
  if (!selH) return;





// === UP (new: reparent to GP, insert by X among GP's children) ===
if (dir === -1){
  const parentH = selH.parent;
  if (!parentH) { logyq.selection.showToast('Root has no parent'); return; }

  // If parent IS root → keep your existing "new root" behavior
  if (!parentH.parent){
    const before = utils.deepClone(state.root.data);
    const work   = utils.deepClone(state.root.data);

    const parentData = utils.findByUid(work, parentH.data._uid);
    const nodeData   = utils.findByUid(work, uid);
    if (!parentData || !nodeData) return;

    // Remove from current parent
    parentData.children = parentData.children || [];
    const idx = parentData.children.findIndex(c => c && c._uid === uid);
    if (idx >= 0) parentData.children.splice(idx, 1);
    if (parentData.children.length === 0) parentData.children = null;

    // Become NEW ROOT; old root becomes eldest child
    const oldRoot = work;
    const newRoot = nodeData;
    newRoot.children = newRoot.children || [];
    newRoot.children.unshift(oldRoot);

    logyq.history.pushHistory({ type: 'replace-root', prev: before });
    state.root = d3.hierarchy(newRoot);
    utils.assignIds(state.root);
    logyq.treeManager.layoutAndRender(false);
    logyq.selection.setSelected(uid);
    logyq.camera.checkMoatAndAutoFit('vhold');
    return;
  }

  // Normal case: parent has a grandparent
  const gpH = parentH.parent;

  // We’ll place the node among GP's children based on its current x
  const x0 = selH.x;

  // LIVE order of GP's children by x (left→right)
  const liveGpKids = (gpH.children || []).slice().sort((a,b)=>a.x - b.x);

  // Decide insertion "slot" in that live array by x
  let insertAfterUid = null; // null => insert at start
  if (liveGpKids.length){
    if (x0 <= liveGpKids[0].x){
      insertAfterUid = null; // before first
    } else if (x0 >= liveGpKids[liveGpKids.length - 1].x){
      insertAfterUid = liveGpKids[liveGpKids.length - 1].data._uid; // after last
    } else {
      // find first kid with x > x0, then insert after the left neighbor
      const R = liveGpKids.find(n => n.x > x0);
      const iR = liveGpKids.indexOf(R);
      const L = liveGpKids[iR - 1];
      insertAfterUid = L ? L.data._uid : null;
    }
  }

  // Snapshot + working copy (DATA world)
  const before = utils.deepClone(state.root.data);
  const work   = utils.deepClone(state.root.data);

  const nodeData   = utils.findByUid(work, uid);
  const parentData = utils.findByUid(work, parentH.data._uid);
  const gpData     = utils.findByUid(work, gpH.data._uid);
  if (!nodeData || !parentData || !gpData) return;

  // Remove from current parent
  if (Array.isArray(parentData.children)){
    const i = parentData.children.findIndex(c => c && c._uid === uid);
    if (i >= 0) parentData.children.splice(i, 1);
    if (!parentData.children || parentData.children.length === 0) parentData.children = null;
  }

  // Insert into GP.children at the DATA index that corresponds to "after insertAfterUid"
  gpData.children = gpData.children || [];
  let at = 0;
  if (insertAfterUid){
    const leftIdx = gpData.children.findIndex(c => c && c._uid === insertAfterUid);
    at = (leftIdx >= 0) ? leftIdx + 1 : gpData.children.length;
  } else {
    at = 0; // before first
  }
  at = Math.max(0, Math.min(at, gpData.children.length));
  gpData.children.splice(at, 0, nodeData);

  // Commit
  logyq.history.pushHistory({ type: 'replace-root', prev: before });
  state.root = d3.hierarchy(work);
  utils.assignIds(state.root);
  logyq.treeManager.layoutAndRender(false);
  logyq.selection.setSelected(uid);
    logyq.camera.checkMoatAndAutoFit('vhold');
  return;
}










// === DOWN (detach → choose nearest SAME-DEPTH parent by X → insert by X) ===
if (dir === +1){
  // Root special-case (unchanged behavior)
  if (!selH.parent){
    const kids = selH.children || [];
    if (!kids.length) { logyq.selection.showToast('Root has no children'); return; }
    const promotedH = kids.slice().sort((a,b)=>a.x - b.x)[0];

    const before = utils.deepClone(state.root.data);
    const work   = utils.deepClone(state.root.data);

    const oldRootData  = work;
    const promotedData = utils.findByUid(work, promotedH.data._uid);
    if (!promotedData) return;

    oldRootData.children = oldRootData.children || [];
    const pIdx = oldRootData.children.findIndex(c => c && c._uid === promotedData._uid);
    if (pIdx >= 0) oldRootData.children.splice(pIdx, 1);

    const newRoot = promotedData;
    newRoot.children = newRoot.children || [];

    const liveOrder = new Map((kids || []).map(h => [h.data._uid, h.x]));
    const rest = (oldRootData.children || []).slice().sort(
      (a,b) => (liveOrder.get(a._uid) || 0) - (liveOrder.get(b._uid) || 0)
    );
    rest.forEach(ch => newRoot.children.push(ch));

    const formerRootAsChild = { name: oldRootData.name, _uid: oldRootData._uid };
    const liveKidsSorted = (kids || []).slice().sort((a,b) => a.x - b.x);
    const xByUid = new Map(liveKidsSorted.map(h => [h.data._uid, h.x]));
    const xs = newRoot.children.map(ch => xByUid.get(ch._uid)).filter(v => typeof v === 'number');
    const x0 = selH.x;
    let insertAt = 0;
    if (xs.length) {
      const edgePad = CONFIG.CARD_WIDTH;
      const centers = [ xs[0] - edgePad ];
      for (let i=1;i<xs.length;i++) centers.push((xs[i-1]+xs[i])/2);
      centers.push(xs[xs.length-1] + edgePad);
      let best = 0, bestD = Math.abs(x0 - centers[0]);
      for (let i=1;i<centers.length;i++){
        const d = Math.abs(x0 - centers[i]);
        if (d < bestD) { bestD = d; best = i; }
      }
      insertAt = best;
    }
    newRoot.children.splice(insertAt, 0, formerRootAsChild);
    oldRootData.children = null;

    logyq.history.pushHistory({ type:'replace-root', prev: before });
    state.root = d3.hierarchy(newRoot);
    utils.assignIds(state.root);
    logyq.treeManager.layoutAndRender(false);
    logyq.selection.setSelected(formerRootAsChild._uid);
    logyq.camera.checkMoatAndAutoFit('vhold');
    return;
  }

  // Non-root: SAME-DEPTH adoption (fix)
  const x0  = selH.x;

  const movingDescUids = new Set(selH.descendants().map(d => d.data._uid));

  // Nearest peer at the SAME depth (exclude self/descendants)
  const peers = state.root.descendants()
    .filter(n => n.depth === selH.depth && n.data._uid !== uid && !movingDescUids.has(n.data._uid))
    .sort((a,b) => {
      const dA = Math.abs(a.x - x0), dB = Math.abs(b.x - x0);
      return dA === dB ? (a.x - b.x) : (dA - dB); // tie → left
    });

  if (!peers.length){ logyq.selection.showToast('No peer to adopt under'); return; }
  const targetParentH = peers[0];

  // Position among target’s children by live X
  function insertIndexByX(parentH, movingX){
    const kidsLive = (parentH.children || [])
      .filter(k => k && k.data && k.data._uid !== uid)
      .slice().sort((a,b)=>a.x - b.x);
    if (!kidsLive.length) return 0;
    const firstGreater = kidsLive.findIndex(k => k.x > movingX);
    if (firstGreater === -1) return kidsLive.length;
    if (firstGreater === 0)  return 0;
    const pdata = utils.findByUid(state.root.data, parentH.data._uid);
    const arr   = pdata?.children || [];
    const leftUid = kidsLive[firstGreater - 1].data._uid;
    const leftIdx = arr.findIndex(c => c && c._uid === leftUid);
    return (leftIdx >= 0) ? leftIdx + 1 : Math.min(firstGreater, arr.length);
  }

  // DATA ops: detach first, then insert
  const before = utils.deepClone(state.root.data);
  const work   = utils.deepClone(state.root.data);

  const nodeData   = utils.findByUid(work, uid);
  const curParent  = utils.findByUid(work, selH.parent.data._uid);
  const destParent = utils.findByUid(work, targetParentH.data._uid);
  if (!nodeData || !curParent || !destParent) return;

  // Detach
  if (Array.isArray(curParent.children)){
    const idx = curParent.children.findIndex(c => c && c._uid === uid);
    if (idx >= 0) curParent.children.splice(idx, 1);
    if (!curParent.children || curParent.children.length === 0) curParent.children = null;
  }

  // Insert under new parent by X
  destParent.children = destParent.children || [];
  const at = Math.max(0, Math.min(insertIndexByX(targetParentH, x0), destParent.children.length));
  destParent.children.splice(at, 0, nodeData);

  logyq.history.pushHistory({ type: 'replace-root', prev: before });
  state.root = d3.hierarchy(work);
  utils.assignIds(state.root);
  logyq.treeManager.layoutAndRender(false);
  logyq.selection.setSelected(uid);
    logyq.camera.checkMoatAndAutoFit('vhold');
  return;
}



























}

  attach('structure', {
    moveSelectedHorizontally,
    moveSelectedVertically,
  });
  /* ======================= DETECTOR ENGINE ======================= */
  const Detectors = (()=>{
    const PRIORITY = { rootAbove:0 /* [patch] rootAbove-lowest */, rightCousin:5, leftCousin:4, sibling:3, node:2, edgeSibling:1 };

    function makeRect(kind, x, y, w, h, depth, extra){
      return Object.assign({ kind, x, y, width:w, height:h, depth }, extra||{});
    }

    function build(root){
      const CONFIG = logyq.config
      if(!root) return [];
      const dets=[];
      const byDepth = d3.groups(root.descendants(), d=>d.depth).sort((a,b)=>a[0]-b[0]);

      // --- new: root-above detector (large horizontal target above the root row)
      const r = root;
      const aboveH = (Math.max(16, CONFIG.CARD_HEIGHT * 0.9) * 13); /* [patch] rootAbove-bigger */
      const aboveW = (CONFIG.CARD_WIDTH * 18); /* [patch] rootAbove-bigger */
      const aboveY = (r.y - CONFIG.CARD_HEIGHT/2 + (CONFIG.DETECTOR_OVERLAP_PX||2)) - aboveH; /* [patch] rootAbove-overlap */
      dets.push(makeRect("rootAbove", r.x - aboveW/2, aboveY, aboveW, aboveH, -1, { rowY: aboveY + aboveH }));




      






      for(const [depth, nodes] of byDepth){
        const sorted = nodes.slice().sort((a,b)=>a.x-b.x);
        const laneY = logyq.layout.laneYForDepth(depth);
        const laneH = logyq.layout.laneHeightForDepth(depth);

        // anchor detectors to lane top so they can extend downward by factor
        const rectY = laneY - (CONFIG.CARD_HEIGHT/2) + (CONFIG.LANE_Y_OFFSET||11);
        const detH = Math.max(laneH, laneH * Math.max(1, CONFIG.DETECTOR_DEPTH_FACTOR)) + CONFIG.DETECTOR_OVERLAP_PX;








        const lapelPad = CONFIG.CARD_WIDTH / CONFIG.LAPEL_LEVER;

        // Precompute neighbor gaps for shoulders
        const gaps = new Map();
        for(let i=0;i<sorted.length;i++){
          const n=sorted[i]; const left=sorted[i-1], right=sorted[i+1];
          const leftGap = left ? (n.x - left.x) : 0;
          const rightGap = right ? (right.x - n.x) : 0;
          gaps.set(n, { leftGap, rightGap, hasLeft:!!left, hasRight:!!right, left, right });
        }

        // Node detectors + edge-sibling detectors
        for(let i=0;i<sorted.length;i++){
          const n=sorted[i]; const g=gaps.get(n);
          const edgePad = 2; let leftShoulder  = g.hasLeft ? (g.leftGap*0.5 + lapelPad) : (CONFIG.CARD_WIDTH/2 + edgePad);
          let rightShoulder = g.hasRight ? (g.rightGap*0.5 + lapelPad) : (CONFIG.CARD_WIDTH/2 + edgePad);
  /* [patch] root-wide-hitbox start */
  if (!n.parent && n.children && n.children.length){
    try{
      const childLeft = Math.min(...n.children.map(c => c.x - CONFIG.CARD_WIDTH/2));
      const childRight = Math.max(...n.children.map(c => c.x + CONFIG.CARD_WIDTH/2));
      leftShoulder = Math.max(leftShoulder, n.x - childLeft);
      rightShoulder = Math.max(rightShoulder, childRight - n.x);
    }catch(_e){}
  }
  /* [patch] root-wide-hitbox end */
          const ndw = leftShoulder + rightShoulder;

          dets.push(makeRect('node', n.x - leftShoulder, rectY, ndw, detH, depth, {
            targetUid:n.data._uid
          }));

          // Edge siblings (use shoulders)
          const edgeW = CONFIG.CARD_WIDTH * CONFIG.EDGE_SIBLING_LEVER;
          if(!g.hasLeft && n.parent){
            dets.push(makeRect('edgeSibling', n.x - CONFIG.CARD_WIDTH/2 - edgeW, rectY, edgeW, detH, depth, {
              parentUid:n.parent.data._uid, prevUid:null, nextUid:n.data._uid
            }));
          }
          if(!g.hasRight && n.parent){
            dets.push(makeRect('edgeSibling', n.x + CONFIG.CARD_WIDTH/2, rectY, edgeW, detH, depth, {
              parentUid:n.parent.data._uid, prevUid:n.data._uid, nextUid:null
            }));
          }
        }

        // Gap detectors between adjacent nodes in this lane
        for(let i=0;i<sorted.length-1;i++){
          const L=sorted[i], R=sorted[i+1];
          const gap = R.x - L.x;
          const hole = Math.max(0, gap - CONFIG.CARD_WIDTH);
          const hgr  = 1 - (CONFIG.CARD_WIDTH / gap);
          const famMin = CONFIG.CARD_WIDTH / CONFIG.FAMILY_MIN_LEVER;
          const centerX = (L.x + R.x)/2;
          const sameParent = !!(L.parent && R.parent && L.parent===R.parent);

          const baseWidth = (()=> {
            if (sameParent){
              if(hole < famMin) return famMin;
              if(hgr >= CONFIG.SIBLING_SHARE_THRESHOLD) return gap * CONFIG.SIBLING_SHARE_THRESHOLD;
              return hole;
            } else {
              const cousinMin = CONFIG.CARD_WIDTH / (CONFIG.COUSIN_MIN_LEVER || CONFIG.FAMILY_MIN_LEVER);
              if(hole < cousinMin) return cousinMin;
              if(hgr >= CONFIG.COUSIN_SHARE_THRESHOLD) return gap * CONFIG.COUSIN_SHARE_THRESHOLD;
              return hole;
            }
          })();

          const gdw = Math.min(baseWidth, gap);
          if (gdw <= 0) continue;

          if (sameParent){
            dets.push(makeRect('sibling', centerX - gdw/2, rectY, gdw, detH, depth, {
              parentUid: L.parent ? L.parent.data._uid : null,
              prevUid: L.data._uid,
              nextUid: R.data._uid,
              centerX, rowY: laneY
            }));
          } else {
            const half = gdw/2;
            const overlap = CONFIG.DETECTOR_OVERLAP_PX;

            const leftX  = centerX - half;
            const leftW  = half + overlap;

            const rightX = centerX - overlap/2;
            const rightW = half + overlap;

            dets.push(makeRect('leftCousin',  leftX,  rectY, leftW,  detH, depth, {
              parentUid: L.parent ? L.parent.data._uid : null,
              prevUid: L.data._uid, nextUid: R.data._uid,
              centerX, rowY: laneY
            }));
            dets.push(makeRect('rightCousin', rightX, rectY, rightW, detH, depth, {
              parentUid: R.parent ? R.parent.data._uid : null,
              prevUid: L.data._uid, nextUid: R.data._uid,
              centerX, rowY: laneY
            }));
          }
        }
      }

      return dets;
    }

    function contains(d, x, y){ return (x>=d.x && x<=d.x+d.width && y>=d.y && y<=d.y+d.height); }

    // Hold-drag: mute side-insert only on the origin ghost (and gaps
    // whose both sides are the ghosted subtree). A ghost↔neighbor
    // channel is put-back on the ghost's half and side-insert on the
    // neighbor's — cousin/sibling/edge on other cards stay live.
    function putBackGhost(drop, originUid){
      return { type: 'node', targetUid: originUid, _hit: drop._hit };
    }

    function remapHoldDragGhostDrop(drop, originUid, ghostUids, point){
      if (!drop || drop.type !== 'gap' || !originUid) return drop;
      const ids = ghostUids instanceof Set ? ghostUids : new Set(ghostUids || []);
      if (!ids.size) ids.add(originUid);
      const prevGhost = ids.has(drop.prevUid);
      const nextGhost = ids.has(drop.nextUid);
      if (!prevGhost && !nextGhost) return drop;
      if (prevGhost && nextGhost) return putBackGhost(drop, originUid);

      const hit = drop._hit || {};
      const kind = hit.kind;

      // Outer edge of a ghosted card — no neighbor owns that slot.
      if (kind === 'edgeSibling') return putBackGhost(drop, originUid);

      // Cousin detectors are side-owned: leftCousin → L, rightCousin → R.
      if (kind === 'leftCousin') return prevGhost ? putBackGhost(drop, originUid) : drop;
      if (kind === 'rightCousin') return nextGhost ? putBackGhost(drop, originUid) : drop;

      // Sibling hole: closer to the ghost is home; closer to the
      // neighbor keeps between-insert. Midpoint ties go home.
      const mid = Number.isFinite(hit.centerX)
        ? hit.centerX
        : (Number.isFinite(hit.x) && Number.isFinite(hit.width) ? hit.x + hit.width / 2 : null);
      const x = point?.x;
      if (mid != null && Number.isFinite(x)) {
        const onGhostSide = prevGhost ? x <= mid : x >= mid;
        return onGhostSide ? putBackGhost(drop, originUid) : drop;
      }

      // No geometry: do not steal the neighbor's side-insert.
      return drop;
    }

    function holdDragGhostContext(){
      const { state } = logyq
      if (typeof document === 'undefined' || !document.body?.classList?.contains('v2-branch-drag')) return null;
      const originUid = state.selectedUid;
      if (!originUid) return null;
      const origin = state.root?.descendants?.().find(n => n.data?._uid === originUid);
      const ghostUids = new Set();
      if (origin && typeof origin.descendants === 'function') {
        for (const n of origin.descendants()) {
          if (n?.data?._uid) ghostUids.add(n.data._uid);
        }
      } else {
        ghostUids.add(originUid);
      }
      return { originUid, ghostUids };
    }

    function pick(point){
      const { state } = logyq
      const x=point.x, y=point.y; const hits=[];
      for(const d of state.detectors){ if(contains(d,x,y)) hits.push(d); }
      if(!hits.length) return null;
      hits.sort((a,b)=>{
        if (a.depth!==b.depth) return b.depth - a.depth; // deeper first
        const pa = ( {rootAbove:0 /* [patch] rootAbove-lowest */, rightCousin:5, leftCousin:4, sibling:3, node:2, edgeSibling:1} )[a.kind]||0;
        const pb = ( {rootAbove:0 /* [patch] rootAbove-lowest */, rightCousin:5, leftCousin:4, sibling:3, node:2, edgeSibling:1} )[b.kind]||0;
        if (pa!==pb) return pb - pa; // higher priority first
        const ac = a.x + a.width/2, bc = b.x + b.width/2;
        return Math.abs(x-ac) - Math.abs(x-bc); // closer center
      });
      const top = hits[0];
      let result;
      if (top.kind === "rootAbove") result = { type:"rootAbove", _hit: top };
      else if (top.kind==='node') result = { type:'node', targetUid: top.targetUid, _hit: top };
      else result = { type:'gap', parentUid: top.parentUid||null, prevUid: top.prevUid||null, nextUid: top.nextUid||null, _hit: top };
      const ghost = holdDragGhostContext();
      return ghost ? remapHoldDragGhostDrop(result, ghost.originUid, ghost.ghostUids, point) : result;
    }

    function draw(){
      const { state, elements, config: CONFIG } = logyq
      if(!elements.gDetectors) return;
      elements.gDetectors.selectAll('*').remove();
      if(!CONFIG.SHOW_DETECTORS) return;
      const sel = elements.gDetectors.selectAll('rect').data(state.detectors);
      sel.enter().append('rect')
        .attr('x', d=>d.x).attr('y', d=>d.y).attr('width', d=>d.width).attr('height', d=>d.height)
        .attr('class', d=>`det-rect ${
          d.kind==='node' ? 'det-node' :
          d.kind==='sibling' ? 'det-sibling' :
          d.kind==='leftCousin' ? 'det-cousin-l' :
          d.kind==='rightCousin' ? 'det-cousin-r' : 'det-edge'}`);
    }

    return { build, pick, draw, remapHoldDragGhostDrop };
  })();
  attach('detectors', Detectors)

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

 
 
 
 
 
 
 
 
  function mirrorEditLabel(uid, text){
    const { state, utils } = logyq
    const target = utils.findByUid(state.root?.data, uid)
    if (!target) return
    const next = text == null ? '' : String(text)
    if ((target.name ?? '') === next) return
    target.name = next
    try { logyq.layout.LabelWrap.apply() } catch (_e) {}
  }
  function showEditFocus(uid){
    try { logyq.setEditFocus?.(uid || null) } catch (_e) {}
  }
  function restoreEditName(uid, prev){
    if (prev == null || uid == null) return
    const { state, utils } = logyq
    const target = utils.findByUid(state.root?.data, uid)
    if (!target || (target.name ?? '') === prev) return
    target.name = prev
    try { logyq.layout.LabelWrap.apply() } catch (_e) {}
  }

  function closeNodeEditor(apply, restoreZoom){
    const { state, elements, utils } = logyq
    if(!state.editingUid) return;
    const uid = state.editorEl?.dataset?.editUid || state.editingUid; const el = state.editorEl;
    const prevName = state.editPrevName
    state.editPrevName = null
    showEditFocus(null)
    if (state._editFocusTimer) { try { clearTimeout(state._editFocusTimer); } catch (_e) {} state._editFocusTimer = 0; }
    if (state._editPlaceTimer) { try { clearTimeout(state._editPlaceTimer); } catch (_e) {} state._editPlaceTimer = 0; }
    if (typeof state._editViewportOff === 'function') { try { state._editViewportOff(); } catch (_e) {} state._editViewportOff = null; }
    state.editingUid = null; state.editorEl = null;
    if(el && el.parentNode && !el.closest?.('.node-edit-stack')) el.parentNode.removeChild(el);
    if(apply){
      const target = utils.findByUid(state.root.data, uid);
      if(target){
        const prev = prevName != null ? prevName : (target.name ?? "");
        const next = (el && typeof el.value === "string") ? el.value.trim() : prev;
        if(next !== prev){
          logyq.history.pushHistory({ type:"rename", uid, prev, next });
          target.name = next;
          state.root = d3.hierarchy(state.root.data);
          utils.assignIds(state.root);
          logyq.treeManager.layoutAndRender(false);
          setSelected(uid);
        } else {
          restoreEditName(uid, prev);
        }
      }
    } else {
      restoreEditName(uid, prevName);
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
    state.editPrevName = (d.data && d.data.name) ? String(d.data.name) : '';
    showEditFocus(uid);
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


    input.addEventListener("input", function(){
      if (state.editingUid !== uid) return;
      mirrorEditLabel(uid, input.value);
    });

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



  /* ======================= SELECTION + TOAST ======================= */
/* [patch] selection-helpers start */

function getSelectedUid(){
  const { state } = logyq
  if (state?.selectedUid) return state.selectedUid;
  if (state?.selectedUids && state.selectedUids.size === 1) return [...state.selectedUids][0];
  return null;
}

function applySelectionStyles(){
  const { state, elements } = logyq
  if (!elements.gNodes) return;

  const hasGroup = !!(state.selectedUids && state.selectedUids.size > 0);
  const vFocus = !!(state.vHold && !hasGroup && state.selectedUid);
  const phone = !!logyq.camera?.phoneNoFollowCamera?.();

  elements.gNodes.selectAll("g.node")
    .classed("is-outlined", n =>
      !phone && (
        (!hasGroup && state.selectedUid === n.data._uid) ||
        (hasGroup && state.selectedUids.has(n.data._uid))
      )
    )
    // Selected fill if a group exists (your old behavior) OR while V-hold focus-only.
    .classed("is-filled", n =>
      !phone && (
        (hasGroup && state.selectedUid === n.data._uid) ||
        (vFocus && state.selectedUid === n.data._uid)
      )
    )
    // This class triggers marching-ants via the CSS above (only during V-hold focus-only).
    .classed("is-focus-vhold", n =>
      !phone && vFocus && state.selectedUid === n.data._uid
    );
}




function toggleGroupMembershipOf(uid){
  const { state } = logyq
  if (!uid) return;
 

  if (state.selectedUids.has(uid)) {
    state.selectedUids.delete(uid);
  } else {
    state.selectedUids.add(uid);
  }

  // focus follows actioned node
  state.selectedUid = uid;
  applySelectionStyles();
}


// Move an entire group under the current focus
function moveGroupToTarget(uids, targetUid, { abandon = false } = {}){
  const { state, utils } = logyq
  if (!uids || uids.size === 0 || !targetUid) return;

  // Clone root for undo history
  logyq.history.pushHistory({ type: 'replace-root', prev: utils.deepClone(state.root.data) });

  // Remove all selected nodes from their parents
  const moving = [];
  uids.forEach(uid => {
    const data = removeNode(uid, { abandon });
    if (data) moving.push(data);
  });

  if (moving.length === 0) return;

  // Insert all moving nodes under target
  const target = utils.findByUid(state.root.data, targetUid);
  if (target){
    target.children = target.children || [];
    moving.forEach(m => target.children.push(m));
  }

  // Rebuild hierarchy + re-render
  state.root = d3.hierarchy(state.root.data);
  utils.assignIds(state.root);
  logyq.treeManager.layoutAndRender(false);

  // Refresh selection: keep focus, clear group
  clearGroup();
  state.selectedUid = targetUid;

  showToast(abandon ? 'Group moved (abandon)' : 'Group moved', 1100);
}



// Keep only top-level selected nodes (drop any node whose ancestor is also selected)
function topLevelSelection(uids){
  const { state } = logyq
  if (!state.root || !uids || !uids.size) return [];
  const set = new Set(uids);
  const byUid = new Map(state.root.descendants().map(n => [n.data._uid, n]));
  const top = [];
  for (const uid of set){
    const h = byUid.get(uid); if (!h) continue;
    let p = h.parent, under = false;
    while (p){ if (set.has(p.data._uid)) { under = true; break; } p = p.parent; }
    if (!under) top.push(uid);
  }
  // Insert order: keep left→right by x (stable)
  top.sort((a,b) => {
    const A = byUid.get(a), B = byUid.get(b);
    return (A?.x ?? 0) - (B?.x ?? 0);
  });
  return top;
}




function clearFocus(){ const { state } = logyq; state.selectedUid = null; applySelectionStyles(); }

function clearGroup(){
  const { state } = logyq
  state.selectedUids = new Set(); 
  applySelectionStyles(); 
}


function clearSelection(){
  const { state } = logyq
  state.selectedUid = null;
  applySelectionStyles();
}

function selectSingle(uid){
  const { state } = logyq
  state.selectedUid = uid || null;
  applySelectionStyles();
}






function onNodeMouseDown(event, d){
  const { state, config: CONFIG } = logyq
  if (window.__logyqChipPlacing) return
  if (event.button !== 0) return;                  // left only
  if (logyq.input.isTextField(event.target)) return;

  const uid = d?.data?._uid;
  if (!uid) return;

  // ---------- SHIFT gesture: press-add, click-remove, drag keeps ----------
  if (event.shiftKey){
    const startX = event.clientX;
    const startY = event.clientY;
    const wasInGroup = state.selectedUids.has(uid);
    let moved = false;
    let addedOnDown = false;
    const thresh = (CONFIG && Number.isFinite(CONFIG.DRAG_START_PX)) ? CONFIG.DRAG_START_PX : 4;

    // PRESS = add immediately if not already there (so drag includes it)
    if (!wasInGroup){
      state.selectedUids.add(uid);
      state.selectedUid = uid;          // focus follows
      applySelectionStyles();
      addedOnDown = true;
    }

    // Track drag vs click (do NOT stopPropagation here — let d3.drag run)
    function onMove(mm){
      if (moved) return;
      const dx = Math.abs(mm.clientX - startX);
      const dy = Math.abs(mm.clientY - startY);
      if (dx > thresh || dy > thresh) moved = true;
    }

    function onUp(mu){
      window.removeEventListener('mousemove', onMove, true);
      window.removeEventListener('mouseup', onUp, true);

      // If it was just a click (no drag), run the "Shift-click = remover" rule
      if (!moved){
        mu.preventDefault();
        mu.stopPropagation();
        if (wasInGroup){
          state.selectedUids.delete(uid);
          applySelectionStyles();
        }
        // If we added on mousedown and it was only a click, we keep it added.
      }
      // If it dragged, do nothing here; the add (if any) stays.
    }

    window.addEventListener('mousemove', onMove, true);
    window.addEventListener('mouseup', onUp, true);
    return; // done handling Shift gesture
  }

// ---------- Plain press: focus only (no group change) ----------
state.selectedUid = uid;
applySelectionStyles();
}












function setSelected(uid){
  const { state } = logyq
  state.selectedUid = uid || null;
  applySelectionStyles();           // no group reset here
}



  function showToast(msg, ms){
    const { elements } = logyq
    const el=elements.Toast; if(!el) return;
    el.textContent=msg||""; el.style.display="inline-flex";
    clearTimeout(showToast._t);
    showToast._t=setTimeout(()=>{ el.style.display="none"; }, ms||1200);
  }

  /* ======================= DROP FLASH ======================= */
  function flashMoved(uid){
    const { elements } = logyq
    try{
      const sel = elements.gNodes.selectAll("g.node").filter(n=> n && n.data && n.data._uid===uid);
      sel.classed("drop-flash", true);
      setTimeout(()=> sel.classed("drop-flash", false), 560);
    }catch(_e){}
  }

  /* ======================= CARET POSITION ======================= */
  function caretXYFromHit(hit){
    const { state, config: CONFIG } = logyq
    /* [patch] edgeSibling-caret-sibling start */
    if (hit && hit.kind === "edgeSibling" && state.root) {
      if (hit.nextUid) {
        const sib = state.root.descendants().find(n => n.data && n.data._uid === hit.nextUid);
        if (sib) {
          const cx = sib.x - CONFIG.CARD_WIDTH/2;
          const cy = sib.y;
          return [cx, cy];
        }
      } else if (hit.prevUid) {
        const sib = state.root.descendants().find(n => n.data && n.data._uid === hit.prevUid);
        if (sib) {
          const cx = sib.x + CONFIG.CARD_WIDTH/2;
          const cy = sib.y;
          return [cx, cy];
        }
      }
    }
    /* [patch] edgeSibling-caret-sibling end */
/* [patch] edgeSibling-caret start */    if (hit && hit.kind === 'edgeSibling' && state.root) {      const parent = state.root.descendants().find(n => n.data && n.data._uid === hit.parentUid);      if (parent) {        const isLeft = (hit.nextUid !== null);        const cx = parent.x + (isLeft ? -CONFIG.CARD_WIDTH/2 : CONFIG.CARD_WIDTH/2);        const cy = hit.rowY || (parent.y + CONFIG.CARD_HEIGHT/2);        return [cx, cy];      }    }    /* [patch] edgeSibling-caret end */
    if(hit && hit.kind === "rootAbove" && state.root){
      const cx = state.root.x;
      const cy = (hit.rowY != null) ? hit.rowY : (state.root.y - CONFIG.CARD_HEIGHT);
    /* [patch] cousin-caret start */ 
    // cousins now default to sibling/edge behavior; no special-case caret math 
    /* [patch] cousin-caret end */
      return [cx, cy];
    }
    const cy = (hit && hit.rowY != null) ? hit.rowY : logyq.layout.laneYForDepth((hit?.depth||0)+1);
    let cx = hit.x + hit.width/2;

    if(hit.kind==='sibling' && 'centerX' in hit){
      cx = hit.centerX;
    } else if(hit.kind==='leftCousin' && hit.prevUid && state.root){
      const L = state.root.descendants().find(n=>n.data._uid===hit.prevUid);
      if(L) cx = L.x + CONFIG.CARD_WIDTH/2;
    } else if(hit.kind==='rightCousin' && hit.nextUid && state.root){
      const R = state.root.descendants().find(n=>n.data._uid===hit.nextUid);
      if(R) cx = R.x - CONFIG.CARD_WIDTH/2;
    }
    /* [patch] cousin-caret start */ 
    // cousins now default to sibling/edge behavior; no special-case caret math 
    /* [patch] cousin-caret end */
    return [cx, cy];
  }


  function insertNodeAtDrop(movingData, drop){
  const { state, utils } = logyq
  if (!drop) return false;

  if (drop.type === 'gap'){
    const parent = utils.findByUid(state.root.data, drop.parentUid);
    if (!parent) return false;
    parent.children = parent.children || [];

    const findIdx = (arr, uid) =>
      Array.isArray(arr) ? arr.findIndex(c => c && c._uid === uid) : -1;

    let insertAt = parent.children.length;
    const pIdx = findIdx(parent.children, drop.prevUid);
    const nIdx = findIdx(parent.children, drop.nextUid);
    if (nIdx !== -1) insertAt = nIdx;
    if (pIdx !== -1) insertAt = pIdx + 1;

    parent.children.splice(insertAt, 0, movingData);
    return { toParentUid: parent._uid, toIndex: insertAt };
  }











  if (drop.type === 'node'){
    const target = utils.findByUid(state.root.data, drop.targetUid);
    if (!target) return false;
    target.children = target.children || [];
    target.children.push(movingData);
    return { toParentUid: target._uid, toIndex: target.children.length - 1 };
  }

  if (drop.type === 'rootAbove'){
    // Make the moving node the new root, old root becomes its child.
    const prev = utils.deepClone(state.root.data);
    const newRoot = movingData;
    newRoot.children = newRoot.children || [];
    newRoot.children.push(prev);
    logyq.history.pushHistory({ type:'replace-root', prev });
    state.root = d3.hierarchy(newRoot); utils.assignIds(state.root);
    return 'ROOT_DONE';
  }

  return false;
}


// Move currently selected nodes under a targetUid.
// abandon=false => move full subtree
// abandon=true  => move node-only (children stay/promote at source)
function moveSelectionToTarget(targetUid, { abandon = false } = {}){
  const { state, utils } = logyq
  if (!state.root) return;
  const group = state.selectedUids || new Set();
  if (!group.size) { showToast('Nothing selected', 1000); return; }

  // Resolve target fallback: focus → root
  const fallbackTarget = state.root?.data?._uid || null;
  const tUid = targetUid || fallbackTarget;
  if (!tUid) return;

  // Don’t allow moving a node into itself or into its own descendant
  const isDescendant = (ancestorUid, maybeDescUid) => {
    const rootData = state.root?.data;
    const path = utils.pathToUid(rootData, maybeDescUid);
    return Array.isArray(path) && path.includes(ancestorUid);
  };

  // Compute top-level unique sources
  const sources = topLevelSelection(group)
    // drop illegal targets (self/descendant of source)
    .filter(uid => (uid !== tUid) && !isDescendant(uid, tUid));

  if (!sources.length) {
    showToast('No valid nodes to move', 1000);
    return;
  }

  // Single history snapshot covering all moves
  logyq.history.pushHistory({ type: 'replace-root', prev: utils.deepClone(state.root.data) });

  // Perform moves one-by-one into {type:'node', targetUid}
  // We rebuild the hierarchy once at the end for performance/stability.
  for (const srcUid of sources){




    // Build payload to insert
    let moving = utils.findByUid(state.root.data, srcUid); //lemon
    if (!moving) continue;
    moving = utils.deepClone(moving);
    if (abandon) moving.children = null;

    // Insert
    insertNodeAtDrop(moving, { type: 'node', targetUid: tUid });

    // Remove original (full or abandon-promote)
    removeNode(srcUid, { abandon });
  }







  // Rebuild, render, and update selection/focus
  state.root = state.root ? d3.hierarchy(state.root.data) : null;
  if (state.root) utils.assignIds(state.root);

  // After move, make the target focused and clear group
  clearGroup();
  if (tUid) selectSingle(tUid);

  logyq.treeManager.layoutAndRender(false);
  showToast(abandon ? 'Abandonment paste' : 'Pasted', 1000);
}








// Remove a node from the tree.
// - abandon=false: remove the whole node (subtree)
// - abandon=true: remove ONLY the node; promote its children into its parent
function removeNode(uid, { abandon = false } = {}){
  const { state, utils } = logyq
  const path = utils.pathToUid(state.root.data, uid);
  if (!path) return null;

  // Root case
  if (path.length === 1){
    const kidsH = (state.root.children || []).slice().sort((a,b)=>a.x-b.x);
    if (abandon){
      // Promote leftmost child as new root; others become its siblings
      if (!kidsH.length){ state.root = null; return 'ROOT_REMOVED'; }
      const newRoot = kidsH[0].data;
      const others  = kidsH.slice(1).map(n => n.data);
      newRoot.children = (newRoot.children || []).concat(others);
      state.root = d3.hierarchy(newRoot); utils.assignIds(state.root);
      return 'ROOT_REPLACED';
    } else {
      const data = state.root.data;
      state.root = null;
      return data; // removed subtree
    }
  }



  // Non-root
  const parentUid = path[path.length - 2];
  const parent = utils.findByUid(state.root.data, parentUid);
  const idx = (parent.children || []).findIndex(c => c && c._uid === uid);
  const data = (parent.children || [])[idx];

  if (abandon){
    const kids = (data && data.children) ? data.children.slice() : [];
    parent.children.splice(idx, 1, ...kids);
    if (data) data.children = null;  // ← strip children on the returned node
  } else {
    parent.children.splice(idx, 1);
  }
  if (parent.children && parent.children.length === 0) parent.children = null;
  return data;


}




// ===== HOISTED HOLD HANDLERS (live outside the big keydown) =====








// --- V-hold handlers (focus-only visuals) ---
// Bubble-phase on window so document-capture keyDispatcher can bail on
// state.vHold first, then these still run. Do not change to capture.
function onVHoldDown(e) {
  const { state, elements } = logyq
  if (logyq.input.isTextField(e.target)) return;
  if ((e.key === 'v' || e.key === 'V') && !e.ctrlKey && !e.metaKey && !e.altKey){
    const noGroup = !(state.selectedUids && state.selectedUids.size > 0);
    if (noGroup && state.selectedUid){
      state.vHold = true;
      elements.svg?.classed?.('vhold-mode', true);  // enables CSS marching ants
      applySelectionStyles();
    }
  }
}
window.addEventListener('keydown', onVHoldDown, { passive: true });


// While V-hold and no group: immediate push with J/L or ArrowLeft/Right
function onVHoldMove(e) {
  const { state } = logyq
  if (!state.vHold) return;
  if (logyq.input.isTextField(e.target)) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  const k = e.key;
  if (k === 'j' || k === 'J' || k === 'ArrowLeft'){
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();  // <<< add these

    logyq.structure.moveSelectedHorizontally(-1);
  } else if (k === 'l' || k === 'L' || k === 'ArrowRight'){
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();  // <<< add these

    logyq.structure.moveSelectedHorizontally(+1);
  }

 // UP  ← NEW
  if (k === 'i' || k === 'I' || k === 'ArrowUp'){
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    logyq.structure.moveSelectedVertically(-1);
    return;
  }


   // DOWN  ← NEW
  if (k === 'k' || k === 'K' || k === 'ArrowDown'){
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    logyq.structure.moveSelectedVertically(+1);
    return;
  }


}
window.addEventListener('keydown', onVHoldMove, { passive: false });




function onVHoldUp(e) {
  const { state, elements } = logyq
  if (e.key === 'v' || e.key === 'V'){
    state.vHold = false;
    elements.svg?.classed?.('vhold-mode', false);
    applySelectionStyles();
  }
}
window.addEventListener('keyup', onVHoldUp, { passive: true });


// ===== END HOISTED HOLD HANDLERS =====







// Hotkeys: G (group), V (paste), Shift+V (abandonment paste)
// NOTE: Esc is handled elsewhere already; we don't handle Esc here to avoid duplicates.
function onGroupHotkeys(e) {
  const { state } = logyq
  // Don’t steal keys from inputs
  if (logyq.input.isTextField(e.target)) return;

  // --- G / Shift+G: group toggles ---
  if ((e.key === 'g' || e.key === 'G') && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();

    if (e.shiftKey) {
      // Shift+G => clear group AND focus
      clearGroup();
      clearFocus();
      showToast('Group cleared', 900);
      return;
    }

    // G => toggle selectedUid in/out of the group
    const uid = state.selectedUid;
    if (!uid) {
      showToast('No focus to toggle', 900);
      return;
    }
    toggleGroupMembershipOf(uid);
    showToast('Toggled group membership', 900);
    return;
  }

  // --- V / Shift+V: paste group under current focus (if a group exists) ---
  if ((e.key === 'v' || e.key === 'V') && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const hasGroup = !!(state.selectedUids && state.selectedUids.size > 0);
    if (!hasGroup) return; // visuals/hold mode handle focus-only case
    e.preventDefault();

    const targetUid = state.selectedUid;
    if (!targetUid) {
      showToast('No focus target', 900);
      return;
    }
    moveGroupToTarget(state.selectedUids, targetUid, { abandon: e.shiftKey });
    return;
  }

  // (No Esc handler here — you already have a separate global Esc listener.)
}
window.addEventListener('keydown', onGroupHotkeys, { passive: false });





// ==========================================================================

  attach('selection', {
    getSelectedUid,
    applySelectionStyles,
    toggleGroupMembershipOf,
    moveGroupToTarget,
    topLevelSelection,
    clearFocus,
    clearGroup,
    clearSelection,
    selectSingle,
    onNodeMouseDown,
    setSelected,
    showToast,
    flashMoved,
    caretXYFromHit,
    insertNodeAtDrop,
    moveSelectionToTarget,
    removeNode,
    onVHoldDown,
    onVHoldMove,
    onVHoldUp,
    onGroupHotkeys,
  })



/* [patch] multi-node-trash helper start */
function deleteNodesToTrash(uids){
  const { state, utils } = logyq
  if (!state.root || !Array.isArray(uids) || !uids.length) return;

  // If root is selected, delete the whole tree.
  const rootUid = state.root.data && state.root.data._uid;
  if (rootUid && uids.includes(rootUid)){
    logyq.history.pushHistory({ type: 'delete-root', subtree: utils.deepClone(state.root.data) });
    state.root = null;
    logyq.selection.clearGroup();
    logyq.selection.clearSelection();
    logyq.drag.clear();
    logyq.treeManager.renderEmpty();
    return;
  }

  // Keep only top-level selections (drop any node whose ancestor is also selected)
  const set = new Set(uids);
  const byUid = new Map(state.root.descendants().map(n => [n.data._uid, n]));
  const topLevel = [];
  for (const uid of set){
    const n = byUid.get(uid);
    if (!n) continue;
    let p = n.parent, underSelectedAncestor = false;
    while (p){ if (set.has(p.data._uid)) { underSelectedAncestor = true; break; } p = p.parent; }
    if (!underSelectedAncestor) topLevel.push(uid);
  }

  // Delete each selected subtree
  for (const uid of topLevel){
    const nodeData = utils.findByUid(state.root.data, uid);
    if (!nodeData) continue;

    const parentPath = utils.pathToUid(state.root.data, uid); // path to node
    if (!parentPath || parentPath.length < 2) continue;       // (root already handled)
    const parentUid = parentPath[parentPath.length - 2];
    const parent = utils.findByUid(state.root.data, parentUid);
    if (!parent) continue;

    const idx = (parent.children || []).findIndex(c => c && c._uid === uid);
    logyq.history.pushHistory({
      type: 'delete',
      parentPath: utils.pathToUid(state.root.data, parent._uid),
      index: idx,
      subtree: utils.deepClone(nodeData)
    });

    if (idx > -1) parent.children.splice(idx, 1);
    if (parent.children && parent.children.length === 0) parent.children = null;
  }

state.root = d3.hierarchy(state.root.data);
utils.assignIds(state.root);
logyq.selection.clearGroup();        // <— add this
logyq.selection.clearSelection();    // keep if you still want focus cleared

}
/* [patch] multi-node-trash helper end */


/* [patch] delete-selected-node-only helper start */
function deleteSelectedNodeOnly(){
  const { state, utils } = logyq
  if (!state.root) return;
  if (!state.selectedUids || state.selectedUids.size !== 1) return;

  const uid = [...state.selectedUids][0];
  const h = state.root.descendants().find(n => n.data && n.data._uid === uid);
  if (!h) return;

  // Snapshot whole tree so Undo just works
  const prev = utils.deepClone(state.root.data);

  // Deleting the root: promote the leftmost child to be the new root.
  if (!h.parent){
    const kidsH = (state.root.children || []).slice().sort((a,b)=>a.x-b.x);
    // If the root has no children, the map becomes empty
    if (kidsH.length === 0){
      logyq.history.pushHistory({ type: 'replace-root', prev });
      state.root = null;
      logyq.selection.clearGroup();
      logyq.selection.clearSelection();
      logyq.treeManager.renderEmpty();
      return;
    }
    const newRootData = kidsH[0].data;
    const others = kidsH.slice(1).map(n => n.data);

    // New root gets the other former root-children as its children too
    newRootData.children = (newRootData.children || []).concat(others);

    logyq.history.pushHistory({ type: 'replace-root', prev });
    state.root = d3.hierarchy(newRootData);
    utils.assignIds(state.root);
    logyq.selection.clearGroup(); 
    logyq.selection.clearSelection();
    logyq.selection.selectSingle(state.root.data._uid);
    return;
  }

  // Non-root: remove the node but keep its children in place under the same parent
  const parentData = h.parent.data;
  const arr = parentData.children || (parentData.children = []);
  const idx = arr.findIndex(c => c && c._uid === uid);
  const kids = (h.data.children || []).slice();

  logyq.history.pushHistory({ type: 'replace-root', prev });

  if (idx > -1){
    // replace the node with its children
    arr.splice(idx, 1, ...kids);
    if (arr.length === 0) parentData.children = null;
  }

  state.root = d3.hierarchy(state.root.data);
  utils.assignIds(state.root);
  logyq.selection.clearSelection();
  logyq.selection.selectSingle(parentData._uid);
}
/* [patch] delete-selected-node-only helper end */

/* [patch] delete-selected-nodes-only (multi) start */
function deleteSelectedNodesOnly(){
  const { state, utils } = logyq
  if (!state.root || !state.selectedUids || state.selectedUids.size === 0) return;

  // Snapshot once so Undo restores the whole tree in one step
  const prev = utils.deepClone(state.root.data);
  logyq.history.pushHistory({ type: 'replace-root', prev });

  const selected = Array.from(state.selectedUids);
  const set = new Set(selected);

  // If the root is selected, promote its leftmost child to become the new root
  const rootUid = state.root.data && state.root.data._uid;
  if (rootUid && set.has(rootUid)){
    const kidsH = (state.root.children || []).slice().sort((a,b)=>a.x-b.x);
    if (kidsH.length === 0){
      // deleting the only root node leaves an empty tree
      state.root = null;
      logyq.selection.clearSelection();
      logyq.treeManager.renderEmpty();
      return;
    }
    const newRootData = kidsH[0].data;
    const others = kidsH.slice(1).map(h=>h.data);
    newRootData.children = (newRootData.children || []).concat(others);

    state.root = d3.hierarchy(newRootData);
    utils.assignIds(state.root);

    // root handled; remove it from the set and continue
    set.delete(rootUid);
  }

  // Keep only top-level selections (skip nodes whose ancestor is also selected)
  const byUid = new Map(state.root ? state.root.descendants().map(n => [n.data._uid, n]) : []);
  const top = [];
  for (const uid of set){
    const h = byUid.get(uid) || (state.root && state.root.descendants().find(n => n.data._uid === uid));
    if (!h) continue;
    let p = h.parent, under = false;
    while (p){ if (set.has(p.data._uid)) { under = true; break; } p = p.parent; }
    if (!under) top.push(uid);
  }

  // Delete-dehydrate deepest first so indexing stays sane
  top.sort((a,b) => {
    const da = (byUid.get(a) || state.root.descendants().find(n=>n.data._uid===a))?.depth ?? 0;
    const db = (byUid.get(b) || state.root.descendants().find(n=>n.data._uid===b))?.depth ?? 0;
    return db - da;
  });

  // For each selected node: remove the node but keep its children with the same parent
  for (const uid of top){
    const h = state.root.descendants().find(n => n.data && n.data._uid === uid);
    if (!h || !h.parent) continue; // (root already handled above)
    const parentData = h.parent.data;
    const arr = parentData.children || (parentData.children = []);
    const idx = arr.findIndex(c => c && c._uid === uid);
    const kids = (h.data.children || []).slice();
    if (idx > -1){
      arr.splice(idx, 1, ...kids);
      if (arr.length === 0) parentData.children = null;
    }
  }

  // Rebuild hierarchy and clear selection
  state.root = state.root ? d3.hierarchy(state.root.data) : null;
  if (state.root) utils.assignIds(state.root);
  logyq.selection.clearSelection();
}
/* [patch] delete-selected-nodes-only (multi) end */


function exportGIQ(){
  const { state } = logyq
  if (!state.root) return '';

  const jsonPart = JSON.stringify(state.root.data, null, 2);

  // grab whatever word bank structure you use (adjust if different)
  const wordBank = (state.wordBank || []).join(',');

  return `${jsonPart}\n###\n${wordBank}\n$$$`;
}


  attach('deletion', {
    deleteNodesToTrash,
    deleteSelectedNodeOnly,
    deleteSelectedNodesOnly,
    exportGIQ,
  });
function commitCreatedNode(uid, { noEdit = false, select = true, layout = true } = {}) {
  const { state } = logyq
  if (select) logyq.selection.setSelected(uid)
  if (layout === false) return uid
  const after = !noEdit ? () => {
    const h = state.root?.descendants().find(n => n.data._uid === uid)
    if (h) logyq.editing.openNodeEditor(h)
  } : null
  if (typeof logyq.treeManager.requestCreateLayout === 'function') {
    logyq.treeManager.requestCreateLayout(after)
  } else {
    state.root = d3.hierarchy(state.root.data)
    logyq.utils.assignIds(state.root)
    logyq.treeManager.layoutAndRender(false)
    try { after?.() } catch (_e) {}
  }
  return uid
}

function addChildOf(parentUid, newName = '', opts = {}) {
  const { noEdit = false, select = true, layout = true } = opts;
  const { state, utils } = logyq

  const parent = utils.findByUid(state.root?.data, parentUid);
  if (!parent) return null;

  parent.children = parent.children || [];
  const newNode = { name: newName };
  utils.assignUids(newNode);

  // record history so Undo removes this node
  logyq.history.pushHistory({
    type: 'add',
    parentPath: utils.pathToUid(state.root.data, parentUid),
    uid: newNode._uid
  });

  parent.children.push(newNode);
  return commitCreatedNode(newNode._uid, { noEdit, select, layout });
}


function addSiblingRightOf(uid, newName = '', opts = {}){
  return insertSibling(uid, newName, { side: 'right', rootAsChild: true, ...opts });
}

function addSiblingLeftOf(uid, newName = '', opts = {}){
  return insertSibling(uid, newName, { side: 'left', rootAsChild: false, ...opts });
}

function insertSibling(uid, newName = '', opts = {}){
  const { side = 'right', noEdit = false, select = true, rootAsChild = side === 'right' } = opts;
  const { state, utils } = logyq
  if (!state.root) return null;
  const path = utils.pathToUid(state.root.data, uid);
  if (!path || path.length < 2){
    return rootAsChild ? addChildOf(uid, newName, { noEdit, select }) : null;
  }
  const parentUid = path[path.length - 2];
  const parent = utils.findByUid(state.root.data, parentUid);
  if (!parent) return null;
  parent.children = parent.children || [];

  const ix = parent.children.findIndex(c => c && c._uid === uid);
  if (ix < 0) return null;
  const newNode = { name: newName };
  utils.assignUids(newNode);

  logyq.history.pushHistory({ type: 'add', parentPath: utils.pathToUid(state.root.data, parentUid), uid: newNode._uid });

  parent.children.splice(side === 'left' ? ix : Math.max(0, ix) + 1, 0, newNode);
  return commitCreatedNode(newNode._uid, { noEdit, select, layout: opts.layout !== false });
}

function insertParentAbove(uid, newName = '', opts = {}){
  const { noEdit = false, select = true } = opts;
  const { state, utils } = logyq
  if (!state.root || !uid) return null;
  const h = state.root.descendants().find(n => n?.data?._uid === uid);
  if (!h) return null;
  // Flick up on the root has no parent slot to splice into. Wrap the
  // whole tree: a new card becomes root and the current root is its child.
  if (!h.parent) {
    if (h.data !== state.root.data) return null;
    const prevTree = utils.deepClone(state.root.data);
    logyq.history.pushHistory({ type: 'replace-root', prev: prevTree });
    const newParent = { name: newName, children: [h.data] };
    utils.assignUids(newParent);
    state.root = d3.hierarchy(newParent);
    utils.assignIds(state.root);
    return commitCreatedNode(newParent._uid, { noEdit, select, layout: opts.layout !== false });
  }

  const parentData = h.parent.data;
  parentData.children = parentData.children || [];
  const idx = parentData.children.findIndex(c => c && c._uid === uid);
  if (idx < 0) return null;

  const prevTree = utils.deepClone(state.root.data);
  logyq.history.pushHistory({ type: 'replace-root', prev: prevTree });

  const newParent = { name: newName, children: [h.data] };
  utils.assignUids(newParent);
  parentData.children.splice(idx, 1, newParent);
  return commitCreatedNode(newParent._uid, { noEdit, select, layout: opts.layout !== false });
}


/* ---------- add SUBTREE (object with {name, children}) as rightmost child ---------- */
function addSubtreeChildOf(parentUid, subtreeData){
  const { state, utils } = logyq
  if (!subtreeData) return null;

  // ensure every node has a _uid
  (function assignAll(n){
    utils.assignUids(n);
    (n.children || []).forEach(assignAll);
  })(subtreeData);

  // CASE 1: no tree yet → make this the root
  if (!state.root){
    logyq.history.pushHistory({ type: 'add-root' });
    state.root = d3.hierarchy(subtreeData); utils.assignIds(state.root);
    logyq.treeManager.layoutAndRender(true);
    logyq.selection.selectSingle(state.root.data._uid);
    return state.root.data._uid;
  }

  // CASE 2: parentUid given → append under it
  if (parentUid){
    const parent = utils.findByUid(state.root.data, parentUid);
    if (!parent) return null;
    parent.children = parent.children || [];
    parent.children.push(subtreeData);

    logyq.history.pushHistory({ type: 'add', parentPath: utils.pathToUid(state.root.data, parentUid), uid: subtreeData._uid });
    state.root = d3.hierarchy(state.root.data); utils.assignIds(state.root);
    logyq.treeManager.layoutAndRender(false);
    logyq.selection.setSelected(subtreeData._uid);
    return subtreeData._uid;
  }

  return null;
}


/* ---------- Parsers: JSON first, then GIQ ---------- */
function tryParsePureJSON(str){
  try { return JSON.parse(str); } catch (_) { return null; }
}

function tryParseGIQ(str){
  // Split into parts: JSON / word bank
  const [jsonPart, wordBankPart] = str.split(/###|\$\$\$/);

  if (!jsonPart) return null;

  let tree = null;
  try {
    tree = JSON.parse(jsonPart.trim());
  } catch (e){
    return null; // not valid JSON
  }

  // wordBankPart: comma-separated values
  const wordBank = (wordBankPart || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  return { tree, hashtags: [], wordBank };
}




function parseIncoming(str){
  if (!str || !str.trim()) return null;

  // 1) pure JSON?
  const j = tryParsePureJSON(str.trim());
  if (j) return { tree: j, hashtags: [], wordBank: [] };

  // 2) GIQ?
  const g = tryParseGIQ(str);
  if (g) return g;

  return null; // not JSON/GIQ
}



/* [patch] drop-to-bank helpers start */
function __namesFromSubtree(nodeData){
  const out = [];
  (function walk(n){
    if (!n) return;
    const name = n.name == null ? '' : String(n.name).trim();
    if (name) out.push(name);
    (n.children || []).forEach(walk);
  })(nodeData);
  return out;
}


function dropSelectedToWordBank({ onlyNode = false } = {}) {
  const { state, utils } = logyq
  if (window.__logyqHoldDragFrozen?.()) return;
  if (window.__logyqHoldDragBlocksBank?.()) return;
  if (!window.__logyqHoldDragAllowBank && !window.__logyqExplicitBankCommit) return;
  if (!state.root) { showToast('Nothing to drop'); return; }
  const count = state.selectedUids ? state.selectedUids.size : 0;
  if (count === 0) { showToast('Select node(s) to return'); return; }

  const prevTree = utils.deepClone(state.root.data);
  const prevBank = state.wordBank.slice();

  // Build list of selected UIDs and filter to top-level ones
  const selected = Array.from(state.selectedUids || []);
  const byUid = new Map(state.root.descendants().map(n => [n.data._uid, n]));

  const topLevel = selected.filter(uid => {
    const h = byUid.get(uid);
    if (!h) return false;
    // exclude nodes whose ancestor is also selected
    let p = h.parent;
    while (p) {
      if (selected.includes(p.data._uid)) return false;
      p = p.parent;
    }
    return true;
  });

  // Process deeper nodes first so indices stay sane
  topLevel.sort((a, b) => {
    const da = (byUid.get(a)?.depth ?? 0);
    const db = (byUid.get(b)?.depth ?? 0);
    return db - da;
  });

  const handleOne = (h) => {
    if (!onlyNode) {
      // Full subtree → WordBank
      const words = __namesFromSubtree(h.data);
      state.wordBank = words.concat(state.wordBank);

      if (!h.parent) {
        // Dropping the root removes entire map
        state.root = null;
        logyq.selection.clearSelection();
        logyq.treeManager.renderEmpty();
        return 'ROOT_REMOVED';
      } else {
        // Remove this subtree from its parent
        const parentData = h.parent.data;
        const arr = parentData.children || (parentData.children = []);
        const idx = arr.findIndex(c => c && c._uid === h.data._uid);
        if (idx > -1) arr.splice(idx, 1);
        if (arr.length === 0) parentData.children = null;
      }
    } else {
      // Node only → WordBank; abandon children in place
      const name = String(h.data?.name ?? '').trim();
      if (name) state.wordBank.unshift(name);

      if (!h.parent) {
        // Root: promote first child as new root
        const kids = (h.children || []).slice();
        if (!kids.length) {
          state.root = null;
          logyq.selection.clearSelection();
          logyq.treeManager.renderEmpty();
          return 'ROOT_REMOVED';
        }
        const newRootData = kids[0].data;
        const others = kids.slice(1).map(c => c.data);
        newRootData.children = (newRootData.children || []).concat(others);

        state.root = d3.hierarchy(newRootData);
        utils.assignIds(state.root);
        logyq.selection.clearSelection();
        logyq.selection.selectSingle(state.root.data._uid);
        logyq.treeManager.layoutAndRender(false);
        return 'ROOT_REPLACED';
      }

      // Non-root: splice out node, promote its children into parent
      const parentData = h.parent.data;
      const arr = parentData.children || (parentData.children = []);
      const idx = arr.findIndex(c => c && c._uid === h.data._uid);
      const kids = (h.data.children || []).slice();
      if (idx > -1) {
        arr.splice(idx, 1, ...kids);
        if (arr.length === 0) parentData.children = null;
      }
    }
    return 'OK';
  };

  // One undo entry for the whole op (tree + bank)
  logyq.history.pushHistory({ type: 'replace-root', prev: prevTree, prevBank });

  // Execute
  topLevel.forEach(uid => {
    const h = byUid.get(uid) || state.root?.descendants().find(n => n.data && n.data._uid === uid);
    if (h) handleOne(h);
  });

  // Rebuild hierarchy & redraw
  state.root = state.root ? d3.hierarchy(state.root.data) : null;
  if (state.root) utils.assignIds(state.root);
  logyq.selection.clearSelection();

  if (state.root) {
    logyq.wordDock.render?.();
    logyq.treeManager.layoutAndRender(false);
  } else {
    logyq.treeManager.renderEmpty();
  }

  showToast(onlyNode ? 'Returned label(s) to WordBank' : 'Returned subtree(s) to WordBank', 900);
}


















function sendSubtreeToWordBank(h){
  const { state, utils } = logyq
  if (window.__logyqHoldDragFrozen?.()) return;
  if (window.__logyqHoldDragBlocksBank?.()) return;
  // Move + dock dwell sets AllowBank. Keyboard D sets ExplicitBankCommit.
  // Anything else (contextmenu, paint, Mix, select, chrome) must not bank.
  if (!window.__logyqHoldDragAllowBank && !window.__logyqExplicitBankCommit) return;
  try{
    const labels = (h?.descendants?.() || []).map(n => (n?.data?.name || '').trim()).filter(Boolean);
    // Blank cards are not words. Skip the bank write and the delete.
    if (!labels.length) return;
    const prevBank = Array.isArray(state.wordBank) ? state.wordBank.slice() : [];
    labels.forEach(lbl => logyq.wordDock.addWords(lbl, 'bank'));


    // Remove subtree (with history)
    if (!h.parent){
      // Deleting the root means clear the tree
      logyq.history.pushHistory({ type: 'delete-root', subtree: utils.deepClone(state.root.data), prevBank });
      state.root = null;
      state.lastNodes = [];
      logyq.drag?.clear?.();
      logyq.treeManager.renderEmpty();
      showToast(`Saved ${labels.length} to Word Dock`);
      return;
    }

    const parentData = h.parent.data;
    const idx = (parentData.children || []).findIndex(c => c && c._uid === h.data._uid);
    logyq.history.pushHistory({
      type: 'delete',
      parentPath: utils.pathToUid(state.root.data, parentData._uid),
      index: idx,
      subtree: utils.deepClone(h.data),
      prevBank
    });
    if (idx > -1) parentData.children.splice(idx, 1);
    if (parentData.children && parentData.children.length === 0) parentData.children = null;

    state.root = d3.hierarchy(state.root.data); utils.assignIds(state.root);
    logyq.treeManager.layoutAndRender(true, true);
    showToast(`Saved ${labels.length} to Word Dock`);
  }catch(_e){}
}

function sendNodeToWordBank_abandon(h){
  const { state, utils } = logyq
  if (window.__logyqHoldDragFrozen?.()) return;
  if (window.__logyqHoldDragBlocksBank?.()) return;
  if (!window.__logyqHoldDragAllowBank && !window.__logyqExplicitBankCommit) return;
  try{
    const label = (h?.data?.name || '').trim();
    if (!label) return;
    if (!h.parent){
      const kidsH = (state.root.children || []).slice().sort((a,b)=>a.x-b.x);
      if (!kidsH.length){ showToast('Root has no child to promote'); return; }
    }
    const prevBank = Array.isArray(state.wordBank) ? state.wordBank.slice() : [];
    logyq.wordDock.addWords(label, 'bank');

    if (!h.parent){
      // Root: promote leftmost child as new root; old root (this label) already banked
      const prevTree = utils.deepClone(state.root.data);
      const kidsH = (state.root.children || []).slice().sort((a,b)=>a.x-b.x);

      const newRootData = kidsH[0].data;
      const others = kidsH.slice(1).map(hh => hh.data);

      // old root becomes “removed node”; its children go with the new root
      const oldRootData = state.root.data;
      oldRootData.children = null;

      const idx = (prevTree.children || []).findIndex(c => c && c._uid === newRootData._uid);
      if (idx > -1) prevTree.children.splice(idx, 1);
      newRootData.children = (newRootData.children || []).concat(others);

      logyq.history.pushHistory({ type: 'replace-root', prev: prevTree, prevBank });
      state.root = d3.hierarchy(newRootData); utils.assignIds(state.root);
      logyq.treeManager.layoutAndRender(false);
      showToast(`Saved "${label}" to Word Dock`);
      return;
    }

    // Non-root: promote this node’s children into its parent, then remove this node
    const moving = h.data;
    const parentData = h.parent.data;

    const fromParentPath = utils.pathToUid(state.root.data, parentData._uid);
    const fromIndex = (parentData.children || []).findIndex(c => c && c._uid === moving._uid);

    const orphans = (moving.children || []).slice();
    if (fromIndex >= 0) parentData.children.splice(fromIndex, 1, ...orphans);
    moving.children = null;

    logyq.history.pushHistory({
      type: 'delete',
      parentPath: fromParentPath,
      index: fromIndex,
      subtree: utils.deepClone(moving),
      prevBank
    });

    state.root = d3.hierarchy(state.root.data); utils.assignIds(state.root);
    logyq.treeManager.layoutAndRender(false);
    showToast(`Saved "${label}" to Word Dock`);
  }catch(_e){}
}



  attach('treeOps', {
    addChildOf,
    addSiblingRightOf,
    addSiblingLeftOf,
    insertSibling,
    insertParentAbove,
    addSubtreeChildOf,
    tryParsePureJSON,
    tryParseGIQ,
    parseIncoming,
    dropSelectedToWordBank,
    sendSubtreeToWordBank,
    sendNodeToWordBank_abandon,
  })


/* ======================= DRAG MANAGER (rewritten) ======================= */
const dragManager = {
  // Highlight subtree (or just this node in solo mode)
  markForDrag(d){
    const { state, elements } = logyq
    const subIds = new Set((state.dragState && state.dragState.solo) ? [d.id] : d.descendants().map(n=>n.id));
    elements.svg.classed("dragging-mode", true);




    elements.gNodes.selectAll("g.node")
      .classed("is-subtree", n=>subIds.has(n.id))
      .classed("is-others", n=>!subIds.has(n.id));
    elements.gLinks.selectAll("path.link")
    
      .classed("is-sub-link", l=>subIds.has(l.target.id))
      .classed("is-parent-link", l=> l.target.id===d.id);






      
  },





  // Reset all drag UI / state
  clear(){
    const { state, elements } = logyq
elements.svg.classed("dragging-mode delete-intent", false);
elements.gNodes.selectAll("g.node")
  .classed("is-subtree is-others dragging drop-target hover-adopt hover-adopt-sub", false);
elements.gLinks.selectAll("path.link").classed("is-sub-link is-parent-link", false);

   
   
   
    elements.dragMiniG.style("opacity",0).style("display","none");
    elements.trash.classList.remove("near","over","open","wiggle");
    elements.caretDot.style("opacity",0);

    state.dragState.trashZone = "far";
    state.dragState.drop = null;
    state.dragState.solo = false;
    state.dragState.multiUids = null;
    state.dragState.groupAbandon = false;

    document.body.classList.remove("global-no-cursor");
  },






  // Where is the pointer relative to the trash
  zone(cx,cy){
    const { state } = logyq
    const r = document.getElementById("trash").getBoundingClientRect();
    const expand=(R,p)=>({left:R.left-p,right:R.right+p,top:R.top-p,bottom:R.bottom+p});
    const inside=(R,x,y)=>x>=R.left&&x<=R.right&&y>=R.top&&y<=R.bottom;
    const nearR=expand(r, 100), overR=expand(r, 16);
    const pad=10, cur=state.dragState.trashZone;

    if(cur==='over'){
      const keep=expand(overR,pad); if(inside(keep,cx,cy)) return 'over';
    }
    if(cur==='near'){
      if(inside(overR,cx,cy)) return 'over';
      const keep=expand(nearR,pad); if(inside(keep,cx,cy)) return 'near';
    }
    if(inside(overR,cx,cy)) return 'over';
    if(inside(nearR,cx,cy)) return 'near';
    return 'far';
  },

behavior(){
  return d3.drag()
    .filter((event) => {
      if (logyq.input.isTextField(event.target)) return false;
      if (typeof document !== "undefined" && document.body?.classList?.contains("logyq-mobile-v162")) {
        // Card contact is map-pan until a still hold latches. Only the
        // v162 latch's synthetic mouse (after `__logyqHoldDragSession`)
        // may start desktop card-drag.
        if (typeof window === "undefined" || !window.__logyqHoldDragSession) return false;
      }
      return event.button === 0;         // left button only (Shift allowed now)
    })
    .on("start", this.start)
    .on("drag", this.drag)
    .on("end", this.end);
},










start(event, d){
  const { state, elements, config: CONFIG } = logyq
  document.body.classList.add("global-no-cursor");

  // Shift+LEFT = "abandonment" (solo) mode
  const se = (event && event.sourceEvent) ? event.sourceEvent : event;
  const isShiftLeft = !!(se && se.button === 0 && se.shiftKey);

  // Abandonment flag (used later in B path)
  state.dragState.solo = isShiftLeft;





    // If a multi-selection exists and includes this node, we drag the group
    if (state.selectedUids && state.selectedUids.size > 1 && state.selectedUids.has(d.data._uid)) {
      state.dragState.multiUids = Array.from(state.selectedUids);

state.dragState.groupAbandon = isShiftLeft; // Ctrl+Left drag => abandon-children mode

      
      elements.svg.classed("dragging-mode", true);
      elements.gNodes.selectAll("g.node")
        .classed("is-others", n => !state.selectedUids.has(n.data._uid))
        .classed("is-subtree", false)
        .classed("dragging", n => state.selectedUids.has(n.data._uid));
    } else {
      state.dragState.multiUids = null;
      state.dragState.groupAbandon = false;
      dragManager.markForDrag(d);
    }

    d3.select(event.currentTarget).raise().classed("dragging", true);

    const [px,py]=d3.pointer(event, elements.svg.node());
    const t=d3.zoomTransform(elements.svg.node());
    const [gx,gy]=t.invert([px,py]);

    state.dragState.startGraphX=gx; state.dragState.startGraphY=gy;
    state.dragState.anchorTopLeftX=d.x - CONFIG.CARD_WIDTH/2;
    state.dragState.anchorTopLeftY=d.y - CONFIG.CARD_HEIGHT/2;

    logyq.visual.layoutMini(d.data?.name||"Node");
    elements.dragMiniG
      .style("display", null)
      .attr("transform",`translate(${state.dragState.anchorTopLeftX},${state.dragState.anchorTopLeftY})`)
      .style("opacity",0.98);

    state.dragState.trashZone='far';
    state.dragState.drop=null;
    state.dragState.didDrag = false;   // ← NEW
  },










  drag(event,d){
    const { state, elements, config: CONFIG } = logyq
    const [px,py]=d3.pointer(event, elements.svg.node());
    const t=d3.zoomTransform(elements.svg.node());
    const [gx,gy]=t.invert([px,py]);
const dx = gx - state.dragState.startGraphX;
const dy = gy - state.dragState.startGraphY;

if (!state.dragState.didDrag){
  const moved = Math.hypot(dx, dy);
  if (moved > (window.DRAG_SLOP_PX || 10)) state.dragState.didDrag = true; // ← NEW
}

elements.dragMiniG.attr("transform",
  `translate(${state.dragState.anchorTopLeftX+dx},${state.dragState.anchorTopLeftY+dy})`);






    // hit test at virtual card center
    const centerX = state.dragState.anchorTopLeftX + dx + CONFIG.CARD_WIDTH/2;
    const centerY = state.dragState.anchorTopLeftY + dy + CONFIG.CARD_HEIGHT/2;
    let drop = logyq.detectors.pick({ x: centerX, y: centerY });

    // Never allow rootAbove while dragging the current root
    if (drop && drop.type === "rootAbove" && !d.parent) drop = null;

    // Trash state
    const src = event.sourceEvent; const cx = src.clientX, cy = src.clientY;
    const zone=dragManager.zone(cx,cy); state.dragState.trashZone=zone;
    const hoveringTarget = !!drop;
    const isNear = (zone==='near') && !hoveringTarget;
    const isOver = (zone==='over');

    elements.trash.classList.toggle('open', (isNear || isOver));
    elements.trash.classList.toggle('wiggle', (isNear || isOver));
    elements.trash.classList.toggle('near', isNear);
    elements.trash.classList.toggle('over', isOver);

    if (isNear || isOver){
      elements.svg.classed('delete-intent', true);
      elements.dragMiniG.style('opacity', 0);
      elements.caretDot.style("opacity",0);
      elements.gNodes.selectAll("g.node").classed("drop-target", false);
      state.dragState.drop=null;
      return;
    } else {
      elements.svg.classed('delete-intent', false);
      elements.dragMiniG.style('opacity', 0.98);
    }

// Clear visuals, then set current drop
elements.caretDot.style("opacity", 0);
elements.gNodes.selectAll("g.node")
  .classed("drop-target hover-adopt hover-adopt-sub", false);
state.dragState.drop = null;


    if(drop){
      if(drop.type==='gap'){
        const hit = drop._hit;
        const [cx2, cy2] = logyq.selection.caretXYFromHit(hit);
        elements.caretDot.attr("cx", cx2).attr("cy", cy2).attr("r", CONFIG.CARET_DOT_RADIUS).style("opacity",1);
        state.dragState.drop = { type:'gap', parentUid: drop.parentUid, prevUid: drop.prevUid, nextUid: drop.nextUid };
     
    
} else if (drop.type === 'node') {
  const targetUid = drop.targetUid;

  // highlight the target node
  elements.gNodes.selectAll("g.node")
    .filter(n => n.data && n.data._uid === targetUid)
    .classed("drop-target hover-adopt", true);

  // slightly un-gray its subtree to signal “willing to adopt”
  const targetH = state.root?.descendants()
    .find(n => n.data && n.data._uid === targetUid);
  if (targetH) {
    const subUids = new Set(targetH.descendants().map(n => n.data._uid));
    elements.gNodes.selectAll("g.node")
      .filter(n => n.data && subUids.has(n.data._uid))
      .classed("hover-adopt-sub", true);
  }

  state.dragState.drop = { type: 'node', targetUid };

    
    
    } else if(drop.type==='rootAbove'){
        const [cx2, cy2] = logyq.selection.caretXYFromHit(drop._hit);
        elements.caretDot.attr("cx", cx2).attr("cy", cy2).attr("r", CONFIG.CARET_DOT_RADIUS).style("opacity",1);
        state.dragState.drop = { type:'rootAbove' };
      }
    }
  },

  end(event,d){
    const { state, utils } = logyq
    if (window.__logyqHoldDragFrozen?.()) {
      // Hold is still reserving the origin slot. Drop the d3 chrome
      // (mini card, is-others) without splicing or relayout.
      document.body.classList.remove('global-no-cursor');
      dragManager.clear();
      return;
    }
    document.body.classList.remove('global-no-cursor');




    // 1) Trash?
    const src = event.sourceEvent, cx=src.clientX, cy=src.clientY;
    const zone=dragManager.zone(cx,cy);
    const shouldDelete = (zone==='over');
    if(shouldDelete){
      // Group delete






      if (state.dragState.multiUids && state.dragState.multiUids.length > 1){
        logyq.deletion.deleteNodesToTrash(state.dragState.multiUids);
        dragManager.clear(); logyq.treeManager.layoutAndRender(true, true); return;
      }
      // Single delete
      if(!d.parent){
        logyq.history.pushHistory({ type: 'delete-root', subtree: utils.deepClone(d.data) });
        state.root = null; state.lastNodes = [];
        dragManager.clear(); logyq.treeManager.renderEmpty(); return;
      }
      const parentData = d.parent.data;
      const siblings = parentData.children || [];
      const idx = siblings.findIndex(c=>c._uid===d.data._uid);
      logyq.history.pushHistory({
        type:'delete',
        parentPath: utils.pathToUid(state.root.data, parentData._uid),
        index: idx,
        subtree: utils.deepClone(d.data)
      });
      if(idx>=0) siblings.splice(idx,1);
      if(d.parent.children){
        const hi = d.parent.children.indexOf(d);
        if(hi>=0) d.parent.children.splice(hi,1);
        if(d.parent.children.length===0) d.parent.children=null;
      }
      dragManager.clear(); logyq.treeManager.layoutAndRender(true,true); return;
    }

    // 2) Valid drop?
    const drop = state.dragState.drop;
    if (!drop){ dragManager.clear(); logyq.treeManager.layoutAndRender(false); return; }

    /* ========= Helpers used below ========= */
    function detach(uid){
      const path = utils.pathToUid(state.root.data, uid);
      if (!path || path.length < 2) return null;
      const fromParentUid = path[path.length - 2];
      const fromParent = utils.findByUid(state.root.data, fromParentUid);
      if (!fromParent || !Array.isArray(fromParent.children)) return null;
      const fromIndex = fromParent.children.findIndex(c => c && c._uid === uid);
      const moving = utils.findByUid(state.root.data, uid);
      if (fromIndex > -1) fromParent.children.splice(fromIndex, 1);
      if (fromParent.children && fromParent.children.length === 0) fromParent.children = null;
      return {
        moving,
        fromParent,
        fromParentPath: utils.pathToUid(state.root.data, fromParent._uid),
        fromIndex
      };
    }
    function abandonChildrenInPlace(moving, info){
      const kids = (moving && moving.children) ? moving.children.slice() : [];
      if (!kids.length || !info || !info.fromParent) return;
      info.fromParent.children = info.fromParent.children || [];
      info.fromParent.children.splice(info.fromIndex, 0, ...kids);
      moving.children = null;
    }

    /* ========= A) GROUP MOVE ========= */
    if (state.dragState.multiUids && state.dragState.multiUids.length > 1){
      
      const groupAbandon = !!state.dragState.groupAbandon;


      const group = state.dragState.multiUids.slice();
      const set = new Set(group);

      // Only top-level selections (skip those under another selected)
      const byH = new Map(state.root.descendants().map(n => [n.data._uid, n]));
      const topLevel = [];
      for (const uid of group){
        const h = byH.get(uid); if (!h) continue;
        let p = h.parent, under = false;
        while (p){ if (set.has(p.data._uid)) { under = true; break; } p = p.parent; }
        if (!under) topLevel.push(uid);
      }
      topLevel.sort((a,b) => (byH.get(a)?.x||0) - (byH.get(b)?.x||0));

      if (drop.type === 'node'){
        const target = utils.findByUid(state.root.data, drop.targetUid);
        if (!target){ dragManager.clear(); logyq.treeManager.layoutAndRender(false); return; }
        target.children = target.children || [];

        for (const uid of topLevel){
          // Skip “drop onto itself” (selected target equals selected uid)
          if (drop.targetUid === uid) continue;

          const moving = utils.findByUid(state.root.data, uid);
          if (!moving) continue;

          const intoOwn = utils.uidInSubtree(moving, drop.targetUid);
          const info = detach(uid);                 // we are handling the drop; safe to detach
          if (!info || !info.moving) continue;

          if (groupAbandon || intoOwn) abandonChildrenInPlace(moving, info);

          target.children.push(moving);
          logyq.history.pushHistory({
            type: 'move',
            uid,
            fromParentPath: info.fromParentPath,
            fromIndex: info.fromIndex,
            toParentPath: utils.pathToUid(state.root.data, target._uid),
            toIndex: target.children.length - 1
          });
        }

        state.root = d3.hierarchy(state.root.data); utils.assignIds(state.root);
        dragManager.clear(); logyq.treeManager.layoutAndRender(false);
        if (topLevel.length) logyq.selection.flashMoved(topLevel[topLevel.length - 1]);
        return;
      }

      if (drop.type === 'gap'){
        const parent = utils.findByUid(state.root.data, drop.parentUid);
        if (!parent){ dragManager.clear(); logyq.treeManager.layoutAndRender(false); return; }
        parent.children = parent.children || [];

        const findIdx = (arr, uid) => Array.isArray(arr) ? arr.findIndex(c => c && c._uid === uid) : -1;
        let insertAt = parent.children.length;
        const pIdx = findIdx(parent.children, drop.prevUid);
        const nIdx = findIdx(parent.children, drop.nextUid);
        if (nIdx !== -1) insertAt = nIdx;
        if (pIdx !== -1) insertAt = pIdx + 1;

        for (const uid of topLevel){
          const moving = utils.findByUid(state.root.data, uid);
          if (!moving) continue;

          const intoOwn = utils.uidInSubtree(moving, drop.parentUid);
          if (intoOwn && !groupAbandon) continue;

          const info = detach(uid);
          if (!info || !info.moving) continue;

          // within same parent and we removed before insertAt → shift
          if (info.fromParent && info.fromParent._uid === parent._uid && info.fromIndex < insertAt) insertAt--;

          if (groupAbandon || intoOwn) abandonChildrenInPlace(moving, info);

          parent.children.splice(insertAt, 0, moving);
          logyq.history.pushHistory({
            type: 'move',
            uid,
            fromParentPath: info.fromParentPath,
            fromIndex: info.fromIndex,
            toParentPath: utils.pathToUid(state.root.data, parent._uid),
            toIndex: insertAt
          });

          insertAt++;
        }

        state.root = d3.hierarchy(state.root.data); utils.assignIds(state.root);
        dragManager.clear(); logyq.treeManager.layoutAndRender(false);
        if (topLevel.length) logyq.selection.flashMoved(topLevel[topLevel.length - 1]);
        return;
      }

      // (group + rootAbove not supported yet)
      dragManager.clear(); logyq.treeManager.layoutAndRender(false); return;
    }

    /* ========= B) SOLO MOVE (Shift held): move only this node; children stay with old parent ========= */
    if (state.dragState.solo){
      // B1) Root in solo mode: promote leftmost child to root, place old root at drop
      if (!d.parent){
        const prevTree = utils.deepClone(state.root.data);
        const kidsH = (state.root.children || []).slice().sort((a,b)=>a.x-b.x);
        if (!kidsH.length){
          logyq.selection.showToast("Root has no child to promote");
          dragManager.clear(); logyq.treeManager.layoutAndRender(false); return;
        }
        const newRootData = kidsH[0].data;
        const others = kidsH.slice(1).map(h=>h.data);

        const moving = state.root.data;  // old root becomes moving node
        moving.children = null;

        const idx = (prevTree.children || []).findIndex(c=>c._uid===newRootData._uid);
        if (idx>-1) prevTree.children.splice(idx,1);
        newRootData.children = (newRootData.children || []).concat(others);

        logyq.history.pushHistory({ type:'replace-root', prev: prevTree });
        state.root = d3.hierarchy(newRootData); utils.assignIds(state.root);

        // Insert the old root at drop
        const res = logyq.selection.insertNodeAtDrop(moving, drop);
        if (res === 'ROOT_DONE') return;
        if (res){
          logyq.history.pushHistory({ type:'add',
            parentPath: utils.pathToUid(state.root.data, res.toParentUid),
            uid: moving._uid, index: res.toIndex
          });
          state.root = d3.hierarchy(state.root.data); utils.assignIds(state.root);
          dragManager.clear(); logyq.treeManager.layoutAndRender(false); logyq.selection.flashMoved(moving._uid); return;
        }
        dragManager.clear(); logyq.treeManager.layoutAndRender(false); return;
      }

      // B2) Non-root solo move: promote children into current parent, then move node
      const moving = d.data;
      const parentData = d.parent.data;

      const fromParentPath = utils.pathToUid(state.root.data, parentData._uid);
      const fromIndex = (parentData.children || []).findIndex(c => c._uid === moving._uid);

      const orphans = (moving.children || []).slice();
      if (fromIndex >= 0) parentData.children.splice(fromIndex, 1, ...orphans);
      moving.children = null;

      // Self-drop safeguard (solo): dropping onto own node = NO-OP
      if (drop.type === 'node' && drop.targetUid === moving._uid){
        state.root = d3.hierarchy(state.root.data); utils.assignIds(state.root);
        dragManager.clear(); logyq.treeManager.layoutAndRender(false); return;
      }

      if (drop.type === 'rootAbove'){
        const prev = utils.deepClone(state.root.data);
        const newRoot = moving;
        newRoot.children = newRoot.children || [];
        newRoot.children.push(prev);
        logyq.history.pushHistory({ type:'replace-root', prev });
        state.root = d3.hierarchy(newRoot); utils.assignIds(state.root);
        dragManager.clear(); logyq.treeManager.layoutAndRender(false); logyq.selection.flashMoved(newRoot._uid); return;
      }

      const res = logyq.selection.insertNodeAtDrop(moving, drop);
      if (res){
        logyq.history.pushHistory({
          type:'move',
          uid: moving._uid,
          fromParentPath,
          fromIndex,
          toParentPath: utils.pathToUid(state.root.data, res.toParentUid),
          toIndex: res.toIndex
        });
        state.root = d3.hierarchy(state.root.data); utils.assignIds(state.root);
        dragManager.clear(); logyq.treeManager.layoutAndRender(false); logyq.selection.flashMoved(moving._uid); return;
      }

      // If insert failed, just redraw cleanly
      dragManager.clear(); logyq.treeManager.layoutAndRender(false); return;
    }

    /* ========= C) NORMAL (subtree) SINGLE MOVE (no Shift, not group) ========= */

    // Self-drop safeguard (normal): dropping onto own node = NO-OP
    if (drop.type === 'node' && drop.targetUid === d.data._uid){
      dragManager.clear(); logyq.treeManager.layoutAndRender(false); return;
    }

    // C1) Drop above root (make moving the new root)
    if (drop.type==='rootAbove'){
      const prev = utils.deepClone(state.root.data);

      // detach moving from its parent (if any)
      const parentData = d.parent ? d.parent.data : null;
      if (parentData && Array.isArray(parentData.children)){
        const idx = parentData.children.findIndex(c=>c._uid===d.data._uid);
        if (idx>-1) parentData.children.splice(idx,1);
        if ((parentData.children||[]).length===0) parentData.children=null;
      }
      const newRoot = d.data;
      newRoot.children = newRoot.children || [];
      newRoot.children.push(state.root.data);

      logyq.history.pushHistory({ type:"replace-root", prev });
      state.root = d3.hierarchy(newRoot); utils.assignIds(state.root);
      dragManager.clear(); logyq.treeManager.layoutAndRender(false); logyq.selection.flashMoved(newRoot._uid);
      return;
    }

    // C2) Drop into a gap (reorder or reparent)
    if (drop.type === 'gap') {
      const moving = d.data;
      const movingUid = moving._uid;
      const targetParent = utils.findByUid(state.root.data, drop.parentUid);
      if (!targetParent) { dragManager.clear(); logyq.treeManager.layoutAndRender(false); return; }

      const droppingIntoOwnSubtree = utils.uidInSubtree(moving, drop.parentUid);

      // Special: moving ROOT into its own subtree
      if (!d.parent && droppingIntoOwnSubtree) {
        const prevTree = utils.deepClone(state.root.data);
        const kidsH = (state.root.children || []).slice().sort((a,b)=>a.x-b.x);
        if (!kidsH.length) { dragManager.clear(); logyq.treeManager.layoutAndRender(false); return; }

        const newRootData = kidsH[0].data;
        const others = kidsH.slice(1).map(h=>h.data);

        const oldRootData = state.root.data;
        oldRootData.children = null;

        const idx = (prevTree.children || []).findIndex(c => c._uid === newRootData._uid);
        if (idx > -1) prevTree.children.splice(idx, 1);
        newRootData.children = (newRootData.children || []).concat(others);

        logyq.history.pushHistory({ type: 'replace-root', prev: prevTree });
        state.root = d3.hierarchy(newRootData); utils.assignIds(state.root);

        // insert old root at the gap
        targetParent.children = targetParent.children || [];
        const findIdx = (arr, uid) => Array.isArray(arr) ? arr.findIndex(c => c && c._uid === uid) : -1;
        let insertAt = targetParent.children.length;
        const pIdx = findIdx(targetParent.children, drop.prevUid);
        const nIdx = findIdx(targetParent.children, drop.nextUid);
        if (nIdx !== -1) insertAt = nIdx;
        if (pIdx !== -1) insertAt = pIdx + 1;

        logyq.history.pushHistory({
          type: 'add',
          parentPath: utils.pathToUid(state.root.data, targetParent._uid),
          uid: oldRootData._uid,
          index: insertAt
        });
        targetParent.children.splice(insertAt, 0, oldRootData);

        state.root = d3.hierarchy(state.root.data); utils.assignIds(state.root);
        dragManager.clear(); logyq.treeManager.layoutAndRender(false); logyq.selection.flashMoved(oldRootData._uid); return;
      }

      // Non-root: if dropping into own subtree, promote children first
      const oldParent = d.parent ? d.parent.data : null;
      if (droppingIntoOwnSubtree && oldParent) {
        const fromParentPath = utils.pathToUid(state.root.data, oldParent._uid);
        const fromIndex = (oldParent.children || []).findIndex(c => c._uid === movingUid);

        const orphans = (moving.children || []).slice();
        if (fromIndex >= 0) oldParent.children.splice(fromIndex, 1, ...orphans);
        moving.children = null;

        targetParent.children = targetParent.children || [];
        const findIdx = (arr, uid) => Array.isArray(arr) ? arr.findIndex(c => c && c._uid === uid) : -1;
        let insertAt = targetParent.children.length;
        const pIdx = findIdx(targetParent.children, drop.prevUid);
        const nIdx = findIdx(targetParent.children, drop.nextUid);
        if (nIdx !== -1) insertAt = nIdx;
        if (pIdx !== -1) insertAt = pIdx + 1;

        logyq.history.pushHistory({
          type: 'move',
          uid: movingUid,
          fromParentPath,
          fromIndex,
          toParentPath: utils.pathToUid(state.root.data, targetParent._uid),
          toIndex: insertAt
        });
        targetParent.children.splice(insertAt, 0, moving);

        state.root = d3.hierarchy(state.root.data); utils.assignIds(state.root);
        dragManager.clear(); logyq.treeManager.layoutAndRender(false); logyq.selection.flashMoved(movingUid); return;
      }

      // Otherwise normal: remove from old, insert at gap
      {
        const oldParent = d.parent.data;
        const oldArr = oldParent.children || (oldParent.children = []);
        const oldIdx = oldArr.findIndex(c => c._uid === movingUid);
        if (oldIdx >= 0) oldArr.splice(oldIdx, 1);

        const destArr = targetParent.children || (targetParent.children = []);
        const findIdx = (arr, uid) => arr.findIndex(c => c._uid === uid);
        let insertAt = destArr.length;
        const pIdx = findIdx(destArr, drop.prevUid);
        const nIdx = findIdx(destArr, drop.nextUid);
        if (nIdx !== -1) insertAt = nIdx;
        if (pIdx !== -1) insertAt = pIdx + 1;

        logyq.history.pushHistory({
          type: 'move',
          uid: movingUid,
          fromParentPath: utils.pathToUid(state.root.data, oldParent._uid),
          fromIndex: oldIdx,
          toParentPath: utils.pathToUid(state.root.data, targetParent._uid),
          toIndex: insertAt
        });
        destArr.splice(insertAt, 0, moving);

        state.root = d3.hierarchy(state.root.data); utils.assignIds(state.root);
        dragManager.clear(); logyq.treeManager.layoutAndRender(false); logyq.selection.flashMoved(movingUid); return;
      }
    }

    // C3) Drop onto a node (append under it)
    if (drop.type === 'node') {
      const target = utils.findByUid(state.root.data, drop.targetUid);
      if (!target) { dragManager.clear(); logyq.treeManager.layoutAndRender(false); return; }

      const moving = d.data;
      const movingUid = moving._uid;
      const droppingIntoOwnSubtree = utils.uidInSubtree(moving, drop.targetUid);

      // Special: root → own subtree (make leftmost child new root, then append old root under target)
      if (!d.parent && droppingIntoOwnSubtree) {
        const prevTree = utils.deepClone(state.root.data);
        const kidsH = (state.root.children || []).slice().sort((a,b)=>a.x-b.x);
        if (!kidsH.length) { dragManager.clear(); logyq.treeManager.layoutAndRender(false); return; }

        const newRootData = kidsH[0].data;
        const others = kidsH.slice(1).map(h=>h.data);

        const oldRootData = state.root.data;
        oldRootData.children = null;

        const idx = (prevTree.children || []).findIndex(c => c._uid === newRootData._uid);
        if (idx > -1) prevTree.children.splice(idx, 1);
        newRootData.children = (newRootData.children || []).concat(others);

        logyq.history.pushHistory({ type: 'replace-root', prev: prevTree });
        state.root = d3.hierarchy(newRootData); utils.assignIds(state.root);

        target.children = target.children || [];
        logyq.history.pushHistory({
          type: 'add',
          parentPath: utils.pathToUid(state.root.data, target._uid),
          uid: oldRootData._uid,
          index: target.children.length
        });
        target.children.push(oldRootData);

        state.root = d3.hierarchy(state.root.data); utils.assignIds(state.root);
        dragManager.clear(); logyq.treeManager.layoutAndRender(false); logyq.selection.flashMoved(oldRootData._uid); return;
      }

      // Non-root: if into own subtree, promote children first
      const oldParent = d.parent ? d.parent.data : null;
      if (droppingIntoOwnSubtree && oldParent) {
        const fromParentPath = utils.pathToUid(state.root.data, oldParent._uid);
        const fromIndex = (oldParent.children || []).findIndex(c => c._uid === movingUid);

        const orphans = (moving.children || []).slice();
        if (fromIndex >= 0) oldParent.children.splice(fromIndex, 1, ...orphans);
        moving.children = null;

        target.children = target.children || [];
        logyq.history.pushHistory({
          type: 'move',
          uid: movingUid,
          fromParentPath,
          fromIndex,
          toParentPath: utils.pathToUid(state.root.data, target._uid),
          toIndex: target.children.length
        });
        target.children.push(moving);

        state.root = d3.hierarchy(state.root.data); utils.assignIds(state.root);
        dragManager.clear(); logyq.treeManager.layoutAndRender(false); logyq.selection.flashMoved(movingUid); return;
      }

      // Otherwise normal reparent under target
      {
        const oldParent = d.parent.data;
        const oldArr = oldParent.children || (oldParent.children = []);
        const oldIdx = oldArr.findIndex(c => c._uid === movingUid);
        if (oldIdx >= 0) oldArr.splice(oldIdx, 1);

        logyq.history.pushHistory({
          type: 'move',
          uid: movingUid,
          fromParentPath: utils.pathToUid(state.root.data, oldParent._uid),
          fromIndex: oldIdx,
          toParentPath: utils.pathToUid(state.root.data, target._uid),
          toIndex: (target.children?.length ?? 0)
        });
        const destArr = target.children || (target.children = []);
        destArr.push(moving);

        state.root = d3.hierarchy(state.root.data); utils.assignIds(state.root);
        dragManager.clear(); logyq.treeManager.layoutAndRender(false); logyq.selection.flashMoved(movingUid); return;
      }
    }

    // Fallback
    dragManager.clear(); logyq.treeManager.layoutAndRender(false);
  }
};
attach('drag', dragManager)


  /* ======================= CHIPS & INPUT ======================= */
  // Tap order. The first name tapped is the parent when a multi-select
  // starts an empty canvas. Render rebuilds the chips, so this lives here.
  let chipOrder = []

  function chipNamesInBank(){
    return (logyq.state.wordBank || []).map(w => String(w || '').trim()).filter(Boolean)
  }

  function pruneChipOrder(){
    const bank = chipNamesInBank()
    const seen = new Set()
    chipOrder = chipOrder.filter((name) => {
      if (!name || seen.has(name) || !bank.includes(name)) return false
      seen.add(name)
      return true
    })
  }

  function everyChipSelected(){
    const bank = chipNamesInBank()
    if (!bank.length) return false
    const selected = new Set(chipOrder)
    return bank.every((name) => selected.has(name))
  }

  function paintChipSelection(){
    pruneChipOrder()
    const selected = new Set(chipOrder)
    document.querySelectorAll('#Dock .chip').forEach((el) => {
      el.classList.toggle('is-outlined', selected.has(el.textContent.trim()))
    })
    const button = typeof document.getElementById === 'function' ? document.getElementById('logyq-bank-all') : null
    if (button) button.textContent = everyChipSelected() ? 'None' : 'All'
  }

  function clearChipSelection(){
    chipOrder = []
    paintChipSelection()
  }

  function getSelectedChipNames(){
    pruneChipOrder()
    return chipOrder.slice()
  }

  function toggleChipName(name){
    const clean = String(name || '').trim()
    if (!clean || !chipNamesInBank().includes(clean)) return
    const index = chipOrder.indexOf(clean)
    if (index >= 0) chipOrder.splice(index, 1)
    else chipOrder.push(clean)
    paintChipSelection()
  }

  function flipBankSelection(){
    if (everyChipSelected()) chipOrder = []
    else {
      const seen = new Set()
      chipOrder = chipNamesInBank().filter((name) => {
        if (seen.has(name)) return false
        seen.add(name)
        return true
      })
    }
    paintChipSelection()
  }

  function render(){
    const { state, elements, utils } = logyq
    const list = elements.Dock; list.innerHTML = '';
    state.wordBank.forEach((w)=>{
      const chip = document.createElement('div');
      chip.className='chip'; chip.textContent=w;
      // Native HTML5 drag cancels the pointer as soon as it moves, so a
      // finger never finishes the gesture. Press-drag below places the chip.
      chip.draggable=false;
      chip.addEventListener('click',()=>{
        if (chip.dataset.skipClick === '1') return
        toggleChipName(w)
      });
      chip.addEventListener('dragstart',(e)=>{
        state.chipDrag.active = true;
        const group = getSelectedChipNames()
        const words = group.includes(w) ? group.slice() : [w]
        state.chipDrag.words = words;
        state.chipDrag.word = w; // keep old field for compatibility
        state.chipDrag.drop = null;
        e.dataTransfer.setData('text/plain', words.join(', '));
        e.dataTransfer.effectAllowed = 'copyMove';
});

chip.addEventListener('dragend', () => endChipDragVisuals());

      chip.addEventListener("contextmenu", (e) => {e.preventDefault();
        e.stopPropagation(); const sel = Array.from((state.selectedUids || new Set()).values());
if (!state.root || sel.length !== 1) {logyq.selection.showToast(sel.length === 0 ? "Select a node first" : "Select just one node");
  return;}
const target = utils.findByUid(state.root.data, sel[0]);
/* [patch] multiselect-gate end */

        

        if (!target) return;
        const toAdd = (getSelectedChipNames().length ? getSelectedChipNames() : [w]);
        target.children = target.children || [];
        for (const name of toAdd) {
          if (!name) continue;
          const node = { name }; utils.assignUids(node); target.children.push(node);
          logyq.history.pushHistory({ type: "add", parentPath: utils.pathToUid(state.root.data, target._uid), uid: node._uid, index: (target.children.length - 1) });
        }
        state.wordBank = state.wordBank.filter(n => !toAdd.includes(n));
        state.root = d3.hierarchy(state.root.data); utils.assignIds(state.root);
        clearChipSelection(); render(); logyq.treeManager.layoutAndRender(false);
      });
      list.appendChild(chip);
    });
    if (state.wordBank.length) {
      const allButton = document.createElement('button');
      allButton.type = 'button';
      allButton.id = 'logyq-bank-all';
      allButton.className = 'chip-bank-all';
      allButton.textContent = everyChipSelected() ? 'None' : 'All';
      allButton.ariaLabel = allButton.textContent === 'None' ? 'Clear Word Bank selection' : 'Select every Word Bank chip';
      allButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        flipBankSelection();
        allButton.ariaLabel = allButton.textContent === 'None' ? 'Clear Word Bank selection' : 'Select every Word Bank chip';
      });
      list.appendChild(allButton);
    }
    paintChipSelection();
  }

  function addWords(raw, to){
    const { state, utils } = logyq
    if (typeof window !== 'undefined' && window.__logyqHoldDragBlocksBank?.()) return;
    const text = (raw || '').trim(); if(!text) return;
    const words = text.split(/[;,]+/).map(s => s.trim()).filter(Boolean);
    if(!words.length) return;
    if(to==='selected' && state.selectedUid && state.root){
      const target = utils.findByUid(state.root.data, state.selectedUid);
      if(target){
        target.children = target.children || [];
        for(const w of words){
          const node = { name:w }; utils.assignUids(node); target.children.push(node);
          logyq.history.pushHistory({ type: 'add', parentPath: utils.pathToUid(state.root.data, target._uid), uid: node._uid, index: (target.children.length - 1) });
        }
        state.root = d3.hierarchy(state.root.data); utils.assignIds(state.root);
        render(); logyq.treeManager.layoutAndRender(false); return;
      }
    }
    state.wordBank.push(...words); render();
  }
// === GLOBAL ENTER COMMIT (GIQ-aware) ===
// Adds current #wordInput to the selected node (if exactly one is selected) or to the Dock.
// Safeguards: ignores Enter while typing in a field, while a modal is open, or while dragging.

/* Helper: split GIQ input into { jsonText, wordsText, futureText }.
   Format: <JSON> [### <comma/semicolon-separated words>] [$$$ <future>]
*/
function parseGIQ(raw) {
  let jsonText = raw, wordsText = null, futureText = null;

  // Pull off $$$ tail (future-proof; ignored for now)
  const dollarIdx = raw.indexOf("$$$");
  if (dollarIdx !== -1) {
    futureText = raw.slice(dollarIdx + 3).trim();
    raw = raw.slice(0, dollarIdx).trim();
  }

  // Split the ### words section (goes to Word Dock)
  const hashIdx = raw.indexOf("###");
  if (hashIdx !== -1) {
    jsonText  = raw.slice(0, hashIdx).trim();
    wordsText = raw.slice(hashIdx + 3).trim();
  } else {
    jsonText = raw.trim();
  }

  return { jsonText, wordsText, futureText };
}

/* Helper: normalize parsed JSON to {name, children[]} tree shape */
function normalizeToTree(value) {
  const toNode = (x) => {
    if (x == null) return null;

    if (typeof x === "string" || typeof x === "number") {
      return { name: String(x) };
    }

    if (Array.isArray(x)) {
      const kids = x.map(toNode).filter(Boolean);
      return { name: "Root", children: kids.length ? kids : null };
    }

    if (typeof x === "object") {
      // If it already looks like a node, normalize children recursively
      if ("name" in x || "children" in x) {
        const name = ("name" in x) ? String(x.name ?? "Untitled") : "Untitled";
        let kids = null;
        if (Array.isArray(x.children)) {
          const norm = x.children.map(toNode).filter(Boolean);
          kids = norm.length ? norm : null;
        }
        const node = kids ? { name, children: kids } : { name };
        if (x.color) node.color = x.color;
        for (const key of ['label', 'text', 'title', 'value']) {
          if (typeof x[key] === 'string' && x[key].trim()) node[key] = x[key];
        }
        return node;
      }

      // Plain object: turn its keys into children
      const keys = Object.keys(x);
      const kids = keys.map(k => {
        const child = toNode(x[k]);
        if (!child) return { name: String(k) };
        // If child is a leaf, make it a child named by the key
        if (!child.children) return { name: String(k) };
        // If child has its own children, wrap it under key
        return { name: String(k), children: child.children };
      }).filter(Boolean);

      return { name: "Root", children: kids.length ? kids : null };
    }

    return null;
  };

  const node = toNode(value);
  return node || null;
}





































function endChipDragVisuals() {
  const { state, elements } = logyq
  elements.caretDot.style('opacity', 0)
  d3.selectAll('g.node').classed('drop-target hover-adopt hover-adopt-sub', false)
  state.chipDrag.active = false
  state.chipDrag.words = []
  state.chipDrag.word = null
  state.chipDrag.drop = null
  elements.trash.classList.remove('open', 'over', 'wiggle', 'near')
  document.getElementById('logyq-chip-ghost')?.remove()
  document.querySelectorAll('#Dock .chip.is-lifting').forEach((el) => el.classList.remove('is-lifting'))
  document.body.classList.remove('logyq-chip-drag')
}

// Press-drag for a finger or a mouse. The dock is a scroll container, so a
// chip has to claim the gesture itself; native drag cancels the pointer.
function bindChipPointerPlace() {
  const dock = logyq.elements.Dock
  if (!dock || typeof dock.addEventListener !== 'function' || dock.dataset?.chipPointer === '1') return
  dock.dataset.chipPointer = '1'
  let session = null

  const overDock = (x, y) => {
    if (dock.classList.contains('dock-hidden')) return false
    const style = getComputedStyle(dock)
    if (style.display === 'none' || style.visibility === 'hidden') return false
    const rect = dock.getBoundingClientRect()
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
  }

  const placeGhost = (words, x, y) => {
    let stack = document.getElementById('logyq-chip-ghost')
    if (!stack) {
      stack = document.createElement('div')
      stack.id = 'logyq-chip-ghost'
      document.body.appendChild(stack)
    }
    const label = words.join('\n')
    if (stack.dataset.words !== label) {
      stack.dataset.words = label
      stack.replaceChildren(...words.map((word) => {
        const ghost = document.createElement('div')
        ghost.className = 'chip'
        ghost.textContent = word
        ghost.style.opacity = '0.55'
        return ghost
      }))
    }
    stack.style.left = `${x}px`
    stack.style.top = `${y}px`
  }

  // The ghost is lifted above the finger by CSS. Aim at that card, not the touch.
  const raisedGhostPoint = (x, y) => {
    const stack = document.getElementById('logyq-chip-ghost')
    const rect = stack?.getBoundingClientRect?.()
    if (!rect || rect.width < 1 || rect.height < 1) return { x, y }
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  }

  const hoverMap = (x, y) => {
    const svg = logyq.elements.svg.node()
    if (!svg) return
    if (overDock(x, y)) {
      logyq.state.chipDrag.drop = null
      logyq.elements.caretDot.style('opacity', 0)
      d3.selectAll('g.node').classed('drop-target hover-adopt hover-adopt-sub', false)
      return
    }
    const aim = raisedGhostPoint(x, y)
    svg.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, clientX: aim.x, clientY: aim.y }))
  }

  const chipUnderPoint = (x, y) => {
    if (typeof document.elementsFromPoint !== 'function') return null
    const stack = document.elementsFromPoint(x, y) || []
    for (const el of stack) {
      const chip = el?.closest?.('.chip')
      if (!chip || !dock.contains(chip) || chip.id === 'logyq-bank-all') continue
      return chip
    }
    return null
  }

  dock.addEventListener('pointerdown', (event) => {
    if (event.button != null && event.button !== 0) return
    const direct = event.target?.closest?.('.chip')
    const chip = chipUnderPoint(event.clientX, event.clientY) || direct
    if (!chip || !dock.contains(chip) || chip.id === 'logyq-bank-all') return
    const rect = chip.getBoundingClientRect?.()
    if (rect && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) return
    const word = chip.textContent.trim()
    if (!word) return
    session = { pointerId: event.pointerId, word, x: event.clientX, y: event.clientY, dragging: false, chip }
  })

  const swipeWords = (word) => {
    const selected = getSelectedChipNames()
    // A down-swipe on a selected chip deletes the whole selection. Otherwise just that chip.
    return selected.includes(word) ? selected.slice() : [word]
  }

  const removeBankWords = (words) => {
    const drop = new Set((words || []).map((word) => String(word || '').trim()).filter(Boolean))
    if (!drop.size) return false
    const prevBank = logyq.state.wordBank.slice()
    const next = prevBank.filter((word) => !drop.has(String(word || '').trim()))
    if (next.length === prevBank.length) return false
    logyq.history.pushHistory({ type: 'bank-delete', prevBank })
    logyq.state.wordBank = next
    render()
    try { window.LOGYQBridge?.notifyChange?.() } catch (_error) {}
    return true
  }

  window.addEventListener('pointermove', (event) => {
    if (!session || event.pointerId !== session.pointerId) return
    const dx = event.clientX - session.x
    const dy = event.clientY - session.y
    const moved = Math.hypot(dx, dy) >= 10
    if (!session.dragging && !session.deleting) {
      // Claim the gesture while the finger is still on the chip. Waiting
      // until it has left the dock lets the browser cancel the pointer first.
      if (!moved) return
      // Down stays a delete. Up and out still lift the chip onto the map.
      if (dy > 0 && dy >= Math.abs(dx)) {
        session.deleting = true
        session.words = swipeWords(session.word)
        try { session.chip.setPointerCapture(event.pointerId) } catch (_error) {}
      } else {
        const words = swipeWords(session.word)
        logyq.state.chipDrag.active = true
        logyq.state.chipDrag.words = words
        logyq.state.chipDrag.word = words[0]
        logyq.state.chipDrag.drop = null
        session.dragging = true
        session.words = words
        window.__logyqChipPlacing = true
        document.body.classList.add('logyq-chip-drag')
        document.querySelectorAll('#Dock .chip').forEach((el) => {
          el.classList.toggle('is-lifting', words.includes(el.textContent.trim()))
        })
        try { session.chip.setPointerCapture(event.pointerId) } catch (_error) {}
      }
    }
    if (session.deleting) {
      event.preventDefault()
      return
    }
    event.preventDefault()
    placeGhost(session.words, event.clientX, event.clientY)
    hoverMap(event.clientX, event.clientY)
  }, { passive: false })

  const finishPointer = (event, commit) => {
    if (!session || event.pointerId !== session.pointerId) return
    const dragging = session.dragging
    const deleting = session.deleting
    const chip = session.chip
    const word = session.word
    const words = session.words
    const dx = event.clientX - session.x
    const dy = event.clientY - session.y
    session = null
    if (deleting) {
      event.preventDefault()
      event.stopPropagation()
      if (chip) {
        chip.dataset.skipClick = '1'
        window.setTimeout(() => { delete chip.dataset.skipClick }, 0)
      }
      if (commit && dy >= 36 && dy >= Math.abs(dx)) removeBankWords(words)
      return
    }
    if (!dragging) {
      if (commit && chip && word) {
        chip.dataset.skipClick = '1'
        toggleChipName(word)
        window.setTimeout(() => { delete chip.dataset.skipClick }, 0)
      }
      return
    }
    event.preventDefault()
    event.stopPropagation()
    if (commit && !overDock(event.clientX, event.clientY)) {
      if (words) placeGhost(words, event.clientX, event.clientY)
      const aim = raisedGhostPoint(event.clientX, event.clientY)
      hoverMap(event.clientX, event.clientY)
      logyq.elements.svg.node()?.dispatchEvent(new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        clientX: aim.x,
        clientY: aim.y,
      }))
    }
    endChipDragVisuals()
    window.setTimeout(() => { window.__logyqChipPlacing = false }, 400)
  }

  window.addEventListener('pointerup', (event) => finishPointer(event, true))
  window.addEventListener('pointercancel', (event) => finishPointer(event, false))
}

/* ======================= CHIP DROP OVER SVG (uses detectors) ======================= */
logyq.elements.svg.on('dragover', (event) => {
  const { state, elements, config: CONFIG } = logyq
  if (!state.chipDrag.active) return;
  event.preventDefault();

  // No root yet: show caret at pointer and prepare to create a new root where you drop
  if (!state.root) {
    const [px, py] = d3.pointer(event, elements.svg.node());
    const t = d3.zoomTransform(elements.svg.node());
    const [gx, gy] = t.invert([px, py]);
    elements.caretDot
      .attr('cx', gx)
      .attr('cy', gy)
      .attr('r', CONFIG.CARET_DOT_RADIUS)
      .style('opacity', 1);
    state.chipDrag.drop = { type: 'newRootAt', px, py };
    return;
  }

  // With a root: pick a detector hit under the pointer
  const [px, py] = d3.pointer(event, elements.svg.node());
  const t = d3.zoomTransform(elements.svg.node());
  const [gx, gy] = t.invert([px, py]);
  const drop = logyq.detectors.pick({ x: gx, y: gy });


// Reset visuals each move
elements.caretDot.style('opacity', 0);
elements.gNodes.selectAll("g.node")
  .classed("drop-target hover-adopt hover-adopt-sub", false);
state.chipDrag.drop = null;

if (!drop) { return; }





  if (drop.type === 'gap') {
    const hit = drop._hit;
    const [cx, cy] = logyq.selection.caretXYFromHit(hit);
    elements.caretDot
      .attr('cx', cx)
      .attr('cy', cy)
      .attr('r', CONFIG.CARET_DOT_RADIUS)
      .style('opacity', 1);






// clear any prior hover highlights when hovering a gap
elements.gNodes.selectAll("g.node")
  .classed("hover-adopt hover-adopt-sub drop-target", false);

state.chipDrag.drop = {
  type: 'gap',
  parentUid: drop.parentUid,
  prevUid: drop.prevUid,
  nextUid: drop.nextUid
};






} else if (drop.type === 'node') {
  // clear previous hover marks
  elements.gNodes.selectAll("g.node")
    .classed("drop-target hover-adopt hover-adopt-sub", false);

  const targetUid = drop.targetUid;
  const targetH = state.root?.descendants()
    .find(n => n.data && n.data._uid === targetUid);

  if (targetH) {
    // highlight target node
    elements.gNodes.selectAll("g.node")
      .filter(n => n.data && n.data._uid === targetUid)
      .classed("drop-target hover-adopt", true);

    // slightly de-gray its subtree (signals “willing to adopt”)
    const subUids = new Set(targetH.descendants().map(n => n.data._uid));
    elements.gNodes.selectAll("g.node")
      .filter(n => n.data && subUids.has(n.data._uid))
      .classed("hover-adopt-sub", true);
  }

  state.chipDrag.drop = { type: 'node', targetUid };


} else if (drop.type === 'rootAbove') {
  // A tree is already on the canvas. Only a card or a gap places chips.
  // The zone above the root, and any other miss, leaves them in the bank.
  state.chipDrag.drop = null
}





});

logyq.elements.svg.on('drop', (event) => {
  const { state, elements, utils } = logyq
  if (!state.chipDrag.active) return;
  event.preventDefault();

  const drop = state.chipDrag.drop;
  const words = (Array.isArray(state.chipDrag.words) && state.chipDrag.words.length)
    ? state.chipDrag.words.slice()
    : (state.chipDrag.word ? [state.chipDrag.word] : []);

  if (!drop || !words.length) return;

  const removeFromBank = (list) => {
    list.forEach(w => {
      const i = state.wordBank.indexOf(w);
      if (i > -1) state.wordBank.splice(i, 1);
    });
  };

  // --- CASE 1: create a new root at pointer (empty canvas) ---
  if (drop.type === 'newRootAt') {
    const rootNode = { name: words[0] };
    utils.assignUids(rootNode);

    if (words.length > 1) {
      rootNode.children = words.slice(1).map(nm => {
        const c = { name: nm }; utils.assignUids(c); return c;
      });
    }

    logyq.history.pushHistory({ type: 'add-root', uid: rootNode._uid });
    removeFromBank(words);

    state.root = d3.hierarchy(rootNode);
    utils.assignIds(state.root);

    // Cleanup visuals and render
elements.caretDot.style('opacity', 0);
d3.selectAll("g.node").classed("drop-target hover-adopt hover-adopt-sub", false);

    render();
    logyq.treeManager.layoutAndRender(false);

    // Keep your “drop under pointer” behavior
    const current = d3.zoomTransform(elements.svg.node());
    const s = current.k || 1;
    const rx = state.root.x, ry = state.root.y;
    const tx = drop.px - s * rx, ty = drop.py - s * ry;
    elements.svg.call(state.zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(s));
    return;
  }

  // --- CASE 2: make a new root above existing root ---
  if (drop.type === 'rootAbove' && state.root) {
    const prev = utils.deepClone(state.root.data);
    const newRoot = { name: words[0], children: [prev] };
    utils.assignUids(newRoot);

    if (words.length > 1) {
      for (const nm of words.slice(1)) {
        const c = { name: nm }; utils.assignUids(c); newRoot.children.push(c);
      }
    }

    removeFromBank(words);
    logyq.history.pushHistory({ type: 'replace-root', prev });

    state.root = d3.hierarchy(newRoot);
    utils.assignIds(state.root);

elements.caretDot.style('opacity', 0);
d3.selectAll("g.node").classed("drop-target hover-adopt hover-adopt-sub", false);

    render();
    logyq.treeManager.layoutAndRender(false);
    return;
  }





  // --- CASE 3: drop between siblings (gap) ---
  if (drop.type === 'gap') {
    const parent = utils.findByUid(state.root.data, drop.parentUid);
    if (!parent) return;

    parent.children = parent.children || [];

    // insertion index based on neighbor uids
    const findIdx = (arr, uid) => Array.isArray(arr) ? arr.findIndex(c => c && c._uid === uid) : -1;
    let insertAt = parent.children.length;
    const pIdx = findIdx(parent.children, drop.prevUid);
    const nIdx = findIdx(parent.children, drop.nextUid);
    if (nIdx !== -1) insertAt = nIdx;
    if (pIdx !== -1) insertAt = pIdx + 1;

    const parentPath = utils.pathToUid(state.root.data, parent._uid);

    words.forEach((nm, i) => {
      const node = { name: nm }; utils.assignUids(node);
      parent.children.splice(insertAt + i, 0, node);
      logyq.history.pushHistory({ type: 'add', parentPath, uid: node._uid, index: insertAt + i });
    });

    removeFromBank(words);
    utils.assignUids(state.root.data);
    state.root = d3.hierarchy(state.root.data);
    utils.assignIds(state.root);

elements.caretDot.style('opacity', 0);
d3.selectAll("g.node").classed("drop-target hover-adopt hover-adopt-sub", false);

    render();
    logyq.treeManager.layoutAndRender(false);
    return;
  }

  // --- CASE 4: drop onto a node (append as children) ---
  if (drop.type === 'node') {
    const target = utils.findByUid(state.root.data, drop.targetUid);
    if (!target) return;

    target.children = target.children || [];
    const parentPath = utils.pathToUid(state.root.data, target._uid);

    words.forEach(nm => {
      const node = { name: nm }; utils.assignUids(node);
      target.children.push(node);
      logyq.history.pushHistory({
        type: 'add',
        parentPath,
        uid: node._uid,
        index: (target.children.length - 1)
      });
    });

    removeFromBank(words);
    utils.assignUids(state.root.data);
    state.root = d3.hierarchy(state.root.data);
    utils.assignIds(state.root);

elements.caretDot.style('opacity', 0);
d3.selectAll("g.node").classed("drop-target hover-adopt hover-adopt-sub", false);

    render();
    logyq.treeManager.layoutAndRender(false);
  }
});

  bindChipPointerPlace()

  attach('wordDock', {
    clearChipSelection,
    getSelectedChipNames,
    flipBankSelection,
    render,
    addWords,
    parseGIQ,
    normalizeToTree,
  });
  /* ======================= RANDOMIZE ======================= */
function cardLabel(data){
  if (data == null) return '';
  if (typeof data === 'string' || typeof data === 'number') return String(data);
  for (const key of ['name', 'label', 'text', 'title', 'value']) {
    if (typeof data[key] === 'string' && data[key].trim()) return data[key].trim();
  }
  return String(data.name ?? '');
}

function mixCard(name, extras){
  const node = { name: String(name ?? '') };
  const src = (extras && typeof extras === 'object' && !Array.isArray(extras)) ? extras : null;
  const color = src ? src.color : extras;
  if (color) node.color = color;
  if (src) {
    for (const key of ['label', 'text', 'title', 'value']) {
      if (typeof src[key] === 'string' && src[key].trim()) node[key] = src[key];
    }
  }
  return node;
}

function randomizeTree(includeBank){
  const { state, utils } = logyq
  try{
    const prevTree = state.root ? utils.deepClone(state.root.data) : null;
    const prevBank = Array.isArray(state.wordBank) ? state.wordBank.slice() : [];
    // Keep painted/annotated card fields with each shuffle. Mix used to
    // rebuild `{ name }` only, which wiped `data.color` (and any label
    // aliases) before snapshot / `logyq_maps_v1` saved that bare tree.
    // A card in the tree is mixable even when its label is "". Paint on a
    // blank card has to travel with that card; name length is not presence.
    const treeNodes = state.root ? state.root.descendants() : [];
    // The root card is in the pool with everyone else. It used to be copied
    // out first, so Mix froze it on top and only shuffled descendants.
    const pool = treeNodes.map((n) => mixCard(cardLabel(n.data), n.data));
    if (includeBank && prevBank.length) {
      for (const word of prevBank) {
        if (word) pool.push(mixCard(word, null));
      }
    }
    if (!pool.length){ logyq.selection.showToast("Nothing to mix"); return; }
    for (let i = pool.length - 1; i > 0; i--){
      const j = (Math.random() * (i + 1)) | 0;
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const root = mixCard(pool[0].name, pool[0]);
    function ri(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }

    root.children = [];
    let q = [{ node: root, cap: ri(1,3), used: 0 }], k = 1;
    while (k < pool.length){
      if (!q.length) q.push({ node: root, cap: ri(1,3), used: 0 });
      const p = q[0];
      if (p.used >= p.cap){ q.shift(); continue; }
      const child = mixCard(pool[k].name, pool[k]);
      k++;
      p.node.children = p.node.children || [];
      p.node.children.push(child);
      p.used++;
      const cap = ri(0,3);
      if (cap > 0) q.push({ node: child, cap, used: 0 });
    }

    utils.assignUids(root);
    logyq.history.pushHistory({
      type: 'randomize',
      prev: prevTree,
      next: utils.deepClone(root),
      prevBank: prevBank,
      nextBank: includeBank ? [] : prevBank.slice()
    });
    if (includeBank) state.wordBank = [];

    state.root = d3.hierarchy(root);
    utils.assignIds(state.root);
    logyq.selection.setSelected(null);

    state.repositionMode = "mix"; /* [patch] mix-reposition-activate */
    logyq.treeManager.layoutAndRender(false);


    //showToast(includeBank ? "Mixed everything (bank used)" : "Tree mixed");
    logyq.wordDock.render();
  }catch(_e){}
}


  /* ======================= CONTEXT MENU ======================= */
  function onNodeContextMenu(event, d){
  const { state, utils } = logyq
  // Don’t show the browser menu or bubble to zoom
  event.preventDefault();
  event.stopPropagation();
  // Contextmenu is never a Word Bank write. Phone long-press and desktop
  // right-click both land here, and both used to copy the card label into
  // the dock (Ashley’s “Jrvb” chip while Dog / Poodle / Jdvb stayed put).
  // Card → bank is only sendSubtreeToWordBank after a move + dock dwell.
  if (!d || !state.root) return;
  const uid = d?.data?._uid;
  if (!uid) return;


















// Right-click / long-press does not abandon a card into the Word Bank.






















  // Selected chips can still be pasted under this card. That removes
  // words from the dock; it does not add any.
  if (window.incidentalBankContext?.(event)) return;
  if (window.__logyqHoldDragFrozen?.() || window.__logyqHoldDragBlocksBank?.()) return;
  const selectedNames = logyq.wordDock.getSelectedChipNames?.() || [];
  if (selectedNames.length){
    const targetData = d.data;
    targetData.children = targetData.children || [];
    for (const nm of selectedNames){
      const node = { name: nm };
      utils.assignUids(node);
      targetData.children.push(node);
      logyq.history.pushHistory({
        type: 'add',
        parentPath: utils.pathToUid(state.root.data, targetData._uid),
        uid: node._uid,
        index: targetData.children.length - 1
      });
    }
    state.root = d3.hierarchy(state.root.data); utils.assignIds(state.root);
    state.wordBank = (state.wordBank || []).filter(w => !selectedNames.includes(w));
    logyq.wordDock.clearChipSelection?.();
    logyq.wordDock.render?.();
    logyq.treeManager.layoutAndRender(false);
    logyq.selection.showToast?.(`Added ${selectedNames.length} to "${targetData.name}"`);
    return;
  }
}











  attach('mix', {
    randomizeTree,
    onNodeContextMenu,
  });
/* ======================= TREE MANAGER ======================= */
const treeManager = {
  initialize(){
    const { state, elements, config: CONFIG, utils } = logyq
    elements.gRoot = elements.svg.append("g");
    elements.gLinks= elements.gRoot.append("g").attr("class","links");
    elements.gHits = elements.gRoot.append("g").attr("class","hit-slots");
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
  .scaleExtent([0.02, 2.4])
  .filter((event) => {
    // Allow wheel-zoom anywhere. Desktop: block pans that start on a
    // card (that's a drag). Phone: a card finger uses this same zoom
    // pan until a still hold latches (`__logyqHoldDragSession`).
    if (event.type === "wheel") return true;
    if (typeof window !== "undefined" && (window.__logyqHoldDragSession || window.__logyqSuppressZoom)) return false;
    const mobile = typeof document !== "undefined"
      && document.body?.classList?.contains("logyq-mobile-v162");
    if (mobile) return true;
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
    if (state.editingUid && e.sourceEvent) state.editUserZoom = true;
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
    state.root = null;
    this.renderEmpty();

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
  // Right-click forces include WordBank. A phone long-press is not that.
  if (window.incidentalBankContext?.(e)) return;
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
    elements.gHits?.selectAll("g.hit-slot").remove();
    elements.gNodes.selectAll("g.node").remove();
    state.lastNodes = [];
    state.detectors=[];
    state.layoutSettling = false
    state.layoutFlushQueued = false
    state.layoutAfterFlush = null
    try { clearTimeout(state.layoutSettleTimer) } catch (_e) {}
    state.layoutSettleTimer = 0
    try { document.body.classList.remove('logyq-layout-settling') } catch (_e) {}
    logyq.detectors.draw();
  },

  CREATE_SETTLE_MS: 260,

  isLayoutSettling(){
    return !!logyq.state.layoutSettling
  },

  requestCreateLayout(after){
    const { state } = logyq
    if (typeof after === 'function') {
      const prev = state.layoutAfterFlush
      state.layoutAfterFlush = () => {
        try { prev?.() } catch (_e) {}
        try { after() } catch (_e) {}
      }
    }
    if (state.layoutSettling) {
      state.layoutFlushQueued = true
      this.syncCreateHitSlots()
      return 'queued'
    }
    this.flushCreateLayout()
    return 'ran'
  },

  applyLayout(root){
    const { state, config: CONFIG } = logyq
    if (!root || !state.layout) return root
    state.layout.nodeSize([CONFIG.CARD_WIDTH+CONFIG.HORIZONTAL_GAP, CONFIG.CARD_HEIGHT+CONFIG.VERTICAL_GAP]).separation((a,b)=>{
      let A=a,B=b; while(A.depth>B.depth)A=A.parent; while(B.depth>A.depth)B=B.parent; while(A!==B){A=A.parent;B=B.parent;}
      const l=A.depth, up=Math.max(1,a.depth-l);
      const base=(up===1)?0.9:0.75, inc=(up>1)?0.35*(up-1):0;
      const bonus=0.2*Math.max(0,(a.children?.length??0)-1)+0.2*Math.max(0,(b.children?.length??0)-1);
      return Math.max(0.1, base+inc+bonus);
    });
    state.layout(root);
    return root;
  },

  syncCreateHitSlots(){
    const { state, utils } = logyq
    if (!state.root?.data || !state.layout) return
    const scratch = d3.hierarchy(state.root.data)
    utils.assignIds(scratch)
    this.applyLayout(scratch)
    state.root = scratch
    const nodes = scratch.descendants()
    this.syncHitSlots(nodes)
    this.ensureCreateNodes(nodes)
    this.retargetLiveNodes(nodes)
    state.layoutVisualReady = true
  },

  // A second create while the first settle is still playing used to leave
  // painted cards on the old layout and then animate again when the queue
  // flushed. Point the live cards at the latest layout now, and let the
  // flush land without a second glide.
  retargetLiveNodes(nodes){
    const { elements } = logyq
    const want = new Map()
    for (const d of nodes || []) {
      if (d?.data?._uid != null && String(d.data._uid) !== '') want.set(d.data._uid, d)
    }
    elements.gNodes?.selectAll('g.node').each(function (d) {
      const next = want.get(d?.data?._uid)
      if (!next) return
      const sel = d3.select(this)
      sel.datum(next)
      sel.interrupt()
      sel.transition().duration(180).attr('transform', `translate(${next.x},${next.y})`)
    })
    const root = (nodes || []).find((d) => d && !d.parent) || null
    if (elements.gLinks && root?.links) {
      const byTarget = new Map()
      for (const link of root.links()) {
        if (link?.target?.data?._uid != null) byTarget.set(link.target.data._uid, link)
      }
      elements.gLinks.selectAll('path.link').each(function (d) {
        const next = byTarget.get(d?.target?.data?._uid)
        if (!next) return
        const sel = d3.select(this)
        sel.datum(next)
        sel.interrupt()
        sel.transition().duration(180).attr('d', logyq.visual.vLink(next))
      })
    }
  },

  ensureCreateNodes(nodes){
    const { elements, config: CONFIG } = logyq
    if (!elements.gNodes) return
    const have = new Set()
    elements.gNodes.selectAll('g.node').each(function(d){
      if (d?.data?._uid) have.add(d.data._uid)
    })
    for (const d of nodes || []) {
      const uid = d?.data?._uid
      if (uid == null || String(uid) === '' || have.has(uid)) continue
      const g = elements.gNodes.append('g')
        .datum(d)
        .attr('class', 'node')
        .attr('data-uid', uid)
        .attr('transform', `translate(${d.x},${d.y})`)
        .style('opacity', 1)
      g.insert('rect', ':first-child')
        .attr('class', 'grabzone')
        .attr('x', -CONFIG.CARD_WIDTH / 2)
        .attr('y', -CONFIG.CARD_HEIGHT / 2)
        .attr('width', CONFIG.CARD_WIDTH)
        .attr('height', CONFIG.CARD_HEIGHT)
        .style('fill', 'transparent')
        .style('pointer-events', 'none')
      g.append('rect')
        .attr('x', -CONFIG.CARD_WIDTH / 2)
        .attr('y', -CONFIG.CARD_HEIGHT / 2)
        .attr('width', CONFIG.CARD_WIDTH)
        .attr('height', CONFIG.CARD_HEIGHT)
        .attr('data-uid', uid)
        .style('fill', d.data.color || null)
      g.append('text')
        .attr('class', 'label')
        .attr('x', 0)
        .attr('y', 0)
        .style('font-size', `${CONFIG.FONT_SIZE}px`)
        .text(d.data.name)
      this.bindUidStamp(g)
      have.add(uid)
    }
  },

  ensureUidLayout(uid){
    const { state, utils } = logyq
    if (!uid) return null
    let node = state.root?.descendants().find((item) => item.data?._uid === uid)
    if (node) return node
    if (!utils.findByUid(state.root?.data, uid)) return null
    state.root = d3.hierarchy(state.root.data)
    utils.assignIds(state.root)
    this.applyLayout(state.root)
    this.syncHitSlots(state.root.descendants())
    return state.root.descendants().find((item) => item.data?._uid === uid) || null
  },

  flushCreateLayout(){
    const { state, utils } = logyq
    if (!state.root?.data) return
    const instant = !!state.layoutVisualReady
    state.layoutVisualReady = false
    state.layoutFlushQueued = false
    const after = state.layoutAfterFlush
    state.layoutAfterFlush = null
    state.root = d3.hierarchy(state.root.data)
    utils.assignIds(state.root)
    state.layoutMotionMs = instant ? 0 : 260
    this.layoutAndRender(false)
    state.layoutMotionMs = null
    try { after?.() } catch (_e) {}
  },

  armLayoutSettle(){
    const { state } = logyq
    const delay = this.CREATE_SETTLE_MS || 260
    state.layoutGeneration = (state.layoutGeneration || 0) + 1
    if (state.layoutMotionMs === 0) {
      state.layoutSettling = false
      state.layoutSettleTimer = 0
      try { document.body.classList.remove('logyq-layout-settling') } catch (_e) {}
      return
    }
    state.layoutSettling = true
    try { document.body.classList.add('logyq-layout-settling') } catch (_e) {}
    try { clearTimeout(state.layoutSettleTimer) } catch (_e) {}
    state.layoutSettleTimer = setTimeout(() => {
      state.layoutSettling = false
      state.layoutSettleTimer = 0
      try { document.body.classList.remove('logyq-layout-settling') } catch (_e) {}
      if (state.layoutFlushQueued) this.flushCreateLayout()
    }, delay)
  },

  bindUidStamp(selection){
    selection.each(function(d){
      const el = this
      const uid = d?.data?._uid
      if (uid != null && String(uid) !== '') el.setAttribute('data-uid', uid)
      if (el.__logyqUidStamp) return
      el.__logyqUidStamp = true
      el.addEventListener('pointerdown', function(event){
        const next = this.__data__?.data?._uid || this.getAttribute('data-uid')
        if (next != null && String(next) !== '') event.__logyqUid = next
      }, true)
    })
  },

  syncHitSlots(nodes){
    const { elements, config: CONFIG } = logyq
    if (!elements.gHits) {
      elements.gHits = elements.gRoot.insert("g", "g.nodes").attr("class", "hit-slots");
    }
    const sel = elements.gHits.selectAll("g.hit-slot").data(nodes, d => d.data._uid);
    const enter = sel.enter().append("g").attr("class", "hit-slot");
    enter.append("rect")
      .attr("x", -CONFIG.CARD_WIDTH/2)
      .attr("y", -CONFIG.CARD_HEIGHT/2)
      .attr("width", CONFIG.CARD_WIDTH)
      .attr("height", CONFIG.CARD_HEIGHT)
      .attr("fill", "transparent")
      .style("pointer-events", "all");
    const slots = enter.merge(sel)
      .attr("data-uid", d => d.data._uid)
      .attr("transform", d => `translate(${d.x},${d.y})`);
    this.bindUidStamp(slots)
    sel.exit().remove();
  },

  layoutAndRender(isDelete=false){
    const { state } = logyq
    if (window.__logyqHoldDragFrozen?.()) return;
    if (state.layoutSettling) state.layoutOverlapCount = (state.layoutOverlapCount || 0) + 1
    if (!state.root) { this.renderEmpty(); return; }
    this.applyLayout(state.root);
    this.render(isDelete);
    this.armLayoutSettle();
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
    const motion = Number.isFinite(state.layoutMotionMs) ? state.layoutMotionMs : 260
    const glide = (sel) => {
      if (motion > 0) return sel.transition().duration(motion)
      sel.interrupt()
      return sel
    }

    const selLinks=elements.gLinks.selectAll("path.link").data(links, d=>d.target.data._uid);
    const enteredLinks = selLinks.enter().append("path").attr("class","link").style("stroke-width", 2.8).style("opacity", 0.5)
      .attr("d", d=> logyq.visual.vLink({source:d.source, target:d.source}))
    glide(enteredLinks).attr("d", d=> logyq.visual.vLink(d));
    glide(selLinks).style("stroke-width", 2.8).style("opacity", 0.5).attr("d", d=> logyq.visual.vLink(d));
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
  .attr("data-uid", d => d.data._uid)
  .attr("transform", d => `translate(${d.x},${d.y})`)
  .style("opacity", 1)
  .on("contextmenu", logyq.mix.onNodeContextMenu)  // right-click menu on new nodes
  .on("mousedown",  logyq.selection.onNodeMouseDown)     // left-click selection on new nodes
  .call(nodeDrag);                       // drag on new nodes







    /* [patch] grabzone-behind start */
    nEnter.insert("rect",":first-child")
      .attr("class","grabzone")
      .attr("x",-CONFIG.CARD_WIDTH/2)
      .attr("y",-CONFIG.CARD_HEIGHT/2)
      .attr("width",CONFIG.CARD_WIDTH)
      .attr("height",CONFIG.CARD_HEIGHT)
      .style("fill","transparent")
      .style("cursor","grab").style("pointer-events","none");
    /* [patch] grabzone-behind end */
    nEnter.append("rect").attr("x", -CONFIG.CARD_WIDTH/2).attr("y", -CONFIG.CARD_HEIGHT/2).attr("width", CONFIG.CARD_WIDTH).attr("height", CONFIG.CARD_HEIGHT);
    nEnter.append("text").attr("class","label").attr("x",0).attr("y",0).style("font-size", `${CONFIG.FONT_SIZE}px`).text(d=>d.data.name);

    const allNodes = nEnter.merge(selNodes);
    allNodes.attr("data-uid", d => d.data._uid);
    allNodes.select("rect.grabzone")
      .attr("x", -CONFIG.CARD_WIDTH/2)
      .attr("y", -CONFIG.CARD_HEIGHT/2)
      .attr("width", CONFIG.CARD_WIDTH)
      .attr("height", CONFIG.CARD_HEIGHT)
      .style("pointer-events", "none");
    allNodes.select("rect:not(.grabzone)")
      .attr("data-uid", d => d.data._uid)
      .style("fill", d => d.data.color || null);
    this.bindUidStamp(allNodes);
    glide(allNodes).attr("transform", d=>`translate(${d.x},${d.y})`);
    allNodes.select("text.label").text(d=>d.data.name).style("font-size", `${CONFIG.FONT_SIZE}px`);
    selNodes.exit().transition().duration(isDelete?50:180).style("opacity",0).remove();

    this.syncHitSlots(nodes);
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
    const svgNode = elements.svg.node();
    const fullW=svgNode.clientWidth, fullH=svgNode.clientHeight;
    if(!b||!b.width||!b.height) return;
    const phone = typeof window !== 'undefined' && window.matchMedia
      && window.matchMedia('((pointer:coarse) and (max-width:1200px)),((hover:none) and (max-width:1200px)),(max-width:700px)').matches;
    const edge = phone && window.matchMedia('(orientation: landscape)').matches;
    const headerH = phone && !edge ? (document.getElementById('logiq-mobile-header')?.getBoundingClientRect().height || 48) : 0;
    const dockEl = phone ? document.getElementById('Dock') : null;
    const dockBox = dockEl && !dockEl.classList.contains('dock-hidden') ? dockEl.getBoundingClientRect() : null;
    const dockH = dockBox && dockBox.height > 8 ? dockBox.height + 8 : 16;
    const usableH = Math.max(80, fullH - headerH - dockH);
    const widthScale = (fullW - pad) / b.width;
    const heightScale = ((phone ? usableH : fullH) - pad) / b.height;
    const maxK = (state.zoom?.scaleExtent?.() || [0.02, 2.4])[1];
    const scale = phone
      ? Math.min(maxK, Math.max(0.02, widthScale))
      : Math.min(1, widthScale, heightScale);
    if(!isFinite(scale) || scale<=0) return;
    const tx=(fullW/2)-scale*(b.x+b.width/2);
    let ty;
    if (!phone) {
      ty = (fullH/2)-scale*(b.y+b.height/2);
    } else if (scale * b.height <= usableH - pad) {
      ty = (headerH + usableH/2) - scale*(b.y+b.height/2);
    } else {
      ty = headerH + pad - scale * b.y;
    }
  const el = svgNode;
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
    s.close && s.close.addEventListener('click', close);
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
/* ======================= KEYBOARD ======================= */
function keyDispatcher(e){
  const { state, elements, utils } = logyq
  // Only block hotkeys while typing *unless* Tab is being held
  if (logyq.input.isTextField(e.target) && !state.tabHold) return;
  const modalOpen = elements.settings.backdrop && elements.settings.backdrop.classList.contains("show");
  const t = e.target || {};
  const typing = (t instanceof HTMLInputElement) || (t instanceof HTMLTextAreaElement) || t.isContentEditable === true;
  const k = (e.key || "");
  const lower = k.toLowerCase();

  /* [patch] dock-ctrlA toggle start */
  if (!modalOpen && !typing && document.querySelector("#Dock:hover") && e.shiftKey && lower==="a") {
    e.preventDefault();
    logyq.wordDock.flipBankSelection?.();
    return;
  }
  /* [patch] dock-ctrlA toggle end */

  if (k === 'Escape'){
    if (state.editingUid){
      e.preventDefault();
      logyq.editing.closeNodeEditor(false,false);
    }
    return;
  }

  if (modalOpen) {
    if (lower === 'i'){ e.preventDefault(); document.getElementById("gapUp")?.click(); }
    if (lower === 'k'){ e.preventDefault(); document.getElementById("gapDown")?.click(); }
    if (lower === 'x'){ e.preventDefault(); document.getElementById("settingsClose")?.click(); }
    return;
  }

  if (typing && !state.tabHold) return;

 // 🔑 Hotkeys
    if (lower === 'f' && !e.shiftKey){ e.preventDefault(); logyq.treeManager.autoFit(); return; }
    if (lower === 'f' && e.shiftKey) { e.preventDefault(); logyq.camera.centerOnSelected(); return; }
    if (lower === 'a')               { e.preventDefault(); elements.wordInput.focus(); const L = elements.wordInput.value.length; elements.wordInput.setSelectionRange?.(L,L); return; }
    if (lower === 'm')               { e.preventDefault(); logyq.mix.randomizeTree(!!e.shiftKey); return; }
    if (lower === 'w' && !e.shiftKey){
      e.preventDefault();
      const side = logyq.dock.cycleDockSide();
      logyq.selection.showToast(logyq.dock.sideLabel(side), 900);
      return;
    }
    if (lower === 'u' && e.shiftKey) { e.preventDefault(); logyq.history.redo?.(); return; }
    if (lower === 'u')               { e.preventDefault(); logyq.history.undo(); return; }
    if (lower === 'p')               { e.preventDefault(); elements.settings.exportBackdrop && elements.settings.exportBackdrop.classList.add("show"); return;}

/* [patch] edit hotkeys start */
if (lower === 'e' && !e.metaKey){
  e.preventDefault(); // always handled
  let uid = null;

  // Prefer group set if exactly one
  if (state.selectedUids && state.selectedUids.size === 1) {
    uid = [...state.selectedUids][0];
  } else if (state.selectedUid) {
    uid = state.selectedUid;
  }

  if (!uid) { logyq.selection.showToast('Select a node to edit'); return; }
  const h = state.root?.descendants().find(n => n.data?._uid === uid);
  if (!h) { logyq.selection.showToast('Select a node to edit'); return; }
  logyq.editing.openNodeEditor(h);

  // Extra: clear contents on Shift+E
  if (e.shiftKey && state.editorEl) {
    state.editorEl.value = '';
    try { state.editorEl.focus(); state.editorEl.select(); } catch {}
  }
  return;
}


// T / Shift+T — delete
//  - T: delete subtree(s) to Trash
//  - Shift+T: delete node only (promote children)
if ((e.key === 't' || e.key === 'T') && !e.ctrlKey && !e.metaKey) {
  if (logyq.input.isTextField(e.target)) return;
  e.preventDefault();

  // Build selection (support focus-only case)
  const selected = state.selectedUids?.size
    ? Array.from(state.selectedUids)
    : (state.selectedUid ? [state.selectedUid] : []);

  if (!selected.length) { logyq.selection.showToast('Select a node'); return; }

  // --- Compute which parent to focus *before* we mutate the tree
  let focusAfter = null;
  if (state.root) {
    const byUid = new Map(state.root.descendants().map(n => [n.data._uid, n]));
    for (const uid of selected) {
      const h = byUid.get(uid);
      if (h && h.parent) { focusAfter = h.parent.data._uid; break; }
    }
  }

  // --- Do the deletion
  if (e.shiftKey) {
    // node-only delete (reattach/promote children)
    if (selected.length === 1) {
      state.selectedUids = new Set(selected);
      logyq.deletion.deleteSelectedNodeOnly();
    } else {
      state.selectedUids = new Set(selected);
      logyq.deletion.deleteSelectedNodesOnly();
    }
  } else {
    // full subtree delete(s) to Trash
    state.selectedUids = new Set(selected);
    logyq.deletion.deleteNodesToTrash(selected);
  }

  // --- Refresh visuals
  try { logyq.drag?.clear?.(); } catch(_) {}
  logyq.treeManager?.layoutAndRender?.(true, true);

  // --- Clear group to avoid selected fill  "is-filled"
  state.selectedUids = new Set();
  logyq.selection.applySelectionStyles?.();

  // --- Restore focus: parent if it still exists, else root, else nothing
  if (focusAfter && state.root && utils.findByUid(state.root.data, focusAfter)) {
    logyq.selection.selectSingle(focusAfter);

  } else if (state.root) {
    logyq.selection.selectSingle(state.root.data._uid);

  } else {
    logyq.selection.clearSelection?.();
  }

  return;
}




/* [patch] drop-to-bank hotkeys start */
// D → send whole subtree to Word Dock
// Shift+D → send ONLY this node to Word Dock (abandon children in place)
if (!e.ctrlKey && !e.metaKey) {
  const k = e.key?.toLowerCase?.();
  if (k === 'd') {
    if (logyq.input.isTextField(e.target)) return;
    e.preventDefault();

    // Build selection (support focus-only case)
    const selected = state.selectedUids?.size
      ? Array.from(state.selectedUids)
      : (state.selectedUid ? [state.selectedUid] : []);

    if (!selected.length || !state.root) { logyq.selection.showToast('Select a node'); return; }

    // Keep only top-level selections (don’t duplicate work if an ancestor is also selected)
    const set = new Set(selected);
    const byUid = new Map(state.root.descendants().map(n => [n.data._uid, n]));
    const top = selected.filter(uid => {
      const h = byUid.get(uid);
      if (!h) return false;
      let p = h.parent;
      while (p) { if (set.has(p.data._uid)) return false; p = p.parent; }
      return true;
    });

    // Decide what parent to focus AFTER the operation
    let parentToFocus = null;       // a UID, or '__ROOT__' sentinel if parent is the root slot
    if (top.length === 1) {
      const h = byUid.get(top[0]);
      parentToFocus = h?.parent ? h.parent.data._uid : '__ROOT__';
    } else {
      // Multi: focus the parent only if they all share the same parent
      const parents = new Set(
        top.map(uid => {
          const h = byUid.get(uid);
          return h?.parent ? h.parent.data._uid : '__ROOT__';
        })
      );
      if (parents.size === 1) parentToFocus = [...parents][0];
    }

    // Do the action(s). D is an explicit key, not a long-press.
    window.__logyqExplicitBankCommit = true;
    try {
      if (e.shiftKey) {
        for (const uid of top) {
          const h = state.root?.descendants().find(n => n.data && n.data._uid === uid);
          if (h) sendNodeToWordBank_abandon(h);
        }
      } else {
        for (const uid of top) {
          const h = state.root?.descendants().find(n => n.data && n.data._uid === uid);
          if (h) sendSubtreeToWordBank(h);
        }
      }
    } finally {
      window.__logyqExplicitBankCommit = false;
    }

    // Selection/focus: parent of what we just dropped
    state.selectedUids = new Set();       // clear any group
    state.selectedUid = null;

    if (parentToFocus === '__ROOT__') {
      if (state.root) logyq.selection.selectSingle(state.root.data._uid); // if a root still exists
    } else if (parentToFocus) {
      logyq.selection.selectSingle(parentToFocus);
    } else {
      logyq.selection.clearSelection?.();
    }

    logyq.selection.applySelectionStyles?.();

    // Refresh visuals and gently center on the new selection
    try { logyq.drag?.clear?.(); } catch(_) {}
    logyq.treeManager?.layoutAndRender?.(true, true);

    return;
  }
}
/* [patch] drop-to-bank hotkeys end */


// Arrow navigation
const isUp   = (k==='ArrowUp'   || lower==='i');
const isDown = (k==='ArrowDown' || lower==='k');
const isLeft = (k==='ArrowLeft' || lower==='j');
const isRight= (k==='ArrowRight'|| lower==='l');
if (!(isUp || isDown || isLeft || isRight)) return;

// NEW: stop normal nav if V-hold is active
if (state.vHold) {
  e.preventDefault();
  return;   // 👈 let the V-hold handler take over
}

e.preventDefault();
if (!state.root) return;

function rowAtDepth(depth){
  return state.root.descendants()
    .filter(n => n.depth === depth)
    .sort((a,b) => a.x - b.x);
}
function deepestRow(){
  const nodes = state.root.descendants();
  const maxDepth = nodes.reduce((m,n) => Math.max(m, n.depth), 0);
  return rowAtDepth(maxDepth);
}







  if (!state.selectedUid){
    if (isUp){
      const row = deepestRow(); if (!row.length) return;
      const cx = state.root.x || 0; let best = row[0], bd = Math.abs(row[0].x - cx);
      for (let i=1;i<row.length;i++){ const dd = Math.abs(row[i].x - cx); if (dd < bd){ bd = dd; best = row[i]; } }
      logyq.selection.setSelected(best.data._uid); return;
    }
    if (isDown || isLeft || isRight){ logyq.selection.setSelected(state.root.data._uid); return; }
    return;
  }

  const h = state.root.descendants().find(n => n.data._uid === state.selectedUid); if (!h) return;

  if (isUp){ if (h.parent) logyq.selection.setSelected(h.parent.data._uid); else logyq.selection.setSelected(null); return; }
  if (isDown){
    if (h.children && h.children.length){
      const kids = h.children.slice().sort((a,b)=>a.x-b.x);
      const idx = Math.floor((kids.length-1)/2);
      logyq.selection.setSelected(kids[idx].data._uid); return;
    }
    const nodes = state.root.descendants(), maxDepth = nodes.reduce((m,n)=>Math.max(m,n.depth),0);
    for (let d=h.depth+1; d<=maxDepth; d++){
      const row = rowAtDepth(d);
      if (row.length){
        let best=row[0], bd=Math.abs(row[0].x - h.x);
        for (let i=1;i<row.length;i++){ const dd=Math.abs(row[i].x - h.x); if (dd < bd){ bd = dd; best = row[i]; } }
        logyq.selection.setSelected(best.data._uid); return;
      }
    }
    logyq.selection.setSelected(null); return;
  }



  if (isLeft || isRight){
    const row = rowAtDepth(h.depth);
    if (row.length === 1 && h.children && h.children.length){
      const kids = h.children.slice().sort((a,b)=>a.x-b.x);
      logyq.selection.setSelected((isLeft ? kids[0] : kids[kids.length-1]).data._uid); return;
    }
    const idx = row.findIndex(n => n === h);
    if (idx === -1 || !row.length) return;
    const to = (isLeft ? (idx>0 ? idx-1 : row.length-1) : (idx<row.length-1 ? idx+1 : 0));
    logyq.selection.setSelected(row[to].data._uid);
  }




  

}








/* ======================= TRASH ======================= */
/* Chips only. Node trash (incl. Shift-abandon) is handled in dragManager.end(...) */

function collapseAndRemoveChips(names, done){
  const set = new Set(Array.isArray(names) ? names : [names]);
  const chips = Array.from(document.querySelectorAll('#Dock .chip'))
    .filter(c => set.has((c.textContent || '').trim()));
  if (!chips.length){ done?.(); return; }

  // freeze size for smooth collapse animation
  chips.forEach(c => {
    const r = c.getBoundingClientRect();
    c.style.width  = r.width + 'px';
    c.style.height = r.height + 'px';
    c.textContent  = '';
  });

  // animate collapse
  requestAnimationFrame(()=>{ requestAnimationFrame(()=>{
    chips.forEach(c => c.classList.add('chip-collapse'));
  });});

  // remove from bank after animation
  setTimeout(()=>{
    state.wordBank = state.wordBank.filter(w => !set.has(w));
    logyq.wordDock.clearChipSelection();
    logyq.wordDock.render();
    done?.();
  }, 320);
}

/* Drag-over visuals for Trash */
elements.trash.addEventListener('dragover', function(e){
  if (state.chipDrag && state.chipDrag.active){
    e.preventDefault();
    elements.trash.classList.add('open','wiggle','over');
  }
});

elements.trash.addEventListener('dragleave', function(){
  elements.trash.classList.remove('open','wiggle','over','near');
});

/* Drop chips into Trash */
elements.trash.addEventListener('drop', function(e){
  if (!(state.chipDrag && state.chipDrag.active)) return;

  e.preventDefault();
  elements.trash.classList.remove('open','wiggle','over','near');

  // collect words (chips)
  const words = (Array.isArray(state.chipDrag?.words) && state.chipDrag.words.length)
    ? state.chipDrag.words.slice()
    : (state.chipDrag?.word ? [state.chipDrag.word] : []);

  if (!words.length) return;

  collapseAndRemoveChips(words, () => {
    state.chipDrag.active = false;
    state.chipDrag.words  = [];
    state.chipDrag.word   = null;
    state.chipDrag.drop   = null;
  });
});

/* Context menu: delete selected chips */
elements.trash.addEventListener('contextmenu', (e)=>{
  e.preventDefault();
  const names = logyq.wordDock.getSelectedChipNames();
  if (!names.length) return;
  collapseAndRemoveChips(names);
});










  /* ======================= BOOT ======================= */
  const TreeVisualization = { init: ()=>logyq.treeManager.initialize() };
  window.TreeVisualization = TreeVisualization;
  TreeVisualization.init();

elements.svg.on("contextmenu", (event) => {
  event.preventDefault();
});

  /* ======================= BOOT ======================= */

  function addChildBelowSelectedAndEdit(){
    const { state, utils } = logyq
    const uid = logyq.selection.getSelectedUid();
    if (!state?.root || !uid){ logyq.selection.showToast('Select one node'); return; }

    const h = state.root.descendants().find(n => n?.data?._uid === uid);
    if (!h){ logyq.selection.showToast('Could not find selected node'); return; }

    const child = { name: '' };
    utils?.assignUids?.(child);

    h.data.children = h.data.children || [];
    h.data.children.push(child); // rightmost child

    logyq.history.pushHistory({ type:'add', parentPath: utils.pathToUid(state.root.data, uid), uid: child._uid });

    state.root = d3.hierarchy(state.root.data);
    utils.assignIds(state.root);
    logyq.treeManager.layoutAndRender(false);

    logyq.selection.selectSingle(child._uid);
    logyq.camera.flyCenterToUID(child._uid);
    const nh = state.root.descendants().find(n => n?.data?._uid === child._uid);
    if (nh){ logyq.editing.openNodeEditor(nh); if (state.editorEl) state.editorEl.value = ''; }
  }

  function addElderSiblingLeftAndEdit(){
    const { state, utils } = logyq
    if (!state?.root) return;

    const uid = logyq.selection.getSelectedUid();
    if (!uid) { logyq.selection.showToast('Select one node'); return; }

    const h = state.root.descendants().find(n => n?.data?._uid === uid);
    if (!h) { logyq.selection.showToast('Node not found'); return; }
    if (!h.parent) return; // root: no effect

    const parentData = h.parent.data;
    parentData.children = parentData.children || [];
    const idx = parentData.children.findIndex(c => c && c._uid === uid);
    if (idx < 0) return;

    // New sibling to the LEFT (insert before current index)
    const sib = { name: '' };
    utils?.assignUids?.(sib);
    parentData.children.splice(idx, 0, sib);

    // history for Undo
    logyq.history.pushHistory({
      type: 'add',
      parentPath: utils.pathToUid(state.root.data, h.parent.data._uid),
      uid: sib._uid
    });

    // rebuild + render
    state.root = d3.hierarchy(state.root.data);
    utils.assignIds(state.root);
    logyq.treeManager.layoutAndRender(false);

    // select & edit the new sibling
    logyq.selection.selectSingle(sib._uid);
    logyq.camera.flyCenterToUID(sib._uid);
    const nh = state.root.descendants().find(n => n?.data?._uid === sib._uid);
    if (nh){ logyq.editing.openNodeEditor(nh); if (state.editorEl) state.editorEl.value = ''; }
  }

  function addYoungerSiblingRightAndEdit(){
    const { state, utils } = logyq
    if (!state?.root) return;

    const uid = logyq.selection.getSelectedUid();
    if (!uid){ logyq.selection.showToast('Select one node'); return; }

    const h = state.root.descendants().find(n => n?.data?._uid === uid);
    if (!h || !h.parent) return; // root: no effect

    const parentData = h.parent.data;
    parentData.children = parentData.children || [];
    const idx = parentData.children.findIndex(c => c && c._uid === uid);
    if (idx < 0) return;

    // Insert immediately to the RIGHT of current
    const sib = { name: '' };
    utils?.assignUids?.(sib);
    parentData.children.splice(idx + 1, 0, sib);

    // Undo history
    logyq.history.pushHistory({
      type: 'add',
      parentPath: utils.pathToUid(state.root.data, h.parent.data._uid),
      uid: sib._uid
    });

    // Rebuild + render
    state.root = d3.hierarchy(state.root.data);
    utils.assignIds(state.root);
    logyq.treeManager.layoutAndRender(false);

    // Select & edit
    logyq.selection.selectSingle(sib._uid);
    logyq.camera.flyCenterToUID(sib._uid);
    const nh = state.root.descendants().find(n => n?.data?._uid === sib._uid);
    if (nh){ logyq.editing.openNodeEditor(nh); if (state.editorEl) state.editorEl.value = ''; }
  }

  function insertParentAboveSelectedAndEdit(){
    const { state, utils } = logyq
    if (!state?.root) return;

    const uid = logyq.selection.getSelectedUid();
    if (!uid){ logyq.selection.showToast('Select one node'); return; }

    const h = state.root.descendants().find(n => n?.data?._uid === uid);
    if (!h) { logyq.selection.showToast('Node not found'); return; }
    if (!h.parent) return; // root: no effect

    const parentData = h.parent.data;
    parentData.children = parentData.children || [];
    const idx = parentData.children.findIndex(c => c && c._uid === uid);
    if (idx < 0) return;

    // Snapshot for easy Undo
    const prevTree = utils.deepClone(state.root.data);
    logyq.history.pushHistory({ type: 'replace-root', prev: prevTree });

    // Create the new parent and adopt the selected node
    const newParent = { name: '' };
    utils?.assignUids?.(newParent);

    // Replace the selected node's slot with the new parent
    parentData.children.splice(idx, 1, newParent);

    // Make the selected node a child of the new parent (keep its existing subtree)
    newParent.children = [ parentData.children[idx]?.children && parentData.children[idx].children[0] === h.data ? h.data : h.data ];
    // simpler: just set children = [h.data]
    newParent.children = [ h.data ];

    // Rebuild + render
    state.root = d3.hierarchy(state.root.data);
    utils.assignIds(state.root);
    logyq.treeManager.layoutAndRender(false);

    // Select & edit the new parent
    logyq.selection.selectSingle(newParent._uid);
    logyq.camera.flyCenterToUID(newParent._uid);
    const nh = state.root.descendants().find(n => n?.data?._uid === newParent._uid);
    if (nh){ logyq.editing.openNodeEditor(nh); if (state.editorEl) state.editorEl.value = ''; }
  }

  function onRelativeCreateHotkeys(e){
    if (!e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
    if (logyq.input.isTextField(e.target)) return;
    const action =
      e.key === 'K' || e.key === 'k' ? addChildBelowSelectedAndEdit :
      e.key === 'J' || e.key === 'j' ? addElderSiblingLeftAndEdit :
      e.key === 'L' || e.key === 'l' ? addYoungerSiblingRightAndEdit :
      e.key === 'I' || e.key === 'i' ? insertParentAboveSelectedAndEdit :
      null;
    if (!action) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    action();
  }

  // Capture so I/J/K/L-nav in keyDispatcher never sees the shifted create keys.
  window.addEventListener('keydown', onRelativeCreateHotkeys, { capture: true });

  attach('keyboard', {
    keyDispatcher,
    addChildBelowSelectedAndEdit,
    addElderSiblingLeftAndEdit,
    addYoungerSiblingRightAndEdit,
    insertParentAboveSelectedAndEdit,
    onRelativeCreateHotkeys,
  });
/* LOGYQ preview integration seam.
   Keep the copied engine above intact; mobile UI and persistence live in
   js/preview.js and use only this deliberately small bridge. */
(() => {
  const changeListeners = new Set();
  let changeReady = false;

  // Vercel clean URLs remove the trailing slash from /logyq/index.html.
  // Repair legacy relative logo URLs before loading the absolute enhancement.
  document.querySelectorAll('[src^="logos/"]').forEach((element) => {
    element.setAttribute('src', `/logyq/${element.getAttribute('src')}`);
  });
  document.querySelectorAll('[href^="logos/"]').forEach((element) => {
    element.setAttribute('href', `/logyq/${element.getAttribute('href')}`);
  });

  const snapshot = () => ({
    tree: logyq.state.root ? logyq.utils.deepClone(logyq.state.root.data) : null,
    wordBank: Array.isArray(logyq.state.wordBank) ? logyq.state.wordBank.slice() : []
  });

  const normalizePaintColor = (color) => {
    if (color == null) return null;
    const next = String(color).trim().toLowerCase();
    if (!next || next === 'off' || next === 'clear' || next === '#fff' || next === '#ffffff' || next === 'white') return null;
    return String(color).trim();
  };

  // Color lives on node data (`color`) so snapshot / maps / reload keep it.
  // Does not change selection or fly the camera.
  const paintNodes = (uid, color, branch) => {
    const node = uid && logyq.state.root?.descendants().find((item) => item.data?._uid === uid);
    if (!node) return false;
    const next = normalizePaintColor(color);
    const targets = branch && typeof node.descendants === 'function' ? node.descendants() : [node];
    const changed = targets.some((item) => (item?.data?.color || null) !== next);
    if (!changed) return true;
    pushHistory({ type: 'replace-root', prev: utils.deepClone(state.root.data) });
    for (const item of targets) {
      if (!item?.data) continue;
      if (next) item.data.color = next;
      else delete item.data.color;
    }
    logyq.treeManager.layoutAndRender(false);
    emitChange();
    return true;
  };

  const emitChange = () => {
    if (!changeReady) return;
    const value = snapshot();
    changeListeners.forEach((listener) => {
      try { listener(value); } catch (_error) {}
    });
  };

  const originalLayoutAndRender = logyq.treeManager.layoutAndRender.bind(logyq.treeManager);
  logyq.treeManager.layoutAndRender = (...args) => {
    if (window.__logyqHoldDragFrozen?.()) return;
    const result = originalLayoutAndRender(...args);
    queueMicrotask(emitChange);
    return result;
  };

  window.LOGYQBridge = Object.freeze({
    version: 'logyq-isolated',
    core: logyq,
    snapshot,
    subscribe(listener) {
      changeListeners.add(listener);
      return () => changeListeners.delete(listener);
    },
    notifyChange: emitChange,
    getSelectedUid: () => logyq.selection.getSelectedUid(),
    getSelectedUids: () => logyq.state.selectedUids ? Array.from(logyq.state.selectedUids) : [],
    selectByUid(uid) {
      const node = uid && logyq.state.root?.descendants().find((item) => item.data?._uid === uid);
      if (!node) return false;
      logyq.selection.selectSingle(uid);
      return true;
    },
    clearFocusSelection() {
      logyq.selection.clearGroup();
      logyq.selection.clearSelection();
      return true;
    },
    selectByName(name) {
      const label = String(name ?? '').trim();
      if (!label) return false;
      const node = logyq.state.root?.descendants().find((item) => item.data?.name === label);
      if (!node) return false;
      logyq.selection.selectSingle(node.data._uid);
      return true;
    },
    getParentName(name) {
      const label = String(name ?? '').trim();
      if (!label) return null;
      const node = logyq.state.root?.descendants().find((item) => item.data?.name === label);
      return node?.parent?.data?.name || null;
    },
    editSelected({ wipe = false, uid = undefined } = {}) {
      if (uid == null || String(uid) === '') return false;
      const targetUid = uid;
      let node = logyq.state.root?.descendants().find((item) => item.data?._uid === targetUid);
      if (!node) node = logyq.treeManager.ensureUidLayout?.(targetUid) || null;
      if (!node) return false;
      logyq.selection.selectSingle(targetUid);
      logyq.editing.openNodeEditor(node);
      if (wipe && logyq.state.editorEl) logyq.state.editorEl.value = '';
      return true;
    },
    addChild() {
      if (!logyq.state.selectedUid) return false;
      return !!logyq.treeOps.addChildOf(logyq.state.selectedUid, '', { noEdit: false });
    },
    createRelative(direction, originUid) {
      if (originUid == null || String(originUid) === '') return null;
      const origin = originUid;
      const calm = { noEdit: true, select: true, rootAsChild: false };
      const created =
        direction === 'down' ? logyq.treeOps.addChildOf(origin, '', calm) :
        direction === 'right' ? logyq.treeOps.addSiblingRightOf(origin, '', calm) :
        direction === 'left' ? logyq.treeOps.addSiblingLeftOf(origin, '', calm) :
        direction === 'up' ? logyq.treeOps.insertParentAbove(origin, '', calm) :
        null;
      if (logyq.state.editingUid) logyq.editing.closeNodeEditor(false, false);
      if (created) {
        logyq.state.lastCreatedUid = created;
        logyq.selection.selectSingle(created);
      }
      emitChange();
      return created || null;
    },
    renameNode(uid, name) {
      const target = uid && utils.findByUid(state.root?.data, uid);
      if (!target) return false;
      const next = name == null ? '' : String(name).trim();
      const prev = target.name ?? '';
      if (next === prev) return true;
      pushHistory({ type: 'rename', uid, prev, next });
      target.name = next;
      state.root = d3.hierarchy(state.root.data);
      utils.assignIds(state.root);
      logyq.treeManager.layoutAndRender(false);
      logyq.selection.selectSingle(uid);
      emitChange();
      return true;
    },
    paintUid(uid, color) {
      return paintNodes(uid, color, false);
    },
    paintBranch(uid, color) {
      return paintNodes(uid, color, true);
    },
    deleteSelection({ nodeOnly = false } = {}) {
      if (nodeOnly) {
        logyq.deletion.deleteSelectedNodeOnly();
      } else {
        const grouped = logyq.state.selectedUids ? Array.from(logyq.state.selectedUids) : [];
        const targets = grouped.length ? grouped : (logyq.state.selectedUid ? [logyq.state.selectedUid] : []);
        if (!targets.length) return false;
        logyq.deletion.deleteNodesToTrash(targets);
        if (logyq.state.root) logyq.treeManager.layoutAndRender(false);
      }
      emitChange();
      return true;
    },
    undo() { undo(); },
    mix(includeBank = false) { logyq.mix.randomizeTree(!!includeBank); },
    fit() { logyq.treeManager.autoFit(); },
    loadMap(tree, wordBank = []) {
      if (logyq.state.editingUid) logyq.editing.closeNodeEditor(false, false);
      const next = utils.deepClone(tree || { name: 'New map' });
      utils.assignUids(next);
      state.root = d3.hierarchy(next);
      utils.assignIds(state.root);
      state.wordBank = Array.isArray(wordBank) ? wordBank.slice() : [];
      state.history = [];
      elements.undoBtn.disabled = true;
      logyq.selection.clearGroup();
      logyq.selection.clearSelection();
      logyq.wordDock.render();
      logyq.treeManager.layoutAndRender(false);
      logyq.treeManager.autoFit();
    },
    cycleDock() {
      const side = logyq.dock.cycleDockSide();
      logyq.selection.showToast(logyq.dock.sideLabel(side), 900);
      return side;
    },
    setDockSide(side) {
      return logyq.dock.setSide(side);
    },
    dispatchKey(key, options = {}) {
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true,
        ...options
      }));
    }
  });

  queueMicrotask(() => { changeReady = true; });
})();

})();

