/* LOGYQ preview integration seam.
   Keep the copied engine above intact; mobile UI and persistence live in
   logyq-preview.js and use only this deliberately small bridge. */
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
    tree: state.root ? utils.deepClone(state.root.data) : null,
    wordBank: Array.isArray(state.wordBank) ? state.wordBank.slice() : []
  });

  const emitChange = () => {
    if (!changeReady) return;
    const value = snapshot();
    changeListeners.forEach((listener) => {
      try { listener(value); } catch (_error) {}
    });
  };

  const originalLayoutAndRender = treeManager.layoutAndRender.bind(treeManager);
  treeManager.layoutAndRender = (...args) => {
    const result = originalLayoutAndRender(...args);
    queueMicrotask(emitChange);
    return result;
  };

  window.LOGYQBridge = Object.freeze({
    version: 'logyq-isolated',
    snapshot,
    subscribe(listener) {
      changeListeners.add(listener);
      return () => changeListeners.delete(listener);
    },
    notifyChange: emitChange,
    getSelectedUid: () => state.selectedUid || null,
    getSelectedUids: () => state.selectedUids ? Array.from(state.selectedUids) : [],
    selectByUid(uid) {
      const node = uid && state.root?.descendants().find((item) => item.data?._uid === uid);
      if (!node) return false;
      selectSingle(uid);
      return true;
    },
    clearFocusSelection() {
      clearGroup();
      clearSelection();
      return true;
    },
    selectByName(name) {
      const node = state.root?.descendants().find((item) => item.data?.name === name);
      if (!node) return false;
      selectSingle(node.data._uid);
      return true;
    },
    getParentName(name) {
      const node = state.root?.descendants().find((item) => item.data?.name === name);
      return node?.parent?.data?.name || null;
    },
    editSelected({ wipe = false } = {}) {
      if (!state.selectedUid) return false;
      const node = state.root?.descendants().find((item) => item.data?._uid === state.selectedUid);
      if (!node) return false;
      openNodeEditor(node);
      if (wipe && state.editorEl) state.editorEl.value = '';
      return true;
    },
    addChild() {
      if (!state.selectedUid) return false;
      return !!addChildOf(state.selectedUid, '', { noEdit: false });
    },
    createRelative(direction) {
      if (!state.selectedUid) return null;
      const before = state.selectedUid;
      if (direction === 'up') insertParentAboveSelectedAndEdit();
      if (direction === 'left') addElderSiblingLeftAndEdit();
      if (direction === 'down') addChildBelowSelectedAndEdit();
      if (direction === 'right') addYoungerSiblingRightAndEdit();
      const created = state.selectedUid && state.selectedUid !== before ? state.selectedUid : null;
      if (created && state.editingUid) closeNodeEditor(false, false);
      emitChange();
      return created;
    },
    renameNode(uid, name) {
      const target = uid && utils.findByUid(state.root?.data, uid);
      const next = String(name || '').trim();
      if (!target || !next) return false;
      const prev = target.name || '';
      if (next === prev) return true;
      pushHistory({ type: 'rename', uid, prev, next });
      target.name = next;
      state.root = d3.hierarchy(state.root.data);
      utils.assignIds(state.root);
      treeManager.layoutAndRender(false);
      selectSingle(uid);
      emitChange();
      return true;
    },
    deleteSelection({ nodeOnly = false } = {}) {
      if (nodeOnly) {
        deleteSelectedNodeOnly();
      } else {
        const grouped = state.selectedUids ? Array.from(state.selectedUids) : [];
        const targets = grouped.length ? grouped : (state.selectedUid ? [state.selectedUid] : []);
        if (!targets.length) return false;
        deleteNodesToTrash(targets);
        if (state.root) treeManager.layoutAndRender(false);
      }
      emitChange();
      return true;
    },
    undo() { undo(); },
    mix(includeBank = false) { randomizeTree(!!includeBank); },
    fit() { treeManager.autoFit(); },
    loadMap(tree, wordBank = []) {
      const next = utils.deepClone(tree || { name: 'New map' });
      utils.assignUids(next);
      state.root = d3.hierarchy(next);
      utils.assignIds(state.root);
      state.wordBank = Array.isArray(wordBank) ? wordBank.slice() : [];
      state.history = [];
      elements.undoBtn.disabled = true;
      clearGroup();
      clearSelection();
      render();
      treeManager.layoutAndRender(false);
      treeManager.autoFit();
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

