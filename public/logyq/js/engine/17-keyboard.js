/* ======================= KEYBOARD ======================= */
function keyDispatcher(e){
  // Only block hotkeys while typing *unless* Tab is being held
  if (isTextField(e.target) && !state.tabHold) return;
  const modalOpen = elements.settings.backdrop && elements.settings.backdrop.classList.contains("show");
  const t = e.target || {};
  const typing = (t instanceof HTMLInputElement) || (t instanceof HTMLTextAreaElement) || t.isContentEditable === true;
  const k = (e.key || "");
  const lower = k.toLowerCase();

  /* [patch] dock-ctrlA toggle start */
  if (!modalOpen && !typing && document.querySelector("#Dock:hover") && e.shiftKey && lower==="a") {
    e.preventDefault();
    const chips = document.querySelectorAll("#Dock .chip");
    const list = Array.from(chips);
    const allSelected = list.length > 0 && list.every(c => c.classList.contains("is-outlined"));
    list.forEach(c => c.classList.toggle("is-outlined", !allSelected));
    return;
  }
  /* [patch] dock-ctrlA toggle end */

  if (k === 'Escape'){
    if (state.editingUid){
      e.preventDefault();
      closeNodeEditor(false,false);
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
    if (lower === 'f' && !e.shiftKey){ e.preventDefault(); treeManager.autoFit(); return; }
    if (lower === 'f' && e.shiftKey) { e.preventDefault(); centerOnSelected(); return; }
    if (lower === 'a')               { e.preventDefault(); elements.wordInput.focus(); const L = elements.wordInput.value.length; elements.wordInput.setSelectionRange?.(L,L); return; }
    if (lower === 'm')               { e.preventDefault(); randomizeTree(!!e.shiftKey); return; }
    if (lower === 'w')               { e.preventDefault(); toggleDock(); return; }
    if (lower === 'u')               { e.preventDefault(); undo(); return; }
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

  if (!uid) { showToast('Select a node to edit'); return; }
  const h = state.root?.descendants().find(n => n.data?._uid === uid);
  if (!h) { showToast('Select a node to edit'); return; }
  openNodeEditor(h);

  // Extra: clear contents on Shift+E
  if (e.shiftKey && state.editorEl) {
    state.editorEl.value = '';
    try { state.editorEl.focus(); state.editorEl.select(); } catch {}
  }
  return;
}


/* [patch] shift-W wordbank to trash start */
if ((lower === 'w' && e.shiftKey) && !e.metaKey){
  e.preventDefault();
  if (!state.wordBank || state.wordBank.length === 0){
    showToast('WordBank is empty');
    return;
  }

  // Move all items into trash
  const moved = [...state.wordBank];
  state.wordBank = [];

  state.trash = state.trash || [];
  state.trash.push(...moved);

  showToast(`Moved ${moved.length} items to Trash`);
  renderWordBank?.();
  renderTrash?.();
  return;
}
/* [patch] shift-W wordbank to trash end */

  

// T / Shift+T — delete
//  - T: delete subtree(s) to Trash
//  - Shift+T: delete node only (promote children)
if ((e.key === 't' || e.key === 'T') && !e.ctrlKey && !e.metaKey) {
  if (typeof isTextField === 'function' && isTextField(e.target)) return;
  e.preventDefault();

  // Build selection (support focus-only case)
  const selected = state.selectedUids?.size
    ? Array.from(state.selectedUids)
    : (state.selectedUid ? [state.selectedUid] : []);

  if (!selected.length) { showToast('Select a node'); return; }

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
      deleteSelectedNodeOnly();
    } else {
      state.selectedUids = new Set(selected);
      deleteSelectedNodesOnly();
    }
  } else {
    // full subtree delete(s) to Trash
    state.selectedUids = new Set(selected);
    deleteNodesToTrash(selected);
  }

  // --- Refresh visuals
  try { dragManager?.clear?.(); } catch(_) {}
  treeManager?.layoutAndRender?.(true, true);

  // --- Clear group to avoid selected fill  "is-filled"
  state.selectedUids = new Set();
  applySelectionStyles?.();

  // --- Restore focus: parent if it still exists, else root, else nothing
  if (focusAfter && state.root && utils.findByUid(state.root.data, focusAfter)) {
    selectSingle(focusAfter);

  } else if (state.root) {
    selectSingle(state.root.data._uid);

  } else {
    clearSelection?.();
  }

  return;
}




