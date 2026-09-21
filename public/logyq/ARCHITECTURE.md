# LOGYQ architecture

LOGYQ is an isolated maintainability experiment copied from the working LOGiQ v161 application. It is not a rewrite and is not for production.

## Baseline

**Source:** `public/logiq-v161/` (working recovered engine + preview seam).

v161 is the tree engine plus the small `LOGiQBridge` integration that `logiq-preview.js` uses for autosave, maps, and the phone shell. That matches the ~7,300-line monolith described in `docs/LOGIQ_V161_LEGACY.md`.

**Not chosen:** `public/logiq-v162-mobile/` is an iframe overlay that loads `/logiq-v161/` and adds later gesture scripts. It does not contain the engine, so extracting from it would not modularize the application.

**Never edit:** any existing `logiq-*` path, including `public/logiq-v161/`, `public/logiq-v161-legacy/`, and `public/logiq-v162-mobile/`.

## How the copy is isolated

- Served at `/logyq/` with absolute asset paths under that prefix.
- Application bridge is `window.LOGYQBridge` (not `LOGiQBridge`).
- Map and PIN storage uses only `logyq_*` keys (`logyq_current_map_v1`, `logyq_pending_save_v1`, `logyq_maps_v1`, `logyq_lab_pin_v1`).
- Maps autosave into `localStorage.logyq_maps_v1`. LOGYQ does not call `logiq_map_save`, `logiq_map_list`, or `logiq_map_delete`, and does not ship the production Supabase URL or key.
- The Lab PIN is stored as `logyq_lab_pin_v1` and is used only for `/api/transcribe` (voice). Maps never prompt for a PIN.

### Remaining shared surfaces

- `/api/transcribe` is still the Lab transcription endpoint. Voice sends `x-review-pin` from the LOGYQ-only session key. That is not LOGiQ map storage, but it is a shared Lab service.
- D3 still loads from jsDelivr.
- Copied preview DOM ids/classes still use `logiq-*` so selectors stay exact. Those names do not share storage with LOGiQ.

## Layout

```
public/logyq/
  index.html                 Markup + script tags only
  css/app.css                Copied v161 theme/layout CSS
  logos/                     Copied logo assets
  js/engine.js               Assembled engine IIFE (what the browser loads)
  js/preview.js              Assembled preview IIFE (what the browser loads)
  js/engine/                 Source fragments concatenated in MANIFEST order
  js/preview/                Preview fragments concatenated in MANIFEST order
  ARCHITECTURE.md            This file
  SAFE_TO_RIP.md             What was deleted and what is still load-bearing
  NOT_REFACTORED.md          Intentional no-touch areas
```

`npm run assemble:logyq` rebuilds `js/engine.js` and `js/preview.js` from fragments. Tests require the assembled files to match the fragments exactly, so the served program is still one engine IIFE plus one preview IIFE.

## Engine fragments

Fragments are **physical modules**, not yet independently imported ES modules. They still concatenate into one IIFE. Wave 4 prefers a single bag over copying every v161 oddity; intentional deltas are in `CHANGELOG.md`.

| File | Responsibility |
|---|---|
| `00-api.js` | Shared `logyq` bag and `attach()` registry |
| `01-config.js` | `CONFIG`, moat/fly config. Registers `logyq.camera` (`flyCenterToUID`, `centerOnSelected`, `checkMoatAndAutoFit`). |
| `02-state.js` | Shared `state`, `elements`, word-input, dock bounds. Registers `logyq.input` and `logyq.dock`. |
| `03-utils.js` | UID/clone/path helpers |
| `04-png-export.js` | PNG/SVG export |
| `05-history.js` | `pushHistory` / `undo` |
| `06-data-and-visuals.js` | 30-node sample tree, link drawing |
| `07-layout-and-structure.js` | Label wrap, lane API, V-hold structural moves. Registers `logyq.layout` (wrap/lanes) and `logyq.structure` (horizontal/vertical focus moves). |
| `08-detectors.js` | Invisible drop hit regions |
| `09-editing.js` | Inline node editor. Registers `logyq.editing`. Reads shared state through the bag. |
| `10-selection.js` | Focus/group selection, toasts, drop insert, reparent helpers. Registers `logyq.selection`. |
| `11-deletion.js` | Trash/delete helpers plus `exportGIQ`. Registers `logyq.deletion`. |
| `12-tree-ops.js` | Add child/sibling, GIQ/JSON parse, Word Dock transfer. Registers `logyq.treeOps`. `DRAG_SLOP_PX` still lives at the bottom of this fragment because drag is concatenated later. |
| `13-drag.js` | Subtree / node-only / group drag. Registers `logyq.drag`. Drop-case order is unchanged: group, then Shift-solo, then subtree. |
| `14-word-dock.js` | Chip render, chip drag, `parseGIQ` / `normalizeToTree`. Registers `logyq.wordDock`. |
| `15-mix-and-context.js` | Mix and node context-menu Word Dock actions. Registers `logyq.mix`. |
| `16-tree-manager.js` | D3 zoom/layout/render and control wiring. Reads layout/detectors/camera/drag/mix through the bag. `centerOnSelected` delegates to `logyq.camera`. Keyboard bind is `logyq.keyboard?.keyDispatcher` (looked up at event time because `initialize()` runs before `attach('keyboard')`). |
| `17-keyboard.js` | `keyDispatcher` and extra hotkeys. Registers `logyq.keyboard`. Capture-phase Shift+I/J/K/L listeners stay in this fragment. |
| `18-bridge.js` | `LOGYQBridge` seam used by the preview layer |

