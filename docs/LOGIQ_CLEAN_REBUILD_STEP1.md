# Step 1 — clean rebuild starting point

This checkpoint intentionally changes documentation only.

## Selected path

Continue from current HOS `main` so unrelated application work is retained, but build the new Paper/LOGiQ candidate from the immutable recovered v161 source rather than from the v162 mobile wrapper stack.

### Golden reference

- route: `/logiq-v161-legacy/`
- source: `public/logiq-v161-legacy/index.html`
- preservation commit: `d51f29d888b6c62d361000bb065d4ea0ad709dbc`
- source SHA-256: `14ba1d93c5ea9a772b7b0118a2ba5de6702164b222b8a93f4c35681ab64da66b`

### Existing implementation retained only as reference

- `/logiq-v161/` — recovered source plus integration/persistence bridge
- `/logiq-v162-mobile/` — recent mobile prototype line
- PR #107 — modularization experiments such as `branch-geometry.js`

Useful behavior and test ideas can be harvested from these, but their implementation is not presumed canonical.

## First implementation task

Build the parity harness before creating a new mobile adapter. The harness must establish the v161 visual/desktop baseline for representative nodes and full-tree layout, then prove that a clean candidate does not alter those measurements.

No production database, route, merge or deployment change belongs to Step 1.
