  /* ======================= RANDOMIZE ======================= */
function mixCard(name, color){
  const node = { name: String(name ?? '') };
  if (color) node.color = color;
  return node;
}

function randomizeTree(includeBank){
  const { state, utils } = logyq
  try{
    const prevTree = state.root ? utils.deepClone(state.root.data) : null;
    const prevBank = Array.isArray(state.wordBank) ? state.wordBank.slice() : [];
    // Keep paint with each card. Mix used to shuffle names into `{ name }`
    // only, which wiped `data.color` and then saved that bare tree.
    const cards = [];
    if (state.root){
      for (const n of state.root.descendants()) {
        const name = n.data?.name || "";
        if (!name) continue;
        cards.push(mixCard(name, n.data?.color));
      }
    }
    if (includeBank && prevBank.length) {
      for (const word of prevBank) {
        if (word) cards.push(mixCard(word, null));
      }
    }
    if (!cards.length){ logyq.selection.showToast("Nothing to mix"); return; }

    const rootLabel = (state.root && state.root.data?.name) ? state.root.data.name : cards[0].name;
    const rootColor = state.root?.data?.color || null;
    let pool = cards.slice();
    const rmIdx = pool.findIndex((card) => card.name === rootLabel);
    if (rmIdx > -1) pool.splice(rmIdx, 1);
    for (let i = pool.length - 1; i > 0; i--){
      const j = (Math.random() * (i + 1)) | 0;
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    function ri(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }

    const root = mixCard(rootLabel, rootColor);
    root.children = [];
    let q = [{ node: root, cap: ri(1,3), used: 0 }], k = 0;
    while (k < pool.length){
      if (!q.length) q.push({ node: root, cap: ri(1,3), used: 0 });
      const p = q[0];
      if (p.used >= p.cap){ q.shift(); continue; }
      const child = mixCard(pool[k].name, pool[k].color);
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
  // Phone long-press hold-drag synthesizes contextmenu. That path
  // addWords-copies labels, then splices data; layout freeze hid the
  // splice so Ashley saw a Word Bank copy while the origin slot stayed.
  if (window.__logyqHoldDragFrozen?.() || window.__logyqHoldDragBlocksBank?.()) return;

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











  attach('mix', {
    randomizeTree,
    onNodeContextMenu,
  });
