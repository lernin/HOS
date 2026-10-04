# Ocean Estate tree studies and spa planting

Ashley approved three improved actual 3D specimens on October 4, 2026, after rejecting the spa tree's blunt roots, tube branches and foliage blobs. Work continued October 5. This is a bounded preview change to the existing Design Lab and spa.

Branch: `feature/ocean-estate-tree-studies-20261004`, based on `14f7a3db6c035598c17a2c4300a0c9d8c4082002` / draft PR #183. That preview already includes the unmirrored Plan, spa dome and extended north pool. Main and the prior preview branch were re-fetched before publication; no overlapping changes were found. Production merge/deployment is not authorized.

## Result and decisions

- `tree-studies.ts` builds Airy Ornamental, Branching Courtyard and Broad Shade using one reusable geometry/material family, with deterministic variation. Closed tapered curved wood, individual curved leaf blades, slender twigs and varied crowns replace the spa's constant-width tubes and foliage blobs. The trunk widens continuously below the soil; separate exposed radial roots were removed.
- Only the spa's `tree-west-arrival` uses the new Airy Ornamental. Other island trees and Woodland Walk remain as they were, pending Ashley's choice of a shared family. The builder depends on the estate geometry kit, not terrain, so it can be reused later; forest instancing/LOD integration remains future work.
- The spa bed has six irregular low fern patches and three fine-leaved grass patches, with visible soil and a clear trunk base. All planting stays within the bed; slab opening, dome and movement collision are unchanged.
- Trees in Design Lab now offers the three specimens, with Whole tree, Trunk & planting and Canopy controls plus drag-to-orbit. `?gallery=trees` opens the first specimen directly. Existing nine Tree Styles are earlier canopy sketches and remain available; they are not the new shared family.
- Lab study identity survives material batching, allowing selected specimens to be isolated. Whole tree fits the actual world bounding box between the header/panel and side margins, including phone portrait and landscape. Landscape controls collapse descriptions to preserve useful viewing space. Lighting follows the selected gallery.
- Plan and walking view use the same spa geometry. No reconstructed plan overlays or coordinate changes were introduced.

## Files

`src/experiences/estate/tree-studies.ts`, `design-lab.ts`, `design-lab.css`, `environment.ts`, `spa-dome.ts`, `kit.ts`; `tests/ocean-estate-geometry.spec.ts`, `ocean-estate-visual.ts`, `ocean-estate-tree-visual.mjs`.

## Verification and limits

- All 52 estate/geometry/navigation/village tests passed. The canopy clearance test originally selected the new underplanting Group; it now selects the actual elevated tree and retains its nonzero vertex check.
- Full TypeScript/Vite build passed, with the existing large Three.js bundle warning.
- Actual Chromium Plan parity passed: all seven patio screen picks, zoom/resize/drawing alignment, pool void and actual estate image in PNG export.
- Targeted actual Chromium visual run captured all three specimens, base/canopy/orbit, phone portrait/landscape, and spa base/canopy/roof. Zero JavaScript page errors. Images were visually inspected, not inferred from DOM assertions. The first captures exposed camera cropping; Whole tree fit and compact landscape controls were corrected.
- A read-only reviewer independently checked finite geometry, planting bounds and batching metadata. Fern vertices were inside the inner Lab soil ellipse; no root/planting overspill was found. Reviewer identified phone framing/light defects, which were corrected before publication. A final minor soil shadow-band issue was addressed with the same sun shadow bias used by the estate. No critical/important findings remain.
- SwiftShader spa dome observation: 256 draw calls, about432k triangles, versus the prior preview's255/~398k. This is software rendering evidence, not physical Samsung frame-rate validation. The new family is deliberately limited to the focal spa tree until visual/performance acceptance.

## Next step

Review Trees in the Lab, using trunk/canopy controls and drag-to-orbit, then visit Spa in the same preview. Choose the shared family before replacing island/forest populations. This is visual polish for HOS; it does not advance Procedia's basic launch path. Production merge and any wider forest conversion are separate decisions.

Preview URL, final commit and PR are recorded in the canonical Ocean Estate workroom, HOS issue #79, after deployment readiness is verified.

## October 5 foliage follow-up

Ashley requested more foliage. Each twig now carries twice as many leaves, with slightly larger blades, across all three studies and the shared spa tree. The extra leaves use an independent deterministic random sequence, preserving the existing branch shapes and original leaf placement. Dome clearance and all52 estate/geometry/navigation/village tests passed again, full build passed, and the actual Lab/spa/phone visual run finished with zero JavaScript page errors. Fuller foliage was visually inspected. Software-rendered desktop dome view is now256 calls/~450k triangles (previous tree study256/~432k); physical phone performance remains acceptance work.
