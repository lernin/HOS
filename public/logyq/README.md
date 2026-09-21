# LOGYQ

Isolated maintainability experiment. This is **not** LOGiQ and is **not** for production.

- **Baseline copied from:** `public/logiq-v161/` (working recovered engine + preview seam)
- **Not used as baseline:** `public/logiq-v162-mobile/` (iframe overlay on v161; does not contain the tree engine)
- **Immutable source of truth for LOGiQ:** `public/logiq-v161-legacy/` (untouched; LOGYQ must never edit any `logiq-*` path)

This directory starts as a path-remapped copy of v161. Later commits extract modules in place. Existing LOGiQ files stay read-only.
