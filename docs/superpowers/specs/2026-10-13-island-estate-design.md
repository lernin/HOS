# The Island Estate

Ashley’s architectural presentation is the primary design reference, retained at
`public/assets/island-estate/reference.png`. This is a separate, fully explorable
Lab experiment in `lernin/HOS`, served at `/island-estate`. Preserve the existing
Ocean Estate and active PRs #201/#202. No production deployment or merge.

## Design intent

Reconstruct the reference’s flowing white silhouette, unequal cantilevered ocean
wings, glazed central atrium, sculptural staircase, roof garden and crescent pool,
rocky tropical island, turquoise coves and southeast dock. The reference combines
inconsistent conceptual drawings: coordinate one architectural model instead of
reproducing contradictory room numbers or disconnected staircases.

## Coordinated dimensions

All coordinates are metres. X east, Z south, Y up. The atrium is at (0, -7) in
plan. Ground floor is Y=8 above sea level (architectural ±0), first floor Y=14
(+6), rooftop Y=20 (+12). Approximately 90 × 65 m building, on a 139 × 156 m
irregular island. The scale bar in the composite is ambiguous; retain proportions
and the explicit 6 m floor spacing rather than interpreting it as a survey.

The main floors use independently traced, coordinated curved outlines. The atrium
void is 19.6 m across above ground level; two continuous half-turn stair flights
connect all three levels, each 2.8 m wide with 36 risers. Solid floors, pools,
planters, glazing, partitions and navigation share the same layout data. Landings
bridge the staircase to the surrounding galleries. Roof edges and atrium openings
have glass balustrades. Entrance, island paths, beach and dock remain connected.

## Experience

Start with the ocean-facing architectural overview. Orbit/zoom for comparison,
enter on foot, drag to look and move with keyboard or touch joystick. Tap a clear
surface to walk there through a collision-aware route. Viewpoint presets match
the reference’s overall aerial, front elevation, atrium, roof garden and ocean
wing. Day/sunset lighting. Phone-first controls and bounded pixel ratio.

Dimensioned floor plans and longitudinal section derive from the actual layout,
are available inside the experiment, and can be downloaded as SVG. A reference
panel permits direct comparison while preserving the live scene. No external
asset calls, authentication, database changes or recurring dependencies.

## First checkpoint and validation

The architectural shell and island must render, all floors must be accessible by
physical stairs, movement must respect voids, water and walls, and camera controls
must work on desktop and phone-sized touch screens. Automated route tests cover
all floors and representative destinations, stair continuity, obstacle clearance,
invalid inputs and boundary protection. Browser checks cover rendering, touch
movement, plans, reference comparison, reset and repeated mount/dispose. Screenshot
comparison assesses silhouette, atrium, floating wings, pool and island composition.

## Known limits

This is an architectural interpretation of conceptual art, not a construction
document. Detailed engineering, photoreal asset dressing and a furnished bedroom
in every conceptual room are later refinements. Initial fidelity is evaluated
through explicit reference viewpoints; avoid claiming a pixel-identical replica.
