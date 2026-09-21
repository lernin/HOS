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

## Harden pass (pre-mobile)

- **One dock-hide API.** `logyq.dock` is CSS-class only: `setSide` / `cycleDockSide` / `applyDockSide` / `sideLabel`. Hide is `#Dock.dock-hidden { display: none !important }`. `toggleVisibility` (`style.display`) is deleted. Unshifted W in `keyDispatcher` is the only keyboard binding; the window-capture W listener is gone. Shift+W is a no-op (the unreachable WordBank-to-trash branch and its `renderWordBank`/`renderTrash` stubs are gone rather than made live). Preview Word Dock button calls `LOGYQBridge.cycleDock()` instead of synthesizing `w`.
- **One `getSelectedUid`.** `logyq.selection.getSelectedUid` (focus, then singleton group) is the bag surface. Keyboard copies are gone. `__selectedUid` in config delegates to it. `LOGYQBridge.getSelectedUid` uses the bag (same fallback). Relative-create Shift+I/J/K/L is one capture listener (`onRelativeCreateHotkeys`) instead of four.
- **Preview gesture bag.** `window.LOGYQPreview` + `attach('gestures')` exposes preview-only input without putting it on the engine `logyq` bag.

## v162 gesture port (this branch)

- **Direct flick / hold-drag / double-tap on `/logyq/` only.** Same-page `LOGYQBridge` (not iframe `contentWindow`). Source of behavior is v162: flick 52px/340ms/1.45, hold 280ms/8px slop into existing `d3.drag()`, pointer double-tap 360ms → `editSelected()`. SVG `dblclick` stays muted.
- **Old spawn-puck + tap-capture removed.** Flick creates a blank relative and does **not** auto-record or auto-voice. Header mic still uses `startVoiceCapture()` (fills the header input only).
- **Storage stays `logyq_*`.** No production LOGiQ maps/PIN writes. Engine `logyq_saved_maps_v1` / fake `logyq_ashley_user_v1` are gone; maps live in preview `logyq_maps_v1`.
- **Deferred:** pull-to-copy, Working Lock, drag-watchdog, clutch two-hand, full mobile chrome redesign, ES modules, further bag splits.

## Ashley phone-poke fixes

- **Bottom arrow bar gone.** `#logiq-mobile-context` (← ↑ ↓ → Edit / Delete) plus its CSS and `updateContextActions` listeners were deleted. Word Dock no longer reserves 66px for that strip.
- **Canvas is full-bleed on phone.** `svg#canvas` is `position:fixed; inset:0; width:100%; height:100dvh; overflow:visible`. Trash stays hidden. Dock sits at `bottom: max(8px, env(safe-area-inset-bottom))`.
- **Pinch floor is 0.02.** Engine `d3.zoom().scaleExtent` was `[0.4, 2.4]` (v161). LOGYQ is `[0.02, 2.4]` so a phone can pinch much smaller. No working-lock script in-repo used 0.02; Ashley asked to match that looser known-good.
- **Flick shows a tap-to-MIC chip, not auto-record.** Ported from `public/logiq-v162-mobile/direct-flick.js` (`revealBlankCardAction`) + `v2.js` (`#logiq-v2-action` / `actionLoop` / `startRecording`). LOGYQ uses `#logyq-v162-action`. Flick still only `createRelative`; recording starts only if she taps MIC. Header mic still fills the type-or-speak field. After flick, `createRelative`’s `flyCenterToUID` is interrupted and the pre-flick view restored so the new card + MIC stay on-screen.

## Phone drag follow-ups (PR 112)

- **Ghost-hold restored.** Desktop `dragging-mode` still hides `is-others` (`opacity: 0`) — that is the “tree collapsed around the moving card” look. Finger hold-drag now keeps the live map in place and stamps `v2-branch-origin-ghost` on the source branch (v162 `v2-drag-visual-fix.js` / `v2-branch-affordance.js`). CSS is **not** media-query gated so a coarse-pointer miss cannot drop back to collapse. In-flight layout tweens are interrupted on latch, and origin transforms are re-stamped every feedback frame. Magnetic drop/caret CSS was left as the existing drop-target/caret path — not redesigned.
- **Edge auto-pan.** Ported from `public/logiq-v162-mobile/v2.js` `edgePan` (same math in `v2-ghost.js` and clutch). Zone 84 / quadratic step 14. Finger toward an edge pans the map the opposite way. Re-feeds drop `mousemove` at the handedness visual point.
- **Handedness drag offset.** Settings “Finger drag hand” radios + phone ⋮ “Drag hand”. Finger (not mouse) hold-drag offsets the ghost ~1.5cm up and ~1cm to the side (38px/cm → 57px / 38px). Right-handed default: up+left; left-handed: up+right. Desktop mouse drag is unchanged. Persists in `logyq_handedness_v1`.
- **Second finger yields.** A second pointer during hold-drag calls `yieldNodeDrag` (mouseup at origin) so pinch/pan can take over instead of fighting d3.drag.

## Fearless-delete wave

See `SAFE_TO_RIP.md`. Spawn-puck, retired bind no-ops, engine prompt-maps, fake user badge, never-shown Hint, unused `startInlineEdit` / `zoomToNodeCenter` / `getSelectionUids` / `copySubtreeToClipboard` / `createFirstCardAndEdit`, the muted node `dblclick` bind, the dead swim-lane pin branch plus `showLaneAtY`/`hideLane`, unused `window.__add*` create aliases, and the unread `elements.mapsBtn` field were deleted. Keyboard create/edit/drag/selection verbs remain. Zoom still calls no-op `refreshLaneOnZoom`.

