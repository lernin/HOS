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

  const normalizePaintColor = (color) => {
    if (color == null) return null;
    const next = String(color).trim().toLowerCase();
    if (!next || next === 'off' || next === 'clear' || next === '#fff' || next === '#ffffff' || next === 'white') return null;
    return String(color).trim();
  };

  // Color lives on node data (`color`) so snapshot / maps / reload keep it.
  // Does not change selection or fly the camera.
  const paintNodes = (uid, color, branch) => {
    const node = uid && logyq.state.root?.descendants().find((item) => item.data?._uid === uid);
    if (!node) return false;
    const next = normalizePaintColor(color);
    const targets = branch && typeof node.descendants === 'function' ? node.descendants() : [node];
    const changed = targets.some((item) => (item?.data?.color || null) !== next);
    if (!changed) return true;
    pushHistory({ type: 'replace-root', prev: utils.deepClone(state.root.data) });
    for (const item of targets) {
      if (!item?.data) continue;
      if (next) item.data.color = next;
      else delete item.data.color;
    }
    logyq.treeManager.layoutAndRender(false);
    emitChange();
    return true;
  };

  const emitChange = () => {
    if (!changeReady) return;
    const value = snapshot();
    changeListeners.forEach((listener) => {
      try { listener(value); } catch (_error) {}
    });
  };

  const originalLayoutAndRender = logyq.treeManager.layoutAndRender.bind(logyq.treeManager);
  logyq.treeManager.layoutAndRender = (...args) => {
    if (window.__logyqHoldDragFrozen?.()) return;
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
    getSelectedUid: () => logyq.selection.getSelectedUid(),
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
      const label = String(name ?? '').trim();
      if (!label) return false;
      const node = logyq.state.root?.descendants().find((item) => item.data?.name === label);
      if (!node) return false;
      logyq.selection.selectSingle(node.data._uid);
      return true;
    },
    getParentName(name) {
      const label = String(name ?? '').trim();
      if (!label) return null;
      const node = logyq.state.root?.descendants().find((item) => item.data?.name === label);
      return node?.parent?.data?.name || null;
    },
    editSelected({ wipe = false, uid = undefined } = {}) {
      if (uid == null || String(uid) === '') return false;
      const targetUid = uid;
      let node = logyq.state.root?.descendants().find((item) => item.data?._uid === targetUid);
      if (!node) node = logyq.treeManager.ensureUidLayout?.(targetUid) || null;
      if (!node) return false;
      logyq.selection.selectSingle(targetUid);
      logyq.editing.openNodeEditor(node);
      if (wipe && logyq.state.editorEl) logyq.state.editorEl.value = '';
      return true;
    },
    addChild() {
      if (!logyq.state.selectedUid) return false;
      return !!logyq.treeOps.addChildOf(logyq.state.selectedUid, '', { noEdit: false });
    },
    createRelative(direction, originUid) {
      if (originUid == null || String(originUid) === '') return null;
      const origin = originUid;
      const calm = { noEdit: true, select: true, rootAsChild: false };
      const created =
        direction === 'down' ? logyq.treeOps.addChildOf(origin, '', calm) :
        direction === 'right' ? logyq.treeOps.addSiblingRightOf(origin, '', calm) :
        direction === 'left' ? logyq.treeOps.addSiblingLeftOf(origin, '', calm) :
        direction === 'up' ? logyq.treeOps.insertParentAbove(origin, '', calm) :
        null;
      if (logyq.state.editingUid) logyq.editing.closeNodeEditor(false, false);
      if (created) {
        logyq.state.lastCreatedUid = created;
        logyq.selection.selectSingle(created);
      }
      emitChange();
      return created || null;
    },
    renameNode(uid, name) {
      const target = uid && utils.findByUid(state.root?.data, uid);
      if (!target) return false;
      const next = name == null ? '' : String(name).trim();
      const prev = target.name ?? '';
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
    paintUid(uid, color) {
      return paintNodes(uid, color, false);
    },
    paintBranch(uid, color) {
      return paintNodes(uid, color, true);
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
    loadMap(tree, wordBank = [], options = {}) {
      const keepEditor = !!options.keepEditor;
      const keepSelection = !!options.keepSelection || keepEditor;
      const fit = options.fit !== false && !keepEditor;
      const editingUid = keepEditor ? logyq.state.editingUid : null;
      const selectedUid = keepSelection ? logyq.state.selectedUid : null;
      if (!keepEditor && logyq.state.editingUid) logyq.editing.closeNodeEditor(false, false);
      const next = utils.deepClone(tree || { name: 'New map' });
      utils.assignUids(next);
      state.root = d3.hierarchy(next);
      utils.assignIds(state.root);
      state.wordBank = Array.isArray(wordBank) ? wordBank.slice() : [];
      state.history = [];
      elements.undoBtn.disabled = true;
      if (!keepSelection) {
        logyq.selection.clearGroup();
        logyq.selection.clearSelection();
      }
      logyq.wordDock.render();
      logyq.treeManager.layoutAndRender(false);
      if (fit) logyq.treeManager.autoFit();
      if (keepSelection && selectedUid) {
        const still = state.root?.descendants().find((node) => node.data?._uid === selectedUid);
        if (still) logyq.selection.selectSingle(selectedUid);
        else logyq.selection.clearSelection();
      }
      if (keepEditor) {
        const stillEditing = editingUid && state.root?.descendants().find((node) => node.data?._uid === editingUid);
        if (!stillEditing && logyq.state.editingUid) logyq.editing.closeNodeEditor(false, false);
        else logyq.editing.updateNodeEditorPosition?.();
      }
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

