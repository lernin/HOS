# LOGiQ legacy hygiene audit — checkpoint 1

Canonical workroom: HOS Issue #108  
Branch: `rebuild/logiq-v161-clean-mobile-20260915`

## Decision

Clean the recovered v161 runtime **before** modular extraction, but only where behavior can be proved unchanged. The immutable `/logiq-v161-legacy/` file remains untouched. The clean candidate applies deterministic hygiene transforms to that source and must continue to pass the v161 parity harness after every removal.

This avoids two opposite risks:

1. modularizing dead/superseded code and carrying historical junk into the new architecture;
2. performing a broad cleanup that accidentally changes behavior encoded in listener order or shared closure state.

## Confirmed safe removals in this checkpoint

Three paths are removed from `/logiq-clean/` only:

1. **Unreachable Shift+W Word Bank-to-Trash block.** `keyDispatcher` handles `W`/`Shift+W` earlier and returns, so the later Shift+W Word Bank-to-Trash block cannot execute. The regression test deliberately treats the earlier legacy Shift+W behavior as opaque and requires the clean candidate to match it exactly while proving the Word Bank is not cleared.
2. **Suppressed node double-click editor handler.** The SVG installs a capture-phase `dblclick` mute that prevents the event from reaching the node handler. Removing the target handler preserves the established behavior: double-click does not open the editor.
3. **Second identical Tab listener registration.** The same `tabDown`/`tabUp` callbacks are registered twice with the same event type and capture flag. Under DOM event-listener semantics the second registration is a no-op, so the clean candidate retains one registration.

`public/logiq-clean/legacy-hygiene.js` asserts the expected source shape before removing anything. If a future baseline no longer contains exactly the expected dead code, the clean candidate fails rather than silently editing an unexpected source.

## Regression protection

`tests/logiq-clean-hygiene.test.mjs` verifies that:

- exactly the three approved hygiene removals are reported;
- Shift+W behavior remains exactly equivalent to the immutable v161 route and does not clear the Word Bank;
- double-click remains muted;
- clean behavior matches the immutable v161 route for these cases.

The existing parity harness still compares visual geometry, typography, selection state, wrapped labels, links, full-tree coordinates, and drag-start/no-op geometry against v161.

## Audit classifications

### Active / preserve until explicitly extracted

- `state` hierarchy, history, Word Bank, selection/focus, drag/edit/zoom state;
- `utils`, `Detectors`, `dragManager`, `treeManager`;
- structural mutation helpers and Undo history contracts;
- keyboard navigation and V-hold structural movement;
- Word Bank transfer/delete semantics;
- current D3 zoom/layout/render behavior.

### Confirmed dead/no-op — removed in clean candidate

- unreachable Shift+W Word Bank-to-Trash branch;
- suppressed node double-click editor target handler;
- duplicate Tab key listener registration.

### Suspicious / superseded — **do not remove yet**

- multiple global keyboard listeners whose ordering may be behaviorally significant;
- duplicate/helper-like logic around selection, Escape, navigation and structural commands;
- legacy `savedMaps_v1` local-map functions that are partly unreachable from the normal UI;
- documentation/code mismatch around Dock select-all modifier (help says Ctrl while code checks Shift);
- old patch comments, stale labels and historical compatibility branches;
- drag/drop branches that look redundant but may participate in detector, history or animation ordering.

These require either direct call-site proof or a dedicated behavior test before removal.

## Cleanup rule

For each future cleanup candidate:

1. prove it is dead, unreachable, superseded or a semantic no-op;
2. add/extend a regression that captures the observable behavior around it;
3. remove only that responsibility;
4. run immutable-baseline verification + parity + hygiene tests;
5. stop immediately if parity changes.

Do not combine cleanup with architecture extraction or mobile redesign in the same checkpoint.

## Exit status

Hygiene checkpoint 1 is implemented. The next cleanup pass should inventory the remaining keyboard/listener and legacy-map surfaces and identify the next **provably removable** unit. Modular extraction remains gated until the high-confidence hygiene pass is complete.
