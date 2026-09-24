/* ======================= TREE MANAGER ======================= */
const treeManager = {
  initialize(){
    const { state, elements, config: CONFIG, utils } = logyq
    elements.gRoot = elements.svg.append("g");
    elements.gLinks= elements.gRoot.append("g").attr("class","links");
    elements.gHits = elements.gRoot.append("g").attr("class","hit-slots");
    elements.gNodes= elements.gRoot.append("g").attr("class","nodes");
    elements.gOverlay=elements.gRoot.append("g").attr("class","overlay");
    elements.gDetectors = elements.gOverlay.append('g').attr('class','detector-layer');
    elements.dragMiniG= elements.gOverlay.append("g").attr("class","drag-mini").style("opacity",0);
    elements.dragMiniRect=elements.dragMiniG.append("rect").attr("width",CONFIG.CARD_WIDTH).attr("height",CONFIG.CARD_HEIGHT).attr("rx",10).attr("ry",10).node();
    elements.dragMiniTitle=elements.dragMiniG.append("text").attr("class","title");
    elements.caretDot=elements.gOverlay.append("circle").attr("class","caret-dot").attr("r", CONFIG.CARET_DOT_RADIUS);


// Ensure the flag exists
if (typeof state.isPanning === "undefined") state.isPanning = false;

state.zoom = d3.zoom()
  .scaleExtent([0.02, 2.4])
  .filter((event) => {
    // Allow wheel-zoom anywhere. Desktop: block pans that start on a
    // card (that's a drag). Phone: a card finger uses this same zoom
    // pan until a still hold latches (`__logyqHoldDragSession`).
    if (typeof document !== "undefined" && document.body?.classList?.contains("logyq-curriculum")
      && (document.body.classList.contains("logyq-curriculum-frozen") || document.body.classList.contains("logyq-curriculum-gate"))) {
      return false;
    }
    if (event.type === "wheel") return true;
    if (typeof window !== "undefined" && (window.__logyqHoldDragSession || window.__logyqSuppressZoom)) return false;
    const mobile = typeof document !== "undefined"
      && document.body?.classList?.contains("logyq-mobile-v162");
    if (mobile) return true;
    const t = event.target;
    const onNode = !!(t && t.closest && t.closest("g.node"));
    return !onNode;
  })

  // Mark panning only for drag gestures (mouse/touch), not wheel or programmatic zooms
  .on("start", (event) => {
    const t = event?.sourceEvent?.type;
    if (t === "mousedown" || t === "mousemove" ||
        t === "pointerdown" || t === "pointermove" ||
        t === "touchstart"  || t === "touchmove") {
      state.isPanning = true;
    }
  })

  .on("zoom", (e) => {
    elements.gRoot.attr("transform", e.transform);
    if (state.editingUid) logyq.editing.updateNodeEditorPosition();
    if (state.editingUid && e.sourceEvent) state.editUserZoom = true;
    logyq.layout.refreshLaneOnZoom();
    logyq.detectors.draw();

    // Run moat check after paint, but not while panning
    setTimeout(() => {
      if (!state.isPanning) logyq.camera.checkMoatAndAutoFit('zoom');
    }, 0);
  })

  .on("end", () => {
    state.isPanning = false;
  });

elements.svg.call(state.zoom);

// --- Smooth wheel zoom override ---
elements.svg.on("wheel.zoom", null); // disable default instant wheel
elements.svg.on("wheel.smooth", function (event) {
  event.preventDefault();
  if (document.body?.classList?.contains("logyq-curriculum")
    && (document.body.classList.contains("logyq-curriculum-frozen") || document.body.classList.contains("logyq-curriculum-gate"))) {
    return;
  }
  const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;  // zoom step
  const p = d3.pointer(event);                       // zoom to cursor
  d3.select(this)
    .transition()
    .duration(140)
    .ease(d3.easeCubicOut)
    .call(state.zoom.scaleBy, factor, p);
}, { passive: false });



// ========== [NEW] Z / Shift+Z keyboard zoom (one wheel notch) ==========
(() => {
  // Adjust this if you want a bigger/smaller step.
  const ZOOM_STEP = 1.20;

  function zoomByStep(direction){
    // direction: +1 = in, -1 = out
    const svgEl = elements.svg.node();
    if (!svgEl || !state.zoom) return;

    // Zoom around the viewport center so it’s stable & predictable
    const center = [svgEl.clientWidth / 2, svgEl.clientHeight / 2];
    const factor = direction > 0 ? ZOOM_STEP : 1 / ZOOM_STEP;

    // No easing here—same behavior as wheel/pinch so it won’t jitter
    elements.svg.call(state.zoom.scaleBy, factor, center);
  }


window.addEventListener('keydown', (e) => {
    // Don’t hijack Undo/Redo or when typing in inputs
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (logyq.input.isTextField(e.target)) return;

    // Z = zoom in, Shift+Z = zoom out
    if (e.key === 'z' || e.key === 'Z') {
      e.preventDefault();
      if (document.body?.classList?.contains('logyq-curriculum')
        && (document.body.classList.contains('logyq-curriculum-frozen') || document.body.classList.contains('logyq-curriculum-gate'))) {
        return;
      }
      zoomByStep(e.shiftKey ? -1 : +1);
    }
  }, { passive: false });

})();




   elements.svg.on("dblclick.zoom", null);

// [NEW] Silence node double-click-to-edit across the SVG
(() => {
  const svgEl = elements.svg.node();
  if (!svgEl) return;
  const mute = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation?.();
  };
  // Use capture so we stop it BEFORE any node dblclick handler runs
  svgEl.addEventListener('dblclick', mute, true);
})();





    elements.svg.on("click", e=>{ if(e.target===elements.svg.node()){ logyq.selection.clearSelection(); logyq.wordDock.clearChipSelection(); } });

    state.layout=d3.tree();
    state.root = null;
    this.renderEmpty();

    elements.fitBtn.addEventListener('click', ()=> {
      if (document.body?.classList?.contains('logyq-curriculum')) {
        this.settleRootAnchored({ force: false });
        return;
      }
      this.autoFit();
    });
    elements.undoBtn.addEventListener('click', logyq.history.undo);

    /* ========== Mix / Save / Maps ========== */
// Fire Mix on press instead of click
elements.mixBtn && elements.mixBtn.addEventListener('pointerdown', (e) => {
  // Left mouse press (or any touch/pen) triggers; ignore right/middle mouse
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  logyq.mix.randomizeTree(!!e.shiftKey);   // Shift = include WordBank
  e.preventDefault();            // avoid follow-up click / selection jitter
}, { passive: false });

elements.mixBtn && elements.mixBtn.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  // Right-click forces include WordBank. A phone long-press is not that.
  if (window.incidentalBankContext?.(e)) return;
  logyq.mix.randomizeTree(true);
});

