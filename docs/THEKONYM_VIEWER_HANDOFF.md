# Thekonym viewer handoff

Date: 2026-09-03 10:49 KST

The new read-only viewer is the first Lab entry and has a direct /thekonym-viewer route. Its production source is public.thekonyms in jzaghifuhinkzzhiojre; the HTML draft supplied privately to Ashley is an explicitly dated 181-record snapshot, not a live deployment.

## Behavior

- Term and compact pronunciation, Greek and meaning with confidence, definition, technical definition, examples, assessment, priority, implementation, Has fields, relationships, reference/review, and notes last.
- Search names, former names, meanings, and definitions. Selection can be linked by term ID in the URL.
- Live reads on entry, selection, focus/visibility, reconnect, and every 30 seconds while visible. HTTP cache and service-worker cache are bypassed for these reads; requests time out after 15 seconds.
- Copy for ChatGPT makes another read and preserves the full record, IDs, timestamp, notes, and unknown future fields. A failed read copies nothing. Snapshot copies explicitly say they are snapshots.
- No writes, editing controls, service-role credentials, or RLS changes were introduced by the viewer.

## Database addition

Ashley explicitly approved adding Has fields to production. Migration 20260903014046_thekonym_viewer_has_fields adds public.has_fields(public.thekonyms), a SECURITY INVOKER computed field requested with select=*,has_fields. It returns actual column metadata for a verified public table matching the current term+s convention, plus visible reverse is_field_of links. There is no duplicate editable array. It is not an ordinary Table Editor column.

Staging psfxnlrsaorrsdbadikk has no thekonyms table. The function was first tested there against synthetic transactional fixtures and rolled back, then applied to production. Production verification found 181 rows with identical pre/post row and policy digests. Bionym has 4 actual columns; Thekonym has 54; Pleuronym has 13 and links Horonym to horonym. No table match returns null plus an empty field list.

## Validation

npm ci, npm run build, npm run test:viewer (12 tests), git diff --check, and service-worker syntax checks passed. There is no lint script in this repository. The security advisor reports no has_fields finding; existing database advisories remain. Browser/mobile visual QA and a live authorized end-to-end read have not been completed. The direct REST probe from this runtime timed out.

## Blocking live access

The existing staff-read policy requires an auth user joined through actors/positions with admin or school_lead. The current aggregate query found no such connected account. The legacy thekonym_review_list RPC also refers to removed definition_status, and the old inspector may fall back to cached data. The new route is available before the legacy Lab unlock so that old RPC failure does not prevent reaching the viewer's access state.

Do not add an admin role, weaken RLS, or use the old client-side Lab PIN as new server authorization without Ashley's separate security approval. Recommend a dedicated read-only authorization path for Ashley's verified account, then test successful owner reads, other-user denial, refresh after a real approved edit, offline behavior, and Android copy. Merge and production frontend deployment also need Ashley's separate approval. No frontend was deployed or merged in this task.

## Deferred review points

- Keep the actual-table match distinct from the manually assessed is_table value. Broader table aliases or renamed conceptual mappings need explicit registry work.
- The generated priority is ((table weight × field weight) + application_priority) / target_phase. Table weight is 5/1, field weight 2/1. It does not use confidence. Existing table-only is_field_of entries still count in that formula; this task does not change scoring or stored relationships.
- confidence_score is definition × technical definition × examples (0–27); Greek confidence is separate. Null is unassessed, not zero.
- updated_at has no automatic maintenance trigger. Use the viewer's retrieval timestamp as evidence of freshness, not the stored timestamp.
- Keep legacy quality labels/scores, hierarchy scores, and old notes visible in secondary sections; reconcile them later rather than deleting information during a viewer change.

This is a bounded authoring/review aid. Procedia remains in MVP integration; the child-learning loop (#75 in lernin/Procedia) and identity/access work remain the launch priorities.
