# LOGYQ fit and uniqueness audit — 2026-10-01

## Goal and delivered behavior

The Game board fits the current assembled cards between the header, status strip,
Word Bank and screen edges. A pointer press interrupts camera movement; movement
resumes after every pointer is released. Layout changes settle for 280ms, then
the viewport centers and scales over 280ms. Reduced-motion users get an instant
fit. The viewport reads current node positions, with no intended solution used
to anchor the starting card. Existing manual camera gesture restrictions remain.

Work is isolated in `codex/logyq-fit-audit-20261001`, based on draft HOS PR #143,
commit `ec859d8d4260fe6aa0ced022b08cafca31dde82b`. That draft already replaces
the ambiguous generated game levels. This branch adds dynamic fitting, a faster
auditable solver, regression coverage and the database audit.

## Solver scope and evidence

The current game defines vertical contacts as parent-bottom/child-top and
horizontal contacts between adjacent siblings. The solver tests all ordered
rooted trees on distinct physical IDs, without rotation, hidden color inequality
or a target topology. It stores distinct solved trees and saturates at two.

Memoization keeps up to the requested number of trees per inventory and root.
External contacts in this grammar observe only that root's four edge signatures.
The ordered forest recurrence selects every nonempty subset for the next child,
every root in that subset, every subtree, and every remaining child sequence.
Physical IDs stay distinct even for identical faces. Global color renaming is
used only to count catalog equivalence, never to change colors during a solve.

**This is not a certificate over all geometric rectangle layouts.** The database
stores preorder and shape names, without rectangle coordinates. The current
game's `contacts()` also uses seat relationships rather than rectangle bounds.
Cousin proximity creates no rule in this audit. A coordinate-based layout/contact
specification is still required for the stronger physical claim. If cousins
touch in that specification, subtree memoization must retain those exposed
boundaries, rather than assuming only the root is observed externally.

The optional single-spine search looks for ambiguity witnesses in layouts with
no cousins. It is a subset search and is never used to certify uniqueness.
The fourteen ambiguous rows require cousin-containing witnesses; their rejection
is based on the current game grammar. The evidence states that scope explicitly.

## Exhaustive regression results

Candidate bags use four whole faces and 36 split faces with different identities
on their two regions. Bags include repeated faces as distinct physical objects.
Every accepted bag is canonicalized across all 24 global palette permutations.

| N | Unique bags before cap | Chains | Branches |
|---|---:|---:|---:|
| 2 | 15 | 15 | 0 |
| 3 | 103 | 99 | 4 |
| 4 | 624 | 502 | 122 |

The N=4 policy retains 99 chains + 122 branches = 221.

## Production database action

Target: production Supabase `jzaghifuhinkzzhiojre`, `public.logiq_puzzles`.
All 529 bags were audited. Fourteen admitted at least two complete assemblies
under the current game grammar, and were soft-retired with an optimistic
`updated_at` guard and an exact affected-row assertion. No rows were deleted.
Both witnesses and their contact lists are saved in each row's
`reasoning_profile.audit_20261001`. Existing notes and profile fields were kept.

| N | Audited | One under current game grammar | Retired |
|---|---:|---:|---:|
| 2 | 15 | 15 | 0 |
| 3 | 103 | 103 | 0 |
| 4 | 221 | 221 | 0 |
| 5 | 100 | 94 | 6 |
| 6 | 35 | 31 | 4 |
| 7 | 25 | 22 | 3 |
| 8 | 15 | 14 | 1 |
| 9 | 10 | 10 | 0 |
| 10 | 5 | 5 | 0 |
| Total | 529 | 515 | 14 |

Retired codes: N5-B-018 through N5-B-023; N6-B-024, N6-B-025, N6-B-026,
N6-B-029; N7-B-013, N7-B-022, N7-B-023; N8-B-013.

The legacy `solution_count` column has a `CHECK (solution_count = 1)`. It cannot
store the observed count of two without a schema migration, so the accurate
observed count is in the audit profile. That legacy field was not used as proof.
The 166 remaining rows marked `physical_matching_only=false` were not relabeled
as geometrically certified. Their current game-grammar count is one.

The JSON report contains every row's result and both rejection witnesses.
Rerun the read-only script with a fresh exported JSON array of rows containing
`id,puzzle_code,piece_count,pieces,solution_tree,solution_layout,contact_constraints,
grammar_version,validation_version,physical_matching_only,status,updated_at`:

```
node scripts/audit-logyq-puzzles.mjs /path/to/export.json /path/to/report.json --n4
```

