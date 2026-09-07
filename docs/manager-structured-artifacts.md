# Manager structured delivery artifacts

The production `lab_manager_snapshot(pin)` RPC now sources each work item's delivery artifacts from `public.ashley_ai_delivery_artifacts` rather than inferring them from singular/free-text work-item fields.

The existing Manager frontend already consumes the returned `artifacts` array, so no frontend shape change is required.

Artifact rows support branches, pull requests, previews, tests, migrations, deployments, documentation, and workflows with explicit status, environment, release-blocking state, compatibility group, evidence, and observation time.

The underlying table is private by default. The Manager sees it only through the existing PIN-gated snapshot RPC.