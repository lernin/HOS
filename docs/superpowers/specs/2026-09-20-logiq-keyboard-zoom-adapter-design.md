# LOGiQ Keyboard Zoom Adapter Design

Date: 2026-09-20
Canonical workroom: HOS Issue #108
Branch: `rebuild/logiq-v161-keyboard-zoom-20260916`
Behavioral base: published CSS checkpoint tree `ee7507b52efb137c1323b0fd88aaac55a9e11746`

## Purpose

Continue LOGiQ modularization with the smallest practical JavaScript ownership boundary: the Z/Shift+Z keyboard adapter.

The first extraction probe established that `zoomByStep` is not a pure helper. It reads the private D3 zoom behavior and the canvas element, and it is declared inside a closure shared with the order-sensitive W shortcut. Moving that whole block would either expose mutable runtime internals or broaden the behavioral surface of the checkpoint.

This checkpoint therefore extracts only keyboard-event ownership. The legacy runtime retains the camera operation and injects two narrow capabilities into the external adapter: `zoomByStep` and `isTextField`.

## Scope

This checkpoint moves the existing Z/Shift+Z `keydown` listener into one external classic script:

`/logiq-clean/keyboard-zoom.js`

The adapter owns:

- registration of the Z/Shift+Z `keydown` listener;
- modifier and text-field exclusion;
- `preventDefault()` for handled Z/Shift+Z input;
- translation of Z into direction `+1` and Shift+Z into direction `-1`.

The legacy runtime continues to own:

- `ZOOM_STEP`;
- `zoomByStep(direction)`;
- the D3 zoom behavior and scale extent;
- canvas-center calculation;
- `state`, `elements`, and all other runtime internals;
- the adjacent W dock-side listener.

No other keyboard owner, camera helper, or JavaScript responsibility moves in this checkpoint.

## Architectural Classification

This is an architectural checkpoint because it establishes the interface future external adapters may follow.

The approved pattern is dependency injection from the legacy closure into a narrow adapter. It is deliberately not a general-purpose global command bus and does not expose mutable state.

## Architecture

### Current flow

1. `/logiq-clean/index.html` fetches immutable v161.
2. `legacy-hygiene.js` applies the nine established hygiene transforms and externalizes the stylesheet.
3. The sanitized document executes one large inline runtime IIFE.
4. During `treeManager.initialize()`, a nested IIFE defines `zoomByStep`, registers the Z/Shift+Z listener, and registers the adjacent W listener.

### Target flow

1. `/logiq-clean/index.html` continues to fetch immutable v161.
2. `legacy-hygiene.js` continues all existing transforms, then fail-closed identifies the single expected Z/Shift+Z listener.
3. The transform removes only that listener and leaves `zoomByStep` and the W listener in their existing lexical scopes.
4. The transform adds one synchronous classic-script reference to `/logiq-clean/keyboard-zoom.js` immediately before the legacy runtime script.
5. The external script defines a frozen `window.LOGiQKeyboardZoom` adapter with one `mount()` method.
6. At the original listener location, while `zoomByStep` and `isTextField` are both lexically available, the transformed runtime calls:

```js
window.LOGiQKeyboardZoom.mount({
  target: window,
  zoomByStep,
  isTextField,
});
```

7. `mount()` validates its dependencies and registers the external adapter's listener with the original `{ passive: false }` options.

The adapter is loaded before the runtime and mounted after `state.zoom` has been initialized. There is no asynchronous import, race, or access to private runtime state.

## Adapter Contract

`keyboard-zoom.js` exposes exactly one frozen namespace:

```text
window.LOGiQKeyboardZoom.mount({ target, zoomByStep, isTextField })
```

Contract:

- `target` must provide `addEventListener` and is `window` in production.
- `zoomByStep` must be a function accepting direction `+1` or `-1`.
- `isTextField` must be a function accepting an event target.
- `mount()` registers exactly one bubble-phase `keydown` listener with `{ passive: false }`.
- mounting the same adapter more than once fails with an explicit error rather than creating duplicate keyboard ownership.
- invalid dependencies fail before listener registration.
- the namespace exposes no `state`, `elements`, D3 object, DOM node, tree manager, or mutation helper.

The listener preserves the existing decision order:

1. ignore Ctrl, Meta, or Alt combinations;
2. ignore events whose target is a text field;
3. handle only `z` or `Z`;
4. prevent the browser default;
5. call `zoomByStep(-1)` when Shift is held, otherwise `zoomByStep(+1)`.

## Loading And Transformation

The adapter must be a classic script, not an ES module, because the sanitized legacy document is written synchronously with `document.write()`. Synchronous loading keeps initialization deterministic and allows the runtime to mount the adapter at the existing listener location.

`legacy-hygiene.js` remains a deterministic source adapter. Its new transform must:

- assert exactly one expected Z/Shift+Z listener block;
- assert exactly one expected main legacy runtime script anchor;
- replace only the listener block with the `mount()` call;
- insert exactly one absolute `/logiq-clean/keyboard-zoom.js` script reference before the main runtime;
- throw a descriptive extraction error when any source-shape assertion fails.

The extraction is not added to the historical nine-entry hygiene-removal report. That report continues to describe only the already-approved dead/no-op removals.

## Ownership Boundary

After this checkpoint:

- immutable `/logiq-v161-legacy/index.html` remains the historical source of truth;
- `/logiq-clean/keyboard-zoom.js` owns Z/Shift+Z keyboard interpretation and listener registration;
- the transformed legacy runtime owns the actual zoom command and all camera state;
- `/logiq-clean/legacy-hygiene.js` owns asserted source transformation only;
- `/logiq-clean/index.html` remains the bootstrap loader;
- the existing W listener remains inline and order-equivalent to v161.

