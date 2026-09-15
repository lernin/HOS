# LOGiQ legacy hygiene audit — checkpoints 1–4

Canonical workroom: HOS Issue #108  
Current checkpoint branch: `rebuild/logiq-v161-clean-mobile-shiftf-20260915`

## Decision

Clean the recovered v161 runtime **before** modular extraction, but only where behavior can be proved unchanged. The immutable `/logiq-v161-legacy/` file remains untouched. The clean candidate applies deterministic, asserted hygiene transforms to that source and must continue to pass the v161 parity/regression gate after every removal.

This avoids two opposite risks:

1. modularizing dead/superseded code and carrying historical junk into the new architecture;
2. broad cleanup that accidentally changes behavior encoded in listener order, duplicated state surfaces, or shared closure state.

## Confirmed safe removals in the clean candidate

Nine cleanup units are now applied to `/logiq-clean/` only:

1. **Unreachable Shift+W Word Bank-to-Trash block.** `keyDispatcher` handles `W`/`Shift+W` earlier and returns, so the later block cannot execute. Regression protection requires clean behavior to match v161 and proves the Word Bank is not cleared.
2. **Suppressed node double-click editor handler.** The SVG capture-phase `dblclick` mute prevents the event from reaching the node target handler. Removing the target handler preserves established behavior.
3. **Second identical Tab listener registration.** The same `tabDown`/`tabUp` callbacks were registered twice with the same event type/capture flag. The second registration is a DOM no-op.
4. **Unreachable local-map Save path.** The recovered runtime contains no `#saveBtn` DOM control, so `saveCurrentMap`, its cached element reference, and both guarded Save click registrations are unreachable. The active Trees menu is preserved.
5. **Second identical Trees click registration.** `openMapsMenu` was attached twice to the same `mapsBtn` with the same callback. The clean candidate keeps one registration. A browser regression loads a `savedMaps_v1` tree and requires exact post-transition behavior parity.
6. **Dead `enforceMoatForSelected` helper.** Inventory batch `v161-camera-moat-001` established confidence 3: exact-name source audit finds only the declaration, it is not exported, and it has no caller. The transform asserts exactly one symbol occurrence before removing the function. Active moat behavior (`checkMoatAndAutoFit`, navigation/zoom paths, and camera helpers) is not touched.
7. **Superseded early `flyCenterToUID` declaration.** Inventory batch `v161-camera-moat-001` established that two same-scope declarations exist and the later unified camera declaration is the active binding. A RED regression first proved the clean runtime still contained two declarations; the hygiene transform asserts exactly two and removes only the earlier `CONFIG_FLY.hotkeyDuration` version.
8. **Superseded early `centerOnSelected` declaration.** Source audit established two same-scope declarations; JavaScript resolves runtime calls to the later declaration. A RED regression first failed with `2 !== 1` while all existing parity checks stayed green. The transform asserts exactly two declarations and removes only the earlier `CONFIG_FLY.hotkeyDuration` wrapper. The remaining active function body must match immutable v161 byte-for-byte.
9. **Duplicate standalone Shift+F centering listener.** Inventory batch `v161-keyboard-camera-002` identified two Shift+F owners. The first cleanup hypothesis—remove the `keyDispatcher` branch—was rejected by the parity gate because ordinary `selectedUid` centering stopped. Investigation showed the paths consume different selection surfaces. The branch was restored, a corrected RED test required `keyDispatcher = 1` and standalone listener `= 0`, and only the later standalone `treeManager.centerOnSelected()` listener was removed. Shift+F endpoint parity remained green after the corrected cleanup.

`public/logiq-clean/legacy-hygiene.js` asserts the expected source shape before removing anything. If the baseline no longer contains exactly the expected dead/no-op structure, sanitization fails rather than silently editing unexpected code.

## Regression protection

The current gate protects:

- immutable v161 checksum/source integrity;
- exact hygiene removal report;
- one active `flyCenterToUID` declaration in the clean runtime;
- one active `centerOnSelected` declaration whose active function body matches immutable v161;
- a single effective Shift+F camera owner (`keyDispatcher`) with endpoint parity against observed v161 behavior;
- Shift+W Word Bank behavior;
- muted double-click behavior;
- active Trees/`savedMaps_v1` loading behavior;
- Tab behavior from canvas, Word input, inline editor, and Settings modal;
- visual geometry, typography, selection state, wrapped labels, links, full-tree coordinates, and drag-start/no-op geometry.

The keyboard ownership tests intentionally compare against **observed v161 behavior**, including camera offsets, rather than inventing a cleaner behavior contract during hygiene.

## Audit classifications

### Active / preserve until explicitly extracted

- `state` hierarchy, history, Word Bank, selection/focus, drag/edit/zoom state;
- `utils`, `Detectors`, `dragManager`, `treeManager`;
- structural mutation helpers and Undo history contracts;
- keyboard navigation and V-hold structural movement;
- Word Bank transfer/delete semantics;
- active Trees loading/deletion behavior;
- active camera/moat behavior including `checkMoatAndAutoFit`;
- `keyDispatcher` Shift+F ownership;
- current D3 zoom/layout/render behavior.

### Confirmed dead/no-op — removed in clean candidate

- unreachable Shift+W Word Bank-to-Trash branch;
- suppressed node double-click editor target handler;
- duplicate Tab listener registration;
- unreachable local-map Save path;
- duplicate Trees click registration;
- dead `enforceMoatForSelected` helper;
- superseded early `flyCenterToUID` declaration;
- superseded early `centerOnSelected` declaration;
- duplicate standalone Shift+F centering listener.

### Suspicious / order-dependent — do not remove speculatively

- remaining global keyboard listeners whose ordering is behaviorally significant;
- stacked Tab behavior whose combined output is regression-protected but whose individual responsibilities are not yet isolated;
- duplicate/helper-like logic around selection, Escape, navigation and structural commands;
- any remaining camera/helper overlap not independently proven dead or superseded;
- documentation/code mismatch around Dock select-all modifier;
- drag/drop branches that may participate in detector, history or animation ordering.

## Cleanup rule

For each cleanup candidate:

1. prove it is dead, unreachable, superseded or a semantic no-op;
2. add or extend regression protection around the observable surface;
3. remove only that responsibility;
4. run immutable-baseline verification + parity + hygiene/ownership tests;
5. stop immediately if parity changes and investigate the root cause rather than weakening the test.

Do not combine cleanup with architecture extraction or mobile redesign in the same checkpoint.

## Current exit status

The **high-confidence hygiene pass is complete for the current inventory**. The four confidence-3 rows classified as `dead`, `superseded`, or `duplicated` are `enforceMoatForSelected`, the early `flyCenterToUID`, the early `centerOnSelected`, and the Shift+F duplicate listener; all four have now been handled in the clean candidate with direct or structural regression protection. The immutable inventory rows remain in Supabase because they describe the historical v161 source, not because cleanup is pending.

The remaining suspicious code is active or order-dependent and should not be deleted merely to make the monolith smaller. The next checkpoint should be a **separate modular-extraction design checkpoint**, beginning with the smallest low-coupling boundary and preserving the full parity gate. No architecture extraction is part of this hygiene checkpoint.
