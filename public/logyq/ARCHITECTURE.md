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
- Map and PIN storage uses only `logyq_*` keys (`logyq_current_map_v1`, `logyq_pending_save_v1`, `logyq_maps_v1`, `logyq_lab_pin_v1`, `logyq_saved_maps_v1`, `logyq_ashley_user_v1`).
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
  NOT_REFACTORED.md          Intentional no-touch areas
```

`npm run assemble:logyq` rebuilds `js/engine.js` and `js/preview.js` from fragments. Tests require the assembled files to match the fragments exactly, so the served program is still one engine IIFE plus one preview IIFE.

## Engine fragments

Fragments are **physical modules**, not yet independently imported ES modules. They still concatenate into one IIFE. Wave 4 prefers a single bag over copying every v161 oddity; intentional deltas are in `CHANGELOG.md`.

| File | Responsibility |
|---|---|
| `00-api.js` | Shared `logyq` bag and `attach()` registry |
| `01-config.js` | `CONFIG`, moat/fly config. Registers `logyq.camera` (`flyCenterToUID`, `centerOnSelected`, `checkMoatAndAutoFit`). |
| `02-state.js` | Shared `state`, `elements`, word-input, dock bounds |
| `03-utils.js` | UID/clone/path helpers |
| `04-png-export.js` | PNG/SVG export |
| `05-history.js` | `pushHistory` / `undo` |
| `06-data-and-visuals.js` | 30-node sample tree, link drawing |
| `07-layout-and-structure.js` | Label wrap, lane API, V-hold structural moves. Registers `logyq.layout` (wrap/lanes) and `logyq.structure` (horizontal/vertical focus moves). |
| `08-detectors.js` | Invisible drop hit regions |
| `09-editing.js` | Inline node editor. Registers `logyq.editing`. Reads shared state through the bag. |
| `10-selection.js` | Focus/group selection, toasts, drop insert, reparent helpers. Registers `logyq.selection`. |
| `11-deletion.js` | Trash/delete helpers plus adjacent create/export helpers (`exportGIQ`, `createFirstCardAndEdit`). Registers `logyq.deletion`. Orphan add-child JSDoc at the file end is leftover v161 text; the real add helpers live in `12-tree-ops.js`. |
| `12-tree-ops.js` | Add child/sibling, GIQ/JSON parse, Word Dock transfer. Registers `logyq.treeOps`. `DRAG_SLOP_PX` still lives at the bottom of this fragment because drag is concatenated later. |
| `13-drag.js` | Subtree / node-only / group drag. Registers `logyq.drag`. Drop-case order is unchanged: group, then Shift-solo, then subtree. |
| `14-word-dock.js` | Chip render, chip drag, `parseGIQ` / `normalizeToTree`. Registers `logyq.wordDock`. |
| `15-mix-and-context.js` | Mix, node context-menu Word Dock actions, leftover `onNodeLeftDown` / `onNodeRightButtonDown` / `flyToXY`. Registers `logyq.mix`. |
| `16-tree-manager.js` | D3 zoom/layout/render and control wiring. Reads layout/detectors/camera/drag/mix through the bag. `centerOnSelected` delegates to `logyq.camera`. Keyboard bind is `logyq.keyboard?.keyDispatcher` (looked up at event time because `initialize()` runs before `attach('keyboard')`). |
| `17-keyboard.js` | `keyDispatcher` and extra hotkeys. Registers `logyq.keyboard`. Capture-phase Shift+I/J/K/L listeners stay in this fragment. |
| `18-bridge.js` | `LOGYQBridge` seam used by the preview layer |

## Preview fragments

| File | Responsibility |
|---|---|
| `00-boot.js` | Bridge guard, storage keys, boot sequence |
| `01-helpers.js` | JSON/localStorage helpers |
| `02-styles.js` | Injected preview/mobile CSS |
| `03-ui.js` | Maps library chrome, phone header/context |
| `04-gestures.js` | Tap-to-select, spawn puck, voice capture |
| `05-persistence.js` | Debounced local autosave, LOGYQ PIN for voice only, device map library |

## Shared state (explicit `logyq` bag)

Fragments still concatenate into one IIFE so declaration order is preserved. They now register shared objects onto a single `logyq` bag (`00-api.js` `attach()`). Camera/moat helpers in `01-config.js` read `logyq.state` / `logyq.elements` / `logyq.moat` / `logyq.fly` and register `logyq.camera`. Editing, selection, tree ops, deletion, drag, Word Dock, Mix, layout/structure, keyboard, and the tree-manager D3 pass take shared state/managers from the bag. History, first-card import, settings gap changes, and `LOGYQBridge` layout/fit go through `logyq.treeManager`. `LOGYQBridge.core` exposes the bag for tests.

Wave 4 dropped a few v161 oddities on purpose so these boundaries could be one bag. See `CHANGELOG.md`.

Unconverted fragments still use ambient `state`, `elements`, `utils`, and friends; `attach()` makes those the same object references as `logyq.*`. Hidden communication that remains:

- DOM class names (`is-outlined`, Dock chips) as selection/chip state
- Capture-phase keyboard listeners racing `keyDispatcher`, including V-hold / G / paste listeners that still live in `10-selection.js`
- Editing Shift+Enter still calls later `addSiblingRightOf` by ambient name
- Mix still joins Word Dock dumps with newlines (`addWords(names.join('\n'), 'bank')`); Word Dock `addWords` splits on `/[;,]+/`, so those dumps land as one chip unless a comma/semicolon is present
- V-hold I/J/K/L listeners still live in `10-selection.js` and call `logyq.structure`; `keyDispatcher` still bails while `state.vHold` is set
- Nested Tab-hold listeners inside `treeManager.initialize` plus file-level Tab-hold in `16-tree-manager.js` (both capture)
- `isTextField` / `applyDockSide` / `commitWordInput` / `updateDockBounds` still ambient from `02-state.js`
- Detector internals still read ambient `CONFIG` / `state` / `elements` (lane geometry already goes through `logyq.layout`)
- `logyq.treeManager.layoutAndRender` patched by the bridge to emit autosave
- Word Dock `MutationObserver` in preview calling `notifyChange`

See `NOT_REFACTORED.md` for internals left intact because changing them would likely change behavior.
