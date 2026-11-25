# Ocean Estate fullscreen performance preview implementation plan

> For agentic workers: Implement the checklist with test-first verification; do not merge or promote to production.

**Goal:** Make Ocean Estate usable on full-size displays through measurable, reversible graphics controls.

**Architecture:** Add a small pure scaling governor in `src/experiences/estate/performance.ts`, connect it to the existing Three.js `scene.ts` render loop, expose controls through current OceanEstate Settings and localStorage. Preserve QR pairing code from base branch.

**Tech stack:** Three.js 0.180, React 19, Vite 7, Node 22, HOS.

**Spec:** `docs/superpowers/specs/2026-11-24-ocean-estate-performance-preview.md`

## Constraints
- Base feature branch: `feature/ocean-estate-tv-phone-remote-20261124` at `acc67962`; do not edit it.
- New branch: `feature/estate-performance-preview-20261124`; PR target is remote branch (stacked review).
- No production Supabase/staging database changes.
- Keep all movement, camera inertia, collision handling and remote pairing unchanged.

## Tasks
- [ ] **RED:** Add `tests/ocean-estate-performance.test.mjs` covering resolutions, adaptation hysteresis, caps and invalid data; run and observe expected missing-module failure.
- [ ] **GREEN:** Implement `src/experiences/estate/performance.ts` with pure clamps, pixel-ratio and scaling decisions; run tests.
- [ ] **Integration:** Add optional `EstateInput` fields and actual shadows/fills/pixel ratio switches to `src/experiences/estate/scene.ts`; report effective resolution along with FPS, guard auto-adapt against paused/background states.
- [ ] **UI:** Extend `src/experiences/OceanEstate.tsx` local preferences, menu and small optional FPS overlay; preserve old localStorage and QR remote.
- [ ] **Regression:** Add performance tests to GitHub Actions Ocean Estate review workflow. Run `npm ci`, `npm run build`, test suites and visual/browser checks; report missing `npm run lint` if no lint script exists.
- [ ] **Preview and handoff:** Create draft stacked PR and isolated Vercel preview. Verify code and deployment states, give Ashley comparison instructions, and record verified evidence and next action in Structured Work and HOS Workroom #79.

## Review focus
- No auto-downscale merely because game/settings modal is paused.
- Restore saved settings with malformed/legacy browser values.
- Avoid auto oscillation at 50–60 FPS.
- Gracefully handle narrow phone screens and ultra-wide monitor.
- No changes to ongoing TV controller and Kuna animation work.