// Keep keyboard accessibility (Enter/Space on the focused button)
elements.mixBtn && elements.mixBtn.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    logyq.mix.randomizeTree(!!e.shiftKey);
  }
});

    setupSettings();
    /* [patch] help-init start */
    setupHelp();
    /* [/patch] help-init end */

    // Other global keys. Look up at event time: initialize() runs
    // before attach('keyboard') in 17-keyboard.js.
    document.addEventListener('keydown', (e) => {
      logyq.keyboard?.keyDispatcher?.(e);
    }, true);



    

    logyq.wordDock.render();
    /* [patch] dock-bounds-init start */
    try{ logyq.dock.updateDockBounds(); }catch(_e){}
    /* [/patch] dock-bounds-init end */
    elements.undoBtn.disabled = state.history.length===0;
  },

  renderEmpty(){
    const { state, elements } = logyq
    elements.gLinks.selectAll("path.link").remove();
    elements.gHits?.selectAll("g.hit-slot").remove();
    elements.gNodes.selectAll("g.node").remove();
    state.lastNodes = [];
    state.detectors=[];
    state.layoutSettling = false
    state.layoutFlushQueued = false
    state.layoutAfterFlush = null
    try { clearTimeout(state.layoutSettleTimer) } catch (_e) {}
    state.layoutSettleTimer = 0
    try { document.body.classList.remove('logyq-layout-settling') } catch (_e) {}
    logyq.detectors.draw();
  },

  CREATE_SETTLE_MS: 260,

  isLayoutSettling(){
    return !!logyq.state.layoutSettling
  },

  requestCreateLayout(after){
    const { state } = logyq
    if (typeof after === 'function') {
      const prev = state.layoutAfterFlush
      state.layoutAfterFlush = () => {
        try { prev?.() } catch (_e) {}
        try { after() } catch (_e) {}
      }
    }
    if (state.layoutSettling) {
      state.layoutFlushQueued = true
      this.syncCreateHitSlots()
      return 'queued'
    }
    this.flushCreateLayout()
    return 'ran'
  },

  applyLayout(root){
    const { state, config: CONFIG } = logyq
    if (!root || !state.layout) return root
    state.layout.nodeSize([CONFIG.CARD_WIDTH+CONFIG.HORIZONTAL_GAP, CONFIG.CARD_HEIGHT+CONFIG.VERTICAL_GAP]).separation((a,b)=>{
      let A=a,B=b; while(A.depth>B.depth)A=A.parent; while(B.depth>A.depth)B=B.parent; while(A!==B){A=A.parent;B=B.parent;}
      const l=A.depth, up=Math.max(1,a.depth-l);
      const base=(up===1)?0.9:0.75, inc=(up>1)?0.35*(up-1):0;
      const bonus=0.2*Math.max(0,(a.children?.length??0)-1)+0.2*Math.max(0,(b.children?.length??0)-1);
      return Math.max(0.1, base+inc+bonus);
    });
    state.layout(root);
    return root;
  },

  syncCreateHitSlots(){
    const { state, utils } = logyq
    if (!state.root?.data || !state.layout) return
    const scratch = d3.hierarchy(state.root.data)
    utils.assignIds(scratch)
    this.applyLayout(scratch)
    state.root = scratch
    const nodes = scratch.descendants()
    this.syncHitSlots(nodes)
    this.ensureCreateNodes(nodes)
    this.retargetLiveNodes(nodes)
    state.layoutVisualReady = true
  },

  // A second create while the first settle is still playing used to leave
  // painted cards on the old layout and then animate again when the queue
  // flushed. Point the live cards at the latest layout now, and let the
  // flush land without a second glide.
  retargetLiveNodes(nodes){
    const { elements } = logyq
    const want = new Map()
    for (const d of nodes || []) {
      if (d?.data?._uid != null && String(d.data._uid) !== '') want.set(d.data._uid, d)
    }
    elements.gNodes?.selectAll('g.node').each(function (d) {
      const next = want.get(d?.data?._uid)
      if (!next) return
      const sel = d3.select(this)
      sel.datum(next)
      sel.interrupt()
      sel.transition().duration(180).attr('transform', `translate(${next.x},${next.y})`)
    })
    const root = (nodes || []).find((d) => d && !d.parent) || null
    if (elements.gLinks && root?.links) {
      const byTarget = new Map()
      for (const link of root.links()) {
        if (link?.target?.data?._uid != null) byTarget.set(link.target.data._uid, link)
      }
      elements.gLinks.selectAll('path.link').each(function (d) {
        const next = byTarget.get(d?.target?.data?._uid)
        if (!next) return
        const sel = d3.select(this)
        sel.datum(next)
        sel.interrupt()
        sel.transition().duration(180).attr('d', logyq.visual.vLink(next))
      })
    }
  },

  ensureCreateNodes(nodes){
    const { elements, config: CONFIG } = logyq
    if (!elements.gNodes) return
    const have = new Set()
    elements.gNodes.selectAll('g.node').each(function(d){
      if (d?.data?._uid) have.add(d.data._uid)
    })
    for (const d of nodes || []) {
      const uid = d?.data?._uid
      if (uid == null || String(uid) === '' || have.has(uid)) continue
      const g = elements.gNodes.append('g')
        .datum(d)
        .attr('class', 'node')
        .attr('data-uid', uid)
        .attr('transform', `translate(${d.x},${d.y})`)
        .style('opacity', 1)
      g.insert('rect', ':first-child')
        .attr('class', 'grabzone')
        .attr('x', -CONFIG.CARD_WIDTH / 2)
        .attr('y', -CONFIG.CARD_HEIGHT / 2)
        .attr('width', CONFIG.CARD_WIDTH)
        .attr('height', CONFIG.CARD_HEIGHT)
        .style('fill', 'transparent')
        .style('pointer-events', 'none')
      g.append('rect')
        .attr('x', -CONFIG.CARD_WIDTH / 2)
        .attr('y', -CONFIG.CARD_HEIGHT / 2)
        .attr('width', CONFIG.CARD_WIDTH)
        .attr('height', CONFIG.CARD_HEIGHT)
        .attr('data-uid', uid)
        .style('fill', d.data.color || null)
      g.append('text')
        .attr('class', 'label')
        .attr('x', 0)
        .attr('y', 0)
        .style('font-size', `${CONFIG.FONT_SIZE}px`)
        .text(d.data.name)
      this.bindUidStamp(g)
      have.add(uid)
    }
  },

  ensureUidLayout(uid){
    const { state, utils } = logyq
    if (!uid) return null
    let node = state.root?.descendants().find((item) => item.data?._uid === uid)
    if (node) return node
    if (!utils.findByUid(state.root?.data, uid)) return null
    state.root = d3.hierarchy(state.root.data)
    utils.assignIds(state.root)
    this.applyLayout(state.root)
    this.syncHitSlots(state.root.descendants())
    return state.root.descendants().find((item) => item.data?._uid === uid) || null
  },

  flushCreateLayout(){
    const { state, utils } = logyq
    if (!state.root?.data) return
    const instant = !!state.layoutVisualReady
    state.layoutVisualReady = false
    state.layoutFlushQueued = false
    const after = state.layoutAfterFlush
    state.layoutAfterFlush = null
    state.root = d3.hierarchy(state.root.data)
    utils.assignIds(state.root)
    state.layoutMotionMs = instant ? 0 : 260
    this.layoutAndRender(false)
    state.layoutMotionMs = null
    try { after?.() } catch (_e) {}
  },

  armLayoutSettle(){
    const { state } = logyq
    const delay = this.CREATE_SETTLE_MS || 260
    state.layoutGeneration = (state.layoutGeneration || 0) + 1
    if (state.layoutMotionMs === 0) {
      state.layoutSettling = false
      state.layoutSettleTimer = 0
      try { document.body.classList.remove('logyq-layout-settling') } catch (_e) {}
      return
    }
    state.layoutSettling = true
    try { document.body.classList.add('logyq-layout-settling') } catch (_e) {}
    try { clearTimeout(state.layoutSettleTimer) } catch (_e) {}
    state.layoutSettleTimer = setTimeout(() => {
      state.layoutSettling = false
      state.layoutSettleTimer = 0
      try { document.body.classList.remove('logyq-layout-settling') } catch (_e) {}
      if (state.layoutFlushQueued) this.flushCreateLayout()
    }, delay)
  },

  bindUidStamp(selection){
    selection.each(function(d){
      const el = this
      const uid = d?.data?._uid
      if (uid != null && String(uid) !== '') el.setAttribute('data-uid', uid)
      if (el.__logyqUidStamp) return
      el.__logyqUidStamp = true
      el.addEventListener('pointerdown', function(event){
        const next = this.__data__?.data?._uid || this.getAttribute('data-uid')
        if (next != null && String(next) !== '') event.__logyqUid = next
      }, true)
    })
  },

  syncHitSlots(nodes){
    const { elements, config: CONFIG } = logyq
    if (!elements.gHits) {
      elements.gHits = elements.gRoot.insert("g", "g.nodes").attr("class", "hit-slots");
    }
    const sel = elements.gHits.selectAll("g.hit-slot").data(nodes, d => d.data._uid);
    const enter = sel.enter().append("g").attr("class", "hit-slot");
    enter.append("rect")
      .attr("x", -CONFIG.CARD_WIDTH/2)
      .attr("y", -CONFIG.CARD_HEIGHT/2)
      .attr("width", CONFIG.CARD_WIDTH)
      .attr("height", CONFIG.CARD_HEIGHT)
      .attr("fill", "transparent")
      .style("pointer-events", "all");
    const slots = enter.merge(sel)
      .attr("data-uid", d => d.data._uid)
      .classed("logyq-pile", d => !!d?.data?.curriculumPile)
      .attr("transform", d => `translate(${d.x},${d.y})`);
    this.bindUidStamp(slots)
    sel.exit().remove();
  },

  layoutAndRender(isDelete=false){
    const { state } = logyq
    if (window.__logyqHoldDragFrozen?.()) return;
    if (state.layoutSettling) state.layoutOverlapCount = (state.layoutOverlapCount || 0) + 1
    if (!state.root) { this.renderEmpty(); return; }
    this.applyLayout(state.root);
    this.render(isDelete);
    this.armLayoutSettle();
    if (state.repositionMode === "mix") { /* [patch] mix-reposition-run */
      (function(){
        /* Fit after the cards finish moving. A mid-tween bbox is a tight
           cluster, and fitting that zooms a small pile to fill the screen.
           Curriculum keeps the camera locked through the shuffle and settles
           itself (root pinned, zoom out only when the shape overflows). */
        if (state.curriculumCameraLock) {
          try { clearTimeout(window.__mixFitT); } catch (_e) {}
          return;
        }
        const motion = Number.isFinite(state.layoutMotionMs) ? state.layoutMotionMs : 260
        const wait = Math.max(240, motion + 70)
        const done = ()=>{ if(state.repositionMode==="mix"){ state.repositionMode=null; logyq.treeManager.autoFit(); } };
        try{ clearTimeout(window.__mixFitT); }catch(_e){}
        try{ window.__mixFitT = setTimeout(done, wait); }catch(_e){ setTimeout(done, wait); }
      })();
    }

    state.detectors = logyq.detectors.build(state.root);
    logyq.detectors.draw();
  },

  render(isDelete=false){
    const { state, elements, config: CONFIG } = logyq
    const nodes=state.root.descendants();
    const links=state.root.links();
    const motion = Number.isFinite(state.layoutMotionMs) ? state.layoutMotionMs : 260
    const glide = (sel) => {
      if (motion > 0) {
        const tween = sel.transition().duration(motion)
        // Curriculum Vegas sets a linear ease so a longer beat is a slower
        // drift. Normal Mix leaves this unset and keeps d3's default ease.
        if (typeof state.layoutMotionEase === 'function') tween.ease(state.layoutMotionEase)
        return tween
      }
      sel.interrupt()
      return sel
    }

    const selLinks=elements.gLinks.selectAll("path.link").data(links, d=>d.target.data._uid);
    const enteredLinks = selLinks.enter().append("path").attr("class","link").style("stroke-width", 2.8).style("opacity", 0.5)
      .attr("d", d=> logyq.visual.vLink({source:d.source, target:d.source}))
    enteredLinks.merge(selLinks).classed("logyq-pile-link", d => !!d.source?.data?.curriculumPile);
    glide(enteredLinks).attr("d", d=> logyq.visual.vLink(d));
    glide(selLinks).style("stroke-width", 2.8).style("opacity", 0.5).attr("d", d=> logyq.visual.vLink(d));
    selLinks.exit().transition().duration(isDelete?50:180).style("opacity",0).remove();




const selNodes = elements.gNodes.selectAll("g.node").data(nodes, d => d.data._uid);

// prepare drag (left-only per logyq.drag.behavior().filter)
const nodeDrag = logyq.drag.behavior();

// —— UPDATE selection (existing nodes): bind/refresh all handlers ——
selNodes
  .on("contextmenu", logyq.mix.onNodeContextMenu)  // right-click menu on existing nodes
  .on("mousedown",  logyq.selection.onNodeMouseDown)     // left-click selection on existing nodes
  .call(nodeDrag);                       // drag on existing nodes

// —— ENTER selection (new nodes): same bindings ——
const nEnter = selNodes.enter()
  .append("g").attr("class","node")
  .attr("data-uid", d => d.data._uid)
  .attr("transform", d => `translate(${d.x},${d.y})`)
  .style("opacity", 1)
  .on("contextmenu", logyq.mix.onNodeContextMenu)  // right-click menu on new nodes
  .on("mousedown",  logyq.selection.onNodeMouseDown)     // left-click selection on new nodes
  .call(nodeDrag);                       // drag on new nodes







    /* [patch] grabzone-behind start */
    nEnter.insert("rect",":first-child")
      .attr("class","grabzone")
      .attr("x",-CONFIG.CARD_WIDTH/2)
      .attr("y",-CONFIG.CARD_HEIGHT/2)
      .attr("width",CONFIG.CARD_WIDTH)
      .attr("height",CONFIG.CARD_HEIGHT)
      .style("fill","transparent")
      .style("cursor","grab").style("pointer-events","none");
    /* [patch] grabzone-behind end */
    nEnter.append("rect").attr("x", -CONFIG.CARD_WIDTH/2).attr("y", -CONFIG.CARD_HEIGHT/2).attr("width", CONFIG.CARD_WIDTH).attr("height", CONFIG.CARD_HEIGHT);
    nEnter.append("text").attr("class","label").attr("x",0).attr("y",0).style("font-size", `${CONFIG.FONT_SIZE}px`).text(d=>d.data.name);

    const allNodes = nEnter.merge(selNodes);
    allNodes.attr("data-uid", d => d.data._uid);
    allNodes.classed("logyq-pile", d => !!d?.data?.curriculumPile);
    allNodes.select("rect.grabzone")
      .attr("x", -CONFIG.CARD_WIDTH/2)
      .attr("y", -CONFIG.CARD_HEIGHT/2)
      .attr("width", CONFIG.CARD_WIDTH)
      .attr("height", CONFIG.CARD_HEIGHT)
      .style("pointer-events", "none");
    allNodes.select("rect:not(.grabzone)")
      .attr("data-uid", d => d.data._uid)
      .style("fill", d => d.data.color || null);
    this.bindUidStamp(allNodes);
    glide(allNodes).attr("transform", d=>`translate(${d.x},${d.y})`);
    allNodes.select("text.label").text(d=>d.data.name).style("font-size", `${CONFIG.FONT_SIZE}px`);
    selNodes.exit().transition().duration(isDelete?50:180).style("opacity",0).remove();

    this.syncHitSlots(nodes);
    state.lastNodes=state.root.descendants();
    logyq.layout.LabelWrap.apply();
  },