/* [patch] drop-to-bank hotkeys start */
// D → send whole subtree to Word Dock
// Shift+D → send ONLY this node to Word Dock (abandon children in place)
if (!e.ctrlKey && !e.metaKey) {
  const k = e.key?.toLowerCase?.();
  if (k === 'd') {
    if (typeof isTextField === 'function' && isTextField(e.target)) return;
    e.preventDefault();

    // Build selection (support focus-only case)
    const selected = state.selectedUids?.size
      ? Array.from(state.selectedUids)
      : (state.selectedUid ? [state.selectedUid] : []);

    if (!selected.length || !state.root) { showToast('Select a node'); return; }

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

    // Do the action(s)
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

    // Selection/focus: parent of what we just dropped
    state.selectedUids = new Set();       // clear any group
    state.selectedUid = null;

    if (parentToFocus === '__ROOT__') {
      if (state.root) selectSingle(state.root.data._uid); // if a root still exists
    } else if (parentToFocus) {
      selectSingle(parentToFocus);
    } else {
      clearSelection?.();
    }

    applySelectionStyles?.();

    // Refresh visuals and gently center on the new selection
    try { dragManager?.clear?.(); } catch(_) {}
    treeManager?.layoutAndRender?.(true, true);

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
      setSelected(best.data._uid); return;
    }
    if (isDown || isLeft || isRight){ setSelected(state.root.data._uid); return; }
    return;
  }

  const h = state.root.descendants().find(n => n.data._uid === state.selectedUid); if (!h) return;

  if (isUp){ if (h.parent) setSelected(h.parent.data._uid); else setSelected(null); return; }
  if (isDown){
    if (h.children && h.children.length){
      const kids = h.children.slice().sort((a,b)=>a.x-b.x);
      const idx = Math.floor((kids.length-1)/2);
      setSelected(kids[idx].data._uid); return;
    }
    const nodes = state.root.descendants(), maxDepth = nodes.reduce((m,n)=>Math.max(m,n.depth),0);
    for (let d=h.depth+1; d<=maxDepth; d++){
      const row = rowAtDepth(d);
      if (row.length){
        let best=row[0], bd=Math.abs(row[0].x - h.x);
        for (let i=1;i<row.length;i++){ const dd=Math.abs(row[i].x - h.x); if (dd < bd){ bd = dd; best = row[i]; } }
        setSelected(best.data._uid); return;
      }
    }
    setSelected(null); return;
  }



  if (isLeft || isRight){
    const row = rowAtDepth(h.depth);
    if (row.length === 1 && h.children && h.children.length){
      const kids = h.children.slice().sort((a,b)=>a.x-b.x);
      setSelected((isLeft ? kids[0] : kids[kids.length-1]).data._uid); return;
    }
    const idx = row.findIndex(n => n === h);
    if (idx === -1 || !row.length) return;
    const to = (isLeft ? (idx>0 ? idx-1 : row.length-1) : (idx<row.length-1 ? idx+1 : 0));
    setSelected(row[to].data._uid);
  }




  

}








  /* ======================= DOCK TOGGLE ======================= */
  function toggleDock(){ const dock = elements.Dock; const hidden = (dock.style.display === 'none'); dock.style.display = hidden ? '' : 'none'; elements.Hint.style.display = hidden ? 'none' : 'inline-flex'; }




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
    clearChipSelection();
    render();
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
  const names = getSelectedChipNames();
  if (!names.length) return;
  collapseAndRemoveChips(names);
});










  /* ======================= BOOT ======================= */
  const TreeVisualization = { init: ()=>treeManager.initialize() };
  window.TreeVisualization = TreeVisualization;
  TreeVisualization.init();

