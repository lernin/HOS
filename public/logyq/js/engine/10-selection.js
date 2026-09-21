  /* ======================= SELECTION + TOAST ======================= */
/* [patch] selection-helpers start */

function applySelectionStyles(){
  const { state, elements } = logyq
  if (!elements.gNodes) return;

  const hasGroup = !!(state.selectedUids && state.selectedUids.size > 0);
  const vFocus = !!(state.vHold && !hasGroup && state.selectedUid);

  elements.gNodes.selectAll("g.node")
    .classed("is-outlined", n =>
      (!hasGroup && state.selectedUid === n.data._uid) ||
      (hasGroup && state.selectedUids.has(n.data._uid))
    )
    // Selected fill if a group exists (your old behavior) OR while V-hold focus-only.
    .classed("is-filled", n =>
      (hasGroup && state.selectedUid === n.data._uid) ||
      (vFocus && state.selectedUid === n.data._uid)
    )
    // This class triggers marching-ants via the CSS above (only during V-hold focus-only).
    .classed("is-focus-vhold", n =>
      vFocus && state.selectedUid === n.data._uid
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
  if (event.button !== 0) return;                  // left only
  if (isTextField?.(event.target)) return;

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
window.addEventListener('keydown', (e) => {
  const { state, elements } = logyq
  if (isTextField?.(e.target)) return;
  if ((e.key === 'v' || e.key === 'V') && !e.ctrlKey && !e.metaKey && !e.altKey){
    const noGroup = !(state.selectedUids && state.selectedUids.size > 0);
    if (noGroup && state.selectedUid){
      state.vHold = true;
      elements.svg?.classed?.('vhold-mode', true);  // enables CSS marching ants
      applySelectionStyles();
    }
  }
}, { passive: true });


// While V-hold and no group: immediate push with J/L or ArrowLeft/Right
window.addEventListener('keydown', (e) => {
  const { state } = logyq
  if (!state.vHold) return;
  if (isTextField?.(e.target)) return;
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


}, { passive: false });




window.addEventListener('keyup', (e) => {
  const { state, elements } = logyq
  if (e.key === 'v' || e.key === 'V'){
    state.vHold = false;
    elements.svg?.classed?.('vhold-mode', false);
    applySelectionStyles();
  }
}, { passive: true });


// ===== END HOISTED HOLD HANDLERS =====







// Hotkeys: G (group), V (paste), Shift+V (abandonment paste)
// NOTE: Esc is handled elsewhere already; we don't handle Esc here to avoid duplicates.
window.addEventListener('keydown', (e) => {
  const { state } = logyq
  // Don’t steal keys from inputs
  if (typeof isTextField === 'function' && isTextField(e.target)) return;

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

  // --- Navigation keys (J/K/L/I and arrows) ---
  const navKeys = [
    'j', 'k', 'l', 'i',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'
  ];
  

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
}, { passive: false });





// ==========================================================================

  attach('selection', {
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
  })