centerOnSelected(opts = {}) {
  logyq.camera.centerOnSelected(opts)
},


  contentBBox(){
    const { elements } = logyq
    const nb=elements.gNodes.node()?.getBBox();
    const lb=elements.gLinks.node()?.getBBox();
    const merge=(a,b)=>{ if(!a||!a.width||!a.height) return b; if(!b||!b.width||!b.height) return a;
      const x=Math.min(a.x,b.x), y=Math.min(a.y,b.y);
      const r=Math.max(a.x+a.width,b.x+b.width), bt=Math.max(a.y+a.height,b.y+b.height);
      return {x, y, width:r-x, height:bt-y};
    };
    return merge(nb, lb);
  },

  usableFrame(){
    const { elements } = logyq
    const svgNode = elements.svg.node();
    const fullW=svgNode.clientWidth, fullH=svgNode.clientHeight;
    if(!fullW||!fullH) return null;
    const phone = typeof window !== 'undefined' && window.matchMedia
      && window.matchMedia('((pointer:coarse) and (max-width:1200px)),((hover:none) and (max-width:1200px)),(max-width:700px)').matches;
    const shown = (id) => {
      const el = document.getElementById(id)
      if (!el) return null
      const style = getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden') return null
      const rect = el.getBoundingClientRect()
      if (rect.width < 2 || rect.height < 2) return null
      return rect
    }
    let left = 0
    let top = 0
    let right = fullW
    let bottom = fullH
    if (phone) {
      const edge = window.matchMedia('(orientation: landscape)').matches
      const header = shown('logiq-mobile-header')
      if (header && !edge) top = Math.max(top, header.bottom)
    } else {
      const header = document.querySelector('body > header')
      if (header && getComputedStyle(header).display !== 'none') {
        const rect = header.getBoundingClientRect()
        if (rect.height > 2) top = Math.max(top, rect.bottom)
      }
    }
    const bar = shown('logyq-curriculum-bar')
    if (bar) top = Math.max(top, bar.bottom + 8)
    const dock = shown('Dock')
    if (dock) {
      const sideShelf = dock.width < fullW * 0.45 && dock.height > fullH * 0.45 && dock.left < fullW * 0.5
      if (sideShelf) left = Math.max(left, dock.right + 8)
      else if (dock.top > fullH * 0.5) bottom = Math.min(bottom, dock.top - 8)
    }
    return { svgNode, fullW, fullH, left, top, right, bottom }
  },

  // Pin the root to one screen spot in the upper band and scale so the
  // finished shape fits about 90% of the usable viewport. Zoom out when the
  // shape overflows. When it already fits, keep the current scale so a
  // shallower Mix does not pull the root. Never center the bounding box.
  settleRootAnchored(opts = {}){
    const { state, elements } = logyq
    const frame = this.usableFrame()
    const b = this.contentBBox()
    if (!frame || !b || !b.width || !b.height) return
    const root = state.root
    const rx = Number.isFinite(root?.x) ? root.x : 0
    const ry = Number.isFinite(root?.y) ? root.y : 0
    const usableW = Math.max(80, frame.right - frame.left)
    const usableH = Math.max(80, frame.bottom - frame.top)
    const padX = usableW * 0.05
    const padY = usableH * 0.05
    const innerLeft = frame.left + padX
    const innerRight = frame.right - padX
    const innerTop = frame.top + padY
    const innerBottom = frame.bottom - padY
    const anchorX = frame.left + usableW / 2
    const anchorY = frame.top + usableH * 0.28
    const limits = []
    const pushLimit = (room, span) => {
      if (span > 0.5 && room > 0) limits.push(room / span)
    }
    pushLimit(anchorX - innerLeft, rx - b.x)
    pushLimit(innerRight - anchorX, b.x + b.width - rx)
    pushLimit(anchorY - innerTop, ry - b.y)
    pushLimit(innerBottom - anchorY, b.y + b.height - ry)
    const maxK = (state.zoom?.scaleExtent?.() || [0.02, 2.4])[1]
    let fitScale = limits.length ? Math.min(...limits) : 1
    fitScale = Math.min(maxK, 1.15, Math.max(0.02, fitScale))
    const t0 = d3.zoomTransform(frame.svgNode)
    let scale = t0.k
    if (!(scale > 0.02)) scale = fitScale
    if (opts.force || fitScale < scale - 0.012) scale = fitScale
    const tx = anchorX - scale * rx
    const ty = anchorY - scale * ry
    const duration = Number.isFinite(opts.duration) ? opts.duration : 780
    const target = d3.zoomIdentity.translate(tx, ty).scale(scale)
    if (duration <= 0) {
      elements.svg.interrupt().call(state.zoom.transform, target)
      return
    }
    elements.svg.interrupt()
      .transition()
      .duration(duration)
      .ease(d3.easeCubicInOut)
      .call(state.zoom.transform, target)
  },

  autoFit(pad=24){
    const { state, elements } = logyq
    const b = this.contentBBox()
    const frame = this.usableFrame()
    if(!b||!b.width||!b.height||!frame) return;
    const { svgNode, left: chromeLeft, top: chromeTop, right: chromeRight, bottom: chromeBottom } = frame
    const usableW = Math.max(80, chromeRight - chromeLeft)
    const usableH = Math.max(80, chromeBottom - chromeTop)
    // About 10% padding, so the map shape sits in 90% of the usable viewport.
    const content = 0.9
    const widthScale = (usableW * content) / b.width
    const heightScale = (usableH * content) / b.height
    const maxK = (state.zoom?.scaleExtent?.() || [0.02, 2.4])[1]
    const fitScale = Math.min(widthScale, heightScale)
    // Cap zoom-in so a small pile stays an overview. Wider maps still scale down to fit.
    const scale = Math.min(maxK, 1.15, Math.max(0.02, fitScale))
    if(!isFinite(scale) || scale<=0) return;
    const tx = chromeLeft + usableW / 2 - scale * (b.x + b.width / 2)
    const ty = chromeTop + usableH / 2 - scale * (b.y + b.height / 2)
  const el = svgNode;
const t0 = d3.zoomTransform(el);
const dx = tx - t0.x, dy = ty - t0.y, dk = Math.abs(scale - t0.k);
const dist = Math.hypot(dx, dy) + dk * 600;
const ms = Math.max(320, Math.min(1200, dist * 0.5));
elements.svg.interrupt()
  .transition()
  .duration(ms) // loading speed
  .ease(d3.easeCubicInOut)
  .call(state.zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
 }
};
attach('treeManager', treeManager)




  /* ======================= SETTINGS ======================= */
  function setupSettings(){
    const { state, elements, config: CONFIG } = logyq
    const s = elements.settings;
    function open(){ s.backdrop && s.backdrop.classList.add('show'); }
    function close(){ s.backdrop && s.backdrop.classList.remove('show'); }
    s.btn && s.btn.addEventListener('click', open);


    s.backdrop && s.backdrop.addEventListener('click', (e)=>{ if(e.target===s.backdrop) close(); });
    s.close && s.close.addEventListener('click', close);
    document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') close(); });

    if(s.vGap){
      const seed = Number(CONFIG.VERTICAL_GAP)||78;
      s.vGap.value = seed;
      if(s.vGapVal) s.vGapVal.textContent = seed+'px';
      s.vGap.addEventListener('input', (e)=>{
        const v = Math.max(20, Math.min(300, parseInt(e.target.value,10)||seed));
        CONFIG.VERTICAL_GAP = v;
        if(s.vGapVal) s.vGapVal.textContent = v+'px';
        if(s.vGapValHidden) s.vGapValHidden.textContent = v+'px';
        logyq.treeManager.layoutAndRender(false);
      });
    }

    const STEP = 6;
    const defaultGap = Number(CONFIG.VERTICAL_GAP) || 78;
    function clamp(v){ return Math.max(20, Math.min(300, v)); }
    function renderVal(){ const el=document.getElementById("verticalGapVal"); if(el) el.textContent=(Number(CONFIG.VERTICAL_GAP)||0)+"px"; }
    function adjust(delta){ CONFIG.VERTICAL_GAP = clamp((Number(CONFIG.VERTICAL_GAP)||defaultGap)+delta); renderVal(); logyq.treeManager.layoutAndRender(false); }

    s.gapUp && s.gapUp.addEventListener("click", ()=>adjust(-STEP));
    s.gapDown && s.gapDown.addEventListener("click", ()=>adjust(+STEP));
    s.gapReset && s.gapReset.addEventListener("click", ()=>{ CONFIG.VERTICAL_GAP=defaultGap; renderVal(); logyq.treeManager.layoutAndRender(false); });
    renderVal();

    if(s.showDetectors){
      if(s.detDepth){
        const seed = Number(CONFIG.DETECTOR_DEPTH_FACTOR)||1.2;
        s.detDepth.value = String(seed);
        if(s.detDepthVal) s.detDepthVal.textContent = seed.toFixed(1)+"×";
        s.detDepth.addEventListener("input", (e)=>{
          let v = parseFloat(e.target.value); if(!isFinite(v)) v = 1.2; if(v < 1) v = 1;
          CONFIG.DETECTOR_DEPTH_FACTOR = v;
          if(s.detDepthVal) s.detDepthVal.textContent = v.toFixed(1)+"×";
          logyq.treeManager.layoutAndRender(false);
        });
      }
      s.showDetectors.checked = !!CONFIG.SHOW_DETECTORS;
      s.showDetectors.addEventListener('change', (e)=>{
        CONFIG.SHOW_DETECTORS = !!e.target.checked;
        logyq.detectors.draw();
      });
    }

    // >>> NEW: PNG Export button
    if (s.exportPngBtn){
      s.exportPngBtn.addEventListener('click', ()=> {
        elements.settings.exportBackdrop && elements.settings.exportBackdrop.classList.add("show");
/* [patch] export-btn-handlers start */      if (!window.__exportUIInit) {        window.__exportUIInit = true;        const s = elements.settings;        const close = ()=>{ s.exportBackdrop && s.exportBackdrop.classList.remove('show'); };        s.exportClose && s.exportClose.addEventListener('click', close);        s.exportBackdrop && s.exportBackdrop.addEventListener('click', (e)=>{ if(e.target===s.exportBackdrop) close(); });        const readOpts = ()=>({          pad: parseInt(s.exportPadding?.value||'24',10)||24,          minLabelPx: parseInt(s.exportMinLabel?.value||'0',10)||0,          withBackground: !!(s.exportBackground && s.exportBackground.checked),          addTitle: !!(s.exportAddTitle && s.exportAddTitle.checked),          titleText: (s.exportTitleText?.value||'LOGiC').trim() || 'LOGiC'        });        s.doExportPng && s.doExportPng.addEventListener('click', ()=>{          const o = readOpts();          if (s.exportModeView && s.exportModeView.checked) {            logyq.export.exportCurrentView({ scale: 2, withBackground: o.withBackground });          } else {            logyq.export.exportFullPNG({ pad: o.pad, withBackground: o.withBackground, minLabelPx: o.minLabelPx, addTitle: o.addTitle, titleText: o.titleText });          }          close();        });        s.doExportSvg && s.doExportSvg.addEventListener('click', ()=>{          const o = readOpts();          logyq.export.exportSVG({ pad: o.pad, addTitle: o.addTitle, titleText: o.titleText });          close();        });      }      /* [patch] export-btn-handlers end */
      });
    }
  }

  /* [patch] help-setup start */
  function setupHelp(){
    const hb=document.getElementById("helpBackdrop");
    const btn=document.getElementById("helpBtn");
    const close=hb?hb.querySelector(".settings-close"):null;
    if(!hb||!btn) return; /* [patch] help-no-x-guard */
    btn.addEventListener("click",()=>hb.classList.add("show"));
    /* [patch] help-no-x-rmclose */
    /* [patch] help-esc start */
    document.addEventListener("keydown",(e)=>{if(e.key==="Escape")hb.classList.remove("show");},true);
    /* [/patch] help-esc end */
    hb.addEventListener("click",(e)=>{if(e.target===hb)hb.classList.remove("show");});
  }
  /* [/patch] help-setup end */