## Preview fragments

| File | Responsibility |
|---|---|
| `00-boot.js` | Bridge guard, `LOGYQPreview` bag, storage keys, boot sequence |
| `01-helpers.js` | JSON/localStorage helpers |
| `02-styles.js` | Injected preview/mobile CSS, including v162 hold-drag ghost styles |
| `03-ui.js` | Maps library chrome, phone header. No spawn-puck, no bottom arrow bar. |
| `04-gestures.js` | Header-mic voice only (fills type-or-speak). |
| `05-v162-gestures.js` | Same-page port of v162 mobile grammar onto `LOGYQBridge`: direct flick, ~280ms hold-drag, ~360ms double-tap edit, tap-to-MIC on a blank card. |
| `06-persistence.js` | Debounced local autosave, LOGYQ PIN for voice only, device map library |

## Shared state (explicit `logyq` bag)

Fragments still concatenate into one IIFE so declaration order is preserved. They now register shared objects onto a single `logyq` bag (`00-api.js` `attach()`). Camera/moat helpers in `01-config.js` read `logyq.state` / `logyq.elements` / `logyq.moat` / `logyq.fly` and register `logyq.camera`. Editing, selection, tree ops, deletion, drag, Word Dock, Mix, layout/structure, keyboard, and the tree-manager D3 pass take shared state/managers from the bag. History, first-card import, settings gap changes, and `LOGYQBridge` layout/fit go through `logyq.treeManager`. `LOGYQBridge.core` exposes the bag for tests.

Wave 4 dropped a few v161 oddities on purpose so these boundaries could be one bag. See `CHANGELOG.md`.

Unconverted fragments still use ambient `state`, `elements`, `utils`, and friends; `attach()` makes those the same object references as `logyq.*`. Hidden communication that remains:

- DOM class names (`is-outlined`, Dock chips) as selection/chip state
- Capture-phase keyboard listeners racing `keyDispatcher`, including V-hold / G / paste listeners that still live in `10-selection.js`
- Editing Shift+Enter still calls later `addSiblingRightOf` by ambient name
- Mix still joins Word Dock dumps with newlines (`addWords(names.join('\n'), 'bank')`); Word Dock `addWords` splits on `/[;,]+/`, so those dumps land as one chip unless a comma/semicolon is present
- V-hold / G / paste listeners still *register* from `10-selection.js` (named `onVHoldDown` / `onVHoldMove` / `onVHoldUp` / `onGroupHotkeys` on the selection bag). They stay bubble-phase on `window` so document-capture `keyDispatcher` can bail on `state.vHold` first. Do not flip them to capture.
- File-level Tab-hold in `16-tree-manager.js` (capture). Nested initialize Tab-hold that always refocused `#wordInput` was removed.
- Detector `build`/`pick`/`draw` read `logyq.config` / `logyq.state` / `logyq.elements` (geometry formulas unchanged)
- `logyq.treeManager.layoutAndRender` patched by the bridge to emit autosave
- Word Dock `MutationObserver` in preview calling `notifyChange`

See `NOT_REFACTORED.md` for internals left intact because changing them would likely change behavior.

## Mobile gesture layer

**v162 grammar is live on `/logyq/` phone preview.** Dock hide, selection uid, and preview gestures have bag/bridge seams. A later phone chrome should treat the engine as `window.LOGYQBridge` + `LOGYQBridge.core` (`logyq` bag) and preview gestures as `window.LOGYQPreview.gestures` (`bindV162`, `constants`, header-mic `startVoiceCapture`). It should not reach into fragment internals or add a second copy of those listeners.

This is not an ES-module app. Concatenate+IIFE remains. The existing injected phone shell in preview is still v161 chrome (header/context); replacing that shell is a later UX track. Pull-to-copy, Working Lock, and drag-watchdog are deferred.

### Depend on these

