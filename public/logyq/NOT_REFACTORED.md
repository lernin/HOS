# LOGYQ areas not refactored

These were inspected and left as copied v161 behavior. Changing them is likely to alter selection, drag, keyboard, Mix, or persistence even if the new code looks cleaner.

## Engine internals

- **`dragManager` drop cases** (subtree / solo / group, Trash, root-above). Order of detector priority and fallbacks is load-bearing. Group+rootAbove is still explicitly unsupported. Drag inlines its own top-level-selection filter instead of calling `topLevelSelection`. `window.DRAG_SLOP_PX || 10` is the live slop check; the unused `const DRAG_SLOP_PX` in tree-ops was deleted.
- **Detector geometry** (`Detectors.build` / `pick`). Pixel overlap, cousin/sibling thresholds, and overlay flags are tuned empirically.
- **`keyDispatcher` plus extra capture listeners** (V-hold, Shift+I/J/K/L, Tab-hold, Dock Shift+A). Duplicate handlers and capture/bubble order are part of the product. V-hold (`onVHoldDown`/`onVHoldMove`/`onVHoldUp`) and G/paste (`onGroupHotkeys`) still *register* from `10-selection.js` as bubble-phase window listeners; `keyDispatcher` (document capture) bails while `state.vHold` is set and must not `stopPropagation` on that bail. Unshifted W now cycles the dock from `keyDispatcher` via `logyq.dock.cycleDockSide` (the extra window-capture W listener is gone). Relative-create Shift+I/J/K/L is one capture listener (`onRelativeCreateHotkeys`) instead of four. `logyq.selection.getSelectedUid` is the one selection helper; keyboard copies are gone. Relative-create opens via `logyq.editing.openNodeEditor`. `treeManager.initialize` binds `logyq.keyboard?.keyDispatcher` at event time because boot runs before `attach('keyboard')`. File-level Tab-hold remains.
- **Dock hide is CSS-class only.** `logyq.dock.setSide` / `cycleDockSide` apply `dock-left` / `dock-hidden`. `#Dock.dock-hidden { display: none !important }` is the hide. `toggleVisibility` (`style.display`) and the unreachable Shift+W WordBank-to-trash branch were deleted. Shift+W is a no-op.
- **Sticky-nav `setSelectionSet`.** The nav-key listener in `09-editing.js` still calls `setSelectionSet(merged)` inside try/catch. That helper was never defined in v161, so sticky restore throws and `checkMoatAndAutoFit('kbd')` in the same try does not run. Left as copied behavior.
- **Two Escape listeners.** Purple Esc in `09-editing.js` clears group+focus; `keyDispatcher` Esc closes the inline editor. Order and the “editor-open, skip group clear” guard are load-bearing.
- **`caretXYFromHit` stacked edgeSibling patches.** The first nextUid/prevUid return wins; the later parent-edge formula only runs when those uids are missing. Duplicate cousin comments are unchanged.
- **`insertNodeAtDrop` / `removeNode` live in the selection fragment.** Drag now calls them through `logyq.selection`; they were not moved into `12-tree-ops.js`.
- **Deletion helpers inline their own top-level-selection filter** rather than calling `topLevelSelection`. `deleteSelectedNodeOnly` does not call `layoutAndRender`; the T-key handler and drag trash path do that after.
- **Two `dropSelectedToWordBank` implementations.** The commented "Maybe broken?" copy was deleted. One live implementation remains and reads through `logyq`.
- **Suppressed SVG double-click.** The node `dblclick` bind is gone. A capture mute still swallows SVG double-clicks; do not unmute it. Phone edit is v162 pointer double-tap → `editSelected()`, or keyboard `E`.
- **Help text vs code mismatches** (Ctrl vs Shift, double-click rename). Comments and help HTML are unchanged.
- **Lane geometry is live; lane *chrome* is gone.** `laneYForDepth` / `laneHeightForDepth` still size detectors. `refreshLaneOnZoom` is a no-op that zoom still calls. The swim-lane pin button never existed in LOGYQ HTML, so `showLaneAtY` / `hideLane` were deleted. `LabelWrap` measures via a hidden overlay text node and falls back to `length * 8` if SVG measure throws.
- **V-hold structure moves** clone the whole tree (`replace-root` undo), ignore the group set, and always call `logyq.camera.checkMoatAndAutoFit('vhold')`. Dead `__getSelectedUidSingle` / `__swapWithinParent` / `__groupsAtDepthOrderedByX` / `__reparentToAdjacentGroup` helpers were removed.
- **Mix (`randomizeTree`)** and its undo snapshot, including Word Dock include/clear rules. Context-menu dumps still call `addWords(names.join('\n'), 'bank')`; Word Dock splits on commas/semicolons, not newlines. Unused `onNodeLeftDown` / `onNodeRightButtonDown` / `flyToXY` were deleted. Engine local-maps `prompt` UI was deleted; Trees opens the preview library.
- **PNG/SVG export** (`PngExport` and export modal wiring).
- **`dataManager` is sample-tree only.** `generateTree(30)` is the boot payload. Engine prompt-maps helpers are gone; Trees opens the preview library (`logyq_maps_v1`).
- **D3 loaded from jsDelivr.** Offline boot is still not guaranteed; tests stub the CDN.

