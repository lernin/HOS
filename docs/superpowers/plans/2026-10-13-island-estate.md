# The Island Estate Implementation Plan

> Execute inline using the executing-plans and verification skills. The user has
> supplied the implementation sequence and authorized the isolated Lab experiment.

**Goal:** Deliver a faithful, explorable three-level island mansion as a preview.

**Architecture:** React entry isolated through the existing entry router; direct
Three.js scene following Lab conventions. Shared curved layout drives rendering,
floor/section drawings and collision-aware multi-level navigation.

**Tech stack:** Installed React 19, Three.js 0.180, TypeScript, Vite and Playwright.

**Spec:** `docs/superpowers/specs/2026-10-13-island-estate-design.md`.

## Constraints

- `/island-estate`, titled The Island Estate, separate from `/ocean-estate`.
- Reference bundled locally and consulted at the defined viewpoints.
- Ground/first/roof at Y=8/14/20 m; no fictitious additional floor.
- Separate branch `feat/island-estate-20261013`; no merge or production deploy.
- No database changes, new package dependencies, or alteration of existing estate.

## Review focus

Phone touch gestures must not scroll the page or leave movement stuck. Navigation
must select the current floor when multiple floors overlap in plan. Pool and void
boundaries must block movement. WebGL failure must provide usable retry/back
controls. Visiting the route directly and returning to the Lab must work.

## Task 1 — Coordinated layout and navigation

Create `src/experiences/island-estate/layout.ts` and `navigation.ts`. Export
`WorldPoint`, `PointXZ`, `levels`, `outlines`, `stairPoint`, `isWalkable`,
`moveSafely` and `createNavigator().path(start,end)`. Curved outlines, terrain,
water bodies and colliders are the only spatial authority.

- [ ] Write/run missing-feature and route regression tests.
- [ ] Implement ground surface, two upper decks, both stairs and landings.
- [ ] Implement clearance-aware layered A* with physical stair links.
- [ ] Verify entrance → first-floor suite → rooftop route, water/void avoidance,
  stair ascent/descent and invalid inputs.

## Task 2 — Architecture, island and plans

Create focused `geometry.ts`, `architecture.ts`, `landscape.ts`, `environment.ts`
and `plans.ts` under the experiment directory. Geometry builders batch repeated
objects and dispose resources. Render traced flowing slabs, tapered curved
supports, glazing, open atrium, stepped helix, crown, terraces and crescent pool.
Add rocky island, coves, paths, dock, palms and restrained interiors.

- [ ] Generate plans and section from Task 1 data, including metre dimensions.
- [ ] Construct scene and verify model bounds, finite geometry and draw budget.
- [ ] Match ocean-facing silhouette and atrium views against the actual reference.

## Task 3 — Exploration and Lab integration

Create `scene.ts`, `IslandEstate.tsx`, scoped CSS and `src/island-estate-entry.tsx`.
Modify only entry routing, a sibling Lab card and Vercel rewrite. The scene
consumes Task 1 navigation and Task 2 geometry; the React UI owns camera modes,
lighting, reference/plan panels and pointer/keyboard input.

- [ ] Verify direct route, hub card and independent bundle loading.
- [ ] Add overview/orbit, walk, tap destinations, touch joystick and saved viewpoints.
- [ ] Add dimensioned drawings, reference comparison, help and render error UI.
- [ ] Browser-check desktop and phone controls; capture reference viewpoints.

## Task 4 — Review and preview

- [ ] Run build, focused route/geometry checks and applicable estate regressions.
- [ ] Obtain one independent whole-branch review and address material issues.
- [ ] Commit/push isolated branch, create draft PR, make one preview deployment.
- [ ] Verify preview READY, live route and asset responses; record evidence and
  limitations in `docs/island-estate-handoff.md` and the draft PR.
