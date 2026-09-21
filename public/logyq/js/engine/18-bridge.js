/* LOGYQ preview integration seam.
   Keep the copied engine above intact; mobile UI and persistence live in
   js/preview.js and use only this deliberately small bridge. */
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
    tree: logyq.state.root ? logyq.utils.deepClone(logyq.state.root.data) : null,
    wordBank: Array.isArray(logyq.state.wordBank) ? logyq.state.wordBank.slice() : []
  });

  const emitChange = () => {
    if (!changeReady) return;
    const value = snapshot();
    changeListeners.forEach((listener) => {
      try { listener(value); } catch (_error) {}
    });
  };

  const originalLayoutAndRender = logyq.treeManager.layoutAndRender.bind(logyq.treeManager);
  logyq.treeManager.layoutAndRender = (...args) => {
    const result = originalLayoutAndRender(...args);
    queueMicrotask(emitChange);
    return result;
  };

  window.LOGYQBridge = Object.freeze({
    version: 'logyq-isolated',
    core: logyq,
    snapshot,
    subscribe(listener) {
      changeListeners.add(listener);
      return () => changeListeners.delete(listener);
    },
    notifyChange: emitChange,
    getSelectedUid: () => logyq.state.selectedUid || null,
    getSelectedUids: () => logyq.state.selectedUids ? Array.from(logyq.state.selectedUids) : [],
    selectByUid(uid) {
      const node = uid && logyq.state.root?.descendants().find((item) => item.data?._uid === uid);
      if (!node) return false;
      logyq.selection.selectSingle(uid);
      return true;
    },
    clearFocusSelection() {
      logyq.selection.clearGroup();
      logyq.selection.clearSelection();
      return true;
    },
    selectByName(name) {
      const node = logyq.state.root?.descendants().find((item) => item.data?.name === name);
      if (!node) return false;
      logyq.selection.selectSingle(node.data._uid);
      return true;
    },
    getParentName(name) {
      const node = logyq.state.root?.descendants().find((item) => item.data?.name === name);
      return node?.parent?.data?.name || null;
    },
    editSelected({ wipe = false } = {}) {
      if (!logyq.state.selectedUid) return false;
      const node = logyq.state.root?.descendants().find((item) => item.data?._uid === logyq.state.selectedUid);
      if (!node) return false;
      logyq.editing.openNodeEditor(node);
      if (wipe && logyq.state.editorEl) logyq.state.editorEl.value = '';
      return true;
    },
    addChild() {
      if (!logyq.state.selectedUid) return false;
      return !!logyq.treeOps.addChildOf(logyq.state.selectedUid, '', { noEdit: false });
    },
    createRelative(direction) {
      if (!logyq.state.selectedUid) return null;
      const before = logyq.state.selectedUid;
      if (direction === 'up') logyq.keyboard.insertParentAboveSelectedAndEdit();
      if (direction === 'left') logyq.keyboard.addElderSiblingLeftAndEdit();
      if (direction === 'down') logyq.keyboard.addChildBelowSelectedAndEdit();
      if (direction === 'right') logyq.keyboard.addYoungerSiblingRightAndEdit();
      const created = logyq.state.selectedUid && logyq.state.selectedUid !== before ? logyq.state.selectedUid : null;
      if (created && logyq.state.editingUid) logyq.editing.closeNodeEditor(false, false);
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
      logyq.treeManager.layoutAndRender(false);
      logyq.selection.selectSingle(uid);
      emitChange();
      return true;
    },
    deleteSelection({ nodeOnly = false } = {}) {
      if (nodeOnly) {
        logyq.deletion.deleteSelectedNodeOnly();
      } else {
        const grouped = logyq.state.selectedUids ? Array.from(logyq.state.selectedUids) : [];
        const targets = grouped.length ? grouped : (logyq.state.selectedUid ? [logyq.state.selectedUid] : []);
        if (!targets.length) return false;
        logyq.deletion.deleteNodesToTrash(targets);
        if (logyq.state.root) logyq.treeManager.layoutAndRender(false);
      }
      emitChange();
      return true;
    },
    undo() { undo(); },
    mix(includeBank = false) { logyq.mix.randomizeTree(!!includeBank); },
    fit() { logyq.treeManager.autoFit(); },
    loadMap(tree, wordBank = []) {
      const next = utils.deepClone(tree || { name: 'New map' });
      utils.assignUids(next);
      state.root = d3.hierarchy(next);
      utils.assignIds(state.root);
      state.wordBank = Array.isArray(wordBank) ? wordBank.slice() : [];
      state.history = [];
      elements.undoBtn.disabled = true;
      logyq.selection.clearGroup();
      logyq.selection.clearSelection();
      logyq.wordDock.render();
      logyq.treeManager.layoutAndRender(false);
      logyq.treeManager.autoFit();
    },
    cycleDock() {
      const side = logyq.dock.cycleDockSide();
      logyq.selection.showToast(logyq.dock.sideLabel(side), 900);
      return side;
    },
    setDockSide(side) {
      return logyq.dock.setSide(side);
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