- `LOGYQBridge` methods (`selectByUid`, `createRelative`, `editSelected`, `deleteSelection`, `mix`, `fit`, `loadMap`, `subscribe`/`notifyChange`, `cycleDock`, `setDockSide`, `getSelectedUid`, `renameNode`)
- `window.LOGYQPreview.gestures` (`bindV162`, `constants`, `armBlankCardMic`, header-mic `startVoiceCapture`/`stopVoiceCapture`)
- Bag clusters: `logyq.selection` (`getSelectedUid`), `logyq.editing`, `logyq.treeOps`, `logyq.drag`, `logyq.wordDock`, `logyq.input`, `logyq.dock` (`setSide` / `cycleDockSide` / `applyDockSide` / `sideLabel` / `updateDockBounds`), `logyq.camera`, `logyq.structure`, `logyq.layout`, `logyq.detectors` (`build`/`pick`/`draw` only), `logyq.treeManager.layoutAndRender` / `autoFit`
- `logyq.input.isTextField` before stealing keys or pointer
- Preview persistence (`logyq_*` storage keys) and `/api/transcribe` PIN header — already isolated from LOGiQ maps

### Do not touch / do not reimplement

- Detector *geometry* (`Detectors.build` internals, cousin/sibling thresholds)
- `dragManager` drop-case order
- Capture vs bubble keyboard order, especially V-hold (bubble on `window`) vs `keyDispatcher` (capture on `document`)
- File-level Tab-hold
- Copied `logiq-*` DOM ids in the preview shell (selectors, not storage)
- Production `logiq-*` paths (read-only)
- v162 gesture thresholds (`LOGYQPreview.gestures.constants`) — read them, do not fork them inside engine fragments. Live values: flick 52px / 340ms / 1.45 ratio, hold 280ms / 8px slop, double-tap 360ms, tap-move 11px.

### Known footguns for mobile

- **Tab-hold** is a desktop modifier. Do not synthesize Tab on touch; it will `preventDefault` and set `state.tabHold`.
- **Suppressed SVG dblclick** — do **not** unmute it. Phone edit is v162 pointer double-tap (~360ms) → `LOGYQBridge.editSelected()`, or keyboard `E`.
- **Sticky-nav `setSelectionSet`** is undefined; the try/catch swallows it. Do not "fix" it from a mobile overlay without an intentional delta.
- **`keyDispatcher` runs at initialize()** before `attach('keyboard')`; the bind is `logyq.keyboard?.keyDispatcher`. Keep that late lookup.
- Concatenate+IIFE remains; do not import fragments as ES modules from a mobile shell.
- v162 gestures bind once from `05-v162-gestures.js` when the coarse/no-hover ≤1200px query matches. Mouse is ignored so desktop drag stays native. Cards use geometric hit-test (`pointer-events: none` on `g.node`) so pan/pinch still work over them.
- Hold (~280ms, 8px slop) latches through synthetic `mousedown`/`mousemove`/`mouseup` into existing `d3.drag()` (`shiftKey: false`). Flick and double-tap must not start that drag.
- Direct flick calls `selectByUid` + `createRelative`, then arms `#logyq-v162-action` on the blank card. It must not start `MediaRecorder` until she taps MIC. Header mic remains a separate voice path into the type-or-speak field.
- Phone pinch/wheel floor is `scaleExtent([0.02, 2.4])` on `logyq.state.zoom`. Do not restore the v161 `0.4` floor.

### Must not do

- Do not toggle `#Dock` with `style.display`. Hide is CSS class `dock-hidden` via `logyq.dock.setSide('hidden')` / `cycleDockSide()` / `LOGYQBridge.cycleDock()`.
- Do not synthesize Shift+W. Unshifted W (and `LOGYQBridge.cycleDock`) is the only dock-hide path. Shift+W is a no-op; the old WordBank-to-trash branch was deleted.
- Do not flip V-hold listeners to capture.
- Do not put spawn-puck or v162 listeners on the engine `logyq` bag. That is preview (`LOGYQPreview.gestures`).
- Do not reintroduce spawn-puck or a second canvas tap-capture. Those auto-voiced on create and fight flick/hold.
- Do not mix clutch two-hand with v162 hold-flick.
- Do not write production LOGiQ maps/PIN (`logiq_*` keys, `logiq_map_*` RPCs).
- Do not start from clutch or rebuild the hidden spawn-puck.

### Still ambient (OK to leave)

- Capture-phase Shift+I/J/K/L relative-create vs `keyDispatcher` nav (one listener now: `onRelativeCreateHotkeys`)
- Mix newline `addWords` vs comma split
- PNG export, help HTML mismatches, zoom-time `refreshLaneOnZoom` no-op
- History/tree-ops/editing still use some ambient `showToast` / `utils` names inside their own fragments (same IIFE)
- Existing injected phone header chrome (v161 DOM ids). Spawn-puck and the bottom arrow bar (`#logiq-mobile-context`) are gone. A later chrome redesign should keep `LOGYQPreview.gestures.bindV162` rather than copying capture listeners.
