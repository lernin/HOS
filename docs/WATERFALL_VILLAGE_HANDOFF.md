---
title: Waterfall Village implementation and review handoff
status: REVIEW
owner: Ashley
last_reviewed: 2026-09-10
applies_to:
  - src/experiences/WaterfallVillage.tsx
  - src/experiences/village/
---

# Waterfall Village

Goal: a first-person, phone-controlled 3D waterfall village in the existing Lab, based on Ashley's three supplied reference views. Branch `experiment/waterfall-village-20260910`, from main `9f6ea762a66365671b65aa77b4442359a210f075`. Workroom: [HOS #72](https://github.com/lernin/HOS/issues/72).

## Delivered implementation

- Additive Lab card and lazy-loaded `/waterfall-village` route, behind the existing PIN gate.
- Real Three.js terrain, alpine backdrop, animated river/lake and waterfalls, skybridge, working waterwheel, docks, flowers, lights, and instanced licensed forest models.
- A continuous winding stair up the great tree to a balcony and furnished library. Doors are physically open; entering/exiting uses ordinary movement.
- Two furnished cottages: timber beams, slate roofs, shelves and books, bed, rug, reading desk and warm interior lights.
- Walking movement constrained to terraces, paths, stair and docks; wall, furniture, trunk, cliff and water boundaries.
- Board/steer/leave an actual boat. The boat remains where it is left, can reach the lake, and can be boarded again at either landing. Reset returns both player and boat to the entrance.
- Independent left-thumb movement/steering and right-thumb look, WASD/arrows, E interaction, pause/resume, settings, sensitivity, volume and a lighter graphics option.
- Existing CC0 forest ambience plus original synthesized water and footsteps. Sound starts after a user action; pause/background/exit suspend it. No music is added yet.

## Decisions and departures from the references

The references depict incompatible water elevations and are visual targets rather than a surveyed navigable map. The boating channel is kept at one elevation and goes around waterfall cliffs into the lake. The library sits beside the trunk on the west balcony, so its walls do not obstruct the upper stair. Architecture is an original stylized prototype, not a claim of image-level fidelity. Distant buildings are scenery; the three named homes are enterable.

No third-person avatar, curriculum, speech collection, new accounts, data model, AI service, or music catalogue integration. These remain later steps after basic exploration works on the phone. Four discovery locations are session-only, not learning assessment or durable pupil progress. Graphics settings are stored under `waterfall-village-settings-v1`, with an in-memory fallback. Existing auth, APIs, other Lab experiences, offline cache policy and manual-only Vercel deployment restriction are retained.

## Files

- `src/experiences/WaterfallVillage.tsx`: lifecycle, controls, accessible settings and status UI.
- `src/experiences/village/world.ts`: layout, floor projection, collisions and navigation.
- `src/experiences/village/scene.ts`: geometry, instancing, shaders, rendering and boat lifecycle.
- `src/experiences/village/audio.ts`: ambient and footstep audio with cleanup.
- `src/experiences/village/village.css`: isolated responsive styling.
- `src/main.tsx`, `vercel.json`: additive integration.
- `tests/waterfall-village.test.mjs`: route, boundary, doorway, water and integration tests.
- `tests/waterfall-village-preview.{html,tsx}`: development-only isolated component harness, excluded from production build inputs. It imports no Lab auth, database client or APIs.

## Verification evidence

- `npm ci`: passed; dependencies and lockfile unchanged.
- `npm run build`: passed (TypeScript + Vite). Existing shared Three.js bundle size warning remains.
- `node --test tests/waterfall-village.test.mjs`: 6/6 passed. Tests simulate movement in both directions along every path, the full two-turn stair, connections between homes/bridge/docks, physical entrances/exits, solid furniture/walls, fall prevention, and boat clearance through the lake route.
- Full suite: 50/51 passed. The existing Water Garden test expects `git.deploymentEnabled['*'] === false`; current main uses the stronger boolean `git.deploymentEnabled: false`. Baseline configuration was inspected and has the same mismatch. It is not a new village regression; no deployment restriction was changed to satisfy the old test.
- `npm run lint`: unavailable; the repository has no lint script.
- `git diff --check`: passed.
- Browser/WebGL visual verification was blocked by the session's preview access (`ERR_BLOCKED_BY_CLIENT`) even though the supervised preview reported running. No screenshots, phone FPS, shader runtime, subjective sound-quality or two-finger browser pass is claimed.
- Vercel connector lists the correct team but no projects and cannot retrieve `hos-t7r8`; local Vercel deployment credentials are unavailable. No preview URL or production deployment is claimed.

## Required next step and playtest

Create a deliberate preview for this branch in the existing Vercel Lab project once access is available. Do not re-enable automatic deployments, merge, or deploy production without Ashley's separate explicit approval.

1. Open the Lab preview, unlock normally, choose **Waterfall Village**, and start with/without sound.
2. On an S23 Ultra, test portrait and landscape, simultaneous left movement/right look, release/cancel, diagonal speed and sensitivity.
3. Walk into Willow Cottage and back out. Follow the rising left path, circle the tree twice, cross the final landing, enter the treetop library and return down the same stairs.
4. Cross the skybridge, enter Fern Cottage, and walk down to the lakeside landing. Check rails visually align with the walking surface and that there are no holes or submerged paths.
5. Return to the entrance dock, board, row north under the bridge to the lake, land at the far dock, reboard, and return. Check the hull stays clear of banks and terraces.
6. Open settings while moving; verify movement stops. Adjust graphics/sound, close, continue, background the app, and resume. Verify silence in the background and no stuck keys or joystick.
7. Reset to the entrance, exit to the Lab, reopen, and verify there is only one renderer/audio loop and no console errors. Refresh the direct route to verify Vercel rewriting.

Database environment: production Supabase `jzaghifuhinkzzhiojre` recent Manager activity was read only during startup. No production or staging schema, gameplay data, permissions or credentials were changed.

## Assets

Reuses the existing `public/woodland/pine.glb`, `tree.glb` and `forest-birds.mp3`. Their existing provenance and CC0 licensing are recorded in [Woodland credits](../public/woodland/CREDITS.md). Architecture, navigation, water shaders and synthesized sounds are original code; no external music or paid assets were added.
