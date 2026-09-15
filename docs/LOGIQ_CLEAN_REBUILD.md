# Paper / LOGiQ clean rebuild boundary

Canonical workroom: HOS Issue #108  
Structured Work item: `01a0a408-6e02-751b-8c53-ddde9f995c70`

## Decision

Ashley approved a clean rebuild direction on 2026-09-15. We will preserve the recovered v161 experience as the golden reference and rebuild the mobile/adaptive layer cleanly rather than continuing to accumulate wrappers on the v162 patch stack.

This is **not** a repository rollback. The rebuild branch starts from current HOS `main` so unrelated HOS work is preserved. The clean Paper implementation must derive its look and established desktop behavior from the immutable v161 baseline at `/logiq-v161-legacy/`.

Immutable baseline source:
- `public/logiq-v161-legacy/index.html`
- preserved by commit `d51f29d888b6c62d361000bb065d4ea0ad709dbc`
- SHA-256 `14ba1d93c5ea9a772b7b0118a2ba5de6702164b222b8a93f4c35681ab64da66b`

## Preserve the insights, not the patch stack

The recent mobile implementation is reference material. The following product requirements are retained even if their current code is discarded:

- one-finger pan from anywhere, including over cards;
- two-finger pinch from anywhere;
- card manipulation must not resize or visually distort the card/tree;
- stationary hold starts structural movement, so ordinary touch remains navigation;
- moving a card moves its full subtree unless an explicit different command is chosen;
- the source subtree stays visibly frozen at the origin while carrying a branch;
- only an explicit valid node target or insertion caret commits a move;
- blank/invalid release snaps back with no structural change;
- edge auto-pan remains available during a carried branch;
- interruptions/cancellation restore the exact pre-gesture tree and Word Bank state;
- Working Lock blocks structural edits while retaining navigation and deliberate editing;
- mobile interaction/chrome may adapt to the phone, but shared card geometry and tree semantics must not fork from desktop.

These are acceptance requirements, not instructions to reuse the current v162 implementation.

## Clean architecture target

Build outward from the v161 reference using explicit boundaries:

1. `model` — tree data, selection, Word Bank, history snapshots;
2. `commands` — add, delete, reparent, reorder, rename, Mix, Word Bank transfers, undo;
3. `layout` — hierarchy and spacing calculations;
4. `renderer` — nodes, labels, links and visual state;
5. `desktop adapter` — mouse/keyboard interpretation preserving v161 behavior;
6. `mobile adapter` — pan/pinch/hold/flick/lock/cancel gesture interpretation;
7. `persistence adapter` — map save/open/rename/delete and autosave without owning editor behavior.

Prefer wrapping known-good v161 behavior first and extracting behind tests. Do not rewrite large areas merely for architectural purity.

## Execution order

1. Build the v161 visual/behavior parity harness before changing shared rendering.
2. Establish the minimal shared geometry/layout interfaces.
3. Introduce shared structural command boundaries.
4. Attach desktop behavior and prove v161 parity.
5. Add the mobile adapter from the retained acceptance requirements.
6. Add persistence/library behind an adapter.
7. Retire legacy/compatibility seams only when a tested replacement owns the responsibility.
8. Run desktop + mobile + persistence acceptance before any merge proposal.

## Safety boundary

- Rebuild branch: `rebuild/logiq-v161-clean-mobile-20260915`
- Existing `/logiq-v161/` and `/logiq-v162-mobile/` routes remain untouched while the clean candidate is built.
- Manual preview data may continue to use the existing PIN-guarded production Supabase RPCs only when that persistence step is reached; automated tests must stub them.
- No merge to `main` and no production deployment without Ashley's separate explicit approval.
