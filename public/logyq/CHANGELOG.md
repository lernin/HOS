# LOGYQ changelog (intentional experiment deltas)

LOGYQ is an isolated maintainability copy. After Wave 4, some v161 oddities were dropped on purpose so layout/structure could sit on a single `logyq` bag. Production LOGiQ is unchanged.

## Wave 4

- **One camera.** `logyq.camera` (`flyCenterToUID`, `centerOnSelected`, `checkMoatAndAutoFit`) is the recenter path. Shift+F, moat, and `treeManager.centerOnSelected` use it. The later tree-manager copies that ignored `duration` and always flew 1200ms/`easeExpOut` were removed. Recenter now honors fly config duration (`easeCubicOut`).
- **Relative-create flies.** Shift+I/J/K/L create helpers call `logyq.camera.flyCenterToUID` instead of the no-op `window.flyCenterToUID` / `window.zoomToNodeCenter` checks. The new node is framed; the editor still opens.
- **Dead V-hold helpers removed.** Unused `__getSelectedUidSingle` / `__getNodeByUid` / `__groupsAtDepthOrderedByX` / `__swapWithinParent` / `__reparentToAdjacentGroup` are gone. Live movers were already self-contained.
- **Moat is a bag call.** Structure no longer guards `typeof checkMoatAndAutoFit === 'function'` (always true in the IIFE). Vertical-down no longer redeclares `const uid`.
- **Duplicate Shift+F listener removed** from `treeManager.initialize`. `keyDispatcher` Shift+F remains.
- **Unused `enforceMoatForSelected` removed** (never called).
- **Caret fallback simplified.** `caretXYFromHit` no longer has a dead `?? (hit.y + hit.height)` after `laneYForDepth` (that helper always returns a number).
- **First-card create** no longer has a dead `else flyCenterToUID(..., { duration: 0 })` after `autoFit`.
- **Late-bound keyDispatcher.** `treeManager.initialize` binds `logyq.keyboard?.keyDispatcher` at event time so boot is not stuck with a null keyboard slot. Same dispatcher after `attach('keyboard')`.
- **Layout pass always through the bag.** History, settings gap changes, first-card comma import, Mix-reposition fit, and `LOGYQBridge` rename/load/fit call `logyq.treeManager` instead of the ambient name.
- **`autoFitSoon` always calls `logyq.treeManager.autoFit`.** The `typeof treeManager === 'function'` guard is gone (the manager exists by the time undo timers fire).

## Wave 5

- **Input and dock chrome on the bag.** `logyq.input` (`isTextField`, `keyIsNav`, `commitWordInput`, `handleAddBox`) and `logyq.dock` (`applyDockSide`, `cycleDockSide`, `updateDockBounds`). Keyboard, selection, drag, Mix leftovers, history, and tree-manager call those slots instead of ambient helpers. W-key dock cycling uses `cycleDockSide` once (no double-step).
- **Dead Mix leftovers deleted.** `onNodeLeftDown`, `onNodeRightButtonDown` (read undeclared `ctrl`), and unused `flyToXY` were never bound; live node mousedown is `selection.onNodeMouseDown`.
- **Duplicate Mix wiring deleted.** Right-click Mix now randomizes once (was twice). Duplicate save/maps click listeners removed.
- **Duplicate Add-button contextmenu deleted** from `treeManager.initialize`. `02-state.js` already commits with `forceToSelected: true`. The extra listener was re-committing an empty box and toasting "Type something first".
- **Nested initialize Tab-hold deleted.** File-level Tab-hold remains. Tab release no longer always refocuses `#wordInput` (that nested listener stole focus and would pop a mobile keyboard).
- **Commented `dropSelectedToWordBank` deleted.** One live implementation remains (last-wins already). Unused `const DRAG_SLOP_PX` in tree-ops is gone; drag still uses `window.DRAG_SLOP_PX || 10`.
- **Orphan add-child JSDoc** at the end of `11-deletion.js` is gone.
- **`toggleDock` moved to `logyq.dock.toggleVisibility`.** Shift+W still hits this (keyDispatcher `lower === 'w'` matches shift). Plain W is still intercepted by the capture cycle-side handler. Two hide mechanisms remain: CSS `dock-hidden` vs `style.display`.
- **Dead `window.startInlineEdit` checks removed.** Relative-create always opens via `logyq.editing.openNodeEditor` and clears the field (the path that already ran).
- **V-hold / G / paste named on `logyq.selection`.** Still registered from `10-selection.js` as bubble-phase window listeners. Unused `navKeys` array in that handler is gone.
- **Detectors `build`/`pick`/`draw` read CONFIG/state/elements from the bag.** Geometry formulas unchanged.
- **History `pushHistory`/`undo` destructure `logyq`.**

