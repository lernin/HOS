# Phonics Swipe Lab Design

## Purpose
Build a small classroom phonics interaction prototype in HOS Lab to validate the teacher-facing gesture model before connecting it to Procedia production evidence, Critonym, Historionym, or scheduling logic.

The prototype is for a teacher holding a phone or tablet across a table from children. The learning card faces the children; teacher controls remain oriented toward the teacher. The first question is purely interaction quality: can a teacher capture useful evidence quickly without turning the lesson into data entry?

## Scope

### In scope
- Three fake students: Child A, Child B, Child C.
- One teacher-facing `ALL` control.
- A small fake phonics deck sufficient to test the interaction feel.
- Main learning card visually oriented toward the children.
- Student controls and undo control visually oriented toward the teacher.
- Smooth swipe/throw animations with clear directional motion.
- Sparse evidence capture: only explicitly swiped student/group controls generate mock evidence.
- Card-only swipe in any direction advances to the next card and records no evidence.
- Student swipe records a mock outcome for that student and removes/animates that student's control for the current card.
- `ALL` swipe records the chosen mock outcome for all currently unresolved students, then advances to the next card.
- Undo reverses the most recent action, restoring both visual state and mock event state.
- A small visible/debug evidence log is acceptable in the Lab so the gesture result can be verified during testing.

### Out of scope
- Production Supabase writes.
- Real Historionym updates.
- Real Critonym inference.
- Real scheduling/adaptive learning.
- Speech recognition or automatic pronunciation scoring.
- Home/student self-study mode.
- Offline persistence or later sync. The implementation should not block this future direction, but no service worker, IndexedDB event queue, sync engine, or database replay is required now.
- Full 0–13 engagement ladder UI.
- Remote display/screen control.

## Gesture semantics
Direction is interpreted from the teacher's physical perspective.

| Swipe target | Up | Down | Right | Left |
| --- | --- | --- | --- | --- |
| Student chip/card | Produced correctly | Failed production | Imitated correctly | Failed imitation |
| `ALL` | Same outcome for every unresolved student | Same outcome for every unresolved student | Same outcome for every unresolved student | Same outcome for every unresolved student |
| Main learning card | Advance only; no evidence | Advance only; no evidence | Advance only; no evidence | Advance only; no evidence |

A student swipe must not advance the main card. It records only that student's evidence and removes that student from the unresolved set for the current card.

An `ALL` swipe applies only to students who remain unresolved on the current card, then advances the card.

No recorded event must ever be interpreted as failure merely because another learner was recorded. Missing evidence means unknown/no new evidence.

## Classroom flow examples

### Sparse capture
1. Show the phonics card.
2. Child A clearly produces correctly: swipe Child A up.
3. Child B cannot imitate: swipe Child B left.
4. No reliable observation is made for Child C.
5. Swipe the main card in any direction.
6. The card advances. Child C receives no evidence event.

### Group completion
1. Show the card.
2. Child B fails production: swipe Child B down.
3. Teacher models the sound and Child B imitates successfully: swipe Child B right.
4. Everyone else produces correctly.
5. Swipe `ALL` up.
6. `ALL` applies only to still-unresolved students and the card advances.

## Interaction design

### Main learning card
- Large central card optimized for visibility across a table.
- Card content is rotated 180 degrees relative to teacher controls so children see it correctly.
- Card can be dragged freely in any direction.
- Passing a swipe threshold releases the card with momentum and a smooth exit animation.
- A replacement card enters smoothly after the outgoing card leaves.
- Main-card swipe never emits an assessment/evidence outcome.

### Student controls
- Four teacher-facing controls: `ALL`, `Child A`, `Child B`, `Child C`.
- Controls must be large enough for one-handed touch use on a phone.
- Swiping an individual student should visibly throw that student's control in the gesture direction, making it obvious that evidence was captured for that learner.
- Resolved students remain absent or visibly resolved until the current card advances.
- At the next card all student controls return.

### `ALL`
- `ALL` represents every currently unresolved learner, not necessarily the original full class after individual evidence has already been captured.
- Swiping `ALL` emits the selected outcome for each unresolved learner.
- `ALL` then advances the main card.
- If all students are already resolved, `ALL` should be disabled or inert rather than writing duplicate events.

### Undo
- Always visible and teacher-facing.
- One-tap undo reverses exactly the latest action, whether that action was:
  - an individual student evidence swipe,
  - an `ALL` evidence swipe plus card advance,
  - or a main-card no-evidence advance.
- Undo restores the prior card, student resolution state, and mock event list atomically.
- Repeated undo may walk backward through the session history if the implementation remains simple; at minimum one reliable undo is required.

## Animation requirements
- Gestures should feel physical and deliberate rather than abrupt.
- During drag, the touched object follows the finger with slight rotation/tilt.
- On release beyond threshold, it accelerates/continues naturally in the swipe direction and fades only near or after leaving the viewport.
- On release below threshold, it springs back cleanly.
- Incoming cards should not visually collide with outgoing cards.
- Motion should remain smooth on a current Android phone and avoid layout-heavy animation patterns.
- Respect `prefers-reduced-motion` with a reduced/near-instant transition path.

## Mock data model
The Lab may use local in-memory state only.

```ts
type StudentId = 'a' | 'b' | 'c'

type Outcome =
  | 'produce_success'
  | 'produce_failure'
  | 'imitate_success'
  | 'imitate_failure'

type MockEvidenceEvent = {
  cardId: string
  studentId: StudentId
  outcome: Outcome
  createdAt: number
}
```

The prototype must distinguish mock evidence events from no-evidence navigation. Main-card swipes create no `MockEvidenceEvent` rows.

## Phonics deck
Use a deliberately small set such as:
- single graphemes: `A`, `B`, `C`, `F`, `L`, `R`, `S`
- digraphs: `CH`, `SH`, `TH`

The deck exists only to exercise the UI and should not be treated as canonical phonics curriculum data.

## Success criteria
The Lab prototype is ready for classroom trial when:
1. The teacher can operate all controls from their side while children can read the main card correctly.
2. Individual student swipes are fast and visibly distinct.
3. Main-card swipe advances without creating evidence.
4. `ALL` affects only unresolved learners and advances the card.
5. Undo reliably restores the previous state and mock events.
6. Swipe animations are smooth and pleasant on phone-sized screens.
7. A teacher can capture only noteworthy evidence and skip the rest without friction.
8. No production database or Procedia persistence is touched.

## Future direction, explicitly deferred
After classroom interaction is proven, the event boundary can be connected to Procedia's real evidence pipeline. A later design may add local-first event storage so classroom interactions continue through connectivity loss and sync afterward. That future work should preserve the same event semantics proven here rather than changing the classroom gesture model.
