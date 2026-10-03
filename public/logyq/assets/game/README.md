# LOGYQ Game Asset Pack

Production WebP assets for the LOGYQ world-map game.

## Composition rules
- Backgrounds contain no stage numbers, star counts, locks, or interactive labels.
- Stage numbers are live HTML/CSS text placed over `nodes/stage-*.webp`.
- Ratings are independent assets so replay results can change without replacing node art.
- Gate state swaps between `gate-locked`, `gate-closed`, `gate-open`, and `gate-complete`.
- World map = scenic background + normalized-position interactive node layer + effects/props + HTML HUD.
- Store node positions as percentages of intrinsic map width/height, never fixed device pixels.
- Use `object-fit: cover`/`background-size: cover` for scenery; keep interactive coordinates in a centered map coordinate system.
- Keep phone safe areas and a side margin around interactive nodes.

## Folders
`backgrounds/` scenery; `nodes/` stage states; `gates/` gate states; `ratings/` stars; `effects/` glows/path; `ui/` controls; `worlds/` world badges/counters; `props/` decorations; `puzzle/` puzzle backdrop.

`manifest.json` contains native dimensions.