elements.svg.on("contextmenu", (event) => {
  event.preventDefault();
});

  /* ======================= BOOT ======================= */

  function getSelectedUid(){
    if (typeof __selectedUid === 'function') return __selectedUid();
    if (state?.selectedUid) return state.selectedUid;
    if (state?.selectedUids && state.selectedUids.size === 1) return [...state.selectedUids][0];
    return null;
  }

  function addChildBelowSelectedAndEdit(){
    const uid = getSelectedUid();
    if (!state?.root || !uid){ showToast('Select one node'); return; }

    const h = state.root.descendants().find(n => n?.data?._uid === uid);
    if (!h){ showToast('Could not find selected node'); return; }

    const child = { name: '' };
    utils?.assignUids?.(child);

    h.data.children = h.data.children || [];
    h.data.children.push(child); // rightmost child

    pushHistory({ type:'add', parentPath: utils.pathToUid(state.root.data, uid), uid: child._uid });

    state.root = d3.hierarchy(state.root.data);
    utils.assignIds(state.root);
    treeManager.layoutAndRender(false);

    selectSingle(child._uid);
    (window.flyCenterToUID && flyCenterToUID(child._uid)) || (window.zoomToNodeCenter && zoomToNodeCenter(child._uid, 1.5));
    if (window.startInlineEdit) startInlineEdit({ wipe: true });
    else {
      const nh = state.root.descendants().find(n => n?.data?._uid === child._uid);
      if (nh){ openNodeEditor(nh); if (state.editorEl) state.editorEl.value = ''; }
    }
  }

  // Run BEFORE other key handlers and stop them from seeing Shift+K
  window.addEventListener('keydown', function(e){
    if ((e.key === 'K' || e.key === 'k') && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey){
      // ignore when typing
      const t = e.target;
      const typing = t && (t.matches?.('input, textarea, [contenteditable="true"]') || t.getAttribute?.('role') === 'textbox');
      if (typing) return;

      e.preventDefault();
      e.stopImmediatePropagation(); // ← prevents the K-nav handler from running
      addChildBelowSelectedAndEdit();
    }
  }, { capture: true }); // ← run first

  window.__addChildBelowSelectedAndEdit = addChildBelowSelectedAndEdit;

