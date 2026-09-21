/* ======================= DRAG MANAGER (rewritten) ======================= */
const dragManager = {
  // Highlight subtree (or just this node in solo mode)
  markForDrag(d){
    const subIds = new Set((state.dragState && state.dragState.solo) ? [d.id] : d.descendants().map(n=>n.id));
    elements.svg.classed("dragging-mode", true);




    elements.gNodes.selectAll("g.node")
      .classed("is-subtree", n=>subIds.has(n.id))
      .classed("is-others", n=>!subIds.has(n.id));
    elements.gLinks.selectAll("path.link")
    
      .classed("is-sub-link", l=>subIds.has(l.target.id))
      .classed("is-parent-link", l=> l.target.id===d.id);






      
  },





  // Reset all drag UI / state
  clear(){
elements.svg.classed("dragging-mode delete-intent", false);
elements.gNodes.selectAll("g.node")
  .classed("is-subtree is-others dragging drop-target hover-adopt hover-adopt-sub", false);
elements.gLinks.selectAll("path.link").classed("is-sub-link is-parent-link", false);

   
   
   
    elements.dragMiniG.style("opacity",0).style("display","none");
    elements.trash.classList.remove("near","over","open","wiggle");
    elements.caretDot.style("opacity",0);

    state.dragState.trashZone = "far";
    state.dragState.drop = null;
    state.dragState.solo = false;
    state.dragState.multiUids = null;
    state.dragState.groupAbandon = false;

    document.body.classList.remove("global-no-cursor");
  },






  // Where is the pointer relative to the trash
  zone(cx,cy){
    const r = document.getElementById("trash").getBoundingClientRect();
    const expand=(R,p)=>({left:R.left-p,right:R.right+p,top:R.top-p,bottom:R.bottom+p});
    const inside=(R,x,y)=>x>=R.left&&x<=R.right&&y>=R.top&&y<=R.bottom;
    const nearR=expand(r, 100), overR=expand(r, 16);
    const pad=10, cur=state.dragState.trashZone;

    if(cur==='over'){
      const keep=expand(overR,pad); if(inside(keep,cx,cy)) return 'over';
    }
    if(cur==='near'){
      if(inside(overR,cx,cy)) return 'over';
      const keep=expand(nearR,pad); if(inside(keep,cx,cy)) return 'near';
    }
    if(inside(overR,cx,cy)) return 'over';
    if(inside(nearR,cx,cy)) return 'near';
    return 'far';
  },

behavior(){
  return d3.drag()
    .filter((event) => {
      if (isTextField(event.target)) return false;
      return event.button === 0;         // left button only (Shift allowed now)
    })
    .on("start", this.start)
    .on("drag", this.drag)
    .on("end", this.end);
},










start(event, d){
  document.body.classList.add("global-no-cursor");

  // Shift+LEFT = "abandonment" (solo) mode
  const se = (event && event.sourceEvent) ? event.sourceEvent : event;
  const isShiftLeft = !!(se && se.button === 0 && se.shiftKey);

  // Abandonment flag (used later in B path)
  state.dragState.solo = isShiftLeft;





    // If a multi-selection exists and includes this node, we drag the group
    if (state.selectedUids && state.selectedUids.size > 1 && state.selectedUids.has(d.data._uid)) {
      state.dragState.multiUids = Array.from(state.selectedUids);

state.dragState.groupAbandon = isShiftLeft; // Ctrl+Left drag => abandon-children mode

      
      elements.svg.classed("dragging-mode", true);
      elements.gNodes.selectAll("g.node")
        .classed("is-others", n => !state.selectedUids.has(n.data._uid))
        .classed("is-subtree", false)
        .classed("dragging", n => state.selectedUids.has(n.data._uid));
    } else {
      state.dragState.multiUids = null;
      state.dragState.groupAbandon = false;
      dragManager.markForDrag(d);
    }

    d3.select(event.currentTarget).raise().classed("dragging", true);

    const [px,py]=d3.pointer(event, elements.svg.node());
    const t=d3.zoomTransform(elements.svg.node());
    const [gx,gy]=t.invert([px,py]);

    state.dragState.startGraphX=gx; state.dragState.startGraphY=gy;
    state.dragState.anchorTopLeftX=d.x - CONFIG.CARD_WIDTH/2;
    state.dragState.anchorTopLeftY=d.y - CONFIG.CARD_HEIGHT/2;

    visual.layoutMini(d.data?.name||"Node");
    elements.dragMiniG
      .style("display", null)
      .attr("transform",`translate(${state.dragState.anchorTopLeftX},${state.dragState.anchorTopLeftY})`)
      .style("opacity",0.98);

    state.dragState.trashZone='far';
    state.dragState.drop=null;
    state.dragState.didDrag = false;   // ← NEW
  },










  drag(event,d){
    const [px,py]=d3.pointer(event, elements.svg.node());
    const t=d3.zoomTransform(elements.svg.node());
    const [gx,gy]=t.invert([px,py]);
const dx = gx - state.dragState.startGraphX;
const dy = gy - state.dragState.startGraphY;

if (!state.dragState.didDrag){
  const moved = Math.hypot(dx, dy);
  if (moved > (window.DRAG_SLOP_PX || 10)) state.dragState.didDrag = true; // ← NEW
}

elements.dragMiniG.attr("transform",
  `translate(${state.dragState.anchorTopLeftX+dx},${state.dragState.anchorTopLeftY+dy})`);






    // hit test at virtual card center
    const centerX = state.dragState.anchorTopLeftX + dx + CONFIG.CARD_WIDTH/2;
    const centerY = state.dragState.anchorTopLeftY + dy + CONFIG.CARD_HEIGHT/2;
    let drop = Detectors.pick({ x: centerX, y: centerY });

    // Never allow rootAbove while dragging the current root
    if (drop && drop.type === "rootAbove" && !d.parent) drop = null;

    // Trash state
    const src = event.sourceEvent; const cx = src.clientX, cy = src.clientY;
    const zone=dragManager.zone(cx,cy); state.dragState.trashZone=zone;
    const hoveringTarget = !!drop;
    const isNear = (zone==='near') && !hoveringTarget;
    const isOver = (zone==='over');

    elements.trash.classList.toggle('open', (isNear || isOver));
    elements.trash.classList.toggle('wiggle', (isNear || isOver));
    elements.trash.classList.toggle('near', isNear);
    elements.trash.classList.toggle('over', isOver);

    if (isNear || isOver){
      elements.svg.classed('delete-intent', true);
      elements.dragMiniG.style('opacity', 0);
      elements.caretDot.style("opacity",0);
      elements.gNodes.selectAll("g.node").classed("drop-target", false);
      state.dragState.drop=null;
      return;
    } else {
      elements.svg.classed('delete-intent', false);
      elements.dragMiniG.style('opacity', 0.98);
    }

// Clear visuals, then set current drop
elements.caretDot.style("opacity", 0);
elements.gNodes.selectAll("g.node")
  .classed("drop-target hover-adopt hover-adopt-sub", false);
state.dragState.drop = null;


    if(drop){
      if(drop.type==='gap'){
        const hit = drop._hit;
        const [cx2, cy2] = caretXYFromHit(hit);
        elements.caretDot.attr("cx", cx2).attr("cy", cy2).attr("r", CONFIG.CARET_DOT_RADIUS).style("opacity",1);
        state.dragState.drop = { type:'gap', parentUid: drop.parentUid, prevUid: drop.prevUid, nextUid: drop.nextUid };
     
    
} else if (drop.type === 'node') {
  const targetUid = drop.targetUid;

  // highlight the target node
  elements.gNodes.selectAll("g.node")
    .filter(n => n.data && n.data._uid === targetUid)
    .classed("drop-target hover-adopt", true);

  // slightly un-gray its subtree to signal “willing to adopt”
  const targetH = state.root?.descendants()
    .find(n => n.data && n.data._uid === targetUid);
  if (targetH) {
    const subUids = new Set(targetH.descendants().map(n => n.data._uid));
    elements.gNodes.selectAll("g.node")
      .filter(n => n.data && subUids.has(n.data._uid))
      .classed("hover-adopt-sub", true);
  }

  state.dragState.drop = { type: 'node', targetUid };

    
    
    } else if(drop.type==='rootAbove'){
        const [cx2, cy2] = caretXYFromHit(drop._hit);
        elements.caretDot.attr("cx", cx2).attr("cy", cy2).attr("r", CONFIG.CARET_DOT_RADIUS).style("opacity",1);
        state.dragState.drop = { type:'rootAbove' };
      }
    }
  },

  end(event,d){
    document.body.classList.remove('global-no-cursor');




    // 1) Trash?
    const src = event.sourceEvent, cx=src.clientX, cy=src.clientY;
    const zone=dragManager.zone(cx,cy);
    const shouldDelete = (zone==='over');
    if(shouldDelete){
      // Group delete






      if (state.dragState.multiUids && state.dragState.multiUids.length > 1){
        deleteNodesToTrash(state.dragState.multiUids);
        dragManager.clear(); treeManager.layoutAndRender(true, true); return;
      }
      // Single delete
      if(!d.parent){
        pushHistory({ type: 'delete-root', subtree: utils.deepClone(d.data) });
        state.root = null; state.lastNodes = [];
        dragManager.clear(); treeManager.renderEmpty(); return;
      }
      const parentData = d.parent.data;
      const siblings = parentData.children || [];
      const idx = siblings.findIndex(c=>c._uid===d.data._uid);
      pushHistory({
        type:'delete',
        parentPath: utils.pathToUid(state.root.data, parentData._uid),
        index: idx,
        subtree: utils.deepClone(d.data)
      });
      if(idx>=0) siblings.splice(idx,1);
      if(d.parent.children){
        const hi = d.parent.children.indexOf(d);
        if(hi>=0) d.parent.children.splice(hi,1);
        if(d.parent.children.length===0) d.parent.children=null;
      }
      dragManager.clear(); treeManager.layoutAndRender(true,true); return;
    }

    // 2) Valid drop?
    const drop = state.dragState.drop;
    if (!drop){ dragManager.clear(); treeManager.layoutAndRender(false); return; }

    /* ========= Helpers used below ========= */
    function detach(uid){
      const path = utils.pathToUid(state.root.data, uid);
      if (!path || path.length < 2) return null;
      const fromParentUid = path[path.length - 2];
      const fromParent = utils.findByUid(state.root.data, fromParentUid);
      if (!fromParent || !Array.isArray(fromParent.children)) return null;
      const fromIndex = fromParent.children.findIndex(c => c && c._uid === uid);
      const moving = utils.findByUid(state.root.data, uid);
      if (fromIndex > -1) fromParent.children.splice(fromIndex, 1);
      if (fromParent.children && fromParent.children.length === 0) fromParent.children = null;
      return {
        moving,
        fromParent,
        fromParentPath: utils.pathToUid(state.root.data, fromParent._uid),
        fromIndex
      };
    }
    function abandonChildrenInPlace(moving, info){
      const kids = (moving && moving.children) ? moving.children.slice() : [];
      if (!kids.length || !info || !info.fromParent) return;
      info.fromParent.children = info.fromParent.children || [];
      info.fromParent.children.splice(info.fromIndex, 0, ...kids);
      moving.children = null;
    }

    /* ========= A) GROUP MOVE ========= */
    if (state.dragState.multiUids && state.dragState.multiUids.length > 1){
      
      const groupAbandon = !!state.dragState.groupAbandon;


      const group = state.dragState.multiUids.slice();
      const set = new Set(group);

      // Only top-level selections (skip those under another selected)
      const byH = new Map(state.root.descendants().map(n => [n.data._uid, n]));
      const topLevel = [];
      for (const uid of group){
        const h = byH.get(uid); if (!h) continue;
        let p = h.parent, under = false;
        while (p){ if (set.has(p.data._uid)) { under = true; break; } p = p.parent; }
        if (!under) topLevel.push(uid);
      }
      topLevel.sort((a,b) => (byH.get(a)?.x||0) - (byH.get(b)?.x||0));

      if (drop.type === 'node'){
        const target = utils.findByUid(state.root.data, drop.targetUid);
        if (!target){ dragManager.clear(); treeManager.layoutAndRender(false); return; }
        target.children = target.children || [];

        for (const uid of topLevel){
          // Skip “drop onto itself” (selected target equals selected uid)
          if (drop.targetUid === uid) continue;

          const moving = utils.findByUid(state.root.data, uid);
          if (!moving) continue;

          const intoOwn = utils.uidInSubtree(moving, drop.targetUid);
          const info = detach(uid);                 // we are handling the drop; safe to detach
          if (!info || !info.moving) continue;

          if (groupAbandon || intoOwn) abandonChildrenInPlace(moving, info);

          target.children.push(moving);
          pushHistory({
            type: 'move',
            uid,
            fromParentPath: info.fromParentPath,
            fromIndex: info.fromIndex,
            toParentPath: utils.pathToUid(state.root.data, target._uid),
            toIndex: target.children.length - 1
          });
        }

        state.root = d3.hierarchy(state.root.data); utils.assignIds(state.root);
        dragManager.clear(); treeManager.layoutAndRender(false);
        if (topLevel.length) flashMoved(topLevel[topLevel.length - 1]);
        return;
      }

      if (drop.type === 'gap'){
        const parent = utils.findByUid(state.root.data, drop.parentUid);
        if (!parent){ dragManager.clear(); treeManager.layoutAndRender(false); return; }
        parent.children = parent.children || [];

        const findIdx = (arr, uid) => Array.isArray(arr) ? arr.findIndex(c => c && c._uid === uid) : -1;
        let insertAt = parent.children.length;
        const pIdx = findIdx(parent.children, drop.prevUid);
        const nIdx = findIdx(parent.children, drop.nextUid);
        if (nIdx !== -1) insertAt = nIdx;
        if (pIdx !== -1) insertAt = pIdx + 1;

        for (const uid of topLevel){
          const moving = utils.findByUid(state.root.data, uid);
          if (!moving) continue;

          const intoOwn = utils.uidInSubtree(moving, drop.parentUid);
          if (intoOwn && !groupAbandon) continue;

          const info = detach(uid);
          if (!info || !info.moving) continue;

          // within same parent and we removed before insertAt → shift
          if (info.fromParent && info.fromParent._uid === parent._uid && info.fromIndex < insertAt) insertAt--;

          if (groupAbandon || intoOwn) abandonChildrenInPlace(moving, info);

          parent.children.splice(insertAt, 0, moving);
          pushHistory({
            type: 'move',
            uid,
            fromParentPath: info.fromParentPath,
            fromIndex: info.fromIndex,
            toParentPath: utils.pathToUid(state.root.data, parent._uid),
            toIndex: insertAt
          });

          insertAt++;
        }

        state.root = d3.hierarchy(state.root.data); utils.assignIds(state.root);
        dragManager.clear(); treeManager.layoutAndRender(false);
        if (topLevel.length) flashMoved(topLevel[topLevel.length - 1]);
        return;
      }

      // (group + rootAbove not supported yet)
      dragManager.clear(); treeManager.layoutAndRender(false); return;
    }

    /* ========= B) SOLO MOVE (Shift held): move only this node; children stay with old parent ========= */
    if (state.dragState.solo){
      // B1) Root in solo mode: promote leftmost child to root, place old root at drop
      if (!d.parent){
        const prevTree = utils.deepClone(state.root.data);
        const kidsH = (state.root.children || []).slice().sort((a,b)=>a.x-b.x);
        if (!kidsH.length){
          showToast("Root has no child to promote");
          dragManager.clear(); treeManager.layoutAndRender(false); return;
        }
        const newRootData = kidsH[0].data;
        const others = kidsH.slice(1).map(h=>h.data);

        const moving = state.root.data;  // old root becomes moving node
        moving.children = null;

        const idx = (prevTree.children || []).findIndex(c=>c._uid===newRootData._uid);
        if (idx>-1) prevTree.children.splice(idx,1);
        newRootData.children = (newRootData.children || []).concat(others);

        pushHistory({ type:'replace-root', prev: prevTree });
        state.root = d3.hierarchy(newRootData); utils.assignIds(state.root);

        // Insert the old root at drop
        const res = insertNodeAtDrop(moving, drop);
        if (res === 'ROOT_DONE') return;
        if (res){
          pushHistory({ type:'add',
            parentPath: utils.pathToUid(state.root.data, res.toParentUid),
            uid: moving._uid, index: res.toIndex
          });
          state.root = d3.hierarchy(state.root.data); utils.assignIds(state.root);
          dragManager.clear(); treeManager.layoutAndRender(false); flashMoved(moving._uid); return;
        }
        dragManager.clear(); treeManager.layoutAndRender(false); return;
      }

      // B2) Non-root solo move: promote children into current parent, then move node
      const moving = d.data;
      const parentData = d.parent.data;

      const fromParentPath = utils.pathToUid(state.root.data, parentData._uid);
      const fromIndex = (parentData.children || []).findIndex(c => c._uid === moving._uid);

      const orphans = (moving.children || []).slice();
      if (fromIndex >= 0) parentData.children.splice(fromIndex, 1, ...orphans);
      moving.children = null;

      // Self-drop safeguard (solo): dropping onto own node = NO-OP
      if (drop.type === 'node' && drop.targetUid === moving._uid){
        state.root = d3.hierarchy(state.root.data); utils.assignIds(state.root);
        dragManager.clear(); treeManager.layoutAndRender(false); return;
      }

      if (drop.type === 'rootAbove'){
        const prev = utils.deepClone(state.root.data);
        const newRoot = moving;
        newRoot.children = newRoot.children || [];
        newRoot.children.push(prev);
        pushHistory({ type:'replace-root', prev });
        state.root = d3.hierarchy(newRoot); utils.assignIds(state.root);
        dragManager.clear(); treeManager.layoutAndRender(false); flashMoved(newRoot._uid); return;
      }

      const res = insertNodeAtDrop(moving, drop);
      if (res){
        pushHistory({
          type:'move',
          uid: moving._uid,
          fromParentPath,
          fromIndex,
          toParentPath: utils.pathToUid(state.root.data, res.toParentUid),
          toIndex: res.toIndex
        });
        state.root = d3.hierarchy(state.root.data); utils.assignIds(state.root);
        dragManager.clear(); treeManager.layoutAndRender(false); flashMoved(moving._uid); return;
      }

      // If insert failed, just redraw cleanly
      dragManager.clear(); treeManager.layoutAndRender(false); return;
    }

    /* ========= C) NORMAL (subtree) SINGLE MOVE (no Shift, not group) ========= */

    // Self-drop safeguard (normal): dropping onto own node = NO-OP
    if (drop.type === 'node' && drop.targetUid === d.data._uid){
      dragManager.clear(); treeManager.layoutAndRender(false); return;
    }

    // C1) Drop above root (make moving the new root)
    if (drop.type==='rootAbove'){
      const prev = utils.deepClone(state.root.data);

      // detach moving from its parent (if any)
      const parentData = d.parent ? d.parent.data : null;
      if (parentData && Array.isArray(parentData.children)){
        const idx = parentData.children.findIndex(c=>c._uid===d.data._uid);
        if (idx>-1) parentData.children.splice(idx,1);
        if ((parentData.children||[]).length===0) parentData.children=null;
      }
      const newRoot = d.data;
      newRoot.children = newRoot.children || [];
      newRoot.children.push(state.root.data);

      pushHistory({ type:"replace-root", prev });
      state.root = d3.hierarchy(newRoot); utils.assignIds(state.root);
      dragManager.clear(); treeManager.layoutAndRender(false); flashMoved(newRoot._uid);
      return;
    }

    // C2) Drop into a gap (reorder or reparent)
    if (drop.type === 'gap') {
      const moving = d.data;
      const movingUid = moving._uid;
      const targetParent = utils.findByUid(state.root.data, drop.parentUid);
      if (!targetParent) { dragManager.clear(); treeManager.layoutAndRender(false); return; }

      const droppingIntoOwnSubtree = utils.uidInSubtree(moving, drop.parentUid);

      // Special: moving ROOT into its own subtree
      if (!d.parent && droppingIntoOwnSubtree) {
        const prevTree = utils.deepClone(state.root.data);
        const kidsH = (state.root.children || []).slice().sort((a,b)=>a.x-b.x);
        if (!kidsH.length) { dragManager.clear(); treeManager.layoutAndRender(false); return; }

        const newRootData = kidsH[0].data;
        const others = kidsH.slice(1).map(h=>h.data);

        const oldRootData = state.root.data;
        oldRootData.children = null;

        const idx = (prevTree.children || []).findIndex(c => c._uid === newRootData._uid);
        if (idx > -1) prevTree.children.splice(idx, 1);
        newRootData.children = (newRootData.children || []).concat(others);

        pushHistory({ type: 'replace-root', prev: prevTree });
        state.root = d3.hierarchy(newRootData); utils.assignIds(state.root);

        // insert old root at the gap
        targetParent.children = targetParent.children || [];
        const findIdx = (arr, uid) => Array.isArray(arr) ? arr.findIndex(c => c && c._uid === uid) : -1;
        let insertAt = targetParent.children.length;
        const pIdx = findIdx(targetParent.children, drop.prevUid);
        const nIdx = findIdx(targetParent.children, drop.nextUid);
        if (nIdx !== -1) insertAt = nIdx;
        if (pIdx !== -1) insertAt = pIdx + 1;

        pushHistory({
          type: 'add',
          parentPath: utils.pathToUid(state.root.data, targetParent._uid),
          uid: oldRootData._uid,
          index: insertAt
        });
        targetParent.children.splice(insertAt, 0, oldRootData);

        state.root = d3.hierarchy(state.root.data); utils.assignIds(state.root);
        dragManager.clear(); treeManager.layoutAndRender(false); flashMoved(oldRootData._uid); return;
      }

      // Non-root: if dropping into own subtree, promote children first
      const oldParent = d.parent ? d.parent.data : null;
      if (droppingIntoOwnSubtree && oldParent) {
        const fromParentPath = utils.pathToUid(state.root.data, oldParent._uid);
        const fromIndex = (oldParent.children || []).findIndex(c => c._uid === movingUid);

        const orphans = (moving.children || []).slice();
        if (fromIndex >= 0) oldParent.children.splice(fromIndex, 1, ...orphans);
        moving.children = null;

        targetParent.children = targetParent.children || [];
        const findIdx = (arr, uid) => Array.isArray(arr) ? arr.findIndex(c => c && c._uid === uid) : -1;
        let insertAt = targetParent.children.length;
        const pIdx = findIdx(targetParent.children, drop.prevUid);
        const nIdx = findIdx(targetParent.children, drop.nextUid);
        if (nIdx !== -1) insertAt = nIdx;
        if (pIdx !== -1) insertAt = pIdx + 1;

        pushHistory({
          type: 'move',
          uid: movingUid,
          fromParentPath,
          fromIndex,
          toParentPath: utils.pathToUid(state.root.data, targetParent._uid),
          toIndex: insertAt
        });
        targetParent.children.splice(insertAt, 0, moving);

        state.root = d3.hierarchy(state.root.data); utils.assignIds(state.root);
        dragManager.clear(); treeManager.layoutAndRender(false); flashMoved(movingUid); return;
      }

      // Otherwise normal: remove from old, insert at gap
      {
        const oldParent = d.parent.data;
        const oldArr = oldParent.children || (oldParent.children = []);
        const oldIdx = oldArr.findIndex(c => c._uid === movingUid);
        if (oldIdx >= 0) oldArr.splice(oldIdx, 1);

        const destArr = targetParent.children || (targetParent.children = []);
        const findIdx = (arr, uid) => arr.findIndex(c => c._uid === uid);
        let insertAt = destArr.length;
        const pIdx = findIdx(destArr, drop.prevUid);
        const nIdx = findIdx(destArr, drop.nextUid);
        if (nIdx !== -1) insertAt = nIdx;
        if (pIdx !== -1) insertAt = pIdx + 1;

        pushHistory({
          type: 'move',
          uid: movingUid,
          fromParentPath: utils.pathToUid(state.root.data, oldParent._uid),
          fromIndex: oldIdx,
          toParentPath: utils.pathToUid(state.root.data, targetParent._uid),
          toIndex: insertAt
        });
        destArr.splice(insertAt, 0, moving);

        state.root = d3.hierarchy(state.root.data); utils.assignIds(state.root);
        dragManager.clear(); treeManager.layoutAndRender(false); flashMoved(movingUid); return;
      }
    }

    // C3) Drop onto a node (append under it)
    if (drop.type === 'node') {
      const target = utils.findByUid(state.root.data, drop.targetUid);
      if (!target) { dragManager.clear(); treeManager.layoutAndRender(false); return; }

      const moving = d.data;
      const movingUid = moving._uid;
      const droppingIntoOwnSubtree = utils.uidInSubtree(moving, drop.targetUid);

      // Special: root → own subtree (make leftmost child new root, then append old root under target)
      if (!d.parent && droppingIntoOwnSubtree) {
        const prevTree = utils.deepClone(state.root.data);
        const kidsH = (state.root.children || []).slice().sort((a,b)=>a.x-b.x);
        if (!kidsH.length) { dragManager.clear(); treeManager.layoutAndRender(false); return; }

        const newRootData = kidsH[0].data;
        const others = kidsH.slice(1).map(h=>h.data);

        const oldRootData = state.root.data;
        oldRootData.children = null;

        const idx = (prevTree.children || []).findIndex(c => c._uid === newRootData._uid);
        if (idx > -1) prevTree.children.splice(idx, 1);
        newRootData.children = (newRootData.children || []).concat(others);

        pushHistory({ type: 'replace-root', prev: prevTree });
        state.root = d3.hierarchy(newRootData); utils.assignIds(state.root);

        target.children = target.children || [];
        pushHistory({
          type: 'add',
          parentPath: utils.pathToUid(state.root.data, target._uid),
          uid: oldRootData._uid,
          index: target.children.length
        });
        target.children.push(oldRootData);

        state.root = d3.hierarchy(state.root.data); utils.assignIds(state.root);
        dragManager.clear(); treeManager.layoutAndRender(false); flashMoved(oldRootData._uid); return;
      }

      // Non-root: if into own subtree, promote children first
      const oldParent = d.parent ? d.parent.data : null;
      if (droppingIntoOwnSubtree && oldParent) {
        const fromParentPath = utils.pathToUid(state.root.data, oldParent._uid);
        const fromIndex = (oldParent.children || []).findIndex(c => c._uid === movingUid);

        const orphans = (moving.children || []).slice();
        if (fromIndex >= 0) oldParent.children.splice(fromIndex, 1, ...orphans);
        moving.children = null;

        target.children = target.children || [];
        pushHistory({
          type: 'move',
          uid: movingUid,
          fromParentPath,
          fromIndex,
          toParentPath: utils.pathToUid(state.root.data, target._uid),
          toIndex: target.children.length
        });
        target.children.push(moving);

        state.root = d3.hierarchy(state.root.data); utils.assignIds(state.root);
        dragManager.clear(); treeManager.layoutAndRender(false); flashMoved(movingUid); return;
      }

      // Otherwise normal reparent under target
      {
        const oldParent = d.parent.data;
        const oldArr = oldParent.children || (oldParent.children = []);
        const oldIdx = oldArr.findIndex(c => c._uid === movingUid);
        if (oldIdx >= 0) oldArr.splice(oldIdx, 1);

        pushHistory({
          type: 'move',
          uid: movingUid,
          fromParentPath: utils.pathToUid(state.root.data, oldParent._uid),
          fromIndex: oldIdx,
          toParentPath: utils.pathToUid(state.root.data, target._uid),
          toIndex: (target.children?.length ?? 0)
        });
        const destArr = target.children || (target.children = []);
        destArr.push(moving);

        state.root = d3.hierarchy(state.root.data); utils.assignIds(state.root);
        dragManager.clear(); treeManager.layoutAndRender(false); flashMoved(movingUid); return;
      }
    }

    // Fallback
    dragManager.clear(); treeManager.layoutAndRender(false);
  }
};
attach('drag', dragManager)


function getSelectionUids(){
  return state.selectedUids ? Array.from(state.selectedUids) : [];
}



