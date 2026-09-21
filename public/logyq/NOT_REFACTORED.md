# LOGYQ areas not refactored

These were inspected and left as copied v161 behavior. Changing them is likely to alter selection, drag, keyboard, Mix, or persistence even if the new code looks cleaner.

## Engine internals

- **`dragManager` drop cases** (subtree / solo / group, Trash, root-above). Order of detector priority and fallbacks is load-bearing. Group+rootAbove is still explicitly unsupported. Drag inlines its own top-level-selection filter instead of calling `topLevelSelection`. `window.DRAG_SLOP_PX || 10` is the live slop check; the `const DRAG_SLOP_PX` in `12-tree-ops.js` is not assigned to `window` and is unused by drag.
- **Detector geometry** (`Detectors.build` / `pick`). Pixel overlap, cousin/sibling thresholds, and overlay flags are tuned empirically.
- **`keyDispatcher` plus extra capture listeners** (V-hold, Shift+I, Tab-hold, Dock Shift+A). Duplicate handlers and capture/bubble order are part of the product. V-hold, G/Shift+G, and V-paste still register from `10-selection.js`, not `17-keyboard.js`. Four copies of `getSelectedUid` remain; the last declaration wins. Relative-create helpers still check `window.startInlineEdit` / `window.flyCenterToUID` / `window.zoomToNodeCenter`, which are not assigned, so they fall through to `openNodeEditor`.
- **Unreachable Shift+W clear-WordBank branch.** The earlier `W` handler returns first. Documented v161 mismatch; not “fixed.”
- **Sticky-nav `setSelectionSet`.** The nav-key listener in `09-editing.js` still calls `setSelectionSet(merged)` inside try/catch. That helper was never defined in v161, so sticky restore throws and `checkMoatAndAutoFit('kbd')` in the same try does not run. Left as copied behavior.
- **Two Escape listeners.** Purple Esc in `09-editing.js` clears group+focus; `keyDispatcher` Esc closes the inline editor. Order and the “editor-open, skip group clear” guard are load-bearing.
- **`caretXYFromHit` stacked edgeSibling patches.** The first nextUid/prevUid return wins; the later parent-edge formula only runs when those uids are missing. Duplicate cousin comments are unchanged.
- **`insertNodeAtDrop` / `removeNode` live in the selection fragment.** Drag now calls them through `logyq.selection`; they were not moved into `12-tree-ops.js`.
- **Deletion helpers inline their own top-level-selection filter** rather than calling `topLevelSelection`. `deleteSelectedNodeOnly` does not call `layoutAndRender`; the T-key handler and drag trash path do that after. An orphan add-child JSDoc remains at the end of `11-deletion.js`; the implementations live in `12-tree-ops.js`.
- **Two `dropSelectedToWordBank` implementations.** The later declaration wins; the earlier one is inside a “Maybe broken?” comment but the `function dropSelectedToWordBank` text is kept so source order stays identical. The live copy now reads through `logyq`; the commented copy still uses ambient names.
- **Suppressed double-click editor.** A node dblclick handler exists; a later capture listener still swallows SVG double-clicks. Keyboard `E` remains the reliable edit path.
- **Help text vs code mismatches** (Ctrl vs Shift, double-click rename). Comments and help HTML are unchanged.
- **Lane API is geometry-only.** `showLaneAtY` / `hideLane` / `refreshLaneOnZoom` are no-op stubs. Swim-lane pin still calls them. `LabelWrap` measures via a hidden overlay text node and falls back to `length * 8` if SVG measure throws.
- **Mix (`randomizeTree`)** and its undo snapshot, including Word Dock include/clear rules. Context-menu dumps still call `addWords(names.join('\n'), 'bank')`; Word Dock splits on commas/semicolons, not newlines. Duplicate Mix button `contextmenu` listeners remain. `onNodeLeftDown` / `onNodeRightButtonDown` are unused leftovers; the live node mousedown is `onNodeMouseDown` in selection. `onNodeRightButtonDown` still reads undeclared `ctrl`. `flyToXY` ignores its `duration`/`ease` arguments and hard-codes 1200ms `easeExpOut`.
- **PNG/SVG export** (`PngExport` and export modal wiring).
- **Legacy `dataManager` local maps / prompt UI.** Trees opens the preview library instead; local save helpers remain in the copied engine.
- **D3 loaded from jsDelivr.** Offline boot is still not guaranteed; tests stub the CDN.

## Preview / persistence

- **Device map library.** Autosave, list, open, rename, and delete use `localStorage.logyq_maps_v1`. The Maps dialog still looks like v161; it no longer talks to production.
- **Voice PIN only.** `getPin` remains for `/api/transcribe`. It uses `logyq_lab_pin_v1`, not `logiq_lab_pin_v1`.
- **Autosave debounce.** 850ms write delay and 1100ms retry-on-overlap are unchanged. Offline now means a localStorage write failed, not a missing network.
- **Phone shell CSS injected at runtime** (`injectStyles`), including `logiq-*` DOM ids/classes. File paths are LOGYQ; DOM ids were not renamed so the copied preview selectors stay exact.
- **Spawn-puck / voice / tap-vs-pan arbitration.** Coupled to D3 zoom, selected-card pointer-events, and `LOGYQBridge.createRelative`.

## Extraction method (intentional)

Fragments still concatenate into the original IIFEs. A `logyq` API bag now holds shared objects; extracted clusters take dependencies from that bag. They are not yet independently imported ES modules. V-hold structural moves and the D3 layout pass in `treeManager` still use ambient bindings. Detectors already register on the bag; they were not internally rewritten except to call `logyq.layout` for lane geometry. `attach('keyboard')` is semicolon-terminated so the following `18-bridge.js` IIFE is not parsed as `attach(...)()`.
