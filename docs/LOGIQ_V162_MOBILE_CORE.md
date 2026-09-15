# LOGiQ mobile-core acceptance candidate

This document is the current source of truth for `/logiq-v162-mobile/`. The older v161 preview document describes the recovery layer and may contain historical behavior that v162 has superseded.

## Product boundary

- One Paper/LOGiQ product; mobile is an adaptive interaction layer, not a second product.
- Current acceptance route: `/logiq-v162-mobile/`.
- Production merge remains gated on physical-phone approval.
- Working Lock protects structure while preserving navigation and deliberate rename/edit.
- Presentation Lock is deferred and will be fully read-only/PIN-protected.

## Mobile interaction contract

- One finger pans from anywhere.
- Two fingers pinch from anywhere; interactive zoom floor is `0.02`, so Fit can remain fully zoomed out without snapping to the old `0.4` floor.
- Fast directional flick creates a related card.
- Stationary hold (`280 ms`, `8 px` slop) starts structural branch drag.
- A held card means exactly that card plus its descendants; stale desktop multi-selection is cleared first.
- Drag preview preserves rendered card/label size.
- The complete source branch remains as an independent frozen ghost at its original position for the entire held gesture. It does not depend on the live SVG nodes surviving a redraw.
- If the moving branch representation ever loses a descendant during the gesture, the drag cancels and restores the pre-drag state rather than degrading to a root-only move.
- Blank-background release is an exact no-op/snapback.
- Only a live green node target or green caret commits a reparent.
- Edge auto-pan remains available during active drag.

## Drag interruption safety

Mobile browsers can steal focus or a pointer-up event for browser UI, password prompts, system overlays, or app switching. A watchdog therefore cancels an active structural drag on:

- window blur;
- page hide;
- document becoming hidden;
- lost pointer capture;
- a second touch during an active branch drag;
- six seconds with no pointer event while a drag remains latched.

Cancellation dispatches `pointercancel`, removes drag UI, ends the legacy drag lifecycle, and restores the exact pre-drag tree + Word Bank snapshot if anything changed. A browser interruption must never leave the map drifting or structurally half-moved.

## Single-owner access

LOGiQ is currently operated as a single-owner tool.

- Production map RPCs remain credential-guarded.
- The owner PIN was rotated in production through migration `rotate_logiq_owner_pin`; source code contains no plaintext PIN.
- On an accepted device, v162 remembers the owner credential locally so the browser does not repeatedly ask for access.
- The owner-code field is deliberately **not** an HTML password field and disables form autocomplete, preventing Google Password Manager from treating it as a website login.
- If the backend rejects the remembered credential, the remembered device copy is cleared.

The remembered credential currently lives in browser local storage on the trusted device. That is appropriate for the present single-owner prototype but is not the final multi-user/security architecture. If stronger cross-device security becomes necessary, replace it with a revocable opaque device token rather than broadening PIN exposure.

## Working Lock

- Visible locked/unlocked icon on desktop and mobile.
- Saved per map on the client during this preview.
- Locked state blocks drag/reparent, flick-create, delete/Word Bank structural moves, Add, and Mix.
- Pan, pinch/zoom, selection, Fit, and deliberate rename/edit remain available.
- Cross-device persistence should move to the map record before Working Lock is considered fully finished.

## Verification gate

CI must pass all of the following before a preview is offered for acceptance:

- build;
- static LOGiQ regressions;
- legacy desktop/mobile/offline smoke tests;
- v162 gesture interaction smoke;
- frozen-origin regression proving Node 09 + Nodes 22/23/24 remain visible at the source even if live SVG ghost classes disappear;
- partial-branch regression proving a lost moving descendant hard-cancels without changing the map;
- owner-device regression tests;
- browser interruption smoke proving a latched Node 09 branch drag cancels on blur and leaves the complete map unchanged.

Automated browser tests intercept Supabase RPCs and do not write production map data.