## Preview / persistence

- **Device map library.** Autosave, list, open, rename, and delete use `localStorage.logyq_maps_v1`. The Maps dialog still looks like v161; it no longer talks to production.
- **Voice PIN only.** `getPin` remains for `/api/transcribe`. It uses `logyq_lab_pin_v1`, not `logiq_lab_pin_v1`.
- **Autosave debounce.** 850ms write delay and 1100ms retry-on-overlap are unchanged. Offline now means a localStorage write failed, not a missing network.
- **Phone shell CSS.** Compact phone header CSS lives in `index.html` (`#logyq-phone-boot`) and `css/app.css` so the fat desktop header cannot paint first. `injectStyles` still adds the rest of the preview chrome. DOM ids stay `logiq-*` so copied selectors match.
- **v162 mobile grammar on `/logyq/`.** Direct flick, 280ms hold-drag, 360ms double-tap, and tap-to-MIC on a blank card live in `05-v162-gestures.js` and call `LOGYQBridge`. Spawn-puck DOM, old canvas tap-capture, and the bottom arrow bar are gone. Header-mic voice remains in `04-gestures.js`. Do not unmute SVG `dblclick`. Flick must not auto-record. Finger hold-drag must ghost the origin branch in place (do not collapse `is-others`). The **moving** visual is an SVG clone of only the held card. Latch pans the map north 1.45cm (`LATCH_MAP_SHIFT`); the clone stays under the finger. Edge auto-pan is preview-only. Desktop mouse drag stays unoffset. Magnetic drop-target/caret is the engine’s existing indicator — do not restyle it from the overlay. Phone edit flies via `flyEditFocusToUID` and restores `prevZoom` unless the user pinched. Hold-drag banks a node only after a **480ms dwell on the inner chip**. Right/left-handed settings were removed.
- **Phone chrome is still the compact v161 mobile header.** The markup now lives in `index.html` so first paint is already compact; panel/modals are still injected. Full chrome redesign is out of scope.
- **Not ported from later labs:** pull-to-copy, Working Lock, drag-watchdog, clutch two-hand.
- **Engine local-maps `prompt` UI is gone.** Trees opens the preview library (`logyq_maps_v1`). Do not resurrect `saveCurrentMap` / `openMapsMenu`.

## Extraction method (intentional)

Fragments still concatenate into the original IIFEs. A `logyq` API bag now holds shared objects; extracted clusters take dependencies from that bag. They are not yet independently imported ES modules. Detector `build`/`pick`/`draw` read `logyq.config` / `logyq.state` / `logyq.elements`; geometry formulas were not rewritten. History, settings, first-card import, and the bridge call `logyq.treeManager` for layout/fit. `attach('keyboard')` is semicolon-terminated so the following `18-bridge.js` IIFE is not parsed as `attach(...)()`.
