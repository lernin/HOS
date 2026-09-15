# LOGiQ code inventory audit process

Canonical workroom: HOS Issue #108  
Branch: `rebuild/logiq-v161-clean-mobile-20260915`  
Database table: `public.logiq_code_inventory` in Supabase project `jzaghifuhinkzzhiojre`

## Purpose

Before further cleanup or modularization, inventory the recovered v161 runtime so every significant function, listener, manager/helper, constant, and behavior block has a durable health record. The goal is to stop discovering hidden dependencies piecemeal and to make cleanup decisions from evidence rather than appearance.

The immutable source remains `public/logiq-v161-legacy/index.html`. The inventory is metadata only; it does not change Paper behavior.

## Source of truth

- Runtime behavior oracle: immutable v161 source + parity harness.
- Audit registry: `public.logiq_code_inventory`.
- Durable process/history: this document + HOS Issue #108.
- The inventory table is intentionally internal: RLS is enabled and no client policy is created. It is not part of the Paper app runtime.

## Stable row identity

Every row must have a deterministic `symbol_key`, independent of the generated database UUID. Use the form:

`v161:<file_path>:<symbol_kind>:<symbol_name>[:<ordinal>]`

Use an ordinal only when the source contains multiple anonymous/equivalent listeners or blocks that cannot be uniquely named.

## What gets inventoried

Inventory significant executable or architectural units, including:

- named functions and object methods;
- global/document/window/SVG event listeners;
- manager objects and their methods;
- structural command blocks that mutate tree/Word Bank/history state;
- important constants/config groups when they define geometry or behavior;
- anonymous compatibility/patch blocks that own observable behavior.

Do not create rows for trivial CSS declarations or incidental one-line expressions unless they encode a critical invariant.

## Required review fields

For each symbol, capture as much as can be established from source and tests:

- name, kind, area, file and line range;
- source commit/SHA;
- purpose;
- event hook / callers and callees;
- state read and state mutated;
- DOM touched;
- dependencies and side effects;
- duplicate/superseded relationships;
- whether the behavior is v161-critical;
- test coverage (`none`, `indirect`, `direct`);
- health classification;
- confidence;
- recommended action;
- evidence and notes.

## Health vocabulary

- `healthy` — clear responsibility, active, coherent enough to preserve/extract.
- `messy_active` — active and needed, but coupled, duplicated internally, or difficult to reason about.
- `duplicated` — equivalent responsibility exists elsewhere; removal/consolidation may be possible.
- `dead` — proven unreachable or unused.
- `superseded` — older responsibility replaced by another active path.
- `risky_order_dependent` — behavior depends on listener/declaration ordering or shared side effects.
- `unknown` — not reviewed deeply enough to classify.

## Confidence scale

- `0` — unknown / not audited.
- `1` — tentative inference from local reading.
- `2` — strong evidence from call sites, source structure, or runtime observation.
- `3` — proven by source/call-site analysis plus direct behavior/regression evidence where behavior could matter.

## Review states

- `unreviewed` — inventoried only.
- `reviewing` — analysis underway.
- `reviewed` — classified with evidence.
- `verified` — classification has sufficient evidence for an implementation decision.

## Micro-checkpoint rule

Inventory and cleanup are separate phases.

### Inventory phase

1. Read a bounded source region.
2. Add/update inventory rows only; do not change runtime code.
3. Review in small batches, normally **10 symbols or fewer**.
4. At the end of each batch, query the table and record counts by review state and health.
5. Check in to Issue #108 with the audited area, row count, important findings, uncertainties, and exact source SHA.

### Cleanup phase

Cleanup happens **one responsibility at a time**. A removal/consolidation is eligible only when:

- the relevant row is `verified`;
- health is `dead`, `duplicated`, or `superseded` (or another action has equally strong proof);
- confidence is `3`;
- user-visible behavior is covered by an existing direct regression or a new direct regression added before removal;
- no unrelated architectural extraction/mobile redesign is bundled into the same checkpoint.

After the single cleanup:

1. run immutable-source verification;
2. run visual/geometry parity;
3. run the direct hygiene regression;
4. if anything changes unexpectedly, stop and revert/repair that checkpoint before continuing;
5. update the inventory row with final evidence and action result;
6. check in to Issue #108 and the Structured Work item.

## Status queries

Use these questions to regain context before continuing work:

- How many rows are `unreviewed`, `reviewing`, `reviewed`, `verified`?
- Which symbols are `dead`/`duplicated`/`superseded` at confidence 3?
- Which behavior-critical symbols have no direct tests?
- Which symbols are `risky_order_dependent`?
- Which areas have the most `unknown` or `messy_active` code?
- What was the last completed `audit_batch` and what source SHA did it inspect?

## Check-in/report format

At every check-in report exactly:

1. source SHA inspected;
2. audit batch name;
3. number of symbols added/reviewed/verified;
4. health findings worth acting on;
5. anything unexpectedly active that must be preserved;
6. tests/evidence added;
7. whether runtime code changed (normally **no** during inventory);
8. the next bounded batch or single cleanup candidate.

## Current safety rules

- Do not edit `public/logiq-v161-legacy/index.html`.
- Do not infer that old-looking code is dead.
- Do not remove a whole subsystem when only one function has been proven obsolete.
- Treat global listener ordering as behavior until proven otherwise.
- Preserve active Trees/open behavior and other persistence behavior until separately audited.
- No merge to `main` or production deployment without Ashley's explicit approval.
