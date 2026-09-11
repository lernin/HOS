# Ocean Estate

Workroom: [HOS #79](https://github.com/lernin/HOS/issues/79). Review: [PR #80](https://github.com/lernin/HOS/pull/80).

## Goal and boundaries

Ashley requested a warm modern oceanfront estate in The Lab, using the supplied Horizon Estate plan as its primary spatial reference. This branch adds `/ocean-estate` behind the existing Lab gate. It does not change authentication, database state, existing 3D scenes, deployment enablement or production. Merge and production release require Ashley's separate approval.

Branch: `feature/ocean-estate-20260911`, based on HOS main `aab1e7126a3f768692e0ab928f5c1e1e30e33523`. The current Workroom pointer, Procedia #34, is retired; the scene has a dedicated room in HOS. Active village PRs #74, #77 and #78 were inspected before editing. The only existing application integration files changed are `src/main.tsx` and one rewrite in `vercel.json`.

## Experience

- Central arrival steps, open pivot doors, foyer and tall great room lead to the ocean terrace and infinity pool.
- Western dining/kitchen, family lounge, courtyard, media room and fitness/spa wing; eastern primary suite, dressing room, bath, three different guest suites and library follow the reference's arrangement.
- Original modeled furniture includes rounded upholstery, bedding, sculptural tables, cabinetry, fittings, pendants and piano. Landscaping combines an irregular raised coastal site, rock groups and stylized branching trees, palms and grasses.
- Explore is the default: tap a visible walkable floor, drag to look. Movement accelerates and slows, uses gently assisted heading after the user stops dragging, and has no head bob. Desktop supports WASD/arrows and Shift; no pointer lock is necessary.
- Walk allows holding the lower screen to move while dragging to steer. Places routes to ten destinations; a simple optional Tour follows those routes.
- Settings cover speed, sensitivity, mode, resolution quality, daylight/golden/evening and ambience volume. Preferences are device-local. Blur, backgrounding, settings and graphics-context loss stop movement; audio is opt-in.

## Implementation and meaningful departures

The existing Three.js 0.180 / React / Vite stack, lazy routes, namespaced preference pattern, seeded geometry helpers and static material batching are retained. The village controls were not rewritten: its joystick/elevation system is specific to that scene.

`estate/plan.ts` is the shared spatial source. Walls/glass and major furniture footprints feed the clearance-eroded A* grid in `navigation.ts`. Paths reject corner cutting and steep discontinuities, then smooth only through verified clear segments. Runtime movement uses the same collision and slope constraints. A circular arrival court replaces the reference image's approximate road footprint, and the north shoreline drops below the infinity edge to keep the ocean sightline clear.

Stone, wood and fabric use world-space procedural material variation rather than large texture downloads. Rounded furniture is original geometry, not copied branded assets. The renderer batches static geometry, limits the number of dynamic fill lights, caps pixel ratio by quality and caches sunlight shadows. Water has animated normals/waves, depth coloration, caustic-like modulation and sky highlights; it is an economical approximation, **not ray-traced reflection or physically traced refraction**. Mirrors use restrained tinted reflective materials rather than extra scene cameras. The default is warm golden hour, with fixed presets instead of an elaborate time simulation.

This is a first playable architectural environment. Secondary rooms and decorative detail are less complete than the major spaces. It is not a finished photoreal architectural visualization, and the full high-fidelity target must not be claimed solely from a successful build. Fine furniture/stone realism, more detailed secondary amenities, stronger reflected lighting and actual phone performance remain acceptance work. No learning activities are included; the scene supports comfortable exploration but does not complete Procedia's durable child learning loop.

## Verification

`npm run build` compiles the complete Lab and lazy estate chunk. `node --test tests/ocean-estate.test.mjs` verifies every destination in both directions, access to every enclosed zone, continuous collision-safe traversal, glass/wall/furniture/pool/cliff exclusion and the entry ramp. Existing Waterfall Village tests are retained and also run to catch integration regressions.

`.github/workflows/ocean-estate-review.yml` runs only on this branch. It builds, runs route tests, renders actual WebGL views, captures 412×915 phone layouts and exercises settings and destination controls. Review images and console evidence are uploaded as Actions artifacts. The test-only HTML entrypoints are not production Vite build inputs and do not add a production gate bypass.

First render run `34543470624` had zero WebGL/JavaScript console errors and captured the scene, but its UI test failed on an ambiguous Light label. Visual inspection also found downward terrain normals, overhead gaps and excessive ambient light; those were corrected. Do not cite that failed run as an all-pass gate. Later run evidence belongs in #79 and the PR.

The managed preview browser rejected the internal preview address before loading the app. GitHub Actions uses Chromium SwiftShader for rendered evidence. Neither result establishes Samsung S23 Ultra GPU performance, physical touch comfort or audio quality.

## Next decisive step

Review the corrected render artifacts and complete the automated phone UI gate, then open a separately authorized preview on Ashley's S23 Ultra. Walk entry → great room → pool → courtyard → kitchen → primary suite → entry, try drag/tap discrimination and Walk mode, pause/background/resume, and verify that speed, visibility and warmth feel comfortable. Keep any production merge/release separate from this acceptance.
