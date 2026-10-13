# The Island Estate — architectural preview

## Goal and branch

Ashley requested a separate Lab experiment reproducing the supplied Sculptural
Futurism island mansion. Branch: `feat/island-estate-20261013`, based on HOS
main `b998030353ae06c28648d1b1701b9f872837c82a`. Route: `/island-estate`.
No changes to existing Ocean Estate source, no database work, no production
deployment or merge. Ashley's 2026-10-13 steering: publish the whole-building
preview now; defer smaller refinements until he has seen it.

## Implemented

Reference PNG retained in the experiment. Coordinated three-level flowing shell,
curved white supports, glazed wings, central open atrium, two connected helical
stair flights, roof gardens, crescent infinity pool, island terrain, beach approach,
paths, dock and yacht. Overview and reference camera presets, daylight/sunset,
keyboard/touch walking, destination routes, reference comparison, dimensioned
plans/section and SVG download. Sibling card in the Lab; isolated entry bundle.

## Decisions

- Metres; X east, Z south, Y up. Floors Y8/14/20, architectural +0/+6/+12 m.
- Ambiguous conceptual scale resolved through consistent proportions and the
  reference's explicit six-metre level spacing.
- Roof pavilion moved north to keep its doorway on a real deck rather than over
  the atrium void. Graded beach and dock approaches preserve continuous access.
- Crown raised for adult headroom, with corrected outward normals.
- Ground floor recedes under the wider floating roof. Rendered terrain below the
  slab is lowered to prevent coplanar surfaces. Shared floors still support Y8.
- Navigation follows exact vertices; graph links use the same movement checks as
  the walker. Key release and graphics retry were corrected after independent review.

## Evidence and limits

- TypeScript/Vite build and initial WebGL render verified. No shader/runtime errors
  in the rendered aerial/front/roof/wing/atrium comparisons or plans download checks.
- Stair ascent/descent and twelve destinations from the entrance passed exact
  movement tests. Void/pool protection and invalid targets passed.
- All 144 ordered routes passed the expanded real-time follower check before the
  final massing/garden update. Latest run passes 6/7 tests: the 144-route check
  now exposes a **dining → beach** terrain-segment stall. This remains open.
- Toolbar-focused key release and WebGL context-loss recovery passed browser tests.
- Full desktop/phone script stopped at its keyboard displacement assertion in
  software WebGL. Full phone interaction/performance acceptance is not claimed.
- Photoreal asset dressing, interior completion and exact reference fidelity remain
  refinements. This is a visual architectural preview, not a completed replica.

## Independent review

One read-only reviewer found waypoint corner cutting, untraversable graph edges,
focused key-release/Escape handling, lost-context retry and crown headroom/normals.
Fixes were implemented and covered by regressions. Fixed coffee tables and chaises
now have shared footprints; dead-worker destination requests are rejected.
No claim of a second review or final reviewer certification.

## Next step

Ashley reviewed the first preview and found the architecture too generic. His
feedback prioritized sweeping structural form and the exceptional cliff walkway.
The follow-up pass adds lofted roof ribbons, branching wing supports, and a swept
promenade with an underside, low parapet, and rock ties. A dedicated Cliff promenade
camera was added. `npm run export:island-estate` regenerates a portable GLB from
the same shell geometry as the viewer; the editable shape control points are in
`sculpture.ts`. The browser and GLB stay driven by the same metre-based layout.

Next: compare the new viewpoints side by side with the original image, then tune
the primary silhouette. Finish the known terrain-route/follower issue and real-phone
controls verification after massing is approved. Merge and production release
require separate approval. Preview URL and exact commit belong in draft PR #204.
