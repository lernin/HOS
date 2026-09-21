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
- **Handedness drag offset.** Removed. Settings radios and ⋮ “Drag hand” are gone. No `logyq_handedness_v1` UI.
- **Second finger yields.** A second pointer during hold-drag calls `yieldNodeDrag` (mouseup at origin) so pinch/pan can take over instead of fighting d3.drag.

## Phone poke revisions

- **Ghost offset retune.** Hold-drag pops **only the floating card** north by `OFFSET_UP_CM` **1.1cm** (`fingerOffset` `{0, -liftPx()}`). The map does not jump on latch, drop, cancel, or second-finger yield. `LATCH_MAP_SHIFT` / `shiftMapOnLatch` are gone.
- **Stationary hold keeps the origin ghost.** The 1.1cm lift is clone-only. d3.drag is not fed that offset until the finger leaves `STILL_PX` (16). A still hold after latch was a phantom 42px move onto the parent detector, so the origin placeholder vanished and the tree collapsed. Ghost CSS also wins over `hover-adopt-sub` / self `drop-target`. Move slow or fast: ghost stays until drop/cancel. Magnetic drop while actually dragging is unchanged.
- **Still hold never banks.** `activeDockKind` is `none` until the finger leaves `STILL_PX`. Word Bank still needs an intentional chip hit + 480ms dwell after that move — a card that merely overlaps the bottom dock while she holds still cannot dump into the workbench. Edge-pan also waits for that move so the map does not creep. The floating clone paints the real label (`paintCloneCard`); drop-target green/white is scoped to `svg#canvas` so it cannot bleach the clone.
- **Hold-drag reserves the origin layout slot.** The dashed ghost is paint-only on the live `g.node` (`v2-branch-origin-ghost`). It does not own a d3.tree cell. Sibling overlap (Node 20 sliding into dashed Node 21) happened because the origin uid was spliced out of `parent.children` (`sendSubtreeToWordBank` / `drag.end`) and `layoutAndRender` recomputed `state.layout(state.root)` then tweened remaining siblings into the hole over 260ms. `restoreOriginLayout` restamped the leftover/exiting DOM at the old translate, so the ghost still *looked* present while the row had already packed. Stay-still Word Bank chips were that same splice path — not a CSS miss, and not fixed by `STILL_PX` / `dockKind=none`. While `body.v2-branch-drag` is on and `__logyqHoldDragCommit` is unset, `layoutAndRender`, `sendSubtreeToWordBank`, `dropSelectedToWordBank`, and `drag.end` no-op (end only clears d3 chrome). Gestures set the commit flag only for a real move-drop; stay-still / cancel / second-finger / dock-near never lift the freeze. Intentional bank still runs after cleanup via `sendDragToWordBank`. Dashed styling stays paint-only on the reserved live node. Clone / 1.1cm lift / magnetic drop / no-map-jump are unchanged.
- **Stay-still hold never copies into Word Bank.** Layout freeze kept the origin uid in the tree, so a phone long-press `contextmenu` (`onNodeContextMenu`) could `addWords` the label (and a neighbor on a second still hold) while the splice/relayout no-op’d — a copy on the shelf, space still held. `addWords`, `sendSubtreeToWordBank`, `dropSelectedToWordBank`, `sendNodeToWordBank_abandon`, and the node contextmenu now no-op unless `__logyqHoldDragAllowBank` is set. Gestures swallow `contextmenu` for the hold session and set that allow flag only for move + chip + 480ms dwell. Origin-slot freeze is unchanged.
- **Phone fit is full-width.** `autoFit` on coarse/no-hover ≤1200px (or ≤700px) scales to canvas width, centers in the band below the header, and may zoom in. First-load canvas is full-bleed in `app.css` so the first fit sees the phone size.
- **Word Bank dwell.** Hold-drag banks only after **480ms** on the **inner 44%** of a chip (`hitBankChip`). Near-ribbon still cancels tree adopts. Packed chip strips no longer eat a passing drop.
- **Drag visual is the map card.** Hold-drag clones the held `g.node` into `#logyq-v162-branch-preview` (same rect, label, chrome). Children are not cloned — only that one card moves. Origin ghost-hold on the live tree is unchanged.
- **No fat-header flash.** Desktop `body>header` is hidden from first paint via blocking `#logyq-phone-boot` CSS plus `app.css`. Compact `#logiq-mobile-header` is in `index.html`.
- **Edit zoom.** Mobile `openNodeEditor` (double-tap / E) delays `flyEditFocusToUID`: pan to ~32% of the visual viewport height and magnify to at least k=1.35 (never zoom out). Enter / blur / Escape animate back to a **copied** pre-edit transform. If the user pinches or pans mid-edit (`zoom` `sourceEvent`), restore is skipped.
- **Word Bank hit is strict.** v162 has no node→dock drop; accidental banks were tree adopts through the bottom dock overlay (finger on the ribbon, visual/ghost still on a detector). Finger contact must land **inside a chip inset 8px** to call `sendSubtreeToWordBank`. Finger in the dock slack (16px) cancels the tree drop. Chip→tree drops stay.

