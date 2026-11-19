# STAX Blueprint Geometry — Source Audit and Implementation Contract

**Status:** Source observations verified; implementation gaps identified. **Not a claim of pixel-perfect code.**  
**Owner:** Ashley / STAX. **Date:** 2026-11-20.  
**Reference:** [staxBLUEPRINT (native Google Slides)](https://docs.google.com/presentation/d/1c2SwUuZ6K2cJeeA1OPNtLUEspX8IzyNPyZo64hK6hPs/edit), especially the slide headed **STAX QUEST level: 13**, the first full-page measurement overview, and the shape-family study (slide 24). Six owner-supplied screenshots were inspected on 2026-11-20, including the full measurement overview, enlarged Level 13 alignment constructions, and the 10-column colored/black/dashed/filled shape family.

## Intent: relative geometry, not absolute pixels

The source is deliberately designed to preserve a **resonant family of shapes** and **relationship-specific placement**. Absolute on-screen pixels may vary with zoom/viewport. Preserve ratios, contours, alignments, and the exact reference gap categories in the native source coordinate system. Do not infer canonical dimensions from arbitrary screenshot size, which includes browser zoom and outlines.

### Authoritative geometric invariants (owner confirmed)

1. **Single child under any parent:** the **RIGHTMOST EDGE of the child** touches the parent's vertical centerline in X, i.e. `child.x + child.width = parent.x + parent.width / 2`. The child sits below, with a relationship-specific vertical clearance (often `.28` in the diagrams). This is a **global** under-port rule, not limited to blue noun heads.
2. **Two or more children:** arrange the *entire sibling row/group* about the parent's vertical centerline, preserving consistent inter-child gap. Child shapes in a row share the designed vertical alignment. Do not simply keep the first child's singleton anchor when a second is added: **reflow both**.
3. **Nested children:** a child can be a parent of its own mini-family. Parentage is explicit and top-down; `n` starts a new family **of any size**, not a sideways magnet to the previous word. Orange `very` goes **below** its real green parent `big` under blue `car`, never beside purple `a`.
4. **Port and glow consistency:** a magnet's eligibility outline must show the **actual final positions for all impacted shapes**, including recentering siblings. Hover and final release must call the same layout calculation. Moving an attached family should preserve its geometry.
5. **Single source palette item:** green/orange size variants are selected by **attachment role/location**, not separate size buttons. This does not mean small and large shapes have equal silhouette ratios.

### Measurements visibly annotated in the owner screenshots

| Annotation | What is visually established | Implementation guidance |
|---|---|---|
| `.07` | Original underlying quantization unit (earlier Blueprint specification) | Fundamental unit; all approved spacing derives from it |
| `.28` | Repeated beneath-parent clearance and between-supporters gap examples | `4 × .07`, but apply to the specified relations, not everything |
| `.49` | Repeated head/sequence transition or local group offset | `7 × .07`; don't interchange with `.98` |
| `.98` | Explicit diamond-to-blue separation in full overview | `14 × .07` — **not** `.49` |
| `2.03` | Labeled horizontal span in Level 13 construction | `29 × .07`; confirm each endpoint in original deck before generalizing |
| `.56`, `.77` | Additional labeled spans in the full overview | Present in source; their exact relationship-specific endpoints must be transcribed from native slides before encoding |

**Caution:** These are graphical *measurements of relationships*, not a license to substitute each number for every gap. Some screenshots are cropped/zoomed; no per-connection absolute pixel value is canonical.

### Shape set and relative proportions observed

The final screenshot contains **10 source silhouettes across**, repeated in colored outline/light-fill, black outline, dashed, and black-fill/colored-outline rows. The ten are: red triangle, large blue circle, pink square, yellow diamond, larger orange hexagon, larger green oval, smaller green oval, smaller orange hexagon, purple horizontal rectangle, **smaller blue circle**.

For a reproducible cross-check only, segmenting the colored first row of the owner-uploaded `1000168305.jpg` yields these screenshot outer bounding boxes (including stroke); they **are not canonical sizes**:

| Shape from first row | Displayed bounds (px) | Width / large-blue width | Height / large-blue height |
|---|---:|---:|---:|
| Red triangle | 168 × 130 | 1.302 | 1.016 |
| **Large blue circle (baseline)** | **129 × 128** | **1.000** | **1.000** |
| Pink square | 84 × 84 | 0.651 | 0.656 |
| Yellow diamond | 89 × 128 | 0.690 | 1.000 |
| Larger orange hexagon | 102 × 60 | 0.791 | 0.469 |
| Larger green oval | 138 × 77 | 1.070 | 0.602 |
| Smaller green oval | 118 × 66 | 0.915 | 0.516 |
| Smaller orange hexagon | 93 × 60 | 0.721 | 0.469 |
| Purple horizontal rectangle | 94 × 60 | 0.729 | 0.469 |
| **Smaller blue circle** | **99 × 100** | **0.767** | **0.781** |

Native Slides dimension × effective transform should take precedence over screenshot bounds (SVG strokes, antialiasing and margins cause small differences). Slide 24 contains blue ellipses with scale `0.4359` and `0.3353`, a small/large ratio `0.3353 / 0.4359 ≈ 0.7692`, consistent with the photographed small blue.

### Verified discrepancies against HOS at PR #268 (2026-11-20)

Code reviewed: `src/experiences/stax/model.ts`, `MoleculeBoard.tsx`, and `SymbolCanvas.tsx` on branch `preview/stax-parent-first-mini-families-20261120`.

1. **Missing small blue:** The current active magnetic canvas has only one `circle` size and no role-driven little-circle variant, despite the screenshot's unmistakable smaller blue and the source slide's second blue ellipse. Do not infer its grammatical use without consulting STAX POS/owner, but preserve the geometry and add variant support when implementing.
2. **Incorrect diamond↔blue spacing:** Owner's overview explicitly labels `.98` between a yellow diamond and the adjacent large blue circle. The current `MoleculeBoard.bestSnap` uses `BLUE_RED_GAP = .49` whenever either shape is a diamond. Needs a distinct source-verified connector `.98` rule.
3. **Classic editor singleton limitation:** `model.ts arrange()` currently uses `loneSupport = n.kind === 'circle' && n.below.length === 1`. Owner confirms **one-child right-edge anchor for every eligible parent** (including green→orange and red→orange), so the classic layout engine is inconsistent. Magnetic board handles several cases separately; both editors need one geometry contract.
4. **Nested family extents:** Current magnetic `blueSupportPositions()` centers direct children using only their own widths/heights. Grandchildren may extend beyond their parent and change visual subtree extents. Measure and lay out subtree bounds where the source requires the **whole family** centered; don't let deeper mini-families overlap neighbors.
5. **Shape sizing is closer, but not certified exact:** `model.ts` derives seven base dimensions from Slide 24 and magnetic green/orange apply distinct X/Y variant scales. Those are meaningful improvements. However native slide group transforms, outline treatment and all ten reference silhouettes have **not** been exhaustively matched/tested. Avoid claiming exactness from ratio-only calibration.
6. **Geometry law spread across code:** `model.ts arrange()` and `MoleculeBoard` have independent spacing and positioning calculations. This invites drift even if each patch locally matches a screenshot. The desired direction is one source-derived, testable geometry resolver shared by render, eligibility outline, snap-on-release and any “Quest” reconstruction.
7. **Source semantics remain distinct:** STAX POS `n` is a new family indicator; do not infer magnetic neighbor bonds from reading order. Preserve owner-confirmed parent/child placements and don't equate the directional permission matrix with the coordinates table.

## Acceptance checks for implementation (not yet executed)

- One child under BLUE, RED and GREEN: `child.right == parent.centerX` within a small world-space tolerance.
- Add a second child: previous child and new child reposition symmetrically as a grouped row; inter-child gap equals the annotated source gap (e.g. `.28` for the illustrated supporter row); parent position remains fixed.
- Remove a child from the pair: remaining child returns to its single-child right-edge anchor.
- Blue–red–blue stair step respects its own `.49` / `2.03` relationship-specific offsets; diamond→blue respects `.98`.
- Blue noun with purple determiner and one green adjective, then orange nested below green: exactly one down-directed family bond, no accidental purple→orange predecessor attachment; child under-green alignment follows singleton rule.
- Snapshot outline silhouettes and context variants against native Slide 24, **including small blue**, without changing unrelated experiments.
- Stretch/zoom/rotate: all logical ratios remain unchanged and click/touch/gesture placement uses shared world coordinates.
- Verify Classic and Magnetic editors produce equivalent geometric compositions for the same structural AST.

## Scope / next decisive step

This is a **reference audit**, not a behavioral patch. It intentionally does not rewrite the shape engine or merge/deploy anything. The smallest effective implementation step is a **pure geometry module with tests for single-child, two-child and nested-child layouts**; then wire the same resolver into hover/glow and snapping. Keep the preview-only branch model and verify no active worker is changing those files before edits. No Supabase production or staging work is needed.

