# LOGiQ CSS Extraction Design

Date: 2026-09-15  
Canonical workroom: HOS Issue #108  
Branch: `rebuild/logiq-v161-css-extraction-20260915`  
Base checkpoint: `956aeff2a27caaf2c5603c8033009135d32f5505`

## Purpose

Begin the modularization phase with the lowest-coupling responsibility in the recovered v161 monolith: presentation CSS.

This checkpoint must prove that code can be physically separated from the legacy HTML without changing appearance, desktop behavior, keyboard behavior, drag behavior, or the immutable v161 reference.

## Scope

This checkpoint extracts only the single legacy inline `<style>` block from the sanitized clean candidate into a dedicated stylesheet under `/logiq-clean/`.

The immutable `/logiq-v161-legacy/index.html` file remains byte-for-byte unchanged.

No JavaScript responsibility, tree state, layout logic, renderer logic, persistence logic, gesture behavior, naming, selector structure, or CSS value is redesigned in this checkpoint.

## Architecture

### Current flow

`/logiq-clean/index.html` fetches `/logiq-v161-legacy/index.html`, passes the complete HTML through `LOGiQLegacyHygiene.sanitize()`, adds the legacy base URL, then writes the resulting monolithic document into the page.

### Target flow for this checkpoint

1. `/logiq-clean/index.html` still fetches the immutable v161 source.
2. `legacy-hygiene.js` still performs the nine already-verified hygiene removals.
3. A new CSS extraction step asserts that the sanitized document contains exactly one legacy inline `<style>` block.
4. The exact CSS payload from that block is removed from the generated document.
5. The generated clean document loads one dedicated stylesheet at `/logiq-clean/legacy-v161.css`.
6. `/logiq-clean/legacy-v161.css` contains the exact extracted CSS payload, with no selector/value cleanup or reformatting that could change semantics.

The extraction may be implemented in the hygiene/transformation layer because that is already the deterministic adapter between immutable v161 and the clean candidate. The stylesheet itself becomes the first real physical module boundary.

## Ownership boundary

After this checkpoint:

- `/logiq-v161-legacy/index.html` remains the immutable source of truth for historical v161.
- `/logiq-clean/legacy-v161.css` owns the clean candidate's legacy presentation rules.
- `/logiq-clean/legacy-hygiene.js` owns deterministic transformation/assertion logic only; it does not own styling semantics.
- `/logiq-clean/index.html` remains the bootstrap/loader.

No other ownership changes are authorized.

## Invariants

The following must remain unchanged:

- card width, height, padding, border, radius, shadow, and colors;
- label typography, size, wrapping, and spacing;
- horizontal and vertical tree spacing;
- connector geometry and visual state;
- selected, normal, drag, and keyboard-driven appearance;
- D3 layout output;
- tree mutation behavior;
- Shift+F and Tab behavior;
- drag-start and no-op drag geometry;
- immutable v161 source checksum/content;
- all nine hygiene removals already established by checkpoints 1–4.

## Failure behavior

Extraction must fail closed.

If the sanitized source does not contain exactly one expected legacy `<style>` block, the clean candidate should throw an explicit extraction error rather than silently producing a partially styled document.

The runtime must not fall back to a second copy of the inline styles, because that would hide extraction drift and create duplicate ownership.

## Testing strategy

### RED structural test

Before implementation, add a regression that requires the clean candidate to:

- contain no legacy inline `<style>` block after bootstrap;
- load exactly one `/logiq-clean/legacy-v161.css` stylesheet;
- expose CSS content equivalent to the extracted v161 style payload.

The test should fail against the current checkpoint because the clean runtime still embeds the legacy style block.

### GREEN verification

After extraction, run the existing complete gate plus the new structural test:

- `npm run build`;
- immutable v161 source verification;
- hygiene removal contract;
- camera declaration regressions;
- Shift+F ownership and endpoint parity;
- Tab behavior tests;
- visual geometry/typography/selection parity;
- drag-start/no-op geometry parity;
- new CSS ownership/extraction regression.

Any visual or behavioral drift fails the checkpoint.

## Files expected to change

Expected implementation surface:

- `public/logiq-clean/legacy-v161.css` — new exact extracted stylesheet;
- `public/logiq-clean/legacy-hygiene.js` — deterministic style-block extraction/replacement assertion;
- tests under `tests/` — new RED/GREEN CSS ownership regression;
- `docs/LOGIQ_CLEAN_REBUILD_AUDIT.md` — checkpoint evidence after successful verification.

`public/logiq-v161-legacy/index.html` must not change.

## Non-goals

This checkpoint does not:

- reorganize or rename CSS selectors;
- split CSS into multiple files;
- convert CSS values to variables;
- remove unused CSS;
- move JavaScript out of the monolith;
- separate model/layout/renderer yet;
- alter mobile interaction behavior;
- change persistence or Supabase behavior;
- merge or deploy production.

## Exit gate

The checkpoint is complete only when:

1. the clean candidate has one external legacy stylesheet and no legacy inline style ownership;
2. the extracted stylesheet is proven equivalent to the original v161 CSS payload;
3. the full existing parity/regression gate passes on the exact final head;
4. immutable v161 remains unchanged;
5. checkpoint evidence is recorded in HOS Issue #108 and the clean rebuild audit;
6. no merge or deployment has occurred.

Only after this exit gate should the next modularization checkpoint select a small pure-JavaScript responsibility for extraction.
