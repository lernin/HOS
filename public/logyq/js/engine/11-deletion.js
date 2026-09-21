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


function copySubtreeToClipboard(uid){
  const { state, utils } = logyq
  let text;

  if (uid){
    // copy just that node as JSON
    const node = utils.findByUid(state.root?.data, uid);
    if (!node) return;
    text = JSON.stringify(node, null, 2);
  } else {
    // copy whole project as GIQ
    text = exportGIQ();
  }

  navigator.clipboard.writeText(text).then(
    () => logyq.selection.showToast(uid ? "Copied JSON" : "Copied GIQ", 800),
    err => console.error("Clipboard error:", err)
  );
}




/* ---------- first-card helper ---------- */
function createFirstCardAndEdit(){
  const { state, utils, elements } = logyq
  // 1) Build a blank root
  const rootData = { name: '' };
  utils.assignUids(rootData);
  state.root = d3.hierarchy(rootData);
  utils.assignIds(state.root);

  // 2) Render the tree
  logyq.treeManager.layoutAndRender(true);

  // 3) Focus the new root (state only; DOM may not be ready yet)
  const uid = state.root.data._uid;
  logyq.selection.setSelected(uid);

  // 4) After the DOM updates: assert visibility, center, open editor
  requestAnimationFrame(() => {
    try {
      // Re-apply selection classes to the *real* just-rendered nodes
      logyq.selection.applySelectionStyles();

      // Make sure nothing is hidden by style/transition leftovers
      if (elements.gNodes) {
        elements.gNodes.selectAll('g.node')
          .attr('display', null)
          .style('opacity', 1);
      }

      // Center/fit so the root is on-screen immediately
      if (typeof logyq.treeManager.autoFit === 'function') {
        logyq.treeManager.autoFit();
      }
    } catch (_) {}

    // Open inline editor on the root
    const h = state.root.descendants().find(n => n.data && n.data._uid === uid);
    if (h) {
      logyq.editing.openNodeEditor(h);
      // After editor attaches, restyle & place it one more time
      setTimeout(() => {
        try {
          logyq.selection.applySelectionStyles();
          if (elements.gNodes) {
            elements.gNodes.selectAll('g.node')
              .attr('display', null)
              .style('opacity', 1);
          }
          logyq.editing.updateNodeEditorPosition?.();
        } catch (_) {}
      }, 0);
    }
  });
}








/* ---------- add-node helpers (sibling/right + child) ---------- */
/**
 * Add a child node under `parentUid`.
 * @param {string} parentUid  - target parent UID
 * @param {string} [newName]  - node label (default: '')
 * @param {Object} [opts]
 * @param {boolean} [opts.noEdit=false]  - if true, do NOT open the inline editor
 * @param {boolean} [opts.select=true]   - if true, select/focus the new node
 * @returns {string|null} The new node's UID, or null on failure.
 */

  attach('deletion', {
    deleteNodesToTrash,
    deleteSelectedNodeOnly,
    deleteSelectedNodesOnly,
    exportGIQ,
    copySubtreeToClipboard,
    createFirstCardAndEdit,
  });
