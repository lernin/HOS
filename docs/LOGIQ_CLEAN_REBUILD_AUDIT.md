# LOGiQ legacy hygiene audit — checkpoints 1–2

Canonical workroom: HOS Issue #108  
Branch: `rebuild/logiq-v161-clean-mobile-flycenter-20260915`

## Decision

Clean the recovered v161 runtime **before** modular extraction, but only where behavior can be proved unchanged. The immutable `/logiq-v161-legacy/` file remains untouched. The clean candidate applies deterministic, asserted hygiene transforms to that source and must continue to pass the v161 parity/regression gate after every removal.

This avoids two opposite risks:

1. modularizing dead/superseded code and carrying historical junk into the new architecture;
2. broad cleanup that accidentally changes behavior encoded in listener order or shared closure state.

## Confirmed safe removals in the clean candidate

Seven cleanup units are now applied to `/logiq-clean/` only:

1. **Unreachable Shift+W Word Bank-to-Trash block.** `keyDispatcher` handles `W`/`Shift+W` earlier and returns, so the later block cannot execute. Regression protection requires clean behavior to match v161 and proves the Word Bank is not cleared.
2. **Suppressed node double-click editor handler.** The SVG capture-phase `dblclick` mute prevents the event from reaching the node target handler. Removing the target handler preserves established behavior.
3. **Second identical Tab listener registration.** The same `tabDown`/`tabUp` callbacks were registered twice with the same event type/capture flag. The second registration is a DOM no-op.
4. **Unreachable local-map Save path.** The recovered runtime contains no `#saveBtn` DOM control, so `saveCurrentMap`, its cached element reference, and both guarded Save click registrations are unreachable. The active Trees menu is preserved.
5. **Second identical Trees click registration.** `openMapsMenu` was attached twice to the same `mapsBtn` with the same callback. The clean candidate keeps one registration. A browser regression loads a `savedMaps_v1` tree and requires exact post-transition behavior parity.
6. **Dead `enforceMoatForSelected` helper.** Inventory batch `v161-camera-moat-001` established confidence 3: exact-name source audit finds only the declaration, it is not exported, and it has no caller. The transform asserts exactly one symbol occurrence before removing the function. Active moat behavior (`checkMoatAndAutoFit`, navigation/zoom paths, and camera helpers) is not touched.
7. **Superseded early `flyCenterToUID` declaration.** Inventory batch `v161-camera-moat-001` established that two same-scope declarations exist and the later unified camera declaration is the active binding. A RED regression first proved the clean runtime still contained two declarations; the hygiene transform now asserts exactly two and removes only the earlier `CONFIG_FLY.hotkeyDuration` version. The full v161 parity/keyboard gate remains unchanged.

`public/logiq-clean/legacy-hygiene.js` asserts the expected source shape before removing anything. If the baseline no longer contains exactly the expected dead/no-op structure, sanitization fails rather than silently editing unexpected code.

## Regression protection

The current gate protects:

- immutable v161 checksum/source integrity;
- exact hygiene removal report;
- one active `flyCenterToUID` declaration in the clean runtime;
- Shift+W Word Bank behavior;
- muted double-click behavior;
- active Trees/`savedMaps_v1` loading behavior;
- Shift+F camera behavior against observed v161 output;
- Tab behavior from canvas, Word input, inline editor, and Settings modal;
- visual geometry, typography, selection state, wrapped labels, links, full-tree coordinates, and drag-start/no-op geometry.

The keyboard ownership tests intentionally compare against **observed v161 behavior**, including small camera offsets, rather than inventing a cleaner behavior contract during hygiene.

## Audit classifications

### Active / preserve until explicitly extracted

- `state` hierarchy, history, Word Bank, selection/focus, drag/edit/zoom state;
- `utils`, `Detectors`, `dragManager`, `treeManager`;
- structural mutation helpers and Undo history contracts;
- keyboard navigation and V-hold structural movement;
- Word Bank transfer/delete semantics;
- active Trees loading/deletion behavior;
- active camera/moat behavior including `checkMoatAndAutoFit`;
- current D3 zoom/layout/render behavior.

### Confirmed dead/no-op — removed in clean candidate

- unreachable Shift+W Word Bank-to-Trash branch;
- suppressed node double-click editor target handler;
- duplicate Tab listener registration;
- unreachable local-map Save path;
- duplicate Trees click registration;
- dead `enforceMoatForSelected` helper;
- superseded early `flyCenterToUID` declaration.

### Suspicious / order-dependent — do not remove yet

- multiple global keyboard listeners whose ordering is behaviorally significant;
- Shift+F dual ownership (`keyDispatcher` plus separate capture listener);
- stacked Tab handlers whose combined behavior is now regression-protected but whose individual ownership is not isolated;
- duplicate/helper-like logic around selection, Escape, navigation and structural commands;
- remaining duplicate camera helpers, including the early `centerOnSelected` declaration, until each supersession is independently regression-protected;
- documentation/code mismatch around Dock select-all modifier;
- drag/drop branches that may participate in detector, history or animation ordering.

## Cleanup rule

For each future cleanup candidate:

1. prove it is dead, unreachable, superseded or a semantic no-op;
2. add or extend regression protection around the observable surface;
3. remove only that responsibility;
4. run immutable-baseline verification + parity + hygiene/ownership tests;
5. stop immediately if parity changes.

Do not combine cleanup with architecture extraction or mobile redesign in the same checkpoint.

## Current exit status

Keyboard/listener inventory and legacy-map hygiene are established. The clean candidate has now removed one confidence-3 dead moat helper and one confidence-3 superseded camera declaration, with the complete regression gate green after each checkpoint. Modular extraction remains gated until the high-confidence hygiene pass is complete. The next cleanup should again be one independently proven unit; the early superseded `centerOnSelected` declaration is the next likely candidate, not a broad refactor.
