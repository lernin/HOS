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
/* Curriculum play is a rebuild sandbox. Normal maps never set this class. */
function curriculumPlayLocked(){
  try {
    return typeof document !== 'undefined' && !!document.body?.classList &&
      (document.body.classList.contains('logyq-curriculum') || document.body.classList.contains('logyq-game'));
  } catch (_e) {
    return false;
  }
}

/* Game play fits once on entry. After that the camera stays put. */
function gameCameraLocked(){
  try {
    return typeof document !== 'undefined' && !!document.body?.classList?.contains('logyq-game');
  } catch (_e) {
    return false;
  }
}

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
  if (typeof gameCameraLocked === 'function' && gameCameraLocked()) return;
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
  if (typeof gameCameraLocked === 'function' && gameCameraLocked()) return;
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
  // Curriculum owns its camera (root-anchored settle only). A zoom event
  // from that settle must not recenter on the selected card.
  if (typeof document !== 'undefined' && document.body?.classList?.contains('logyq-curriculum')) return;
  if (typeof gameCameraLocked === 'function' && gameCameraLocked()) return;
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


