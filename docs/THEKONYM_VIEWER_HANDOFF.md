# Thekonym viewer release

The viewer is the first Lab entry and is directly available at `/thekonym-viewer`. Its source is the current `public.thekonyms` table in Procedia production (`jzaghifuhinkzzhiojre`). Ashley approved the dedicated reader security changes and production deployment on 2026-09-03.

## Behavior

- A separate verified-account sign-in uses its own Supabase storage key. It does not replace the primary Lab session or grant a staff/admin role.
- Centered term and pronunciation; Greek meaning and section confidences; definition, technical definition, examples, readiness, priority, implementation, actual fields, relationships, reference details, and notes.
- Search by current/former name, meaning, and definition. Related terms are navigable.
- Records are fetched on entry/selection, focus, reconnect, visibility, and every 30 seconds while visible. Reads bypass HTTP and service-worker caches. Failed reads display an explicit state.
- Copy for ChatGPT performs a new database read, includes all original fields and a retrieval time, and refuses stale fallback data.
- The old PIN writer endpoints have been revoked for browser roles. Other Lab tools and unsynced local work remain in place.

## Database changes

Companion Procedia PR #98 contains migrations `thekonym_viewer_has_fields` (20260903014046) and `thekonym_viewer_read_access` (20260903020955). The reader grant is explicit, private, revocable, and tied to an existing verified Auth principal. Only SELECT is granted on the collection. Account verification, bans, deletion, and revocation are checked on each read.

The actual column inventory is derived from PostgreSQL. Semantic links currently include legacy `is_field_of` evidence; replacing their manual maintenance with schema-derived evidence is the next requested model task. The current priority calculation still uses that legacy field and is explained accurately in the viewer.

## Verification

- `npm ci` completed earlier; no dependency changes. No lint script exists in this repository.
- `npm run build`: passes.
- `npm run test:viewer`: 12 passing tests covering copy freshness, failed reads, cancellation, exact record identity, search, confidence zero/null, priority inputs, safe links, and cache bypass.
- Staging security tests used synthetic fixtures in a rollback transaction. Verified SELECT and denials for INSERT/UPDATE/DELETE, other users, revoked/unverified readers, anonymous access, and private allowlist access.
- Production role tests passed: 181 readable records, computed Bionym fields accessible, writes/private allowlist/legacy mutation RPCs denied, other users and anonymous readers denied. Tests rolled back; the migration makes no changes to Thekonym content.
- Advisors: private allowlist deny-all RLS and narrow authenticated boolean security-definer helper are intentional.
- Local browser QA was blocked by the browser environment (`ERR_BLOCKED_BY_CLIENT`); production URL and deployment status must be checked after release. No authenticated browser test is claimed.

## Release checks

Open `/thekonym-viewer`, sign in with the approved existing account, find Techmonym or Bionym, inspect Greek and section confidences, and use Copy for ChatGPT. Verify the copied retrieval time advances and the source label says Production. Sign out and confirm the collection is hidden. An unapproved account must see the access-denied state.

For rollback, revert the HOS release commit. Reader access can be revoked by setting `private.thekonym_viewer_access.revoked_at`; do not restore the insecure PIN mutation grants.
