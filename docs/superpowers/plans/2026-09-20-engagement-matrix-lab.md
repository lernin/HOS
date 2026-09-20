# Engagement Matrix Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a preview-only HOS Lab experience where Ashley can actually try the 0–15 Engagement Ladder across Standalone, Decompose, and Compose modes.

**Architecture:** Add one self-contained React experience backed by a small local experience catalogue. Keep the prototype client-only and data-driven: a mode + engagement level selects one interactive card. Integrate it into the existing HOS hub/router and SPA rewrite without changing Supabase, authentication, or production data.

**Tech Stack:** React 19, TypeScript, Vite, existing HOS CSS, Node test runner.

**Spec:** `lernin/Procedia:docs/superpowers/specs/2026-09-20-engagement-matrix-lab-design.md` on branch `feat/engagement-matrix-lab-spec`.

## Global Constraints

- Preview-only; no production merge or production deployment.
- Preserve the existing Lab PIN gate.
- No Supabase/database/schema/auth changes.
- No new dependencies.
- Phone-first layout.
- Use `umbrella` as the default exploration target; include `pencil` and `L /l/` as useful presets.
- Structural modes are Standalone, Decompose, Compose.
- Engagement levels are exactly 0 Ignore through 15 Apply.
- Do not invent a meaningful exercise for every matrix cell; represent artificial cells as unavailable when appropriate.
- Avoid external image/audio dependencies in V1; use text, emoji, browser speech where useful, and local interaction.

## Review Focus

- Direct navigation to `/engagement-lab` must remain behind the existing Lab PIN gate.
- Switching mode or level must reset stale answer/feedback state.
- Level numbering and names must stay canonical from 0 Ignore to 15 Apply.
- Reorder/construct activities must work by tap on phone without requiring drag-and-drop.
- A custom/free target must not pretend to have linguistically accurate decomposition; use curated presets for decomposition examples.

---

### Task 1: Pin the Lab contract with a failing test

**Files:**
- Create: `tests/engagement-lab.test.mjs`

**Interfaces:**
- Consumes: repository source files.
- Produces: static contract tests for canonical levels, structural modes, route/hub integration, and Vercel rewrite.

- [ ] **Step 1: Write the failing test**

Create tests that assert `src/experiences/EngagementLab.tsx` contains all three modes and the canonical 16-level catalogue; `src/main.tsx` contains the `engagement-lab` view, hub card, lazy import and route; and `vercel.json` rewrites `/engagement-lab` to the SPA.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/engagement-lab.test.mjs`
Expected: FAIL because the new experience file and route do not exist.

- [ ] **Step 3: Commit the red test**

```bash
git add tests/engagement-lab.test.mjs
git commit -m "test: define engagement lab contract"
```

### Task 2: Build the interactive engagement experience

**Files:**
- Create: `src/experiences/EngagementLab.tsx`
- Create: `src/experiences/engagement-lab.css`
- Test: `tests/engagement-lab.test.mjs`

**Interfaces:**
- Consumes: `onExit: () => void` from HOS navigation.
- Produces: `EngagementLab({ onExit })` React component.

- [ ] **Step 1: Implement the smallest catalogue and renderer**

Define `MODES = ['Standalone', 'Decompose', 'Compose']` and the exact canonical levels:

```text
0 Ignore
1 Observe
2 Imitate
3 Verify
4 Choose from 2
5 Choose from 4
6 Match
7 Reorder with model
8 Reorder from concept cue
9 Construct from supplied parts
10 Complete partial target
11 Produce with form hint
12 Produce from direct cue
13 Produce from context
14 Recall
15 Apply
```

Use curated target presets for `umbrella`, `pencil`, and `L /l/`. A selected mode + level renders a concrete card with instructions and an interaction. Keep tap-based token construction rather than drag-only behavior.

- [ ] **Step 2: Implement representative interactions across the whole ladder**

Use real controls for true/false, 2-choice, 4-choice, matching, token reorder/construction, text completion, free production, and apply. Ignore/Observe remain intentionally passive. Reset response state whenever mode, level, or preset changes.

- [ ] **Step 3: Add phone-first CSS**

Build a compact selector/header, horizontally safe level grid, large touch targets, a single primary card, clear feedback, and no horizontal page overflow at roughly 360–430px widths.

- [ ] **Step 4: Run the contract test**

Run: `node --test tests/engagement-lab.test.mjs`
Expected: component-level assertions pass; router/rewrite assertions remain red until Task 3.

- [ ] **Step 5: Commit**

```bash
git add src/experiences/EngagementLab.tsx src/experiences/engagement-lab.css
git commit -m "feat: add interactive engagement matrix lab"
```

### Task 3: Integrate the experience into The Lab

**Files:**
- Modify: `src/main.tsx`
- Modify: `vercel.json`
- Test: `tests/engagement-lab.test.mjs`

**Interfaces:**
- Consumes: `EngagementLab` lazy component.
- Produces: `/engagement-lab` route and a Lab hub card.

- [ ] **Step 1: Add the lazy import and view**

Add `engagement-lab` to `View`, lazy-load `./experiences/EngagementLab`, include `/engagement-lab` in path recognition, and map `navigate('engagement-lab')` to that path.

- [ ] **Step 2: Add the hub card**

Add a card near Concept Interactions named **Engagement Matrix** with copy describing Standalone / Decompose / Compose × levels 0–15.

- [ ] **Step 3: Add the render branch**

Render `<EngagementLab onExit={() => navigate('hub')} />` behind the already-unlocked Lab state.

- [ ] **Step 4: Add the Vercel SPA rewrite**

Add `/engagement-lab` to the same index fallback pattern used by other Lab experiences. Preserve all existing deployment restrictions.

- [ ] **Step 5: Run test to verify green**

Run: `node --test tests/engagement-lab.test.mjs`
Expected: PASS.

- [ ] **Step 6: Run build and full repository tests**

Run: `npm run build`
Expected: PASS.

Run the repository's existing Node test suite.
Expected: all new tests pass; report any pre-existing failure by name rather than hiding it.

- [ ] **Step 7: Commit**

```bash
git add src/main.tsx vercel.json tests/engagement-lab.test.mjs
git commit -m "feat: add engagement matrix to the lab"
```

### Task 4: Publish a reviewable preview

**Files:**
- No production files beyond Tasks 1–3.

**Interfaces:**
- Consumes: tested branch `experiment/engagement-matrix-lab-20260920`.
- Produces: draft PR and Vercel preview URL.

- [ ] **Step 1: Open a draft PR to `main`**

The PR must state preview-only, no database/auth changes, no production merge/deploy authorization, and include verification evidence.

- [ ] **Step 2: Trigger or create a Vercel preview deployment**

Deploy the branch as preview only. Do not promote it to production.

- [ ] **Step 3: Verify deployment status and route**

Confirm the deployment is READY and fetch `/engagement-lab`. A fresh browser should still encounter the existing Lab PIN gate before entering the experience.

- [ ] **Step 4: Hand Ashley the preview**

Provide the direct preview URL and a short test path: unlock Lab → Engagement Matrix → `umbrella` → switch Standalone/Decompose/Compose → walk levels 0–15.
