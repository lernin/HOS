# Thekonym viewer

The Lab password opens every Lab entry, including the first-entry Thekonym viewer at `/thekonym-viewer`. There is no separate email sign-in. The server-side `lab_thekonym_read` RPC returns only catalogue/detail records. Every copy makes a new password-checked read; requests bypass HTTP and service-worker caches. The earlier verified reader grant remains dormant. Other Lab tools and unsynced work are preserved.

## Literary revision — 2026-09-03

Ashley approved immediate implementation and deployment after image review. The viewer now uses compact ivory/forest literary styling with no Greek wallpaper or visible Greek-meaning label. Canonical names are green, other names gray. Individual meaning/content headings use their own confidence: 0/1/2 show three/two/one fine red crosses; 3 removes crosses and turns the heading green. Missing or unassessed content stays distinct. Draft body text is muted; confirmed body text uses normal ink. Actual stored scores are unchanged.

Parent/family tags sit upper left and related links remain in their relationship sections. The viewer no longer stores or displays duplicate `has_fields` / `is_field_of` metadata. When schema inspection is needed, the assistant uses the existing read-only schema inspection RPC directly. Detailed implementation and notes remain below the reading content.

A–Z opens an alphabet and filtered catalogue. Search still covers current/former names, meaning, and definition. PROCEDIA returns to the previous successfully read term. The last and previous term IDs are remembered on this device; reopening resumes the last term unless a specific term is linked. Small freshness status sits upper right, outside the reading content. Numeric scores and all raw fields remain in fresh copies.

## Validation and release

Production build and 14 tests pass, covering confidence states, alphabet grouping, search, fresh-copy success/failure, cancellation, record identity, priority, and cache bypass. Dependencies retained; npm ci completed. No lint script exists. No authenticated browser test is claimed; earlier local preview access was environment-blocked.

No production/staging data, schema, access, or priority-formula changes in this revision. The live reader uses production `jzaghifuhinkzzhiojre`. Deployment follows the existing GitHub main → Vercel pipeline. Rollback is the preceding application deployment; no database rollback is needed.

Try: enter the normal Lab password; open the viewer; A–Z → T → Techmonym; search Anonym and tap a related tag; tap PROCEDIA to return; use Copy; reopen to resume the last term. Refresh an already-open viewer after deployment to load the revised design.

## Interactive review — 2026-09-03

A–Z now opens a full-screen native dialog. Back/forward buttons traverse successful reads. Parent stays upper-left; other relationships remain in the Relationships section. Obsolete `Has fields` / `Field of` display elements have been removed; schema details are inspected on demand through the read-only schema RPC instead of duplicated in Thekonym records. Offline refresh failures no longer interrupt a displayed record: the dot changes color and the time since last successful read keeps increasing.

Double-tap a confidence box to unlock it, tap to cycle 3→2→1→0→3, then Lock & save (or Cancel). Double-tap Definition/Technical Definition/Examples, or use their small discussion button, to open a field-specific AI panel. Root meaning and notes have discussion buttons. Voice is transcribed into the composer for review before Send. AI proposals require Apply change; text changes do not implicitly change confidence.

The panel reuses the existing Vercel AI Gateway and transcription endpoint. It can read current Thekonyms and public schema metadata. It does not execute arbitrary SQL, read student/actor data, or mutate schema/code. GitHub documentation reads and log publication require a server-only `PROCEDIA_GITHUB_TOKEN` (or existing `GITHUB_TOKEN`) scoped to `lernin/Procedia`; GitHub Contents and Pull requests permissions are required. Never put that credential into frontend or git. The ChatGPT GitHub connector is not automatically available to this app.

Production migration `20260903063929_lab_thekonym_interactive_editing` adds a password-checked, field-allowlisted update RPC with row locking, expected-value checks, idempotent request IDs, and an atomic private audit. Accepted edits also create an action in existing `ashley_ai_talk_items` and a ready entry in `ashley_ai_publication_outbox` (significance 3, urgency 2). These state clearly that the database change is already applied; remaining work is GitHub publication. GitHub failure therefore never loses the edit or its follow-up. Successful publication resolves the matching work item and outbox entry. No broad table grants or legacy writer restoration.

Validation: production build; 14 viewer and 4 assistant tests pass. Synthetic staging checks exercise wrong/null password, unsupported fields, score bounds, stale values, idempotency, audit/queue creation, sync reconciliation, and raw-access denial; rolled back. Production role checks verify guarded editing and queue creation and roll back all test changes. New advisor notices are intentional deny-all RLS on the private audit and narrowly password-checked security-definer RPCs. See the [RLS notice](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) and [RPC exposure notice](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable). No authenticated browser or microphone-device test is claimed.

Try: A–Z fills the screen; close returns to the same reading position. Open three terms and traverse back/forward. Disconnect after a read: content stays, elapsed time remains, dot changes. Double-tap confidence, cycle, then Cancel to leave the database unchanged; Lock & save creates an audited edit. Discuss a definition, dictate or type, review the proposal, and explicitly apply. Inspect the work queue if GitHub is disconnected. Application rollback is the preceding HOS commit; preserve applied audit/queue records and migrations.
