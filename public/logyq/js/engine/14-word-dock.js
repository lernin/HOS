  /* ======================= CHIPS & INPUT ======================= */
  function clearChipSelection(){ document.querySelectorAll("#Dock .chip.is-outlined").forEach(el=>el.classList.remove("is-outlined")); }
  function getSelectedChipNames(){ return Array.from(document.querySelectorAll("#Dock .chip.is-outlined")).map(el=>el.textContent.trim()).filter(Boolean); }

  function render(){
    const { state, elements, utils } = logyq
    const list = elements.Dock; list.innerHTML = '';
    state.wordBank.forEach((w)=>{
      const chip = document.createElement('div');
      chip.className='chip'; chip.textContent=w; chip.draggable=true;
      chip.addEventListener('click',(e)=>{
        const chips=document.querySelectorAll("#Dock .chip");
        if(e.shiftKey){ chip.classList.toggle("is-outlined"); }
        else { chips.forEach(c=>c.classList.remove("is-outlined")); chip.classList.add("is-outlined"); }
      });
      chip.addEventListener('dragstart',(e)=>{
        state.chipDrag.active = true;
        const group = getSelectedChipNames(); // assumes you already track multi-selection
        const words = (group && group.length ? group.slice() : [w]);
        if (!words.includes(w)) words.push(w); // make sure the dragged one is in there
        state.chipDrag.words = words;
        state.chipDrag.word = w; // keep old field for compatibility
        state.chipDrag.drop = null;
        e.dataTransfer.setData('text/plain', words.join(', '));
        e.dataTransfer.effectAllowed = 'copyMove';
});

chip.addEventListener('dragend',()=>{
elements.caretDot.style('opacity', 0);
d3.selectAll("g.node").classed("drop-target hover-adopt hover-adopt-sub", false);

  state.chipDrag.active = false;
  state.chipDrag.words = [];
  state.chipDrag.drop = null;
  elements.trash.classList.remove('open','over','wiggle','near');
});

      chip.addEventListener("contextmenu", (e) => {e.preventDefault();
        e.stopPropagation(); const sel = Array.from((state.selectedUids || new Set()).values());
if (!state.root || sel.length !== 1) {logyq.selection.showToast(sel.length === 0 ? "Select a node first" : "Select just one node");
  return;}
const target = utils.findByUid(state.root.data, sel[0]);
/* [patch] multiselect-gate end */

        

        if (!target) return;
        const toAdd = (getSelectedChipNames().length ? getSelectedChipNames() : [w]);
        target.children = target.children || [];
        for (const name of toAdd) {
          if (!name) continue;
          const node = { name }; utils.assignUids(node); target.children.push(node);
          logyq.history.pushHistory({ type: "add", parentPath: utils.pathToUid(state.root.data, target._uid), uid: node._uid, index: (target.children.length - 1) });
        }
        state.wordBank = state.wordBank.filter(n => !toAdd.includes(n));
        state.root = d3.hierarchy(state.root.data); utils.assignIds(state.root);
        clearChipSelection(); render(); logyq.treeManager.layoutAndRender(false);
      });
      list.appendChild(chip);
    });
  }

  function addWords(raw, to){
    const { state, utils } = logyq
    if (typeof window !== 'undefined' && window.__logyqHoldDragBlocksBank?.()) return;
    const text = (raw || '').trim(); if(!text) return;
    const words = text.split(/[;,]+/).map(s => s.trim()).filter(Boolean);
    if(!words.length) return;
    if(to==='selected' && state.selectedUid && state.root){
      const target = utils.findByUid(state.root.data, state.selectedUid);
      if(target){
        target.children = target.children || [];
        for(const w of words){
          const node = { name:w }; utils.assignUids(node); target.children.push(node);
          logyq.history.pushHistory({ type: 'add', parentPath: utils.pathToUid(state.root.data, target._uid), uid: node._uid, index: (target.children.length - 1) });
        }
        state.root = d3.hierarchy(state.root.data); utils.assignIds(state.root);
        render(); logyq.treeManager.layoutAndRender(false); return;
      }
    }
    state.wordBank.push(...words); render();
  }
// === GLOBAL ENTER COMMIT (GIQ-aware) ===
// Adds current #wordInput to the selected node (if exactly one is selected) or to the Dock.
// Safeguards: ignores Enter while typing in a field, while a modal is open, or while dragging.

/* Helper: split GIQ input into { jsonText, wordsText, futureText }.
   Format: <JSON> [### <comma/semicolon-separated words>] [$$$ <future>]
*/
function parseGIQ(raw) {
  let jsonText = raw, wordsText = null, futureText = null;

  // Pull off $$$ tail (future-proof; ignored for now)
  const dollarIdx = raw.indexOf("$$$");
  if (dollarIdx !== -1) {
    futureText = raw.slice(dollarIdx + 3).trim();
    raw = raw.slice(0, dollarIdx).trim();
  }

  // Split the ### words section (goes to Word Dock)
  const hashIdx = raw.indexOf("###");
  if (hashIdx !== -1) {
    jsonText  = raw.slice(0, hashIdx).trim();
    wordsText = raw.slice(hashIdx + 3).trim();
  } else {
    jsonText = raw.trim();
  }

  return { jsonText, wordsText, futureText };
}