## Phone paint + no-select (PR 112)

- **Mobile has no select UX.** Tap does not outline a card. `is-outlined` / `is-filled` are suppressed on phone. Follow-camera is off: `phoneNoFollowCamera()` no-ops `flyCenterToUID`, moat `checkMoatAndAutoFit`, and `centerOnSelectedSoon`. Desktop keyboard IJKL center-on-select stays. Double-tap edit still uses `flyEditFocusToUID`.
- **Palette in the phone header.** `#logyq-paint-btn` opens a swatch strip. Last color persists as `logyq_paint_color_v1`. Paint stays on after a swatch pick until **Off**. Settings / ⋮ can deep-link to the strip. Painting does not require opening Settings each time.
- **Tap paints one card.** Short stationary pointer (move ≤ 11px) with an active color calls `paintUid`. Pan (touch+move) is not a paint tap.
- **Flick-down paints the branch.** Same flick detector as create (52px / 340ms / 1.45 ratio). **Only `direction === 'down'` while paint is active** steals create-flick. Left / right / up still create. Hold-to-drag is unchanged (not paint).
- **Color is node data.** `data.color` on the tree; snapshot / maps / reload keep it. Undo is `replace-root`. Card shape (rx, stroke chrome) is unchanged; only fill changes.
- **Mix and save keep paint.** `randomizeTree` used to shuffle names into new `{ name }` objects, dropping `data.color`. After Mix the snapshot (and therefore `logyq_maps_v1` / reopen) had no paint. Mix now carries each card’s color through the shuffle; GIQ `normalizeToTree` also keeps `color`. Snapshot / `loadMap` already JSON-clone the full node. Paint UX is unchanged.

## Hold-drag latch (PR 112)

- **3-way race on a card.** Contact is excited (zoom suppressed). **Still `HOLD_MS` 160 / ≤8px** → card hold-drag. **Slow/medium slide** (past slop, below flick-speed `52px/180ms`, after 48ms) → map pan from *now* (no backfill). **Flick-speed whip** (recent or peak ≥ that gate, or 52px / ≤340ms / 1.45 on release) → create; camera never moves. A settle-then-whip stays gated so flick does not jerk the map. Empty space still pans immediately. Desktop `d3.drag` cannot start until `__logyqHoldDragSession`.

## Hold-drag camera (PR 112)

- **Center-offset pan, not edge bands.** Hold-drag auto-pan uses the finger’s offset from the viewport center (dead zone 56px, quadratic step 16). Up/down matches left/right; near-center does not creep. The content leash is sign-aware on the **leading** edge (`dx>0` → left on `minX`, `dx<0` → right on `maxX`, same for y) and does not yank if already past. After `ba35d2f` the leading inset was ½ card and felt choked against the bezel; it is now ~⅓ of the viewport empty on the side she is panning toward (tree in the opposite ~⅔). Diagonals apply both axes.

