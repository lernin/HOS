# LOGYQ areas not refactored

These were inspected and left as copied v161 behavior. Changing them is likely to alter selection, drag, keyboard, Mix, or persistence even if the new code looks cleaner.

## Engine internals

- **`dragManager` drop cases** (subtree / solo / group, Trash, root-above). Order of detector priority and fallbacks is load-bearing.
- **Detector geometry** (`Detectors.build` / `pick`). Pixel overlap, cousin/sibling thresholds, and overlay flags are tuned empirically.
- **`keyDispatcher` plus extra capture listeners** (V-hold, Shift+I, Tab-hold, Dock Shift+A). Duplicate handlers and capture/bubble order are part of the product.
- **Two `dropSelectedToWordBank` implementations.** The later declaration wins; the earlier one is dead but kept so source order stays identical.
- **Suppressed double-click editor.** A node dblclick handler exists; a later capture listener still swallows SVG double-clicks. Keyboard `E` remains the reliable edit path.
- **Unreachable Shift+W clear-WordBank branch.** The earlier `W` handler returns first. Documented v161 mismatch; not “fixed.”
- **Help text vs code mismatches** (Ctrl vs Shift, double-click rename). Comments and help HTML are unchanged.
- **Mix (`randomizeTree`)** and its undo snapshot, including Word Dock include/clear rules.
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

Fragments are concatenated back into the original IIFEs. They are not ES modules, do not take an explicit context object, and do not invert control through a command bus. Doing that next would require threading `state`/`elements` through hundreds of free-variable references and is the main remaining maintainability risk.