/* Helper: normalize parsed JSON to {name, children[]} tree shape */
function normalizeToTree(value) {
  const toNode = (x) => {
    if (x == null) return null;

    if (typeof x === "string" || typeof x === "number") {
      return { name: String(x) };
    }

    if (Array.isArray(x)) {
      const kids = x.map(toNode).filter(Boolean);
      return { name: "Root", children: kids.length ? kids : null };
    }

    if (typeof x === "object") {
      // If it already looks like a node, normalize children recursively
      if ("name" in x || "children" in x) {
        const name = ("name" in x) ? String(x.name ?? "Untitled") : "Untitled";
        let kids = null;
        if (Array.isArray(x.children)) {
          const norm = x.children.map(toNode).filter(Boolean);
          kids = norm.length ? norm : null;
        }
        const node = kids ? { name, children: kids } : { name };
        if (x.color) node.color = x.color;
        for (const key of ['label', 'text', 'title', 'value']) {
          if (typeof x[key] === 'string' && x[key].trim()) node[key] = x[key];
        }
        return node;
      }

      // Plain object: turn its keys into children
      const keys = Object.keys(x);
      const kids = keys.map(k => {
        const child = toNode(x[k]);
        if (!child) return { name: String(k) };
        // If child is a leaf, make it a child named by the key
        if (!child.children) return { name: String(k) };
        // If child has its own children, wrap it under key
        return { name: String(k), children: child.children };
      }).filter(Boolean);

      return { name: "Root", children: kids.length ? kids : null };
    }

    return null;
  };

  const node = toNode(value);
  return node || null;
}





































/* ======================= CHIP DROP OVER SVG (uses detectors) ======================= */
logyq.elements.svg.on('dragover', (event) => {
  const { state, elements, config: CONFIG } = logyq
  if (!state.chipDrag.active) return;
  event.preventDefault();

  // No root yet: show caret at pointer and prepare to create a new root where you drop
  if (!state.root) {
    const [px, py] = d3.pointer(event, elements.svg.node());
    const t = d3.zoomTransform(elements.svg.node());
    const [gx, gy] = t.invert([px, py]);
    elements.caretDot
      .attr('cx', gx)
      .attr('cy', gy)
      .attr('r', CONFIG.CARET_DOT_RADIUS)
      .style('opacity', 1);
    state.chipDrag.drop = { type: 'newRootAt', px, py };
    return;
  }

  // With a root: pick a detector hit under the pointer
  const [px, py] = d3.pointer(event, elements.svg.node());
  const t = d3.zoomTransform(elements.svg.node());
  const [gx, gy] = t.invert([px, py]);
  const drop = logyq.detectors.pick({ x: gx, y: gy });


// Reset visuals each move
elements.caretDot.style('opacity', 0);
elements.gNodes.selectAll("g.node")
  .classed("drop-target hover-adopt hover-adopt-sub", false);
state.chipDrag.drop = null;

if (!drop) { return; }





  if (drop.type === 'gap') {
    const hit = drop._hit;
    const [cx, cy] = logyq.selection.caretXYFromHit(hit);
    elements.caretDot
      .attr('cx', cx)
      .attr('cy', cy)
      .attr('r', CONFIG.CARET_DOT_RADIUS)
      .style('opacity', 1);






// clear any prior hover highlights when hovering a gap
elements.gNodes.selectAll("g.node")
  .classed("hover-adopt hover-adopt-sub drop-target", false);

state.chipDrag.drop = {
  type: 'gap',
  parentUid: drop.parentUid,
  prevUid: drop.prevUid,
  nextUid: drop.nextUid
};






} else if (drop.type === 'node') {
  // clear previous hover marks
  elements.gNodes.selectAll("g.node")
    .classed("drop-target hover-adopt hover-adopt-sub", false);

  const targetUid = drop.targetUid;
  const targetH = state.root?.descendants()
    .find(n => n.data && n.data._uid === targetUid);

  if (targetH) {
    // highlight target node
    elements.gNodes.selectAll("g.node")
      .filter(n => n.data && n.data._uid === targetUid)
      .classed("drop-target hover-adopt", true);

    // slightly de-gray its subtree (signals “willing to adopt”)
    const subUids = new Set(targetH.descendants().map(n => n.data._uid));
    elements.gNodes.selectAll("g.node")
      .filter(n => n.data && subUids.has(n.data._uid))
      .classed("hover-adopt-sub", true);
  }

  state.chipDrag.drop = { type: 'node', targetUid };


} else if (drop.type === 'rootAbove') {
  // clear previous hover marks
  elements.gNodes.selectAll("g.node")
    .classed("hover-adopt hover-adopt-sub drop-target", false);

  const [cx, cy] = logyq.selection.caretXYFromHit(drop._hit);
  elements.caretDot
    .attr('cx', cx)
    .attr('cy', cy)
    .attr('r', CONFIG.CARET_DOT_RADIUS)
    .style('opacity', 1);

  state.chipDrag.drop = { type: 'rootAbove' };
}





});