## Verification and next step

- N2/N3/N4 exhaustive regression counts matched the known results.
- All 139 replacement game levels have one solution under the game grammar.
- An independent three-piece ordered-tree oracle agrees on 216 test bags.
- Saved production witnesses have no mismatched listed edge contacts.
- Phone browser checks cover every solved level at 360×640, 390×844 and 844×390,
  plus intermediate camera scales and a stationary camera during a held pointer.

Review the stacked branch and preview before merging/deploying the UI. Define
the mechanical rectangle layouts before calling the stronger physical-layout
catalog certification complete. Unrelated database security work is separate.

## Pickup and destination feedback

Placed cards use the mapper's existing subtree pickup and reparenting behavior.
Game hooks permit temporary mismatched contacts while arranging; only a complete
matching board earns completion. Moving a completed board into an invalid state
clears the current success display and hides Next while preserving earned history.
A failed Check counts as an unsuccessful attempt.

Game node destinations use a green dot below a leaf, or after the last remaining
child on its row when appending a sibling. Existing gap dots retain sibling order,
and bank drops above the root also show a dot. Game cards preserve their painted
faces during pickup and hover; ordinary mapper highlighting remains unchanged.

A real Chromium touch test picks up a placed card, reparents it to a temporarily
incorrect seat, checks the append dot and face colors during drag, and confirms
completion resets. It also checks the below-leaf indicator. Unit suite: 100 pass.
Focused browser checks: all solved boards in phone safe areas, animated fit with
held-pointer freeze, and touch pickup/reparenting.

## Playtest revision — 2026-10-01, second preview

Ashley requested rejection of mismatched placements instead of temporary invalid
boards. That supersedes the earlier free-placement decision. Drop validation now
simulates the mapper's root and descendant promotion, checks every resulting
contact, and rejects mismatches without changing the board. The root was blocked
by the old validator even when the mapper could promote a child; this is covered
by explicit root/descendant regression tests. Game Shift-drag uses the same
normal move rules so validation and mutation agree.

Game fit now reserves 20–32px margins (5.5% of available width), replacing the
8px margin. Undo/redo is blocked in the history entry points during Game; Undo
controls are hidden. Word Bank All is not rendered during Game. Mapper controls
remain available outside Game.

Follow-up idea: after a correct solve, extend the card color regions and diagonal
boundaries into a full-background geometric design, then dissolve the cards into
that composition. Deferred until the basic movement/matching experience is stable.

## Completion composition — 2026-10-01

Ashley confirmed movement and approved the completion effect. A small pure
geometry helper clips a viewport partition around the solved card positions,
then extends each card's whole/layer/diagonal regions within its surrounding
cell. Diagonals retain the displayed card height/width slope and side colors.
The composition uses actual assembled cards, not a stored target solution.

After a correct solve and layout settling, reveal rectangles grow from each
card into the background over 1.4 seconds. Cards, links and Word Bank fade
into the composition. Next/Levels remain available. A board press restores
the pieces; Check can replay the effect. Next/leaving cancels pending work.
Resize rebuilds at the new positions. Reduced motion uses no animation.
No puzzle data, contact logic, progress or database records are changed.

Verification: 103 unit checks, including viewport coverage and exact diagonal
continuation geometry; 4 focused Chromium checks, including completion/reset,
reduced motion and landscape, plus existing pickup/matching/camera coverage.

## Game sounds — 2026-10-01

Ashley approved a quiet wooden click for accepted drops and a warm three-note
completion chime. game-sound.js synthesizes both with native Web Audio; no sound
files or additional dependencies. Audio initializes/resumes during a Game user
gesture, and unsupported/blocked audio never prevents play.

A remembered Sound: On/Off control lives in the phone controls menu and desktop
settings, without crowding the game strip. Muting stops active voices. Next and
leaving stop voices too. Drop sound is queued by an accepted node/bank drop and
played only after the serialized board actually changes; rejected/no-op drops
stay quiet. Completion sound starts with the background expansion, once per
presentation; resize does not retrigger it. Check can replay after restoration.

Verification: 103 unit checks and 5 focused Chromium checks passed. Real Web Audio
contexts/oscillators were observed in the browser: accepted matching touch moves
schedule the two-tone click; rejected moves schedule none; completion schedules
three rising notes at expansion onset. Tests cover mute, remembered mute after
reload, user-gesture activation, and no stacked chimes on repeated Check, plus
prior movement, safe area, composition and reduced-motion checks. Sound balance
still needs Ashley's phone listening test. No database/production changes.
