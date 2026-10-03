# LOGYQ Adaptive Learner v1

## Purpose

LOGYQ is developed in The Lab but is intended to run inside Procedia. The adaptive system therefore treats learner identity as an external input rather than inventing its own student model.

## Learner contract

LOGYQ consumes one stable `learner_id` UUID.

- **Lab development:** `learner_id` is a synthetic UUID from `public.logyq_learners`.
- **Procedia:** the adapter will supply the existing Procedia student/person UUID (or map it through `external_person_id`).
- Game and Curriculum share the same learner context but keep separate progression evidence.

The temporary Lab UI exposes **Tester N**, **New tester**, and **Reset current**. Creating a new tester clears only device-local Curriculum/Game progress and starts a fresh learner UUID. Historical evidence remains in Supabase.

## Evidence model

`public.logyq_attempts` stores observed evidence instead of only storing a derived score:

- mode: `game` or `curriculum`
- item ID
- puzzle tier and reasoning difficulty
- grade before / after
- exact minimum moves from the presented starting state (Game)
- actual moves
- rejected drops
- returned/cleared pieces
- hints used
- elapsed time
- solved / abandoned
- efficiency
- metadata

Because the evidence is retained, the adaptive algorithm can be recalculated later without losing the original learner behavior.

## Game efficiency

The browser computes the shortest completion path from the **actual presented starting tree** using the same fixed-orientation contact grammar as gameplay. This avoids assuming that the initially mounted card is the final solution root.

`efficiency = minimum_moves / max(minimum_moves, actual_moves)`

A rejected placement counts as an attempted move. Returning a subtree to the bank costs one move per returned piece.

## Adaptive grade

The initial Lab grade is 1. Grade indices map to labels:

`1, 2, 3A, 3B, 3C, 4A, 4B, 4C, 5A, 5B, 5C, 6`

The server uses a rolling evidence window. v1 is intentionally conservative:

- three strong solves at/above the current grade can advance one grade;
- one poor solve never demotes a learner;
- repeated low success/efficiency can ease one grade;
- the browser occasionally probes one grade above when recent performance is strong.

These thresholds are parameters to tune from observed child data, not permanent educational claims.

## Hints

Hints are progressive and language-free:

1. highlight the useful bank piece;
2. highlight the destination;
3. draw the piece-to-destination arrow.

The highest hint stage used is stored with the attempt.

## Celebrations

Celebrations represent **achievement for this learner**, not only static puzzle difficulty.

The server returns one of:

- `solve`
- `efficient`
- `perfect`
- `persistence`
- `promotion`

The Celebration Library then uses weighted random selection. Promotions and exceptional solves strongly favor high-intensity applause/big-cheer recordings; ordinary solves favor smaller responses. Recent recordings are down-weighted to avoid repetition.

## Security during Lab development

The learner tables have RLS enabled and no public policies. `anon` and `authenticated` table grants are revoked. The Lab browser writes through the `logyq-learning` Edge Function, protected by the existing Lab PIN. The Edge Function uses the service role server-side.

When integrated into Procedia, replace the Lab-PIN adapter with Procedia authorization and ownership rules; do not expose the service role to the browser.
