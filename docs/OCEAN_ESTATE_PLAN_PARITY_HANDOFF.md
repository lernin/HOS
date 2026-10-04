# Estate Plan geometry parity — 2026-10-04

Ashley reports patio areas in Estate Plan that do not match the walkthrough. This change is based on draft PR #181 at `3c567c1e6ecc08f3ad613860a446c60a43abdf7a`, on separate branch `fix/ocean-estate-plan-scene-parity-20261004`. It does not merge or deploy production, change the patio footprints, or modify another worker's branch.

## Verified findings

- Both views currently use the same seven patio coordinates. The particular perceived extra/missing patio has not been reproduced. Comparing a different preview or production revision remains a possible cause; use the same preview's **3D house** / **Plan** buttons for comparison.
- `kit.finish()` erased slab metadata when batching. The planner therefore could not identify actual floor meshes despite its source-text test passing.
- The plan built a different architecture variant with roofs omitted, but retained overhead lintels and pergola beams. Those obscure openings and paving in an overhead view.
- PNG export serialized only the SVG overlays and omitted the live estate image.
- A faded status message intercepted selection-card taps indefinitely.

## Changes

The complete architecture is now built identically for both views. Roofs, lintels, ceiling fins, arrival canopy and pergola beams retain an overhead tag through batching; only their visibility is changed in the plan. Actual floor slabs retain individual mesh identity and their original world geometry through batching. Export embeds a fresh, mirrored, viewport-cropped render beneath the annotations. Status messages no longer intercept taps.

The plan intentionally remains an overhead cutaway: roofs/overhead beams are hidden, while ground surfaces, walls, furniture and landscape use their original geometry. Artwork installations and locally chosen interior material finishes remain walkthrough-only; this does not claim complete appearance parity. Floor geometry has not been expanded, reduced or moved.

## Verification

- Two new behavioral geometry tests were demonstrated failing before the geometry fix, then passing. They assert rendered P1–P7 world bounds and raycasts after batching, the pool void, and independently hideable overhead pieces.
- 45 estate, geometry and Waterfall Village navigation tests passed.
- Full app build passed; existing large-chunk warning remains.
- New real-browser parity check passed: all seven patio screen picks, zoom alignment, portrait/landscape/desktop resizing, persistent drawing coordinates and actual estate content in PNG export. The export assertion failed before its fix. The drawing/resize check exposed the status-message pointer interception before its fix.
- Existing full estate WebGL/UI suite completed its render and interaction checks but failed its final console gate on seven external-resource `ERR_EMPTY_RESPONSE` errors. A separate network trace confirmed unavailable Wikimedia/National Gallery artwork URLs and the existing material catalog request. Do not report this run as an all-pass render suite.
- Chromium/SwiftShader is software rendering, not a Samsung S23 Ultra performance check. Current walkthrough render diagnostics: 274 calls, 358,884 triangles, pixel ratio 1.

## Next decisive step

Review the same area's plan and walkthrough within one preview revision. If a patio still differs, identify that location in both views and inspect the actual occluding objects or surface there. Do not change slab dimensions based on the overhead image alone. Keep production acceptance separate.
