# Estate Plan full viewport — 2026-10-05

Ashley reported that the plan was cut off in landscape and portrait after the accepted estate merge. This follow-up starts from main `bc707c59f9623c8ff3f8f7edd5aee4573ba2f139`, on separate branch `fix/estate-plan-phone-viewport-20261005`.

## Cause and fix

The logical view box retained a fixed aspect ratio. WebGL used a matching central scissor rectangle even while zoomed; the SVG could draw annotations in the spare screen space, but the actual map and patio picking stopped at that rectangle. A regression selected a real P6 patio in the spare landscape width and failed before the fix.

The planner now measures the actual SVG stage and expands the logical framing around its center to match the screen aspect ratio. WebGL, annotations, selection and PNG export all receive that expanded box. Pan uses actual visible world units per screen pixel, and pinch zoom preserves its world anchor under the moving midpoint. Rotation and Clean view resize through the same observer. Fit retains the complete requested extent without stretching the estate.

The portrait Zoom/Fit buttons also sat beneath the SVG and could not receive taps. An explicit stacking level fixes them. The hint no longer intercepts map input.

No house, patio, pool or tree geometry changed. Existing note storage and world coordinates are retained. This is a preview follow-up; no main merge, manual deployment or database change is included.

## Verification

- 52/52 estate, actual geometry and navigation tests passed.
- Full TypeScript/Vite build passed with the existing large-chunk warning.
- Existing real Chromium plan parity passed: all seven patios, west/left orientation, legacy notes, zoom/resize/drawing alignment, pool void and actual-scene PNG export.
- New Chromium viewport regression exercises actual rendered patio pixels and mesh picking beyond the old strip in both orientations at DPR 1 and 2.625. It checks pan distance, cursor-anchored wheel zoom, two-finger pinch anchoring, Main floor/Arrival/Whole site framing and Clean view.
- Portrait and landscape screenshots were visually inspected. These are software-rendered browser checks; physical Samsung frame pacing/browser chrome and Safari/Firefox remain unverified.
- Read-only review found no Critical or Important issue. Its minor request for portrait and alternate-view Fit assertions was included.

Files: `EstatePlan.tsx`, `estate-plan.css`, `tests/ocean-estate-plan-viewport.mjs`, the estate review workflow and this handoff. The workflow includes the new regression with its existing server and uploads viewport artifacts.

Next: inspect the zoomed preview on Ashley's phone in both orientations, then separately approve merging this follow-up if accepted.
