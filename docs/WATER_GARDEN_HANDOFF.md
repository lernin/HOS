# Water Garden experiment

Status: implemented; production build and automated tests pass. Visual playthrough remains unverified. Release status and the deployed commit are recorded in this branch's pull-request conversation.

Branch: `experiment/water-garden-20260904`, based on `main` at `9263b9b6dd99d6ab0177b5715365a8e1fa38d793`.

## Scope

An isolated, client-only experiment in The Lab: a real Three.js tropical island with palms, flowers, a stream, waterfall, wooden bridge, a player and a gardener named Mina. Tap-to-walk pathfinding, WASD/arrows, touch direction buttons, and a task-guidance button move the player. No multiplayer or freeform AI conversation is implied.

The four-step English task is: greet Mina, collect a watering can, fill it at the stream, and water the red flower. Correct phrase choices advance the task. Other choices provide gentle feedback without punishment. Completion grows the flower and allows continued exploration or replay.

Original Web Audio synthesis provides quiet water/wind, occasional bird-like chirps, footsteps, and completion chimes. Browser speech synthesis reads the fixed English lines when available. Sound starts only after a user gesture. Mute, separate nature/voice volume controls, Korean help, reduced animation, fullscreen where supported, and progress on this device are included.

## Files and boundaries

- `src/experiences/WaterGarden.tsx`: React UI, task dialogue, preferences and lifecycle.
- `src/experiences/water-garden/{model,scene,audio}.ts`: navigation/task logic, 3D geometry, and sound.
- `src/experiences/water-garden.css`: scoped responsive styling.
- `src/main.tsx`: lazy-loaded hub entry and direct route, below the unchanged PIN gate.
- `vercel.json`: only an additive `/water-garden` rewrite.
- `tests/water-garden.test.mjs`: task, route, persistence and isolation regressions.
- `tests/water-garden-preview.{html,tsx}`: development-only isolated playtest harness, not an entry point in the production build. It avoids loading the Lab's data clients and properly unmounts/reopens the scene.

No database, schema, RLS, API, environment variable, dependency, lockfile, existing experiment, service worker, or unsynced-work changes. Existing main-only Vercel deployment restrictions are preserved. No microphone, recording, pupil account, or speech assessment is added. Fixed English phrases may be spoken by a device-supplied voice; voice availability and whether a voice uses a device vendor's service depend on the browser.

Device-only keys: `water-garden-progress-v1` and `water-garden-sound-v1`. Storage failures fall back to in-memory play. This is not a guaranteed offline install; an initial asset load is required, and the existing Lab caching policy is unchanged.

## Verification

- `npm ci`: passed.
- `npm run build`: passed (TypeScript + Vite).
- `node --test tests/*.test.mjs`: all tests passed, including eight new garden tests.
- There is no lint script in this repository; lint was not claimed or configured as part of this task.
- Visual/browser playthrough is **unverified**: the browser could not reach the supervised preview. No screenshot, mobile rendering, audio quality, WebGL runtime, or real-device performance pass is claimed.

## Required playthrough before release

1. Run `npm run dev -- --host 127.0.0.1`. Open `/tests/water-garden-preview.html` for an isolated test, or use the normal Lab PIN gate and select Water Garden to check integration. The harness is development-only.
2. Enter without sound. Verify a rendered island, visible character, task card and controls; no console/WebGL errors.
3. Test tap-to-walk, WASD/arrows, touch directions and `E` near Mina. Verify movement pauses while a dialogue/settings panel is open and resumes after dismissal.
4. Use each “Walk to” button, choose an incorrect answer first, then the correct answer. Confirm progress remains unchanged on the incorrect choice. Finish all four steps: the can follows the player, fills at the stream, the bridge is used to cross, and the red flower grows at completion.
5. Try walking into water and beyond the island. The character should stay on walkable ground. Both flowers and Mina remain reachable after completion.
6. Turn sound on after a tap. Verify gentle ambience, proximity to the waterfall, speech, separate volume controls, mute, and background-tab silence. Speech must remain optional with on-screen text intact.
7. Toggle Korean and less animation. Check a landscape phone (for example 844×390), portrait phone, desktop, large text and safe areas. Mission content can scroll on short landscape screens.
8. Refresh mid-task, continue, finish and replay. Exit to The Lab and reopen. Verify progress/settings persist locally and there are no duplicate canvases, audio loops, or listeners.
9. Check fullscreen where supported and the fallback orientation hint where not. Check the WebGL failure message on an unsupported browser.

## Publishing status and next action

Ashley explicitly approved publishing/deployment to Vercel and saving source in GitHub on 2026-09-04. GitHub's `Vercel` status confirms that the current main branch successfully deployed to the existing `ashley-taits-projects/hos-t7r8` project. The direct Vercel connector cannot resolve the project and the CLI session is logged out, so the authorized release uses the existing GitHub-to-Vercel integration, not a substitute project. No deployment restriction was changed.

The existing repository deploys `main` to The Lab. Only this task's tested commit is intended for release through its focused PR; unrelated open PRs are excluded. After release, complete the visual/device playthrough above. A branch preview is unavailable under the unchanged main-only deployment policy. Intended production path after a successful authorized release is `https://hos-t7r8.vercel.app/water-garden`. The previous known-good commit is the baseline noted above; no data migration or repair is required for a code rollback.

Related shared-HUD work: HOS issue #2. Existing Thekonym viewer PR #31 was deliberately left untouched.

## Remaining limits

This is a compact stylized 3D prototype, not a photorealistic world or a validated curriculum. Learning uses fixed phrase choices, not recognition or scoring of children's speech. Real-device visual, audio and performance checks remain required. The landscape layout is preferred; portrait remains functional with an orientation hint.