This pattern is reusable for later small adapters, but this checkpoint does not create a framework or extract another listener.

## Behavior Invariants

The following must remain unchanged:

- Z zooms in by the existing 1.20 step around the viewport center;
- Shift+Z zooms out by the reciprocal step around the viewport center;
- Ctrl/Meta/Alt combinations do not trigger keyboard zoom;
- typing Z in an input, textarea, contenteditable region, or textbox role does not trigger zoom;
- the handled event remains default-prevented;
- the listener remains bubble-phase and non-passive;
- the W dock-side shortcut remains in place and fires with its existing capture/propagation behavior;
- D3 wheel, pinch, pan, fit, moat, centering, and scale-extent behavior remains unchanged;
- tree behavior, rendering, selection, editing, drag, persistence, mobile interaction, and Supabase runtime/map data remain unchanged;
- all nine hygiene removals and the external CSS ownership boundary remain unchanged.

## Failure Behavior

The checkpoint fails closed.

The sanitizer must throw when the expected listener or insertion anchor occurs zero times or more than once. The adapter must throw when required injected capabilities are absent, incorrectly typed, or mounted twice.

There is no fallback inline Z listener. Duplicate ownership would hide extraction drift and is therefore prohibited.

## Testing Strategy

### RED ownership regression

Before implementation, add a structural browser regression requiring the clean candidate to:

- load exactly one `/logiq-clean/keyboard-zoom.js` script;
- expose one frozen `window.LOGiQKeyboardZoom` namespace with `mount`;
- contain no inline Z/Shift+Z listener ownership;
- retain exactly one `zoomByStep` definition in the transformed legacy runtime;
- retain the adjacent W listener in the legacy runtime.

This test must fail against the current CSS checkpoint because no external keyboard zoom adapter exists and the inline Z listener remains.

### Behavioral parity regression

Add direct comparisons between immutable v161 and the clean candidate for:

- Z zoom-in scale and center behavior;
- Shift+Z zoom-out scale and center behavior;
- Z while the Word input is focused;
- Ctrl+Z, Meta+Z, and Alt+Z exclusion;
- default prevention for handled Z and Shift+Z;
- unchanged plain-W dock transition behavior.

Tests compare observed v161 output rather than inventing new behavior. Existing tests may not be weakened to accommodate the extraction.

### Transformation guards

Add sanitizer regressions proving malformed inputs with zero or two matching Z listeners, or zero or two runtime anchors, fail with explicit errors.

### Full GREEN gate

Run the complete existing LOGiQ gate plus the new ownership, behavior, and failure tests:

- production build;
- immutable v161 source verification;
- nine-entry hygiene contract;
- CSS byte-equivalence and ownership;
- camera and Shift+F ownership;
- Tab behavior;
- visual geometry, typography, selection, and wrapped-label parity;
- drag-start and no-op geometry parity;
- new keyboard zoom adapter regressions.

The GitHub Actions workflow may receive only the narrow branch-trigger addition needed for `rebuild/logiq-v161-keyboard-zoom-20260916`. No job, command, permission, or unrelated trigger change is authorized.

## Expected Files

- Create: `public/logiq-clean/keyboard-zoom.js`
- Modify: `public/logiq-clean/legacy-hygiene.js`
- Modify or create: focused tests under `tests/`
- Modify: `.github/workflows/logiq-clean-rebuild.yml` for the exact branch trigger only
- Modify: `docs/LOGIQ_CLEAN_REBUILD_AUDIT.md` after final verification

`public/logiq-v161-legacy/index.html` must not change.

## Non-Goals

This checkpoint does not:

- move `zoomByStep` or any D3 camera logic;
- expose `state`, `elements`, `treeManager`, or D3 through a global bridge;
- create a general command registry or event bus;
- consolidate the W listener with `keyDispatcher`;
- reorganize Tab, Shift+F, navigation, editing, or structural shortcuts;
- change shortcut semantics, zoom constants, timing, rendering, or layout;
- clean up, rename, optimize, or deduplicate unrelated JavaScript;
- change persistence, authentication, Supabase schema/data, or map data;
- merge to main or deploy to production.

## Evidence And Publication

Completion evidence must record:

- the intended RED failure before runtime implementation;
- local GREEN results;
- the successful workflow run for the exact final documentation head;
- final branch and exact HEAD SHA;
- immutable v161 checksum/blob confirmation;
- files and ownership moved;
- review findings and resolutions;
- confirmation that no Supabase mutation, main merge, or production deployment occurred.

Evidence belongs in `docs/LOGIQ_CLEAN_REBUILD_AUDIT.md` and HOS Issue #108. Preview publication, if performed under the owner's existing authorization, remains separate from production deployment and must be recorded explicitly.

## Exit Gate

The checkpoint is complete only when:

1. the clean candidate loads exactly one external keyboard zoom adapter;
2. inline Z/Shift+Z listener ownership is absent from the transformed legacy runtime;
3. `zoomByStep`, camera state, and the W listener remain private and behaviorally unchanged;
4. direct Z/Shift+Z, exclusion, prevention, and W parity tests pass;
5. the complete existing gate passes on the exact final head;
6. immutable v161 remains unchanged;
7. final evidence is recorded without merging or deploying production.

Only after this exit gate should another JavaScript responsibility be considered. That later boundary requires its own evidence and approval.