## Flick L/R/Up match down-on-leaf (PR 112)

- **One recognizer.** Flick still buckets into `createRelative(direction)`. Down-on-leaf stays the gold standard (camera stays, blank child, no editor).
- **L/R/Up were AndEdit keyboard helpers.** Those opened the editor, flew the camera, then `createRelative` slammed the editor shut — the blip / bad focus. All four directions now use the same calm `treeOps` settle: `noEdit`, no fly, select the new uid, snap laid-out nodes to reserved slots.
- **No MIC on flick.** Nursery / recording is later. Flick does not arm `#logyq-v162-action`. Header mic is unchanged. Double-tap still edits **that** new blank.

## Double-tap edits the card under the finger (PR 112)

- **Wrong-card rename after flick-create.** Flick-down creates a blank via `createRelative` → `addChildBelowSelectedAndEdit` (opens editor on the new uid, then immediately closes it). Double-tap then called `editSelected()` with **no uid**, so a stale `selectedUid` (the flick origin / parent) won if `selectByUid` missed. Meanwhile `layoutAndRender` tweens the parent for 260ms over the new child’s final slot, and `hitNode` used the whole `g.node` box (downward grabzone). Equal-size overlaps picked the earlier DOM node — the parent. She typed “cat” onto the wrong card.
- **Fix.** Double-tap calls `editSelected({ uid })` for the exact hit. Hit-test prefers the visual card face (`rect:not(.grabzone)`), then the deepest / closest card. Named-card double-tap is unchanged.

## Flick-create slot snap + uid-only edit (PR 112)

- **Name-collision hypothesis was wrong for the edit path.** Double-tap already reads `__data__.data._uid` → `editSelected({ uid })` → `openNodeEditor` / `editingUid`. Commit uses `findByUid`. `cardText` is only MIC / blank-chip detection. `selectByName` is a test/helper and is **not** on flick or edit. Empty `name: ""` is shared by blanks; `_uid` is not.
- **Real overlap / wrong-card cause.** After create, `layoutAndRender` started a 260ms update tween to open the sibling slot, then the flick path `interrupt()`’d it. d3 interrupt leaves existing cards at the **old** transform. The new blank enters at final `d.x,d.y`. L/R siblings stacked (two blanks looking like one smashed block; neighbors clipped). A tap on the visual blank could hit the card still occupying that slot — parent, earlier sibling, or the first blank in DOM order. That looked like “empty name matched the top card.” Down-on-leaf usually lands in empty space below, but a parent shift + interrupt can still stack.
- **Fix.** `createRelative` / `treeOps` pass `{ immediate: true }`. `snapLaidOutNodes()` interrupts and jumps every `g.node` (and links) to the reserved `translate(d.x,d.y)`. Flick no longer interrupt-only. `selectByName` / `getParentName` reject blank labels. `editSelected({ uid })` does not fall back to `selectedUid` when an explicit uid is passed. Two blanks with `name: ""` each edit independently.

## Library-first open + no blank shells (PR 112)

- **The slap** was `createMap({ edit: true })` on boot / New / last-delete: `editSelected({ wipe: true })` opened a forced empty-card editor (keyboard wall), then `queueAutosave` POSTed an untitled empty-root row into `logiq_maps`.
- **Open (Drive / consultant).** Earlier PERSISTENCE / LAB_TAB / ARCHITECTURE notes said 0 maps → one-card already editing. That *was* the square. Library is now home for **0 and 1+** maps. Editor only after she taps a row or **+ New**. No two-door chooser. No first-run coaching.
- **Calm New.** One normal blank root card — no wipe-edit, no autofocus keyboard. Maps / back returns to the library and drops an untouched draft so the close chrome does not pretend a map is open.
- **No junk shells.** Unsaved drafts with an empty/untitled root, no children, and no word bank are not queued or POSTed until she types or builds. Last-map delete and boot errors stay on the empty library. Leftover blank pending snapshots are discarded on boot.

