# Pine Forest Walk — incomplete checkpoint

Requested: a separate first-person Lab experiment, left-thumb movement and right-thumb look, terrain/trunk collisions, adjustable look sensitivity. Preserve Water Garden, existing routes and the PIN gate.

## Source

- Collection: https://polyhaven.com/collections/pine_forest
- Source archive: https://dl.polyhaven.org/file/ph-assets/Scenes/pine_forest.zip
- Asset license: CC0 (https://polyhaven.com/license); website/example renders are not included in that grant.
- Downloaded archive size: 2,746,288,533 bytes.
- Verified SHA1 against publisher header: `28f70adfe38f8fe6c82b5f16561dd865072881da`.

The archive is an intermediate download, deliberately not committed to Git. It contains a Blender scene, not a ready-to-load browser model.

## Implemented

Only the standalone controller mathematics in `controller.ts`: joystick dead zone, independent look sensitivity, pitch limits, facing-relative movement, height-grid sampling and substepped obstacle sliding. It is NOT integrated or play-tested.

## Blocker and next step

The downloaded Blender 4.5.3 runtime exits with signal errors even on an empty factory scene, before conversion. Incomplete extraction was observed; re-extraction did not recover startup. Do not represent this as a converted forest or a playable preview.

Next: obtain a working conversion environment, export an optimized crop of the original scene and terrain navigation data, then implement the React/Three.js view. Maintain independent pointer IDs/capture, stop movement on pointer release/cancel/blur, pause while settings are open, and provide loading/error/reset states. Validate phone performance before publishing.

No Lab hub entry, route, deployment configuration, dependencies, authentication or production behavior has changed. Merge and production publishing require separate approval.
