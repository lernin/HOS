# Timer

A Lab experiment with one card. Tap it to arm red, tap again to arm amber, tap again to turn the stroke off. Each arm is a full ring, a 3 second hold, then one 12 second drain.

Open it from **The Lab** hub → **Timer** → **Go**, or go directly to `/timer/`.

Smite is not part of this page.

## Tap cycle

One clock per arm: `elapsed` since that tap.

- For the first 3 seconds, progress stays `1` (the ring is full).
- After that, progress is the drain still left divided by 12 seconds.
- At 0 the stroke clears and the card is idle again.
- Red is `#ff0000`. Amber is `#ffa100`.
- Switching to amber restarts that clock from a full ring. It does not continue the red drain.

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
- `requestAnimationFrame` is the only clock. There is no CSS animation duration and no CSS pixel dash. At 0 it clears the stroke and returns to idle.
- A tap while red arms amber from a full ring and starts the 3 second hold over. A tap while amber clears the stroke. The next tap arms red again. The hold is never skipped.
