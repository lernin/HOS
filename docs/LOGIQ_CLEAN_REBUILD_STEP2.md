# Step 2 — parity harness specification

The next code checkpoint must add automated parity coverage before any mobile behavior is rebuilt.

## Required measurements

For the immutable v161 route and the clean candidate at the same viewport, data fixture and zoom:

- card bounding boxes;
- label font size and line wrapping;
- internal padding;
- border width/radius;
- shadow presence/shape where measurable;
- horizontal and vertical node spacing;
- link/connector endpoints and path geometry;
- selected card geometry;
- drag-start geometry before pointer travel;
- representative full-tree screen coordinates.

## Required fixtures

- the deterministic 30-node v161 startup tree;
- the Node 09 + Nodes 22/23/24 subtree used in the recent mobile regressions;
- at least one wrapped/multi-line label so typography drift is visible.

## Required behavior checks

- drag start alone does not change the held card's width/height;
- unrelated cards do not move merely because a drag starts;
- cancel returns exactly to pre-drag coordinates and structure;
- baseline desktop selection/edit/drag remains functional.

## Gate

No shared renderer/layout extraction and no new mobile gesture layer until this harness is green against the immutable v161 baseline.