logyq.elements.svg.on('drop', (event) => {
  const { state, elements, utils } = logyq
  if (!state.chipDrag.active) return;
  event.preventDefault();

  const drop = state.chipDrag.drop;
  const words = (Array.isArray(state.chipDrag.words) && state.chipDrag.words.length)
    ? state.chipDrag.words.slice()
    : (state.chipDrag.word ? [state.chipDrag.word] : []);

  if (!drop || !words.length) return;

  const removeFromBank = (list) => {
    list.forEach(w => {
      const i = state.wordBank.indexOf(w);
      if (i > -1) state.wordBank.splice(i, 1);
    });
  };

  // --- CASE 1: create a new root at pointer (empty canvas) ---
  if (drop.type === 'newRootAt') {
    const rootNode = { name: words[0] };
    utils.assignUids(rootNode);

    if (words.length > 1) {
      rootNode.children = words.slice(1).map(nm => {
        const c = { name: nm }; utils.assignUids(c); return c;
      });
    }

    logyq.history.pushHistory({ type: 'add-root', uid: rootNode._uid });
    removeFromBank(words);

    state.root = d3.hierarchy(rootNode);
    utils.assignIds(state.root);

    // Cleanup visuals and render
elements.caretDot.style('opacity', 0);
d3.selectAll("g.node").classed("drop-target hover-adopt hover-adopt-sub", false);

    render();
    logyq.treeManager.layoutAndRender(false);

    // Keep your “drop under pointer” behavior
    const current = d3.zoomTransform(elements.svg.node());
    const s = current.k || 1;
    const rx = state.root.x, ry = state.root.y;
    const tx = drop.px - s * rx, ty = drop.py - s * ry;
    elements.svg.call(state.zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(s));
    return;
  }

  // --- CASE 2: make a new root above existing root ---
  if (drop.type === 'rootAbove' && state.root) {
    const prev = utils.deepClone(state.root.data);
    const newRoot = { name: words[0], children: [prev] };
    utils.assignUids(newRoot);

    if (words.length > 1) {
      for (const nm of words.slice(1)) {
        const c = { name: nm }; utils.assignUids(c); newRoot.children.push(c);
      }
    }

    removeFromBank(words);
    logyq.history.pushHistory({ type: 'replace-root', prev });

    state.root = d3.hierarchy(newRoot);
    utils.assignIds(state.root);

elements.caretDot.style('opacity', 0);
d3.selectAll("g.node").classed("drop-target hover-adopt hover-adopt-sub", false);

    render();
    logyq.treeManager.layoutAndRender(false);
    return;
  }





  // --- CASE 3: drop between siblings (gap) ---
  if (drop.type === 'gap') {
    const parent = utils.findByUid(state.root.data, drop.parentUid);
    if (!parent) return;

    parent.children = parent.children || [];

    // insertion index based on neighbor uids
    const findIdx = (arr, uid) => Array.isArray(arr) ? arr.findIndex(c => c && c._uid === uid) : -1;
    let insertAt = parent.children.length;
    const pIdx = findIdx(parent.children, drop.prevUid);
    const nIdx = findIdx(parent.children, drop.nextUid);
    if (nIdx !== -1) insertAt = nIdx;
    if (pIdx !== -1) insertAt = pIdx + 1;

    const parentPath = utils.pathToUid(state.root.data, parent._uid);

    words.forEach((nm, i) => {
      const node = { name: nm }; utils.assignUids(node);
      parent.children.splice(insertAt + i, 0, node);
      logyq.history.pushHistory({ type: 'add', parentPath, uid: node._uid, index: insertAt + i });
    });

    removeFromBank(words);
    utils.assignUids(state.root.data);
    state.root = d3.hierarchy(state.root.data);
    utils.assignIds(state.root);

elements.caretDot.style('opacity', 0);
d3.selectAll("g.node").classed("drop-target hover-adopt hover-adopt-sub", false);

    render();
    logyq.treeManager.layoutAndRender(false);
    return;
  }

  // --- CASE 4: drop onto a node (append as children) ---
  if (drop.type === 'node') {
    const target = utils.findByUid(state.root.data, drop.targetUid);
    if (!target) return;

    target.children = target.children || [];
    const parentPath = utils.pathToUid(state.root.data, target._uid);

    words.forEach(nm => {
      const node = { name: nm }; utils.assignUids(node);
      target.children.push(node);
      logyq.history.pushHistory({
        type: 'add',
        parentPath,
        uid: node._uid,
        index: (target.children.length - 1)
      });
    });

    removeFromBank(words);
    utils.assignUids(state.root.data);
    state.root = d3.hierarchy(state.root.data);
    utils.assignIds(state.root);

elements.caretDot.style('opacity', 0);
d3.selectAll("g.node").classed("drop-target hover-adopt hover-adopt-sub", false);

    render();
    logyq.treeManager.layoutAndRender(false);
  }
});

  attach('wordDock', {
    clearChipSelection,
    getSelectedChipNames,
    render,
    addWords,
    parseGIQ,
    normalizeToTree,
  });
