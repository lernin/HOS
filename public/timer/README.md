# Timer

A Lab experiment with one card. Tap it and a single stroke drains once around the rounded rectangle, then clears.

Open it from **The Lab** hub → **Timer** → **Go**, or go directly to `/timer/`.

Smite is not part of this page.

## Path direction

The path winds **counter-clockwise from 12 o’clock**.

- It starts at the top center (noon).
- The first segment is a horizontal line **toward the left**.
- Each corner is an arc with SVG **sweep-flag 0** (negative sweep, which is counter-clockwise).
- The path returns to noon and is **not** closed with `Z`.
- Nothing mirrors it (`scaleX(-1)` is not used) and the dash offset is **not** negative.

The visible ink is the **suffix** of that path (the part that still ends at 12). The gap eats the counter-clockwise prefix, so the tip moves left from 12, then down the left side, along the bottom, and up the right side — one rewind.

## Why it cannot run a second lap

`timerDash(progress, pathLength)` is the only driver.

- `progress` is clamped to `0..1` (1 = full ring, 0 = empty).
- While it drains, `stroke-dasharray` is `visible gap` where `visible = pathLength * progress` and `gap = pathLength - visible`. Those two numbers **sum to `pathLength` once**, so the pattern is exactly one dash and one gap. It has no room to repeat on the same path.
- `stroke-dashoffset` is `visible` (the remaining length). That starts the pattern on the gap, which keeps the ink as one suffix. It does not use a second path or a second offset.
- A full ring is a single dash equal to `pathLength` and offset `0` — still one pattern, not two.
- The SVG `pathLength` attribute is set **once** to the measured length and never animated. Dash values use that same length.
- There is no CSS animation, no `animation-iteration`, and no `vector-effect`.
- `requestAnimationFrame` stops at 0 and clears the stroke. A tap during the run is ignored, so a second timer cannot stack. The next tap starts over from a full ring only after the stroke is gone.
