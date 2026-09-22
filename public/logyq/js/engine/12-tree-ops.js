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
  if (!h?.parent) return null;

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
  try{
    const labels = (h?.descendants?.() || []).map(n => (n?.data?.name || '').trim()).filter(Boolean);
    // Blank cards are not words. Skip the bank write and the delete.
    if (!labels.length) return;
    labels.forEach(lbl => logyq.wordDock.addWords(lbl, 'bank'));


    // Remove subtree (with history)
    if (!h.parent){
      // Deleting the root means clear the tree
      logyq.history.pushHistory({ type: 'delete-root', subtree: utils.deepClone(state.root.data) });
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
      subtree: utils.deepClone(h.data)
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
  try{
    const label = (h?.data?.name || '').trim();
    if (!label) return;
    logyq.wordDock.addWords(label, 'bank');

    if (!h.parent){
      // Root: promote leftmost child as new root; old root (this label) already banked
      const prevTree = utils.deepClone(state.root.data);
      const kidsH = (state.root.children || []).slice().sort((a,b)=>a.x-b.x);
      if (!kidsH.length){ showToast('Root has no child to promote'); return; }

      const newRootData = kidsH[0].data;
      const others = kidsH.slice(1).map(hh => hh.data);

      // old root becomes “removed node”; its children go with the new root
      const oldRootData = state.root.data;
      oldRootData.children = null;

      const idx = (prevTree.children || []).findIndex(c => c && c._uid === newRootData._uid);
      if (idx > -1) prevTree.children.splice(idx, 1);
      newRootData.children = (newRootData.children || []).concat(others);

      logyq.history.pushHistory({ type: 'replace-root', prev: prevTree });
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
      subtree: utils.deepClone(moving)
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


