# Thekonym viewer

The Lab password opens every Lab entry, including the first-entry Thekonym viewer at `/thekonym-viewer`. There is no separate email sign-in. The server-side `lab_thekonym_read` RPC returns only catalogue/detail records. Every copy makes a new password-checked read; requests bypass HTTP and service-worker caches. The earlier verified reader grant remains dormant. Other Lab tools and unsynced work are preserved.

## Literary revision — 2026-09-03

Ashley approved immediate implementation and deployment after image review. The viewer now uses compact ivory/forest literary styling with no Greek wallpaper or visible Greek-meaning label. Canonical names are green, other names gray. Individual meaning/content headings use their own confidence: 0/1/2 show three/two/one fine red crosses; 3 removes crosses and turns the heading green. Missing or unassessed content stays distinct. Draft body text is muted; confirmed body text uses normal ink. Actual stored scores are unchanged.

Parent/family tags sit upper left, related links upper right, and children/fields along the lower rule. Existing mapped field concepts are tappable; unmapped schema columns remain plain tags. Relationships are read from existing records and the computed `has_fields` inventory, never fabricated. Detailed implementation and notes remain below the reading content.

A–Z opens an alphabet and filtered catalogue. Search still covers current/former names, meaning, and definition. PROCEDIA returns to the previous successfully read term. The last and previous term IDs are remembered on this device; reopening resumes the last term unless a specific term is linked. Small freshness status sits upper right, outside the reading content. Numeric scores and all raw fields remain in fresh copies.

## Validation and release

Production build and 14 tests pass, covering confidence states, alphabet grouping, search, fresh-copy success/failure, cancellation, record identity, priority, and cache bypass. Dependencies retained; npm ci completed. No lint script exists. No authenticated browser test is claimed; earlier local preview access was environment-blocked.

No production/staging data, schema, access, or priority-formula changes in this revision. The live reader uses production `jzaghifuhinkzzhiojre`. Deployment follows the existing GitHub main → Vercel pipeline. Rollback is the preceding application deployment; no database rollback is needed.

Try: enter the normal Lab password; open the viewer; A–Z → T → Techmonym; search Anonym and tap a related tag; tap PROCEDIA to return; use Copy; reopen to resume the last term. Refresh an already-open viewer after deployment to load the revised design.
