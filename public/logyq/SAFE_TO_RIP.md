# LOGYQ — what is safe to rip

Fearless-delete notes for `/logyq/` only. This is not an ES-module plan. Do not touch `logiq-*`, merge, or deploy.

Live mobile grammar: flick / 280ms hold-drag / 360ms double-tap on `LOGYQBridge`. See `ARCHITECTURE.md` and `GESTURE_STATES.md`.

## Removed in this wave (gone; do not put back)

| Item | Why it was junk | Proof |
|---|---|---|
| Spawn-puck DOM (`#logiq-spawn-puck`, `#logiq-spawn-ghost`) + CSS | Hidden and unbound after the v162 port; auto-voiced on create | No remaining `logiq-spawn-puck` under `public/logyq/` |
| `bindCanvasGestures` / `bindSpawnGestures` (retired no-ops) | Racers of the v162 layer | Preview attach no longer exports them |
| `app.spawnGesture`, `app.canvasPointers`, `isPhoneUi` | Only served the old tap/puck path | 00-boot / 03-ui |
| Header-mic `startVoiceCapture(uid)` card-rename / auto-edit | Auto-voice remnant of puck create | Voice now fills the header input only |
| Engine `saveCurrentMap` / `openMapsMenu` / `logyq_saved_maps_v1` | `prompt` maps never ran; preview intercepts Trees | Mix attach is `randomizeTree` + `onNodeContextMenu` only |
| `elements.saveBtn` listener | `#saveBtn` does not exist in LOGYQ HTML | Already asserted absent |
| Fake `#userBadge` + `logyq_ashley_user_v1` | Wrote “Logged in as Ashley”; unused identity | HTML/engine |
| `#Hint` (“(w)ords”) | `display:none` forever; no JS showed it | HTML/CSS |
| `startInlineEdit` | Never called; E / `editSelected` use `openNodeEditor` | `09-editing.js` |
| `zoomToNodeCenter` | Only a commented call; camera is `flyCenterToUID` | `09-editing.js` |
| `getSelectionUids` in drag | Defined, never called; live read is `LOGYQBridge.getSelectedUids` | `13-drag.js` |
| Node `nEnter.on("dblclick")` | SVG capture mute swallows it | Mute in tree-manager **stays** |
| `copySubtreeToClipboard` | Never bound to a key or button | `11-deletion.js` |
| `createFirstCardAndEdit` | Never called (boot always loads the 30-node sample) | `11-deletion.js` |
| Settings `if (s.lanePinBtn)` branch | No `#lanePinBtn` in HTML; `elements.settings.lanePinBtn` never assigned; always skipped | `16-tree-manager.js` |
| `showLaneAtY` / `hideLane` | Only callers were that dead pin branch | Layout attach is `refreshLaneOnZoom` only |
| `window.__addChildBelowSelectedAndEdit` (and elder/younger/insert-parent aliases) | Never read; flick uses `logyq.keyboard.*` via `LOGYQBridge.createRelative` | `17-keyboard.js` |
| `elements.mapsBtn` field | Engine never read it after the prompt-maps listener died | `#mapsBtn` HTML **stays**; preview capture opens the library |
| Trailing `e` after `</html>` | Accidental leftover, not markup | `index.html` |
| Bottom arrow bar (`#logiq-mobile-context`) | Ashley: never needed; raced selection chrome | Preview DOM/CSS/JS; Dock no longer reserves 66px |
| `#showCarets` checkbox + `if (s.showCarets)` | Visible but `elements.settings.showCarets` was never assigned, so the change handler never bound | HTML + `16-tree-manager.js` deleted together. `CONFIG.SHOW_CARETS` still drives live caret paint |

## Keep (load-bearing — deleting these is not fearless)

Do **not** delete because fingers on phone do not press the key. Gestures and the bridge still call the verbs.

