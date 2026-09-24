  /* ======================= CHIPS & INPUT ======================= */
  // Tap order. The first name tapped is the parent when a multi-select
  // starts an empty canvas. Render rebuilds the chips, so this lives here.
  let chipOrder = []

  const WAREHOUSE_KEY = 'logyq_word_warehouse_v1'

  function phoneShelf(){
    try {
      if (typeof document !== 'undefined' && document.body?.classList?.contains('logyq-mobile-v162')) return true
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
      return !!window.matchMedia('((max-width:700px)),((pointer:coarse) and (max-width:1200px)),((hover:none) and (max-width:1200px))').matches
    } catch (_error) {
      return false
    }
  }

  // Portrait shelf pans on x. Landscape shelf pans on y. Desktop keeps the old down-delete.
  function shelfScrollAxis(){
    if (!phoneShelf()) return null
    try {
      if (typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        && window.matchMedia('(orientation: landscape)').matches) return 'y'
    } catch (_error) {}
    return 'x'
  }

  function warehouseMapKey(){
    try {
      const id = window.LOGYQPreview?.app?.current?.id
      return id ? String(id) : '_draft'
    } catch (_error) {
      return '_draft'
    }
  }

  function readWarehouseStore(){
    try {
      const raw = globalThis.localStorage?.getItem(WAREHOUSE_KEY)
      const parsed = raw ? JSON.parse(raw) : {}
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch (_error) {
      return {}
    }
  }

  function warehouseNameSet(){
    const list = readWarehouseStore()[warehouseMapKey()]
    const names = Array.isArray(list) ? list : []
    return new Set(names.map((name) => String(name || '').trim()).filter(Boolean))
  }

  function writeWarehouseSet(set){
    try {
      const store = readWarehouseStore()
      const bank = new Set((logyq.state.wordBank || []).map((name) => String(name || '').trim()).filter(Boolean))
      const next = []
      set.forEach((name) => { if (bank.has(name)) next.push(name) })
      store[warehouseMapKey()] = next
      globalThis.localStorage?.setItem(WAREHOUSE_KEY, JSON.stringify(store))
    } catch (_error) {}
  }

  function chipNamesInBank(){
    const all = (logyq.state.wordBank || []).map(w => String(w || '').trim()).filter(Boolean)
    if (!phoneShelf()) return all
    const hidden = warehouseNameSet()
    return all.filter((name) => !hidden.has(name))
  }

  function storeWordsInWarehouse(words){
    const set = warehouseNameSet()
    ;(words || []).forEach((word) => {
      const name = String(word || '').trim()
      if (name) set.add(name)
    })
    writeWarehouseSet(set)
    const drop = new Set((words || []).map((word) => String(word || '').trim()))
    chipOrder = chipOrder.filter((name) => !drop.has(name))
    render()
    try { window.LOGYQBridge?.notifyChange?.() } catch (_error) {}
  }

  function releaseWordsFromWarehouse(words){
    const set = warehouseNameSet()
    let changed = false
    ;(words || []).forEach((word) => {
      const name = String(word || '').trim()
      if (name && set.delete(name)) changed = true
    })
    if (changed) writeWarehouseSet(set)
    return changed
  }

  function toggleWarehouseWord(name){
    const clean = String(name || '').trim()
    if (!clean) return
    const set = warehouseNameSet()
    if (set.has(clean)) set.delete(clean)
    else set.add(clean)
    writeWarehouseSet(set)
    if (set.has(clean)) chipOrder = chipOrder.filter((item) => item !== clean)
    render()
    renderWarehouseList()
  }

  function renderWarehouseList(){
    const list = typeof document !== 'undefined' ? document.getElementById('logyq-warehouse-list') : null
    if (!list) return
    const hidden = warehouseNameSet()
    const words = (logyq.state.wordBank || []).map((word) => String(word || '').trim()).filter(Boolean)
    list.replaceChildren()
    if (!words.length) {
      const empty = document.createElement('p')
      empty.className = 'logyq-warehouse-empty'
      empty.textContent = 'No words in the bank yet.'
      list.appendChild(empty)
      return
    }
    words.forEach((name) => {
      const onShelf = !hidden.has(name)
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'chip logyq-warehouse-term' + (onShelf ? ' is-on' : '')
      button.setAttribute('aria-pressed', onShelf ? 'true' : 'false')
      button.dataset.word = name
      button.textContent = name
      button.addEventListener('click', () => toggleWarehouseWord(name))
      list.appendChild(button)
    })
  }

  // Warehouse control shows when something is stored. A full shelf with an
  // empty warehouse stays hidden; chip drag still reveals the corner so the
  // first word can be stored. Curriculum play hides it in CSS either way.
  function sendAllToWarehouse(){
    if (document.body?.classList?.contains('logyq-curriculum')) return
    const words = chipNamesInBank()
    if (!words.length) return
    storeWordsInWarehouse(words)
    renderWarehouseList()
  }

  function syncSendAllButton(){
    const sendAll = document.getElementById('logyq-warehouse-send-all')
    if (!sendAll) return
    const waiting = chipNamesInBank()
    sendAll.disabled = waiting.length === 0
    sendAll.setAttribute('aria-label', waiting.length
      ? `Send all ${waiting.length} Word Bank chips into the warehouse`
      : 'Send all Word Bank chips into the warehouse')
  }

  function syncShelfChrome(){
    if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return
    const warehouse = document.getElementById('logyq-warehouse')
    const dock = typeof document.getElementById === 'function' ? document.getElementById('Dock') : null
    const curriculum = !!document.body?.classList?.contains('logyq-curriculum')
    const stored = warehouseNameSet().size
    const onBar = chipNamesInBank().length
    const shelfClear = !curriculum && stored > 0 && onBar === 0
    if (warehouse) {
      warehouse.classList.toggle('is-bank-empty', curriculum || stored === 0)
      warehouse.classList.toggle('is-shelf-clear', shelfClear)
      warehouse.title = shelfClear ? 'Word Bank is in the warehouse' : 'Warehouse'
    }
    if (dock) dock.classList.toggle('is-empty', onBar === 0)
    syncSendAllButton()
  }

  function bankScroller(){
    return document.getElementById('logyq-bank-chips') || logyq.elements.Dock
  }

  function openWarehouseSheet(){
    const sheet = document.getElementById('logyq-warehouse-sheet')
    if (!sheet) return
    renderWarehouseList()
    sheet.hidden = false
    sheet.classList.add('is-open')
    sheet.setAttribute('aria-hidden', 'false')
  }

  function closeWarehouseSheet(){
    const sheet = document.getElementById('logyq-warehouse-sheet')
    if (!sheet) return
    sheet.hidden = true
    sheet.classList.remove('is-open')
    sheet.setAttribute('aria-hidden', 'true')
    render()
  }

  function pruneChipOrder(){
    const bank = chipNamesInBank()
    const seen = new Set()
    chipOrder = chipOrder.filter((name) => {
      if (!name || seen.has(name) || !bank.includes(name)) return false
      seen.add(name)
      return true
    })
  }

  function everyChipSelected(){
    const bank = chipNamesInBank()
    if (!bank.length) return false
    const selected = new Set(chipOrder)
    return bank.every((name) => selected.has(name))
  }

  function paintChipSelection(){
    pruneChipOrder()
    const selected = new Set(chipOrder)
    document.querySelectorAll('#Dock .chip').forEach((el) => {
      el.classList.toggle('is-outlined', selected.has(el.textContent.trim()))
    })
    const button = typeof document.getElementById === 'function' ? document.getElementById('logyq-bank-all') : null
    if (button) button.textContent = everyChipSelected() ? 'None' : 'All'
  }

  function clearChipSelection(){
    chipOrder = []
    paintChipSelection()
  }

  function getSelectedChipNames(){
    pruneChipOrder()
    return chipOrder.slice()
  }

  function toggleChipName(name){
    const clean = String(name || '').trim()
    if (!clean || !chipNamesInBank().includes(clean)) return
    const index = chipOrder.indexOf(clean)
    if (index >= 0) chipOrder.splice(index, 1)
    else chipOrder.push(clean)
    paintChipSelection()
  }

  function flipBankSelection(){
    if (everyChipSelected()) chipOrder = []
    else {
      const seen = new Set()
      chipOrder = chipNamesInBank().filter((name) => {
        if (seen.has(name)) return false
        seen.add(name)
        return true
      })
    }
    paintChipSelection()
  }

  function render(){
    const { state, elements, utils } = logyq
    const list = elements.Dock
    list.innerHTML = ''
    // Word Bank bar: chips scroll in their own strip. All stays pinned outside it.
    const strip = document.createElement('div')
    strip.id = 'logyq-bank-chips'
    const hidden = phoneShelf() ? warehouseNameSet() : null
    state.wordBank.forEach((w)=>{
      const shelfName = String(w || '').trim()
      if (!shelfName || (hidden && hidden.has(shelfName))) return
      const chip = document.createElement('div');
      chip.className='chip'; chip.textContent=w;
      // Native HTML5 drag cancels the pointer as soon as it moves, so a
      // finger never finishes the gesture. Press-drag below places the chip.
      chip.draggable=false;
      chip.addEventListener('click',()=>{
        if (chip.dataset.skipClick === '1') return
        toggleChipName(w)
      });
      chip.addEventListener('dragstart',(e)=>{
        state.chipDrag.active = true;
        const group = getSelectedChipNames()
        const words = group.includes(w) ? group.slice() : [w]
        state.chipDrag.words = words;
        state.chipDrag.word = w; // keep old field for compatibility
        state.chipDrag.drop = null;
        e.dataTransfer.setData('text/plain', words.join(', '));
        e.dataTransfer.effectAllowed = 'copyMove';
});

chip.addEventListener('dragend', () => endChipDragVisuals());

      chip.addEventListener("contextmenu", (e) => {e.preventDefault();
        e.stopPropagation();
        if (document.body.classList.contains('logyq-game')) return;
        const sel = Array.from((state.selectedUids || new Set()).values());
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
      strip.appendChild(chip);
    });
    list.appendChild(strip);
    if (chipNamesInBank().length) {
      const allButton = document.createElement('button');
      allButton.type = 'button';
      allButton.id = 'logyq-bank-all';
      allButton.className = 'chip-bank-all';
      allButton.textContent = everyChipSelected() ? 'None' : 'All';
      allButton.ariaLabel = allButton.textContent === 'None' ? 'Clear Word Bank selection' : 'Select every Word Bank chip';
      allButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        flipBankSelection();
        allButton.ariaLabel = allButton.textContent === 'None' ? 'Clear Word Bank selection' : 'Select every Word Bank chip';
      });
      list.appendChild(allButton);
    }
    paintChipSelection();
    syncShelfChrome();
  }

  function addWords(raw, to){
    const { state, utils } = logyq
    if (typeof curriculumPlayLocked === 'function' && curriculumPlayLocked()) return;
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
    state.wordBank.push(...words); releaseWordsFromWarehouse(words); render();
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





































function endChipDragVisuals() {
  const { state, elements } = logyq
  elements.caretDot.style('opacity', 0)
  d3.selectAll('g.node').classed('drop-target hover-adopt hover-adopt-sub', false)
  state.chipDrag.active = false
  state.chipDrag.words = []
  state.chipDrag.word = null
  state.chipDrag.drop = null
  elements.trash.classList.remove('open', 'over', 'wiggle', 'near')
  document.getElementById('logyq-chip-ghost')?.remove()
  document.querySelectorAll('#Dock .chip.is-lifting').forEach((el) => el.classList.remove('is-lifting'))
  document.body.classList.remove('logyq-chip-drag')
  document.getElementById('logyq-bank-trash')?.classList.remove('is-over', 'over', 'wiggle')
  document.getElementById('logyq-warehouse')?.classList.remove('is-over')
}

// Press-drag for a finger or a mouse. The dock is a scroll container, so a
// chip has to claim the gesture itself; native drag cancels the pointer.
function bindChipPointerPlace() {
  const dock = logyq.elements.Dock
  if (!dock || typeof dock.addEventListener !== 'function' || dock.dataset?.chipPointer === '1') return
  dock.dataset.chipPointer = '1'
  let session = null

  const overDock = (x, y) => {
    if (dock.classList.contains('dock-hidden')) return false
    const style = getComputedStyle(dock)
    if (style.display === 'none' || style.visibility === 'hidden') return false
    const rect = dock.getBoundingClientRect()
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
  }

  const placeGhost = (words, x, y) => {
    let stack = document.getElementById('logyq-chip-ghost')
    if (!stack) {
      stack = document.createElement('div')
      stack.id = 'logyq-chip-ghost'
      document.body.appendChild(stack)
    }
    const label = words.join('\n')
    if (stack.dataset.words !== label) {
      stack.dataset.words = label
      stack.replaceChildren(...words.map((word) => {
        const ghost = document.createElement('div')
        ghost.className = 'chip'
        ghost.textContent = word
        ghost.style.opacity = '0.55'
        return ghost
      }))
    }
    stack.style.left = `${x}px`
    stack.style.top = `${y}px`
  }

  // The ghost is lifted above the finger by CSS. Aim at that card, not the touch.
  const raisedGhostPoint = (x, y) => {
    const stack = document.getElementById('logyq-chip-ghost')
    const rect = stack?.getBoundingClientRect?.()
    if (!rect || rect.width < 1 || rect.height < 1) return { x, y }
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  }

  const hoverMap = (x, y) => {
    const svg = logyq.elements.svg.node()
    if (!svg) return
    if (overDock(x, y)) {
      logyq.state.chipDrag.drop = null
      logyq.elements.caretDot.style('opacity', 0)
      d3.selectAll('g.node').classed('drop-target hover-adopt hover-adopt-sub', false)
      return
    }
    const aim = raisedGhostPoint(x, y)
    svg.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, clientX: aim.x, clientY: aim.y }))
  }

  const chipUnderPoint = (x, y) => {
    if (typeof document.elementsFromPoint !== 'function') return null
    const stack = document.elementsFromPoint(x, y) || []
    for (const el of stack) {
      const chip = el?.closest?.('.chip')
      if (!chip || !dock.contains(chip) || chip.id === 'logyq-bank-all') continue
      return chip
    }
    return null
  }

  dock.addEventListener('pointerdown', (event) => {
    if (event.button != null && event.button !== 0) return
    const direct = event.target?.closest?.('.chip')
    const chip = chipUnderPoint(event.clientX, event.clientY) || direct
    if (!chip || !dock.contains(chip) || chip.id === 'logyq-bank-all') return
    const rect = chip.getBoundingClientRect?.()
    if (rect && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) return
    const word = chip.textContent.trim()
    if (!word) return
    session = { pointerId: event.pointerId, word, x: event.clientX, y: event.clientY, dragging: false, chip }
  })

  const swipeWords = (word) => {
    const selected = getSelectedChipNames()
    // A down-swipe on a selected chip deletes the whole selection. Otherwise just that chip.
    return selected.includes(word) ? selected.slice() : [word]
  }

  const removeBankWords = (words) => {
    const drop = new Set((words || []).map((word) => String(word || '').trim()).filter(Boolean))
    if (!drop.size) return false
    const prevBank = logyq.state.wordBank.slice()
    const next = prevBank.filter((word) => !drop.has(String(word || '').trim()))
    if (next.length === prevBank.length) return false
    logyq.history.pushHistory({ type: 'bank-delete', prevBank })
    logyq.state.wordBank = next
    writeWarehouseSet(warehouseNameSet())
    render()
    try { window.LOGYQBridge?.notifyChange?.() } catch (_error) {}
    return true
  }

  const beginLift = (words) => {
    logyq.state.chipDrag.active = true
    logyq.state.chipDrag.words = words
    logyq.state.chipDrag.word = words[0]
    logyq.state.chipDrag.drop = null
    session.dragging = true
    session.words = words
    window.__logyqChipPlacing = true
    document.body.classList.add('logyq-chip-drag')
    document.querySelectorAll('#Dock .chip').forEach((el) => {
      el.classList.toggle('is-lifting', words.includes(el.textContent.trim()))
    })
  }

  const cornerHit = (el, x, y) => {
    if (!el || !phoneShelf()) return false
    const style = getComputedStyle(el)
    if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') return false
    const rect = el.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) return false
    const aim = raisedGhostPoint(x, y)
    const pad = 10
    const hit = (px, py) => px >= rect.left - pad && px <= rect.right + pad && py >= rect.top - pad && py <= rect.bottom + pad
    return hit(x, y) || hit(aim.x, aim.y)
  }

  // Finger still on the shelf cancels. The ghost alone must not warehouse or trash.
  const cornerUnderFinger = (x, y) => {
    if (overDock(x, y)) return null
    const trash = document.getElementById('logyq-bank-trash')
    const warehouse = document.getElementById('logyq-warehouse')
    const trashOn = cornerHit(trash, x, y)
    const houseOn = !trashOn && cornerHit(warehouse, x, y)
    trash?.classList.toggle('is-over', trashOn)
    trash?.classList.toggle('over', trashOn)
    warehouse?.classList.toggle('is-over', houseOn)
    if (trashOn) return 'trash'
    if (houseOn) return 'warehouse'
    return null
  }

  window.addEventListener('pointermove', (event) => {
    if (!session || event.pointerId !== session.pointerId) return
    const dx = event.clientX - session.x
    const dy = event.clientY - session.y
    const moved = Math.hypot(dx, dy) >= 10
    if (!session.dragging && !session.deleting && !session.panning) {
      // Claim the gesture while the finger is still on the chip. Waiting
      // until it has left the dock lets the browser cancel the pointer first.
      if (document.body.classList.contains('logyq-game')) {
        if (Math.hypot(dx, dy) < 6) return
        beginLift([session.word])
        try { session.chip.setPointerCapture(event.pointerId) } catch (_error) {}
      } else if (!moved) return
      else {
      const axis = shelfScrollAxis()
      if (axis === 'x') {
        // Portrait: only an upward drag lifts. Horizontal movement pans the shelf.
        if (dy < 0 && Math.abs(dy) > Math.abs(dx)) beginLift(swipeWords(session.word))
        else session.panning = true
      } else if (axis === 'y') {
        // Landscape: only a rightward drag lifts. Vertical movement pans the shelf.
        if (dx > 0 && Math.abs(dx) > Math.abs(dy)) beginLift(swipeWords(session.word))
        else session.panning = true
      } else if (dy > 0 && dy >= Math.abs(dx)) {
        // Desktop: down stays a delete. Up and out still lift the chip onto the map.
        session.deleting = true
        session.words = swipeWords(session.word)
      } else {
        beginLift(swipeWords(session.word))
      }
      try { session.chip.setPointerCapture(event.pointerId) } catch (_error) {}
      }
    }
    if (session.panning) {
      const axis = shelfScrollAxis()
      const prevX = session.lastX ?? session.x
      const prevY = session.lastY ?? session.y
      const scroller = bankScroller()
      if (axis === 'y') scroller.scrollTop -= event.clientY - prevY
      else scroller.scrollLeft -= event.clientX - prevX
      session.lastX = event.clientX
      session.lastY = event.clientY
      event.preventDefault()
      return
    }
    if (session.deleting) {
      event.preventDefault()
      return
    }
    event.preventDefault()
    placeGhost(session.words, event.clientX, event.clientY)
    const corner = cornerUnderFinger(event.clientX, event.clientY)
    if (corner) {
      logyq.state.chipDrag.drop = null
      logyq.elements.caretDot.style('opacity', 0)
      d3.selectAll('g.node').classed('drop-target hover-adopt hover-adopt-sub', false)
      return
    }
    hoverMap(event.clientX, event.clientY)
  }, { passive: false })

  const finishPointer = (event, commit) => {
    if (!session || event.pointerId !== session.pointerId) return
    const dragging = session.dragging
    const deleting = session.deleting
    const panning = session.panning
    const chip = session.chip
    const word = session.word
    const words = session.words
    const dx = event.clientX - session.x
    const dy = event.clientY - session.y
    session = null
    if (panning) {
      event.preventDefault()
      event.stopPropagation()
      if (chip) {
        chip.dataset.skipClick = '1'
        window.setTimeout(() => { delete chip.dataset.skipClick }, 0)
      }
      return
    }
    if (deleting) {
      event.preventDefault()
      event.stopPropagation()
      if (chip) {
        chip.dataset.skipClick = '1'
        window.setTimeout(() => { delete chip.dataset.skipClick }, 0)
      }
      if (commit && dy >= 36 && dy >= Math.abs(dx)) removeBankWords(words)
      return
    }
    if (!dragging) {
      if (commit && chip && word) {
        chip.dataset.skipClick = '1'
        toggleChipName(word)
        window.setTimeout(() => { delete chip.dataset.skipClick }, 0)
      }
      return
    }
    event.preventDefault()
    event.stopPropagation()
    const corner = commit && !document.body.classList.contains('logyq-game')
      ? cornerUnderFinger(event.clientX, event.clientY)
      : null
    if (corner === 'trash') {
      removeBankWords(words)
    } else if (corner === 'warehouse') {
      storeWordsInWarehouse(words)
    } else if (commit && !overDock(event.clientX, event.clientY)) {
      if (words) placeGhost(words, event.clientX, event.clientY)
      const aim = raisedGhostPoint(event.clientX, event.clientY)
      hoverMap(event.clientX, event.clientY)
      logyq.elements.svg.node()?.dispatchEvent(new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        clientX: aim.x,
        clientY: aim.y,
      }))
    }
    endChipDragVisuals()
    window.setTimeout(() => { window.__logyqChipPlacing = false }, 400)
  }

  window.addEventListener('pointerup', (event) => finishPointer(event, true))
  window.addEventListener('pointercancel', (event) => finishPointer(event, false))
  bindShelfChrome()
}

