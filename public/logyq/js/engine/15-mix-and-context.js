  /* ======================= RANDOMIZE ======================= */
function randomizeTree(includeBank){
  const { state, utils } = logyq
  try{
    const prevTree = state.root ? utils.deepClone(state.root.data) : null;
    const prevBank = Array.isArray(state.wordBank) ? state.wordBank.slice() : [];
    let labels = [];
    if (state.root){ labels = state.root.descendants().map(n => n.data?.name || "").filter(Boolean); }
    if (includeBank && prevBank.length) labels = labels.concat(prevBank);
    if (!labels.length){ logyq.selection.showToast("Nothing to mix"); return; }

    const rootLabel = (state.root && state.root.data?.name) ? state.root.data.name : labels[0];
    let pool = labels.slice();
    const rmIdx = pool.indexOf(rootLabel); if (rmIdx > -1) pool.splice(rmIdx, 1);
    for (let i = pool.length - 1; i > 0; i--){
      const j = (Math.random() * (i + 1)) | 0;
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    function ri(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }

    const root = { name: rootLabel, children: [] };
    let q = [{ node: root, cap: ri(1,3), used: 0 }], k = 0;
    while (k < pool.length){
      if (!q.length) q.push({ node: root, cap: ri(1,3), used: 0 });
      const p = q[0];
      if (p.used >= p.cap){ q.shift(); continue; }
      const child = { name: pool[k++] };
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

    // Remix instantly with stable root
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

  if (!d || !state.root) return;
  const uid = d?.data?._uid;
  if (!uid) return;


















// 1) Ctrl+RIGHT = ABANDON (single OR multi-set; children stay with parent)
if (event.shiftKey && !event.metaKey) {
  const set = (state.selectedUids instanceof Set) ? state.selectedUids : null;
  const inGroup = !!(set && set.size > 1 && set.has(uid));

  // Build the list of victim UIDs: either the top-level selection, or just the clicked node
  let victims = [uid];
  if (inGroup) {
    const byUid = new Map(state.root.descendants().map(h => [h.data._uid, h]));
    const topLevel = [];
    for (const u of set) {
      const h = byUid.get(u);
      if (!h || !h.parent) continue;            // skip root / missing
      let p = h.parent, under = false;
      while (p) { if (set.has(p.data._uid)) { under = true; break; } p = p.parent; }
      if (!under) topLevel.push(u);
    }
    victims = topLevel;
  }

  if (!victims.length) return;

  const prev = utils.deepClone(state.root.data);

  for (const vUid of victims) {
    // find fresh hierarchy node for each vUid
    const h = state.root.descendants().find(n => n.data && n.data._uid === vUid);
    if (!h || !h.parent) continue;              // skip root or not found

    const parentData = h.parent.data;
    const arr = parentData.children || (parentData.children = []);
    const idx = arr.findIndex(c => c && c._uid === vUid);
    if (idx < 0) continue;

    const moving = arr[idx];
    const orphans = (moving.children || []).slice();
    moving.children = null;                      // only the node’s label goes to bank

    // parent adopts children at same position
    arr.splice(idx, 1, ...orphans);
    if (arr.length === 0) parentData.children = null;

    const nm = (moving?.name || '').trim();
    if (nm) {
      if (typeof logyq.wordDock?.addWords === 'function') logyq.wordDock.addWords(nm, 'bank');
      else {
        state.wordBank = state.wordBank || [];
        state.wordBank.push(nm);
      }
    }
  }

  logyq.history.pushHistory?.({ type: 'replace-root', prev });  // snapshot once for whole operation
  state.root = d3.hierarchy(state.root.data); utils.assignIds(state.root);
  logyq.selection.clearSelection?.();
  logyq.treeManager.layoutAndRender(false);
  logyq.selection.showToast?.(`Sent ${victims.length} node(s) to Word Dock (children stayed)`);
  return;
}






















  // 2) If chips are selected → paste chips as children under this node
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







// 3) Plain RIGHT = SUBTREE(S) → Word Bank (group-aware)

  const set = (state.selectedUids instanceof Set) ? state.selectedUids : null;
  const inGroup = !!(set && set.size > 1 && set.has(uid));

  if (inGroup) {
    // --- MULTI: gather top-level selections (skip any whose ancestor is also selected)
    const byUid = new Map(state.root.descendants().map(h => [h.data._uid, h]));
    const topLevel = [];
    for (const u of set) {
      const h = byUid.get(u); if (!h) continue;
      // don’t accidentally delete the whole tree via root in a group
      if (!h.parent) continue;
      let p = h.parent, under = false;
      while (p) { if (set.has(p.data._uid)) { under = true; break; } p = p.parent; }
      if (!under) topLevel.push(u);
    }
    // left→right stability (optional)
    topLevel.sort((a,b) => (byUid.get(a)?.x||0) - (byUid.get(b)?.x||0));

    if (!topLevel.length) {
      // nothing valid to do → fall back to single below
    } else {
      const namesToBank = [];

      for (const u of topLevel) {
        const h = byUid.get(u); if (!h || !h.parent) continue;

        // collect all labels in this subtree
        const subtreeNames = h.descendants()
          .map(n => (n?.data?.name || '').trim())
          .filter(Boolean);
        namesToBank.push(...subtreeNames);

        // delete subtree from its parent (with history)
        const parentData = h.parent.data;
        const arr = parentData.children || (parentData.children = []);
        const idx = arr.findIndex(c => c && c._uid === u);
        logyq.history.pushHistory?.({
          type: 'delete',
          parentPath: utils.pathToUid(state.root.data, parentData._uid),
          index: idx,
          subtree: utils.deepClone(h.data)
        });
        if (idx >= 0) arr.splice(idx, 1);
        if (arr.length === 0) parentData.children = null;
      }

      // shove all collected names to the Word Bank
      if (namesToBank.length) {
        if (typeof logyq.wordDock?.addWords === 'function') {
          logyq.wordDock.addWords(namesToBank.join('\n'), 'bank');
        } else {
          state.wordBank = state.wordBank || [];
          state.wordBank.push(...namesToBank);
        }
      }

      // rebuild & redraw
      state.root = d3.hierarchy(state.root.data); utils.assignIds(state.root);
      logyq.selection.clearSelection?.();
      logyq.treeManager.layoutAndRender(true, true);
      logyq.selection.showToast?.(`Sent ${namesToBank.length} items to Word Dock`);
      return;
    }
  }

  // --- SINGLE (fallback): your original single-subtree → Word Bank behavior
  const names = d.descendants().map(n => n?.data?.name).filter(Boolean);
  if (names.length){
    if (typeof logyq.wordDock?.addWords === 'function') logyq.wordDock.addWords(names.join('\n'), 'bank');
    else {
      state.wordBank = state.wordBank || [];
      state.wordBank.push(...names);
    }
  }

  if (!d.parent){
    // whole tree
    logyq.history.pushHistory?.({ type: 'delete-root', subtree: utils.deepClone(d.data) });
    state.root = null; state.lastNodes = [];
    logyq.drag.clear?.();
    logyq.treeManager.renderEmpty();
    logyq.selection.showToast?.("Sent whole tree to Word Dock");
    return;
  }

  // non-root: remove subtree from parent
  const parentData = d.parent.data;
  const sibs = parentData.children || (parentData.children = []);
  const idx = sibs.findIndex(c => c && c._uid === uid);
  logyq.history.pushHistory?.({
    type: 'delete',
    parentPath: utils.pathToUid(state.root.data, parentData._uid),
    index: idx,
    subtree: utils.deepClone(d.data)
  });
  if (idx >= 0) sibs.splice(idx, 1);

  // Rebuild from data; no need to mutate d.parent.children when we rebuild
  state.root = d3.hierarchy(state.root.data); utils.assignIds(state.root);
  logyq.treeManager.layoutAndRender(true, true);
  logyq.selection.showToast?.("Sent subtree to Word Dock");
  return;
}











/* [patch] left-mousedown selection (no collapse of multi-set) */
function onNodeLeftDown(event, d){
  const { state } = logyq
  // Only left button
  if (event.button !== 0) return;

  // Don’t interfere with text inputs/inline editor
  if (logyq.input.isTextField(event.target)) return;

  // Keep it local to the node
  event.stopPropagation();

  const uid = d?.data?._uid;
  if (!uid) return;

  // Ensure the set exists
  state.selectedUids = state.selectedUids || new Set();
  const set = state.selectedUids;

  // SHIFT = multi-toggle membership
  if (event.shiftKey){
    // add/remove this node in the set (no other changes)
    logyq.selection.toggleNodeSelection(uid);
    return;
  }

  // No SHIFT:
  // If a multi-set exists AND this node is already in it: do nothing (so you can drag the whole set)
  if (set.size > 1 && set.has(uid)){
    return;
  }

  // If a multi-set exists AND this node is NOT in it: clear and select only this node
  if (set.size > 1 && !set.has(uid)){
    logyq.selection.selectSingle(uid);
    return;
  }

  // No multi-set active → plain toggle of this one
  if (set.has(uid)){
    logyq.selection.clearSelection();      // toggle off
  } else {
    logyq.selection.selectSingle(uid);     // toggle on
  }
}









  /* [patch] saved-maps start */
  const SAVED_KEY = "logyq_saved_maps_v1";
  function getSavedMaps(){ try { return JSON.parse(localStorage.getItem(SAVED_KEY) || "[]"); } catch(_e){ return []; } }
  function setSavedMaps(arr){ try { localStorage.setItem(SAVED_KEY, JSON.stringify(arr || [])); } catch(_e){} }
  function saveCurrentMap(){
    const { state, utils } = logyq
    if (!state.root) { logyq.selection.showToast("Nothing to save"); return; }
    const saved = getSavedMaps();
    const defaultName = "Map " + (saved.length + 1);
    const name = (prompt("Save map as:", defaultName) || defaultName).trim();
    saved.push({ name, data: utils.deepClone(state.root.data) });
    setSavedMaps(saved);
    logyq.selection.showToast("Saved " + name, 1200);
  }
  function openMapsMenu(){
    const { state, utils } = logyq
    const saved = getSavedMaps();
    if (!saved.length) { alert("No saved maps yet."); return; }
    const list = saved.map((m,i)=> (i+1) + ". " + m.name).join("\n");
    const input = prompt(
      "Choose a map to load (number):\n" + list + "\n\nOr type: del <n>  (e.g., del 2)",
      "1"
    );
    if (!input) return;
    const s = input.trim().toLowerCase();
    if (s.startsWith("del")) {
      const n = parseInt(s.split(/\s+/)[1], 10);
      if (Number.isFinite(n) && n >= 1 && n <= saved.length) {
        saved.splice(n-1, 1);
        setSavedMaps(saved);
        logyq.selection.showToast("Deleted", 900);
      }
      return;
    }
    const idx = parseInt(s, 10) - 1;
    if (!Number.isFinite(idx) || !saved[idx]) return;
    const rec = saved[idx];
    state.root = d3.hierarchy(utils.deepClone(rec.data));
    utils.assignIds(state.root);
    logyq.selection.setSelected(null);
    logyq.treeManager.layoutAndRender(false);
    logyq.treeManager.autoFit();
    logyq.selection.showToast("Loaded " + rec.name, 1200);
  }


function onNodeRightButtonDown(event, d){
  // We use pointerdown on nodes
  const btn  = event.button;         // 0=left, 2=right (on mouse pointers)
  const meta = !!event.metaKey;

  // Treat Ctrl+Left as a plain "right click" (Mac emulation), but reserve Ctrl+Right for abandonment
  const isRightLike = (btn === 2) || (btn === 0 && ctrl && !meta);
  if (!isRightLike) return;

  // Don’t let selection/drag/zoom or native menu fire
  event.preventDefault();
  event.stopPropagation();
  const killOnce = (e) => { e.preventDefault(); e.stopPropagation(); };
  window.addEventListener("contextmenu", killOnce, { once: true, capture: true });

  if (btn === 2 && ctrl) {
    // Shift+Right: send ONLY this node to Word Dock (abandonment)
    logyq.treeOps.sendNodeToWordBank_abandon(d);
  } else {
    // Right (or Ctrl+Left on Mac): send whole subtree to Word Dock
    logyq.treeOps.sendSubtreeToWordBank(d);
  }
}





// Smooth "curling" camera flight
function flyToXY(x, y, { scale=null, duration=null, ease=d3.easeCubicInOut } = {}) {
  const { state, elements } = logyq
  const svg = elements.svg, zoom = state.zoom;
  const el = svg?.node?.(); if (!el || !zoom) return;
  const { clientWidth:w, clientHeight:h } = el;

  const t0 = d3.zoomTransform(el);
  const k1 = (scale ?? t0.k);

  // target translate to center (x,y)
  const tx1 = w/2 - k1 * x;
  const ty1 = h/2 - k1 * y;

  // distance-based timing (gives accel → glide → decel feel)
  const dx = tx1 - t0.x, dy = ty1 - t0.y, dk = Math.abs(k1 - t0.k);
  const dist = Math.hypot(dx, dy) + dk * 600;
  const ms = duration ?? Math.max(280, Math.min(1100, dist * 0.55));

  svg.interrupt()
     .transition()
     .duration(1200) //ctrl f flight speed
     .ease(d3.easeExpOut)
     .call(zoom.transform, d3.zoomIdentity.translate(tx1, ty1).scale(k1));
}

  attach('mix', {
    randomizeTree,
    onNodeContextMenu,
    onNodeLeftDown,
    onNodeRightButtonDown,
    flyToXY,
    saveCurrentMap,
    openMapsMenu,
  });