function getSelectedUid(){
    if (typeof __selectedUid === 'function') return __selectedUid();
    if (state?.selectedUid) return state.selectedUid;
    if (state?.selectedUids && state.selectedUids.size === 1) return [...state.selectedUids][0];
    return null;
  }

  function addElderSiblingLeftAndEdit(){
    if (!state?.root) return;

    const uid = getSelectedUid();
    if (!uid) { showToast('Select one node'); return; }

    const h = state.root.descendants().find(n => n?.data?._uid === uid);
    if (!h) { showToast('Node not found'); return; }
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
    pushHistory({
      type: 'add',
      parentPath: utils.pathToUid(state.root.data, h.parent.data._uid),
      uid: sib._uid
    });

    // rebuild + render
    state.root = d3.hierarchy(state.root.data);
    utils.assignIds(state.root);
    treeManager.layoutAndRender(false);

    // select & edit the new sibling
    selectSingle(sib._uid);
    (window.flyCenterToUID && flyCenterToUID(sib._uid)) ||
    (window.zoomToNodeCenter && zoomToNodeCenter(sib._uid, 1.5));
    if (window.startInlineEdit) startInlineEdit({ wipe: true });
    else {
      const nh = state.root.descendants().find(n => n?.data?._uid === sib._uid);
      if (nh){ openNodeEditor(nh); if (state.editorEl) state.editorEl.value = ''; }
    }
  }

  // Hotkey: Shift+J (capture + stop to avoid J-nav)
  window.addEventListener('keydown', function(e){
    if ((e.key === 'J' || e.key === 'j') && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey){
      const t = e.target;
      const typing = t && (t.matches?.('input, textarea, [contenteditable="true"]') || t.getAttribute?.('role') === 'textbox');
      if (typing) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      addElderSiblingLeftAndEdit();
    }
  }, { capture: true });




  window.__addElderSiblingLeftAndEdit = addElderSiblingLeftAndEdit;


 function getSelectedUid(){
    if (typeof __selectedUid === 'function') return __selectedUid();
    if (state?.selectedUid) return state.selectedUid;
    if (state?.selectedUids && state.selectedUids.size === 1) return [...state.selectedUids][0];
    return null;
  }

  function addYoungerSiblingRightAndEdit(){
    if (!state?.root) return;

    const uid = getSelectedUid();
    if (!uid){ showToast('Select one node'); return; }

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
    pushHistory({
      type: 'add',
      parentPath: utils.pathToUid(state.root.data, h.parent.data._uid),
      uid: sib._uid
    });

    // Rebuild + render
    state.root = d3.hierarchy(state.root.data);
    utils.assignIds(state.root);
    treeManager.layoutAndRender(false);

    // Select & edit
    selectSingle(sib._uid);
    (window.flyCenterToUID && flyCenterToUID(sib._uid)) ||
    (window.zoomToNodeCenter && zoomToNodeCenter(sib._uid, 1.5));
    if (window.startInlineEdit) startInlineEdit({ wipe: true });
    else {
      const nh = state.root.descendants().find(n => n?.data?._uid === sib._uid);
      if (nh){ openNodeEditor(nh); if (state.editorEl) state.editorEl.value = ''; }
    }
  }

  // Hotkey: Shift+L (capture so L-nav doesn’t run)
  window.addEventListener('keydown', function(e){
    if ((e.key === 'L' || e.key === 'l') && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey){
      const t = e.target;
      const typing = t && (t.matches?.('input, textarea, [contenteditable="true"]') || t.getAttribute?.('role') === 'textbox');
      if (typing) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      addYoungerSiblingRightAndEdit();
    }
  }, { capture: true });

  window.__addYoungerSiblingRightAndEdit = addYoungerSiblingRightAndEdit;


/*========== insert parent above selected (adopt selected as child) ==========*/

  function getSelectedUid(){
    if (typeof __selectedUid === 'function') return __selectedUid();
    if (state?.selectedUid) return state.selectedUid;
    if (state?.selectedUids && state.selectedUids.size === 1) return [...state.selectedUids][0];
    return null;
  }

  function insertParentAboveSelectedAndEdit(){
    if (!state?.root) return;

    const uid = getSelectedUid();
    if (!uid){ showToast('Select one node'); return; }

    const h = state.root.descendants().find(n => n?.data?._uid === uid);
    if (!h) { showToast('Node not found'); return; }
    if (!h.parent) return; // root: no effect

    const parentData = h.parent.data;
    parentData.children = parentData.children || [];
    const idx = parentData.children.findIndex(c => c && c._uid === uid);
    if (idx < 0) return;

    // Snapshot for easy Undo
    const prevTree = utils.deepClone(state.root.data);
    pushHistory({ type: 'replace-root', prev: prevTree });

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
    treeManager.layoutAndRender(false);

    // Select & edit the new parent
    selectSingle(newParent._uid);
    (window.flyCenterToUID && flyCenterToUID(newParent._uid)) ||
    (window.zoomToNodeCenter && zoomToNodeCenter(newParent._uid, 1.5));
    if (window.startInlineEdit) startInlineEdit({ wipe: true });
    else {
      const nh = state.root.descendants().find(n => n?.data?._uid === newParent._uid);
      if (nh){ openNodeEditor(nh); if (state.editorEl) state.editorEl.value = ''; }
    }
  }

  // Hotkey: Shift+I (capture so I-nav doesn’t run first)
  window.addEventListener('keydown', function(e){
    if ((e.key === 'I' || e.key === 'i') && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey){
      const t = e.target;
      const typing = t && (t.matches?.('input, textarea, [contenteditable="true"]') || t.getAttribute?.('role') === 'textbox');
      if (typing) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      insertParentAboveSelectedAndEdit();
    }
  }, { capture: true });

  window.__insertParentAboveSelectedAndEdit = insertParentAboveSelectedAndEdit;