- `LOGYQBridge.createRelative` and keyboard Shift+I/J/K/L helpers (`addChildBelowSelectedAndEdit`, siblings, insert-parent) on `logyq.keyboard`
- `LOGYQBridge.editSelected` / `logyq.editing.openNodeEditor` / `closeNodeEditor`
- `logyq.drag` / `d3.drag` / detector `pick` geometry / drop-case order
- `logyq.selection` (`getSelectedUid`, `selectSingle`, `insertNodeAtDrop`, `removeNode`)
- V-hold / G / paste listeners (bubble on `window`) and `keyDispatcher` capture order
- Tab-hold (desktop modifier; do not synthesize Tab on touch)
- SVG `dblclick` **mute** (edit is pointer double-tap or E)
- Preview maps library (`logyq_maps_v1`) and header-mic `/api/transcribe` with `logyq_lab_pin_v1`
- Flick tap-to-MIC chip (`#logyq-v162-action`) — record only after tap
- Finger hold-drag origin ghost (`v2-branch-origin-ghost` + `is-others` stay visible). Desktop `dragging-mode` hide is load-bearing for mouse; do not delete it, only override during `v2-branch-drag`
- Hold-drag card-pop via `liftPx()` / `fingerOffset` (`OFFSET_UP_CM` 1.1cm, side 0). Map does not pan on latch. See `GESTURE_STATES.md`.
- Origin-slot freeze (`holdDragFrozen`) and bank copy guards (`holdDragBlocksBank`) — stay-still must not splice or `addWords`
- Hold-drag auto-pan (`edgePan` / `centerPanVector` / `clampPanToContent`) on the feedback loop
- Dock hide via `logyq.dock.setSide` / `cycleDockSide` (CSS class, not `style.display`)
- `#mapsBtn` in HTML (preview capture-phase click opens `logyq_maps_v1`)
- Zoom still calls `logyq.layout.refreshLaneOnZoom` (no-op, but the call is live; architecture + unit tests pin it)
- `#settingsClose` ✕ — now wired to the same `close()` as backdrop / Escape; keyboard `x` clicks it
- `d3.zoom` `scaleExtent([0.02, 2.4])` — do not restore `0.4`

## Can she delete X without fear?

| X | Verdict |
|---|---|
| Phone header / maps modal | **Not yet.** Still the live shell. Redesign is a later UX track; bind `LOGYQPreview.gestures.bindV162` rather than copying listeners. |
| Bottom arrow bar | **Gone.** Do not put `#logiq-mobile-context` back. |
| Keyboard arrows / E / T / D / W | **No.** Desktop still uses them; E is the edit fallback; flick still calls the create helpers. |
| `refreshLaneOnZoom` | **Listed only.** Zoom calls it every pan/zoom; the body is empty. Delete the stub **and** the zoom call together, then drop the architecture + unit pins. Not deleted this pass. |
| `#mapsBtn` HTML | **No.** Preview intercepts it for the device library. |
| `exportGIQ` | **Listed only.** No UI caller; one unit test pins the GIQ string. Safe to delete only with that test. |
| PNG/SVG export modal | **No.** Settings still wires it. |
| Mix + node context menu | **No.** Mix button and right-click dumps are live. Persistence contract is `PERSISTENCE.md`. |
| Detector overlays | **No.** Geometry is the drop engine. |
| `#showCarets` checkbox | **Gone** (HTML + dead `if (s.showCarets)`). |
| `#settingsClose` ✕ | **Wired.** Do not delete; `s.close` now calls `close()`. |
| Concatenate+IIFE / more bag splits | **Out of scope.** Does not make deletes safer. |
| `logiq-*` | **Never.** |

## Remaining knots (leave documented)

- Sticky-nav `setSelectionSet` is undefined; try/catch swallows it (copied v161).
- Two Escape listeners (editor vs group-clear) — order is load-bearing.
- Mix dumps join names with newlines; Word Dock splits on commas.
- Help HTML still claims double-click rename; dblclick is muted. Phone edit is double-tap / E.
- Injected phone chrome still uses copied `logiq-*` DOM ids (selectors, not storage).
- `refreshLaneOnZoom` remains a live no-op (zoom call + tests).
- `exportGIQ` remains a unit-tested helper with no UI button.
