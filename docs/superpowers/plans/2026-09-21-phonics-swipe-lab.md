# Phonics Swipe Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a phone-first HOS Lab prototype where a teacher can swipe student chips to capture sparse phonics evidence, swipe the main card to advance without evidence, use ALL for unresolved students, and undo actions with smooth motion.

**Architecture:** Add a dedicated `/phonics-swipe` React entry in HOS. Keep session state entirely in memory, with a small pure state module for evidence/undo semantics and a pointer-gesture UI layer for animated card/chip swipes. No Supabase or production Procedia persistence is touched.

**Tech Stack:** React 19, TypeScript, CSS transforms/transitions, Vite, Node built-in test runner.

**Spec:** `docs/superpowers/specs/2026-09-21-phonics-swipe-lab-design.md`

## Global Constraints

- Three fake students: Child A, Child B, Child C.
- Main learning card is rotated 180 degrees for children; controls remain teacher-facing.
- Main-card swipe in any direction advances with no evidence event.
- Student swipe records only that student and removes that student for the current card.
- ALL applies the chosen outcome only to unresolved students, then advances.
- Undo restores card, unresolved students, and mock evidence atomically.
- No production database, Critonym, Historionym, scheduling, speech scoring, or offline sync work.
- Motion must use transform/opacity and honor `prefers-reduced-motion`.

## Review Focus

- Main-card swipe must never create mock evidence.
- ALL must never duplicate events for already resolved students.
- Undo after ALL must restore both the prior card and all prior unresolved students/events.
- A short drag below threshold must spring back and create no action.
- Rapid repeated gestures must not double-submit the same student.

---

### Task 1: Session state and evidence semantics

**Files:**
- Create: `src/phonics-swipe/state.ts`
- Create: `tests/phonics-swipe-state.test.mjs`

**Interfaces:**
- Produces: `createInitialSession()`, `recordStudentOutcome()`, `recordAllOutcomeAndAdvance()`, `advanceWithoutEvidence()`, `undoSession()`.
- Consumes: none.

- [ ] Write tests for student evidence, sparse card advance, ALL-only-unresolved behavior, and undo.
- [ ] Run the tests and verify they fail because the state module does not yet exist.
- [ ] Implement the minimal immutable session-state functions.
- [ ] Run the state tests and verify they pass.

### Task 2: Swipe gesture primitive

**Files:**
- Create: `src/phonics-swipe/useSwipe.ts`

**Interfaces:**
- Produces: a pointer-event hook returning drag transform state and a committed direction after threshold crossing.
- Consumes: browser pointer events only.

- [ ] Implement one reusable swipe primitive with a 44px commit threshold, pointer capture, spring-back below threshold, directional throw metadata, and reduced-motion compatibility.
- [ ] Keep the primitive free of learning semantics; callers decide what a direction means.

### Task 3: Classroom Phonics UI

**Files:**
- Create: `src/phonics-swipe/PhonicsSwipeLab.tsx`
- Create: `src/phonics-swipe/phonics-swipe.css`
- Create: `src/phonics-swipe-entry.tsx`
- Modify: `src/entry-router.ts`

**Interfaces:**
- Consumes: Task 1 session functions and Task 2 swipe primitive.
- Produces: `/phonics-swipe` interactive prototype.

- [ ] Render the child-facing card, teacher-facing ALL/A/B/C controls, directional legend, undo, and compact evidence log.
- [ ] Wire student swipes to the four outcomes: up produce success, down produce failure, right imitate success, left imitate failure.
- [ ] Wire main-card swipes to no-evidence advance in every direction.
- [ ] Wire ALL to unresolved-only evidence plus card advance.
- [ ] Animate swiped objects out smoothly and restore controls on the next card.
- [ ] Add reduced-motion CSS.

### Task 4: Verification and preview

**Files:**
- Modify only if required by verification findings.

**Interfaces:**
- Consumes: complete prototype.
- Produces: verified preview URL for classroom testing.

- [ ] Run `node --test tests/phonics-swipe-state.test.mjs`.
- [ ] Run `npm run build` and fix all TypeScript/Vite errors.
- [ ] Open a draft PR from `experiment/phonics-swipe-lab-20260921` to `main` to trigger/track the preview without merging.
- [ ] Verify the preview deployment reaches READY and `/phonics-swipe` renders.
- [ ] Report the preview link; do not merge to main.