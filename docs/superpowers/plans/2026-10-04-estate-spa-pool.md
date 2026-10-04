# Ocean Estate Spa and Pool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Ashley's approved dome, completed patio corner and 36-metre pool as one navigable, reviewable estate preview.

**Architecture:** Keep dimensions in site-layout.ts, slab identities in plan.ts, and rendering in shared architecture/landscape/waters builders. A focused spa-dome.ts module builds roof openings and the framed dome. Navigation and guard collision derive from the same floor and railing data.

**Tech Stack:** Existing TypeScript, Three.js 0.180, React, Vite, Node test runner and Playwright.

**Spec:** docs/superpowers/specs/2026-10-04-estate-spa-pool.md

## Global Constraints

- Entrance through the house toward the pool is north (negative world Z).
- Shared 3D geometry remains the only plan base.
- Preview only. Do not merge, deploy production, change databases or change other Lab experiences.

## Review Focus

- Tree crown must clear the dome across its whole mesh, not only at its highest point.
- Floor and roof openings must survive geometry batching and plan cutaway.
- New pool ends must remain reachable through A* when the direct path crosses water.
- The joined patio corner must have one continuous guard without duplicate posts or overlapping slabs.
- Phone fit, pick, annotation and PNG export must cover the extended pool in the corrected orientation.

### Task 1: Spa dome and tree pocket

**Files:** site-layout.ts, plan.ts, environment.ts, kit.ts, new spa-dome.ts, tests/ocean-estate-geometry.spec.ts.

**Interfaces:** site-layout exports spaDome and spaTreeBed dimensions; spa-dome exports slabWithOpening(kit, bounds, y, height, material, parent, opening), buildSpaDome(kit, overhead). Builders consume EstateKit; floor identity remains on the actual slab.

- [ ] Add behavioral ray tests: upward rays through the tree hit raised glazing rather than the flat ceiling; an outside ray still hits the spa roof. Verify the tree pocket is an actual floor opening and the full canopy clears the dome.
- [ ] Run `node --test tests/ocean-estate-geometry.test.mjs`; expect failures against the flat spa roof and original tree position.
- [ ] Build oval openings, perimeter support, segmented glazing, bronze-finished ribs, crown vent and drainage ring. Move tree/table and add planted-pocket collision.
- [ ] Run geometry and estate navigation tests; expect all spa tests and existing routes to pass. Commit task.

### Task 2: Pool, patio and headland

**Files:** site-layout.ts, plan.ts, environment.ts, railings.ts, navigation.ts, EstatePlan.tsx, geometry and parity tests.

**Interfaces:** poolWater defines all pool components. R1/R2/R3 define geometry, audit and guard collision. coastZ applies a smooth northern displacement. Navigation derives grid bounds from floors. Plan fit uses shared view bounds.

- [ ] Add rendered water bounds and slab-picking tests at (-13,-58), (14,-58) and (42,-22). Add a route from one far walk to the other, rejecting water, soil and crossing guards. Verify northern terrain follows the new coastline.
- [ ] Run geometry tests; expect water, far walk and patio failures.
- [ ] Update pool water, bed, walls, overflow, walks, corner slabs, guards/collision, terrain and plan fit. Use nonoverlapping P5/P6 footprints and one shared corner post.
- [ ] Run `node --test tests/ocean-estate.test.mjs tests/ocean-estate-geometry.test.mjs tests/waterfall-village.test.mjs`, `npm run build` and Chromium parity/visual checks. Inspect dome, patio and pool from eye-level, roof and phone views. Commit task.
- [ ] Request a fresh whole-branch review; resolve important findings, save draft PR/ready preview, and leave HOS #79 handoff.

## Execution record

Native implementation authorized by Ashley's request to make all approved changes. No repeated design approval required.

Task 1 complete: ad4c494; flat roof and original tree position failed the new ray/canopy tests before implementation. Geometry plus estate navigation: 39/39 pass after implementation.

Task 2 implementation complete: old pool surface, old slabs, unreachable far walks and old shoreline failed the new tests before implementation. Geometry/estate/village: 51/51 pass. Chromium plan checks pass for new far-walk picks, squared corner, legacy notes, zoom, portrait/landscape/desktop resizing, drawings and PNG export. Seven targeted actual WebGL views inspected (spa interior/roof, long pool/end, patio corner, northern coast, aerial); zero page errors. Whole-branch review and remote preview pending.

Final review: one Important roof-junction finding and one test-quality finding (regraded Important because it invalidated canopy regression coverage). Both reproduced RED before correction: exposed-perimeter ray test and nonzero canopy vertex count. Both fixed; geometry/estate/village suite52/52 and full build pass. No deferred minors.

Final: Ruling: base Y9.8 buried the curb/gutter below the existing roof — raise it 0.38m to Y10.18, preserving the dome form and exposing a clean perimeter joint — cost if wrong: a slightly taller dome, reversible in preview.

Final: Ruling: physical phone frame pacing set aside by reviewer — retain as Ashley's hardware acceptance; software rendering proves geometry/layout only — cost if wrong: device performance needs further tuning.

Final: Ruling: production deployment set aside — preview only follows Ashley's separate production-approval rule — cost if wrong: production still shows the earlier estate until approved.

Final: Ruling: construction engineering set aside — treat dimensions as a model study requiring structural/glazing design before building — cost if wrong: this model cannot be used as certified construction drawings.

Final: Ruling: reviewer did not rerun phone/export browser flow — implementer's fresh parity test covers far tips/corner, legacy notes, three viewport sizes, zoom, drawing and export — cost if wrong: a physical touch/interaction defect may still need phone acceptance.
