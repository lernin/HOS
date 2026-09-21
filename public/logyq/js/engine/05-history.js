  /* ======================= HISTORY ======================= */
  function pushHistory(action){
    state.history.push(action);
    if(state.history.length>CONFIG.HISTORY_LIMIT) state.history.shift();
      /* [patch] dock-bounds-init start */
      try{ logyq.dock.updateDockBounds(); }catch(_e){}
      /* [/patch] dock-bounds-init end */
    elements.undoBtn.disabled = state.history.length===0;
  }


/* [patch] undo-fit-helper start 3476 */
function autoFitSoon(delay){
  try{ clearTimeout(window.__undoFitT); }catch(_e){}
  try{
    var d = Number.isFinite(delay) ? delay : 220; // let transitions finish
    window.__undoFitT = setTimeout(function(){
      try{ logyq.treeManager.autoFit(); }catch(_e){}
    }, d);
  }catch(_e){}
}
/* [patch] undo-fit-helper end */




  function undo(){
    const a = state.history.pop();
      /* [patch] dock-bounds-init start */
      try{ logyq.dock.updateDockBounds(); }catch(_e){}
      /* [/patch] dock-bounds-init end */
    elements.undoBtn.disabled = state.history.length===0;
    if(!a) return;

    if(a.type==='delete'){
      const parent = utils.findByPath(state.root.data, a.parentPath);
      if(parent){
        parent.children = parent.children || [];
        const insertAt = Math.min(a.index, parent.children.length);
        parent.children.splice(insertAt, 0, a.subtree);
        state.root = d3.hierarchy(state.root.data);
        utils.assignIds(state.root);
        logyq.treeManager.layoutAndRender(false);
      }
    } else if(a.type==='move'){
      const toParent = utils.findByPath(state.root.data, a.toParentPath);
      const fromParent = utils.findByPath(state.root.data, a.fromParentPath);
      if(toParent && fromParent){
        let node=null;
        if (Array.isArray(toParent.children)){
          const i = toParent.children.findIndex(c=>c._uid===a.uid);
          if(i>-1) node = toParent.children.splice(i,1)[0];
        }
        if(node){
          fromParent.children = fromParent.children || [];
          const at = Math.min(a.fromIndex, fromParent.children.length);
          fromParent.children.splice(at,0,node);
        }
        state.root = d3.hierarchy(state.root.data);
        utils.assignIds(state.root);
        logyq.treeManager.layoutAndRender(false);
        /* [patch] undo-fit-call move */ autoFitSoon();

      }
    } else if(a.type==='add'){
      const parent = utils.findByPath(state.root.data, a.parentPath);
      if(parent && Array.isArray(parent.children)){
        const i = parent.children.findIndex(c=>c._uid===a.uid);
        if(i>-1) parent.children.splice(i,1);
        if(parent.children.length===0) parent.children=null;
        state.root = d3.hierarchy(state.root.data);
        utils.assignIds(state.root);
        logyq.treeManager.layoutAndRender(true);
      }
    } else if(a.type==='rename'){
      const target = utils.findByUid(state.root.data, a.uid);
      if(target){
        target.name = a.prev;
        state.root = d3.hierarchy(state.root.data);
        utils.assignIds(state.root);
        logyq.treeManager.layoutAndRender(false);
      }
    } else if (a.type === 'randomize'){
      state.root = a.prev ? d3.hierarchy(a.prev) : null;
      if ('prevBank' in a) state.wordBank = (a.prevBank || []).slice();
      if(state.root) utils.assignIds(state.root);
      logyq.treeManager.layoutAndRender(false);
      logyq.wordDock.render();
      /* [patch] undo-fit-call randomize */ autoFitSoon();

    } else if (a.type === 'delete-root') {
      state.root = d3.hierarchy(a.subtree);
      utils.assignIds(state.root);
      logyq.treeManager.layoutAndRender(false);
    } else if (a.type === 'add-root') {
      state.root = null;
      logyq.treeManager.renderEmpty();
    } else if (a.type === 'replace-root') {
      state.root = d3.hierarchy(a.prev);
 if ('prevBank' in a) state.wordBank = (a.prevBank || []).slice();  // ← add this

      utils.assignIds(state.root);
      logyq.treeManager.layoutAndRender(false);
    }
  }

  attach('history', { pushHistory, undo, autoFitSoon })

