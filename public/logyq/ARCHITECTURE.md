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
- Pending/current map keys are `logyq_*` so local snapshots do not collide with v161.
- The Lab PIN session key remains `logiq_lab_pin_v1` so an already-entered Lab PIN still works.
- Production RPCs (`logiq_map_save`, `logiq_map_list`, `logiq_map_delete`) are unchanged. LOGYQ can still write production maps if a PIN is used; treat that as a known risk, not a feature.

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

Fragments are **physical modules**, not yet independently imported ES modules. They stay inside the original closure so declaration order, `const` bindings, duplicate listeners, and capture/bubble behavior stay identical to v161.

| File | Responsibility |
|---|---|
| `01-config.js` | `CONFIG`, moat/fly config, camera helpers |
| `02-state.js` | Shared `state`, `elements`, word-input, dock bounds |
| `03-utils.js` | UID/clone/path helpers |
| `04-png-export.js` | PNG/SVG export |
| `05-history.js` | `pushHistory` / `undo` |
| `06-data-and-visuals.js` | 30-node sample tree, link drawing |
| `07-layout-and-structure.js` | Label wrap, lane API, V-hold structural moves |
| `08-detectors.js` | Invisible drop hit regions |
| `09-editing.js` | Inline node editor |
| `10-selection.js` | Focus/group selection, toasts, drop insert, reparent helpers |
| `11-deletion.js` | Trash/delete and related create/export helpers still adjacent in source |
| `12-tree-ops.js` | Add child/sibling, GIQ/JSON parse, Word Dock transfer |
| `13-drag.js` | Subtree / node-only / group drag |
| `14-word-dock.js` | Chip render, chip drag, `normalizeToTree` |
| `15-mix-and-context.js` | Mix and node context-menu Word Dock actions |
| `16-tree-manager.js` | D3 zoom/layout/render and control wiring |
| `17-keyboard.js` | `keyDispatcher` and extra hotkeys |
| `18-bridge.js` | `LOGYQBridge` seam used by the preview layer |

## Preview fragments

| File | Responsibility |
|---|---|
| `00-boot.js` | Bridge guard, storage keys, boot sequence |
| `01-helpers.js` | JSON/localStorage helpers |
| `02-styles.js` | Injected preview/mobile CSS |
| `03-ui.js` | Maps library chrome, phone header/context |
| `04-gestures.js` | Tap-to-select, spawn puck, voice capture |
| `05-persistence.js` | Debounced autosave, PIN, production RPCs |

## Shared state (still one closure)

The engine is still one IIFE. Almost every fragment reads and writes the same `state`, `elements`, `utils`, `treeManager`, and `dragManager` bindings. That coupling is why fragments concatenate instead of importing each other. Hidden communication that remains:

- DOM class names (`is-outlined`, Dock chips) as selection/chip state
- Capture-phase keyboard listeners racing `keyDispatcher`
- `treeManager.layoutAndRender` patched by the bridge to emit autosave
- Word Dock `MutationObserver` in preview calling `notifyChange`

See `NOT_REFACTORED.md` for internals left intact because changing them would likely change behavior.