## Live maps + Drive-style open (PR 112)

- **No two-door chooser.** Recents library (name + relative time) with **+ New** is home. Maps icon / Trees returns to the library; close does not dump you onto an empty canvas. No first-run coaching. (0-maps used to force a one-card editor; that law was replaced above.)
- **Live `logiq_maps` / GIQ.** Same Procedia project and PIN RPCs as LOGiQ (`logiq_map_list` / `logiq_map_save` / `logiq_map_delete`). No `logiq-*` edits. A row’s `tree` is the GIQ JSON tree (`exportGIQ`’s first part); `word_bank` is the `###` section. `formatVersion: 2` is a root-only extra field — not a `{formatVersion, root}` wrapper. `color` and unknown JSON fields JSON-clone through. Old maps without `formatVersion` still load.

## Phone polish (PR 112)

- **No trash FOUC on mobile load.** `#trash` is hidden in first-paint `#logyq-phone-boot` CSS and the matching `app.css` phone media query. Preview JS still hides it later; that is no longer the first hide. Desktop trash stays visible.
- **Ghost put-back swallows side-insert.** During hold-drag, a gap / edge / cousin slot whose `prevUid` or `nextUid` is the origin ghost (or its ghosted subtree) remaps to put-back on the ghost. Green side carets still light beside other cards.
- **Cousin side-insert stays live.** Mute is only the origin ghost’s own side (edge, ghost-owned cousin half, sibling half closer to the ghost) and gaps whose **both** sides are the ghosted subtree. Across the channel, the neighbor’s side-insert and the gap/dot between two non-ghost cousins stay armed. Under/adopt on another card is unchanged.

## Persistence contract + Lab scaffold

- **Card fields that round-trip.** UI writes `name` (label) and `color` (paint). Mix / GIQ `normalizeToTree` / snapshot / `loadMap` also keep `label` / `text` / `title` / `value` if they are already on the node (`cardText` fallbacks; nothing in paint/edit writes them). `_uid` is session identity — Mix reassigns. `children` is the tree. Word Bank stays `string[]`. Contract: `PERSISTENCE.md`.
- **Hold-drag one-pager.** `GESTURE_STATES.md` — idle → arming → latch → still vs moved → drop / cancel / second-finger / chip-dwell. Invariants: origin slot until commit, stay-still never banks, map no jump, 1.1cm lift clone-only.
- **Fearless-delete (small).** `#showCarets` HTML + unwired `if (s.showCarets)` deleted together. Settings ✕ (`#settingsClose`) now calls the same `close()` as backdrop / Escape. `refreshLaneOnZoom` and `exportGIQ` stay listed in `SAFE_TO_RIP.md`, not deleted.
- **Lab tab LOGYQ is live.** Root `index.html` injects `#logyq-hub-card` after `#logiq-v161-hub-card` → `/logyq/`. LOGiQ v161 card stays. Notes: `LAB_TAB.md`.

## Fearless-delete wave

See `SAFE_TO_RIP.md`. Spawn-puck, retired bind no-ops, engine prompt-maps, fake user badge, never-shown Hint, unused `startInlineEdit` / `zoomToNodeCenter` / `getSelectionUids` / `copySubtreeToClipboard` / `createFirstCardAndEdit`, the muted node `dblclick` bind, the dead swim-lane pin branch plus `showLaneAtY`/`hideLane`, unused `window.__add*` create aliases, and the unread `elements.mapsBtn` field were deleted. Keyboard create/edit/drag/selection verbs remain. Zoom still calls no-op `refreshLaneOnZoom`.