function bindShelfChrome(){
  const warehouse = document.getElementById('logyq-warehouse')
  const sheet = document.getElementById('logyq-warehouse-sheet')
  if (!warehouse || warehouse.dataset.bound === '1') return
  warehouse.dataset.bound = '1'
  warehouse.addEventListener('click', (event) => {
    if (window.__logyqChipPlacing) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    openWarehouseSheet()
  })
  document.getElementById('logyq-warehouse-close')?.addEventListener('click', () => closeWarehouseSheet())
  document.getElementById('logyq-warehouse-send-all')?.addEventListener('click', () => sendAllToWarehouse())
  sheet?.addEventListener('click', (event) => {
    if (event.target === sheet) closeWarehouseSheet()
  })
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && sheet?.classList.contains('is-open')) closeWarehouseSheet()
  })
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
  // Normal maps keep the historical behavior. LOGYQ Game explicitly allows
  // a loose puzzle card to become the new root when its physical edge fits.
  state.chipDrag.drop = window.__logyqGameBankNode ? { type: 'rootAbove' } : null
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

  const makeNode = (word) => {
    const gameNode = window.__logyqGameBankNode?.(word)
    const node = gameNode ? { ...gameNode } : { name: word }
    utils.assignUids(node)
    return node
  }
  if (window.__logyqGameBankDropAllowed &&
      !window.__logyqGameBankDropAllowed({ tree: state.root?.data, words, drop })) return;

  const removeFromBank = (list) => {
    list.forEach(w => {
      const i = state.wordBank.indexOf(w);
      if (i > -1) state.wordBank.splice(i, 1);
    });
  };

  // --- CASE 1: create a new root at pointer (empty canvas) ---
  if (drop.type === 'newRootAt') {
    const rootNode = makeNode(words[0]);

    if (words.length > 1) {
      rootNode.children = words.slice(1).map(nm => {
        return makeNode(nm);
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

    // Keep your “drop under pointer” behavior. Game keeps the fitted camera.
    if (!(typeof gameCameraLocked === 'function' && gameCameraLocked())) {
    const current = d3.zoomTransform(elements.svg.node());
    const s = current.k || 1;
    const rx = state.root.x, ry = state.root.y;
    const tx = drop.px - s * rx, ty = drop.py - s * ry;
    elements.svg.call(state.zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(s));
    }
    return;
  }

  // --- CASE 2: make a new root above existing root ---
  if (drop.type === 'rootAbove' && state.root) {
    const prev = utils.deepClone(state.root.data);
    const newRoot = makeNode(words[0]);
    newRoot.children = [prev];

    if (words.length > 1) {
      for (const nm of words.slice(1)) {
        const c = makeNode(nm); newRoot.children.push(c);
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
      const node = makeNode(nm);
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
      const node = makeNode(nm);
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

  bindChipPointerPlace()

  attach('wordDock', {
    clearChipSelection,
    getSelectedChipNames,
    flipBankSelection,
    render,
    addWords,
    parseGIQ,
    normalizeToTree,
  });