/* [patch] esc-clears-selection start */
document.addEventListener('keydown', function(e){
  const { state, elements } = logyq
  if (e.key !== 'Escape') return;

  // If you’re editing a node name, let that Esc be handled by the editor.
  if (state.editingUid) return;

  // If any modal/popup is open, let that Esc close the modal instead.
  const modalsOpen =
    (elements.settings?.backdrop?.classList?.contains('show')) ||
    (elements.settings?.exportBackdrop?.classList?.contains('show')) ||
    (document.getElementById('helpBackdrop')?.classList?.contains('show'));
  if (modalsOpen) return;

  // Otherwise: clear the node selection set.
  logyq.selection.clearSelection();
}, true);
/* [patch] esc-clears-selection end */



// --- Clean Tab behavior: press to exit typing + hold to navigate ---
function tabDown(e){
  const { state, elements } = logyq
  if (e.key !== 'Tab') return;
  // If any modal is open, keep native tabbing unless we're in the node editor
  const modalOpen =
    (elements.settings.backdrop?.classList.contains('show')) ||
    (elements.settings.exportBackdrop?.classList.contains('show')) ||
    (document.getElementById('helpBackdrop')?.classList.contains('show'));

  // If the inline node editor is open, commit and close on Tab
  if (state.editingUid && state.editorEl){
    e.preventDefault();
    e.stopPropagation();
    // Commit (true) and restore zoom (true)
    logyq.editing.closeNodeEditor(true, true);
    state.tabHold = true;   // immediately enable navigation mode
    return;
  }

  // If typing in the bottom Word input, blur so arrows/J/K/L can move selection
  if (document.activeElement === elements.wordInput){
    e.preventDefault();
    elements.wordInput.blur();
    state.tabHold = true;
    return;
  }

  // If a modal is open (settings/export/help) we let Tab do normal focus traversal
  if (modalOpen){
    state.tabHold = false;
    return;
  }

  // Canvas/global: use Tab as a “navigation modifier”
  e.preventDefault();
  state.tabHold = true;
}

function tabUp(e){
  const { state } = logyq
  if (e.key !== 'Tab') return;
  state.tabHold = false;
}

window.addEventListener('keydown', tabDown, true);
window.addEventListener('keyup', tabUp, true);
