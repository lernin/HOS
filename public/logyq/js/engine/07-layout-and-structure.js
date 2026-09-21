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

/* No-op stubs so existing calls are safe. */
function showLaneAtY(_y) { /* no visuals */ }
function hideLane() { /* no visuals */ }
function refreshLaneOnZoom() { /* no visuals */ }

  attach('layout', {
    LabelWrap,
    laneYForDepth,
    laneHeightForDepth,
    showLaneAtY,
    hideLane,
    refreshLaneOnZoom,
  });







// ---- Immediate horizontal move engine (swap or reparent across groups at same depth)
function __getSelectedUidSingle(){
  return state.selectedUid || (state.selectedUids?.size === 1 ? [...state.selectedUids][0] : null);
}
function __getNodeByUid(uid){
  if (!uid || !state.root) return null;
  return state.root.descendants().find(n => n.data?._uid === uid) || null;
}
function __groupsAtDepthOrderedByX(depth){
  const nodes = state.root.descendants().filter(n => n.depth === depth);
  const byParent = new Map();
  for (const n of nodes){
    const pid = n.parent?.data?._uid || '__ROOT__';
    if (!byParent.has(pid)) byParent.set(pid, []);
    byParent.get(pid).push(n);
  }
  const groups = [];
  for (const [pid, arr] of byParent.entries()){
    arr.sort((a,b)=>a.x-b.x);
    const minX = arr.length ? arr[0].x : 0;
    groups.push({ parentUid: pid, nodes: arr, minX });
  }
  groups.sort((a,b)=>a.minX-b.minX);
  return groups;
}
function __swapWithinParent(selNode, dir){
  const parent = selNode.parent;
  const kids = parent?.data?.children;
  if (!Array.isArray(kids)) return false;
  const i = kids.findIndex(k => k?._uid === selNode.data._uid);
  const j = i + (dir < 0 ? -1 : 1);
  if (i < 0 || j < 0 || j >= kids.length) return false;
  [kids[i], kids[j]] = [kids[j], kids[i]];
  return true;
}
function __reparentToAdjacentGroup(selNode, targetGroup, toEndOnRight){
  const curKids = selNode.parent?.data?.children;
  if (!Array.isArray(curKids)) return false;
  const idx = curKids.findIndex(k => k?._uid === selNode.data._uid);
  if (idx < 0) return false;
  const [moved] = curKids.splice(idx,1);

  const targetParentUid = targetGroup.parentUid;
  const targetParentNode = (targetParentUid === '__ROOT__')
    ? state.root
    : state.root.descendants().find(n => n.data?._uid === targetParentUid);
  if (!targetParentNode) return false;

  targetParentNode.data.children = targetParentNode.data.children || [];
  const dest = targetParentNode.data.children;
  if (toEndOnRight) dest.push(moved); else dest.splice(0,0,moved);
  return true;
}








// --- Move the SINGLE focused node left/right (swap within parent, or hop to neighbor parent at same depth) ---
function moveSelectedHorizontally(dir){
  // dir: -1 = left, +1 = right
  if (!state.root) return;

  // Focus-only: act on the currently focused node (ignore group)
  const uid = state.selectedUid;
  if (!uid) { showToast('No focused node'); return; }

  // Live hierarchy node
  const selH = state.root.descendants().find(n => n?.data?._uid === uid);
  if (!selH) return;
  if (!selH.parent) { showToast('Root has no siblings'); return; }

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
      showToast(dir < 0 ? 'No group to the left' : 'No group to the right');
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
  pushHistory({ type: 'replace-root', prev: before });
  state.root = d3.hierarchy(work);
  utils.assignIds(state.root);
  treeManager.layoutAndRender(false);
  setSelected(uid);

    // === Only recenter if we're near a viewport edge (moat rule) ===
  if (typeof checkMoatAndAutoFit === 'function') {
    checkMoatAndAutoFit('vhold');
  }

}










// --- Move the SINGLE focused node vertically ---
// dir: -1 = Up (reparent to parent's parent’s lane), +1 = Down (drop to next depth)
function moveSelectedVertically(dir){
  if (!state.root) return;
  const uid = state.selectedUid;
  if (!uid) { showToast('No focused node'); return; }

  const live = state.root.descendants();
  const selH = live.find(n => n?.data?._uid === uid);
  if (!selH) return;





// === UP (new: reparent to GP, insert by X among GP's children) ===
if (dir === -1){
  const parentH = selH.parent;
  if (!parentH) { showToast('Root has no parent'); return; }

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

    pushHistory({ type: 'replace-root', prev: before });
    state.root = d3.hierarchy(newRoot);
    utils.assignIds(state.root);
    treeManager.layoutAndRender(false);
    setSelected(uid);
    if (typeof checkMoatAndAutoFit === 'function') checkMoatAndAutoFit('vhold');
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
  pushHistory({ type: 'replace-root', prev: before });
  state.root = d3.hierarchy(work);
  utils.assignIds(state.root);
  treeManager.layoutAndRender(false);
  setSelected(uid);
  if (typeof checkMoatAndAutoFit === 'function') checkMoatAndAutoFit('vhold');
  return;
}










// === DOWN (detach → choose nearest SAME-DEPTH parent by X → insert by X) ===
if (dir === +1){
  // Root special-case (unchanged behavior)
  if (!selH.parent){
    const kids = selH.children || [];
    if (!kids.length) { showToast('Root has no children'); return; }
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

    pushHistory({ type:'replace-root', prev: before });
    state.root = d3.hierarchy(newRoot);
    utils.assignIds(state.root);
    treeManager.layoutAndRender(false);
    setSelected(formerRootAsChild._uid);
    if (typeof checkMoatAndAutoFit === 'function') checkMoatAndAutoFit('vhold');
    return;
  }

  // Non-root: SAME-DEPTH adoption (fix)
  const uid = selH.data._uid;
  const x0  = selH.x;

  const movingDescUids = new Set(selH.descendants().map(d => d.data._uid));

  // Nearest peer at the SAME depth (exclude self/descendants)
  const peers = state.root.descendants()
    .filter(n => n.depth === selH.depth && n.data._uid !== uid && !movingDescUids.has(n.data._uid))
    .sort((a,b) => {
      const dA = Math.abs(a.x - x0), dB = Math.abs(b.x - x0);
      return dA === dB ? (a.x - b.x) : (dA - dB); // tie → left
    });

  if (!peers.length){ showToast('No peer to adopt under'); return; }
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

  pushHistory({ type: 'replace-root', prev: before });
  state.root = d3.hierarchy(work);
  utils.assignIds(state.root);
  treeManager.layoutAndRender(false);
  setSelected(uid);
  if (typeof checkMoatAndAutoFit === 'function') checkMoatAndAutoFit('vhold');
  return;
}



























}






















































