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
