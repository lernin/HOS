# Ocean Estate: glass dome, patio corner and north pool extension

Ashley authorized all three proposed changes on 2026-10-04. Entrance → house → pool is north (negative world Z).

## Branch and dependencies

`feature/ocean-estate-spa-pool-20261004`, based on map-parity commit `170c38ddb0ef7bf1938860b0630ee27909d7af6e` from draft PR #182, itself stacked on #181. Production main and the prior preview branches were inspected before editing; no overlapping edits were found. The old September pointer in HOS #79 is stale relative to October work.

Preview-only. No production merge/deployment, database or security changes.

## Result

- Spa tree moved 2.7m west and 0.3m north to sit within the spa roof, with its base raised to the planted pocket. Treatment table moved west to preserve circulation; the existing Spa destination remains reachable.
- An oval glass dome (9.4 × 10.3m footprint, base Y10.18, rise4.6) has bronze-finished ribs, divided glazing, stone perimeter support, drainage channel and a raised crown ventilation cover. All three flat roof layers have real elliptical openings. The spa slab has a real planted-pocket opening, with a low travertine border and soil.
- Pool is 23 × 36m, extending 24m north, with its house-side edge unchanged. Water, tile bed, side walls, retaining walls and infinity overflow derive from the same pool bounds. Both 4m side walks now reach Z-60; outer guards wrap the tips.
- Lookout P6 now spans X27..44,Z-24..-12 and Sunrise P5 X39..44,Z-12..14. The slabs meet without overlap. R2/R3 join at one post at (43.885,-23.885).
- The northern terrain stretches smoothly, including rocks and scattered vegetation, while southern arrival terrain and all house positions stay fixed. No uniform island scaling.
- Navigation grid bounds derive from current slabs. Guard collision derives from railing polylines, so revised render, audit and movement cannot disagree through stale hand-written railing rectangles.
- Plan fit covers the full extended pool. The live 3D cutaway still hides the dome/roof overhead while exposing the actual tree and floor pocket. Patio IDs and existing note world coordinates stay intact; labels move with the water.

## Files

`site-layout.ts`: pool, dome/pocket, tree and terrain/view dimensions.
`spa-dome.ts`: roof/floor openings and framed dome/pocket builders.
`environment.ts`: shared architecture, terrain, guards and water.
`kit.ts`: separate double-sided transparent dome glazing.
`plan.ts`, `railings.ts`, `navigation.ts`: actual slab footprints, furniture, guards and routes.
`EstatePlan.tsx`: shared fit extents and water labels.
`tests/ocean-estate-geometry.spec.ts`, `tests/ocean-estate.test.mjs`, `tests/ocean-estate-plan-parity.mjs`, `tests/ocean-estate-visual.ts`: geometry/navigation/plan checks and inspection views.

## Verification

- New spa tests first failed at the original flat ceiling (Y9.4625) and original tree position, then passed. New pool tests first failed on P2 Z-36 instead of -60, old water extent, unreachable far walks and old coastline, then passed.
- `node --test tests/ocean-estate.test.mjs tests/ocean-estate-geometry.test.mjs tests/waterfall-village.test.mjs`: 52/52 passed after review fixes.
- `npm run build`: passed, existing large Three.js chunk warning.
- `ESTATE_CHROMIUM_PATH=/workspace/scratch/cd02814a3d1d/browser/chromium node tests/ocean-estate-plan-parity.mjs`: passed new far-walk/corner picking, physical left/right, old notes, zoom, three viewport sizes, drawing and actual-image PNG export.
- Actual Chromium SwiftShader views visually inspected: spaDome, spaRoof, poolLong, poolEnd, patioCorner, northCoast and aerial. Zero JavaScript page errors. Eye-level dome view 255 calls/~398k triangles; whole-site aerial430 calls/~606k triangles. These are software-renderer observations, not Samsung hardware performance evidence.
- The older full render/UI console gate was not claimed as passing; external artwork/catalog resources can be blocked in this environment.

## Acceptance

Review the preview in both Plan and 3D house. Use Places → Spa to inspect the dome and Pool to inspect the long axis, then walk along either pool side to the far edge. Review phone frame pacing. Actual construction would require structural/glazing design; this is a model design study.

## Fresh review

Read-only reviewer independently ran 51 tests and inspected the model, finding buried dome perimeter trim and a canopy test accidentally selecting soil. Both findings were reproduced with failing tests and fixed: base raised 0.38m; actual tree Group selected with a nonzero checked-vertex assertion. The canopy itself was already clear; reviewer measured ~1.19m minimum clearance to sampled actual glass panels before the further raise.

Review limitations: physical-device frame pacing remains Ashley's phone acceptance; production is intentionally not part of this preview; structural/glazing certification is not part of the model; fresh interactive phone/export behavior was verified by the implementer's Chromium parity run rather than the reviewer. No deferred code findings.
