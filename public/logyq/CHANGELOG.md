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
